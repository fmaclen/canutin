// PocketBase setup and server launcher

import { spawn, spawnSync } from 'node:child_process';
import fscore, { createWriteStream, existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';

const POCKETBASE_VERSION = '0.30.0';
const POCKETBASE_TAG = `v${POCKETBASE_VERSION}`; // GitHub release tag

const projectRoot = process.cwd();
const pbDir = path.join(projectRoot, 'pocketbase');
const migrationsDir = path.join(pbDir, 'pb_migrations');
const TYPEGEN_OUT = path.join(projectRoot, 'src', 'lib', 'pocketbase.types.ts');
const DB_PATH = path.join(pbDir, 'pb_data', 'data.db');

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

function getArchForPocketBase(): string {
	// Map Node.js architectures to PocketBase ones
	const arch = process.arch;
	switch (arch) {
		case 'x64':
			return 'amd64';
		case 'arm64':
			return 'arm64';
		case 'arm':
			// Default to armv7 for generic ARM (common on many SBCs)
			return 'armv7';
		case 'ia32':
			return '386';
		// Handle less common Linux server arches explicitly when possible
		case 'ppc64':
			return 'ppc64le';
		case 's390x':
			return 's390x';
		case 'riscv64':
			return 'riscv64';
		default:
			throw new Error(`Unsupported architecture: ${arch}`);
	}
}

function getAssetInfo() {
	const platform = getPlatform();
	const arch = getArchForPocketBase();

	// Validate supported combos to avoid 404s
	const supportedCombos = new Set([
		'darwin_amd64',
		'darwin_arm64',
		'linux_amd64',
		'linux_arm64',
		'linux_armv7',
		'linux_386',
		'linux_ppc64le',
		'linux_s390x',
		'linux_riscv64',
		'windows_amd64',
		'windows_arm64',
		'windows_386'
	]);

	const osPart = platform;
	const combo = `${osPart}_${arch}`;
	if (!supportedCombos.has(combo)) {
		throw new Error(`Unsupported OS/arch combination for PocketBase: ${combo}`);
	}

	const filename = `pocketbase_${POCKETBASE_VERSION}_${combo}.zip`;
	const url = `https://github.com/pocketbase/pocketbase/releases/download/${POCKETBASE_TAG}/${filename}`;
	const binName = platform === 'windows' ? 'pocketbase.exe' : 'pocketbase';
	return { url, filename, binName };
}

async function ensureDir(dir: string) {
	await fs.mkdir(dir, { recursive: true });
}

async function download(url: string, destPath: string): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const file = createWriteStream(destPath);
		const request = https.get(url, (response) => {
			if (
				response.statusCode &&
				response.statusCode >= 300 &&
				response.statusCode < 400 &&
				response.headers.location
			) {
				// Follow redirect
				return download(response.headers.location!, destPath).then(resolve, reject);
			}
			if (response.statusCode !== 200) {
				file.close();
				return reject(new Error(`Failed to download (status ${response.statusCode}): ${url}`));
			}
			response.pipe(file);
			file.on('finish', () => file.close(() => resolve()));
		});
		request.on('error', (err) => {
			file.close();
			reject(err);
		});
	});
}

function unzip(zipPath: string, destDir: string): void {
	const platform = getPlatform();
	if (platform === 'windows') {
		// Use PowerShell's Expand-Archive
		const ps = spawnSync(
			'powershell.exe',
			[
				'-NoLogo',
				'-NoProfile',
				'-Command',
				`Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`
			],
			{ stdio: 'inherit' }
		);
		if (ps.status !== 0) {
			throw new Error(`Failed to unzip using PowerShell (exit ${ps.status}).`);
		}
	} else {
		// Prefer unzip if available, fallback to tar if it supports zip (not guaranteed)
		let res = spawnSync('unzip', ['-o', zipPath, '-d', destDir], { stdio: 'inherit' });
		if (res.error || res.status !== 0) {
			// Try tar as a fallback
			res = spawnSync('tar', ['-xf', zipPath, '-C', destDir], { stdio: 'inherit' });
			if (res.error || res.status !== 0) {
				throw new Error(
					'Failed to unzip. Please install "unzip" or ensure your tar supports zip archives.'
				);
			}
		}
	}
}

function getBinaryPath(binName: string): string {
	return path.join(pbDir, binName);
}

function readVersionFromBinary(binPath: string): string | null {
	try {
		// PocketBase exposes version via the global flag `--version`.
		const out = spawnSync(binPath, ['--version'], { encoding: 'utf8' });
		if (out.status === 0) {
			const text = `${out.stdout || ''}${out.stderr || ''}`.trim();
			// Accept forms like: "0.30.0", "v0.30.0", "PocketBase v0.30.0"
			const match = text.match(/(\d+\.\d+\.\d+)/);
			if (match) return match[1];
			if (text) return text; // fallback to raw text
		}
	} catch {
		/* ignore */
	}
	return null;
}

async function ensurePocketBase(): Promise<string> {
	const { url, filename, binName } = getAssetInfo();
	const binPath = getBinaryPath(binName);

	if (existsSync(binPath)) {
		// Check version; if mismatch, re-download
		const v = readVersionFromBinary(binPath);
		if (v && (v === POCKETBASE_VERSION || v === POCKETBASE_TAG)) {
			log(`Found PocketBase ${v} at ${path.relative(projectRoot, binPath)}`);
			return binPath;
		}
		log(
			`Existing PocketBase binary version ${v ?? 'unknown'} does not match ${POCKETBASE_VERSION}. Reinstalling...`
		);
	} else {
		log('PocketBase binary not found. Installing...');
	}

	await ensureDir(pbDir);
	const zipPath = path.join(pbDir, filename);

	log(`Downloading ${url}`);
	await download(url, zipPath);

	log('Unzipping...');
	unzip(zipPath, pbDir);

	// Cleanup zip
	try {
		await fs.unlink(zipPath);
	} catch {
		/* ignore */
	}

	// Ensure executable bit (non-Windows)
	if (getPlatform() !== 'windows') {
		try {
			await fs.chmod(getBinaryPath(binName), 0o755);
		} catch (e) {
			// Ignore but warn
			error(`Failed to set executable permissions: ${(e as Error).message}`);
		}
	}

	// Verify installed binary
	const v2 = readVersionFromBinary(binPath);
	if (!v2 || (v2 !== POCKETBASE_VERSION && v2 !== POCKETBASE_TAG)) {
		throw new Error(
			`Installed PocketBase version check failed. Expected ${POCKETBASE_VERSION}, got ${v2 ?? 'unknown'}.`
		);
	}
	log(`Installed PocketBase ${v2}.`);
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

async function upsertSuperuser(binPath: string): Promise<void> {
	const email = process.env.PB_SUPERUSER_EMAIL || 'superadmin@example.com';
	const password = process.env.PB_SUPERUSER_PASSWORD || '123qweasdzxc';

	// Always upsert to guarantee existence and ensure known credentials in dev.
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
		// Use non-recursive watch for portability; most changes are file writes/renames inside this dir.
		fscore.watch(migrationsDir, { persistent: true }, () => {
			debounce();
		});
	} catch (e) {
		error(`Failed to watch migrations: ${(e as Error).message}`);
	}
}

function watchDbAndTypegen(): void {
	if (!existsSync(DB_PATH)) {
		// DB may not exist on first run; skip quietly
		return;
	}
	log(`Watching database for changes: ${path.relative(projectRoot, DB_PATH)}`);
	let idleTimer: NodeJS.Timeout | null = null;
	let lastRun = 0;
	const minIntervalMs = 10_000; // avoid thrashing on active dev DB
	const schedule = () => {
		const now = Date.now();
		if (now - lastRun < minIntervalMs) return; // too soon since last run
		if (idleTimer) clearTimeout(idleTimer);
		idleTimer = setTimeout(async () => {
			lastRun = Date.now();
			try {
				await generateTypesWithRetry(5, 500);
			} catch (e) {
				error(`Typegen (db change) failed: ${(e as Error).message}`);
			}
		}, 1500);
	};
	try {
		fscore.watch(DB_PATH, { persistent: true }, () => {
			schedule();
		});
	} catch (e) {
		error(`Failed to watch database file: ${(e as Error).message}`);
	}
}

(async () => {
	try {
		// Helpful environment note
		log(`Host: ${os.platform()} ${os.arch()}`);
		const binPath = await ensurePocketBase();
		await upsertSuperuser(binPath);
		await startPocketBase(binPath);

		// Kick off an initial type generation (retry until the HTTP server is ready)
		try {
			await generateTypesWithRetry();
		} catch (e) {
			error((e as Error).message);
		}

		// Watch migrations to keep types fresh during development
		watchMigrationsAndTypegen();
		// Also watch the local database for schema changes made via Admin UI
		watchDbAndTypegen();
	} catch (e) {
		error((e as Error).message);
		process.exit(1);
	}
})();
