package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"math/rand/v2"
	"net/http"
	"os"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

// appVersion is stamped by release builds with -ldflags "-X main.appVersion=<version>". Local and CI
// builds keep "dev", which never pings the default endpoint.
var appVersion = "dev"

const (
	defaultTelemetryURL = "https://telemetry.canutin.com/ping"
	telemetryDocsURL    = "https://github.com/fmaclen/canutin/blob/master/docs/telemetry.md"
)

var (
	telemetryHTTPClient  = &http.Client{Timeout: 10 * time.Second}
	telemetryRetryDelays = []time.Duration{time.Minute, 10 * time.Minute, time.Hour}
)

// telemetryPayload is schema v1 of the daily ping. The worker under telemetry/ validates the same
// contract, and docs/telemetry.md documents it; all three change together. Every value is a coarse
// bucket or a boolean so no install-specific data can leave the server.
type telemetryPayload struct {
	Schema           int    `json:"schema"`
	Version          string `json:"version"`
	Users            string `json:"users"`
	Accounts         string `json:"accounts"`
	Assets           string `json:"assets"`
	Transactions     string `json:"transactions"`
	Securities       string `json:"securities"`
	PlaidConnections string `json:"plaidConnections"`
	Currencies       string `json:"currencies"`
	HistoryYears     string `json:"historyYears"`
	PlaidConfigured  bool   `json:"plaidConfigured"`
	ImportAPIUsed    bool   `json:"importApiUsed"`
	AutoUpdateRates  bool   `json:"autoUpdateRates"`
	AccountSharing   bool   `json:"accountSharing"`
	AssetSharing     bool   `json:"assetSharing"`
	InverseSharing   bool   `json:"inverseSharing"`
	Labels           bool   `json:"labels"`
	AutoCalculated   bool   `json:"autoCalculatedBalances"`
	ManualEntry      bool   `json:"manualTransactions"`
	ImportReverted   bool   `json:"importReverted"`
	PlaidErrors      bool   `json:"plaidErrors"`
}

type countBucket struct {
	upTo  int64 // inclusive upper bound
	label string
}

var (
	userBuckets        = []countBucket{{1, "1"}, {5, "2-5"}, {math.MaxInt64, "6+"}}
	recordBuckets      = []countBucket{{0, "0"}, {5, "1-5"}, {20, "6-20"}, {50, "21-50"}, {math.MaxInt64, "51+"}}
	transactionBuckets = []countBucket{{0, "0"}, {999, "<1k"}, {9_999, "1k-10k"}, {99_999, "10k-100k"}, {math.MaxInt64, "100k+"}}
	smallBuckets       = []countBucket{{0, "0"}, {1, "1"}, {5, "2-5"}, {math.MaxInt64, "6+"}}
)

func bucketCount(n int64, buckets []countBucket) string {
	for _, bucket := range buckets {
		if n <= bucket.upTo {
			return bucket.label
		}
	}
	return buckets[len(buckets)-1].label
}

func historyYearsBucket(oldest, now time.Time) string {
	switch {
	case oldest.IsZero():
		return "0"
	case oldest.After(now.AddDate(-1, 0, 0)):
		return "<1"
	case oldest.After(now.AddDate(-3, 0, 0)):
		return "1-3"
	case oldest.After(now.AddDate(-10, 0, 0)):
		return "3-10"
	default:
		return "10+"
	}
}

func telemetryEnvDisabled() bool {
	return os.Getenv("TELEMETRY_DISABLED") == "true"
}

// telemetryEndpoint returns where pings go, or "" when this process never sends them. Builds without
// a stamped version (local dev, CI) only ping an explicit TELEMETRY_URL, which tests point at a mock.
func telemetryEndpoint() string {
	if telemetryEnvDisabled() || demoEnabled() {
		return ""
	}
	if url := os.Getenv("TELEMETRY_URL"); url != "" {
		return url
	}
	if appVersion == "dev" {
		return ""
	}
	return defaultTelemetryURL
}

// buildTelemetryPayload returns nil for an install with no users, which has nothing to report.
func buildTelemetryPayload(app core.App, now time.Time) (*telemetryPayload, error) {
	var countErr error
	count := func(collection string, exprs ...dbx.Expression) int64 {
		if countErr != nil {
			return 0
		}
		n, err := app.CountRecords(collection, exprs...)
		if err != nil {
			countErr = fmt.Errorf("count %s: %w", collection, err)
		}
		return n
	}

	users := count("users")
	if users == 0 {
		return nil, countErr
	}

	var currencyCodes int64
	if err := app.DB().Select("COUNT(DISTINCT code)").From("currencies").Row(&currencyCodes); err != nil {
		return nil, fmt.Errorf("count currency codes: %w", err)
	}

	var oldest time.Time
	oldestTransactions, err := app.FindRecordsByFilter("transactions", "date != ''", "date", 1, 0)
	if err != nil {
		return nil, fmt.Errorf("find oldest transaction: %w", err)
	}
	if len(oldestTransactions) > 0 {
		oldest = oldestTransactions[0].GetDateTime("date").Time()
	}

	_, plaidErr := plaidConfigFromEnv()
	importSince := now.UTC().AddDate(0, 0, -30).Format(types.DefaultDateLayout)

	payload := &telemetryPayload{
		Schema:           1,
		Version:          appVersion,
		Users:            bucketCount(users, userBuckets),
		Accounts:         bucketCount(count("accounts"), recordBuckets),
		Assets:           bucketCount(count("assets"), recordBuckets),
		Transactions:     bucketCount(count("transactions"), transactionBuckets),
		Securities:       bucketCount(count("securities"), smallBuckets),
		PlaidConnections: bucketCount(count("plaidConnections"), smallBuckets),
		Currencies:       bucketCount(currencyCodes, smallBuckets),
		HistoryYears:     historyYearsBucket(oldest, now),
		PlaidConfigured:  plaidErr == nil,
		ImportAPIUsed: count("importSessions",
			dbx.HashExp{"connection": ""},
			dbx.NewExp("created >= {:since}", dbx.Params{"since": importSince}),
		) > 0,
		AutoUpdateRates: count("currencies", dbx.HashExp{"autoUpdate": true}) > 0,
		AccountSharing:  count("accountShares") > 0,
		AssetSharing:    count("assetShares") > 0,
		InverseSharing: count("accountShares", dbx.HashExp{"perspective": "INVERSE"})+
			count("assetShares", dbx.HashExp{"perspective": "INVERSE"}) > 0,
		Labels:         count("transactionLabels") > 0,
		AutoCalculated: count("accounts", dbx.NewExp("autoCalculated != ''")) > 0,
		ManualEntry:    count("transactions", dbx.HashExp{"importSession": ""}) > 0,
		ImportReverted: count("importSessions", dbx.HashExp{"status": "rolled_back"}) > 0,
		PlaidErrors: count("plaidConnections",
			dbx.In("status", "error", "reauth_required"),
		) > 0,
	}
	if countErr != nil {
		return nil, countErr
	}
	return payload, nil
}

func sendTelemetry(app core.App, endpoint string) error {
	payload, err := buildTelemetryPayload(app, time.Now())
	if err != nil || payload == nil {
		return err
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encode payload: %w", err)
	}
	request, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("User-Agent", "Canutin/"+appVersion)
	response, err := telemetryHTTPClient.Do(request)
	if err != nil {
		return fmt.Errorf("send ping: %w", err)
	}
	response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("ping returned status %d", response.StatusCode)
	}
	return nil
}

func registerTelemetry(app core.App) {
	endpoint := telemetryEndpoint()
	if endpoint == "" {
		logEvent("telemetry", "anonymous usage stats are off for this server, see "+telemetryDocsURL, nil)
		return
	}
	logEvent("telemetry", fmt.Sprintf(
		"anonymous usage stats are on: once a day this server sends coarse counts and feature flags, never personal or financial data, to %s (details: %s). Turn it off with TELEMETRY_DISABLED=true",
		endpoint, telemetryDocsURL,
	), nil)

	// A random daily slot picked at startup keeps installs from pinging in the same minute.
	schedule := fmt.Sprintf("%d %d * * *", rand.IntN(60), rand.IntN(24))
	app.Cron().MustAdd("telemetryPing", schedule, func() {
		err := sendTelemetry(app, endpoint)
		for _, delay := range telemetryRetryDelays {
			if err == nil {
				return
			}
			time.Sleep(delay)
			err = sendTelemetry(app, endpoint)
		}
		if err != nil {
			logEvent("telemetry", "daily ping failed after retries", err)
		}
	})
}
