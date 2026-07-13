import { getContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

import { getAuthContext } from './auth.svelte';
import type { setCurrenciesContext } from './currencies.svelte';
import { interfacePreferences } from './interface-preferences.svelte';
import { logError } from './logger';
import type { ExchangeRatesResponse } from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';
import { Debouncer, RequestSequence } from './realtime-sync';

const DEBOUNCE_MS = 200;

export type CurrencyConversion = {
	value: number;
	isConverted: boolean;
	isUnconverted: boolean;
	missingCurrency: string | null;
};

type RatePoint = { time: number; rate: number };

class ExchangeRatesContext {
	private _records: ExchangeRatesResponse[] = $state([]);
	private _isLoaded = $state(false);
	private _visibleRecords: ExchangeRatesResponse[] = $derived.by(() => {
		const byCurrencyDate = new SvelteMap<string, ExchangeRatesResponse>();
		for (const row of this._records) {
			const registryRow = this._currencies.getCurrency(row.currency);
			if (!registryRow) continue;

			const isOwnManual = row.owner === this._activeUserId;
			const isGlobalFetched = !row.owner;
			if (!isOwnManual && !isGlobalFetched) continue;
			if (!registryRow.autoUpdate && !isOwnManual) continue;

			const key = `${row.currency}\u0000${row.date}`;
			const existing = byCurrencyDate.get(key);
			if (!existing || (existing.owner !== this._activeUserId && isOwnManual)) {
				byCurrencyDate.set(key, row);
			}
		}
		return [...byCurrencyDate.values()];
	});

	private _byCurrency: Record<string, RatePoint[]> = $derived.by(() => {
		const byCurrency: Record<string, RatePoint[]> = {};
		for (const row of this._visibleRecords) {
			const point = { time: new Date(row.date).getTime(), rate: row.rate };
			const points = byCurrency[row.currency];
			if (points) points.push(point);
			else byCurrency[row.currency] = [point];
		}
		for (const points of Object.values(byCurrency)) points.sort((a, b) => a.time - b.time);
		return byCurrency;
	});

	private _pb: PocketBaseContext;
	private _auth: ReturnType<typeof getAuthContext>;
	private _currencies: ReturnType<typeof setCurrenciesContext>;
	private sequence = new RequestSequence();
	private debouncer = new Debouncer(DEBOUNCE_MS);
	private _activeUserId = '';
	private _isSubscribed = false;
	private _disposed = false;
	private _teardownCallback = () => this.unsubscribeRealtime();
	private _reconnectCallback = () => this.invalidate();

	constructor(pb: PocketBaseContext, currencies: ReturnType<typeof setCurrenciesContext>) {
		this._pb = pb;
		this._auth = getAuthContext();
		this._currencies = currencies;
		this._auth.registerRealtimeTeardown(this._teardownCallback);
		this._pb.registerRealtimeReconnect(this._reconnectCallback);
		this.init();
	}

	private init() {
		$effect(() => {
			const userId = this._auth.currentUserId;
			if (userId === this._activeUserId) return;
			this.unsubscribeRealtime();
			this.debouncer.cancel();
			this.sequence.bump();
			this._activeUserId = userId;
			if (!userId) {
				this._records = [];
				this._isLoaded = false;
				return;
			}
			this._isLoaded = false;
			this.realtimeSubscribe(userId);
			void this.refresh(userId);
		});
	}

	private async refresh(userId: string) {
		if (!userId) return;
		const token = this.sequence.next();
		try {
			const list = await this._pb.authedClient
				.collection('exchangeRates')
				.getFullList<ExchangeRatesResponse>({ requestKey: null });
			if (this._disposed || userId !== this._activeUserId || !this.sequence.isCurrent(token))
				return;

			this._records = list;
			this._isLoaded = true;
		} catch (error) {
			if (userId !== this._activeUserId) return;
			this._pb.handleConnectionError(error, 'exchange_rates', 'refresh');
		}
	}

	private realtimeSubscribe(userId: string) {
		if (this._isSubscribed || !userId || userId !== this._activeUserId) return;
		this._isSubscribed = true;
		this._pb.authedClient
			.collection('exchangeRates')
			.subscribe('*', () => this.invalidate())
			.catch((error) => {
				if (userId === this._activeUserId) {
					this._pb.handleSubscriptionError(error, 'exchange_rates', 'subscribe');
				} else {
					logError('exchangeRatesStore', 'stale_subscription', error);
				}
			});
	}

	private unsubscribeRealtime() {
		if (!this._isSubscribed) return;
		this._isSubscribed = false;
		this._pb.authedClient.collection('exchangeRates').unsubscribe('*');
	}

	// NOTE: the ensure-rates worker writes many rows per entity, so coalesce the burst into a
	// single refetch rather than maintaining the sorted index incrementally on each event. Reconnects
	// route here too, converging on any events missed while the socket was disconnected.
	private invalidate() {
		if (!this._activeUserId) return;
		this.debouncer.schedule(() => void this.refresh(this._activeUserId));
	}

	get records() {
		return this._visibleRecords;
	}

	get isLoaded() {
		return this._isLoaded;
	}

	rate(currency: string, date: string) {
		if (currency === 'USD') return 1;
		const points = this._byCurrency[currency];
		if (!points || points.length === 0) return null;

		const time = new Date(date).getTime();
		let low = 0;
		let high = points.length - 1;
		while (low < high) {
			const mid = (low + high) >> 1;
			if (points[mid].time < time) low = mid + 1;
			else high = mid;
		}

		const candidate = points[low];
		const previous = points[low - 1];
		if (previous && time - previous.time <= candidate.time - time) return previous.rate;
		return candidate.rate;
	}

	convert(value: number, fromCurrency: string, date: string) {
		const displayCurrency = interfacePreferences.displayCurrency;
		if (fromCurrency === displayCurrency) {
			return { value, isConverted: false, isUnconverted: false, missingCurrency: null };
		}

		const fromRate = this.rate(fromCurrency, date);
		if (fromRate === null) {
			return {
				value,
				isConverted: false,
				isUnconverted: true,
				missingCurrency: fromCurrency
			};
		}
		const displayRate = this.rate(displayCurrency, date);
		if (displayRate === null) {
			return {
				value,
				isConverted: false,
				isUnconverted: true,
				missingCurrency: displayCurrency
			};
		}

		return {
			value: (value / fromRate) * displayRate,
			isConverted: true,
			isUnconverted: false,
			missingCurrency: null
		};
	}

	dispose() {
		this._disposed = true;
		this.debouncer.cancel();
		this._auth.unregisterRealtimeTeardown(this._teardownCallback);
		this._pb.unregisterRealtimeReconnect(this._reconnectCallback);
		this.unsubscribeRealtime();
		this.sequence.bump();
	}
}

export function setExchangeRatesContext(
	pb: PocketBaseContext,
	currencies: ReturnType<typeof setCurrenciesContext>
) {
	return setContext('exchange-rates', new ExchangeRatesContext(pb, currencies));
}

export function getExchangeRatesContext() {
	return getContext<ReturnType<typeof setExchangeRatesContext>>('exchange-rates');
}
