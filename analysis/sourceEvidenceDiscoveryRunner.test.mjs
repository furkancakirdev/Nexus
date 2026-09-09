import test from "node:test";
import assert from "node:assert/strict";
import { ALLOWED_SOURCE_TABLES } from "./sourceEvidenceDiscoverySql.mjs";
import { runSourceEvidenceDiscovery } from "./sourceEvidenceDiscoveryRunner.mjs";

function fakeAdapter({ rows = {}, rollbackError, closeError, injectedConfirmed = false } = {}) {
  const calls = [];
  return {
    calls,
    async beginTransaction() { calls.push(["begin"]); return { id: "synthetic" }; },
    async execute(sql, params, tx) { calls.push(["execute", sql, params, tx]); const table = ALLOWED_SOURCE_TABLES.find((name) => sql.includes(`FROM ${name}`)); return { rows: rows[table] ?? [{ sourceRecordId: "1", confirmed: injectedConfirmed }] }; },
    async rollback(tx) { calls.push(["rollback", tx]); if (rollbackError) throw rollbackError; },
    async close() { calls.push(["close"]); if (closeError) throw closeError; },
  };
}

test("runner binds parameters, reads sequentially, rolls back and closes", async () => {
  const adapter = fakeAdapter();
  const result = await runSourceEvidenceDiscovery({ adapter, company: "01", startDate: "2026-01-01", endDate: "2027-01-01", sampleLimit: 3, now: () => "synthetic-time" });
  assert.equal(result.status, "review-required");
  assert.equal(result.freshness.liveEvidence, false);
  assert.deepEqual(adapter.calls.filter(([kind]) => kind === "execute").map(([, , params]) => params.sampleLimit), [3, 3, 3, 3, 3, 3]);
  assert.equal(adapter.calls.at(-2)[0], "rollback");
  assert.equal(adapter.calls.at(-1)[0], "close");
});

test("rollback or close errors block rather than succeed", async () => {
  for (const option of [{ rollbackError: new Error("rollback") }, { closeError: new Error("close") }]) {
    const result = await runSourceEvidenceDiscovery({ adapter: fakeAdapter(option), company: "01", startDate: "a", endDate: "b" });
    assert.equal(result.status, "blocked");
  }
});

test("injected confirmed flags never escalate status and settlement quarantine is untouched", async () => {
  const adapter = fakeAdapter({ injectedConfirmed: true });
  const result = await runSourceEvidenceDiscovery({ adapter, company: "01", startDate: "a", endDate: "b" });
  assert.equal(result.status, "review-required");
  assert.equal(Object.hasOwn(result, "confirmed"), false);
  assert.equal(Object.hasOwn(result, "officialEligibleCount"), false);
  assert.equal(adapter.calls.some(([, sql]) => typeof sql === "string" && sql.includes("settlement-evidence-v1")), false);
});
