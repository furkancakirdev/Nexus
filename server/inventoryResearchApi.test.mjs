import test from "node:test";
import assert from "node:assert/strict";
import { buildComparableYearWacResearch, buildInventoryResearchPayload } from "./inventoryResearchApi.mjs";

test("inventory research payload is read-only and exposes source status", () => {
  const payload = buildInventoryResearchPayload({
    year: 2026,
    source: { status: "missing", evidence: { reason: "not-verified" } },
    rows: [{ id: "1", cardCode: "P1", quantity: 2 }],
  });
  assert.equal(payload.readOnly, true);
  assert.equal(payload.inventorySource.status, "missing");
  assert.equal(payload.currentStock.status, "unavailable");
  assert.equal(payload.openingEvidenceDiagnostics.status, "not-available");
  assert.equal(payload.openingEvidenceDiagnostics.officialEligibleCount, 0);
  assert.equal(payload.rows.length, 1);
});

test("inventory research mevcut açılış tanı metadata'sını read-only taşır", () => {
  const payload = buildInventoryResearchPayload({
    year: 2026,
    source: { status: "verified", evidence: { openingEvidenceDiagnostics: {
      status: "available", exactKeyCount: 3,
    } } },
  });
  assert.equal(payload.openingEvidenceDiagnostics.status, "available");
  assert.equal(payload.openingEvidenceDiagnostics.exactKeyCount, 3);
  assert.equal(payload.openingEvidenceDiagnostics.officialEligibleCount, 0);
});

test("inventory research satır bazlı açılış sınıf özetini taşır", () => {
  const payload = buildInventoryResearchPayload({
    year: 2026,
    source: { status: "verified", evidence: {
      openingEvidenceDiagnostics: { status: "available", classificationCounts: { "quantity-only": 4, unmatched: 2 }, officialEligibleCount: 0 },
    } },
  });
  assert.deepEqual(payload.openingEvidenceDiagnostics.classificationCounts, { "quantity-only": 4, unmatched: 2 });
});

test("inventory research açılış tanı örneklerini en fazla 20 güvenli alanla taşır", () => {
  const rows = Array.from({ length: 21 }, (_, index) => ({
    symId: `sym-${index}`,
    harId: `har-${index}`,
    productCode: `P-${index}`,
    symDepotCode: "D01",
    symDate: "2026-01-01",
    symQuantity: 10,
    harQuantity: 9,
    classification: "quantity-only",
    reviewReason: "natural-key-not-matched",
    customerCode: "MUSTERI-GIZLI",
  }));
  const payload = buildInventoryResearchPayload({
    year: 2026,
    source: { status: "verified", evidence: { openingEvidenceRows: rows } },
  });
  assert.equal(payload.openingEvidenceDiagnostics.samples.length, 20);
  assert.deepEqual(payload.openingEvidenceDiagnostics.samples[0], {
    symId: "sym-0",
    harId: "har-0",
    productCode: "P-0",
    depotCode: "D01",
    date: "2026-01-01",
    symQuantity: 10,
    harQuantity: 9,
    harDocumentNo: null,
    harLineNo: null,
    harDate: null,
    harDepotCode: null,
    symUnitCost: null,
    harUnitCost: null,
    symCurrency: null,
    harCurrency: null,
    classification: "quantity-only",
    reviewReason: "natural-key-not-matched",
  });
  assert.equal("customerCode" in payload.openingEvidenceDiagnostics.samples[0], false);
});

test("inventory research örnekleri sınıf önceliği ve STKHAR kanıt alanlarını taşır", () => {
  const rows = [
    { symId: "U-1", classification: "unmatched", symDate: "2026-01-01" },
    { symId: "Q-1", harId: "H-Q", classification: "quantity-only", harEvrakNo: "HAR-42", harSirano: 7, harDate: "2026-01-02", harDepotCode: "D02", harQuantity: 4 },
    { symId: "E-1", harId: "H-E", classification: "exact-key", harEvrakNo: "HAR-10", harSirano: 2, harDate: "2026-01-03", harDepotCode: "D01", harQuantity: 5 },
    { symId: "C-1", harId: "H-C", classification: "document-date-depot-conflict", harEvrakNo: "HAR-99", harSirano: 3, harDate: "2026-01-04", harDepotCode: "D09", harQuantity: 6 },
  ];
  const payload = buildInventoryResearchPayload({
    year: 2026,
    source: { status: "verified", evidence: { openingEvidenceRows: rows } },
  });
  const samples = payload.openingEvidenceDiagnostics.samples;
  assert.deepEqual(samples.map((sample) => sample.classification), [
    "exact-key", "quantity-only", "document-date-depot-conflict", "unmatched",
  ]);
  assert.deepEqual(samples[0], {
    symId: "E-1", harId: "H-E", productCode: null, depotCode: "D01", date: "2026-01-03",
    symQuantity: null, harQuantity: 5, harDocumentNo: "HAR-10", harLineNo: 2,
    harDate: "2026-01-03", harDepotCode: "D01", symUnitCost: null, harUnitCost: null,
    symCurrency: null, harCurrency: null, classification: "exact-key", reviewReason: null,
  });
});

test("2024-2025 karşılaştırmalı WAC aynı ürün-depo-döviz anahtarında candidate kalır", () => {
  const result = buildComparableYearWacResearch({
    years: [2025, 2024],
    movements: [
      {
        id: "O-2024", productCode: "P-1", depotCode: "D-1", productCurrency: "EUR",
        kind: "opening", date: "2024-01-01", quantity: 10,
        unitCostTryExVat: 100, unitCostCurrencyExVat: 2.5,
      },
      {
        id: "S-2024", productCode: "P-1", depotCode: "D-1", productCurrency: "EUR",
        kind: "sale", date: "2024-02-01", quantity: 2,
      },
      {
        id: "S-2025", productCode: "P-1", depotCode: "D-1", productCurrency: "EUR",
        kind: "sale", date: "2025-01-02", quantity: 2,
      },
      {
        id: "S-OTHER-CURRENCY", productCode: "P-1", depotCode: "D-1", productCurrency: "USD",
        kind: "sale", date: "2025-01-02", quantity: 1,
      },
    ],
  });

  assert.deepEqual(result.years.map((year) => year.year), [2024, 2025]);
  assert.equal(result.status, "candidate");
  assert.equal(result.financialStatus, "blocked");
  assert.equal(result.eligibleForOfficialWac, false);
  assert.equal(result.officialWac, null);
  assert.equal(result.years[0].coveredRows, 2);
  assert.equal(result.years[1].carriedClosingWacCount, 1);
  assert.equal(result.years[1].coveredRows, 1);
  assert.equal(result.years[1].reviewCountByReason["opening-cost-unknown"], 1);
});

test("inventory research candidate WAC özetini official ledger alanlarından ayrı taşır", () => {
  const payload = buildInventoryResearchPayload({
    year: 2025,
    source: {
      status: "candidate",
      financialStatus: "blocked",
      movements: [{
        id: "O-1", productCode: "P-1", depotCode: "D-1", productCurrency: "TRY",
        kind: "opening", date: "2024-01-01", quantity: 3, unitCostTryExVat: 10,
      }],
      evidence: { reason: "movement-source-not-verified" },
    },
  });

  assert.equal(payload.comparableYearWac.status, "candidate");
  assert.equal(payload.comparableYearWac.financialStatus, "blocked");
  assert.equal(payload.comparableYearWac.eligibleForOfficialWac, false);
  assert.equal(payload.comparableYearWac.officialWac, null);
  assert.equal(payload.inventorySource.status, "candidate");
  assert.equal(payload.inventorySource.financialStatus, "blocked");
});
