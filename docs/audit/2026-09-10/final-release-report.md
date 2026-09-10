# Nexus Controlled Production Release Report

> Report date: 2026-09-10
> Release candidate: current checkout and evidence set
> Decision: `NO-GO — RELEASE NOT EXECUTED`
> Window status: `BLOCKED_PENDING_APPROVAL_AND_LIVE_EVIDENCE`

## Executive decision

The controlled production release was **not executed**. The release-risk register is explicitly `NO-GO`, with product, technical, security, privacy, DBA/data, operations, and QA approvals still pending. The release runner is intentionally plan/preflight-only and does not perform deployment or rollback execution.

No SSH deployment, container restart, cutover, migration, rollback, CPM database write, credential replay, or production-state mutation was performed.

## Gate review

| Gate | Evidence | Status | Release impact |
|---|---|---|---|
| Automated regression | `docs/audit/2026-09-09/full-regression-release-candidate.md` | PASS for configured local checks | Does not replace live approval |
| Disposable smoke | `docs/audit/2026-09-09/production-like-smoke-test.md` | PASS with expected unavailable-CPM blocker | Live reporting remains unverified |
| Security findings | `docs/security/threat-compliance-assessment.md` and remediation backlog | Critical/high residual findings remain | Blocking |
| Risk acceptance | `docs/security/release-risk-register.md` | No approved exceptions | Blocking |
| CPM connectivity/permissions/schema | Database inventory and attempted metadata probe | Unverified; prior connection timed out | Blocking |
| TLS/SSH trust | Environment baseline and preflight contract | Strict verification incomplete | Blocking |
| Credential rotation/invalidation | Credential remediation record | No evidence | Blocking |
| Backup/DR | `docs/audit/2026-09-09/backup-disaster-recovery.md` | Isolated archive restore passed; schedule/RPO/RTO incomplete | Blocking |
| Performance/capacity | Local load report and optimization assessment | Production/CPM metrics unavailable | Blocking |
| Browser/accessibility/compatibility | Regression report | No configured browser harness | Blocking for final acceptance |
| Stakeholder approvals | Release-risk register approval table | All required roles pending | Blocking |

## Success metrics and deviations

No production success metrics were collected because no production window was opened. The following local evidence remains available for a future approved window:

- Unit/server regression: 690/690 passed.
- Integration suite: 7/7 passed.
- Coverage thresholds: passed.
- Build, format, syntax/lint, typecheck gate, and secret scan: passed.
- Dependency audit: 0 high-severity vulnerabilities.
- Disposable local smoke: login, session, permissions, CSRF-protected logout, liveness, and protected metrics passed; overview correctly failed closed without CPM.
- Disposable local load baseline/peak/soak: passed for the health surface only.

Deviation: the evidence is local/disposable and cannot establish production readiness, live CPM reporting correctness, or operational failover.

## Rollback status

- **Rollback executed:** No.
- **Rollback required:** No, because cutover did not occur.
- **Rollback artifact verification:** Procedure and manifest requirements are documented in `docs/deployment-rollback-runbook.md` and `server/releasePreflight.mjs`; a production rollback rehearsal was not performed.
- **Active production release changed:** No.

## Conditions to reopen the release window

1. Obtain named product and technical approval, plus security/privacy, DBA/data, operations/release, and QA sign-off.
2. Attach live CPM connectivity, effective SELECT-only permissions, schema, query-plan, and sanitized data-quality evidence.
3. Complete SSH host-key and TLS CA/SAN/fingerprint verification without bypasses.
4. Rotate exposed credentials through an approved secret store and verify old credentials are rejected without recording values.
5. Define and evidence backup schedule, retention, encryption, restore permissions, RPO, and RTO.
6. Run a production-like candidate deployment and rollback rehearsal with immutable artifact/image/config digests.
7. Complete authenticated reporting smoke tests and monitoring/alert delivery verification.
8. Resolve or formally accept every remaining critical/high risk with a named owner, compensating control, expiry, and rollback trigger.

## Final status

`RELEASE_BLOCKED`

This report records a controlled refusal to deploy, not a successful production release. The next release attempt must use the runbook and satisfy the risk register before any live mutation is authorized.
