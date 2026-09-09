# T05 API/backend contract evidence

Command: `node --test server/approvalApi.test.mjs server/ledgerV2Api.test.mjs server/authBoundary.test.mjs server/appState.test.mjs`

Result: PASS — 25 tests, 25 passed, 0 failed.

Covered: approval request/response and stale/invalid handling, ledger API projections, auth boundary, app-state validation and mutating API behavior.
