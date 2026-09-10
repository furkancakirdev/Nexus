# Marlin Nexus — Operations and Support Handover

> Version: 1.0
> Prepared: 2026-09-10
> Status: `HANDOVER_DRAFT_PENDING_NAMED_OPERATORS`
> Release status: `NO-GO` until the release-risk register is approved

This pack is the operator-facing index for incident response, deployment, rollback, backup recovery, monitoring, access management, troubleshooting, escalation, and routine maintenance. It contains no credentials or secret values.

## 1. Named ownership and escalation

The repository does not define individual operators. Assign named people before handover:

| Function | Primary | Secondary | Required access |
|---|---|---|---|
| Product owner / release approver | `TBD` | `TBD` | Release evidence and acceptance register |
| Technical owner / application on-call | `TBD` | `TBD` | Repository, CI, host process/container |
| Operations / infrastructure | `TBD` | `TBD` | SSH, Docker/Compose, TLS certificate deployment, monitoring |
| DBA / CPM owner | `TBD` | `TBD` | Read-only CPM metadata and approved SQL operations |
| Security / privacy | `TBD` | `TBD` | Credential rotation, incident response, privacy decisions |
| QA / release verifier | `TBD` | `TBD` | CI, smoke, accessibility, rollback evidence |
| HR/data owner | `TBD` | `TBD` | HR data access, retention and deletion decisions |

Escalation must use the organization’s approved incident channel; the channel, paging policy, service hours, and severity SLA are currently `TBD`.

## 2. First-response incident procedure

1. Record UTC time, reporter, impact, affected environment, last known good release, and correlation ID(s).
2. Classify severity: security/privacy, data integrity, availability, performance, or deployment failure.
3. Check `/healthz`, authenticated `/api/readiness`, `/api/health`, and protected `/api/metrics` without copying cookies, credentials, SQL, or business rows into tickets.
4. Freeze releases and state-changing operations when data integrity, authorization, or credential exposure is suspected.
5. Preserve sanitized logs and timestamps; do not restart or delete evidence before the technical owner approves it.
6. Escalate to the role in the ownership table and record the decision, mitigation, owner, and next update time.
7. Close only after impact, root cause, corrective action, verification evidence, and follow-up backlog item are recorded.

Security or credential exposure incidents require immediate secret-store/security escalation and credential rotation; never test exposed credentials in a production system.

## 3. Deployment and rollback

Use `docs/deployment-rollback-runbook.md` as the authoritative procedure:

- Confirm release-risk register is `GO` and all required approvals are recorded.
- Run CI quality gates, build the immutable artifact, verify SHA-256 and image digest, and validate the release manifest.
- Inject configuration through the approved secret store and read-only secret mounts; never put values in command history, tickets, logs, or artifacts.
- Deploy a candidate, run smoke/readiness/authorization checks, then obtain cutover approval.
- Monitor health, error rate, authentication failures, latency, and CPM dependency status during the observation window.
- Trigger rollback on failed readiness, sustained error/latency budget breach, data-integrity concern, authorization regression, or an explicit release-owner decision.
- Roll back to the recorded previous image/artifact digest using the runbook; do not improvise a rebuild during an incident.

The current release report is `docs/audit/2026-09-10/final-release-report.md` and records `NO-GO`; no production cutover has been authorized.

## 4. Backup restore and disaster recovery

Use `docs/audit/2026-09-09/backup-disaster-recovery.md`:

1. Obtain incident commander and DBA/operations approval.
2. Identify the backup timestamp and verify archive checksum and source environment.
3. Restore first into an isolated path or database; never overwrite live data during a test.
4. Validate expected application state, HR state, ledger snapshots, file counts, and JSON integrity.
5. Record restore start/end times, recovered artifact/version, failures, and data-loss estimate.
6. Promote restored data only through an approved recovery decision and migration/compatibility check.

Backup schedule, retention, encryption/key management, CPM database restore, RPO, and RTO remain unverified. The prior isolated archive restore is evidence of archive readability only, not disaster-recovery acceptance.

## 5. Monitoring and alert response

Use `docs/observability-dashboard-and-alerts.md`:

- Liveness: `/healthz`.
- Dependency/health: `/api/health`.
- Release readiness: authenticated `/api/readiness`.
- Aggregate metrics: capability-protected `/api/metrics`.
- Request correlation: `X-Correlation-Id`.

Initial response by alert:

| Alert | Immediate checks | Escalate when |
|---|---|---|
| `NexusDown` | Process/container, recent release, host resources | Two consecutive failed liveness probes or restart loop |
| `NexusNotReady` | Readiness blockers, release manifest, dependency state | Blocker persists or cutover is in progress |
| `CpmUnavailable` | Network, SQL availability, read-only identity, pool errors | Dependency failures increase across three scrapes |
| `AuthFailureSpike` | Account lockouts, access changes, suspicious source patterns | Abuse or credential exposure is suspected |
| `LatencyRegression` | Event loop, CPU/memory, pool waits, query plans | Approved performance budget is exceeded for five minutes |

Metrics are currently process-local and reset on restart; durable dashboard storage and alert ownership are `TBD`.

## 6. Access management

- Grant least privilege by role and capability; UI visibility is not an authorization boundary.
- Use approved secret storage, short-lived access where available, and named operator accounts.
- Review SSH, host, Docker, TLS, CPM, Nexus administrator, and HR access on joiner/mover/leaver events.
- Rotate credentials immediately after exposure or ownership change and verify old credentials are rejected without logging secret values.
- Never share passwords in chat, source, `.env` files, shell history, tickets, screenshots, or logs.
- Record access grants/revocations as an audit event with actor, scope, reason, and timestamp.
- Current credential rotation/invalidation evidence is incomplete; the security owner must close it before release.

## 7. Troubleshooting quick reference

| Symptom | First checks | Do not do |
|---|---|---|
| Login failures | `/api/session`, auth-failure metrics, lockout state, clock/origin | Do not log or paste passwords/cookies |
| 401/403 on expected route | Session expiry, capability mapping, CSRF/Origin for mutation | Do not bypass middleware or rely on frontend hiding |
| CPM unavailable | `/api/health`, network/SQL availability, pool timeout, read-only permissions | Do not enable writes or bypass query fingerprints |
| Empty/review financial result | Source provenance, evidence status, readiness blockers | Do not substitute guessed zeros or recompute official values in UI |
| Slow reporting | Request latency, pool waits, query plan evidence, resource pressure | Do not add indexes/SQL rewrites without measured plans |
| State write failure | Disk capacity/permissions, atomic temp file, backup state | Do not delete state or retry destructive writes blindly |
| Deployment failure | Preflight output, image/artifact digest, readiness and smoke results | Do not cut over with failed gates |
| HR document failure | MIME/magic-byte validation, size limit, storage permissions | Do not accept spoofed content or expose filesystem paths |

## 8. Routine maintenance

| Cadence | Activity | Owner | Evidence |
|---|---|---|---|
| Every release | CI gates, dependency audit, artifact digest, smoke/readiness, rollback metadata | Technical owner + QA | Release report |
| Daily during operation | Liveness, readiness, CPM state, auth-failure and latency alerts | Operations | Dashboard/alert record |
| Weekly | Review error/correlation samples, disk usage, backup completion, failed logins, pending risks | Operations + Security | Operations review |
| Monthly | Restore rehearsal, access review, dependency update review, certificate expiry check, RPO/RTO review | Operations + DBA + Security | Signed maintenance record |
| On incident | Evidence preservation, impact assessment, rollback/recovery decision, postmortem | Incident commander | Incident record |

The repository does not currently define a backup scheduler, certificate-renewal automation, durable metrics retention, or a migration framework; owners must provide those controls before treating the cadence as operationally complete.

## 9. Handover acceptance checklist

A named operator must check each item and attach evidence:

- [ ] Primary and secondary operators assigned for every role.
- [ ] Incident channel, paging policy, severity SLA, and maintenance window recorded.
- [ ] Approved secret store and credential rotation procedure verified.
- [ ] Deployment and rollback rehearsal completed in an isolated environment.
- [ ] Backup schedule, retention, encryption, restore permissions, RPO, and RTO approved.
- [ ] Dashboard, scrape authentication, alert routing, and metric retention configured.
- [ ] CPM read-only permissions and schema/query-plan evidence signed by DBA.
- [ ] Browser/accessibility and production-like authenticated smoke evidence accepted by QA.
- [ ] Product, Technical, Security/Privacy, DBA/Data, Operations, and QA approvals recorded.

**Current handover decision:** `PENDING_NAMED_OPERATORS_AND_EVIDENCE`; this document is a handover draft, not proof that production support readiness or release approval has been achieved.
