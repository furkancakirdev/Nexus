# Nexus Release Risk Decision Register

> Decision date: 2026-09-10
> Scope: critical and high-severity findings from `threat-compliance-assessment.md` and the release-candidate evidence set.
> Status: `RELEASE_BLOCKED_PENDING_APPROVAL_AND_OPEN_EVIDENCE`
> Approval rule: no item is considered accepted without a named approver, expiry date, compensating control, and rollback/stop trigger.

## Decision summary

The repository implementation and disposable smoke/regression evidence close several code-level findings. They do **not** establish production approval. Product and technical approval are still pending, and the release remains blocked by open operational, database, security, privacy, and live-environment evidence.

| Decision | Count/status |
|---|---|
| Code-level control evidenced | Several controls closed for this release candidate |
| Residual risk formally accepted | 0 — no approver or expiry supplied |
| Open release blockers | Yes |
| Product approval | `PENDING` |
| Technical approval | `PENDING` |
| Security/privacy approval | `PENDING` |
| DBA/operations approval | `PENDING` |

## Critical and high finding decisions

| ID / domain | Severity | Evidence | Decision | Residual risk and compensating control | Owner | Expiry / trigger | Approval |
|---|---|---|---|---|---|---|---|
| Authentication/session handling | Critical | `server/auth.test.mjs`; full regression `690/690`; smoke login/logout evidence | **Code control closed; live rotation open** | Throttling, generic errors, signed/expiring sessions, CSRF/Origin and logout invalidation are tested. Credentials supplied outside the repository remain potentially exposed until rotated. Do not release with known old credentials. | Security + Operations | Immediate rotation; trigger on any credential exposure | Product: `PENDING`; Technical: `PENDING` |
| Authorization and IDOR boundaries | Critical | `server/hr/authorization.test.mjs`; HR capability/actor binding; integration `7/7`; smoke unauthorized `401` | **Code control evidenced; production wiring approval open** | Default-deny HR router, capability checks, authenticated actor binding, and negative tests. Direct production route composition and all role permutations still require sign-off. | Technical + Security | Trigger on any unauthorized response or route-wiring drift | Product: `PENDING`; Technical: `PENDING` |
| SQL injection / unsafe input / uploads | Critical | CPM fingerprint/read-only tests; document-store abuse tests; security scan pass; full regression | **Code control closed for tested paths** | Parameterized/allowlisted CPM queries and file magic-byte validation. Live SQL review and HR router deployment validation remain required. | Technical + DBA | Trigger on new query/upload path | Technical: `PENDING`; Security: `PENDING` |
| CPM read-only permissions and schema | Critical | `docs/database-inventory.md`; prior catalog probe timed out | **OPEN — release blocker** | Runtime read-only intent and fail-closed executor. No live effective-permission, schema, query-plan, or database connectivity evidence. Compensating control: no production cutover until DBA catalog/permission evidence is attached. | DBA | No expiry; blocks release until evidence passes | DBA: `PENDING`; Technical: `PENDING` |
| TLS/SSH trust and certificate validation | Critical | Environment baseline; strict TLS revocation check was not completed; release preflight requires `tlsVerified` and `hostKeyVerified` | **OPEN — release blocker** | Pinned host key and approved CA/SAN/fingerprint verification required before cutover. Never use `-k` or disable verification. | Operations + Security | Trigger on certificate/host-key change | Technical: `PENDING`; Security: `PENDING` |
| Secrets and credential invalidation | Critical | Repository scan clean; secret mounts documented; no rotation/invalidation evidence | **OPEN — release blocker** | Keep secrets outside source control and mounted read-only. Rotate SSH, CPM, Nexus, ERP and TLS-related credentials through an approved secret store; verify old values are rejected without recording them. | Security + Operations | Immediate; trigger on any suspected exposure | Security: `PENDING`; Operations: `PENDING` |
| Audit logging / alerting / correlation | High | `server/diagnostics.mjs`; observability tests; `docs/observability-dashboard-and-alerts.md` | **Partially closed; operational delivery open** | Correlation IDs, sanitized structured errors, auth/dependency counters and protected metrics exist. Metrics are process-local; external dashboard, retention, alert delivery and owner are not proven. | Operations | Trigger on restart or metric delivery failure | Technical: `PENDING`; Operations: `PENDING` |
| Privacy, HR data access, retention and deletion | Critical | HR authorization tests; no retention/deletion/encryption evidence | **OPEN — release blocker** | Capability checks and file upload validation reduce exposure. No approved HR retention schedule, deletion process, encryption-at-rest evidence, DPA/legal review, or access review is attached. | Privacy/Legal + HR | No expiry; blocks HR production release | Privacy: `PENDING`; HR: `PENDING` |
| Backup restore and disaster recovery | Critical | `backup-disaster-recovery.md`; isolated archive restore passed | **Partially evidenced; open blocker** | One archive restored into a temporary directory. Schedule, retention, encryption, restore permissions, CPM backup, RPO and RTO remain unverified. | Operations + DBA | Trigger on backup failure or restore test expiry | Operations: `PENDING`; DBA: `PENDING` |
| Performance/capacity/database waits | High | Local health load report; optimization assessment | **OPEN — production evidence missing** | Local synthetic health load passed, but authenticated workflows, CPM latency, waits, pool utilization, CPU/memory limits and production-scale capacity are unverified. | Technical + DBA | Trigger when budgets are exceeded | Technical: `PENDING`; DBA: `PENDING` |
| Deployment, rollback and migrations | Critical | Release runner/preflight; deployment runbook; no production execution | **Procedure evidenced; execution open** | Immutable manifest/digest, candidate smoke checks and rollback metadata are required. No approved cutover rehearsal, migration environment, or rollback execution evidence exists. | Release/Operations | Trigger on preflight blocker or smoke failure | Technical: `PENDING`; Operations: `PENDING` |
| Regression, browser, accessibility and compatibility | High | Full regression `690/690`, integration `7/7`, build/quality gates; browser harness absent | **Automated code checks closed; release evidence open** | Automated tests and build pass. Browser E2E, accessibility runner, supported-browser matrix and authenticated production-like reporting remain unverified. | QA + Product | Trigger on supported-browser failure | QA: `PENDING`; Product: `PENDING` |
| Data quality and financial provenance | Critical | Data-quality report; live profile blocked; smoke overview failed closed without CPM | **OPEN — release blocker** | Fail-closed/quarantine behavior prevents fabricated output. Null/duplicate/orphan/format/stale/anomaly metrics and financial source provenance require approved read-only DBA run and review. | Data + Finance + DBA | No expiry; blocks financial release | Finance: `PENDING`; Data: `PENDING` |

## Closed-control evidence index

The following are evidence-backed implementation outcomes, not production approvals:

- Unit/server regression: `docs/audit/2026-09-09/full-regression-release-candidate.md`.
- Production-like disposable smoke: `docs/audit/2026-09-09/production-like-smoke-test.md`.
- Backup archive restore rehearsal: `docs/audit/2026-09-09/backup-disaster-recovery.md`.
- Security findings and remediation mapping: `docs/security/threat-compliance-assessment.md` and `docs/security/remediation-backlog.md`.
- Deployment and rollback procedure: `docs/deployment-rollback-runbook.md`.
- Observability contract: `docs/observability-dashboard-and-alerts.md`.

## Required approval record

An approver must complete each field; blank fields are not acceptance:

| Role | Name/identity | Decision (`approve`/`reject`/`conditional`) | Conditions or compensating controls | Expiry | Signature/date |
|---|---|---|---|---|---|
| Product owner | `TBD` | `PENDING` | — | — | — |
| Technical owner | `TBD` | `PENDING` | — | — | — |
| Security owner | `TBD` | `PENDING` | — | — | — |
| Privacy/Legal owner | `TBD` | `PENDING` | — | — | — |
| DBA/data owner | `TBD` | `PENDING` | — | — | — |
| Operations/release owner | `TBD` | `PENDING` | — | — | — |
| QA owner | `TBD` | `PENDING` | — | — | — |

## Release decision

`NO-GO` until all critical blockers have passing evidence or a formally approved, time-bounded exception with compensating controls and rollback triggers. No such exception has been provided in this register. No production deployment, credential replay, database write, or live cutover was performed by this task.
