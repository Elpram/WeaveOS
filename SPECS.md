# Ritual OS — MVP Spec (Human-Readable, Mutable)

## 0) Concept

A lightweight, agent-native “ritual OS” for households (and later orgs). Users express intent in one sentence (optionally paste a link). Agents orchestrate; UI stays out of the way.

**Core nouns**

- **Household** (container, members, timezone)
- **Ritual** (recurring process; may be lightweight)
- **Run** (one occurrence; can be _instant_)
- **Artifact** (typed, versioned output; optional for lightweight rituals)
- **Asset** (evergreen reference; optional)
- **Automation** (trigger → call capability via Connection/Target)
- **Connection** (authorized tool, via MCP/iPaaS)
- **Target** (a specific thing inside a Connection, or an unresolved pasted link)
- **Constraint** (lead_time | window | exception_shift | depends_on)
- **Attention Item** (human-in-the-loop blocker/resolution)
- **Policy** (who can invoke which capabilities; basic roles)

### Keys & naming

- `ritual_key` (short id, e.g., `trash-day`)
- `run_key` (e.g., `2025-W41` or ISO date)
- Artifact title: `ritualKey/runKey-or-draft/type`
- Asset title: `asset/<domain>/<identifier>`

---

## 1) Lightweight Rituals (LWR)

**Goal:** feel “to-do simple” for users; heavy lifting is agent-side.

- `instant_runs: true` → auto-create, auto-start, auto-complete runs unless blocked.
- `lifecycle: []` (no required artifacts).
- Optional `lead_time` constraint (reminders).
- Inputs can be **pasted links** (stored as _Unresolved Targets_).
- Automations: simple (notify, call URL) at `before_run_start` / `on_run_start`.

**Examples**

- “Trash day Fridays 7am. City schedule: https://…”
- “Run Roomba Mondays 10am. Webhook: https://…”
- “Pay parking ticket tonight 8pm: https://city/…” (one-shot)

---

## 2) Triggers & Sessions (agent lifecycle)

**Run states:** `planned → in_progress → complete`

**Triggers**

- `on_run_planned`
- `before_run_start(T-Δ)`
- `on_run_start`
- `on_artifact_published(type=…)`
- `on_run_complete`
- `on_attention_resolved`
- system health: `automation.failed`, `constraint.violation_imminent`

**Agent Session**

- One run + one trigger → short, idempotent playbook (3–10 steps), then exit.
- Serial per Run (no races). Hard budget (time/steps).

**Attention Items**

- Created when a session hits a human boundary (re-auth, missing draft, needs decision).
- Resolving an item emits `on_attention_resolved` and resumes the flow.

---

## 3) Constraints (narrow, enforceable)

- **lead_time**: ensure inputs exist `P1D` (for example) before start.
- **window**: can only run between `start/end` (local TZ).
- **exception_shift**: adjust for holidays (+N days).
- **depends_on**: cannot start until another ritual’s run completes.

Advisory logic beyond these is **not enforced** (agents may nudge only).

---

## 4) Automations, Connections, Targets

- **Connection**: user-added tool via MCP/iPaaS (auth handled there).
- **Target**: friendly label + provider’s opaque id. Can start as **Unresolved Target** from a pasted link (no auth); resolvable later.
- **Automation**: `{trigger → call(capability_id, connection_id, target_id?, payload_template, idempotency_key_template?)}`.
- Programmatic calls use either a one-time **Invocation URL** or a short-lived **Capability Token** from MCP/iPaaS; OS stores no secrets.

---

## 5) Minimal API surface (MVP)

(_OpenAPI lives in `api/openapi.yaml`; this is the human view._)

- **Rituals**: `POST /rituals`, `GET /rituals`, `GET /rituals/{id}`, `POST /rituals/{id}/runs`
- **Runs**: `GET /runs/{id}`, `GET /runs/{id}/attention`, (later) `/runs/{id}/hub`
- **Artifacts**: `POST /artifacts` (context = run|ritual|inbox), `GET /runs/{id}/artifacts`
- **Attention**: `POST /attention` (create), resolve/snooze/dismiss (later)
- **Automations**: `POST /automations` (register), delivery log (later)
- **Invocations**: `POST /invocations/request` (mock Invocation URL)
- **Connections/Targets**: (later) create/list; for MVP represent pasted links as inputs

---

## 6) Minimal UI spec (household, LWR-first)

**Principles**

- Single-line intent, optional link paste. No pickers. One button.
- One “Needs attention” list for the whole household.
- Run hub is spartan: what will happen / what happened / what’s missing.

**Screens**

1. **Home**
   - “Create a ritual” input:
     - Fields (single line parsing): _name_, optional _cadence phrase_ (“Fridays 7am”), optional _link_
     - Checkbox: “instant runs” (default ON)
   - “Upcoming” list (next 7 days)
   - “Needs attention” (open attention items)
2. **Ritual page**
   - Header: name + key, cadence badge, instant-runs badge
   - Actions: “Create run now”
   - Sections: recent runs (last 5), default inputs (show pasted links)
3. **Run mini-hub** (drawer or page)
   - Status (planned/in_progress/complete)
   - Next triggers (lead_time in 12h; start at Fri 7:00)
   - Activity log (automations fired, with outcomes)
   - Attention items (inline buttons: Create draft, Re-auth, Retry)

**UI interactions**

- Paste link → stored as input (unresolved target). If later resolved, label persists.
- Resolving an attention item immediately resumes the flow (visible as activity).

---

## 7) Non-goals (MVP)

- No manual inventory or finance tracking.
- No vendor-specific connectors implemented here (only mocks).
- No RBAC depth beyond household roles (Owner/Adult/Teen/Guest/Agent).

---

## 8) Open questions (agents may append)

- Do we auto-extract cadence from free text or require chips?
- How do we surface holiday calendars robustly (service/source)?
- What’s the minimal policy config UI for sensitive automations?
