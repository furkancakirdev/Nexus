import test from "node:test";
import assert from "node:assert/strict";
import { ALLOWED_SOURCE_TABLES, SOURCE_EVIDENCE_SQL, getSourceEvidenceQuery } from "./sourceEvidenceDiscoverySql.mjs";

test("queries are static, allowlisted, parameterized SELECT-only samples", () => {
  const forbidden = /SELECT\s+\*|\b(INSERT|UPDATE|DELETE|MERGE|EXEC|CREATE|DROP|INTO)\b|#|\bFROM\s+\[?[^\s]+\]?\s*\+/i;
  for (const table of ALLOWED_SOURCE_TABLES) {
    const sql = SOURCE_EVIDENCE_SQL[table];
    assert.match(sql, /^\s*SELECT\s+TOP\s+\(@sampleLimit\)/i);
    assert.equal(sql.match(new RegExp(`FROM ${table}\\b`, "g"))?.length, 1);
    assert.match(sql, /@company/);
    assert.match(sql, /@startDate/);
    assert.match(sql, /@endDate/);
    assert.doesNotMatch(sql, forbidden);
  }
  assert.throws(() => getSourceEvidenceQuery("SYS.TABLE"));
});
