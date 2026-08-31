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
- Final P1 pass decorates monthly `all` department projections, gates Sales top-month EUR ranking on canonical completeness, removes Sales local annual net/cost/profit/basket aggregation, and preserves null Audit detail values.
- Final remaining review fix projects monthly chart values from canonical fields/status, removes DepartmentAnalysisPage local net/profit reconciliation arithmetic, and keeps review-month profit unavailable rather than coercing it to zero.
- Terra final fix adds `projectCanonicalMetric` for UI projections, removes SalesPage local totals/category arithmetic and zero coercions, and makes DepartmentAnalysisPage format null financial values as unavailable with review status gating.
- Final review closure moves Reports discount/return/dealer/service summary projection to the server, removes the Reports consumer-side financial reduce, and uses the shared null-safe canonical formatter for DepartmentAnalysis KPI/table/comparison values.
- Added behavioral coverage for the Department null rendering contract and Reports canonical projection/no-reduce contract; no SummaryPage changes were included.
- Final review closure adds the required `eurComplete` projection field before Sales top-period selection, passes `eurRateSets` from App to Reports, and clears stale canonical EUR metric/rate-set state when the overview refresh falls back after failure.
- Added regressions for complete-EUR top-period selection, Reports EUR-rate wiring, and failed overview refresh state clearing.
- SummaryPage was not changed in this fix branch.

## Verification

Focused command:

```text
node --test server/task2FinancialConsumers.test.mjs server/departmentEurContract.test.mjs server/task2IndependentReviewFix.test.mjs shared/financialMetric.test.mjs
```

Result: **33 tests, 33 passed, 0 failed**.

Full command: `npm test` — **335 tests, 331 passed, 4 failed**. Task 2 tests were green. Remaining failures are out of scope and unchanged: `production fingerprint registry executes the three approved queries` (CPM fingerprint fixture), `default labor pilot cost matches the Nexus zero-percent setting`, `departman hedef API ekran ayrıntısının 500 satır sınırından etkilenmez`, and `V2 kanıtı eksik ayda profit üretmez ve tüm net satışı incelemeye ayırır`.

Build command: `npm run build` — passed (`vite build`, 6772 modules transformed).

## Commits

- Base: `409172f` (`fix(finance): close Task 1 metric contract review findings`)
- Earlier Task 2 implementation/fix commits remain in ancestry, including `73ed37d`, `7a24a06`, `14f4040`, and `01e3d57`.
- `cce425c` — `fix(finance): complete Task 2 canonical report projections` (Reports projection and Task 2 behavior tests).
- Final P1 fix commit is created after this verification and includes the monthly-all projection, Sales EUR fail-closed selection, Audit null display, and regressions.
- Final remaining review-fix commit is created after this verification and includes canonical monthly chart/reconciliation consumption plus the null-review regression.
- Final closure commit: `b9cad89` (`fix(finance): close final Task 2 consumer findings`) includes the Reports server projection, null-safe DepartmentAnalysis formatting, behavioral regressions, and the verification record.
- Final review follow-up commit: `19dee70` (`fix(finance): close final EUR wiring findings`) includes only the Sales canonical EUR field correction, App Reports EUR-rate wiring/state reset, focused regressions, and this report update.

## Known limitations / blocker

The four full-suite failures above require separate existing-contract decisions and were not altered. Unrelated pre-existing untracked artifacts remain untouched. No production/CPM verification was performed.
