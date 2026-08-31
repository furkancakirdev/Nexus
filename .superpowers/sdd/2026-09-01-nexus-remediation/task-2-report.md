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

Result: 15 passed, 1 failed. The remaining failure is the pre-existing boundary assertion comparing the department EUR basket projection with the canonical EUR aggregate in `shared/financialMetric.test.mjs`; TRY/canonical and focused review assertions pass. The failure must be resolved before claiming GREEN or merging.

No full `npm test` or build claim is made because the focused suite is not fully green in this interrupted pass.

## Commits

- Base: `409172f` (`fix(finance): close Task 1 metric contract review findings`)
- Review-fix commit: `ba29b4c0355823ec4005f9b27c91778e202bd619`.

## Known limitations / blocker

The department EUR basket compatibility assertion still needs one focused reconciliation fix. The workspace also contains unrelated pre-existing untracked diagnostic artifacts; they were not staged or deleted. No production/CPM verification was performed.
