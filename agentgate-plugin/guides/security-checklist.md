# Security Checklist for Generated Agent APIs

Every generated `agent-api/` must satisfy these requirements before delivery.

## Authentication

- [ ] **All write endpoints require authentication.** No unauthenticated writes — ever.
- [ ] **Read endpoints are auth-gated by default.** Only explicitly public data (e.g., public project listings) can skip auth.
- [ ] **Agent registration requires a user session.** Anonymous agent creation is disabled in production.
- [ ] **API keys are hashed before storage.** Use HMAC-SHA256 with a server secret. Never store plaintext.
- [ ] **Key validation uses timing-safe comparison.** Prevent timing attacks with `crypto.timingSafeEqual`.
- [ ] **Revoked/expired keys are rejected.** Check `revokedAt` and `expiresAt` on every request.

## Scope Enforcement

- [ ] **Every action declares required scopes.** No action should be scope-free unless intentionally public.
- [ ] **Scope check happens before handler execution.** Reject early, not after business logic runs.
- [ ] **Wildcard scopes expand correctly.** `read:*` grants all `read:X` scopes; `admin` grants everything.
- [ ] **Write scopes imply read.** `write:projects` implies `read:projects`.
- [ ] **Users cannot grant scopes beyond their own access.** Enforced via `maxScopes` callback.

## Rate Limiting

- [ ] **Rate limiting is enabled on all agent endpoints.** Default: 60 requests/minute per API key.
- [ ] **429 responses include `Retry-After` header.** Agents need to know when to retry.
- [ ] **Rate limits are per-key, not global.** One agent hitting limits shouldn't block others.
- [ ] **Registration endpoint has stricter limits.** Prevent mass key generation (e.g., 5/hour per user).

## Input Validation

- [ ] **All action params validated with Zod schemas.** No raw `req.body` access in handlers.
- [ ] **Validation errors return structured responses.** Include field names and constraint violations.
- [ ] **String inputs have max length constraints.** Prevent memory exhaustion from giant payloads.
- [ ] **Array inputs have max item constraints.** `z.array().max(100)` or similar.
- [ ] **No `z.any()` or `z.unknown()` in params.** Every field must be explicitly typed.

```typescript
// ✅ Good
const params = z.object({
  name: z.string().min(1).max(255),
  tags: z.array(z.string().max(50)).max(20).optional(),
  limit: z.number().int().min(1).max(100).default(20),
})

// ❌ Bad
const params = z.object({
  name: z.string(),           // No length limit
  data: z.any(),              // Untyped
  items: z.array(z.unknown()) // No constraints
})
```

## Manifest Security

- [ ] **No secrets in manifest.json.** No API keys, DB URLs, internal IPs, or tokens.
- [ ] **No internal implementation details.** Don't expose table names, ORM details, or file paths.
- [ ] **Action descriptions don't leak sensitive info.** "List users" is fine; "Query users table via Prisma" is not.
- [ ] **Manifest is read-only.** Served via GET only — no mutation endpoint.

```typescript
// ✅ Good manifest action
{
  name: "projects.list",
  description: "List projects the agent has access to",
  params: { ... },
  scopes: ["read:projects"]
}

// ❌ Bad manifest action — leaks internals
{
  name: "projects.list",
  description: "SELECT * FROM projects WHERE owner_id = ? using Prisma",
  params: { ... },
  _internal: { table: "projects", dbUrl: "postgres://..." }
}
```

## Data Access

- [ ] **Agent can only access data scoped to its owner.** Agent created by User A cannot see User B's data.
- [ ] **List endpoints filter by owner.** `projects.list` returns only the key owner's projects.
- [ ] **No direct database access.** All data access goes through the project's existing service layer.
- [ ] **Sensitive fields are stripped from responses.** No password hashes, tokens, or internal IDs in responses.

```typescript
// ✅ Good — scoped to agent's owner
handler: async (params, ctx) => {
  return db.projects.findMany({
    where: { ownerId: ctx.agent.ownerId, ...params }
  })
}

// ❌ Bad — returns ALL projects
handler: async (params) => {
  return db.projects.findMany({ where: params })
}
```

## Error Handling

- [ ] **Errors use standardized codes.** `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL_ERROR`.
- [ ] **Internal errors don't leak stack traces.** Return generic message in production.
- [ ] **404 vs 403 handled correctly.** Don't reveal resource existence to unauthorized agents — return 404 for both "not found" and "not yours".

```typescript
// ✅ Good — consistent error shape
{
  error: {
    code: "VALIDATION_ERROR",
    message: "Missing required field: name"
  }
}

// ❌ Bad — leaks internals
{
  error: "PrismaClientKnownRequestError: Unique constraint failed on the fields: (`email`)",
  stack: "at Object.handler (/app/agent-api/actions/users.ts:42:5) ..."
}
```

## Transport Security

- [ ] **HTTPS enforced in production.** Agent API keys sent over HTTP are compromised keys.
- [ ] **CORS configured correctly.** Agent APIs should not have `Access-Control-Allow-Origin: *` unless intentional.
- [ ] **Request body size limited.** Default: 1MB. Prevents memory exhaustion.

## Key Rotation & Revocation

- [ ] **Key rotation supported.** Agents can get a new key without downtime (grace period on old key).
- [ ] **Key revocation is immediate.** Revoking a key takes effect on the next request.
- [ ] **Users can list and revoke their own keys.** Management endpoints are user-scoped.
- [ ] **Revoked key attempts are logged.** Helps detect compromised key usage.

## Pre-Delivery Verification

Run these checks before delivering the generated agent-api/:

```bash
# 1. No hardcoded secrets
grep -r "sk_\|password\|secret.*=" agent-api/ --include="*.ts" | grep -v "process.env\|test"

# 2. All actions have scopes
grep -r "scopes:" agent-api/actions/ --include="*.ts" | wc -l
# Should match number of defineAction calls

# 3. Zod validation on all actions
grep -r "z.object" agent-api/actions/ --include="*.ts" | wc -l

# 4. No z.any() usage
grep -r "z.any\|z.unknown" agent-api/ --include="*.ts"
# Should return nothing

# 5. Error handler imported
grep -r "error-handler\|errorHandler" agent-api/index.ts
```
