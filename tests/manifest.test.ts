import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ActionRegistry } from "../src/action.js";
import { generateManifest } from "../src/manifest.js";

describe("generateManifest", () => {
	it("generates a valid manifest with actions", () => {
		const registry = new ActionRegistry();

		registry.register("projects.list", {
			description: "List all projects",
			params: z.object({ status: z.enum(["active", "archived"]).optional() }),
			returns: z.array(z.object({ id: z.string(), name: z.string() })),
			scopes: ["read:projects"],
			handler: async () => [],
		});

		registry.register("projects.create", {
			description: "Create a project",
			params: z.object({ name: z.string() }),
			scopes: ["write:projects"],
			handler: async () => null,
		});

		const manifest = generateManifest(
			{ name: "test-app", version: "1.0.0", description: "Test", auth: { strategy: "api-key" } },
			registry,
		);

		expect(manifest.name).toBe("test-app");
		expect(manifest.version).toBe("1.0.0");
		expect(manifest.protocol).toBe("agentgate/1.0");
		expect(manifest.auth.schemes).toEqual(["api-key"]);
		expect(manifest.auth.registration).toBe("/register");
		expect(manifest.actions).toHaveLength(2);
	});

	it("generates manifest without auth", () => {
		const registry = new ActionRegistry();

		const manifest = generateManifest({ name: "no-auth", version: "0.1.0" }, registry);

		expect(manifest.auth.schemes).toEqual([]);
		expect(manifest.auth.registration).toBeNull();
		expect(manifest.actions).toEqual([]);
	});

	it("generates manifest with bearer auth", () => {
		const registry = new ActionRegistry();

		const manifest = generateManifest(
			{
				name: "bearer-app",
				version: "1.0.0",
				auth: { strategy: "bearer", validate: async () => null },
			},
			registry,
		);

		expect(manifest.auth.schemes).toEqual(["bearer"]);
		expect(manifest.auth.registration).toBeNull();
	});

	it("includes JSON Schema for params and returns", () => {
		const registry = new ActionRegistry();

		registry.register("users.create", {
			description: "Create user",
			params: z.object({
				name: z.string().min(1),
				email: z.string().email(),
				age: z.number().int().positive().optional(),
			}),
			returns: z.object({
				id: z.string(),
				name: z.string(),
			}),
			handler: async () => null,
		});

		const manifest = generateManifest({ name: "test", version: "1.0.0" }, registry);

		const action = manifest.actions[0];
		expect(action.params).toBeDefined();
		expect(action.returns).toBeDefined();

		// Verify JSON Schema structure
		const params = action.params as Record<string, unknown>;
		expect(params.type).toBe("object");
		expect(params.properties).toBeDefined();
		expect(params.required).toContain("name");
		expect(params.required).toContain("email");
	});
});
