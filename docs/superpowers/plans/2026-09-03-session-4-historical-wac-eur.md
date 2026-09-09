# Session 4 Historical WAC/EUR Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure one date-bounded, product/depot/currency-aware canonical WAC/EUR model feeds every financial projection, while incomplete source evidence keeps official cost, margin, and pool eligibility fail-closed.

**Architecture:** Preserve the existing pure movement/WAC engine and shared canonical metric contract. Server-side extraction and evidence adapters remain separate from calculation; canonical ledger rows are the only source for Overview, Sales, Department, Reports, and audit projections. Historical prices and same-day/previous-business-day exchange rates are selected by transaction date, and legacy purchase estimates remain audit-only.

**Tech Stack:** React + JavaScript/ESM, Node test runner, Express, SQL Server via `mssql`, Vite.

**Spec:** User request in the current conversation: official historical WAC/EUR model completion and Session 4 evidence report.

## Global Constraints

- CPM receives only parameterized SELECT/API/export reads; Nexus never writes to CPM.
- Moving weighted average is date-bounded and keyed by product, depot, and currency.
- Future purchases never affect earlier sales; returns reverse the original sale-date cost basis.
- FYTKRT/MIRFYTKRT or another verified historical price source is selected by invoice date; current/legacy price snapshots are audit-only.
- EUR is calculated with a verified invoice-date selling rate; missing rate, price, opening, movement, or return evidence makes official EUR cost/margin unavailable.
- Legacy cost fields remain visible only as audit evidence and cannot enter official KPI, ranking, profit, or pool totals.
- Review and unlinked rows remain observable but are not ranked as certain profit.
- Fresh verification evidence is required before `SESSION_4_COMPLETE`; otherwise report `SESSION_4_BLOCKED` with exact gaps.

---

### Task 1: Establish the canonical WAC evidence contract

**Files:**
- Inspect/modify: `shared/financialCostModel.mjs`, `shared/historicalFinancialEvidence.mjs`, `shared/historicalPrice.mjs`, `shared/eurReporting.mjs`
- Inspect/modify: `server/inventoryMovementSource.mjs`, `server/cpmRateSource.mjs`, `server/finalInvoiceLedger.mjs`
- Test: `server/financialCostModel.test.mjs`, `server/inventoryMovementSource.test.mjs`, `server/cpmRateSource.test.mjs`, `shared/historicalFinancialEvidence.test.mjs`, `shared/historicalPrice.test.mjs`

**Interfaces:**
- Consumes normalized opening, purchase, sale, return, historical-price, and exchange-rate candidates.
- Produces canonical `financeV2` fields, date-bounded WAC movement costs, EUR evidence/status, and audit-only legacy fields.

- [x] Read the existing engine and write RED regressions for weighted-average chronology, future-purchase rejection, product/depot/currency isolation, original-cost return reversal, and zero-denominator/null margin behavior.
- [x] Run the focused financial tests and record the expected RED failure before changing production code.
- [x] Implement only the smallest pure-function or adapter changes needed to satisfy the tests; preserve source evidence and fail closed on missing or ambiguous rows.
- [x] Run the focused tests GREEN and inspect the output for warnings or accidental official promotion.

### Task 2: Align all canonical projections and currency consumers

**Files:**
- Inspect/modify: `server/ledgerApi.mjs`, `server/departmentAnalysis.mjs`, `server/ledgerService.mjs`
- Inspect/modify: `shared/financialMetric.mjs`
- Inspect/modify: `src/App.jsx`, `src/SummaryPage.jsx`, `src/SalesPage.jsx`, `src/DepartmentAnalysisPage.jsx`, `src/ReportsPage.jsx`, `src/AuditPage.jsx`, `src/InventoryResearchPage.jsx`
- Test: `server/task2FinancialConsumers.test.mjs`, `server/departmentEurContract.test.mjs`, `server/uiContract.test.mjs`, plus a new focused regression file only if an existing contract file cannot express the behavior

**Interfaces:**
- Consumes server-projected canonical metrics and rate-set metadata.
- Produces identical canonical EUR fields/status/evidence semantics on Overview, Sales, Department, Reports, audit rows, and modal/detail views.

- [x] Write RED wiring tests that exercise runtime projections, not source-string presence: selected period/rate set, incomplete EUR, null margin, review bucket visibility, and legacy-field isolation.
- [x] Run the focused consumer suite and confirm the failures identify an actual bypass.
- [x] Remove only client-side financial reductions, `|| 0` fallbacks, legacy-cost KPI paths, and unguarded modal fields that violate the canonical contract.
- [x] Run focused consumer tests GREEN and verify every affected page still preserves review/excluded evidence visibly.

### Task 3: Add coverage and official-eligibility diagnostics

**Files:**
- Inspect/modify: `server/inventoryResearchApi.mjs`, `server/inventoryOpeningResearch.mjs`, `server/releaseReadiness.mjs`, `server/index.mjs`
- Inspect/modify: `server/sourceProvenance.mjs`, `server/openingEvidenceMatcher.mjs`
- Test: `server/inventoryResearchApi.test.mjs`, `server/inventoryOpeningResearch.test.mjs`, `server/openingEvidenceMatcher.test.mjs`, `server/releaseReadiness.test.mjs`, `server/sourceProvenance.test.mjs`

**Interfaces:**
- Consumes candidate source rows and canonical ledger identities.
- Produces separate exact-value proof, broad source coverage, opening/depot lineage, historical-price coverage, historical-rate coverage, return linkage, and official eligibility counts.

- [x] Add RED cases for missing price, missing rate, missing opening, ambiguous opening, partial coverage, unlinked return, null margin, zero denominator, and candidate-only evidence.
- [x] Implement explicit counters/reasons without treating sample counts or invoice rows as official WAC proof.
- [x] Keep readiness and official KPI gates blocked unless every hard evidence condition passes; retain legacy/audit rows separately.
- [x] Run focused diagnostics tests and verify the payload exposes exact blockers and no invented EUR values.

### Task 4: Full verification and Session 4 progress record

**Files:**
- Modify: `.superpowers/sdd/2026-09-01-nexus-remediation/progress.md`
- Create/modify: `.superpowers/sdd/2026-09-01-nexus-remediation/session-4-report.md`

- [x] Run targeted RED/GREEN suites, then `npm test`, `npm run build`, and `git diff --check`.
- [x] Review the diff and changed-file list; preserve unrelated dirty worktree changes.
- [ ] If live verification is authorized and available, use authenticated read-only health/readiness/reconciliation and report exact coverage; otherwise do not claim live closure.
- [x] Write coverage and official-eligibility tables, WAC/EUR calculation evidence, changed files, and test/build outcomes.
- [x] Emit `SESSION_4_COMPLETE` only if all hard evidence conditions are verified; otherwise emit `SESSION_4_BLOCKED` and list the external evidence required.

---

## Self-review checklist

- [x] No future purchase or current price snapshot is used for an earlier transaction.
- [x] Product, depot, and currency remain separate in every WAC key and projection.
- [x] Returns inherit the original sale-date cost, never a current WAC.
- [x] Missing evidence yields null official cost/profit/margin and remains visible in review coverage.
- [x] Overview, Sales, Department, Reports, and modal/detail projections consume the same canonical fields.
- [x] Legacy cost appears only in audit comparison fields.
- [x] Review/unlinked rows are not included in certain-profit rankings.
- [x] CPM remains read-only and no credentials are written into reports or memory.
