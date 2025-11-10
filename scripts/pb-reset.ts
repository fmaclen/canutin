// Reset PocketBase dev database by deleting pocketbase/pb_data
import fs from 'node:fs/promises';
import path from 'node:path';

function log(msg: string) {
	console.log(`[pb:reset] ${msg}`);
}

function error(msg: string) {
	console.error(`[pb:reset] ERROR: ${msg}`);
}

async function main() {
	const projectRoot = process.cwd();
	const dbDir = path.join(projectRoot, 'pocketbase', 'pb_data');
	try {
		await fs.rm(dbDir, { recursive: true, force: true });
		log(`Deleted ${path.relative(projectRoot, dbDir)} (if it existed).`);
		log('Next run of `bun run pb` will create a fresh dev database.');
	} catch (e) {
		error((e as Error).message);
		process.exit(1);
	}
}

main();
