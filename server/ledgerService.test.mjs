import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import express from "express";
import { buildFinalInvoiceLedger } from "./finalInvoiceLedger.mjs";
import { createLedgerService } from "./ledgerService.mjs";
import { createUnifiedLedgerRouter } from "./ledgerApi.mjs";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

function assertLedgerMetadata(payload, {
  ledgerVersion,
  generatedAt,
  cacheStatus,
} = {}) {
  assert.equal(Object.hasOwn(payload, "ledgerVersion"), true);
  assert.equal(Object.hasOwn(payload, "generatedAt"), true);
  assert.equal(Object.hasOwn(payload, "cacheStatus"), true);
  assert.equal(payload.readOnly, true);
  if (ledgerVersion !== undefined) assert.equal(payload.ledgerVersion, ledgerVersion);
  if (generatedAt !== undefined) assert.equal(payload.generatedAt, generatedAt);
  if (cacheStatus !== undefined) assert.equal(payload.cacheStatus, cacheStatus);
}

function fixtureLedger(netSales = 100) {
  return {
    rows: [{ rootId: 1, signedNetSales: netSales }],
    totals: { netSales, rowCount: 1 },
    quality: {},
    quarantinedRows: [],
    reviewRequiredRows: [],
    excludedTestRows: [],
    pilotOrders: [],
    excludedPilotOrders: [],
  };
}

function apiFixtureLedger() {
  const rows = [
    {
      rootId: 1,
      documentType: 85,
      documentNo: "SF-001",
      documentDate: "2026-01-10T10:00:00.000Z",
      customerCode: "C-001",
      customerName: "Müşteri Bir",
      lineNo: 1,
      productCode: "P-001",
      productName: "Pompa",
      brandName: "Marka A",
      quantity: 1,
      grossAmount: 120,
      discountAmount: 20,
      netAmount: 100,
      signedNetSales: 100,
      vatAmount: 20,
      signedVatAmount: 20,
      invoiceTotalInclVat: 120,
      signedInvoiceTotalInclVat: 120,
      isSale: true,
      costMethod: "priorPurchase",
      lineCost: 60,
      unitCost: 60,
      purchaseType: 9,
      purchaseNo: "AF-001",
      purchaseDate: "2025-12-20T10:00:00.000Z",
      purchasePartyName: "Tedarikçi A",
      purchaseAccountCode: "T-001",
      purchaseQuantity: 10,
      purchaseGrossAmount: 700,
      purchaseDiscountAmount: 100,
      purchaseNetAmount: 600,
      purchaseVatAmount: 120,
      purchaseEffectiveDiscountPct: 14.2857,
      costValidationReason: "Önceki aktif nihai alım faturası.",
      commercialOwner: "FURKAN",
      commercialOwnerName: "Furkan Çakır",
      ownerActive: true,
      ownerLocation: "Yatmarin",
      department: "service",
      attributionMethod: "macro-source-order",
      attributionConfidence: "confirmed",
      sourceOrderNo: "SSP-01000",
      evidenceDocuments: [{ documentType: 14, documentNo: "SSP-01000", depth: 1 }],
      actorEvents: [{ actorCode: "FURKAN", actorRole: "history-entry" }],
      fulfillmentDepotCode: "MRK",
      fulfillmentDepotName: "Merkez Depo",
      crossDepot: true,
      ownershipEvidence: { selectedField: "commercialOwner" },
    },
    {
      rootId: 2,
      documentType: 17,
      documentNo: "SF-002",
      documentDate: "2026-02-15T10:00:00.000Z",
      customerCode: "C-002",
      customerName: "Müşteri İki",
      lineNo: 1,
      productCode: "P-002",
      productName: "Filtre",
      brandName: "Marka B",
      quantity: 2,
      grossAmount: 200,
      discountAmount: 0,
      netAmount: 200,
      signedNetSales: 200,
      vatAmount: 40,
      signedVatAmount: 40,
      invoiceTotalInclVat: 240,
      signedInvoiceTotalInclVat: 240,
      isSale: true,
      costMethod: "bulkPurchase",
      lineCost: 120,
      unitCost: 60,
      purchaseType: 609,
      purchaseNo: "AF-002",
      purchaseDate: "2026-01-05T10:00:00.000Z",
      purchasePartyName: "Tedarikçi B",
      purchaseAccountCode: "T-002",
      purchaseQuantity: 20,
      purchaseGrossAmount: 1500,
      purchaseDiscountAmount: 300,
      purchaseNetAmount: 1200,
      purchaseVatAmount: 240,
      purchaseEffectiveDiscountPct: 20,
      costValidationReason: "Toplu alım faturası.",
      commercialOwner: "CAN",
      commercialOwnerName: "Can",
      ownerActive: true,
      ownerLocation: "Merkez Ofis",
      department: "parts",
      attributionMethod: "upstream-history",
      attributionConfidence: "inferred",
      sourceOrderNo: "SSP-01001",
      evidenceDocuments: [{ documentType: 14, documentNo: "SSP-01001", depth: 1 }],
      actorEvents: [{ actorCode: "CAN", actorRole: "history-entry" }],
      fulfillmentDepotCode: "MRK",
      fulfillmentDepotName: "Merkez Depo",
      crossDepot: false,
      ownershipEvidence: { selectedField: "history-entry" },
    },
    {
      rootId: 3,
      documentType: 18,
      documentNo: "SI-001",
      documentDate: "2026-01-20T10:00:00.000Z",
      customerCode: "C-001",
      customerName: "Müşteri Bir",
      lineNo: 1,
      productCode: "P-001",
      productName: "Pompa",
      brandName: "Marka A",
      quantity: 0.5,
      grossAmount: 50,
      discountAmount: 0,
      netAmount: 50,
      signedNetSales: -50,
      vatAmount: 10,
      signedVatAmount: -10,
      invoiceTotalInclVat: 60,
      signedInvoiceTotalInclVat: -60,
      isSale: false,
      costMethod: "originalSaleCost",
      costReviewStatus: "verified",
      lineCost: -30,
      unitCost: 60,
      purchaseType: 9,
      purchaseNo: "AF-001",
      purchaseDate: "2025-12-20T10:00:00.000Z",
      purchasePartyName: "Tedarikçi A",
      purchaseAccountCode: "T-001",
      purchaseQuantity: 10,
      purchaseGrossAmount: 700,
      purchaseDiscountAmount: 100,
      purchaseNetAmount: 600,
      purchaseVatAmount: 120,
      purchaseEffectiveDiscountPct: 14.2857,
      originalDocumentType: 85,
      originalDocumentNo: "SF-001",
      originalRootId: 1,
      costValidationReason: "Orijinal satış maliyeti.",
      commercialOwner: "FURKAN",
      commercialOwnerName: "Furkan Çakır",
      ownerActive: true,
      ownerLocation: "Yatmarin",
      department: "service",
      attributionMethod: "original-sale-owner",
      attributionConfidence: "confirmed",
      sourceOrderNo: "SSP-01000",
      evidenceDocuments: [{ documentType: 85, documentNo: "SF-001", depth: 1 }],
      actorEvents: [{ actorCode: "FURKAN", actorRole: "history-entry" }],
      fulfillmentDepotCode: "MRK",
      fulfillmentDepotName: "Merkez Depo",
      crossDepot: true,
      ownershipEvidence: { inheritedFromRootId: 1 },
    },
  ];
  return {
    rows,
    totals: {
      grossSales: 320,
      returns: 50,
      discounts: 20,
      netSales: 250,
      vatAmount: 50,
      invoiceTotalInclVat: 300,
      rowCount: 3,
    },
    quality: {
      terminalRows: 3,
      linkedReturnRows: 1,
      unlinkedReturnRows: 0,
    },
    quarantinedRows: [{ rootId: 99, quarantineReason: "fixture-review" }],
    reviewRequiredRows: [{ rootId: 98, reviewStatus: "required" }],
    excludedTestRows: [{ rootId: 97, reviewReason: "excluded-test-document" }],
    pilotOrders: [],
    excludedPilotOrders: [],
  };
}

async function withApiServer(router, run) {
  const app = express();
  app.use(router);
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (
      error ? reject(error) : resolve()
    )));
  }
}

test("aynı yılın eşzamanlı ilk okumalarını tek yüklemede birleştirir", async () => {
  const pending = deferred();
  let calls = 0;
  const service = createLedgerService({
    loadYear: async () => {
      calls += 1;
      return pending.promise;
    },
  });

  const reads = [service.get(2026), service.get(2026), service.get(2026)];
  pending.resolve(fixtureLedger());
  const results = await Promise.all(reads);

  assert.equal(calls, 1);
  assert.equal(results[0].value, results[1].value);
  assert.equal(results[1].value, results[2].value);
  assert.equal(results[0].ledgerVersion, results[2].ledgerVersion);
  assert.equal(results[0].cache.status, "miss");
});

test("taze değeri yeni yükleme yapmadan cache hit olarak döndürür", async () => {
  let calls = 0;
  const service = createLedgerService({
    loadYear: async () => {
      calls += 1;
      return fixtureLedger();
    },
  });

  await service.get(2026);
  const result = await service.get(2026);

  assert.equal(calls, 1);
  assert.equal(result.cache.status, "hit");
});

test("süresi dolan değeri döndürürken arka planda yalnız bir yenileme başlatır", async () => {
  let currentTime = 1_000;
  let calls = 0;
  const refresh = deferred();
  const service = createLedgerService({
    ttlMs: 1_000,
    maxStaleMs: 86_400_000,
    now: () => currentTime,
    loadYear: async () => {
      calls += 1;
      return calls === 1 ? fixtureLedger(100) : refresh.promise;
    },
  });

  const initial = await service.get(2026);
  currentTime += 1_500;
  const [first, second] = await Promise.all([service.get(2026), service.get(2026)]);

  assert.equal(calls, 2);
  assert.equal(first.value.totals.netSales, 100);
  assert.equal(first.ledgerVersion, initial.ledgerVersion);
  assert.equal(first.cache.status, "stale-refreshing");
  assert.equal(second.cache.status, "stale-refreshing");

  refresh.resolve(fixtureLedger(200));
  await service.get(2026, { refresh: true });
  const updated = await service.get(2026);
  assert.equal(updated.value.totals.netSales, 200);
  assert.notEqual(updated.ledgerVersion, initial.ledgerVersion);
});

test("başarısız yenileme son başarılı ledger değerini silmez", async () => {
  let currentTime = 1_000;
  let calls = 0;
  const service = createLedgerService({
    ttlMs: 1_000,
    maxStaleMs: 86_400_000,
    now: () => currentTime,
    loadYear: async () => {
      calls += 1;
      if (calls === 1) return fixtureLedger(100);
      throw new Error("CPM geçici olarak kullanılamıyor");
    },
  });

  const initial = await service.get(2026);
  currentTime += 1_500;
  await assert.rejects(service.get(2026, { refresh: true }), /CPM geçici/);
  const retained = await service.get(2026);

  assert.equal(retained.value.totals.netSales, 100);
  assert.equal(retained.ledgerVersion, initial.ledgerVersion);
  assert.equal(retained.cache.status, "stale-refreshing");
});

test("azami bayatlık aşılınca yeni yüklemeyi bekler", async () => {
  let currentTime = 1_000;
  let calls = 0;
  const refresh = deferred();
  const service = createLedgerService({
    ttlMs: 1_000,
    maxStaleMs: 2_000,
    now: () => currentTime,
    loadYear: async () => {
      calls += 1;
      return calls === 1 ? fixtureLedger(100) : refresh.promise;
    },
  });

  await service.get(2026);
  currentTime += 2_500;
  let settled = false;
  const pendingRead = service.get(2026).then((result) => {
    settled = true;
    return result;
  });
  await Promise.resolve();
  assert.equal(settled, false);

  refresh.resolve(fixtureLedger(300));
  const result = await pendingRead;
  assert.equal(result.value.totals.netSales, 300);
  assert.equal(result.cache.status, "refresh");
});

test("invalidasyon sonraki okumada aynı yılı yeniden yükler", async () => {
  let calls = 0;
  const service = createLedgerService({
    loadYear: async () => {
      calls += 1;
      return fixtureLedger(calls * 100);
    },
  });

  await service.get(2026);
  service.invalidate(2026);
  const result = await service.get(2026);

  assert.equal(calls, 2);
  assert.equal(result.value.totals.netSales, 200);
});

test("ilk yükleme sırasında invalidasyon aynı yıl için ikinci eşzamanlı loader başlatmaz", async () => {
  const loads = [deferred(), deferred()];
  let calls = 0;
  let activeLoads = 0;
  let maximumActiveLoads = 0;
  const service = createLedgerService({
    loadYear: async () => {
      const pending = loads[calls];
      calls += 1;
      activeLoads += 1;
      maximumActiveLoads = Math.max(maximumActiveLoads, activeLoads);
      try {
        return await pending.promise;
      } finally {
        activeLoads -= 1;
      }
    },
  });

  let firstSettled = false;
  const firstRead = service.get(2026).then((result) => {
    firstSettled = true;
    return result;
  });
  await nextTurn();
  assert.equal(calls, 1);

  service.invalidate(2026);
  let secondSettled = false;
  const secondRead = service.get(2026).then((result) => {
    secondSettled = true;
    return result;
  });
  await nextTurn();

  assert.equal(calls, 1);
  assert.equal(maximumActiveLoads, 1);
  loads[0].resolve(fixtureLedger(100));
  await nextTurn();
  assert.equal(calls, 2);
  assert.equal(firstSettled, false);
  assert.equal(secondSettled, false);

  loads[1].resolve(fixtureLedger(200));
  const [first, second] = await Promise.all([firstRead, secondRead]);
  assert.equal(maximumActiveLoads, 1);
  assert.equal(first.value.totals.netSales, 200);
  assert.equal(second.value.totals.netSales, 200);
  assert.equal(first.ledgerVersion, second.ledgerVersion);
});

test("stale refresh sırasında invalidasyon eski generation sonucunu yayımlamaz", async () => {
  let currentTime = 1_000;
  const staleRefresh = deferred();
  const replacement = deferred();
  let calls = 0;
  let activeLoads = 0;
  let maximumActiveLoads = 0;
  const service = createLedgerService({
    ttlMs: 1_000,
    maxStaleMs: 86_400_000,
    now: () => currentTime,
    loadYear: async () => {
      calls += 1;
      if (calls === 1) return fixtureLedger(100);
      const pending = calls === 2 ? staleRefresh : replacement;
      activeLoads += 1;
      maximumActiveLoads = Math.max(maximumActiveLoads, activeLoads);
      try {
        return await pending.promise;
      } finally {
        activeLoads -= 1;
      }
    },
  });

  await service.get(2026);
  currentTime += 1_500;
  const stale = await service.get(2026);
  assert.equal(stale.value.totals.netSales, 100);
  assert.equal(stale.cache.status, "stale-refreshing");

  service.invalidate(2026);
  let postInvalidationSettled = false;
  const postInvalidationRead = service.get(2026).then((result) => {
    postInvalidationSettled = true;
    return result;
  });
  await nextTurn();
  assert.equal(calls, 2);
  assert.equal(maximumActiveLoads, 1);

  staleRefresh.resolve(fixtureLedger(200));
  await nextTurn();
  assert.equal(calls, 3);
  assert.equal(postInvalidationSettled, false);

  replacement.resolve(fixtureLedger(300));
  const result = await postInvalidationRead;
  assert.equal(maximumActiveLoads, 1);
  assert.equal(result.value.totals.netSales, 300);
});

test("prewarm yinelenen yılları tekilleştirir ve hataları sonuçta görünür kılar", async () => {
  const calls = [];
  const service = createLedgerService({
    loadYear: async (year) => {
      calls.push(year);
      if (year === 2025) throw new Error("2025 okunamadı");
      return fixtureLedger(year);
    },
  });

  const results = await service.prewarm([2026, 2025, 2026]);

  assert.deepEqual(calls.sort(), [2025, 2026]);
  assert.equal(results.length, 2);
  assert.equal(results.find((item) => item.year === 2026).status, "fulfilled");
  assert.match(results.find((item) => item.year === 2025).reason.message, /okunamadı/);
});

test("eşzamanlı overview departman ve audit istekleri tek ledger sürümünü paylaşır", async () => {
  let loads = 0;
  const service = createLedgerService({
    loadYear: async () => {
      loads += 1;
      return apiFixtureLedger();
    },
  });
  const router = createUnifiedLedgerRouter({
    ledgerService: service,
    getAppState: async () => ({}),
    logger: { error() {} },
  });

  await withApiServer(router, async (baseUrl) => {
    const [overview, departments, audit] = await Promise.all([
      fetch(`${baseUrl}/api/overview?year=2026`).then((response) => response.json()),
      fetch(`${baseUrl}/api/department-analysis?year=2026`).then((response) => response.json()),
      fetch(`${baseUrl}/api/audit-ledger?year=2026`).then((response) => response.json()),
    ]);

    assert.equal(loads, 1);
    assert.equal(overview.ledgerVersion, departments.ledgerVersion);
    assert.equal(departments.ledgerVersion, audit.ledgerVersion);
    assert.equal(overview.generatedAt, departments.generatedAt);
    assert.equal(overview.readOnly, true);
    assert.equal(departments.readOnly, true);
    assert.equal(audit.readOnly, true);
    assert.equal(overview.reconciliation.difference, 0);
    assert.equal(departments.reconciliation.difference, 0);
    assert.equal(audit.reconciliation.difference, 0);
    assert.equal(overview.rows.reduce((sum, row) => (
      sum + row.sales - row.returns - row.discounts
    ), 0), 250);
    assert.equal(departments.totals.netSales, 250);
    assert.equal(audit.summary.filteredNetAmount, 250);
    assert.deepEqual(departments.quarantinedRows, [
      { rootId: 99, quarantineReason: "fixture-review" },
    ]);
    assert.equal(departments.detailRows[0].ownershipEvidence !== undefined, true);
  });
});

test("SQL recordset nearby FURKAN kanıtını unified departmanda review hint olarak korur", async () => {
  const recordsets = [[{
    rootId: "ROOT-HINT",
    documentType: 85,
    documentNo: "SF-HINT",
    documentDate: "2026-07-01T10:00:00.000Z",
    customerCode: "C-HINT",
    customerName: "Hint Müşterisi",
    lineNo: 1,
    productCode: "P-HINT",
    productName: "Hint Ürünü",
    quantity: 1,
    grossAmount: 100,
    discountAmount: 0,
    netAmount: 100,
    vatAmount: 20,
    invoiceTotalInclVat: 120,
    isSale: true,
    depotCode: "MRK",
    purchaseType: 9,
    purchaseNo: "AF-HINT",
    purchaseDate: "2026-06-01T10:00:00.000Z",
    purchaseQuantity: 10,
    purchaseGrossAmount: 600,
    purchaseDiscountAmount: 0,
    purchaseNetAmount: 600,
    purchaseVatAmount: 120,
    purchaseDocumentLineCount: 1,
    purchaseRemainingQuantity: 9,
    unitCost: 60,
    costMethod: "priorPurchase",
    costValidationReason: "Production-shaped fixture.",
    candidateAttributionActor: "FURKAN",
    candidateAttributionField: "EVRAKHAZIRLAYAN",
    candidateAttributionDocumentType: 64,
    candidateAttributionDocumentNo: "SP-HINT",
    candidateAttributionDocumentDate: "2026-06-30T10:00:00.000Z",
  }], [], [], []];
  let loads = 0;
  const service = createLedgerService({
    loadYear: async () => {
      loads += 1;
      return buildFinalInvoiceLedger({
        economics: recordsets[0],
        lineage: recordsets[1],
        actorEvents: recordsets[2],
        pilotOrders: recordsets[3],
      });
    },
  });
  const router = createUnifiedLedgerRouter({
    ledgerService: service,
    getAppState: async () => ({}),
  });

  await withApiServer(router, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/department-analysis?year=2026`);
    const payload = await response.json();
    const row = payload.detailRows[0];
    const ledgerRow = (await service.get(2026)).value.rows[0];

    assert.equal(response.status, 200);
    assert.equal(loads, 1);
    assert.equal(payload.departments.find((item) => item.id === "service").netSales, 100);
    assert.equal(payload.departments.find((item) => item.id === "parts").netSales, 0);
    assert.equal(payload.quality.hintedReviewAmount, 100);
    assert.equal(payload.quality.attributionCoveragePct, 0);
    assert.equal(payload.quality.inferredCoveragePct, 0);
    assert.equal(payload.topOwners.some((item) => item.id === "FURKAN"), false);
    assert.equal(row.department, "service");
    assert.equal(row.commercialOwner, null);
    assert.equal(row.attributionStatus, "review");
    assert.equal(row.attributionMethod, "b2b-candidate-hint");
    assert.equal(row.candidateAttributionActor, "FURKAN");
    assert.equal(row.candidateAttributionDocumentType, 64);
    assert.equal(row.candidateAttributionDocumentNo, "SP-HINT");
    assert.equal(row.candidateAttributionDocumentDate, "2026-06-30T10:00:00.000Z");
    assert.equal(row.candidateAttributionField, "EVRAKHAZIRLAYAN");
    assert.equal(row.candidateActor, "FURKAN");
    assert.equal(row.candidateDocumentType, 64);
    assert.equal(row.candidateDocumentNo, "SP-HINT");
    assert.equal(row.candidateDocumentDate, "2026-06-30T10:00:00.000Z");
    assert.equal(row.candidateField, "EVRAKHAZIRLAYAN");
    assert.equal(row.ownershipEvidence.candidateOwnerCode, "FURKAN");
    assert.equal(row.ownershipEvidence.candidateDocumentType, 64);
    assert.equal(row.ownershipEvidence.candidateDocumentNo, "SP-HINT");
    assert.equal(
      row.ownershipEvidence.candidateDocumentDate,
      "2026-06-30T10:00:00.000Z",
    );
    assert.equal(row.ownershipEvidence.candidateField, "EVRAKHAZIRLAYAN");
    assert.equal(ledgerRow.candidateAttributionActor, "FURKAN");
    assert.equal(ledgerRow.candidateAttributionDocumentType, 64);
    assert.equal(ledgerRow.candidateAttributionDocumentNo, "SP-HINT");
    assert.equal(
      ledgerRow.candidateAttributionDocumentDate,
      "2026-06-30T10:00:00.000Z",
    );
    assert.equal(ledgerRow.candidateAttributionField, "EVRAKHAZIRLAYAN");
    assert.equal(ledgerRow.candidateActor, "FURKAN");
    assert.equal(ledgerRow.candidateDocumentType, 64);
    assert.equal(ledgerRow.candidateDocumentNo, "SP-HINT");
    assert.equal(ledgerRow.candidateDocumentDate, "2026-06-30T10:00:00.000Z");
    assert.equal(ledgerRow.candidateField, "EVRAKHAZIRLAYAN");
    assert.equal(ledgerRow.ownershipEvidence.candidateOwnerCode, "FURKAN");
    assert.equal(ledgerRow.ownershipEvidence.candidateDocumentType, 64);
    assert.equal(ledgerRow.ownershipEvidence.candidateDocumentNo, "SP-HINT");
    assert.equal(
      ledgerRow.ownershipEvidence.candidateDocumentDate,
      "2026-06-30T10:00:00.000Z",
    );
    assert.equal(ledgerRow.ownershipEvidence.candidateField, "EVRAKHAZIRLAYAN");
  });
});

test("ledger API geçersiz yıl yanıtları tam metadata sözleşmesini taşır", async () => {
  const service = createLedgerService({ loadYear: async () => apiFixtureLedger() });
  const router = createUnifiedLedgerRouter({
    ledgerService: service,
    getAppState: async () => ({}),
  });

  await withApiServer(router, async (baseUrl) => {
    for (const endpoint of [
      "overview", "department-analysis", "department-targets",
      "audit-ledger", "audit-samples",
    ]) {
      const response = await fetch(`${baseUrl}/api/${endpoint}?year=invalid`);
      const payload = await response.json();
      assert.equal(response.status, 400);
      assertLedgerMetadata(payload, {
        ledgerVersion: null,
        generatedAt: null,
        cacheStatus: "invalid",
      });
    }
  });
});

test("ilk loader hatasında ledger API uçları null metadata ile 500 döndürür", async () => {
  const service = createLedgerService({
    loadYear: async () => {
      throw new Error("CPM okunamadı");
    },
  });
  const router = createUnifiedLedgerRouter({
    ledgerService: service,
    getAppState: async () => ({}),
    logger: { error() {} },
  });

  await withApiServer(router, async (baseUrl) => {
    for (const endpoint of [
      "overview", "department-analysis", "department-targets",
      "audit-ledger", "audit-samples",
    ]) {
      const response = await fetch(`${baseUrl}/api/${endpoint}?year=2026`);
      const payload = await response.json();
      assert.equal(response.status, 500);
      assertLedgerMetadata(payload, {
        ledgerVersion: null,
        generatedAt: null,
        cacheStatus: "error",
      });
    }
  });
});

test("audit samples birleşik cached ledger sürümünden uyumlu kanıt satırları üretir", async () => {
  let loads = 0;
  const service = createLedgerService({
    loadYear: async () => {
      loads += 1;
      return apiFixtureLedger();
    },
  });
  const router = createUnifiedLedgerRouter({
    ledgerService: service,
    getAppState: async () => ({}),
  });

  await withApiServer(router, async (baseUrl) => {
    const [overview, samples] = await Promise.all([
      fetch(`${baseUrl}/api/overview?year=2026`).then((response) => response.json()),
      fetch(`${baseUrl}/api/audit-samples?year=2026`).then((response) => response.json()),
    ]);

    assert.equal(loads, 1);
    assert.equal(samples.ledgerVersion, overview.ledgerVersion);
    assert.equal(samples.generatedAt, overview.generatedAt);
    assertLedgerMetadata(samples);
    assert.equal(["miss", "hit"].includes(samples.cacheStatus), true);
    assert.equal(samples.mode, "live");
    assert.equal(samples.rows.length, 2);
    assert.deepEqual(Object.keys(samples.rows[0]), [
      "category", "saleType", "saleNo", "saleDate", "cardCode", "cardName",
      "quantity", "netSales", "purchaseType", "purchaseNo", "purchaseDate",
      "unitCost", "lineCost",
    ]);
    assert.equal(samples.rows.every((row) => row.category === "priorPurchase"), true);
    assert.equal(samples.rows.some((row) => row.saleNo === "SI-001"), false);
  });
});

test("departman hedef API cari ve önceki yıl ledger sürümlerini birlikte raporlar", async () => {
  const service = createLedgerService({
    loadYear: async (year) => {
      const ledger = apiFixtureLedger();
      ledger.rows = ledger.rows.map((row) => ({
        ...row,
        documentDate: row.documentDate.replace(/^2026/, String(year)),
      }));
      return ledger;
    },
  });
  const router = createUnifiedLedgerRouter({
    ledgerService: service,
    getAppState: async () => ({
      settings: {
        departmentGrowthTargets: { service: 10, parts: 10 },
        departmentStretchThresholds: { service: 5, parts: 5 },
        rates: { conservative: 3, growth: 8 },
        reserveRate: 5,
      },
    }),
  });

  await withApiServer(router, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/department-targets?year=2026`,
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assertLedgerMetadata(payload);
    assert.equal(payload.mode, "live");
    assert.equal(payload.year, 2026);
    assert.equal(payload.previousYear, 2025);
    assert.equal(payload.rows.length, 24);
    assert.equal(payload.readOnly, true);
    assert.deepEqual(
      payload.rows.filter((row) => row.department === "service").map((row) => row.month),
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
    assert.deepEqual(
      payload.rows.filter((row) => row.department === "parts").map((row) => row.month),
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
    for (const row of payload.rows) {
      for (const field of [
        "priorNetSales", "target", "stretchTarget", "actual", "difference",
        "achievementPct", "band", "appliedRate", "profit",
        "uncoveredNetSales", "eligibleProfit", "reserve", "pool",
      ]) {
        assert.equal(Object.hasOwn(row, field), true, `${field} alanı eksik`);
      }
    }
    assert.equal(typeof payload.previousLedgerVersion, "string");
    assert.equal(typeof payload.previousGeneratedAt, "string");
    assert.equal(typeof payload.previousCacheStatus, "string");
    assert.equal(payload.summary.totalPool >= 0, true);
  });
});

test("departman hedef API ekran ayrıntısının 500 satır sınırından etkilenmez", async () => {
  const service = createLedgerService({
    loadYear: async (year) => {
      const base = apiFixtureLedger().rows[0];
      const rowCount = year === 2026 ? 501 : 1;
      const rows = Array.from({ length: rowCount }, (_, index) => ({
        ...base,
        rootId: `${year}-${index}`,
        documentNo: `SF-${year}-${index}`,
        documentDate: `${year}-01-10T10:00:00.000Z`,
        grossAmount: 1,
        discountAmount: 0,
        netAmount: 1,
        signedNetSales: 1,
        lineCost: 0.5,
        unitCost: 0.5,
      }));
      return {
        rows,
        totals: { netSales: rowCount, rowCount },
        quality: {},
        quarantinedRows: [],
        reviewRequiredRows: [],
        excludedTestRows: [],
        pilotOrders: [],
        excludedPilotOrders: [],
      };
    },
  });
  const router = createUnifiedLedgerRouter({
    ledgerService: service,
    getAppState: async () => ({
      settings: {
        departmentGrowthTargets: { service: 10, parts: 10 },
        departmentStretchThresholds: { service: 5, parts: 5 },
        rates: { conservative: 3, growth: 8 },
        reserveRate: 5,
      },
    }),
  });

  await withApiServer(router, async (baseUrl) => {
    const payload = await fetch(
      `${baseUrl}/api/department-targets?year=2026`,
    ).then((response) => response.json());
    const january = payload.rows.find((row) => (
      row.department === "service" && row.month === 1
    ));

    assert.equal(january.actual, 501);
    assert.equal(january.profit, 250.5);
  });
});

test("sunucu bağımsız audit economics SQL yolunu içermez", async () => {
  const source = await readFile(new URL("./index.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bauditSamplesSql\b/);
  assert.doesNotMatch(source, /\.query\(auditSamplesSql\)/);
});

test("audit filtreleme sayfalama ve export sözleşmesini bellekte korur", async () => {
  const service = createLedgerService({ loadYear: async () => apiFixtureLedger() });
  const router = createUnifiedLedgerRouter({
    ledgerService: service,
    getAppState: async () => ({}),
  });

  await withApiServer(router, async (baseUrl) => {
    const filtered = await fetch(
      `${baseUrl}/api/audit-ledger?year=2026&month=1&documentType=85`
      + "&source=invoice&method=priorPurchase&verification=verified&returnRisk=0"
      + "&search=Pompa&page=1&pageSize=10",
    ).then((response) => response.json());
    assert.equal(filtered.summary.totalRows, 1);
    assert.equal(filtered.summary.filteredNetAmount, 100);
    assert.equal(filtered.rows[0].id, 1);
    assert.equal(filtered.rows[0].cardCode, "P-001");
    assert.equal(filtered.rows[0].verificationStatus, "verified");
    assert.equal(filtered.rows[0].commercialOwner, "FURKAN");
    assert.equal(Object.hasOwn(filtered.rows[0], "originalSaleDate"), true);
    assert.equal(Object.hasOwn(filtered.rows[0], "rejectedReturnNo"), true);
    assert.equal(Object.hasOwn(filtered.rows[0], "rejectedReturnPartyName"), true);
    assert.equal(Object.hasOwn(filtered.rows[0], "purchaseDiscountRate1"), true);

    const secondPage = await fetch(
      `${baseUrl}/api/audit-ledger?year=2026&page=2&pageSize=10`,
    ).then((response) => response.json());
    assert.equal(secondPage.rows.length, 0);

    const exported = await fetch(
      `${baseUrl}/api/audit-ledger?year=2026&export=1&pageSize=10`,
    ).then((response) => response.json());
    assert.equal(exported.pageSize, 50000);
    assert.equal(exported.rows.length, 3);
  });
});

test("ledger pilot kartları audit ve departmanda yönetilen maliyet yöntemiyle görünür", async () => {
  const ledger = apiFixtureLedger();
  ledger.rows = [{
    ...ledger.rows[0],
    productCode: "İŞÇİLİK",
    productName: "İşçilik",
    costMethod: "missingPurchase",
    lineCost: null,
    unitCost: null,
    purchaseType: null,
    purchaseNo: null,
  }];
  ledger.totals = { ...ledger.totals, netSales: 100, rowCount: 1 };
  const service = createLedgerService({ loadYear: async () => ledger });
  const router = createUnifiedLedgerRouter({
    ledgerService: service,
    getAppState: async () => ({
      settings: { pilotCardCostRates: { labor: 0 } },
    }),
  });

  await withApiServer(router, async (baseUrl) => {
    const audit = await fetch(
      `${baseUrl}/api/audit-ledger?year=2026&method=configuredLabor&verification=configured`,
    ).then((response) => response.json());
    const department = await fetch(
      `${baseUrl}/api/department-analysis?year=2026`,
    ).then((response) => response.json());

    assert.equal(audit.summary.totalRows, 1);
    assert.equal(audit.rows[0].costMethod, "configuredLabor");
    assert.equal(audit.rows[0].verificationStatus, "configured");
    assert.equal(department.detailRows[0].costMethod, "configuredLabor");
    assert.equal(department.detailRows[0].costCovered, true);
  });
});

test("kapsam dışı gelir audit içinde kalır fakat overview ve departman toplamına girmez", async () => {
  const ledger = apiFixtureLedger();
  const excluded = {
    ...ledger.rows[0],
    rootId: 4,
    documentNo: "SF-KOM",
    productCode: "KOMİSYON",
    productName: "Komisyon",
    grossAmount: 500,
    discountAmount: 0,
    netAmount: 500,
    signedNetSales: 500,
    lineCost: null,
    unitCost: null,
    purchaseType: null,
    purchaseNo: null,
    costMethod: "missingPurchase",
  };
  ledger.rows = [...ledger.rows, excluded];
  ledger.totals = { ...ledger.totals, netSales: 750, rowCount: 4 };
  const service = createLedgerService({ loadYear: async () => ledger });
  const router = createUnifiedLedgerRouter({
    ledgerService: service,
    getAppState: async () => ({}),
  });

  await withApiServer(router, async (baseUrl) => {
    const [overview, department, audit] = await Promise.all([
      fetch(`${baseUrl}/api/overview?year=2026`).then((response) => response.json()),
      fetch(`${baseUrl}/api/department-analysis?year=2026`).then((response) => response.json()),
      fetch(
        `${baseUrl}/api/audit-ledger?year=2026&method=excludedIncome&verification=excluded`,
      ).then((response) => response.json()),
    ]);

    assert.equal(overview.rows.reduce((sum, row) => (
      sum + row.sales - row.returns - row.discounts
    ), 0), 250);
    assert.equal(department.totals.netSales, 250);
    assert.equal(audit.summary.totalRows, 1);
    assert.equal(audit.rows[0].costMethod, "excludedIncome");
    assert.equal(overview.reconciliation.difference, 0);
    assert.equal(department.reconciliation.difference, 0);
    assert.equal(overview.reconciliation.excludedNetSales, 500);
  });
});

test("API bayat ledger değerini döndürürken arka plan yenilemesini görünür kılar", async () => {
  let currentTime = 1_000;
  let loads = 0;
  const refresh = deferred();
  const service = createLedgerService({
    ttlMs: 1_000,
    maxStaleMs: 86_400_000,
    now: () => currentTime,
    loadYear: async () => {
      loads += 1;
      return loads === 1 ? apiFixtureLedger() : refresh.promise;
    },
  });
  const router = createUnifiedLedgerRouter({
    ledgerService: service,
    getAppState: async () => ({}),
    logger: { error() {} },
  });

  await withApiServer(router, async (baseUrl) => {
    const initial = await fetch(`${baseUrl}/api/overview?year=2026`).then((response) => response.json());
    currentTime += 1_500;
    const stale = await fetch(`${baseUrl}/api/audit-ledger?year=2026`).then((response) => response.json());

    assert.equal(loads, 2);
    assert.equal(stale.cacheStatus, "stale-refreshing");
    assert.equal(stale.ledgerVersion, initial.ledgerVersion);
    assert.equal(stale.summary.filteredNetAmount, 250);

    const replacement = apiFixtureLedger();
    replacement.rows[0] = { ...replacement.rows[0], netAmount: 150, signedNetSales: 150 };
    replacement.totals = { ...replacement.totals, netSales: 300 };
    refresh.resolve(replacement);
    const refreshed = await fetch(
      `${baseUrl}/api/department-analysis?year=2026&refresh=1`,
    ).then((response) => response.json());
    assert.notEqual(refreshed.ledgerVersion, initial.ledgerVersion);
    assert.equal(refreshed.totals.netSales, 300);
  });
});

test("API başarısız zorunlu refresh sonrasında son başarılı ledger sürümünü sunar", async () => {
  let currentTime = 1_000;
  let loads = 0;
  const service = createLedgerService({
    ttlMs: 1_000,
    maxStaleMs: 86_400_000,
    now: () => currentTime,
    loadYear: async () => {
      loads += 1;
      if (loads === 1) return apiFixtureLedger();
      throw new Error("CPM refresh başarısız");
    },
  });
  const router = createUnifiedLedgerRouter({
    ledgerService: service,
    getAppState: async () => ({}),
    logger: { error() {} },
  });

  await withApiServer(router, async (baseUrl) => {
    const initial = await fetch(`${baseUrl}/api/overview?year=2026`).then((response) => response.json());
    currentTime += 1_500;
    for (const endpoint of [
      "overview", "department-analysis", "audit-ledger", "audit-samples",
    ]) {
      const failedResponse = await fetch(
        `${baseUrl}/api/${endpoint}?year=2026&refresh=1`,
      );
      const failed = await failedResponse.json();
      assert.equal(failedResponse.status, 500);
      assertLedgerMetadata(failed, {
        ledgerVersion: initial.ledgerVersion,
        generatedAt: initial.generatedAt,
        cacheStatus: "refresh-error",
      });
    }

    const retainedResponse = await fetch(`${baseUrl}/api/overview?year=2026`);
    const retained = await retainedResponse.json();
    assert.equal(retainedResponse.status, 200);
    assert.equal(retained.ledgerVersion, initial.ledgerVersion);
    assert.equal(retained.cacheStatus, "stale-refreshing");
    assert.equal(retained.reconciliation.difference, 0);
  });
});

test("refresh ve invalidasyon sonrası tüm API uçları yeni ledger sürümünde buluşur", async () => {
  let loads = 0;
  const service = createLedgerService({
    loadYear: async () => {
      loads += 1;
      const ledger = apiFixtureLedger();
      if (loads === 2) {
        ledger.rows[0] = { ...ledger.rows[0], netAmount: 150, signedNetSales: 150 };
        ledger.totals = { ...ledger.totals, netSales: 300 };
      }
      return ledger;
    },
  });
  const router = createUnifiedLedgerRouter({
    ledgerService: service,
    getAppState: async () => ({}),
  });

  await withApiServer(router, async (baseUrl) => {
    const first = await fetch(`${baseUrl}/api/overview?year=2026`).then((response) => response.json());
    const refreshed = await fetch(
      `${baseUrl}/api/department-analysis?year=2026&refresh=1`,
    ).then((response) => response.json());
    const audit = await fetch(`${baseUrl}/api/audit-ledger?year=2026`).then((response) => response.json());

    assert.equal(loads, 2);
    assert.notEqual(first.ledgerVersion, refreshed.ledgerVersion);
    assert.equal(refreshed.ledgerVersion, audit.ledgerVersion);
    assert.equal(refreshed.totals.netSales, 300);
    assert.equal(audit.summary.filteredNetAmount, 300);

    service.invalidate(2026);
    await fetch(`${baseUrl}/api/overview?year=2026`);
    assert.equal(loads, 3);
  });
});
