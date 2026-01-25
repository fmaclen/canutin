// PocketBase setup and server launcher

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fscore, { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectRoot = process.cwd();
const pbDir = path.join(projectRoot, 'pocketbase');
const migrationsDir = path.join(pbDir, 'pb_migrations');
const TYPEGEN_OUT = path.join(projectRoot, 'src', 'lib', 'pocketbase.schema.ts');

function log(msg: string) {
	console.log(`[pocketbase] ${msg}`);
}

function error(msg: string) {
	console.error(`[pocketbase] ERROR: ${msg}`);
}

type Platform = 'darwin' | 'linux' | 'windows';

function getPlatform(): Platform {
	switch (process.platform) {
		case 'darwin':
			return 'darwin';
		case 'linux':
			return 'linux';
		case 'win32':
			return 'windows';
		default:
			throw new Error(`Unsupported platform: ${process.platform}`);
	}
}

function getBinaryName(): string {
	return getPlatform() === 'windows' ? 'pocketbase-custom.exe' : 'pocketbase-custom';
}

function getBinaryPath(): string {
	return path.join(pbDir, getBinaryName());
}

function goModHash(): string | null {
	try {
		const goMod = path.join(pbDir, 'go.mod');
		const mainGo = path.join(pbDir, 'main.go');
		if (!existsSync(goMod) || !existsSync(mainGo)) return null;

		const hash = createHash('sha256');
		hash.update(readFileSync(goMod));
		hash.update(readFileSync(mainGo));
		return hash.digest('hex').slice(0, 16);
	} catch {
		return null;
	}
}

function readBuildHash(): string | null {
	try {
		const hashFile = path.join(pbDir, '.build-hash');
		if (!existsSync(hashFile)) return null;
		return readFileSync(hashFile, 'utf8').trim();
	} catch {
		return null;
	}
}

function writeBuildHash(hash: string): void {
	try {
		const hashFile = path.join(pbDir, '.build-hash');
		writeFileSync(hashFile, hash);
	} catch {
		/* ignore */
	}
}

function buildPocketBase(): void {
	log('Building custom PocketBase binary...');
	const res = spawnSync('go', ['build', '-o', getBinaryName()], {
		cwd: pbDir,
		stdio: 'inherit'
	});
	if (res.error) {
		throw new Error(`Failed to run go build: ${res.error.message}`);
	}
	if (res.status !== 0) {
		throw new Error(`go build failed with exit code ${res.status}`);
	}
	log('Build complete.');
}

async function ensurePocketBase(): Promise<string> {
	const binPath = getBinaryPath();
	const currentHash = goModHash();
	const savedHash = readBuildHash();

	if (existsSync(binPath) && currentHash && currentHash === savedHash) {
		log(`Found up-to-date PocketBase binary at ${path.relative(projectRoot, binPath)}`);
		return binPath;
	}

	if (!existsSync(binPath)) {
		log('PocketBase binary not found. Building...');
	} else {
		log('Source files changed. Rebuilding...');
	}

	buildPocketBase();

	if (currentHash) {
		writeBuildHash(currentHash);
	}

	if (!existsSync(binPath)) {
		throw new Error('Build succeeded but binary not found.');
	}

	return binPath;
}

async function startPocketBase(binPath: string): Promise<void> {
	const host = process.env.PB_HOST || '127.0.0.1';
	const port = Number(process.env.PB_PORT || 42070);
	const httpAddr = `${host}:${port}`;

	log(`Starting PocketBase server on http://${httpAddr}...`);
	const child = spawn(binPath, ['serve', '--http', httpAddr], {
		stdio: 'inherit',
		cwd: pbDir
	});

	const handleExit = (code?: number) => {
		try {
			child.kill('SIGINT');
		} catch {
			/* ignore */
		}
		process.exit(code ?? 0);
	};

	process.on('SIGINT', () => handleExit(130));
	process.on('SIGTERM', () => handleExit());
	process.on('exit', () => handleExit());

	child.on('exit', (code) => {
		process.exit(code ?? 0);
	});
}

function runMigrations(binPath: string): void {
	log('Running database migrations...');
	const res = spawnSync(binPath, ['migrate', 'up'], {
		cwd: pbDir,
		encoding: 'utf8'
	});
	if (res.status !== 0) {
		const out = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim();
		throw new Error(`Failed to run migrations. ${out ? 'Details: ' + out : ''}`);
	}
}

async function upsertSuperuser(binPath: string): Promise<void> {
	const email = process.env.PB_SUPERUSER_EMAIL || 'superadmin@example.com';
	const password = process.env.PB_SUPERUSER_PASSWORD || '123qweasdzxc';

	log('Ensuring superuser account exists (idempotent upsert)...');
	const res = spawnSync(binPath, ['superuser', 'upsert', email, password], {
		cwd: pbDir,
		encoding: 'utf8'
	});
	if (res.status !== 0) {
		const out = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim();
		throw new Error(`Failed to upsert superuser. ${out ? 'Details: ' + out : ''}`);
	}
}

function getTypegenBin(): string {
	const bin = process.platform === 'win32' ? 'pocketbase-typegen.cmd' : 'pocketbase-typegen';
	const candidate = path.join(projectRoot, 'node_modules', '.bin', bin);
	if (!existsSync(candidate)) {
		throw new Error(
			'pocketbase-typegen binary not found. Ensure it is installed in devDependencies.'
		);
	}
	return candidate;
}

function generateTypesFromServer(): number {
	const typegen = getTypegenBin();
	const host = process.env.PB_HOST || '127.0.0.1';
	const port = Number(process.env.PB_PORT || 42070);
	const baseUrl = `http://${host}:${port}`;
	const email = process.env.PB_SUPERUSER_EMAIL || 'superadmin@example.com';
	const password = process.env.PB_SUPERUSER_PASSWORD || '123qweasdzxc';

	log(`Generating types from ${baseUrl} -> ${path.relative(projectRoot, TYPEGEN_OUT)}`);
	const res = spawnSync(
		typegen,
		['--url', baseUrl, '--email', email, '--password', password, '--out', TYPEGEN_OUT],
		{ stdio: 'inherit' }
	);
	return res.status ?? 1;
}

async function generateTypesWithRetry(retries = 20, delayMs = 750): Promise<void> {
	for (let i = 0; i < retries; i++) {
		const status = generateTypesFromServer();
		if (status === 0) return;
		await new Promise((r) => setTimeout(r, delayMs));
	}
	throw new Error('Failed to generate PocketBase types after multiple attempts.');
}

function watchMigrationsAndTypegen(): void {
	if (!existsSync(migrationsDir)) {
		log('No migrations directory found to watch for typegen updates.');
		return;
	}
	log(`Watching migrations for schema changes: ${path.relative(projectRoot, migrationsDir)}`);
	let timer: NodeJS.Timeout | null = null;
	const debounce = () => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(async () => {
			try {
				await generateTypesWithRetry(5, 500);
			} catch (e) {
				error(`Typegen on change failed: ${(e as Error).message}`);
			}
		}, 300);
	};
	try {
		fscore.watch(migrationsDir, { persistent: true }, () => {
			debounce();
		});
	} catch (e) {
		error(`Failed to watch migrations: ${(e as Error).message}`);
	}
}

const isDev = process.env.IS_DEV === 'true';

(async () => {
	try {
		log(`Host: ${os.platform()} ${os.arch()}`);
		const binPath = await ensurePocketBase();
		runMigrations(binPath);
		await upsertSuperuser(binPath);
		await startPocketBase(binPath);

		if (isDev) {
			try {
				await generateTypesWithRetry();
			} catch (e) {
				error((e as Error).message);
			}

			watchMigrationsAndTypegen();
		}
	} catch (e) {
		error((e as Error).message);
		process.exit(1);
	}
})();
