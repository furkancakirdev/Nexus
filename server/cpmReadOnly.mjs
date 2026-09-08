import { createHash } from "node:crypto";
import { sourceProvenanceByCanonicalIdsSql, sourceProvenanceSql } from "./sourceProvenanceSql.mjs";
import { cpmMovementCandidateSql, dvzharRateCandidateSql, stkhArType81SampleSql, stkhArType81SummarySql, stkhArType82SampleSql, stkhArType82SummarySql, stkkrtPriceCandidateSql, stksymDevirSampleSql, stksymStkhArMatchSummarySql } from "./inventoryOpeningResearchSql.mjs";

const PROHIBITED = new Set([
  "UPDATE", "DELETE", "MERGE", "TRUNCATE", "ALTER", "EXEC", "EXECUTE",
  "GRANT", "DENY", "REVOKE", "USE", "DBCC", "BACKUP", "RESTORE",
]);

const PRODUCTION_FINGERPRINTS = Object.freeze({
  "health-database-name": "ac5d97b6cf0381291846c9704e3d148089f8e43926d94b2316a22df3bf8dc180",
  "sales-cases-v1": "1b2f7d7d7df507a1d45bd7d5e43f1f8bd0058f18fbe5ee3e70ef15e481d2e6e7",
  "final-invoice-ledger-v1": "508a55676c973ab938b7b99697a398d98193c33b97a5a019684998d486f8e724",
  "source-provenance-candidates-v1": "8e5079912142ed04df94904d2b895d8f7a7802cddc390aa9c8567aa65b25e504",
  "source-provenance-canonical-ids-v1": "a07fcaca27f54d3a521874a9821931b1c17e57012cff62def25221d9625b7416",
  "inventory-opening-stkhar-sample-v1": "7fc2d9245b5872fb1ec7d7750cb178dd0f3e4419869f36b971bd33f7530fb949",
  "inventory-opening-stkhar-summary-v1": "7399f16660720fffec59857c9df50618bef83a4eed6c335d0887e1be426f0f27",
  "inventory-opening-stkhar-type81-sample-v1": "1bc4f5923ca075a65b4223ed3e068326f13311cb23d198b6e5a401ffd687dac5",
  "inventory-opening-stkhar-type81-summary-v1": "02e1124711f7dc659f80095b62ada366153163dbfbb374bb7dbf2eb754b84227",
  "inventory-opening-stksym-sample-v1": "e49d14e69871a3014b2d91228129578f350c73d8eef54135149495c517614cdd",
  "inventory-opening-stksym-summary-v1": "63d7153af44591c834d6937ebda05f9a85051be749fdb106282a72fba0bf064b",
  "inventory-opening-stksym-stkhar-match-summary-v1": "f6ad7843df5f26dbbc75b9418f050913af6dd03833e67f4c170d9ecbcde3e7be",
  "inventory-movement-candidate-v1": "3378d2d2669dfb6e7982c6b98e9370b8c5672ef77f044b45bb76d0b6a068a1cd",
  "exchange-rate-candidate-v1": "c95d7d6c082fb056811120210db8e1ed92c60d68854ff7cceae3714557a09ad6",
  "historical-price-candidate-v1": "6acc76d5749cd93dbc3e36e9458c913423cabafe8db85560de89c36d6fcca1e0",
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
