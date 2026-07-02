package main

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

const skillFrontmatter = `---
name: skill
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
	"payload: `sessionLabel` plus the arrays `accounts`, `assets`, `securities`, " +
	"`transactions`, `securityBalances`, and `securityTransactions`. Returns " +
	"`{ sessionId, status, recordsFailed, … }` with per-collection `{ created, existing, skipped }` counts.\n" +
	"- `POST /api/canutin/import/revert` — requires an authenticated token. Body is " +
	"`{ sessionId }`. Returns `{ sessionId, deleted }`.\n" +
	"- `POST /api/canutin/securities/with-initial-balance` — requires a `users` token. Body is " +
	"`{ security: { name, symbol, owner }, balance: { account, owner, asOf, quantity, price, value, costBasis } }`. " +
	"Returns the created `securities` record.\n" +
	"- `POST /api/shares/accounts` — requires a `users` token. Body is " +
	"`{ accountId, recipientEmail, perspective }` where perspective is `NORMAL` or `INVERSE`. " +
	"Returns `{ id }`.\n" +
	"- `POST /api/shares/assets` — requires a `users` token. Body is " +
	"`{ assetId, recipientEmail, perspective }`. Returns `{ id }`.\n"

const skillConstraintsSection = `## Behavioral constraints

Backend hooks enforce invariants that are not visible in the access rules:

- Writing a ` + "`securityBalances`" + ` or ` + "`securityTransactions`" + ` record whose account is
  closed is rejected. (Imports are exempt so they can restore a closed account's history.)
- Share records (` + "`accountShares`" + `, ` + "`assetShares`" + `) can only be updated by the recipient,
  and only the ` + "`includeInNetWorth`" + ` field may change. The sharer must revoke and recreate
  a share to change anything else.
- The ` + "`owner`" + ` of a security, balance, or transaction is immutable once set; attempting to
  change it is rejected.
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
		resolveCollectionName := func(id string) string {
			if id == "" {
				return ""
			}
			if name, ok := collectionNameByID[id]; ok {
				return name
			}
			related, err := app.FindCollectionByNameOrId(id)
			if err != nil {
				collectionNameByID[id] = id
				return id
			}
			collectionNameByID[id] = related.Name
			return related.Name
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
			if err := writeCollectionReference(&doc, collection, resolveCollectionName); err != nil {
				return re.InternalServerError("Failed to render schema", err)
			}
		}

		doc.WriteString(skillSafetySection)
		doc.WriteString("\n")
		doc.WriteString(skillCustomEndpointsSection)
		doc.WriteString("\n")
		doc.WriteString(skillConstraintsSection)

		return re.Blob(200, "text/markdown; charset=utf-8", []byte(doc.String()))
	}
}

func writeCollectionReference(doc *strings.Builder, collection *core.Collection, resolveCollectionName func(string) string) error {
	fmt.Fprintf(doc, "### %s (%s)\n\n", collection.Name, collection.Type)
	doc.WriteString("| Field | Type | Required | Relation / values |\n")
	doc.WriteString("| --- | --- | --- | --- |\n")

	for _, field := range collection.Fields {
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

		fmt.Fprintf(doc, "| %s | %s | %s | %s |\n", name, fieldType, required, relationOrValues(meta, resolveCollectionName))
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

func relationOrValues(meta map[string]any, resolveCollectionName func(string) string) string {
	if collectionID := asString(meta["collectionId"]); collectionID != "" {
		target := resolveCollectionName(collectionID)
		if asNumber(meta["maxSelect"]) == 1 {
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

func asNumber(value any) float64 {
	if n, ok := value.(float64); ok {
		return n
	}
	return 0
}
