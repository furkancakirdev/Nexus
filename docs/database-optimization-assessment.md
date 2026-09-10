# Nexus Critical Database Operations — Optimization Assessment

> Assessment date: 2026-09-09  
> Scope: CPM SQL Server access used by Nexus, query contracts, connection-pool behavior, and available performance evidence.  
> Status: `OPTIMIZATION_BLOCKED_PENDING_QUERY_PLANS`

## 1. Executive result

No SQL text or index was changed in this task. A measured optimization requires a safe CPM test target, representative sanitized parameters, actual execution plans, wait statistics, and before/after timings. The repository and prior probes do not provide those prerequisites:

- The metadata-only CPM connection attempt to `192.168.12.17\\MARLINSQL` timed out before catalog/query execution.
- The load test targeted only a disposable local `GET /api/health` endpoint; it did not exercise CPM queries.
- No production query plans, Query Store export, wait statistics, logical reads, or per-query latency sample is available.
- No isolated SQL Server/test database or approved DBA execution window is configured.

Changing indexes or rewriting joins without this evidence could regress the CPM workload and cannot be accepted as an optimization.

## 2. Verified safeguards already present

| Area | Current control | Evidence |
|---|---|---|
| Connection lifecycle | Lazy single-flight pool provider; successful connection reused; failed connection promise cleared for retry | `server/cpmPool.mjs`, `server/cpmPool.test.mjs` |
| Pool bounds | `min: 0`, `max: 4`, `idleTimeoutMillis: 10000` | `server/cpmConnectionConfig.mjs` |
| Timeouts | 8-second connection timeout; 90-second request timeout | `server/cpmConnectionConfig.mjs` |
| SQL safety | Fingerprinted allowlist rejects unknown/tampered query text before `request.query` | `server/cpmReadOnly.mjs`, `server/cpmReadOnly.test.mjs` |
| Parameters | Query contracts use request parameters rather than interpolating user input into SQL | CPM query modules and integration tests |
| Mutation boundary | CPM connection uses `readOnlyIntent`; runtime readiness requires read-only evidence | `server/cpmConnectionConfig.mjs`, release readiness contract |
| Local baseline | Health surface passed baseline/peak/soak with no local process crash; this is not CPM capacity evidence | `docs/audit/2026-09-09/load-stress-baseline.md` |

These controls reduce unsafe connection behavior and injection risk but do not prove query efficiency.

## 3. Required measurement procedure

A DBA or authorized performance owner must run the following against an isolated or approved read-only CPM target. Use sanitized representative parameters and retain aggregate metrics only; do not export business rows or credentials.

### 3.1 Capture query plans and runtime metrics

For each critical query contract in `docs/database-inventory.md`:

1. Record query ID, fingerprint, parameter shape, start/end UTC timestamps, row-count aggregate, duration, CPU time, logical reads, physical reads, spills, memory grant, and timeout/error count.
2. Capture the **actual execution plan** (`SET STATISTICS XML ON` or an approved Query Store export) for the baseline run.
3. Capture wait categories during the same bounded window (`sys.dm_exec_requests`, `sys.dm_os_wait_stats`, and Query Store runtime statistics as permitted).
4. Record connection-pool leased/idle/waiting counts and request queue time.
5. Redact literals, customer/employee identifiers, document numbers, and credentials from the report.

### 3.2 Candidate query/index review

For any query above the approved budget or with scans/spills:

1. Identify the exact predicate/join/order columns from the actual plan.
2. Check existing indexes and write the proposed index definition in a review artifact; do not apply it directly to production.
3. Test the candidate index/query rewrite in the isolated database with the same parameter distribution.
4. Compare duration, CPU, reads, memory grant, waits, result count, and plan shape before and after.
5. Reject a change if any critical result differs or if write/maintenance cost exceeds the approved budget.
6. Obtain DBA and application-owner approval before promotion.

## 4. Proposed budgets for measurement

These are proposed gates, not measured facts; confirm against the performance budget document and stakeholder approval:

- Read-only reporting query: p95 <= 2 seconds, p99 <= 5 seconds.
- Evidence/detail query: p95 <= 1 second, p99 <= 3 seconds.
- No query timeout in the accepted workload; no unbounded result set.
- Pool utilization <= 75% sustained and no request queue caused by pool exhaustion.
- No unapproved table scans on critical high-volume paths, spills, or excessive memory grants.
- Error rate < 1% for valid requests; invalid/quarantined evidence must fail closed without retry storms.

## 5. Round-trip and query-shape review

The current query modules intentionally separate canonical ledger, source provenance, inventory candidates, settlement evidence, sales cases, and rate evidence. Consolidating them without plans could increase row multiplication or change financial semantics. Before reducing round trips:

- Prove that the combined query preserves each recordset contract and quarantine status.
- Compare returned aggregate counts and financial checksums.
- Verify transaction/read consistency and timeout behavior.
- Keep independent evidence sources separate when a failure must quarantine only that source.

## 6. Required evidence artifact

The optimization owner should produce `docs/audit/<date>/cpm-query-performance.md` containing:

- Environment/database build and compatibility level (no secrets).
- Query IDs/fingerprints and sanitized parameter classes.
- Before/after duration, CPU, reads, waits, memory, row-count, and error tables.
- Plan hashes or redacted plan attachments.
- Index proposal, deployment/rollback script, and maintenance impact.
- DBA/application/security approvals.

## 7. Release status and blockers

Release-blocking until all of the following are evidenced:

- `CPM_CATALOG_AND_PLANS_VERIFIED`
- `CPM_QUERY_BASELINE_CAPTURED`
- `CPM_WAIT_AND_POOL_METRICS_CAPTURED`
- `CPM_OPTIMIZATION_REVIEWED`
- `CPM_BEFORE_AFTER_ACCEPTED`
- `CPM_INDEX_ROLLBACK_READY`

**Final status:** `NO_UNSAFE_SQL_CHANGE_MADE`, `POOL_SAFEGUARDS_VERIFIED`, `OPTIMIZATION_UNVERIFIED`, `DBA_ACCESS_AND_QUERY_PLANS_REQUIRED`.
