import assert from "node:assert/strict";
import test from "node:test";
import { reconciliation } from "./ledgerApi.mjs";

test("reconciliation uses minor units so floating-point noise is not an accounting mismatch", () => {
  const result = reconciliation(
    236207629.04000163,
    236207629.04,
    236207629.04000163,
    0,
  );

  assert.equal(result.difference, 0);
  assert.equal(result.balanced, true);
});

test("reconciliation keeps a real kuruş difference visible", () => {
  const result = reconciliation(100, 100, 100.01, 0);

  assert.equal(result.balanced, false);
  assert.equal(result.difference, -0.010000000000005116);
});
