import PocketBase from 'pocketbase';

const PB_HOST = '127.0.0.1';
const PB_PORT = 42070;
const PB_SUPERUSER_EMAIL = 'superadmin@example.com';
const PB_SUPERUSER_PASSWORD = '123qweasdzxc';
const PB_BASE_URL = `http://${PB_HOST}:${PB_PORT}`;

const COLLECTIONS_TO_CLEAN = [
	'transactions',
	'accountBalances',
	'assetBalances',
	'accounts',
	'assets'
] as const;

function log(msg: string) {
	console.log(`[pb:rollback] ${msg}`);
}

function error(msg: string) {
	console.error(`[pb:rollback] ERROR: ${msg}`);
}

async function deleteByImportSession(pb: PocketBase, collection: string, sessionId: string) {
	let deleted = 0;
	let hasMore = true;

	while (hasMore) {
		const records = await pb.collection(collection).getList(1, 100, {
			filter: `importSession = "${sessionId}"`
		});

		for (const record of records.items) {
			await pb.collection(collection).delete(record.id);
			deleted++;
		}

		hasMore = records.totalItems > records.items.length;
	}

	return deleted;
}

async function main() {
	const sessionId = process.argv[2];

	if (!sessionId) {
		error('Usage: bun pb:rollback <session-id>');
		error('  session-id: The PocketBase record ID of the import session to roll back');
		process.exit(1);
	}

	if (!/^[a-z0-9]{15}$/.test(sessionId)) {
		error(`Invalid session ID format: "${sessionId}"`);
		error('  session-id must be a 15-character alphanumeric PocketBase record ID');
		process.exit(1);
	}

	const pb = new PocketBase(PB_BASE_URL);
	pb.autoCancellation(false);

	log('Authenticating as superuser...');
	await pb.collection('_superusers').authWithPassword(PB_SUPERUSER_EMAIL, PB_SUPERUSER_PASSWORD);

	log(`Looking up import session ${sessionId}...`);
	let session;
	try {
		session = await pb.collection('importSessions').getOne(sessionId);
	} catch {
		error(`Import session "${sessionId}" not found`);
		process.exit(1);
	}

	if (session.status === 'rolled_back') {
		error(`Import session "${sessionId}" has already been rolled back`);
		process.exit(1);
	}

	log(`Found session: "${session.label}" (created: ${session.created})`);
	log(`  Records created: ${session.recordsCreated}`);
	log(`  Records skipped: ${session.recordsSkipped}`);
	log('');
	log('Rolling back...');

	let totalDeleted = 0;

	for (const collection of COLLECTIONS_TO_CLEAN) {
		const deleted = await deleteByImportSession(pb, collection, sessionId);
		if (deleted > 0) {
			log(`  ${collection}: deleted ${deleted} record(s)`);
		}
		totalDeleted += deleted;
	}

	await pb.collection('importSessions').update(sessionId, {
		status: 'rolled_back'
	});

	log('');
	log(`Rollback complete. Deleted ${totalDeleted} record(s) total.`);
	log(`Session "${session.label}" marked as rolled_back.`);
}

main().catch((err) => {
	error(err instanceof Error ? err.message : String(err));
	process.exit(1);
});
