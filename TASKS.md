# TASKS.md — Planned, Check-offable Work

> Each task should result in runnable commands and/or visible UI changes. Keep PRs small.

## Phase 0 — Repo hygiene

- [x] Add package scripts (`bootstrap`, `dev`, `start`, `test`, `e2e:smoke`, `lint`, `fmt`, `typecheck`) — tests: `npm test`, `npm run e2e:smoke`
  - **AC:** `npm run dev` starts an HTTP server with `/health`; `npm test` runs a dummy test.
- [x] Add lint/format config and ensure they run. — tests: `npm run lint`, `npm run fmt`, `npm test`, `npm run e2e:smoke`
  - **AC:** `npm run lint` and `npm run fmt` succeed.

## Phase 1 — API skeleton (in-memory)

- [ ] Create `api/openapi.yaml` with MVP endpoints listed in SPECS.md.
  - **AC:** File exists; paths compile with an OpenAPI linter.
- [ ] Implement **/rituals**: `POST`, `GET`, `GET/{id}`
  - **AC:** Can create and list rituals with `ritual_key`, `name`, `instant_runs`.
- [ ] Implement **/rituals/{id}/runs**: `POST`
  - **AC:** Returns a run with `run_key` defaulting to ISO date.

## Phase 2 — Lightweight rituals & instant runs

- [ ] Add `instant_runs` semantics
  - **AC:** If `instant_runs=true`, creating a run auto-starts and auto-completes unless blocked.
- [ ] Add _pasted link_ support as a run/ritual **input** (Unresolved Target)
  - **AC:** Rituals accept a list of `external_link` inputs; runs inherit them.

## Phase 3 — Attention Items (human-in-the-loop)

- [ ] Implement **POST /attention** and **GET /runs/{id}/attention**
  - **AC:** Prep/start logic can create an attention item (mock); list shows it.
- [ ] Add `on_attention_resolved` event (mock implementation)
  - **AC:** Resolving an item triggers a log entry on the run.

## Phase 4 — Automations (mock)

- [ ] **POST /automations** to register an automation stub
  - **AC:** Store `trigger`, `call{capability_id, payload_template, (optional) connection_id/target_id}`
- [ ] **POST /invocations/request** returns a mock invocation URL + idempotency key
  - **AC:** E2E can pretend to “call a capability” by logging the URL.

## Phase 5 — Minimal UI (no build tools required)

- [ ] **Home**: single-line ritual creator + Upcoming + Needs Attention
  - **AC:** Can create a ritual by typing “Trash day Fridays 7am https://link”; ritual appears; link listed.
- [ ] **Ritual page**: show cadence, instant badge, default inputs, “Create run now”
  - **AC:** Button creates a run; if instant, a toast shows “Run complete”.
- [ ] **Run mini-hub**: show status, next triggers (mock), activity log, attention items
  - **AC:** Attention item created via API is visible and can be resolved (mock).

## Phase 6 — Tests

- [ ] Unit tests for rituals, runs, attention items
  - **AC:** CRUD and instant run start/complete covered.
- [ ] E2E smoke: create ritual → create run → request invocation URL → “done”
  - **AC:** Single command `npm run e2e:smoke` passes.

## Phase 7 — OpenAPI fidelity

- [ ] Ensure handlers match OpenAPI; generate minimal client types (optional)
  - **AC:** OpenAPI linter is clean; paths ↔ handlers parity documented in AGENTS.md.

## Phase 8 — Policies (MVP)

- [ ] Hardcode household roles (Owner/Adult/Teen/Guest/Agent); allow only Owner to resolve “auth_needed”
  - **AC:** Policy enforced in attention resolve endpoint; unit test proves it.

## Phase 9 — Quality: logs & idempotency

- [ ] Add idempotency keys to automation calls (mock) and attention resolves
  - **AC:** Replaying the same request is safe (no dupes).
- [ ] Structured logs
  - **AC:** Logs include `{event, run_id, ritual_id?, status}`.

## Stretch (optional)

- [ ] Parse cadence from free text (“Fridays 7am”) with a tiny helper; fallback to manual fields.
- [ ] Add “exception_shift holiday:local +1” mock (shift next run date for demo).

---

## Acceptance test (manual)

1. Create ritual: “Trash day Fridays 7am https://city/trash”.
2. Open ritual; create a run. If instant, it completes immediately.
3. Create an attention item via API; resolve it in UI; see a log entry and a resumed action (mock).
4. Register an automation; request invocation URL; see a log entry in the run.

> When all above is true and tests pass, MVP is ready for iteration.
