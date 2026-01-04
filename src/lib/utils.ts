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
