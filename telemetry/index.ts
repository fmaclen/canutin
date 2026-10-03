// Receives the daily anonymous ping from Canutin installs and forwards it to Plausible. Schema v1
// must match telemetryPayload in pocketbase/telemetry.go and the contract in docs/telemetry.md.

type Env = { PLAUSIBLE_URL: string; PLAUSIBLE_DOMAIN: string };
type ExecutionContext = { waitUntil(promise: Promise<unknown>): void };

const oneOf = (values: string[]) => (value: unknown) =>
	typeof value === 'string' && values.includes(value);
const isBoolean = (value: unknown) => typeof value === 'boolean';
const recordBuckets = oneOf(['0', '1-5', '6-20', '21-50', '51+']);
const smallBuckets = oneOf(['0', '1', '2-5', '6+']);

const schemaV1: Record<string, (value: unknown) => boolean> = {
	schema: (value) => value === 1,
	version: (value) =>
		typeof value === 'string' &&
		value.length <= 32 &&
		/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(value),
	users: oneOf(['1', '2-5', '6+']),
	accounts: recordBuckets,
	assets: recordBuckets,
	transactions: oneOf(['0', '<1k', '1k-10k', '10k-100k', '100k+']),
	securities: smallBuckets,
	plaidConnections: smallBuckets,
	currencies: smallBuckets,
	historyYears: oneOf(['0', '<1', '1-3', '3-10', '10+']),
	plaidConfigured: isBoolean,
	importApiUsed: isBoolean,
	autoUpdateRates: isBoolean,
	accountSharing: isBoolean,
	assetSharing: isBoolean,
	inverseSharing: isBoolean,
	labels: isBoolean,
	autoCalculatedBalances: isBoolean,
	manualTransactions: isBoolean,
	importReverted: isBoolean,
	plaidErrors: isBoolean
};

function isPingV1(body: unknown): body is Record<string, string | number | boolean> {
	if (typeof body !== 'object' || body === null || Array.isArray(body)) return false;
	const entries = Object.entries(body);
	return (
		entries.length === Object.keys(schemaV1).length &&
		entries.every(([key, value]) => Object.hasOwn(schemaV1, key) && schemaV1[key](value))
	);
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		if (request.method !== 'POST' || new URL(request.url).pathname !== '/ping') {
			return new Response(null, { status: 400 });
		}
		const body: unknown = await request.json().catch(() => null);
		if (!isPingV1(body)) return new Response(null, { status: 400 });

		const props = Object.fromEntries(
			Object.entries(body)
				.filter(([key]) => key !== 'schema')
				.map(([key, value]) => [key, String(value)])
		);

		ctx.waitUntil(
			fetch(`${env.PLAUSIBLE_URL}/api/event`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					// Plausible drops events whose User-Agent looks like a bot, so this stays browser-like
					'User-Agent':
						'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
					// Plausible hashes IP + User-Agent into its daily visitor id, so with a fixed User-Agent
					// unique visitors approximate unique installs per day
					'X-Forwarded-For': request.headers.get('CF-Connecting-IP') ?? ''
				},
				body: JSON.stringify({
					name: 'ping',
					url: `https://${env.PLAUSIBLE_DOMAIN}/ping`,
					domain: env.PLAUSIBLE_DOMAIN,
					props
				})
			}).then((response) => {
				if (!response.ok) console.error(`[telemetry] Plausible returned ${response.status}`);
			})
		);
		return new Response(null, { status: 202 });
	}
};
