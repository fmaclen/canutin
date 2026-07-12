package main

import (
	"database/sql"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

const demoMonthsInSet = 24

var demoLabels = []string{
	"Rent",
	"Payroll & benefits",
	"Transfers",
	"Payments",
	"Automotive",
	"Groceries",
	"Food & drink",
	"Restaurants",
	"Subscriptions",
	"Shops",
	"Gas stations",
	"Internet & phone",
	"Insurance",
	"Furnishings",
	"Home maintenance",
	"Electronics",
	"Music",
	"Health",
	"Office supplies",
	"Entertainment & recreation",
	"Financial & banking",
	"Fees",
}

const (
	demoAccountChecking    = "Bob's Laughable-Yield Checking"
	demoAccountSavings     = "Emergency Fund"
	demoAccountCreditCard  = "Alice's Limited Rewards Credit Card"
	demoAccountAutoLoan    = "Fiat Auto Loan"
	demoAccountRothIra     = "Alice's Roth IRA"
	demoAccount401k        = "Bob's 401k"
	demoAccountWallet      = "Mattress Wallet"
	demoAccountCrypto      = "Alice's Crypto Brokerage"
	demoAccountArsChecking = "Alice's Peso Checking"

	demoAssetCollectible = "Funko Pop Collection"
	demoAssetVehicle     = "1998 Fiat Multipla"

	demoSecuritySpy      = "SPDR S&P 500 ETF Trust"
	demoSecurityGameStop = "GameStop"
	demoSecurityBitcoin  = "Bitcoin"
	demoSecurityEthereum = "Ethereum"
)

type demoAccount struct {
	name           string
	balanceGroup   string
	balanceType    string
	institution    string
	autoCalculated bool
	currency       string
}

var demoAccounts = []demoAccount{
	{demoAccountChecking, "CASH", "Checking", "Ransack Bank", true, "USD"},
	{demoAccountSavings, "CASH", "Savings", "Ransack Bank", true, "USD"},
	{demoAccountCreditCard, "DEBT", "Credit Card", "Juggernaut Bank", true, "USD"},
	{demoAccountAutoLoan, "DEBT", "Auto Loan", "Fiat Financial Services", false, "USD"},
	{demoAccountRothIra, "INVESTMENT", "Roth IRA", "Loot Financial", false, "USD"},
	{demoAccount401k, "INVESTMENT", "401k", "Loot Financial", false, "USD"},
	{demoAccountWallet, "CASH", "Cash", "", false, "USD"},
	{demoAccountCrypto, "INVESTMENT", "Crypto", "Coinpurse", false, "USD"},
	{demoAccountArsChecking, "CASH", "Checking", "Banco Galicia", true, "ARS"},
}

type demoAsset struct {
	name         string
	balanceGroup string
	balanceType  string
}

var demoAssets = []demoAsset{
	{demoAssetCollectible, "OTHER", "Collectible"},
	{demoAssetVehicle, "OTHER", "Vehicle"},
}

type demoSecurity struct {
	name    string
	symbol  string
	account string
}

var demoSecurities = []demoSecurity{
	{demoSecuritySpy, "SPY", demoAccount401k},
	{demoSecurityGameStop, "GME", demoAccountRothIra},
	{demoSecurityBitcoin, "BTC", demoAccountCrypto},
	{demoSecurityEthereum, "ETH", demoAccountCrypto},
}

type demoTransaction struct {
	description string
	value       float64
	date        string
	label       string
	excluded    bool
}

type demoAccountBalance struct {
	asOf  string
	value float64
}

type demoAssetBalance struct {
	asOf        string
	marketValue float64
}

type demoSeriesTrade struct {
	daysAgo  int
	tradeBuy bool
	quantity float64
	price    float64
	fees     float64
}

type demoSeriesSnapshot struct {
	daysAgo int
	price   float64
}

type demoSecuritySeries struct {
	label     string
	trades    []demoSeriesTrade
	snapshots []demoSeriesSnapshot
}

// demoSecuritySeriesByName pins each security's trades and valuation snapshots. The daysAgo: 0
// price times the net held quantity yields the latest position value that sums to the deterministic
// net worth asserted by e2e/demo-seed.test.ts. Trades stay within the last ~45 days so they remain
// visible under the trades ledger's default "last 3 months" filter for any run date.
var demoSecuritySeriesByName = map[string]demoSecuritySeries{
	demoSecuritySpy: {
		label: "SPDR S&P 500",
		trades: []demoSeriesTrade{
			{45, true, 20, 450, 5},
			{30, true, 15, 490, 5},
			{15, true, 10, 530, 5},
			{5, true, 5, 565, 5},
		},
		snapshots: []demoSeriesSnapshot{
			{45, 450}, {30, 490}, {15, 530}, {7, 555}, {5, 565}, {0, 580},
		},
	},
	demoSecurityGameStop: {
		label: "GameStop",
		trades: []demoSeriesTrade{
			{45, true, 200, 40, 10},
			{35, false, 100, 325, 25},
			{10, true, 25, 28, 5},
		},
		snapshots: []demoSeriesSnapshot{
			{45, 40}, {35, 325}, {20, 90}, {10, 28}, {3, 24}, {0, 25},
		},
	},
	demoSecurityBitcoin: {
		label: "Bitcoin",
		trades: []demoSeriesTrade{
			{40, true, 0.5, 35000, 20},
			{12, true, 0.25, 44000, 15},
		},
		snapshots: []demoSeriesSnapshot{
			{40, 35000}, {25, 51000}, {12, 44000}, {4, 84000}, {0, 92560},
		},
	},
	demoSecurityEthereum: {
		label: "Ethereum",
		trades: []demoSeriesTrade{
			{42, true, 3, 1800, 10},
			{18, true, 2, 2400, 10},
		},
		snapshots: []demoSeriesSnapshot{
			{42, 1800}, {30, 1500}, {18, 2400}, {8, 2900}, {0, 3500},
		},
	},
}

func demoISODate(t time.Time) string {
	return t.UTC().Format("2006-01-02")
}

func demoStartOfMonth(t time.Time) time.Time {
	y, m, _ := t.Date()
	return time.Date(y, m, 1, 0, 0, 0, 0, t.Location())
}

// demoSubMonths mirrors date-fns subMonths: subtract whole calendar months, then clamp the day to
// the target month's last valid day. Go's time.AddDate normalizes overflow forward instead (e.g.
// March 31 minus one month becomes March 3, not Feb 28), which skips a month bucket whenever the
// reference day is 29-31.
func demoSubMonths(t time.Time, months int) time.Time {
	y, m, d := t.Date()
	target := time.Date(y, m, 1, 0, 0, 0, 0, t.Location()).AddDate(0, -months, 0)
	ty, tm, _ := target.Date()
	lastDay := time.Date(ty, tm+1, 0, 0, 0, 0, 0, t.Location()).Day()
	if d > lastDay {
		d = lastDay
	}
	return time.Date(ty, tm, d, t.Hour(), t.Minute(), t.Second(), t.Nanosecond(), t.Location())
}

func demoMonthStart(monthsAgo int, reference time.Time) time.Time {
	return demoStartOfMonth(demoSubMonths(reference, monthsAgo))
}

func demoMonthsAgo(monthsAgo int, reference time.Time) string {
	return demoISODate(demoSubMonths(reference, monthsAgo))
}

func demoDaysAgo(days int, reference time.Time) string {
	return demoISODate(reference.AddDate(0, 0, -days))
}

func demoRoundToCents(value float64) float64 {
	return math.Round(value*100) / 100
}

func demoCheckingTransactions(reference time.Time) []demoTransaction {
	var txs []demoTransaction
	for i := 0; i < demoMonthsInSet; i++ {
		monthStart := demoMonthStart(i, reference)
		visaPayment := -1500.0
		if i%2 == 0 {
			visaPayment = -1750
		}
		exchangeTransfer := -500.0
		if i%3 == 0 {
			exchangeTransfer = 0
		}
		txs = append(txs,
			demoTransaction{"Westside Apartments", -2250, demoISODate(monthStart.AddDate(0, 0, 0)), "Rent", false},
			demoTransaction{"Initech HR * Payroll", 2800, demoISODate(monthStart.AddDate(0, 0, 5)), "Payroll & benefits", false},
			demoTransaction{"Transfer to Ransack Savings", -250, demoISODate(monthStart.AddDate(0, 0, 6)), "Transfers", false},
			demoTransaction{"Juggernaut Visa Payment", visaPayment, demoISODate(monthStart.AddDate(0, 0, 7)), "Payments", false},
			demoTransaction{"Initech HR * Payroll", 2800, demoISODate(monthStart.AddDate(0, 0, 20)), "Payroll & benefits", false},
			demoTransaction{"Transfer to Loot Financial", -500, demoISODate(monthStart.AddDate(0, 0, 24)), "Transfers", false},
			demoTransaction{"Transfer to MegaCoin Exchange", exchangeTransfer, demoISODate(monthStart.AddDate(0, 0, 26)), "Transfers", false},
			demoTransaction{"Toyota - TFS Payment", -500, demoISODate(monthStart.AddDate(0, 0, 27)), "Automotive", false},
		)
	}
	return txs
}

func demoSavingsTransactions(reference time.Time) []demoTransaction {
	var txs []demoTransaction
	for i := 0; i < demoMonthsInSet; i++ {
		monthStart := demoMonthStart(i, reference)
		txs = append(txs, demoTransaction{"Transfer from Ransack Checking", 250, demoISODate(monthStart.AddDate(0, 0, 6)), "Transfers", false})
	}
	return txs
}

func demoCreditCardTransactions(reference time.Time) []demoTransaction {
	var txs []demoTransaction
	for i := 0; i < demoMonthsInSet; i++ {
		monthStart := demoMonthStart(i, reference)
		day := func(d int) string { return demoISODate(monthStart.AddDate(0, 0, d)) }

		homeDescription, homeValue, homeLabel := "The Hardware Center", -95.89, "Home maintenance"
		if i%7 == 0 {
			homeDescription, homeValue = "Hølm Home", -215.43
		}
		if i%2 == 0 {
			homeLabel = "Furnishings"
		}

		electronicsDescription, electronicsValue, electronicsLabel := "alphaStream", -4.99, "Music"
		if i%5 == 0 {
			electronicsDescription, electronicsValue, electronicsLabel = "ShortCircuit Computers", -649.99, "Electronics"
		}

		healthDescription, healthValue, healthLabel := "Stefano's Pizza by the Slice", -7.78, "Restaurants"
		if i%7 == 0 {
			healthDescription, healthValue, healthLabel = "Narby Warker", -150, "Health"
		}

		officeDescription, officeValue, officeLabel := "Flix Movie Rentals", -4.99, "Entertainment & recreation"
		if i%9 == 0 {
			officeDescription, officeValue, officeLabel = "9-5 Office Supplies", -98.23, "Office supplies"
		}

		rebateDescription, rebateValue, rebateLabel := "Juggernaut Cash Back Redemption", 25.33, "Financial & banking"
		if i%11 == 0 {
			rebateDescription, rebateValue, rebateLabel = "Horizon Wireless (Promotional Rebate)", 445, "Internet & phone"
		}

		paymentValue := 1675.0
		switch {
		case i%3 == 0:
			paymentValue = 1755
		case i%6 == 0:
			paymentValue = 2355
		case i%9 == 0:
			paymentValue = 1945
		}

		txs = append(txs,
			demoTransaction{"Evergreen Market", -175.75, day(1), "Groceries", false},
			demoTransaction{"Evergreen Market", -135.5, day(7), "Groceries", false},
			demoTransaction{"Evergreen Market", -189.25, day(15), "Groceries", false},
			demoTransaction{"Evergreen Market", -105.5, day(23), "Groceries", false},
			demoTransaction{"Chorizo King", -22.5, day(3), "Food & drink", false},
			demoTransaction{"Por Que No Los Tacos?", -19.25, day(6), "Food & drink", false},
			demoTransaction{"Maria's Artisanal Gelato", -12.67, day(11), "Food & drink", false},
			demoTransaction{"Mainely Lobster", -43.97, day(10), "Restaurants", false},
			demoTransaction{"Sunset Cafe", -17.81, day(14), "Restaurants", false},
			demoTransaction{"Stellar Burger", -16.23, day(20), "Restaurants", false},
			demoTransaction{"Roy's Steakhouse", -55.78, day(25), "Restaurants", false},
			demoTransaction{"Stellar Burger", -19.23, day(26), "Restaurants", false},
			demoTransaction{"NetTV Max", -14.99, day(2), "Subscriptions", false},
			demoTransaction{"Store.com", -25.9, day(12), "Shops", false},
			demoTransaction{"Store.com", -24.21, day(18), "Shops", true},
			demoTransaction{"Store.com (Refund)", 24.21, day(26), "Shops", true},
			demoTransaction{"Florida Man (Gas & Convenience Store)", -25.67, day(7), "Gas stations", false},
			demoTransaction{"Florida Man (Gas & Convenience Store)", -40.01, day(24), "Gas stations", false},
			demoTransaction{"Horizon Wireless", -90.5, day(2), "Internet & phone", false},
			demoTransaction{"Patriot Insurance", -135.67, day(27), "Insurance", false},
			demoTransaction{homeDescription, homeValue, day(16), homeLabel, false},
			demoTransaction{electronicsDescription, electronicsValue, day(26), electronicsLabel, false},
			demoTransaction{"PurpleShield Health", -254.84, day(3), "Health", false},
			demoTransaction{healthDescription, healthValue, day(13), healthLabel, false},
			demoTransaction{officeDescription, officeValue, day(13), officeLabel, false},
			demoTransaction{rebateDescription, rebateValue, day(15), rebateLabel, false},
			demoTransaction{"Ransack Bank Payment Received — Thank You", paymentValue, day(8), "Payments", false},
			demoTransaction{"Juggernaut Visa Interest", -56.89, day(8), "Fees", false},
		)
	}
	return txs
}

func demoArsCheckingTransactions(reference time.Time) []demoTransaction {
	var txs []demoTransaction
	for i := 0; i < demoMonthsInSet; i++ {
		monthStart := demoMonthStart(i, reference)
		day := func(d int) string { return demoISODate(monthStart.AddDate(0, 0, d)) }

		rent := -750000.0
		if i%4 == 0 {
			rent = -780000
		}
		salary := 1150000.0
		if i%6 == 0 {
			salary = 1220000
		}

		txs = append(txs,
			demoTransaction{"Inmobiliaria del Sur", rent, day(1), "Rent", false},
			demoTransaction{"Estudio Contable SRL * Sueldo", salary, day(5), "Payroll & benefits", false},
			demoTransaction{"Coto Supermercado", -95430.75, day(8), "Groceries", false},
			demoTransaction{"Coto Supermercado", -88215.5, day(22), "Groceries", false},
			demoTransaction{"YPF", -42600, day(12), "Gas stations", false},
			demoTransaction{"Edenor", -28750.25, day(14), "Home maintenance", false},
			demoTransaction{"Personal Flow", -17990, day(16), "Internet & phone", false},
			demoTransaction{"Farmacity", -15340.8, day(18), "Health", false},
			demoTransaction{"La Americana", -22500, day(20), "Restaurants", false},
			demoTransaction{"Sancor Seguros", -26800, day(26), "Insurance", false},
		)
	}
	return txs
}

// demoArsRate synthesizes an ARS-per-USD rate for date, interpolated linearly across the demo's
// window to a recent peso rate without ever fetching a real rate over the network.
func demoArsRate(date string, reference time.Time) float64 {
	const rateOldest, rateNewest = 850.0, 1495.0
	t, err := time.Parse("2006-01-02", date)
	if err != nil {
		return rateNewest
	}
	// NOTE: interpolate on whole calendar days between t and reference's UTC date, not the raw
	// sub-day duration. Otherwise today's rate (and the derived ARS balance's converted contribution
	// to net worth) drifts by ~a dollar depending on the wall-clock time the demo was seeded at,
	// making the deterministic net worth asserted by e2e/demo-seed.test.ts flaky.
	utc := reference.UTC()
	refDate := time.Date(utc.Year(), utc.Month(), utc.Day(), 0, 0, 0, 0, time.UTC)
	monthsAgo := refDate.Sub(t).Hours() / 24 / 30
	if monthsAgo < 0 {
		monthsAgo = 0
	}
	if monthsAgo > demoMonthsInSet-1 {
		monthsAgo = demoMonthsInSet - 1
	}
	return demoRoundToCents(rateNewest - monthsAgo/(demoMonthsInSet-1)*(rateNewest-rateOldest))
}

func demoAutoLoanBalances(reference time.Time) []demoAccountBalance {
	values := []float64{-21250, -23500, -24000, -25500, -27000, -29500, -30000, -32500, -33000, -34500, -36000, -37500, -38000, -39500, -40000, -41500, -42000, -42500}
	balances := make([]demoAccountBalance, len(values))
	for i, v := range values {
		balances[i] = demoAccountBalance{demoMonthsAgo(i, reference), v}
	}
	return balances
}

func demoRothIraBalances(reference time.Time) []demoAccountBalance {
	return []demoAccountBalance{
		{demoMonthsAgo(0, reference), 18535.78},
		{demoMonthsAgo(1, reference), 18035.65},
		{demoMonthsAgo(3, reference), 17535.12},
		{demoMonthsAgo(5, reference), 17035.23},
		{demoMonthsAgo(7, reference), 16535.78},
		{demoMonthsAgo(9, reference), 16035.45},
		{demoMonthsAgo(11, reference), 15535.67},
		{demoMonthsAgo(13, reference), 15035.92},
		{demoMonthsAgo(15, reference), 14535.12},
		{demoMonthsAgo(17, reference), 14035.18},
		{demoMonthsAgo(19, reference), 13535.98},
		{demoMonthsAgo(21, reference), 13035.75},
		{demoMonthsAgo(23, reference), 12535.45},
		{demoMonthsAgo(25, reference), 12035.38},
	}
}

func demo401kBalances(reference time.Time) []demoAccountBalance {
	return []demoAccountBalance{
		{demoMonthsAgo(0, reference), 4250.58},
		{demoMonthsAgo(1, reference), 4000.25},
		{demoMonthsAgo(3, reference), 3250.66},
		{demoMonthsAgo(5, reference), 3000.33},
		{demoMonthsAgo(7, reference), 2750.49},
		{demoMonthsAgo(9, reference), 2500.58},
		{demoMonthsAgo(11, reference), 2250.25},
		{demoMonthsAgo(13, reference), 2000.78},
		{demoMonthsAgo(15, reference), 1750.9},
		{demoMonthsAgo(17, reference), 1500.32},
		{demoMonthsAgo(19, reference), 1250.29},
		{demoMonthsAgo(21, reference), 1000.45},
		{demoMonthsAgo(23, reference), 750.12},
		{demoMonthsAgo(25, reference), 500.23},
	}
}

func demoWalletBalances(reference time.Time) []demoAccountBalance {
	return []demoAccountBalance{
		{demoMonthsAgo(7, reference), 1300},
		{demoMonthsAgo(18, reference), 700},
	}
}

func demoCollectibleBalances(reference time.Time) []demoAssetBalance {
	return []demoAssetBalance{
		{demoMonthsAgo(6, reference), 14500},
		{demoMonthsAgo(18, reference), 9500},
	}
}

func demoVehicleBalances(reference time.Time) []demoAssetBalance {
	return []demoAssetBalance{
		{demoMonthsAgo(4, reference), 38500},
		{demoMonthsAgo(8, reference), 40250},
		{demoMonthsAgo(14, reference), 42500},
	}
}

type demoSecurityBalance struct {
	asOf      string
	quantity  float64
	price     float64
	value     float64
	costBasis float64
}

func demoSecurityBalances(name string, reference time.Time) []demoSecurityBalance {
	series := demoSecuritySeriesByName[name]
	balances := make([]demoSecurityBalance, 0, len(series.snapshots))

	for _, snapshot := range series.snapshots {
		// Fold trades up to and including this snapshot, oldest first. A sell reduces the held cost
		// basis by the average cost of the shares sold so the remaining position keeps a realistic
		// (non-negative) cost basis even after a profitable sale.
		var quantity, costBasis float64
		for i := 0; i < len(series.trades); i++ {
			trade := series.trades[i]
			if trade.daysAgo < snapshot.daysAgo {
				continue
			}
			if trade.tradeBuy {
				quantity += trade.quantity
				costBasis += trade.quantity * trade.price
			} else {
				var averageCost float64
				if quantity > 0 {
					averageCost = costBasis / quantity
				}
				quantity -= trade.quantity
				costBasis -= trade.quantity * averageCost
			}
		}

		quantity = demoRoundToCents(quantity)
		balances = append(balances, demoSecurityBalance{
			asOf:      demoDaysAgo(snapshot.daysAgo, reference),
			quantity:  quantity,
			price:     snapshot.price,
			value:     demoRoundToCents(quantity * snapshot.price),
			costBasis: demoRoundToCents(costBasis),
		})
	}
	return balances
}

type demoTrade struct {
	date        string
	tradeType   string
	description string
	quantity    float64
	price       float64
	amount      float64
	fees        float64
}

func demoSecurityTrades(name string, reference time.Time) []demoTrade {
	series := demoSecuritySeriesByName[name]
	trades := make([]demoTrade, len(series.trades))

	for i, trade := range series.trades {
		tradeType, verb := "sell", "Sold"
		if trade.tradeBuy {
			tradeType, verb = "buy", "Bought"
		}
		trades[i] = demoTrade{
			date:        demoDaysAgo(trade.daysAgo, reference),
			tradeType:   tradeType,
			description: fmt.Sprintf("%s %s", verb, series.label),
			quantity:    trade.quantity,
			price:       trade.price,
			amount:      demoRoundToCents(trade.quantity * trade.price),
			fees:        trade.fees,
		}
	}
	return trades
}

// seedDemoData reproduces the dataset the TypeScript demo seed produces, owned by userID and dated
// relative to reference. The four auto-calculated accounts get a single derived accountBalances
// snapshot computed inline so the demo shows a correct derived balance the instant it loads, rather
// than waiting on the transactions hook's debounced async worker to catch up.
func seedDemoData(app core.App, userID string, reference time.Time) error {
	if _, _, err := ensureCurrencyRecord(app, userID, "USD", "", false); err != nil {
		return err
	}
	if _, _, err := ensureCurrencyRecord(app, userID, "ARS", "", false); err != nil {
		return err
	}

	balanceTypeIDs := map[string]string{}
	ensureBalanceType := func(name string) (string, error) {
		if id, ok := balanceTypeIDs[name]; ok {
			return id, nil
		}
		coll, err := app.FindCollectionByNameOrId("balanceTypes")
		if err != nil {
			return "", err
		}
		rec := core.NewRecord(coll)
		rec.Set("name", name)
		rec.Set("owner", userID)
		if err := app.Save(rec); err != nil {
			return "", err
		}
		balanceTypeIDs[name] = rec.Id
		return rec.Id, nil
	}

	labelIDs := map[string]string{}
	labelColl, err := app.FindCollectionByNameOrId("transactionLabels")
	if err != nil {
		return err
	}
	for _, name := range demoLabels {
		rec := core.NewRecord(labelColl)
		rec.Set("name", name)
		rec.Set("owner", userID)
		if err := app.Save(rec); err != nil {
			return err
		}
		labelIDs[name] = rec.Id
	}

	accountIDs := map[string]string{}
	accountColl, err := app.FindCollectionByNameOrId("accounts")
	if err != nil {
		return err
	}
	for _, account := range demoAccounts {
		btID, err := ensureBalanceType(account.balanceType)
		if err != nil {
			return err
		}
		rec := core.NewRecord(accountColl)
		rec.Set("name", account.name)
		rec.Set("balanceGroup", account.balanceGroup)
		rec.Set("balanceType", btID)
		rec.Set("institution", account.institution)
		rec.Set("owner", userID)
		rec.Set("currency", account.currency)
		if account.autoCalculated {
			rec.Set("autoCalculated", reference.UTC().Format(time.RFC3339Nano))
		}
		if err := app.Save(rec); err != nil {
			return err
		}
		accountIDs[account.name] = rec.Id
	}

	assetIDs := map[string]string{}
	assetColl, err := app.FindCollectionByNameOrId("assets")
	if err != nil {
		return err
	}
	for _, asset := range demoAssets {
		btID, err := ensureBalanceType(asset.balanceType)
		if err != nil {
			return err
		}
		rec := core.NewRecord(assetColl)
		rec.Set("name", asset.name)
		rec.Set("balanceGroup", asset.balanceGroup)
		rec.Set("balanceType", btID)
		rec.Set("owner", userID)
		rec.Set("currency", "USD")
		if err := app.Save(rec); err != nil {
			return err
		}
		assetIDs[asset.name] = rec.Id
	}

	txColl, err := app.FindCollectionByNameOrId("transactions")
	if err != nil {
		return err
	}
	saveTransactions := func(transactions []demoTransaction, accountID string) error {
		for _, tx := range transactions {
			rec := core.NewRecord(txColl)
			rec.Set("account", accountID)
			rec.Set("owner", userID)
			rec.Set("date", tx.date)
			rec.Set("description", tx.description)
			rec.Set("value", tx.value)
			rec.Set("labels", []string{labelIDs[tx.label]})
			if tx.excluded {
				rec.Set("excluded", reference.UTC().Format(time.RFC3339Nano))
			}
			if err := app.Save(rec); err != nil {
				return err
			}
		}
		return nil
	}

	if err := saveTransactions(demoCheckingTransactions(reference), accountIDs[demoAccountChecking]); err != nil {
		return err
	}
	if err := saveTransactions(demoSavingsTransactions(reference), accountIDs[demoAccountSavings]); err != nil {
		return err
	}
	if err := saveTransactions(demoCreditCardTransactions(reference), accountIDs[demoAccountCreditCard]); err != nil {
		return err
	}
	arsTransactions := demoArsCheckingTransactions(reference)
	if err := saveTransactions(arsTransactions, accountIDs[demoAccountArsChecking]); err != nil {
		return err
	}

	// The ARS checking account needs owner-scoped manual exchangeRates rows, so the demo never
	// depends on the ensure-rates worker's network fetch.
	ratesColl, err := app.FindCollectionByNameOrId("exchangeRates")
	if err != nil {
		return err
	}
	saveExchangeRate := func(currency, date string, rate float64) error {
		start, end := pbDateRange(date)
		existing, err := app.FindFirstRecordByFilter("exchangeRates",
			"owner = {:owner} && currency = {:currency} && date >= {:start} && date < {:end}",
			map[string]any{"owner": userID, "currency": currency, "start": start, "end": end},
		)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if existing != nil {
			return nil
		}
		rec := core.NewRecord(ratesColl)
		rec.Set("owner", userID)
		rec.Set("currency", currency)
		rec.Set("date", start)
		rec.Set("rate", rate)
		rec.Set("source", "manual")
		return app.Save(rec)
	}
	arsRateDates := map[string]struct{}{demoISODate(reference): {}}
	for _, tx := range arsTransactions {
		arsRateDates[tx.date] = struct{}{}
	}
	for date := range arsRateDates {
		if err := saveExchangeRate("ARS", date, demoArsRate(date, reference)); err != nil {
			return err
		}
	}

	abColl, err := app.FindCollectionByNameOrId("accountBalances")
	if err != nil {
		return err
	}
	saveAccountBalances := func(balances []demoAccountBalance, accountID string) error {
		for _, balance := range balances {
			rec := core.NewRecord(abColl)
			rec.Set("account", accountID)
			rec.Set("owner", userID)
			rec.Set("asOf", balance.asOf)
			rec.Set("value", balance.value)
			if err := app.Save(rec); err != nil {
				return err
			}
		}
		return nil
	}

	if err := saveAccountBalances(demoAutoLoanBalances(reference), accountIDs[demoAccountAutoLoan]); err != nil {
		return err
	}
	if err := saveAccountBalances(demoRothIraBalances(reference), accountIDs[demoAccountRothIra]); err != nil {
		return err
	}
	if err := saveAccountBalances(demo401kBalances(reference), accountIDs[demoAccount401k]); err != nil {
		return err
	}
	if err := saveAccountBalances(demoWalletBalances(reference), accountIDs[demoAccountWallet]); err != nil {
		return err
	}

	asbColl, err := app.FindCollectionByNameOrId("assetBalances")
	if err != nil {
		return err
	}
	saveAssetBalances := func(balances []demoAssetBalance, assetID string) error {
		for _, balance := range balances {
			rec := core.NewRecord(asbColl)
			rec.Set("asset", assetID)
			rec.Set("owner", userID)
			rec.Set("asOf", balance.asOf)
			rec.Set("marketValue", balance.marketValue)
			if err := app.Save(rec); err != nil {
				return err
			}
		}
		return nil
	}

	if err := saveAssetBalances(demoCollectibleBalances(reference), assetIDs[demoAssetCollectible]); err != nil {
		return err
	}
	if err := saveAssetBalances(demoVehicleBalances(reference), assetIDs[demoAssetVehicle]); err != nil {
		return err
	}

	securityIDs := map[string]string{}
	securityColl, err := app.FindCollectionByNameOrId("securities")
	if err != nil {
		return err
	}
	for _, security := range demoSecurities {
		rec := core.NewRecord(securityColl)
		rec.Set("name", security.name)
		rec.Set("normalizedName", securityNameKey(security.name))
		rec.Set("symbol", security.symbol)
		rec.Set("owner", userID)
		rec.Set("currency", "USD")
		if err := app.Save(rec); err != nil {
			return err
		}
		securityIDs[security.name] = rec.Id
	}

	secBalColl, err := app.FindCollectionByNameOrId("securityBalances")
	if err != nil {
		return err
	}
	secTxColl, err := app.FindCollectionByNameOrId("securityTransactions")
	if err != nil {
		return err
	}
	for _, security := range demoSecurities {
		accountID := accountIDs[security.account]
		securityID := securityIDs[security.name]

		for _, balance := range demoSecurityBalances(security.name, reference) {
			rec := core.NewRecord(secBalColl)
			rec.Set("account", accountID)
			rec.Set("security", securityID)
			rec.Set("owner", userID)
			rec.Set("asOf", balance.asOf)
			rec.Set("quantity", balance.quantity)
			rec.Set("price", balance.price)
			rec.Set("value", balance.value)
			rec.Set("costBasis", balance.costBasis)
			if err := app.Save(rec); err != nil {
				return err
			}
		}

		for _, trade := range demoSecurityTrades(security.name, reference) {
			rec := core.NewRecord(secTxColl)
			rec.Set("account", accountID)
			rec.Set("security", securityID)
			rec.Set("owner", userID)
			rec.Set("date", trade.date)
			rec.Set("type", trade.tradeType)
			rec.Set("description", trade.description)
			rec.Set("quantity", trade.quantity)
			rec.Set("price", trade.price)
			rec.Set("amount", trade.amount)
			rec.Set("fees", trade.fees)
			if err := app.Save(rec); err != nil {
				return err
			}
		}
	}

	for _, account := range demoAccounts {
		if !account.autoCalculated {
			continue
		}
		if err := recomputeDerivedBalance(app, accountIDs[account.name], ""); err != nil {
			return err
		}
	}

	return nil
}
