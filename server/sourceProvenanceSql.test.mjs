import test from "node:test";
import assert from "node:assert/strict";
import { sourceProvenanceByCanonicalIdsSql, sourceProvenanceSql } from "./sourceProvenanceSql.mjs";
import { assertCpmReadOnlySql, fingerprintCpmQuery } from "./cpmReadOnly.mjs";

test("source provenance SQL is parameterized and structurally read-only", () => {
  assert.match(sourceProvenanceSql, /@company/);
  assert.match(sourceProvenanceSql, /@year/);
  assert.match(sourceProvenanceSql, /FROM STKHAR/);
  assert.doesNotThrow(() => assertCpmReadOnlySql(sourceProvenanceSql));
  assert.equal(sourceProvenanceSql.includes("SELECT *"), false);
  assert.match(sourceProvenanceByCanonicalIdsSql, /@canonicalIdsJson/);
  assert.doesNotThrow(() => assertCpmReadOnlySql(sourceProvenanceByCanonicalIdsSql));
});

test("source provenance SQL exposes stable identity and economic fields", () => {
  for (const field of ["sourceRowId", "documentType", "documentDate", "productCode", "quantity", "netAmount", "isSale"]) {
    assert.match(sourceProvenanceSql, new RegExp(`\\b${field}\\b`, "i"));
  }
  assert.equal(fingerprintCpmQuery(sourceProvenanceSql), "8e5079912142ed04df94904d2b895d8f7a7802cddc390aa9c8567aa65b25e504");
});

test("canonical-id source read has a stable allowlist fingerprint", () => {
  assert.equal(fingerprintCpmQuery(sourceProvenanceByCanonicalIdsSql), "a07fcaca27f54d3a521874a9821931b1c17e57012cff62def25221d9625b7416");
});
