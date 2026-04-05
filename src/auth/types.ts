import type { AgentIdentity } from "../types.js";

/** Auth strategy interface */
export interface AuthStrategy {
	/** Validate a credential and return the agent identity, or null if invalid */
	authenticate(credential: string): Promise<AgentIdentity | null>;

	/** The scheme name (e.g., 'api-key', 'bearer') */
	readonly scheme: string;
}

/** Registration request from an agent */
export interface RegistrationRequest {
	name: string;
	scopes?: string[];
	metadata?: Record<string, unknown>;
}

/** Registration response returned to the agent */
export interface RegistrationResponse {
	agentId: string;
	apiKey: string;
	scopes: string[];
}
