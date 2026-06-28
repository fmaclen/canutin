package main

import (
	"math"
	"testing"
	"time"
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

func TestDemoFixtureCounts(t *testing.T) {
	if len(demoAccounts) != 8 {
		t.Fatalf("expected 8 accounts, got %d", len(demoAccounts))
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

	total := sumNonExcluded(demoCheckingTransactions(reference)) +
		sumNonExcluded(demoSavingsTransactions(reference)) +
		sumNonExcluded(demoCreditCardTransactions(reference)) +
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

	if got := math.Round(total); got != 184719 {
		t.Fatalf("net worth = %v (rounded %v), want 184719", total, got)
	}
}
