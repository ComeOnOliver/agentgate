import { describe, expect, it } from "vitest";
import { ApiKeyAuth } from "../src/auth/api-key.js";
import { BearerAuth } from "../src/auth/bearer.js";

describe("ApiKeyAuth", () => {
	it("registers an agent and returns credentials", () => {
		const auth = new ApiKeyAuth();

		const result = auth.register({ name: "test-agent" });

		expect(result.agentId).toBeDefined();
		expect(result.apiKey).toMatch(/^ag_/);
		expect(result.scopes).toEqual([]);
	});

	it("authenticates with a valid API key", async () => {
		const auth = new ApiKeyAuth();

		const { apiKey } = auth.register({ name: "my-agent", scopes: ["read"] }, ["read", "write"]);

		const identity = await auth.authenticate(apiKey);

		expect(identity).not.toBeNull();
		expect(identity?.name).toBe("my-agent");
		expect(identity?.scopes).toEqual(["read"]);
	});

	it("returns null for invalid API key", async () => {
		const auth = new ApiKeyAuth();

		const identity = await auth.authenticate("ag_invalid_key");

		expect(identity).toBeNull();
	});

	it("intersects requested scopes with allowed scopes", () => {
		const auth = new ApiKeyAuth();

		const result = auth.register({ name: "agent", scopes: ["read", "write", "admin"] }, [
			"read",
			"write",
		]);

		expect(result.scopes).toEqual(["read", "write"]);
		expect(result.scopes).not.toContain("admin");
	});

	it("revokes an agent", async () => {
		const auth = new ApiKeyAuth();

		const { agentId, apiKey } = auth.register({ name: "agent" });

		expect(await auth.authenticate(apiKey)).not.toBeNull();

		const revoked = auth.revoke(agentId);
		expect(revoked).toBe(true);

		expect(await auth.authenticate(apiKey)).toBeNull();
	});

	it("lists agents without exposing keys", () => {
		const auth = new ApiKeyAuth();

		auth.register({ name: "agent-1" });
		auth.register({ name: "agent-2" });

		const agents = auth.list();
		expect(agents).toHaveLength(2);

		for (const agent of agents) {
			expect(agent).not.toHaveProperty("apiKey");
			expect(agent.name).toBeDefined();
		}
	});
});

describe("BearerAuth", () => {
	it("delegates to the validate function", async () => {
		const auth = new BearerAuth(async (token) => {
			if (token === "valid-token") {
				return { id: "1", name: "agent", scopes: ["read"], metadata: {} };
			}
			return null;
		});

		const identity = await auth.authenticate("valid-token");
		expect(identity).not.toBeNull();
		expect(identity?.id).toBe("1");

		const invalid = await auth.authenticate("bad-token");
		expect(invalid).toBeNull();
	});

	it("has scheme 'bearer'", () => {
		const auth = new BearerAuth(async () => null);
		expect(auth.scheme).toBe("bearer");
	});
});
