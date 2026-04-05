# AgentGate

[![npm version](https://img.shields.io/npm/v/agentgate.svg)](https://www.npmjs.com/package/agentgate)
[![CI](https://github.com/ComeOnOliver/agentgate/actions/workflows/ci.yml/badge.svg)](https://github.com/ComeOnOliver/agentgate/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)

**Let any Node.js project expose capabilities to AI agents in minutes.**

AgentGate is an Express/Hono-compatible middleware that lets you define agent-accessible actions with Zod schemas, built-in auth, rate limiting, and auto-generated capability manifests.

```bash
npm install agentgate zod
```

## Quick Start

```ts
import express from 'express'
import { z } from 'zod'
import { AgentGate } from 'agentgate'

const gate = new AgentGate({
  name: 'my-app',
  version: '1.0.0',
  description: 'My application',
  auth: { strategy: 'api-key' },
  rateLimit: { window: '1m', max: 60 },
})

gate.defineAction('todos.list', {
  description: 'List all todos',
  params: z.object({ completed: z.boolean().optional() }),
  returns: z.array(z.object({ id: z.number(), title: z.string() })),
  scopes: ['read:todos'],
  handler: async (params) => {
    return db.todos.findMany({ where: params })
  },
})

const app = express()
app.use(express.json())
app.use('/agent', gate.express())
app.listen(3000)
```

That's it. Agents can now:

1. **Discover** capabilities at `GET /agent/manifest.json`
2. **Register** at `POST /agent/register` to get an API key
3. **Invoke** actions at `POST /agent/actions/todos.list`

## How It Works

```
AI Agent (Claude, GPT, etc.)
  │
  ├── GET  /agent/manifest.json     → Discover what actions are available
  ├── POST /agent/register          → Register and get an API key
  ├── POST /agent/actions/:name     → Invoke an action
  └── GET  /agent/health            → Health check
  │
  ▼
┌─────────────────────────────┐
│     AgentGate Middleware     │
│  Auth → Rate Limit → Route  │
│  → Validate → Execute       │
└─────────────────────────────┘
  │
  ▼
Your Express / Hono App
```

## API Reference

### `new AgentGate(config)`

Create a new gate instance.

```ts
const gate = new AgentGate({
  name: 'my-app',           // Required: project name
  version: '1.0.0',         // Required: semver version
  description: 'My app',    // Optional: description
  auth: {
    strategy: 'api-key',    // 'api-key' | 'bearer' | 'none'
    validate: async (token) => { ... }, // Required for 'bearer'
  },
  rateLimit: {
    window: '1m',           // Time window: '30s', '1m', '1h'
    max: 60,                // Max requests per window per agent
  },
})
```

### `gate.defineAction(name, definition)`

Register a named action. Returns `this` for chaining.

```ts
gate.defineAction('projects.create', {
  description: 'Create a new project',        // Required
  params: z.object({ name: z.string() }),      // Optional: Zod schema
  returns: z.object({ id: z.string() }),       // Optional: Zod schema
  scopes: ['write:projects'],                  // Optional: required scopes
  handler: async (params, ctx) => {            // Required: handler function
    return await db.projects.create({
      ...params,
      ownerId: ctx.agent.id,
    })
  },
})
```

### `gate.defineNamespace(name, definition)`

Group related actions under a namespace prefix.

```ts
gate.defineNamespace('billing', {
  description: 'Billing operations',
  scopes: ['billing'],
  actions: {
    getInvoices: {
      description: 'Get all invoices',
      handler: async (_params, ctx) => { ... },
    },
    updatePlan: {
      description: 'Update subscription plan',
      params: z.object({ plan: z.enum(['free', 'pro', 'enterprise']) }),
      handler: async (params, ctx) => { ... },
    },
  },
})
// Registers: billing.getInvoices, billing.updatePlan
```

### `gate.express()`

Returns an Express middleware function. Mount it on your app:

```ts
app.use('/agent', gate.express())
```

### `gate.manifest()`

Returns the manifest object (useful for testing or custom endpoints):

```ts
const manifest = gate.manifest()
// { name, version, protocol, auth, actions: [...] }
```

### Handler Context

Every action handler receives `(params, ctx)`:

```ts
interface AgentContext {
  agent: {
    id: string                      // Agent's unique ID
    name: string                    // Agent's registered name
    scopes: string[]                // Agent's granted scopes
    metadata: Record<string, unknown>
  }
  requestId: string                 // Unique request ID
  timestamp: Date                   // Request timestamp
}
```

## Authentication

### API Key (default)

Agents register via `POST /agent/register` and receive a key prefixed with `ag_`.

```bash
# Register
curl -X POST http://localhost:3000/agent/register \
  -H "Content-Type: application/json" \
  -d '{"name": "my-agent", "scopes": ["read:todos"]}'

# Response: { "agentId": "...", "apiKey": "ag_...", "scopes": ["read:todos"] }

# Use the key
curl -X POST http://localhost:3000/agent/actions/todos.list \
  -H "Authorization: Bearer ag_..." \
  -H "Content-Type: application/json" \
  -d '{"params": {}}'
```

### Bearer Token

Bring your own validation (JWT, OAuth2, etc.):

```ts
const gate = new AgentGate({
  name: 'my-app',
  version: '1.0.0',
  auth: {
    strategy: 'bearer',
    validate: async (token) => {
      const payload = await verifyJWT(token)
      return {
        id: payload.sub,
        name: payload.name,
        scopes: payload.scopes,
        metadata: {},
      }
    },
  },
})
```

### No Auth

For development or internal services:

```ts
const gate = new AgentGate({
  name: 'my-app',
  version: '1.0.0',
  // No auth config = no auth required
})
```

## Rate Limiting

Built-in sliding window rate limiter (in-memory):

```ts
const gate = new AgentGate({
  name: 'my-app',
  version: '1.0.0',
  rateLimit: {
    window: '1m',  // '30s', '1m', '5m', '1h'
    max: 60,       // requests per window per agent
  },
})
```

When exceeded, returns `429` with a `Retry-After` header.

## Error Handling

AgentGate returns structured JSON errors:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid parameters",
    "details": { ... }
  }
}
```

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid request params |
| 401 | `AUTH_ERROR` | Missing or invalid credentials |
| 403 | `FORBIDDEN` | Insufficient scopes |
| 404 | `NOT_FOUND` | Action or route not found |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

You can import and use error classes directly:

```ts
import { ValidationError, AuthError, NotFoundError } from 'agentgate'
```

## Manifest Format

The auto-generated manifest at `/agent/manifest.json`:

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "description": "My application",
  "protocol": "agentgate/1.0",
  "auth": {
    "schemes": ["api-key"],
    "registration": "/register"
  },
  "actions": [
    {
      "name": "todos.list",
      "description": "List all todos",
      "params": {
        "type": "object",
        "properties": {
          "completed": { "type": "boolean" }
        }
      },
      "returns": {
        "type": "array",
        "items": { "type": "object", "properties": { ... } }
      },
      "scopes": ["read:todos"]
    }
  ]
}
```

Params and returns use standard JSON Schema (auto-converted from your Zod schemas).

## MCP Compatibility

AgentGate's manifest format is designed as a superset of [MCP](https://modelcontextprotocol.io/)'s tool definition format. The JSON Schema output for params/returns is compatible with MCP tool schemas, making it straightforward for MCP-aware agents to consume AgentGate endpoints.

Full MCP transport compatibility (SSE, stdio) is planned for v0.2.0.

## Examples

See the [`examples/`](./examples) directory:

- **[express-basic](./examples/express-basic)** — Minimal todo app with API key auth

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](./LICENSE)
