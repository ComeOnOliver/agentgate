import express from "express";
import { z } from "zod";
import { AgentGate } from "agentgate";

// 1. Create a gate
const gate = new AgentGate({
	name: "todo-app",
	version: "1.0.0",
	description: "A simple todo application with agent access",
	auth: { strategy: "api-key" },
	rateLimit: { window: "1m", max: 60 },
});

// 2. Define some in-memory data
interface Todo {
	id: number;
	title: string;
	completed: boolean;
}

const todos: Todo[] = [
	{ id: 1, title: "Read AgentGate docs", completed: true },
	{ id: 2, title: "Build something cool", completed: false },
];

let nextId = 3;

// 3. Define actions
gate.defineAction("todos.list", {
	description: "List all todos, optionally filtered by completion status",
	params: z.object({
		completed: z.boolean().optional(),
	}),
	returns: z.array(
		z.object({ id: z.number(), title: z.string(), completed: z.boolean() }),
	),
	scopes: ["read:todos"],
	handler: async (params) => {
		if (params.completed !== undefined) {
			return todos.filter((t) => t.completed === params.completed);
		}
		return todos;
	},
});

gate.defineAction("todos.create", {
	description: "Create a new todo item",
	params: z.object({
		title: z.string().min(1).max(200),
	}),
	returns: z.object({ id: z.number(), title: z.string(), completed: z.boolean() }),
	scopes: ["write:todos"],
	handler: async (params) => {
		const todo: Todo = { id: nextId++, title: params.title, completed: false };
		todos.push(todo);
		return todo;
	},
});

gate.defineAction("todos.toggle", {
	description: "Toggle a todo's completion status",
	params: z.object({ id: z.number() }),
	returns: z.object({ id: z.number(), title: z.string(), completed: z.boolean() }),
	scopes: ["write:todos"],
	handler: async (params) => {
		const todo = todos.find((t) => t.id === params.id);
		if (!todo) throw new Error("Todo not found");
		todo.completed = !todo.completed;
		return todo;
	},
});

// 4. Create Express app and mount the gate
const app = express();
app.use(express.json());
app.use("/agent", gate.express());

app.get("/", (_req, res) => {
	res.json({ message: "Todo app running. Agent API at /agent/manifest.json" });
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
	console.log(`Todo app listening on http://localhost:${PORT}`);
	console.log(`Agent manifest: http://localhost:${PORT}/agent/manifest.json`);
	console.log(`Register agent: POST http://localhost:${PORT}/agent/register`);
});
