---
name: pb-migrate
description: Create or modify PocketBase collections programmatically via the admin API, generating JS migration files automatically. Use this skill when the user asks to create collections, add fields, or change API rules on PocketBase.
---

Generate PocketBase schema changes programmatically through the live admin API. The running PocketBase server has `Automigrate: true` with `TemplateLangJS`, so every collection create/update/delete request automatically writes a `.js` migration file to `pocketbase/pb_migrations/`.

## Prerequisites

- PocketBase dev server must be running at `http://127.0.0.1:42070`
- You need superadmin credentials (check with the user if unknown)
- The Playwright MCP browser must be available

## How It Works

1. Log in to the PocketBase admin UI at `http://localhost:42070/_` via Playwright
2. Use `page.evaluate()` to call the PocketBase admin REST API from the authenticated browser context
3. PocketBase automatically generates a JS migration file in `pocketbase/pb_migrations/` for each change

The key insight: the `migratecmd` plugin in `pocketbase/main.go` is configured to write JS migrations (not Go) via `TemplateLangJS`. Schema changes made through the admin collection API endpoints trigger automigration file generation.

## Authentication

```js
// Inside page.evaluate(), extract the stored superadmin token:
const auth = JSON.parse(localStorage.getItem('__pb_superuser_auth__'));
const token = auth.token;
const headers = {
	Authorization: `Bearer ${token}`,
	'Content-Type': 'application/json'
};
```

## Creating a New Collection

Use `POST /api/collections` with the full collection payload.

```js
await page.evaluate(async () => {
	const auth = JSON.parse(localStorage.getItem('__pb_superuser_auth__'));
	const token = auth.token;
	const headers = {
		Authorization: `Bearer ${token}`,
		'Content-Type': 'application/json'
	};

	const payload = {
		name: 'myCollection',
		type: 'base',
		listRule: '...',
		viewRule: '...',
		createRule: '...',
		updateRule: '...',
		deleteRule: '...',
		fields: [
			{
				name: 'myRelation',
				type: 'relation',
				collectionId: '<target_collection_id>',
				required: true,
				minSelect: 0,
				maxSelect: 1,
				cascadeDelete: true
			},
			{
				name: 'myText',
				type: 'text',
				required: true,
				min: 0,
				max: 0,
				pattern: ''
			},
			{
				name: 'mySelect',
				type: 'select',
				required: true,
				maxSelect: 1,
				values: ['OPTION_A', 'OPTION_B']
			},
			{
				name: 'myBool',
				type: 'bool',
				required: false
			}
		],
		indexes: ['CREATE UNIQUE INDEX idx_name ON myCollection (field1, field2)']
	};

	const res = await fetch('http://localhost:42070/api/collections', {
		method: 'POST',
		headers,
		body: JSON.stringify(payload)
	});

	return { status: res.status, body: await res.text() };
});
```

## Updating an Existing Collection (e.g. Rule Changes)

Use `PATCH /api/collections/<id>` with only the fields you want to change.

```js
await page.evaluate(async () => {
	const auth = JSON.parse(localStorage.getItem('__pb_superuser_auth__'));
	const token = auth.token;
	const headers = {
		Authorization: `Bearer ${token}`,
		'Content-Type': 'application/json'
	};

	// Look up the collection first to get its ID
	const lookup = await fetch('http://localhost:42070/api/collections/myCollection', {
		headers: { Authorization: `Bearer ${token}` }
	});
	const collection = await lookup.json();

	// Patch only the rules
	const res = await fetch(`http://localhost:42070/api/collections/${collection.id}`, {
		method: 'PATCH',
		headers,
		body: JSON.stringify({
			listRule: 'owner = @request.auth.id',
			viewRule: 'owner = @request.auth.id'
		})
	});

	return { status: res.status, body: await res.text() };
});
```

## Known Collection IDs

These are the existing collection IDs in this project:

| Collection        | ID                |
| ----------------- | ----------------- |
| users             | `_pb_users_auth_` |
| accounts          | `pbc_2324088501`  |
| assets            | `pbc_1321337024`  |
| transactions      | `pbc_3174063690`  |
| accountBalances   | `pbc_1811848958`  |
| assetBalances     | `pbc_1178802947`  |
| balanceTypes      | `pbc_2154324782`  |
| transactionLabels | `pbc_2193784671`  |
| accountShares     | `pbc_3262151894`  |
| assetShares       | `pbc_2019661285`  |

## Verification

After each API call, verify:

1. The API returned status `200`
2. A new `.js` file appeared in `pocketbase/pb_migrations/` (use glob to check)
3. No `.go` file was written to `pocketbase/migrations/`

## Important

- **Never** write migration files by hand. Always go through the live admin API so PocketBase generates them.
- **Never** use the raw `app.Save()` Go API or direct DB writes. Only use the collection request endpoints (`/api/collections`) which trigger the automigrate hooks.
- If PocketBase was restarted after a `main.go` change, the binary must be recompiled first (the `bun run pb` script handles this).
- Batch multiple independent collection updates in a single `page.evaluate()` call using a loop for efficiency.
