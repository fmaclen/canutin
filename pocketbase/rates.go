package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

const fxDebounceMs = 250
const fxTickerMs = 50

// NOTE: rate fetches run one at a time. Serial fetching keeps us polite to the free upstream API,
// matches the spec's sequential-fetch requirement, and prevents two ensures from racing to save the
// same (currency, date) row past the unique index.
const maxConcurrentRateEnsures = 1

const (
	currencyAutoUpdateRequestFailed   = "currency_auto_update_request_failed"
	currencyAutoUpdateCodeUnavailable = "currency_auto_update_code_unavailable"
)

var (
	errFXRequestFailed   = errors.New("exchange-rate request failed")
	errFXCodeUnavailable = errors.New("currency is absent from exchange-rate dataset")
)

// rateEntity identifies a currency-bearing container (accounts, assets, securities) whose records
// need exchange rates. Transactions and balances enqueue their parent container.
type rateEntity struct {
	collection string
	id         string
}

// NOTE: mirror of balance.go's worker state — one mutex guards the debounce/in-flight/dirty maps so a
// burst of writes coalesces into a single ensure pass per entity and only one runs at a time.
var (
	fxPendingMu sync.Mutex
	fxPending   = make(map[rateEntity]time.Time)
	fxInFlight  = make(map[rateEntity]bool)
	fxDirty     = make(map[rateEntity]time.Time)
	fxSem       = make(chan struct{}, maxConcurrentRateEnsures)

	fxHTTPClient = &http.Client{Timeout: 20 * time.Second}
)

func fxFetchDisabled() bool {
	return os.Getenv("FX_FETCH_DISABLED") == "true"
}

func enqueueRates(entity rateEntity) {
	fxPendingMu.Lock()
	defer fxPendingMu.Unlock()
	fxPending[entity] = time.Now()
}

func enqueueRatesForContainer(app core.App, record *core.Record) {
	if fxFetchDisabled() {
		return
	}
	currency := record.GetString("currency")
	if currency == "" || currency == "USD" {
		return
	}
	if !currencyHasAutoUpdate(app, currency) {
		return
	}
	enqueueRates(rateEntity{collection: record.Collection().Name, id: record.Id})
}

func enqueueRatesForChild(app core.App, record *core.Record) {
	if fxFetchDisabled() {
		return
	}

	var parentCollection, linkField string
	switch record.Collection().Name {
	case "transactions", "accountBalances":
		parentCollection, linkField = "accounts", "account"
	case "assetBalances":
		parentCollection, linkField = "assets", "asset"
	case "securityBalances", "securityTransactions":
		parentCollection, linkField = "securities", "security"
	default:
		return
	}

	parentID := record.GetString(linkField)
	if parentID == "" {
		return
	}

	parent, err := app.FindRecordById(parentCollection, parentID)
	if err != nil {
		// NOTE: a missing or unreadable parent means there is nothing to convert yet; the next write
		// to the container or the daily cron re-triggers the ensure pass.
		return
	}
	currency := parent.GetString("currency")
	if currency == "" || currency == "USD" {
		return
	}
	if !currencyHasAutoUpdate(app, currency) {
		return
	}
	enqueueRates(rateEntity{collection: parentCollection, id: parentID})
}

func fxWorker(ctx context.Context, app core.App) {
	ticker := time.NewTicker(fxTickerMs * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			fxPendingMu.Lock()
			now := time.Now()
			for entity, queuedAt := range fxPending {
				if now.Sub(queuedAt) < fxDebounceMs*time.Millisecond {
					continue
				}
				delete(fxPending, entity)
				if fxInFlight[entity] {
					fxDirty[entity] = now
					continue
				}
				fxInFlight[entity] = true
				go fxRunEnsure(app, entity)
			}
			fxPendingMu.Unlock()
		}
	}
}

func fxRunEnsure(app core.App, entity rateEntity) {
	// NOTE: release the in-flight slot even if the ensure panics, so one bad pass can't permanently
	// strand the entity and block every future ensure for it.
	defer fxReleaseInFlight(entity)
	for {
		if fxBoundedEnsure(app, entity) {
			return
		}
	}
}

func fxBoundedEnsure(app core.App, entity rateEntity) bool {
	fxSem <- struct{}{}
	defer func() { <-fxSem }()
	if err := ensureRatesForEntity(app, entity); err != nil {
		logEvent("rates", fmt.Sprintf("failed to ensure rates for %s %s", entity.collection, entity.id), err)
	}

	fxPendingMu.Lock()
	defer fxPendingMu.Unlock()
	if _, ok := fxDirty[entity]; ok {
		delete(fxDirty, entity)
		return false
	}
	return true
}

func fxReleaseInFlight(entity rateEntity) {
	fxPendingMu.Lock()
	defer fxPendingMu.Unlock()
	delete(fxInFlight, entity)
}

func ensureRatesForEntity(app core.App, entity rateEntity) error {
	container, err := app.FindRecordById(entity.collection, entity.id)
	if err != nil {
		// NOTE: a container deleted before its debounced ensure runs (e.g. an import-created account
		// removed during revert) has nothing to convert, so a missing record is a quiet no-op.
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return fmt.Errorf("find %s: %w", entity.collection, err)
	}

	currency := container.GetString("currency")
	if currency == "" || currency == "USD" || !currencyHasAutoUpdate(app, currency) {
		return nil
	}

	today := time.Now().UTC().Format("2006-01-02")
	dates := map[string]struct{}{
		today: {},
	}

	type childSource struct {
		collection string
		linkField  string
		dateField  string
	}
	var childSources []childSource
	switch entity.collection {
	case "accounts":
		childSources = []childSource{
			{"transactions", "account", "date"},
			{"accountBalances", "account", "asOf"},
		}
	case "assets":
		childSources = []childSource{
			{"assetBalances", "asset", "asOf"},
		}
	case "securities":
		childSources = []childSource{
			{"securityBalances", "security", "asOf"},
			{"securityTransactions", "security", "date"},
		}
	}

	for _, src := range childSources {
		records, err := app.FindRecordsByFilter(src.collection, src.linkField+" = {:id}", "", 0, 0, map[string]any{"id": entity.id})
		if err != nil {
			return fmt.Errorf("fetch %s: %w", src.collection, err)
		}
		for _, rec := range records {
			when := rec.GetDateTime(src.dateField)
			if when.IsZero() {
				continue
			}
			date := when.Time().UTC().Format("2006-01-02")
			if date > today {
				continue
			}
			dates[date] = struct{}{}
		}
	}

	for date := range dates {
		if err := ensureRate(app, currency, date, false); err != nil {
			logEvent("rates", fmt.Sprintf("skipped %s rate for %s", currency, date), err)
		}
	}
	return nil
}

func ensureCurrencyRecord(app core.App, ownerID, code, name string, autoUpdate bool) (*core.Record, bool, error) {
	existing, err := app.FindFirstRecordByFilter("currencies",
		"owner = {:owner} && code = {:code}",
		map[string]any{"owner": ownerID, "code": code},
	)
	if err == nil {
		return existing, false, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, false, err
	}

	collection, err := app.FindCollectionByNameOrId("currencies")
	if err != nil {
		return nil, false, err
	}
	record := core.NewRecord(collection)
	record.Set("owner", ownerID)
	record.Set("code", code)
	record.Set("name", name)
	record.Set("autoUpdate", autoUpdate)
	if err := app.Save(record); err != nil {
		return nil, false, err
	}
	return record, true, nil
}

func currencyHasAutoUpdate(app core.App, currency string) bool {
	if currency == "" || currency == "USD" {
		return false
	}
	_, err := app.FindFirstRecordByFilter("currencies",
		"code = {:currency} && autoUpdate = true",
		map[string]any{"currency": currency},
	)
	return err == nil
}

func autoUpdatedCurrencyCodes(app core.App) ([]string, error) {
	records, err := app.FindRecordsByFilter("currencies",
		"code != 'USD' && code != '' && autoUpdate = true",
		"", 0, 0,
	)
	if err != nil {
		return nil, err
	}
	seen := map[string]struct{}{}
	for _, rec := range records {
		code := rec.GetString("code")
		if code == "" || code == "USD" {
			continue
		}
		seen[code] = struct{}{}
	}
	codes := make([]string, 0, len(seen))
	for code := range seen {
		codes = append(codes, code)
	}
	sort.Strings(codes)
	return codes, nil
}

// ensureRate stores the (currency, date) rate — units of currency per 1 USD. USD is the pivot and is
// never written. When refresh is false the pair is skipped if already stored; when true the global
// row is re-fetched and overwritten — the daily cron uses this to correct today's rate once the
// upstream "latest" value is published, which an early same-day trigger may have missed. A fetch
// failure is returned for the caller to log; the pair is simply retried on the next trigger.
func ensureRate(app core.App, currency, date string, refresh bool) error {
	if currency == "" || currency == "USD" {
		return nil
	}

	start, end := pbDateRange(date)
	existing, err := app.FindFirstRecordByFilter("exchangeRates",
		"owner = '' && currency = {:currency} && date >= {:start} && date < {:end}",
		map[string]any{"currency": currency, "start": start, "end": end},
	)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("look up existing rate: %w", err)
	}
	if existing != nil && !refresh {
		return nil
	}

	rate, err := fetchUSDRate(currency, date)
	if err != nil {
		return fmt.Errorf("fetch rate: %w", err)
	}

	record := existing
	if record == nil {
		collection, err := app.FindCollectionByNameOrId("exchangeRates")
		if err != nil {
			return fmt.Errorf("find exchangeRates collection: %w", err)
		}
		record = core.NewRecord(collection)
	}
	record.Set("owner", "")
	record.Set("currency", currency)
	record.Set("date", start)
	record.Set("rate", rate)
	record.Set("source", "fetched")
	if err := app.Save(record); err != nil {
		return fmt.Errorf("save rate: %w", err)
	}
	return nil
}

func fetchUSDRate(currency, date string) (float64, error) {
	tag := date
	if date == time.Now().UTC().Format("2006-01-02") {
		tag = "latest"
	}
	code := strings.ToLower(currency)
	urls := []string{
		fmt.Sprintf("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@%s/v1/currencies/usd.min.json", tag),
		fmt.Sprintf("https://%s.currency-api.pages.dev/v1/currencies/usd.min.json", tag),
	}

	var fetchErr error
	for _, url := range urls {
		resp, err := fxHTTPClient.Get(url)
		if err != nil {
			fetchErr = fmt.Errorf("%w: %v", errFXRequestFailed, err)
			continue
		}
		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			fetchErr = fmt.Errorf("%w: status %d for %s on %s", errFXRequestFailed, resp.StatusCode, currency, date)
			continue
		}
		var payload struct {
			Usd map[string]float64 `json:"usd"`
		}
		err = json.NewDecoder(resp.Body).Decode(&payload)
		resp.Body.Close()
		if err != nil {
			fetchErr = fmt.Errorf("%w: %v", errFXRequestFailed, err)
			continue
		}
		value, ok := payload.Usd[code]
		if !ok || value <= 0 || math.IsNaN(value) || math.IsInf(value, 0) {
			return 0, fmt.Errorf("%w: no %s rate for %s", errFXCodeUnavailable, currency, date)
		}
		return value, nil
	}
	if fetchErr == nil {
		fetchErr = errFXRequestFailed
	}
	return 0, fetchErr
}

func refreshTodayRates(app core.App) error {
	if fxFetchDisabled() {
		return nil
	}
	today := time.Now().UTC().Format("2006-01-02")
	codes, err := autoUpdatedCurrencyCodes(app)
	if err != nil {
		return fmt.Errorf("fetch auto-updated currencies: %w", err)
	}
	for _, currency := range codes {
		if err := ensureRate(app, currency, today, true); err != nil {
			logEvent("rates", fmt.Sprintf("skipped %s refresh for %s", currency, today), err)
		}
	}
	return nil
}

func registerRates(app core.App) {
	app.Cron().MustAdd("ratesRefresh", "0 5 * * *", func() {
		if err := refreshTodayRates(app); err != nil {
			logEvent("rates", "scheduled refresh failed", err)
		}
	})
}
