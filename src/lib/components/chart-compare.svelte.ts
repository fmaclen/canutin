// Drag-to-compare pointer state machine shared by the line charts: press captures an anchor
// point, layerchart's own hit-testing keeps the hovered point current while dragging, and
// release clears both. `range` orders the endpoints chronologically.
export class ChartCompare<T extends { date: Date }> {
	dragging = $state.raw(false);
	anchor = $state.raw<T | null>(null);
	current = $state.raw<T | null>(null);

	start(event: PointerEvent, hovered: T | null) {
		if (event.button !== 0) return;
		this.dragging = true;
		this.anchor = hovered;
		this.current = hovered;
	}

	end() {
		this.dragging = false;
		this.anchor = null;
		this.current = null;
	}

	track(hovered: T | null) {
		if (!this.dragging || !hovered) return;
		// Touch has no hover before the press, so the anchor is the first point hit after it
		if (!this.anchor) this.anchor = hovered;
		this.current = hovered;
	}

	get range(): [T, T] | null {
		if (!this.anchor || !this.current || this.anchor === this.current) return null;
		return this.anchor.date <= this.current.date
			? [this.anchor, this.current]
			: [this.current, this.anchor];
	}
}

// Percent is relative to |earlier value| so the sign follows the diff; null (hidden) on a zero baseline
export function diffPercent(earlier: number, later: number) {
	const diff = later - earlier;
	return { diff, percent: earlier === 0 ? null : (diff / Math.abs(earlier)) * 100 };
}
