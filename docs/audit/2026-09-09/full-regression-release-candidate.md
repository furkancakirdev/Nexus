# Nexus Release-Candidate Full Regression Evidence

> Test date: 2026-09-09  
> Scope: current checkout/release candidate, isolated local test fixtures, and disposable local performance evidence  
> Safety: no production traffic, deployment, database writes, or credential replay

## Summary

| Area | Command/evidence | Result | Status |
|---|---|---|---|
| Unit/domain/server regression | `npm test` | 690 passed, 0 failed | PASS |
| Integration/API/HR | `npm run test:integration` | 7 passed, 0 failed | PASS |
| Coverage threshold | `npm run test:coverage` | 690 passed; lines 93.70%, branches 80.78%, functions 93.83% | PASS |
| Formatting | `npm run quality:format` | `git diff --check` gate passed | PASS |
| Syntax lint | `npm run quality:lint` | 185 source files checked | PASS |
| Type-check gate | `npm run quality:typecheck` | 185 Node-checkable source files checked; JSX validated by build | PASS |
| Secret/security scan | `npm run quality:secrets` | No actionable credential/TLS findings | PASS |
| Dependency scan | `npm audit --audit-level=high` | 0 vulnerabilities | PASS |
| Production build | `npm run build` | Vite build succeeded; 6,783 modules transformed | PASS |
| Local load/stress | `docs/audit/2026-09-09/load-stress-baseline.md` | Local health baseline/peak/soak passed; failure path behaved as expected | PASS (local-only) |

## Reproduction commands

Run from repository root after `npm ci --ignore-scripts`:

```text
npm test
npm run test:integration
npm run test:coverage
npm run quality:format
npm run quality:lint
npm run quality:typecheck
npm run quality:secrets
npm audit --audit-level=high
npm run build
```

The CI workflow uses the canonical `npm audit --audit-level=high` command. `npm run quality:audit` is not a configured script and is not part of the release command set.

## Included coverage

- Authentication, session expiry, logout, CSRF and Origin enforcement.
- Role/capability authorization and direct API denial paths.
- API composition with isolated state, revision integrity, payload validation, and read-only SQL fingerprint contracts.
- CPM SQL allowlist, parameterization, read-only transaction behavior, retry and quarantine contracts using fakes/local fixtures.
- Financial/domain calculations, reconciliation, evidence gates, settings validation, state transitions, duplicate prevention, and HR transaction behavior.
- React component and presentation contract tests included by `npm test`.
- Security scanner tests, source secret/TLS-bypass scan, dependency audit, and production bundle build.

## Coverage not available in this checkout

- **Browser end-to-end:** no Playwright/Cypress/WebDriver harness or release-candidate browser environment is configured.
- **Accessibility automation:** no axe/Lighthouse/real assistive-technology runner is configured; existing component contract tests are not a WCAG certification.
- **Compatibility matrix:** no supported-browser/device matrix runner is configured; Vite build is not cross-browser validation.
- **Database migrations/constraints:** no isolated CPM SQL Server test database or DBA-approved migration harness is configured. Live SQL Server metadata/migration evidence remains unavailable.
- **Production authentication/readiness:** authenticated live probe was not run in this regression task.
- **Production-scale performance:** only the previously documented disposable local health-surface load test is attached. CPM query latency, database waits, Caddy/TLS capacity, and production resource limits remain unverified.

## Release interpretation

Automated repository gates pass, but this is not a production acceptance sign-off. Release remains blocked until the missing browser/accessibility/compatibility evidence is obtained where required, isolated SQL migration/constraint validation is approved and executed, and production-like performance/dependency evidence is attached. Credential rotation, old-credential invalidation, live CPM permissions/schema, backup/RPO/RTO, and stakeholder approvals remain separate release prerequisites.

## Safety and redaction

- No secret values, cookies, authorization headers, SQL credentials, private keys, business rows, or production response bodies are stored here.
- Integration/database tests use isolated in-memory or fake request contracts.
- No production deployment, restart, migration, or database write was performed.

**Evidence status:** `AUTOMATED_REGRESSION_PASS`, `LIVE_AND_BROWSER_VALIDATION_INCOMPLETE`, `PRODUCTION_SIGNOFF_PENDING`.
