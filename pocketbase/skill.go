package main

import (
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

const skillFrontmatter = `---
name: canutin-api
description: 'Live reference for reading and writing Canutin data through its PocketBase API'
---
`

const skillOverview = `# Canutin API

Canutin stores personal-finance data in PocketBase and exposes it over a REST API.
This document is generated live from the running schema, so the collections, fields,
and access rules below reflect the current backend exactly. Use it as the reference
for reading and writing Canutin records programmatically.
`

const skillAuthSection = `## Base URL & authentication

The base URL is the PocketBase origin (for local development ` + "`http://127.0.0.1:42070`" + `).

Authenticate a user with:

` + "```" + `
POST /api/collections/users/auth-with-password
{ "identity": "user@example.com", "password": "…" }
` + "```" + `

The response includes a ` + "`token`" + `. Send it as ` + "`Authorization: Bearer <token>`" + ` on every
subsequent request. Tokens are scoped to the authenticated user; the API rules below
decide what that user can see and change.
`

const skillConventionsSection = `## CRUD, filtering & expand conventions

Every collection is reachable through the standard PocketBase record endpoints:

- ` + "`GET /api/collections/{name}/records`" + ` — list/search (paginated)
- ` + "`POST /api/collections/{name}/records`" + ` — create
- ` + "`GET /api/collections/{name}/records/{id}`" + ` — read one
- ` + "`PATCH /api/collections/{name}/records/{id}`" + ` — update
- ` + "`DELETE /api/collections/{name}/records/{id}`" + ` — delete

Query parameters:

- ` + "`filter=`" + ` — a filter DSL: ` + "`field='value'`" + `, combine with ` + "`&&`" + ` and ` + "`||`" + `, compare with
  ` + "`=`, `!=`, `>`, `>=`, `<`, `<=`, `~`" + ` (contains). Back-relations are queried as
  ` + "`x_via_y`" + ` (records of collection ` + "`x`" + ` that relate back through field ` + "`y`" + `).
- ` + "`expand=`" + ` — expand relation fields into nested records (e.g. ` + "`expand=account`" + `).
- ` + "`sort=`" + ` — order results (e.g. ` + "`sort=-created`" + ` for newest first).
- ` + "`page`" + ` / ` + "`perPage`" + ` — pagination controls.

System fields present on every record: ` + "`id`" + ` (15-char identifier), ` + "`created`" + `, and
` + "`updated`" + ` (timestamps). They are read-only and are not repeated in the per-collection
tables below.

Reading the rule strings below:

- ` + "`@request.auth.id`" + ` is the id of the authenticated caller. A rule like
  ` + "`owner = @request.auth.id`" + ` means the caller may only touch records they own.
- An empty rule (` + "`\"\"`" + `) is open to any caller; a missing rule (locked) is
  superuser-only and not reachable through a normal user token.
- ` + "`*_via_*`" + ` clauses walk a back-relation to authorize through a related record (for
  example, authorizing a balance through the account it belongs to).
`

const skillSafetySection = `## Safe reads vs. writes that need approval

Reads are generally safe: listing and viewing records only returns rows the
authenticated user is already allowed to see, and never changes state.

Writes need care:

- Collections whose create/update/delete rules are **locked** (superuser-only) cannot
  be written through a user token at all. Treat these as read-only from the API.
- Collections with **user-scoped** write rules (typically ` + "`owner = @request.auth.id`" + `)
  are writable, but only for the caller's own records. Creating, updating, or deleting
  these records mutates real financial data, so treat writes as approval-required rather
  than routine.

The per-collection rules above are the source of truth for which bucket each collection
falls into.
`

const skillCustomEndpointsSection = "## Custom endpoints\n\n" +
	"Beyond the standard record endpoints, Canutin exposes a few custom routes. These are " +
	"not derivable from the schema.\n\n" +
	"- `GET /api/setup-status` — public, no body. Returns `{ \"ready\": bool }` indicating " +
	"whether a superuser account has been provisioned.\n" +
	"- `POST /api/canutin/import` — requires any authenticated token. Body is an import " +
	"payload with a required `sessionLabel` and optional per-collection arrays; the exact field " +
	"shape of each array is generated under **Import payload shape** below. At least one quote is " +
	"required per `currencies` object and quotes are stored as owner-scoped manual `exchangeRates` " +
	"rows. The optional `currency` on `accounts`, `assets`, and `securities` is an uppercase code " +
	"matching `^[A-Z0-9]{2,10}$` and defaults to `USD`; the code must already exist in the importer's " +
	"`currencies` registry or be declared in `currencies` with a quote. Transactions and balances " +
	"inherit their parent's currency. Import exchange-rate quotes follow the standard direction " +
	"(units of the currency per 1 USD). Unknown JSON fields are silently dropped, and `externalId` " +
	"is honored only on cash `transactions`. Records are deduplicated per collection (accounts by " +
	"name+institution+balanceGroup, cash transactions by externalId or account+date+value+description, " +
	"assets by name only, securityBalances by account+security+day plus matching non-null numbers); an " +
	"account is resolved by owned `accountId`, then a name+institution+balanceGroup tuple, then a unique " +
	"bare name (ambiguous names error the row), while securityBalances/securityTransactions resolve " +
	"accounts by accountId or unique bare name only. The import is not wrapped in a transaction: rows " +
	"fail independently, are counted in `recordsFailed`, and partial results persist — only revert is " +
	"atomic. Limits: 64 MiB body, 200k total records, 100k per collection. Returns " +
	"`{ sessionId, status, recordsFailed, … }` with per-collection `{ created, existing, skipped }` " +
	"counts; `status` is `completed`, `completed_with_errors`, `failed`, or `rolled_back`.\n" +
	"- `POST /api/canutin/import/revert` — requires an authenticated token. Body is " +
	"`{ sessionId }`. Returns `{ sessionId, deleted }`. Revert deletes import-session-tagged " +
	"financial rows, but does not remove import-created `currencies` rows or their manual " +
	"`exchangeRates` quotes because those rows do not carry an `importSession` tag. Reverting a " +
	"Plaid sync session also clears its connection cursor and last sync time so the next sync refetches history.\n" +
	"- `POST /api/canutin/plaid/connections/{id}/sync` — requires a `users` token and an owned Plaid " +
	"connection. Synchronizes posted cash transactions from the connection's saved cursor, stores Plaid's original " +
	"transaction description when available, and translates Plaid personal finance primary categories into sentence-case " +
	"labels for newly created transactions. New transfer-in and transfer-out transactions are excluded from cashflow; " +
	"later Plaid modifications preserve the transaction's existing labels and exclusion state. On the first sync, a Plaid " +
	"transaction reuses exactly one existing transaction with the same account, owner, calendar date, value, and normalized " +
	"description, attaching the Plaid transaction ID while preserving its labels, exclusion state, notes, and original import session; " +
	"ambiguous matches remain separate. " +
	"It applies adds, modifications, and removals to matched accounts, and imports current balance snapshots only for " +
	"non-investment accounts that are not auto-calculated. For matched investment accounts it imports current holdings " +
	"snapshots and investment transactions from 30 days before the previous sync (or from 1990-01-01 on the " +
	"first sync). The cursor advances after every page and all added, modified, and removed cash transactions " +
	"apply successfully; balance, currency, holding, and investment-transaction failures are reported without " +
	"holding it back. The investment sync time advances only after investments are fetched and applied without " +
	"failures, or when there are no investment accounts; unavailable investment data preserves the previous window. " +
	"Returns `{ sessionId, created, skipped, failed, status }`; concurrent syncs of the " +
	"same connection return `{ error: \"plaid_sync_in_progress\" }` with status 409, " +
	"and a connection requiring renewed Plaid login completes with status `failed` and is marked " +
	"`reauth_required`. A missing or foreign connection returns status 404. Returns " +
	"`{ error: \"plaid_not_configured\" }` with status 503 when Plaid credentials are unavailable, or " +
	"`{ error: \"plaid_request_failed\", message: \"Plaid is temporarily unavailable\" }` with status 502 " +
	"when Plaid rejects or cannot complete an upstream request.\n" +
	"- `DELETE /api/canutin/plaid/connections/{id}` — requires a `users` token and an owned Plaid " +
	"connection. Best-effort removes the item from Plaid, then always unlinks it locally; linked accounts " +
	"and their imported data remain, with `connection` cleared and `externalId` preserved. Returns " +
	"`{ accounts }`, where `accounts` is the number of linked accounts. A concurrent sync " +
	"returns `{ error: \"plaid_sync_in_progress\" }` with status 409, and a missing or foreign connection " +
	"returns status 404.\n" +
	"- `POST /api/canutin/securities/with-initial-transaction` — requires a `users` token. Body is " +
	"`{ security: { name, symbol, owner, currency }, transaction: { account, owner, date, type, subtype, description, quantity, price, amount, fees, notes } }`. " +
	"`security.currency` is optional (free-form uppercase code matching `^[A-Z0-9]{2,10}$`, defaults to `USD`). " +
	"Creates both records atomically and returns the created `securities` record. A duplicate normalized " +
	"security name returns `security_name_exists` on the `name` field.\n" +
	"- `POST /api/shares/accounts` — requires a `users` token. Body is " +
	"`{ accountId, recipientEmail, perspective }` where perspective is `NORMAL` or `INVERSE`. " +
	"Returns `{ id }`.\n" +
	"- `POST /api/shares/assets` — requires a `users` token. Body is " +
	"`{ assetId, recipientEmail, perspective }`. Returns `{ id }`.\n"

const skillConstraintsSection = `## Behavioral constraints

Backend hooks enforce invariants that are not visible in the access rules:

- Security names are trimmed, internal whitespace is collapsed, and names are unique per owner
  without regard to case. Every security create or update path rejects a duplicate with
  ` + "`security_name_exists`" + ` on the ` + "`name`" + ` field.
- Writing a ` + "`securityBalances`" + ` or ` + "`securityTransactions`" + ` record whose account is
  closed is rejected. (Imports are exempt so they can restore a closed account's history.)
- An account's displayed value is cash plus security positions, summed in the UI rather than stored
  in one column: cash comes from the latest ` + "`accountBalances`" + ` snapshot, positions from
  ` + "`securityBalances`" + ` holding snapshots. Holdings come exclusively from ` + "`securityBalances`" + `;
  ` + "`securityTransactions`" + ` are display-only trade history that never affect balances. Writing
  portfolio value into an account balance double-counts it.
- Number fields on ` + "`securityBalances`" + ` and ` + "`securityTransactions`" + ` are nullable:
  ` + "`null`" + ` (or an omitted field) means unknown, while ` + "`0`" + ` is a known zero. When resolving
  ` + "`securityBalances`" + ` snapshots, market value (` + "`value`" + `) carries forward from the most recent
  known value, while ` + "`price`" + ` does not carry forward. ` + "`costBasis`" + ` carries forward only while
  the current and prior quantities are both known and unchanged. After a quantity-changing event,
  importers must explicitly provide the resulting basis when known, including after a split; otherwise
  leave it ` + "`null`" + `. ` + "`quantity = 0`" + `
  closes the position, resolves value and basis to zero, and stops carry-forward at that lot boundary, so
  a later re-buy cannot reuse the old lot's data. Never send ` + "`0`" + ` for a value you do not know.
- Setting ` + "`autoCalculated`" + ` on an account makes the engine recompute its latest cash balance by
  summing imported cash transactions into a new ` + "`source = derived`" + ` row stamped with the current
  time, which overrides any imported cash snapshot and re-fires on later transaction edits. Leave it
  off to preserve an imported snapshot. Accounts linked to Plaid always force it off so Plaid's balance
  snapshots remain authoritative.
- Share records (` + "`accountShares`" + `, ` + "`assetShares`" + `) can only be updated by the recipient,
  and only the ` + "`includeInNetWorth`" + ` field may change. The sharer must revoke and recreate
  a share to change anything else.
- The ` + "`owner`" + ` of a security, balance, or transaction is immutable once set; attempting to
  change it is rejected.
- User-token updates cannot change ` + "`owner`" + ` on ` + "`currencies`" + ` or ` + "`exchangeRates`" + ` rows;
  attempts are rejected with a 400. Superuser and engine writes are exempt.
- The ` + "`currency`" + ` of an account, asset, or security is immutable once set; an update that
  changes it is rejected with a 400. It defaults to ` + "`USD`" + ` when omitted on create.
- Currencies (` + "`currencies`" + `) are per-user registry rows. Every new user gets a deletable ` + "`USD`" + `
  row. ` + "`code`" + ` is immutable after creation, while ` + "`name`" + ` and ` + "`autoUpdate`" + ` can be edited.
  Creating a non-USD currency with ` + "`autoUpdate = true`" + ` validates the code by fetching the current
  rate unless ` + "`FX_FETCH_DISABLED=true`" + ` is set. A failed upstream request rejects the create with
  ` + "`currency_auto_update_request_failed`" + ` on ` + "`autoUpdate`" + `; an unavailable code rejects it with
  ` + "`currency_auto_update_code_unavailable`" + `.
  Deleting a currency is rejected with a 400 while any owned account, asset, or security references
  its code; successful deletion also deletes that user's manual quotes for the code.
- Exchange rates (` + "`exchangeRates`" + `) are a two-tier store. Rows with empty ` + "`owner`" + ` are the
  global fetched cache (` + "`source = fetched`" + `) and are visible to all users but engine-written only.
  Rows with ` + "`owner = @request.auth.id`" + ` are the user's manual quotes (` + "`source = manual`" + `).
  A rate written through a user token is always stamped ` + "`source = manual`" + ` regardless of the
  payload, and its ` + "`rate`" + ` must be a positive, finite number (otherwise rejected with a 400).
  User manual rows override same-day fetched rows in conversion views.
- Automatic exchange-rate fetching is controlled per currency by ` + "`currencies.autoUpdate`" + `. The
  engine fetches distinct non-USD codes that at least one user has enabled, writes only global
  fetched rows, and never updates owner-scoped manual rows. ` + "`FX_FETCH_DISABLED=true`" + ` is the only
  runtime kill-switch. The scheduled refresh runs daily at 05:00 UTC.
- Plaid connections sync sequentially every night at 06:00 UTC. Connections marked
  ` + "`reauth_required`" + ` are skipped, as is the whole job when Plaid is not configured.
- Plaid requests go to the host selected by ` + "`PLAID_ENV`" + ` (` + "`sandbox`" + ` or ` + "`production`" + `),
  unless ` + "`PLAID_BASE_URL`" + ` overrides it with another origin. The override exists so automated tests
  can run the whole linking and syncing flow against a local stand-in for the Plaid API.
`

// canutinSkillHandler serves a live, SKILL.md-formatted reference of the Canutin API,
// generated from the current PocketBase schema at request time. The route is public.
func canutinSkillHandler(app core.App) func(*core.RequestEvent) error {
	return func(re *core.RequestEvent) error {
		collections, err := app.FindAllCollections(core.CollectionTypeBase, core.CollectionTypeAuth)
		if err != nil {
			return re.InternalServerError("Failed to read schema", err)
		}

		collectionNameByID := map[string]string{}
		for _, collection := range collections {
			collectionNameByID[collection.Id] = collection.Name
		}

		var doc strings.Builder
		doc.WriteString(skillFrontmatter)
		doc.WriteString("\n")
		doc.WriteString(skillOverview)
		doc.WriteString("\n")
		doc.WriteString(skillAuthSection)
		doc.WriteString("\n")
		doc.WriteString(skillConventionsSection)
		doc.WriteString("\n")
		doc.WriteString("## Collections reference\n\n")

		sort.Slice(collections, func(i, j int) bool {
			return collections[i].Name < collections[j].Name
		})

		for _, collection := range collections {
			if collection.System {
				continue
			}
			if err := writeCollectionReference(&doc, collection, collectionNameByID); err != nil {
				return re.InternalServerError("Failed to render schema", err)
			}
		}

		doc.WriteString(skillSafetySection)
		doc.WriteString("\n")
		doc.WriteString(skillCustomEndpointsSection)
		doc.WriteString("\n")
		doc.WriteString("### Import payload shape\n\n")
		doc.WriteString("These field lists are generated from the server's import payload definitions, so they " +
			"always match the accepted shape. `sessionLabel` is required and every array is optional; a field " +
			"marked `(nullable)` may be omitted or sent as `null`.\n\n")
		writeImportShape(&doc, "", reflect.TypeOf(importPayload{}))
		doc.WriteString(skillConstraintsSection)

		return re.Blob(200, "text/markdown; charset=utf-8", []byte(doc.String()))
	}
}

func writeCollectionReference(doc *strings.Builder, collection *core.Collection, collectionNameByID map[string]string) error {
	fmt.Fprintf(doc, "### %s (%s)\n\n", collection.Name, collection.Type)
	doc.WriteString("| Field | Type | Required | Relation / values |\n")
	doc.WriteString("| --- | --- | --- | --- |\n")

	for _, field := range collection.Fields {
		if field.Type() == core.FieldTypeAutodate {
			continue
		}

		marshaled, err := json.Marshal(field)
		if err != nil {
			return err
		}
		var meta map[string]any
		if err := json.Unmarshal(marshaled, &meta); err != nil {
			return err
		}

		if asBool(meta["hidden"]) || asBool(meta["system"]) {
			continue
		}

		name := asString(meta["name"])
		fieldType := field.Type()
		required := "no"
		if asBool(meta["required"]) {
			required = "yes"
		}

		fmt.Fprintf(doc, "| %s | %s | %s | %s |\n", name, fieldType, required, relationOrValues(meta, collectionNameByID))
	}

	doc.WriteString("\n")
	doc.WriteString(renderRule("List", collection.ListRule))
	doc.WriteString(renderRule("View", collection.ViewRule))
	doc.WriteString(renderRule("Create", collection.CreateRule))
	doc.WriteString(renderRule("Update", collection.UpdateRule))
	doc.WriteString(renderRule("Delete", collection.DeleteRule))
	doc.WriteString("\n")

	return nil
}

func relationOrValues(meta map[string]any, collectionNameByID map[string]string) string {
	if collectionID := asString(meta["collectionId"]); collectionID != "" {
		target, ok := collectionNameByID[collectionID]
		if !ok {
			target = collectionID
		}
		if maxSelect, ok := meta["maxSelect"].(float64); ok && maxSelect == 1 {
			return "→ " + target
		}
		return "→ " + target + " (multiple)"
	}

	if rawValues, ok := meta["values"].([]any); ok && len(rawValues) > 0 {
		options := make([]string, 0, len(rawValues))
		for _, value := range rawValues {
			options = append(options, asString(value))
		}
		return "one of: " + strings.Join(options, ", ")
	}

	return ""
}

func renderRule(label string, rule *string) string {
	if rule == nil {
		return fmt.Sprintf("- **%s**: locked — superuser only, not reachable with a user token.\n", label)
	}
	if *rule == "" {
		return fmt.Sprintf("- **%s**: open to any caller.\n", label)
	}
	return fmt.Sprintf("- **%s**: gated by `%s`.\n", label, *rule)
}

func asString(value any) string {
	if s, ok := value.(string); ok {
		return s
	}
	return ""
}

func asBool(value any) bool {
	b, ok := value.(bool)
	return ok && b
}

// writeImportShape renders the JSON shape of an import payload struct as a markdown table, then
// recurses into any nested element structs (slice elements, pointer-to-struct fields). Field names,
// types, and nullability come from the struct's `json` tags and Go types via reflection, so the
// served shape can never drift from the structs the import endpoint actually decodes. path is the
// dotted JSON path to the current struct ("" for the top-level payload); it prefixes the labels of
// nested sub-structs so a reader can locate each object in the payload.
func writeImportShape(doc *strings.Builder, path string, typ reflect.Type) {
	label := "Payload"
	if path != "" {
		label = path
	}
	fmt.Fprintf(doc, "**%s**\n\n", label)
	doc.WriteString("| Field | Type |\n| --- | --- |\n")

	type nestedStruct struct {
		path string
		typ  reflect.Type
	}
	var nested []nestedStruct

	for i := 0; i < typ.NumField(); i++ {
		field := typ.Field(i)
		name, _, _ := strings.Cut(field.Tag.Get("json"), ",")
		if name == "" || name == "-" {
			continue
		}

		fieldType := field.Type
		nullable := ""
		if fieldType.Kind() == reflect.Ptr {
			nullable = " (nullable)"
			fieldType = fieldType.Elem()
		}

		childPath := name
		if path != "" {
			childPath = path + "." + name
		}

		switch fieldType.Kind() {
		case reflect.Slice:
			element := fieldType.Elem()
			if element.Kind() == reflect.Struct {
				fmt.Fprintf(doc, "| %s | array of objects%s |\n", name, nullable)
				nested = append(nested, nestedStruct{childPath + "[]", element})
			} else {
				fmt.Fprintf(doc, "| %s | array of %ss%s |\n", name, simpleImportType(element, ""), nullable)
			}
		case reflect.Struct:
			fmt.Fprintf(doc, "| %s | object%s |\n", name, nullable)
			nested = append(nested, nestedStruct{childPath, fieldType})
		default:
			fmt.Fprintf(doc, "| %s | %s%s |\n", name, simpleImportType(fieldType, name), nullable)
		}
	}
	doc.WriteString("\n")

	for _, child := range nested {
		writeImportShape(doc, child.path, child.typ)
	}
}

// simpleImportType maps a scalar Go kind to the type label used in the import shape tables. String
// fields whose JSON name is a date carry a `date-string` label because the import validator parses
// them as dates, a distinction Go's string type cannot express.
func simpleImportType(typ reflect.Type, name string) string {
	switch typ.Kind() {
	case reflect.String:
		if name == "date" || name == "asOf" {
			return "date-string"
		}
		return "string"
	case reflect.Bool:
		return "boolean"
	case reflect.Float32, reflect.Float64,
		reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return "number"
	}
	return typ.Kind().String()
}
