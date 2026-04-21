# tasks.md

## Execution Order

### T-001 — Align feature documentation with implemented behavior
- **Status:** Complete
- **Acceptance Criteria:**
  - Route table includes all active routes.
  - Export behavior description matches implementation.
  - Unsupported context-menu deletion claim removed or implemented.

### T-002 — Document operational script pipeline comprehensively
- **Status:** Complete
- **Acceptance Criteria:**
  - All active script entrypoints are listed with purpose.
  - One authoritative execution order is documented.
  - Destructive vs safe scripts clearly labeled.

### T-003 — Gate contributor tooling route by environment flag
- **Status:** Complete
- **Acceptance Criteria:**
  - Contributor route is disabled by default in production mode.
  - Disabled route resolves to safe fallback.
  - Behavior is testable via environment toggle.

### T-004 — Add URL payload length guardrails
- **Status:** Complete
- **Acceptance Criteria:**
  - URL write path enforces max encoded length.
  - Overflow path avoids writing oversized URLs.
  - Existing valid URLs continue to decode.

### T-005 — Add validation/test command surface
- **Status:** Complete
- **Acceptance Criteria:**
  - At least one schema/shape validation command exists.
  - Command is runnable through npm scripts.
  - Failure returns non-zero exit code.

### T-006 — Add safety gates to destructive scripts
- **Status:** Complete
- **Acceptance Criteria:**
  - Destructive writes require explicit apply flag.
  - Default behavior is dry-run/no-write.
  - Summary output states intended and actual writes.

### T-007 — Refactor high-complexity page modules incrementally
- **Status:** Complete
- **Acceptance Criteria:**
  - First extraction pass reduces per-file responsibility scope.
  - No route-level behavior regressions.
  - Imports and types remain valid under lint/build.

---

## Checkpointing Protocol
- Emit a **State Summary** after each completed task.
- Update this file task status immediately after validation.
- Keep changes atomic: one logical fix per commit.

## Progress History
- **State Summary 2026-04-21 / Phase 3 checkpoint #1:** T-001 through T-006 completed and validated locally; T-007 queued for a dedicated refactor pass.
- **State Summary 2026-04-21 / Phase 3 checkpoint #2:** T-007 completed by extracting selected-seat sidebar UI/interaction responsibilities out of the primary room page module; lint/build validation passed.
