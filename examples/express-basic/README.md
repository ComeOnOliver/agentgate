# AgentGate — Express Basic Example

A minimal todo app that exposes its API to AI agents via AgentGate, with user-linked agent registration.

## Run

```bash
npx tsx examples/express-basic/index.ts
```

## Try it

```bash
# 1. Discover capabilities
curl http://localhost:3000/agent/manifest.json

# 2. Register an agent (requires user identity headers)
curl -X POST http://localhost:3000/agent/register \
  -H "Content-Type: application/json" \
  -H "X-User-Id: user-1" \
  -H "X-User-Email: alice@example.com" \
  -H "X-User-Name: Alice" \
  -d '{"name": "my-agent", "scopes": ["read:todos", "write:todos"]}'

# 3. List todos (use the apiKey from step 2)
curl -X POST http://localhost:3000/agent/actions/todos.list \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ag_YOUR_KEY_HERE" \
  -d '{"params": {}}'

# 4. Create a todo
curl -X POST http://localhost:3000/agent/actions/todos.create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ag_YOUR_KEY_HERE" \
  -d '{"params": {"title": "Try AgentGate"}}'

# 5. List your agents
curl http://localhost:3000/agent/agents \
  -H "X-User-Id: user-1"

# 6. Revoke an agent
curl -X DELETE http://localhost:3000/agent/agents/AGENT_ID_HERE \
  -H "X-User-Id: user-1"
```
