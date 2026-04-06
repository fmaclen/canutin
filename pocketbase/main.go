package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"regexp"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/jsvm"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
)

const debounceMs = 250
const tickerMs = 50

var (
	pending   = make(map[string]time.Time)
	pendingMu sync.Mutex
	spaceRe   = regexp.MustCompile(`\s+`)
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

// ---------------------------------------------------------------------------
// Balance worker
// ---------------------------------------------------------------------------

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
	account, err := app.FindRecordById("accounts", accountID)
	if err != nil {
		log.Printf("Failed to find account %s: %v", accountID, err)
		return
	}

	if account.GetDateTime("autoCalculated").IsZero() {
		return
	}

	transactions, err := app.FindRecordsByFilter(
		"transactions", "account = {:aid}", "", 0, 0,
		map[string]any{"aid": accountID},
	)
	if err != nil {
		log.Printf("Failed to fetch transactions for account %s: %v", accountID, err)
		return
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

// ---------------------------------------------------------------------------
// Import types
// ---------------------------------------------------------------------------

type importPayload struct {
	SessionLabel string              `json:"sessionLabel"`
	Accounts     []importAccount     `json:"accounts"`
	Assets       []importAsset       `json:"assets"`
	Transactions []importTransaction `json:"transactions"`
}

type importAccount struct {
	Name           string         `json:"name"`
	Institution    string         `json:"institution"`
	BalanceGroup   string         `json:"balanceGroup"`
	BalanceType    string         `json:"balanceType"`
	AutoCalculated bool           `json:"autoCalculated"`
	Closed         bool           `json:"closed"`
	Excluded       bool           `json:"excluded"`
	Balance        *importBalance `json:"balance"`
}

type importAsset struct {
	Name         string          `json:"name"`
	Symbol       string          `json:"symbol"`
	BalanceGroup string          `json:"balanceGroup"`
	BalanceType  string          `json:"balanceType"`
	Type         string          `json:"type"`
	Sold         bool            `json:"sold"`
	Excluded     bool            `json:"excluded"`
	Balance      *importAssetBal `json:"balance"`
}

type importBalance struct {
	Value float64 `json:"value"`
	AsOf  string  `json:"asOf"`
}

type importAssetBal struct {
	MarketValue float64 `json:"marketValue"`
	BookValue   float64 `json:"bookValue"`
	Quantity    float64 `json:"quantity"`
	MarketPrice float64 `json:"marketPrice"`
	BookPrice   float64 `json:"bookPrice"`
	AsOf        string  `json:"asOf"`
}

type importTransaction struct {
	AccountName string   `json:"accountName"`
	Date        string   `json:"date"`
	Description string   `json:"description"`
	Value       float64  `json:"value"`
	ExternalID  string   `json:"externalId"`
	Labels      []string `json:"labels"`
	Excluded    bool     `json:"excluded"`
}

type importCounts struct {
	Created  int `json:"created"`
	Existing int `json:"existing,omitempty"`
	Skipped  int `json:"skipped,omitempty"`
}

type importResult struct {
	SessionID       string       `json:"sessionId"`
	Accounts        importCounts `json:"accounts"`
	Assets          importCounts `json:"assets"`
	Transactions    importCounts `json:"transactions"`
	AccountBalances importCounts `json:"accountBalances"`
	AssetBalances   importCounts `json:"assetBalances"`
}

// ---------------------------------------------------------------------------
// Import helpers
// ---------------------------------------------------------------------------

func normalizeDescription(desc string) string {
	return strings.ToLower(strings.TrimSpace(spaceRe.ReplaceAllString(desc, " ")))
}

func datePart(isoDate string) string {
	if idx := strings.IndexByte(isoDate, 'T'); idx >= 0 {
		return isoDate[:idx]
	}
	if idx := strings.IndexByte(isoDate, ' '); idx >= 0 {
		return isoDate[:idx]
	}
	return isoDate
}

func pbDateRange(isoDate string) (start, end string) {
	start = datePart(isoDate) + " 00:00:00.000Z"
	t, err := time.Parse("2006-01-02", datePart(isoDate))
	if err != nil {
		t = time.Now().UTC()
	}
	end = t.AddDate(0, 0, 1).Format("2006-01-02") + " 00:00:00.000Z"
	return
}

func boolToTimestamp(b bool) string {
	if b {
		return time.Now().UTC().Format(time.RFC3339Nano)
	}
	return ""
}

func findOrCreate(app core.App, collectionName, filter string, params map[string]any, data map[string]any) (*core.Record, bool, error) {
	rec, err := app.FindFirstRecordByFilter(collectionName, filter, params)
	if err == nil {
		return rec, false, nil
	}

	coll, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		return nil, false, err
	}

	rec = core.NewRecord(coll)
	for k, v := range data {
		rec.Set(k, v)
	}
	if err := app.Save(rec); err != nil {
		return nil, false, err
	}
	return rec, true, nil
}

func cachedFindOrCreate(cache map[string]string, key string, app core.App, collectionName, filter string, params map[string]any, data map[string]any) (string, error) {
	if id, ok := cache[key]; ok {
		return id, nil
	}
	rec, _, err := findOrCreate(app, collectionName, filter, params, data)
	if err != nil {
		return "", err
	}
	cache[key] = rec.Id
	return rec.Id, nil
}

// ---------------------------------------------------------------------------
// POST /api/canutin/import
// ---------------------------------------------------------------------------

func handleImport(app core.App, re *core.RequestEvent) error {
	info, _ := re.RequestInfo()
	auth := info.Auth

	var payload importPayload
	if err := json.NewDecoder(re.Request.Body).Decode(&payload); err != nil {
		return re.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid JSON body"})
	}

	if payload.SessionLabel == "" {
		return re.JSON(http.StatusBadRequest, map[string]string{"error": "sessionLabel is required"})
	}
	if len(payload.Accounts) == 0 && len(payload.Assets) == 0 && len(payload.Transactions) == 0 {
		return re.JSON(http.StatusBadRequest, map[string]string{"error": "At least one of accounts, assets, or transactions is required"})
	}

	ownerID := auth.Id
	result := importResult{}

	sessColl, err := app.FindCollectionByNameOrId("importSessions")
	if err != nil {
		return re.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to find importSessions collection"})
	}

	session := core.NewRecord(sessColl)
	session.Set("label", payload.SessionLabel)
	session.Set("owner", ownerID)
	session.Set("recordsCreated", 0)
	session.Set("recordsSkipped", 0)
	session.Set("status", "pending")
	if err := app.Save(session); err != nil {
		return re.JSON(http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("Failed to create import session: %v", err)})
	}
	result.SessionID = session.Id

	btCache := map[string]string{}
	lblCache := map[string]string{}
	acctIndex := map[string]string{} // "name|institution|balanceGroup" -> recordID

	for _, acct := range payload.Accounts {
		institution := acct.Institution

		btKey := acct.BalanceType + "::" + ownerID
		btID, err := cachedFindOrCreate(btCache, btKey, app,
			"balanceTypes", "name = {:name} && owner = {:owner}",
			map[string]any{"name": acct.BalanceType, "owner": ownerID},
			map[string]any{"name": acct.BalanceType, "owner": ownerID},
		)
		if err != nil {
			continue
		}

		acctFilter := "name = {:name} && balanceGroup = {:bg} && owner = {:owner}"
		acctParams := map[string]any{"name": acct.Name, "bg": acct.BalanceGroup, "owner": ownerID}
		if institution != "" {
			acctFilter = "name = {:name} && institution = {:inst} && balanceGroup = {:bg} && owner = {:owner}"
			acctParams["inst"] = institution
		}

		rec, created, err := findOrCreate(app, "accounts", acctFilter, acctParams, map[string]any{
			"name":           acct.Name,
			"institution":    institution,
			"balanceGroup":   acct.BalanceGroup,
			"balanceType":    btID,
			"autoCalculated": boolToTimestamp(acct.AutoCalculated),
			"closed":         boolToTimestamp(acct.Closed),
			"excluded":       boolToTimestamp(acct.Excluded),
			"owner":          ownerID,
			"importSession":  session.Id,
		})
		if err != nil {
			continue
		}

		indexKey := acct.Name + "|" + institution + "|" + acct.BalanceGroup
		acctIndex[indexKey] = rec.Id

		if created {
			result.Accounts.Created++
		} else {
			result.Accounts.Existing++
		}

		if acct.Balance != nil {
			start, end := pbDateRange(acct.Balance.AsOf)
			_, findErr := app.FindFirstRecordByFilter("accountBalances",
				"account = {:account} && asOf >= {:start} && asOf < {:end} && value = {:value} && owner = {:owner}",
				map[string]any{"account": rec.Id, "start": start, "end": end, "value": acct.Balance.Value, "owner": ownerID},
			)
			if findErr != nil {
				abColl, _ := app.FindCollectionByNameOrId("accountBalances")
				ab := core.NewRecord(abColl)
				ab.Set("account", rec.Id)
				ab.Set("value", acct.Balance.Value)
				ab.Set("asOf", acct.Balance.AsOf)
				ab.Set("owner", ownerID)
				ab.Set("importSession", session.Id)
				if err := app.Save(ab); err == nil {
					result.AccountBalances.Created++
				}
			} else {
				result.AccountBalances.Skipped++
			}
		}
	}

	for _, asset := range payload.Assets {
		symbol := asset.Symbol

		btKey := asset.BalanceType + "::" + ownerID
		btID, err := cachedFindOrCreate(btCache, btKey, app,
			"balanceTypes", "name = {:name} && owner = {:owner}",
			map[string]any{"name": asset.BalanceType, "owner": ownerID},
			map[string]any{"name": asset.BalanceType, "owner": ownerID},
		)
		if err != nil {
			continue
		}

		assetFilter := "name = {:name} && owner = {:owner}"
		assetParams := map[string]any{"name": asset.Name, "owner": ownerID}
		if symbol != "" {
			assetFilter = "name = {:name} && symbol = {:symbol} && owner = {:owner}"
			assetParams["symbol"] = symbol
		}

		rec, created, err := findOrCreate(app, "assets", assetFilter, assetParams, map[string]any{
			"name":          asset.Name,
			"symbol":        symbol,
			"balanceGroup":  asset.BalanceGroup,
			"balanceType":   btID,
			"type":          asset.Type,
			"sold":          boolToTimestamp(asset.Sold),
			"excluded":      boolToTimestamp(asset.Excluded),
			"owner":         ownerID,
			"importSession": session.Id,
		})
		if err != nil {
			continue
		}

		if created {
			result.Assets.Created++
		} else {
			result.Assets.Existing++
		}

		if asset.Balance != nil {
			mv := asset.Balance.MarketValue
			start, end := pbDateRange(asset.Balance.AsOf)
			_, findErr := app.FindFirstRecordByFilter("assetBalances",
				"asset = {:asset} && asOf >= {:start} && asOf < {:end} && marketValue = {:mv} && owner = {:owner}",
				map[string]any{"asset": rec.Id, "start": start, "end": end, "mv": mv, "owner": ownerID},
			)
			if findErr != nil {
				asbColl, _ := app.FindCollectionByNameOrId("assetBalances")
				asb := core.NewRecord(asbColl)
				asb.Set("asset", rec.Id)
				asb.Set("marketValue", mv)
				asb.Set("bookValue", asset.Balance.BookValue)
				asb.Set("quantity", asset.Balance.Quantity)
				asb.Set("marketPrice", asset.Balance.MarketPrice)
				asb.Set("bookPrice", asset.Balance.BookPrice)
				asb.Set("asOf", asset.Balance.AsOf)
				asb.Set("owner", ownerID)
				asb.Set("importSession", session.Id)
				if err := app.Save(asb); err == nil {
					result.AssetBalances.Created++
				}
			} else {
				result.AssetBalances.Skipped++
			}
		}
	}

	for _, tx := range payload.Transactions {
		var accountID string
		for key, id := range acctIndex {
			if strings.HasPrefix(key, tx.AccountName+"|") {
				accountID = id
				break
			}
		}

		if accountID == "" {
			found, err := app.FindFirstRecordByFilter("accounts",
				"name = {:name} && owner = {:owner}",
				map[string]any{"name": tx.AccountName, "owner": ownerID},
			)
			if err != nil {
				result.Transactions.Skipped++
				continue
			}
			accountID = found.Id
			acctIndex[tx.AccountName+"||"] = accountID
		}

		isDuplicate := false
		if tx.ExternalID != "" {
			_, err := app.FindFirstRecordByFilter("transactions",
				"account = {:account} && externalId = {:eid} && owner = {:owner}",
				map[string]any{"account": accountID, "eid": tx.ExternalID, "owner": ownerID},
			)
			if err == nil {
				isDuplicate = true
			}
		} else {
			txDesc := normalizeDescription(tx.Description)
			start, end := pbDateRange(tx.Date)
			candidates, err := app.FindRecordsByFilter("transactions",
				"account = {:account} && date >= {:start} && date < {:end} && value = {:value} && owner = {:owner}",
				"", 0, 0,
				map[string]any{"account": accountID, "start": start, "end": end, "value": tx.Value, "owner": ownerID},
			)
			if err == nil {
				for _, c := range candidates {
					if normalizeDescription(c.GetString("description")) == txDesc {
						isDuplicate = true
						break
					}
				}
			}
		}

		if isDuplicate {
			result.Transactions.Skipped++
			continue
		}

		var labelIDs []string
		for _, lbl := range tx.Labels {
			lblKey := lbl + "::" + ownerID
			lblID, err := cachedFindOrCreate(lblCache, lblKey, app,
				"transactionLabels", "name = {:name} && owner = {:owner}",
				map[string]any{"name": lbl, "owner": ownerID},
				map[string]any{"name": lbl, "owner": ownerID},
			)
			if err == nil {
				labelIDs = append(labelIDs, lblID)
			}
		}

		txColl, _ := app.FindCollectionByNameOrId("transactions")
		txRec := core.NewRecord(txColl)
		txRec.Set("account", accountID)
		txRec.Set("date", tx.Date)
		txRec.Set("description", tx.Description)
		txRec.Set("value", tx.Value)
		txRec.Set("externalId", tx.ExternalID)
		txRec.Set("labels", labelIDs)
		txRec.Set("excluded", boolToTimestamp(tx.Excluded))
		txRec.Set("owner", ownerID)
		txRec.Set("importSession", session.Id)
		if err := app.Save(txRec); err == nil {
			result.Transactions.Created++
		}
	}

	totalCreated := result.Accounts.Created + result.Assets.Created + result.Transactions.Created +
		result.AccountBalances.Created + result.AssetBalances.Created
	totalSkipped := result.Accounts.Existing + result.Assets.Existing + result.Transactions.Skipped +
		result.AccountBalances.Skipped + result.AssetBalances.Skipped

	session.Set("status", "completed")
	session.Set("recordsCreated", totalCreated)
	session.Set("recordsSkipped", totalSkipped)
	app.Save(session)

	return re.JSON(http.StatusOK, result)
}

// ---------------------------------------------------------------------------
// POST /api/canutin/import/revert
// ---------------------------------------------------------------------------

func handleRevert(app core.App, re *core.RequestEvent) error {
	info, _ := re.RequestInfo()
	auth := info.Auth

	var body struct {
		SessionID string `json:"sessionId"`
	}
	if err := json.NewDecoder(re.Request.Body).Decode(&body); err != nil {
		return re.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid JSON body"})
	}
	if body.SessionID == "" {
		return re.JSON(http.StatusBadRequest, map[string]string{"error": "sessionId is required"})
	}

	session, err := app.FindRecordById("importSessions", body.SessionID)
	if err != nil {
		return re.JSON(http.StatusNotFound, map[string]string{"error": "Session not found"})
	}
	if session.GetString("owner") != auth.Id {
		return re.JSON(http.StatusForbidden, map[string]string{"error": "Unauthorized"})
	}
	if session.GetString("status") == "rolled_back" {
		return re.JSON(http.StatusBadRequest, map[string]string{"error": "Session already reverted"})
	}

	collections := []string{"transactions", "accountBalances", "assetBalances", "accounts", "assets"}
	totalDeleted := 0

	err = app.RunInTransaction(func(txApp core.App) error {
		for _, coll := range collections {
			for {
				records, err := txApp.FindRecordsByFilter(coll,
					"importSession = {:sid} && owner = {:owner}",
					"", 100, 0,
					map[string]any{"sid": body.SessionID, "owner": auth.Id},
				)
				if err != nil || len(records) == 0 {
					break
				}
				for _, rec := range records {
					if err := txApp.Delete(rec); err != nil {
						return err
					}
					totalDeleted++
				}
			}
		}

		allLabels, _ := txApp.FindRecordsByFilter("transactionLabels",
			"owner = {:owner}", "", 0, 0,
			map[string]any{"owner": auth.Id},
		)
		for _, lbl := range allLabels {
			_, err := txApp.FindFirstRecordByFilter("transactions",
				"labels ~ {:labelId} && owner = {:owner}",
				map[string]any{"labelId": lbl.Id, "owner": auth.Id},
			)
			if err != nil {
				txApp.Delete(lbl)
			}
		}

		allBT, _ := txApp.FindRecordsByFilter("balanceTypes",
			"owner = {:owner}", "", 0, 0,
			map[string]any{"owner": auth.Id},
		)
		for _, bt := range allBT {
			inUse := false
			if _, err := txApp.FindFirstRecordByFilter("accounts", "balanceType = {:btId} && owner = {:owner}", map[string]any{"btId": bt.Id, "owner": auth.Id}); err == nil {
				inUse = true
			}
			if !inUse {
				if _, err := txApp.FindFirstRecordByFilter("assets", "balanceType = {:btId} && owner = {:owner}", map[string]any{"btId": bt.Id, "owner": auth.Id}); err == nil {
					inUse = true
				}
			}
			if !inUse {
				txApp.Delete(bt)
			}
		}

		session.Set("status", "rolled_back")
		session.Set("recordsCreated", 0)
		session.Set("recordsSkipped", 0)
		return txApp.Save(session)
	})

	if err != nil {
		return re.JSON(http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("Revert failed: %v", err)})
	}

	return re.JSON(http.StatusOK, map[string]any{"sessionId": body.SessionID, "deleted": totalDeleted})
}
