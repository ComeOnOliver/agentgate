import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ActionRegistry, actionToManifest, validateParams } from "../src/action.js";

describe("ActionRegistry", () => {
	it("registers and retrieves actions", () => {
		const registry = new ActionRegistry();

		registry.register("users.list", {
			description: "List users",
			handler: async () => [],
		});

		expect(registry.has("users.list")).toBe(true);
		expect(registry.get("users.list")?.name).toBe("users.list");
	});

	it("rejects invalid action names", () => {
		const registry = new ActionRegistry();

		expect(() => registry.register("", { description: "Bad", handler: async () => null })).toThrow(
			"Invalid action name",
		);

		expect(() =>
			registry.register("123invalid", { description: "Bad", handler: async () => null }),
		).toThrow("Invalid action name");

		expect(() =>
			registry.register("has spaces", { description: "Bad", handler: async () => null }),
		).toThrow("Invalid action name");
	});

	it("accepts valid dot-separated names", () => {
		const registry = new ActionRegistry();

		registry.register("simple", { description: "Simple", handler: async () => null });
		registry.register("two.parts", { description: "Two parts", handler: async () => null });
		registry.register("three.part.name", {
			description: "Three parts",
			handler: async () => null,
		});

		expect(registry.size).toBe(3);
	});

	it("lists all actions", () => {
		const registry = new ActionRegistry();

		registry.register("a", { description: "A", handler: async () => null });
		registry.register("b", { description: "B", handler: async () => null });

		const all = registry.all();
		expect(all).toHaveLength(2);
		expect(all.map((a) => a.name)).toEqual(["a", "b"]);
	});
});

describe("validateParams", () => {
	it("validates params against schema", () => {
		const action = {
			name: "test",
			definition: {
				description: "Test",
				params: z.object({ name: z.string(), age: z.number() }),
				handler: async () => null,
			},
		};

		const result = validateParams(action, { name: "Alice", age: 30 });
		expect(result).toEqual({ name: "Alice", age: 30 });
	});

	it("throws ValidationError on invalid params", () => {
		const action = {
			name: "test",
			definition: {
				description: "Test",
				params: z.object({ name: z.string() }),
				handler: async () => null,
			},
		};

		expect(() => validateParams(action, { name: 123 })).toThrow("Invalid parameters");
	});

	it("returns undefined when no params schema defined", () => {
		const action = {
			name: "test",
			definition: {
				description: "Test",
				handler: async () => null,
			},
		};

		expect(validateParams(action, undefined)).toBeUndefined();
	});
});

describe("actionToManifest", () => {
	it("converts action to manifest format", () => {
		const action = {
			name: "projects.create",
			definition: {
				description: "Create a project",
				params: z.object({ name: z.string() }),
				returns: z.object({ id: z.string(), name: z.string() }),
				scopes: ["write:projects"],
				handler: async () => null,
			},
		};

		const manifest = actionToManifest(action);

		expect(manifest.name).toBe("projects.create");
		expect(manifest.description).toBe("Create a project");
		expect(manifest.scopes).toEqual(["write:projects"]);
		expect(manifest.params).toBeDefined();
		expect(manifest.returns).toBeDefined();
	});

	it("handles actions without params/returns", () => {
		const action = {
			name: "health.check",
			definition: {
				description: "Health check",
				handler: async () => ({ ok: true }),
			},
		};

		const manifest = actionToManifest(action);

		expect(manifest.params).toBeUndefined();
		expect(manifest.returns).toBeUndefined();
		expect(manifest.scopes).toEqual([]);
	});
});
