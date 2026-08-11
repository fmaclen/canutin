package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

const debounceMs = 250
const tickerMs = 50

// NOTE: caps how many full-history balance recalculations run at once so a large import burst
// can't spawn one unbounded goroutine per affected account.
const maxConcurrentCalcs = 4

// NOTE: each saved accountBalances row's asOf is stamped at save time, so an older calculation that
// finishes after a newer one would become the stale "latest" balance. This state guarantees at most
// one calculation runs per account at a time, so the last to finish is always the freshest.
var (
	pendingMu sync.Mutex
	pending   = make(map[string]time.Time)
	inFlight  = make(map[string]bool)
	dirty     = make(map[string]time.Time)
	calcSem   = make(chan struct{}, maxConcurrentCalcs)

	// NOTE: assign recompute only before balanceWorker and app.Start() launch (or under pendingMu in
	// tests). It is read from request-path goroutines (the deferred go runCalc), so a later
	// unsynchronized write would be a data race.
	recompute func(accountID string)
)

func enqueueBalance(accountID string) {
	pendingMu.Lock()
	defer pendingMu.Unlock()
	pending[accountID] = time.Now()
}

func balanceWorker(ctx context.Context, app *pocketbase.PocketBase) {
	ticker := time.NewTicker(tickerMs * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			pendingMu.Lock()
			now := time.Now()
			for accountID, queuedAt := range pending {
				if now.Sub(queuedAt) < debounceMs*time.Millisecond {
					continue
				}
				delete(pending, accountID)
				if inFlight[accountID] {
					dirty[accountID] = now
					continue
				}
				inFlight[accountID] = true
				go runCalc(accountID)
			}
			pendingMu.Unlock()
		}
	}
}

func runCalc(accountID string) {
	// NOTE: release the inFlight slot even if recompute panics, so a panicking calculation can't
	// permanently strand the account in flight and block every future recalculation for it.
	defer releaseInFlight(accountID)
	for {
		if boundedRecompute(accountID) {
			return
		}
	}
}

func boundedRecompute(accountID string) bool {
	calcSem <- struct{}{}
	defer func() { <-calcSem }()
	recompute(accountID)

	pendingMu.Lock()
	defer pendingMu.Unlock()
	if _, ok := dirty[accountID]; ok {
		delete(dirty, accountID)
		return false
	}
	return true
}

func releaseInFlight(accountID string) {
	pendingMu.Lock()
	defer pendingMu.Unlock()
	delete(inFlight, accountID)
}

func acquireInFlight(accountID string) {
	for {
		pendingMu.Lock()
		if !inFlight[accountID] {
			inFlight[accountID] = true
			// NOTE: drop any debounce-pending worker calc queued before this lock (e.g. by a
			// pre-existing transaction added moments before an import). Once the lock holder writes
			// its authoritative snapshot, that stale pending calc — which would recompute against
			// the lock's just-written transactions and append an untagged orphan revert can't clean
			// up — must not fire. A genuine edit to a surviving transaction during the lock re-adds
			// pending after this point, so the worker still recomputes that case post-lock.
			delete(pending, accountID)
			pendingMu.Unlock()
			return
		}
		pendingMu.Unlock()
		time.Sleep(tickerMs * time.Millisecond)
	}
}

// NOTE: use this only for inline recomputes NOT inside an open transaction (the import-create path);
// for recomputes inside a transaction use withAccountCalcLockReportDirty and re-enqueue post-commit.
func withAccountCalcLock(accountID string, fn func() error) error {
	acquireInFlight(accountID)

	defer func() {
		pendingMu.Lock()
		if _, ok := dirty[accountID]; ok {
			// NOTE: hand the still-held slot to the worker without releasing inFlight; keeping it held
			// closes the window where a worker tick could launch a second runCalc.
			delete(dirty, accountID)
			pendingMu.Unlock()
			go runCalc(accountID)
			return
		}
		delete(inFlight, accountID)
		pendingMu.Unlock()
	}()

	return fn()
}

// NOTE: unlike withAccountCalcLock this never launches the follow-up and fully releases the slot, so a
// caller running fn inside an open transaction must re-enqueue the reported-dirty accounts after commit
// — the worker then recomputes against committed state, not the transaction's uncommitted rows.
func withAccountCalcLockReportDirty(accountID string, fn func() error) (wentDirty bool, err error) {
	acquireInFlight(accountID)
	defer func() {
		pendingMu.Lock()
		defer pendingMu.Unlock()
		if _, ok := dirty[accountID]; ok {
			delete(dirty, accountID)
			wentDirty = true
		}
		delete(inFlight, accountID)
	}()

	return false, fn()
}

func recomputeDerivedBalance(app core.App, accountID string, importSession string) error {
	account, err := app.FindRecordById("accounts", accountID)
	if err != nil {
		// NOTE: a cascade-deleted account (e.g. an import-created account removed during revert)
		// has no balance to compute, so a missing record is a quiet no-op rather than a failure.
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return fmt.Errorf("find account: %w", err)
	}

	if account.GetDateTime("autoCalculated").IsZero() {
		return nil
	}

	owner := account.GetString("owner")
	transactions, err := app.FindRecordsByFilter(
		"transactions", "account = {:aid} && owner = {:owner}", "", 0, 0,
		map[string]any{"aid": accountID, "owner": owner},
	)
	if err != nil {
		return fmt.Errorf("fetch transactions: %w", err)
	}

	var sum float64
	for _, tx := range transactions {
		if !tx.GetDateTime("excluded").IsZero() {
			continue
		}
		sum += tx.GetFloat("value")
	}

	collection, err := app.FindCollectionByNameOrId("accountBalances")
	if err != nil {
		return fmt.Errorf("find accountBalances collection: %w", err)
	}

	balance := core.NewRecord(collection)
	balance.Set("account", accountID)
	balance.Set("value", sum)
	balance.Set("asOf", time.Now().UTC())
	balance.Set("owner", owner)
	balance.Set("source", "derived")
	if importSession != "" {
		balance.Set("importSession", importSession)
	}

	if err := app.Save(balance); err != nil {
		return fmt.Errorf("save balance: %w", err)
	}
	return nil
}

func materializeAccountBalanceHistoryOnLink(e *core.RecordEvent) error {
	original := e.Record.Original()
	// Connected accounts are saved with auto-calculation cleared; the original record identifies
	// the one-time link transition whose live transaction history must become durable snapshots.
	if original.GetDateTime("autoCalculated").IsZero() ||
		original.GetString("connection") != "" ||
		e.Record.GetString("connection") == "" ||
		!e.Record.GetDateTime("autoCalculated").IsZero() {
		return e.Next()
	}

	owner := e.Record.GetString("owner")
	transactions, err := e.App.FindRecordsByFilter(
		"transactions", "account = {:account} && owner = {:owner}", "date,created,id", 0, 0,
		map[string]any{"account": e.Record.Id, "owner": owner},
	)
	if err != nil {
		return fmt.Errorf("find transactions for linked account history: %w", err)
	}

	type balancePoint struct {
		asOf  time.Time
		value float64
	}
	var points []balancePoint
	var running float64
	for _, transaction := range transactions {
		if !transaction.GetDateTime("excluded").IsZero() {
			continue
		}
		running += transaction.GetFloat("value")
		asOf := transaction.GetDateTime("date").Time()
		if len(points) > 0 && points[len(points)-1].asOf.Equal(asOf) {
			points[len(points)-1].value = running
			continue
		}
		points = append(points, balancePoint{asOf: asOf, value: running})
	}
	if len(points) == 0 {
		return e.Next()
	}

	collection, err := e.App.FindCollectionByNameOrId("accountBalances")
	if err != nil {
		return fmt.Errorf("find accountBalances collection for linked account history: %w", err)
	}
	for _, point := range points {
		start, end := pbDateRange(point.asOf.Format("2006-01-02"))
		_, err := e.App.FindFirstRecordByFilter("accountBalances",
			"account = {:account} && asOf >= {:start} && asOf < {:end} && value = {:value} && owner = {:owner}",
			map[string]any{
				"account": e.Record.Id,
				"start":   start,
				"end":     end,
				"value":   point.value,
				"owner":   owner,
			},
		)
		if err == nil {
			continue
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("find linked account history duplicate: %w", err)
		}

		balance := core.NewRecord(collection)
		balance.Set("account", e.Record.Id)
		balance.Set("asOf", point.asOf)
		balance.Set("value", point.value)
		balance.Set("owner", owner)
		balance.Set("source", "derived")
		if err := e.App.Save(balance); err != nil {
			return fmt.Errorf("save linked account history snapshot: %w", err)
		}
	}

	return e.Next()
}
