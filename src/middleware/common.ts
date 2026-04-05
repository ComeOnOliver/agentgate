import { v4 as uuidv4 } from "uuid";
import { executeAction } from "../action.js";
import type { ActionRegistry } from "../action.js";
import type { ApiKeyAuth } from "../auth/api-key.js";
import type { AuthStrategy, RegistrationRequest } from "../auth/types.js";
import {
	AgentGateError,
	AuthError,
	ForbiddenError,
	NotFoundError,
	RateLimitError,
	ValidationError,
} from "../errors.js";
import type { Logger } from "../logger.js";
import type { RateLimiter } from "../ratelimit/types.js";
import type { AgentContext, AgentIdentity, GateConfig, Manifest } from "../types.js";

/** Framework-agnostic request representation */
export interface GateRequest {
	method: string;
	path: string;
	body?: unknown;
	headers: Record<string, string | undefined>;
}

/** Framework-agnostic response representation */
export interface GateResponse {
	status: number;
	headers: Record<string, string>;
	body: unknown;
}

export interface HandlerDeps {
	config: GateConfig;
	registry: ActionRegistry;
	auth: AuthStrategy | null;
	rateLimiter: RateLimiter | null;
	logger: Logger;
	manifest: Manifest;
	apiKeyAuth: ApiKeyAuth | null;
}

/** Main request handler — dispatches to the appropriate route */
export async function handleRequest(req: GateRequest, deps: HandlerDeps): Promise<GateResponse> {
	const { path, method } = req;

	try {
		// Health check
		if (method === "GET" && path === "/health") {
			return json(200, { status: "ok", name: deps.config.name });
		}

		// Manifest
		if (method === "GET" && path === "/manifest.json") {
			return json(200, deps.manifest);
		}

		// Agent registration (API key only)
		if (method === "POST" && path === "/register") {
			return await handleRegister(req, deps);
		}

		// Action invocation
		if (method === "POST" && path.startsWith("/actions/")) {
			return await handleAction(req, deps);
		}

		return json(404, { error: { code: "NOT_FOUND", message: "Route not found" } });
	} catch (err) {
		return handleError(err, deps.logger);
	}
}

async function handleRegister(req: GateRequest, deps: HandlerDeps): Promise<GateResponse> {
	if (!deps.apiKeyAuth) {
		return json(404, {
			error: { code: "NOT_FOUND", message: "Registration not available" },
		});
	}

	const body = req.body as RegistrationRequest | undefined;
	if (!body?.name) {
		return json(400, {
			error: { code: "VALIDATION_ERROR", message: 'Missing required field "name"' },
		});
	}

	const allScopes = deps.registry.all().flatMap((a) => a.definition.scopes ?? []);
	const uniqueScopes = [...new Set(allScopes)];

	const result = deps.apiKeyAuth.register(body, uniqueScopes);

	deps.logger.info("Agent registered", { agentId: result.agentId, name: body.name });
	return json(201, result);
}

async function handleAction(req: GateRequest, deps: HandlerDeps): Promise<GateResponse> {
	const actionName = req.path.replace("/actions/", "");

	// Authenticate
	const agent = await authenticate(req, deps);

	// Rate limit
	if (deps.rateLimiter) {
		const key = agent.id;
		const result = await deps.rateLimiter.check(key);
		if (!result.allowed) {
			throw new RateLimitError(result.retryAfter);
		}
	}

	// Find action
	const action = deps.registry.get(actionName);
	if (!action) {
		throw new NotFoundError(`Action "${actionName}" not found`);
	}

	// Check scopes
	const requiredScopes = action.definition.scopes ?? [];
	if (requiredScopes.length > 0) {
		const hasScope = requiredScopes.some((s) => agent.scopes.includes(s));
		if (!hasScope) {
			throw new ForbiddenError(`Missing required scope. Need one of: ${requiredScopes.join(", ")}`);
		}
	}

	// Build context
	const ctx: AgentContext = {
		agent,
		requestId: uuidv4(),
		timestamp: new Date(),
	};

	// Execute
	const start = Date.now();
	const result = await executeAction(action, (req.body as Record<string, unknown>)?.params, ctx);
	const duration = Date.now() - start;

	deps.logger.info("Action executed", {
		action: actionName,
		agentId: agent.id,
		duration,
		requestId: ctx.requestId,
	});

	return json(200, { result });
}

async function authenticate(req: GateRequest, deps: HandlerDeps): Promise<AgentIdentity> {
	if (!deps.auth) {
		// No auth configured — return anonymous identity
		return { id: "anonymous", name: "anonymous", scopes: [], metadata: {} };
	}

	const authHeader = req.headers.authorization ?? req.headers.Authorization;
	if (!authHeader) {
		throw new AuthError("Missing Authorization header");
	}

	// Extract token: support "Bearer <token>" and "ApiKey <token>" formats
	const parts = authHeader.split(" ");
	const token = parts.length === 2 ? parts[1] : parts[0];

	const identity = await deps.auth.authenticate(token);
	if (!identity) {
		throw new AuthError("Invalid credentials");
	}

	return identity;
}

function handleError(err: unknown, logger: Logger): GateResponse {
	if (err instanceof RateLimitError) {
		return {
			status: err.statusCode,
			headers: { "Retry-After": String(err.retryAfter) },
			body: err.toJSON(),
		};
	}

	if (err instanceof ValidationError) {
		return json(err.statusCode, err.toJSON());
	}

	if (err instanceof AgentGateError) {
		return json(err.statusCode, err.toJSON());
	}

	logger.error("Unexpected error", {
		error: err instanceof Error ? err.message : String(err),
		stack: err instanceof Error ? err.stack : undefined,
	});

	return json(500, { error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
}

function json(status: number, body: unknown): GateResponse {
	return {
		status,
		headers: { "Content-Type": "application/json" },
		body,
	};
}
