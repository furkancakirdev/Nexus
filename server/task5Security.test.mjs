import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { detectSecurityFindings } from "./securityScan.mjs";
import { evaluateCpmReadOnlyPreflight } from "./cpmReadOnly.mjs";

const root = join(import.meta.dirname, "..");

test("secret scanner detects credential-like literals and TLS bypasses without exposing values", async () => {
  const fixtureFindings = detectSecurityFindings([
    { path: "fixture.py", contents: 'password = "redacted-fixture-value"\ncurl -sk https://example.invalid' },
  ]);

  assert.equal(fixtureFindings.length, 2);
  assert.deepEqual(fixtureFindings.map(({ path, line, kind }) => ({ path, line, kind })), [
    { path: "fixture.py", line: 1, kind: "credential-literal" },
    { path: "fixture.py", line: 2, kind: "tls-bypass" },
  ]);
  assert.ok(fixtureFindings.every((finding) => !JSON.stringify(finding).match(/redacted-fixture-value|password|secret|token|cookie|authorization|bearer/i)));
});

test("scoped secret artifacts are clean after removal", async () => {
  const paths = ["reconcile_years.py", "deploy_verify.py", "cookies.txt", "secrets/nexus-users.json"];
  const files = [];
  for (const relativePath of paths) {
    try {
      files.push({ path: relativePath, contents: await readFile(join(root, relativePath), "utf8") });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  const findings = detectSecurityFindings(files);
  assert.deepEqual(findings, []);
});

test("CPM preflight fails closed without explicit read-only identity and effective permissions", () => {
  assert.equal(evaluateCpmReadOnlyPreflight({}).allowed, false);
  assert.equal(evaluateCpmReadOnlyPreflight({ configuredReadOnly: true }).reason, "missing-read-only-identity");
  assert.equal(evaluateCpmReadOnlyPreflight({
    configuredReadOnly: true,
    identity: { principal: "cpm-read-only", readOnly: true },
  }).reason, "missing-effective-read-only-permission-evidence");
  assert.equal(evaluateCpmReadOnlyPreflight({
    configuredReadOnly: true,
    identity: { principal: "cpm-read-only", readOnly: true },
    effectivePermissions: { select: true, write: true },
  }).allowed, false);
});

test("CPM preflight accepts explicit SELECT-only evidence and reports a safe summary", () => {
  assert.deepEqual(evaluateCpmReadOnlyPreflight({
    configuredReadOnly: true,
    identity: { principal: " cpm-read-only ", readOnly: true },
    effectivePermissions: {
      select: true, write: false, insert: false, update: false, delete: false,
      merge: false, alter: false, execute: false, grant: false, deny: false, revoke: false,
    },
  }), {
    allowed: true,
    reason: "read-only-permission-evidence-accepted",
    evidence: { principal: "cpm-read-only", select: true, write: false },
  });
});
