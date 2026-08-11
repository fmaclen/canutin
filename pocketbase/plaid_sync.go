package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

var (
	errPlaidSyncInProgress = errors.New("Plaid connection sync already running")
	syncingConnections     sync.Map
)

type plaidSyncSummary struct {
	SessionID string `json:"sessionId"`
	Created   int    `json:"created"`
	Skipped   int    `json:"skipped"`
	Failed    int    `json:"failed"`
	Status    string `json:"status"`
}

type plaidCashTransaction struct {
	AccountID               string  `json:"account_id"`
	TransactionID           string  `json:"transaction_id"`
	Date                    string  `json:"date"`
	Name                    string  `json:"name"`
	MerchantName            string  `json:"merchant_name"`
	OriginalDescription     string  `json:"original_description"`
	Amount                  float64 `json:"amount"`
	Pending                 bool    `json:"pending"`
	PersonalFinanceCategory *struct {
		Primary string `json:"primary"`
	} `json:"personal_finance_category"`
}

type plaidRemovedTransaction struct {
	AccountID     string `json:"account_id"`
	TransactionID string `json:"transaction_id"`
}

type plaidProviderAccount struct {
	AccountID string `json:"account_id"`
	Type      string `json:"type"`
	Balances  struct {
		Current                *float64 `json:"current"`
		ISOCurrencyCode        string   `json:"iso_currency_code"`
		UnofficialCurrencyCode string   `json:"unofficial_currency_code"`
	} `json:"balances"`
}

func writePlaidCashTransaction(app core.App, collection *core.Collection, sessionID, ownerID string, accounts map[string]*core.Record, transaction plaidCashTransaction, modified, reconcileExisting bool, claimedTransactions, providerTransactionIDs map[string]struct{}) (created, skipped bool, changedAccountID string, err error) {
	if transaction.Pending {
		return false, true, "", nil
	}

	account := accounts[transaction.AccountID]
	if account == nil {
		return false, true, "", nil
	}

	existing, findErr := app.FindFirstRecordByFilter("transactions",
		"account = {:account} && externalId = {:externalId} && owner = {:owner}",
		map[string]any{"account": account.Id, "externalId": transaction.TransactionID, "owner": ownerID},
	)
	if findErr == nil && !modified {
		claimedTransactions[existing.Id] = struct{}{}
		return false, true, "", nil
	}
	if findErr != nil && !errors.Is(findErr, sql.ErrNoRows) {
		return false, false, "", fmt.Errorf("find transaction: %w", findErr)
	}

	description := strings.TrimSpace(transaction.OriginalDescription)
	if description == "" {
		description = strings.TrimSpace(transaction.MerchantName)
	}
	if description == "" {
		description = strings.TrimSpace(transaction.Name)
	}
	value := -transaction.Amount

	record := existing
	if record == nil && reconcileExisting {
		// Initial history can overlap an account's prior import. Only an unambiguous exact match is
		// safe to adopt because the Plaid transaction ID is the durable identity after this sync.
		start, end := pbDateRange(transaction.Date)
		candidates, err := app.FindRecordsByFilter("transactions",
			"account = {:account} && date >= {:start} && date < {:end} && value = {:value} && owner = {:owner}",
			"", 0, 0,
			map[string]any{
				"account": account.Id,
				"start":   start,
				"end":     end,
				"value":   value,
				"owner":   ownerID,
			},
		)
		if err != nil {
			return false, false, "", fmt.Errorf("find reconciliation candidates: %w", err)
		}
		var match *core.Record
		for _, candidate := range candidates {
			_, claimed := claimedTransactions[candidate.Id]
			_, belongsToPlaidBatch := providerTransactionIDs[candidate.GetString("externalId")]
			if claimed || belongsToPlaidBatch || normalizeDescription(candidate.GetString("description")) != normalizeDescription(description) {
				continue
			}
			if match != nil {
				match = nil
				break
			}
			match = candidate
		}
		if match != nil {
			record = match
			record.Set("externalId", transaction.TransactionID)
		}
	}
	if record == nil {
		record = core.NewRecord(collection)
		created = true
		record.Set("account", account.Id)
		record.Set("externalId", transaction.TransactionID)
		record.Set("owner", ownerID)
		record.Set("importSession", sessionID)
		if transaction.PersonalFinanceCategory != nil {
			category := strings.TrimSpace(transaction.PersonalFinanceCategory.Primary)
			if category == "TRANSFER_IN" || category == "TRANSFER_OUT" {
				record.Set("excluded", time.Now().UTC().Format(time.RFC3339Nano))
			}
			if category != "" {
				labelName := strings.ToLower(strings.ReplaceAll(category, "_", " "))
				labelName = strings.ToUpper(labelName[:1]) + labelName[1:]
				label, _, err := findOrCreate(app,
					"transactionLabels", "name = {:name} && owner = {:owner}",
					map[string]any{"name": labelName, "owner": ownerID},
					map[string]any{"name": labelName, "owner": ownerID},
				)
				if err != nil {
					return false, false, "", fmt.Errorf("find or create transaction label: %w", err)
				}
				record.Set("labels", []string{label.Id})
			}
		}
	}
	record.Set("date", transaction.Date)
	record.Set("description", description)
	// Plaid reports money out as positive; Canutin stores expenses as negative values.
	record.Set("value", value)
	if err := app.Save(record); err != nil {
		return false, false, "", fmt.Errorf("save transaction: %w", err)
	}
	if reconcileExisting {
		claimedTransactions[record.Id] = struct{}{}
	}

	return created, false, account.Id, nil
}

func syncConnection(app core.App, connection *core.Record) (plaidSyncSummary, error) {
	if _, loaded := syncingConnections.LoadOrStore(connection.Id, struct{}{}); loaded {
		return plaidSyncSummary{}, errPlaidSyncInProgress
	}
	defer syncingConnections.Delete(connection.Id)

	config, err := plaidConfigFromEnv()
	if err != nil {
		return plaidSyncSummary{}, err
	}

	ownerID := connection.GetString("owner")
	linkedAccounts, err := app.FindRecordsByFilter("accounts",
		"connection = {:connection} && externalId != '' && owner = {:owner}",
		"", 0, 0,
		map[string]any{"connection": connection.Id, "owner": ownerID},
	)
	if err != nil {
		return plaidSyncSummary{}, fmt.Errorf("find linked accounts: %w", err)
	}
	accountsByPlaidID := make(map[string]*core.Record, len(linkedAccounts))
	accountIDs := make(map[string]struct{}, len(linkedAccounts))
	for _, account := range linkedAccounts {
		accountsByPlaidID[account.GetString("externalId")] = account
		accountIDs[account.Id] = struct{}{}
	}

	sessionCollection, err := app.FindCollectionByNameOrId("importSessions")
	if err != nil {
		return plaidSyncSummary{}, fmt.Errorf("find importSessions collection: %w", err)
	}
	session := core.NewRecord(sessionCollection)
	session.Set("label", "Plaid: "+connection.GetString("institutionName"))
	session.Set("owner", ownerID)
	session.Set("connection", connection.Id)
	session.Set("recordsCreated", 0)
	session.Set("recordsSkipped", 0)
	session.Set("recordsFailed", 0)
	session.Set("status", importStatusPending)
	if err := app.Save(session); err != nil {
		return plaidSyncSummary{}, fmt.Errorf("create import session: %w", err)
	}

	summary := plaidSyncSummary{SessionID: session.Id}
	investmentsPhaseSucceeded := false
	finish := func(sessionStatus, connectionStatus string, nextCursor *string) (plaidSyncSummary, error) {
		summary.Status = sessionStatus
		session.Set("recordsCreated", summary.Created)
		session.Set("recordsSkipped", summary.Skipped)
		session.Set("recordsFailed", summary.Failed)
		session.Set("status", sessionStatus)
		connection.Set("status", connectionStatus)
		if nextCursor != nil {
			connection.Set("cursor", *nextCursor)
		}
		if investmentsPhaseSucceeded {
			connection.Set("lastSyncedAt", time.Now().UTC())
		}

		err := app.RunInTransaction(func(txApp core.App) error {
			if err := txApp.Save(session); err != nil {
				return fmt.Errorf("save import session: %w", err)
			}
			if err := txApp.Save(connection); err != nil {
				return fmt.Errorf("save Plaid connection: %w", err)
			}
			return nil
		})
		return summary, err
	}
	failRun := func(cause error, connectionStatus string, forceFailed bool, nextCursor *string) (plaidSyncSummary, error) {
		summary.Failed++
		status := importStatusFailed
		if !forceFailed && summary.Created > 0 {
			status = importStatusCompletedWithErrors
		}
		logEvent("plaidSync", fmt.Sprintf("connection=%s session=%s failed", connection.Id, session.Id), cause)
		return finish(status, connectionStatus, nextCursor)
	}

	nextCursor := connection.GetString("cursor")
	reconcileExistingTransactions := nextCursor == ""
	var added []plaidCashTransaction
	var modified []plaidCashTransaction
	var removed []plaidRemovedTransaction
	for hasMore := true; hasMore; {
		request := struct {
			ClientID    string `json:"client_id"`
			Secret      string `json:"secret"`
			AccessToken string `json:"access_token"`
			Cursor      string `json:"cursor,omitempty"`
			Count       int    `json:"count"`
			Options     struct {
				IncludeOriginalDescription bool `json:"include_original_description"`
			} `json:"options"`
		}{
			ClientID:    config.clientID,
			Secret:      config.secret,
			AccessToken: connection.GetString("accessToken"),
			Cursor:      nextCursor,
			Count:       500,
		}
		request.Options.IncludeOriginalDescription = true
		var response struct {
			Added      []plaidCashTransaction    `json:"added"`
			Modified   []plaidCashTransaction    `json:"modified"`
			Removed    []plaidRemovedTransaction `json:"removed"`
			NextCursor string                    `json:"next_cursor"`
			HasMore    bool                      `json:"has_more"`
		}
		if err := plaidPost(context.Background(), config, "/transactions/sync", request, &response); err != nil {
			if errors.Is(err, errPlaidItemLoginRequired) {
				return failRun(err, "reauth_required", true, nil)
			}
			failedSummary, finishErr := failRun(err, "error", false, nil)
			return failedSummary, errors.Join(err, finishErr)
		}
		if response.HasMore && response.NextCursor == nextCursor {
			err := errors.New("Plaid returned has_more without advancing the cursor")
			failedSummary, finishErr := failRun(err, "error", false, nil)
			return failedSummary, errors.Join(err, finishErr)
		}
		added = append(added, response.Added...)
		modified = append(modified, response.Modified...)
		removed = append(removed, response.Removed...)
		nextCursor = response.NextCursor
		hasMore = response.HasMore
	}

	transactionCollection, err := app.FindCollectionByNameOrId("transactions")
	if err != nil {
		failedSummary, finishErr := failRun(err, "error", false, nil)
		return failedSummary, errors.Join(err, finishErr)
	}
	changedAccounts := map[string]struct{}{}
	claimedTransactions := map[string]struct{}{}
	providerTransactionIDs := make(map[string]struct{}, len(added)+len(modified)+len(removed))
	for _, transaction := range added {
		providerTransactionIDs[transaction.TransactionID] = struct{}{}
	}
	for _, transaction := range modified {
		providerTransactionIDs[transaction.TransactionID] = struct{}{}
	}
	for _, transaction := range removed {
		providerTransactionIDs[transaction.TransactionID] = struct{}{}
	}
	applicationFailures := 0
	recordFailure := func(collection, operation string, err error) {
		summary.Failed++
		logEvent("plaidSync", fmt.Sprintf("connection=%s session=%s collection=%s op=%s", connection.Id, session.Id, collection, operation), err)
	}
	cashSnapshotDataFailures := 0

	for _, batch := range []struct {
		transactions []plaidCashTransaction
		modified     bool
		operation    string
	}{{added, false, "add"}, {modified, true, "modify"}} {
		for _, transaction := range batch.transactions {
			created, skipped, accountID, err := writePlaidCashTransaction(app, transactionCollection, session.Id, ownerID, accountsByPlaidID, transaction, batch.modified, !batch.modified && reconcileExistingTransactions, claimedTransactions, providerTransactionIDs)
			if err != nil {
				applicationFailures++
				recordFailure("transactions", batch.operation, err)
				continue
			}
			if created {
				summary.Created++
			}
			if skipped {
				summary.Skipped++
			}
			if accountID != "" {
				changedAccounts[accountID] = struct{}{}
			}
		}
	}
	for _, transaction := range removed {
		if transaction.AccountID != "" && accountsByPlaidID[transaction.AccountID] == nil {
			summary.Skipped++
			continue
		}
		records, err := app.FindRecordsByFilter("transactions",
			"externalId = {:externalId} && owner = {:owner}", "", 0, 0,
			map[string]any{"externalId": transaction.TransactionID, "owner": ownerID},
		)
		if err != nil {
			applicationFailures++
			recordFailure("transactions", "find removed", err)
			continue
		}
		linked := false
		for _, record := range records {
			accountID := record.GetString("account")
			if _, accountLinked := accountIDs[accountID]; !accountLinked {
				continue
			}
			linked = true
			if err := app.Delete(record); err != nil {
				applicationFailures++
				recordFailure("transactions", "remove", err)
				continue
			}
			changedAccounts[accountID] = struct{}{}
		}
		if !linked {
			summary.Skipped++
		}
	}
	var cursorAfterApplication *string
	if applicationFailures == 0 {
		cursorAfterApplication = &nextCursor
	}

	for accountID := range changedAccounts {
		if err := withAccountCalcLock(accountID, func() error {
			return recomputeDerivedBalance(app, accountID, session.Id)
		}); err != nil {
			recordFailure("accountBalances", "recompute derived", err)
		}
	}

	var accountsResponse struct {
		Accounts []plaidProviderAccount `json:"accounts"`
	}
	if err := plaidPost(context.Background(), config, "/accounts/get", struct {
		ClientID    string `json:"client_id"`
		Secret      string `json:"secret"`
		AccessToken string `json:"access_token"`
	}{
		ClientID:    config.clientID,
		Secret:      config.secret,
		AccessToken: connection.GetString("accessToken"),
	}, &accountsResponse); err != nil {
		if errors.Is(err, errPlaidItemLoginRequired) {
			return failRun(err, "reauth_required", true, cursorAfterApplication)
		}
		failedSummary, finishErr := failRun(err, "error", false, cursorAfterApplication)
		return failedSummary, errors.Join(err, finishErr)
	}

	balanceCollection, err := app.FindCollectionByNameOrId("accountBalances")
	if err != nil {
		failedSummary, finishErr := failRun(err, "error", false, cursorAfterApplication)
		return failedSummary, errors.Join(err, finishErr)
	}
	asOf := time.Now().UTC()
	cashAsOf := asOf.Truncate(24 * time.Hour)
	writeCashSnapshot := func(account *core.Record, value float64) {
		start, end := pbDateRange(asOf.Format("2006-01-02"))
		_, err := app.FindFirstRecordByFilter("accountBalances",
			"account = {:account} && asOf >= {:start} && asOf < {:end} && value = {:value} && owner = {:owner}",
			map[string]any{
				"account": account.Id,
				"start":   start,
				"end":     end,
				"value":   value,
				"owner":   ownerID,
			},
		)
		if err == nil {
			summary.Skipped++
			return
		}
		if !errors.Is(err, sql.ErrNoRows) {
			recordFailure("accountBalances", "find duplicate", err)
			return
		}

		balance := core.NewRecord(balanceCollection)
		balance.Set("account", account.Id)
		balance.Set("value", value)
		balance.Set("asOf", cashAsOf)
		balance.Set("owner", ownerID)
		balance.Set("importSession", session.Id)
		balance.Set("source", "import")
		if err := app.Save(balance); err != nil {
			recordFailure("accountBalances", "save snapshot", err)
			return
		}
		summary.Created++
	}
	registeredCurrencies := map[string]bool{}
	var investmentAccounts []plaidProviderAccount
	for _, providerAccount := range accountsResponse.Accounts {
		account := accountsByPlaidID[providerAccount.AccountID]
		if account == nil {
			continue
		}
		if providerAccount.Type == "investment" {
			investmentAccounts = append(investmentAccounts, providerAccount)
			continue
		}

		currency := strings.TrimSpace(providerAccount.Balances.ISOCurrencyCode)
		if currency == "" {
			currency = strings.TrimSpace(providerAccount.Balances.UnofficialCurrencyCode)
		}
		currencyReady := true
		if currency != "" {
			if ready, seen := registeredCurrencies[currency]; seen {
				currencyReady = ready
			} else {
				_, created, err := ensureCurrencyRecord(app, ownerID, currency, currency, currency != "USD")
				if err != nil {
					recordFailure("currencies", "register", err)
					currencyReady = false
				} else if created {
					summary.Created++
				} else {
					summary.Skipped++
				}
				registeredCurrencies[currency] = currencyReady
			}
		}
		if !currencyReady {
			continue
		}
		currentBalance := plaidBalanceForCanutin(providerAccount.Type, providerAccount.Balances.Current)
		// A reported zero is a real balance; nil means Plaid did not provide a current balance.
		if currentBalance == nil {
			recordFailure("accountBalances", "derive cash snapshot", errors.New("current balance is unavailable"))
			cashSnapshotDataFailures++
			continue
		}

		writeCashSnapshot(account, *currentBalance)
	}

	investmentFailuresBefore := summary.Failed
	investmentCashFailures := 0
	investmentsAvailable := true
	if len(investmentAccounts) > 0 {
		investmentAccountIDs := make([]string, len(investmentAccounts))
		for index, providerAccount := range investmentAccounts {
			investmentAccountIDs[index] = providerAccount.AccountID
		}
		providerSecurities := map[string]plaidInvestmentSecurity{}
		var holdings []plaidHolding
		var investmentTransactions []plaidInvestmentTransaction
		holdingsFetched := false

		holdingsRequest := struct {
			ClientID    string `json:"client_id"`
			Secret      string `json:"secret"`
			AccessToken string `json:"access_token"`
			Options     struct {
				AccountIDs []string `json:"account_ids"`
			} `json:"options"`
		}{
			ClientID:    config.clientID,
			Secret:      config.secret,
			AccessToken: connection.GetString("accessToken"),
		}
		holdingsRequest.Options.AccountIDs = investmentAccountIDs
		var holdingsResponse struct {
			Holdings   []plaidHolding            `json:"holdings"`
			Securities []plaidInvestmentSecurity `json:"securities"`
		}
		err := plaidPost(context.Background(), config, "/investments/holdings/get", holdingsRequest, &holdingsResponse)
		if err != nil {
			if errors.Is(err, errPlaidInvestmentsUnavailable) {
				logEvent("plaidSync", fmt.Sprintf("connection=%s session=%s investments skipped", connection.Id, session.Id), err)
				investmentsAvailable = false
			} else {
				recordFailure("securityBalances", "fetch holdings", err)
			}
		} else {
			holdingsFetched = true
			holdings = holdingsResponse.Holdings
			for _, security := range holdingsResponse.Securities {
				providerSecurities[security.SecurityID] = security
			}
		}

		if investmentsAvailable {
			startDate := "1990-01-01"
			if lastSyncedAt := connection.GetDateTime("lastSyncedAt"); !lastSyncedAt.IsZero() {
				startDate = lastSyncedAt.Time().UTC().AddDate(0, 0, -30).Format("2006-01-02")
			}
			endDate := asOf.Format("2006-01-02")
			for offset := 0; ; {
				request := struct {
					ClientID    string `json:"client_id"`
					Secret      string `json:"secret"`
					AccessToken string `json:"access_token"`
					StartDate   string `json:"start_date"`
					EndDate     string `json:"end_date"`
					Options     struct {
						AccountIDs []string `json:"account_ids"`
						Count      int      `json:"count"`
						Offset     int      `json:"offset"`
					} `json:"options"`
				}{
					ClientID:    config.clientID,
					Secret:      config.secret,
					AccessToken: connection.GetString("accessToken"),
					StartDate:   startDate,
					EndDate:     endDate,
				}
				request.Options.AccountIDs = investmentAccountIDs
				request.Options.Count = 500
				request.Options.Offset = offset
				var response struct {
					InvestmentTransactions      []plaidInvestmentTransaction `json:"investment_transactions"`
					Securities                  []plaidInvestmentSecurity    `json:"securities"`
					TotalInvestmentTransactions int                          `json:"total_investment_transactions"`
				}
				err := plaidPost(context.Background(), config, "/investments/transactions/get", request, &response)
				if err != nil {
					if errors.Is(err, errPlaidInvestmentsUnavailable) {
						logEvent("plaidSync", fmt.Sprintf("connection=%s session=%s investments skipped", connection.Id, session.Id), err)
						investmentsAvailable = false
					} else {
						recordFailure("securityTransactions", "fetch transactions", err)
					}
					break
				}

				investmentTransactions = append(investmentTransactions, response.InvestmentTransactions...)
				for _, security := range response.Securities {
					providerSecurities[security.SecurityID] = security
				}
				offset += len(response.InvestmentTransactions)
				if offset >= response.TotalInvestmentTransactions {
					break
				}
				if len(response.InvestmentTransactions) == 0 {
					recordFailure("securityTransactions", "paginate transactions", errors.New("Plaid returned more investment transactions without advancing the offset"))
					break
				}
			}
		}

		if investmentsAvailable && holdingsFetched {
			holdingValues := map[string]float64{}
			unknownHoldingValues := map[string]bool{}
			for _, holding := range holdings {
				if holding.InstitutionValue == nil {
					unknownHoldingValues[holding.AccountID] = true
					continue
				}
				holdingValues[holding.AccountID] += *holding.InstitutionValue
			}

			for _, providerAccount := range investmentAccounts {
				account := accountsByPlaidID[providerAccount.AccountID]
				currentBalance := plaidBalanceForCanutin(providerAccount.Type, providerAccount.Balances.Current)
				if currentBalance == nil || unknownHoldingValues[providerAccount.AccountID] {
					reason := errors.New("current balance is unavailable")
					if currentBalance != nil {
						reason = errors.New("holding value is unavailable")
					}
					recordFailure("accountBalances", "derive cash snapshot", reason)
					cashSnapshotDataFailures++
					investmentCashFailures++
					continue
				}

				// Plaid's investment current balance is the total account value. Some institutions
				// include cash as a holding and others do not, so the remainder is the cash snapshot.
				cashBalance := *currentBalance - holdingValues[providerAccount.AccountID]
				writeCashSnapshot(account, cashBalance)
			}
		}

		neededSecurityIDs := map[string]struct{}{}
		for _, holding := range holdings {
			if holding.SecurityID != "" {
				neededSecurityIDs[holding.SecurityID] = struct{}{}
			}
		}
		for _, transaction := range investmentTransactions {
			if transaction.SecurityID != "" {
				neededSecurityIDs[transaction.SecurityID] = struct{}{}
			}
		}

		securityIDs := map[string]string{}
		securityCollection, err := app.FindCollectionByNameOrId("securities")
		if err != nil {
			recordFailure("securities", "find collection", err)
		} else {
			for externalID := range neededSecurityIDs {
				security, ok := providerSecurities[externalID]
				if !ok {
					continue
				}

				existing, findErr := app.FindFirstRecordByFilter("securities",
					"externalId = {:externalId} && owner = {:owner}",
					map[string]any{"externalId": externalID, "owner": ownerID},
				)
				if findErr == nil {
					securityIDs[externalID] = existing.Id
					summary.Skipped++
					continue
				}
				if !errors.Is(findErr, sql.ErrNoRows) {
					recordFailure("securities", "find external id", findErr)
					continue
				}

				name := normalizeSecurityName(security.Name)
				symbol := normalizeSecuritySymbol(security.TickerSymbol)
				if name == "" {
					name = symbol
				}
				if name == "" {
					name = externalID
				}
				filter := "normalizedName = {:normalizedName} && owner = {:owner}"
				params := map[string]any{"normalizedName": securityNameKey(name), "owner": ownerID}
				if symbol != "" {
					filter = "(symbol = {:symbol} || normalizedName = {:normalizedName}) && owner = {:owner}"
					params = map[string]any{"symbol": symbol, "normalizedName": securityNameKey(name), "owner": ownerID}
				}
				existing, findErr = app.FindFirstRecordByFilter("securities", filter, params)
				if findErr == nil {
					existing.Set("externalId", externalID)
					if err := app.Save(existing); err != nil {
						recordFailure("securities", "stamp external id", err)
						continue
					}
					securityIDs[externalID] = existing.Id
					summary.Skipped++
					continue
				}
				if !errors.Is(findErr, sql.ErrNoRows) {
					recordFailure("securities", "find name or symbol", findErr)
					continue
				}

				currency := strings.TrimSpace(security.ISOCurrencyCode)
				if currency == "" {
					currency = "USD"
				}
				currencyReady := true
				if ready, seen := registeredCurrencies[currency]; seen {
					currencyReady = ready
				} else {
					_, created, err := ensureCurrencyRecord(app, ownerID, currency, currency, currency != "USD")
					if err != nil {
						recordFailure("currencies", "register investment security", err)
						currencyReady = false
					} else if created {
						summary.Created++
					} else {
						summary.Skipped++
					}
					registeredCurrencies[currency] = currencyReady
				}
				if !currencyReady {
					continue
				}

				record := core.NewRecord(securityCollection)
				record.Set("name", name)
				record.Set("symbol", symbol)
				record.Set("currency", currency)
				record.Set("externalId", externalID)
				record.Set("owner", ownerID)
				record.Set("importSession", session.Id)
				if err := app.Save(record); err != nil {
					recordFailure("securities", "save", err)
					continue
				}
				securityIDs[externalID] = record.Id
				summary.Created++
			}
		}

		securityBalanceCollection, err := app.FindCollectionByNameOrId("securityBalances")
		if err != nil {
			recordFailure("securityBalances", "find collection", err)
		} else {
			for _, holding := range holdings {
				account := accountsByPlaidID[holding.AccountID]
				securityID := securityIDs[holding.SecurityID]
				if account == nil || securityID == "" {
					summary.Skipped++
					continue
				}

				if hasMatchingSecurityImportRecord(app, "securityBalances",
					"account = {:account} && security = {:security} && asOf = {:asOf} && owner = {:owner}",
					map[string]any{
						"account":  account.Id,
						"security": securityID,
						"asOf":     asOf.Format("2006-01-02") + " 00:00:00.000Z",
						"owner":    ownerID,
					},
					"",
					[]optionalImportNumber{
						{field: "quantity", value: holding.Quantity},
						{field: "price", value: holding.InstitutionPrice},
						{field: "value", value: holding.InstitutionValue},
						{field: "costBasis", value: holding.CostBasis},
					},
				) {
					summary.Skipped++
					continue
				}

				record := core.NewRecord(securityBalanceCollection)
				record.Set("account", account.Id)
				record.Set("security", securityID)
				record.Set("asOf", asOf)
				record.Set("owner", ownerID)
				record.Set("importSession", session.Id)
				// Omitted JSON numbers remain unknown; a reported zero must be stored to stop carry-forward.
				setOptionalNumber(record, "quantity", holding.Quantity)
				setOptionalNumber(record, "price", holding.InstitutionPrice)
				setOptionalNumber(record, "value", holding.InstitutionValue)
				setOptionalNumber(record, "costBasis", holding.CostBasis)
				if err := app.Save(record); err != nil {
					recordFailure("securityBalances", "save snapshot", err)
					continue
				}
				summary.Created++
			}
		}

		securityTransactionCollection, err := app.FindCollectionByNameOrId("securityTransactions")
		if err != nil {
			recordFailure("securityTransactions", "find collection", err)
		} else {
			for _, transaction := range investmentTransactions {
				account := accountsByPlaidID[transaction.AccountID]
				securityID := securityIDs[transaction.SecurityID]
				if account == nil || securityID == "" {
					summary.Skipped++
					continue
				}

				_, findErr := app.FindFirstRecordByFilter("securityTransactions",
					"account = {:account} && externalId = {:externalId} && security = {:security} && owner = {:owner}",
					map[string]any{
						"account":    account.Id,
						"externalId": transaction.InvestmentTransactionID,
						"security":   securityID,
						"owner":      ownerID,
					},
				)
				if findErr == nil {
					summary.Skipped++
					continue
				}
				if !errors.Is(findErr, sql.ErrNoRows) {
					recordFailure("securityTransactions", "find duplicate", findErr)
					continue
				}

				amount := transaction.Amount
				if amount != nil {
					// Plaid uses positive for cash debits; Canutin sums and colors positive amounts as inflows.
					value := -*amount
					amount = &value
				}
				description := transaction.Name
				if strings.TrimSpace(description) == "" {
					description = transaction.Type
				}
				record := core.NewRecord(securityTransactionCollection)
				record.Set("account", account.Id)
				record.Set("security", securityID)
				record.Set("externalId", transaction.InvestmentTransactionID)
				record.Set("date", transaction.Date)
				record.Set("type", transaction.Type)
				record.Set("subtype", transaction.Subtype)
				record.Set("name", transaction.Name)
				record.Set("description", description)
				record.Set("owner", ownerID)
				record.Set("importSession", session.Id)
				setOptionalNumber(record, "quantity", transaction.Quantity)
				setOptionalNumber(record, "price", transaction.Price)
				setOptionalNumber(record, "amount", amount)
				setOptionalNumber(record, "fees", transaction.Fees)
				if err := app.Save(record); err != nil {
					recordFailure("securityTransactions", "save", err)
					continue
				}
				summary.Created++
			}
		}
	}
	// Cash data quality does not indicate missed investment transactions, so those failures do not
	// hold back the transaction window. Unavailable or incomplete investment fetches still do.
	investmentsPhaseSucceeded = investmentsAvailable && summary.Failed == investmentFailuresBefore+investmentCashFailures

	if summary.Failed > 0 {
		status := importStatusFailed
		if summary.Created > 0 || cashSnapshotDataFailures > 0 || summary.Failed > investmentFailuresBefore {
			status = importStatusCompletedWithErrors
		}
		return finish(status, "error", cursorAfterApplication)
	}
	return finish(importStatusCompleted, "ok", &nextCursor)
}

func plaidSyncHandler(app core.App) func(*core.RequestEvent) error {
	return func(requestEvent *core.RequestEvent) error {
		connection, err := app.FindRecordById("plaidConnections", requestEvent.Request.PathValue("id"))
		if errors.Is(err, sql.ErrNoRows) || err == nil && connection.GetString("owner") != requestEvent.Auth.Id {
			return requestEvent.NotFoundError("Plaid connection not found", nil)
		}
		if err != nil {
			logEvent("plaidSync", "failed to find Plaid connection", err)
			return requestEvent.InternalServerError("Failed to sync Plaid connection", nil)
		}

		summary, err := syncConnection(app, connection)
		if errors.Is(err, errPlaidSyncInProgress) {
			return requestEvent.JSON(http.StatusConflict, map[string]string{"error": "plaid_sync_in_progress"})
		}
		if err != nil {
			logEvent("plaidSync", fmt.Sprintf("connection=%s request failed", connection.Id), err)
			if errors.Is(err, errPlaidNotConfigured) {
				return requestEvent.JSON(http.StatusServiceUnavailable, map[string]string{"error": plaidNotConfiguredCode})
			}
			if errors.Is(err, errPlaidRequestFailed) {
				return requestEvent.JSON(http.StatusBadGateway, map[string]string{
					"error":   plaidRequestFailedCode,
					"message": plaidRequestFailedMessage,
				})
			}
			return requestEvent.InternalServerError("Failed to sync Plaid connection", nil)
		}

		return requestEvent.JSON(http.StatusOK, summary)
	}
}

func registerPlaid(app core.App) {
	app.Cron().MustAdd("plaidSync", "0 6 * * *", func() {
		if _, err := plaidConfigFromEnv(); err != nil {
			return
		}

		connections, err := app.FindRecordsByFilter("plaidConnections", "status != 'reauth_required'", "", 0, 0)
		if err != nil {
			logEvent("plaidSync", "nightly sync failed to list connections", err)
			return
		}
		for _, connection := range connections {
			summary, err := syncConnection(app, connection)
			if errors.Is(err, errPlaidSyncInProgress) {
				continue
			}
			if err != nil {
				logEvent("plaidSync", fmt.Sprintf("connection=%s nightly sync failed", connection.Id), err)
				continue
			}
			if summary.Status != importStatusCompleted {
				logEvent("plaidSync", fmt.Sprintf("connection=%s nightly sync finished status=%s", connection.Id, summary.Status), nil)
			}
		}
	})
}
