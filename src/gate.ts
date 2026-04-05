import { ActionRegistry } from "./action.js";
import { ApiKeyAuth } from "./auth/api-key.js";
import { BearerAuth } from "./auth/bearer.js";
import type { AuthStrategy } from "./auth/types.js";
import { Logger } from "./logger.js";
import { generateManifest } from "./manifest.js";
import type { HandlerDeps } from "./middleware/common.js";
import { createExpressMiddleware } from "./middleware/express.js";
import { MemoryRateLimiter, parseWindow } from "./ratelimit/memory.js";
import type { RateLimiter } from "./ratelimit/types.js";
import type { ActionDefinition, GateConfig, Manifest, NamespaceDefinition } from "./types.js";

export class AgentGate {
	private config: GateConfig;
	private registry: ActionRegistry;
	private authStrategy: AuthStrategy | null = null;
	private apiKeyAuth: ApiKeyAuth | null = null;
	private rateLimiter: RateLimiter | null = null;
	private logger: Logger;

	constructor(config: GateConfig) {
		this.config = config;
		this.registry = new ActionRegistry();
		this.logger = new Logger();

		// Set up auth
		if (config.auth) {
			if (config.auth.strategy === "api-key") {
				this.apiKeyAuth = new ApiKeyAuth();
				this.authStrategy = this.apiKeyAuth;
			} else if (config.auth.strategy === "bearer" && config.auth.validate) {
				this.authStrategy = new BearerAuth(config.auth.validate);
			}
		}

		// Set up rate limiting
		if (config.rateLimit) {
			const windowMs = parseWindow(config.rateLimit.window);
			this.rateLimiter = new MemoryRateLimiter(windowMs, config.rateLimit.max);
		}
	}

	/** Define a single action */
	defineAction(name: string, definition: ActionDefinition): this {
		this.registry.register(name, definition);
		return this;
	}

	/** Define a namespace of related actions */
	defineNamespace(namespace: string, definition: NamespaceDefinition): this {
		for (const [actionName, actionDef] of Object.entries(definition.actions)) {
			const fullName = `${namespace}.${actionName}`;
			const mergedDef: ActionDefinition = {
				...actionDef,
				scopes: actionDef.scopes ?? definition.scopes,
			};
			this.registry.register(fullName, mergedDef);
		}
		return this;
	}

	/** Generate the manifest document */
	manifest(): Manifest {
		return generateManifest(this.config, this.registry);
	}

	/** Get the action registry (for testing/inspection) */
	get actions(): ActionRegistry {
		return this.registry;
	}

	/** Build the dependency bag for middleware handlers */
	private deps(): HandlerDeps {
		return {
			config: this.config,
			registry: this.registry,
			auth: this.authStrategy,
			rateLimiter: this.rateLimiter,
			logger: this.logger,
			manifest: this.manifest(),
			apiKeyAuth: this.apiKeyAuth,
		};
	}

	/** Return an Express middleware function */
	express(): ReturnType<typeof createExpressMiddleware> {
		return createExpressMiddleware(this.deps());
	}

	/**
	 * Return a handler factory for Hono.
	 * Usage: `createHonoMiddleware(gate.hono())(honoApp)`
	 */
	hono() {
		// Lazy import to keep hono optional
		const mod = require("./middleware/hono.js") as {
			createHonoMiddleware: typeof import("./middleware/hono.js")["createHonoMiddleware"];
		};
		return mod.createHonoMiddleware(this.deps());
	}
}
