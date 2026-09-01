import { createHash } from "node:crypto";

const PROHIBITED = new Set([
  "UPDATE", "DELETE", "MERGE", "TRUNCATE", "ALTER", "EXEC", "EXECUTE",
  "GRANT", "DENY", "REVOKE", "USE", "DBCC", "BACKUP", "RESTORE",
]);

const PRODUCTION_FINGERPRINTS = Object.freeze({
  "health-database-name": "ac5d97b6cf0381291846c9704e3d148089f8e43926d94b2316a22df3bf8dc180",
  "sales-cases-v1": "1b2f7d7d7df507a1d45bd7d5e43f1f8bd0058f18fbe5ee3e70ef15e481d2e6e7",
  "final-invoice-ledger-v1": "0573fd329c9142f6d780b5baa322b397d06a13d35076f9798d7cf21a13891e2c",
});

function policyError(reason) {
  const error = new Error("CPM sorgusu salt-okunur sınırı ihlal ediyor.");
  error.code = "CPM_READ_ONLY_POLICY";
  error.reason = reason;
  return error;
}

function tokenizeSql(sql) {
  const tokens = [];
  let index = 0;
  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === "-" && next === "-") {
      index += 2;
      while (index < sql.length && sql[index] !== "\n") index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      let depth = 1;
      while (index < sql.length && depth > 0) {
        if (sql[index] === "/" && sql[index + 1] === "*") {
          depth += 1;
          index += 2;
        } else if (sql[index] === "*" && sql[index + 1] === "/") {
          depth -= 1;
          index += 2;
        } else {
          index += 1;
        }
      }
      if (depth > 0) throw policyError("unterminated-comment");
      continue;
    }
    if (char === "'") {
      index += 1;
      let closed = false;
      while (index < sql.length) {
        if (sql[index] === "'" && sql[index + 1] === "'") {
          index += 2;
        } else if (sql[index] === "'") {
          index += 1;
          closed = true;
          break;
        } else {
          index += 1;
        }
      }
      if (!closed) throw policyError("unterminated-string");
      tokens.push({ type: "literal", value: "STRING" });
      continue;
    }
    if (char === "[" || char === '"') {
      const close = char === "[" ? "]" : '"';
      const escapedClose = close + close;
      let value = "";
      index += 1;
      let closed = false;
      while (index < sql.length) {
        if (sql.slice(index, index + 2) === escapedClose) {
          value += close;
          index += 2;
        } else if (sql[index] === close) {
          index += 1;
          closed = true;
          break;
        } else {
          value += sql[index];
          index += 1;
        }
      }
      if (!closed) throw policyError("unterminated-identifier");
      tokens.push({ type: "word", value: value.toUpperCase() });
      continue;
    }
    if (/[A-Za-z0-9_@$#]/.test(char)) {
      const start = index;
      while (index < sql.length && /[A-Za-z0-9_@$#]/.test(sql[index])) index += 1;
      tokens.push({ type: "word", value: sql.slice(start, index).toUpperCase() });
      continue;
    }
    tokens.push({ type: "symbol", value: char });
    index += 1;
  }
  return tokens;
}

function isLocalTemp(token) {
  return token?.type === "word" && /^#[^#]/.test(token.value);
}

function requireExistingLocalTemp(token, createdTemps, reason) {
  if (!isLocalTemp(token) || !createdTemps.has(token.value)) throw policyError(reason);
}

export function assertCpmReadOnlySql(query) {
  const sql = String(query || "");
  const tokens = tokenizeSql(sql);
  const createdTemps = new Set();

  for (let index = 0; index < tokens.length; index += 1) {
    const value = tokens[index].value;
    if (PROHIBITED.has(value) || value === "SP_EXECUTESQL") {
      throw policyError(`prohibited-${value.toLowerCase()}`);
    }

    if (value === "SET") {
      if (tokens[index + 1]?.value !== "NOCOUNT" || tokens[index + 2]?.value !== "ON") {
        throw policyError("prohibited-set");
      }
      index += 2;
      continue;
    }

    if (value === "CREATE") {
      if (tokens[index + 1]?.value === "TABLE") {
        const target = tokens[index + 2];
        if (!isLocalTemp(target)) throw policyError("persistent-create-table");
        createdTemps.add(target.value);
        index += 2;
        continue;
      }

      let cursor = index + 1;
      if (tokens[cursor]?.value === "UNIQUE") cursor += 1;
      if (["CLUSTERED", "NONCLUSTERED"].includes(tokens[cursor]?.value)) cursor += 1;
      if (tokens[cursor]?.value !== "INDEX") throw policyError("prohibited-create");
      cursor += 1;
      if (tokens[cursor]?.type !== "word") throw policyError("invalid-index-name");
      cursor += 1;
      if (tokens[cursor]?.value !== "ON") throw policyError("invalid-index-target");
      requireExistingLocalTemp(tokens[cursor + 1], createdTemps, "persistent-or-unknown-index-target");
      index = cursor + 1;
      continue;
    }

    if (value === "INSERT") {
      if (tokens[index + 1]?.value !== "INTO") throw policyError("unsupported-insert");
      requireExistingLocalTemp(tokens[index + 2], createdTemps, "persistent-or-unknown-insert-target");
      index += 2;
      continue;
    }

    if (value === "INTO") {
      const target = tokens[index + 1];
      if (!isLocalTemp(target)) throw policyError("persistent-select-into");
      createdTemps.add(target.value);
      index += 1;
      continue;
    }

    if (value === "DROP") {
      if (tokens[index + 1]?.value !== "TABLE") throw policyError("prohibited-drop");
      const target = tokens[index + 2];
      requireExistingLocalTemp(target, createdTemps, "persistent-or-unknown-drop-target");
      createdTemps.delete(target.value);
      index += 2;
    }
  }
  return sql;
}

export function fingerprintCpmQuery(query) {
  const normalized = String(query || "").replace(/\r\n?/g, "\n").trim();
  return createHash("sha256").update(normalized).digest("hex");
}

export function evaluateCpmReadOnlyPreflight({ configuredReadOnly, identity, effectivePermissions } = {}) {
  if (configuredReadOnly !== true) {
    return { allowed: false, reason: "read-only-intent-not-configured", evidence: null };
  }
  if (!identity || identity.readOnly !== true || typeof identity.principal !== "string" || !identity.principal.trim()) {
    return { allowed: false, reason: "missing-read-only-identity", evidence: null };
  }
  const permissionKeys = ["insert", "update", "delete", "merge", "alter", "execute", "grant", "deny", "revoke"];
  if (!effectivePermissions || effectivePermissions.select !== true || effectivePermissions.write !== false) {
    return { allowed: false, reason: "missing-effective-read-only-permission-evidence", evidence: null };
  }
  if (permissionKeys.some((key) => effectivePermissions[key] !== false)) {
    return { allowed: false, reason: "ambiguous-effective-permissions", evidence: null };
  }
  return {
    allowed: true,
    reason: "read-only-permission-evidence-accepted",
    evidence: { principal: identity.principal.trim(), select: true, write: false },
  };
}

function defaultAudit(event) {
  console.info(JSON.stringify({ event: "cpm-read-only-query", ...event }));
}

export function createCpmReadOnlyExecutor({ allowedFingerprints, audit = defaultAudit }) {
  return async function execute({ request, queryId, query }) {
    const startedAt = Date.now();
    const fingerprint = fingerprintCpmQuery(query);
    const expected = allowedFingerprints[queryId];
    try {
      if (!expected) throw policyError("unknown-query-id");
      if (fingerprint !== expected) throw policyError("fingerprint-mismatch");
      assertCpmReadOnlySql(query);
    } catch (error) {
      audit({ queryId, fingerprint, status: "rejected", reason: error.reason || "policy-rejected", durationMs: Date.now() - startedAt });
      throw error;
    }

    try {
      const result = await request.query(query);
      audit({ queryId, fingerprint, status: "succeeded", durationMs: Date.now() - startedAt });
      return result;
    } catch (error) {
      audit({ queryId, fingerprint, status: "failed", reason: "query-execution-failed", durationMs: Date.now() - startedAt });
      throw error;
    }
  };
}

export const executeCpmReadOnlyQuery = createCpmReadOnlyExecutor({
  allowedFingerprints: PRODUCTION_FINGERPRINTS,
});
