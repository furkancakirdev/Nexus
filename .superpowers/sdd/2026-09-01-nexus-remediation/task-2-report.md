# Task 2 review-fix report

## Scope

This pass completes the independent-review fixes for F-015, F-018, F-019 and F-020. CPM remained strictly read-only; no production calls, writes, or credentials were used. SummaryPage and unrelated contracts were not changed.

## Changes

- Added `shared/eurReporting.mjs` to the committed ancestry and made the canonical financial contract expose confirmed/review scopes, null-safe margins, EUR evidence status, and period/currency evidence.
- `server/ledgerApi.mjs` now supplies exact period/rate-set canonical EUR projections for department and annual consumers.
- Audit rows and Reports projections are derived from `aggregateFinancialMetric`; review and excluded cost/profit/margin values remain null.
- ReportsPage consumes server `projections` and annual canonical EUR fields instead of locally aggregating financial values. EUR KPI output is gated on canonical `complete` and `TAMAM` status.
- SalesPage and DepartmentAnalysisPage consume selected-period canonical aggregates; DepartmentAnalysis has a server-provided `all` projection instead of a final-month/local sum fallback.
- Added behavioral tests for complete/partial EUR, review/excluded scope, zero denominator, exact period rates, F-020 evidence/byCurrency, and cross-screen selected-period/currency reconciliation.
- SummaryPage was not changed in this fix branch.

## Verification

Focused command:

```text
node --test server/task2IndependentReviewFix.test.mjs shared/financialMetric.test.mjs
```

Result: **25 tests, 25 passed, 0 failed**.

Full command: `npm test` — **333 tests, 329 passed, 4 failed**. Task 2 tests were green. Remaining failures are out of scope and unchanged: `production fingerprint registry executes the three approved queries` (CPM fingerprint fixture), `default labor pilot cost matches the Nexus zero-percent setting`, `departman hedef API ekran ayrıntısının 500 satır sınırından etkilenmez`, and `V2 kanıtı eksik ayda profit üretmez ve tüm net satışı incelemeye ayırır`.

Build command: `npm run build` — passed (`vite build`, 6770 modules transformed).

## Commits

- Base: `409172f` (`fix(finance): close Task 1 metric contract review findings`)
- Earlier Task 2 implementation/fix commits remain in ancestry, including `73ed37d`, `7a24a06`, `14f4040`, and `01e3d57`.
- `cce425c` — `fix(finance): complete Task 2 canonical report projections` (Reports projection and Task 2 behavior tests).
- Follow-up report-only commit records this final verification state.

## Known limitations / blocker

The four full-suite failures above require separate existing-contract decisions and were not altered. Unrelated pre-existing untracked artifacts remain untouched. No production/CPM verification was performed.
