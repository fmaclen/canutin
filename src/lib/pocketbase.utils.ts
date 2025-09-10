export function createKeyedBatchQueue<T extends string>(runner: (key: T) => Promise<void>) {
	const pending = new Set<T>();
	let processing = false;

	const process = async () => {
		processing = true;
		for (const id of Array.from(pending)) {
			pending.delete(id);
			await runner(id);
		}
		processing = false;
		if (pending.size) process();
	};

	return {
		enqueue(key: T) {
			pending.add(key);
			if (!processing) process();
		}
	} as const;
}
