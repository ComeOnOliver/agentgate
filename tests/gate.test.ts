import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AgentGate } from "../src/gate.js";

describe("AgentGate", () => {
	it("creates an instance with config", () => {
		const gate = new AgentGate({
			name: "test-app",
			version: "1.0.0",
			description: "Test application",
		});

		expect(gate).toBeInstanceOf(AgentGate);
	});

	it("registers actions via defineAction", () => {
		const gate = new AgentGate({ name: "test", version: "1.0.0" });

		gate.defineAction("users.list", {
			description: "List users",
			params: z.object({ limit: z.number().optional() }),
			handler: async () => [],
		});

		expect(gate.actions.has("users.list")).toBe(true);
		expect(gate.actions.size).toBe(1);
	});

	it("supports method chaining", () => {
		const gate = new AgentGate({ name: "test", version: "1.0.0" });

		const result = gate
			.defineAction("a", { description: "A", handler: async () => null })
			.defineAction("b", { description: "B", handler: async () => null });

		expect(result).toBe(gate);
		expect(gate.actions.size).toBe(2);
	});

	it("throws on duplicate action names", () => {
		const gate = new AgentGate({ name: "test", version: "1.0.0" });

		gate.defineAction("users.list", {
			description: "List users",
			handler: async () => [],
		});

		expect(() =>
			gate.defineAction("users.list", {
				description: "List users again",
				handler: async () => [],
			}),
		).toThrow('Action "users.list" is already registered');
	});

	it("registers namespace actions with prefixed names", () => {
		const gate = new AgentGate({ name: "test", version: "1.0.0" });

		gate.defineNamespace("billing", {
			description: "Billing operations",
			scopes: ["billing"],
			actions: {
				getInvoices: {
					description: "Get invoices",
					handler: async () => [],
				},
				updatePlan: {
					description: "Update plan",
					handler: async () => null,
				},
			},
		});

		expect(gate.actions.has("billing.getInvoices")).toBe(true);
		expect(gate.actions.has("billing.updatePlan")).toBe(true);
		expect(gate.actions.size).toBe(2);
	});

	it("generates manifest", () => {
		const gate = new AgentGate({
			name: "my-app",
			version: "2.0.0",
			description: "My application",
			auth: { strategy: "api-key" },
		});

		gate.defineAction("projects.list", {
			description: "List projects",
			params: z.object({ status: z.string().optional() }),
			scopes: ["read:projects"],
			handler: async () => [],
		});

		const manifest = gate.manifest();

		expect(manifest.name).toBe("my-app");
		expect(manifest.version).toBe("2.0.0");
		expect(manifest.protocol).toBe("agentgate/1.0");
		expect(manifest.auth.schemes).toContain("api-key");
		expect(manifest.auth.registration).toBe("/register");
		expect(manifest.actions).toHaveLength(1);
		expect(manifest.actions[0].name).toBe("projects.list");
	});

	it("returns express middleware function", () => {
		const gate = new AgentGate({ name: "test", version: "1.0.0" });
		const middleware = gate.express();
		expect(typeof middleware).toBe("function");
	});
});
