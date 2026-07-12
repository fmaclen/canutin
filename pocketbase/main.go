package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"math"
	"os"
	"os/signal"
	"syscall"
	"time"

	validation "github.com/go-ozzo/ozzo-validation/v4"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/jsvm"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
)

func deleteCurrencyExchangeRates(e *core.RecordEvent) error {
	owner := e.Record.GetString("owner")
	code := e.Record.GetString("code")
	for {
		quotes, err := e.App.FindRecordsByFilter("exchangeRates",
			"owner = {:owner} && currency = {:currency}",
			"", 100, 0,
			map[string]any{"owner": owner, "currency": code},
		)
		if err != nil {
			return fmt.Errorf("find manual quotes for deleted currency: %w", err)
		}
		if len(quotes) == 0 {
			break
		}
		for _, quote := range quotes {
			if err := e.App.Delete(quote); err != nil {
				return fmt.Errorf("delete manual quote for deleted currency: %w", err)
			}
		}
	}
	return e.Next()
}

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
	go fxWorker(ctx, app)

	app.OnRecordAfterCreateSuccess("users").BindFunc(func(e *core.RecordEvent) error {
		if _, _, err := ensureCurrencyRecord(e.App, e.Record.Id, "USD", "", false); err != nil {
			return fmt.Errorf("seed user USD currency: %w", err)
		}
		return e.Next()
	})

	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		registerDemo(e.App)
		registerRates(e.App)

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

		e.Router.GET("/api/canutin/skill", canutinSkillHandler(e.App))

		e.Router.POST("/api/canutin/import", func(re *core.RequestEvent) error {
			return handleImport(e.App, re)
		}).Bind(apis.RequireAuth())

		e.Router.POST("/api/canutin/import/revert", func(re *core.RequestEvent) error {
			return handleRevert(e.App, re)
		}).Bind(apis.RequireAuth())

		e.Router.POST("/api/canutin/securities/with-initial-transaction", createSecurityWithInitialTransactionHandler(e.App)).Bind(
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

	app.OnRecordCreateRequest("exchangeRates").BindFunc(validateExchangeRateWriteRequest)
	app.OnRecordUpdateRequest("exchangeRates").BindFunc(validateOwnerImmutableUserUpdate)
	app.OnRecordUpdateRequest("exchangeRates").BindFunc(validateExchangeRateWriteRequest)

	app.OnRecordCreateRequest("currencies").BindFunc(func(e *core.RecordRequestEvent) error {
		if e.Record.GetBool("autoUpdate") && !fxFetchDisabled() {
			currency := e.Record.GetString("code")
			if currency != "" && currency != "USD" {
				if err := ensureRate(e.App, currency, time.Now().UTC().Format("2006-01-02"), true); err != nil {
					if errors.Is(err, errFXRequestFailed) {
						return apis.NewBadRequestError("Couldn't reach the exchange-rate service; try again", validation.Errors{
							"autoUpdate": validation.NewError(currencyAutoUpdateRequestFailed, "Couldn't reach the exchange-rate service; try again").SetParams(map[string]any{
								"currency": currency,
							}),
						})
					}
					if errors.Is(err, errFXCodeUnavailable) {
						return apis.NewBadRequestError("Currency cannot be updated automatically", validation.Errors{
							"autoUpdate": validation.NewError(currencyAutoUpdateCodeUnavailable, "Currency cannot be updated automatically").SetParams(map[string]any{
								"currency": currency,
							}),
						})
					}
					return fmt.Errorf("validate currency auto-update: %w", err)
				}
			}
		}
		return e.Next()
	})
	app.OnRecordUpdateRequest("currencies").BindFunc(validateOwnerImmutableUserUpdate)

	app.OnRecordValidate("currencies").BindFunc(func(e *core.RecordEvent) error {
		if !e.Record.IsNew() && e.Record.Original().GetString("code") != e.Record.GetString("code") {
			return apis.NewBadRequestError("Currency code cannot be changed", nil)
		}
		return e.Next()
	})

	app.OnRecordDelete("currencies").BindFunc(func(e *core.RecordEvent) error {
		code := e.Record.GetString("code")
		owner := e.Record.GetString("owner")
		for _, collection := range []string{"accounts", "assets", "securities"} {
			_, err := e.App.FindFirstRecordByFilter(collection,
				"owner = {:owner} && currency = {:currency}",
				map[string]any{"owner": owner, "currency": code},
			)
			if err == nil {
				return apis.NewBadRequestError("Currency is in use", validation.Errors{
					"currency": validation.NewError("currency_in_use", "Currency is in use").SetParams(map[string]any{
						"currency":   code,
						"collection": collection,
					}),
				})
			}
			if !errors.Is(err, sql.ErrNoRows) {
				return fmt.Errorf("check %s currency use: %w", collection, err)
			}
		}
		return e.Next()
	})

	app.OnRecordAfterDeleteSuccess("currencies").BindFunc(deleteCurrencyExchangeRates)

	// NOTE: currency is a required text field, but PocketBase text fields cannot declare a
	// schema-level default, so an empty currency defaults to USD here — the single enforcement
	// point for every create path (record API, import, entry forms). Once set it is immutable,
	// but the guard only fires when a currency was already stored: rows predating the field
	// arrive with an empty original and must accept the USD default on their next save.
	app.OnRecordValidate("accounts", "assets", "securities").BindFunc(func(e *core.RecordEvent) error {
		original := e.Record.Original().GetString("currency")
		if e.Record.GetString("currency") == "" {
			e.Record.Set("currency", "USD")
		}
		if !e.Record.IsNew() && original != "" && e.Record.GetString("currency") != original {
			return apis.NewBadRequestError("Currency cannot be changed", nil)
		}
		return e.Next()
	})

	app.OnRecordValidate("securities").BindFunc(func(e *core.RecordEvent) error {
		normalizeSecurityRecord(e.Record)
		_, err := e.App.FindFirstRecordByFilter(
			"securities",
			"id != {:id} && owner = {:owner} && normalizedName = {:normalizedName}",
			map[string]any{
				"id":             e.Record.Id,
				"owner":          e.Record.GetString("owner"),
				"normalizedName": e.Record.GetString("normalizedName"),
			},
		)
		if err == nil {
			return validation.Errors{
				"name": validation.NewError("security_name_exists", "Security name already exists"),
			}
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("check security name uniqueness: %w", err)
		}
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
		// NOTE: rates enqueue before the import short-circuit — unlike balances, imported rows still
		// need exchange rates for their historical dates, and the ensure pass never writes the
		// import-tagged snapshots that revert cleans up.
		enqueueRatesForChild(e.App, e.Record)
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
		enqueueRatesForChild(e.App, e.Record)
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
		if _, reverting := revertingSessions.Load(e.Record.GetString("importSession")); reverting {
			return e.Next()
		}
		if aid := e.Record.GetString("account"); aid != "" {
			enqueueBalance(aid)
		}
		return e.Next()
	})

	app.OnRecordAfterCreateSuccess("accounts", "assets", "securities").BindFunc(func(e *core.RecordEvent) error {
		enqueueRatesForContainer(e.App, e.Record)
		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess("accounts", "assets", "securities").BindFunc(func(e *core.RecordEvent) error {
		enqueueRatesForContainer(e.App, e.Record)
		return e.Next()
	})

	app.OnRecordAfterCreateSuccess("accountBalances", "assetBalances", "securityBalances", "securityTransactions").BindFunc(func(e *core.RecordEvent) error {
		enqueueRatesForChild(e.App, e.Record)
		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess("accountBalances", "assetBalances", "securityBalances", "securityTransactions").BindFunc(func(e *core.RecordEvent) error {
		enqueueRatesForChild(e.App, e.Record)
		return e.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatalf("[server] failed to start: %v", err)
	}
}

func validateOwnerImmutableUserUpdate(e *core.RecordRequestEvent) error {
	if (e.Auth == nil || !e.Auth.IsSuperuser()) && e.Record.GetString("owner") != e.Record.Original().GetString("owner") {
		return apis.NewBadRequestError("Owner cannot be changed", nil)
	}
	return e.Next()
}

// NOTE: a rate entered through a user token is always tagged manual regardless of the payload.
// Engine writes go through app.Save directly and bypass this request hook.
func validateExchangeRateWriteRequest(e *core.RecordRequestEvent) error {
	if e.Auth == nil || !e.Auth.IsSuperuser() {
		e.Record.Set("source", "manual")
		rate := e.Record.GetFloat("rate")
		if rate <= 0 || math.IsNaN(rate) || math.IsInf(rate, 0) {
			return apis.NewBadRequestError("Rate must be a positive number", nil)
		}
	}
	return e.Next()
}
