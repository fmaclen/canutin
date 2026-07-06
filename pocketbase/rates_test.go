package main

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

func withFXHTTPClient(client *http.Client, fn func()) {
	original := fxHTTPClient
	fxHTTPClient = client
	defer func() { fxHTTPClient = original }()
	fn()
}

func TestFetchUSDRateLowercasesLookupCode(t *testing.T) {
	withFXHTTPClient(&http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(`{"usd":{"eur":0.92}}`)),
		}, nil
	})}, func() {
		rate, err := fetchUSDRate("EUR", "2026-01-02")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if rate != 0.92 {
			t.Fatalf("rate = %v, want 0.92", rate)
		}
	})
}

func TestFetchUSDRateClassifiesCodeUnavailable(t *testing.T) {
	withFXHTTPClient(&http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(`{"usd":{"eur":0.92}}`)),
		}, nil
	})}, func() {
		_, err := fetchUSDRate("NOPE", "2026-01-02")
		if !errors.Is(err, errFXCodeUnavailable) {
			t.Fatalf("error = %v, want errFXCodeUnavailable", err)
		}
	})
}

func TestFetchUSDRateClassifiesRequestFailure(t *testing.T) {
	withFXHTTPClient(&http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		return nil, errors.New("dial failed")
	})}, func() {
		_, err := fetchUSDRate("EUR", "2026-01-02")
		if !errors.Is(err, errFXRequestFailed) {
			t.Fatalf("error = %v, want errFXRequestFailed", err)
		}
	})
}

func TestCurrencyOwnerIsImmutableForUserPatch(t *testing.T) {
	app := newRatesRequestTestApp(t)
	alice := seedRatesRequestUser(t, app, "rates-currency-alice@example.com")
	bob := seedRatesRequestUser(t, app, "rates-currency-bob@example.com")
	token := authTokenForTest(t, alice)

	for i, owner := range []string{"", bob.Id} {
		currency := seedRatesRequestCurrency(t, app, alice.Id, fmt.Sprintf("T%d", i+1))
		response := patchRatesRequestRecord(t, app, "currencies", currency.Id, token, fmt.Sprintf(`{"owner":%q}`, owner))
		if response.Code != http.StatusBadRequest {
			t.Fatalf("PATCH currencies owner to %q status = %d, want 400; body: %s", owner, response.Code, response.Body.String())
		}
	}

	currency := seedRatesRequestCurrency(t, app, alice.Id, "T3")
	response := patchRatesRequestRecord(t, app, "currencies", currency.Id, token, fmt.Sprintf(`{"owner":%q,"name":"Updated currency"}`, alice.Id))
	if response.Code != http.StatusOK {
		t.Fatalf("PATCH currencies unchanged owner status = %d, want 200; body: %s", response.Code, response.Body.String())
	}
	updated, err := app.FindRecordById("currencies", currency.Id)
	if err != nil {
		t.Fatalf("find updated currency: %v", err)
	}
	if updated.GetString("owner") != alice.Id {
		t.Fatalf("updated currency owner = %q, want %q", updated.GetString("owner"), alice.Id)
	}
	if updated.GetString("name") != "Updated currency" {
		t.Fatalf("updated currency name = %q, want Updated currency", updated.GetString("name"))
	}
}

func TestExchangeRateOwnerIsImmutableForUserPatch(t *testing.T) {
	app := newRatesRequestTestApp(t)
	alice := seedRatesRequestUser(t, app, "rates-exchange-alice@example.com")
	bob := seedRatesRequestUser(t, app, "rates-exchange-bob@example.com")
	token := authTokenForTest(t, alice)

	for i, owner := range []string{"", bob.Id} {
		rate := seedRatesRequestExchangeRate(t, app, alice.Id, fmt.Sprintf("R%d", i+1), fmt.Sprintf("2026-01-0%d", i+1), 2)
		response := patchRatesRequestRecord(t, app, "exchangeRates", rate.Id, token, fmt.Sprintf(`{"owner":%q}`, owner))
		if response.Code != http.StatusBadRequest {
			t.Fatalf("PATCH exchangeRates owner to %q status = %d, want 400; body: %s", owner, response.Code, response.Body.String())
		}
	}

	rate := seedRatesRequestExchangeRate(t, app, alice.Id, "R3", "2026-01-03", 2)
	response := patchRatesRequestRecord(t, app, "exchangeRates", rate.Id, token, fmt.Sprintf(`{"owner":%q,"rate":3.5}`, alice.Id))
	if response.Code != http.StatusOK {
		t.Fatalf("PATCH exchangeRates unchanged owner status = %d, want 200; body: %s", response.Code, response.Body.String())
	}
	updated, err := app.FindRecordById("exchangeRates", rate.Id)
	if err != nil {
		t.Fatalf("find updated exchange rate: %v", err)
	}
	if updated.GetString("owner") != alice.Id {
		t.Fatalf("updated exchange rate owner = %q, want %q", updated.GetString("owner"), alice.Id)
	}
	if updated.GetFloat("rate") != 3.5 {
		t.Fatalf("updated exchange rate value = %v, want 3.5", updated.GetFloat("rate"))
	}
}

func newRatesRequestTestApp(t *testing.T) *pocketbase.PocketBase {
	t.Helper()

	app := newDemoSeedTestApp(t)
	app.OnRecordUpdateRequest("currencies", "exchangeRates").BindFunc(validateOwnerImmutableUserUpdate)
	app.OnRecordCreateRequest("exchangeRates").BindFunc(validateExchangeRateWriteRequest)
	app.OnRecordUpdateRequest("exchangeRates").BindFunc(validateExchangeRateWriteRequest)
	return app
}

func seedRatesRequestUser(t *testing.T, app core.App, email string) *core.Record {
	t.Helper()

	collection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("find users collection: %v", err)
	}
	record := core.NewRecord(collection)
	record.SetEmail(email)
	record.SetPassword("123qweasdzxc")
	record.SetVerified(true)
	if err := app.Save(record); err != nil {
		t.Fatalf("save user %s: %v", email, err)
	}
	return record
}

func seedRatesRequestCurrency(t *testing.T, app core.App, owner string, code string) *core.Record {
	t.Helper()

	collection, err := app.FindCollectionByNameOrId("currencies")
	if err != nil {
		t.Fatalf("find currencies collection: %v", err)
	}
	record := core.NewRecord(collection)
	record.Set("owner", owner)
	record.Set("code", code)
	record.Set("name", code)
	record.Set("autoUpdate", false)
	if err := app.Save(record); err != nil {
		t.Fatalf("save currency %s: %v", code, err)
	}
	return record
}

func seedRatesRequestExchangeRate(t *testing.T, app core.App, owner string, code string, date string, rate float64) *core.Record {
	t.Helper()

	collection, err := app.FindCollectionByNameOrId("exchangeRates")
	if err != nil {
		t.Fatalf("find exchangeRates collection: %v", err)
	}
	start, _ := pbDateRange(date)
	record := core.NewRecord(collection)
	record.Set("owner", owner)
	record.Set("currency", code)
	record.Set("date", start)
	record.Set("rate", rate)
	record.Set("source", "manual")
	if err := app.Save(record); err != nil {
		t.Fatalf("save exchange rate %s %s: %v", code, date, err)
	}
	return record
}

func authTokenForTest(t *testing.T, record *core.Record) string {
	t.Helper()

	token, err := record.NewAuthToken()
	if err != nil {
		t.Fatalf("create auth token: %v", err)
	}
	return token
}

func patchRatesRequestRecord(t *testing.T, app core.App, collection string, id string, token string, body string) *httptest.ResponseRecorder {
	t.Helper()

	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatalf("create router: %v", err)
	}
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatalf("build router: %v", err)
	}

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/collections/%s/records/%s", collection, id), strings.NewReader(body))
	request.Header.Set("content-type", "application/json")
	request.Header.Set("Authorization", token)
	mux.ServeHTTP(recorder, request)
	return recorder
}
