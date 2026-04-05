# AgentGate

[![npm version](https://img.shields.io/npm/v/agentgate.svg)](https://www.npmjs.com/package/agentgate)
[![GitHub stars](https://img.shields.io/github/stars/ComeOnOliver/agentgate.svg)](https://github.com/ComeOnOliver/agentgate/stargazers)
[![CI](https://github.com/ComeOnOliver/agentgate/actions/workflows/ci.yml/badge.svg)](https://github.com/ComeOnOliver/agentgate/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)

**Turn any web app into an agent-accessible API in minutes.**

AgentGate lets AI agents (Claude, GPT, custom) discover, authenticate, and interact with your application through a standardized protocol. It works two ways: as an **npm middleware** you wire up manually, or as an **AI plugin** that analyzes your project and generates the entire agent API layer automatically.

---

## How It Works

### v2: Plugin — Let an AI Generate Your Agent API

The AgentGate plugin runs as a Claude Code / OpenClaw command. An AI agent analyzes your project's source code — framework, auth system, routes, data models — and generates a complete `agent-api/` directory with authentication, rate limiting, scoped access, and a manifest. No boilerplate.

```
Your Web App                     AI Agent (Claude Code / OpenClaw)
     │                                     │
     └── package.json, routes,             │
         auth, schema, services ──────────►│
                                           │ Analyze → Design → Generate
                                           │
                                    ┌──────┘
                                    ▼
                              agent-api/
                              ├── index.ts
                              ├── manifest.ts
                              ├── actions/
                              ├── auth/
                              ├── middleware/
                              ├── types.ts
                              ├── SKILL.md
                              └── tests/
```

The generated code:
- **Reuses your existing logic** — calls your services, doesn't rewrite them
- **Bridges your auth system** — Next-Auth, Better Auth, Passport, JWT, Clerk, Supabase
- **Is non-destructive** — everything goes in `agent-api/`, nothing existing is modified
- **Matches your code style** — same formatting, imports, patterns

### v1: npm Library — Wire It Up Yourself

Install `agentgate` as middleware and define actions manually with Zod schemas. Full control, minimal magic. See [npm Library (v1)](#npm-library-v1) below.

---

## Quick Start

### Claude Code (Plugin)

```bash
# Install the plugin from marketplace
/plugin marketplace add agentgate

# Generate an agent API for your project
/agentgate ./my-nextjs-app
```

The agent will:
1. Analyze your project (framework, auth, routes, models)
2. Design actions grouped by domain with scoped access
3. Generate `agent-api/` with full implementation
4. Write tests and a SKILL.md
5. Print integration instructions

### OpenClaw (Skill)

```bash
# Install the AgentGate skill
@agentgate build ./my-express-app
```

### Manual (Read the Harness)

If you're not using Claude Code or OpenClaw, read [`agentgate-plugin/HARNESS.md`](./agentgate-plugin/HARNESS.md) — it's the complete methodology an AI (or a human) follows to generate the agent API. You can follow it step by step.

---

## What Gets Generated

```
my-app/
├── agent-api/
│   ├── index.ts              # Main router — mount at /agent/*
│   ├── manifest.ts           # Auto-generated manifest.json
│   ├── actions/
│   │   ├── index.ts          # Re-exports all action modules
│   │   ├── projects.ts       # projects.list, projects.create, ...
│   │   ├── users.ts          # users.get, users.update, ...
│   │   └── billing.ts        # billing.getInvoices, billing.updatePlan, ...
│   ├── auth/
│   │   ├── agent-keys.ts     # API key generate / validate / revoke
│   │   └── user-bridge.ts    # Bridge to your existing auth system
│   ├── middleware/
│   │   ├── authenticate.ts   # Extract + validate agent API key
│   │   ├── rate-limit.ts     # Sliding window rate limiter
│   │   └── error-handler.ts  # Standardized JSON error responses
│   ├── types.ts              # TypeScript types
│   ├── utils.ts              # Shared utilities
│   ├── SKILL.md              # AI-readable documentation of all actions
│   └── tests/
│       ├── TEST.md           # Test plan
│       ├── auth.test.ts      # Auth + scope tests
│       └── actions.test.ts   # Action handler tests
└── (existing project files — unchanged)
```

Once generated, agents can:

1. **Discover** capabilities at `GET /agent/manifest.json`
2. **Register** at `POST /agent/register` (requires user session)
3. **Invoke** actions at `POST /agent/actions/<name>`
4. **Manage** keys at `GET /agent/agents` and `DELETE /agent/agents/:id`

---

## Example: ClawStarter

[ClawStarter](https://github.com/ComeOnOliver/clawstarter) — a crowdfunding platform — was AgentGated in a single run. The plugin analyzed 11 API routes across projects, users, and billing, and generated **22 agent actions** with full auth bridging, scoped access, and tests.

```
clawstarter/agent-api/
├── actions/
│   ├── projects.ts    # 8 actions: list, get, create, update, delete, fund, ...
│   ├── users.ts       # 6 actions: get, update, listProjects, ...
│   └── billing.ts     # 8 actions: getInvoices, updatePlan, ...
├── auth/
│   ├── agent-keys.ts  # ag_ prefixed keys, HMAC-SHA256 hashed
│   └── user-bridge.ts # Bridges to ClawStarter's Next-Auth setup
└── SKILL.md           # Full reference for any AI agent to consume
```

---

## npm Library (v1)

For manual setup without the plugin, install `agentgate` as middleware:

```bash
npm install agentgate zod
```

### Basic Usage

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

### Agent Flow

```
AI Agent (Claude, GPT, etc.)
  │
  ├── GET  /agent/manifest.json     → Discover available actions
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

### API Reference

#### `new AgentGate(config)`

```ts
const gate = new AgentGate({
  name: 'my-app',           // Required: project name
  version: '1.0.0',         // Required: semver version
  description: 'My app',    // Optional: description
  auth: {
    strategy: 'api-key',    // 'api-key' | 'bearer' | 'none'
    validate: async (token) => { ... }, // Required for 'bearer'
    userResolver: async (req) => { ... }, // Optional: link agents to users
    canRegisterAgent: async (user) => boolean, // Optional: restrict registration
    maxScopes: async (user) => string[], // Optional: limit scopes per user
  },
  rateLimit: {
    window: '1m',           // Time window: '30s', '1m', '1h'
    max: 60,                // Max requests per window per agent
  },
})
```

#### `gate.defineAction(name, definition)`

```ts
gate.defineAction('projects.create', {
  description: 'Create a new project',
  params: z.object({ name: z.string() }),
  returns: z.object({ id: z.string() }),
  scopes: ['write:projects'],
  handler: async (params, ctx) => {
    return await db.projects.create({
      ...params,
      ownerId: ctx.agent.id,
    })
  },
})
```

#### `gate.defineNamespace(name, definition)`

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
```

#### User-Linked Access Control

Connect agents to your existing auth system — like GitHub Personal Access Tokens:

```ts
const gate = new AgentGate({
  name: 'my-saas',
  version: '1.0.0',
  auth: {
    strategy: 'api-key',
    userResolver: async (req) => {
      const session = await getServerSession(req)
      if (!session?.user) return null
      return { id: session.user.id, email: session.user.email }
    },
    maxScopes: async (user) => {
      if (user.roles?.includes('admin')) return ['*']
      return ['read:projects', 'read:users']
    },
  },
})
```

### Handler Context

```ts
interface AgentContext {
  agent: {
    id: string
    name: string
    scopes: string[]
    metadata: Record<string, unknown>
  }
  user?: { id: string }
  requestId: string
  timestamp: Date
}
```

### Authentication Strategies

| Strategy | Description |
|----------|-------------|
| `api-key` | Agents register via `/agent/register`, receive `ag_` prefixed keys |
| `bearer` | Bring your own validation (JWT, OAuth2, etc.) |
| `none` | No auth — for development or internal services |

### Error Responses

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

### Manifest Format

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "protocol": "agentgate/1.0",
  "auth": { "schemes": ["api-key"], "registration": "/register" },
  "actions": [
    {
      "name": "todos.list",
      "description": "List all todos",
      "params": { "type": "object", "properties": { ... } },
      "scopes": ["read:todos"]
    }
  ]
}
```

### MCP Compatibility

AgentGate's manifest format is a superset of [MCP](https://modelcontextprotocol.io/)'s tool definition format. JSON Schema output for params/returns is compatible with MCP tool schemas.

---

## Examples

- **[express-basic](./examples/express-basic)** — Minimal todo app with API key auth

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](./LICENSE)
