package main

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

func TestCurrencyRepairMigration(t *testing.T) {
	app := newDemoSeedTestApp(t)

	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("find users collection: %v", err)
	}
	alice := core.NewRecord(users)
	alice.SetEmail("currency-migration-alice@example.com")
	alice.SetPassword("123qweasdzxc")
	if err := app.Save(alice); err != nil {
		t.Fatalf("save alice: %v", err)
	}
	bob := core.NewRecord(users)
	bob.SetEmail("currency-migration-bob@example.com")
	bob.SetPassword("123qweasdzxc")
	if err := app.Save(bob); err != nil {
		t.Fatalf("save bob: %v", err)
	}
	balanceTypes, err := app.FindCollectionByNameOrId("balanceTypes")
	if err != nil {
		t.Fatalf("find balanceTypes collection: %v", err)
	}
	balanceType := core.NewRecord(balanceTypes)
	balanceType.Set("name", "Cash")
	balanceType.Set("owner", alice.Id)
	if err := app.Save(balanceType); err != nil {
		t.Fatalf("save balance type: %v", err)
	}

	for _, item := range []struct {
		collection string
		name       string
		owner      string
		currency   string
	}{
		{"accounts", "Blank account", alice.Id, "USD"},
		{"accounts", "Euro account", alice.Id, "EUR"},
		{"assets", "Blank asset", alice.Id, "USD"},
		{"assets", "Euro asset", alice.Id, "EUR"},
		{"securities", "Blank security", alice.Id, "USD"},
		{"securities", "Euro security", alice.Id, "EUR"},
	} {
		collection, err := app.FindCollectionByNameOrId(item.collection)
		if err != nil {
			t.Fatalf("find %s collection: %v", item.collection, err)
		}
		record := core.NewRecord(collection)
		record.Set("name", item.name)
		record.Set("owner", item.owner)
		record.Set("currency", item.currency)
		if item.collection == "securities" {
			record.Set("normalizedName", item.name)
		} else {
			record.Set("balanceGroup", "CASH")
			record.Set("balanceType", balanceType.Id)
		}
		if err := app.Save(record); err != nil {
			t.Fatalf("save %s: %v", item.name, err)
		}
		if item.currency == "USD" {
			blankValue := "''"
			if item.collection == "assets" {
				blankValue = "'  '"
			}
			if _, err := app.DB().NewQuery("UPDATE {{" + item.collection + "}} SET {{currency}} = " + blankValue + " WHERE {{id}} = {:id}").Bind(map[string]any{"id": record.Id}).Execute(); err != nil {
				t.Fatalf("blank %s currency: %v", item.name, err)
			}
		}
	}

	currencies, err := app.FindCollectionByNameOrId("currencies")
	if err != nil {
		t.Fatalf("find currencies collection: %v", err)
	}
	usd := core.NewRecord(currencies)
	usd.Set("owner", alice.Id)
	usd.Set("code", "USD")
	usd.Set("name", "Existing dollar")
	if err := app.Save(usd); err != nil {
		t.Fatalf("save existing USD: %v", err)
	}

	if _, err := app.DB().NewQuery("DELETE FROM {{_migrations}} WHERE {{file}} = '1783785600_repair_currency_rollout.js'").Execute(); err != nil {
		t.Fatalf("mark repair migration pending: %v", err)
	}
	if err := app.RunAllMigrations(); err != nil {
		t.Fatalf("rerun migrations: %v", err)
	}

	for _, collection := range []string{"accounts", "assets", "securities"} {
		blank, err := app.FindFirstRecordByFilter(collection, "name ~ 'Blank'")
		if err != nil {
			t.Fatalf("find blank %s record: %v", collection, err)
		}
		if blank.GetString("currency") != "USD" {
			t.Errorf("%s blank currency = %q, want USD", collection, blank.GetString("currency"))
		}
		euro, err := app.FindFirstRecordByFilter(collection, "name ~ 'Euro'")
		if err != nil {
			t.Fatalf("find euro %s record: %v", collection, err)
		}
		if euro.GetString("currency") != "EUR" {
			t.Errorf("%s non-empty currency = %q, want EUR", collection, euro.GetString("currency"))
		}
	}

	for _, user := range []*core.Record{alice, bob} {
		rows, err := app.FindRecordsByFilter("currencies", "owner = {:owner} && code = 'USD'", "", 10, 0, map[string]any{"owner": user.Id})
		if err != nil {
			t.Fatalf("find USD for %s: %v", user.Email(), err)
		}
		if len(rows) != 1 {
			t.Errorf("USD rows for %s = %d, want 1", user.Email(), len(rows))
		}
	}
	preservedUSD, err := app.FindRecordById("currencies", usd.Id)
	if err != nil {
		t.Fatalf("reload existing USD: %v", err)
	}
	if got := preservedUSD.GetString("name"); got != "Existing dollar" {
		t.Errorf("existing USD name = %q, want Existing dollar", got)
	}
}
