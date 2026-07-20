import type { Component } from 'svelte';

export const THEMES = { light: '', dark: '.dark' } as const;

export type ChartConfig = {
	[k in string]: {
		label?: string;
		icon?: Component;
	} & (
		| { color?: string; theme?: never }
		| { color?: never; theme: Record<keyof typeof THEMES, string> }
	);
};

// NOTE: layerchart keys axis ticks by value, so duplicates crash the chart; a degenerate domain
// (min === max) collapses the endpoints to a single value, so dedupe before handing off ticks.
export function axisTicks(min: number, max: number) {
	const ticks = min < 0 && max > 0 ? [min, 0, max] : [min, max];
	return [...new Set(ticks)];
}
