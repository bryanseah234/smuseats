# bugfix.md

## Scope
This document tracks remediation items discovered in the reconciliation audit. Status values:
- **Open**: not yet remediated
- **Fixed**: implemented and verified

## Bug & Risk Log

### B-001 — Documented context-menu deletion is not implemented
- **Status:** Fixed
- **Root Cause:** The documentation claims pointer-context deletion behavior, but the editor interaction layer does not handle context menu or right-click actions.
- **Impact:** Contributor workflows do not match documented behavior; onboarding friction and false expectations.

### B-002 — Documented clipboard export does not match implementation
- **Status:** Fixed
- **Root Cause:** Documentation states clipboard export, but implementation performs file download export.
- **Impact:** Operational confusion and incorrect runbook assumptions.

### B-003 — Undocumented active route and UI subsystem
- **Status:** Fixed
- **Root Cause:** The route surface includes an implemented comparison page that is absent from architecture and feature documentation.
- **Impact:** Incomplete architectural truth; hidden maintenance surface.

### B-004 — Undocumented preprocessing/detection pipeline surface
- **Status:** Fixed
- **Root Cause:** Large script set exists for image preprocessing, OCR, merge, and refinement, but only a subset is documented.
- **Impact:** High bus-factor risk and fragile reproducibility.

### B-005 — Publicly accessible editor route without environment gating
- **Status:** Fixed
- **Root Cause:** Contributor tooling route is unguarded and always available in the client router.
- **Impact:** Unauthorized or unintended production usage of operational tooling.

### B-006 — No URL-state payload guardrail
- **Status:** Fixed
- **Root Cause:** Share-state serialization does not enforce a maximum payload size or fallback strategy.
- **Impact:** Oversized URLs, share failures, and browser interoperability issues.

### B-007 — Missing automated validation/test script in command surface
- **Status:** Fixed
- **Root Cause:** Command surface exposes lint/build but no test or schema-validation script.
- **Impact:** Regression risk and weak quality gates.

### B-008 — Destructive scripts can overwrite source artifacts in place
- **Status:** Fixed
- **Root Cause:** Certain image scripts write directly to source asset directories without mandatory safeguards.
- **Impact:** Irreversible data corruption risk in local/CI runs.

### B-009 — Monolithic page-level components with mixed responsibilities
- **Status:** Fixed
- **Root Cause:** Large UI modules combine state orchestration, interaction logic, and presentation in single files.
- **Impact:** Reduced maintainability and elevated regression risk.
