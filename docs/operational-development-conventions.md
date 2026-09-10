# Marlin Nexus — Operational and Development Conventions

> Status: current repository convention
> Verified: 2026-09-09
> Scope: local development, CI, review, release, incidents, and secret handling.

This document describes the conventions evidenced by the repository. Items marked **TBD** or **Not configured** are explicit gaps, not assumed procedures.

## 1. Local setup

### Prerequisites

- Node.js 24 is used by CI. The production Docker image is based on Node.js 22 Alpine; keep application dependencies compatible with both runtimes until the production image is upgraded.
- npm and the committed `package-lock.json` are required.
- Python is required only for release/preflight helper scripts and their tests.
- Docker and Docker Compose are required for the containerized deployment shape.
- A CPM SQL read-only credential file is required for live CPM access. Never place its contents in source control.

### Commands

```text
npm ci
npm run dev
npm run build
npm run preview
```

`npm run dev` starts the Vite client on `127.0.0.1:4317` and the Node server on the configured application port (normally `4318`). Vite proxies `/api` to the server.

## 2. Environment configuration

Copy `.env.example` to a local, ignored `.env` file and provide only local/test values. The application uses these important configuration groups:

| Variable/group | Purpose | Handling |
|---|---|---|
| `CPM_SQL_SERVER`, `CPM_SQL_INSTANCE`, `CPM_SQL_DATABASE`, `CPM_SQL_COMPANY` | CPM SQL target | Non-secret connection metadata; verify before live use |
| `CPM_CREDENTIAL_FILE` | Path to a two-line CPM credential file | Secret-bearing path; file must remain outside Git |
| `CPM_SQL_ENCRYPT`, `CPM_SQL_TRUST_SERVER_CERTIFICATE` | SQL transport policy | Encryption remains enabled unless explicitly configured otherwise; certificate trust bypass is prohibited |
| `NEXUS_SESSION_SECRET` | Session signing secret | Inject through an approved secret store/runtime mount |
| `NEXUS_ADMIN_PASSWORD_SHA256` | Admin password hash configuration | Inject through an approved secret store; never store the plaintext password |
| `NEXUS_PUBLIC_ORIGIN`, `NEXUS_AUTH_REQUIRED` | Browser security and auth policy | Required for deployment; verify against the actual origin |
| `APP_STATE_FILE`, `LEDGER_SNAPSHOT_DIR`, `NEXUS_USERS_FILE` | Application state paths | Use writable, access-controlled runtime storage |
| `BUILD_ID`, `NEXUS_BUILD_VERSION`, `NEXUS_BUILD_COMMIT`, `NEXUS_IMAGE_DIGEST` | Release identity | Must identify the immutable candidate before production release |

Do not print a full environment, credential file, cookie, authorization header, private key, or secret mount. Redact values in command output and incident artifacts.

## 3. Branching and change flow

- Pull requests and pushes to `master` run the repository CI workflows.
- Keep changes small and scoped to one task; do not combine unrelated cleanup with a release fix.
- Use a descriptive branch name and preserve the repository’s existing commit history conventions. Exact branch naming policy and required reviewer count are **TBD** and require team-owner confirmation.
- Never commit generated `dist/`, runtime `data/`, `secrets/`, `.env.*` files (except `.env.example`), `.temp_files/`, cookies, or local audit dumps.

## 4. Testing and quality gates

Run the following before opening a pull request:

```text
npm run quality:format
npm run quality:lint
npm run quality:typecheck
npm run quality:secrets
npm run test:unit
npm run test:integration
npm run test:coverage
npm run quality:audit
npm run build
```

Current meanings:

- `quality:format` runs `git diff --check`.
- `quality:lint` and `quality:typecheck` run Node syntax checks over supported application source. This is a JavaScript/JSX repository; TypeScript is not configured. JSX is validated by the Vite build.
- `quality:secrets` scans production source for credential literals, TLS bypasses, and disabled certificate verification.
- Unit tests run through Node’s built-in test runner. Integration tests use isolated/injected state and fake SQL request contracts; they do not write to CPM.
- Coverage thresholds are enforced by Node’s test runner: 50% lines, 50% functions, and 40% branches.
- `npm audit --audit-level=high` is the dependency gate.

Do not weaken a failing gate by deleting a test or lowering a threshold without an approved change record.

## 5. Database and migrations

- CPM access is read-only by design. Nexus queries are allowlisted, parameterized, and executed through the read-only transaction boundary.
- No application migration framework is configured in this repository. CPM schema changes, indexes, foreign keys, jobs, permissions, and migration execution are **DBA-owned/TBD** and must be handled through an approved SQL Server change process.
- Never run a schema or data mutation against CPM from the application or an ad-hoc developer session.
- Any future migration must include: an idempotent script, preconditions, rollback/restore plan, isolated test evidence, owner approval, and a production execution record.
- State-file changes must preserve atomic writes, revision checks, and serialized updates. Do not edit runtime state manually while the service is running.

## 6. Code review conventions

Reviewers should confirm:

1. Public API and authorization behavior are preserved or explicitly versioned.
2. Every mutation has session, CSRF, Origin, capability, validation, and audit implications considered.
3. CPM queries remain parameterized, allowlisted, and read-only.
4. Errors returned to clients do not include secrets, SQL text, filesystem paths, or raw exception details.
5. Tests cover success, denial, malformed input, stale/duplicate state, and failure paths.
6. Documentation and acceptance evidence are updated for operationally significant changes.

A reviewer must not approve a release-blocking exception without a named owner, expiry date, compensating control, and rollback trigger.

## 7. Release procedure

1. Build and test the candidate with the committed lockfile (`npm ci`).
2. Run all quality gates and attach their outputs without secrets.
3. Produce immutable release identity: build ID, version, commit, image digest, and artifact hash.
4. Validate release preflight requirements: verified SSH host key, verified TLS, matching Compose hash, read-only secret mounts, verified state backup, verified candidate, verified readiness, persisted rollback manifest, and distinct rollback image metadata.
5. Review the production acceptance criteria and remediation backlog; unresolved critical blockers prohibit release unless formally accepted.
6. Deploy only through the approved operator/runbook. This repository does not authorize an ad-hoc SSH deployment command.
7. Run post-deploy smoke and health/readiness checks, monitor alerts, and record the release result.
8. If acceptance checks fail, execute the documented rollback using the persisted rollback manifest. **RTO/RPO targets and named production approvers are TBD.**

## 8. Incident reporting and operations

For every incident, record:

- UTC start/end time and affected environment
- Release/build commit and image digest
- Correlation IDs and endpoint/status evidence (never request bodies or credentials)
- User-visible impact and affected data scope
- Timeline, detection source, mitigation, recovery, and rollback decision
- Root cause, contributing factors, corrective actions, owner, and due date

Use the structured application correlation ID (`X-Correlation-Id`) to link client reports to server diagnostics. Preserve logs according to the approved retention policy; the retention duration, on-call roster, and escalation channel are **TBD**.

## 9. Prohibited secret handling

Never:

- Commit plaintext passwords, API keys, session secrets, hashes intended to be secret, cookies, bearer tokens, credential files, private keys, or production `.env` files.
- Paste credentials into tickets, chat, source comments, test names, screenshots, shell history, or CI logs.
- Run commands that print full environments, secret mounts, database connection strings, request headers, or SQL credentials.
- Disable TLS verification, set `trustServerCertificate=true` as a workaround, or use `curl -k`.
- Reuse production credentials in local tests or fixtures.
- Store ad-hoc scripts or generated outputs outside `.temp_files/`; remove temporary artifacts after use.

If a secret is exposed, stop using it, preserve only redacted evidence, notify the security/operations owner, rotate it through the approved secret store, and verify the old value is rejected. Do not claim rotation or invalidation without status evidence.

## 10. Ownership and open conventions

- Technical, security, database, product/data, and operations owners must be assigned before production release; current named owners are **TBD**.
- The approved secret store, incident channel, support roster, migration owner, backup operator, RTO/RPO, and branch/reviewer policy require stakeholder sign-off.
- This document records current conventions; the production acceptance criteria and release preflight contract remain authoritative when they impose stricter gates.
