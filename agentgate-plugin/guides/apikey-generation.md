# API Key Generation Guide

How to implement secure API key management for agent access.

## Key Format

Agent API keys use the `ag_` prefix followed by 32 bytes of cryptographically random hex:

```
ag_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2
```

- Prefix: `ag_` (identifies it as an AgentGate key)
- Body: 64 hex characters (32 bytes of entropy)
- Total length: 67 characters

### If Project Already Has Agent Keys

If the project already uses agent-style API keys (e.g., `sk_agent_xxx`, `ak_xxx`), **extend that system** rather than creating a parallel one. Match the existing prefix and storage pattern. Add scopes to the existing key model if needed.

## Key Generation

```typescript
import { randomBytes, createHmac } from "crypto"

/**
 * Generate a new agent API key.
 * Returns the plaintext key (show once to user) and the hash (store in DB).
 */
export function generateAgentKey(): { plaintext: string; hash: string } {
  const raw = randomBytes(32).toString("hex")
  const plaintext = `ag_${raw}`
  const hash = hashKey(plaintext)
  return { plaintext, hash }
}

/**
 * Hash a key for storage. Uses HMAC-SHA256 with a server secret.
 * NEVER store plaintext keys in the database.
 */
export function hashKey(plaintext: string): string {
  const secret = process.env.AGENTGATE_KEY_SECRET || process.env.JWT_SECRET
  if (!secret) throw new Error("Missing AGENTGATE_KEY_SECRET or JWT_SECRET")

  return createHmac("sha256", secret)
    .update(plaintext)
    .digest("hex")
}

/**
 * Validate a key by hashing and comparing against stored hash.
 */
export function validateKey(plaintext: string, storedHash: string): boolean {
  const hash = hashKey(plaintext)
  // Use timing-safe comparison to prevent timing attacks
  return timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash))
}
```

## Storage Schema

### Prisma Example

```prisma
model AgentKey {
  id          String   @id @default(cuid())
  keyHash     String   @unique              // HMAC-SHA256 hash, never plaintext
  keyPrefix   String                         // First 8 chars for identification: "ag_a1b2..."
  name        String                         // Agent name (e.g., "claude-assistant")
  scopes      String[]                       // Granted scopes
  ownerId     String                         // User who created this key
  owner       User     @relation(fields: [ownerId], references: [id])
  lastUsedAt  DateTime?
  expiresAt   DateTime?                      // Optional expiration
  revokedAt   DateTime?                      // Null = active, set = revoked
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([keyHash])
  @@index([ownerId])
}
```

### Drizzle Example

```typescript
import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core"

export const agentKeys = pgTable("agent_keys", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  keyHash: text("key_hash").notNull().unique(),
  keyPrefix: text("key_prefix").notNull(),
  name: text("name").notNull(),
  scopes: text("scopes").array().notNull().default([]),
  ownerId: text("owner_id").notNull().references(() => users.id),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  keyHashIdx: index("agent_key_hash_idx").on(table.keyHash),
  ownerIdx: index("agent_key_owner_idx").on(table.ownerId),
}))
```

### In-Memory (Development Only)

```typescript
const keys = new Map<string, {
  hash: string
  name: string
  scopes: string[]
  ownerId: string
  createdAt: Date
  lastUsedAt: Date | null
  revokedAt: Date | null
}>()
```

## Scope System

### Scope Hierarchy

```
read:*          — Read access to all resources
write:*         — Write access to all resources (implies read)
admin           — Full access including dangerous operations

read:projects   — Read projects
write:projects  — Create/update/delete projects
read:users      — Read user profiles
write:users     — Update user profiles
read:billing    — View billing info
write:billing   — Modify billing/plans
```

### Scope Checking

```typescript
/**
 * Check if granted scopes satisfy a required scope.
 * Supports wildcards: "read:*" satisfies "read:projects"
 */
export function hasScope(granted: string[], required: string): boolean {
  // Admin scope grants everything
  if (granted.includes("admin") || granted.includes("*")) return true

  // Direct match
  if (granted.includes(required)) return true

  // Wildcard match: "read:*" matches "read:projects"
  const [action, resource] = required.split(":")
  if (resource && granted.includes(`${action}:*`)) return true

  // "write:*" implies "read:*"
  if (action === "read" && granted.includes("write:*")) return true
  if (action === "read" && resource && granted.includes(`write:${resource}`)) return true

  return false
}

/**
 * Express/Hono middleware to enforce scopes.
 */
export function requireScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const agent = req.agent // Set by auth middleware
    if (!agent) return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "No agent context" } })
    if (!hasScope(agent.scopes, scope)) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: `Missing required scope: ${scope}`,
          required: scope,
          granted: agent.scopes,
        }
      })
    }
    next()
  }
}
```

## Registration Flow

```typescript
/**
 * POST /agent/register
 * 
 * Requires authenticated user session (via userResolver).
 * Creates an agent API key scoped to the user.
 */
export async function registerAgent(req: Request, res: Response) {
  // 1. Get current user from session
  const user = await getUserFromRequest(req)
  if (!user) {
    return res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Authentication required to register an agent" }
    })
  }

  // 2. Validate request
  const body = registerSchema.parse(req.body)
  // body: { name: string, scopes: string[] }

  // 3. Check if user can register agents
  if (canRegisterAgent && !(await canRegisterAgent(user))) {
    return res.status(403).json({
      error: { code: "FORBIDDEN", message: "User not authorized to register agents" }
    })
  }

  // 4. Enforce max scopes
  if (maxScopes) {
    const allowed = await maxScopes(user)
    const invalid = body.scopes.filter(s => !hasScope(allowed, s))
    if (invalid.length > 0) {
      return res.status(403).json({
        error: { code: "FORBIDDEN", message: `Scopes not allowed: ${invalid.join(", ")}` }
      })
    }
  }

  // 5. Generate key
  const { plaintext, hash } = generateAgentKey()
  const prefix = plaintext.slice(0, 10) + "..."

  // 6. Store in DB
  await db.agentKey.create({
    data: {
      keyHash: hash,
      keyPrefix: prefix,
      name: body.name,
      scopes: body.scopes,
      ownerId: user.id,
    }
  })

  // 7. Return plaintext key (shown only once!)
  return res.status(201).json({
    agentId: key.id,
    apiKey: plaintext,       // ⚠️ Only time this is shown
    name: body.name,
    scopes: body.scopes,
    message: "Save this API key — it won't be shown again.",
  })
}
```

## Key Rotation

Support key rotation without downtime:

```typescript
/**
 * POST /agent/agents/:id/rotate
 * 
 * Generates a new key for an existing agent. Old key remains valid
 * for a grace period (default: 24h) to allow migration.
 */
export async function rotateKey(req: Request, res: Response) {
  const user = await getUserFromRequest(req)
  const agentId = req.params.id

  // Verify ownership
  const existing = await db.agentKey.findFirst({
    where: { id: agentId, ownerId: user.id, revokedAt: null }
  })
  if (!existing) return res.status(404).json({ error: { code: "NOT_FOUND" } })

  // Generate new key
  const { plaintext, hash } = generateAgentKey()

  // Create new key entry with same scopes
  await db.agentKey.create({
    data: {
      keyHash: hash,
      keyPrefix: plaintext.slice(0, 10) + "...",
      name: existing.name,
      scopes: existing.scopes,
      ownerId: user.id,
    }
  })

  // Schedule old key expiration (24h grace period)
  await db.agentKey.update({
    where: { id: agentId },
    data: { expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }
  })

  return res.status(200).json({
    apiKey: plaintext,
    message: "New key generated. Old key expires in 24 hours.",
  })
}
```

## Security Checklist

- [ ] Keys stored as HMAC-SHA256 hashes, never plaintext
- [ ] Key generation uses `crypto.randomBytes`, not `Math.random`
- [ ] Timing-safe comparison for key validation
- [ ] Keys have an owner (user-linked)
- [ ] Revoked keys checked on every request
- [ ] Expired keys checked on every request
- [ ] Key prefix stored for identification (never the full key)
- [ ] Registration requires authenticated user session
- [ ] Scopes enforced on every action invocation
