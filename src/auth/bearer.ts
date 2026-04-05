import type { AgentIdentity } from "../types.js";
import type { AuthStrategy } from "./types.js";

export type BearerValidateFn = (token: string) => Promise<AgentIdentity | null>;

/**
 * Bearer token authentication strategy.
 * Delegates validation to a user-provided function (e.g., JWT verification).
 */
export class BearerAuth implements AuthStrategy {
	readonly scheme = "bearer";
	private validateFn: BearerValidateFn;

	constructor(validate: BearerValidateFn) {
		this.validateFn = validate;
	}

	async authenticate(credential: string): Promise<AgentIdentity | null> {
		return this.validateFn(credential);
	}
}
