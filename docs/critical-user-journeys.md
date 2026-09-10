# Marlin Nexus — Critical User Journeys

> Trace date: 2026-09-09  
> Scope: React/Vite web UI, Express API routes, authentication/capability middleware, CPM read-only consumers, and file-backed Nexus state.  
> Evidence: `src/App.jsx`, `src/api.js`, `src/sessionGate.js`, `server/index.mjs`, `server/auth.mjs`, `server/capabilities.mjs`, route modules, tests, and prior non-mutating probes.  
> Status: source-traced; authenticated live UI execution and CPM-backed success paths remain unverified.

## 1. Common conventions

- Browser API calls use same-origin credentials. `src/api.js` adds `X-CSRF-Token` from the non-HttpOnly `nexus_csrf` cookie to every `POST`, `PUT`, `PATCH`, and `DELETE` request.
- The server keeps the signed `nexus_session` cookie HttpOnly and uses `SameSite=Strict`; it sets `Secure` when the request is HTTPS or has `X-Forwarded-Proto: https`.
- Every `/api/*` route except login, session health, and `/api/health` passes session authentication. Unknown API paths fail closed with `403` because no capability policy is defined.
- Mutations require both a matching CSRF cookie/header and the configured public Origin. Missing session is `401`; failed CSRF/Origin is `403`.
- UI visibility is a convenience boundary only. Server-side authentication and capability checks remain authoritative.
- CPM is intended to be read-only. If evidence is unavailable or ambiguous, financial/inventory paths return review, quarantine, unavailable, or blocked states rather than inventing a result.

## 2. Journey J-01 — Initial load and session restoration

**Actors:** browser, Nexus static UI, Express API.

1. Browser requests the root page through Caddy TLS; Caddy reverse-proxies to the Node/Express service.
2. React mounts `App` with `session.status = "loading"` and resolves the requested/default page from the URL and local appearance settings.
3. `App` calls `GET /api/session` with same-origin credentials.
4. Server reads and verifies the signed `nexus_session` cookie, checks expiry, and returns `{ user }` when valid.
5. If valid, the UI computes `navItemsFor(user)` and selects the first page accessible to the role/capabilities.
6. If no valid session exists, the server returns `401`; `App` transitions to the login view. Invalid/expired/tampered cookies do not create a session.

**Expected outcomes:** `200` authenticated session; `401` unauthenticated session; no protected data rendered before the session decision.  
**Failure handling:** network/JSON failure is treated as unauthenticated or error according to the session gate; retry/refresh behavior must be verified in an authenticated browser test.

## 3. Journey J-02 — Authentication/login

1. User enters username and password on `LoginPage`; password remains in component state and is sent only in the HTTPS same-origin request body.
2. Browser sends `POST /api/session/login` with JSON `{ username, password }`.
3. Server validates the configured identity provider or admin password hash, derives the role/capabilities, creates an expiring signed session cookie, and creates a CSRF cookie.
4. Server returns the non-secret user identity, role, capabilities, and CSRF token metadata; password is not returned.
5. UI calls `onLogin`, transitions to authenticated app state, selects the first accessible page, and begins protected data loading.
6. Invalid credentials return `401` and the UI displays a non-success alert; the login form remains available.

**Expected outcomes:** valid credentials `200`; invalid credentials `401`; missing/invalid provider configuration fails closed.  
**Verification gap:** live authorized login was not replayed in this trace; rate limiting/MFA evidence is tracked separately in the security assessment.

## 4. Journey J-03 — Authorization and module/page access

1. After authentication, the UI filters active `NAV_ITEMS` using the user’s capabilities.
2. `admin` receives reporting, operations, approvals, and settings capabilities; `reporting` receives reporting read; `operational` receives operations read; unknown roles receive none.
3. Browser requests `GET /api/modules`; server applies the reporting capability policy and returns only visible modules.
4. For a direct page/API request, the server maps the normalized route to a required capability before the route handler runs.
5. If capability is present, the handler executes; if absent, server returns `403` and the UI shows a blocked/no-access state.
6. If the route is not in the server policy map, server returns `403` rather than dispatching an unclassified API route.

**Expected outcomes:** allowed route `200`; authenticated but unauthorized route `403`; unauthenticated route `401`.  
**Critical gap:** HR router capability registration was not found in the inspected `server/index.mjs` wiring; production must verify that HR routes cannot use a permissive missing-callback fallback.

## 5. Journey J-04 — Executive overview/reporting

1. User opens the Summary/Overview page; the UI uses the selected report year (validated to 2000–2100) and requests the overview/readiness-related reporting endpoints.
2. Server applies `reporting:read`, validates the year/query bounds, and loads the ledger/CPM-backed model through bounded read-only query contracts.
3. Server returns rows, EUR rate sets, canonical metrics, mode, provenance, and quality/review indicators.
4. UI maps a successful array to live/demo/empty mode; `401/403` becomes a blocked message; malformed/empty payload becomes an empty-state message.
5. The user changes year/report filters; the UI re-fetches and preserves a no-data or review state if the source is unavailable.
6. User reviews confidence, source/provenance, reconciliation, and quarantine indicators before treating figures as final.

**Expected outcomes:** `200` with data or explicit empty/review mode; `401/403` blocked; `503`/error degraded state without fabricated financial values.  
**Verification gap:** CPM live catalog and authenticated readiness remain unverified; source-quality blockers must remain visible.

## 6. Journey J-05 — Sales cases and inventory research

1. User with `operations:read` opens Sales or Stok/Inventory pages.
2. UI requests `GET /api/sales-cases?year=&page=&pageSize=&search=&stage=&confidence=` or `GET /api/inventory-research` with bounded filters.
3. Server validates year, page/page size, stage, confidence, and search length; it loads cached or fresh CPM read-only models.
4. Server returns paged rows, summary, quality, filters, `mode`, and `readOnly: true`; unavailable CPM access returns an explicit `503`/unavailable payload.
5. UI renders filters, pagination, confidence/quality indicators, and no-data/error states without treating unavailable data as valid.
6. User may refresh a bounded model; no CPM write operation is part of the journey.

**Expected outcomes:** `200` live/read-only or explicit empty mode; invalid filters `400`; missing capability `403`; unavailable CPM `503`; unexpected read failure `500` with a stable public message.

## 7. Journey J-06 — Department analysis and reconciliation

1. User with `reporting:read` selects Department Analysis and a year.
2. UI requests department analysis/target and reconciliation endpoints, including `GET /api/department-analysis`, `GET /api/department-targets?year=`, and relevant `/api/reconciliation/*` reads.
3. Server validates year and loads CPM sales/document evidence plus file-backed department targets/settings.
4. Server calculates or returns service/spare-parts breakdown, ownership evidence, target mode, reconciliation status, and provenance/quarantine indicators.
5. UI distinguishes live, demo, unavailable, and review-required states; it does not overwrite the canonical aggregate with the breakdown.
6. If evidence is incomplete or source provenance fails, response remains non-final and is surfaced for review.

**Expected outcomes:** authorized `200`; invalid year `400`; missing capability `403`; CPM/readiness failure `503` or review payload.  
**Data boundary:** department targets/settings are Nexus file-backed application state; CPM remains read-only.

## 8. Journey J-07 — Audit and report export

1. User with `reporting:read` opens Audit or Reports Center.
2. UI requests filtered audit/report data from `/api/audit-ledger`, `/api/audit-samples`, and relevant reporting/reconciliation endpoints.
3. Server applies capability checks, validates filter/year inputs, reads audit/state/CPM evidence, and returns structured results.
4. User applies filters or requests CSV export; the UI exports only the authorized filtered result set.
5. Audit entries preserve actor/action/timestamp and relevant snapshot/provenance hashes; sensitive credentials and cookies must not appear in output.
6. Empty, blocked, unavailable, or review-required responses remain explicit rather than being represented as zero/final data.

**Expected outcomes:** authorized `200`; missing capability `403`; malformed filter `400`; backend/read failure stable `5xx` error without internal details.  
**Verification gap:** centralized immutable retention and export redaction require separate security/operations evidence.

## 9. Journey J-08 — Approvals and ledger refresh (administration)

1. Admin opens Approvals and requests `GET /api/approvals` or a year/month view.
2. Server requires `approvals:manage`, validates year/month and current snapshot/source evidence, and returns approval state, ledger version, review/quarantine indicators, and audit history.
3. Admin submits `PUT /api/approvals/:year/:month` with the approved payload; `apiFetch` adds the CSRF header and browser supplies the same-origin cookies.
4. Server authentication middleware checks session, CSRF, and Origin; capability middleware checks `approvals:manage`; payload and source snapshot/hash are validated before atomic state update/audit event.
5. Admin may request `POST /api/approvals/:year/:month/reopen`; the same mutation boundaries apply and a reopen event is recorded.
6. Admin may request `POST /api/ledger-refresh` with the required operations capability; server refreshes only through the read-only CPM path and returns a review/error state if evidence is stale or unavailable.

**Expected outcomes:** valid mutation `200`; missing session `401`; CSRF/Origin/capability failure `403`; invalid year/month/payload `400`; stale/invalid evidence rejected; unexpected persistence failure `500`.

## 10. Journey J-09 — Settings and application-state administration

1. Admin opens Settings; UI reads `GET /api/app-state` and/or local preferences.
2. Server requires `settings:manage` and returns settings, employees, cost overrides, and save timestamp without secret values.
3. User edits appearance, pilot employees, or cost overrides; UI serializes/normalizes the settings payload.
4. Browser sends `PUT /api/app-state`; `apiFetch` adds CSRF and same-origin credentials.
5. Server validates object/array shapes, normalizes settings, and atomically persists file-backed state; it returns `saved` and `savedAt`.
6. Validation/type/range errors return `400`; persistence failures return a stable `500`; UI preserves the previous state and shows an error.

**Expected outcomes:** authorized read/update `200`; missing capability/session or CSRF/Origin `403/401`; invalid payload `400`; persistence failure `500`.

## 11. Journey J-10 — HR/employee/document administration (verification-required)

1. An HR-authorized user should open employee, leave, attendance, payroll, or document views.
2. UI should request the corresponding `/api/hr/*` route with session credentials and, for mutations/uploads, CSRF/Origin protection.
3. Server should enforce explicit HR capabilities and record-level scope before reading or mutating employee data/documents.
4. Upload flow should validate size/type/content, store a generated identifier, and return metadata; download should re-check authorization and prevent traversal.
5. Validation/data-store errors should return stable public codes; sensitive employee/document contents must not appear in logs or generic errors.
6. Audit events should capture actor, action, target class, timestamp, and outcome under the approved retention policy.

**Current status:** HR router code and document-store protections were inspected, but production route registration/capability injection and authenticated UI behavior were not confirmed. Treat this journey as **release-blocked until RB-004/RB-005/RB-007/RB-013/RB-023 evidence passes**.

## 12. Journey J-11 — Error, timeout, and degraded-state handling

1. Browser request times out through the UI’s bounded `AbortController` wrapper or receives a non-2xx response.
2. API parsing falls back to an empty object when the body is not JSON; page-specific state maps `401/403` to blocked, `400` to validation error, `503` to unavailable/review, and other failures to an error state.
3. Server logs diagnostic context internally for readiness/CPM failures but returns stable public messages for sensitive paths.
4. Financial, inventory, provenance, and approval flows preserve `review`, `quarantine`, `unavailable`, or `not-ready` state instead of substituting a successful-looking value.
5. User can retry or navigate away; state writes must be atomic and should not partially replace the prior valid state.
6. Operations follow the alert/runbook path for repeated 5xx, CPM outage, disk/state failure, TLS expiry, or authentication abuse.

**Known gap:** some HR routes return raw `err.message` according to the security assessment; this remains a remediation item and must not be considered safe error handling until fixed.

## 13. Journey J-12 — Logout and session expiry

1. User selects Logout in the shell.
2. UI sends `POST /api/session/logout` with same-origin cookies and CSRF header.
3. Server clears the session and CSRF cookies with expired/max-age-zero values and returns `{ loggedOut: true }`.
4. UI always clears local authenticated session state in `finally`, even if the network request fails, and returns to the login view.
5. Subsequent protected API requests without a valid session receive `401`; stale/tampered/expired cookies cannot restore access.
6. User logs in again to receive a new session/CSRF pair; local appearance/report-year preferences may remain because they are not authentication credentials.

**Expected outcomes:** logout `200`; post-logout protected access `401`; failed logout request still clears local UI state.  
**Verification gap:** authenticated browser evidence for cookie invalidation, replay after logout, and expiry is pending.

## 14. Journey test matrix

| Journey | Primary UI/API evidence | Automated/source tests | Live status | Release gate |
|---|---|---|---|---|
| Session restore/login/logout | `src/App.jsx`, `src/api.js`, `server/auth.mjs` | `server/auth.test.mjs`, `authBoundary.test.mjs` | Public `401` verified; authenticated replay not run | Authentication/session tests |
| Authorization/module visibility | `src/sessionGate.js`, `server/index.mjs`, `capabilities.mjs` | `task6RoleIsolation.test.mjs`, UI contract tests | Route boundary source-traced | Negative role tests |
| Overview/reporting | `SummaryPage`, ledger/index routes | ledger/report tests | CPM success unverified | Readiness/provenance |
| Sales/inventory | `SalesPage`, `InventoryResearchPage`, index routes | sales/inventory tests | CPM success unverified | Source data quality |
| Department/reconciliation | `DepartmentAnalysisPage`, ledger routes | department/reconciliation tests | CPM success unverified | Financial acceptance |
| Audit/reports | `AuditPage`, Reports routes | audit/API tests | Export/redaction operational evidence pending | Audit retention |
| Approvals/refresh | approval and ledger APIs | approval/ledger tests | No production mutation performed | CSRF + evidence gates |
| Settings | `SettingsPage`, `/api/app-state` | state/settings tests | No production mutation performed | State backup |
| HR administration | `server/hr/*` | HR unit tests | Production registration/auth wiring unverified | HR security/privacy |
| Errors/degraded states | `sessionGate`, server stable errors/readiness | API/error tests | Public health/auth boundary verified | Observability |

## 15. Open validation and sign-off items

1. Execute authenticated browser/API traces with test credentials from the approved secret store; retain status/timestamps only.
2. Verify HR router registration and fail-closed capability injection in the production composition root.
3. Run negative tests for every role, unknown role, direct API route, CSRF/Origin failure, IDOR, upload, and error-disclosure path.
4. Verify CPM-backed success paths, provenance, data-quality profile, authenticated readiness, and read-only permissions.
5. Verify backup/restore and audit/log retention for state, documents, approvals, and exports.
6. Obtain Product, Technical, Security, Privacy, DBA, QA, and Operations sign-off; current status remains `OWNER_SIGNOFF_PENDING`.
