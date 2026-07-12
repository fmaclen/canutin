import { upsertById, type SnapshotMutation } from './utils';

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

// Buffers realtime events that arrive while a snapshot fetch is in flight, then replays them onto
// the fetched list before it is committed so the older snapshot can't clobber a newer event.
export class SnapshotReconciler<T extends { id: string }> {
	#token: number | null = null;
	#buffer: SnapshotMutation<T>[] = [];

	begin(token: number) {
		this.#token = token;
		this.#buffer = [];
	}

	// No-ops unless a snapshot is in flight, so callers buffer unconditionally on every event.
	buffer(record: T, deleted: boolean) {
		if (this.#token === null) return;
		this.#buffer.push({ deleted, record });
	}

	get deletedIds() {
		return new Set(this.#buffer.filter((mutation) => mutation.deleted).map((m) => m.record.id));
	}

	replay(list: T[]) {
		let result = list;
		for (const mutation of this.#buffer) {
			result = mutation.deleted
				? result.filter((record) => record.id !== mutation.record.id)
				: upsertById(result, mutation.record).list;
		}
		return result;
	}

	// Reset only when this snapshot is still the active one - a newer begin() must not be discarded
	// by a superseded fetch's finally block.
	end(token: number) {
		if (this.#token === token) this.reset();
	}

	reset() {
		this.#token = null;
		this.#buffer = [];
	}
}

// Per-key mutation counter. A targeted refetch reads its key's epoch before fetching and bails on
// commit when the epoch moved, so a delete/update landing mid-fetch is never overwritten by a stale
// result.
export class MutationEpochMap {
	#epochs = new Map<string, number>();

	// Reading a key registers it (defaulting to 0) so bumpMatching can invalidate an in-flight
	// targeted fetch that has not yet recorded any mutation of its own.
	read(key: string) {
		const epoch = this.#epochs.get(key) ?? 0;
		this.#epochs.set(key, epoch);
		return epoch;
	}

	isCurrent(key: string, epoch: number) {
		return (this.#epochs.get(key) ?? 0) === epoch;
	}

	bump(key: string) {
		this.#epochs.set(key, (this.#epochs.get(key) ?? 0) + 1);
	}

	bumpMatching(predicate: (key: string) => boolean) {
		for (const key of this.#epochs.keys()) {
			if (predicate(key)) this.bump(key);
		}
	}

	clear() {
		this.#epochs.clear();
	}
}
