import express from "express";
import supertest from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AgentGate } from "../src/gate.js";
import type { GateRequest, UserIdentity } from "../src/types.js";

/** Helper: create a gate with userResolver-based auth */
function createUserAuthApp(options?: {
	canRegisterAgent?: (user: UserIdentity) => Promise<boolean>;
	maxScopes?: (user: UserIdentity) => Promise<string[]>;
}) {
	const gate = new AgentGate({
		name: "user-auth-test",
		version: "1.0.0",
		description: "Test app with user-linked agents",
		auth: {
			strategy: "api-key",
			userResolver: async (req: GateRequest) => {
				// Simulate auth: X-User-Id header = authenticated user
				const userId = req.headers["x-user-id"];
				if (!userId) return null;
				const email = req.headers["x-user-email"] ?? undefined;
				const name = req.headers["x-user-name"] ?? undefined;
				const roles = req.headers["x-user-roles"]?.split(",") ?? [];
				return { id: userId, email, name, roles };
			},
			canRegisterAgent: options?.canRegisterAgent,
			maxScopes: options?.maxScopes,
		},
		rateLimit: { window: "1m", max: 100 },
	});

	gate.defineAction("echo", {
		description: "Echo the input back",
		params: z.object({ message: z.string() }),
		returns: z.object({ message: z.string() }),
		handler: async (params) => ({ message: params.message }),
	});

	gate.defineAction("greet", {
		description: "Greet someone",
		params: z.object({ name: z.string() }),
		scopes: ["greet"],
		handler: async (params) => ({ greeting: `Hello, ${params.name}!` }),
	});

	gate.defineAction("admin.reset", {
		description: "Admin reset",
		scopes: ["admin"],
		handler: async () => ({ reset: true }),
	});

	const app = express();
	app.use(express.json());
	app.use("/agent", gate.express());

	return { app, gate };
}

describe("User-linked agent registration", () => {
	it("requires authenticated user when userResolver is configured", async () => {
		const { app } = createUserAuthApp();

		// No X-User-Id header → 401
		const res = await supertest(app)
			.post("/agent/register")
			.send({ name: "my-agent", scopes: ["greet"] });

		expect(res.status).toBe(401);
		expect(res.body.error.code).toBe("AUTH_ERROR");
	});

	it("allows registration with authenticated user", async () => {
		const { app } = createUserAuthApp();

		const res = await supertest(app)
			.post("/agent/register")
			.set("X-User-Id", "user-1")
			.set("X-User-Name", "Alice")
			.set("X-User-Email", "alice@example.com")
			.send({ name: "alice-agent", scopes: ["greet"] });

		expect(res.status).toBe(201);
		expect(res.body.agentId).toBeDefined();
		expect(res.body.apiKey).toMatch(/^ag_/);
		expect(res.body.scopes).toContain("greet");
	});

	it("enforces canRegisterAgent — blocks unauthorized users", async () => {
		const { app } = createUserAuthApp({
			canRegisterAgent: async (user) => user.roles?.includes("agent-creator") ?? false,
		});

		// User without "agent-creator" role
		const res = await supertest(app)
			.post("/agent/register")
			.set("X-User-Id", "user-1")
			.send({ name: "blocked-agent" });

		expect(res.status).toBe(403);
		expect(res.body.error.code).toBe("FORBIDDEN");
	});

	it("enforces canRegisterAgent — allows authorized users", async () => {
		const { app } = createUserAuthApp({
			canRegisterAgent: async (user) => user.roles?.includes("agent-creator") ?? false,
		});

		const res = await supertest(app)
			.post("/agent/register")
			.set("X-User-Id", "user-1")
			.set("X-User-Roles", "agent-creator")
			.send({ name: "allowed-agent", scopes: ["greet"] });

		expect(res.status).toBe(201);
		expect(res.body.apiKey).toMatch(/^ag_/);
	});

	it("intersects requested scopes with user maxScopes", async () => {
		const { app } = createUserAuthApp({
			maxScopes: async (user) => {
				if (user.roles?.includes("admin")) return ["*"];
				return ["greet"]; // regular user can only get "greet"
			},
		});

		// Regular user requests greet + admin → only gets greet
		const res = await supertest(app)
			.post("/agent/register")
			.set("X-User-Id", "user-1")
			.send({ name: "limited-agent", scopes: ["greet", "admin"] });

		expect(res.status).toBe(201);
		expect(res.body.scopes).toEqual(["greet"]);
		expect(res.body.scopes).not.toContain("admin");
	});

	it("maxScopes wildcard gives admin all scopes", async () => {
		const { app } = createUserAuthApp({
			maxScopes: async (user) => {
				if (user.roles?.includes("admin")) return ["*"];
				return ["greet"];
			},
		});

		const res = await supertest(app)
			.post("/agent/register")
			.set("X-User-Id", "admin-1")
			.set("X-User-Roles", "admin")
			.send({ name: "admin-agent", scopes: ["greet", "admin"] });

		expect(res.status).toBe(201);
		expect(res.body.scopes).toContain("greet");
		expect(res.body.scopes).toContain("admin");
	});

	it("registered agent works for action invocation", async () => {
		const { app } = createUserAuthApp();

		// Register as user
		const regRes = await supertest(app)
			.post("/agent/register")
			.set("X-User-Id", "user-1")
			.send({ name: "agent", scopes: ["greet"] });

		const { apiKey } = regRes.body;

		// Invoke action using agent's API key
		const res = await supertest(app)
			.post("/agent/actions/greet")
			.set("Authorization", `Bearer ${apiKey}`)
			.send({ params: { name: "World" } });

		expect(res.status).toBe(200);
		expect(res.body.result.greeting).toBe("Hello, World!");
	});
});

describe("Agent management endpoints", () => {
	it("GET /agents lists only the current user's agents", async () => {
		const { app } = createUserAuthApp();

		// User 1 registers an agent
		await supertest(app)
			.post("/agent/register")
			.set("X-User-Id", "user-1")
			.send({ name: "user1-agent" });

		// User 2 registers an agent
		await supertest(app)
			.post("/agent/register")
			.set("X-User-Id", "user-2")
			.send({ name: "user2-agent" });

		// User 1 lists — should only see their own
		const res = await supertest(app).get("/agent/agents").set("X-User-Id", "user-1");

		expect(res.status).toBe(200);
		expect(res.body.agents).toHaveLength(1);
		expect(res.body.agents[0].name).toBe("user1-agent");
		expect(res.body.agents[0].userId).toBe("user-1");
		// Should not expose API key
		expect(res.body.agents[0]).not.toHaveProperty("apiKey");
	});

	it("GET /agents requires authentication", async () => {
		const { app } = createUserAuthApp();

		const res = await supertest(app).get("/agent/agents");

		expect(res.status).toBe(401);
		expect(res.body.error.code).toBe("AUTH_ERROR");
	});

	it("DELETE /agents/:id revokes own agent", async () => {
		const { app } = createUserAuthApp();

		// Register an agent
		const regRes = await supertest(app)
			.post("/agent/register")
			.set("X-User-Id", "user-1")
			.send({ name: "to-revoke" });

		const { agentId, apiKey } = regRes.body;

		// Revoke it
		const revokeRes = await supertest(app)
			.delete(`/agent/agents/${agentId}`)
			.set("X-User-Id", "user-1");

		expect(revokeRes.status).toBe(200);
		expect(revokeRes.body.revoked).toBe(true);

		// API key should no longer work
		const actionRes = await supertest(app)
			.post("/agent/actions/echo")
			.set("Authorization", `Bearer ${apiKey}`)
			.send({ params: { message: "hello" } });

		expect(actionRes.status).toBe(401);
	});

	it("DELETE /agents/:id cannot revoke another user's agent", async () => {
		const { app } = createUserAuthApp();

		// User 1 registers an agent
		const regRes = await supertest(app)
			.post("/agent/register")
			.set("X-User-Id", "user-1")
			.send({ name: "user1-agent" });

		const { agentId } = regRes.body;

		// User 2 tries to revoke it
		const revokeRes = await supertest(app)
			.delete(`/agent/agents/${agentId}`)
			.set("X-User-Id", "user-2");

		expect(revokeRes.status).toBe(404);
		expect(revokeRes.body.error.code).toBe("NOT_FOUND");
	});

	it("DELETE /agents/:id requires authentication", async () => {
		const { app } = createUserAuthApp();

		const res = await supertest(app).delete("/agent/agents/some-id");

		expect(res.status).toBe(401);
		expect(res.body.error.code).toBe("AUTH_ERROR");
	});
});

describe("AgentContext includes user info", () => {
	it("action handler receives user identity in context", async () => {
		let capturedCtx: unknown = null;

		const gate = new AgentGate({
			name: "ctx-test",
			version: "1.0.0",
			auth: {
				strategy: "api-key",
				userResolver: async (req: GateRequest) => {
					const userId = req.headers["x-user-id"];
					if (!userId) return null;
					return { id: userId, email: "test@example.com" };
				},
			},
		});

		gate.defineAction("capture", {
			description: "Captures context",
			handler: async (_params, ctx) => {
				capturedCtx = ctx;
				return { ok: true };
			},
		});

		const app = express();
		app.use(express.json());
		app.use("/agent", gate.express());

		// Register as user
		const regRes = await supertest(app)
			.post("/agent/register")
			.set("X-User-Id", "user-42")
			.send({ name: "ctx-agent" });

		// Invoke action
		await supertest(app)
			.post("/agent/actions/capture")
			.set("Authorization", `Bearer ${regRes.body.apiKey}`)
			.send({});

		const ctx = capturedCtx as { agent: { id: string }; user?: { id: string } };
		expect(ctx.agent.id).toBe(regRes.body.agentId);
		expect(ctx.user).toBeDefined();
		expect(ctx.user?.id).toBe("user-42");
	});
});
