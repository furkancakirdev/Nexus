# Nexus Baseline Load and Stress Test Report

> Test date: 2026-09-09
> Target: disposable local Nexus server at `127.0.0.1:4318`
> Status: `LOCAL_SURFACE_PASS`, `CPM_DATABASE_METRICS_UNAVAILABLE`
> Safety: synthetic requests only; no production endpoint, credentials, database writes, or business-row data used.

## 1. Test environment

The server was started locally with synthetic non-production settings:

```text
NEXUS_AUTH_REQUIRED=false
NEXUS_PUBLIC_ORIGIN=http://127.0.0.1:4318
HOST=127.0.0.1
PORT=4318
```

No CPM credential file or live CPM database connection was configured. Therefore authenticated business/reporting workflows, SQL connection waits, database waits, and CPM pool saturation were not exercised.

The load target was the public health endpoint (`GET /api/health`) except for the intentional failure scenario against an unavailable API path. Requests contained no credentials, cookies, authorization headers, or business identifiers.

## 2. Reproduction

Start the local server with synthetic configuration:

```powershell
$env:NEXUS_AUTH_REQUIRED='false'
$env:NEXUS_SESSION_SECRET='<ephemeral-local-value>'
$env:NEXUS_ADMIN_USERNAME='loadtest'
$env:NEXUS_ADMIN_PASSWORD_SHA256='<test-only-hash>'
$env:NEXUS_PUBLIC_ORIGIN='http://127.0.0.1:4318'
$env:HOST='127.0.0.1'
$env:PORT='4318'
npm run server
```

Run bounded requests against `http://127.0.0.1:4318/api/health` using a load client that records only request count, status class, latency, and aggregate errors. Use an unavailable local route (for example `/api/does-not-exist`) only for failure-path testing.

## 3. Results

| Scenario | Requests | Concurrency | Duration | Throughput | Success/errors | p95 | p99 | Max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Baseline health | 60 | 1 | 0.481 s | 124.78 req/s | 60 / 0 | 6.02 ms | Not sampled | 83.75 ms |
| Peak health | 90 | 15 | 0.273 s | 329.63 req/s | 90 / 0 | 10.17 ms | Not sampled | 23.68 ms |
| Failure-path spike | 120 | 30 | 0.392 s | 306.26 req/s | 0 / 120 expected 4xx | 30.66 ms | Not sampled | 57.85 ms |
| Bounded soak health | 600 | 1 (4.74 req/s) | 126.58 s | 4.74 req/s | 600 / 0 | 3.54 ms | 4.18 ms | 60.18 ms |

The failure-path spike intentionally requested an unavailable route. All 120 failures were expected route errors; no process crash or restart was observed.

## 4. Resource evidence

A process sample after the local scenarios reported the largest observed Node process at approximately 78 MB working set. The disposable process remained available throughout the tests; no OOM, restart, or local connection failure was observed.

The local probe did not provide production-equivalent CPU allocation, Caddy upstream metrics, file-descriptor limits, or database wait telemetry. Those metrics remain required for a production-like run.

## 5. Comparison with proposed budgets

- Health p95 was below the proposed 200 ms target in baseline, peak, and soak runs.
- Baseline and peak error rates were 0%.
- The failure-path errors were intentional and excluded from health success-rate assessment.
- The local run did not validate `/api/overview`, department analysis, approvals, HR uploads, authenticated sessions, CPM pool limits, or SQL query duration.
- The proposed 15-user/3 req/s model was approximated for the health surface only; it is not evidence for reporting capacity.

## 6. Unverified or blocked evidence

1. CPM/database waits, query duration, logical reads, connection pool utilization, and timeout behavior: `UNAVAILABLE` because no isolated CPM test database or safe CPM credentials were configured.
2. Authenticated and mutation workflows: `UNAVAILABLE` in this run; they require an approved synthetic identity and isolated state.
3. Caddy/TLS upstream latency and production-like host resource ceilings: `UNAVAILABLE` because the test target was the local Node process.
4. Multi-hour soak and spike recovery at proposed production limits: not run; this bounded test intentionally stayed below the documented safety envelope.

## 7. Conclusion

The disposable local health surface passed the bounded baseline, peak, failure-path, and soak checks without crashes or resource exhaustion. This is not production capacity evidence. Release acceptance remains blocked until an isolated production-like environment supplies authenticated workflow, CPM/database, Caddy, and host-resource measurements.

**Evidence status:** `HEALTH_SURFACE_BASELINE_PASS`, `FAILURE_PATH_EXPECTED`, `PRODUCTION_CAPACITY_UNVERIFIED`.
