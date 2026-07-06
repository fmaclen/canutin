import type {
	AccountSharesPerspectiveOptions,
	AssetSharesPerspectiveOptions
} from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';
import { projectSignedValue } from './sharing';

type BalanceHistoryPoint = { date: Date; value: number };

export function createBalanceHistoryLoader<
	T extends {
		id: string;
		perspective: AccountSharesPerspectiveOptions | AssetSharesPerspectiveOptions;
	},
	R extends { asOf: string }
>(
	pb: PocketBaseContext,
	errorContext: string,
	getCurrent: () => T | null | undefined,
	fetchRecords: (current: T) => Promise<R[]>,
	rawValueOf: (record: R) => number
) {
	let history: BalanceHistoryPoint[] = $state([]);
	let isLoading = $state(true);

	$effect(() => {
		const current = getCurrent();
		if (!current) return;
		let cancelled = false;
		isLoading = true;
		fetchRecords(current)
			.then((records) => {
				if (cancelled) return;
				history = records.map((record) => ({
					// eslint-disable-next-line svelte/prefer-svelte-reactivity
					date: new Date(record.asOf),
					value: projectSignedValue(rawValueOf(record), current.perspective)
				}));
				isLoading = false;
			})
			.catch((error) => {
				if (cancelled) return;
				pb.handleConnectionError(error, errorContext, 'balance_history');
				isLoading = false;
			});
		return () => {
			cancelled = true;
		};
	});

	return {
		get history() {
			return history;
		},
		get isLoading() {
			return isLoading;
		}
	};
}
