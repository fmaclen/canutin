package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/jsvm"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
)

// debounceMs is the trailing-edge debounce delay for balance recalculations.
// After the last transaction mutation for an account, we wait this long before
// recalculating to batch rapid sequential changes (e.g., bulk imports).
const debounceMs = 250

// tickerMs controls how often the worker checks for debounce expiration.
// Lower values = more responsive but more CPU; 50ms is a good balance.
const tickerMs = 50

var (
	// pending tracks accounts awaiting balance recalculation with their queue time.
	// The map is protected by pendingMu.
	pending   = make(map[string]time.Time)
	pendingMu sync.Mutex
)

func main() {
	app := pocketbase.New()

	jsvm.MustRegister(app, jsvm.Config{
		MigrationsDir: "pb_migrations",
	})

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: true,
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigChan
		log.Println("Shutting down balance worker...")
		cancel()
	}()

	go balanceWorker(ctx, app)

	app.OnRecordAfterCreateSuccess("transactions").BindFunc(func(e *core.RecordEvent) error {
		accountID := e.Record.GetString("account")
		if accountID != "" {
			enqueueBalance(accountID)
		}
		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess("transactions").BindFunc(func(e *core.RecordEvent) error {
		oldAccountID := e.Record.Original().GetString("account")
		newAccountID := e.Record.GetString("account")

		if oldAccountID != "" && oldAccountID != newAccountID {
			enqueueBalance(oldAccountID)
		}
		if newAccountID != "" {
			enqueueBalance(newAccountID)
		}
		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess("transactions").BindFunc(func(e *core.RecordEvent) error {
		accountID := e.Record.GetString("account")
		if accountID != "" {
			enqueueBalance(accountID)
		}
		return e.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}

func enqueueBalance(accountID string) {
	pendingMu.Lock()
	defer pendingMu.Unlock()
	if _, exists := pending[accountID]; !exists {
		pending[accountID] = time.Now()
	}
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
	account, err := app.FindRecordById("accounts", accountID)
	if err != nil {
		log.Printf("Failed to find account %s: %v", accountID, err)
		return
	}

	autoCalculated := account.GetDateTime("autoCalculated")
	if autoCalculated.IsZero() {
		return
	}

	transactions, err := app.FindRecordsByFilter(
		"transactions",
		"account = {:aid}",
		"",
		0,
		0,
		map[string]any{"aid": accountID},
	)
	if err != nil {
		log.Printf("Failed to fetch transactions for account %s: %v", accountID, err)
		return
	}

	var sum float64
	for _, tx := range transactions {
		excluded := tx.GetDateTime("excluded")
		if !excluded.IsZero() {
			continue
		}
		sum += tx.GetFloat("value")
	}

	collection, err := app.FindCollectionByNameOrId("accountBalances")
	if err != nil {
		log.Printf("Failed to find accountBalances collection: %v", err)
		return
	}

	balance := core.NewRecord(collection)
	balance.Set("account", accountID)
	balance.Set("value", sum)
	balance.Set("asOf", time.Now().UTC())
	balance.Set("owner", account.GetString("owner"))

	if err := app.Save(balance); err != nil {
		log.Printf("Failed to save balance for account %s: %v", accountID, err)
	}
}
