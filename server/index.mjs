import express from "express";
import sql from "mssql";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSalesCaseModel, filterSalesCases, salesCaseSql } from "./salesCases.mjs";
import { buildDepartmentAnalysis, departmentAnalysisSql } from "./departmentAnalysis.mjs";
import { buildFinalInvoiceLedger, finalInvoiceLedgerSql } from "./finalInvoiceLedger.mjs";

const app = express();
const port = Number(process.env.PORT || 4318);
const host = process.env.HOST || "127.0.0.1";
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataFile = process.env.APP_STATE_FILE || path.join(rootDir, "data", "app-state.json");
app.use(express.json({ limit: "1mb" }));
const monthNames = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

const demoRows = [
  [1, 168_520_000, 4_210_000, 6_180_000, 100_845_000, 83.8],
  [2, 181_740_000, 4_520_000, 6_350_000, 105_980_000, 82.4],
  [3, 208_660_000, 5_410_000, 7_890_000, 121_775_000, 79.6],
  [4, 215_480_000, 5_670_000, 8_360_000, 132_940_000, 76.3],
  [5, 251_050_000, 8_540_000, 8_940_000, 140_978_000, 66.1],
].map(([month, sales, returns, discounts, cost, coverage]) => ({
  month,
  monthName: monthNames[month - 1],
  sales,
  returns,
  discounts,
  estimatedCost: cost,
  costCoveragePct: coverage,
  source: "demo",
}));

let poolPromise;
const salesCaseCache = new Map();
const SALES_CASE_CACHE_MS = 5 * 60 * 1000;
const departmentAnalysisCache = new Map();
const DEPARTMENT_ANALYSIS_CACHE_MS = 5 * 60 * 1000;

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

async function getDepartmentAnalysisSource(year, forceRefresh = false) {
  const cached = departmentAnalysisCache.get(year);
  if (!forceRefresh && cached && Date.now() - cached.cachedAt < DEPARTMENT_ANALYSIS_CACHE_MS) return cached.source;
  const pool = await getPool();
  if (!pool) return null;
  const result = await pool.request()
    .input("company", sql.VarChar(3), process.env.CPM_SQL_COMPANY || "01")
    .input("year", sql.Int, year)
    .query(departmentAnalysisSql);
  const source = {
    economics: result.recordsets[0] || [],
    lineage: result.recordsets[1] || [],
    pilotOrders: result.recordsets[2] || [],
  };
  departmentAnalysisCache.set(year, { cachedAt: Date.now(), source });
  return source;
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

async function getStoredAppState() {
  try {
    return JSON.parse(await readFile(dataFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

const overviewSql = `
WITH incomingReturnDocuments AS (
  SELECT DISTINCT e.EVRAKNO
  FROM EFAGLN e
  WHERE e.EVRAKNO IS NOT NULL
    AND (
      CONCAT(ISNULL(e.NOT1,''),' ',ISNULL(e.NOT2,''),' ',ISNULL(e.NOT3,'')) COLLATE Turkish_CI_AI LIKE N'%iade%'
      OR CONCAT(ISNULL(e.NOT1,''),' ',ISNULL(e.NOT2,''),' ',ISNULL(e.NOT3,'')) COLLATE Turkish_CI_AI LIKE N'%return%'
    )
), finalSales AS (
  SELECT h.*, CAST('invoice' AS varchar(16)) AS revenueSource
  FROM STKHAR h
  WHERE h.SIRKETNO = @company
    AND YEAR(h.EVRAKTARIH) = @year
    AND h.EVRAKTIP IN (17,85,91)
    AND h.KAYITDURUM = 1
    AND h.MALKOD NOT IN ('KOMİSYON','GD-0187','GD-0079','PDI')
), provisionalSales AS (
  SELECT h.*, CAST('provisional' AS varchar(16)) AS revenueSource
  FROM STKHAR h
  WHERE h.SIRKETNO = @company
    AND YEAR(h.EVRAKTARIH) = @year
    AND h.EVRAKTIP IN (13,14,15,64)
    AND h.KAYITDURUM = 1
    AND h.EVRAKDURUM = 1
    AND h.MIKTAR <> 0
    AND ISNULL(h.KULLANILANMIKTAR, 0) >= h.MIKTAR
    AND h.MALKOD NOT IN ('KOMİSYON','GD-0187','GD-0079','PDI')
    AND NOT EXISTS (
      SELECT 1
      FROM STKHAR downstream
      WHERE downstream.SIRKETNO = h.SIRKETNO
        AND downstream.KAYITDURUM = 1
        AND downstream.EVRAKTIP IN (14,15,17,64,85,91)
        AND downstream.SONKAYNAKEVRAKTIP = h.EVRAKTIP
        AND downstream.SONKAYNAKEVRAKNO = h.EVRAKNO
        AND downstream.SONKAYNAKHESAPKOD = h.HESAPKOD
        AND downstream.SONKAYNAKSIRANO = h.SIRANO
    )
), movements AS (
  SELECT s.*, CAST(1 AS bit) AS isSale
  FROM finalSales s
  UNION ALL
  SELECT s.*, CAST(1 AS bit) AS isSale
  FROM provisionalSales s
  UNION ALL
  SELECT h.*, CAST('return' AS varchar(16)) AS revenueSource, CAST(0 AS bit) AS isSale
  FROM STKHAR h
  WHERE h.SIRKETNO = @company
    AND YEAR(h.EVRAKTARIH) = @year
    AND h.EVRAKTIP = 18
    AND h.KAYITDURUM = 1
    AND h.MALKOD NOT IN ('KOMİSYON','GD-0187','GD-0079','PDI')
), resolved AS (
  SELECT
    h.*,
    originalSale.EVRAKTARIH AS originalSaleDate,
    COALESCE(bulkPurchase.netUnitCost, lastPurchase.netUnitCost, nextPurchase.netUnitCost) AS resolvedUnitCost,
    CASE
      WHEN bulkPurchase.netUnitCost IS NOT NULL THEN 'bulkPurchase'
      WHEN lastPurchase.netUnitCost IS NOT NULL THEN 'lastPurchase'
      WHEN nextPurchase.netUnitCost IS NOT NULL THEN 'nextPurchase'
      ELSE 'missing'
    END AS resolvedCostMethod
  FROM movements h
  OUTER APPLY (
    SELECT TOP (1) original.EVRAKTARIH
    FROM STKHAR original
    WHERE h.isSale = 0
      AND h.SONKAYNAKEVRAKTIP IN (17,85,91)
      AND original.SIRKETNO = h.SIRKETNO
      AND original.KAYITDURUM = 1
      AND original.EVRAKTIP = h.SONKAYNAKEVRAKTIP
      AND original.EVRAKNO = h.SONKAYNAKEVRAKNO
      AND original.HESAPKOD = h.SONKAYNAKHESAPKOD
      AND original.SIRANO = h.SONKAYNAKSIRANO
    ORDER BY original.ID DESC
  ) originalSale
  OUTER APPLY (
    SELECT TOP (1)
      (p.TUTAR - p.ISKONTO) / NULLIF(p.MIKTAR, 0) AS netUnitCost
    FROM STKHAR p
    CROSS APPLY (
      SELECT COUNT_BIG(*) docLineCount
      FROM STKHAR px
      WHERE px.SIRKETNO = p.SIRKETNO AND px.KAYITDURUM = 1
        AND px.EVRAKTIP = p.EVRAKTIP AND px.EVRAKNO = p.EVRAKNO AND px.HESAPKOD = p.HESAPKOD
    ) purchaseDoc
    OUTER APPLY (
      SELECT SUM(o.MIKTAR) consumedQuantity
      FROM STKHAR o
      WHERE o.SIRKETNO = p.SIRKETNO AND o.KAYITDURUM = 1 AND o.MALKOD = p.MALKOD
        AND o.EVRAKTIP IN (17,85,91)
        AND o.EVRAKTARIH > p.EVRAKTARIH
        AND o.EVRAKTARIH < COALESCE(originalSale.EVRAKTARIH, h.EVRAKTARIH)
    ) consumption
    WHERE p.SIRKETNO = h.SIRKETNO
      AND p.MALKOD = h.MALKOD
      AND p.EVRAKTIP IN (9,609)
      AND p.KAYITDURUM = 1
      AND p.MIKTAR > 0
      AND p.TUTAR - p.ISKONTO >= 0
      AND NOT EXISTS (SELECT 1 FROM incomingReturnDocuments r WHERE r.EVRAKNO = p.EVRAKNO)
      AND p.EVRAKTARIH BETWEEN DATEADD(year,-1,COALESCE(originalSale.EVRAKTARIH, h.EVRAKTARIH))
        AND COALESCE(originalSale.EVRAKTARIH, h.EVRAKTARIH)
      AND purchaseDoc.docLineCount >= 10
      AND CASE WHEN p.TUTAR <> 0 THEN 100.0 * p.ISKONTO / p.TUTAR ELSE 0 END >= 15
      AND p.MIKTAR - ISNULL(consumption.consumedQuantity,0) >= h.MIKTAR
    ORDER BY p.EVRAKTARIH DESC, p.ID DESC
  ) bulkPurchase
  OUTER APPLY (
    SELECT TOP (1)
      (p.TUTAR - p.ISKONTO) / NULLIF(p.MIKTAR, 0) AS netUnitCost
    FROM STKHAR p
    WHERE p.SIRKETNO = h.SIRKETNO
      AND p.MALKOD = h.MALKOD
      AND p.EVRAKTIP IN (9,609)
      AND p.KAYITDURUM = 1
      AND p.MIKTAR > 0
      AND p.TUTAR - p.ISKONTO >= 0
      AND NOT EXISTS (SELECT 1 FROM incomingReturnDocuments r WHERE r.EVRAKNO = p.EVRAKNO)
      AND p.EVRAKTARIH <= COALESCE(originalSale.EVRAKTARIH, h.EVRAKTARIH)
    ORDER BY p.EVRAKTARIH DESC, p.ID DESC
  ) lastPurchase
  OUTER APPLY (
    SELECT TOP (1)
      (p.TUTAR - p.ISKONTO) / NULLIF(p.MIKTAR, 0) AS netUnitCost
    FROM STKHAR p
    WHERE p.SIRKETNO = h.SIRKETNO
      AND p.MALKOD = h.MALKOD
      AND p.EVRAKTIP IN (9,609)
      AND p.KAYITDURUM = 1
      AND p.MIKTAR > 0
      AND p.TUTAR - p.ISKONTO >= 0
      AND NOT EXISTS (SELECT 1 FROM incomingReturnDocuments r WHERE r.EVRAKNO = p.EVRAKNO)
      AND p.EVRAKTARIH > COALESCE(originalSale.EVRAKTARIH, h.EVRAKTARIH)
    ORDER BY p.EVRAKTARIH ASC, p.ID ASC
  ) nextPurchase
)
SELECT
  MONTH(r.EVRAKTARIH) AS [month],
  SUM(CASE WHEN r.isSale = 1 AND r.MALKOD NOT IN ('İŞÇİLİK','SRF','TSR','YOL','BARNACLE') THEN r.TUTAR ELSE 0 END) AS sales,
  SUM(CASE WHEN r.isSale = 0 AND r.MALKOD NOT IN ('İŞÇİLİK','SRF','TSR','YOL','BARNACLE') THEN r.TUTAR - r.ISKONTO ELSE 0 END) AS returns,
  SUM(CASE WHEN r.isSale = 1 AND r.MALKOD NOT IN ('İŞÇİLİK','SRF','TSR','YOL','BARNACLE') THEN r.ISKONTO ELSE 0 END) AS discounts,
  SUM(CASE
    WHEN r.isSale = 1 AND r.MALKOD NOT IN ('İŞÇİLİK','SRF','TSR','YOL','BARNACLE') THEN r.MIKTAR * r.resolvedUnitCost
    WHEN r.isSale = 0 AND r.MALKOD NOT IN ('İŞÇİLİK','SRF','TSR','YOL','BARNACLE') THEN -r.MIKTAR * r.resolvedUnitCost
    ELSE 0
  END) AS estimatedCost,
  SUM(CASE WHEN r.MALKOD NOT IN ('İŞÇİLİK','SRF','TSR','YOL','BARNACLE') THEN 1 ELSE 0 END) AS lineCount,
  SUM(CASE WHEN r.MALKOD NOT IN ('İŞÇİLİK','SRF','TSR','YOL','BARNACLE') AND r.resolvedUnitCost IS NOT NULL THEN 1 ELSE 0 END) AS costCoveredLines,
  CAST(0 AS bigint) AS masterCostLines,
  SUM(CASE WHEN r.MALKOD NOT IN ('İŞÇİLİK','SRF','TSR','YOL','BARNACLE') AND r.resolvedCostMethod = 'bulkPurchase' THEN 1 ELSE 0 END) AS bulkPurchaseCostLines,
  SUM(CASE WHEN r.MALKOD NOT IN ('İŞÇİLİK','SRF','TSR','YOL','BARNACLE') AND r.resolvedCostMethod = 'lastPurchase' THEN 1 ELSE 0 END) AS lastPurchaseCostLines,
  SUM(CASE WHEN r.MALKOD NOT IN ('İŞÇİLİK','SRF','TSR','YOL','BARNACLE') AND r.resolvedCostMethod = 'nextPurchase' THEN 1 ELSE 0 END) AS nextPurchaseCostLines,
  SUM(CASE WHEN r.MALKOD NOT IN ('İŞÇİLİK','SRF','TSR','YOL','BARNACLE') AND r.resolvedCostMethod = 'missing' THEN 1 ELSE 0 END) AS uncoveredCostLines,
  SUM(CASE
    WHEN r.MALKOD NOT IN ('İŞÇİLİK','SRF','TSR','YOL','BARNACLE') AND r.resolvedCostMethod = 'missing' AND r.isSale = 1 THEN r.TUTAR - r.ISKONTO
    WHEN r.MALKOD NOT IN ('İŞÇİLİK','SRF','TSR','YOL','BARNACLE') AND r.resolvedCostMethod = 'missing' AND r.isSale = 0 THEN -(r.TUTAR - r.ISKONTO)
    ELSE 0
  END) AS uncoveredNetSales,
  SUM(CASE WHEN r.MALKOD IN ('İŞÇİLİK','SRF','TSR','YOL','BARNACLE') THEN 1 ELSE 0 END) AS pilotCardLines,
  SUM(CASE WHEN r.MALKOD = 'İŞÇİLİK' AND r.isSale = 1 THEN r.TUTAR ELSE 0 END) AS laborSales,
  SUM(CASE WHEN r.MALKOD = 'İŞÇİLİK' AND r.isSale = 0 THEN r.TUTAR - r.ISKONTO ELSE 0 END) AS laborReturns,
  SUM(CASE WHEN r.MALKOD = 'İŞÇİLİK' AND r.isSale = 1 THEN r.ISKONTO ELSE 0 END) AS laborDiscounts,
  SUM(CASE WHEN r.MALKOD IN ('SRF','BARNACLE') AND r.isSale = 1 THEN r.TUTAR ELSE 0 END) AS srfSales,
  SUM(CASE WHEN r.MALKOD IN ('SRF','BARNACLE') AND r.isSale = 0 THEN r.TUTAR - r.ISKONTO ELSE 0 END) AS srfReturns,
  SUM(CASE WHEN r.MALKOD IN ('SRF','BARNACLE') AND r.isSale = 1 THEN r.ISKONTO ELSE 0 END) AS srfDiscounts,
  SUM(CASE WHEN r.MALKOD = 'TSR' AND r.isSale = 1 THEN r.TUTAR ELSE 0 END) AS tsrSales,
  SUM(CASE WHEN r.MALKOD = 'TSR' AND r.isSale = 0 THEN r.TUTAR - r.ISKONTO ELSE 0 END) AS tsrReturns,
  SUM(CASE WHEN r.MALKOD = 'TSR' AND r.isSale = 1 THEN r.ISKONTO ELSE 0 END) AS tsrDiscounts,
  SUM(CASE WHEN r.MALKOD = 'YOL' AND r.isSale = 1 THEN r.TUTAR ELSE 0 END) AS roadSales,
  SUM(CASE WHEN r.MALKOD = 'YOL' AND r.isSale = 0 THEN r.TUTAR - r.ISKONTO ELSE 0 END) AS roadReturns,
  SUM(CASE WHEN r.MALKOD = 'YOL' AND r.isSale = 1 THEN r.ISKONTO ELSE 0 END) AS roadDiscounts,
  SUM(CASE WHEN r.revenueSource = 'invoice' THEN 1 ELSE 0 END) AS invoiceLineCount,
  SUM(CASE WHEN r.revenueSource = 'provisional' THEN 1 ELSE 0 END) AS provisionalLineCount,
  SUM(CASE WHEN r.revenueSource = 'invoice' THEN r.TUTAR - r.ISKONTO ELSE 0 END) AS invoiceNetSales,
  SUM(CASE WHEN r.revenueSource = 'provisional' THEN r.TUTAR - r.ISKONTO ELSE 0 END) AS provisionalNetSales,
  SUM(CASE WHEN r.isSale = 0 AND r.originalSaleDate IS NOT NULL THEN 1 ELSE 0 END) AS linkedReturnLines,
  SUM(CASE WHEN r.isSale = 0 AND r.originalSaleDate IS NULL THEN 1 ELSE 0 END) AS unlinkedReturnLines
FROM resolved r
GROUP BY MONTH(r.EVRAKTARIH)
ORDER BY [month];`;

const auditSamplesSql = `
WITH incomingReturnDocuments AS (
  SELECT DISTINCT e.EVRAKNO
  FROM EFAGLN e
  WHERE e.EVRAKNO IS NOT NULL
    AND (
      CONCAT(ISNULL(e.NOT1,''),' ',ISNULL(e.NOT2,''),' ',ISNULL(e.NOT3,'')) COLLATE Turkish_CI_AI LIKE N'%iade%'
      OR CONCAT(ISNULL(e.NOT1,''),' ',ISNULL(e.NOT2,''),' ',ISNULL(e.NOT3,'')) COLLATE Turkish_CI_AI LIKE N'%return%'
    )
), sales AS (
  SELECT h.*, k.MALAD
  FROM STKHAR h
  LEFT JOIN STKKRT k ON k.SIRKETNO = h.SIRKETNO AND k.MALKOD = h.MALKOD
  WHERE h.SIRKETNO = @company
    AND YEAR(h.EVRAKTARIH) = @year
    AND h.EVRAKTIP IN (17,85,91)
    AND h.KAYITDURUM = 1
), matched AS (
  SELECT
    s.*,
    priorPurchase.purchaseType AS priorType,
    priorPurchase.purchaseNo AS priorNo,
    priorPurchase.purchaseDate AS priorDate,
    priorPurchase.netUnitCost AS priorUnitCost,
    nextPurchase.purchaseType AS nextType,
    nextPurchase.purchaseNo AS nextNo,
    nextPurchase.purchaseDate AS nextDate,
    nextPurchase.netUnitCost AS nextUnitCost
  FROM sales s
  OUTER APPLY (
    SELECT TOP (1)
      p.EVRAKTIP AS purchaseType, p.EVRAKNO AS purchaseNo, p.EVRAKTARIH AS purchaseDate,
      (p.TUTAR - p.ISKONTO) / NULLIF(p.MIKTAR, 0) AS netUnitCost
    FROM STKHAR p
    WHERE p.SIRKETNO = s.SIRKETNO AND p.KAYITDURUM = 1
      AND p.EVRAKTIP IN (9,609) AND p.MALKOD = s.MALKOD
      AND p.MIKTAR > 0 AND p.TUTAR - p.ISKONTO >= 0
      AND NOT EXISTS (SELECT 1 FROM incomingReturnDocuments r WHERE r.EVRAKNO = p.EVRAKNO)
      AND p.EVRAKTARIH <= s.EVRAKTARIH
    ORDER BY p.EVRAKTARIH DESC, p.ID DESC
  ) priorPurchase
  OUTER APPLY (
    SELECT TOP (1)
      p.EVRAKTIP AS purchaseType, p.EVRAKNO AS purchaseNo, p.EVRAKTARIH AS purchaseDate,
      (p.TUTAR - p.ISKONTO) / NULLIF(p.MIKTAR, 0) AS netUnitCost
    FROM STKHAR p
    WHERE p.SIRKETNO = s.SIRKETNO AND p.KAYITDURUM = 1
      AND p.EVRAKTIP IN (9,609) AND p.MALKOD = s.MALKOD
      AND p.MIKTAR > 0 AND p.TUTAR - p.ISKONTO >= 0
      AND NOT EXISTS (SELECT 1 FROM incomingReturnDocuments r WHERE r.EVRAKNO = p.EVRAKNO)
      AND p.EVRAKTARIH > s.EVRAKTARIH
    ORDER BY p.EVRAKTARIH ASC, p.ID ASC
  ) nextPurchase
), evidence AS (
  SELECT
    CASE WHEN priorUnitCost IS NOT NULL THEN 'priorPurchase' ELSE 'nextPurchase' END AS category,
    EVRAKTIP AS saleType, EVRAKNO AS saleNo, EVRAKTARIH AS saleDate,
    MALKOD AS cardCode, MALAD AS cardName, MIKTAR AS quantity,
    TUTAR - ISKONTO AS netSales,
    COALESCE(priorType, nextType) AS purchaseType,
    COALESCE(priorNo, nextNo) AS purchaseNo,
    COALESCE(priorDate, nextDate) AS purchaseDate,
    COALESCE(priorUnitCost, nextUnitCost) AS unitCost,
    MIKTAR * COALESCE(priorUnitCost, nextUnitCost) AS lineCost
  FROM matched
  WHERE MALKOD NOT IN ('İŞÇİLİK','SRF','TSR','YOL','BARNACLE','KOMİSYON','GD-0187','GD-0079','PDI')
    AND COALESCE(priorUnitCost, nextUnitCost) IS NOT NULL
  UNION ALL
  SELECT 'configuredSrf', EVRAKTIP, EVRAKNO, EVRAKTARIH, MALKOD, MALAD, MIKTAR,
    TUTAR - ISKONTO, NULL, NULL, NULL, NULL, NULL
  FROM matched WHERE MALKOD = 'BARNACLE'
  UNION ALL
  SELECT 'excludedIncome', EVRAKTIP, EVRAKNO, EVRAKTARIH, MALKOD, MALAD, MIKTAR,
    TUTAR - ISKONTO, NULL, NULL, NULL, NULL, NULL
  FROM matched WHERE MALKOD IN ('KOMİSYON','GD-0187','GD-0079','PDI')
), ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY category ORDER BY netSales DESC, saleDate DESC) AS rn
  FROM evidence
)
SELECT category, saleType, saleNo, saleDate, cardCode, cardName, quantity, netSales,
  purchaseType, purchaseNo, purchaseDate, unitCost, lineCost
FROM ranked
WHERE rn <= 4
ORDER BY CASE category WHEN 'priorPurchase' THEN 1 WHEN 'nextPurchase' THEN 2 WHEN 'configuredSrf' THEN 3 ELSE 4 END, rn;`;

const auditLedgerSql = `
DECLARE @incomingReturnDocuments TABLE (EVRAKNO nvarchar(100) PRIMARY KEY);
INSERT INTO @incomingReturnDocuments (EVRAKNO)
SELECT DISTINCT CAST(e.EVRAKNO AS nvarchar(100))
FROM EFAGLN e
WHERE e.EVRAKNO IS NOT NULL
  AND (
    CONCAT(ISNULL(e.NOT1,''),' ',ISNULL(e.NOT2,''),' ',ISNULL(e.NOT3,'')) COLLATE Turkish_CI_AI LIKE N'%iade%'
    OR CONCAT(ISNULL(e.NOT1,''),' ',ISNULL(e.NOT2,''),' ',ISNULL(e.NOT3,'')) COLLATE Turkish_CI_AI LIKE N'%return%'
  );

DECLARE @returnPurchaseRows TABLE (
  purchaseId bigint, SIRKETNO varchar(3), MALKOD nvarchar(100), purchaseType int,
  purchaseNo nvarchar(100), purchaseDate datetime, accountCode nvarchar(100), partyName nvarchar(255)
);
INSERT INTO @returnPurchaseRows (purchaseId,SIRKETNO,MALKOD,purchaseType,purchaseNo,purchaseDate,accountCode,partyName)
SELECT
    p.ID purchaseId, p.SIRKETNO, p.MALKOD, p.EVRAKTIP purchaseType,
    p.EVRAKNO purchaseNo, p.EVRAKTARIH purchaseDate, p.HESAPKOD accountCode,
    (SELECT TOP (1) c.UNVAN FROM CARKRT c WHERE c.SIRKETNO=p.SIRKETNO AND c.HESAPKOD=p.HESAPKOD) partyName
FROM STKHAR p
INNER JOIN @incomingReturnDocuments r ON r.EVRAKNO=p.EVRAKNO
WHERE p.SIRKETNO=@company AND p.KAYITDURUM=1 AND p.EVRAKTIP IN(9,609)
  AND p.MIKTAR>0 AND p.TUTAR-p.ISKONTO>=0;

WITH finalSales AS (
  SELECT h.*, CAST('invoice' AS varchar(16)) AS revenueSource, CAST(1 AS bit) AS isSale
  FROM STKHAR h
  WHERE h.SIRKETNO = @company AND YEAR(h.EVRAKTARIH) = @year
    AND h.EVRAKTIP IN (17,85,91) AND h.KAYITDURUM = 1
), provisionalSales AS (
  SELECT h.*, CAST('provisional' AS varchar(16)) AS revenueSource, CAST(1 AS bit) AS isSale
  FROM STKHAR h
  WHERE h.SIRKETNO = @company AND YEAR(h.EVRAKTARIH) = @year
    AND h.EVRAKTIP IN (13,14,15,64) AND h.KAYITDURUM = 1 AND h.EVRAKDURUM = 1
    AND h.MIKTAR <> 0 AND ISNULL(h.KULLANILANMIKTAR,0) >= h.MIKTAR
    AND NOT EXISTS (
      SELECT 1 FROM STKHAR d
      WHERE d.SIRKETNO = h.SIRKETNO AND d.KAYITDURUM = 1
        AND d.EVRAKTIP IN (14,15,17,64,85,91)
        AND d.SONKAYNAKEVRAKTIP = h.EVRAKTIP AND d.SONKAYNAKEVRAKNO = h.EVRAKNO
        AND d.SONKAYNAKHESAPKOD = h.HESAPKOD AND d.SONKAYNAKSIRANO = h.SIRANO
    )
), returns AS (
  SELECT h.*, CAST('return' AS varchar(16)) AS revenueSource, CAST(0 AS bit) AS isSale
  FROM STKHAR h
  WHERE h.SIRKETNO = @company AND YEAR(h.EVRAKTARIH) = @year
    AND h.EVRAKTIP = 18 AND h.KAYITDURUM = 1
), movements AS (
  SELECT * FROM finalSales UNION ALL SELECT * FROM provisionalSales UNION ALL SELECT * FROM returns
), resolved AS (
  SELECT
    m.*, k.MALAD, k.MARKAAD,
    originalSale.EVRAKTIP AS originalSaleType, originalSale.EVRAKNO AS originalSaleNo,
    originalSale.EVRAKTARIH AS originalSaleDate,
    bulkPurchase.purchaseId AS bulkId, bulkPurchase.purchaseType AS bulkType,
    bulkPurchase.purchaseNo AS bulkNo, bulkPurchase.purchaseDate AS bulkDate,
    bulkPurchase.netUnitCost AS bulkUnitCost, bulkPurchase.purchaseQuantity AS bulkQuantity,
    bulkPurchase.grossAmount AS bulkGrossAmount, bulkPurchase.discountAmount AS bulkDiscountAmount,
    bulkPurchase.netAmount AS bulkNetAmount, bulkPurchase.vatAmount AS bulkVatAmount,
    bulkPurchase.vatRate AS bulkVatRate, bulkPurchase.discountRate1 AS bulkDiscountRate1,
    bulkPurchase.discountRate2 AS bulkDiscountRate2, bulkPurchase.effectiveDiscountPct AS bulkEffectiveDiscountPct,
    bulkPurchase.accountCode AS bulkAccountCode,
    priorPurchase.purchaseId AS priorId, priorPurchase.purchaseType AS priorType,
    priorPurchase.purchaseNo AS priorNo, priorPurchase.purchaseDate AS priorDate,
    priorPurchase.netUnitCost AS priorUnitCost, priorPurchase.purchaseQuantity AS priorQuantity,
    priorPurchase.grossAmount AS priorGrossAmount, priorPurchase.discountAmount AS priorDiscountAmount,
    priorPurchase.netAmount AS priorNetAmount, priorPurchase.vatAmount AS priorVatAmount,
    priorPurchase.vatRate AS priorVatRate, priorPurchase.discountRate1 AS priorDiscountRate1,
    priorPurchase.discountRate2 AS priorDiscountRate2, priorPurchase.effectiveDiscountPct AS priorEffectiveDiscountPct,
    priorPurchase.accountCode AS priorAccountCode,
    nextPurchase.purchaseId AS nextId, nextPurchase.purchaseType AS nextType,
    nextPurchase.purchaseNo AS nextNo, nextPurchase.purchaseDate AS nextDate,
    nextPurchase.netUnitCost AS nextUnitCost, nextPurchase.purchaseQuantity AS nextQuantity,
    nextPurchase.grossAmount AS nextGrossAmount, nextPurchase.discountAmount AS nextDiscountAmount,
    nextPurchase.netAmount AS nextNetAmount, nextPurchase.vatAmount AS nextVatAmount,
    nextPurchase.vatRate AS nextVatRate, nextPurchase.discountRate1 AS nextDiscountRate1,
    nextPurchase.discountRate2 AS nextDiscountRate2, nextPurchase.effectiveDiscountPct AS nextEffectiveDiscountPct,
    nextPurchase.accountCode AS nextAccountCode,
    rejectedPriorReturn.purchaseId AS rejectedPriorId, rejectedPriorReturn.purchaseType AS rejectedPriorType,
    rejectedPriorReturn.purchaseNo AS rejectedPriorNo, rejectedPriorReturn.purchaseDate AS rejectedPriorDate,
    rejectedPriorReturn.accountCode AS rejectedPriorAccountCode, rejectedPriorReturn.partyName AS rejectedPriorPartyName,
    rejectedNextReturn.purchaseId AS rejectedNextId, rejectedNextReturn.purchaseType AS rejectedNextType,
    rejectedNextReturn.purchaseNo AS rejectedNextNo, rejectedNextReturn.purchaseDate AS rejectedNextDate,
    rejectedNextReturn.accountCode AS rejectedNextAccountCode, rejectedNextReturn.partyName AS rejectedNextPartyName
  FROM movements m
  LEFT JOIN STKKRT k ON k.SIRKETNO = m.SIRKETNO AND k.MALKOD = m.MALKOD
  OUTER APPLY (
    SELECT TOP (1) s.EVRAKTIP, s.EVRAKNO, s.EVRAKTARIH
    FROM STKHAR s
    WHERE m.isSale = 0 AND m.SONKAYNAKEVRAKTIP IN (17,85,91)
      AND s.SIRKETNO = m.SIRKETNO AND s.KAYITDURUM = 1
      AND s.EVRAKTIP = m.SONKAYNAKEVRAKTIP AND s.EVRAKNO = m.SONKAYNAKEVRAKNO
      AND s.HESAPKOD = m.SONKAYNAKHESAPKOD AND s.SIRANO = m.SONKAYNAKSIRANO
    ORDER BY s.ID DESC
  ) originalSale
  OUTER APPLY (
    SELECT TOP (1)
      p.ID purchaseId, p.EVRAKTIP purchaseType, p.EVRAKNO purchaseNo, p.EVRAKTARIH purchaseDate,
      (p.TUTAR-p.ISKONTO)/NULLIF(p.MIKTAR,0) netUnitCost,
      p.MIKTAR purchaseQuantity, p.TUTAR grossAmount, p.ISKONTO discountAmount,
      p.TUTAR-p.ISKONTO netAmount, p.KDV vatAmount, p.KDVORAN vatRate,
      p.KALEMISKONTOORAN1 discountRate1, p.KALEMISKONTOORAN2 discountRate2,
      CASE WHEN p.TUTAR<>0 THEN 100.0*p.ISKONTO/p.TUTAR ELSE 0 END effectiveDiscountPct,
      p.HESAPKOD accountCode
    FROM STKHAR p
    CROSS APPLY (
      SELECT COUNT_BIG(*) docLineCount
      FROM STKHAR px
      WHERE px.SIRKETNO = p.SIRKETNO AND px.KAYITDURUM = 1
        AND px.EVRAKTIP = p.EVRAKTIP AND px.EVRAKNO = p.EVRAKNO AND px.HESAPKOD = p.HESAPKOD
    ) purchaseDoc
    OUTER APPLY (
      SELECT SUM(o.MIKTAR) consumedQuantity
      FROM STKHAR o
      WHERE o.SIRKETNO = p.SIRKETNO AND o.KAYITDURUM = 1 AND o.MALKOD = p.MALKOD
        AND o.EVRAKTIP IN (17,85,91)
        AND o.EVRAKTARIH > p.EVRAKTARIH
        AND o.EVRAKTARIH < COALESCE(originalSale.EVRAKTARIH,m.EVRAKTARIH)
    ) consumption
    WHERE p.SIRKETNO=m.SIRKETNO AND p.KAYITDURUM=1 AND p.EVRAKTIP IN(9,609)
      AND p.MALKOD=m.MALKOD AND p.MIKTAR>0 AND p.TUTAR-p.ISKONTO>=0
      AND NOT EXISTS (SELECT 1 FROM @incomingReturnDocuments r WHERE r.EVRAKNO=p.EVRAKNO)
      AND p.EVRAKTARIH BETWEEN DATEADD(year,-1,COALESCE(originalSale.EVRAKTARIH,m.EVRAKTARIH))
        AND COALESCE(originalSale.EVRAKTARIH,m.EVRAKTARIH)
      AND purchaseDoc.docLineCount >= 10
      AND CASE WHEN p.TUTAR<>0 THEN 100.0*p.ISKONTO/p.TUTAR ELSE 0 END >= 15
      AND p.MIKTAR - ISNULL(consumption.consumedQuantity,0) >= m.MIKTAR
    ORDER BY p.EVRAKTARIH DESC,p.ID DESC
  ) bulkPurchase
  OUTER APPLY (
    SELECT TOP (1)
      p.ID purchaseId, p.EVRAKTIP purchaseType, p.EVRAKNO purchaseNo, p.EVRAKTARIH purchaseDate,
      (p.TUTAR-p.ISKONTO)/NULLIF(p.MIKTAR,0) netUnitCost,
      p.MIKTAR purchaseQuantity, p.TUTAR grossAmount, p.ISKONTO discountAmount,
      p.TUTAR-p.ISKONTO netAmount, p.KDV vatAmount, p.KDVORAN vatRate,
      p.KALEMISKONTOORAN1 discountRate1, p.KALEMISKONTOORAN2 discountRate2,
      CASE WHEN p.TUTAR<>0 THEN 100.0*p.ISKONTO/p.TUTAR ELSE 0 END effectiveDiscountPct,
      p.HESAPKOD accountCode
    FROM STKHAR p
    WHERE p.SIRKETNO=m.SIRKETNO AND p.KAYITDURUM=1 AND p.EVRAKTIP IN(9,609)
      AND p.MALKOD=m.MALKOD AND p.MIKTAR>0 AND p.TUTAR-p.ISKONTO>=0
      AND NOT EXISTS (SELECT 1 FROM @incomingReturnDocuments r WHERE r.EVRAKNO=p.EVRAKNO)
      AND p.EVRAKTARIH<=COALESCE(originalSale.EVRAKTARIH,m.EVRAKTARIH)
    ORDER BY p.EVRAKTARIH DESC,p.ID DESC
  ) priorPurchase
  OUTER APPLY (
    SELECT TOP (1)
      p.ID purchaseId, p.EVRAKTIP purchaseType, p.EVRAKNO purchaseNo, p.EVRAKTARIH purchaseDate,
      (p.TUTAR-p.ISKONTO)/NULLIF(p.MIKTAR,0) netUnitCost,
      p.MIKTAR purchaseQuantity, p.TUTAR grossAmount, p.ISKONTO discountAmount,
      p.TUTAR-p.ISKONTO netAmount, p.KDV vatAmount, p.KDVORAN vatRate,
      p.KALEMISKONTOORAN1 discountRate1, p.KALEMISKONTOORAN2 discountRate2,
      CASE WHEN p.TUTAR<>0 THEN 100.0*p.ISKONTO/p.TUTAR ELSE 0 END effectiveDiscountPct,
      p.HESAPKOD accountCode
    FROM STKHAR p
    WHERE p.SIRKETNO=m.SIRKETNO AND p.KAYITDURUM=1 AND p.EVRAKTIP IN(9,609)
      AND p.MALKOD=m.MALKOD AND p.MIKTAR>0 AND p.TUTAR-p.ISKONTO>=0
      AND NOT EXISTS (SELECT 1 FROM @incomingReturnDocuments r WHERE r.EVRAKNO=p.EVRAKNO)
      AND p.EVRAKTARIH>COALESCE(originalSale.EVRAKTARIH,m.EVRAKTARIH)
    ORDER BY p.EVRAKTARIH ASC,p.ID ASC
  ) nextPurchase
  OUTER APPLY (
    SELECT TOP (1) p.purchaseId, p.purchaseType, p.purchaseNo, p.purchaseDate, p.accountCode, p.partyName
    FROM @returnPurchaseRows p
    WHERE p.SIRKETNO=m.SIRKETNO AND p.MALKOD=m.MALKOD
      AND p.purchaseDate<=COALESCE(originalSale.EVRAKTARIH,m.EVRAKTARIH)
    ORDER BY p.purchaseDate DESC,p.purchaseId DESC
  ) rejectedPriorReturn
  OUTER APPLY (
    SELECT TOP (1) p.purchaseId, p.purchaseType, p.purchaseNo, p.purchaseDate, p.accountCode, p.partyName
    FROM @returnPurchaseRows p
    WHERE priorPurchase.purchaseId IS NULL AND p.SIRKETNO=m.SIRKETNO AND p.MALKOD=m.MALKOD
      AND p.purchaseDate>COALESCE(originalSale.EVRAKTARIH,m.EVRAKTARIH)
    ORDER BY p.purchaseDate ASC,p.purchaseId ASC
  ) rejectedNextReturn
), evidenced AS (
  SELECT *,
    CAST(CASE
      WHEN rejectedPriorId IS NOT NULL AND (
        priorId IS NULL OR rejectedPriorDate>priorDate OR (rejectedPriorDate=priorDate AND rejectedPriorId>priorId)
      ) THEN 1
      WHEN priorId IS NULL AND rejectedNextId IS NOT NULL AND (
        nextId IS NULL OR rejectedNextDate<nextDate OR (rejectedNextDate=nextDate AND rejectedNextId<nextId)
      ) THEN 1
      ELSE 0
    END AS bit) returnRisk,
    CASE
      WHEN rejectedPriorId IS NOT NULL AND (
        priorId IS NULL OR rejectedPriorDate>priorDate OR (rejectedPriorDate=priorDate AND rejectedPriorId>priorId)
      ) THEN rejectedPriorType
      WHEN priorId IS NULL AND rejectedNextId IS NOT NULL AND (
        nextId IS NULL OR rejectedNextDate<nextDate OR (rejectedNextDate=nextDate AND rejectedNextId<nextId)
      ) THEN rejectedNextType
      ELSE NULL
    END rejectedReturnType,
    CASE
      WHEN rejectedPriorId IS NOT NULL AND (
        priorId IS NULL OR rejectedPriorDate>priorDate OR (rejectedPriorDate=priorDate AND rejectedPriorId>priorId)
      ) THEN rejectedPriorNo
      WHEN priorId IS NULL AND rejectedNextId IS NOT NULL AND (
        nextId IS NULL OR rejectedNextDate<nextDate OR (rejectedNextDate=nextDate AND rejectedNextId<nextId)
      ) THEN rejectedNextNo
      ELSE NULL
    END rejectedReturnNo,
    CASE
      WHEN rejectedPriorId IS NOT NULL AND (
        priorId IS NULL OR rejectedPriorDate>priorDate OR (rejectedPriorDate=priorDate AND rejectedPriorId>priorId)
      ) THEN rejectedPriorDate
      WHEN priorId IS NULL AND rejectedNextId IS NOT NULL AND (
        nextId IS NULL OR rejectedNextDate<nextDate OR (rejectedNextDate=nextDate AND rejectedNextId<nextId)
      ) THEN rejectedNextDate
      ELSE NULL
    END rejectedReturnDate,
    CASE
      WHEN rejectedPriorId IS NOT NULL AND (
        priorId IS NULL OR rejectedPriorDate>priorDate OR (rejectedPriorDate=priorDate AND rejectedPriorId>priorId)
      ) THEN rejectedPriorAccountCode
      WHEN priorId IS NULL AND rejectedNextId IS NOT NULL AND (
        nextId IS NULL OR rejectedNextDate<nextDate OR (rejectedNextDate=nextDate AND rejectedNextId<nextId)
      ) THEN rejectedNextAccountCode
      ELSE NULL
    END rejectedReturnAccountCode,
    CASE
      WHEN rejectedPriorId IS NOT NULL AND (
        priorId IS NULL OR rejectedPriorDate>priorDate OR (rejectedPriorDate=priorDate AND rejectedPriorId>priorId)
      ) THEN rejectedPriorPartyName
      WHEN priorId IS NULL AND rejectedNextId IS NOT NULL AND (
        nextId IS NULL OR rejectedNextDate<nextDate OR (rejectedNextDate=nextDate AND rejectedNextId<nextId)
      ) THEN rejectedNextPartyName
      ELSE NULL
    END rejectedReturnPartyName
  FROM resolved
), classifiedBase AS (
  SELECT *,
    CASE
      WHEN MALKOD IN ('KOMİSYON','GD-0187','GD-0079','PDI') THEN 'excludedIncome'
      WHEN MALKOD='İŞÇİLİK' THEN 'configuredLabor'
      WHEN MALKOD IN ('SRF','BARNACLE') THEN 'configuredSrf'
      WHEN MALKOD='TSR' THEN 'configuredTsr'
      WHEN MALKOD='YOL' THEN 'configuredRoad'
      WHEN isSale=0 AND originalSaleDate IS NOT NULL AND COALESCE(bulkUnitCost,priorUnitCost) IS NOT NULL THEN 'originalSaleCost'
      WHEN bulkUnitCost IS NOT NULL THEN 'bulkPurchase'
      WHEN priorUnitCost IS NOT NULL THEN 'priorPurchase'
      WHEN nextUnitCost IS NOT NULL THEN 'nextPurchase'
      ELSE 'missingPurchase'
    END costMethod,
    CASE
      WHEN MALKOD IN ('KOMİSYON','GD-0187','GD-0079','PDI') THEN 'excluded'
      WHEN MALKOD IN ('İŞÇİLİK','SRF','BARNACLE','TSR','YOL') THEN 'configured'
      WHEN COALESCE(bulkUnitCost,priorUnitCost,nextUnitCost) IS NOT NULL THEN 'verified'
      ELSE 'review'
    END verificationStatus
  FROM evidenced
), classified AS (
  SELECT *,
    CAST(CASE WHEN COALESCE(bulkUnitCost,priorUnitCost,nextUnitCost) IS NOT NULL THEN 1 ELSE 0 END AS bit) purchaseDocumentFound,
    CAST(CASE WHEN verificationStatus='verified' THEN 1 ELSE 0 END AS bit) costValidated,
    CASE
      WHEN costMethod='excludedIncome' THEN 'Gelir kartı politika gereği kapsam dışında.'
      WHEN costMethod LIKE 'configured%' THEN 'Pilot kart maliyeti yönetim oranıyla hesaplanır.'
      WHEN returnRisk=1 AND COALESCE(bulkUnitCost,priorUnitCost,nextUnitCost) IS NOT NULL THEN 'Müşteri iadesi alım adaylarından çıkarıldı; gerçek alım faturası kullanıldı.'
      WHEN returnRisk=1 THEN 'Müşteri iadesi alım adaylarından çıkarıldı; gerçek alım faturası bulunamadı.'
      WHEN costMethod='originalSaleCost' THEN 'Satış iadesi, bağlı olduğu orijinal satış tarihindeki maliyeti devraldı.'
      WHEN costMethod='bulkPurchase' THEN 'Satıştan önceki 1 yıl içinde yüksek iskontolu toplu alımda kalan stok bulundu.'
      WHEN costMethod='priorPurchase' THEN 'Satış tarihinden önceki, iade kanıtı bulunmayan son aktif alım faturası.'
      WHEN costMethod='nextPurchase' THEN 'Önceki alım bulunamadığı için iade kanıtı bulunmayan sonraki ilk alım faturası.'
      ELSE 'Doğrulanabilir gerçek alım faturası bulunamadı.'
    END costValidationReason
  FROM classifiedBase
), filtered AS (
  SELECT * FROM classified
  WHERE (@month=0 OR MONTH(EVRAKTARIH)=@month)
    AND (@documentType=0 OR EVRAKTIP=@documentType)
    AND (@source='' OR revenueSource=@source)
    AND (@method='' OR costMethod=@method)
    AND (@verification='' OR verificationStatus=@verification)
    AND (@returnRisk=-1 OR returnRisk=@returnRisk)
    AND (@search='' OR EVRAKNO LIKE '%'+@search+'%' OR MALKOD LIKE '%'+@search+'%'
      OR ISNULL(MALAD,'') LIKE '%'+@search+'%' OR ISNULL(priorNo,'') LIKE '%'+@search+'%'
      OR ISNULL(nextNo,'') LIKE '%'+@search+'%' OR ISNULL(rejectedReturnNo,'') LIKE '%'+@search+'%')
), numbered AS (
  SELECT *,
    COUNT_BIG(*) OVER() totalRows,
    SUM(CASE WHEN verificationStatus='verified' THEN 1 ELSE 0 END) OVER() verifiedRows,
    SUM(CASE WHEN verificationStatus='configured' THEN 1 ELSE 0 END) OVER() configuredRows,
    SUM(CASE WHEN verificationStatus='review' THEN 1 ELSE 0 END) OVER() reviewRows,
    SUM(CASE WHEN verificationStatus='excluded' THEN 1 ELSE 0 END) OVER() excludedRows,
    SUM(CASE WHEN returnRisk=1 THEN 1 ELSE 0 END) OVER() returnRiskRows,
    SUM(CASE WHEN isSale=1 THEN TUTAR-ISKONTO ELSE -(TUTAR-ISKONTO) END) OVER() filteredNetAmount
  FROM filtered
)
SELECT ID id, EVRAKTIP documentType, EVRAKNO documentNo, EVRAKTARIH documentDate,
  revenueSource, isSale, HESAPKOD customerCode, MALKOD cardCode, MALAD cardName, MARKAAD brand, MIKTAR quantity,
  TUTAR grossAmount, ISKONTO discountAmount, TUTAR-ISKONTO netAmount,
  CASE WHEN TUTAR<>0 THEN 100.0*ISKONTO/TUTAR ELSE 0 END discountPct,
  KDV vatAmount, KDVORAN vatRate, TUTAR-ISKONTO+ISNULL(KDV,0) invoiceTotalInclVat,
  SONKAYNAKEVRAKTIP sourceDocumentType, SONKAYNAKEVRAKNO sourceDocumentNo,
  originalSaleType, originalSaleNo, originalSaleDate,
  costMethod, verificationStatus, purchaseDocumentFound, costValidated, returnRisk, costValidationReason,
  COALESCE(bulkType,priorType,nextType) purchaseType, COALESCE(bulkNo,priorNo,nextNo) purchaseNo,
  COALESCE(bulkDate,priorDate,nextDate) purchaseDate, COALESCE(bulkUnitCost,priorUnitCost,nextUnitCost) unitCost,
  COALESCE(bulkAccountCode,priorAccountCode,nextAccountCode) purchaseAccountCode,
  (SELECT TOP (1) c.UNVAN FROM CARKRT c WHERE c.SIRKETNO=numbered.SIRKETNO AND c.HESAPKOD=COALESCE(bulkAccountCode,priorAccountCode,nextAccountCode)) purchasePartyName,
  COALESCE(bulkQuantity,priorQuantity,nextQuantity) purchaseQuantity,
  COALESCE(bulkGrossAmount,priorGrossAmount,nextGrossAmount) purchaseGrossAmount,
  COALESCE(bulkDiscountAmount,priorDiscountAmount,nextDiscountAmount) purchaseDiscountAmount,
  COALESCE(bulkNetAmount,priorNetAmount,nextNetAmount) purchaseNetAmount,
  COALESCE(bulkVatAmount,priorVatAmount,nextVatAmount) purchaseVatAmount,
  COALESCE(bulkVatRate,priorVatRate,nextVatRate) purchaseVatRate,
  COALESCE(bulkDiscountRate1,priorDiscountRate1,nextDiscountRate1) purchaseDiscountRate1,
  COALESCE(bulkDiscountRate2,priorDiscountRate2,nextDiscountRate2) purchaseDiscountRate2,
  COALESCE(bulkEffectiveDiscountPct,priorEffectiveDiscountPct,nextEffectiveDiscountPct) purchaseEffectiveDiscountPct,
  rejectedReturnType, rejectedReturnNo, rejectedReturnDate, rejectedReturnAccountCode, rejectedReturnPartyName,
  CASE
    WHEN costMethod IN('bulkPurchase','priorPurchase','nextPurchase','originalSaleCost') THEN 'genuinePurchase'
    WHEN costMethod LIKE 'configured%' THEN 'configuredRate'
    WHEN costMethod='excludedIncome' THEN 'excluded'
    ELSE 'missing'
  END costEvidenceClass,
  CASE WHEN costMethod IN('bulkPurchase','priorPurchase','nextPurchase','originalSaleCost')
    THEN (CASE WHEN isSale=1 THEN 1 ELSE -1 END)*MIKTAR*COALESCE(bulkUnitCost,priorUnitCost,nextUnitCost)
    ELSE NULL END lineCost,
  totalRows,verifiedRows,configuredRows,reviewRows,excludedRows,returnRiskRows,filteredNetAmount
FROM numbered
ORDER BY EVRAKTARIH DESC, ID DESC
OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
OPTION (RECOMPILE);`;

function normalizeRows(rows, source) {
  return rows.map((row) => ({
    month: Number(row.month),
    monthName: monthNames[Number(row.month) - 1],
    sales: Number(row.sales || 0),
    returns: Number(row.returns || 0),
    discounts: Number(row.discounts || 0),
    estimatedCost: Number(row.estimatedCost || 0),
    lineCount: Number(row.lineCount || 0),
    costCoveredLines: Number(row.costCoveredLines || 0),
    costCoveragePct: row.lineCount
      ? Number(((Number(row.costCoveredLines) / Number(row.lineCount)) * 100).toFixed(1))
      : 0,
    masterCostLines: Number(row.masterCostLines || 0),
    bulkPurchaseCostLines: Number(row.bulkPurchaseCostLines || 0),
    lastPurchaseCostLines: Number(row.lastPurchaseCostLines || 0),
    nextPurchaseCostLines: Number(row.nextPurchaseCostLines || 0),
    uncoveredCostLines: Number(row.uncoveredCostLines || 0),
    uncoveredNetSales: Number(row.uncoveredNetSales || 0),
    pilotCardLines: Number(row.pilotCardLines || 0),
    pilotCards: {
      labor: { sales: Number(row.laborSales || 0), returns: Number(row.laborReturns || 0), discounts: Number(row.laborDiscounts || 0) },
      srf: { sales: Number(row.srfSales || 0), returns: Number(row.srfReturns || 0), discounts: Number(row.srfDiscounts || 0) },
      tsr: { sales: Number(row.tsrSales || 0), returns: Number(row.tsrReturns || 0), discounts: Number(row.tsrDiscounts || 0) },
    road: { sales: Number(row.roadSales || 0), returns: Number(row.roadReturns || 0), discounts: Number(row.roadDiscounts || 0) },
    },
    invoiceLineCount: Number(row.invoiceLineCount || 0),
    provisionalLineCount: Number(row.provisionalLineCount || 0),
    invoiceNetSales: Number(row.invoiceNetSales || 0),
    provisionalNetSales: Number(row.provisionalNetSales || 0),
    linkedReturnLines: Number(row.linkedReturnLines || 0),
    unlinkedReturnLines: Number(row.unlinkedReturnLines || 0),
    costMethod: "return-aware-purchase-fallback",
    source,
  }));
}

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

app.get("/api/overview", async (request, response) => {
  const year = Number(request.query.year || 2026);
  if (!Number.isInteger(year) || year < 2023 || year > 2030) {
    return response.status(400).json({ error: "Geçersiz yıl." });
  }

  try {
    const pool = await getPool();
    if (!pool) return response.json({ year, rows: demoRows, mode: "demo" });

    const result = await pool.request()
      .input("company", sql.VarChar(3), process.env.CPM_SQL_COMPANY || "01")
      .input("year", sql.Int, year)
      .query(overviewSql);

    return response.json({ year, rows: normalizeRows(result.recordset, "live"), mode: "live" });
  } catch {
    return response.json({ year, rows: demoRows, mode: "demo", warning: "CPM bağlantısı kullanılamadı." });
  }
});

app.get("/api/audit-samples", async (request, response) => {
  const year = Number(request.query.year || 2026);
  if (!Number.isInteger(year) || year < 2023 || year > 2030) {
    return response.status(400).json({ error: "Geçersiz yıl." });
  }

  try {
    const pool = await getPool();
    if (!pool) return response.json({ year, rows: [], mode: "demo" });
    const result = await pool.request()
      .input("company", sql.VarChar(3), process.env.CPM_SQL_COMPANY || "01")
      .input("year", sql.Int, year)
      .query(auditSamplesSql);
    return response.json({ year, rows: result.recordset, mode: "live", readOnly: true });
  } catch {
    return response.status(500).json({ year, rows: [], mode: "error", error: "Kanıt örnekleri okunamadı." });
  }
});

app.get("/api/audit-ledger", async (request, response) => {
  const year = Number(request.query.year || 2026);
  const page = Math.max(1, Number(request.query.page || 1));
  const pageSize = request.query.export === "1"
    ? 50000
    : Math.min(100, Math.max(10, Number(request.query.pageSize || 50)));
  const month = Math.min(12, Math.max(0, Number(request.query.month || 0)));
  const documentType = Number(request.query.documentType || 0);
  const source = ["invoice","provisional","return"].includes(request.query.source) ? request.query.source : "";
  const allowedMethods = ["bulkPurchase","priorPurchase","nextPurchase","originalSaleCost","configuredLabor","configuredSrf","configuredTsr","configuredRoad","missingPurchase","excludedIncome"];
  const method = allowedMethods.includes(request.query.method) ? request.query.method : "";
  const verification = ["verified","configured","review","excluded"].includes(request.query.verification) ? request.query.verification : "";
  const returnRisk = request.query.returnRisk === "1" ? 1 : request.query.returnRisk === "0" ? 0 : -1;
  const search = String(request.query.search || "").trim().slice(0, 80);
  if (!Number.isInteger(year) || year < 2023 || year > 2030) return response.status(400).json({ error: "Geçersiz yıl." });

  try {
    const pool = await getPool();
    if (!pool) return response.json({ year, page, pageSize, rows: [], summary: { totalRows: 0 }, mode: "demo" });
    const result = await pool.request()
      .input("company", sql.VarChar(3), process.env.CPM_SQL_COMPANY || "01")
      .input("year", sql.Int, year)
      .input("month", sql.Int, month)
      .input("documentType", sql.Int, documentType)
      .input("source", sql.VarChar(16), source)
      .input("method", sql.VarChar(24), method)
      .input("verification", sql.VarChar(16), verification)
      .input("returnRisk", sql.Int, returnRisk)
      .input("search", sql.NVarChar(80), search)
      .input("offset", sql.Int, (page - 1) * pageSize)
      .input("pageSize", sql.Int, pageSize)
      .query(auditLedgerSql);
    const rows = result.recordset;
    const first = rows[0] || {};
    return response.json({
      year, page, pageSize, mode: "live", readOnly: true,
      summary: {
        totalRows: Number(first.totalRows || 0), verifiedRows: Number(first.verifiedRows || 0),
        configuredRows: Number(first.configuredRows || 0), reviewRows: Number(first.reviewRows || 0),
        excludedRows: Number(first.excludedRows || 0), returnRiskRows: Number(first.returnRiskRows || 0),
        filteredNetAmount: Number(first.filteredNetAmount || 0),
      },
      rows: rows.map(({ totalRows, verifiedRows, configuredRows, reviewRows, excludedRows, returnRiskRows, filteredNetAmount, ...row }) => row),
    });
  } catch {
    return response.status(500).json({ year, page, pageSize, rows: [], summary: { totalRows: 0 }, mode: "error", error: "Denetim defteri okunamadı." });
  }
});

app.get("/api/department-analysis", async (request, response) => {
  const year = Number(request.query.year || 2026);
  const forceRefresh = request.query.refresh === "1";
  if (!Number.isInteger(year) || year < 2023 || year > 2030) {
    return response.status(400).json({ error: "Geçersiz yıl." });
  }

  try {
    const source = await getDepartmentAnalysisSource(year, forceRefresh);
    const state = await getStoredAppState();
    const analysis = buildDepartmentAnalysis({
      ...(source || {}),
      year,
      pilotCardCostRates: state.settings?.pilotCardCostRates || {},
      costOverrides: Array.isArray(state.costOverrides) ? state.costOverrides : [],
      requireApproval: state.settings?.requireManagementApprovalForManualCost !== false,
    });
    response.setHeader("Cache-Control", "no-store");
    return response.json({
      ...analysis,
      mode: source ? "live" : "unavailable",
      readOnly: true,
      generatedAt: new Date().toISOString(),
      source: "CPM salt okunur + Nexus yönetilen kurallar",
      warning: source ? null : "Gerçek CPM bağlantısı yapılandırılmadığı için departman rakamları üretilemedi.",
    });
  } catch (error) {
    console.error("Marlin Nexus department analysis read failed:", error.message);
    return response.status(500).json({
      year, departments: [], months: [], detailRows: [], pilotOrders: [],
      mode: "error", readOnly: true,
      error: "Departman analizi CPM'den okunamadı.",
    });
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
});
