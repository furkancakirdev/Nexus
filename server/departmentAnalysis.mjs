import { resolveCommercialOwnership } from "./ownershipResolver.mjs";
import {
  EXCLUDED_TEST_DOCUMENT_NUMBERS,
  excludedTestAudit,
  isExcludedTestDocument,
} from "./testDocumentRegistry.mjs";

const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

export const TEST_DOCUMENTS = new Set(EXCLUDED_TEST_DOCUMENT_NUMBERS);

export const departmentAnalysisSql = `
SET NOCOUNT ON;

DECLARE @windowStart date = DATEFROMPARTS(@year - 1, 1, 1);
DECLARE @windowEnd date = DATEFROMPARTS(@year + 1, 1, 1);

WITH incomingReturnDocuments AS (
  SELECT DISTINCT e.EVRAKNO
  FROM EFAGLN e
  WHERE e.EVRAKNO IS NOT NULL
    AND (
      CONCAT(ISNULL(e.NOT1,''),' ',ISNULL(e.NOT2,''),' ',ISNULL(e.NOT3,'')) COLLATE Turkish_CI_AI LIKE N'%iade%'
      OR CONCAT(ISNULL(e.NOT1,''),' ',ISNULL(e.NOT2,''),' ',ISNULL(e.NOT3,'')) COLLATE Turkish_CI_AI LIKE N'%return%'
    )
), finalSales AS (
  SELECT h.*, CAST('invoice' AS varchar(16)) AS revenueSource, CAST(1 AS bit) AS isSale
  FROM STKHAR h
  WHERE h.SIRKETNO = @company AND YEAR(h.EVRAKTARIH) = @year
    AND h.EVRAKTIP IN (17,85,91) AND h.KAYITDURUM = 1
    AND h.MALKOD NOT IN ('KOMİSYON','GD-0187','GD-0079','PDI')
), provisionalSales AS (
  SELECT h.*, CAST('provisional' AS varchar(16)) AS revenueSource, CAST(1 AS bit) AS isSale
  FROM STKHAR h
  WHERE h.SIRKETNO = @company AND YEAR(h.EVRAKTARIH) = @year
    AND h.EVRAKTIP IN (13,14,15,64) AND h.KAYITDURUM = 1 AND h.EVRAKDURUM = 1
    AND h.MIKTAR <> 0 AND ISNULL(h.KULLANILANMIKTAR,0) >= h.MIKTAR
    AND h.MALKOD NOT IN ('KOMİSYON','GD-0187','GD-0079','PDI')
    AND NOT EXISTS (
      SELECT 1 FROM STKHAR d
      WHERE d.SIRKETNO = h.SIRKETNO AND d.KAYITDURUM = 1
        AND d.EVRAKTIP IN (14,15,17,64,85,91)
        AND d.SONKAYNAKEVRAKTIP = h.EVRAKTIP AND d.SONKAYNAKEVRAKNO = h.EVRAKNO
        AND d.SONKAYNAKHESAPKOD = h.HESAPKOD AND d.SONKAYNAKSIRANO = h.SIRANO
    )
), salesReturns AS (
  SELECT h.*, CAST('return' AS varchar(16)) AS revenueSource, CAST(0 AS bit) AS isSale
  FROM STKHAR h
  WHERE h.SIRKETNO = @company AND YEAR(h.EVRAKTARIH) = @year
    AND h.EVRAKTIP = 18 AND h.KAYITDURUM = 1
    AND h.MALKOD NOT IN ('KOMİSYON','GD-0187','GD-0079','PDI')
), movements AS (
  SELECT * FROM finalSales UNION ALL SELECT * FROM provisionalSales UNION ALL SELECT * FROM salesReturns
)
SELECT
  m.ID rootId, m.EVRAKTIP documentType, m.EVRAKNO documentNo, m.EVRAKTARIH documentDate,
  m.HESAPKOD customerCode, c.UNVAN customerName, m.SIRANO [lineNo],
  m.MALKOD productCode, k.MALAD productName, k.MARKAAD brandName,
  m.MIKTAR quantity, m.TUTAR grossAmount, m.ISKONTO discountAmount,
  m.TUTAR - m.ISKONTO netAmount, m.isSale, m.revenueSource,
  m.DEPOKOD depotCode, m.MASRAFKOD departmentCode,
  ownerHint.actor candidateAttributionActor, ownerHint.fieldName candidateAttributionField,
  ownerHint.documentType candidateAttributionDocumentType, ownerHint.documentNo candidateAttributionDocumentNo,
  ownerHint.documentDate candidateAttributionDocumentDate,
  CASE WHEN m.isSale = 1 THEN m.TUTAR ELSE 0 END [grossSales],
  CASE WHEN m.isSale = 0 THEN m.TUTAR - m.ISKONTO ELSE 0 END [returns],
  CASE WHEN m.isSale = 1 THEN m.ISKONTO ELSE 0 END [discounts],
  CASE WHEN m.isSale = 1 THEN m.TUTAR - m.ISKONTO ELSE -(m.TUTAR - m.ISKONTO) END [signedNetSales],
  CASE
    WHEN m.MALKOD IN ('İŞÇİLİK','SRF','TSR','YOL','BARNACLE') THEN NULL
    WHEN m.isSale = 1 THEN m.MIKTAR * COALESCE(bulkPurchase.netUnitCost, priorPurchase.netUnitCost, nextPurchase.netUnitCost)
    ELSE -m.MIKTAR * COALESCE(bulkPurchase.netUnitCost, priorPurchase.netUnitCost, nextPurchase.netUnitCost)
  END [resolvedCost],
  CASE
    WHEN m.MALKOD = 'İŞÇİLİK' THEN 'configuredLabor'
    WHEN m.MALKOD IN ('SRF','BARNACLE') THEN 'configuredSrf'
    WHEN m.MALKOD = 'TSR' THEN 'configuredTsr'
    WHEN m.MALKOD = 'YOL' THEN 'configuredRoad'
    WHEN bulkPurchase.netUnitCost IS NOT NULL THEN 'bulkPurchase'
    WHEN priorPurchase.netUnitCost IS NOT NULL THEN 'priorPurchase'
    WHEN nextPurchase.netUnitCost IS NOT NULL THEN 'nextPurchase'
    ELSE 'missingPurchase'
  END [costMethod],
  CAST(CASE WHEN m.EVRAKTIP = 91 AND EXISTS (
    SELECT 1 FROM STKHAR d
    WHERE d.SIRKETNO = m.SIRKETNO AND d.KAYITDURUM = 1 AND d.EVRAKTIP = 85
      AND d.SONKAYNAKEVRAKTIP = 91 AND d.SONKAYNAKEVRAKNO = m.EVRAKNO
      AND d.SONKAYNAKHESAPKOD = m.HESAPKOD AND d.SONKAYNAKSIRANO = m.SIRANO
  ) THEN 1 ELSE 0 END AS bit) [prepaidBatchRisk]
INTO #economics
FROM movements m
LEFT JOIN STKKRT k ON k.SIRKETNO = m.SIRKETNO AND k.MALKOD = m.MALKOD
LEFT JOIN CARKRT c ON c.SIRKETNO = m.SIRKETNO AND c.HESAPKOD = m.HESAPKOD
OUTER APPLY (
  SELECT TOP (1) original.EVRAKTARIH
  FROM STKHAR original
  WHERE m.isSale = 0 AND m.SONKAYNAKEVRAKTIP IN (17,85,91)
    AND original.SIRKETNO = m.SIRKETNO AND original.KAYITDURUM = 1
    AND original.EVRAKTIP = m.SONKAYNAKEVRAKTIP AND original.EVRAKNO = m.SONKAYNAKEVRAKNO
    AND original.HESAPKOD = m.SONKAYNAKHESAPKOD AND original.SIRANO = m.SONKAYNAKSIRANO
  ORDER BY original.ID DESC
) originalSale
OUTER APPLY (
  SELECT TOP (1) candidate.actor, candidate.fieldName, h2.EVRAKTIP documentType,
    h2.EVRAKNO documentNo, h2.EVRAKTARIH documentDate
  FROM STKHAR h2
  JOIN EVRBAS b2 ON b2.SIRKETNO = h2.SIRKETNO AND b2.EVRAKTIP = h2.EVRAKTIP
    AND b2.EVRAKNO = h2.EVRAKNO AND b2.HESAPKOD = h2.HESAPKOD
  CROSS APPLY (
    SELECT TOP (1) v.fieldName, v.actor
    FROM (VALUES
      ('SATICINO', b2.SATICINO),
      ('EVRAKHAZIRLAYAN', b2.EVRAKHAZIRLAYAN),
      ('GIRENKULLANICI', b2.GIRENKULLANICI),
      ('DEGISTIRENKULLANICI', b2.DEGISTIRENKULLANICI)
    ) v(fieldName, actor)
    WHERE NULLIF(LTRIM(RTRIM(v.actor)),'') IS NOT NULL
      AND v.actor NOT LIKE '%[0-9]%'
      AND v.actor COLLATE Turkish_CI_AI NOT IN ('BIRCAN','SYSTEM','ADMIN','SA')
    ORDER BY CASE v.fieldName WHEN 'SATICINO' THEN 0 WHEN 'EVRAKHAZIRLAYAN' THEN 1
      WHEN 'GIRENKULLANICI' THEN 2 ELSE 3 END
  ) candidate
  WHERE h2.SIRKETNO = m.SIRKETNO AND h2.KAYITDURUM = 1 AND h2.ID <> m.ID
    AND h2.HESAPKOD = m.HESAPKOD AND h2.MALKOD = m.MALKOD
    AND h2.EVRAKTIP IN (13,14,15,64,17,85,91)
    AND h2.EVRAKTARIH BETWEEN DATEADD(day,-180,m.EVRAKTARIH) AND DATEADD(day,14,m.EVRAKTARIH)
  ORDER BY CASE WHEN h2.EVRAKTIP IN (13,14,15,64) THEN 0 ELSE 1 END,
    CASE WHEN h2.EVRAKTARIH <= m.EVRAKTARIH THEN 0 ELSE 1 END,
    ABS(DATEDIFF(day,h2.EVRAKTARIH,m.EVRAKTARIH)), h2.ID DESC
) ownerHint
OUTER APPLY (
  SELECT TOP (1) (p.TUTAR - p.ISKONTO) / NULLIF(p.MIKTAR,0) netUnitCost
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
      AND o.EVRAKTARIH < COALESCE(originalSale.EVRAKTARIH, m.EVRAKTARIH)
  ) consumption
  WHERE p.SIRKETNO = m.SIRKETNO AND p.MALKOD = m.MALKOD
    AND p.EVRAKTIP IN (9,609) AND p.KAYITDURUM = 1 AND p.MIKTAR > 0
    AND p.TUTAR - p.ISKONTO >= 0
    AND NOT EXISTS (SELECT 1 FROM incomingReturnDocuments r WHERE r.EVRAKNO = p.EVRAKNO)
    AND p.EVRAKTARIH BETWEEN DATEADD(year,-1,COALESCE(originalSale.EVRAKTARIH, m.EVRAKTARIH))
      AND COALESCE(originalSale.EVRAKTARIH, m.EVRAKTARIH)
    AND purchaseDoc.docLineCount >= 10
    AND CASE WHEN p.TUTAR <> 0 THEN 100.0 * p.ISKONTO / p.TUTAR ELSE 0 END >= 15
    AND p.MIKTAR - ISNULL(consumption.consumedQuantity,0) >= m.MIKTAR
  ORDER BY p.EVRAKTARIH DESC, p.ID DESC
) bulkPurchase
OUTER APPLY (
  SELECT TOP (1) (p.TUTAR - p.ISKONTO) / NULLIF(p.MIKTAR,0) netUnitCost
  FROM STKHAR p
  WHERE p.SIRKETNO = m.SIRKETNO AND p.MALKOD = m.MALKOD
    AND p.EVRAKTIP IN (9,609) AND p.KAYITDURUM = 1 AND p.MIKTAR > 0
    AND p.TUTAR - p.ISKONTO >= 0
    AND NOT EXISTS (SELECT 1 FROM incomingReturnDocuments r WHERE r.EVRAKNO = p.EVRAKNO)
    AND p.EVRAKTARIH <= COALESCE(originalSale.EVRAKTARIH, m.EVRAKTARIH)
  ORDER BY p.EVRAKTARIH DESC, p.ID DESC
) priorPurchase
OUTER APPLY (
  SELECT TOP (1) (p.TUTAR - p.ISKONTO) / NULLIF(p.MIKTAR,0) netUnitCost
  FROM STKHAR p
  WHERE p.SIRKETNO = m.SIRKETNO AND p.MALKOD = m.MALKOD
    AND p.EVRAKTIP IN (9,609) AND p.KAYITDURUM = 1 AND p.MIKTAR > 0
    AND p.TUTAR - p.ISKONTO >= 0
    AND NOT EXISTS (SELECT 1 FROM incomingReturnDocuments r WHERE r.EVRAKNO = p.EVRAKNO)
    AND p.EVRAKTARIH > COALESCE(originalSale.EVRAKTARIH, m.EVRAKTARIH)
  ORDER BY p.EVRAKTARIH ASC, p.ID ASC
) nextPurchase;

CREATE UNIQUE CLUSTERED INDEX IX_nexus_department_economics ON #economics(rootId);

SELECT * FROM #economics ORDER BY documentDate, rootId;

;WITH lineage AS (
  SELECT e.rootId, h.ID ancestorId, h.EVRAKTIP documentType, h.EVRAKNO documentNo,
    h.HESAPKOD customerCode, h.SIRANO [lineNo], h.EVRAKTARIH documentDate,
    h.MASRAFKOD departmentCode, h.DEPOKOD depotCode,
    h.SONKAYNAKEVRAKTIP sourceDocumentType, h.SONKAYNAKEVRAKNO sourceDocumentNo,
    h.SONKAYNAKHESAPKOD sourceCustomerCode, h.SONKAYNAKSIRANO sourceLineNo,
    0 [depth], CAST('|' + CAST(h.ID AS varchar(24)) + '|' AS varchar(900)) visited
  FROM #economics e
  JOIN STKHAR h ON h.ID = e.rootId
  UNION ALL
  SELECT l.rootId, s.ID, s.EVRAKTIP, s.EVRAKNO, s.HESAPKOD, s.SIRANO, s.EVRAKTARIH,
    s.MASRAFKOD, s.DEPOKOD, s.SONKAYNAKEVRAKTIP, s.SONKAYNAKEVRAKNO,
    s.SONKAYNAKHESAPKOD, s.SONKAYNAKSIRANO, l.[depth] + 1,
    CAST(l.visited + CAST(s.ID AS varchar(24)) + '|' AS varchar(900))
  FROM lineage l
  JOIN STKHAR s ON s.SIRKETNO = @company AND s.KAYITDURUM = 1
    AND s.EVRAKTIP = l.sourceDocumentType AND s.EVRAKNO = l.sourceDocumentNo
    AND s.HESAPKOD = COALESCE(NULLIF(l.sourceCustomerCode,''), l.customerCode)
    AND s.SIRANO = l.sourceLineNo
  WHERE l.[depth] < 8 AND CHARINDEX('|' + CAST(s.ID AS varchar(24)) + '|', l.visited) = 0
)
SELECT l.rootId, l.ancestorId, l.documentType, l.documentNo, l.customerCode, l.[lineNo],
  l.documentDate, l.departmentCode, l.depotCode, l.[depth],
  b.SATICINO commercialOwner, b.EVRAKHAZIRLAYAN preparerUser,
  b.GIRENKULLANICI entryUser, b.DEGISTIRENKULLANICI modifierUser
FROM lineage l
OUTER APPLY (
  SELECT TOP (1) b.SATICINO, b.EVRAKHAZIRLAYAN, b.GIRENKULLANICI, b.DEGISTIRENKULLANICI
  FROM EVRBAS b
  WHERE b.SIRKETNO = @company AND b.EVRAKTIP = l.documentType
    AND b.EVRAKNO = l.documentNo AND b.HESAPKOD = l.customerCode
  ORDER BY b.KAYITDURUM DESC, b.ID DESC
) b
ORDER BY l.rootId, l.[depth] DESC
OPTION (MAXRECURSION 100);

SELECT TOP (100)
  b.EVRAKTIP documentType, b.EVRAKNO documentNo, b.HESAPKOD customerCode,
  b.EVRAKTARIH documentDate, b.SATICINO commercialOwner,
  b.EVRAKHAZIRLAYAN preparerUser, b.GIRENKULLANICI entryUser,
  COUNT_BIG(*) lineCount,
  MAX(NULLIF(LTRIM(RTRIM(h.MASRAFKOD)),'')) departmentCode,
  MAX(NULLIF(LTRIM(RTRIM(h.DEPOKOD)),'')) depotCode,
  CAST(1 AS bit) active,
  CAST(CASE WHEN b.EVRAKNO = 'SSP-00979' THEN 1 ELSE 0 END AS bit) isTest
FROM EVRBAS b
JOIN STKHAR h ON h.SIRKETNO = b.SIRKETNO AND h.EVRAKTIP = b.EVRAKTIP
  AND h.EVRAKNO = b.EVRAKNO AND h.HESAPKOD = b.HESAPKOD AND h.KAYITDURUM = 1
WHERE b.SIRKETNO = @company AND b.KAYITDURUM = 1
  AND b.EVRAKTIP = 14 AND YEAR(b.EVRAKTARIH) = @year
  AND (NULLIF(LTRIM(RTRIM(b.SATICINO)),'') IS NOT NULL OR NULLIF(LTRIM(RTRIM(h.MASRAFKOD)),'') IS NOT NULL)
GROUP BY b.EVRAKTIP, b.EVRAKNO, b.HESAPKOD, b.EVRAKTARIH, b.SATICINO,
  b.EVRAKHAZIRLAYAN, b.GIRENKULLANICI
ORDER BY b.EVRAKTARIH DESC, b.EVRAKNO DESC;

DROP TABLE #economics;
`;

const DEPARTMENT_META = {
  service: { id: "service", name: "Servis", center: "Yatmarin", color: "#087f8c" },
  parts: { id: "parts", name: "Yedek Parça Satış", center: "Merkez Ofis", color: "#0a3972" },
  review: { id: "review", name: "İnceleme Gerekli", center: "—", color: "#d9730d" },
};

function number(value) {
  return Number(value || 0);
}

function key(value) {
  return String(value || "")
    .trim()
    .toLocaleUpperCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

function normalizeDepot(value) {
  const normalized = key(value);
  if (!normalized) return { code: "—", name: "Belirsiz" };
  if (normalized === "MRK" || normalized.includes("MERKEZ")) return { code: "MRK", name: "Merkez Depo" };
  if (normalized === "YTM" || normalized.includes("YATMARIN")) return { code: "YTM", name: "Yatmarin Depo" };
  return { code: String(value).trim(), name: String(value).trim() };
}

function resolveAttribution(economic, evidenceRows, actorEvents, identities) {
  const resolved = resolveCommercialOwnership({
    economic,
    lineage: evidenceRows,
    actorEvents,
    identities,
  });
  const sourceOrder = resolved.evidenceDocuments.find((row) => (
    number(row.documentType) === 14 && row.documentNo === resolved.sourceOrderNo
  ));
  const hasTestAncestor = resolved.evidenceDocuments.some((row) => (
    isExcludedTestDocument(row)
  ));
  const batchRisk = Boolean(economic.prepaidBatchRisk)
    || resolved.evidenceDocuments.some((row) => (
      number(row.documentType) === 91 && number(economic.documentType) === 85
    ));

  return {
    department: resolved.department,
    departmentName: DEPARTMENT_META[resolved.department].name,
    ownerCode: resolved.ownerCode,
    ownerName: resolved.ownerName,
    ownerActive: resolved.ownerActive,
    ownerLocation: resolved.ownerLocation,
    method: resolved.method,
    status: resolved.confidence,
    confidence: resolved.confidence,
    explicitDepartment: resolved.method === "macro-source-order",
    explicitOwner: ["macro-source-order", "supported-source-seller"].includes(resolved.method),
    sourceOrderNo: resolved.sourceOrderNo,
    sourceOrderDepth: sourceOrder ? number(sourceOrder.depth) : null,
    candidateDocumentNo: economic.candidateAttributionDocumentNo || null,
    candidateDocumentType: economic.candidateAttributionDocumentType || null,
    candidateField: economic.candidateAttributionField || null,
    fulfillmentDepot: {
      code: resolved.fulfillmentDepotCode || "—",
      name: resolved.fulfillmentDepotName,
    },
    crossDepot: resolved.crossDepot,
    hasTestAncestor,
    batchRisk,
    evidenceDocuments: resolved.evidenceDocuments,
    actorEvents: resolved.actorEvents,
    ownershipEvidence: resolved.evidence,
  };
}

function emptyMetrics(id, name) {
  return {
    id, name, grossSales: 0, returns: 0, discounts: 0, netSales: 0,
    cost: 0, uncoveredNetSales: 0, profit: 0, margin: 0,
    lineCount: 0, coveredLines: 0, documentCount: 0, customerCount: 0,
    crossDepotSales: 0, crossDepotDocuments: 0, confirmedSales: 0,
    inferredSales: 0, reviewSales: 0, costCoveragePct: 0,
    documents: new Set(), customers: new Set(), crossDepotDocumentKeys: new Set(),
  };
}

function addMetric(target, row) {
  target.grossSales += row.grossSales;
  target.returns += row.returns;
  target.discounts += row.discounts;
  target.netSales += row.netSales;
  target.cost += row.cost;
  target.uncoveredNetSales += row.uncoveredNetSales;
  target.lineCount += 1;
  target.coveredLines += row.costCovered ? 1 : 0;
  target.documents.add(row.documentKey);
  if (row.customerCode) target.customers.add(row.customerCode);
  if (row.crossDepot) {
    target.crossDepotSales += row.netSales;
    target.crossDepotDocumentKeys.add(row.documentKey);
  }
  if (row.attributionStatus === "confirmed") target.confirmedSales += row.netSales;
  else if (row.attributionStatus === "inferred") target.inferredSales += row.netSales;
  else target.reviewSales += row.netSales;
}

function finalizeMetric(metric) {
  const profit = metric.netSales - metric.cost - metric.uncoveredNetSales;
  return {
    ...metric,
    documentCount: metric.documents.size,
    customerCount: metric.customers.size,
    crossDepotDocuments: metric.crossDepotDocumentKeys.size,
    profit,
    margin: metric.netSales ? profit / metric.netSales * 100 : 0,
    costCoveragePct: metric.lineCount ? metric.coveredLines / metric.lineCount * 100 : 0,
    documents: undefined,
    customers: undefined,
    crossDepotDocumentKeys: undefined,
  };
}

function configuredRate(productCode, rates) {
  const code = key(productCode);
  if (code === key("İŞÇİLİK")) return number(rates.labor ?? 0) / 100;
  if (code === "SRF" || code === "BARNACLE") return number(rates.srf ?? 100) / 100;
  if (code === "TSR") return number(rates.tsr ?? 100) / 100;
  if (code === "YOL") return number(rates.road ?? 100) / 100;
  return null;
}

function topGroups(rows, selector, limit = 8) {
  const grouped = new Map();
  for (const row of rows) {
    const selected = selector(row);
    if (!selected?.id) continue;
    const item = grouped.get(selected.id) || { ...selected, netSales: 0, profit: 0, documentKeys: new Set(), crossDepotSales: 0 };
    item.netSales += row.netSales;
    item.profit += row.profit;
    item.crossDepotSales += row.crossDepot ? row.netSales : 0;
    item.documentKeys.add(row.documentKey);
    grouped.set(selected.id, item);
  }
  return [...grouped.values()]
    .map((item) => ({ ...item, documentCount: item.documentKeys.size, documentKeys: undefined }))
    .sort((a, b) => b.netSales - a.netSales)
    .slice(0, limit);
}

export function buildDepartmentAnalysis({
  economics = [], lineage = [], actorEvents = [], pilotOrders = [], identities = {}, year,
  pilotCardCostRates = {}, costOverrides = [], requireApproval = true,
}) {
  const lineageByRoot = new Map();
  for (const row of lineage) {
    const rootId = String(row.rootId);
    if (!lineageByRoot.has(rootId)) lineageByRoot.set(rootId, []);
    lineageByRoot.get(rootId).push(row);
  }
  const overrides = new Map(costOverrides
    .filter((item) => !requireApproval || item.status === "approved")
    .map((item) => [String(item.rowId), item]));
  let excludedTestLines = 0;
  const excludedTestRows = [];
  const normalized = [];

  for (const economic of economics) {
    const rootId = String(economic.rootId);
    const evidenceRows = lineageByRoot.get(rootId) || [];
    const exclusionAudit = excludedTestAudit(economic, evidenceRows);
    if (exclusionAudit) {
      excludedTestLines += 1;
      excludedTestRows.push(exclusionAudit);
      continue;
    }
    const attribution = resolveAttribution(
      economic,
      evidenceRows,
      actorEvents,
      identities,
    );
    const netSales = number(economic.signedNetSales);
    const override = overrides.get(rootId);
    const rate = configuredRate(economic.productCode, pilotCardCostRates);
    const cost = override
      ? number(economic.quantity) * number(override.unitCost) * (economic.isSale ? 1 : -1)
      : rate == null
        ? number(economic.resolvedCost)
        : netSales * rate;
    const costCovered = Boolean(override || rate != null || economic.resolvedCost != null);
    const uncoveredNetSales = costCovered ? 0 : netSales;
    const documentKey = `${economic.documentType}|${economic.documentNo}|${economic.customerCode}`;
    normalized.push({
      id: rootId,
      documentKey,
      documentType: number(economic.documentType),
      documentNo: economic.documentNo,
      documentDate: economic.documentDate,
      month: new Date(economic.documentDate).getMonth() + 1,
      customerCode: economic.customerCode,
      customerName: economic.customerName || economic.customerCode || "Belirsiz",
      productCode: economic.productCode,
      productName: economic.productName || economic.productCode || "Belirsiz",
      brandName: economic.brandName || "—",
      quantity: number(economic.quantity),
      grossSales: number(economic.grossSales),
      returns: number(economic.returns),
      discounts: number(economic.discounts),
      netSales,
      cost,
      uncoveredNetSales,
      profit: netSales - cost - uncoveredNetSales,
      costCovered,
      costMethod: override ? "manualDecision" : economic.costMethod,
      revenueSource: economic.revenueSource,
      department: attribution.department,
      departmentName: attribution.departmentName,
      commercialOwner: attribution.ownerCode,
      commercialOwnerName: attribution.ownerName,
      ownerActive: attribution.ownerActive,
      ownerLocation: attribution.ownerLocation,
      attributionMethod: attribution.method,
      attributionStatus: attribution.status,
      attributionConfidence: attribution.confidence,
      explicitDepartment: attribution.explicitDepartment,
      explicitOwner: attribution.explicitOwner,
      sourceOrderNo: attribution.sourceOrderNo,
      sourceOrderDepth: attribution.sourceOrderDepth,
      candidateDocumentNo: attribution.candidateDocumentNo,
      candidateDocumentType: attribution.candidateDocumentType,
      candidateField: attribution.candidateField,
      fulfillmentDepotCode: attribution.fulfillmentDepot.code,
      fulfillmentDepotName: attribution.fulfillmentDepot.name,
      crossDepot: attribution.crossDepot,
      batchRisk: attribution.batchRisk,
      evidenceDocuments: attribution.evidenceDocuments,
      actorEvents: attribution.actorEvents,
      ownershipEvidence: attribution.ownershipEvidence,
    });
  }

  const departmentMetrics = new Map([
    ["service", emptyMetrics("service", DEPARTMENT_META.service.name)],
    ["parts", emptyMetrics("parts", DEPARTMENT_META.parts.name)],
    ["review", emptyMetrics("review", DEPARTMENT_META.review.name)],
  ]);
  const monthMetrics = new Map();
  for (let month = 1; month <= 12; month += 1) {
    monthMetrics.set(month, {
      month, monthName: MONTH_NAMES[month - 1],
      service: emptyMetrics("service", DEPARTMENT_META.service.name),
      parts: emptyMetrics("parts", DEPARTMENT_META.parts.name),
      review: emptyMetrics("review", DEPARTMENT_META.review.name),
    });
  }
  for (const row of normalized) {
    addMetric(departmentMetrics.get(row.department), row);
    addMetric(monthMetrics.get(row.month)[row.department], row);
  }

  const departments = [...departmentMetrics.values()].map(finalizeMetric);
  const months = [...monthMetrics.values()].map((item) => ({
    month: item.month,
    monthName: item.monthName,
    service: finalizeMetric(item.service),
    parts: finalizeMetric(item.parts),
    review: finalizeMetric(item.review),
  }));
  const total = finalizeMetric(normalized.reduce((metric, row) => {
    addMetric(metric, row);
    return metric;
  }, emptyMetrics("all", "Toplam")));
  const confirmedAmount = normalized.filter((row) => row.attributionStatus === "confirmed").reduce((sum, row) => sum + row.netSales, 0);
  const inferredAmount = normalized.filter((row) => row.attributionStatus === "inferred").reduce((sum, row) => sum + row.netSales, 0);
  const explicitDepartmentAmount = normalized.filter((row) => row.explicitDepartment).reduce((sum, row) => sum + row.netSales, 0);
  const explicitOwnerAmount = normalized.filter((row) => row.explicitOwner).reduce((sum, row) => sum + row.netSales, 0);
  const sourceOrderAmount = normalized.filter((row) => row.sourceOrderNo).reduce((sum, row) => sum + row.netSales, 0);
  const batchRiskAmount = normalized.filter((row) => row.batchRisk).reduce((sum, row) => sum + row.netSales, 0);
  const reviewAmount = normalized.filter((row) => row.attributionStatus === "review").reduce((sum, row) => sum + row.netSales, 0);
  const hintedReviewAmount = normalized.filter((row) => row.attributionMethod === "b2b-candidate-hint").reduce((sum, row) => sum + row.netSales, 0);
  const realPilotOrders = pilotOrders
    .filter((row) => !isExcludedTestDocument(row))
    .map((row) => {
      const attribution = resolveCommercialOwnership({
        economic: row,
        lineage: [row],
        actorEvents,
        identities,
      });
      const department = attribution.department;
      return {
        documentNo: row.documentNo,
        documentDate: row.documentDate,
        customerCode: row.customerCode,
        ownerCode: attribution.ownerCode,
        ownerName: attribution.ownerName,
        department,
        departmentName: DEPARTMENT_META[department].name,
        depot: normalizeDepot(row.depotCode),
        lineCount: number(row.lineCount),
        status: attribution.confidence === "confirmed" ? "ready" : "review",
      };
    });

  return {
    year,
    departments,
    months,
    totals: total,
    quality: {
      attributionCoveragePct: total.netSales ? confirmedAmount / total.netSales * 100 : 0,
      inferredCoveragePct: total.netSales ? inferredAmount / total.netSales * 100 : 0,
      inferredAmount,
      explicitDepartmentCoveragePct: total.netSales ? explicitDepartmentAmount / total.netSales * 100 : 0,
      explicitOwnerCoveragePct: total.netSales ? explicitOwnerAmount / total.netSales * 100 : 0,
      sourceOrderCoveragePct: total.netSales ? sourceOrderAmount / total.netSales * 100 : 0,
      reviewAmount,
      unassignedReviewAmount: departments.find((item) => item.id === "review")?.netSales || 0,
      hintedReviewAmount,
      batchRiskAmount,
      excludedTestLines,
      testDocuments: [...TEST_DOCUMENTS],
      firstRealPilotDetected: realPilotOrders.length > 0,
    },
    topOwners: topGroups(normalized.filter((row) => row.attributionStatus !== "review" && !row.batchRisk), (row) => ({
      id: row.commercialOwner || row.commercialOwnerName,
      name: row.commercialOwnerName,
      code: row.commercialOwner,
      department: row.department,
      departmentName: row.departmentName,
      active: row.ownerActive,
      location: row.ownerLocation,
    }), 10),
    topProducts: topGroups(normalized, (row) => ({ id: row.productCode, name: row.productName, code: row.productCode, brand: row.brandName }), 10),
    topCustomers: topGroups(normalized, (row) => ({ id: row.customerCode, name: row.customerName, code: row.customerCode }), 10),
    depotMatrix: ["service", "parts", "review"].flatMap((department) => ["MRK", "YTM", "—"].map((depot) => {
      const rows = normalized.filter((row) => row.department === department && row.fulfillmentDepotCode === depot);
      return {
        department,
        departmentName: DEPARTMENT_META[department].name,
        depot,
        depotName: normalizeDepot(depot).name,
        netSales: rows.reduce((sum, row) => sum + row.netSales, 0),
        documentCount: new Set(rows.map((row) => row.documentKey)).size,
      };
    })),
    detailRows: normalized
      .slice()
      .sort((a, b) => new Date(b.documentDate) - new Date(a.documentDate) || b.netSales - a.netSales)
      .slice(0, 500),
    excludedTestRows: excludedTestRows.map((row) => ({
      ...row,
      economicDocument: { ...row.economicDocument },
      matchedDocument: { ...row.matchedDocument },
      matchedDocuments: row.matchedDocuments.map((item) => ({ ...item })),
    })),
    pilotOrders: realPilotOrders.slice(0, 20),
  };
}
