import assert from "node:assert/strict";
import test from "node:test";

const ledgerApi = await import("./ledgerApi.mjs");
const buildCachedDepartmentAnalysis = ledgerApi.buildCachedDepartmentAnalysis;

test("aynı ledger ve Nexus maliyet politikası için departman analizini yeniden kullanır", () => {
  assert.equal(typeof buildCachedDepartmentAnalysis, "function");
  const ledger = {
    rows: [],
    totals: { netSales: 0, rowCount: 0 },
    quality: {},
    pilotOrders: [],
    excludedTestRows: [],
  };
  const options = {
    ledger,
    year: 2026,
    pilotCardCostRates: { labor: 0 },
    costOverrides: [],
    requireApproval: true,
  };

  const first = buildCachedDepartmentAnalysis(options);
  const second = buildCachedDepartmentAnalysis({
    ...options,
    pilotCardCostRates: { labor: 0 },
    costOverrides: [],
  });
  const changedPolicy = buildCachedDepartmentAnalysis({
    ...options,
    pilotCardCostRates: { labor: 5 },
  });

  assert.equal(second, first);
  assert.notEqual(changedPolicy, first);
});

test("departman ve hedef API çağrıları ortak cache işlevini kullanır", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => (
    readFile(new URL("./ledgerApi.mjs", import.meta.url), "utf8")
  ));
  const calls = source.match(/buildCachedDepartmentAnalysis\(\{/g) || [];

  assert.equal(calls.length, 3);
});
