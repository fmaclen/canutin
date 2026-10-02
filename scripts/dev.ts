// Vite handles hot reload; all application requests go through its PocketBase proxy.
const servers = [
	Bun.spawn(['bun', 'run', 'pb'], { stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' }),
	Bun.spawn(['bun', 'run', 'vite', 'dev', ...process.argv.slice(2)], {
		stdin: 'inherit',
		stdout: 'inherit',
		stderr: 'inherit'
	})
];

function stopServers() {
	for (const server of servers) server.kill('SIGTERM');
}

process.on('SIGINT', stopServers);
process.on('SIGTERM', stopServers);

const exitCode = await Promise.race(servers.map((server) => server.exited));
stopServers();
await Promise.all(servers.map((server) => server.exited));
process.exit(exitCode);
