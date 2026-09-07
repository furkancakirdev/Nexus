import test from "node:test";
import assert from "node:assert/strict";
import { buildOverviewRows } from "./ledgerApi.mjs";

function ledgerRow(overrides = {}) {
  return {
    documentDate: "2026-08-10T00:00:00.000Z",
    productCode: "P-1",
    isSale: true,
    grossAmount: 100,
    discountAmount: 0,
    netAmount: 100,
    signedNetSales: 100,
    lineCost: 55,
    costMethod: "priorPurchase",
    financeV2: {
      lineCostTryExVat: 60,
      productListGrossMarginPct: 20,
      observationKey: "P-1|2026-08-01|FX-1",
      reviewReason: null,
    },
    ...overrides,
  };
}

test("aylık overview maliyet kâr ve ortalama ürün marjını yalnız V2 defterinden üretir", () => {
  const [august] = buildOverviewRows({
    rows: [
      ledgerRow(),
      ledgerRow(),
      ledgerRow({
        productCode: "P-2",
        grossAmount: 200,
        netAmount: 200,
        signedNetSales: 200,
        lineCost: 110,
        financeV2: {
          lineCostTryExVat: 120,
          productListGrossMarginPct: 40,
          observationKey: "P-2|2026-08-02|FX-2",
          reviewReason: null,
        },
      }),
      ledgerRow({
        productCode: "P-3",
        grossAmount: 50,
        netAmount: 50,
        signedNetSales: 50,
        lineCost: 10,
        financeV2: {
          lineCostTryExVat: null,
          productListGrossMarginPct: null,
          observationKey: null,
          reviewReason: "missing-exchange-rate",
        },
      }),
    ],
  });

  assert.equal(august.cost, 240);
  assert.equal(august.coveredNetSales, 400);
  assert.equal(august.reviewNetSales, 50);
  assert.equal(august.profit, 160);
  assert.equal(august.margin, 40);
  assert.equal(august.averageProductListGrossMarginPct, 30);
  assert.equal(august.v2CostCoveredLines, 3);
  assert.equal(august.v2ReviewLines, 1);
  assert.equal(august.v2CostCoveragePct, 75);
  assert.equal(august.estimatedCost, 0);
  assert.equal(august.legacyEstimatedCost, 230);
});

test("V2 kanıtı eksik ayda profit üretmez ve tüm net satışı incelemeye ayırır", () => {
  const [august] = buildOverviewRows({
    rows: [ledgerRow({
      financeV2: {
        lineCostTryExVat: null,
        productListGrossMarginPct: null,
        observationKey: null,
        reviewReason: "missing-product-currency",
      },
    })],
  });

  assert.equal(august.cost, 0);
  assert.equal(august.profit, 0);
  assert.equal(august.margin, null);
  assert.equal(august.coveredNetSales, 0);
  assert.equal(august.reviewNetSales, 100);
  assert.equal(august.averageProductListGrossMarginPct, null);
});

test("resmi WAC kaynağı eksikse legacy tahmini maliyet overview toplamına sızmaz", () => {
  const [august] = buildOverviewRows({
    rows: [ledgerRow({
      lineCost: 55,
      financeV2: {
        schemaVersion: 2,
        costMethod: "movingWeightedAverage",
        costStatus: "review",
        lineCostTryExVat: null,
        reviewReason: "source-contract-missing",
      },
    })],
  });

  assert.equal(august.cost, 0);
  assert.equal(august.estimatedCost, 0);
  assert.equal(august.reviewNetSales, 100);
  assert.equal(august.uncoveredNetSales, 0);
});

test("legacy alım seçimi resmi olmayan overview maliyetine de taşınmaz", () => {
  const [august] = buildOverviewRows({
    rows: [ledgerRow({
      lineCost: 55,
      purchaseNo: "PUR-1",
      costMethod: "priorPurchase",
      financeV2: { schemaVersion: 2, costStatus: "review", lineCostTryExVat: null, reviewReason: "movement-source-not-verified" },
    })],
  });

  assert.equal(august.cost, 0);
  assert.equal(august.estimatedCost, 0);
  assert.equal(august.legacyEstimatedCost, 55);
  assert.equal(august.reviewNetSales, 100);
});
