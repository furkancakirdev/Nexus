import test from "node:test";
import assert from "node:assert/strict";
import {
  formatMoney,
  formatPreciseMoney,
  formatEur,
  formatCompact,
  formatPercent,
  formatInteger,
  formatDate,
} from "../src/utils/formatters.js";

test("formatters: formatMoney formats valid numbers and handles edge cases", () => {
  assert.equal(formatMoney(228590441), "228.590.441 TL");
  assert.equal(formatMoney(-15000), "−15.000 TL");
  assert.equal(formatMoney(0), "0 TL");
  assert.equal(formatMoney(null), "—");
  assert.equal(formatMoney(undefined), "—");
  assert.equal(formatMoney(NaN), "—");
  assert.equal(formatMoney("invalid"), "—");
});

test("formatters: formatPreciseMoney formats decimals with two digits", () => {
  assert.equal(formatPreciseMoney(1418.5), "1.418,50 TL");
  assert.equal(formatPreciseMoney(-250.75), "−250,75 TL");
  assert.equal(formatPreciseMoney(null), "—");
});

test("formatters: formatEur formats EUR currency", () => {
  const formatted = formatEur(5377490);
  assert.ok(formatted.includes("5.377.490") && formatted.includes("€"), `Unexpected: ${formatted}`);
  assert.equal(formatEur(null), "—");
});

test("formatters: formatPercent formats percentages with comma separator", () => {
  assert.equal(formatPercent(26.4), "%26,4");
  assert.equal(formatPercent(0), "%0,0");
  assert.equal(formatPercent(null), "—");
  assert.equal(formatPercent(undefined), "—");
  assert.equal(formatPercent(null, { fallback: "Hesaplanıyor" }), "Hesaplanıyor");
});

test("formatters: formatInteger formats item counts", () => {
  assert.equal(formatInteger(22077), "22.077");
  assert.equal(formatInteger(null), "0");
});
