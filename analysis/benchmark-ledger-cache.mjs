import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { buildDepartmentAnalysis } from "../server/departmentAnalysis.mjs";
import {
  buildOverviewRows,
  filterAuditLedger,
} from "../server/ledgerApi.mjs";
import { createLedgerService } from "../server/ledgerService.mjs";

function fixtureLedger(rowCount = 2_000) {
  const rows = Array.from({ length: rowCount }, (_, index) => {
    const isSale = index % 11 !== 0;
    const netAmount = 100 + index % 250;
    const commercialOwner = index % 3 ? "CAN" : "FURKAN";
    const department = commercialOwner === "FURKAN" ? "service" : "parts";
    return {
      rootId: index + 1,
      documentType: isSale ? 85 : 18,
      documentNo: `${isSale ? "SF" : "SI"}-${String(index + 1).padStart(6, "0")}`,
      documentDate: `2026-${String(index % 12 + 1).padStart(2, "0")}-15T10:00:00.000Z`,
      customerCode: `C-${index % 300}`,
      customerName: `Müşteri ${index % 300}`,
      lineNo: 1,
      productCode: `P-${index % 500}`,
      productName: `Ürün ${index % 500}`,
      brandName: `Marka ${index % 20}`,
      quantity: 1,
      grossAmount: netAmount + 10,
      discountAmount: 10,
      netAmount,
      signedNetSales: isSale ? netAmount : -netAmount,
      vatAmount: netAmount * 0.2,
      invoiceTotalInclVat: netAmount * 1.2,
      isSale,
      costMethod: isSale ? "priorPurchase" : "originalSaleCost",
      lineCost: (isSale ? 1 : -1) * netAmount * 0.6,
      unitCost: netAmount * 0.6,
      purchaseType: 9,
      purchaseNo: `AF-${index % 100}`,
      purchaseDate: "2025-12-15T10:00:00.000Z",
      purchasePartyName: "Fixture Tedarikçi",
      purchaseAccountCode: "T-001",
      commercialOwner,
      commercialOwnerName: commercialOwner === "FURKAN" ? "Furkan Çakır" : "Can",
      ownerActive: true,
      ownerLocation: department === "service" ? "Yatmarin" : "Merkez Ofis",
      department,
      attributionMethod: "upstream-history",
      attributionConfidence: "inferred",
      sourceOrderNo: `SSP-${index + 1}`,
      evidenceDocuments: [{ documentType: 14, documentNo: `SSP-${index + 1}`, depth: 1 }],
      actorEvents: [{ actorCode: commercialOwner, actorRole: "history-entry" }],
      fulfillmentDepotCode: index % 2 ? "MRK" : "YTM",
      fulfillmentDepotName: index % 2 ? "Merkez Depo" : "Yatmarin Depo",
      crossDepot: false,
      ownershipEvidence: { selectedField: "history-entry" },
    };
  });
  return {
    rows,
    totals: {
      netSales: rows.reduce((sum, row) => sum + row.signedNetSales, 0),
      rowCount: rows.length,
    },
    quality: { terminalRows: rows.length },
    quarantinedRows: [],
    reviewRequiredRows: [],
    excludedTestRows: [],
    pilotOrders: [],
    excludedPilotOrders: [],
  };
}

const ledger = fixtureLedger();
let loaderCalls = 0;
const service = createLedgerService({
  loadYear: async () => {
    loaderCalls += 1;
    return ledger;
  },
});

await service.get(2026);
const durations = [];
const overviewDurations = [];
const departmentDurations = [];
const auditDurations = [];
for (let iteration = 0; iteration < 10; iteration += 1) {
  const startedAt = performance.now();
  const snapshot = await service.get(2026);
  const overviewStartedAt = performance.now();
  buildOverviewRows(snapshot.value);
  overviewDurations.push(performance.now() - overviewStartedAt);
  const departmentStartedAt = performance.now();
  buildDepartmentAnalysis({ ledger: snapshot.value, year: 2026 });
  departmentDurations.push(performance.now() - departmentStartedAt);
  const auditStartedAt = performance.now();
  filterAuditLedger(snapshot.value, { page: 1, pageSize: 50 });
  auditDurations.push(performance.now() - auditStartedAt);
  durations.push(performance.now() - startedAt);
}

const maximumMs = Math.max(...durations);
const averageMs = durations.reduce((sum, value) => sum + value, 0) / durations.length;
const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const percentile95 = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1];
};
assert.equal(loaderCalls, 1, "Warm okumalar aynı yıl için yeniden CPM yüklemesi yapmamalı.");

console.log(JSON.stringify({
  rows: ledger.rows.length,
  iterations: durations.length,
  loaderCalls,
  averageMs: Number(averageMs.toFixed(2)),
  maximumMs: Number(maximumMs.toFixed(2)),
  p95Ms: Number(percentile95(durations).toFixed(2)),
  components: {
    overviewAverageMs: Number(average(overviewDurations).toFixed(2)),
    overviewMaximumMs: Number(Math.max(...overviewDurations).toFixed(2)),
    departmentAverageMs: Number(average(departmentDurations).toFixed(2)),
    departmentMaximumMs: Number(Math.max(...departmentDurations).toFixed(2)),
    auditAverageMs: Number(average(auditDurations).toFixed(2)),
    auditMaximumMs: Number(Math.max(...auditDurations).toFixed(2)),
  },
  thresholdMs: 80,
}, null, 2));

assert.ok(
  maximumMs <= 80,
  `Warm aggregate ${maximumMs.toFixed(2)} ms ile 80 ms sınırını aştı.`,
);
