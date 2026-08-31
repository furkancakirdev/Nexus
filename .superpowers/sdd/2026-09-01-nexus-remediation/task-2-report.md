# Task 2 review-fix report

## Scope

This fix pass addresses the independent-review findings for F-015, F-018, F-019 and F-020. CPM remains read-only; no credentials, production calls, or CPM writes were used.

## Changes

- Added `shared/eurReporting.mjs` to the committed ancestry and made the canonical financial contract expose confirmed/review scopes, null-safe margins, EUR evidence status, and period/currency evidence.
- Converted `server/ledgerApi.mjs` and `server/departmentAnalysis.mjs` to canonical aggregation/projection adapters. Department attribution and operational counters remain local; financial fields are projected from `aggregateFinancialMetric`.
- Added complete-only EUR gates to Sales, Department Analysis and Reports consumers. Partial EUR evidence remains unavailable/review; zero denominators remain null.
- Added focused review tests covering canonical cross-projections, partial EUR with excluded scope, zero denominators, and UI arithmetic guards.
- SummaryPage was not changed in this fix branch.

## Verification

Focused command:

```text
node --test server/task2IndependentReviewFix.test.mjs shared/financialMetric.test.mjs
```

Result after the boundary fix: 16 passed, 0 failed. Root cause was that `byCurrency` stored raw TRY values while canonical EUR aggregation stored product-currency values; department projection therefore converted the basket with the wrong unit.

Relevant regression command: `node --test server/task2FinancialConsumers.test.mjs server/departmentEurContract.test.mjs server/task2IndependentReviewFix.test.mjs shared/financialMetric.test.mjs` — 22 tests, 22 passed. This confirms the department EUR propagation contract and F-020 evidence shape are restored.

Full command: `npm test` — 330 tests, 326 passed, 4 failed. The four remaining failures are outside this boundary fix: production fingerprint registry, default labor pilot cost, department target 500-row expectation, and V2 incomplete-month null/zero expectation. They were not silently changed because their current expectations belong to separate existing contracts and require separate approval/scope.

Build command: `npm run build` — passed (`vite build`, 6770 modules transformed).

## Commits

- Base: `409172f` (`fix(finance): close Task 1 metric contract review findings`)
- Implementation commit: `ba29b4c0355823ec4005f9b27c91778e202bd619`.
- Report update is tracked in the follow-up commit.
- Boundary fix commit: `73ed37dba3a729f360b8a6bef555b0396dc7114b`.
- EUR propagation/evidence compatibility fix commit: recorded after this report update.

## Known limitations / blocker

The full suite still has 4 unrelated compatibility failures listed above. The workspace also contains unrelated pre-existing untracked diagnostic artifacts; they were not staged or deleted. No production/CPM verification was performed.
