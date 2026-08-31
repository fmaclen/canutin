import { browser } from '$app/environment';

// Monotonic latest-request guard. An async refresh takes a token from next() and bails as soon as
// isCurrent(token) turns false because a newer refresh - or a supersede via bump() - advanced it.
class RequestSequence {
	private value = 0;

	next() {
		return ++this.value;
	}

	get current() {
		return this.value;
	}

	isCurrent(token: number) {
		return token === this.value;
	}

	// Advance without starting a request, superseding any in-flight refresh (e.g. on logout).
	bump() {
		this.value++;
	}
}

// Trailing edge for a burst of realtime events, so a bulk import settles into one refetch.
const DEBOUNCE_MS = 200;
// First retry after a failed refresh, then doubling. Unbounded in attempts, capped in delay: a
// session that stays offline for an hour costs one small probe every 30s and still converges the
// moment the backend answers.
const FIRST_RETRY_MS = 1000;
const MAX_RETRY_MS = 30000;

// The slice of PocketBaseContext a sync needs: a shared reachability probe and the deduped
// connection-error toast. Structural so this module stays free of context imports.
type SyncClient = {
	probeBackend: () => Promise<boolean>;
	handleConnectionError: (error: unknown, context: string, operation: string) => void;
};

// Durable per-store staleness. A store that missed an update stays marked stale until a refresh
// actually commits, so a transient failure can never leave finance data quietly out of date.
// Signals - realtime events, reconnects, `online`, `visibilitychange` - only mark a store stale and
// poke its retry; none of them carries correctness on its own.
export class StaleSync {
	private sequence = new RequestSequence();
	private timer: ReturnType<typeof setTimeout> | null = null;
	private isStale = false;
	// Counts every "you may have missed something" signal. A refresh only clears the flag if no new
	// signal arrived while it was in flight - a refresh that was already running when the socket
	// dropped read the server before the update it is supposed to catch up on.
	private markCount = 0;
	private retryDelayMs = FIRST_RETRY_MS;

	constructor(
		private client: SyncClient,
		private context: string,
		private operation: string,
		private refresh: (token: number) => Promise<void>
	) {}

	// The epoch a refresh the store runs on its own must check, so it is dropped once a user change
	// or a dispose has bumped the sequence.
	get current() {
		return this.sequence.current;
	}

	isCurrent(token: number) {
		return this.sequence.isCurrent(token);
	}

	// A realtime event: the store may have missed something, and the event itself is evidence the
	// socket is alive, so the backoff restarts and the refetch runs ungated.
	invalidate() {
		this.markStale();
		this.retryDelayMs = FIRST_RETRY_MS;
		this.schedule(DEBOUNCE_MS, false);
	}

	// The socket dropped: everything the store holds is possibly stale. Marking is idempotent and the
	// flag outlives any single recovery round, so a signal arriving mid-round can never be lost.
	markStale() {
		this.isStale = true;
		this.markCount++;
	}

	// A "the backend may be reachable again" trigger. Only a store that knows it missed something
	// does any work; the backoff restarts because the world just told us the network changed.
	retryNow() {
		if (!this.isStale) return;
		this.retryDelayMs = FIRST_RETRY_MS;
		this.schedule(DEBOUNCE_MS, true);
	}

	// Refresh straight away, dropping any pending run so the same refetch is not issued twice. Used
	// for the initial load and for a user's own write, where waiting out the debounce would show
	// stale data back to the person who just changed it.
	async refreshNow() {
		this.clearTimer();
		await this.run(false);
	}

	// Drop everything in flight and forget the staleness: the store is about to reload from scratch
	// for a different user, or is going away.
	cancel() {
		this.clearTimer();
		this.sequence.bump();
		this.isStale = false;
		this.markCount = 0;
		this.retryDelayMs = FIRST_RETRY_MS;
	}

	private schedule(delayMs: number, gated: boolean) {
		this.clearTimer();
		this.timer = setTimeout(() => {
			this.timer = null;
			void this.run(gated);
		}, delayMs);
	}

	private clearTimer() {
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
	}

	private async run(gated: boolean) {
		if (gated) {
			// A hidden tab is deliberately left alone; the visibilitychange trigger picks its retry back
			// up when the user returns, so a backgrounded session burns nothing.
			if (browser && document.hidden) return;
			// One shared health probe gates the whole retry round, so a tick while the backend is
			// unreachable costs a single small request instead of a doomed refetch per store.
			if (!(await this.client.probeBackend())) {
				this.scheduleRetry();
				return;
			}
		}

		const marksAtStart = this.markCount;
		const token = this.sequence.next();
		try {
			await this.refresh(token);
			// A superseded run belongs to the newer run, which will clear or keep the flag itself.
			// Re-marking here would resurrect staleness the newer run is about to resolve.
			if (!this.sequence.isCurrent(token)) return;
			if (this.markCount === marksAtStart) this.isStale = false;
			this.retryDelayMs = FIRST_RETRY_MS;
		} catch (error) {
			if (!this.sequence.isCurrent(token)) return;
			this.isStale = true;
			this.client.handleConnectionError(error, this.context, this.operation);
			this.scheduleRetry();
		}
	}

	private scheduleRetry() {
		const delayMs = this.retryDelayMs;
		this.retryDelayMs = Math.min(this.retryDelayMs * 2, MAX_RETRY_MS);
		this.schedule(delayMs, true);
	}
}
