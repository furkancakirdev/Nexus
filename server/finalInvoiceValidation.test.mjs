import assert from "node:assert/strict";
import test from "node:test";

import {
  validateHealth,
  validateYearPayloads,
} from "../analysis/validate-final-invoice-ledger.mjs";

function validPayloads() {
  return {
    overview: {
      mode: "live",
      readOnly: true,
      rows: [{
        sales: 120,
        returns: 10,
        discounts: 10,
        provisionalLineCount: 0,
        pilotCards: {},
      }],
    },
    departments: {
      mode: "live",
      readOnly: true,
      totals: {
        netSales: 100,
        confirmedSales: 60,
        inferredSales: 30,
        reviewSales: 10,
      },
      departments: [
        { id: "service", netSales: 40 },
        { id: "parts", netSales: 50 },
        { id: "review", netSales: 10 },
      ],
      detailRows: [{
        commercialOwner: "FURKAN",
        documentDate: "2026-01-10",
      }],
    },
    targets: {
      mode: "live",
      readOnly: true,
      rows: [
        { department: "service", month: 1, actual: 40, pool: 2 },
        { department: "parts", month: 1, actual: 50, pool: 3 },
        { department: "service", month: 2, actual: 0, pool: 1 },
      ],
      summary: { actual: 90, totalPool: 6 },
    },
    audit: {
      mode: "live",
      readOnly: true,
      summary: {
        totalRows: 2,
        filteredNetAmount: 600,
        analysisNetAmount: 100,
        excludedNetAmount: 500,
      },
      rows: [{
        documentType: 85,
        revenueSource: "invoice",
        commercialOwner: "FURKAN",
      }],
    },
    approvals: { readOnlyCpm: true, approvals: {} },
  };
}

test("canlı sağlık sözleşmesi CPM salt okunur sınırını doğrular", () => {
  assert.doesNotThrow(() => validateHealth({
    connected: true,
    mode: "live",
    readOnly: true,
    database: "Marlin_Uyg",
  }));
  assert.throws(
    () => validateHealth({ connected: true, mode: "live", readOnly: false }),
    /salt okunur/,
  );
});

test("yıllık birleşik defter, departman, hedef ve denetim toplamlarını uzlaştırır", () => {
  const result = validateYearPayloads(2026, validPayloads());

  assert.equal(result.overviewNetSales, 100);
  assert.equal(result.departmentNetSales, 100);
  assert.equal(result.targetActualNetSales, 90);
  assert.equal(result.auditNetSales, 100);
  assert.equal(result.provisionalEconomicRows, 0);
  assert.equal(result.convertedRetailEconomicRows, 0);
  assert.equal(result.totalPool, 6);
});

test("ticari olmayan veya tarih sınırı dışındaki sahipliği reddeder", () => {
  const accountant = validPayloads();
  accountant.departments.detailRows[0].commercialOwner = "BIRCAN";
  assert.throws(
    () => validateYearPayloads(2026, accountant),
    /BIRCAN/,
  );

  const formerEmployee = validPayloads();
  formerEmployee.departments.detailRows[0] = {
    commercialOwner: "OGENCOGLU",
    documentDate: "2024-07-01",
  };
  assert.throws(
    () => validateYearPayloads(2024, formerEmployee),
    /OGENCOGLU/,
  );

  const accountCard = validPayloads();
  accountCard.departments.detailRows[0].commercialOwner = "DBS003";
  assert.throws(
    () => validateYearPayloads(2026, accountCard),
    /personel olmayan/,
  );
});

test("eski personelin ayrılış öncesi ticari kanıtıyla sonradan faturalanan işi korur", () => {
  const historicalChain = validPayloads();
  historicalChain.departments.detailRows[0] = {
    commercialOwner: "OGENCOGLU",
    documentDate: "2024-12-26",
    ownershipEvidence: {
      selected: { documentKey: "13|TF003947|A2610" },
    },
    actorEvents: [{
      documentKey: "13|TF003947|A2610",
      actorCode: "OGENCOGLU",
      actorRole: "history-entry",
      firstSeen: "2024-03-04",
    }],
  };

  assert.doesNotThrow(() => validateYearPayloads(2024, historicalChain));

  historicalChain.departments.detailRows[0].actorEvents[0].firstSeen = "2024-07-01";
  assert.throws(
    () => validateYearPayloads(2024, historicalChain),
    /OGENCOGLU/,
  );
});

test("geçici veya nihai faturaya dönüşmüş perakende ekonomisini reddeder", () => {
  const provisional = validPayloads();
  provisional.overview.rows[0].provisionalLineCount = 1;
  assert.throws(
    () => validateYearPayloads(2026, provisional),
    /geçici ekonomik/,
  );

  const convertedRetail = validPayloads();
  convertedRetail.audit.rows[0] = {
    documentType: 91,
    revenueSource: "invoice",
    convertedToFinal: true,
  };
  assert.throws(
    () => validateYearPayloads(2026, convertedRetail),
    /dönüşmüş perakende/,
  );
});

test("departman ve aylık havuz toplamı sapmalarını reddeder", () => {
  const departments = validPayloads();
  departments.departments.departments[0].netSales = 39;
  assert.throws(
    () => validateYearPayloads(2026, departments),
    /departman bileşenleri/,
  );

  const pool = validPayloads();
  pool.targets.summary.totalPool = 7;
  assert.throws(
    () => validateYearPayloads(2026, pool),
    /havuz toplamı/,
  );
});
