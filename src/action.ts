import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ValidationError } from "./errors.js";
import type { ActionDefinition, AgentContext, ManifestAction } from "./types.js";

/** Internal representation of a registered action */
export interface RegisteredAction {
	name: string;
	definition: ActionDefinition;
}

/** Registry that holds all defined actions */
export class ActionRegistry {
	private actions = new Map<string, RegisteredAction>();

	/** Register a new action */
	register(name: string, definition: ActionDefinition): void {
		if (this.actions.has(name)) {
			throw new Error(`Action "${name}" is already registered`);
		}
		validateActionName(name);
		this.actions.set(name, { name, definition });
	}

	/** Get an action by name */
	get(name: string): RegisteredAction | undefined {
		return this.actions.get(name);
	}

	/** Check if an action exists */
	has(name: string): boolean {
		return this.actions.has(name);
	}

	/** Get all registered actions */
	all(): RegisteredAction[] {
		return Array.from(this.actions.values());
	}

	/** Number of registered actions */
	get size(): number {
		return this.actions.size;
	}
}

/** Validate an action name (must be dot-separated identifiers) */
function validateActionName(name: string): void {
	if (!/^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)*$/.test(name)) {
		throw new Error(
			`Invalid action name "${name}". Must be dot-separated identifiers (e.g., "projects.list").`,
		);
	}
}

/** Validate params against the action's Zod schema */
export function validateParams(action: RegisteredAction, params: unknown): unknown {
	if (!action.definition.params) {
		return undefined;
	}

	const result = action.definition.params.safeParse(params);
	if (!result.success) {
		throw new ValidationError("Invalid parameters", result.error.flatten());
	}
	return result.data;
}

/** Execute an action with validated params */
export async function executeAction(
	action: RegisteredAction,
	params: unknown,
	ctx: AgentContext,
): Promise<unknown> {
	const validatedParams = validateParams(action, params);
	return action.definition.handler(validatedParams, ctx);
}

/** Convert a Zod schema to JSON Schema for the manifest */
export function zodToManifestSchema(schema: z.ZodType): Record<string, unknown> {
	return zodToJsonSchema(schema, { target: "openApi3" }) as Record<string, unknown>;
}

/** Convert a registered action to its manifest representation */
export function actionToManifest(action: RegisteredAction): ManifestAction {
	const manifest: ManifestAction = {
		name: action.name,
		description: action.definition.description,
		scopes: action.definition.scopes ?? [],
	};

	if (action.definition.params) {
		manifest.params = zodToManifestSchema(action.definition.params);
	}

	if (action.definition.returns) {
		manifest.returns = zodToManifestSchema(action.definition.returns);
	}

	return manifest;
}
