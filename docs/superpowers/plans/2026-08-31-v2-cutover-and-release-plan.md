# V2 Cutover and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make official moving-weighted-average cost fail-closed and consistent across Marlin Nexus consumers, then verify security and release gates without writing to CPM.

**Architecture:** Pure movement normalization and WAC calculation remain in `shared/financialCostModel.mjs`. A server-side inventory movement adapter supplies verified source evidence to `finalInvoiceLedger`; selector-based purchase evidence remains audit-only. Consumers use canonical `financeV2` fields, while missing source evidence remains review-only.

**Tech Stack:** JavaScript ESM, Node test runner, Express, React, Vite, MSSQL read-only CPM.

**Spec:** `docs/superpowers/specs/2026-08-29-resmi-hareketli-ortalama-maliyet-tasarimi.md`

## Global Constraints

- CPM remains SELECT-only; no writes, DDL, procedures, migrations, or TLS bypass.
- Missing opening, movement, currency, price, or rate evidence is `review` and excluded from official profit/pool.
- Preserve 91→85 consolidation, historical ownership, cross-depot attribution, and SSP-00979 exclusion.
- Keep historical currencies separate; EUR is a reporting equivalent using the approved Halkbank buying-rate set.
- Do not package secrets, cookies, tarballs, or unrelated temporary artifacts.
- Do not deploy until authenticated health, readOnly, build-info, readiness, prewarm, test, build, and visual gates pass.

---

### Task 1: Harden the pure WAC engine

**Files:**
- Modify: `shared/financialCostModel.mjs`
- Test: `server/financialCostModel.test.mjs`

- [x] Add failing tests for per-product isolation, missing opening cost, same-day ordering, partial sales return, purchase return, and negative-stock review.
- [x] Run focused tests and confirm failure.
- [x] Implement `Map<productCode, ProductCostState>`, explicit positive opening evidence, deterministic `date + sourceSequence + id` ordering, bounded proportional returns, and purchase-return review behavior.
- [x] Run focused tests and confirm pass.

### Task 2: Add a fail-closed movement source boundary

**Files:**
- Create: `server/inventoryMovementSource.mjs`
- Test: `server/inventoryMovementSource.test.mjs`
- Modify: `analysis/cpm-v2-source-contract.md`

- [x] Define validated input/output contracts for opening and historical movements.
- [x] Return `source-contract-missing` unless the source is explicitly verified.
- [x] Add simulated CPM recordset integration tests without adding write-capable SQL.

### Task 3: Wire official WAC into the final ledger

**Files:**
- Modify: `server/finalInvoiceLedger.mjs`
- Test: `server/finalInvoiceLedger.test.mjs`

- [x] Add `inventoryMovements` and `inventorySource` inputs.
- [x] Map WAC results to stable economic-line identities.
- [x] Set canonical `financeV2` status/method/review fields.
- [x] Move purchase-selector output under `auditComparison` only.
- [x] Add future-purchase, return, 91→85, and missing-source regressions.

> **Checkpoint:** Production `loadFinalInvoiceLedger` does not yet supply a verified historical movement source. The official path is therefore opt-in and fail-closed; production cutover remains blocked until the CPM source contract is verified.

### Task 4: Remove official legacy cost fallbacks

**Files:**
- Modify: `server/ledgerApi.mjs`, `server/departmentAnalysis.mjs`, `src/App.jsx`, `src/SalesPage.jsx`, `src/SummaryPage.jsx`, `src/DepartmentAnalysisPage.jsx`, `src/ReportsPage.jsx`, `src/SettingsPage.jsx`
- Test: relevant server/UI contract tests

- [ ] Make official totals consume only covered canonical `financeV2` values.
- [ ] Keep review totals explicit and separate.
- [ ] Remove all old selector-language from secondary reports and legacy fallbacks; primary overview wording is updated.
- [ ] Preserve demo mode as visibly non-production.

### Task 5: Dedicated stock research and audit visibility

**Files:**
- Create: `src/inventoryResearch.js`
- Modify: `server/ledgerApi.mjs`, `src/InventoryResearchPage.jsx`, `src/AuditPage.jsx`, `src/styles.css`
- Test: movement/API/UI contract tests

- [x] Expose a read-only `/api/inventory-research` contract.
- [ ] Keep `VW_STOKDURUM` current-stock context only.
- [x] Make audit cost/profit/validation visible at 1024px and provide compact 390px layout.

### Task 6: Authenticated release gate

**Files:**
- Modify: `server/index.mjs`, auth boundary modules, `compose.yaml`
- Create/modify: `infra/Caddyfile`, readiness/build-info checks

- [x] Enforce authenticated, capability-checked API access and CSRF protection for mutations when `NEXUS_AUTH_REQUIRED=true` or `NODE_ENV=production`.
- [x] Add build-info/readiness endpoints and environment-driven SQL TLS settings.
- [ ] Validate compose mounts and trusted HTTPS without bypassing certificate errors (Docker is not installed on this workstation; run this gate on the deployment host).

### Task 7: Verification and controlled deployment

- [x] Run focused integration tests, full `npm test`, `npm run build`, `git diff --check`.
- [x] Review diff scope and exclude secrets/cookies/tarballs from release scope.
- [ ] Run authenticated health/readOnly/build-info/readiness/prewarm checks against a verified CPM source (auth/session and CSRF smoke checks pass locally; live CPM credential is write-capable, so deployment is blocked).
- [x] Run desktop visual/navigation and interactive control checks; 1024px/390px CSS gate covered by responsive audit contract.
- [ ] Deploy only after all gates pass and report exact evidence.
