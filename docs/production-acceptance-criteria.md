# Marlin Nexus — Production Acceptance Criteria

> Version: 1.0-proposed  
> Date: 2026-09-09  
> Status: `PENDING_STAKEHOLDER_APPROVAL`  
> Scope: production release of the current Nexus web application, API, CPM read-only integration, file-backed application state, HR module, and Caddy edge.

This document defines release gates, evidence, and sign-off responsibilities. A criterion is **PASS** only when the stated evidence is attached to the release record. A blank, unverified, or manually asserted result is not a pass. Existing baseline failures remain blockers until fixed or explicitly accepted by the named owners.

## 1. Decision rules

- **Release-blocking:** Any `Critical` criterion fails or lacks evidence; production release is prohibited.
- **High-severity exception:** A failed `High` criterion requires a written risk acceptance naming an owner, expiry date, compensating control, and rollback trigger.
- **Evidence rule:** Commands, test reports, dashboards, screenshots, manifests, or restore logs must identify the release ID, source commit, environment, and timestamp without including secrets or personal data.
- **No silent waivers:** `acceptedRisks` may contain only the release-contract value explicitly supported by the code (`cpm-extra-permissions`); all other exceptions require a documented change to the contract and approval.
- **Approval rule:** Product/data, technical/security, and operations owners must sign the release record. This document itself does not constitute approval.

## 2. Acceptance criteria register

### A. Functionality and data correctness

| ID | Severity | Criterion / measurable threshold | Evidence and command | Owner / status |
|---|---|---|---|---|
| FUNC-01 | Critical | All critical user journeys pass end-to-end: login/logout, module visibility, overview/reporting, ledger/reconciliation, inventory research, approvals, HR read/write flows, and error/logout handling. No P0/P1 defect remains open. | Release-candidate E2E report with journey IDs, HTTP status assertions, and sanitized screenshots/logs. | Product + QA — Pending |
| FUNC-02 | Critical | Authentication and authorization matrix passes for `admin`, `reporting`, and `operational`; protected routes return `401` without a session and `403` without the required capability. Unknown roles have no module access. | `npm test`; targeted auth/RBAC tests; API matrix report. | Security + QA — Pending |
| FUNC-03 | Critical | Every mutating endpoint rejects missing/mismatched CSRF or Origin checks with `403`; valid authorized mutations persist and can be read back with the expected revision/audit event. | `npm test`; approval/app-state/HR API integration report. | Technical + QA — Pending |
| FUNC-04 | Critical | CPM-derived financial, inventory, and reporting outputs reconcile to the approved source scope; no unsupported value is represented as zero or final. Review/quarantine states remain visible when evidence is incomplete. | Ledger/reconciliation evidence package; source provenance and approval snapshots. | Data owner — Pending |
| FUNC-05 | Critical | CPM access is read-only in the release candidate: no `INSERT`, `UPDATE`, `DELETE`, DDL, or procedure-call path is present or executed. | Read-only contract tests, SQL allow-list scan, runtime `readOnly=true` readiness evidence, and database audit confirmation. | DBA + Security — Pending |
| FUNC-06 | High | Build/runtime metadata is internally consistent: release ID, source commit, image digest, Compose hash, and artifact digest match the persisted release manifest. | `release_runner`/manifest validation output and immutable artifact manifest. | Technical owner — Pending |

### B. Reliability and resilience

| ID | Severity | Criterion / measurable threshold | Evidence and command | Owner / status |
|---|---|---|---|---|
| REL-01 | Critical | Candidate container starts from the immutable image, passes readiness, and remains healthy for a 30-minute soak with zero unexpected restarts and zero unhandled 5xx responses on the smoke workload. | Candidate validation report, container events, readiness samples, and error-rate log. | Operations — Pending |
| REL-02 | Critical | Dependency failures are fail-closed and diagnosable: CPM outage, invalid credentials, missing state file, unavailable TCMB fallback, and invalid secret mounts produce a controlled readiness/error state without fabricated financial output. | Fault-injection test report and sanitized logs. | Technical + Data — Pending |
| REL-03 | Critical | State writes are durable and atomic under concurrent requests; after a controlled restart, settings, approvals, audit events, HR state, documents, and ledger snapshots remain readable and consistent. | Restart/recovery test with before/after hashes and state-integrity checks. | Operations + QA — Pending |
| REL-04 | High | A rollback to the previous release completes within the approved RTO and restores the previous health/readiness contract without data loss beyond the approved RPO. | `releasePreflight` output, rollback drill log, timestamps, and post-rollback smoke report. | Operations — Pending |
| REL-05 | High | No unbounded in-process queue, cache, file growth, or connection leak occurs during the approved soak/load test; disk and memory remain below approved capacity limits. | Load/soak report and host/container resource graphs. | Technical + Operations — Pending |

### C. Security and privacy

| ID | Severity | Criterion / measurable threshold | Evidence and command | Owner / status |
|---|---|---|---|---|
| SEC-01 | Critical | No plaintext password, token, session cookie, private key, or credential file content exists in tracked files, release artifacts, logs, screenshots, or documentation. | Secret scanner output, release archive member review, and redacted log scan. | Security — Pending |
| SEC-02 | Critical | All supplied/exposed credentials are rotated through an approved secret store; old credentials are proven rejected for SSH, CPM, Nexus, and any ERP integration. No rotation may be claimed without status/timestamp evidence. | Secret-store change record and non-logging invalidation checks. | Security + Operations — **Blocked pending authorization** |
| SEC-03 | Critical | TLS certificate is trusted by supported clients, matches the configured hostname/IP SAN, is unexpired, and has renewal alerting before the approved threshold (default 30 days). | Strict client verification, certificate chain report, and renewal-alert test. | Operations — Pending; current strict revocation check unverified |
| SEC-04 | Critical | SSH deployment uses a pinned known-hosts entry and key authentication; password authentication and automatic host-key acceptance are rejected by the release runner. | `python -m unittest -v release_runner_test.py release_artifact_test.py`; runner config evidence. | Security — Pending |
| SEC-05 | Critical | Production secret mounts are read-only, permissions are least-privilege, and secrets are not exposed through process arguments, environment dumps, error responses, or backups. | `releasePreflight` check, host permission evidence, and redacted process inspection. | Security + Operations — Pending |
| SEC-06 | High | Dependency audit reports no high/critical exploitable vulnerability or has a documented, time-bounded exception with mitigation. | `npm audit --audit-level=high` and dependency lockfile evidence. | Technical + Security — Pending |
| SEC-07 | High | Sensitive HR data and documents are access-controlled, not included in client bundles or public static assets, and retained/deleted according to an approved policy. | Authorization tests, artifact scan, and retention-policy sign-off. | HR/data owner — Pending |

### D. Performance and capacity

The following are **proposed defaults** requiring Product and Operations approval before becoming binding targets.

| ID | Severity | Criterion / measurable threshold | Evidence and command | Owner / status |
|---|---|---|---|---|
| PERF-01 | High | Under the approved expected load, critical read APIs meet p95 latency ≤ 1,500 ms and p99 ≤ 3,000 ms; error rate is < 1%. | Repeatable load test with concurrency, dataset scope, and resource graphs recorded. | Product + Operations — Target pending approval |
| PERF-02 | High | Authentication and core mutation APIs meet p95 latency ≤ 750 ms and p99 ≤ 1,500 ms under expected concurrency; no timeout or duplicate-write defect occurs. | Auth/API load report and duplicate/integrity assertions. | Technical + QA — Target pending approval |
| PERF-03 | High | CPM query execution stays within the approved database budget, with no deadlock storm, unbounded connection growth, or query timeout rate > 1%. | SQL wait/plan/connection report and application metrics. | DBA — Target pending approval |
| PERF-04 | Medium | A 2× expected peak load test completes without data loss; graceful degradation is observed for non-critical fallback/reporting paths. | Spike test and degraded-mode evidence. | Operations — Target pending approval |

### E. Observability and auditability

| ID | Severity | Criterion / measurable threshold | Evidence and command | Owner / status |
|---|---|---|---|---|
| OBS-01 | Critical | Liveness/readiness endpoints expose actionable dependency state, build identity, connection state, and read-only state without secrets or sensitive data. | Authenticated readiness payload captured for the release candidate; public health probe separately recorded. | Technical — Pending; authenticated readiness currently unverified |
| OBS-02 | High | Every request/error log contains a correlation identifier, timestamp, severity, route/status, and duration; secrets, passwords, cookies, and sensitive payloads are redacted. | Sanitized log samples and redaction test. | Technical + Security — Pending |
| OBS-03 | High | Alerts exist and are tested for edge/API down, readiness failure, CPM connectivity/read-only violation, disk capacity, state-write failure, certificate expiry, and elevated 5xx rate. | Alert-rule export and fire/recovery test evidence. | Operations — Pending |
| OBS-04 | High | Approval, reopen, settings, authentication failure, and security-relevant events are audit-recorded with actor, timestamp, action, and immutable release/environment context. | Audit-event integration tests and sample audit report. | Product/data + Security — Pending |
| OBS-05 | Medium | Dashboards show request rate, latency, errors, container restarts, memory/CPU, disk, CPM pool/query health, and certificate expiry for the production environment. | Dashboard URL/export and timestamped screenshot. | Operations — Pending |

### F. Backup and recovery

| ID | Severity | Criterion / measurable threshold | Evidence and command | Owner / status |
|---|---|---|---|---|
| BAK-01 | Critical | Scheduled encrypted backups exist for `app-state.json`, HR state/documents, and ledger snapshots with approved retention and access controls. | Backup configuration, last-success evidence, encryption/access review. | Operations + Data — Pending |
| BAK-02 | Critical | A clean restore into an isolated environment recovers all critical state and passes integrity checks; measured RPO and RTO meet approved limits. Proposed defaults: RPO ≤ 24h, RTO ≤ 4h. | Restore drill log, hashes/counts, elapsed-time evidence, and post-restore smoke tests. | Operations + Product — Target pending approval |
| BAK-03 | Critical | Backup and restore do not include plaintext credentials, session cookies, private keys, or unnecessary personal data. | Backup content scan and secret-store separation evidence. | Security — Pending |
| BAK-04 | High | Recovery instructions identify an owner, prerequisites, exact commands, rollback/abort conditions, and escalation path; a second operator can execute them. | Reviewed recovery runbook and witnessed tabletop/drill. | Operations — Pending |

### G. Deployment and release control

| ID | Severity | Criterion / measurable threshold | Evidence and command | Owner / status |
|---|---|---|---|---|
| DEP-01 | Critical | CI passes dependency audit, server tests, production build, and release-contract tests for the exact source commit. | `.github/workflows/ci.yml`; `npm test`; `npm run build`; Python release tests. | Technical — Current baseline: supplementary suite has 1 failure |
| DEP-02 | Critical | Release preflight returns valid only when host key, TLS, Compose hash, read-only secret mounts, state backup, candidate, readiness, rollback manifest, and image digests all verify. | `evaluateReleasePreflight` output with zero blockers. | Operations + Security — Pending |
| DEP-03 | Critical | Candidate deployment is isolated from production, uses the intended immutable image/artifact, passes authenticated smoke and financial parity checks, and is explicitly promoted. | Candidate evidence package and promotion record. | Technical + Data — Pending |
| DEP-04 | Critical | Deployment is repeatable and reversible: configuration/migrations are versioned, previous release metadata is persisted, and rollback is tested before the production window. | Release manifest, deployment transcript, rollback drill. | Operations — Pending |
| DEP-05 | High | Production change window, approvers, communication plan, monitoring period, rollback trigger, and post-release review are recorded before execution. | Approved change ticket and release checklist. | Operations + Product — Pending |

### H. Support and operational readiness

| ID | Severity | Criterion / measurable threshold | Evidence / acceptance | Owner / status |
|---|---|---|---|---|
| SUP-01 | Critical | Named technical, product/data, security, and operations owners acknowledge this register and the residual-risk list. | Signed approval record with names, dates, and scope. | Stakeholders — **Not obtained** |
| SUP-02 | Critical | On-call coverage exists for the production window and defined support hours, including escalation contacts and response targets. | Published rota and escalation test. | Operations — Pending |
| SUP-03 | High | Runbooks exist for login failure, CPM outage, state-write failure, certificate expiry, disk exhaustion, deployment failure, rollback, backup restore, and credential compromise. | Reviewed runbook index and tabletop evidence. | Operations/Security — Pending |
| SUP-04 | High | User-facing release notes document changed workflows, known limitations, data freshness/provisional states, and support contact. | Product-approved release notes. | Product — Pending |
| SUP-05 | High | A support operator can reproduce health/readiness checks, inspect correlation IDs, locate relevant audit events, and collect redacted diagnostics without requesting secrets. | Witnessed support simulation. | Operations + Security — Pending |
| SUP-06 | Medium | Post-release review is scheduled within one business day and includes incidents, SLO measurements, rollback decision, and follow-up owners/dates. | Calendar/change record and review template. | Product + Operations — Pending |

## 3. Current known blockers from the baseline

The following prevent a `PRODUCTION_ACCEPTED` decision until resolved or formally approved:

1. Supplementary shared/client test suite has one reproducible failure: `shared/financialMetric.test.mjs` expects `400`, receives `1300`.
2. Authenticated readiness payload was not verified; only public health and unauthenticated `401` boundaries were tested.
3. Strict TLS trust/revocation validation is incomplete on the current Windows client.
4. Credential rotation and old-credential invalidation are not evidenced; no approved secret-store migration or rotation window was available.
5. Production backup/restore, monitoring alerts, performance thresholds, and failover behavior are not yet evidenced.
6. Component owners and stakeholder sign-off are not assigned in the inventory.

## 4. Stakeholder approval record

Approval must be recorded against this version or a later version with change notes.

| Role | Name | Decision | Date | Signature / ticket |
|---|---|---|---|---|
| Product owner | **Unknown** | Pending | — | — |
| Data/finance owner | **Unknown** | Pending | — | — |
| Technical/architecture owner | **Unknown** | Pending | — | — |
| Security owner | **Unknown** | Pending | — | — |
| Operations/production owner | **Unknown** | Pending | — | — |
| HR/data protection owner | **Unknown** | Pending | — | — |

**Release decision:** `NOT_ACCEPTED — CRITERIA_PROPOSED_PENDING_EVIDENCE_AND_STAKEHOLDER_APPROVAL`

## 5. Change control

Any threshold, severity, owner, or waiver change must update this file’s version, identify the approver, and preserve the prior decision in the release record. No criterion may be removed solely because it failed; use an explicit, approved scope change.
