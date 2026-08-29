import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
	existsSync,
	linkSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { createServer } from 'node:net';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

interface WorktreeConfig {
	slot: number;
	branch: string;
	initialized: boolean;
	ports: {
		vite: number;
		pocketbase: number;
	};
}

interface ManagedWorktree {
	path: string;
	config: WorktreeConfig;
}

interface GitWorktree {
	path: string;
	branch: string | null;
	detached: boolean;
}

const mergeEvidenceCache = new Map<string, string | null>();
let githubWarningShown = false;

function log(message: string) {
	console.log(`[worktree] ${message}`);
}

function warn(message: string) {
	console.warn(`[worktree] WARN: ${message}`);
}

function fail(message: string): never {
	throw new Error(message);
}

function run(command: string, args: string[], cwd: string, allowFailure: boolean) {
	const result = spawnSync(command, args, {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe']
	});
	if (result.error) fail(`${command} failed: ${result.error.message}`);
	if (result.status === null)
		fail(`${command} terminated by ${result.signal ?? 'an unknown signal'}`);
	const stdout = result.stdout.trim();
	const stderr = result.stderr.trim();
	if (!allowFailure && result.status !== 0) {
		fail(`${JSON.stringify([command, ...args])} failed${stderr ? `: ${stderr}` : ''}`);
	}
	return { status: result.status, stdout, stderr };
}

function getPrimaryCheckout() {
	const primary = getGitWorktrees(process.cwd())[0];
	if (!primary) fail('Git did not report a primary checkout');
	return primary.path;
}

function getGitWorktrees(cwd: string) {
	const output = run('git', ['worktree', 'list', '--porcelain'], cwd, false).stdout;
	if (!output) return [];
	return output.split('\n\n').map((record) => {
		const lines = record.split('\n');
		const pathLine = lines.find((line) => line.startsWith('worktree '));
		if (!pathLine) fail(`Invalid git worktree record: ${record}`);
		const branchLine = lines.find((line) => line.startsWith('branch '));
		return {
			path: resolve(pathLine.slice('worktree '.length)),
			branch: branchLine ? branchLine.slice('branch refs/heads/'.length) : null,
			detached: lines.includes('detached')
		};
	});
}

function getManagedWorktrees(worktreesRoot: string) {
	if (!existsSync(worktreesRoot)) return [];
	const managed: ManagedWorktree[] = [];
	for (const entry of readdirSync(worktreesRoot, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const path = join(worktreesRoot, entry.name);
		const configPath = join(path, '.worktree.json');
		if (!existsSync(configPath)) continue;
		let value: unknown;
		try {
			value = JSON.parse(readFileSync(configPath, 'utf8'));
		} catch (error) {
			fail(
				`${configPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
			);
		}
		if (
			typeof value !== 'object' ||
			value === null ||
			!('slot' in value) ||
			typeof value.slot !== 'number' ||
			!Number.isInteger(value.slot) ||
			value.slot < 1 ||
			!('branch' in value) ||
			typeof value.branch !== 'string' ||
			('initialized' in value && typeof value.initialized !== 'boolean') ||
			!('ports' in value) ||
			typeof value.ports !== 'object' ||
			value.ports === null ||
			!('vite' in value.ports) ||
			typeof value.ports.vite !== 'number' ||
			!Number.isInteger(value.ports.vite) ||
			value.ports.vite < 1 ||
			value.ports.vite > 65535 ||
			!('pocketbase' in value.ports) ||
			typeof value.ports.pocketbase !== 'number' ||
			!Number.isInteger(value.ports.pocketbase) ||
			value.ports.pocketbase < 1 ||
			value.ports.pocketbase > 65535
		) {
			fail(`${configPath} is not a valid managed worktree config`);
		}
		managed.push({
			path,
			config: {
				slot: value.slot,
				branch: value.branch,
				initialized: 'initialized' in value && value.initialized === true,
				ports: {
					vite: value.ports.vite,
					pocketbase: value.ports.pocketbase
				}
			}
		});
	}
	managed.sort((left, right) => left.config.slot - right.config.slot);
	for (let index = 1; index < managed.length; index += 1) {
		if (managed[index - 1].config.slot === managed[index].config.slot) {
			fail(`Multiple managed worktrees claim slot ${managed[index].config.slot}`);
		}
	}
	return managed;
}

function getGitWorktree(managed: ManagedWorktree, gitWorktrees: GitWorktree[]) {
	return gitWorktrees.find((worktree) => worktree.path === resolve(managed.path));
}

function getStatus(worktreePath: string) {
	return run('git', ['status', '--porcelain', '--untracked-files=all'], worktreePath, false).stdout;
}

function getUnpushedCount(worktreePath: string) {
	const output = run(
		'git',
		['rev-list', '--count', 'HEAD', '--not', '--remotes'],
		worktreePath,
		false
	).stdout;
	const count = Number(output);
	if (!Number.isInteger(count)) fail(`git returned an invalid unpushed commit count: ${output}`);
	return count;
}

function getHead(worktreePath: string) {
	return run('git', ['rev-parse', 'HEAD'], worktreePath, false).stdout;
}

function isProcessRunning(pid: number) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return false;
		if (error instanceof Error && 'code' in error && error.code === 'EPERM') return true;
		throw error;
	}
}

function getListenerPids(port: number, primaryCheckout: string) {
	const result = run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], primaryCheckout, true);
	if (result.status !== 0 && (result.status !== 1 || result.stderr)) {
		fail(`lsof failed for port ${port}${result.stderr ? `: ${result.stderr}` : ''}`);
	}
	return result.stdout
		.split('\n')
		.filter(Boolean)
		.map(Number)
		.filter((pid) => Number.isInteger(pid) && pid > 0);
}

function getProcessCwd(pid: number, primaryCheckout: string) {
	const result = run('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], primaryCheckout, true);
	if (result.status !== 0) {
		if (!isProcessRunning(pid)) return null;
		fail(
			`Unable to determine cwd for listener PID ${pid}${result.stderr ? `: ${result.stderr}` : ''}`
		);
	}
	const cwdLine = result.stdout.split('\n').find((line) => line.startsWith('n'));
	if (!cwdLine) {
		if (!isProcessRunning(pid)) return null;
		fail(`lsof did not report a cwd for listener PID ${pid}`);
	}
	return cwdLine.slice(1);
}

function pathBelongsToWorktree(processCwd: string, worktreePath: string) {
	const pathFromWorktree = relative(realpathSync(worktreePath), processCwd);
	return (
		pathFromWorktree === '' || (!pathFromWorktree.startsWith('..') && !isAbsolute(pathFromWorktree))
	);
}

function getListeners(managed: ManagedWorktree, primaryCheckout: string) {
	const owned = new Set<number>();
	const foreign = new Set<number>();
	for (const port of [managed.config.ports.vite, managed.config.ports.pocketbase]) {
		for (const pid of getListenerPids(port, primaryCheckout)) {
			const processCwd = getProcessCwd(pid, primaryCheckout);
			if (processCwd === null) continue;
			if (pathBelongsToWorktree(processCwd, managed.path)) owned.add(pid);
			else foreign.add(pid);
		}
	}
	return { owned, foreign };
}

function localBranchExists(branch: string, primaryCheckout: string) {
	const result = run(
		'git',
		['show-ref', '--verify', '--quiet', '--', `refs/heads/${branch}`],
		primaryCheckout,
		true
	);
	if (result.status !== 0 && result.status !== 1) {
		fail(`Unable to inspect local branch ${branch}${result.stderr ? `: ${result.stderr}` : ''}`);
	}
	return result.status === 0;
}

function getMergeEvidence(primaryCheckout: string, branch: string, head: string) {
	const cacheKey = `${branch}\0${head}`;
	if (mergeEvidenceCache.has(cacheKey)) return mergeEvidenceCache.get(cacheKey) ?? null;
	const ancestry = run(
		'git',
		['merge-base', '--is-ancestor', '--', head, 'next'],
		primaryCheckout,
		true
	);
	if (ancestry.status === 0) {
		mergeEvidenceCache.set(cacheKey, 'merged into next');
		return 'merged into next';
	}
	if (ancestry.status !== 1) {
		fail(`Unable to compare ${branch} with next${ancestry.stderr ? `: ${ancestry.stderr}` : ''}`);
	}
	try {
		const result = run(
			'gh',
			[
				'pr',
				'list',
				'--state',
				'merged',
				'--head',
				branch,
				'--json',
				'number,headRefOid',
				'--limit',
				'100'
			],
			primaryCheckout,
			false
		);
		const value: unknown = JSON.parse(result.stdout);
		if (!Array.isArray(value)) fail('GitHub returned an invalid pull request response');
		for (const item of value) {
			if (
				typeof item === 'object' &&
				item !== null &&
				'headRefOid' in item &&
				item.headRefOid === head &&
				'number' in item &&
				typeof item.number === 'number'
			) {
				const evidence = `merged GitHub PR #${item.number}`;
				mergeEvidenceCache.set(cacheKey, evidence);
				return evidence;
			}
		}
	} catch (error) {
		if (!githubWarningShown) {
			warn(
				`Could not check merged GitHub PRs: ${error instanceof Error ? error.message : String(error)}`
			);
			githubWarningShown = true;
		}
	}
	mergeEvidenceCache.set(cacheKey, null);
	return null;
}

function printHelp() {
	console.log(`Usage: bun run worktree <command> [options]

Commands:
  create <branch> [--base <base>]  Create or reuse a worktree (default base: next)
  list                             List managed worktrees and their status
  remove <branch|slot|path>        Safely remove a managed worktree
  sweep                            Report merged, clean worktrees that can be removed

Options:
  --force                          Override dirty and unpushed worktree checks
  --delete-branch                  Delete the attached branch when merged
  -h, --help                       Show command help`);
}

function initializeManagedWorktree(path: string, config: WorktreeConfig) {
	writeFileSync(
		join(path, '.worktree.json'),
		`${JSON.stringify({ ...config, initialized: false }, null, 2)}\n`
	);
	writeFileSync(
		join(path, '.env'),
		[
			`VITE_PORT=${config.ports.vite}`,
			`VITE_PREVIEW_PORT=${config.ports.vite}`,
			`PB_PORT=${config.ports.pocketbase}`,
			`PUBLIC_PB_URL=http://127.0.0.1:${config.ports.pocketbase}`,
			''
		].join('\n')
	);
	log(`Running bun install in ${path}`);
	const install = spawnSync('bun', ['install'], { cwd: path, stdio: 'inherit' });
	if (install.error) fail(`bun install failed: ${install.error.message}`);
	if (install.status !== 0) fail(`bun install exited with status ${install.status ?? 'unknown'}`);
	writeFileSync(
		join(path, '.worktree.json'),
		`${JSON.stringify({ ...config, initialized: true }, null, 2)}\n`
	);
}

async function createWorktree(args: string[], primaryCheckout: string, worktreesRoot: string) {
	if (args.includes('--help') || args.includes('-h')) {
		console.log('Usage: bun run worktree:create <branch> [--base <base>]');
		return;
	}
	let base = 'next';
	const positional: string[] = [];
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === '--base') {
			base = args[index + 1] ?? '';
			if (!base) fail('--base requires a value');
			index += 1;
		} else if (argument.startsWith('-')) {
			fail(`Unknown create option: ${argument}`);
		} else {
			positional.push(argument);
		}
	}
	if (positional.length !== 1) fail('Usage: bun run worktree:create <branch> [--base <base>]');
	const branch = positional[0];
	const validBranch = run('git', ['check-ref-format', '--branch', branch], primaryCheckout, true);
	if (validBranch.status !== 0) fail(`Invalid branch name: ${branch}`);
	const sanitizedBranch = branch
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
	if (!sanitizedBranch) fail(`Branch name cannot produce a safe worktree path: ${branch}`);
	const commonDirectory = run(
		'git',
		['rev-parse', '--path-format=absolute', '--git-common-dir'],
		primaryCheckout,
		false
	).stdout;
	const lockPath = join(commonDirectory, 'canutin-worktree-create.lock');
	const lockOwner = `${process.pid}:${randomUUID()}`;
	const lockCandidate = `${lockPath}.${lockOwner}.tmp`;
	writeFileSync(lockCandidate, `${lockOwner}\n`, { flag: 'wx' });
	try {
		for (;;) {
			try {
				linkSync(lockCandidate, lockPath);
				break;
			} catch (error) {
				if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') {
					throw error;
				}
				let existingOwner: string;
				try {
					existingOwner = readFileSync(lockPath, 'utf8').trim();
				} catch (readError) {
					if (readError instanceof Error && 'code' in readError && readError.code === 'ENOENT') {
						continue;
					}
					throw readError;
				}
				const ownerMatch = existingOwner.match(
					/^([1-9]\d*):[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
				);
				if (!ownerMatch) fail(`Worktree create lock has malformed ownership (${lockPath})`);
				const ownerPid = Number(ownerMatch[1]);
				if (isProcessRunning(ownerPid)) {
					fail(`Another worktree create is in progress with PID ${ownerPid} (${lockPath})`);
				}
				const stalePath = `${lockPath}.stale-${process.pid}-${randomUUID()}`;
				try {
					renameSync(lockPath, stalePath);
					rmSync(stalePath, { force: true });
				} catch (recoveryError) {
					if (
						recoveryError instanceof Error &&
						'code' in recoveryError &&
						recoveryError.code === 'ENOENT'
					) {
						continue;
					}
					throw recoveryError;
				}
			}
		}
	} finally {
		rmSync(lockCandidate, { force: true });
	}
	try {
		const gitWorktrees = getGitWorktrees(primaryCheckout);
		const managedWorktrees = getManagedWorktrees(worktreesRoot);
		const existing = gitWorktrees.find((worktree) => worktree.branch === branch);
		if (existing) {
			if (dirname(existing.path) !== worktreesRoot) {
				fail(`${branch} is already checked out at unmanaged location ${existing.path}`);
			}
			const pathMatch = basename(existing.path).match(/^(\d+)--(.+)$/);
			if (
				!pathMatch ||
				Number(pathMatch[1]) < 1 ||
				basename(existing.path) !==
					`${String(Number(pathMatch[1])).padStart(2, '0')}--${sanitizedBranch}`
			) {
				fail(`${branch} is checked out at an invalid managed path ${existing.path}`);
			}
			const slot = Number(pathMatch[1]);
			const vite = 42069 + slot * 100;
			const pocketbase = 42070 + slot * 100;
			if (pocketbase > 65535) fail(`${existing.path} has no valid deterministic port pair`);
			const managed = managedWorktrees.find(
				(worktree) => resolve(worktree.path) === resolve(existing.path)
			);
			if (
				managed &&
				(managed.config.slot !== slot ||
					managed.config.branch !== branch ||
					managed.config.ports.vite !== vite ||
					managed.config.ports.pocketbase !== pocketbase)
			) {
				fail(`${existing.path} config does not match its branch, slot, and deterministic ports`);
			}
			if (
				managedWorktrees.some((worktree) => worktree !== managed && worktree.config.slot === slot)
			) {
				fail(`Multiple managed worktrees claim slot ${slot}`);
			}
			const slotConflict = readdirSync(worktreesRoot, { withFileTypes: true }).find((entry) => {
				const match = entry.name.match(/^(\d+)--/);
				return match && Number(match[1]) === slot && entry.name !== basename(existing.path);
			});
			if (slotConflict) fail(`Multiple worktree directories claim slot ${slot}`);
			if (
				managed?.config.initialized &&
				existsSync(join(existing.path, '.env')) &&
				existsSync(join(existing.path, 'node_modules'))
			) {
				log(`Reusing ${branch} at ${existing.path}`);
				return;
			}
			log(`Completing managed initialization for ${branch} at ${existing.path}`);
			initializeManagedWorktree(existing.path, {
				slot,
				branch,
				initialized: false,
				ports: { vite, pocketbase }
			});
			log(`Ready: ${existing.path}`);
			log(`Ports: Vite ${vite}, PocketBase ${pocketbase}`);
			return;
		}
		const baseCheck = run(
			'git',
			['rev-parse', '--verify', '--quiet', '--end-of-options', `${base}^{commit}`],
			primaryCheckout,
			true
		);
		if (baseCheck.status !== 0) fail(`Base does not resolve to a commit: ${base}`);
		if (!existsSync(worktreesRoot)) mkdirSync(worktreesRoot, { recursive: true });
		const occupiedSlots = new Set<number>();
		for (const worktree of gitWorktrees) {
			if (dirname(worktree.path) !== worktreesRoot) continue;
			const match = basename(worktree.path).match(/^(\d+)--/);
			if (match) occupiedSlots.add(Number(match[1]));
		}
		for (const worktree of managedWorktrees) occupiedSlots.add(worktree.config.slot);
		for (const entry of readdirSync(worktreesRoot, { withFileTypes: true })) {
			const match = entry.name.match(/^(\d+)--/);
			if (match) occupiedSlots.add(Number(match[1]));
		}
		let slot = 1;
		for (; ; slot += 1) {
			if (occupiedSlots.has(slot)) continue;
			const vite = 42069 + slot * 100;
			const pocketbase = 42070 + slot * 100;
			if (pocketbase > 65535)
				fail('No available worktree slot has a valid deterministic port pair');
			const portsAreFree = await Promise.all(
				[vite, pocketbase].map(
					(port) =>
						new Promise<boolean>((resolvePromise) => {
							const server = createServer();
							server.once('error', () => resolvePromise(false));
							server.once('listening', () => server.close(() => resolvePromise(true)));
							server.listen(port, '127.0.0.1');
						})
				)
			);
			if (portsAreFree.every(Boolean)) break;
		}
		const vite = 42069 + slot * 100;
		const pocketbase = 42070 + slot * 100;
		const worktreePath = join(
			worktreesRoot,
			`${String(slot).padStart(2, '0')}--${sanitizedBranch}`
		);
		if (localBranchExists(branch, primaryCheckout)) {
			log(`Checking out existing branch ${branch} in slot ${slot}`);
			run('git', ['worktree', 'add', '--', worktreePath, branch], primaryCheckout, false);
		} else {
			log(`Creating branch ${branch} from ${base} in slot ${slot}`);
			run(
				'git',
				['worktree', 'add', '-b', branch, '--', worktreePath, base],
				primaryCheckout,
				false
			);
		}
		initializeManagedWorktree(worktreePath, {
			slot,
			branch,
			initialized: false,
			ports: { vite, pocketbase }
		});
		log(`Ready: ${worktreePath}`);
		log(`Ports: Vite ${vite}, PocketBase ${pocketbase}`);
	} finally {
		let existingOwner: string | null = null;
		try {
			existingOwner = readFileSync(lockPath, 'utf8').trim();
		} catch (error) {
			warn(
				`Could not release worktree create lock ${lockPath}: ${error instanceof Error ? error.message : String(error)}`
			);
		}
		if (existingOwner !== null && existingOwner !== lockOwner) {
			warn(`Worktree create lock ownership changed; leaving it in place (${lockPath})`);
		}
		if (existingOwner === lockOwner) {
			try {
				rmSync(lockPath);
			} catch (error) {
				warn(
					`Could not release worktree create lock ${lockPath}: ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}
	}
}

function listWorktrees(primaryCheckout: string, worktreesRoot: string) {
	const managed = getManagedWorktrees(worktreesRoot);
	if (managed.length === 0) {
		log(`No managed worktrees under ${worktreesRoot}`);
		return;
	}
	const gitWorktrees = getGitWorktrees(primaryCheckout);
	for (const worktree of managed) {
		const gitWorktree = getGitWorktree(worktree, gitWorktrees);
		const states: string[] = [];
		if (!gitWorktree) {
			states.push('not registered with Git');
		} else {
			states.push(getStatus(worktree.path) ? 'dirty' : 'clean');
			const unpushed = getUnpushedCount(worktree.path);
			states.push(unpushed ? `${unpushed} unpushed commit${unpushed === 1 ? '' : 's'}` : 'pushed');
			if (gitWorktree.detached) states.push('detached');
			if (gitWorktree.branch && gitWorktree.branch !== worktree.config.branch) {
				states.push(`config branch is ${worktree.config.branch}`);
			}
		}
		const listeners = getListeners(worktree, primaryCheckout);
		states.push(listeners.owned.size ? `${listeners.owned.size} active process(es)` : 'stopped');
		if (listeners.foreign.size) states.push(`${listeners.foreign.size} foreign listener(s)`);
		console.log(
			`${String(worktree.config.slot).padStart(2, '0')}  ${gitWorktree?.branch ?? `${worktree.config.branch} (configured)`}  ${states.join(', ')}`
		);
		console.log(
			`    ports ${worktree.config.ports.vite}/${worktree.config.ports.pocketbase}  ${worktree.path}`
		);
	}
}

function resolveManagedWorktree(
	identifier: string,
	managed: ManagedWorktree[],
	gitWorktrees: GitWorktree[],
	primaryCheckout: string,
	worktreesRoot: string
) {
	let matches: ManagedWorktree[];
	if (/^[1-9]\d*$/.test(identifier)) {
		matches = managed.filter((worktree) => worktree.config.slot === Number(identifier));
	} else {
		matches = managed.filter((worktree) => {
			const gitWorktree = getGitWorktree(worktree, gitWorktrees);
			return identifier === worktree.config.branch || identifier === gitWorktree?.branch;
		});
		if (matches.length === 0) {
			const candidatePaths = new Set([
				resolve(process.cwd(), identifier),
				resolve(primaryCheckout, identifier),
				resolve(worktreesRoot, identifier)
			]);
			matches = managed.filter(
				(worktree) =>
					candidatePaths.has(resolve(worktree.path)) || basename(worktree.path) === identifier
			);
		}
	}
	if (matches.length === 0) fail(`No managed worktree matches ${identifier}`);
	if (matches.length > 1) fail(`Multiple managed worktrees match ${identifier}`);
	return matches[0];
}

async function stopListeners(managed: ManagedWorktree, primaryCheckout: string) {
	const listeners = getListeners(managed, primaryCheckout);
	for (const pid of listeners.owned) {
		log(`Sending TERM to PID ${pid}`);
		try {
			process.kill(pid, 'SIGTERM');
		} catch (error) {
			if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') throw error;
		}
	}
	if (listeners.owned.size) await new Promise((resolvePromise) => setTimeout(resolvePromise, 2000));
	const remaining = getListeners(managed, primaryCheckout).owned;
	for (const pid of remaining) {
		log(`Sending KILL to PID ${pid} after TERM timeout`);
		try {
			process.kill(pid, 'SIGKILL');
		} catch (error) {
			if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') throw error;
		}
	}
	if (listeners.foreign.size) {
		warn(
			`Left ${listeners.foreign.size} listener(s) running because their cwd is outside the worktree`
		);
	}
}

async function removeWorktree(args: string[], primaryCheckout: string, worktreesRoot: string) {
	if (args.includes('--help') || args.includes('-h')) {
		console.log('Usage: bun run worktree:remove <branch|slot|path> [--force] [--delete-branch]');
		return;
	}
	let force = false;
	let deleteBranch = false;
	const positional: string[] = [];
	for (const argument of args) {
		if (argument === '--force') force = true;
		else if (argument === '--delete-branch') deleteBranch = true;
		else if (argument.startsWith('-')) fail(`Unknown remove option: ${argument}`);
		else positional.push(argument);
	}
	if (positional.length !== 1) {
		fail('Usage: bun run worktree:remove <branch|slot|path> [--force] [--delete-branch]');
	}
	const managedWorktrees = getManagedWorktrees(worktreesRoot);
	const gitWorktrees = getGitWorktrees(primaryCheckout);
	const managed = resolveManagedWorktree(
		positional[0],
		managedWorktrees,
		gitWorktrees,
		primaryCheckout,
		worktreesRoot
	);
	const gitWorktree = getGitWorktree(managed, gitWorktrees);
	if (!gitWorktree) fail(`${managed.path} is not registered as a Git worktree`);
	const branch = gitWorktree.branch;
	const inspectedOid = getHead(managed.path);
	let branchEvidence: string | null = null;
	if (deleteBranch) {
		if (!branch) fail(`Cannot delete a branch for detached worktree ${managed.path}`);
		if (branch !== managed.config.branch) {
			fail(`Cannot delete branch ${branch}; managed config identifies ${managed.config.branch}`);
		}
		branchEvidence = getMergeEvidence(primaryCheckout, branch, inspectedOid);
		if (!branchEvidence) {
			fail(
				`Cannot delete branch ${branch}; no merged GitHub PR or ancestry into next was established`
			);
		}
	}
	if (!force) {
		if (getStatus(managed.path))
			fail(`${managed.path} has uncommitted changes; use --force to remove`);
		const unpushed = getUnpushedCount(managed.path);
		if (
			unpushed > 0 &&
			(!branch ||
				!getMergeEvidence(primaryCheckout, branch, inspectedOid)?.startsWith('merged GitHub'))
		) {
			fail(
				`${managed.path} has ${unpushed} commit${unpushed === 1 ? '' : 's'} not reachable from a remote; use --force to remove`
			);
		}
	}
	await stopListeners(managed, primaryCheckout);
	log(`Removing ${managed.path}`);
	run(
		'git',
		['worktree', 'remove', ...(force ? ['--force'] : []), '--', managed.path],
		primaryCheckout,
		false
	);
	if (!deleteBranch) {
		if (branch) log(`Kept local branch ${branch}`);
		return;
	}
	if (!branch || !branchEvidence) fail('Branch deletion lost its safety evidence');
	log(`Deleting local branch ${branch} (${branchEvidence})`);
	run('git', ['update-ref', '-d', `refs/heads/${branch}`, inspectedOid], primaryCheckout, false);
}

function sweepWorktrees(primaryCheckout: string, worktreesRoot: string) {
	const managed = getManagedWorktrees(worktreesRoot);
	const gitWorktrees = getGitWorktrees(primaryCheckout);
	let candidates = 0;
	for (const worktree of managed) {
		const gitWorktree = getGitWorktree(worktree, gitWorktrees);
		if (!gitWorktree?.branch || getStatus(worktree.path)) continue;
		const branch = gitWorktree.branch;
		const evidence = getMergeEvidence(primaryCheckout, branch, getHead(worktree.path));
		if (!evidence) continue;
		if (getUnpushedCount(worktree.path) && !evidence.startsWith('merged GitHub PR')) continue;
		const listeners = getListeners(worktree, primaryCheckout);
		const listenerState = [listeners.owned.size ? 'active' : 'stopped'];
		if (listeners.foreign.size) {
			listenerState.push(`${listeners.foreign.size} foreign listener(s)`);
		}
		console.log(
			`${String(worktree.config.slot).padStart(2, '0')}  ${branch}  ${evidence}, ${listenerState.join(', ')}`
		);
		console.log(`    bun run worktree:remove ${worktree.config.slot}`);
		candidates += 1;
	}
	if (!candidates) log('No merged, clean managed worktrees found');
}

async function main() {
	const [command, ...args] = process.argv.slice(2);
	if (!command || command === '--help' || command === '-h' || command === 'help') {
		printHelp();
		return;
	}
	const primaryCheckout = getPrimaryCheckout();
	const worktreesRoot = join(primaryCheckout, '.worktrees');
	if (command === 'create') await createWorktree(args, primaryCheckout, worktreesRoot);
	else if (command === 'list') {
		if (args.includes('--help') || args.includes('-h')) {
			console.log('Usage: bun run worktree:list');
			return;
		}
		if (args.length) fail('Usage: bun run worktree:list');
		listWorktrees(primaryCheckout, worktreesRoot);
	} else if (command === 'remove') await removeWorktree(args, primaryCheckout, worktreesRoot);
	else if (command === 'sweep') {
		if (args.includes('--help') || args.includes('-h')) {
			console.log('Usage: bun run worktree:sweep');
			return;
		}
		if (args.length) fail('Usage: bun run worktree:sweep');
		sweepWorktrees(primaryCheckout, worktreesRoot);
	} else fail(`Unknown command: ${command}`);
}

main().catch((error: unknown) => {
	console.error(`[worktree] ERROR: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
});
