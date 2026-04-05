# agentgate Command

Transform a Node.js web application into an agent-accessible API.

## CRITICAL: Read HARNESS.md First

**Before doing anything else, you MUST read `./HARNESS.md`.** It defines the complete methodology, architecture standards, and implementation patterns. Every phase below follows HARNESS.md. Do not improvise — follow the harness specification.

## Usage

```bash
/agentgate <project-path>
```

## Arguments

- `<project-path>` — **Required.** Path to a Node.js project directory (must contain `package.json`).

## What This Command Does

This command implements the complete AgentGate methodology to generate a production-ready agent API layer for any Node.js web application. **All phases follow the standards defined in HARNESS.md.**

### Phase 1: Project Analysis
- Read `package.json` for framework, auth, ORM, language
- Detect and document the auth system (how to get current user from request)
- Scan and catalog all API routes with their methods, paths, params, responses
- Read the database schema (Prisma/Drizzle/Mongoose)
- Identify the service layer (where business logic lives)
- Check for existing agent support (API keys, agent routes)

### Phase 2: Action Design
- Group routes by domain (projects, users, billing, etc.)
- Design agent actions: name, description, params (Zod), returns (Zod), scopes
- Design scope hierarchy (read:*, write:*, admin)
- Decide which actions need user context vs public access

### Phase 3: Implementation
- Generate `agent-api/` directory with full structure
- Implement auth bridge (connecting to project's existing auth)
- Implement agent key management (or extend existing)
- Implement all action handlers (calling existing service logic)
- Implement manifest generation
- Implement rate limiting middleware
- Implement error handling middleware
- Generate framework-specific route file for mounting

### Phase 4: Test Planning
- Create `agent-api/tests/TEST.md` with comprehensive test plan
- Plan auth tests, action tests, rate limiting tests

### Phase 5: Test Implementation
- Write auth tests (registration, key validation, scope enforcement)
- Write action tests (happy path, validation errors, auth errors)
- Run tests and document results in TEST.md

### Phase 6: SKILL.md Generation
- Generate `agent-api/SKILL.md` with:
  - YAML frontmatter (name, description)
  - Authentication flow documentation
  - All actions with params/returns
  - Example curl commands
  - Error codes reference

### Phase 7: Integration Instructions
- Print clear instructions for the developer
- Show the single file that needs to be created to mount the agent API
- Show test curl commands to verify it works
- Do NOT auto-modify existing project files

## Output Structure

```
<project>/
├── agent-api/
│   ├── index.ts              # Main router
│   ├── manifest.ts           # Manifest generation
│   ├── actions/
│   │   ├── index.ts          # Re-exports
│   │   ├── projects.ts       # Domain actions
│   │   ├── users.ts
│   │   └── ...
│   ├── auth/
│   │   ├── agent-keys.ts     # API key management
│   │   └── user-bridge.ts    # Auth system bridge
│   ├── middleware/
│   │   ├── authenticate.ts   # API key validation
│   │   ├── rate-limit.ts     # Rate limiting
│   │   └── error-handler.ts  # Error responses
│   ├── types.ts
│   ├── utils.ts
│   ├── SKILL.md              # AI-discoverable skill definition
│   └── tests/
│       ├── TEST.md
│       ├── auth.test.ts
│       └── actions.test.ts
└── (existing project files unchanged)
```

## Success Criteria

The command succeeds when:
1. All actions are implemented and type-safe
2. Auth bridge correctly connects to the project's existing auth system
3. API key management works (register, validate, revoke, scope check)
4. Manifest accurately describes all available actions
5. Rate limiting works (429 on exceed)
6. All tests pass
7. SKILL.md is generated with complete documentation
8. Integration instructions are clear and correct
9. Generated code matches the project's code style
10. No existing files were modified
