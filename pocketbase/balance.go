package main

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

const debounceMs = 250
const tickerMs = 50

var (
	pending   = make(map[string]time.Time)
	pendingMu sync.Mutex
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
				if now.Sub(queuedAt) >= debounceMs*time.Millisecond {
					delete(pending, accountID)
					go calculateBalance(app, accountID)
				}
			}
			pendingMu.Unlock()
		}
	}
}

func calculateBalance(app *pocketbase.PocketBase, accountID string) {
	if err := recomputeDerivedBalance(app, accountID, ""); err != nil {
		logEvent("balance", fmt.Sprintf("failed to recompute balance for account %s", accountID), err)
	}
}

func recomputeDerivedBalance(app core.App, accountID string, importSession string) error {
	account, err := app.FindRecordById("accounts", accountID)
	if err != nil {
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
