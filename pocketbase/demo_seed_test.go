package main

import (
	"math"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/jsvm"
)

func latestAccountBalance(balances []demoAccountBalance) float64 {
	latest := balances[0]
	latestDate, _ := time.Parse("2006-01-02", latest.asOf)
	for _, balance := range balances[1:] {
		date, _ := time.Parse("2006-01-02", balance.asOf)
		if date.After(latestDate) {
			latest = balance
			latestDate = date
		}
	}
	return latest.value
}

func latestAssetBalance(balances []demoAssetBalance) float64 {
	latest := balances[0]
	latestDate, _ := time.Parse("2006-01-02", latest.asOf)
	for _, balance := range balances[1:] {
		date, _ := time.Parse("2006-01-02", balance.asOf)
		if date.After(latestDate) {
			latest = balance
			latestDate = date
		}
	}
	return latest.marketValue
}

func latestSecurityValue(name string, reference time.Time) demoSecurityBalance {
	balances := demoSecurityBalances(name, reference)
	latest := balances[0]
	latestDate, _ := time.Parse("2006-01-02", latest.asOf)
	for _, balance := range balances[1:] {
		date, _ := time.Parse("2006-01-02", balance.asOf)
		if date.After(latestDate) {
			latest = balance
			latestDate = date
		}
	}
	return latest
}

func sumNonExcluded(transactions []demoTransaction) float64 {
	var sum float64
	for _, tx := range transactions {
		if tx.excluded {
			continue
		}
		sum += tx.value
	}
	return sum
}

func newDemoSeedTestApp(t *testing.T) *pocketbase.PocketBase {
	t.Helper()

	app := pocketbase.NewWithConfig(pocketbase.Config{
		DefaultDataDir:       t.TempDir(),
		DefaultEncryptionEnv: "pb_test_env",
	})
	if err := jsvm.Register(app, jsvm.Config{MigrationsDir: "pb_migrations"}); err != nil {
		t.Fatalf("register migrations: %v", err)
	}
	if err := app.Bootstrap(); err != nil {
		t.Fatalf("bootstrap app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.ResetBootstrapState(); err != nil {
			t.Errorf("reset bootstrap state: %v", err)
		}
	})
	if err := app.RunAllMigrations(); err != nil {
		t.Fatalf("run migrations: %v", err)
	}
	return app
}

func TestDemoFixtureCounts(t *testing.T) {
	if len(demoAccounts) != 9 {
		t.Fatalf("expected 9 accounts, got %d", len(demoAccounts))
	}
	if len(demoAssets) != 2 {
		t.Fatalf("expected 2 assets, got %d", len(demoAssets))
	}
	if len(demoLabels) != 22 {
		t.Fatalf("expected 22 labels, got %d", len(demoLabels))
	}
	if len(demoSecurities) != 4 {
		t.Fatalf("expected 4 securities, got %d", len(demoSecurities))
	}
}

func TestDemoSecurityPositions(t *testing.T) {
	reference := time.Now()
	expected := map[string]struct {
		quantity float64
		price    float64
		value    float64
	}{
		demoSecuritySpy:      {50, 580, 29000},
		demoSecurityGameStop: {125, 25, 3125},
		demoSecurityBitcoin:  {0.75, 92560, 69420},
		demoSecurityEthereum: {5, 3500, 17500},
	}

	for name, want := range expected {
		latest := latestSecurityValue(name, reference)
		if latest.quantity != want.quantity {
			t.Errorf("%s: quantity = %v, want %v", name, latest.quantity, want.quantity)
		}
		if latest.price != want.price {
			t.Errorf("%s: price = %v, want %v", name, latest.price, want.price)
		}
		if latest.value != want.value {
			t.Errorf("%s: value = %v, want %v", name, latest.value, want.value)
		}
	}
}

func TestDemoSecurityTradeCount(t *testing.T) {
	reference := time.Now()
	expected := map[string]int{
		demoSecuritySpy:      4,
		demoSecurityGameStop: 3,
		demoSecurityBitcoin:  2,
		demoSecurityEthereum: 2,
	}
	for name, count := range expected {
		if got := len(demoSecurityTrades(name, reference)); got != count {
			t.Errorf("%s: trade count = %d, want %d", name, got, count)
		}
	}
}

func TestDemoAccountSet(t *testing.T) {
	reference := time.Now()

	checking := sumNonExcluded(demoCheckingTransactions(reference))
	if math.Round(checking) != 3400 {
		t.Errorf("checking sum = %v, want 3400", checking)
	}
	savings := sumNonExcluded(demoSavingsTransactions(reference))
	if savings != 6000 {
		t.Errorf("savings sum = %v, want 6000", savings)
	}
	credit := sumNonExcluded(demoCreditCardTransactions(reference))
	if math.Round(credit*100)/100 != 437.73 {
		t.Errorf("credit sum = %v, want 437.73", credit)
	}
}

func TestDemoGameStopCostBasis(t *testing.T) {
	// The GameStop series (buy 200, sell 100, buy 25) only computes the realistic 4700 cost basis
	// when trades are folded oldest-first. A newest-first fold drives quantity negative on the sell
	// and yields 5900, so this pins the fold direction.
	latest := latestSecurityValue(demoSecurityGameStop, time.Now())
	if latest.costBasis != 4700 {
		t.Fatalf("GameStop latest costBasis = %v, want 4700", latest.costBasis)
	}
}

func TestDemoMonthEndReferenceSpansEveryMonth(t *testing.T) {
	// A month-end reference (March 31) exposes Go's AddDate overflow: subtracting a month from a
	// 31-day reference lands back in the same month, skipping buckets. The date-fns subMonths clamp
	// must produce one distinct month-start per buy.
	reference := time.Date(2025, 3, 31, 0, 0, 0, 0, time.UTC)

	months := map[string]bool{}
	for _, tx := range demoCheckingTransactions(reference) {
		if tx.description != "Westside Apartments" {
			continue
		}
		months[tx.date[:7]] = true
	}

	if len(months) != demoMonthsInSet {
		t.Fatalf("checking transactions span %d distinct months, want %d", len(months), demoMonthsInSet)
	}
}

func TestDemoNetWorth(t *testing.T) {
	reference := time.Now()
	arsChecking := sumNonExcluded(demoArsCheckingTransactions(reference)) / demoArsRate(demoISODate(reference), reference)

	total := sumNonExcluded(demoCheckingTransactions(reference)) +
		sumNonExcluded(demoSavingsTransactions(reference)) +
		sumNonExcluded(demoCreditCardTransactions(reference)) +
		arsChecking +
		latestAccountBalance(demoAutoLoanBalances(reference)) +
		latestAccountBalance(demoRothIraBalances(reference)) +
		latestAccountBalance(demo401kBalances(reference)) +
		latestAccountBalance(demoWalletBalances(reference)) +
		latestAssetBalance(demoCollectibleBalances(reference)) +
		latestAssetBalance(demoVehicleBalances(reference)) +
		latestSecurityValue(demoSecuritySpy, reference).value +
		latestSecurityValue(demoSecurityGameStop, reference).value +
		latestSecurityValue(demoSecurityBitcoin, reference).value +
		latestSecurityValue(demoSecurityEthereum, reference).value

	if got := math.Round(total); got != 185787 {
		t.Fatalf("net worth = %v (rounded %v), want 185787", total, got)
	}
}

func TestDemoExchangeRatesIgnoreGlobalRows(t *testing.T) {
	app := newDemoSeedTestApp(t)

	usersColl, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("find users collection: %v", err)
	}
	user := core.NewRecord(usersColl)
	user.SetEmail("demo-seed-rates@example.com")
	user.SetPassword("123qweasdzxc")
	user.SetVerified(true)
	if err := app.Save(user); err != nil {
		t.Fatalf("save user: %v", err)
	}

	ratesColl, err := app.FindCollectionByNameOrId("exchangeRates")
	if err != nil {
		t.Fatalf("find exchangeRates collection: %v", err)
	}
	reference := time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC)
	globalDate := demoISODate(reference)
	globalStart, globalEnd := pbDateRange(globalDate)
	globalRate := core.NewRecord(ratesColl)
	globalRate.Set("owner", "")
	globalRate.Set("currency", "ARS")
	globalRate.Set("date", globalStart)
	globalRate.Set("rate", 999.25)
	globalRate.Set("source", "fetched")
	if err := app.Save(globalRate); err != nil {
		t.Fatalf("save global rate: %v", err)
	}

	ownedDate := demoISODate(reference.AddDate(0, 0, -4))
	ownedStart, ownedEnd := pbDateRange(ownedDate)
	ownedRate := core.NewRecord(ratesColl)
	ownedRate.Set("owner", user.Id)
	ownedRate.Set("currency", "ARS")
	ownedRate.Set("date", ownedStart)
	ownedRate.Set("rate", 4321.75)
	ownedRate.Set("source", "manual")
	if err := app.Save(ownedRate); err != nil {
		t.Fatalf("save owned rate: %v", err)
	}

	if err := seedDemoData(app, user.Id, reference); err != nil {
		t.Fatalf("seed demo data: %v", err)
	}

	seededRows, err := app.FindRecordsByFilter("exchangeRates",
		"owner = {:owner} && currency = {:currency} && date >= {:start} && date < {:end}",
		"", 10, 0,
		map[string]any{"owner": user.Id, "currency": "ARS", "start": globalStart, "end": globalEnd},
	)
	if err != nil {
		t.Fatalf("find seeded owned rate: %v", err)
	}
	if len(seededRows) != 1 {
		t.Fatalf("owned rates for %s = %d, want 1", globalDate, len(seededRows))
	}
	if seededRows[0].GetString("source") != "manual" {
		t.Fatalf("seeded rate source = %q, want manual", seededRows[0].GetString("source"))
	}

	globalAfter, err := app.FindRecordById("exchangeRates", globalRate.Id)
	if err != nil {
		t.Fatalf("find global rate after seed: %v", err)
	}
	if globalAfter.GetString("owner") != "" || globalAfter.GetString("source") != "fetched" || globalAfter.GetFloat("rate") != 999.25 {
		t.Fatalf("global rate changed: owner=%q source=%q rate=%v", globalAfter.GetString("owner"), globalAfter.GetString("source"), globalAfter.GetFloat("rate"))
	}

	ownedRows, err := app.FindRecordsByFilter("exchangeRates",
		"owner = {:owner} && currency = {:currency} && date >= {:start} && date < {:end}",
		"", 10, 0,
		map[string]any{"owner": user.Id, "currency": "ARS", "start": ownedStart, "end": ownedEnd},
	)
	if err != nil {
		t.Fatalf("find preexisting owned rate: %v", err)
	}
	if len(ownedRows) != 1 {
		t.Fatalf("owned rates for %s = %d, want 1", ownedDate, len(ownedRows))
	}
	if ownedRows[0].Id != ownedRate.Id || ownedRows[0].GetFloat("rate") != 4321.75 {
		t.Fatalf("preexisting owned rate changed: id=%q rate=%v", ownedRows[0].Id, ownedRows[0].GetFloat("rate"))
	}
}

func TestResetDemoKeepsOwnedExchangeRatesAfterDeferredCurrencyHooks(t *testing.T) {
	app := newDemoSeedTestApp(t)
	app.OnRecordAfterDeleteSuccess("currencies").BindFunc(func(e *core.RecordEvent) error {
		owner := e.Record.GetString("owner")
		code := e.Record.GetString("code")
		for {
			quotes, err := e.App.FindRecordsByFilter("exchangeRates",
				"owner = {:owner} && currency = {:currency}",
				"", 100, 0,
				map[string]any{"owner": owner, "currency": code},
			)
			if err != nil {
				return err
			}
			if len(quotes) == 0 {
				break
			}
			for _, quote := range quotes {
				if err := e.App.Delete(quote); err != nil {
					return err
				}
			}
		}
		return e.Next()
	})

	if err := resetDemo(app); err != nil {
		t.Fatalf("first reset demo: %v", err)
	}
	user, err := app.FindAuthRecordByEmail("users", demoEmail())
	if err != nil {
		t.Fatalf("find demo user: %v", err)
	}
	demoCurrencies, err := app.FindRecordsByFilter("currencies",
		"owner = {:owner} && code = {:code}",
		"", 10, 0,
		map[string]any{"owner": user.Id, "code": "ARS"},
	)
	if err != nil {
		t.Fatalf("find demo ARS currency: %v", err)
	}
	if len(demoCurrencies) != 1 {
		t.Fatalf("demo ARS currencies = %d, want 1", len(demoCurrencies))
	}
	countOwnedArsQuotes := func() int {
		t.Helper()
		rows, err := app.FindRecordsByFilter("exchangeRates",
			"owner = {:owner} && currency = {:currency}",
			"", 0, 0,
			map[string]any{"owner": user.Id, "currency": "ARS"},
		)
		if err != nil {
			t.Fatalf("find demo ARS quotes: %v", err)
		}
		return len(rows)
	}
	seededQuoteCount := countOwnedArsQuotes()
	if seededQuoteCount == 0 {
		t.Fatal("seeded demo ARS quotes = 0, want at least 1")
	}

	ratesColl, err := app.FindCollectionByNameOrId("exchangeRates")
	if err != nil {
		t.Fatalf("find exchangeRates collection: %v", err)
	}
	globalStart, _ := pbDateRange(time.Now().UTC().Format("2006-01-02"))
	globalRate := core.NewRecord(ratesColl)
	globalRate.Set("owner", "")
	globalRate.Set("currency", "ARS")
	globalRate.Set("date", globalStart)
	globalRate.Set("rate", 999.25)
	globalRate.Set("source", "fetched")
	if err := app.Save(globalRate); err != nil {
		t.Fatalf("save global ARS rate: %v", err)
	}

	if err := resetDemo(app); err != nil {
		t.Fatalf("second reset demo: %v", err)
	}
	if got := countOwnedArsQuotes(); got != seededQuoteCount {
		t.Fatalf("demo ARS quote count after reset = %d, want %d", got, seededQuoteCount)
	}
	if _, err := app.FindRecordById("exchangeRates", globalRate.Id); err != nil {
		t.Fatalf("find global ARS rate after reset: %v", err)
	}
}
