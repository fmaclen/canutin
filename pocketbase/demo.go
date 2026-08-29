package main

import (
	"fmt"
	"os"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

const (
	demoEmail    = "demo@canutin.com"
	demoPassword = "123qweasdzxc"
)

// demoWipeCollections lists demo-owned rows that must be wiped, child-before-parent, so deletes
// happen in foreign-key-safe order. Currencies are kept because seedDemoData upserts them
// idempotently, and deleting them would cascade-delete freshly re-seeded same-code quotes after the
// reset transaction commits.
var demoWipeCollections = []string{
	"exchangeRates",
	"securityTransactions",
	"securityBalances",
	"securities",
	"transactions",
	"accountBalances",
	"assetBalances",
	"accounts",
	"assets",
	"transactionLabels",
	"balanceTypes",
}

var demoResetMu sync.Mutex

func demoEnabled() bool {
	return os.Getenv("PUBLIC_DEMO_ENABLED") == "true"
}

func ensureDemoUser(app core.App) (string, error) {
	user, err := app.FindAuthRecordByEmail("users", demoEmail)
	if err != nil {
		coll, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return "", err
		}
		user = core.NewRecord(coll)
		user.SetEmail(demoEmail)
		user.SetPassword(demoPassword)
		user.SetVerified(true)
		if err := app.Save(user); err != nil {
			return "", err
		}
	}
	if _, _, err := ensureCurrencyRecord(app, user.Id, "USD", "", false); err != nil {
		return "", err
	}
	return user.Id, nil
}

func wipeDemoData(app core.App, userID string) error {
	for _, coll := range demoWipeCollections {
		for {
			records, err := app.FindRecordsByFilter(coll,
				"owner = {:owner}", "", 200, 0,
				map[string]any{"owner": userID},
			)
			if err != nil || len(records) == 0 {
				if err != nil {
					return err
				}
				break
			}
			for _, rec := range records {
				if err := app.Delete(rec); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func resetDemo(app core.App) error {
	demoResetMu.Lock()
	defer demoResetMu.Unlock()

	userID, err := ensureDemoUser(app)
	if err != nil {
		return fmt.Errorf("ensure demo user: %w", err)
	}

	return app.RunInTransaction(func(txApp core.App) error {
		if err := wipeDemoData(txApp, userID); err != nil {
			return fmt.Errorf("wipe demo data: %w", err)
		}
		if err := seedDemoData(txApp, userID, time.Now()); err != nil {
			return fmt.Errorf("seed demo data: %w", err)
		}
		return nil
	})
}

func registerDemo(app core.App) {
	if !demoEnabled() {
		return
	}

	app.Cron().MustAdd("demoReset", "0 4 * * *", func() {
		if err := resetDemo(app); err != nil {
			logEvent("demo", "scheduled reset failed", err)
		}
	})

	go func() {
		if err := resetDemo(app); err != nil {
			logEvent("demo", "boot reset failed", err)
		}
	}()
}
