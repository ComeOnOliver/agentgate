import type { RateLimitResult, RateLimiter } from "./types.js";

interface WindowEntry {
	timestamps: number[];
}

/**
 * In-memory sliding window rate limiter.
 * Suitable for single-process development/small deployments.
 */
export class MemoryRateLimiter implements RateLimiter {
	private windowMs: number;
	private max: number;
	private store = new Map<string, WindowEntry>();

	constructor(windowMs: number, max: number) {
		this.windowMs = windowMs;
		this.max = max;
	}

	async check(key: string): Promise<RateLimitResult> {
		const now = Date.now();
		const windowStart = now - this.windowMs;

		let entry = this.store.get(key);
		if (!entry) {
			entry = { timestamps: [] };
			this.store.set(key, entry);
		}

		// Remove expired timestamps
		entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

		if (entry.timestamps.length >= this.max) {
			const oldestInWindow = entry.timestamps[0];
			const retryAfter = Math.ceil((oldestInWindow + this.windowMs - now) / 1000);
			return {
				allowed: false,
				remaining: 0,
				retryAfter: Math.max(retryAfter, 1),
			};
		}

		entry.timestamps.push(now);
		return {
			allowed: true,
			remaining: this.max - entry.timestamps.length,
			retryAfter: 0,
		};
	}

	reset(key: string): void {
		this.store.delete(key);
	}
}

/** Parse a window string like '1m', '30s', '1h' into milliseconds */
export function parseWindow(window: string): number {
	const match = window.match(/^(\d+)(s|m|h)$/);
	if (!match) {
		throw new Error(`Invalid rate limit window: "${window}". Use format like "1m", "30s", "1h".`);
	}

	const value = Number.parseInt(match[1], 10);
	const unit = match[2];

	switch (unit) {
		case "s":
			return value * 1000;
		case "m":
			return value * 60 * 1000;
		case "h":
			return value * 60 * 60 * 1000;
		default:
			throw new Error(`Unknown time unit: ${unit}`);
	}
}
