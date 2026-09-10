# Nexus Observability Dashboard and Alert Contract

> Status: `IMPLEMENTED_METRICS_ENDPOINT_PENDING_EXTERNAL_DASHBOARD`
> Verified: 2026-09-09

## Instrumented endpoints

- `/healthz`: dependency-free liveness probe. Returns HTTP 200 when the Node process and HTTP listener can serve requests.
- `/api/health`: existing dependency probe. It reports the current CPM connection mode without forcing a secret-bearing connection during a liveness check.
- `/api/readiness`: existing release/readiness contract. It remains authenticated and may perform dependency/readiness work.
- `/api/metrics`: capability-protected JSON metrics endpoint. It contains aggregate counters only and never returns credentials, cookies, SQL, business rows, or request query strings.
- `X-Correlation-Id`: emitted for every request by the existing diagnostics middleware.

## Metrics contract

The in-process metrics snapshot contains:

- `uptimeSeconds`
- request counters keyed by normalized `METHOD path status`
- aggregate `authFailures` for HTTP 401/403 responses
- aggregate CPM `dependencyFailures`
- CPM configured/connected/read-only flags
- sampled latency count and maximum latency

Path labels are query-string-free and capped at 120 characters. This is intentionally a bounded process-local metric, not a replacement for durable metrics storage.

## Dashboard panels

An external dashboard should plot these fields from `/api/metrics` at a fixed scrape interval:

1. Request rate by status class and normalized route.
2. 401/403 authentication and authorization failures.
3. Maximum sampled latency and request sample count.
4. CPM configured/connected/read-only state.
5. CPM dependency failure count.
6. Liveness and readiness probe status.

Dashboard storage, scrape authentication, retention, and owner are `TBD`; `/api/metrics` must not be exposed anonymously.

## Alert rules

The following are proposed starting rules and require Operations approval:

| Alert | Trigger | Initial response |
|---|---|---|
| NexusDown | `/healthz` fails for 2 consecutive scrapes | Check process/container and recent deployment |
| NexusNotReady | `/api/readiness` is non-ready for 2 checks | Inspect readiness blockers; do not cut over |
| CpmUnavailable | CPM connected is false or dependency failures increase in 3 scrapes | Check network, SQL availability, and read-only identity |
| AuthFailureSpike | 401/403 rate exceeds approved baseline for 5 minutes | Investigate abuse, lockout activity, and access changes |
| LatencyRegression | max/sampled latency exceeds the approved budget for 5 minutes | Check CPU, event loop, pool waits, and CPM query plans |

Alerts must carry the correlation ID for a sampled failing request when one is available, but must not include cookies, authorization headers, credentials, SQL text, or business row values.

## Known limits

- Metrics are process-local and reset on restart.
- No OpenTelemetry exporter, Prometheus server, durable log sink, or dashboard provisioning is present in this repository.
- CPM query waits, pool utilization, CPU, memory, and database health require host/SQL telemetry outside the application endpoint.
- Thresholds remain proposed until production telemetry and owner sign-off exist.

**Status:** `LIVENESS_IMPLEMENTED`, `METRICS_IMPLEMENTED`, `CORRELATION_IDS_IMPLEMENTED`, `EXTERNAL_DASHBOARD_AND_ALERT_OWNERSHIP_PENDING`.
