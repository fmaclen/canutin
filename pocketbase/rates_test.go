package main

// The test suite for this repo is Playwright (e2e/). These Go tests exist only to prove how
// fetchUSDRate classifies outbound exchange-rate responses - lowercased lookup codes, an absent
// currency, and a failed request - against stubbed HTTP transports swapped into fxHTTPClient.
// Playwright cannot intercept the Go server's outbound requests, and the e2e run sets
// FX_FETCH_DISABLED=true so live fetching never happens, so this classification has no surface
// Playwright reaches. Do not add Go tests here for anything a Playwright test could cover; the
// owner-immutability rules that once lived here moved to e2e/rates-api.test.ts.

import (
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
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
