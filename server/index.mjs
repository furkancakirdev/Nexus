import express from "express";
import sql from "mssql";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSalesCaseModel, filterSalesCases, salesCaseSql } from "./salesCases.mjs";
import { buildFinalInvoiceLedger, finalInvoiceLedgerSql } from "./finalInvoiceLedger.mjs";
import { createUnifiedLedgerRouter } from "./ledgerApi.mjs";
import { createLedgerService } from "./ledgerService.mjs";

const app = express();
const port = Number(process.env.PORT || 4318);
const host = process.env.HOST || "127.0.0.1";
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataFile = process.env.APP_STATE_FILE || path.join(rootDir, "data", "app-state.json");
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

  poolPromise = sql.connect({
    server: process.env.CPM_SQL_SERVER || "192.168.12.17",
    database: process.env.CPM_SQL_DATABASE || "Marlin_Uyg",
    user: credentials.user,
    password: credentials.password,
    connectionTimeout: 8_000,
    requestTimeout: 90_000,
    options: {
      instanceName: process.env.CPM_SQL_INSTANCE || "MARLINSQL",
      encrypt: false,
      trustServerCertificate: true,
      readOnlyIntent: true,
      appName: "Marlin Nexus ReadOnly",
    },
    pool: { min: 0, max: 4, idleTimeoutMillis: 10_000 },
  }).catch((error) => {
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
  const result = await pool.request()
    .input("company", sql.VarChar(3), process.env.CPM_SQL_COMPANY || "01")
    .input("year", sql.Int, year)
    .query(finalInvoiceLedgerSql);
  return buildFinalInvoiceLedger({
    economics: result.recordsets[0] || [],
    lineage: result.recordsets[1] || [],
    actorEvents: result.recordsets[2] || [],
    pilotOrders: result.recordsets[3] || [],
  });
}

const ledgerService = createLedgerService({ loadYear: loadFinalInvoiceLedger });

async function getStoredAppState() {
  try {
    return JSON.parse(await readFile(dataFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

app.use(createUnifiedLedgerRouter({
  ledgerService,
  getAppState: getStoredAppState,
}));

app.get("/api/health", async (_request, response) => {
  try {
    const pool = await getPool();
    if (!pool) return response.json({ connected: false, mode: "demo", readOnly: true });
    const result = await pool.request().query("SELECT DB_NAME() AS databaseName");
    return response.json({
      connected: true,
      mode: "live",
      readOnly: true,
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
    const state = JSON.parse(await readFile(dataFile, "utf8"));
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
    await mkdir(path.dirname(dataFile), { recursive: true });
    const state = { settings, employees, costOverrides, savedAt: new Date().toISOString() };
    const tempFile = `${dataFile}.tmp`;
    await writeFile(tempFile, JSON.stringify(state, null, 2), "utf8");
    await rename(tempFile, dataFile);
    return response.json({ saved: true, savedAt: state.savedAt });
  } catch {
    return response.status(500).json({ error: "Uygulama ayarları kaydedilemedi." });
  }
});

app.use(express.static(path.join(rootDir, "dist")));
app.use((request, response, next) => {
  if (request.method !== "GET" || request.path.startsWith("/api/")) return next();
  return response.sendFile(path.join(rootDir, "dist", "index.html"));
});

app.listen(port, host, () => {
  console.log(`Marlin Nexus · Yönetim Sistemi http://${host}:${port}`);
  const startedAt = Date.now();
  const currentYear = new Date().getFullYear();
  void ledgerService.prewarm([currentYear, currentYear - 1]).then((results) => {
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
