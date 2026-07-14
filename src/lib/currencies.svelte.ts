import { getContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

import { getAuthContext } from './auth.svelte';
import { logError } from './logger';
import type { CurrenciesResponse } from './pocketbase.schema';
import type { PocketBaseContext } from './pocketbase.svelte';
import { Debouncer, RequestSequence } from './realtime-sync';

const DEBOUNCE_MS = 200;

type CurrencyRegistryRow = {
	id: string;
	code: string;
	name: string;
	autoUpdate: boolean;
};

class CurrenciesContext {
	private _records: CurrenciesResponse[] = $state([]);
	private _isLoaded = $state(false);
	private _currencies: CurrencyRegistryRow[] = $derived.by(() =>
		this._records.map((currency) => ({
			id: currency.id,
			code: currency.code,
			name: currency.name ?? '',
			autoUpdate: currency.autoUpdate ?? false
		}))
	);
	private _byCode = $derived.by(() => {
		const byCode = new SvelteMap<string, CurrencyRegistryRow>();
		for (const currency of this._currencies) byCode.set(currency.code, currency);
		return byCode;
	});

	private _pb: PocketBaseContext;
	private _auth: ReturnType<typeof getAuthContext>;
	private sequence = new RequestSequence();
	private debouncer = new Debouncer(DEBOUNCE_MS);
	private _activeUserId = '';
	private _isSubscribed = false;
	private _disposed = false;
	private _teardownCallback = () => this.unsubscribeRealtime();
	private _reconnectCallback = () => this.invalidate();

	constructor(pb: PocketBaseContext) {
		this._pb = pb;
		this._auth = getAuthContext();
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
				.collection('currencies')
				.getFullList<CurrenciesResponse>({
					sort: 'code',
					requestKey: null
				});
			if (this._disposed || userId !== this._activeUserId || !this.sequence.isCurrent(token))
				return;

			this._records = list;
			this._isLoaded = true;
		} catch (error) {
			if (userId !== this._activeUserId) return;
			this._pb.handleConnectionError(error, 'currencies', 'refresh');
		}
	}

	private realtimeSubscribe(userId: string) {
		if (this._isSubscribed || !userId || userId !== this._activeUserId) return;
		this._isSubscribed = true;
		this._pb.authedClient
			.collection('currencies')
			.subscribe('*', () => this.invalidate())
			.catch((error) => {
				if (userId === this._activeUserId) {
					this._pb.handleSubscriptionError(error, 'currencies', 'subscribe');
				} else {
					logError('currenciesStore', 'stale_subscription', error);
				}
			});
	}

	private unsubscribeRealtime() {
		if (!this._isSubscribed) return;
		this._isSubscribed = false;
		this._pb.authedClient.collection('currencies').unsubscribe('*');
	}

	// Realtime events and reconnects are pure invalidation signals: both schedule a debounced full
	// refetch, so a reconnect converges on any events missed while the socket was disconnected.
	private invalidate() {
		if (!this._activeUserId) return;
		this.debouncer.schedule(() => void this.refresh(this._activeUserId));
	}

	get currencies() {
		return this._currencies;
	}

	get currencyOptions() {
		return this._currencies.map((currency) => ({
			...currency,
			value: currency.code,
			label: currency.name ? `${currency.code} - ${currency.name}` : currency.code
		}));
	}

	get isLoaded() {
		return this._isLoaded;
	}

	getCurrency(code: string) {
		return this._byCode.get(code) ?? null;
	}

	hasCurrency(code: string) {
		return this._byCode.has(code);
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

export function setCurrenciesContext(pb: PocketBaseContext) {
	return setContext('currencies', new CurrenciesContext(pb));
}

export function getCurrenciesContext() {
	return getContext<ReturnType<typeof setCurrenciesContext>>('currencies');
}
