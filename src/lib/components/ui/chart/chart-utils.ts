import type { Tooltip } from 'layerchart';
import { getContext, setContext, type Component } from 'svelte';

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

export type TooltipPayload = Tooltip.TooltipSeries;

// Helper to extract item config from a payload.
export function getPayloadConfigFromPayload(
	config: ChartConfig,
	payload: TooltipPayload,
	key: string
) {
	if (typeof payload !== 'object' || payload === null) return undefined;

	const payloadConfig =
		'config' in payload && typeof payload.config === 'object' && payload.config !== null
			? payload.config
			: undefined;

	let configLabelKey: string = key;

	if (key in payload && typeof payload[key as keyof typeof payload] === 'string') {
		configLabelKey = payload[key as keyof typeof payload] as string;
	} else if (
		payloadConfig !== undefined &&
		key in payloadConfig &&
		typeof payloadConfig[key as keyof typeof payloadConfig] === 'string'
	) {
		configLabelKey = payloadConfig[key as keyof typeof payloadConfig] as string;
	}

	return configLabelKey in config ? config[configLabelKey] : config[key as keyof typeof config];
}

type ChartContextValue = {
	config: ChartConfig;
};

const chartContextKey = Symbol('chart-context');

export function setChartContext(value: ChartContextValue) {
	return setContext(chartContextKey, value);
}

export function useChart() {
	return getContext<ChartContextValue>(chartContextKey);
}
