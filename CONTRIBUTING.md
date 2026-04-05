# Contributing to AgentGate

Thank you for your interest in contributing to AgentGate! This guide will help you get started.

## Development Setup

```bash
# Clone the repo
git clone https://github.com/ComeOnOliver/agentgate.git
cd agentgate

# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Type check
npm run typecheck

# Lint
npm run lint

# Build
npm run build
```

## Project Structure

```
src/
├── index.ts              # Public API exports
├── gate.ts               # AgentGate class
├── action.ts             # Action registry & validation
├── manifest.ts           # Manifest generation
├── middleware/
│   ├── common.ts         # Framework-agnostic handler
│   ├── express.ts        # Express adapter
│   └── hono.ts           # Hono adapter
├── auth/
│   ├── api-key.ts        # API key strategy
│   ├── bearer.ts         # Bearer token strategy
│   └── types.ts          # Auth interfaces
├── ratelimit/
│   ├── memory.ts         # In-memory rate limiter
│   └── types.ts          # Rate limit interfaces
├── logger.ts             # Structured JSON logger
├── errors.ts             # Error types
└── types.ts              # Core type definitions
```

## Guidelines

### Code Style

- We use [Biome](https://biomejs.dev/) for linting and formatting
- Run `npm run lint:fix` before committing
- TypeScript strict mode is enabled — no `any` types

### Testing

- Write tests for all new features
- Place tests in the `tests/` directory
- Use descriptive test names
- Run `npm test` to ensure all tests pass

### Commits

- Use clear, descriptive commit messages
- Reference issue numbers where applicable

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run tests and linting (`npm test && npm run lint`)
5. Push and open a PR

### Reporting Issues

- Use GitHub Issues
- Include steps to reproduce
- Include your Node.js version and OS
