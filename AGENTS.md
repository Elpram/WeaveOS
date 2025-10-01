# AGENTS.md

This repo is optimized for agentic development (Codex or similar). Follow this contract.

## Commands (expected to exist once implemented)

- Setup: `npm run bootstrap`
- Dev API: `npm run dev`
- Start API: `npm start`
- Unit tests: `npm test`
- E2E smoke: `npm run e2e:smoke`
- Lint/Format: `npm run lint` / `npm run fmt`
- Typecheck (if TS): `npm run typecheck`

> If a command is missing, create it and document it here.

## Repo map (source of truth)

- **SPECS.md** – product/tech spec (mutable by agents)
- **TASKS.md** – next actions (agents check these off)
- **api/openapi.yaml** – API contract (additive changes only without human approval)
- **/src/** – API/runtime code (keep focused)
- **/public/** – minimal UI (static or simple client)
- **/tests/** – unit + e2e (agents must keep green)

## Guardrails

- Don’t introduce persistent DB before a task explicitly asks for it (use in-memory first).
- Don’t add external connectors; model **Connections/Targets** and use mocks.
- No secrets in repo. Use `.env` for local only; never commit it.
- Ask (open a PR with “NEED REVIEW”) before changing data model nouns.

## Definition of Done

- `npm test` + `npm run e2e:smoke` pass locally.
- OpenAPI updated (if endpoints changed).
- Code formatted and linted.
- TASKS.md item(s) checked off with a one-line note and a link to tests.

## Coding conventions

- Small, composable modules; pure funcs where possible.
- Idempotency for any action that could be retried.
- Log structure: `{event, entity, id, status, meta}`.

## OpenAPI parity notes

- `GET /runs/{run_id}/artifacts` and `POST /artifacts` are implemented as 501 Not Implemented placeholders to align the server with the documented contract.
