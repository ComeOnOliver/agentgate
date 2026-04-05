// Core
export { AgentGate } from "./gate.js";

// Types
export type {
	GateConfig,
	AuthConfig,
	RateLimitConfig,
	AgentIdentity,
	AgentContext,
	ActionDefinition,
	NamespaceDefinition,
	ManifestAction,
	Manifest,
} from "./types.js";

// Errors
export {
	AgentGateError,
	ValidationError,
	AuthError,
	ForbiddenError,
	NotFoundError,
	RateLimitError,
} from "./errors.js";

// Auth
export { ApiKeyAuth } from "./auth/api-key.js";
export { BearerAuth } from "./auth/bearer.js";
export type { AuthStrategy, RegistrationRequest, RegistrationResponse } from "./auth/types.js";

// Rate limiting
export { MemoryRateLimiter, parseWindow } from "./ratelimit/memory.js";
export type { RateLimiter, RateLimitResult } from "./ratelimit/types.js";

// Logger
export { Logger } from "./logger.js";
export type { LogLevel, LogEntry } from "./logger.js";

// Action utilities
export { ActionRegistry } from "./action.js";
