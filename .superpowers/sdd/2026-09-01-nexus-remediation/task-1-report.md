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
