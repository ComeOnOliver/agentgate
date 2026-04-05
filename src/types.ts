import type { z } from "zod";

/** Framework-agnostic request representation */
export interface GateRequest {
	method: string;
	path: string;
	body?: unknown;
	headers: Record<string, string | undefined>;
}

/** Metadata about the gate instance */
export interface GateConfig {
	name: string;
	version: string;
	description?: string;
	auth?: AuthConfig;
	rateLimit?: RateLimitConfig;
	basePath?: string;
}

/** Auth configuration */
export interface AuthConfig {
	strategy: "api-key" | "bearer" | "none";
	/** Custom token validation function for bearer strategy */
	validate?: (token: string) => Promise<AgentIdentity | null>;

	/** Resolve the current user from the host project's auth system */
	userResolver?: (req: GateRequest) => Promise<UserIdentity | null>;

	/** Optional — restrict who can register agents */
	canRegisterAgent?: (user: UserIdentity) => Promise<boolean>;

	/** Optional — restrict max scopes per user */
	maxScopes?: (user: UserIdentity) => Promise<string[]>;
}

/** Rate limit configuration */
export interface RateLimitConfig {
	/** Time window (e.g., '1m', '1h', '1s') */
	window: string;
	/** Max requests per window */
	max: number;
}

/** Identity of the authenticated user from the host project */
export interface UserIdentity {
	id: string;
	email?: string;
	name?: string;
	roles?: string[];
	metadata?: Record<string, unknown>;
}

/** Identity of the authenticated agent */
export interface AgentIdentity {
	id: string;
	name: string;
	scopes: string[];
	metadata: Record<string, unknown>;
}

/** Context passed to action handlers */
export interface AgentContext {
	agent: AgentIdentity;
	user?: UserIdentity;
	requestId: string;
	timestamp: Date;
}

/** Definition of a single action */
export interface ActionDefinition<
	TParams extends z.ZodType = z.ZodType,
	TReturns extends z.ZodType = z.ZodType,
> {
	description: string;
	params?: TParams;
	returns?: TReturns;
	scopes?: string[];
	handler: (params: z.infer<TParams>, ctx: AgentContext) => Promise<z.infer<TReturns>>;
}

/** Namespace grouping related actions */
export interface NamespaceDefinition {
	description: string;
	scopes?: string[];
	actions: Record<string, ActionDefinition>;
}

/** Serialized action in the manifest */
export interface ManifestAction {
	name: string;
	description: string;
	params?: Record<string, unknown>;
	returns?: Record<string, unknown>;
	scopes: string[];
}

/** The full manifest document */
export interface Manifest {
	name: string;
	version: string;
	description: string;
	protocol: string;
	auth: {
		schemes: string[];
		registration: string | null;
	};
	actions: ManifestAction[];
}
