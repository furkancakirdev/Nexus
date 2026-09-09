# T08 Security/privacy/operational risk evidence

Commands:
- `node --test server/task5Security.test.mjs server/auth.test.mjs server/task6RoleIsolation.test.mjs`
- `security-ast-scan server/index.mjs`

Results: PASS — 12 tests, 12 passed, 0 failed; AST scan CLEAN with 0 findings.

Covered: session/CSRF/auth boundaries, secret/TLS bypass scanning, read-only preflight, role isolation and capability denial.
