import test from "node:test";
import assert from "node:assert/strict";
import { classifyOpeningEvidence, summarizeOpeningEvidenceDiagnostics } from "./openingEvidenceMatcher.mjs";

test("açılış tanısı kaynak satırları yoksa güvenli biçimde not-available döner", () => {
  assert.deepEqual(summarizeOpeningEvidenceDiagnostics({}), {
    status: "not-available",
    exactKeyCount: 0,
    quantityOnlyCount: 0,
    conflictCount: 0,
    missingCostCount: 0,
    costConflictCount: 0,
    unmatchedCount: 0,
    officialEligibleCount: 0,
    samples: [],
  });
});

test("mevcut tanı metadata'sı normalize edilir, resmi maliyete otomatik bağlanmaz", () => {
  const result = summarizeOpeningEvidenceDiagnostics({ openingEvidenceDiagnostics: {
    status: "available", exactKeyCount: 2.9, quantityOnlyCount: 1, conflictCount: 3,
    missingCostCount: 4, unmatchedCount: 5, officialEligibleCount: 6,
    samples: [],
  } });
  assert.deepEqual(result, {
    status: "available", exactKeyCount: 2, quantityOnlyCount: 1, conflictCount: 3,
    missingCostCount: 4, costConflictCount: 0, unmatchedCount: 5, officialEligibleCount: 6,
    samples: [],
  });
});

test("STKSYM açılış satırlarını doğal anahtar ve maliyet kanıtına göre sınıflandırır", () => {
  const result = classifyOpeningEvidence({
    symRows: [
      { id: "SYM-1", productCode: "P-1", depotCode: "M", date: "2026-01-01", evrakNo: "E1", sirano: 1, quantity: 10, unitCostTryExVat: 100 },
      { id: "SYM-2", productCode: "P-2", depotCode: "M", date: "2026-01-01", evrakNo: "E2", sirano: 1, quantity: 5, unitCostTryExVat: 80 },
      { id: "SYM-3", productCode: "P-3", depotCode: "M", date: "2026-01-01", evrakNo: "E3", sirano: 1, quantity: 7, unitCostTryExVat: null },
      { id: "SYM-4", productCode: "P-4", depotCode: "M", date: "2026-01-01", evrakNo: "E4", sirano: 1, quantity: 9, unitCostTryExVat: 40 },
    ],
    harRows: [
      { id: "HAR-1", productCode: "P-1", depotCode: "M", date: "2026-01-01", evrakNo: "E1", sirano: 1, quantity: 10, unitCostTryExVat: 100 },
      { id: "HAR-2", productCode: "P-2", depotCode: "M", date: "2026-01-01", evrakNo: "E2", sirano: 1, quantity: 4, unitCostTryExVat: 80 },
      { id: "HAR-3", productCode: "P-3", depotCode: "M", date: "2026-01-01", evrakNo: "E3", sirano: 1, quantity: 7, unitCostTryExVat: null },
      { id: "HAR-4", productCode: "P-4", depotCode: "X", date: "2026-01-02", evrakNo: "E9", sirano: 9, quantity: 9, unitCostTryExVat: 40 },
    ],
  });

  assert.deepEqual(result.map(({ classification, sourceRowIds, reviewReason }) => ({ classification, sourceRowIds, reviewReason })), [
    { classification: "exact-key", sourceRowIds: { sym: ["SYM-1"], har: ["HAR-1"] }, reviewReason: null },
    { classification: "quantity-only", sourceRowIds: { sym: ["SYM-2"], har: ["HAR-2"] }, reviewReason: "natural-key-not-matched" },
    { classification: "missing-cost-evidence", sourceRowIds: { sym: ["SYM-3"], har: ["HAR-3"] }, reviewReason: "missing-unit-cost" },
    { classification: "document-date-depot-conflict", sourceRowIds: { sym: ["SYM-4"], har: ["HAR-4"] }, reviewReason: "natural-key-conflict" },
  ]);
});

test("miktar eşleşmesi tek başına resmi açılış kanıtı üretmez", () => {
  const [item] = classifyOpeningEvidence({
    symRows: [{ id: "S", productCode: "P", depotCode: "M", date: "2026-01-01", evrakNo: "E1", sirano: 1, quantity: 3, unitCostTryExVat: 10 }],
    harRows: [{ id: "H", productCode: "P", depotCode: "X", date: "2026-02-01", evrakNo: "E9", sirano: 9, quantity: 3, unitCostTryExVat: 10 }],
  });
  assert.equal(item.official, false);
});

test("eksik doğal anahtar alanı eşleşmeyi resmi kabul ettirmez", () => {
  const [item] = classifyOpeningEvidence({
    symRows: [{ id: "S", productCode: "P", depotCode: "M", date: "2026-01-01", quantity: 3, unitCostTryExVat: 10 }],
    harRows: [{ id: "H", productCode: "P", depotCode: "M", date: "2026-01-01", quantity: 3, unitCostTryExVat: 10 }],
  });
  assert.equal(item.classification, "unmatched");
  assert.equal(item.official, false);
});

test("doğal anahtar eşleşse bile farklı pozitif maliyet ayrı bir çatışmadır", () => {
  const [item] = classifyOpeningEvidence({
    symRows: [{ id: "S", productCode: "P", depotCode: "M", date: "2026-01-01", evrakNo: "E1", sirano: 1, quantity: 3, unitCostTryExVat: 100, currency: "TRY" }],
    harRows: [{ id: "H", productCode: "P", depotCode: "M", date: "2026-01-01", evrakNo: "E1", sirano: 1, quantity: 3, unitCostTryExVat: 120, currency: "TRY" }],
  });
  assert.equal(item.classification, "cost-conflict");
  assert.equal(item.reviewReason, "cost-mismatch");
  assert.equal(item.official, false);
  assert.equal(item.sym.unitCost, 100);
  assert.equal(item.har.unitCost, 120);
});

test("sıfır maliyet ve eksik para birimi açılış kanıtını karantinaya alır", () => {
  const [item] = classifyOpeningEvidence({
    symRows: [{ id: "S", productCode: "P", depotCode: "M", date: "2026-01-01", evrakNo: "E1", sirano: 1, quantity: 3, unitCostTryExVat: 0, currency: null }],
    harRows: [{ id: "H", productCode: "P", depotCode: "M", date: "2026-01-01", evrakNo: "E1", sirano: 1, quantity: 3, unitCostTryExVat: 100, currency: "TRY" }],
  });
  assert.equal(item.classification, "missing-cost-evidence");
  assert.equal(item.reviewReason, "missing-unit-cost");
  assert.equal(item.official, false);
  assert.deepEqual(item.quarantineReasons, ["missing-unit-cost", "missing-currency"]);
});

test("negatif veya eksik ürün-depo-tarih kimliği açılış eşleşmesine alınmaz", () => {
  const result = classifyOpeningEvidence({
    symRows: [
      { id: "NEG", productCode: "P", depotCode: "M", date: "2026-01-01", evrakNo: "E1", sirano: 1, quantity: -1, unitCostTryExVat: 10 },
      { id: "KEY", productCode: "P", depotCode: null, date: "2026-01-01", evrakNo: "E2", sirano: 1, quantity: 1, unitCostTryExVat: 10 },
    ],
    harRows: [{ id: "H", productCode: "P", depotCode: "M", date: "2026-01-01", evrakNo: "E1", sirano: 1, quantity: -1, unitCostTryExVat: 10 }],
  });
  assert.equal(result[0].classification, "unmatched");
  assert.deepEqual(result[0].quarantineReasons, ["non-positive-quantity"]);
  assert.equal(result[1].reviewReason, "invalid-opening-identity");
  assert.deepEqual(result[1].quarantineReasons, ["missing-depot"]);
});
