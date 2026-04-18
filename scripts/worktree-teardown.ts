#!/usr/bin/env bun
// Tear down a worktree created by worktree-setup.ts.
//
// Usage:
//   bun run worktree:teardown <number> [--prune]
//
// Kills any processes listening on the worktree's ports, removes the git
// worktree, and optionally deletes the branch.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainRepo = resolve(__dirname, '..');
const parentDir = resolve(mainRepo, '..');
const worktreesRoot = join(parentDir, 'worktrees');

function log(msg: string) {
	console.log(`[worktree-teardown] ${msg}`);
}

function warn(msg: string) {
	console.warn(`[worktree-teardown] WARN: ${msg}`);
}

function fail(msg: string): never {
	console.error(`[worktree-teardown] ERROR: ${msg}`);
	process.exit(1);
}

function exec(cmd: string, cwd?: string) {
	return execSync(cmd, { cwd: cwd ?? mainRepo, encoding: 'utf8', stdio: 'pipe' }).trim();
}

function tryExec(cmd: string, cwd?: string) {
	try {
		return exec(cmd, cwd);
	} catch {
		return '';
	}
}

function parseArgs() {
	const args = process.argv.slice(2);
	let prune = false;
	const positional: string[] = [];
	for (const arg of args) {
		if (arg === '--prune') prune = true;
		else positional.push(arg);
	}
	const [numberStr] = positional;
	if (!numberStr) {
		fail('Usage: bun run worktree:teardown <number> [--prune]');
	}
	const number = Number(numberStr);
	if (!Number.isInteger(number) || number < 1) {
		fail('<number> must be a positive integer');
	}
	return { number, prune };
}

interface WorktreeConfig {
	worktree: number;
	branch: string;
	ports: { vite: number; pocketbase: number };
}

function readConfig(worktreePath: string): WorktreeConfig | null {
	const configPath = join(worktreePath, '.worktree.json');
	if (!existsSync(configPath)) return null;
	try {
		return JSON.parse(readFileSync(configPath, 'utf8')) as WorktreeConfig;
	} catch {
		return null;
	}
}

function killPort(port: number) {
	const pids = tryExec(`lsof -i :${port} -t`);
	if (!pids) return;
	for (const pid of pids.split('\n').filter(Boolean)) {
		log(`  Killing PID ${pid} on port ${port}`);
		tryExec(`kill -9 ${pid}`);
	}
}

function main() {
	const { number, prune } = parseArgs();
	const worktreePath = join(worktreesRoot, `worktree-${number}`);

	if (!existsSync(worktreePath)) {
		fail(`${worktreePath} does not exist`);
	}

	const config = readConfig(worktreePath);
	if (config) {
		log(
			`Killing processes on worktree ports (vite=${config.ports.vite}, pb=${config.ports.pocketbase})`
		);
		killPort(config.ports.vite);
		killPort(config.ports.pocketbase);
	} else {
		warn('No .worktree.json found; skipping port cleanup');
	}

	log(`Removing git worktree at ${worktreePath}`);
	try {
		exec(`git worktree remove ${worktreePath} --force`);
	} catch (err) {
		fail(`git worktree remove failed: ${err instanceof Error ? err.message : String(err)}`);
	}

	if (prune && config?.branch) {
		log(`Deleting local branch ${config.branch}`);
		tryExec(`git branch -D ${config.branch}`);
	}

	log('Done.');
}

main();
