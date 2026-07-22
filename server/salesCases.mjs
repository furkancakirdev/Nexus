import { createHash } from "node:crypto";

export const SALES_DOCUMENT_TYPES = [13, 14, 15, 16, 17, 18, 19, 20, 30, 64, 70, 79, 85, 91, 689];

export const salesCaseSql = `
SET NOCOUNT ON;

DECLARE @windowStart date = DATEFROMPARTS(@year - 1, 1, 1);
DECLARE @windowEnd date = DATEFROMPARTS(@year + 1, 1, 1);

WITH groupedDocuments AS (
  SELECT
    h.EVRAKTIP documentType,
    h.EVRAKNO documentNo,
    h.HESAPKOD customerCode,
    CONCAT(h.EVRAKTIP, '|', h.EVRAKNO, '|', h.HESAPKOD) documentKey,
    MIN(h.EVRAKTARIH) documentDate,
    SUM(CASE WHEN h.KAYITDURUM = 1 THEN 1 ELSE 0 END) activeLineCount,
    COUNT_BIG(*) allLineCount,
    SUM(CASE WHEN h.KAYITDURUM = 1 THEN CAST(ISNULL(h.TUTAR, 0) AS decimal(28, 4)) ELSE 0 END) activeGrossAmount,
    SUM(CASE WHEN h.KAYITDURUM = 1 THEN CAST(ISNULL(h.ISKONTO, 0) AS decimal(28, 4)) ELSE 0 END) activeDiscountAmount,
    SUM(CASE WHEN h.KAYITDURUM = 1 THEN CAST(ISNULL(h.TUTAR, 0) - ISNULL(h.ISKONTO, 0) AS decimal(28, 4)) ELSE 0 END) activeNetAmount,
    SUM(CASE WHEN h.KAYITDURUM = 1 THEN CAST(ISNULL(h.KDV, 0) AS decimal(28, 4)) ELSE 0 END) activeVatAmount,
    SUM(CAST(ISNULL(h.TUTAR, 0) AS decimal(28, 4))) allGrossAmount,
    SUM(CAST(ISNULL(h.ISKONTO, 0) AS decimal(28, 4))) allDiscountAmount,
    SUM(CAST(ISNULL(h.TUTAR, 0) - ISNULL(h.ISKONTO, 0) AS decimal(28, 4))) allNetAmount,
    SUM(CAST(ISNULL(h.KDV, 0) AS decimal(28, 4))) allVatAmount
  FROM STKHAR h
  WHERE h.SIRKETNO = @company
    AND h.EVRAKTARIH >= @windowStart
    AND h.EVRAKTARIH < @windowEnd
    AND h.EVRAKTIP IN (13,14,15,16,17,18,19,20,30,64,70,79,85,91,689)
  GROUP BY h.EVRAKTIP, h.EVRAKNO, h.HESAPKOD
)
SELECT documentType, documentNo, customerCode, documentKey, documentDate,
  CASE WHEN activeLineCount > 0 THEN activeLineCount ELSE allLineCount END lineCount,
  CASE WHEN activeLineCount > 0 THEN activeGrossAmount ELSE allGrossAmount END grossAmount,
  CASE WHEN activeLineCount > 0 THEN activeDiscountAmount ELSE allDiscountAmount END discountAmount,
  CASE WHEN activeLineCount > 0 THEN activeNetAmount ELSE allNetAmount END netAmount,
  CASE WHEN activeLineCount > 0 THEN activeVatAmount ELSE allVatAmount END vatAmount,
  CAST(CASE WHEN activeLineCount > 0 THEN 1 ELSE 0 END AS bit) isActiveDocument,
  CAST(CASE WHEN activeLineCount > 0 AND YEAR(documentDate) = @year THEN 1 ELSE 0 END AS bit) inScopeYear
INTO #documents
FROM groupedDocuments;

CREATE UNIQUE CLUSTERED INDEX IX_nexus_documents ON #documents(documentType, documentNo, customerCode);

SELECT
  d.documentKey, d.documentType, d.documentNo, d.customerCode, d.documentDate,
  d.lineCount, d.grossAmount, d.discountAmount, d.netAmount, d.vatAmount, d.isActiveDocument, d.inScopeYear,
  b.ID headerId, b.EVRAKHAZIRLAYAN preparerUser, b.GIRENKULLANICI entryUser,
  b.GIRENTARIH entryDate, b.DEGISTIRENKULLANICI modifierUser, b.DEGISTIRENTARIH modifiedDate,
  b.KAYITDURUM headerRecordStatus, b._EVRAKDURUM headerDocumentStatus,
  ISNULL(history.versionCount, 0) historyVersionCount,
  ISNULL(approval.approvalCount, 0) approvalCount,
  ISNULL(approval.terminalApprovalCount, 0) terminalApprovalCount
FROM #documents d
OUTER APPLY (
  SELECT TOP (1) b.*
  FROM EVRBAS b
  WHERE b.SIRKETNO = @company
    AND b.EVRAKTIP = d.documentType
    AND b.EVRAKNO = d.documentNo
    AND b.HESAPKOD = d.customerCode
  ORDER BY b.KAYITDURUM DESC, b.ID DESC
) b
OUTER APPLY (
  SELECT COUNT_BIG(*) versionCount
  FROM MIREVRBAS m
  WHERE m.RECID = b.ID
) history
OUTER APPLY (
  SELECT COUNT_BIG(*) approvalCount,
    SUM(CASE WHEN o.SONLANDIR = 1 THEN 1 ELSE 0 END) terminalApprovalCount
  FROM EVRONY o
  WHERE o.SIRKETNO = @company
    AND o.EVRAKTIP = d.documentType
    AND o.EVRAKNO = d.documentNo
    AND o.HESAPKOD = d.customerCode
) approval
ORDER BY d.documentDate, d.documentType, d.documentNo;

SELECT DISTINCT
  CONCAT(h.EVRAKTIP, '|', h.EVRAKNO, '|', h.HESAPKOD) targetKey,
  CONCAT(h.SONKAYNAKEVRAKTIP, '|', h.SONKAYNAKEVRAKNO, '|',
    COALESCE(NULLIF(h.SONKAYNAKHESAPKOD, ''), h.HESAPKOD)) sourceKey,
  h.SONKAYNAKEVRAKTIP sourceDocumentType,
  h.SONKAYNAKEVRAKNO sourceDocumentNo,
  COALESCE(NULLIF(h.SONKAYNAKHESAPKOD, ''), h.HESAPKOD) sourceCustomerCode,
  CAST(CASE WHEN sourceDoc.documentKey IS NULL THEN 0 ELSE 1 END AS bit) sourceResolved
FROM STKHAR h
JOIN #documents targetDoc
  ON targetDoc.documentType = h.EVRAKTIP
  AND targetDoc.documentNo = h.EVRAKNO
  AND targetDoc.customerCode = h.HESAPKOD
LEFT JOIN #documents sourceDoc
  ON sourceDoc.documentType = h.SONKAYNAKEVRAKTIP
  AND sourceDoc.documentNo = h.SONKAYNAKEVRAKNO
  AND sourceDoc.customerCode = COALESCE(NULLIF(h.SONKAYNAKHESAPKOD, ''), h.HESAPKOD)
WHERE h.SIRKETNO = @company
  AND h.KAYITDURUM = 1
  AND h.SONKAYNAKEVRAKTIP IN (13,14,15,16,17,18,19,20,30,64,70,79,85,91,689)
  AND h.SONKAYNAKEVRAKNO IS NOT NULL
  AND LTRIM(RTRIM(h.SONKAYNAKEVRAKNO)) <> '';

SELECT documentKey, actorCode, actorRole, sourceType,
  COUNT_BIG(*) actionCount, MIN(firstSeen) firstSeen, MAX(lastSeen) lastSeen
FROM (
  SELECT d.documentKey, NULLIF(LTRIM(RTRIM(m.GIRENKULLANICI)), '') actorCode,
    'history-entry' actorRole, 'MIREVRBAS' sourceType,
    m.GIRENTARIH firstSeen, m.GIRENTARIH lastSeen
  FROM #documents d
  JOIN MIREVRBAS m ON m.EVRAKTIP = d.documentType
    AND m.EVRAKNO = d.documentNo AND m.HESAPKOD = d.customerCode
  WHERE NULLIF(LTRIM(RTRIM(m.GIRENKULLANICI)), '') IS NOT NULL
  UNION ALL
  SELECT d.documentKey, NULLIF(LTRIM(RTRIM(m.DEGISTIRENKULLANICI)), ''),
    'history-change', 'MIREVRBAS', m.DEGISTIRENTARIH, m.DEGISTIRENTARIH
  FROM #documents d
  JOIN MIREVRBAS m ON m.EVRAKTIP = d.documentType
    AND m.EVRAKNO = d.documentNo AND m.HESAPKOD = d.customerCode
  WHERE NULLIF(LTRIM(RTRIM(m.DEGISTIRENKULLANICI)), '') IS NOT NULL
  UNION ALL
  SELECT d.documentKey, NULLIF(LTRIM(RTRIM(o.ONAYLAYANKULLANICI)), ''),
    CASE WHEN o.SONLANDIR = 1 THEN 'terminal-approval' ELSE 'approval' END,
    'EVRONY', o.ONAYTARIH, o.ONAYTARIH
  FROM #documents d
  JOIN EVRONY o ON o.SIRKETNO = @company AND o.EVRAKTIP = d.documentType
    AND o.EVRAKNO = d.documentNo AND o.HESAPKOD = d.customerCode
  WHERE NULLIF(LTRIM(RTRIM(o.ONAYLAYANKULLANICI)), '') IS NOT NULL
) actorEvents
WHERE actorCode IS NOT NULL
GROUP BY documentKey, actorCode, actorRole, sourceType;

DROP TABLE #documents;
`;

const typeLabels = {
  13: "Teklif",
  14: "Satış siparişi",
  15: "İrsaliye",
  16: "İrsaliye iadesi",
  17: "Satış faturası",
  18: "Satış iadesi",
  19: "Düzeltme",
  20: "Düzeltme",
  30: "Satış süreci",
  64: "Sipariş onayı",
  70: "Satış süreci",
  79: "Sipariş süreci",
  85: "İrsaliyesiz fatura",
  91: "Peşin / perakende satış",
  689: "Diğer satış evrakı",
};

class UnionFind {
  constructor(keys) {
    this.parent = new Map(keys.map((key) => [key, key]));
    this.rank = new Map(keys.map((key) => [key, 0]));
  }

  find(key) {
    const parent = this.parent.get(key);
    if (parent == null) return null;
    if (parent !== key) this.parent.set(key, this.find(parent));
    return this.parent.get(key);
  }

  union(a, b) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (!rootA || !rootB || rootA === rootB) return;
    const rankA = this.rank.get(rootA);
    const rankB = this.rank.get(rootB);
    if (rankA < rankB) this.parent.set(rootA, rootB);
    else if (rankA > rankB) this.parent.set(rootB, rootA);
    else {
      this.parent.set(rootB, rootA);
      this.rank.set(rootA, rankA + 1);
    }
  }
}

function numeric(value) {
  return Number(value || 0);
}

function stableCaseId(documentKeys) {
  const digest = createHash("sha256").update(documentKeys.slice().sort().join("\n")).digest("hex").slice(0, 12).toUpperCase();
  return `NXS-${digest}`;
}

function caseStage(types) {
  if (types.has(18) || types.has(19) || types.has(20)) return "correction";
  if (types.has(17) || types.has(85)) return "invoiced";
  if (types.has(91)) return "retail";
  if (types.has(15) || types.has(16)) return "fulfillment";
  if (types.has(14) || types.has(64) || types.has(79)) return "order";
  if (types.has(13) || types.has(30) || types.has(70)) return "offer";
  return "other";
}

function stageLabel(stage) {
  return ({
    correction: "İade / düzeltme",
    invoiced: "Faturalandı",
    retail: "Peşin / perakende",
    fulfillment: "Teslimat",
    order: "Sipariş",
    offer: "Teklif",
    other: "Diğer",
  })[stage];
}

function boundedActors(actors) {
  const merged = new Map();
  for (const actor of actors) {
    const code = String(actor.actorCode || "").trim();
    if (!code) continue;
    const item = merged.get(code) || { code, actionCount: 0, roles: new Set(), sources: new Set() };
    item.actionCount += numeric(actor.actionCount);
    item.roles.add(actor.actorRole);
    item.sources.add(actor.sourceType);
    merged.set(code, item);
  }
  return [...merged.values()]
    .sort((a, b) => b.actionCount - a.actionCount || a.code.localeCompare(b.code, "tr"))
    .slice(0, 12)
    .map((item) => ({ ...item, roles: [...item.roles], sources: [...item.sources], identityStatus: "unverified" }));
}

export function buildSalesCaseModel({ documents = [], edges = [], actors = [], year }) {
  const normalizedDocuments = documents.map((document) => ({
    ...document,
    documentType: numeric(document.documentType),
    lineCount: numeric(document.lineCount),
    grossAmount: numeric(document.grossAmount),
    discountAmount: numeric(document.discountAmount),
    netAmount: numeric(document.netAmount),
    vatAmount: numeric(document.vatAmount),
    historyVersionCount: numeric(document.historyVersionCount),
    approvalCount: numeric(document.approvalCount),
    terminalApprovalCount: numeric(document.terminalApprovalCount),
    inScopeYear: Boolean(document.inScopeYear),
    isActiveDocument: Boolean(document.isActiveDocument),
  }));
  const documentByKey = new Map(normalizedDocuments.map((document) => [document.documentKey, document]));
  const unionFind = new UnionFind([...documentByKey.keys()]);
  for (const edge of edges) {
    if (edge.sourceResolved && documentByKey.has(edge.sourceKey) && documentByKey.has(edge.targetKey)) {
      unionFind.union(edge.sourceKey, edge.targetKey);
    }
  }

  const components = new Map();
  for (const document of normalizedDocuments) {
    const root = unionFind.find(document.documentKey);
    if (!components.has(root)) components.set(root, []);
    components.get(root).push(document);
  }

  const actorsByDocument = new Map();
  for (const actor of actors) {
    if (!actorsByDocument.has(actor.documentKey)) actorsByDocument.set(actor.documentKey, []);
    actorsByDocument.get(actor.documentKey).push(actor);
  }
  const unresolvedByTarget = new Map();
  for (const edge of edges.filter((item) => !item.sourceResolved)) {
    unresolvedByTarget.set(edge.targetKey, (unresolvedByTarget.get(edge.targetKey) || 0) + 1);
  }

  const cases = [];
  for (const componentDocuments of components.values()) {
    if (!componentDocuments.some((document) => document.inScopeYear)) continue;
    const sortedDocuments = componentDocuments.slice().sort((a, b) => new Date(a.documentDate) - new Date(b.documentDate) || a.documentType - b.documentType);
    const inScopeDocuments = sortedDocuments.filter((document) => document.inScopeYear);
    const types = new Set(sortedDocuments.map((document) => document.documentType));
    const hasType85 = types.has(85);
    const revenueDocuments = inScopeDocuments.filter((document) => (
      document.documentType === 17
      || document.documentType === 85
      || (document.documentType === 91 && !hasType85)
    ));
    const returnDocuments = inScopeDocuments.filter((document) => document.documentType === 18);
    const customerCodes = [...new Set(sortedDocuments.map((document) => document.customerCode).filter(Boolean))];
    const caseActors = boundedActors(sortedDocuments.flatMap((document) => actorsByDocument.get(document.documentKey) || []));
    const missingHeaderCount = inScopeDocuments.filter((document) => !document.headerId).length;
    const missingHistoryCount = inScopeDocuments.filter((document) => document.historyVersionCount === 0).length;
    const unresolvedSourceCount = inScopeDocuments.reduce((sum, document) => sum + (unresolvedByTarget.get(document.documentKey) || 0), 0);
    const issues = [];
    if (customerCodes.length > 1) issues.push("multiple-customers");
    if (missingHeaderCount) issues.push("missing-header");
    if (missingHistoryCount) issues.push("missing-history");
    if (unresolvedSourceCount) issues.push("unresolved-source");
    const stage = caseStage(types);
    const lastDocument = sortedDocuments.at(-1);
    const netSales = revenueDocuments.reduce((sum, document) => sum + document.netAmount, 0)
      - returnDocuments.reduce((sum, document) => sum + document.netAmount, 0);
    const discountAmount = revenueDocuments.reduce((sum, document) => sum + document.discountAmount, 0)
      - returnDocuments.reduce((sum, document) => sum + document.discountAmount, 0);
    cases.push({
      caseId: stableCaseId(sortedDocuments.map((document) => document.documentKey)),
      customerCode: customerCodes.length === 1 ? customerCodes[0] : customerCodes[0] || "—",
      customerCount: customerCodes.length,
      startDate: sortedDocuments[0]?.documentDate,
      lastDate: lastDocument?.documentDate,
      stage,
      stageLabel: stageLabel(stage),
      status: ["invoiced", "retail", "correction"].includes(stage) ? "terminal" : "open",
      documentCount: sortedDocuments.length,
      inScopeDocumentCount: inScopeDocuments.length,
      lineCount: inScopeDocuments.reduce((sum, document) => sum + document.lineCount, 0),
      netSales,
      discountAmount,
      economicDocumentCount: revenueDocuments.length + returnDocuments.length,
      prepaidDocumentCount: sortedDocuments.filter((document) => document.documentType === 91).length,
      prepaidDeduplicated: hasType85 ? sortedDocuments.filter((document) => document.documentType === 91).length : 0,
      actorCount: caseActors.length,
      actors: caseActors,
      issueCount: issues.length,
      issues,
      confidence: issues.length === 0 ? "high" : issues.length === 1 ? "medium" : "low",
      settlementStatus: types.has(91) ? "unverified" : "not-applicable",
      documents: sortedDocuments.map((document) => ({
        documentKey: document.documentKey,
        documentType: document.documentType,
        documentTypeLabel: typeLabels[document.documentType] || `Tip ${document.documentType}`,
        documentNo: document.documentNo,
        documentDate: document.documentDate,
        customerCode: document.customerCode,
        inScopeYear: document.inScopeYear,
        isActiveDocument: document.isActiveDocument,
        lineCount: document.lineCount,
        netAmount: document.netAmount,
        entryUser: document.entryUser || null,
        preparerUser: document.preparerUser || null,
        modifierUser: document.modifierUser || null,
        historyVersionCount: document.historyVersionCount,
        approvalCount: document.approvalCount,
        terminalApprovalCount: document.terminalApprovalCount,
      })),
    });
  }

  cases.sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate) || b.netSales - a.netSales);
  const inScopeDocuments = normalizedDocuments.filter((document) => document.inScopeYear);
  const linkedEdges = edges.filter((edge) => documentByKey.get(edge.targetKey)?.inScopeYear);
  const resolvedEdges = linkedEdges.filter((edge) => edge.sourceResolved);
  const documentsWithHistory = inScopeDocuments.filter((document) => document.historyVersionCount > 0).length;
  const documentsWithHeader = inScopeDocuments.filter((document) => document.headerId).length;
  const casesWith91And85 = cases.filter((item) => item.documents.some((document) => document.documentType === 91) && item.documents.some((document) => document.documentType === 85));
  const allActorCodes = new Set(actors.map((actor) => String(actor.actorCode || "").trim()).filter(Boolean));
  const linkedCaseCount = cases.filter((item) => item.documentCount > 1).length;
  const highConfidenceCases = cases.filter((item) => item.confidence === "high").length;
  const headerCoveragePct = inScopeDocuments.length ? documentsWithHeader / inScopeDocuments.length * 100 : 0;
  const historyCoveragePct = inScopeDocuments.length ? documentsWithHistory / inScopeDocuments.length * 100 : 0;
  const sourceResolutionPct = linkedEdges.length ? resolvedEdges.length / linkedEdges.length * 100 : 100;
  const highConfidencePct = cases.length ? highConfidenceCases / cases.length * 100 : 0;
  const batchPrepaidCases = cases.filter((item) => item.prepaidDeduplicated > 1);

  const summary = {
    year,
    totalCases: cases.length,
    totalDocuments: inScopeDocuments.length,
    linkedCaseCount,
    linkedCasePct: cases.length ? linkedCaseCount / cases.length * 100 : 0,
    terminalCases: cases.filter((item) => item.status === "terminal").length,
    openCases: cases.filter((item) => item.status === "open").length,
    netSales: cases.reduce((sum, item) => sum + item.netSales, 0),
    prepaidCases: cases.filter((item) => item.prepaidDocumentCount > 0).length,
    prepaidDeduplicatedDocuments: cases.reduce((sum, item) => sum + item.prepaidDeduplicated, 0),
    casesWith91And85: casesWith91And85.length,
    batchPrepaidCases: batchPrepaidCases.length,
    maxPrepaidDocumentsPerCase: Math.max(0, ...cases.map((item) => item.prepaidDocumentCount)),
    rawActorCount: allActorCodes.size,
    highConfidenceCases,
    highConfidencePct,
  };
  const quality = {
    generatedAt: new Date().toISOString(),
    sourceWindow: { from: `${year - 1}-01-01`, to: `${year}-12-31`, metricYear: year, timezone: "Europe/Istanbul" },
    headerCoveragePct,
    historyCoveragePct,
    sourceResolutionPct,
    linkedEdgeCount: linkedEdges.length,
    unresolvedEdgeCount: linkedEdges.length - resolvedEdges.length,
    rawActorCount: allActorCodes.size,
    identityMappedActorCount: 0,
    highConfidencePct,
    controls: [
      { id: "read-only", label: "CPM salt okunur", status: "pass", value: "Marlin Nexus ReadOnly" },
      { id: "header-coverage", label: "Evrak başlık kapsamı", status: headerCoveragePct >= 99 ? "pass" : "fail", value: `%${headerCoveragePct.toFixed(2)}` },
      { id: "history-coverage", label: "Kullanıcı geçmişi kapsamı", status: historyCoveragePct >= 99 ? "pass" : "fail", value: `%${historyCoveragePct.toFixed(2)}` },
      { id: "source-resolution", label: "Kaynak evrak çözümleme", status: sourceResolutionPct >= 95 ? "pass" : "warning", value: `%${sourceResolutionPct.toFixed(2)}` },
      { id: "prepaid-dedup", label: "91→85 tekilleştirme", status: "pass", value: `${summary.prepaidDeduplicatedDocuments} çift sayım önlendi` },
      { id: "prepaid-batch", label: "Konsolide peşin vaka", status: batchPrepaidCases.length ? "warning" : "pass", value: batchPrepaidCases.length ? `${batchPrepaidCases.length} vaka; kişi katkısı için ayrıştırılmalı` : "Konsolide vaka yok" },
      { id: "identity-map", label: "Çalışan kimlik eşleştirme", status: "blocked", value: `0 / ${allActorCodes.size}` },
      { id: "settlement", label: "Tahsilat mutabakatı", status: "blocked", value: "Banka / kasa kaynağı bağlı değil" },
      { id: "manual-validation", label: "200 vaka manuel doğrulama", status: "blocked", value: "0 / 200" },
    ],
    personScoringAllowed: false,
    personScoringBlockers: ["identity-map", "settlement", "manual-validation"],
  };

  return { cases, summary, quality };
}

export function filterSalesCases(cases, { search = "", stage = "", confidence = "", page = 1, pageSize = 25 } = {}) {
  const normalizedSearch = search.trim().toLocaleLowerCase("tr-TR");
  const filtered = cases.filter((item) => {
    if (stage && item.stage !== stage) return false;
    if (confidence && item.confidence !== confidence) return false;
    if (!normalizedSearch) return true;
    return [item.caseId, item.customerCode, ...item.actors.map((actor) => actor.code), ...item.documents.flatMap((document) => [document.documentNo, document.entryUser, document.preparerUser, document.modifierUser])]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase("tr-TR").includes(normalizedSearch));
  });
  const start = (page - 1) * pageSize;
  return { total: filtered.length, rows: filtered.slice(start, start + pageSize) };
}
