/** Rate limiter interface */
export interface RateLimiter {
	/**
	 * Check if a request is allowed.
	 * Returns the number of seconds until the limit resets, or 0 if allowed.
	 */
	check(key: string): Promise<RateLimitResult>;

	/** Reset the rate limit for a key */
	reset(key: string): void;
}

export interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	/** Seconds until rate limit resets */
	retryAfter: number;
}
