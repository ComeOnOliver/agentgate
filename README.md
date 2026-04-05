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
  user?: {                          // Present when userResolver is configured
    id: string                      // User ID from your auth system
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

## Connecting to Your Auth System

By default, anyone can call `POST /register` and get an API key. For production use, you should connect AgentGate to your project's existing auth system using `userResolver`. This makes agents **user-linked** — like GitHub Personal Access Tokens.

### How It Works

1. User authenticates via your app's auth (Auth.js, session, JWT, etc.)
2. Authenticated user creates agents with limited scopes
3. Agent API key inherits max permissions from the user

### Auth.js / NextAuth Example

```ts
import { getServerSession } from 'next-auth'
import { AgentGate } from 'agentgate'

const gate = new AgentGate({
  name: 'my-saas',
  version: '1.0.0',
  auth: {
    strategy: 'api-key',
    userResolver: async (req) => {
      const session = await getServerSession(req)
      if (!session?.user) return null
      return {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      }
    },
    // Optional: only verified emails can create agents
    canRegisterAgent: async (user) => !!user.email,
    // Optional: limit scopes based on user role
    maxScopes: async (user) => {
      if (user.roles?.includes('admin')) return ['*']
      return ['read:projects', 'read:users']
    },
  },
})
```

### Custom JWT Example

```ts
const gate = new AgentGate({
  name: 'my-app',
  version: '1.0.0',
  auth: {
    strategy: 'api-key',
    userResolver: async (req) => {
      const token = req.headers['authorization']?.split(' ')[1]
      if (!token) return null
      const user = await verifyJWT(token)
      return user ? { id: user.sub, email: user.email } : null
    },
  },
})
```

### Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `userResolver` | `(req) => Promise<UserIdentity \| null>` | Resolve the current user from your auth system. When configured, registration requires an authenticated user. |
| `canRegisterAgent` | `(user) => Promise<boolean>` | Optional. Restrict which users can create agents. |
| `maxScopes` | `(user) => Promise<string[]>` | Optional. Limit scopes per user. Return `['*']` for full access. |

### Management Endpoints

When `userResolver` is configured, two additional endpoints become available:

```bash
# List my agents
curl http://localhost:3000/agent/agents \
  -H "Cookie: session=..." # or whatever your auth uses

# Revoke one of my agents
curl -X DELETE http://localhost:3000/agent/agents/<agentId> \
  -H "Cookie: session=..."
```

Users can only list and revoke their own agents.

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
