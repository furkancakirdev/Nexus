import express from "express";
import sql from "mssql";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSalesCaseModel, filterSalesCases, salesCaseSql } from "./salesCases.mjs";
import { buildFinalInvoiceLedger, finalInvoiceLedgerSql } from "./finalInvoiceLedger.mjs";
import {
  createDepartmentTargetLoader,
  createUnifiedLedgerRouter,
} from "./ledgerApi.mjs";
import { createLedgerService } from "./ledgerService.mjs";
import { createApprovalRouter } from "./approvalApi.mjs";
import { createStateStore } from "./stateStore.mjs";
import { serializeSettings } from "../shared/settingsPolicy.mjs";
import { createAuth } from "./auth.mjs";
import { authorizeCapability, CAPABILITIES } from "./capabilities.mjs";
import { buildReadinessPayload, buildRuntimeInfo } from "./releaseContract.mjs";
import { modulesForCapabilities } from "../shared/moduleRegistry.mjs";
import { buildCpmConnectionConfig } from "./cpmConnectionConfig.mjs";
import { executeCpmReadOnlyQuery } from "./cpmReadOnly.mjs";
import { withReadOnlyCpmTransaction } from "./cpmTransaction.mjs";
import { executeSqlReadWithDeadlockRetry } from "./sqlReadRetry.mjs";
import { collectCpmSourceProvenance } from "./cpmProvenance.mjs";
import { sourceProvenanceSql } from "./sourceProvenanceSql.mjs";
import { buildInventoryOpeningResearchPayload } from "./inventoryOpeningResearch.mjs";
import { buildComparableYearWacResearch } from "./inventoryResearchApi.mjs";
import {
  buildCpmWacMovementCandidates,
  summarizeCpmMovementCandidates,
} from "./inventoryMovementSource.mjs";
import {
  buildCpmExchangeRateCandidates,
  DEFAULT_HALK_BANK_CODE,
} from "./cpmRateSource.mjs";
import {
  collectHistoricalFallbackDates,
  createTcmbRateSource,
  loadTcmbFallbackRows,
  planTcmbFallbackDates,
} from "./tcmbRateSource.mjs";
import { resolveOfficialRateRows } from "./officialRateResolver.mjs";
import { buildHistoricalFinancialEvidence } from "../shared/historicalFinancialEvidence.mjs";
import { cpmMovementCandidateSql, dvzharRateCandidateSql, stkhArType81SampleSql, stkhArType81SummarySql, stkhArType82SampleSql, stkhArType82SummarySql, stkkrtPriceCandidateSql, stksymDevirSampleSql, stksymDevirSummarySql, stksymStkhArDocumentMatchSummarySql, stksymStkhArMatchSummarySql } from "./inventoryOpeningResearchSql.mjs";

export function normalizeStoredAppState(state) {
  const prototype = state !== null && typeof state === "object"
    ? Object.getPrototypeOf(state)
    : null;
  if (
    !state
    || typeof state !== "object"
    || Array.isArray(state)
    || (prototype !== Object.prototype && prototype !== null)
  ) return {};
  return state.settings === null
    ? { ...state, settings: undefined }
    : state;
}

export function createApp({
  auth: authOptions,
  stateStore: injectedStateStore,
  ledgerService: injectedLedgerService,
  ledgerRouter: injectedLedgerRouter,
  approvalRouter: injectedApprovalRouter,
  healthHandler,
  staticRoot,
} = {}) {
  const app = express();
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const dataFile = process.env.APP_STATE_FILE || path.join(rootDir, "data", "app-state.json");
  const stateStore = injectedStateStore || createStateStore(dataFile);
  const auth = authOptions?.middleware ? authOptions : createAuth(authOptions);
  app.use(express.json({ limit: "1mb" }));

let poolPromise;
const salesCaseCache = new Map();
const SALES_CASE_CACHE_MS = 5 * 60 * 1000;

async function getCredentials() {
  if (process.env.CPM_SQL_USER && process.env.CPM_SQL_PASSWORD) {
    return { user: process.env.CPM_SQL_USER, password: process.env.CPM_SQL_PASSWORD };
  }

  if (!process.env.CPM_CREDENTIAL_FILE) return null;
  const raw = await readFile(process.env.CPM_CREDENTIAL_FILE, "utf8");
  const [user, password] = raw.split(/\r?\n/).map((value) => value.trim());
  if (!user || !password) throw new Error("Kimlik bilgisi dosyası iki dolu satır içermeli.");
  return { user, password };
}

async function getPool() {
  if (poolPromise) return poolPromise;
  const credentials = await getCredentials();
  if (!credentials) return null;

  poolPromise = sql.connect(buildCpmConnectionConfig({ credentials })).catch((error) => {
    poolPromise = undefined;
    throw error;
  });

  return poolPromise;
}

async function getSalesCaseModel(year, forceRefresh = false) {
  const cached = salesCaseCache.get(year);
  if (!forceRefresh && cached && Date.now() - cached.cachedAt < SALES_CASE_CACHE_MS) return cached.model;
  const pool = await getPool();
  if (!pool) return null;
  const result = await pool.request()
    .input("company", sql.VarChar(3), process.env.CPM_SQL_COMPANY || "01")
    .input("year", sql.Int, year)
    .query(salesCaseSql);
  const model = buildSalesCaseModel({
    documents: result.recordsets[0] || [],
    edges: result.recordsets[1] || [],
    actors: result.recordsets[2] || [],
    year,
  });
  salesCaseCache.set(year, { cachedAt: Date.now(), model });
  return model;
}

async function loadFinalInvoiceLedger(year) {
  const pool = await getPool();
  if (!pool) return null;
  const company = process.env.CPM_SQL_COMPANY || "01";
  const startDate = new Date(Date.UTC(year, 0, 1));
  const endDate = new Date(Date.UTC(year + 1, 0, 1));
  const movementStartDate = new Date(process.env.CPM_INVENTORY_START_DATE || "2022-12-31T00:00:00.000Z");
  if (!Number.isFinite(movementStartDate.getTime())) throw new Error("CPM_INVENTORY_START_DATE geçersiz.");
  const result = await executeSqlReadWithDeadlockRetry(() => withReadOnlyCpmTransaction({
    transactionFactory: async () => new sql.Transaction(pool),
    isolationLevel: sql.ISOLATION_LEVEL.READ_COMMITTED,
    executeRead: executeCpmReadOnlyQuery,
    run: async ({ request, execute }) => {
      request.input("company", sql.VarChar(3), company);
      request.input("year", sql.Int, year);
      request.input("movementStartDate", sql.DateTime2, movementStartDate);
      const ledger = await execute({ queryId: "final-invoice-ledger-v1", query: finalInvoiceLedgerSql });
      // Tarihsel WAC/fiyat/kur kanıtı seçili yılın başında kesilmez; hareket
      // tohumundan rapor dönemi sonuna kadar aynı salt-okunur işlemde okunur.
      request.input("startDate", sql.DateTime2, movementStartDate);
      request.input("endDate", sql.DateTime2, endDate);
      for (const [name, value] of [
        ["openingDocumentType", 81], ["purchaseDocumentType", 9],
        ["purchase609DocumentType", 609], ["sale17DocumentType", 17],
        ["sale85DocumentType", 85], ["sale91DocumentType", 91], ["returnDocumentType", 18],
      ]) request.input(name, sql.Int, value);
      const movementCandidates = await execute({ queryId: "inventory-movement-candidate-v1", query: cpmMovementCandidateSql });
      request.input("bankCode", sql.Int, Number(process.env.CPM_RATE_BANK_CODE || DEFAULT_HALK_BANK_CODE));
      request.input("rateType0", sql.Int, 0);
      request.input("rateType1", sql.Int, 1);
      const rateCandidates = await execute({ queryId: "exchange-rate-candidate-v1", query: dvzharRateCandidateSql });
      const priceCandidates = await execute({ queryId: "historical-price-candidate-v1", query: stkkrtPriceCandidateSql });
      return { ledger, movementCandidates, rateCandidates, priceCandidates };
    },
  }));
  const movementRows = result.movementCandidates?.recordsets?.[0] || [];
  const rateRows = result.rateCandidates?.recordsets?.[0] || [];
  const priceRows = result.priceCandidates?.recordsets?.[0] || [];
  const movementEvidence = summarizeCpmMovementCandidates({ rows: movementRows });
  const movementCandidates = buildCpmWacMovementCandidates({ rows: movementRows });
  const rateCandidates = buildCpmExchangeRateCandidates({
    rows: rateRows,
    bankCode: Number(process.env.CPM_RATE_BANK_CODE || DEFAULT_HALK_BANK_CODE),
    moduleBankName: String(process.env.CPM_RATE_MODULE_BANK_NAME || "").trim(),
    buyingRateType: Number(process.env.CPM_RATE_BUYING_TYPE ?? 0),
    sellingRateType: Number(process.env.CPM_RATE_SELLING_TYPE ?? 1),
    semanticsVerified: String(process.env.CPM_RATE_SEMANTICS_VERIFIED).toLowerCase() === "true",
  });
  const reportDates = Array.from({ length: 12 }, (_, index) => (
    new Date(Date.UTC(year, index + 1, 0)).toISOString().slice(0, 10)
  ));
  reportDates.push(new Date().toISOString().slice(0, 10));
  const historicalMovementDates = collectHistoricalFallbackDates({
    movements: movementCandidates.movements,
    priceRows,
  });
  const historicalDateCap = Number.isInteger(Number(process.env.NEXUS_TCMB_HISTORICAL_DATE_CAP))
    && Number(process.env.NEXUS_TCMB_HISTORICAL_DATE_CAP) >= 0
    ? Number(process.env.NEXUS_TCMB_HISTORICAL_DATE_CAP)
    : 32;
  const historicalDatePlan = planTcmbFallbackDates({
    requestedDates: historicalMovementDates,
    maxRequestedDates: historicalDateCap,
  });
  const tcmbFallbackEnabled = String(process.env.NEXUS_TCMB_FALLBACK_ENABLED ?? "true").toLowerCase() !== "false";
  const tcmbHttpAttemptCap = Number.isInteger(Number(process.env.NEXUS_TCMB_HTTP_ATTEMPT_CAP))
    && Number(process.env.NEXUS_TCMB_HTTP_ATTEMPT_CAP) > 0
    ? Number(process.env.NEXUS_TCMB_HTTP_ATTEMPT_CAP)
    : 64;
  const tcmbDeadlineMs = Number.isInteger(Number(process.env.NEXUS_TCMB_DEADLINE_MS))
    && Number(process.env.NEXUS_TCMB_DEADLINE_MS) > 0
    ? Number(process.env.NEXUS_TCMB_DEADLINE_MS)
    : 15_000;
  const tcmbSource = createTcmbRateSource({
    maxHttpAttempts: tcmbHttpAttemptCap,
    deadlineMs: tcmbDeadlineMs,
    fetchImpl: async (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(5_000) }),
  });
  const tcmbFallbackRows = tcmbFallbackEnabled
    ? await loadTcmbFallbackRows({
      cpmRows: rateCandidates.exchangeRates,
      requestedDates: [...reportDates, ...historicalDatePlan.selectedDates],
      source: tcmbSource,
    })
    : [];
  const resolvedRateRows = resolveOfficialRateRows({
    cpmRows: rateCandidates.exchangeRates,
    tcmbRows: tcmbFallbackRows,
  }).rows;
  const resolvedRateFallback = {
    enabled: tcmbFallbackEnabled,
    rowCount: tcmbFallbackRows.length,
    sourceKinds: [...new Set(resolvedRateRows.map((row) => row.source).filter(Boolean))].sort(),
    historical: {
      status: historicalMovementDates.length === 0
        ? "not-needed"
        : historicalDatePlan.skippedDates.length || tcmbSource.stats.deadlineExceeded || tcmbSource.stats.attemptCapReached
          ? "partial-capped"
          : "partial",
      requestedDateCount: historicalMovementDates.length,
      attemptedDateCount: historicalDatePlan.selectedDates.length,
      skippedByCapCount: historicalDatePlan.skippedDates.length,
      skippedDatesSample: historicalDatePlan.skippedDates.slice(0, 20),
      httpAttemptCount: tcmbSource.stats.httpAttemptCount,
      httpAttemptCap: tcmbHttpAttemptCap,
      deadlineMs: tcmbDeadlineMs,
      deadlineExceeded: tcmbSource.stats.deadlineExceeded,
      attemptCapReached: tcmbSource.stats.attemptCapReached,
    },
  };
  const historicalEvidence = buildHistoricalFinancialEvidence({
    movements: movementCandidates.movements,
    priceRows,
    exchangeRates: resolvedRateRows,
  });
  const comparableYearWac = buildComparableYearWacResearch({
    movements: historicalEvidence.movements,
    years: [2024, 2025],
  });
  const movementContractVerified = String(process.env.CPM_INVENTORY_SOURCE_CONTRACT_VERIFIED).toLowerCase() === "true";
  const sourceVerified = movementContractVerified;
  const movementEvidenceComplete = movementEvidence.mappedRowCount === movementRows.length
    && movementCandidates.candidateMovementCount === movementRows.length
    && movementCandidates.reviewCounts.invalidCostRows === 0
    && movementCandidates.reviewCounts.invalidMovementRows === 0
    && movementCandidates.reviewCounts.unlinkedReturnRows === 0
    && movementCandidates.reviewCounts.missingDepotCount === 0;
  const historicalCurrencyComplete = historicalEvidence.movements.length === movementCandidates.candidateMovementCount
    && historicalEvidence.movements.every((movement) => {
      const productCurrency = String(movement.productCurrency || "").trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(productCurrency)) return false;
      if (!["opening", "purchase"].includes(movement.kind) || productCurrency === "TRY") return true;
      return Number.isFinite(Number(movement.unitCostCurrencyExVat))
        && Number(movement.unitCostCurrencyExVat) > 0;
    });
  const costEvidenceComplete = movementEvidenceComplete
    && historicalCurrencyComplete
    && historicalEvidence.costReviewCounts.review === 0
    && historicalEvidence.priceRowCount > 0
    && historicalEvidence.exchangeRateCount > 0;
  const marginEvidenceComplete = movementEvidenceComplete
    && historicalCurrencyComplete
    && historicalEvidence.reviewCounts.review === 0
    && historicalEvidence.priceRowCount > 0
    && historicalEvidence.exchangeRateCount > 0;
  const historicalEvidenceComplete = costEvidenceComplete && marginEvidenceComplete;
  return buildFinalInvoiceLedger({
    economics: result.ledger.recordsets[0] || [],
    lineage: result.ledger.recordsets[1] || [],
    actorEvents: result.ledger.recordsets[2] || [],
    pilotOrders: result.ledger.recordsets[3] || [],
    exchangeRates: resolvedRateRows,
    marginObservationsByStockKey: historicalEvidence.marginObservationsByStockKey,
    observationByMovementId: historicalEvidence.observationByMovementId,
    inventorySource: {
      status: sourceVerified ? "verified" : "candidate",
      ...(sourceVerified ? { contractVersion: 1 } : {}),
      financialStatus: sourceVerified && rateCandidates.status === "verified" && historicalEvidenceComplete
        ? "ready" : "blocked",
      reviewReason: "movement-source-not-verified",
      // Tarihsel fiyat/kur ile zenginleştirilmiş hareketler candidate olarak
      // saklanır; source.status/financialStatus gate'i açılmadan official WAC'a
      // bağlanmaz. Verified geçişte aynı enriched satırlar EUR maliyetini taşır.
      movements: historicalEvidence.movements,
      evidence: {
        queryId: "inventory-movement-candidate-v1",
        candidateRowCount: movementRows.length,
        movementCandidateStatus: movementEvidence.status,
        movementMappedRowCount: movementEvidence.mappedRowCount,
        movementKindCounts: movementEvidence.kindCounts,
        movementUnmappedDocumentTypes: movementEvidence.unmappedDocumentTypes,
        movementReviewReason: movementEvidence.reviewReason,
        candidateMovementCount: movementCandidates.candidateMovementCount,
        movementReviewReasonDetailed: movementCandidates.reviewReason,
        movementReviewCounts: movementCandidates.reviewCounts,
        movementEvidenceComplete,
        movementReviewReasons: movementCandidates.reviewReasons,
        documentTypes: [...new Set(movementRows.map((row) => Number(row.documentType)).filter(Number.isFinite))].sort((a, b) => a - b),
        rateCandidateRowCount: rateRows.length,
        rateCandidateStatus: rateCandidates.status,
        rateReviewReason: rateCandidates.reviewReason,
        rateUsableRowCount: rateCandidates.usableRowCount || 0,
        tcmbFallback: resolvedRateFallback,
        rateBankCodes: [...new Set(rateRows.map((row) => Number(row.bankCode)).filter(Number.isFinite))].sort((a, b) => a - b),
        rateBankNames: [...new Set(rateRows.map((row) => String(row.bankName || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr")),
        rateTypes: [...new Set(rateRows.map((row) => Number(row.rateType)).filter(Number.isFinite))].sort((a, b) => a - b),
        priceCandidateRowCount: priceRows.length,
        historicalPriceRowCount: historicalEvidence.priceRowCount,
        historicalExchangeRateCount: historicalEvidence.exchangeRateCount,
        historicalEvidenceReviewCounts: historicalEvidence.reviewCounts,
        historicalEvidenceReviewReasons: historicalEvidence.reviewReasons,
        historicalCostEvidenceReviewCounts: historicalEvidence.costReviewCounts,
        historicalCostEvidenceReviewReasons: historicalEvidence.costReviewReasons,
        historicalCurrencyComplete,
        costEvidenceComplete,
        marginEvidenceComplete,
        historicalEvidenceComplete,
        comparableYearWac,
      },
    },
  });
}

const ledgerService = injectedLedgerService || createLedgerService({ loadYear: loadFinalInvoiceLedger });

async function getStoredAppState() {
  return normalizeStoredAppState(await stateStore.read());
}

async function loadSourceProvenance(year, canonicalSnapshot = null, ledgerVersion = null) {
  const pool = await getPool();
  if (!pool) return { status: "unavailable", reason: "cpm-connection-unavailable" };
  const company = process.env.CPM_SQL_COMPANY || "01";
  let candidateRows = null;
  return collectCpmSourceProvenance({
    transactionFactory: async () => new sql.Transaction(pool),
    isolationLevel: sql.ISOLATION_LEVEL.READ_COMMITTED,
    executeRead: executeCpmReadOnlyQuery,
    ...(Array.isArray(canonicalSnapshot)
      ? { canonicalRows: canonicalSnapshot }
      : {
        loadCanonical: async ({ request, execute }) => {
          request.input("company", sql.VarChar(3), company);
          request.input("year", sql.Int, year);
          const result = await execute({ queryId: "final-invoice-ledger-v1", query: finalInvoiceLedgerSql });
          return result.recordsets?.[0] || null;
        },
      }),
    loadSource: async ({ request, execute, canonicalRows }) => {
      if (Array.isArray(canonicalSnapshot)) {
        request.input("company", sql.VarChar(3), company);
        request.input("year", sql.Int, year);
      }
      const result = await execute({ queryId: "source-provenance-candidates-v1", query: sourceProvenanceSql });
      candidateRows = result.recordsets?.[0] || [];
      const canonicalIds = new Set((canonicalRows || [])
        .map((row) => row.rootId)
        .filter((id) => id !== null && id !== undefined)
        .map((id) => String(id)));
      return candidateRows.filter((row) => canonicalIds.has(String(row.sourceRowId ?? row.rootId)));
    },
    loadCoverage: async ({ request, execute }) => {
      return candidateRows || execute({ queryId: "source-provenance-candidates-v1", query: sourceProvenanceSql });
    },
    versions: {
      queryContractVersion: "source-provenance-candidates-v1",
      transformationVersion: "ledger-v1",
      exclusionsVersion: "retail-exclusions-not-reproduced-v1",
    },
    source: {
      table: "STKHAR",
      status: "candidate",
      canonicalBasis: Array.isArray(canonicalSnapshot) ? "ledger-snapshot" : "same-transaction-reread",
      ledgerVersion,
    },
  });
}

async function loadInventoryOpeningResearch(year, sampleLimit) {
  const pool = await getPool();
  if (!pool) {
    return {
      ...buildInventoryOpeningResearchPayload({ year, sampleLimit }),
      status: "missing",
      reasonCodes: ["cpm-connection-unavailable"],
    };
  }
  const company = process.env.CPM_SQL_COMPANY || "01";
  const startDate = new Date(Date.UTC(year, 0, 1));
  const endDate = new Date(Date.UTC(year + 1, 0, 1));
  const result = await withReadOnlyCpmTransaction({
    transactionFactory: async () => new sql.Transaction(pool),
    isolationLevel: sql.ISOLATION_LEVEL.READ_COMMITTED,
    executeRead: executeCpmReadOnlyQuery,
    run: async ({ request, execute }) => {
      request.input("company", sql.VarChar(3), company);
      request.input("documentType", sql.Int, 82);
      request.input("documentType81", sql.Int, 81);
      request.input("sourceKind", sql.VarChar(20), "DEVIR");
      request.input("startDate", sql.DateTime2, startDate);
      request.input("endDate", sql.DateTime2, endDate);
      request.input("sampleLimit", sql.Int, sampleLimit);
      const summary = await execute({ queryId: "inventory-opening-stkhar-summary-v1", query: stkhArType82SummarySql });
      const samples = await execute({ queryId: "inventory-opening-stkhar-sample-v1", query: stkhArType82SampleSql });
      const type81Summary = await execute({ queryId: "inventory-opening-stkhar-type81-summary-v1", query: stkhArType81SummarySql });
      const type81Samples = await execute({ queryId: "inventory-opening-stkhar-type81-sample-v1", query: stkhArType81SampleSql });
      const symSummary = await execute({ queryId: "inventory-opening-stksym-summary-v1", query: stksymDevirSummarySql });
      const symSamples = await execute({ queryId: "inventory-opening-stksym-sample-v1", query: stksymDevirSampleSql });
      const symHarMatchSummary = await execute({ queryId: "inventory-opening-stksym-stkhar-match-summary-v1", query: stksymStkhArMatchSummarySql });
      const symHarDocumentMatchSummary = await execute({ queryId: "inventory-opening-stksym-stkhar-document-match-summary-v1", query: stksymStkhArDocumentMatchSummarySql });
      return {
        stkhArSummary: summary.recordsets?.[0]?.[0] || null,
        stkhArRows: samples.recordsets?.[0] || [],
        stkhArType81Summary: type81Summary.recordsets?.[0]?.[0] || null,
        stkhArType81Rows: type81Samples.recordsets?.[0] || [],
        stksymSummary: symSummary.recordsets?.[0]?.[0] || null,
        stksymRows: symSamples.recordsets?.[0] || [],
        stksymStkhArMatchSummary: symHarMatchSummary.recordsets?.[0]?.[0] || null,
        stksymStkhArDocumentMatchSummary: symHarDocumentMatchSummary.recordsets?.[0]?.[0] || null,
      };
    },
  });
  return buildInventoryOpeningResearchPayload({ year, sampleLimit, ...result });
}

const departmentTargetLoader = createDepartmentTargetLoader({
  ledgerService,
  getAppState: getStoredAppState,
});

  const realLedgerRouter = injectedLedgerRouter || createUnifiedLedgerRouter({
    ledgerService,
    getAppState: getStoredAppState,
    departmentTargetLoader,
    sourceProvenanceLoader: loadSourceProvenance,
    inventoryOpeningResearchLoader: loadInventoryOpeningResearch,
  });
  const realApprovalRouter = injectedApprovalRouter || createApprovalRouter({
  store: stateStore,
  loadDepartmentTargets: async (year, options) => {
    const result = await departmentTargetLoader(year, options);
    if (result.status !== 200) {
      const error = new Error(
        result.payload.error || "Departman hedefleri yüklenemedi.",
      );
      error.statusCode = result.status;
      throw error;
    }
    return result.payload;
  },
  });

  app.post("/api/session/login", auth.login);
  app.use((request, response, next) => {
    if (!request.path.startsWith("/api/") || request.path === "/api/health") return next();
    return auth.middleware(request, response, next);
  });
  app.get("/api/session", (request, response) => response.json({ user: request.user }));
  app.post("/api/session/logout", auth.logout);
  app.use((request, response, next) => {
    if (!request.path.startsWith("/api/") || request.path.startsWith("/api/session") || request.path === "/api/health") return next();
    const capability = request.path.startsWith("/api/app-state")
      ? CAPABILITIES.SETTINGS_MANAGE
      : request.path.startsWith("/api/approvals")
        ? CAPABILITIES.APPROVALS_MANAGE
        : request.path === "/api/ledger-refresh"
          ? CAPABILITIES.OPERATIONS_READ
          : ["/api/overview", "/api/reconciliation/invoices", "/api/reconciliation/invoices/source-rows", "/api/department-analysis", "/api/department-targets", "/api/audit-ledger", "/api/audit-samples", "/api/build-info", "/api/readiness", "/api/research/inventory-opening-evidence"].includes(request.path)
            ? CAPABILITIES.REPORTING_READ
            : ["/api/modules"].includes(request.path)
              ? CAPABILITIES.REPORTING_READ
            : ["/api/sales-cases", "/api/inventory-research"].includes(request.path)
              ? CAPABILITIES.OPERATIONS_READ
            : null;
    if (!capability) return response.status(403).json({ error: "API rotası için yetki politikası tanımlı değil." });
    return authorizeCapability(capability)(request, response, next);
  });
  app.use(realLedgerRouter);
  app.use(realApprovalRouter);

  app.get("/api/build-info", (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    return response.json(buildRuntimeInfo({ env: process.env }));
  });

  app.get("/api/modules", (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    return response.json({
      mode: "live",
      modules: modulesForCapabilities(request.user?.capabilities),
    });
  });

  app.get("/api/readiness", async (request, response) => {
    const year = Number(request.query.year || new Date().getFullYear());
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return response.status(400).json({ ready: false, blockers: ["invalid-year"] });
    }
    try {
      const snapshot = await ledgerService.get(year);
      const runtime = buildRuntimeInfo({
        env: process.env,
        connected: Boolean(snapshot.value),
      });
      let sourceProvenance = null;
      if (snapshot.value) {
        try {
          sourceProvenance = await loadSourceProvenance(
            year,
            snapshot.value.rows,
            snapshot.ledgerVersion,
          );
        } catch (error) {
          console.error("Marlin Nexus source provenance readiness check failed:", error);
          sourceProvenance = { status: "unavailable", reason: "provenance-read-failed" };
        }
      }
      const payload = buildReadinessPayload({
        runtime,
        inventorySource: snapshot.value?.inventorySource || { status: "missing" },
        sourceProvenance,
      });
      response.setHeader("Cache-Control", "no-store");
      return response.json({ year, ...payload });
    } catch (error) {
      console.error("Marlin Nexus readiness check failed:", error);
      response.setHeader("Cache-Control", "no-store");
      return response.status(503).json(buildReadinessPayload({
        runtime: buildRuntimeInfo({ env: process.env, connected: false }),
        inventorySource: { status: "unavailable" },
        sourceProvenance: { status: "unavailable", reason: "readiness-check-failed" },
      }));
    }
  });

app.get("/api/health", async (request, response) => {
  if (healthHandler) return healthHandler(request, response);
  try {
    const pool = await getPool();
    if (!pool) return response.json(buildRuntimeInfo({ env: process.env, connected: false }));
    const result = await pool.request().query("SELECT DB_NAME() AS databaseName");
    return response.json({
      ...buildRuntimeInfo({ env: process.env, connected: true }),
      mode: "live",
      database: result.recordset[0].databaseName,
    });
  } catch {
    return response.status(200).json({ connected: false, mode: "demo", readOnly: true });
  }
});

app.get("/api/sales-cases", async (request, response) => {
  const year = Number(request.query.year || 2026);
  const page = Math.max(1, Number(request.query.page || 1));
  const pageSize = Math.min(100, Math.max(10, Number(request.query.pageSize || 25)));
  const search = String(request.query.search || "").trim().slice(0, 80);
  const stage = ["offer", "order", "fulfillment", "retail", "invoiced", "correction", "other"].includes(request.query.stage)
    ? request.query.stage : "";
  const confidence = ["high", "medium", "low"].includes(request.query.confidence)
    ? request.query.confidence : "";
  const forceRefresh = request.query.refresh === "1";
  if (!Number.isInteger(year) || year < 2023 || year > 2030) return response.status(400).json({ error: "Geçersiz yıl." });

  try {
    const model = await getSalesCaseModel(year, forceRefresh);
    if (!model) {
      return response.status(503).json({
        year, page, pageSize, rows: [], mode: "unavailable", readOnly: true,
        error: "Gerçek CPM bağlantısı yapılandırılmadığı için satış vakaları üretilemedi.",
      });
    }
    const filtered = filterSalesCases(model.cases, { search, stage, confidence, page, pageSize });
    response.setHeader("Cache-Control", "no-store");
    return response.json({
      year, page, pageSize, total: filtered.total, rows: filtered.rows,
      summary: model.summary, quality: model.quality,
      filters: { search, stage, confidence }, mode: "live", readOnly: true,
    });
  } catch (error) {
    console.error("Marlin Nexus sales-case read failed:", error.message);
    return response.status(500).json({
      year, page, pageSize, rows: [], mode: "error", readOnly: true,
      error: "Gerçek satış vakaları CPM'den okunamadı.",
    });
  }
});

app.get("/api/app-state", async (_request, response) => {
  try {
    const state = await stateStore.read();
    return response.json({
      settings: state.settings || null,
      employees: Array.isArray(state.employees) ? state.employees : null,
      costOverrides: Array.isArray(state.costOverrides) ? state.costOverrides : [],
      savedAt: state.savedAt || null,
    });
  } catch (error) {
    if (error.code === "ENOENT") return response.json({ settings: null, employees: null, savedAt: null });
    return response.status(500).json({ error: "Uygulama ayarları okunamadı." });
  }
});

app.put("/api/app-state", async (request, response) => {
  const { settings, employees, costOverrides = [] } = request.body || {};
  if (!settings || typeof settings !== "object" || !Array.isArray(employees) || !Array.isArray(costOverrides)) {
    return response.status(400).json({ error: "Geçersiz uygulama ayarı." });
  }
  try {
    const state = await stateStore.update((current) => ({
      ...current,
      settings: serializeSettings(settings),
      employees,
      costOverrides,
    }));
    return response.json({ saved: true, savedAt: state.savedAt });
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      return response.status(400).json({ error: "Geçersiz uygulama ayarı." });
    }
    return response.status(500).json({ error: "Uygulama ayarları kaydedilemedi." });
  }
});

  if (staticRoot !== null) app.use(express.static(staticRoot || path.join(rootDir, "dist")));
  app.use((request, response, next) => {
  if (request.method !== "GET" || request.path.startsWith("/api/")) return next();
  return response.sendFile(path.join(rootDir, "dist", "index.html"));
  });

  app.locals.ledgerService = ledgerService;
  return app;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
const port = Number(process.env.PORT || 4318);
const host = process.env.HOST || "127.0.0.1";
const app = createApp();
app.listen(port, host, () => {
  console.log(`Marlin Nexus · Yönetim Sistemi http://${host}:${port}`);
  const startedAt = Date.now();
  const currentYear = new Date().getFullYear();
  const configuredPrewarmYears = String(process.env.NEXUS_PREWARM_YEARS || "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((year) => Number.isInteger(year) && year >= 2000 && year <= 2100);
  const prewarmYears = configuredPrewarmYears.length >= 2
    ? [...new Set(configuredPrewarmYears)].slice(0, 2)
    : [currentYear, currentYear - 1];
  void app.locals.ledgerService.prewarm(prewarmYears).then((results) => {
    const durationMs = Date.now() - startedAt;
    for (const result of results) {
      if (result.status === "fulfilled") {
        console.log("Marlin Nexus ledger prewarm completed:", {
          year: result.year,
          durationMs,
          rows: result.value.value?.rows?.length || 0,
          cacheStatus: result.value.cache.status,
        });
      } else {
        console.error("Marlin Nexus ledger prewarm failed:", {
          year: result.year,
          durationMs,
          error: result.reason,
        });
      }
    }
  }).catch((error) => {
    console.error("Marlin Nexus ledger prewarm process failed:", error);
  });
});
}
