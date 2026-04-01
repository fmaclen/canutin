package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/pocketbase/pocketbase/apis"
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
			// Check if any superuser has a real email (not the installer placeholder)
			for _, su := range superusers {
				email := su.Email()
				if email != "" && email != "__pbinstaller@example.com" {
					return re.JSON(200, map[string]bool{"ready": true})
				}
			}
			return re.JSON(200, map[string]bool{"ready": false})
		})
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

type createShareBody struct {
	AccountID      string `json:"accountId" form:"accountId"`
	AssetID        string `json:"assetId" form:"assetId"`
	RecipientEmail string `json:"recipientEmail" form:"recipientEmail"`
	Perspective    string `json:"perspective" form:"perspective"`
}

func createAccountShareHandler(app core.App) func(*core.RequestEvent) error {
	return func(re *core.RequestEvent) error {
		var body createShareBody
		if err := re.BindBody(&body); err != nil {
			return re.BadRequestError("Invalid request body", err)
		}

		return createShare(
			re,
			app,
			"accountShares",
			"accounts",
			"account",
			body.AccountID,
			body.RecipientEmail,
			body.Perspective,
		)
	}
}

func createAssetShareHandler(app core.App) func(*core.RequestEvent) error {
	return func(re *core.RequestEvent) error {
		var body createShareBody
		if err := re.BindBody(&body); err != nil {
			return re.BadRequestError("Invalid request body", err)
		}

		return createShare(
			re,
			app,
			"assetShares",
			"assets",
			"asset",
			body.AssetID,
			body.RecipientEmail,
			body.Perspective,
		)
	}
}

func createShare(
	re *core.RequestEvent,
	app core.App,
	shareCollectionName string,
	parentCollectionName string,
	parentFieldName string,
	parentID string,
	recipientEmail string,
	perspective string,
) error {
	if re.Auth == nil {
		return re.ForbiddenError("Authentication required", nil)
	}

	trimmedParentID := strings.TrimSpace(parentID)
	if trimmedParentID == "" {
		return re.BadRequestError("Missing record id", nil)
	}

	normalizedEmail := strings.TrimSpace(strings.ToLower(recipientEmail))
	if normalizedEmail == "" {
		return re.BadRequestError("Recipient email is required", nil)
	}

	normalizedPerspective := strings.ToUpper(strings.TrimSpace(perspective))
	if normalizedPerspective != "NORMAL" && normalizedPerspective != "INVERSE" {
		return re.BadRequestError("Perspective must be NORMAL or INVERSE", nil)
	}

	parent, err := app.FindRecordById(parentCollectionName, trimmedParentID)
	if err != nil {
		return re.NotFoundError("Shared record not found", err)
	}
	if parent.GetString("owner") != re.Auth.Id {
		return re.ForbiddenError("Only the owner can share this record", nil)
	}

	recipient, err := app.FindAuthRecordByEmail("users", normalizedEmail)
	if err != nil {
		return re.NotFoundError("Recipient user not found", err)
	}
	if recipient.Id == re.Auth.Id {
		return re.BadRequestError("You cannot share a record with yourself", nil)
	}

	existingShares, err := app.FindRecordsByFilter(
		shareCollectionName,
		parentFieldName+" = {:parent} && recipient = {:recipient}",
		"",
		1,
		0,
		map[string]any{
			"parent":    trimmedParentID,
			"recipient": recipient.Id,
		},
	)
	if err == nil && len(existingShares) > 0 {
		return re.BadRequestError("This record is already shared with that user", nil)
	}

	collection, err := app.FindCollectionByNameOrId(shareCollectionName)
	if err != nil {
		return re.InternalServerError("Share collection not found", err)
	}

	share := core.NewRecord(collection)
	share.Set(parentFieldName, trimmedParentID)
	share.Set("recipient", recipient.Id)
	share.Set("recipientEmail", recipient.Email())
	share.Set("grantedBy", re.Auth.Id)
	share.Set("accessRole", "VIEWER")
	share.Set("perspective", normalizedPerspective)
	share.Set("includeInNetWorth", true)

	if err := app.Save(share); err != nil {
		return re.BadRequestError("Failed to create share", err)
	}

	return re.JSON(200, map[string]any{
		"id": share.Id,
	})
}

func validateShareUpdateRequest(e *core.RecordRequestEvent) error {
	if e.Auth == nil {
		return e.ForbiddenError("Authentication required", nil)
	}

	grantedBy := e.Record.GetString("grantedBy")
	if e.Auth.Id == grantedBy {
		return nil
	}

	recipient := e.Record.GetString("recipient")
	if e.Auth.Id != recipient {
		return e.ForbiddenError("You cannot update this share", nil)
	}

	info, err := e.RequestInfo()
	if err != nil {
		return e.BadRequestError("Invalid request body", err)
	}

	for key := range info.Body {
		if key != "includeInNetWorth" {
			return e.ForbiddenError("Recipients can only update includeInNetWorth", nil)
		}
	}

	return nil
}
