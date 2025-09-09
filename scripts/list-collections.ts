import PocketBase from 'pocketbase';

function log(msg: string) {
	console.log(`[pb:list] ${msg}`);
}

function error(msg: string) {
	console.error(`[pb:list] ERROR: ${msg}`);
}

async function main() {
	const host = process.env.PB_HOST || '127.0.0.1';
	const port = Number(process.env.PB_PORT || 42070);
	const baseUrl = `http://${host}:${port}`;

	const email = process.env.PB_SUPERUSER_EMAIL || 'superadmin@example.com';
	const password = process.env.PB_SUPERUSER_PASSWORD || '123qweasdzxc';

	log(`Connecting to ${baseUrl}`);
	const pb = new PocketBase(baseUrl);

	log('Authenticating as superuser...');
	await pb.collection('_superusers').authWithPassword(email, password);

	log('Fetching collections...');
	const list = await pb.collections.getFullList({ fields: 'id,name,type,system' });

	if (!list?.length) {
		log('No collections found.');
		return;
	}

	// Fetch each collection individually to ensure schema details are present
	for (const meta of list as any[]) {
		const c = await pb.collections.getOne(meta.id, { fields: 'id,name,type,system,fields' });
		console.log(`- id=${c.id} name=${c.name} type=${c.type}`);
		const fieldArr = Array.isArray((c as any).fields) ? (c as any).fields : [];
		for (const f of fieldArr) {
			const flags = [f.required ? 'required' : '', f.unique ? 'unique' : '', f.system ? 'system' : '']
				.filter(Boolean)
				.join(', ');
			const opts = f.options || {};
			const rel = opts?.collectionId ? `, relation->${opts.collectionId}${opts.maxSelect ? `[max=${opts.maxSelect}]` : ''}` : '';
			const constraints: string[] = [];
			if (opts.min !== undefined) constraints.push(`min=${opts.min}`);
			if (opts.max !== undefined) constraints.push(`max=${opts.max}`);
			if (opts.pattern) constraints.push(`pattern=${opts.pattern}`);
			if (opts.values && Array.isArray(opts.values)) constraints.push(`values=[${opts.values.join('|')}]`);
			const constraintsStr = constraints.length ? `, ${constraints.join(', ')}` : '';
			console.log(`  • ${f.name}: ${f.type}${flags ? ` (${flags})` : ''}${rel}${constraintsStr}`);
		}
	}
}

main().catch((e) => {
	error((e as Error).message);
	process.exit(1);
});
