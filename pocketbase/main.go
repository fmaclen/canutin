package main

import (
	"context"
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
		log.Println("Shutting down balance worker...")
		cancel()
	}()

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

	app.OnRecordValidate("securities").BindFunc(func(e *core.RecordEvent) error {
		normalizeSecurityRecord(e.Record)
		return e.Next()
	})

	app.OnRecordValidate("securityBalances").BindFunc(func(e *core.RecordEvent) error {
		normalizeSecurityDatedRecord(e.Record, "asOf")
		if err := validateSecurityAccountCapability(e.App, e.Record); err != nil {
			return err
		}
		return e.Next()
	})

	app.OnRecordValidate("securityTransactions").BindFunc(func(e *core.RecordEvent) error {
		normalizeSecurityDatedRecord(e.Record, "date")
		if err := validateSecurityAccountCapability(e.App, e.Record); err != nil {
			return err
		}
		return e.Next()
	})

	app.OnRecordValidate("accounts").BindFunc(func(e *core.RecordEvent) error {
		if err := preventSecuritiesDisable(e.App, e.Record); err != nil {
			return err
		}
		return e.Next()
	})

	app.OnRecordAfterCreateSuccess("transactions").BindFunc(func(e *core.RecordEvent) error {
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
		if aid := e.Record.GetString("account"); aid != "" {
			enqueueBalance(aid)
		}
		return e.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
