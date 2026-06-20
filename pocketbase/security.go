package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strings"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/router"
	"github.com/pocketbase/pocketbase/tools/types"
)

type createSecurityWithInitialBalanceBody struct {
	Security createSecurityBody  `json:"security"`
	Balance  securityBalanceBody `json:"balance"`
}

type createSecurityBody struct {
	Name   string `json:"name"`
	Symbol string `json:"symbol"`
	Owner  string `json:"owner"`
}

type securityBalanceBody struct {
	Account   string   `json:"account"`
	Owner     string   `json:"owner"`
	AsOf      string   `json:"asOf"`
	Quantity  *float64 `json:"quantity"`
	Price     *float64 `json:"price"`
	Value     *float64 `json:"value"`
	CostBasis *float64 `json:"costBasis"`
}

func createSecurityWithInitialBalanceHandler(app core.App) func(*core.RequestEvent) error {
	return func(re *core.RequestEvent) error {
		if re.Auth == nil {
			return re.ForbiddenError("Authentication required", nil)
		}

		var body createSecurityWithInitialBalanceBody
		if err := re.BindBody(&body); err != nil {
			return re.BadRequestError("Invalid request body", err)
		}

		if body.Security.Owner != re.Auth.Id || body.Balance.Owner != re.Auth.Id {
			return re.ForbiddenError("Owner must match authenticated user", nil)
		}

		var security *core.Record
		if err := app.RunInTransaction(func(txApp core.App) error {
			if err := validateAccountOpen(txApp, body.Balance.Account, re.Auth); err != nil {
				return err
			}

			securitiesCollection, err := txApp.FindCollectionByNameOrId("securities")
			if err != nil {
				return err
			}

			security = core.NewRecord(securitiesCollection)
			security.Set("name", body.Security.Name)
			security.Set("symbol", body.Security.Symbol)
			security.Set("owner", body.Security.Owner)
			if err := txApp.Save(security); err != nil {
				return err
			}

			balancesCollection, err := txApp.FindCollectionByNameOrId("securityBalances")
			if err != nil {
				return err
			}

			balance := core.NewRecord(balancesCollection)
			balance.Set("owner", body.Balance.Owner)
			balance.Set("account", body.Balance.Account)
			balance.Set("security", security.Id)
			balance.Set("asOf", body.Balance.AsOf)
			setOptionalNumber(balance, "quantity", body.Balance.Quantity)
			setOptionalNumber(balance, "price", body.Balance.Price)
			setOptionalNumber(balance, "value", body.Balance.Value)
			setOptionalNumber(balance, "costBasis", body.Balance.CostBasis)
			return txApp.Save(balance)
		}); err != nil {
			var apiErr *router.ApiError
			if errors.As(err, &apiErr) {
				return apiErr
			}
			return re.BadRequestError("Failed to create security", err)
		}

		return re.JSON(http.StatusOK, security)
	}
}

func normalizeSecurityName(name string) string {
	return strings.TrimSpace(spaceRe.ReplaceAllString(name, " "))
}

func securityNameKey(name string) string {
	return strings.ToLower(normalizeSecurityName(name))
}

func normalizeSecuritySymbol(symbol string) string {
	return strings.ToUpper(strings.TrimSpace(spaceRe.ReplaceAllString(symbol, " ")))
}

func normalizeSecurityRecord(record *core.Record) {
	name := normalizeSecurityName(record.GetString("name"))
	symbol := normalizeSecuritySymbol(record.GetString("symbol"))

	record.Set("name", name)
	record.Set("symbol", symbol)
	record.Set("normalizedName", securityNameKey(name))
}

func normalizeSecurityDatedRecord(record *core.Record, field string) {
	value := record.GetString(field)
	if value == "" {
		return
	}
	record.Set(field, datePart(value)+" 00:00:00.000Z")
}

func validateSecurityRecordIntegrity(app core.App, record *core.Record) error {
	switch record.Collection().Name {
	case "securityBalances":
		if err := validateOptionalJSONNumbers(record, "quantity", "price", "value", "costBasis"); err != nil {
			return err
		}
	case "securityTransactions":
		if err := validateOptionalJSONNumbers(record, "quantity", "price", "amount", "fees"); err != nil {
			return err
		}
	}

	ownerID := record.GetString("owner")
	accountID := record.GetString("account")
	securityID := record.GetString("security")

	account, err := app.FindRecordById("accounts", accountID)
	if err != nil || account.GetString("owner") != ownerID {
		return apis.NewNotFoundError("Account not found", nil)
	}

	security, err := app.FindRecordById("securities", securityID)
	if err != nil || security.GetString("owner") != ownerID {
		return apis.NewNotFoundError("Security not found", nil)
	}

	return nil
}

// NOTE: bound to request-driven hooks (and the with-initial-balance endpoint) instead of
// OnRecordValidate so that programmatic saves, like import restoring a closed account's
// history, are not rejected.
func validateAccountOpen(app core.App, accountID string, auth *core.Record) error {
	account, err := app.FindRecordById("accounts", accountID)
	if err != nil || auth == nil || account.GetString("owner") != auth.Id {
		return apis.NewNotFoundError("Account not found", nil)
	}
	if account.GetString("closed") != "" {
		return apis.NewBadRequestError("Account is closed", nil)
	}
	return nil
}

func validateSecurityOwnerImmutable(record *core.Record) error {
	if !record.IsNew() && record.GetString("owner") != record.Original().GetString("owner") {
		return apis.NewForbiddenError("Owner cannot be changed", nil)
	}
	return nil
}

func validateParentOwner(app core.App, record *core.Record, parentCollection, relationField string) error {
	parent, err := app.FindRecordById(parentCollection, record.GetString(relationField))
	if err != nil || parent.GetString("owner") != record.GetString("owner") {
		return apis.NewNotFoundError(relationField+" not found", nil)
	}
	return nil
}

func validateOptionalJSONNumbers(record *core.Record, fields ...string) error {
	for _, field := range fields {
		if _, _, err := optionalJSONNumber(record, field); err != nil {
			return apis.NewBadRequestError(field+" must be a JSON number or null", nil)
		}
	}
	return nil
}

func optionalJSONNumber(record *core.Record, field string) (float64, bool, error) {
	raw := record.GetRaw(field)
	if raw == nil {
		return 0, false, nil
	}

	var value any
	switch v := raw.(type) {
	case types.JSONRaw:
		if len(v) == 0 || strings.TrimSpace(v.String()) == "null" {
			return 0, false, nil
		}
		decoder := json.NewDecoder(strings.NewReader(v.String()))
		decoder.UseNumber()
		if err := decoder.Decode(&value); err != nil {
			return 0, false, err
		}
	case float64:
		value = v
	case float32:
		value = float64(v)
	case int:
		value = float64(v)
	case int64:
		value = float64(v)
	default:
		return 0, false, fmt.Errorf("unsupported value type")
	}

	switch v := value.(type) {
	case json.Number:
		parsed, err := v.Float64()
		if err != nil {
			return 0, false, err
		}
		if math.IsInf(parsed, 0) || math.IsNaN(parsed) {
			return 0, false, fmt.Errorf("invalid number")
		}
		return parsed, true, nil
	case float64:
		if math.IsInf(v, 0) || math.IsNaN(v) {
			return 0, false, fmt.Errorf("invalid number")
		}
		return v, true, nil
	default:
		return 0, false, fmt.Errorf("not a number")
	}
}
