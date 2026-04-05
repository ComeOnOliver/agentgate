import { v4 as uuidv4 } from "uuid";
import type { AgentIdentity, UserIdentity } from "../types.js";
import type { AuthStrategy, RegistrationRequest, RegistrationResponse } from "./types.js";

interface StoredAgent {
	id: string;
	userId: string;
	userName?: string;
	userEmail?: string;
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
	 * @param user - The authenticated user creating this agent
	 */
	register(
		request: RegistrationRequest,
		allowedScopes?: string[],
		user?: UserIdentity,
	): RegistrationResponse {
		const id = uuidv4();
		const apiKey = `ag_${uuidv4().replace(/-/g, "")}`;

		let scopes = request.scopes ?? [];
		if (allowedScopes) {
			scopes = scopes.filter((s) => allowedScopes.includes(s));
		}

		const agent: StoredAgent = {
			id,
			userId: user?.id ?? "anonymous",
			userName: user?.name ?? undefined,
			userEmail: user?.email ?? undefined,
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

	/** Revoke an agent only if it belongs to the given user */
	revokeByUser(agentId: string, userId: string): boolean {
		const agent = this.agents.get(agentId);
		if (!agent || agent.userId !== userId) {
			return false;
		}
		return this.agents.delete(agentId);
	}

	/** List all registered agents (without keys) */
	list(): Array<Omit<StoredAgent, "apiKey">> {
		return Array.from(this.agents.values()).map(({ apiKey: _, ...rest }) => rest);
	}

	/** List agents belonging to a specific user (without keys) */
	listByUser(userId: string): Array<Omit<StoredAgent, "apiKey">> {
		return Array.from(this.agents.values())
			.filter((agent) => agent.userId === userId)
			.map(({ apiKey: _, ...rest }) => rest);
	}

	/** Look up which user owns an agent */
	getAgentUserId(agentId: string): string | null {
		return this.agents.get(agentId)?.userId ?? null;
	}
}
