# Task 4 — F-021 document search remediation

## Scope

Implemented only the Task 4 server route, department analysis UI, and existing route/UI tests. CPM remains read-only; no credentials, security/RBAC, production, deployment, or CPM write path was touched.

## Exact evidence

- The RED test used 501 selected-year economic rows and searched for `SF-OLD-0001`, the oldest row outside the prior `detailRows.slice(0, 500)` result. Before the fix, the route returned 500 rows and no filtered count; the assertion failed with `500 !== 1`.
- The server now normalizes complete ledger detail rows in bounded 500-row chunks, applies year-scoped department/month/status/depot/search filtering before pagination, and returns deterministic ordering plus `detailPagination.page`, `pageSize`, `totalRows`, and `totalPages`.
- The UI sends `department`, `month`, `status`, `depot`, `search`, `page`, and bounded `pageSize=25` to `/api/department-analysis`; it renders server results, total counts, pagination controls, and the existing empty/loading/error states.
- Canonical financial/evidence fields are carried from the existing department analysis rows; no client-side financial recalculation was introduced.

## Verification

- Focused Task 4 regression tests: pass — old-document search and status/depot/search/total-count combination.
- UI contract tests: pass — server filter parameters, pagination totals, and removal of client-only detail filtering.
- Combined focused command: `node --test server/ledgerService.test.mjs server/uiContract.test.mjs server/departmentEurContract.test.mjs` — `44` tests, `43` passed, `1` pre-existing/out-of-scope failure.
- The unrelated failure is `server/ledgerService.test.mjs:1141`, where the existing department-target fixture expects `january.profit === 250.5` but observes `501`.
- Production build: `npm run build` passed; Vite transformed `6772` modules and exited `0`.
- `git diff --check`: passed for the focused changes.
- No live CPM/production verification was run, per scope.

## Commits

- Implementation and focused tests: `623f4e4c5913eea68f4de5c3f1be50d352684c05` (`fix(task4): paginate complete department ledger search`).
- This report is prepared as the follow-up documentation change after that implementation commit.

## Limitations

- The existing unrelated department-target profit assertion remains unresolved and is not changed under Task 4.
- Live authenticated CPM validation and production deployment were not requested and were not performed.
