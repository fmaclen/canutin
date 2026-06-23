package main

import (
	"sync"
	"testing"
	"time"
)

func resetBalanceState() {
	pendingMu.Lock()
	defer pendingMu.Unlock()
	pending = make(map[string]time.Time)
	inFlight = make(map[string]bool)
	dirty = make(map[string]time.Time)
	calcSem = make(chan struct{}, maxConcurrentCalcs)
}

func startCalc(accountID string) bool {
	pendingMu.Lock()
	defer pendingMu.Unlock()
	if inFlight[accountID] {
		dirty[accountID] = time.Now()
		return false
	}
	inFlight[accountID] = true
	go runCalc(accountID)
	return true
}

// NOTE: guards that overlapping recomputes serialize so the newest enqueued value is recorded last,
// even when the older calculation is slower and would otherwise save after it.
func TestSerializedRecomputeKeepsNewestValue(t *testing.T) {
	resetBalanceState()
	defer resetBalanceState()
	originalRecompute := recompute
	defer func() { recompute = originalRecompute }()

	const accountID = "acct"

	var mu sync.Mutex
	var saves []int // ordered record of "saved" values, newest balance is the last entry
	calls := 0
	finished := make(chan struct{}, 8)

	recompute = func(id string) {
		mu.Lock()
		n := calls
		calls++
		mu.Unlock()

		if n == 0 {
			time.Sleep(80 * time.Millisecond)
		}

		mu.Lock()
		saves = append(saves, n)
		mu.Unlock()
		finished <- struct{}{}
	}

	if !startCalc(accountID) {
		t.Fatal("first startCalc should launch a calculation")
	}
	if startCalc(accountID) {
		t.Fatal("second startCalc should coalesce into dirty, not launch a parallel calculation")
	}
	if startCalc(accountID) {
		t.Fatal("third startCalc should also coalesce, not launch a parallel calculation")
	}

	for i := 0; i < 2; i++ {
		select {
		case <-finished:
		case <-time.After(2 * time.Second):
			t.Fatalf("expected calculation %d to finish", i)
		}
	}

	select {
	case <-finished:
		t.Fatal("a third calculation ran; follow-ups were not coalesced into exactly one")
	case <-time.After(100 * time.Millisecond):
	}

	mu.Lock()
	defer mu.Unlock()
	if len(saves) != 2 {
		t.Fatalf("expected exactly 2 saves, got %d: %v", len(saves), saves)
	}
	if saves[len(saves)-1] != 1 {
		t.Fatalf("newest calculation must save last; got order %v", saves)
	}
	if saves[0] != 0 {
		t.Fatalf("older calculation must save first; got order %v", saves)
	}

	pendingMu.Lock()
	defer pendingMu.Unlock()
	if inFlight[accountID] {
		t.Fatal("inFlight should be cleared after the follow-up calculation")
	}
	if _, ok := dirty[accountID]; ok {
		t.Fatal("dirty should be cleared after the follow-up calculation")
	}
}

// NOTE: guards that an inline recompute under withAccountCalcLock never overlaps a worker calc for the
// same account, and that a worker enqueue arriving mid-lock coalesces into a single follow-up.
func TestInlineLockSerializesWithWorker(t *testing.T) {
	resetBalanceState()
	defer resetBalanceState()
	originalRecompute := recompute
	defer func() { recompute = originalRecompute }()

	const accountID = "acct"

	var mu sync.Mutex
	active := 0
	maxActive := 0
	workerRan := make(chan struct{}, 1)

	enter := func() {
		mu.Lock()
		active++
		if active > maxActive {
			maxActive = active
		}
		mu.Unlock()
	}
	leave := func() {
		mu.Lock()
		active--
		mu.Unlock()
	}

	recompute = func(id string) {
		enter()
		time.Sleep(40 * time.Millisecond)
		leave()
		select {
		case workerRan <- struct{}{}:
		default:
		}
	}

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		_ = withAccountCalcLock(accountID, func() error {
			enter()
			startCalc(accountID)
			time.Sleep(40 * time.Millisecond)
			leave()
			return nil
		})
	}()

	wg.Wait()

	select {
	case <-workerRan:
	case <-time.After(2 * time.Second):
		t.Fatal("worker follow-up never ran after inline recompute released the lock")
	}

	mu.Lock()
	defer mu.Unlock()
	if maxActive != 1 {
		t.Fatalf("inline and worker recompute overlapped (maxActive=%d); must be serialized", maxActive)
	}
}

// NOTE: guards that the report-dirty variant releases the slot and defers the follow-up (no inline
// runCalc), leaving the account clean so the revert handler re-enqueues it post-commit.
func TestReportDirtyDefersFollowUp(t *testing.T) {
	resetBalanceState()
	defer resetBalanceState()
	originalRecompute := recompute
	defer func() { recompute = originalRecompute }()

	const accountID = "acct"

	var mu sync.Mutex
	calls := 0
	recompute = func(id string) {
		mu.Lock()
		calls++
		mu.Unlock()
	}

	wentDirty, err := withAccountCalcLockReportDirty(accountID, func() error {
		if startCalc(accountID) {
			t.Error("enqueue during the inline lock should coalesce into dirty, not launch a calculation")
		}
		return nil
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !wentDirty {
		t.Fatal("an enqueue landed during the inline recompute; wentDirty must be true")
	}

	time.Sleep(50 * time.Millisecond)

	pendingMu.Lock()
	stillInFlight := inFlight[accountID]
	_, stillDirty := dirty[accountID]
	pendingMu.Unlock()
	if stillInFlight {
		t.Fatal("report-dirty variant must release the in-flight slot; the follow-up is deferred to post-commit")
	}
	if stillDirty {
		t.Fatal("the dirty flag must be consumed by the report so the caller owns the re-enqueue")
	}

	mu.Lock()
	defer mu.Unlock()
	if calls != 0 {
		t.Fatalf("no follow-up recompute may run inline; the worker recomputes post-commit (calls=%d)", calls)
	}
}

// drainPendingOnce mirrors a single balanceWorker tick's pending-drain loop, ignoring the debounce
// window so a test can deterministically force the worker to act on queued accounts.
func drainPendingOnce() {
	pendingMu.Lock()
	defer pendingMu.Unlock()
	now := time.Now()
	for accountID := range pending {
		delete(pending, accountID)
		if inFlight[accountID] {
			dirty[accountID] = now
			continue
		}
		inFlight[accountID] = true
		go runCalc(accountID)
	}
}

// NOTE: guards that claiming the per-account calc lock drops a debounce-pending worker calc queued
// before the lock (e.g. a pre-existing transaction added moments before an import). Were it left
// queued, it would fire after the lock writes its authoritative snapshot, recompute against the
// lock's just-written transactions, and append an untagged derived orphan that import-revert — which
// deletes only session-tagged rows — cannot clean up.
func TestInlineLockDropsPendingWorkerCalc(t *testing.T) {
	resetBalanceState()
	defer resetBalanceState()
	originalRecompute := recompute
	defer func() { recompute = originalRecompute }()

	const accountID = "acct"

	var mu sync.Mutex
	calls := 0
	recompute = func(id string) {
		mu.Lock()
		calls++
		mu.Unlock()
	}

	enqueueBalance(accountID)

	_ = withAccountCalcLock(accountID, func() error { return nil })

	drainPendingOnce()
	time.Sleep(80 * time.Millisecond)

	mu.Lock()
	defer mu.Unlock()
	if calls != 0 {
		t.Fatalf("a worker calc fired after the lock and would write an untagged stale snapshot (calls=%d)", calls)
	}
}

// NOTE: complements TestInlineLockDropsPendingWorkerCalc for the revert path: the report-dirty lock
// variant must likewise drop a pre-lock pending worker calc so revert's recompute is the only
// untagged derived snapshot left for the account.
func TestReportDirtyLockDropsPendingWorkerCalc(t *testing.T) {
	resetBalanceState()
	defer resetBalanceState()
	originalRecompute := recompute
	defer func() { recompute = originalRecompute }()

	const accountID = "acct"

	var mu sync.Mutex
	calls := 0
	recompute = func(id string) {
		mu.Lock()
		calls++
		mu.Unlock()
	}

	enqueueBalance(accountID)

	wentDirty, err := withAccountCalcLockReportDirty(accountID, func() error { return nil })
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if wentDirty {
		t.Fatal("a pre-lock pending entry must be dropped, not reported as dirty")
	}

	drainPendingOnce()
	time.Sleep(80 * time.Millisecond)

	mu.Lock()
	defer mu.Unlock()
	if calls != 0 {
		t.Fatalf("a worker calc fired after the report-dirty lock (calls=%d)", calls)
	}
}
