import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// PocketBase stores dates with space separator (e.g. "2025-01-01 00:00:00.000Z")
// but JavaScript's toISOString() uses 'T' (e.g. "2025-01-01T00:00:00.000Z").
// This causes filter comparison failures due to lexicographic ordering.
// See: https://github.com/fmaclen/canutin/issues/289
export function toPocketBaseDateString(date: Date): string {
	return date.toISOString().replace('T', ' ');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };

export type SortDirection = 'asc' | 'desc';

export type SortState<T extends string = string> = {
	column: T | null;
	direction: SortDirection | null;
};

export function toggleSort<T extends string>(currentState: SortState<T>, column: T): SortState<T> {
	if (currentState.column !== column) {
		return { column, direction: 'desc' };
	}
	if (currentState.direction === 'desc') {
		return { column, direction: 'asc' };
	}
	return { column, direction: 'desc' };
}

export function createSortComparator<T, K extends string>(
	sortState: SortState<K>,
	getters: Record<K, (item: T) => string | number | null | undefined>
) {
	return (a: T, b: T): number => {
		if (!sortState.column || !sortState.direction) return 0;

		const getter = getters[sortState.column];
		if (!getter) return 0;

		const aVal = getter(a);
		const bVal = getter(b);

		if (aVal == null && bVal == null) return 0;
		if (aVal == null) return sortState.direction === 'asc' ? -1 : 1;
		if (bVal == null) return sortState.direction === 'asc' ? 1 : -1;

		let comparison: number;
		if (typeof aVal === 'string' && typeof bVal === 'string') {
			comparison = aVal.localeCompare(bVal, undefined, { sensitivity: 'base' });
		} else {
			comparison = Number(aVal) - Number(bVal);
		}

		return sortState.direction === 'asc' ? comparison : -comparison;
	};
}

export function getSortFromUrl(url: URL): SortState {
	const column = url.searchParams.get('sort');
	const dir = url.searchParams.get('dir');
	return {
		column: column || null,
		direction: dir === 'asc' || dir === 'desc' ? dir : null
	};
}

export function setSortInUrl(url: URL, state: SortState): string {
	const newUrl = new URL(url);
	if (state.column && state.direction) {
		newUrl.searchParams.set('sort', state.column);
		newUrl.searchParams.set('dir', state.direction);
	} else {
		newUrl.searchParams.delete('sort');
		newUrl.searchParams.delete('dir');
	}
	return `${newUrl.pathname}${newUrl.search}`;
}
