# Marlin Nexus — Threat and Compliance Assessment

> Assessment date: 2026-09-09  
> Scope: repository implementation, deployment configuration, captured non-mutating probes, and existing test/baseline evidence.  
> Method: source review and control-evidence review against OWASP-style application security expectations, least privilege, privacy-by-design, and operational security requirements.  
> Status: `NOT_COMPLIANT_FOR_PRODUCTION_RELEASE`; this is not a regulatory certification or legal opinion.

## 1. Executive decision

Nexus has meaningful fail-closed controls for session authentication, capability authorization on the wired routes, CSRF/Origin checks, parameterized/fingerprinted CPM reads, path-traversal-resistant document lookup, secret exclusion from release archives, and atomic state writes. Production acceptance is **blocked** because critical controls are either incomplete or lack evidence: HR authorization wiring, credential rotation/invalidation, strict TLS trust, effective CPM permissions, centralized security logging/alerting, privacy/retention controls, backup/restore, and administrative access governance.

No destructive exploit testing, credential replay, database write, secret-file read, or production mutation was performed.

## 2. Severity and evidence rules

- **Critical:** release-blocking; fix and attach evidence before production.
- **High:** fix before release or obtain time-bounded written risk acceptance with owner, compensating control, expiry, and rollback trigger.
- **Medium:** track with owner and due date; may be released only if no critical/high dependency exists.
- `Confirmed` means supported by source/config/test evidence. `Unverified` means the control may exist but production evidence or wiring is absent. `Finding` means a weakness or release gap requiring action.

## 3. Findings register

| ID | Area | Severity | Finding / evidence | Required remediation and verification |
|---|---|---:|---|---|
| TC-01 | Authentication | High | `server/auth.mjs` uses signed HMAC session cookies, expiry, secure cookie behavior behind HTTPS, and fail-closed provider requirements. Brute-force/rate-limit protection and MFA are not evidenced. | Add/test login throttling, lockout/alerting, and the approved MFA decision; verify repeated failures do not enable abuse. |
| TC-02 | Authorization | Critical | Global API auth boundary is confirmed, and capability middleware is fail-closed. HR router has a permissive fallback (`next()`) when `requireCapability` is not injected, and no `createHrRouter`/`/api/hr` wiring was found in `server/index.mjs` search. This is an authorization wiring gap, not a claim of live exploitability. | Ensure production HR registration always injects a fail-closed capability function; fail startup if absent. Add route tests proving unauthenticated requests return `401`, insufficient capability returns `403`, and unknown roles cannot access HR. |
| TC-03 | Authorization | High | Role map contains `admin`, `reporting`, and `operational`; unknown roles receive no capabilities. HR-specific capabilities are not represented in `server/capabilities.mjs`. | Define and review an HR capability matrix, least-privilege roles, object/employee-level scope, and negative tests for every HR endpoint. |
| TC-04 | CSRF / session integrity | Confirmed with evidence gap | Mutations require CSRF cookie/header equality and configured Origin; session cookies use `HttpOnly`, `SameSite=Strict`, and `Secure` when HTTPS is detected. Authenticated end-to-end evidence is incomplete. | Run authenticated browser/API tests for every mutating route, including cross-origin, missing token, replayed token, and logout cases. |
| TC-05 | Secrets | Critical | Supplied credentials were treated as compromised input; repository scan found no matching plaintext values. `.gitignore` and release allowlist exclude common secret roots. Live secret store migration, rotation, and old-credential invalidation are not completed. | Rotate SSH/CPM/Nexus/ERP/TLS secrets through an approved store; test old credentials rejected; attach only timestamp/status evidence. |
| TC-06 | Secrets / process exposure | High | Compose requires session secret/password hash and mounts secret files read-only, but host-managed secret permissions, Docker metadata, backups, shell history, and operator access are not fully evidenced. | Verify least-privilege ownership/modes, secret-store audit, no secret process arguments/logs/backups, and redacted host inspection. |
| TC-07 | Transport security | Critical | Caddy terminates TLS with `auto_https off` and host-mounted certificate/key. Public reachability was proven with certificate checks bypassed; strict client revocation/CA validation remains incomplete. Internal Caddy→API hop is HTTP on the container network. | Validate CA chain and SAN with supported clients, automate renewal/expiry alerts, document internal-network trust boundary, and attach strict TLS evidence. |
| TC-08 | Input validation | High | Approval APIs validate years, months, finite numbers, enums, snapshots, and hashes. HR JSON payload validation is distributed across services; query/filter and upload validation require broader coverage. | Add schema-level validation and negative tests for all HR/query inputs, content-type/size/content checks for uploads, and consistent non-sensitive error responses. |
| TC-09 | File upload/privacy | High | HR uploads are memory-buffered up to 10 MB and extension-filtered; generated UUID filenames and basename normalization reduce traversal risk. MIME/content sniffing, malware scanning, authorization scope, encryption, retention, and document deletion are not evidenced. | Validate file signatures, scan/quarantine uploads, enforce per-record authorization, encrypt at rest, define retention/deletion/legal hold, and test unauthorized download. |
| TC-10 | SQL access | Confirmed with critical evidence gap | `mssql` uses `readOnlyIntent`, parameterized inputs, bounded fingerprints, and a parser rejecting persistent write/DDL/permission/procedure commands. Effective database principal permissions and live schema were not verified; SQL metadata probe timed out. | Obtain DBA report proving SELECT-only permissions and no write/execute/grant rights; reconcile referenced objects, indexes, FKs, jobs, and schemas. |
| TC-11 | SQL injection | High | Query contracts are fingerprinted and parameterized, materially reducing dynamic SQL risk. A parser is not a substitute for database permission isolation or complete query review. | Keep query IDs/fingerprints immutable, run injection regression tests for every parameter, and verify database account cannot write even if a query defect occurs. |
| TC-12 | Audit logging | High | Approval/reopen events are persisted with actor, timestamp, action, and snapshot hash; CPM query outcomes log query ID/fingerprint/status/duration. Centralized immutable retention, alerting, login/security events, and log redaction are not evidenced. | Define event taxonomy, correlation IDs, centralized append-only storage, retention/access policy, tamper alerting, and tests proving passwords/cookies/HR payloads are absent. |
| TC-13 | Privacy / data minimization | Critical | HR state includes employee identity, contact, employment, birth-date, and salary fields; documents are stored under `data/hr-documents`. Purpose limitation, minimization, encryption, access review, data-subject handling, and lawful retention basis are not documented. | Appoint data protection owner; document purpose, categories, lawful basis, access matrix, encryption, retention/deletion, export/correction/deletion handling, and breach procedure. |
| TC-14 | Retention / deletion | High | No verified retention or deletion scheduler/policy was found for app state, audit events, HR documents, ledger snapshots, logs, or backups. | Approve retention schedules and deletion/legal-hold procedures; implement or operationalize them; prove execution with redacted counts/timestamps. |
| TC-15 | Administrative access | Critical | Administrator role grants reporting, operations, approvals, and settings capabilities. SSH host access was authenticated by an existing key, but owner, MFA, least privilege, access review, and rotation evidence are absent. | Assign named owners, enforce MFA/short-lived keys where supported, review admin/SSH/DB/Caddy access quarterly, record break-glass controls, and rotate exposed credentials. |
| TC-16 | Error handling | High | Several HR routes return `err.message` in JSON responses. This can disclose filesystem, validation, or implementation details depending on thrown errors. | Replace raw messages with stable public error codes/messages; keep details server-side; add tests for secret/path/stack disclosure. |
| TC-17 | Security headers / browser controls | Medium | Caddy config confirms TLS and gzip but no explicit HSTS, CSP, frame, content-type, or referrer policy evidence was found in reviewed files. | Capture response headers and define a reviewed security-header policy; add CSP-compatible frontend tests and strict transport policy where safe. |
| TC-18 | Availability / recovery | Critical | Single Caddy/API process, single `/app/data` bind mount, CPM dependency, and host-mounted TLS are documented SPOFs. Backup/restore and failover evidence are absent. | Complete encrypted backup, isolated restore, RPO/RTO, disk monitoring, and rollback drills before release. |
| TC-19 | Observability / incident response | High | Public health and unauthenticated `401` boundaries passed; authenticated readiness, alert rules, dashboards, incident runbooks, and security-event escalation are not evidenced. | Verify authenticated readiness without exposing secrets; alert on auth failures, readiness, CPM/read-only violations, disk, TLS expiry, 5xx, and state-write failures. |
| TC-20 | Dependency / supply chain | High | CI runs `npm audit --audit-level=high`, tests, and build; release Python contract tests pass. Supplementary suite has one existing failure, and dependency exception/attestation/SBOM evidence is not complete. | Resolve or formally accept the failing test; generate SBOM/provenance, review high/critical advisories, pin/verify build inputs, and retain CI evidence for the exact commit. |

## 4. Control-domain summary

| Domain | Assessment | Evidence |
|---|---|---|
| Authentication | Partially implemented; production abuse resistance/MFA unverified | `server/auth.mjs`, auth tests, baseline `401` probe |
| Authorization | Core routes fail closed; HR wiring/capabilities critical gap | `server/capabilities.mjs`, `server/authBoundary.mjs`, `server/hr/router.mjs` |
| Secrets | Repository exposure reduced; live rotation blocked | `docs/inventory.md`, `.gitignore`, `release_artifact.py` |
| Transport | TLS edge configured; strict trust/renewal incomplete | `compose.yaml`, `infra/Caddyfile`, captured TLS probe |
| Input validation | Stronger in approvals/SQL; HR/upload coverage incomplete | `server/approvalApi.mjs`, `server/cpmReadOnly.mjs`, HR modules |
| SQL access | Read-only code contract confirmed; effective DB permissions unknown | `server/cpmConnectionConfig.mjs`, `server/cpmReadOnly.mjs`, DB inventory |
| Audit logging | Domain audit/query logs exist; centralized retention/alerting unknown | `server/stateStore.mjs`, `server/cpmReadOnly.mjs` |
| Privacy/retention | Sensitive HR data exists; policy and lifecycle controls absent/unverified | `server/hr/hrStore.mjs`, `server/hr/documentStore.mjs` |
| Administrative access | Admin/SSH paths exist; owner/MFA/periodic review absent | capability map, access inventory |

## 5. Compliance evidence matrix

This is a control-oriented mapping, not a legal determination. Applicable law, contract, sector, and data residency requirements must be confirmed by the organization’s legal/privacy owner.

| Requirement family | Minimum evidence expected | Current result |
|---|---|---|
| OWASP authentication/session | Secure cookie/session tests, throttling, logout/replay tests | Partial; throttling/MFA and authenticated E2E pending |
| OWASP authorization | Role/capability matrix and negative endpoint tests | Partial; HR wiring is a critical gap |
| OWASP injection | Parameterization, allow-list/fingerprint, DB least privilege | Partial; effective permissions/live catalog pending |
| OWASP file handling | Size/type/signature scanning, storage isolation, download auth | Partial; upload validation and lifecycle pending |
| OWASP logging/monitoring | Correlation IDs, redaction, alerting, retention, tamper controls | Partial; centralized controls pending |
| Privacy/data protection | Inventory, purpose, minimization, access, retention, subject/breach procedures | Not evidenced for HR documents/state |
| Operational resilience | Backup/restore, RPO/RTO, failover, rollback, runbooks | Not evidenced; release-blocking |
| Supply-chain security | Lockfile, audit, SBOM/provenance, reproducible release evidence | Partial; supplementary test failure and SBOM pending |

## 6. Immediate release blockers

1. Fix and test HR capability registration; production must fail closed if capability injection is absent.
2. Rotate all credentials exposed in the task context and prove old credentials are rejected through an approved process.
3. Complete strict TLS chain/SAN/revocation verification and certificate renewal alerting.
4. Obtain DBA evidence of effective CPM SELECT-only permissions and reconcile live schema metadata.
5. Define and enforce HR privacy, document retention/deletion, encryption, access review, and breach procedures.
6. Implement centralized redacted audit/security logging and tested alerting.
7. Complete backup/restore, RPO/RTO, rollback, authenticated readiness, and performance evidence.
8. Resolve or formally accept the existing supplementary test failure; assign every criterion owner and obtain stakeholder sign-off.

## 7. Assessment sign-off

| Role | Name | Decision | Date / ticket |
|---|---|---|---|
| Security owner | Unknown | Pending | — |
| Privacy/data protection owner | Unknown | Pending | — |
| DBA/CPM owner | Unknown | Pending | — |
| Technical owner | Unknown | Pending | — |
| Operations/incident owner | Unknown | Pending | — |
| Product/data owner | Unknown | Pending | — |

**Final assessment:** `CRITICAL_FINDINGS_PRESENT`, `PRODUCTION_RELEASE_BLOCKED`, `LEGAL_COMPLIANCE_REVIEW_REQUIRED`, `OWNER_SIGNOFF_PENDING`.
