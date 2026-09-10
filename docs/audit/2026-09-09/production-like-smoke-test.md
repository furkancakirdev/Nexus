# Nexus Production-Like Smoke Test Evidence

> Test date: 2026-09-10
> Target: disposable local Nexus process at `http://127.0.0.1:4328`
> Data: synthetic admin identity and isolated temporary app-state path
> Safety: no production host, live CPM database, real credentials, or business rows used

## Scope and exact setup

The disposable process was started with:

```text
HOST=127.0.0.1
PORT=4328
NEXUS_AUTH_REQUIRED=true
NEXUS_PUBLIC_ORIGIN=http://127.0.0.1:4328
APP_STATE_FILE=.temp_files/smoke-app-state.json
CPM target=synthetic/unavailable (no live connection attempted)
```

The admin password was supplied only through the temporary process environment and is not recorded here.

## Smoke results

| Area | Probe | Result | Evidence |
|---|---|---|---|
| Deployment/startup | `node server/index.mjs` on local port 4328 | PASS | Process accepted HTTP requests |
| Liveness | `GET /healthz` | PASS, HTTP 200 | `{"status":"ok"}` |
| Unauthenticated session | `GET /api/session` | PASS, HTTP 401 | Auth boundary enforced |
| Unauthenticated metrics | `GET /api/metrics` | PASS, HTTP 401 | Metrics not public |
| Login | `POST /api/session/login` with synthetic admin | PASS, HTTP 200 | Session and CSRF cookies issued |
| Authenticated session | `GET /api/session` after login | PASS, HTTP 200 | Authenticated identity returned |
| Reporting/core read | `GET /api/overview` | EXPECTED FAIL-CLOSED, HTTP 500 | CPM is intentionally unavailable in the safe target; no fabricated report returned |
| Monitoring | `GET /api/metrics` after login | PASS, HTTP 200 | Capability-authorized metrics endpoint responded |
| Permission denial | Unauthenticated `GET /api/approvals` | PASS, HTTP 401 | Administrative route protected |
| Logout | `POST /api/session/logout` with session CSRF token and Origin | PASS, HTTP 200 | CSRF/Origin contract satisfied |
| Post-logout session | `GET /api/session` after logout | PASS, HTTP 401 | Session invalidated |

## Error handling and monitoring observations

- The first logout attempt without the CSRF header returned HTTP 403 as designed; the corrected CSRF+Origin request returned HTTP 200.
- CPM-unavailable overview behavior was fail-closed: the endpoint did not synthesize business data.
- `/healthz` is dependency-free liveness; `/api/metrics` is capability-protected.
- Correlation IDs and process-local request/auth/dependency metrics were enabled by the application wiring.
- No credential, cookie value, SQL text, or business-row data was stored in this artifact.

## Unverified production-like dimensions

- Live CPM database connectivity and query latency were not tested; the safe target deliberately had no usable CPM connection.
- Authenticated reporting with real sanitized CPM data was not tested.
- Caddy/TLS certificate behavior, container restart, and production image deployment were not exercised.
- External dashboard persistence and alert delivery remain unverified because metrics are process-local.
- Browser UI rendering/accessibility and cross-browser compatibility require a configured browser harness.

## Cleanup and release interpretation

The disposable process and temporary smoke state/log files were removed after testing. No production deployment, database write, credential rotation, or live-state mutation occurred.

**Evidence status:** `LOCAL_SMOKE_PASS_WITH_EXPECTED_CPM_BLOCKER`, `AUTH_LOGOUT_PERMISSION_PASS`, `PRODUCTION_DATABASE_UNVERIFIED`, `PRODUCTION_SIGNOFF_PENDING`.
