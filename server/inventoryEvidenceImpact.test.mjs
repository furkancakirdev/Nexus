import test from "node:test";
import assert from "node:assert/strict";
import { buildInventoryEvidenceImpact } from "./inventoryEvidenceImpact.mjs";

const row = (overrides = {}) => ({
  id: "R-1", productCode: "P-1", depotCode: "D-1", movementDate: "2026-01-01",
  documentType: 9, quantity: 1, grossAmount: 100, discountAmount: 0,
  ...overrides,
});

test("maliyet belirsizliği aynı ürün-depoda aynı gün ve sonraki satışları etkiler", () => {
  const result = buildInventoryEvidenceImpact({ rows: [
    row({ id: "S-BEFORE", documentType: 85, movementDate: "2026-01-01" }),
    row({ id: "P-BAD", documentType: 9, movementDate: "2026-01-02", grossAmount: 10, discountAmount: 10 }),
    row({ id: "S-EQUAL", documentType: 85, movementDate: "2026-01-02" }),
    row({ id: "S-AFTER", documentType: 85, movementDate: "2026-01-03" }),
    row({ id: "S-OTHER", productCode: "P-2", documentType: 85, movementDate: "2026-01-03" }),
  ] });

  assert.equal(result.rawSaleRows, 4);
  assert.equal(result.affectedSaleRows, 2);
  assert.equal(result.noKnownBlockerSaleRows, 2);
  assert.equal(result.affectedStockKeys, 1);
  assert.deepEqual(result.affectedStockKeyList, ["P-1\u001fD-1"]);
  assert.equal(result.unresolvedSourceRows, 1);
  assert.deepEqual(result.scopes, [{
    productCode: "P-1", depotCode: "D-1", firstUnresolvedDate: "2026-01-02",
    unresolvedRowCount: 1, affectedSaleRowCount: 2, unaffectedEarlierSaleRowCount: 1,
    reasons: ["invalid-cost"],
  }]);
});

test("bilinmeyen kimlik veya tarih tüm satış kapsamlarını etkiler", () => {
  const result = buildInventoryEvidenceImpact({ rows: [
    row({ id: null, documentType: 85, movementDate: "2026-01-01" }),
    row({ id: "S-2", productCode: "P-2", depotCode: "D-2", documentType: 85, movementDate: "2026-02-01" }),
    row({ id: "P-NULL", productCode: "P-3", depotCode: "D-3", documentType: 9, movementDate: null, grossAmount: null }),
  ] });

  assert.equal(result.rawSaleRows, 2);
  assert.equal(result.affectedSaleRows, 2);
  assert.equal(result.noKnownBlockerSaleRows, 0);
  assert.equal(result.unresolvedSourceRows, 2);
  assert.equal(result.scopes.length, 3);
  assert.ok(result.scopes.every((scope) => scope.reasons.includes("unknown-identity-or-date")));
});

test("bağlı iade adayda kalır, bilinmeyen iade ve geçersiz negatif hareket çözülmemiştir", () => {
  const result = buildInventoryEvidenceImpact({ rows: [
    row({ id: "S-1", documentType: 85, documentNumber: "F-1", lineNumber: 1 }),
    row({ id: "R-LINKED", documentType: 18, sourceDocumentType: 85, sourceDocumentNumber: "F-1", sourceLineNumber: 1 }),
    row({ id: "R-UNKNOWN", documentType: 18, sourceDocumentType: 85, sourceDocumentNumber: "NOPE", sourceLineNumber: 1, movementDate: "2026-01-02" }),
    row({ id: "M-NEGATIVE", documentType: 9, quantity: -1, movementDate: "2026-01-03" }),
  ] });

  assert.equal(result.unresolvedSourceRows, 2);
  assert.equal(result.scopes[0].unresolvedRowCount, 2);
  assert.deepEqual(result.scopes[0].reasons, ["invalid-movement", "unlinked-return"]);
});

test("geçersiz kimlikli sıfır satır ekonomik olmayan satır gibi sessizce dışlanmaz", () => {
  const result = buildInventoryEvidenceImpact({ rows: [
    row({ id: null, documentType: 85, quantity: 0 }),
    row({ id: "S-1", documentType: 85, movementDate: "2026-01-02" }),
  ] });

  assert.equal(result.rawSaleRows, 2);
  assert.equal(result.unresolvedSourceRows, 1);
  assert.equal(result.affectedSaleRows, 2);
  assert.equal(result.noKnownBlockerSaleRows, 0);
});
