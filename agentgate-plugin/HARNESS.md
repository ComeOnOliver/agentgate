# AgentGate Harness: Web App → Agent API

## Purpose

This harness provides a standard operating procedure (SOP) for coding agents to transform any Node.js web application into an agent-accessible API. The goal: let AI agents operate your web app through a standardized, secure API — without the developer writing boilerplate.

## Key Principles

1. **Analyze, don't assume.** Read the actual source code. Don't guess framework/auth/ORM.
2. **Reuse existing logic.** Call the project's existing services/controllers. Never rewrite business logic.
3. **Secure by default.** Agent registration requires authenticated user session. API keys are scoped.
4. **Generate native code.** Output code that looks like the developer wrote it — match the project's style, imports, patterns.
5. **Non-destructive.** Never modify existing files. Generate new files in `agent-api/` directory. Integration is a single import.

## General SOP: Turning Any Web App into an Agent API

### Phase 1: Project Analysis

1. **Read `package.json`** — Identify:
   - Framework: Next.js / Express / Hono / Fastify / Koa / NestJS
   - Auth library: next-auth / better-auth / passport / jsonwebtoken / custom
   - ORM/DB: Prisma / Drizzle / Mongoose / Sequelize / Knex / raw SQL
   - Language: TypeScript or JavaScript
   - Package manager: npm / pnpm / yarn / bun

2. **Detect the auth system** — Find the auth configuration file:
   - Next-Auth/Auth.js: look for `NextAuth()`, `getServerSession`, `auth()` exports
   - Better Auth: look for `betterAuth()` config
   - Passport: look for `passport.use()`, strategy configurations
   - Custom JWT: look for `jsonwebtoken`, `jose`, manual token verification
   - **Document:** How to get the current user from a request. This is critical.

3. **Map all API routes** — Scan for route handlers:
   - Next.js App Router: `src/app/api/**/route.ts` (GET, POST, PUT, DELETE exports)
   - Next.js Pages Router: `pages/api/**/*.ts`
   - Express: `app.get()`, `app.post()`, `router.get()`, etc.
   - Hono: `app.get()`, `app.post()`, etc.
   - For each route, document: HTTP method, path, auth requirement, request params, response shape

4. **Identify data models** — Read the schema:
   - Prisma: `prisma/schema.prisma`
   - Drizzle: `**/schema.ts` with `pgTable()` / `mysqlTable()`
   - Mongoose: `mongoose.model()` / `mongoose.Schema()`
   - Document: table names, fields, types, relations

5. **Identify existing service layer** — Find where business logic lives:
   - `services/`, `lib/`, `utils/`, or inline in route handlers
   - These are what agent actions will call — never rewrite them

6. **Check for existing agent support** — The project may already have:
   - Agent auth (API key system)
   - Agent-specific routes
   - If so, build on top of them, don't duplicate

### Phase 2: Action Design

1. **Group routes by domain** — e.g., `projects`, `users`, `billing`, `comments`

2. **For each route, design an agent action:**
   ```
   Name:        <domain>.<operation>  (e.g., projects.list, projects.create)
   Description: What this action does (1 sentence)
   Params:      Input schema (from route params, query, body)
   Returns:     Output schema (from response type)
   Auth:        Required scope (e.g., read:projects, write:projects)
   ```

3. **Design scope hierarchy:**
   ```
   read:projects   — list, get project details
   write:projects  — create, update, delete projects
   read:users      — view user profiles
   write:users     — update profiles
   admin           — dangerous operations
   ```

4. **Decide which actions need user context:**
   - Actions that filter by "my" data → need user context from API key owner
   - Public actions (list all projects) → may not need auth at all

5. **Handle existing agent auth:**
   - If the project already has agent API keys (like `sk_agent_xxx`), integrate with it
   - Don't create a second auth system — extend the existing one

### Phase 3: Implementation

Generate all files into `<project>/agent-api/` directory.

#### 3.1 Directory Structure

```
agent-api/
├── index.ts              # Main router — mount on /agent/*
├── manifest.ts           # Generates manifest.json
├── actions/
│   ├── index.ts          # Re-exports all action modules
│   ├── projects.ts       # projects.* actions
│   ├── users.ts          # users.* actions
│   ├── comments.ts       # comments.* actions
│   └── ...               # one file per domain
├── auth/
│   ├── agent-keys.ts     # API key management (generate, validate, revoke)
│   └── user-bridge.ts    # Connects to project's existing auth system
├── middleware/
│   ├── authenticate.ts   # Extract + validate agent API key
│   ├── rate-limit.ts     # In-memory sliding window rate limiter
│   └── error-handler.ts  # Standardized error responses
├── types.ts              # All TypeScript types
├── utils.ts              # Shared utilities
└── tests/
    ├── TEST.md           # Test plan
    ├── auth.test.ts      # Auth tests
    └── actions.test.ts   # Action tests
```

#### 3.2 Implementation Rules

**Auth Bridge (`auth/user-bridge.ts`):**
- Must connect to the project's EXISTING auth system
- For Next-Auth: use `auth()` or `getServerSession()`
- For Better Auth: use `auth.api.getSession()`
- For custom JWT: decode from Authorization header using project's secret
- Returns: `{ id: string, email?: string, name?: string }` or null

**Agent Key Management (`auth/agent-keys.ts`):**
- If project already has an agent key system → use it, don't create a new one
- If not → create one:
  - Keys prefixed: `ag_` + random hex
  - Store hash in DB (HMAC-SHA256), never store plaintext
  - Keys have: ownerUserId, scopes, createdAt, lastUsedAt
  - Need DB migration if persistent storage required

**Action Handlers (`actions/*.ts`):**
- Each action calls existing project services/functions
- Never rewrite business logic — import and call what exists
- Validate params with Zod schemas
- Return consistent JSON: `{ result: ... }` or `{ error: { code, message } }`

**Manifest (`manifest.ts`):**
- Auto-generates from registered actions
- Includes: action names, descriptions, param schemas (as JSON Schema), required scopes
- Served at GET `/agent/manifest.json`

**Rate Limiting (`middleware/rate-limit.ts`):**
- In-memory sliding window (good enough for v1)
- Default: 60 req/min per API key
- Return `429 Too Many Requests` with `Retry-After` header

#### 3.3 Framework-Specific Integration

**Next.js App Router:**
```typescript
// src/app/api/agent/[...path]/route.ts
import { agentRouter } from '@/agent-api';
export const GET = agentRouter;
export const POST = agentRouter;
export const DELETE = agentRouter;
```

**Express:**
```typescript
import { agentRouter } from './agent-api';
app.use('/agent', agentRouter);
```

**Hono:**
```typescript
import { agentRouter } from './agent-api';
app.route('/agent', agentRouter);
```

### Phase 4: Test Planning

Create `agent-api/tests/TEST.md` with:

1. **Auth tests:**
   - Agent registration requires user session → 401 without
   - API key validation works
   - Scope enforcement (wrong scope → 403)
   - Key revocation works

2. **Action tests (per action):**
   - Happy path with valid params
   - Validation errors (missing required params)
   - Auth errors (no key, wrong scope)
   - Edge cases

3. **Rate limiting tests:**
   - Under limit → 200
   - Over limit → 429 with Retry-After

### Phase 5: Test Implementation

- Use the project's existing test framework (vitest / jest / node:test)
- Use supertest or fetch for HTTP tests
- Mock the auth layer for unit tests
- Test against real DB for integration tests (if test DB available)

### Phase 6: SKILL.md Generation

Generate `agent-api/SKILL.md` with:

```yaml
---
name: "<project-name>-agent-api"
description: "Agent API for <project-name>. <summary of capabilities>"
---
```

Body includes:
- Authentication flow (how to register + get API key)
- Available actions with params/returns
- Example curl commands for each action
- Error codes reference

### Phase 7: Integration

1. Create the catch-all route file that mounts the agent API
2. Print clear instructions for the developer:
   ```
   ✅ Agent API generated in agent-api/
   
   To activate, add this route:
   <framework-specific instruction>
   
   Then test:
   curl http://localhost:3000/agent/manifest.json
   ```
3. Do NOT auto-modify existing project files — let the developer do it

## Architecture Patterns & Pitfalls

### Pattern: Consistent Error Responses
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Missing required field: name"
  }
}
```

Error codes: `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL_ERROR`

### Pattern: Action Response Envelope
```json
{
  "result": { ... },
  "meta": {
    "requestId": "uuid",
    "timestamp": "ISO-8601"
  }
}
```

### Pitfall: Don't Duplicate Auth
If the project already has agent authentication (API keys, tokens), USE IT. Don't create a parallel system. Extend the existing one with scopes if needed.

### Pitfall: Don't Rewrite Business Logic
Agent actions should be thin wrappers around existing service functions. If `projectService.create()` exists, call it. Don't reimplement project creation.

### Pitfall: Don't Modify Existing Files
All generated code goes in `agent-api/`. The only "modification" is a single new route file that imports the agent router. Even that should be a new file, not an edit to an existing one.

### Pitfall: Match the Project's Code Style
If the project uses:
- `camelCase` responses → use camelCase
- `snake_case` responses → use snake_case
- Tabs vs spaces → match it
- Semicolons vs no semicolons → match it

The generated code should look like the developer wrote it.
