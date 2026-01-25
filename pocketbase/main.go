package main

import (
	"log"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/jsvm"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
)

const debounceMs = 250

var (
	balanceQueue = make(chan string, 1000)
	pending      = make(map[string]time.Time)
	pendingMu    sync.Mutex
)

func main() {
	app := pocketbase.New()

	// Enable JS migrations and hooks
	jsvm.MustRegister(app, jsvm.Config{
		MigrationsDir: "pb_migrations",
	})

	// Register the migrate command
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: true,
	})

	go balanceWorker(app)

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
	select {
	case balanceQueue <- accountID:
	default:
		pendingMu.Lock()
		pending[accountID] = time.Now()
		pendingMu.Unlock()
	}
}

func balanceWorker(app *pocketbase.PocketBase) {
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case accountID := <-balanceQueue:
			pendingMu.Lock()
			pending[accountID] = time.Now()
			pendingMu.Unlock()

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
