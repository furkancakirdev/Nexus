# Marlin Nexus — Performance Budgets and Load Model

> Version: 1.0-proposed
> Defined: 2026-09-09
> Status: `PROPOSED_PENDING_PRODUCTION_TELEMETRY`
> Scope: Nexus web/API, Caddy edge, Node service, file-backed state, and CPM read-only dependency

## 1. Evidence and assumptions

The current deployment is a single Node.js application behind Caddy, with one container exposed on port 4318 and host-bound application state under `/app/data`. The CPM pool is configured with `min=0`, `max=4`, an 8-second connection timeout, and a 90-second request timeout. No production request telemetry, concurrent-user census, query-duration histogram, or capacity test result is currently available; all budgets below are proposed acceptance targets, not measured claims.

The model assumes an internal business application used during a working day, not a public internet workload. CPM remains read-only; expensive financial/reporting requests must be bounded by date/year filters and must not be used as an unbounded stress generator.

## 2. Expected users and traffic model

| Dimension | Initial planning value | Acceptance interpretation |
|---|---:|---|
| Registered users | 50 | Confirm against identity source before release |
| Peak concurrently active users | 15 | 95th percentile of active sessions during business peak |
| Peak authenticated sessions | 25 | Includes idle sessions making periodic refreshes |
| Normal API request rate | 1 request/second | Sustained 15 minutes without error or resource drift |
| Peak API request rate | 3 requests/second | 5-minute business burst; no queue growth or pool starvation |
| Short spike | 6 requests/second | 60 seconds; graceful degradation allowed, 5xx not allowed above 1% |
| Browser clients | 15 concurrent | One browser session per active user; no credential sharing |
| Reporting-heavy share | 20% of requests | Must be tested separately from lightweight session/health traffic |
| Mutating share | 5% of requests | Settings/approval flows; duplicate effects must remain zero |

These are planning assumptions. Product/operations owners must replace them with observed concurrency and request-rate data before final acceptance.

## 3. Critical workflow budgets

Budgets apply to the complete HTTP request at the edge, excluding client rendering time. Measure p50, p95, p99, throughput, timeout rate, and HTTP 5xx rate.

| Workflow | Representative endpoint(s) | p95 target | p99 target | Error target |
|---|---|---:|---:|---:|
| Health/static entry | `/api/health`, `/` | 200 ms | 500 ms | 5xx < 0.1% |
| Session restore/read | `/api/session` | 300 ms | 750 ms | 5xx < 0.5% |
| Login/logout | `/api/session/login`, `/api/session/logout` | 500 ms | 1,000 ms | Auth failures are 401/429, unexpected 5xx < 0.5% |
| Overview/report read | `/api/overview` | 2,000 ms | 5,000 ms | 5xx < 1% |
| Department analysis | `/api/department-analysis` | 2,500 ms | 6,000 ms | 5xx < 1% |
| Sales/inventory research | `/api/sales-cases`, `/api/inventory-research` | 2,000 ms | 5,000 ms | 5xx < 1% |
| Approval/settings mutation | `/api/approvals*`, `/api/app-state` | 500 ms | 1,500 ms | No duplicate writes; 5xx < 0.5% |
| Readiness/build evidence | `/api/readiness`, `/api/build-info` | 1,500 ms | 4,000 ms | Blockers must be explicit; no silent success |
| HR document metadata/upload | `/api/hr/*` | 1,500 ms | 4,000 ms | Invalid content is 400; 5xx < 1% |

A request exceeding its p99 budget is a release investigation trigger. A CPM request approaching the 90-second driver timeout is a hard failure, not an acceptable long-tail result.

## 4. Database and dependency limits

- CPM pool maximum: **4 connections**; do not increase it without DBA capacity evidence.
- CPM connection timeout: **8 seconds**; connection failures must surface as bounded errors.
- CPM request timeout: **90 seconds**; load tests must abort before generating unbounded concurrent queries.
- Maximum concurrent CPM-heavy requests: **4**; the fifth must queue briefly or fail gracefully, never create an unbounded pool.
- Target CPM pool utilization: p95 below 75%; p99 wait time below 500 ms under the peak model.
- No CPM write statements are permitted. Read-only preflight and query fingerprint checks remain mandatory.
- Query result and date/year bounds must be explicit; load tests must not use unrestricted historical scans.
- File-backed state mutations must remain serialized and atomic; concurrent approval tests must show exactly one valid transition.
- Database acceptance requires query duration, logical reads/waits, connection waits, timeout count, and error class evidence from the DBA or approved test database.

## 5. Application and host resource budgets

These are initial single-container budgets and must be validated under the load model:

| Resource | Warning threshold | Hard threshold / abort |
|---|---:|---:|
| Node CPU | sustained > 60% of allocated core budget | > 85% for 5 minutes |
| Node memory RSS | > 65% of container limit | > 80% or any OOM/restart |
| Event-loop delay | p95 > 50 ms | p99 > 200 ms |
| Container restarts | any unexpected restart | one restart during steady-state test |
| Disk usage for `/app/data` | > 70% | > 85% or write failure |
| Open file descriptors | > 70% of limit | > 90% of limit |
| Caddy upstream errors | > 0.5% | > 1% |
| HTTP 5xx | > 0.5% | > 1% during peak; any unexplained data mutation |
| TLS/connection failures | any unexplained spike | sustained failure for 1 minute |

Resource limits must be supplied by the deployment manifest before these percentages become final absolute values. Current Compose configuration does not declare CPU/memory limits, so this is a release gap.

## 6. Test matrix

Run against a production-like isolated environment with sanitized data and no production CPM writes:

1. **Baseline:** 1 user, 1 request/second, 15 minutes.
2. **Peak:** 15 concurrent users, 3 requests/second, 5 minutes.
3. **Spike:** ramp from 1 to 6 requests/second for 60 seconds, then recover for 10 minutes.
4. **Soak:** 3 requests/second for 2 hours; monitor memory, handles, pool waits, and latency drift.
5. **Reporting-heavy:** 20% department/overview/inventory queries at peak; verify CPM pool saturation behavior.
6. **Mutation contention:** concurrent approval/settings requests; verify CSRF, authorization, idempotency, and serialized state transitions.
7. **Dependency failure:** isolate CPM or force a bounded timeout; verify generic errors, correlation IDs, readiness blockers, and recovery without restart loops.

Use unique synthetic identifiers and temporary state paths. Do not use real credentials in load scripts; use an approved test identity and redact cookies/auth headers from output.

## 7. Pass/fail rules

A run passes only when all of the following hold:

- p95 and p99 workflow targets are met for the selected scenario.
- HTTP 5xx and timeout rates remain below the table thresholds.
- No OOM, unexpected restart, file descriptor exhaustion, or unbounded queue occurs.
- CPM pool remains within four connections and no write statement executes.
- No duplicate approval, duplicate state mutation, orphan record, or invalid transition is observed.
- Health/readiness and correlation-ID diagnostics remain available during induced dependency failure.
- Before/after data checks match, and test artifacts contain no secrets or business-row exports.

Two consecutive failed runs require investigation of the exact bottleneck; do not raise budgets to conceal a regression. Any accepted exception must name an owner, expiry date, compensating control, and rollback trigger.

## 8. Required instrumentation and evidence

Capture aggregate metrics only:

- request count, latency percentiles, status/error class, and route;
- active sessions and concurrency;
- Node CPU/RSS/event-loop delay, restarts, handles, and disk usage;
- Caddy upstream latency/errors;
- CPM pool size, wait time, request duration, timeout/error counts, and SQL logical reads where DBA-approved;
- state-store update duration and serialization wait time;
- release build ID, commit, image digest, and test dataset identifier.

Do not capture request bodies, passwords, cookies, authorization headers, raw SQL values, or personal/business row data.

## 9. Current gaps and approvals

The following are not yet verified and block treating these budgets as production-approved:

- Production user/concurrency/request-rate telemetry: `TBD`.
- Absolute CPU/memory/container limits: `TBD`.
- CPM query plans, waits, and capacity envelope: `DBA_REQUIRED`.
- Monitoring dashboards and alert thresholds: `TBD`.
- Load-test tool, sanitized dataset, and test owner: `TBD`.
- Approved RPO/RTO and maintenance window: documented separately but owner approval pending.
- Product, technical, DBA, security, and operations sign-off: `PENDING`.

**Status:** `PROPOSED_BUDGETS_PENDING_TELEMETRY_AND_SIGNOFF`.
