import test from "node:test";
import assert from "node:assert/strict";
import { buildFinancialVisibility } from "./financialVisibility.mjs";

test("inceleme durumunda hesaplanabilen TRY sonucu geçici olarak görünür kalır", () => {
  const result = buildFinancialVisibility({
    status: "INCELEME",
    try: { netSales: 1000, cost: 600, profit: 400, margin: 40 },
    scope: {
      confirmed: { lines: 8, netSales: 800, cost: 600, profit: 200, margin: 25 },
      costReview: { lines: 2, netSales: 200, cost: 0, profit: 200, margin: 100 },
    },
  });
  assert.equal(result.complete, false);
  assert.equal(result.provisionalProfit, 400);
  assert.equal(result.provisionalMargin, 40);
  assert.equal(result.missingLines, 2);
  assert.equal(result.missingNetSales, 200);
  assert.equal(result.confirmedProfit, 200);
});

test("geçersiz veya bulunmayan finansal değerleri sıfır gibi göstermez", () => {
  const result = buildFinancialVisibility({ status: "INCELEME", try: { netSales: Number.NaN } });
  assert.equal(result.netSales, null);
  assert.equal(result.knownCost, null);
  assert.equal(result.provisionalProfit, null);
  assert.equal(result.provisionalMargin, null);
});

test("yalnız tamam ve eksik maliyetsiz metrik doğrulanmış sayılır", () => {
  const completeTry = { netSales: 100, cost: 60, profit: 40, margin: 40 };
  assert.equal(buildFinancialVisibility({ status: "TAMAM", try: completeTry, scope: { costReview: { lines: 0 } } }).complete, true);
  assert.equal(buildFinancialVisibility({ status: "TAMAM", try: completeTry, scope: { costReview: { lines: 1 } } }).complete, false);
  assert.equal(buildFinancialVisibility({ status: "TAMAM", eur: { complete: false } }).complete, false);
  assert.equal(buildFinancialVisibility({ status: "TAMAM", try: completeTry }).missingLines, null);
});
