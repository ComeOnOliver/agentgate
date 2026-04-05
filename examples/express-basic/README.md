# AgentGate — Express Basic Example

A minimal todo app that exposes its API to AI agents via AgentGate.

## Run

```bash
npx tsx examples/express-basic/index.ts
```

## Try it

```bash
# 1. Discover capabilities
curl http://localhost:3000/agent/manifest.json

# 2. Register an agent
curl -X POST http://localhost:3000/agent/register \
  -H "Content-Type: application/json" \
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
```
