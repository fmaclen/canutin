package main

import (
	"net/http"

	"github.com/pocketbase/pocketbase/core"
)

// NOTE: FindRecordsByFilter does not auto-apply collection list rules, so each handler
// replicates the matching balance collection's listRule to guarantee a user can never read
// a balance for a parent they cannot see.
const visibleAccountBalanceFilter = "owner = {:user} || account.accountShares_via_account.recipient ?= {:user}"
const visibleAssetBalanceFilter = "owner = {:user} || asset.assetShares_via_asset.recipient ?= {:user}"

const latestBalanceSort = "-asOf,-created,-id"

type latestAccountBalance struct {
	ID      string  `json:"id"`
	Account string  `json:"account"`
	Value   float64 `json:"value"`
	AsOf    string  `json:"asOf"`
	Created string  `json:"created"`
}

type latestAssetBalance struct {
	ID          string  `json:"id"`
	Asset       string  `json:"asset"`
	MarketValue float64 `json:"marketValue"`
	BookValue   float64 `json:"bookValue"`
	AsOf        string  `json:"asOf"`
	Created     string  `json:"created"`
}

func latestAccountBalancesHandler(app core.App) func(*core.RequestEvent) error {
	return func(re *core.RequestEvent) error {
		records, err := app.FindRecordsByFilter(
			"accountBalances",
			visibleAccountBalanceFilter,
			latestBalanceSort,
			0,
			0,
			map[string]any{"user": re.Auth.Id},
		)
		if err != nil {
			return re.InternalServerError("Failed to load account balances", err)
		}

		latest := make(map[string]latestAccountBalance)
		for _, record := range records {
			account := record.GetString("account")
			if _, seen := latest[account]; seen {
				continue
			}
			latest[account] = latestAccountBalance{
				ID:      record.Id,
				Account: account,
				Value:   record.GetFloat("value"),
				AsOf:    record.GetString("asOf"),
				Created: record.GetString("created"),
			}
		}

		return re.JSON(http.StatusOK, latest)
	}
}

func latestAssetBalancesHandler(app core.App) func(*core.RequestEvent) error {
	return func(re *core.RequestEvent) error {
		records, err := app.FindRecordsByFilter(
			"assetBalances",
			visibleAssetBalanceFilter,
			latestBalanceSort,
			0,
			0,
			map[string]any{"user": re.Auth.Id},
		)
		if err != nil {
			return re.InternalServerError("Failed to load asset balances", err)
		}

		latest := make(map[string]latestAssetBalance)
		for _, record := range records {
			asset := record.GetString("asset")
			if _, seen := latest[asset]; seen {
				continue
			}
			latest[asset] = latestAssetBalance{
				ID:          record.Id,
				Asset:       asset,
				MarketValue: record.GetFloat("marketValue"),
				BookValue:   record.GetFloat("bookValue"),
				AsOf:        record.GetString("asOf"),
				Created:     record.GetString("created"),
			}
		}

		return re.JSON(http.StatusOK, latest)
	}
}
