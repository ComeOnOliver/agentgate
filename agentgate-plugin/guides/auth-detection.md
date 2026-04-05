# Auth Detection Guide

How to detect which authentication system a project uses. Run these checks in order — stop at the first match.

## Detection Patterns

### 1. Next-Auth / Auth.js

**Signals:**
- `next-auth` or `@auth/core` in `package.json` dependencies
- Config file: `auth.ts`, `auth.config.ts`, `[...nextauth]/route.ts`, or `pages/api/auth/[...nextauth].ts`

**Code patterns to look for:**

```typescript
// App Router (Auth.js v5)
import NextAuth from "next-auth"
export const { auth, handlers, signIn, signOut } = NextAuth({ ... })

// Pages Router / older
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
const session = await getServerSession(authOptions)

// Route handler
export { GET, POST } from "@/auth"
```

**How to get current user from request:**
```typescript
// Auth.js v5
import { auth } from "@/auth"
const session = await auth()
const userId = session?.user?.id

// Older next-auth
import { getServerSession } from "next-auth/next"
const session = await getServerSession(req, res, authOptions)
const userId = session?.user?.id
```

**Detection regex:**
```
/NextAuth\s*\(/
/getServerSession\s*\(/
/from\s+["']next-auth/
/from\s+["']@auth\/core/
/export\s+const\s+\{\s*auth\b/
```

---

### 2. Better Auth

**Signals:**
- `better-auth` in `package.json` dependencies
- Config file typically: `auth.ts`, `lib/auth.ts`

**Code patterns to look for:**

```typescript
import { betterAuth } from "better-auth"

export const auth = betterAuth({
  database: prisma,  // or drizzle, etc.
  emailAndPassword: { enabled: true },
  socialProviders: { github: { ... } },
})
```

**How to get current user from request:**
```typescript
const session = await auth.api.getSession({ headers: req.headers })
const userId = session?.user?.id
```

**Detection regex:**
```
/betterAuth\s*\(/
/from\s+["']better-auth/
/auth\.api\.getSession/
```

---

### 3. Passport.js

**Signals:**
- `passport` in `package.json` dependencies
- Strategy packages: `passport-local`, `passport-jwt`, `passport-google-oauth20`, etc.

**Code patterns to look for:**

```typescript
import passport from "passport"
import { Strategy as LocalStrategy } from "passport-local"

passport.use(new LocalStrategy((username, password, done) => { ... }))
passport.use(new JwtStrategy(opts, (jwt_payload, done) => { ... }))

app.use(passport.initialize())
app.use(passport.session())
```

**How to get current user from request:**
```typescript
// After passport middleware runs:
const user = req.user
const userId = req.user?.id
```

**Detection regex:**
```
/passport\.use\s*\(/
/passport\.initialize\s*\(/
/from\s+["']passport/
/require\s*\(\s*["']passport/
```

---

### 4. Custom JWT

**Signals:**
- `jsonwebtoken` or `jose` in `package.json` dependencies
- No higher-level auth library detected

**Code patterns to look for:**

```typescript
// jsonwebtoken
import jwt from "jsonwebtoken"
const token = jwt.sign(payload, secret)
const decoded = jwt.verify(token, secret)

// jose (Edge-compatible)
import { SignJWT, jwtVerify } from "jose"
const token = await new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).sign(secret)
const { payload } = await jwtVerify(token, secret)
```

**How to get current user from request:**
```typescript
const authHeader = req.headers.authorization
const token = authHeader?.replace("Bearer ", "")
const decoded = jwt.verify(token, process.env.JWT_SECRET!)
const userId = decoded.sub || decoded.userId
```

**Detection regex:**
```
/jwt\.verify\s*\(/
/jwt\.sign\s*\(/
/jwtVerify\s*\(/
/from\s+["']jsonwebtoken/
/from\s+["']jose/
```

---

### 5. Clerk

**Signals:**
- `@clerk/nextjs` or `@clerk/express` in `package.json` dependencies

**Code patterns:**
```typescript
import { auth } from "@clerk/nextjs/server"
const { userId } = await auth()
```

**Detection regex:**
```
/from\s+["']@clerk\//
/clerkMiddleware/
```

---

### 6. Supabase Auth

**Signals:**
- `@supabase/supabase-js` or `@supabase/ssr` in dependencies

**Code patterns:**
```typescript
import { createClient } from "@supabase/supabase-js"
const { data: { user } } = await supabase.auth.getUser()
```

**Detection regex:**
```
/supabase\.auth\.getUser/
/from\s+["']@supabase\//
```

---

## Detection Priority

Check in this order (most specific → most generic):

1. Next-Auth / Auth.js (very specific imports)
2. Better Auth (specific import)
3. Clerk (specific import)
4. Supabase Auth (specific import)
5. Passport (middleware pattern)
6. Custom JWT (generic, fallback)

If none detected, the project may use session-based auth, HTTP Basic, or no auth at all. Check for:
- `express-session` in dependencies
- Cookie-based auth middleware
- Custom middleware that reads `req.headers`

## Output

After detection, document:

```yaml
auth_system: "next-auth"          # detected system
auth_version: "5.x"               # if determinable
get_user_code: |
  const session = await auth()
  return session?.user
user_id_field: "session.user.id"
session_type: "server-side"       # server-side | jwt | cookie | api-key
```

This information feeds into Phase 3 (auth bridge generation).
