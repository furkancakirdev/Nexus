# Task 1 Report — Canonical Financial Metric and EUR Contract

Date: 2026-09-01
Status before commit: implementation complete; local verification passed.

## Changed files

- `shared/financialMetric.mjs` — new pure canonical financial metric boundary.
- `shared/financialMetric.test.mjs` — new focused contract tests.
- `.superpowers/sdd/2026-09-01-nexus-remediation/task-1-report.md` — this report.

No server route, React consumer, CPM query, deployment file, credential, or existing unrelated worktree file was changed.

## Exact exports and signatures

### `aggregateFinancialMetric(rows = [], options = {})`

Consumes ledger rows with `signedNetSalesTry`, `financeV2`, `productCurrency`, `documentSellingRate`, optional `period`, `excluded`, `manualCostTry`, and `manualCostApproved`. Options are `{ rateSets?: Object|Map, rateSet?: Object, period?: string, basisId?: string }`.

Returns a stable object containing:

- `status`: `TAMAM` or `INCELEME`.
- `basisId`.
- `scope.included`, `scope.review`, and `scope.excluded`, each with `lines`, signed `netSales`, `cost`, and `profit`.
- signed TRY `try.netSales`, `try.cost`, and `try.profit`.
- `byCurrency` and period-aware `byPeriod[period].byCurrency` baskets using the existing `eurReporting.mjs` basket primitives.
- EUR `eur.netSales`, `eur.cost`, `eur.profit`, `eur.margin`, and `eur.complete`, plus the compatibility alias `eurMargin`.
- `evidence` counts for covered, review, excluded, approved-manual-cost, period, and currency lines.

### `reconcileFinancialMetrics(actual, expected, options = {})`

Compares signed `netSales`, `cost`, and `profit` fields. Options are `{ basisId?: string }`. Returns `{ status: "MATCH"|"MISMATCH"|"INCOMPLETE", basisId, deltas }`, preserving unrounded numeric deltas and returning `null` deltas for incomplete fields.

## TDD evidence

### RED

Command:

```text
node --test shared/financialMetric.test.mjs
```

Observed failure:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'C:\Users\furkan.cakir\Documents\Marlin Yönetim Paneli\shared\financialMetric.mjs'
✖ shared\financialMetric.test.mjs
tests 1, pass 0, fail 1
```

The failure was caused by the intentionally absent new shared boundary.

### GREEN

Focused command:

```text
node --test shared/financialMetric.test.mjs
```

Observed output: `tests 9, pass 9, fail 0`.

Existing shared/server subset:

```text
node --test shared/*.test.mjs server/departmentAnalysis.test.mjs server/ledgerService.test.mjs
```

Observed output: `tests 76, pass 76, fail 0`.

Full suite:

```text
npm test
```

Observed output: `tests 387, pass 387, fail 0`.

Build:

```text
npm run build
```

Observed output: Vite transformed 6771 modules and completed successfully; exit code 0.

## Contract coverage

The focused tests cover cross-path-equivalent aggregation shape, missing cost, missing document selling rate, missing period rate evidence, signed returns with reversed cost, excluded rows, zero EUR denominator, duplicate period/currency baskets, different period rates, mixed covered/review rows, approved versus unapproved manual cost, and reconciliation mismatch/incomplete evidence.

The implementation reuses `classifyEurLine`, `convertToEur`, `emptyCurrencyBasket`, and `addToCurrencyBasket` from `shared/eurReporting.mjs`; it does not duplicate currency conversion math. Review rows remain visible in signed TRY scope and the `INCELEME` basket, but never enter EUR totals. Excluded rows remain observable but never enter comparable totals. Decimal representation remains unchanged; no minor-unit migration was introduced.

## Remaining concerns

- Route and React consumers are intentionally not migrated in Task 1; that is the approved follow-on consumer slice.
- Existing unrelated worktree modifications were present before this task and were not included in the Task 1 commit.
- The first slice preserves JavaScript decimal arithmetic as explicitly required; presentation-layer rounding remains a consumer concern.

## Unmet requirements

None within the approved Task 1 scope. Production and CPM verification were intentionally not performed, as required.

## Fix round 1 — review findings

Date: 2026-09-01

### Files changed

- `shared/financialMetric.mjs`
- `shared/financialMetric.test.mjs`
- This report

No route, React/UI, security, deployment, credential, or CPM path was changed.

### Findings addressed

1. Added a real cross-path contract test using the existing `buildOverviewRows` / `decorateOverviewRowsEur` functions from `server/ledgerApi.mjs` and `buildDepartmentAnalysis` from `server/departmentAnalysis.mjs`, plus the existing `decorateBasketEur` primitive. One synthetic ledger now asserts covered TRY/EUR sales, cost, profit, margins, USD basket counts, nonzero review/excluded totals, and reconciliation results. The test records the existing department review-profit divergence explicitly as `MISMATCH` with an unrounded `profit: -50` delta; it does not claim route migration that Task 1 did not authorize.
2. RED evidence now includes reproducible contract assertions in addition to the original missing-module error. The first fix-round RED run was:

   ```text
   node --test shared/financialMetric.test.mjs
   tests 12, pass 9, fail 3
   failures: existing boundary EUR representation (4.48 vs 4.4799999999999995), supplied rateSet fallback returned TAMAM instead of INCELEME, and review scope cost was 0 instead of 200
   ```

   After strengthening the fixture with nonzero review/excluded rows, the remaining old-path RED assertion was `240 !== 290`: the existing department boundary subtracts uncovered review sales from profit, whereas the new Task 1 contract preserves known signed TRY review cost/profit. This is the strongest reproducible old-path evidence without changing routes. The final test records that limitation as an explicit reconciliation mismatch rather than falsifying equality.
3. When `rateSets` is supplied, period lookup now requires an exact key and does not fall back to `options.rateSet`. `options.rateSet` is accepted only when `options.period` explicitly selects the single period. Added a missing-period-with-fallback regression test.
4. Review rows now preserve finite signed TRY cost from approved manual cost or `financeV2.lineCostTryExVat` in `scope.review`, top-level `try`, and the `INCELEME` basket, while remaining excluded from EUR totals. Added a focused regression test covering TRY sales, cost, profit, and zero EUR leakage.
5. The excluded-row test now compares EUR net sales, EUR profit, EUR completeness, and the full currency baskets against a baseline, proving excluded rows cannot alter any comparable EUR result.

### Fix-round verification

Focused RED/GREEN test command:

```text
node --test shared/financialMetric.test.mjs
```

Final observed output:

```text
tests 12, pass 12, fail 0, cancelled 0, skipped 0
```

Full suite:

```text
npm test
```

Final observed output:

```text
tests 390, pass 390, fail 0, cancelled 0, skipped 0
```

Build:

```text
npm run build
```

Final observed output:

```text
Vite transformed 6771 modules; built successfully in 6.21s; exit code 0
```

### Unresolved constraints

- The existing overview and department consumers are not migrated in this fix round because the approved Task 1 scope forbids route/UI changes. The cross-path test therefore documents their current review-profit mismatch and provides the canonical target for the next consumer slice.
- JavaScript decimal representation remains unchanged as required; the cross-path test uses a tight tolerance for equivalent floating-point EUR arithmetic and reconciliation deltas remain unrounded.
- No production, CPM, deployment, or credential verification was performed.
