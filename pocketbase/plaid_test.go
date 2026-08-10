package main

// The Playwright suite shares one PocketBase process with fixed Plaid configuration, so it cannot
// exercise process environment variants. Keep these tests limited to configuration selection before
// any outbound request.

import (
	"errors"
	"testing"
)

func TestPlaidConfigRequiresExplicitEnvironment(t *testing.T) {
	t.Setenv("PLAID_CLIENT_ID", "client-id")
	t.Setenv("PLAID_SECRET", "secret")
	t.Setenv("PLAID_ENV", "")
	t.Setenv("PLAID_BASE_URL", "")

	_, err := plaidConfigFromEnv()
	if !errors.Is(err, errPlaidNotConfigured) {
		t.Fatalf("error = %v, want errPlaidNotConfigured", err)
	}
}
