import test from "node:test";
import assert from "node:assert/strict";
import { buildInventoryOpeningResearchPayload } from "./inventoryOpeningResearch.mjs";

test("inventory opening research remains candidate-only and caps sanitized samples", () => {
  const payload = buildInventoryOpeningResearchPayload({
    year: 2026,
    stkhArRows: [
      { ID: 10, MALKOD: "P1", DEPOKOD: "MRK", EVRAKNO: "SSF-1", EVRAKTARIH: "2026-01-02", SIRANO: 1, MIKTAR: 2, TUTAR: 100, ISKONTO: 10, KDV: 18 },
    ],
    stksymRows: [
      { ID: 20, MKOD: "P1", DEPO: "MRK", TARIH: "2026-01-01", EVRAKNO: "1", MIKTAR: 2, NKOD1: 999 },
    ],
    sampleLimit: 1,
  });

  assert.equal(payload.status, "candidate");
  assert.equal(payload.verified, false);
  assert.equal(payload.eligibleForOfficialWac, false);
  assert.equal(payload.readinessImpact, "none");
  assert.equal(payload.officialEligibleCount, 0);
  assert.equal(payload.stkhArType82.summary.rowCount, 1);
  assert.equal(payload.stkhArType82.samples.length, 1);
  assert.equal(payload.stkhArType82.samples[0].netAmount, 90);
  assert.equal("customerCode" in payload.stkhArType82.samples[0], false);
  assert.equal(payload.stkhArType81.summary.rowCount, 0);
  assert.equal(payload.stksymDevir.samples[0].unitCost, undefined);
});

test("inventory opening research keeps direction and opening lineage unverified", () => {
  const payload = buildInventoryOpeningResearchPayload({
    year: 2026,
    stkhArRows: [{ ID: 1, MALKOD: "P1", DEPOKOD: "MRK", EVRAKTARIH: "2026-01-01", MIKTAR: 1, TUTAR: 0, ISKONTO: 0, GCKOD: 0 }],
    stksymRows: [],
  });

  assert.deepEqual(payload.reasonCodes, [
    "direction-semantics-unverified",
    "opening-lineage-unverified",
    "cost-semantics-unverified",
  ]);
  assert.equal(payload.stkhArType82.samples[0].directionCode, 0);
  assert.equal(payload.stkhArType82.samples[0].directionMeaning, undefined);
});

test("inventory opening research keeps EVRAKTIP 81 and 82 separate while combining diagnostics", () => {
  const payload = buildInventoryOpeningResearchPayload({
    year: 2026,
    sampleLimit: 2,
    stkhArRows: [{ ID: 82, MALKOD: "P82", EVRAKTIP: 82, EVRAKTARIH: "2026-01-01", MIKTAR: 1, TUTAR: 10, ISKONTO: 0 }],
    stkhArType81Rows: [{ ID: 81, MALKOD: "P81", EVRAKTIP: 81, EVRAKTARIH: "2026-01-02", MIKTAR: 1, TUTAR: 0, ISKONTO: 0 }],
  });

  assert.equal(payload.stkhArType82.samples[0].documentType, 82);
  assert.equal(payload.stkhArType81.samples[0].documentType, 81);
  assert.deepEqual(payload.openingEvidenceDiagnostics.stkhArDocumentTypeCounts, { "81": 1, "82": 1 });
  assert.equal(payload.openingEvidenceDiagnostics.sampleRowCount, 2);
  assert.equal(payload.eligibleForOfficialWac, false);
});

test("inventory opening research uses full-query summaries while keeping samples bounded", () => {
  const payload = buildInventoryOpeningResearchPayload({
    year: 2026,
    stkhArRows: [{ ID: 1, MALKOD: "P1", DEPOKOD: "MRK", EVRAKTARIH: "2026-01-01", MIKTAR: 1, TUTAR: 10, ISKONTO: 1 }],
    stkhArSummary: { rowCount: 22004, distinctProductCount: 1200, distinctDepotCount: 4 },
    stksymRows: [{ ID: 2, MALKOD: "P1", DEPOKOD: "MRK", MIKTAR: 1 }],
    stksymSummary: { rowCount: 22004, distinctProductCount: 1200 },
    sampleLimit: 1,
  });

  assert.equal(payload.stkhArType82.summary.rowCount, 22004);
  assert.equal(payload.stkhArType82.samples.length, 1);
  assert.equal(payload.stksymDevir.summary.rowCount, 22004);
  assert.equal(payload.stksymDevir.samples.length, 1);
});

test("inventory opening research normalizes database Date values", () => {
  const payload = buildInventoryOpeningResearchPayload({
    year: 2026,
    stkhArRows: [{ ID: 1, MALKOD: "P1", EVRAKTARIH: new Date("2026-01-02T10:00:00Z"), MIKTAR: 1, TUTAR: 10, ISKONTO: 0 }],
  });
  assert.equal(payload.stkhArType82.samples[0].movementDate, "2026-01-02");
});

test("inventory opening diagnostics declare that counts are sample-scoped", () => {
  const payload = buildInventoryOpeningResearchPayload({
    year: 2026,
    sampleLimit: 3,
    stkhArRows: [
      { ID: 1, MALKOD: "P1", DEPOKOD: "D1", EVRAKTARIH: "2026-01-01", MIKTAR: 1, TUTAR: 10, ISKONTO: 0 },
    ],
    stksymRows: [],
  });

  assert.equal(payload.openingEvidenceDiagnostics.scope, "sample");
  assert.equal(payload.openingEvidenceDiagnostics.sampleLimit, 3);
  assert.equal(payload.openingEvidenceDiagnostics.sampleRowCount, 1);
});

test("inventory opening diagnostics keeps full-source match summary separate from official eligibility", () => {
  const payload = buildInventoryOpeningResearchPayload({
    year: 2026,
    stkhArRows: [],
    stksymRows: [],
    stksymStkhArMatchSummary: {
      symRowCount: 6465,
      sameProductDepotDateRowCount: 6,
      sameProductDepotDateQuantityRowCount: 1,
      uniqueQuantityMatchRowCount: 1,
      multiDirectionMatchRowCount: 0,
      unmatchedRowCount: 6459,
    },
  });
  assert.deepEqual(payload.openingEvidenceDiagnostics.sourceMatchSummary, {
    symRowCount: 6465,
    sameProductDepotDateRowCount: 6,
    sameProductDepotDateQuantityRowCount: 1,
    uniqueQuantityMatchRowCount: 1,
    multiDirectionMatchRowCount: 0,
    unmatchedRowCount: 6459,
  });
  assert.equal(payload.officialEligibleCount, 0);
  assert.equal(payload.eligibleForOfficialWac, false);
});

test("inventory opening diagnostics keeps document lineage matching separate from official eligibility", () => {
  const payload = buildInventoryOpeningResearchPayload({
    year: 2026,
    stkhArRows: [],
    stksymRows: [],
    stksymStkhArDocumentMatchSummary: {
      symRowCount: 6465,
      missingDocumentKeyRowCount: 12,
      sameDocumentNumberRowCount: 9,
      sameDocumentLineRowCount: 4,
      uniqueDocumentLineMatchRowCount: 3,
      sameDocumentLineQuantityRowCount: 2,
      documentLineDirectionConflictRowCount: 1,
      documentLineUnmatchedRowCount: 6449,
    },
  });
  assert.deepEqual(payload.openingEvidenceDiagnostics.sourceDocumentMatchSummary, {
    symRowCount: 6465,
    missingDocumentKeyRowCount: 12,
    sameDocumentNumberRowCount: 9,
    sameDocumentLineRowCount: 4,
    uniqueDocumentLineMatchRowCount: 3,
    sameDocumentLineQuantityRowCount: 2,
    documentLineDirectionConflictRowCount: 1,
    documentLineUnmatchedRowCount: 6449,
  });
  assert.equal(payload.officialEligibleCount, 0);
  assert.equal(payload.eligibleForOfficialWac, false);
});

test("inventory opening diagnostics preserves normalized fields and classifies matching rows", () => {
  const payload = buildInventoryOpeningResearchPayload({
    year: 2026,
    sampleLimit: 1,
    stkhArRows: [{ ID: 10, MALKOD: "P1", DEPOKOD: "MRK", EVRAKTARIH: "2026-01-02", EVRAKNO: "SSF-1", SIRANO: 1, MIKTAR: 2, TUTAR: 100, ISKONTO: 10 }],
    stksymRows: [{ ID: 20, MALKOD: "P1", DEPOKOD: "MRK", EVRAKTARIH: "2026-01-02", EVRAKNO: "SSF-1", SIRANO: 1, MIKTAR: 2 }],
  });

  assert.equal(payload.openingEvidenceDiagnostics.samples[0].productCode, "P1");
  assert.equal(payload.openingEvidenceDiagnostics.samples[0].classification, "missing-cost-evidence");
  assert.equal(payload.openingEvidenceDiagnostics.samples[0].harDocumentNo, "SSF-1");
});
