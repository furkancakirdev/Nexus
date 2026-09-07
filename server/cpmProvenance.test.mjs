import test from "node:test";
import assert from "node:assert/strict";
import { collectCpmSourceProvenance } from "./cpmProvenance.mjs";

test("collects canonical and source rows through the same transaction read boundary", async () => {
  const events = [];
  const tx = {
    async begin(level) { events.push(["begin", level]); },
    request() {
      events.push(["request"]);
      return { async query(query) {
        events.push(["query", query]);
        return { recordset: query === "canonical"
          ? [{ ID: 7, quantity: 1, netAmount: "10.00" }]
          : [{ ID: 7, quantity: 1, netAmount: 10 }] };
      } };
    },
    async rollback() { events.push(["rollback"]); },
  };
  const result = await collectCpmSourceProvenance({
    transactionFactory: async () => tx,
    executeRead: ({ request, query }) => request.query(query),
    loadCanonical: ({ execute }) => execute({ queryId: "canonical-v1", query: "canonical" }),
    loadSource: ({ execute }) => execute({ queryId: "source-v1", query: "source" }),
  });

  assert.equal(result.evidence.status, "verified");
  assert.equal(result.evidence.reconciliation.netDifferenceMinorUnits, 0);
  assert.deepEqual(events, [
    ["begin", "read committed"], ["request"],
    ["query", "canonical"], ["query", "source"], ["rollback"],
  ]);
});

test("does not claim verified when either loader returns no rowset", async () => {
  const tx = {
    async begin() {}, request() { return { async query() { return {}; } }; }, async rollback() {},
  };
  const result = await collectCpmSourceProvenance({
    transactionFactory: async () => tx,
    executeRead: ({ request, query }) => request.query(query),
    loadCanonical: ({ execute }) => execute({ queryId: "canonical-v1", query: "canonical" }),
    loadSource: ({ execute }) => execute({ queryId: "source-v1", query: "source" }),
  });
  assert.equal(result.evidence.status, "unavailable");
});

test("keeps broad candidate coverage separate from exact canonical value proof", async () => {
  const tx = {
    async begin() {}, request() {
      return { async query(query) {
        if (query === "canonical") return { recordset: [{ ID: 1, quantity: 1, netAmount: 10 }] };
        if (query === "exact") return { recordset: [{ ID: 1, quantity: 1, netAmount: 10 }] };
        return { recordset: [{ ID: 1 }, { ID: 2 }] };
      } };
    }, async rollback() {},
  };
  const result = await collectCpmSourceProvenance({
    transactionFactory: async () => tx,
    executeRead: ({ request, query }) => request.query(query),
    loadCanonical: ({ execute }) => execute({ queryId: "canonical", query: "canonical" }),
    loadSource: ({ execute }) => execute({ queryId: "exact", query: "exact" }),
    loadCoverage: ({ execute }) => execute({ queryId: "coverage", query: "coverage" }),
  });
  assert.equal(result.evidence.status, "verified");
  assert.equal(result.coverage.status, "incomplete");
  assert.equal(result.coverage.candidateIdsOutsideCanonical, 1);
});

test("uses a supplied ledger snapshot without re-reading the heavy canonical query", async () => {
  const events = [];
  const tx = {
    async begin() {},
    request() {
      return { async query(query) {
        events.push(query);
        return { recordset: query === "exact"
          ? [{ ID: 9, quantity: 2, netAmount: "12.50" }]
          : [{ ID: 9 }] };
      } };
    },
    async rollback() {},
  };
  const result = await collectCpmSourceProvenance({
    transactionFactory: async () => tx,
    executeRead: ({ request, query }) => request.query(query),
    canonicalRows: [{ rootId: 9, quantity: 2, netAmount: 12.5 }],
    loadCanonical: () => { throw new Error("canonical query must not run"); },
    loadSource: ({ execute }) => execute({ queryId: "source-v1", query: "exact" }),
    loadCoverage: ({ execute }) => execute({ queryId: "coverage-v1", query: "coverage" }),
  });
  assert.equal(result.evidence.status, "verified");
  assert.deepEqual(events, ["exact", "coverage"]);
});
