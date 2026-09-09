# WAC Opening Evidence Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify CPM opening stock quantity and cost evidence at product-depot-date grain, preserve explicit quarantine classes, and keep official WAC fail-closed.

**Architecture:** Extend the existing candidate-only inventory research boundary with explicit field provenance, natural-key reconciliation, cost-conflict detection, and movement-impact diagnostics. The SQL layer remains parameterized read-only; the pure analysis layer produces evidence and quarantine metadata; the API/report layer exposes bounded samples plus full-query summaries without converting candidate evidence into official WAC.

**Tech Stack:** Node.js ESM, `node:test`, Express, `mssql`, SQL Server, Markdown evidence reports.

**Spec:** `docs/superpowers/specs/2026-08-29-resmi-hareketli-ortalama-maliyet-tasarimi.md` and the user request for Session 3 CPM opening evidence verification.

## Global Constraints

- CPM remains strictly read-only; only parameterized `SELECT`/metadata reads and connection-scoped read transactions are allowed.
- Missing cost is never interpreted as zero cost.
- Product, depot, date, document, line, quantity, currency, and cost remain separate evidence fields; no cross-depot or cross-product matching is allowed.
- Snapshot values are not used to invent historical cost or opening lineage.
- Candidate/audit evidence cannot open the official WAC, cost, profit, pool, or readiness gate.
- Samples are bounded and labeled; population summaries must be distinguished from sample diagnostics.
- Negative quantities, multi-depot products, missing cost/currency, and ambiguous lineage remain quarantined.

### Task 1: Define the evidence contract and failing cases

**Files:**
- Modify: `server/openingEvidenceMatcher.test.mjs`
- Modify: `server/inventoryOpeningResearch.test.mjs`
- Modify: `server/inventoryOpeningResearchSql.test.mjs`
- Modify: `server/inventoryMovementSource.test.mjs`

**Interfaces:**
- Consumes: current normalized STKSYM/STKHAR rows and movement candidate rows.
- Produces: test cases for exact product-depot-date-document-line matches, quantity-only matches, quantity-match/cost-conflict matches, missing-cost quarantine, multi-depot quarantine, negative stock quarantine, and purchase/sale/return impact metadata.

- [x] **Step 1: Write failing tests** for a separate `cost-conflict` classification and for preservation of `null` cost/currency instead of zero defaults.
- [x] **Step 2: Run focused tests** with `node --test server/openingEvidenceMatcher.test.mjs server/inventoryOpeningResearch.test.mjs server/inventoryMovementSource.test.mjs`; the new assertions initially failed, then passed after implementation.
- [x] **Step 3: Add SQL-contract assertions** for explicit opening field aliases, currency, unit cost, and source document identity; `VW_STOKDURUM` semantics are recorded from live metadata because it has no opening-cost fields.
- [x] **Step 4: Run the SQL contract test** and verify the read-only query contract is green.

### Task 2: Implement pure opening reconciliation and quarantine logic

**Files:**
- Modify: `server/openingEvidenceMatcher.mjs`
- Modify: `server/inventoryOpeningResearch.mjs`
- Modify: `server/inventoryMovementSource.mjs`

**Interfaces:**
- Consumes: normalized CPM rows with product, depot, date, document, line, quantity, currency, unit cost, gross amount, discount, direction, and source-document fields.
- Produces: candidate-only diagnostics with `exact-key`, `quantity-only`, `cost-conflict`, `missing-cost-evidence`, `document-date-depot-conflict`, and `unmatched` classes; explicit quarantine counts/reasons; movement impact summaries keyed by product+depot.

- [x] **Step 1: Implement the smallest matcher change** so quantity equality with a complete natural key but unequal non-null costs becomes `cost-conflict`, never `exact-key`.
- [x] **Step 2: Implement null-preserving cost/currency normalization** and quarantine reasons for negative quantity, absent depot, absent date, absent product, absent currency, and absent/invalid cost.
- [x] **Step 3: Implement movement impact classification** for purchase, sale, sale return, and purchase return; return linkage must remain explicit and unresolved returns stay quarantined.
- [x] **Step 4: Run focused tests** and verify the new classes and quarantine behavior are green.

### Task 3: Extend only the read-only SQL evidence boundary

**Files:**
- Modify: `server/inventoryOpeningResearchSql.mjs`
- Modify: `server/index.mjs`
- Modify: `server/cpmReadOnly.test.mjs`
- Modify: `server/inventoryOpeningResearchSql.test.mjs`

**Interfaces:**
- Consumes: existing `@company`, date, document-type, source-kind, and sample-limit parameters.
- Produces: read-only candidate queries for STKHAR opening/movement fields, STKSYM devir fields, `VW_STOKDURUM` current-stock semantics, and metadata/source-definition evidence; all query IDs remain guarded by the CPM read-only fingerprint/allowlist.

- [x] **Step 1: Add SQL aliases and metadata reads** for currency, cost components, direction, document/line identity, and view/module definitions without `EXEC`, DML, or unparameterized data filters.
- [x] **Step 2: Keep the existing serialized `withReadOnlyCpmTransaction` route** bounded; the live view-definition/negative-stock checks remain audit-only and are not promoted to WAC input.
- [x] **Step 3: Run SQL/read-only focused tests** and confirm the structural guard rejects no new query.

### Task 4: Run live CPM evidence collection and write the Session 3 report

**Files:**
- Create: `docs/audit/2026-09-03/session-3-opening-evidence.md`
- Modify: `docs/superpowers/plans/2026-09-01-nexus-remediation.md`

**Interfaces:**
- Consumes: authenticated candidate/live read-only CPM results, source metadata, population summaries, bounded row samples, and pure diagnostic output.
- Produces: opening evidence scope table; product/depot unmatched/conflict/quarantine list; movement-impact evidence; official-vs-candidate source readiness decision; `SESSION_3_BLOCKED` or `SESSION_3_COMPLETE`.

- [x] **Step 1: Verify live connection identity** (`Marlin_Uyg`, authenticated session, `readOnly=true`) and record query scope/timestamps.
- [x] **Step 2: Collect STKHAR, STKSYM, `VW_STOKDURUM`, and relevant source metadata** using only `SELECT`/read transaction calls.
- [x] **Step 3: Reconcile at product+depot+date+document+line grain**, separately report quantity-only versus cost-conflict rows, and quarantine all required risk classes.
- [x] **Step 4: Validate purchase, sale, sales-return, and purchase-return impact without executing procedures or mutating CPM.**
- [x] **Step 5: Write the evidence report and append a dated progress checkpoint; preserve blockers and set the session status based on current evidence only.**

### Verification checklist

- [x] Focused opening/movement/SQL tests pass.
- [x] Full `npm test` passes: **483/483**.
- [x] `npm run build` passes: **6.775 modules**.
- [x] `git diff --check` passes.
- [x] Live evidence report explicitly states query scope, source grain, quarantine counts, and whether the source is official or candidate.
- [x] CPM and production mutation/cutover are absent from the execution log.
