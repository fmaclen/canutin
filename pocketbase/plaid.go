package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

const (
	plaidSandboxURL           = "https://sandbox.plaid.com"
	plaidProductionURL        = "https://production.plaid.com"
	plaidNotConfiguredCode    = "plaid_not_configured"
	plaidRequestFailedCode    = "plaid_request_failed"
	plaidRequestFailedMessage = "Plaid is temporarily unavailable"
	maxPlaidErrorBodyBytes    = 64 << 10
)

var (
	errPlaidNotConfigured          = errors.New("Plaid is not configured")
	errPlaidRequestFailed          = errors.New("Plaid request failed")
	errPlaidItemLoginRequired      = errors.New("Plaid item login required")
	errPlaidInvestmentsUnavailable = errors.New("Plaid investments unavailable")
	plaidHTTPClient                = &http.Client{Timeout: 20 * time.Second}
)

type plaidAPIError struct {
	Path       string
	StatusCode int
	ErrorType  string
	ErrorCode  string
	RequestID  string
	decodeErr  error
}

func (e *plaidAPIError) Error() string {
	if e.decodeErr != nil {
		return fmt.Sprintf("%s returned status %d (invalid error response: %v)", e.Path, e.StatusCode, e.decodeErr)
	}
	return fmt.Sprintf("%s returned status %d (error_type=%s error_code=%s request_id=%s)",
		e.Path, e.StatusCode, e.ErrorType, e.ErrorCode, e.RequestID)
}

func (e *plaidAPIError) Unwrap() error {
	return errPlaidRequestFailed
}

func (e *plaidAPIError) Is(target error) bool {
	return target == errPlaidItemLoginRequired && e.ErrorCode == "ITEM_LOGIN_REQUIRED" ||
		target == errPlaidInvestmentsUnavailable &&
			(e.ErrorCode == "PRODUCTS_NOT_SUPPORTED" || e.ErrorCode == "PRODUCT_NOT_ENABLED" || e.ErrorCode == "PRODUCT_NOT_READY")
}

type plaidConfig struct {
	clientID string
	secret   string
	baseURL  string
}

type plaidExchangeBody struct {
	PublicToken     string `json:"publicToken"`
	InstitutionName string `json:"institutionName"`
}

type plaidLinkTokenBody struct {
	ConnectionID string `json:"connectionId"`
}

type plaidAccountResponse struct {
	PlaidAccountID string   `json:"plaidAccountId"`
	Name           string   `json:"name"`
	Mask           string   `json:"mask"`
	Type           string   `json:"type"`
	Subtype        string   `json:"subtype"`
	Currency       string   `json:"currency"`
	Balance        *float64 `json:"balance"`
}

type plaidInvestmentSecurity struct {
	SecurityID      string `json:"security_id"`
	Name            string `json:"name"`
	TickerSymbol    string `json:"ticker_symbol"`
	Type            string `json:"type"`
	ISOCurrencyCode string `json:"iso_currency_code"`
}

type plaidHolding struct {
	AccountID        string   `json:"account_id"`
	SecurityID       string   `json:"security_id"`
	Quantity         *float64 `json:"quantity"`
	InstitutionPrice *float64 `json:"institution_price"`
	InstitutionValue *float64 `json:"institution_value"`
	CostBasis        *float64 `json:"cost_basis"`
}

type plaidInvestmentTransaction struct {
	AccountID               string   `json:"account_id"`
	SecurityID              string   `json:"security_id"`
	InvestmentTransactionID string   `json:"investment_transaction_id"`
	Date                    string   `json:"date"`
	Type                    string   `json:"type"`
	Subtype                 string   `json:"subtype"`
	Name                    string   `json:"name"`
	Quantity                *float64 `json:"quantity"`
	Price                   *float64 `json:"price"`
	Amount                  *float64 `json:"amount"`
	Fees                    *float64 `json:"fees"`
}

// Canutin stores debt balances as negative values; Plaid reports credit and loan balances as positive amounts owed.
func plaidBalanceForCanutin(accountType string, current *float64) *float64 {
	if current == nil || accountType != "credit" && accountType != "loan" {
		return current
	}
	balance := -*current
	return &balance
}

func plaidConfigFromEnv() (plaidConfig, error) {
	config := plaidConfig{
		clientID: os.Getenv("PLAID_CLIENT_ID"),
		secret:   os.Getenv("PLAID_SECRET"),
		baseURL:  plaidSandboxURL,
	}
	if config.clientID == "" || config.secret == "" {
		return plaidConfig{}, fmt.Errorf("%w: PLAID_CLIENT_ID and PLAID_SECRET are required", errPlaidNotConfigured)
	}

	switch os.Getenv("PLAID_ENV") {
	case "", "sandbox":
	case "production":
		config.baseURL = plaidProductionURL
	default:
		return plaidConfig{}, fmt.Errorf("%w: PLAID_ENV must be sandbox or production", errPlaidNotConfigured)
	}

	return config, nil
}

func plaidPost(ctx context.Context, config plaidConfig, path string, body, response any) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("%w: encode %s request: %v", errPlaidRequestFailed, path, err)
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, config.baseURL+path, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("%w: create %s request: %v", errPlaidRequestFailed, path, err)
	}
	request.Header.Set("Content-Type", "application/json")

	providerResponse, err := plaidHTTPClient.Do(request)
	if err != nil {
		return fmt.Errorf("%w: send %s request: %v", errPlaidRequestFailed, path, err)
	}
	defer providerResponse.Body.Close()

	if providerResponse.StatusCode < http.StatusOK || providerResponse.StatusCode >= http.StatusMultipleChoices {
		var details struct {
			ErrorType string `json:"error_type"`
			ErrorCode string `json:"error_code"`
			RequestID string `json:"request_id"`
		}
		decodeErr := json.NewDecoder(io.LimitReader(providerResponse.Body, maxPlaidErrorBodyBytes)).Decode(&details)
		return &plaidAPIError{
			Path:       path,
			StatusCode: providerResponse.StatusCode,
			ErrorType:  details.ErrorType,
			ErrorCode:  details.ErrorCode,
			RequestID:  details.RequestID,
			decodeErr:  decodeErr,
		}
	}
	if err := json.NewDecoder(providerResponse.Body).Decode(response); err != nil {
		return fmt.Errorf("%w: decode %s response: %v", errPlaidRequestFailed, path, err)
	}
	return nil
}

func plaidBadGateway(re *core.RequestEvent, operation string, err error) error {
	logEvent("plaid", operation, err)
	return re.JSON(http.StatusBadGateway, map[string]string{
		"error":   plaidRequestFailedCode,
		"message": plaidRequestFailedMessage,
	})
}

func plaidLinkTokenHandler(app core.App) func(*core.RequestEvent) error {
	return func(re *core.RequestEvent) error {
		var body plaidLinkTokenBody
		if err := re.BindBody(&body); err != nil {
			return re.BadRequestError("Invalid request body", err)
		}

		var accessToken string
		if body.ConnectionID != "" {
			connection, err := app.FindRecordById("plaidConnections", body.ConnectionID)
			if errors.Is(err, sql.ErrNoRows) || err == nil && connection.GetString("owner") != re.Auth.Id {
				return re.NotFoundError("Plaid connection not found", nil)
			}
			if err != nil {
				logEvent("plaid", "failed to find Plaid connection for link token", err)
				return re.InternalServerError("Failed to create Plaid link token", nil)
			}
			accessToken = connection.GetString("accessToken")
			if accessToken == "" {
				logEvent("plaid", "failed to create update link token", errors.New("Plaid connection access token is missing"))
				return re.InternalServerError("Failed to create Plaid link token", nil)
			}
		}

		config, err := plaidConfigFromEnv()
		if err != nil {
			logEvent("plaid", "link token request rejected", err)
			return re.JSON(http.StatusServiceUnavailable, map[string]string{"error": plaidNotConfiguredCode})
		}

		request := struct {
			ClientID         string   `json:"client_id"`
			Secret           string   `json:"secret"`
			ClientName       string   `json:"client_name"`
			Language         string   `json:"language"`
			CountryCodes     []string `json:"country_codes"`
			Products         []string `json:"products,omitempty"`
			OptionalProducts []string `json:"optional_products,omitempty"`
			AccessToken      string   `json:"access_token,omitempty"`
			User             struct {
				ClientUserID string `json:"client_user_id"`
			} `json:"user"`
		}{
			ClientID:     config.clientID,
			Secret:       config.secret,
			ClientName:   "Canutin",
			Language:     "en",
			CountryCodes: []string{"US"},
			AccessToken:  accessToken,
		}
		if accessToken == "" {
			request.Products = []string{"transactions"}
			request.OptionalProducts = []string{"investments"}
		}
		request.User.ClientUserID = re.Auth.Id

		var response struct {
			LinkToken string `json:"link_token"`
		}
		if err := plaidPost(re.Request.Context(), config, "/link/token/create", request, &response); err != nil {
			return plaidBadGateway(re, "link token request failed", err)
		}
		if response.LinkToken == "" {
			return plaidBadGateway(re, "link token request failed",
				fmt.Errorf("%w: link token missing from response", errPlaidRequestFailed))
		}

		return re.JSON(http.StatusOK, map[string]string{"linkToken": response.LinkToken})
	}
}

func plaidExchangeHandler(app core.App) func(*core.RequestEvent) error {
	return func(re *core.RequestEvent) error {
		config, err := plaidConfigFromEnv()
		if err != nil {
			logEvent("plaid", "public token exchange rejected", err)
			return re.JSON(http.StatusServiceUnavailable, map[string]string{"error": plaidNotConfiguredCode})
		}

		var body plaidExchangeBody
		if err := re.BindBody(&body); err != nil {
			return re.BadRequestError("Invalid request body", err)
		}
		if body.PublicToken == "" {
			return re.BadRequestError("publicToken is required", nil)
		}

		var exchangeResponse struct {
			AccessToken string `json:"access_token"`
			ItemID      string `json:"item_id"`
		}
		if err := plaidPost(re.Request.Context(), config, "/item/public_token/exchange", struct {
			ClientID    string `json:"client_id"`
			Secret      string `json:"secret"`
			PublicToken string `json:"public_token"`
		}{
			ClientID:    config.clientID,
			Secret:      config.secret,
			PublicToken: body.PublicToken,
		}, &exchangeResponse); err != nil {
			return plaidBadGateway(re, "public token exchange failed", err)
		}
		if exchangeResponse.AccessToken == "" || exchangeResponse.ItemID == "" {
			return plaidBadGateway(re, "public token exchange failed",
				fmt.Errorf("%w: access token or item id missing from response", errPlaidRequestFailed))
		}

		var accountsResponse struct {
			Accounts []struct {
				AccountID string `json:"account_id"`
				Name      string `json:"name"`
				Mask      string `json:"mask"`
				Type      string `json:"type"`
				Subtype   string `json:"subtype"`
				Balances  struct {
					Current                *float64 `json:"current"`
					ISOCurrencyCode        string   `json:"iso_currency_code"`
					UnofficialCurrencyCode string   `json:"unofficial_currency_code"`
				} `json:"balances"`
			} `json:"accounts"`
		}
		if err := plaidPost(re.Request.Context(), config, "/accounts/get", struct {
			ClientID    string `json:"client_id"`
			Secret      string `json:"secret"`
			AccessToken string `json:"access_token"`
		}{
			ClientID:    config.clientID,
			Secret:      config.secret,
			AccessToken: exchangeResponse.AccessToken,
		}, &accountsResponse); err != nil {
			return plaidBadGateway(re, "accounts request failed", err)
		}

		accounts := make([]plaidAccountResponse, len(accountsResponse.Accounts))
		for i, account := range accountsResponse.Accounts {
			currency := account.Balances.ISOCurrencyCode
			if currency == "" {
				currency = account.Balances.UnofficialCurrencyCode
			}
			accounts[i] = plaidAccountResponse{
				PlaidAccountID: account.AccountID,
				Name:           account.Name,
				Mask:           account.Mask,
				Type:           account.Type,
				Subtype:        account.Subtype,
				Currency:       currency,
				Balance:        plaidBalanceForCanutin(account.Type, account.Balances.Current),
			}
		}

		collection, err := app.FindCollectionByNameOrId("plaidConnections")
		if err != nil {
			logEvent("plaid", "failed to find plaidConnections collection", err)
			return re.InternalServerError("Failed to save Plaid connection", nil)
		}
		connection := core.NewRecord(collection)
		connection.Set("owner", re.Auth.Id)
		connection.Set("itemId", exchangeResponse.ItemID)
		connection.Set("institutionName", body.InstitutionName)
		connection.Set("accessToken", exchangeResponse.AccessToken)
		connection.Set("status", "ok")
		if err := app.Save(connection); err != nil {
			logEvent("plaid", "failed to save Plaid connection", err)
			return re.InternalServerError("Failed to save Plaid connection", nil)
		}

		return re.JSON(http.StatusOK, map[string]any{
			"connectionId": connection.Id,
			"accounts":     accounts,
		})
	}
}

func plaidUnlinkHandler(app core.App) func(*core.RequestEvent) error {
	return func(requestEvent *core.RequestEvent) error {
		connection, err := app.FindRecordById("plaidConnections", requestEvent.Request.PathValue("id"))
		if errors.Is(err, sql.ErrNoRows) || err == nil && connection.GetString("owner") != requestEvent.Auth.Id {
			return requestEvent.NotFoundError("Plaid connection not found", nil)
		}
		if err != nil {
			logEvent("plaid", "failed to find Plaid connection for unlink", err)
			return requestEvent.InternalServerError("Failed to unlink Plaid connection", nil)
		}

		if _, loaded := syncingConnections.LoadOrStore(connection.Id, struct{}{}); loaded {
			return requestEvent.JSON(http.StatusConflict, map[string]string{"error": "plaid_sync_in_progress"})
		}
		defer syncingConnections.Delete(connection.Id)

		config, err := plaidConfigFromEnv()
		if err == nil {
			err = plaidPost(requestEvent.Request.Context(), config, "/item/remove", struct {
				ClientID    string `json:"client_id"`
				Secret      string `json:"secret"`
				AccessToken string `json:"access_token"`
			}{
				ClientID:    config.clientID,
				Secret:      config.secret,
				AccessToken: connection.GetString("accessToken"),
			}, &struct{}{})
		}
		if err != nil {
			logEvent("plaid", fmt.Sprintf("connection=%s item removal failed", connection.Id), err)
		}

		accounts, err := app.FindRecordsByFilter("accounts", "connection = {:connection}", "", 0, 0,
			map[string]any{"connection": connection.Id})
		if err != nil {
			logEvent("plaid", fmt.Sprintf("connection=%s local unlink failed", connection.Id), fmt.Errorf("find linked accounts: %w", err))
			return requestEvent.InternalServerError("Failed to unlink Plaid connection", nil)
		}
		linkedAccounts := len(accounts)
		if err := app.Delete(connection); err != nil {
			logEvent("plaid", fmt.Sprintf("connection=%s local unlink failed", connection.Id), fmt.Errorf("delete Plaid connection: %w", err))
			return requestEvent.InternalServerError("Failed to unlink Plaid connection", nil)
		}

		return requestEvent.JSON(http.StatusOK, map[string]int{"accounts": linkedAccounts})
	}
}
