import { replaceState } from '$app/navigation';
import { page } from '$app/state';

import { setSortInUrl, type SortDirection, type SortState } from './utils';

export class TableSort<T extends string> {
	column: T | null = $state(null);
	direction: SortDirection | null = $state(null);

	private _validColumns: readonly T[];

	constructor(validColumns: readonly T[], defaultSort: SortState<T>) {
		this._validColumns = validColumns;
		const sortParam = page.url.searchParams.get('sort');
		const dirParam = page.url.searchParams.get('dir');
		if (
			sortParam &&
			(dirParam === 'asc' || dirParam === 'desc') &&
			validColumns.includes(sortParam as T)
		) {
			this.column = sortParam as T;
			this.direction = dirParam;
		} else {
			this.column = defaultSort.column;
			this.direction = defaultSort.direction;
		}
	}

	get state() {
		return { column: this.column, direction: this.direction };
	}

	toggle = (column: string) => {
		if (!this._validColumns.includes(column as T)) return;
		if (this.column !== column) {
			this.column = column as T;
			this.direction = 'desc';
		} else if (this.direction === 'desc') {
			this.direction = 'asc';
		} else {
			this.direction = 'desc';
		}
		// Shallow routing does not update `page.url`, so read the live URL to keep any other params.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- throwaway URL, not reactive state
		const path = setSortInUrl(new URL(window.location.href), this.state);
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic URL computed at runtime
		replaceState(path, {});
	};
}
