# Marlin Nexus Unified Final Invoice Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one cached, traceable final-invoice ledger that drives all economic totals, department ownership, monthly targets, distribution eligibility, and monthly approvals in Marlin Nexus.

**Architecture:** A read-only CPM repository loads final sales/purchase evidence and full sales-process lineage into a normalized yearly ledger. Pure domain modules resolve ownership, target bands, and department-only distributions; API routes and React pages consume those shared results instead of recalculating competing totals.

**Tech Stack:** Node.js 22, Express 5, `mssql`, React 19, Vite 6, Recharts 3, Node test runner, Docker Compose.

## Global Constraints

- CPM remains strictly read-only; every CPM database operation must be `SELECT`-only.
- Economic sales use type `17`, type `85`, and standalone type `91`; type `91` converted to `17/85` is trace-only and must not be double counted.
- Type `18` returns reduce final sales; linked returns inherit original invoice cost and ownership evidence.
- Economic purchase evidence uses active type `9/609` invoices and their invoice amounts and discounts; EFAGLN return evidence remains excluded.
- Offer, order, approval, dispatch, retail history, EVRBAS, MIREVRBAS, and EVRONY may determine ownership but may not add economic value.
- CPM macro ownership is strongest; Bircan, system users, customer-card-like codes, and stale employee fields cannot become commercial owners.
- `OGENCOGLU` is invalid after `2024-06-30`; `TSEMIZ/TSEMİZ` is Servis through `2026-05-25` and Yedek Parca Satis from `2026-05-26`.
- Department targets are monthly and person targets do not exist.
- Target below means no distribution; target met means conservative rate; target multiplied by one plus the configurable stretch percentage means growth rate.
- Existing live conservative rate `3%`, growth rate `8%`, risk reserve, pilot cost rates, employees, and manual cost decisions must survive migration.
- Approvals are management-only, stored in Nexus, separated by year and month, and include a result snapshot.
- `SSP-00979` and descendants never contribute to analytics.
- All user-facing staff labels show full name first and CPM code second.
- The `Katki & Performans` page is removed, but its document-chain capability may remain as an internal ownership dependency.

---

### Task 1: Final-Invoice Economic Selection

**Files:**
- Create: `server/finalInvoiceLedger.mjs`
- Create: `server/finalInvoiceLedger.test.mjs`
- Modify: `server/index.mjs`

**Interfaces:**
- Consumes: raw CPM economic rows and source-link fields returned by `finalInvoiceLedgerSql`.
- Produces: `buildFinalInvoiceLedger({ economics, lineage, actorEvents, pilotOrders, ...rules }) -> { rows, totals, quality, pilotOrders }`.
- Produces: `isTerminalEconomicRow(row, downstreamRows) -> boolean` for `17/85/91/18` terminal selection.

- [ ] **Step 1: Write failing terminal-selection tests**

```js
test("excludes provisional documents from economic rows", () => {
  const result = buildFinalInvoiceLedger({ economics: [sale(13), sale(14), sale(17)] });
  assert.deepEqual(result.rows.map((row) => row.documentType), [17]);
});

test("counts standalone retail type 91 once", () => {
  const result = buildFinalInvoiceLedger({ economics: [sale(91, "P-1")] });
  assert.equal(result.totals.netSales, 100);
});

test("keeps converted retail as trace and counts final invoice only", () => {
  const retail = sale(91, "P-1");
  const invoice = sale(85, "F-1", { sourceDocumentType: 91, sourceDocumentNo: "P-1" });
  const result = buildFinalInvoiceLedger({ economics: [retail, invoice] });
  assert.deepEqual(result.rows.map((row) => row.documentNo), ["F-1"]);
  assert.equal(result.totals.netSales, 100);
});

test("linked return reduces sales and references original invoice", () => {
  const invoice = sale(17, "F-1");
  const returned = sale(18, "I-1", { isSale: false, sourceDocumentType: 17, sourceDocumentNo: "F-1" });
  const result = buildFinalInvoiceLedger({ economics: [invoice, returned] });
  assert.equal(result.totals.netSales, 0);
  assert.equal(result.rows[1].originalInvoiceNo, "F-1");
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test server/finalInvoiceLedger.test.mjs`

Expected: FAIL because `server/finalInvoiceLedger.mjs` and exported functions do not exist.

- [ ] **Step 3: Implement minimal terminal-selection policy**

```js
export const FINAL_SALE_TYPES = new Set([17, 85, 91]);
export const FINAL_RETURN_TYPES = new Set([18]);

export function isTerminalEconomicRow(row, downstreamRows = []) {
  const type = Number(row.documentType);
  if (FINAL_RETURN_TYPES.has(type) || type === 17 || type === 85) return true;
  if (type !== 91) return false;
  return !downstreamRows.some((candidate) =>
    [17, 85].includes(Number(candidate.documentType))
    && Number(candidate.sourceDocumentType) === 91
    && String(candidate.sourceDocumentNo) === String(row.documentNo));
}
```

Build document-level descendant indexes before filtering so a type `91` converted through an intermediate `15/64` path is still excluded when its connected component contains a later `17/85`.

- [ ] **Step 4: Replace provisional economic CTEs with final-only SQL**

`finalInvoiceLedgerSql` must return four recordsets:

1. Active `17/85/91/18` candidate economics and selected `9/609` purchase evidence.
2. Recursive source lineage across types `13,14,15,17,18,64,85,91`.
3. MIREVRBAS/EVRONY actor events for lineage documents.
4. Type `14` CPM macro pilot orders.

The SQL must keep invoice fields separately: `grossAmount`, `discountAmount`, `netAmount`, `vatAmount`, and `invoiceTotalInclVat`.

- [ ] **Step 5: Run focused and existing tests**

Run: `node --test server/finalInvoiceLedger.test.mjs server/departmentAnalysis.test.mjs server/salesCases.test.mjs`

Expected: PASS with zero failures.

- [ ] **Step 6: Commit**

```powershell
git add server/finalInvoiceLedger.mjs server/finalInvoiceLedger.test.mjs server/index.mjs
git commit -m "feat: add final invoice economic ledger"
```

### Task 2: Purchase-Invoice Cost Evidence

**Files:**
- Modify: `server/finalInvoiceLedger.mjs`
- Modify: `server/finalInvoiceLedger.test.mjs`
- Modify: `server/index.mjs`

**Interfaces:**
- Consumes: final invoice rows and active type `9/609` purchase candidates.
- Produces: `selectPurchaseEvidence({ sale, purchases, returnDocuments, salesConsumption })` with `costMethod`, invoice evidence, and `unitCost`.

- [ ] **Step 1: Write failing cost-evidence tests**

```js
test("uses invoice net amount after discount for unit cost", () => {
  const result = selectPurchaseEvidence({
    sale: sale(17, "F-1", { productCode: "P", quantity: 2, documentDate: "2026-07-01" }),
    purchases: [purchase(9, "A-1", { productCode: "P", quantity: 10, grossAmount: 1000, discountAmount: 200 })],
  });
  assert.equal(result.unitCost, 80);
});

test("rejects purchase invoice marked as incoming return", () => {
  const result = selectPurchaseEvidence({
    sale: sale(17, "F-1", { productCode: "P" }),
    purchases: [purchase(9, "IADE-1", { productCode: "P" })],
    returnDocuments: new Set(["IADE-1"]),
  });
  assert.equal(result.costMethod, "missingPurchase");
});

test("prefers qualifying bulk purchase with remaining stock", () => {
  const result = selectPurchaseEvidence({ sale: sale(17, "F-1", { productCode: "P", quantity: 2 }), purchases: [bulkPurchase(), ordinaryPurchase()] });
  assert.equal(result.costMethod, "bulkPurchase");
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test --test-name-pattern="purchase|cost|bulk" server/finalInvoiceLedger.test.mjs`

Expected: FAIL because the new selector is absent.

- [ ] **Step 3: Implement exact purchase precedence**

```js
const eligible = purchases.filter((row) =>
  [9, 609].includes(Number(row.documentType))
  && row.active
  && Number(row.quantity) > 0
  && !returnDocuments.has(String(row.documentNo)));
const bulk = eligible.filter(isQualifyingBulkPurchase).sort(latestFirst)[0];
const prior = eligible.filter((row) => date(row) <= date(sale)).sort(latestFirst)[0];
const next = eligible.filter((row) => date(row) > date(sale)).sort(earliestFirst)[0];
return normalizePurchaseEvidence(bulk || prior || next || null);
```

`isQualifyingBulkPurchase` must require: purchase date within one year before sale, document line count at least `10`, effective discount at least `15`, and remaining quantity at least sale quantity.

- [ ] **Step 4: Keep SQL and JavaScript evidence fields identical**

Ensure `purchaseType`, `purchaseNo`, `purchaseDate`, `purchaseAccountCode`, `purchasePartyName`, `purchaseGrossAmount`, `purchaseDiscountAmount`, `purchaseNetAmount`, `purchaseVatAmount`, `purchaseEffectiveDiscountPct`, and `costValidationReason` survive normalization.

- [ ] **Step 5: Run tests**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add server/finalInvoiceLedger.mjs server/finalInvoiceLedger.test.mjs server/index.mjs
git commit -m "feat: restrict costs to final purchase invoices"
```

### Task 3: Full-Chain Commercial Ownership

**Files:**
- Create: `server/ownershipResolver.mjs`
- Create: `server/ownershipResolver.test.mjs`
- Modify: `server/finalInvoiceLedger.mjs`
- Modify: `server/departmentAnalysis.mjs`
- Modify: `server/departmentAnalysis.test.mjs`

**Interfaces:**
- Consumes: terminal invoice, recursive lineage, actor events, CPM macro fields, and Nexus identity map.
- Produces: `resolveCommercialOwnership({ economic, lineage, actorEvents, identities }) -> { department, ownerCode, ownerName, method, confidence, evidence }`.

- [ ] **Step 1: Write failing ownership tests**

```js
test("macro source order beats central-depot invoice user", () => {
  const result = resolveCommercialOwnership(caseEvidence({ macroOwner: "FURKAN", invoiceEntry: "CBELİKIRIK", depot: "MRK" }));
  assert.equal(result.ownerCode, "FURKAN");
  assert.equal(result.department, "service");
  assert.equal(result.method, "macro-source-order");
});

test("ignores Bircan as terminal invoice modifier", () => {
  const result = resolveCommercialOwnership(caseEvidence({ sourceEntry: "MKARA", invoiceModifier: "BIRCAN" }));
  assert.equal(result.ownerCode, "MKARA");
});

test("rejects stale OGENCOGLU template field after June 2024", () => {
  const result = resolveCommercialOwnership(caseEvidence({ date: "2026-06-09", sourceSeller: "OGENCOGLU", sourceEntry: "FURKAN" }));
  assert.equal(result.ownerCode, "FURKAN");
  assert.equal(result.ownerName, "Furkan Çakır");
});

test("uses retail history actor when standalone type 91 is final", () => {
  const result = resolveCommercialOwnership(caseEvidence({ type: 91, retailEntry: "BCETINEL" }));
  assert.equal(result.department, "service");
});

test("uses historical Tuğrul department by action date", () => {
  assert.equal(resolveCommercialOwnership(caseEvidence({ date: "2026-05-25", sourceEntry: "TSEMİZ" })).department, "service");
  assert.equal(resolveCommercialOwnership(caseEvidence({ date: "2026-05-26", sourceEntry: "TSEMİZ" })).department, "parts");
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test server/ownershipResolver.test.mjs`

Expected: FAIL because the resolver is absent.

- [ ] **Step 3: Implement identity validity and evidence ranking**

```js
const NON_COMMERCIAL = new Set(["BIRCAN", "SYSTEM", "ADMIN", "SA"]);

function validIdentity(code, eventDate, identities) {
  const identity = identities[normalizeCode(code)];
  if (!identity || NON_COMMERCIAL.has(normalizeCode(code)) || /\d/.test(normalizeCode(code))) return null;
  if (identity.from && eventDate < identity.from) return null;
  if (identity.until && eventDate > identity.until) return null;
  return assignmentAt(identity, eventDate);
}
```

Rank evidence in this exact order: macro source owner/department, valid source `SATICINO` supported by a real event, earliest upstream history entry/change, same-department actor consensus, B2B same-customer/product candidate, low-confidence department fallback. Terminal invoice modifiers and depot never override stronger evidence.

- [ ] **Step 4: Add full-name identity registry and unknown-name behavior**

Seed known mappings for Furkan Cakir, Burak Cetinel, Mehmet Kara, Tugrul Semiz, Ozlenen Gencoglu, Alperen Erimli, Bircan Colak, Can Belikirik, and Emre Erdogan. Resolve additional full names from a verified CPM user table if schema discovery finds one; otherwise expose `Tanimsiz kullanici (KOD)` and a Nexus identity-map setting.

- [ ] **Step 5: Integrate resolver into final ledger and preserve evidence detail**

Each ledger row must include `commercialOwner`, `commercialOwnerName`, `department`, `attributionMethod`, `attributionConfidence`, `sourceOrderNo`, `evidenceDocuments`, `actorEvents`, `fulfillmentDepotCode`, and `crossDepot`.

- [ ] **Step 6: Run tests**

Run: `npm test`

Expected: all tests PASS; existing macro, Bircan, customer-code, and historical-user tests remain green.

- [ ] **Step 7: Commit**

```powershell
git add server/ownershipResolver.mjs server/ownershipResolver.test.mjs server/finalInvoiceLedger.mjs server/departmentAnalysis.mjs server/departmentAnalysis.test.mjs
git commit -m "feat: resolve ownership from full document chains"
```

### Task 4: Single-Flight Ledger Cache and Unified APIs

**Files:**
- Create: `server/ledgerService.mjs`
- Create: `server/ledgerService.test.mjs`
- Modify: `server/index.mjs`
- Modify: `server/departmentAnalysis.mjs`

**Interfaces:**
- Consumes: `loadFinalInvoiceLedger(year)` database loader.
- Produces: `createLedgerService({ loadYear, ttlMs, maxStaleMs, now })` with `get(year, { refresh })`, `prewarm(years)`, and `invalidate(year)`.
- Produces: unified `/api/overview`, `/api/department-analysis`, and `/api/audit-ledger` responses from the same ledger version.

- [ ] **Step 1: Write failing cache tests**

```js
test("coalesces concurrent loads for the same year", async () => {
  let calls = 0;
  const service = createLedgerService({ loadYear: async () => { calls += 1; return ledger(); } });
  await Promise.all([service.get(2026), service.get(2026), service.get(2026)]);
  assert.equal(calls, 1);
});

test("returns stale value while one background refresh runs", async () => {
  const clock = fakeClock();
  const service = createLedgerService({ loadYear, ttlMs: 1000, maxStaleMs: 86400000, now: clock.now });
  await service.get(2026);
  clock.advance(1500);
  const result = await service.get(2026);
  assert.equal(result.cache.status, "stale-refreshing");
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test server/ledgerService.test.mjs`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement cache state**

Use a map keyed by year containing `{ value, loadedAt, promise, error }`. A refresh must never clear the last successful value before a replacement succeeds. Default TTL is 15 minutes; maximum stale age is 24 hours.

- [ ] **Step 4: Derive all API totals from cached ledger rows**

`/api/overview` groups the ledger by month. `/api/department-analysis` groups the same rows by department/month/owner/product/customer/depot. `/api/audit-ledger` filters and paginates the same rows in memory. Every response returns `ledgerVersion`, `generatedAt`, `cacheStatus`, and `readOnly: true`.

- [ ] **Step 5: Prewarm current and previous year safely**

After `app.listen`, call `ledgerService.prewarm([currentYear, currentYear - 1])` without blocking startup. Log duration and row count; catch and log full errors while retaining service availability.

- [ ] **Step 6: Run tests and benchmark local fixture**

Run: `npm test`

Run: `node analysis/benchmark-ledger-cache.mjs`

Expected: one loader call for repeated same-year reads; warm aggregate calls complete below 100 ms on fixture data.

- [ ] **Step 7: Commit**

```powershell
git add server/ledgerService.mjs server/ledgerService.test.mjs server/index.mjs server/departmentAnalysis.mjs analysis/benchmark-ledger-cache.mjs
git commit -m "perf: unify APIs behind cached invoice ledger"
```

### Task 5: Department Target and Distribution Policy

**Files:**
- Create: `shared/targetPolicy.mjs`
- Create: `server/targetPolicy.test.mjs`
- Modify: `src/distribution.js`
- Create: `server/distribution.test.mjs`
- Modify: `server/index.mjs`

**Interfaces:**
- Produces: `buildDepartmentTargets({ currentRows, previousRows, settings })`.
- Produces: `calculateDepartmentDistribution({ targetRows, employees, settings })`.
- Produces: `/api/department-targets?year=YYYY`.

- [ ] **Step 1: Write failing target-band tests**

```js
test("below target produces no distribution", () => {
  assert.equal(classifyTargetBand({ actual: 999, target: 1000, stretchPct: 5 }).band, "none");
});

test("target met uses conservative rate", () => {
  assert.equal(classifyTargetBand({ actual: 1000, target: 1000, stretchPct: 5 }).band, "conservative");
});

test("target times one plus stretch uses growth rate", () => {
  assert.equal(classifyTargetBand({ actual: 1050, target: 1000, stretchPct: 5 }).band, "growth");
});

test("monthly target uses prior-year same-month final net sales", () => {
  assert.equal(calculateTargetAmount(1_000_000, 10), 1_100_000);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test server/targetPolicy.test.mjs`

Expected: FAIL because target policy functions do not exist.

- [ ] **Step 3: Implement target and pool formulas**

```js
export function classifyTargetBand({ actual, target, stretchPct }) {
  const stretchTarget = target * (1 + stretchPct / 100);
  if (actual < target) return { band: "none", stretchTarget };
  if (actual < stretchTarget) return { band: "conservative", stretchTarget };
  return { band: "growth", stretchTarget };
}

export function monthlyDepartmentPool({ profit, uncoveredNetSales, band, settings }) {
  const rate = band === "growth" ? settings.rates.growth : band === "conservative" ? settings.rates.conservative : 0;
  const eligibleProfit = Math.max(0, Number(profit) - Number(uncoveredNetSales));
  return eligibleProfit * rate / 100 * (1 - settings.reserveRate / 100);
}
```

- [ ] **Step 4: Remove person target multipliers from distribution**

Group employees by department. Distribute only that department's eligible annual pool using equal or salary-coefficient weights. Keep fixed shares inside the employee's own department. Do not read company score, department score, minimum goal score, or maximum multiplier.

- [ ] **Step 5: Add distribution tests**

Assert that Servis staff cannot receive the Parts pool, a below-target month adds zero, departed/included-false staff receive zero, and coefficient/equal modes reconcile exactly to each department pool.

- [ ] **Step 6: Add target API and reconciliation fields**

Return prior amount, target, stretch target, actual, difference, achievement percentage, band, applied rate, profit, uncovered amount, reserve, and pool for all 12 months and both departments.

- [ ] **Step 7: Run tests**

Run: `npm test`

Expected: all tests PASS; sum of employee shares equals sum of department pools within one cent.

- [ ] **Step 8: Commit**

```powershell
git add shared/targetPolicy.mjs server/targetPolicy.test.mjs src/distribution.js server/distribution.test.mjs server/index.mjs
git commit -m "feat: add department monthly target bands"
```

### Task 6: Settings Migration and Goal UI

**Files:**
- Create: `shared/settingsPolicy.mjs`
- Create: `server/settingsPolicy.test.mjs`
- Modify: `src/SettingsPage.jsx`
- Modify: `src/GoalsPage.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Produces: `normalizeSettings(stored)` and `serializeSettings(settings)`.
- Consumes: `/api/department-targets` from Task 5.

- [ ] **Step 1: Write failing settings migration tests**

```js
test("removes legacy person target settings while preserving live rates", () => {
  const result = normalizeSettings({ rates: { conservative: 3, base: 5, growth: 8 }, individualWeight: 30, maximumMultiplier: 120 });
  assert.deepEqual(result.rates, { conservative: 3, growth: 8 });
  assert.equal("individualWeight" in result, false);
  assert.equal("maximumMultiplier" in result, false);
});

test("creates default department target settings", () => {
  const result = normalizeSettings({});
  assert.deepEqual(result.departmentTargets.service, { growthPct: 10, stretchPct: 5 });
  assert.deepEqual(result.departmentTargets.parts, { growthPct: 10, stretchPct: 5 });
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test server/settingsPolicy.test.mjs`

Expected: FAIL because the migration module is absent.

- [ ] **Step 3: Implement allow-list serialization**

`serializeSettings` must only persist supported keys: rates `{ conservative, growth }`, reserve, negative rule, distribution month, cost and pilot rates, coverage, exchange-rate rule, manual-cost approval, allocation method, department target settings, monthly close and approval controls, employee visibility, and identity map.

- [ ] **Step 4: Rebuild Settings target section**

Replace company/team weights and score controls with two department rows. Each row has a growth percentage and target-above stretch percentage. Keep conservative/growth rates and reserve in the same section. Remove person-target language from employee controls.

- [ ] **Step 5: Convert Goals page to read-only tracking**

Fetch `/api/department-targets?year=${year}`. Render department tabs and a 12-row table with prior year, target, stretch, actual, achievement, band, rate, and pool. Remove score inputs, save button, and employee score table.

- [ ] **Step 6: Remove manual scenario switching from App calculations**

The active pool comes from the automatic department target response. Summary, Havuz, Reports, and Approval receive the same `annualPool` and department pool breakdown.

- [ ] **Step 7: Run tests and build**

Run: `npm test`

Run: `npm run build`

Expected: both commands exit `0` with no warnings treated as errors.

- [ ] **Step 8: Commit**

```powershell
git add shared/settingsPolicy.mjs server/settingsPolicy.test.mjs src/SettingsPage.jsx src/GoalsPage.jsx src/App.jsx
git commit -m "feat: move department targets into settings"
```

### Task 7: Server-Side Monthly Approvals

**Files:**
- Create: `server/stateStore.mjs`
- Create: `server/stateStore.test.mjs`
- Modify: `server/index.mjs`
- Modify: `src/ApprovalPage.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Produces: `createStateStore(filePath)` with atomic `read`, `update`, and audit-event append.
- Produces: `GET /api/approvals?year=YYYY`, `PUT /api/approvals/:year/:month`, and `POST /api/approvals/:year/:month/reopen`.

- [ ] **Step 1: Write failing state and approval tests**

```js
test("stores approvals separately by year and month", async () => {
  const store = createStateStore(tempFile);
  await store.approve({ year: 2026, month: 1, snapshot: january });
  await store.approve({ year: 2026, month: 2, snapshot: february });
  assert.deepEqual(Object.keys((await store.read()).approvals[2026]), ["1", "2"]);
});

test("reopening preserves an audit event", async () => {
  await store.reopen({ year: 2026, month: 1, actor: "Yönetim" });
  const state = await store.read();
  assert.equal(state.approvals[2026][1], undefined);
  assert.equal(state.auditEvents.at(-1).action, "approval-reopened");
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test server/stateStore.test.mjs`

Expected: FAIL because the state store is absent.

- [ ] **Step 3: Implement atomic state updates**

Write a sibling `.tmp` file, flush complete JSON, then rename over the target. Preserve `settings`, `employees`, `costOverrides`, `approvals`, `auditEvents`, and `savedAt` on every update.

- [ ] **Step 4: Build approval snapshots server-side**

The PUT route ignores client-provided money totals. It reloads target/pool output for the requested month and writes ledger version, both department results, applied rates, coverage, pool, approver, timestamp, and snapshot hash.

- [ ] **Step 5: Migrate local approvals once**

On ApprovalPage load, if server approvals are empty and `marlin-management-approvals-${year}` exists, send each historical month to the server and mark `marlin-approval-migration-${year}=done` only after all writes succeed.

- [ ] **Step 6: Update monthly Approval UI**

Each month has its own selection, status, target-band details, approve button, and reopen action. Display stale-snapshot warning when the current ledger version/hash differs from the approved snapshot.

- [ ] **Step 7: Run tests and build**

Run: `npm test`

Run: `npm run build`

Expected: PASS and build exit `0`.

- [ ] **Step 8: Commit**

```powershell
git add server/stateStore.mjs server/stateStore.test.mjs server/index.mjs src/ApprovalPage.jsx src/App.jsx
git commit -m "feat: persist monthly management approvals"
```

### Task 8: Department/Audit UI Cleanup and Performance Page Removal

**Files:**
- Modify: `src/DepartmentAnalysisPage.jsx`
- Modify: `src/AuditPage.jsx`
- Modify: `src/App.jsx`
- Modify: `src/SettingsPage.jsx`
- Modify: `src/styles.css`
- Delete: `src/PerformancePage.jsx`

**Interfaces:**
- Consumes: ledger ownership evidence and paginated audit fields from Tasks 3-4.
- Produces: no new server interface.

- [ ] **Step 1: Add UI-focused structural tests**

Create `server/uiContract.test.mjs` that reads source files and asserts:

```js
assert.doesNotMatch(appSource, /page:\s*["']performance["']/);
assert.doesNotMatch(appSource, /Katkı\s*&amp;\s*Performans/);
assert.match(departmentSource, /Evrak zinciri/);
assert.match(auditSource, /Brüt kâr/);
assert.match(auditSource, /Maliyet doğrulama/);
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test server/uiContract.test.mjs`

Expected: FAIL while the performance route exists and ownership chain is absent from Department detail.

- [ ] **Step 3: Remove the Performance page and route**

Delete the import, navigation entry, route branch, default-page option, and component file. Preserve `/api/sales-cases` only if ownership code still consumes it internally.

- [ ] **Step 4: Expand Department ownership detail**

The expanded row shows final invoice, source order, retail document when present, ordered actor events, selected owner full name/code, excluded accounting modifier, attribution method/confidence, depot, and cost evidence. Unknown codes display `Tanimsiz kullanici (KOD)`.

- [ ] **Step 5: Fix Audit initial-column visibility**

Keep document, card, net sale, cost, gross profit, and validation in the initial viewport using fixed column widths and sticky validation/profit columns at desktop widths. Move supplier detail, VAT, discount breakdown, source links, and return rejection evidence into the expanded row.

- [ ] **Step 6: Run tests and build**

Run: `npm test`

Run: `npm run build`

Expected: PASS and build exit `0`.

- [ ] **Step 7: Commit**

```powershell
git add src/DepartmentAnalysisPage.jsx src/AuditPage.jsx src/App.jsx src/SettingsPage.jsx src/styles.css server/uiContract.test.mjs
git rm src/PerformancePage.jsx
git commit -m "refactor: focus UI on invoice and ownership analysis"
```

### Task 9: Reconciliation, Visual QA, and Production Deployment

**Files:**
- Create: `analysis/validate-final-invoice-ledger.mjs`
- Create: `analysis/benchmark-live-ledger.mjs`
- Modify: `analysis/VALIDATION.md`
- Create: `qa/final-ledger/` screenshots

**Interfaces:**
- Consumes: production-like read-only CPM connection and all final APIs.
- Produces: machine-readable 2024-2026 reconciliation report, latency report, screenshots, and rollback package.

- [ ] **Step 1: Write the reconciliation script before deployment**

The script must fail with a non-zero exit code unless, for each year:

```js
assertWithinCent(overview.netSales, departments.totalNetSales);
assertWithinCent(targets.actualNetSales, departments.confirmedPlusReviewNetSales);
assert.equal(ledger.provisionalEconomicRows, 0);
assert.equal(ledger.convertedRetailEconomicRows, 0);
assert.equal(owners.some((row) => row.code === "BIRCAN"), false);
assert.equal(owners.some((row) => row.code === "OGENCOGLU" && row.documentDate > "2024-06-30"), false);
```

- [ ] **Step 2: Run full local verification**

Run: `npm test`

Run: `npm run build`

Run: `node analysis/validate-final-invoice-ledger.mjs --base http://127.0.0.1:4317`

Expected: all commands exit `0`; reconciliation difference is at most `0.01 TL`.

- [ ] **Step 3: Start local server and run in-app browser QA**

Open Summary, Sales, Departments, Audit, Goals, Settings, and Approval at `1440x900`, `768x1024`, and `390x844`. Verify no horizontal page overflow, no overlapping controls, full-name labels, monthly target bands, monthly approval actions, and initial Audit cost/profit/validation visibility. Capture browser console; expected errors and warnings: `0`.

- [ ] **Step 4: Benchmark cold and warm reads**

Run five reads of overview, department, target, and audit endpoints. Record cold CPM time and warm Nexus time. Required warm p95: below `1000 ms`; target below `250 ms`.

- [ ] **Step 5: Build rollback artifacts and deploy**

Create a source archive, record SHA-256, create a rollback Docker image tag, preserve remote `data`, `secrets`, and `backups`, rebuild the container, and start it on the existing production port.

- [ ] **Step 6: Verify production using fresh commands**

Run health, 2024-2026 reconciliation, final-only checks, ownership checks, target-band boundary checks, approval read checks, and warm latency benchmark against `http://192.168.12.11:4318`.

Expected: `mode=live`, `readOnly=true`, database `Marlin_Uyg`, zero reconciliation failures, and warm p95 below `1000 ms`.

- [ ] **Step 7: Commit QA artifacts and validation documentation**

```powershell
git add analysis/validate-final-invoice-ledger.mjs analysis/benchmark-live-ledger.mjs analysis/VALIDATION.md qa/final-ledger
git commit -m "test: validate unified final invoice ledger"
```

## Final Review Gate

- [ ] Run `npm test` and confirm zero failures.
- [ ] Run `npm run build` and confirm exit `0`.
- [ ] Run local and production reconciliation scripts and confirm differences do not exceed `0.01 TL`.
- [ ] Confirm CPM health reports `readOnly: true`.
- [ ] Confirm no provisional economic rows and no converted retail double counts.
- [ ] Confirm monthly target pools sum exactly to the displayed annual pool.
- [ ] Confirm employee shares reconcile to their own department pools.
- [ ] Confirm every 2026 `OGENCOGLU` stale template occurrence resolves to a valid current actor or a visibly low-confidence department record.
- [ ] Confirm production rollback source archive and Docker image tag exist.
