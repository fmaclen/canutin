#!/usr/bin/env bun
// Create an isolated git worktree with its own Vite + PocketBase ports.
//
// Usage:
//   bun run worktree:setup <number> <branch> [--base <base-branch>]
//
// Example:
//   bun run worktree:setup 1 feat/new-thing
//   bun run worktree:setup 2 fix/bug-123 --base origin/next
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainRepo = resolve(__dirname, '..');
const parentDir = resolve(mainRepo, '..');
const worktreesRoot = join(parentDir, 'worktrees');
const DEFAULT_BASE = 'origin/next';

function log(msg: string) {
	console.log(`[worktree-setup] ${msg}`);
}

function fail(msg: string): never {
	console.error(`[worktree-setup] ERROR: ${msg}`);
	process.exit(1);
}

function exec(cmd: string, cwd?: string) {
	return execSync(cmd, { cwd: cwd ?? mainRepo, encoding: 'utf8', stdio: 'pipe' }).trim();
}

function parseArgs() {
	const args = process.argv.slice(2);
	let base = DEFAULT_BASE;
	const positional: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === '--base') {
			base = args[++i] ?? '';
			if (!base) fail('--base requires a value');
		} else {
			positional.push(arg);
		}
	}
	const [numberStr, branch] = positional;
	if (!numberStr || !branch) {
		fail('Usage: bun run worktree:setup <number> <branch> [--base <base-branch>]');
	}
	const number = Number(numberStr);
	if (!Number.isInteger(number) || number < 1) {
		fail('<number> must be a positive integer');
	}
	return { number, branch, base };
}

async function isPortFree(port: number) {
	return new Promise<boolean>((resolvePromise) => {
		const server = createServer();
		server.once('error', () => resolvePromise(false));
		server.once('listening', () => {
			server.close(() => resolvePromise(true));
		});
		server.listen(port, '127.0.0.1');
	});
}

async function allocatePort(preferred: number, taken: Set<number>) {
	const tryPort = async (port: number) => {
		if (taken.has(port)) return false;
		const free = await isPortFree(port);
		if (free) taken.add(port);
		return free;
	};
	if (await tryPort(preferred)) return preferred;
	// search upward from preferred, skipping already-taken entries
	for (let port = preferred + 1; port < preferred + 500; port++) {
		if (await tryPort(port)) return port;
	}
	throw new Error(`Could not find a free port near ${preferred}`);
}

async function allocateWorktreePorts(number: number) {
	// Base offsets keyed off worktree number: worktree-1 -> 42169/42170, worktree-2 -> 42269/42270, etc.
	const viteBase = 42069 + number * 100;
	const pbBase = 42070 + number * 100;
	const taken = new Set<number>();
	const vite = await allocatePort(viteBase, taken);
	const pocketbase = await allocatePort(pbBase, taken);
	return { vite, pocketbase };
}

function writeEnv(worktreePath: string, ports: { vite: number; pocketbase: number }) {
	const lines = [
		`VITE_PORT=${ports.vite}`,
		`PB_PORT=${ports.pocketbase}`,
		`PUBLIC_PB_URL=http://127.0.0.1:${ports.pocketbase}`,
		''
	];
	writeFileSync(join(worktreePath, '.env'), lines.join('\n'));
}

function writeWorktreeConfig(
	worktreePath: string,
	number: number,
	branch: string,
	ports: { vite: number; pocketbase: number }
) {
	const config = { worktree: number, branch, ports };
	writeFileSync(join(worktreePath, '.worktree.json'), JSON.stringify(config, null, 2) + '\n');
}

function runBunInstall(worktreePath: string) {
	log('Running bun install...');
	const res = spawnSync('bun', ['install'], {
		cwd: worktreePath,
		stdio: 'inherit'
	});
	if (res.status !== 0) {
		fail('bun install failed');
	}
}

function printAgentCommands(worktreePath: string) {
	log('');
	log('Worktree ready. Start a new agent session from inside it:');
	log('');
	log(`  opencode ${worktreePath}`);
	log(`  codex -C ${worktreePath}`);
	log(`  cd ${worktreePath} && claude`);
	log('');
	log('Then start the dev servers (they pick up ports from .env automatically):');
	log('');
	log('  bun run pb');
	log('  bun run dev');
}

async function main() {
	const { number, branch, base } = parseArgs();
	const worktreePath = join(worktreesRoot, `worktree-${number}`);

	if (existsSync(worktreePath)) {
		fail(
			`${worktreePath} already exists. Tear it down first with \`bun run worktree:teardown ${number}\`.`
		);
	}

	if (!existsSync(worktreesRoot)) {
		mkdirSync(worktreesRoot, { recursive: true });
	}

	log(`Fetching ${base}...`);
	exec(`git fetch ${base.split('/')[0] ?? 'origin'}`);

	log(`Allocating ports for worktree-${number}...`);
	const ports = await allocateWorktreePorts(number);
	log(`  Vite:       ${ports.vite}`);
	log(`  PocketBase: ${ports.pocketbase}`);

	log(`Creating worktree at ${worktreePath} on branch ${branch} from ${base}...`);
	exec(`git worktree add ${worktreePath} -b ${branch} ${base}`);

	writeEnv(worktreePath, ports);
	writeWorktreeConfig(worktreePath, number, branch, ports);
	log('Wrote .env and .worktree.json');

	runBunInstall(worktreePath);

	printAgentCommands(worktreePath);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
