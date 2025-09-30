# WeaveOS Architecture & Technology Choices

## 1. Guiding principles

- **Agent-first interactions.** The API is the source of truth; the UI is a thin client that reflects and triggers API workflows.
- **Lightweight, in-memory MVP.** Until persistence tasks are assigned, data is held in memory with deterministic behavior for testing.
- **OpenAPI-driven.** The contract in `api/openapi.yaml` defines the external surface; handlers and tests align with it.
- **Composable modules.** Domain logic is modeled in small, pure functions that are easy to test and compose.

## 2. Runtime stack

| Concern         | Choice                        | Notes                                                                                   |
| --------------- | ----------------------------- | --------------------------------------------------------------------------------------- |
| Language        | **TypeScript** (Node.js ≥ 20) | Strong typing for domain nouns and request/response payloads.                           |
| Web framework   | **Fastify**                   | High-performance HTTP server with first-class TypeScript support and schema validation. |
| Validation      | **zod** + Fastify schemas     | Single source of validation + runtime parsing for both API and internal use.            |
| Task scheduling | In-memory scheduler module    | Simulates ritual/run triggers without external cron for MVP.                            |
| Logging         | pino (structured)             | Emits `{event, entity, id, status, meta}` per guardrails.                               |

## 3. Application layout

```
/
├── src/
│   ├── app.ts            # Fastify bootstrap & plugin registration
│   ├── server.ts         # HTTP server entrypoint (`npm run dev`/`npm start`)
│   ├── config/           # Environment + constants
│   ├── domain/           # Pure domain models (Ritual, Run, AttentionItem, etc.)
│   ├── services/         # Orchestrators (ritualService, runService, attentionService)
│   ├── adapters/
│   │   ├── http/         # Route handlers, validation schemas
│   │   └── automation/   # Mock invocation + automation registry
│   ├── repositories/     # In-memory stores with interface contracts
│   ├── workflows/        # Agent session playbooks & trigger logic
│   └── utils/            # Shared helpers (time, ids, parsing)
├── public/               # Static UI assets (HTML, JS, CSS)
├── tests/
│   ├── unit/             # Vitest unit suites
│   ├── integration/      # Route-level tests hitting Fastify instance
│   └── e2e/              # Playwright (or supertest) powered smoke flows
├── api/openapi.yaml      # API contract (additive edits only without review)
└── docs/                 # Project documentation (architecture, decisions)
```

### Dependency flow

- `domain` has no external dependencies and is shared across services and handlers.
- `repositories` expose interfaces (e.g., `RitualRepository`) with in-memory implementations. Future persistence layers swap in via the same interface.
- `services` orchestrate domain operations, rely on repositories, and emit structured logs.
- `adapters/http` translate HTTP requests into service calls, using zod schemas tied to OpenAPI definitions.
- `workflows` encapsulate trigger logic for instant runs, attention handling, and automation dispatch.

## 4. API strategy

- **Fastify route modules** map 1:1 with OpenAPI paths. Each module exports a function that receives the Fastify instance and registers routes plus schemas.
- **Schema reuse.** Zod schemas live alongside domain models; we generate OpenAPI JSON schemas from them (via `zod-to-json-schema`) to ensure parity.
- **Error handling.** Use typed error classes (`DomainError`, `ValidationError`, `NotFoundError`) mapped to HTTP status codes in a shared error handler plugin.
- **Idempotency.** POST endpoints accept optional `Idempotency-Key` headers; services ensure repeated calls are safe (e.g., by storing hashes in memory for MVP).

## 5. UI approach

- **Static-first.** Deliver pre-built HTML/JS from `/public` using vanilla TypeScript + HTMX for dynamic interactions—no SPA bundler required per spec.
- **Design system.** Lightweight utility CSS (e.g., Open Props) to keep styling minimal.
- **API consumption.** HTMX triggers call REST endpoints; responses are small HTML fragments rendered by server-side templates (nunjucks) or JSON transformed client-side.
- **State sync.** UI polls or receives Server-Sent Events (Fastify SSE plugin) for run/attention updates, mocked during MVP.

## 6. Testing & quality gates

| Layer       | Tooling                        | Focus                                                                  |
| ----------- | ------------------------------ | ---------------------------------------------------------------------- |
| Unit        | **Vitest**                     | Domain logic (parsers, instant run semantics, attention transitions).  |
| Integration | **supertest** + Fastify        | Route handlers respect OpenAPI schemas, status codes, and idempotency. |
| E2E smoke   | **Playwright** (headless)      | Create ritual → create run → request invocation URL workflow.          |
| Lint        | **ESLint** (typescript-eslint) | Enforce code style, import ordering, no-floating-promises.             |
| Format      | **Prettier**                   | Consistent formatting; run via `npm run fmt`.                          |
| Typecheck   | **tsc --noEmit**               | Ensure types align across modules.                                     |

All CI and local commits must run:

1. `npm run lint`
2. `npm run fmt -- --check`
3. `npm run typecheck`
4. `npm test`
5. `npm run e2e:smoke`

## 7. Dev experience

- **Package manager:** npm (per repo conventions). Future tasks may add workspaces if UI becomes more complex.
- **Environment config:** `.env.sample` documents variables (e.g., `PORT`, `LOG_LEVEL`). Use `dotenv` in dev; never commit secrets.
- **Scripts:** Defined in `package.json` with shared `ts-node-dev` for hot reload.
- **Commit hooks:** Husky + lint-staged to run lint/format/typecheck on staged files.

## 8. Future-proofing

- **Persistence ready.** Repository interfaces accept async operations so they can swap to Postgres/Prisma when instructed.
- **Eventing.** Introduce a lightweight in-memory event bus to emit run/automation events; later replace with durable queues.
- **Telemetry.** Plan for OpenTelemetry instrumentation once observability becomes a requirement.

These decisions align with MVP constraints while leaving room to scale into richer automation workflows.
