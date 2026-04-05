# Route Extraction Guide

How to extract all API routes from a project, organized by framework.

## Next.js App Router

**Scan pattern:** `src/app/api/**/route.ts` (or `app/api/**/route.ts`)

Each route file exports named HTTP method handlers:

```typescript
// src/app/api/projects/route.ts
export async function GET(req: NextRequest) { ... }    // GET /api/projects
export async function POST(req: NextRequest) { ... }   // POST /api/projects

// src/app/api/projects/[id]/route.ts
export async function GET(req, { params }) { ... }     // GET /api/projects/:id
export async function PUT(req, { params }) { ... }     // PUT /api/projects/:id
export async function DELETE(req, { params }) { ... }  // DELETE /api/projects/:id
```

**Extraction approach:**

```bash
# Find all route files
find src/app/api -name "route.ts" -o -name "route.js"
```

**Regex to extract methods from a route file:**
```
/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/g
```

**Path conversion:**
- `src/app/api/projects/route.ts` → `GET /api/projects`
- `src/app/api/projects/[id]/route.ts` → `GET /api/projects/:id`
- `src/app/api/users/[userId]/posts/route.ts` → `GET /api/users/:userId/posts`

**Conversion regex:**
```
# Remove src/app prefix and /route.ts suffix
path.replace(/^src\/app/, '').replace(/\/route\.(ts|js)$/, '')

# Convert [param] to :param
path.replace(/\[([^\]]+)\]/g, ':$1')

# Convert [...slug] to *
path.replace(/\[\.\.\.([^\]]+)\]/g, '*')
```

---

## Next.js Pages Router

**Scan pattern:** `pages/api/**/*.ts` (or `.js`)

Each file is a route. Default export is the handler:

```typescript
// pages/api/projects/index.ts → /api/projects
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') { ... }
  if (req.method === 'POST') { ... }
}

// pages/api/projects/[id].ts → /api/projects/:id
export default function handler(req, res) { ... }
```

**Extraction approach:**

```bash
find pages/api -name "*.ts" -o -name "*.js" | grep -v "_" | grep -v ".d.ts"
```

**Method detection** — Pages Router uses method checks inside the handler:
```
/req\.method\s*===?\s*["'](GET|POST|PUT|PATCH|DELETE)["']/g
```

**Path conversion:**
- `pages/api/projects/index.ts` → `/api/projects`
- `pages/api/projects/[id].ts` → `/api/projects/:id`

---

## Express

Express routes are defined imperatively, often across multiple files.

**Common patterns:**

```typescript
// Direct on app
app.get('/api/projects', listProjects)
app.post('/api/projects', createProject)
app.get('/api/projects/:id', getProject)
app.put('/api/projects/:id', updateProject)
app.delete('/api/projects/:id', deleteProject)

// Using Router
const router = express.Router()
router.get('/', listProjects)
router.post('/', createProject)
router.get('/:id', getProject)

// Mount point
app.use('/api/projects', router)
```

**Extraction regex patterns:**

```
# App-level routes
/app\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g

# Router-level routes
/router\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g

# Router mounting
/app\.use\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*(\w+)/g
```

**Strategy:**
1. Find all `.use()` mount points to get base paths
2. Find all router files (follow imports)
3. Combine mount path + router path for full route
4. For each route, check middleware chain for auth (e.g., `authenticate`, `requireAuth`)

**Example extraction:**
```typescript
// If: app.use('/api/projects', projectRouter)
// And projectRouter has: router.get('/:id', auth, getProject)
// Result: GET /api/projects/:id [auth required]
```

---

## Hono

Hono routes look similar to Express but use a different API:

```typescript
import { Hono } from 'hono'

const app = new Hono()

app.get('/api/projects', async (c) => { ... })
app.post('/api/projects', async (c) => { ... })
app.get('/api/projects/:id', async (c) => { ... })

// Sub-apps
const projects = new Hono()
projects.get('/', listProjects)
projects.post('/', createProject)
app.route('/api/projects', projects)
```

**Extraction regex:**
```
# Direct routes
/app\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g

# Sub-app mounting
/\.route\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*(\w+)/g
```

---

## Fastify

```typescript
fastify.get('/api/projects', { schema: { ... } }, async (req, reply) => { ... })
fastify.post('/api/projects', handler)

// Plugin-based
fastify.register(projectRoutes, { prefix: '/api/projects' })
```

**Extraction regex:**
```
/fastify\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g
/\.register\s*\(\s*(\w+)\s*,\s*\{[^}]*prefix:\s*["'`]([^"'`]+)["'`]/g
```

---

## Route Documentation Format

For each extracted route, capture:

```yaml
- method: GET
  path: /api/projects
  auth: required          # required | optional | none
  auth_middleware: auth()  # the actual middleware/function name
  params:
    query:
      - name: status
        type: string
        required: false
    path: []
    body: null
  response:
    type: array
    items: Project
  source_file: src/app/api/projects/route.ts
  handler_function: GET    # or named function
```

## Tips

1. **Follow imports.** Route files often import handlers from other files. Trace the imports to find the actual logic.
2. **Check middleware.** Auth requirements are usually middleware, not in the handler itself. Look for `auth`, `protect`, `requireAuth`, `authenticate` in the middleware chain.
3. **Look for OpenAPI/Swagger.** If the project has `swagger.json`, `openapi.yaml`, or uses `@nestjs/swagger`, the route info is already documented — parse that instead.
4. **Watch for catch-all routes.** `[...slug]` in Next.js or `*` in Express might handle multiple logical routes.
5. **Check for route groups.** Next.js `(group)` folders don't affect the URL path.
