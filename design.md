# design.md

## Objective
Align system behavior with documented intent, close critical risk gaps, and establish durable validation controls.

## Strategy (Phased)
1. **Documentation-Truth Alignment Layer**
   - Correct feature and behavior claims.
   - Add complete route and script inventory.
2. **Runtime Safety Layer**
   - Gate contributor tooling route by environment flag.
   - Add URL payload size guard + fallback behavior.
3. **Operational Safety Layer**
   - Add non-destructive execution safeguards to destructive scripts.
4. **Quality Gate Layer**
   - Introduce validation commands (schema + smoke checks).
5. **Maintainability Layer**
   - Decompose monolithic pages into smaller modules with stable interfaces.

## Proposed Architecture Changes

### A1. Route Gating Contract
- Add config-driven flag for enabling contributor tools.
- Router renders contributor route only when the flag is true.
- Fallback navigation for disabled route.

### A2. URL Share-State Contract
- Introduce maximum encoded-length threshold.
- On threshold violation: preserve in-memory state, suppress URL write, expose non-blocking UI warning callback contract.
- Keep existing decode semantics backward compatible.

### A3. Script Safety Contract
- Add `--apply` explicit write gate for destructive scripts.
- Default mode becomes dry-run/read-only.
- Add output summary and changed-file counts.

### A4. Validation Contract
- Add validation command(s):
  - data schema/shape validation for registry data
  - basic script smoke validation
- Integrate as npm scripts for local and CI usage.

### A5. UI Module Boundary Refinement
- Extract stateful domain logic from page components into focused hooks/components.
- Preserve existing props contract for canvases to avoid broad regressions.

## Data Model Updates
- No breaking data shape changes required.
- Optional additive metadata:
  - route feature flags from environment
  - transient warning state for URL overflows

## Dependency Compatibility Verification
- Existing stack is modern React + router + Vite + TypeScript.
- Planned changes do not require new runtime dependencies for core remediations.
- Optional schema validation can be implemented with either:
  - native TypeScript runtime checks (no new dependency), or
  - lightweight validator package if stronger guarantees are required.
- Scripts already depend on image/OCR packages; guardrail updates are internal and compatible.

## Non-Goals (This Cycle)
- No redesign of rendering or canvas interaction model.
- No migration of asset format or storage backend.
