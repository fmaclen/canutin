package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/pocketbase/pocketbase/core"
)

var spaceRe = regexp.MustCompile(`\s+`)

// NOTE: single source of truth for the currency code rule — a free-form uppercase code (ISO 4217,
// crypto tickers, or custom), 2-10 chars of A-Z/0-9. Must stay in sync with the identical `pattern`
// on the currency text field of the accounts/assets/securities collections and the currencies
// registry code field.
var currencyRe = regexp.MustCompile(`^[A-Z0-9]{2,10}$`)

var revertingSessions sync.Map

type importPayload struct {
	SessionLabel         string                      `json:"sessionLabel"`
	Currencies           []importCurrency            `json:"currencies"`
	Accounts             []importAccount             `json:"accounts"`
	Assets               []importAsset               `json:"assets"`
	Securities           []importSecurity            `json:"securities"`
	Transactions         []importTransaction         `json:"transactions"`
	SecurityBalances     []importSecurityBalance     `json:"securityBalances"`
	SecurityTransactions []importSecurityTransaction `json:"securityTransactions"`
}

type importCurrency struct {
	Code       string                `json:"code"`
	Name       string                `json:"name"`
	AutoUpdate bool                  `json:"autoUpdate"`
	Quotes     []importCurrencyQuote `json:"quotes"`
}

type importCurrencyQuote struct {
	Date string  `json:"date"`
	Rate float64 `json:"rate"`
}

type importAccount struct {
	Name           string         `json:"name"`
	Institution    string         `json:"institution"`
	BalanceGroup   string         `json:"balanceGroup"`
	BalanceType    string         `json:"balanceType"`
	Currency       string         `json:"currency"`
	AutoCalculated bool           `json:"autoCalculated"`
	Closed         bool           `json:"closed"`
	Excluded       bool           `json:"excluded"`
	Balance        *importBalance `json:"balance"`
}

type importAsset struct {
	Name         string          `json:"name"`
	BalanceGroup string          `json:"balanceGroup"`
	BalanceType  string          `json:"balanceType"`
	Currency     string          `json:"currency"`
	Sold         bool            `json:"sold"`
	Excluded     bool            `json:"excluded"`
	Balance      *importAssetBal `json:"balance"`
}

type importSecurity struct {
	Name     string `json:"name"`
	Symbol   string `json:"symbol"`
	Currency string `json:"currency"`
}

type importBalance struct {
	Value float64 `json:"value"`
	AsOf  string  `json:"asOf"`
}

type importAssetBal struct {
	MarketValue float64 `json:"marketValue"`
	BookValue   float64 `json:"bookValue"`
	AsOf        string  `json:"asOf"`
}

type importTransaction struct {
	AccountID    string   `json:"accountId"`
	AccountName  string   `json:"accountName"`
	Institution  string   `json:"institution"`
	BalanceGroup string   `json:"balanceGroup"`
	Date         string   `json:"date"`
	Description  string   `json:"description"`
	Value        float64  `json:"value"`
	ExternalID   string   `json:"externalId"`
	Labels       []string `json:"labels"`
	Excluded     bool     `json:"excluded"`
}

type importSecurityBalance struct {
	AccountID      string   `json:"accountId"`
	AccountName    string   `json:"accountName"`
	SecurityID     string   `json:"securityId"`
	SecurityName   string   `json:"securityName"`
	SecuritySymbol string   `json:"securitySymbol"`
	AsOf           string   `json:"asOf"`
	Quantity       *float64 `json:"quantity"`
	Price          *float64 `json:"price"`
	Value          *float64 `json:"value"`
	CostBasis      *float64 `json:"costBasis"`
}

type importSecurityTransaction struct {
	AccountID      string   `json:"accountId"`
	AccountName    string   `json:"accountName"`
	SecurityID     string   `json:"securityId"`
	SecurityName   string   `json:"securityName"`
	SecuritySymbol string   `json:"securitySymbol"`
	Date           string   `json:"date"`
	Type           string   `json:"type"`
	Subtype        string   `json:"subtype"`
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	Quantity       *float64 `json:"quantity"`
	Price          *float64 `json:"price"`
	Amount         *float64 `json:"amount"`
	Fees           *float64 `json:"fees"`
	Notes          string   `json:"notes"`
}

type importCounts struct {
	Created  int `json:"created"`
	Existing int `json:"existing"`
	Skipped  int `json:"skipped"`
}

type importResult struct {
	SessionID            string       `json:"sessionId"`
	Status               string       `json:"status"`
	RecordsFailed        int          `json:"recordsFailed"`
	Currencies           importCounts `json:"currencies"`
	ExchangeRates        importCounts `json:"exchangeRates"`
	Accounts             importCounts `json:"accounts"`
	Assets               importCounts `json:"assets"`
	Securities           importCounts `json:"securities"`
	Transactions         importCounts `json:"transactions"`
	AccountBalances      importCounts `json:"accountBalances"`
	AssetBalances        importCounts `json:"assetBalances"`
	SecurityBalances     importCounts `json:"securityBalances"`
	SecurityTransactions importCounts `json:"securityTransactions"`
}

// Import session status values. These mirror the importSessions.status select options in the
// schema migration. pending is set when the session record is created; the value is finalized
// after every collection loop runs.
const (
	importStatusCompleted           = "completed"
	importStatusCompletedWithErrors = "completed_with_errors"
	importStatusFailed              = "failed"
	importStatusPending             = "pending"
)

// Import payload limits. These bound an authenticated import request before the body is
// decoded or any record is written, so a single request cannot exhaust memory or flood the
// database. Values are deliberately generous for real personal-finance imports (years of
// transactions across many accounts) while still rejecting clearly abusive payloads. Future
// import sources that need higher ceilings should raise these intentionally, not silently.
const (
	// maxImportBodyBytes caps the raw request body. A transaction encodes to a few hundred
	// bytes of JSON, so 64 MiB comfortably covers maxImportTotalRecords with headroom.
	maxImportBodyBytes = 64 << 20

	// maxImportTotalRecords caps the sum of records across every collection in one request.
	maxImportTotalRecords = 200_000

	// maxImportRecordsPerCollection caps any single collection array in one request.
	maxImportRecordsPerCollection = 100_000

	// String-length limits, in runes. Labels, names, and symbols are short identifiers;
	// descriptions and notes hold free-form text but are still bounded.
	maxImportSessionLabelLength = 256
	maxImportNameLength         = 256
	maxImportLabelLength        = 256
	maxImportSymbolLength       = 32
	maxImportDescriptionLength  = 2_000
	maxImportNotesLength        = 5_000
)

type importValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// validateImportDate accepts the ISO date forms the write path already parses with datePart:
// a bare "2006-01-02" or a longer timestamp whose date portion parses. An empty date is left to
// the per-collection required-field checks so the error message can name the field.
func validateImportDate(value string) bool {
	if value == "" {
		return false
	}
	_, err := time.Parse("2006-01-02", datePart(value))
	return err == nil
}

func validateImportNumber(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

func validateOptionalImportNumber(value *float64) bool {
	return value == nil || validateImportNumber(*value)
}

// validateImportPayload runs before any importSessions record is created. It rejects payloads
// that are structurally invalid: missing required fields, oversized collections, over-length
// strings, unparseable dates, or non-finite numbers. Duplicate detection stays in the write
// path because it depends on existing database state.
func validateImportPayload(payload importPayload) []importValidationError {
	var validationErrors []importValidationError
	currencyQuoteCount := 0
	for _, currency := range payload.Currencies {
		currencyQuoteCount += len(currency.Quotes)
	}

	if strings.TrimSpace(payload.SessionLabel) == "" {
		validationErrors = append(validationErrors, importValidationError{Field: "sessionLabel", Message: "sessionLabel is required"})
	} else if utf8.RuneCountInString(payload.SessionLabel) > maxImportSessionLabelLength {
		validationErrors = append(validationErrors, importValidationError{Field: "sessionLabel", Message: fmt.Sprintf("sessionLabel exceeds %d characters", maxImportSessionLabelLength)})
	}

	collectionSizes := []struct {
		field string
		size  int
	}{
		{"currencies", len(payload.Currencies)},
		{"exchangeRates", currencyQuoteCount},
		{"accounts", len(payload.Accounts)},
		{"assets", len(payload.Assets)},
		{"securities", len(payload.Securities)},
		{"transactions", len(payload.Transactions)},
		{"securityBalances", len(payload.SecurityBalances)},
		{"securityTransactions", len(payload.SecurityTransactions)},
	}

	total := 0
	for _, c := range collectionSizes {
		total += c.size
		if c.size > maxImportRecordsPerCollection {
			validationErrors = append(validationErrors, importValidationError{Field: c.field, Message: fmt.Sprintf("%s exceeds %d records", c.field, maxImportRecordsPerCollection)})
		}
	}
	if total == 0 {
		validationErrors = append(validationErrors, importValidationError{Field: "collections", Message: "At least one import collection is required"})
	}
	if total > maxImportTotalRecords {
		validationErrors = append(validationErrors, importValidationError{Field: "collections", Message: fmt.Sprintf("total records exceed %d", maxImportTotalRecords)})
	}

	for i, currency := range payload.Currencies {
		code := strings.TrimSpace(currency.Code)
		if code == "" {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("currencies[%d].code", i), Message: "code is required"})
		} else if !currencyRe.MatchString(code) {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("currencies[%d].code", i), Message: "code must be 2-10 uppercase letters or digits"})
		}
		if utf8.RuneCountInString(currency.Name) > maxImportNameLength {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("currencies[%d].name", i), Message: fmt.Sprintf("name exceeds %d characters", maxImportNameLength)})
		}
		if len(currency.Quotes) == 0 {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("currencies[%d].quotes", i), Message: "at least one quote is required"})
		}
		for j, quote := range currency.Quotes {
			if !validateImportDate(quote.Date) {
				validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("currencies[%d].quotes[%d].date", i, j), Message: "date is not a valid date"})
			}
			if !validateImportNumber(quote.Rate) || quote.Rate <= 0 {
				validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("currencies[%d].quotes[%d].rate", i, j), Message: "rate must be a positive finite number"})
			}
		}
	}

	for i, acct := range payload.Accounts {
		if strings.TrimSpace(acct.Name) == "" {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("accounts[%d].name", i), Message: "name is required"})
		} else if utf8.RuneCountInString(acct.Name) > maxImportNameLength {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("accounts[%d].name", i), Message: fmt.Sprintf("name exceeds %d characters", maxImportNameLength)})
		}
		if utf8.RuneCountInString(acct.Institution) > maxImportNameLength {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("accounts[%d].institution", i), Message: fmt.Sprintf("institution exceeds %d characters", maxImportNameLength)})
		}
		if acct.Currency != "" && !currencyRe.MatchString(acct.Currency) {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("accounts[%d].currency", i), Message: "currency must be 2-10 uppercase letters or digits"})
		}
		if acct.Balance != nil {
			if !validateImportDate(acct.Balance.AsOf) {
				validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("accounts[%d].balance.asOf", i), Message: "asOf is not a valid date"})
			}
			if !validateImportNumber(acct.Balance.Value) {
				validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("accounts[%d].balance.value", i), Message: "value is not a finite number"})
			}
		}
	}

	for i, asset := range payload.Assets {
		if strings.TrimSpace(asset.Name) == "" {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("assets[%d].name", i), Message: "name is required"})
		} else if utf8.RuneCountInString(asset.Name) > maxImportNameLength {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("assets[%d].name", i), Message: fmt.Sprintf("name exceeds %d characters", maxImportNameLength)})
		}
		if asset.Currency != "" && !currencyRe.MatchString(asset.Currency) {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("assets[%d].currency", i), Message: "currency must be 2-10 uppercase letters or digits"})
		}
		if asset.Balance != nil {
			if !validateImportDate(asset.Balance.AsOf) {
				validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("assets[%d].balance.asOf", i), Message: "asOf is not a valid date"})
			}
			if !validateImportNumber(asset.Balance.MarketValue) {
				validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("assets[%d].balance.marketValue", i), Message: "marketValue is not a finite number"})
			}
			if !validateImportNumber(asset.Balance.BookValue) {
				validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("assets[%d].balance.bookValue", i), Message: "bookValue is not a finite number"})
			}
		}
	}

	for i, security := range payload.Securities {
		if strings.TrimSpace(security.Name) == "" {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("securities[%d].name", i), Message: "name is required"})
		} else if utf8.RuneCountInString(security.Name) > maxImportNameLength {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("securities[%d].name", i), Message: fmt.Sprintf("name exceeds %d characters", maxImportNameLength)})
		}
		if utf8.RuneCountInString(security.Symbol) > maxImportSymbolLength {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("securities[%d].symbol", i), Message: fmt.Sprintf("symbol exceeds %d characters", maxImportSymbolLength)})
		}
		if security.Currency != "" && !currencyRe.MatchString(security.Currency) {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("securities[%d].currency", i), Message: "currency must be 2-10 uppercase letters or digits"})
		}
	}

	for i, tx := range payload.Transactions {
		if strings.TrimSpace(tx.AccountName) == "" {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("transactions[%d].accountName", i), Message: "accountName is required"})
		} else if utf8.RuneCountInString(tx.AccountName) > maxImportNameLength {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("transactions[%d].accountName", i), Message: fmt.Sprintf("accountName exceeds %d characters", maxImportNameLength)})
		}
		if !validateImportDate(tx.Date) {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("transactions[%d].date", i), Message: "date is not a valid date"})
		}
		if utf8.RuneCountInString(tx.Description) > maxImportDescriptionLength {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("transactions[%d].description", i), Message: fmt.Sprintf("description exceeds %d characters", maxImportDescriptionLength)})
		}
		if !validateImportNumber(tx.Value) {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("transactions[%d].value", i), Message: "value is not a finite number"})
		}
		for j, lbl := range tx.Labels {
			if utf8.RuneCountInString(lbl) > maxImportLabelLength {
				validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("transactions[%d].labels[%d]", i, j), Message: fmt.Sprintf("label exceeds %d characters", maxImportLabelLength)})
			}
		}
	}

	for i, balance := range payload.SecurityBalances {
		if strings.TrimSpace(balance.AccountID) == "" && strings.TrimSpace(balance.AccountName) == "" {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("securityBalances[%d]", i), Message: "accountId or accountName is required"})
		}
		if utf8.RuneCountInString(balance.AccountName) > maxImportNameLength {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("securityBalances[%d].accountName", i), Message: fmt.Sprintf("accountName exceeds %d characters", maxImportNameLength)})
		}
		if utf8.RuneCountInString(balance.SecurityName) > maxImportNameLength {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("securityBalances[%d].securityName", i), Message: fmt.Sprintf("securityName exceeds %d characters", maxImportNameLength)})
		}
		if utf8.RuneCountInString(balance.SecuritySymbol) > maxImportSymbolLength {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("securityBalances[%d].securitySymbol", i), Message: fmt.Sprintf("securitySymbol exceeds %d characters", maxImportSymbolLength)})
		}
		if !validateImportDate(balance.AsOf) {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("securityBalances[%d].asOf", i), Message: "asOf is not a valid date"})
		}
		for field, value := range map[string]*float64{"quantity": balance.Quantity, "price": balance.Price, "value": balance.Value, "costBasis": balance.CostBasis} {
			if !validateOptionalImportNumber(value) {
				validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("securityBalances[%d].%s", i, field), Message: field + " is not a finite number"})
			}
		}
	}

	for i, tx := range payload.SecurityTransactions {
		if strings.TrimSpace(tx.AccountID) == "" && strings.TrimSpace(tx.AccountName) == "" {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("securityTransactions[%d]", i), Message: "accountId or accountName is required"})
		}
		if utf8.RuneCountInString(tx.AccountName) > maxImportNameLength {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("securityTransactions[%d].accountName", i), Message: fmt.Sprintf("accountName exceeds %d characters", maxImportNameLength)})
		}
		if utf8.RuneCountInString(tx.SecurityName) > maxImportNameLength {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("securityTransactions[%d].securityName", i), Message: fmt.Sprintf("securityName exceeds %d characters", maxImportNameLength)})
		}
		if utf8.RuneCountInString(tx.SecuritySymbol) > maxImportSymbolLength {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("securityTransactions[%d].securitySymbol", i), Message: fmt.Sprintf("securitySymbol exceeds %d characters", maxImportSymbolLength)})
		}
		if utf8.RuneCountInString(tx.Name) > maxImportNameLength {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("securityTransactions[%d].name", i), Message: fmt.Sprintf("name exceeds %d characters", maxImportNameLength)})
		}
		if utf8.RuneCountInString(tx.Description) > maxImportDescriptionLength {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("securityTransactions[%d].description", i), Message: fmt.Sprintf("description exceeds %d characters", maxImportDescriptionLength)})
		}
		if utf8.RuneCountInString(tx.Notes) > maxImportNotesLength {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("securityTransactions[%d].notes", i), Message: fmt.Sprintf("notes exceeds %d characters", maxImportNotesLength)})
		}
		if !validateImportDate(tx.Date) {
			validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("securityTransactions[%d].date", i), Message: "date is not a valid date"})
		}
		for field, value := range map[string]*float64{"quantity": tx.Quantity, "price": tx.Price, "amount": tx.Amount, "fees": tx.Fees} {
			if !validateOptionalImportNumber(value) {
				validationErrors = append(validationErrors, importValidationError{Field: fmt.Sprintf("securityTransactions[%d].%s", i, field), Message: field + " is not a finite number"})
			}
		}
	}

	return validationErrors
}

func importCurrencyCode(value string) string {
	code := strings.TrimSpace(value)
	if code == "" {
		return "USD"
	}
	return code
}

func validateImportCurrencyReferences(app core.App, ownerID string, payload importPayload) ([]string, error) {
	declared := map[string]struct{}{}
	for _, currency := range payload.Currencies {
		if len(currency.Quotes) > 0 {
			declared[strings.TrimSpace(currency.Code)] = struct{}{}
		}
	}

	existing := map[string]struct{}{}
	records, err := app.FindRecordsByFilter("currencies",
		"owner = {:owner}",
		"", 0, 0,
		map[string]any{"owner": ownerID},
	)
	if err != nil {
		return nil, err
	}
	for _, record := range records {
		existing[record.GetString("code")] = struct{}{}
	}

	referenced := map[string]struct{}{}
	for _, account := range payload.Accounts {
		referenced[importCurrencyCode(account.Currency)] = struct{}{}
	}
	for _, asset := range payload.Assets {
		referenced[importCurrencyCode(asset.Currency)] = struct{}{}
	}
	for _, security := range payload.Securities {
		referenced[importCurrencyCode(security.Currency)] = struct{}{}
	}
	if len(payload.SecurityBalances) > 0 || len(payload.SecurityTransactions) > 0 {
		referenced["USD"] = struct{}{}
	}

	var missing []string
	for code := range referenced {
		if _, ok := existing[code]; ok {
			continue
		}
		if _, ok := declared[code]; ok {
			continue
		}
		missing = append(missing, code)
	}
	sort.Strings(missing)
	return missing, nil
}

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

func setOptionalNumber(record *core.Record, field string, value *float64) {
	if value != nil {
		record.Set(field, *value)
	}
}

type optionalImportNumber struct {
	field string
	value *float64
}

func hasMatchingSecurityImportRecord(app core.App, collectionName string, filter string, params map[string]any, label string, fields []optionalImportNumber) bool {
	candidates, err := app.FindRecordsByFilter(collectionName, filter, "", 0, 0, params)
	if err != nil {
		logEvent("import", fmt.Sprintf("failed to find duplicate %s records", collectionName), err)
		return false
	}

	for _, candidate := range candidates {
		if label != "" {
			candidateLabel := normalizeDescription(candidate.GetString("name"))
			if candidateLabel == "" {
				candidateLabel = normalizeDescription(candidate.GetString("description"))
			}
			if candidateLabel != label {
				continue
			}
		}
		matchesNumbers := true
		for _, field := range fields {
			if field.value == nil {
				continue
			}
			value, ok, err := optionalJSONNumber(candidate, field.field)
			if err != nil || !ok || value != *field.value {
				matchesNumbers = false
				break
			}
		}
		if matchesNumbers {
			return true
		}
	}
	return false
}

func acctIndexKey(name, institution, balanceGroup string) string {
	return name + "|" + institution + "|" + balanceGroup
}

// resolveImportAccount maps a row's account reference to an owned account id deterministically.
// Resolution order: a provided accountId is loaded and accepted only when it belongs to ownerID; an
// exact name|institution|balanceGroup tuple is matched against acctIndex then the database; a bare
// accountName succeeds only when it resolves to exactly one owned account. A foreign/missing id or
// an ambiguous name is returned as an error so the caller records it as a row-level failure.
func resolveImportAccount(app core.App, ownerID string, acctIndex map[string]string, accountID, accountName, institution, balanceGroup string) (string, error) {
	if id := strings.TrimSpace(accountID); id != "" {
		account, err := app.FindRecordById("accounts", id)
		if err != nil {
			return "", errors.New("provided accountId not found")
		}
		if account.GetString("owner") != ownerID {
			return "", errors.New("provided accountId is not owned by the importing user")
		}
		return account.Id, nil
	}

	if institution != "" || balanceGroup != "" {
		key := acctIndexKey(accountName, institution, balanceGroup)
		if id, ok := acctIndex[key]; ok {
			return id, nil
		}
		found, err := app.FindFirstRecordByFilter("accounts",
			"name = {:name} && institution = {:institution} && balanceGroup = {:balanceGroup} && owner = {:owner}",
			map[string]any{"name": accountName, "institution": institution, "balanceGroup": balanceGroup, "owner": ownerID},
		)
		if err != nil {
			return "", errors.New("no account matches the provided name, institution and balance group")
		}
		acctIndex[key] = found.Id
		return found.Id, nil
	}

	matchIDs := map[string]struct{}{}
	for key, id := range acctIndex {
		if name, _, found := strings.Cut(key, "|"); found && name == accountName {
			matchIDs[id] = struct{}{}
		}
	}
	dbMatches, err := app.FindRecordsByFilter("accounts",
		"name = {:name} && owner = {:owner}",
		"", 0, 0,
		map[string]any{"name": accountName, "owner": ownerID},
	)
	if err != nil {
		return "", err
	}
	for _, match := range dbMatches {
		matchIDs[match.Id] = struct{}{}
	}

	switch len(matchIDs) {
	case 0:
		return "", errors.New("no account matches the provided name")
	case 1:
		for id := range matchIDs {
			return id, nil
		}
	}
	return "", fmt.Errorf("provided account name is ambiguous; %d owned accounts match", len(matchIDs))
}

// NOTE: counts is the single place securities are tallied for the import summary, so that
// securities referenced by balances/transactions are counted the same as explicitly-listed
// ones. A securityCache hit means the security was already tallied on a prior reference, so it
// is not counted again.
func findOrCreateImportSecurity(app core.App, ownerID string, securityCache map[string]string, securityID string, name string, symbol string, currency string, sessionID string, counts *importCounts) (string, error) {
	symbol = normalizeSecuritySymbol(symbol)
	key := strings.TrimSpace(securityID)
	if key == "" {
		key = symbol
		if key == "" {
			key = securityNameKey(name)
		}
	}
	key += "::" + ownerID

	if id, ok := securityCache[key]; ok {
		return id, nil
	}

	if id := strings.TrimSpace(securityID); id != "" {
		securityCache[key] = id
		counts.Existing++
		return id, nil
	}

	securityFilter := "normalizedName = {:normalizedName} && owner = {:owner}"
	securityParams := map[string]any{"normalizedName": securityNameKey(name), "owner": ownerID}
	if symbol != "" {
		securityFilter = "(symbol = {:symbol} || normalizedName = {:normalizedName}) && owner = {:owner}"
		securityParams = map[string]any{"symbol": symbol, "normalizedName": securityNameKey(name), "owner": ownerID}
	}

	rec, created, err := findOrCreate(app, "securities", securityFilter, securityParams, map[string]any{
		"name":          name,
		"symbol":        symbol,
		"currency":      currency,
		"owner":         ownerID,
		"importSession": sessionID,
	})
	if err != nil {
		return "", err
	}

	securityCache[key] = rec.Id
	if created {
		counts.Created++
	} else {
		counts.Existing++
	}
	return rec.Id, nil
}

// logImportError records an operational diagnostic for a failed import row. It deliberately logs
// only non-sensitive context — session id, collection, row index, operation, and the error — so
// server logs never carry user-supplied finance metadata (account/balance-type/security names,
// symbols, transaction labels, descriptions, or notes). Callers must keep raw metadata out of both
// the format arguments and the error they pass: the resolver and the per-collection loops construct
// errors that name only operational identifiers (record ids, dates) or generic failure classes.
func logImportError(sessionID, collection string, rowIndex int, operation string, err error) {
	logEvent("import", fmt.Sprintf("session=%s collection=%s row=%d op=%s", sessionID, collection, rowIndex, operation), err)
}

func handleImport(app core.App, re *core.RequestEvent) error {
	info, _ := re.RequestInfo()
	auth := info.Auth

	re.Request.Body = http.MaxBytesReader(re.Response, re.Request.Body, maxImportBodyBytes)

	var payload importPayload
	if err := json.NewDecoder(re.Request.Body).Decode(&payload); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			return re.JSON(http.StatusRequestEntityTooLarge, map[string]string{"error": fmt.Sprintf("Request body exceeds %d bytes", maxImportBodyBytes)})
		}
		return re.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid JSON body"})
	}

	if validationErrors := validateImportPayload(payload); len(validationErrors) > 0 {
		return re.JSON(http.StatusBadRequest, map[string]any{"error": "Invalid import payload", "errors": validationErrors})
	}

	ownerID := auth.Id
	missingCurrencies, err := validateImportCurrencyReferences(app, ownerID, payload)
	if err != nil {
		return re.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to validate currencies"})
	}
	if len(missingCurrencies) > 0 {
		return re.JSON(http.StatusBadRequest, map[string]any{
			"error":             "Missing currencies",
			"missingCurrencies": missingCurrencies,
		})
	}

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
	session.Set("recordsFailed", 0)
	session.Set("status", importStatusPending)
	if err := app.Save(session); err != nil {
		return re.JSON(http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("Failed to create import session: %v", err)})
	}
	result.SessionID = session.Id

	btCache := map[string]string{}
	lblCache := map[string]string{}
	securityCache := map[string]string{}
	acctIndex := map[string]string{}

	// errorCount tracks rows that failed to write because of an error (a failed lookup, a failed
	// account resolution, or a failed save) as opposed to duplicate rows that were intentionally
	// skipped. It drives the final session status so a partial import is never indistinguishable
	// from a clean one. Per-row detail lives in the [import] operational logs.
	errorCount := 0

	for i, currency := range payload.Currencies {
		code := strings.TrimSpace(currency.Code)
		_, created, err := ensureCurrencyRecord(app, ownerID, code, strings.TrimSpace(currency.Name), currency.AutoUpdate)
		if err != nil {
			logImportError(session.Id, "currencies", i, "findOrCreate", err)
			errorCount++
			continue
		}
		if created {
			result.Currencies.Created++
		} else {
			result.Currencies.Existing++
		}

		for j, quote := range currency.Quotes {
			start, end := pbDateRange(quote.Date)
			_, findErr := app.FindFirstRecordByFilter("exchangeRates",
				"owner = {:owner} && currency = {:currency} && date >= {:start} && date < {:end}",
				map[string]any{"owner": ownerID, "currency": code, "start": start, "end": end},
			)
			if findErr == nil {
				result.ExchangeRates.Existing++
				continue
			}
			if !errors.Is(findErr, sql.ErrNoRows) {
				logImportError(session.Id, "exchangeRates", j, "find", findErr)
				errorCount++
				continue
			}

			ratesColl, err := app.FindCollectionByNameOrId("exchangeRates")
			if err != nil {
				logImportError(session.Id, "exchangeRates", j, "findCollection", err)
				errorCount++
				continue
			}
			rec := core.NewRecord(ratesColl)
			rec.Set("owner", ownerID)
			rec.Set("currency", code)
			rec.Set("date", start)
			rec.Set("rate", quote.Rate)
			rec.Set("source", "manual")
			if err := app.Save(rec); err == nil {
				result.ExchangeRates.Created++
			} else {
				logImportError(session.Id, "exchangeRates", j, "save", err)
				errorCount++
			}
		}
	}

	for i, acct := range payload.Accounts {
		institution := acct.Institution

		btKey := acct.BalanceType + "::" + ownerID
		btID, err := cachedFindOrCreate(btCache, btKey, app,
			"balanceTypes", "name = {:name} && owner = {:owner}",
			map[string]any{"name": acct.BalanceType, "owner": ownerID},
			map[string]any{"name": acct.BalanceType, "owner": ownerID},
		)
		if err != nil {
			logImportError(session.Id, "balanceTypes", i, "findOrCreate", err)
			errorCount++
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
			"currency":       acct.Currency,
			"autoCalculated": boolToTimestamp(acct.AutoCalculated),
			"closed":         boolToTimestamp(acct.Closed),
			"excluded":       boolToTimestamp(acct.Excluded),
			"owner":          ownerID,
			"importSession":  session.Id,
		})
		if err != nil {
			logImportError(session.Id, "accounts", i, "findOrCreate", err)
			errorCount++
			continue
		}

		acctIndex[acctIndexKey(acct.Name, institution, acct.BalanceGroup)] = rec.Id

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
				ab.Set("source", "import")
				if err := app.Save(ab); err == nil {
					result.AccountBalances.Created++
				} else {
					logImportError(session.Id, "accountBalances", i, "save", err)
					errorCount++
				}
			} else {
				result.AccountBalances.Skipped++
			}
		}
	}

	for i, asset := range payload.Assets {
		btKey := asset.BalanceType + "::" + ownerID
		btID, err := cachedFindOrCreate(btCache, btKey, app,
			"balanceTypes", "name = {:name} && owner = {:owner}",
			map[string]any{"name": asset.BalanceType, "owner": ownerID},
			map[string]any{"name": asset.BalanceType, "owner": ownerID},
		)
		if err != nil {
			logImportError(session.Id, "balanceTypes", i, "findOrCreate", err)
			errorCount++
			continue
		}

		assetFilter := "name = {:name} && owner = {:owner}"
		assetParams := map[string]any{"name": asset.Name, "owner": ownerID}

		rec, created, err := findOrCreate(app, "assets", assetFilter, assetParams, map[string]any{
			"name":          asset.Name,
			"balanceGroup":  asset.BalanceGroup,
			"balanceType":   btID,
			"currency":      asset.Currency,
			"sold":          boolToTimestamp(asset.Sold),
			"excluded":      boolToTimestamp(asset.Excluded),
			"owner":         ownerID,
			"importSession": session.Id,
		})
		if err != nil {
			logImportError(session.Id, "assets", i, "findOrCreate", err)
			errorCount++
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
				asb.Set("asOf", asset.Balance.AsOf)
				asb.Set("owner", ownerID)
				asb.Set("importSession", session.Id)
				if err := app.Save(asb); err == nil {
					result.AssetBalances.Created++
				} else {
					logImportError(session.Id, "assetBalances", i, "save", err)
					errorCount++
				}
			} else {
				result.AssetBalances.Skipped++
			}
		}
	}

	for i, security := range payload.Securities {
		if _, err := findOrCreateImportSecurity(app, ownerID, securityCache, "", security.Name, security.Symbol, security.Currency, session.Id, &result.Securities); err != nil {
			logImportError(session.Id, "securities", i, "findOrCreate", err)
			errorCount++
			continue
		}
	}

	accountsWithImportedTransactions := map[string]struct{}{}

	for i, tx := range payload.Transactions {
		accountID, err := resolveImportAccount(app, ownerID, acctIndex, tx.AccountID, tx.AccountName, tx.Institution, tx.BalanceGroup)
		if err != nil {
			logImportError(session.Id, "transactions", i, "resolveAccount", err)
			errorCount++
			continue
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
			} else {
				logImportError(session.Id, "transactionLabels", i, "findOrCreate", err)
				errorCount++
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
			accountsWithImportedTransactions[accountID] = struct{}{}
		} else {
			logImportError(session.Id, "transactions", i, "save", err)
			errorCount++
		}
	}

	for accountID := range accountsWithImportedTransactions {
		// NOTE: serialize with the async balance worker so a concurrent edit on the same account
		// can't overlap this inline snapshot and clobber it with a stale value.
		if err := withAccountCalcLock(accountID, func() error {
			return recomputeDerivedBalance(app, accountID, session.Id)
		}); err != nil {
			logEvent("import", fmt.Sprintf("failed to recompute derived balance for account %s (session=%s)", accountID, session.Id), err)
			errorCount++
		}
	}

	for i, balance := range payload.SecurityBalances {
		accountID, err := resolveImportAccount(app, ownerID, acctIndex, balance.AccountID, balance.AccountName, "", "")
		if err != nil {
			logImportError(session.Id, "securityBalances", i, "resolveAccount", err)
			errorCount++
			continue
		}
		securityID, err := findOrCreateImportSecurity(app, ownerID, securityCache, balance.SecurityID, balance.SecurityName, balance.SecuritySymbol, "", session.Id, &result.Securities)
		if err != nil {
			logImportError(session.Id, "securityBalances", i, "findOrCreateSecurity", err)
			errorCount++
			continue
		}

		if hasMatchingSecurityImportRecord(app, "securityBalances",
			"account = {:account} && security = {:security} && asOf = {:asOf} && owner = {:owner}",
			map[string]any{
				"account":  accountID,
				"security": securityID,
				"asOf":     datePart(balance.AsOf) + " 00:00:00.000Z",
				"owner":    ownerID,
			},
			"",
			[]optionalImportNumber{
				{field: "quantity", value: balance.Quantity},
				{field: "price", value: balance.Price},
				{field: "value", value: balance.Value},
				{field: "costBasis", value: balance.CostBasis},
			},
		) {
			result.SecurityBalances.Skipped++
			continue
		}

		coll, _ := app.FindCollectionByNameOrId("securityBalances")
		rec := core.NewRecord(coll)
		rec.Set("account", accountID)
		rec.Set("security", securityID)
		rec.Set("asOf", balance.AsOf)
		rec.Set("owner", ownerID)
		rec.Set("importSession", session.Id)
		setOptionalNumber(rec, "quantity", balance.Quantity)
		setOptionalNumber(rec, "price", balance.Price)
		setOptionalNumber(rec, "value", balance.Value)
		setOptionalNumber(rec, "costBasis", balance.CostBasis)
		if err := app.Save(rec); err == nil {
			result.SecurityBalances.Created++
		} else {
			logImportError(session.Id, "securityBalances", i, "save", err)
			errorCount++
		}
	}

	for i, tx := range payload.SecurityTransactions {
		accountID, err := resolveImportAccount(app, ownerID, acctIndex, tx.AccountID, tx.AccountName, "", "")
		if err != nil {
			logImportError(session.Id, "securityTransactions", i, "resolveAccount", err)
			errorCount++
			continue
		}
		securityID, err := findOrCreateImportSecurity(app, ownerID, securityCache, tx.SecurityID, tx.SecurityName, tx.SecuritySymbol, "", session.Id, &result.Securities)
		if err != nil {
			logImportError(session.Id, "securityTransactions", i, "findOrCreateSecurity", err)
			errorCount++
			continue
		}

		txLabel := normalizeDescription(tx.Description)
		if strings.TrimSpace(tx.Name) != "" {
			txLabel = normalizeDescription(tx.Name)
		}
		if hasMatchingSecurityImportRecord(app, "securityTransactions",
			"account = {:account} && security = {:security} && date = {:date} && type = {:type} && owner = {:owner}",
			map[string]any{
				"account":  accountID,
				"security": securityID,
				"date":     datePart(tx.Date) + " 00:00:00.000Z",
				"type":     tx.Type,
				"owner":    ownerID,
			},
			txLabel,
			[]optionalImportNumber{
				{field: "quantity", value: tx.Quantity},
				{field: "price", value: tx.Price},
				{field: "amount", value: tx.Amount},
				{field: "fees", value: tx.Fees},
			},
		) {
			result.SecurityTransactions.Skipped++
			continue
		}

		coll, _ := app.FindCollectionByNameOrId("securityTransactions")
		rec := core.NewRecord(coll)
		rec.Set("account", accountID)
		rec.Set("security", securityID)
		rec.Set("date", tx.Date)
		rec.Set("type", tx.Type)
		rec.Set("subtype", tx.Subtype)
		rec.Set("name", tx.Name)
		rec.Set("description", tx.Description)
		rec.Set("notes", tx.Notes)
		rec.Set("owner", ownerID)
		rec.Set("importSession", session.Id)
		setOptionalNumber(rec, "quantity", tx.Quantity)
		setOptionalNumber(rec, "price", tx.Price)
		setOptionalNumber(rec, "amount", tx.Amount)
		setOptionalNumber(rec, "fees", tx.Fees)
		if err := app.Save(rec); err == nil {
			result.SecurityTransactions.Created++
		} else {
			logImportError(session.Id, "securityTransactions", i, "save", err)
			errorCount++
		}
	}

	totalCreated := result.Currencies.Created + result.ExchangeRates.Created +
		result.Accounts.Created + result.Assets.Created + result.Transactions.Created +
		result.Securities.Created + result.AccountBalances.Created + result.AssetBalances.Created +
		result.SecurityBalances.Created + result.SecurityTransactions.Created
	totalSkipped := result.Currencies.Existing + result.ExchangeRates.Existing +
		result.Accounts.Existing + result.Assets.Existing + result.Transactions.Skipped +
		result.Securities.Existing + result.AccountBalances.Skipped +
		result.AssetBalances.Skipped + result.SecurityBalances.Skipped + result.SecurityTransactions.Skipped

	status := importStatusCompleted
	if errorCount > 0 {
		if totalCreated > 0 {
			status = importStatusCompletedWithErrors
		} else {
			status = importStatusFailed
		}
	}
	result.Status = status
	result.RecordsFailed = errorCount

	session.Set("status", status)
	session.Set("recordsCreated", totalCreated)
	session.Set("recordsSkipped", totalSkipped)
	session.Set("recordsFailed", errorCount)
	if err := app.Save(session); err != nil {
		logEvent("import", fmt.Sprintf("failed to save importSessions record (session=%s)", session.Id), err)
	}

	return re.JSON(http.StatusOK, result)
}

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

	revertingSessions.Store(body.SessionID, struct{}{})
	defer revertingSessions.Delete(body.SessionID)

	collections := []string{"transactions", "securityTransactions", "accountBalances", "assetBalances", "securityBalances", "accounts", "assets", "securities"}
	totalDeleted := 0

	// NOTE: accounts re-dirtied during the inline revert recompute; their follow-up is deferred until
	// after commit so the worker recomputes against committed state, not the transaction's uncommitted
	// rows.
	var reenqueueAfterCommit []string

	err = app.RunInTransaction(func(txApp core.App) error {
		affectedAccounts := map[string]struct{}{}
		importedTransactions, err := txApp.FindRecordsByFilter("transactions",
			"importSession = {:sid} && owner = {:owner}",
			"", 0, 0,
			map[string]any{"sid": body.SessionID, "owner": auth.Id},
		)
		if err != nil {
			return err
		}
		for _, tx := range importedTransactions {
			accountID := tx.GetString("account")
			if accountID == "" {
				continue
			}
			account, err := txApp.FindRecordById("accounts", accountID)
			if err != nil || account.GetString("importSession") == body.SessionID {
				continue
			}
			if account.GetDateTime("autoCalculated").IsZero() {
				continue
			}
			affectedAccounts[accountID] = struct{}{}
		}

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

		for accountID := range affectedAccounts {
			// NOTE: serialize with the async balance worker so a concurrent edit can't overlap this
			// revert recompute and clobber it with a stale value.
			wentDirty, err := withAccountCalcLockReportDirty(accountID, func() error {
				return recomputeDerivedBalance(txApp, accountID, "")
			})
			if err != nil {
				return err
			}
			if wentDirty {
				reenqueueAfterCommit = append(reenqueueAfterCommit, accountID)
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
		session.Set("recordsFailed", 0)
		return txApp.Save(session)
	})

	if err != nil {
		return re.JSON(http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("Revert failed: %v", err)})
	}

	for _, accountID := range reenqueueAfterCommit {
		enqueueBalance(accountID)
	}

	return re.JSON(http.StatusOK, map[string]any{"sessionId": body.SessionID, "deleted": totalDeleted})
}
