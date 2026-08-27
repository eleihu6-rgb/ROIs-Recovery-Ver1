# ROIS-AI Memory Platform Repo-Wide Rollout Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the `rois-ai` memory platform from the current P0/P1 foundation into a repo-wide rollout where every project either contributes knowledge, consumes runtime memory, or both, using one shared `memory-service` and one consistent scope model.

**Architecture:** Keep developer memory and runtime memory separated. Developer memory is already repo-wide through the `memory/` workflow. Runtime memory must continue to flow through `memory-service`, with `live-server` and `pbs-server` acting as the first integration backends, and all frontends consuming memory through their owning backend rather than calling MemPalace directly.

**Tech Stack:** MemPalace, FastAPI, Fastify, React, React Native, shell scripts, local repo docs

**Spec:** `docs/superpowers/specs/2026-04-20-rois-ai-memory-platform-design.md`

---

## Rollout Model

Each project falls into one or more roles:

- **Knowledge Source**: contributes code, docs, explainability output, or decisions into memory
- **Runtime Consumer**: calls `memory-service` directly at runtime
- **Indirect Consumer**: gets memory-backed features through another service
- **Later Candidate**: not in the first runtime rollout, but explicitly planned

### Project Matrix

| Project | Role | Runtime Path | Rollout Phase |
|---|---|---|---|
| `docs / doc / sql` | Knowledge Source | Dev memory only | Done in P0 |
| `packages/ui` | Knowledge Source | Dev memory only | Phase 4 |
| `gantt` | Indirect Consumer + Knowledge Source | `gantt -> live-server -> memory-service` | Phase 3 |
| `live-server` | Runtime Consumer + Knowledge Source | `live-server -> memory-service` | Phase 2 |
| `pbs-server` | Runtime Consumer + Knowledge Source | `pbs-server -> memory-service` | Phase 2 |
| `pbs-portal` | Indirect Consumer + Knowledge Source | `pbs-portal -> pbs-server -> memory-service` | Phase 3 |
| `pbs-app` | Indirect Consumer + Knowledge Source | `pbs-app -> pbs-server -> memory-service` | Phase 3 |
| `pbs-portal` | Indirect Consumer + Knowledge Source | `pbs-portal -> pbs-server -> memory-service` | Phase 3 |
| `rule-engine` | Knowledge Source + Later Candidate | batch output or service-side adapter later | Phase 4 |
| `po-engine` | Knowledge Source + Later Candidate | batch output or service-side adapter later | Phase 4 |
| `ro-engine` | Knowledge Source + Later Candidate | batch output or service-side adapter later | Phase 4 |
| `memory-service` | Platform Core | direct runtime API | Done in P1 |

### Key Constraint

Repo-wide memory does **not** mean every project should talk to MemPalace directly.

The repo-wide goal is:

1. every project is represented in memory,
2. every project has a defined path to consume memory,
3. every runtime integration respects service ownership, security, and scope isolation.

---

## Current Baseline

Already completed:

- `P0` repo-level developer memory
  - install, doctor, init, mine, search, wake-up scripts
  - repo-wide mining scope across all major projects
- `P1` `memory-service` PoC
  - `GET /health`
  - `POST /v1/memory/search`
  - `POST /v1/memory/write`
  - `POST /v1/memory/context`
  - scope validation and audit hook

What is **not** done yet:

- no backend client in `live-server`
- no backend client in `pbs-server`
- no frontend workflow in `gantt`, `pbs-portal`, or `pbs-app`
- no engine-side explainability ingestion contract
- no shared runtime auth, tenancy, or service-to-service policy

---

## Phase 2: Backend Consumer Rollout

**Goal:** make `live-server` and `pbs-server` the first real runtime consumers of `memory-service`.

### Task 1: Integrate `pbs-server`

- [ ] Create a typed memory client in `pbs-server`
- [ ] Add env config for `MEMORY_SERVICE_URL`, timeout, and feature flags
- [ ] Add a bounded assistant-oriented service layer for:
  - search
  - context wake-up
  - safe write for curated system events or help content
- [ ] Expose internal API endpoints for `pbs-portal` and `pbs-app`
- [ ] Add scope mapping for:
  - `system = "pbs"`
  - `environment = dev/test/prod`
  - `memory_scope = system_knowledge | team_shared | user_private | audit_explain`
- [ ] Add tests for client success/failure, timeout, and scope mapping

### Task 2: Integrate `live-server`

- [ ] Create a typed memory client in `live-server`
- [ ] Add env config for `MEMORY_SERVICE_URL`, timeout, and feature flags
- [ ] Add service methods for:
  - search operator knowledge
  - load context for roster/pairing workflows
  - write explainability notes or operator-facing reasoning when explicitly allowed
- [ ] Add internal endpoints for `gantt`
- [ ] Add scope mapping for:
  - `system = "live"`
  - `memory_scope = system_knowledge | team_shared | audit_explain`
- [ ] Add tests for client behavior, fallback, and error handling

### Task 3: Define backend-side shared contract

- [ ] Standardize request/response DTO shape across `pbs-server` and `live-server`
- [ ] Standardize service-to-service auth strategy
- [ ] Standardize retry and timeout policy
- [ ] Standardize audit field requirements for runtime writes

**Exit Criteria:**

- both backend services can call `memory-service` in development
- both backend services expose internal routes or service methods that their owned frontends can consume
- no frontend calls `memory-service` directly

---

## Phase 3: Frontend and App Consumption Rollout

**Goal:** enable all user-facing clients to use memory-backed features through their owning backend.

### Task 1: `pbs-portal`

- [ ] Add assistant/search UI entry points that call `pbs-server`
- [ ] Load bounded context on assistant/session start
- [ ] Use memory-backed search for help, rules, and workflow explanation
- [ ] Do not write arbitrary long-term user memory until product policy is approved

### Task 2: `pbs-app`

- [ ] Mirror `pbs-portal` memory entry points through `pbs-server`
- [ ] Keep mobile interactions bounded and explicit
- [ ] Prefer read-first scenarios:
  - help
  - explanations
  - contextual recall

### Task 3: `pbs-app`

- [ ] Map current mobile UI ownership to `pbs-server`
- [ ] Reuse the same search/context contract as `pbs-portal`
- [ ] Avoid creating a second PBS memory API surface

### Task 4: `gantt`

- [ ] Add operator-facing search and contextual recall through `live-server`
- [ ] Support roster/pairing explanation panels powered by backend memory calls
- [ ] Keep any write path tightly controlled and auditable

**Exit Criteria:**

- `pbs-portal` and `pbs-app` consume one shared PBS memory contract through `pbs-server`
- `gantt` consumes one shared live-ops memory contract through `live-server`
- all frontends remain indirect consumers

---

## Phase 4: Engine and Shared Artifact Rollout

**Goal:** bring non-frontend, non-primary-backend projects into the platform as structured memory contributors, and only add runtime consumption where it creates clear value.

### Task 1: `rule-engine`

- [ ] Define whether rule explanations should be exported as searchable artifacts
- [ ] If yes, add a bounded ingestion path into `memory-service`
- [ ] Keep the engine itself out of direct runtime memory calls unless needed

### Task 2: `po-engine` and `ro-engine`

- [ ] Define whether optimization explanations should be written as explainability artifacts
- [ ] If yes, standardize export format before ingestion
- [ ] Avoid direct end-user memory semantics inside optimization engines

### Task 3: `packages/ui`

- [ ] Mine stable component docs and usage conventions into developer memory
- [ ] Keep `packages/ui` as a source of reusable knowledge, not a runtime consumer

### Task 4: shared docs and schemas

- [ ] Continue mining `docs`, `doc`, `sql`, and future ADR/spec directories
- [ ] Keep developer memory current with architectural decisions

**Exit Criteria:**

- all major projects are either represented as sources, consumers, or both
- engines contribute explainability only through an explicit contract
- shared component knowledge is available to developer memory

---

## Scope and Isolation Rules

These rules apply to the whole repo rollout:

- `developer_shared` is for repo-level development memory only
- `system_knowledge` is for curated product/domain knowledge
- `team_shared` is for operational or team-visible memory
- `user_private` is reserved for per-user product memory
- `audit_explain` is reserved for explainability and traceable write paths

System mapping:

- `dev` for repo-level development memory only
- `live` for `live-server` and `gantt` runtime usage
- `pbs` for `pbs-server`, `pbs-portal`, and `pbs-app`
- `engines` for rule and optimization engine artifacts

Non-negotiable rules:

- no direct frontend-to-MemPalace access
- no mixing developer memory with user memory
- no uncontrolled runtime writes from UI clients
- no engine output ingestion without an explicit schema

---

## Suggested Execution Order

1. `pbs-server` runtime integration
2. `live-server` runtime integration
3. `pbs-portal` and `pbs-app` consumption through `pbs-server`
4. `gantt` consumption through `live-server`
5. engine explainability ingestion
6. `packages/ui` and ongoing shared knowledge mining

Why this order:

- it uses the already-built `memory-service`
- it connects the two backend owners before touching clients
- it avoids duplicating memory contracts across PBS clients
- it keeps operational and employee-facing usage separated

---

## Verification Strategy

### Backend Integration Verification

- client unit tests
- timeout/failure fallback tests
- request contract tests against `memory-service`
- scope validation tests

### Frontend/App Verification

- UI flow tests proving calls route through owned backends
- no direct `memory-service` URL usage in frontend code
- Playwright smoke coverage for memory-backed entry points once implemented

### Platform Verification

- repo-level `mine/search/wake-up` still works after rollout
- `memory-service` audit logs show source system and scope
- cross-project memory remains isolated by system and memory scope

---

## Deliverables

When this rollout is complete, the repo should have:

- one repo-wide developer memory workflow
- one platform `memory-service`
- one `pbs-server` integration path serving all PBS clients
- one `live-server` integration path serving `gantt`
- explicit source-only contracts for engines and shared docs/packages

That is the point where `rois-ai` can honestly be described as **repo-wide memory-enabled**, instead of only having a local PoC.
