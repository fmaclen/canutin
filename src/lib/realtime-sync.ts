// Monotonic latest-request guard. An async refresh takes a token from next() and bails as soon as
// isCurrent(token) turns false because a newer refresh - or a supersede via bump() - advanced it.
export class RequestSequence {
	#value = 0;

	next() {
		return ++this.#value;
	}

	get current() {
		return this.#value;
	}

	isCurrent(token: number) {
		return token === this.#value;
	}

	// Advance without starting a request, superseding any in-flight refresh (e.g. on logout).
	bump() {
		this.#value++;
	}
}

// Trailing-edge debounce. schedule() coalesces a burst of realtime events into a single deferred
// call; cancel() drops any pending call on dispose or logout.
export class Debouncer {
	private timer: ReturnType<typeof setTimeout> | null = null;

	constructor(private delayMs: number) {}

	schedule(callback: () => void) {
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			this.timer = null;
			callback();
		}, this.delayMs);
	}

	cancel() {
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
	}
}
