import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function toNumber(value: unknown) {
	if (value === null || value === undefined || value === '') return null;
	const numberValue =
		typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
	return Number.isFinite(numberValue) ? numberValue : null;
}

export function formatPercent(value: number) {
	const normalized = value === 0 ? 0 : value;
	return `${normalized > 0 ? '+' : ''}${normalized.toLocaleString('en-US', {
		minimumFractionDigits: 1,
		maximumFractionDigits: 1
	})}%`;
}

// Validates a `?from=` redirect target. Returns the value only if it is a
// same-origin relative path (starts with a single `/`, not `//` or `/\`, and
// contains no protocol scheme before the first slash). Returns null otherwise.
export function sanitizeFromParam(value: string | null): string | null {
	if (!value) return null;
	if (typeof value !== 'string') return null;
	if (value.length === 0) return null;
	if (value[0] !== '/') return null;
	// Reject protocol-relative URLs (`//example.com`, `/\example.com`)
	if (value.length >= 2 && (value[1] === '/' || value[1] === '\\')) return null;
	// Defense-in-depth: reject anything containing a colon before the first slash.
	// Since we already require `/` at index 0 this can never trigger, but keeps the
	// intent explicit if the leading-slash check is ever relaxed.
	const firstSlash = value.indexOf('/');
	const firstColon = value.indexOf(':');
	if (firstColon !== -1 && firstColon < firstSlash) return null;
	return value;
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
