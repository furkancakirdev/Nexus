import test from "node:test";
import assert from "node:assert/strict";
import { netSalesForRow } from "./summaryMetrics.js";

test("Summary net sales subtracts returns and discounts from gross sales", () => {
  assert.equal(netSalesForRow({ sales: 266201384.28, returns: 2380829.99, discounts: 36410804.73 }), 227409749.56);
});

test("Summary net sales treats missing reductions as zero without changing the source row", () => {
  const row = { sales: 100, returns: null, discounts: undefined };
  assert.equal(netSalesForRow(row), 100);
  assert.deepEqual(row, { sales: 100, returns: null, discounts: undefined });
});
