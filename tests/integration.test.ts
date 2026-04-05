import express from "express";
import supertest from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AgentGate } from "../src/gate.js";

function createTestApp() {
	const gate = new AgentGate({
		name: "test-app",
		version: "1.0.0",
		description: "Integration test app",
		auth: { strategy: "api-key" },
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

	gate.defineAction("noParams", {
		description: "Action with no params",
		handler: async () => ({ ok: true }),
	});

	const app = express();
	app.use(express.json());
	app.use("/agent", gate.express());

	return { app, gate };
}

describe("Express integration", () => {
	it("GET /agent/health returns status ok", async () => {
		const { app } = createTestApp();

		const res = await supertest(app).get("/agent/health");

		expect(res.status).toBe(200);
		expect(res.body.status).toBe("ok");
		expect(res.body.name).toBe("test-app");
	});

	it("GET /agent/manifest.json returns the manifest", async () => {
		const { app } = createTestApp();

		const res = await supertest(app).get("/agent/manifest.json");

		expect(res.status).toBe(200);
		expect(res.body.name).toBe("test-app");
		expect(res.body.protocol).toBe("agentgate/1.0");
		expect(res.body.actions).toHaveLength(3);
		expect(res.body.auth.schemes).toContain("api-key");
	});

	it("POST /agent/register creates a new agent", async () => {
		const { app } = createTestApp();

		const res = await supertest(app)
			.post("/agent/register")
			.send({ name: "test-agent", scopes: ["greet"] });

		expect(res.status).toBe(201);
		expect(res.body.agentId).toBeDefined();
		expect(res.body.apiKey).toMatch(/^ag_/);
		expect(res.body.scopes).toContain("greet");
	});

	it("POST /agent/actions/:name invokes an action", async () => {
		const { app } = createTestApp();

		// Register agent
		const regRes = await supertest(app).post("/agent/register").send({ name: "agent" });

		const { apiKey } = regRes.body;

		// Invoke action
		const res = await supertest(app)
			.post("/agent/actions/echo")
			.set("Authorization", `Bearer ${apiKey}`)
			.send({ params: { message: "hello" } });

		expect(res.status).toBe(200);
		expect(res.body.result.message).toBe("hello");
	});

	it("rejects unauthenticated requests", async () => {
		const { app } = createTestApp();

		const res = await supertest(app)
			.post("/agent/actions/echo")
			.send({ params: { message: "hello" } });

		expect(res.status).toBe(401);
		expect(res.body.error.code).toBe("AUTH_ERROR");
	});

	it("rejects invalid credentials", async () => {
		const { app } = createTestApp();

		const res = await supertest(app)
			.post("/agent/actions/echo")
			.set("Authorization", "Bearer invalid_key")
			.send({ params: { message: "hello" } });

		expect(res.status).toBe(401);
	});

	it("returns 404 for unknown actions", async () => {
		const { app } = createTestApp();

		const regRes = await supertest(app).post("/agent/register").send({ name: "agent" });

		const res = await supertest(app)
			.post("/agent/actions/nonexistent")
			.set("Authorization", `Bearer ${regRes.body.apiKey}`)
			.send({});

		expect(res.status).toBe(404);
		expect(res.body.error.code).toBe("NOT_FOUND");
	});

	it("validates action params", async () => {
		const { app } = createTestApp();

		const regRes = await supertest(app).post("/agent/register").send({ name: "agent" });

		const res = await supertest(app)
			.post("/agent/actions/echo")
			.set("Authorization", `Bearer ${regRes.body.apiKey}`)
			.send({ params: { message: 123 } });

		expect(res.status).toBe(400);
		expect(res.body.error.code).toBe("VALIDATION_ERROR");
	});

	it("enforces scope requirements", async () => {
		const { app } = createTestApp();

		// Register without the 'greet' scope
		const regRes = await supertest(app).post("/agent/register").send({ name: "agent", scopes: [] });

		const res = await supertest(app)
			.post("/agent/actions/greet")
			.set("Authorization", `Bearer ${regRes.body.apiKey}`)
			.send({ params: { name: "World" } });

		expect(res.status).toBe(403);
		expect(res.body.error.code).toBe("FORBIDDEN");
	});

	it("allows scoped access when agent has correct scope", async () => {
		const { app } = createTestApp();

		const regRes = await supertest(app)
			.post("/agent/register")
			.send({ name: "agent", scopes: ["greet"] });

		const res = await supertest(app)
			.post("/agent/actions/greet")
			.set("Authorization", `Bearer ${regRes.body.apiKey}`)
			.send({ params: { name: "World" } });

		expect(res.status).toBe(200);
		expect(res.body.result.greeting).toBe("Hello, World!");
	});

	it("handles actions without params", async () => {
		const { app } = createTestApp();

		const regRes = await supertest(app).post("/agent/register").send({ name: "agent" });

		const res = await supertest(app)
			.post("/agent/actions/noParams")
			.set("Authorization", `Bearer ${regRes.body.apiKey}`)
			.send({});

		expect(res.status).toBe(200);
		expect(res.body.result.ok).toBe(true);
	});

	it("returns 404 for unknown routes", async () => {
		const { app } = createTestApp();

		const res = await supertest(app).get("/agent/unknown");

		expect(res.status).toBe(404);
	});
});
