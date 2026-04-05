# AgentGate — Design Document

> Let any Node.js project expose capabilities to AI agents in minutes.

## Problem

Every project that wants AI agents to interact with it has to:
1. Write a custom MCP server from scratch
2. Handle agent authentication separately
3. Define capability schemas in ad-hoc formats
4. Build discovery endpoints manually

This is the same boilerplate every time. There's no standard way for a **project** to say "here's what agents can do with me."

## Solution

AgentGate is an Express/Hono-compatible middleware that lets any Node.js project define agent-accessible interfaces with a simple declarative API. Agents discover capabilities via a standard manifest, authenticate via built-in mechanisms, and invoke actions through a unified protocol.

```ts
import { AgentGate } from 'agentgate'

const gate = new AgentGate({
  name: 'my-saas-app',
  version: '1.0.0',
  description: 'Project management SaaS',
})

gate.defineAction('projects.list', {
  description: 'List all projects for the authenticated user',
  params: z.object({ status: z.enum(['active', 'archived']).optional() }),
  returns: z.array(ProjectSchema),
  scopes: ['read:projects'],
  handler: async (params, ctx) => {
    return await db.projects.findMany({ where: { userId: ctx.agent.userId, ...params } })
  },
})

// Mount on any framework
app.use('/agent', gate.middleware())
```

## Core Concepts

### 1. Gate (the main instance)
- Holds project metadata + all registered actions
- Generates the agent manifest (JSON) at `GET /agent/manifest.json`
- Handles routing, auth, and middleware chain

### 2. Actions
- Named capabilities the project exposes (e.g., `projects.list`, `auth.login`)
- Defined with Zod schemas for params/returns (type-safe + auto-documented)
- Scoped permissions (agents can only call what they're authorized for)
- Each action has a handler function

### 3. Manifest
- Auto-generated JSON describing all available actions
- Compatible with MCP tool discovery format
- Agents fetch this to know what they can do

```json
{
  "name": "my-saas-app",
  "version": "1.0.0",
  "description": "Project management SaaS",
  "protocol": "agentgate/1.0",
  "auth": {
    "schemes": ["bearer", "api-key"],
    "registration": "/agent/register"
  },
  "actions": [
    {
      "name": "projects.list",
      "description": "List all projects for the authenticated user",
      "params": { "type": "object", "properties": { "status": { "type": "string", "enum": ["active", "archived"] } } },
      "returns": { "type": "array", "items": { "$ref": "#/schemas/Project" } },
      "scopes": ["read:projects"]
    }
  ],
  "schemas": {
    "Project": { "type": "object", "properties": { "id": { "type": "string" }, "name": { "type": "string" } } }
  }
}
```

### 4. Agent Auth
Built-in auth strategies (pick one or combine):
- **API Key** — agent registers, gets a key, sends in header
- **Bearer Token** — OAuth2/JWT compatible
- **MCP Token** — compatible with MCP auth flow
- **Custom** — bring your own auth middleware

### 5. Agent Context
Every handler receives `ctx` with:
```ts
interface AgentContext {
  agent: {
    id: string
    name: string
    scopes: string[]
    metadata: Record<string, unknown>
  }
  request: Request
  // Project can inject custom context
  [key: string]: unknown
}
```

## Architecture

```
Agent (Claude/Codex/GPT/etc.)
  │
  ├── GET  /agent/manifest.json     ← discover capabilities
  ├── POST /agent/register          ← register + get API key
  ├── POST /agent/actions/:name     ← invoke an action
  └── GET  /agent/health            ← health check
  │
  ▼
┌─────────────────────────────────────┐
│           AgentGate Middleware       │
│                                     │
│  ┌──────────┐  ┌──────────────────┐ │
│  │   Auth   │→ │  Rate Limiter    │ │
│  └──────────┘  └──────────────────┘ │
│        │                            │
│  ┌──────────┐  ┌──────────────────┐ │
│  │  Router  │→ │  Action Handler  │ │
│  └──────────┘  └──────────────────┘ │
│        │                            │
│  ┌──────────┐  ┌──────────────────┐ │
│  │  Logger  │→ │  Error Handler   │ │
│  └──────────┘  └──────────────────┘ │
└─────────────────────────────────────┘
  │
  ▼
Your Express/Hono/Fastify App
```

## Package Structure

```
agentgate/
├── src/
│   ├── index.ts              # Main exports
│   ├── gate.ts               # AgentGate class
│   ├── action.ts             # Action definition + registry
│   ├── manifest.ts           # Manifest generation
│   ├── middleware/
│   │   ├── express.ts        # Express adapter
│   │   ├── hono.ts           # Hono adapter
│   │   └── common.ts         # Framework-agnostic core
│   ├── auth/
│   │   ├── api-key.ts        # API key strategy
│   │   ├── bearer.ts         # Bearer/JWT strategy
│   │   ├── mcp.ts            # MCP-compatible auth
│   │   └── types.ts          # Auth interfaces
│   ├── ratelimit/
│   │   ├── memory.ts         # In-memory (dev)
│   │   └── types.ts          # Rate limit interfaces
│   ├── logger.ts             # Structured logging
│   ├── errors.ts             # Error types
│   └── types.ts              # Core type definitions
├── tests/
│   ├── gate.test.ts
│   ├── action.test.ts
│   ├── manifest.test.ts
│   ├── auth.test.ts
│   └── integration.test.ts
├── examples/
│   ├── express-basic/         # Minimal Express example
│   ├── hono-auth/             # Hono + auth example
│   └── full-saas/             # Full SaaS example
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── tsup.config.ts             # Build config (ESM + CJS)
├── README.md
├── LICENSE                    # MIT
├── CONTRIBUTING.md
└── .github/
    └── workflows/
        └── ci.yml             # Lint + test + build
```

## API Design

### Creating a Gate

```ts
import { AgentGate } from 'agentgate'
import { z } from 'zod'

const gate = new AgentGate({
  name: 'my-app',
  version: '1.0.0',
  description: 'My awesome app',
  auth: {
    strategy: 'api-key',       // or 'bearer', 'mcp', 'custom'
    // API key: auto-generates keys for agents that register
  },
  rateLimit: {
    window: '1m',
    max: 60,
  },
})
```

### Defining Actions

```ts
// Simple action
gate.defineAction('users.me', {
  description: 'Get the current user profile',
  scopes: ['read:user'],
  returns: UserSchema,
  handler: async (_params, ctx) => {
    return await db.users.findById(ctx.agent.userId)
  },
})

// Action with params
gate.defineAction('projects.create', {
  description: 'Create a new project',
  params: z.object({
    name: z.string().min(1).max(100),
    description: z.string().optional(),
  }),
  returns: ProjectSchema,
  scopes: ['write:projects'],
  handler: async (params, ctx) => {
    return await db.projects.create({ ...params, ownerId: ctx.agent.userId })
  },
})

// Grouped actions
gate.defineNamespace('billing', {
  description: 'Billing and subscription management',
  scopes: ['billing'],
  actions: {
    'getSubscription': { ... },
    'updatePlan': { ... },
    'getInvoices': { ... },
  },
})
```

### Mounting Middleware

```ts
// Express
import express from 'express'
const app = express()
app.use('/agent', gate.express())

// Hono
import { Hono } from 'hono'
const app = new Hono()
app.route('/agent', gate.hono())

// Generic (returns standard Request → Response handler)
const handler = gate.handler()
```

### Agent Registration Flow

```
Agent                          Your App (with AgentGate)
  │                                   │
  ├──GET /agent/manifest.json────────►│  "What can I do here?"
  │◄─────────── JSON manifest ────────┤  
  │                                   │
  ├──POST /agent/register ───────────►│  { name: "my-agent", scopes: ["read:projects"] }
  │◄─────────── { apiKey: "ag_..." }──┤  
  │                                   │
  ├──POST /agent/actions/projects.list►│  Authorization: Bearer ag_...
  │◄─────────── [{ id: 1, ... }] ─────┤  
```

## MCP Compatibility

AgentGate's manifest format is a superset of MCP's tool definition. The middleware can optionally expose:

```
GET /agent/mcp/tools        ← MCP-compatible tool list
POST /agent/mcp/call        ← MCP-compatible tool invocation
```

This means agents that speak MCP can use AgentGate projects out of the box.

## Design Principles

1. **Zero config to start, full control when needed.** `gate.defineAction()` + `app.use()` and you're done.
2. **Type-safe end-to-end.** Zod schemas validate input/output AND generate the manifest.
3. **Framework agnostic.** Core logic is pure functions. Express/Hono/Fastify are thin adapters.
4. **Secure by default.** Auth required. Rate limiting on. Scopes enforced.
5. **MCP compatible.** Works with existing agent ecosystems, not against them.
6. **Observable.** Structured logging for every action invocation.

## Tech Stack

- **TypeScript** — strict mode
- **Zod** — schema validation + JSON Schema generation
- **tsup** — build (ESM + CJS dual output)
- **Vitest** — testing
- **Biome** — lint + format
- **Changesets** — version management

## MVP Scope (v0.1.0)

- [ ] Core: AgentGate class, action definition, manifest generation
- [ ] Auth: API key strategy
- [ ] Middleware: Express adapter
- [ ] Validation: Zod params/returns with JSON Schema in manifest
- [ ] Rate limiting: in-memory
- [ ] Errors: structured error responses
- [ ] Tests: unit + integration
- [ ] Example: express-basic
- [ ] README with full docs
- [ ] CI: GitHub Actions (lint + test + build)
- [ ] Published to npm as `agentgate`

## Future (v0.2.0+)

- Hono adapter
- Bearer/JWT auth strategy
- MCP compatibility layer
- Agent registration with scoped permissions
- Webhook notifications (agent did X)
- OpenTelemetry integration
- CLI: `npx agentgate init` scaffolding
- Dashboard UI for monitoring agent activity
