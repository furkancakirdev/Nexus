# Marlin Nexus — Prioritized Remediation Backlog

> Created: 2026-09-09  
> Source: `docs/security/threat-compliance-assessment.md`, `docs/production-acceptance-criteria.md`, `docs/architecture-current-state.md`, and baseline evidence.  
> Status: `OPEN`; no item is considered complete without the evidence listed below.  
> Owner names are `TBD` until stakeholder assignment; role owners are the minimum required accountable role.

## Release policy

- `Release-blocking: Yes` means production deployment is prohibited until the acceptance criterion passes or an explicitly approved exception names an owner, expiry, compensating control, and rollback trigger.
- Dependencies are backlog IDs, not informal sequencing. Evidence must be attached to the release record and must not contain secret values or personal data beyond the minimum necessary.
- Priority order: **P0 Critical**, **P1 High**, **P2 Medium**.

## Prioritized backlog

| ID | Priority | Title | Impact | Owner | Depends on | Release-blocking |
|---|---|---|---|---|---|---|
| RB-001 | P0 | Assign security, privacy, DBA, technical, operations, and product owners | Unowned controls cannot be accepted, escalated, or risk-accepted. | Product owner (TBD) | — | Yes |
| RB-002 | P0 | Migrate and rotate exposed credentials | Exposed SSH, CPM, Nexus, ERP, and TLS credentials may permit unauthorized access. | Security/Operations (TBD) | RB-001 | Yes |
| RB-003 | P0 | Prove old credentials are invalidated | Rotation without revocation evidence leaves known credentials usable. | Security/Operations (TBD) | RB-002 | Yes |
| RB-004 | P0 | Enforce fail-closed HR authorization wiring | A missing capability callback can allow HR routes to continue without the intended authorization check. | Backend/Technical owner (TBD) | RB-001 | Yes |
| RB-005 | P0 | Define and test the HR capability matrix | HR employee, payroll, leave, attendance, and document access need least-privilege boundaries. | Product + HR data owner (TBD) | RB-004 | Yes |
| RB-006 | P0 | Verify CPM effective permissions and live schema metadata | Code-level read-only intent does not prove the database principal lacks write, execute, grant, or DDL rights. | DBA (TBD) | RB-001 | Yes |
| RB-007 | P0 | Establish HR privacy, retention, and document lifecycle controls | Employee and salary data/documents lack evidenced purpose, lawful basis, access review, encryption, retention, and deletion controls. | Privacy owner (TBD) | RB-001, RB-005 | Yes |
| RB-008 | P0 | Complete backup, restore, RPO/RTO, and failover validation | File-backed state, HR documents, ledger snapshots, and TLS configuration are vulnerable to host/storage failure without recovery evidence. | Operations (TBD) | RB-001 | Yes |
| RB-009 | P0 | Complete strict TLS validation and renewal monitoring | Certificate trust, SAN/chain validation, revocation behavior, and expiry alerting are not proven. | Operations/Security (TBD) | RB-001 | Yes |
| RB-010 | P0 | Implement centralized redacted security and audit logging | Local/domain events are insufficient for detection, retention, tamper response, and incident investigation. | Platform/Security (TBD) | RB-001, RB-007 | Yes |
| RB-011 | P1 | Add authentication abuse controls | Missing rate limiting, lockout/alerting, and MFA decision evidence increases account-takeover risk. | Backend/Security (TBD) | RB-001, RB-002 | Yes |
| RB-012 | P1 | Harden HR and API input validation | Inconsistent schemas, upload checks, and public error handling can enable malformed input, resource abuse, or disclosure. | Backend (TBD) | RB-004, RB-005 | Yes |
| RB-013 | P1 | Secure HR file upload and download handling | Extension checks and basename normalization do not prove content safety, malware handling, record authorization, or encrypted storage. | Backend/Privacy (TBD) | RB-007, RB-012 | Yes |
| RB-014 | P1 | Remove raw internal errors from public responses | Returning `err.message` may disclose paths, SQL details, validation internals, or other sensitive implementation data. | Backend (TBD) | RB-012 | Yes |
| RB-015 | P1 | Define and deploy security headers and browser policy | Missing HSTS, CSP, frame, content-type, and referrer policy evidence leaves browser-facing attack surface unbounded. | Frontend/Platform (TBD) | RB-009 | Yes |
| RB-016 | P1 | Implement observability, alerting, and incident runbooks | Readiness and public health checks alone do not detect auth abuse, 5xx, disk, TLS, CPM, or state failures. | Operations/Security (TBD) | RB-008, RB-010 | Yes |
| RB-017 | P1 | Resolve the supplementary test failure | A known regression (`shared/financialMetric.test.mjs`) prevents a clean release baseline. | QA/Backend (TBD) | — | Yes |
| RB-018 | P1 | Generate SBOM and release provenance | Dependency audit and build success do not provide complete component inventory or artifact provenance. | Build/Platform (TBD) | RB-017 | Yes |
| RB-019 | P1 | Verify authenticated readiness and release preflight | Current public probes prove reachability and unauthenticated boundaries, not authenticated readiness or all preflight gates. | Release/Operations (TBD) | RB-002, RB-006, RB-008, RB-009, RB-016, RB-018 | Yes |
| RB-020 | P1 | Run performance, capacity, and resilience validation | No measured latency, throughput, concurrency, soak, or CPM degradation thresholds are evidenced. | QA/Platform (TBD) | RB-006, RB-016 | Yes |
| RB-021 | P1 | Review administrative access and perform periodic access attestation | Admin, SSH, DB, Caddy, and break-glass access lacks named ownership, MFA/short-lived key policy, and review evidence. | Security/Operations (TBD) | RB-001, RB-002 | Yes |
| RB-022 | P2 | Define retention and deletion jobs for operational artifacts | Logs, audit events, snapshots, backups, and runtime state may accumulate beyond approved retention. | Operations/Privacy (TBD) | RB-007, RB-010 | No, unless legally required |
| RB-023 | P2 | Add security regression and negative authorization coverage | Existing unit coverage must be supplemented with cross-origin, replay, IDOR, unknown-role, upload, and disclosure tests. | QA/Security (TBD) | RB-004, RB-005, RB-012, RB-013, RB-014 | Yes |
| RB-024 | P1 | Obtain stakeholder sign-off and close release exceptions | Technical completion without product, privacy, security, DBA, and operations approval is not production acceptance. | Product owner (TBD) | RB-003, RB-005, RB-006, RB-007, RB-008, RB-009, RB-010, RB-016, RB-017, RB-019, RB-020, RB-021, RB-023 | Yes |

## Action specifications and acceptance evidence

### RB-001 — Assign control owners

- **Action:** Name accountable individuals for security, privacy/data protection, DBA/CPM, technical, operations/incident, QA, and product/data roles; record escalation and backup contacts.
- **Evidence:** Updated sign-off tables in the acceptance and assessment documents plus an approved ticket or roster.
- **Acceptance criterion:** Every P0/P1 item has exactly one accountable owner and one escalation path; no `TBD` owner remains for a release-blocking item.

### RB-002 — Credential migration and rotation

- **Action:** Move SSH, CPM, Nexus, ERP, and TLS secrets to the approved secret store; remove plaintext values from operator workflows and rotate them within an approved window.
- **Evidence:** Secret-store object IDs, rotation timestamps, permissions, and status only; never secret values.
- **Acceptance criterion:** New credentials authenticate through the approved path; repository, image, logs, shell history review, and deployment manifests contain no active secret values.

### RB-003 — Old credential invalidation

- **Action:** Revoke old keys/passwords/certificates after cutover and test rejection through non-logging checks.
- **Evidence:** Redacted status/timestamp results for each credential class and revocation mechanism.
- **Acceptance criterion:** Every old credential class returns rejection/invalid status and no service outage remains after the test.

### RB-004 — Fail-closed HR authorization

- **Action:** Make HR router construction require a capability callback and fail startup or registration when it is absent; wire it through the production composition root.
- **Evidence:** Code review, startup test, and route tests.
- **Acceptance criterion:** Missing capability injection cannot register an accessible HR route; unauthenticated requests return `401`, insufficient capability returns `403`.

### RB-005 — HR capability matrix

- **Action:** Define capabilities for employee, payroll, leave, attendance, and document operations, including record-level scope and admin separation.
- **Evidence:** Approved matrix and positive/negative endpoint test report.
- **Acceptance criterion:** Unknown roles receive no HR access; each endpoint has one documented required capability and tests for allow/deny behavior.

### RB-006 — CPM permissions and catalog

- **Action:** Run the read-only DBA catalog query from `docs/database-inventory.md`; verify principal permissions and reconcile schemas, tables, views, procedures, jobs, indexes, FKs, and consumers.
- **Evidence:** Redacted DBA report with object names, permission classes, query timestamp, and connection identity class.
- **Acceptance criterion:** Runtime principal has only approved read permissions; no write/DDL/grant/execute path is present unless explicitly approved and risk-accepted.

### RB-007 — HR privacy and lifecycle

- **Action:** Approve data inventory, purpose/lawful basis, minimization, access review, encryption, retention, deletion, subject request, and breach procedures.
- **Evidence:** Data-protection register, policy links, access review, and sanitized lifecycle test.
- **Acceptance criterion:** Every HR data/document category has an owner, purpose, retention period, deletion/legal-hold behavior, and tested access boundary.

### RB-008 — Recovery validation

- **Action:** Back up application state, HR documents, ledger snapshots, deployment metadata, and required database evidence; restore into an isolated environment and execute rollback/failover drill.
- **Evidence:** Backup IDs/checksums, restore logs, measured RPO/RTO, and rollback result without sensitive payloads.
- **Acceptance criterion:** Restore completes within approved RTO, data loss is within RPO, checksums validate, and rollback is executable by the on-call owner.

### RB-009 — TLS validation

- **Action:** Validate certificate chain, SAN, expiry, revocation/renewal behavior, and monitoring using a supported strict client; document internal network trust boundary.
- **Evidence:** Redacted certificate metadata, strict verification output, renewal test, and alert test.
- **Acceptance criterion:** Strict validation succeeds for the production hostname/IP policy, expiry alert fires before threshold, and private keys are never exposed.

### RB-010 — Centralized audit/security logging

- **Action:** Define event taxonomy and correlation IDs; centralize authentication, authorization, mutation, security, readiness, and CPM boundary events with redaction and append-only controls.
- **Evidence:** Log destination/configuration, redaction tests, retention policy, and tamper/alert test.
- **Acceptance criterion:** Required events are searchable within the operational SLA, contain actor/time/request context, omit secrets/HR payloads, and cannot be silently altered by the app service account.

### RB-011 — Authentication abuse controls

- **Action:** Add rate limiting, lockout/backoff, failure alerting, and an approved MFA approach for administrative accounts.
- **Evidence:** Automated abuse tests, alert delivery, and MFA/access policy.
- **Acceptance criterion:** Repeated failures are throttled/blocked, alerts are generated, sessions cannot be replayed after logout/expiry, and admin MFA policy is enforced or explicitly risk-accepted.

### RB-012 — Input validation

- **Action:** Apply explicit schemas, bounds, content types, size limits, and stable public errors to HR JSON, query parameters, and uploads.
- **Evidence:** Negative test suite and validation coverage report.
- **Acceptance criterion:** Malformed, oversized, unknown-field, traversal, and injection payloads are rejected without stack/path/secret disclosure.

### RB-013 — Secure file handling

- **Action:** Validate file signatures, quarantine/scan uploads, enforce record authorization, encrypt storage, and implement controlled download/deletion.
- **Evidence:** Upload/download security tests, scan results, storage permission review, and lifecycle evidence.
- **Acceptance criterion:** Disallowed content is rejected/quarantined; unauthorized users cannot read documents; encrypted-at-rest and deletion behavior are verified.

### RB-014 — Safe public errors

- **Action:** Replace raw `err.message` responses with stable codes/messages and server-side correlated details.
- **Evidence:** Code search, API snapshot tests, and log redaction tests.
- **Acceptance criterion:** All public 4xx/5xx responses contain no filesystem paths, SQL, stack traces, credentials, cookies, or HR payloads.

### RB-015 — Browser security headers

- **Action:** Define and configure HSTS, CSP, frame, content-type, referrer, and permissions policies compatible with the UI.
- **Evidence:** Strict response-header capture and browser regression report.
- **Acceptance criterion:** Required headers are present on HTML/API responses with approved values and no critical CSP violations.

### RB-016 — Observability/runbooks

- **Action:** Add dashboards/alerts for auth failures, readiness, 5xx, CPM connectivity/read-only violations, disk, TLS expiry, state writes, and backup failures; publish incident runbooks.
- **Evidence:** Alert rule IDs, fired-alert timestamps, dashboard links, and tabletop/runbook result.
- **Acceptance criterion:** Each critical signal alerts the on-call route within the defined SLA and the runbook identifies diagnosis, mitigation, escalation, and rollback.

### RB-017 — Supplementary test failure

- **Action:** Fix the `shared/financialMetric.test.mjs` mismatch or document an approved behavior change with updated tests.
- **Evidence:** `node --test shared/*.test.mjs src/*.test.mjs` output and reviewed change rationale.
- **Acceptance criterion:** Supplementary suite passes with zero failures, or an approved exception is attached with owner, expiry, and rollback trigger.

### RB-018 — SBOM/provenance

- **Action:** Generate dependency SBOM, pin build inputs, retain artifact digest/signature/provenance, and review high/critical advisories.
- **Evidence:** SBOM, `npm audit` output, image/artifact digest, and CI run for the release commit.
- **Acceptance criterion:** SBOM matches the shipped artifact; no unaccepted high/critical advisory remains; provenance identifies source commit and builder.

### RB-019 — Authenticated readiness/preflight

- **Action:** Run release preflight with verified host key, TLS, Compose hash, read-only secret mounts, backup, candidate, readiness, and rollback manifest.
- **Evidence:** `evaluateReleasePreflight`/readiness payload, signed manifest, and redacted authenticated probe.
- **Acceptance criterion:** Preflight returns `valid: true`, readiness returns `ready: true`, and no unapproved blocker is present.

### RB-020 — Performance/resilience

- **Action:** Execute load, spike, soak, dependency-failure, and CPM degradation tests against production-like infrastructure.
- **Evidence:** Test plans/results with latency percentiles, throughput, errors, resource saturation, and recovery times.
- **Acceptance criterion:** Approved p95/p99/error/concurrency/RTO thresholds pass for critical journeys with no data-integrity regression.

### RB-021 — Administrative access attestation

- **Action:** Review admin roles, SSH keys, DB principals, Caddy access, break-glass procedures, MFA, key lifetime, and quarterly recertification.
- **Evidence:** Redacted access roster, owner approvals, key age/status, and revocation drill.
- **Acceptance criterion:** Every privileged identity is named, justified, least-privileged, MFA-protected where supported, time-bounded or reviewed, and revocation is tested.

### RB-022 — Retention/deletion operations

- **Action:** Implement or schedule approved deletion/archival for logs, audit events, snapshots, backups, runtime state, and HR documents with legal holds.
- **Evidence:** Policy, job configuration, dry-run/result counts, and legal-hold test.
- **Acceptance criterion:** Artifacts leave active retention on schedule, protected records are retained under hold, and deletion is auditable without recovering deleted content.

### RB-023 — Security regression suite

- **Action:** Add automated negative tests for cross-origin mutation, CSRF replay, IDOR, unknown roles, HR routes, upload bypass, SQL injection, path traversal, and error disclosure.
- **Evidence:** CI test output and coverage mapping to TC-01–TC-17.
- **Acceptance criterion:** All critical/high security cases pass on every release candidate and test fixtures contain no live secrets or personal data.

### RB-024 — Stakeholder acceptance

- **Action:** Review evidence with product, security, privacy, DBA, technical, QA, and operations owners; record residual risks and formal exceptions.
- **Evidence:** Signed acceptance record or ticket links, completed criteria register, and exception approvals.
- **Acceptance criterion:** All release-blocking items pass or have valid time-bounded exceptions; every owner signs; release decision changes from `NOT_ACCEPTED` only through the documented gate.

## Current status snapshot

- **Open release blockers:** RB-001 through RB-021, RB-023, RB-024.
- **Open non-blocking-by-default item:** RB-022 (becomes blocking when required by law, contract, or the approved privacy policy).
- **Known baseline blocker:** supplementary suite has one existing failure (`shared/financialMetric.test.mjs`); tracked by RB-017.
- **Known evidence blockers:** authenticated readiness, strict TLS validation, live CPM catalog/permissions, backup/restore, performance, centralized alerting, credential rotation/invalidation, and stakeholder sign-off.
- **No production changes were performed by this backlog task.**
