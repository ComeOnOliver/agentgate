import { v4 as uuidv4 } from "uuid";
import type { AgentIdentity } from "../types.js";
import type { AuthStrategy, RegistrationRequest, RegistrationResponse } from "./types.js";

interface StoredAgent {
	id: string;
	name: string;
	apiKey: string;
	scopes: string[];
	metadata: Record<string, unknown>;
	createdAt: Date;
}

/**
 * API key authentication strategy.
 * Agents register to receive a key, then include it in subsequent requests.
 * Keys are prefixed with `ag_` for easy identification.
 */
export class ApiKeyAuth implements AuthStrategy {
	readonly scheme = "api-key";
	private agents = new Map<string, StoredAgent>();

	async authenticate(credential: string): Promise<AgentIdentity | null> {
		for (const agent of this.agents.values()) {
			if (agent.apiKey === credential) {
				return {
					id: agent.id,
					name: agent.name,
					scopes: agent.scopes,
					metadata: agent.metadata,
				};
			}
		}
		return null;
	}

	/**
	 * Register a new agent and return its API key.
	 * @param request - Registration details
	 * @param allowedScopes - Scopes the gate permits; requested scopes are intersected with these
	 */
	register(request: RegistrationRequest, allowedScopes?: string[]): RegistrationResponse {
		const id = uuidv4();
		const apiKey = `ag_${uuidv4().replace(/-/g, "")}`;

		let scopes = request.scopes ?? [];
		if (allowedScopes) {
			scopes = scopes.filter((s) => allowedScopes.includes(s));
		}

		const agent: StoredAgent = {
			id,
			name: request.name,
			apiKey,
			scopes,
			metadata: request.metadata ?? {},
			createdAt: new Date(),
		};

		this.agents.set(id, agent);

		return { agentId: id, apiKey, scopes };
	}

	/** Revoke an agent's access */
	revoke(agentId: string): boolean {
		return this.agents.delete(agentId);
	}

	/** List all registered agents (without keys) */
	list(): Array<Omit<StoredAgent, "apiKey">> {
		return Array.from(this.agents.values()).map(({ apiKey: _, ...rest }) => rest);
	}
}
