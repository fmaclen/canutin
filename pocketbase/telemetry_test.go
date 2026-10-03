package main

// The test suite for this repo is Playwright (e2e/). These Go tests exist because the e2e PocketBase
// runs in demo mode, which never sends telemetry, and Playwright cannot observe the Go server's
// outbound requests or vary its process environment. They cover the privacy contract of the daily
// ping: bucket boundaries, the exact payload keys, and every condition that stops a ping.

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/jsvm"
)

func TestBucketBoundaries(t *testing.T) {
	cases := []struct {
		buckets []countBucket
		n       int64
		want    string
	}{
		{userBuckets, 1, "1"},
		{userBuckets, 2, "2-5"},
		{userBuckets, 5, "2-5"},
		{userBuckets, 6, "6+"},
		{recordBuckets, 0, "0"},
		{recordBuckets, 1, "1-5"},
		{recordBuckets, 5, "1-5"},
		{recordBuckets, 6, "6-20"},
		{recordBuckets, 20, "6-20"},
		{recordBuckets, 21, "21-50"},
		{recordBuckets, 50, "21-50"},
		{recordBuckets, 51, "51+"},
		{transactionBuckets, 0, "0"},
		{transactionBuckets, 1, "<1k"},
		{transactionBuckets, 999, "<1k"},
		{transactionBuckets, 1_000, "1k-10k"},
		{transactionBuckets, 9_999, "1k-10k"},
		{transactionBuckets, 10_000, "10k-100k"},
		{transactionBuckets, 99_999, "10k-100k"},
		{transactionBuckets, 100_000, "100k+"},
		{smallBuckets, 0, "0"},
		{smallBuckets, 1, "1"},
		{smallBuckets, 2, "2-5"},
		{smallBuckets, 5, "2-5"},
		{smallBuckets, 6, "6+"},
	}
	for _, c := range cases {
		if got := bucketCount(c.n, c.buckets); got != c.want {
			t.Errorf("bucketCount(%d, %v) = %q, want %q", c.n, c.buckets, got, c.want)
		}
	}

	now := time.Date(2026, 6, 15, 12, 0, 0, 0, time.UTC)
	historyCases := []struct {
		oldest time.Time
		want   string
	}{
		{time.Time{}, "0"},
		{now, "<1"},
		{now.AddDate(-1, 0, 1), "<1"},
		{now.AddDate(-1, 0, 0), "1-3"},
		{now.AddDate(-3, 0, 1), "1-3"},
		{now.AddDate(-3, 0, 0), "3-10"},
		{now.AddDate(-10, 0, 1), "3-10"},
		{now.AddDate(-10, 0, 0), "10+"},
	}
	for _, c := range historyCases {
		if got := historyYearsBucket(c.oldest, now); got != c.want {
			t.Errorf("historyYearsBucket(%v) = %q, want %q", c.oldest, got, c.want)
		}
	}
}

func TestTelemetryEndpointOptOuts(t *testing.T) {
	originalVersion := appVersion
	defer func() { appVersion = originalVersion }()

	cases := []struct {
		name, version, disabled, demo, url, want string
	}{
		{"release build pings the default endpoint", "2.3.1", "", "", "", defaultTelemetryURL},
		{"unversioned build never pings the default endpoint", "dev", "", "", "", ""},
		{"unversioned build pings an explicit override", "dev", "", "", "http://127.0.0.1:1/ping", "http://127.0.0.1:1/ping"},
		{"env kill-switch wins over everything", "2.3.1", "true", "", "http://127.0.0.1:1/ping", ""},
		{"demo mode never pings", "2.3.1", "", "true", "http://127.0.0.1:1/ping", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			appVersion = c.version
			t.Setenv("TELEMETRY_DISABLED", c.disabled)
			t.Setenv("PUBLIC_DEMO_ENABLED", c.demo)
			t.Setenv("TELEMETRY_URL", c.url)
			if got := telemetryEndpoint(); got != c.want {
				t.Fatalf("telemetryEndpoint() = %q, want %q", got, c.want)
			}
		})
	}
}

func TestTelemetryPayloadFromInstall(t *testing.T) {
	// Step 1: a throwaway install with the real schema from pb_migrations.
	app := core.NewBaseApp(core.BaseAppConfig{DataDir: t.TempDir()})
	jsvm.MustRegister(app, jsvm.Config{MigrationsDir: "pb_migrations"})
	if err := app.Bootstrap(); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	defer app.ResetBootstrapState()
	if err := app.RunAllMigrations(); err != nil {
		t.Fatalf("migrations: %v", err)
	}
	save := func(collection string, fields map[string]any) *core.Record {
		target, err := app.FindCollectionByNameOrId(collection)
		if err != nil {
			t.Fatalf("find %s: %v", collection, err)
		}
		record := core.NewRecord(target)
		record.Load(fields)
		if err := app.SaveNoValidate(record); err != nil {
			t.Fatalf("save %s: %v", collection, err)
		}
		return record
	}
	now := time.Now()

	// Step 2: an install with no users has nothing to report.
	payload, err := buildTelemetryPayload(app, now)
	if err != nil || payload != nil {
		t.Fatalf("empty install payload = %+v, %v; want nil", payload, err)
	}

	// Step 3: a user with a recognizable account produces only the contract's keys, and none of
	// the user's own words.
	user := save("users", map[string]any{"email": "alice@example.com", "password": "123qweasdzxc"})
	save("currencies", map[string]any{"owner": user.Id, "code": "USD"})
	account := save("accounts", map[string]any{"owner": user.Id, "name": "Sentinel Savings", "currency": "USD"})
	save("transactions", map[string]any{
		"owner": user.Id, "account": account.Id, "description": "Sentinel Coffee",
		"value": 12.5, "date": now.AddDate(-2, 0, 0),
	})

	payload, err = buildTelemetryPayload(app, now)
	if err != nil || payload == nil {
		t.Fatalf("payload = %+v, %v; want a payload", payload, err)
	}
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(body, &decoded); err != nil {
		t.Fatalf("decode: %v", err)
	}
	keys := make([]string, 0, len(decoded))
	for key := range decoded {
		keys = append(keys, key)
	}
	slices.Sort(keys)
	wantKeys := []string{
		"accountSharing", "accounts", "assetSharing", "assets", "autoCalculatedBalances",
		"autoUpdateRates", "currencies", "historyYears", "importApiUsed", "importReverted",
		"inverseSharing", "labels", "manualTransactions", "plaidConfigured", "plaidConnections",
		"plaidErrors", "schema", "securities", "transactions", "users", "version",
	}
	if !slices.Equal(keys, wantKeys) {
		t.Fatalf("payload keys = %v, want %v", keys, wantKeys)
	}
	if strings.Contains(string(body), "Sentinel") || strings.Contains(string(body), "alice") {
		t.Fatalf("payload leaks user data: %s", body)
	}
	if payload.Users != "1" || payload.Accounts != "1-5" || payload.Transactions != "<1k" ||
		payload.Currencies != "1" || payload.HistoryYears != "1-3" {
		t.Fatalf("payload buckets = %s", body)
	}
	if !payload.ManualEntry || payload.AccountSharing || payload.Labels || payload.PlaidErrors {
		t.Fatalf("payload flags = %s", body)
	}
}
