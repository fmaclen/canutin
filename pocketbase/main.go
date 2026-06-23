package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/jsvm"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
)

func main() {
	app := pocketbase.New()

	jsvm.MustRegister(app, jsvm.Config{
		MigrationsDir: "pb_migrations",
	})

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate:  true,
		TemplateLang: migratecmd.TemplateLangJS,
		Dir:          "pb_migrations",
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigChan
		logEvent("server", "shutting down balance worker", nil)
		cancel()
	}()

	// NOTE: publish recompute here, before balanceWorker and the request-path goroutines that read it
	// start; assigning it later would be an unsynchronized write racing those readers.
	recompute = func(accountID string) {
		if err := recomputeDerivedBalance(app, accountID, ""); err != nil {
			logEvent("balance", fmt.Sprintf("failed to recompute balance for account %s", accountID), err)
		}
	}

	go balanceWorker(ctx, app)

	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		e.Router.GET("/api/setup-status", func(re *core.RequestEvent) error {
			superusers, err := e.App.FindAllRecords("_superusers")
			if err != nil {
				return re.JSON(200, map[string]bool{"ready": false})
			}
			for _, su := range superusers {
				email := su.Email()
				if email != "" && email != "__pbinstaller@example.com" {
					return re.JSON(200, map[string]bool{"ready": true})
				}
			}
			return re.JSON(200, map[string]bool{"ready": false})
		})

		e.Router.POST("/api/canutin/import", func(re *core.RequestEvent) error {
			return handleImport(e.App, re)
		}).Bind(apis.RequireAuth())

		e.Router.POST("/api/canutin/import/revert", func(re *core.RequestEvent) error {
			return handleRevert(e.App, re)
		}).Bind(apis.RequireAuth())

		e.Router.POST("/api/canutin/securities/with-initial-balance", createSecurityWithInitialBalanceHandler(e.App)).Bind(
			apis.RequireAuth("users"),
		)

		e.Router.POST("/api/shares/accounts", createAccountShareHandler(e.App)).Bind(
			apis.RequireAuth("users"),
		)
		e.Router.POST("/api/shares/assets", createAssetShareHandler(e.App)).Bind(
			apis.RequireAuth("users"),
		)

		return e.Next()
	})

	app.OnRecordUpdateRequest("accountShares", "assetShares").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := validateShareUpdateRequest(e); err != nil {
			return err
		}
		return e.Next()
	})

	// NOTE: blocks creating or editing a balance/transaction on a closed account. Request-bound
	// (not a model hook) so imports can still restore closed-account history.
	validateSecurityWriteRequest := func(e *core.RecordRequestEvent) error {
		if e.Auth == nil || !e.Auth.IsSuperuser() {
			if err := validateAccountOpen(e.App, e.Record.GetString("account"), e.Auth); err != nil {
				return err
			}
		}
		return e.Next()
	}
	app.OnRecordCreateRequest("securityBalances", "securityTransactions").BindFunc(validateSecurityWriteRequest)
	app.OnRecordUpdateRequest("securityBalances", "securityTransactions").BindFunc(validateSecurityWriteRequest)

	app.OnRecordValidate("securities").BindFunc(func(e *core.RecordEvent) error {
		normalizeSecurityRecord(e.Record)
		if err := validateSecurityOwnerImmutable(e.Record); err != nil {
			return err
		}
		return e.Next()
	})

	app.OnRecordValidate("securityBalances").BindFunc(func(e *core.RecordEvent) error {
		normalizeSecurityDatedRecord(e.Record, "asOf")
		if err := validateSecurityOwnerImmutable(e.Record); err != nil {
			return err
		}
		if err := validateSecurityRecordIntegrity(e.App, e.Record); err != nil {
			return err
		}
		return e.Next()
	})

	app.OnRecordValidate("securityTransactions").BindFunc(func(e *core.RecordEvent) error {
		normalizeSecurityDatedRecord(e.Record, "date")
		if err := validateSecurityOwnerImmutable(e.Record); err != nil {
			return err
		}
		if err := validateSecurityRecordIntegrity(e.App, e.Record); err != nil {
			return err
		}
		return e.Next()
	})

	app.OnRecordValidate("transactions", "accountBalances").BindFunc(func(e *core.RecordEvent) error {
		if err := validateSecurityOwnerImmutable(e.Record); err != nil {
			return err
		}
		if err := validateParentOwner(e.App, e.Record, "accounts", "account"); err != nil {
			return err
		}
		// NOTE: the only programmatic creator that tags a balance derived is the balance worker;
		// imports tag import. Any other write (the manual balance form, ad-hoc API clients) is
		// user-entered, so an untagged accountBalances row defaults to manual rather than being
		// mistaken for a worker-derived snapshot that revert cleanup may delete.
		if e.Record.Collection().Name == "accountBalances" && e.Record.GetString("source") == "" {
			e.Record.Set("source", "manual")
		}
		return e.Next()
	})

	app.OnRecordValidate("assetBalances").BindFunc(func(e *core.RecordEvent) error {
		if err := validateSecurityOwnerImmutable(e.Record); err != nil {
			return err
		}
		if err := validateParentOwner(e.App, e.Record, "assets", "asset"); err != nil {
			return err
		}
		return e.Next()
	})

	app.OnRecordAfterCreateSuccess("transactions").BindFunc(func(e *core.RecordEvent) error {
		// NOTE: imported transactions skip the async enqueue because the import writes its own derived
		// snapshot synchronously (tagged with the import session) once all rows are saved. Letting the
		// worker fire too would append an untagged orphan that revert cannot identify and clean up.
		if e.Record.GetString("importSession") != "" {
			return e.Next()
		}
		if aid := e.Record.GetString("account"); aid != "" {
			enqueueBalance(aid)
		}
		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess("transactions").BindFunc(func(e *core.RecordEvent) error {
		oldAID := e.Record.Original().GetString("account")
		newAID := e.Record.GetString("account")
		if oldAID != "" && oldAID != newAID {
			enqueueBalance(oldAID)
		}
		if newAID != "" {
			enqueueBalance(newAID)
		}
		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess("transactions").BindFunc(func(e *core.RecordEvent) error {
		// NOTE: skip the async enqueue only for deletes that belong to an in-flight import revert,
		// which recomputes affected accounts synchronously inside its transaction; letting the worker
		// also fire would race that recompute (appending a duplicate snapshot) and run against
		// import-created accounts cascade-deleted in the same revert. importSession alone is permanent,
		// so a user deleting a single imported transaction outside revert must still enqueue.
		if isSessionReverting(e.Record.GetString("importSession")) {
			return e.Next()
		}
		if aid := e.Record.GetString("account"); aid != "" {
			enqueueBalance(aid)
		}
		return e.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatalf("[server] failed to start: %v", err)
	}
}
