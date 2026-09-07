import assert from "node:assert/strict";
import test from "node:test";
import { buildExchangeRateIndex, buildRateSet } from "../shared/eurReporting.mjs";
import { resolveMonthRateSet } from "./ledgerApi.mjs";

const index = buildExchangeRateIndex([
  {
    rateDate: "2026-01-31",
    rateCurrency: "EUR",
    halkbankBuyingRate: 40,
    halkbankSellingRate: 40.2,
    exchangeSourceId: "DVZHAR-EUR-JAN",
  },
  {
    rateDate: "2026-07-28",
    rateCurrency: "EUR",
    halkbankBuyingRate: 45,
    halkbankSellingRate: 45.2,
    exchangeSourceId: "DVZHAR-EUR-JUL",
  },
]);

const januaryRateSet = buildRateSet(index, "2026-01-31");

test("locked V2 approval uses its stored frozen rate set", () => {
  const resolved = resolveMonthRateSet({
    index,
    year: 2026,
    month: 1,
    approval: {
      locked: true,
      snapshotSchemaVersion: 2,
      exchangeRateSet: januaryRateSet,
    },
    reportDate: "2026-07-28",
  });

  assert.equal(resolved.frozen, true);
  assert.equal(resolved.rateSet.eurTryBuyingRate, 40);
});

test("locked V2 approval with malformed rate evidence fails closed", () => {
  const resolved = resolveMonthRateSet({
    index,
    year: 2026,
    month: 1,
    approval: {
      locked: true,
      snapshotSchemaVersion: 2,
      exchangeRateSet: { bank: "HALKBANK" },
    },
    reportDate: "2026-07-28",
  });

  assert.equal(resolved.frozen, true);
  assert.equal(resolved.rateSet, null);
});

test("legacy locked approval without stored rate evidence retains month-end fallback", () => {
  const resolved = resolveMonthRateSet({
    index,
    year: 2026,
    month: 1,
    approval: { locked: true },
    reportDate: "2026-07-28",
  });

  assert.equal(resolved.frozen, true);
  assert.equal(resolved.rateSet.eurTryBuyingRate, 40);
});

test("open approval uses report-date rate dynamically", () => {
  const resolved = resolveMonthRateSet({
    index,
    year: 2026,
    month: 1,
    approval: { locked: false },
    reportDate: "2026-07-28",
  });

  assert.equal(resolved.frozen, false);
  assert.equal(resolved.rateSet.eurTryBuyingRate, 45);
});
