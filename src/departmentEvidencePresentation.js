import { projectCanonicalMetric } from "../shared/financialMetric.mjs";

export const DOCUMENT_TYPE_LABELS = Object.freeze({
  13: "Teklif",
  14: "Satış siparişi",
  15: "Satış irsaliyesi",
  17: "Satış faturası",
  18: "Satış iadesi",
  64: "Sipariş onay",
  85: "Nihai fatura",
  91: "Perakende satış",
});

const ACTOR_NAMES = Object.freeze({
  FURKAN: "Furkan Çakır",
  BCETINEL: "Burak Çetinel",
  MKARA: "Mehmet Kara",
  OGENCOGLU: "Özlenen Gençoğlu",
  TSEMIZ: "Tuğrul Semiz",
  AERIMLI: "Alperen Erimli",
  NTOKER: "N. Toker",
  BIRCAN: "Bircan Çolak",
  CBELIKIRIK: "Can Belikırık",
  CAN: "Can Belikırık",
  EERDOGAN: "Emre Erdoğan",
  EMRE: "Emre Erdoğan",
  MAYAZ: "Metin Ayaz",
});

export function normalizeActorCode(value) {
  return String(value || "")
    .trim()
    .toLocaleUpperCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

export function actorDisplayName(code, preferredName) {
  const normalized = normalizeActorCode(code);
  if (!normalized) return "Belirsiz aktör";
  if (preferredName && preferredName !== "Belirsiz") return preferredName;
  return ACTOR_NAMES[normalized] || `Tanımsız kullanıcı (${normalized})`;
}

export function documentTypeLabel(documentType) {
  return DOCUMENT_TYPE_LABELS[Number(documentType)] || "Bağlı evrak";
}

export function projectDepartmentEurMetric(item = {}) {
  const canonicalMetric = item?.canonicalMetric;
  const projected = projectCanonicalMetric(canonicalMetric, "EUR");
  const revenueComplete = item?.eurRevenueComplete === false
    ? false
    : canonicalMetric?.eurRevenue && typeof canonicalMetric.eurRevenue === "object"
      ? canonicalMetric.eurRevenue.complete === true
    : canonicalMetric
      ? canonicalMetric.status === "TAMAM" && canonicalMetric.eur?.complete === true
      : item?.eurRevenueComplete === true && item?.eurEquivalent?.revenueComplete === true;
  const costComplete = canonicalMetric
    ? canonicalMetric.status === "TAMAM" && canonicalMetric.eur?.complete === true
    : item?.eurComplete === true && item?.eurEquivalent?.costComplete === true;
  const eurEquivalent = item?.eurEquivalent || {};
  const breakdownComplete = canonicalMetric?.eurBreakdown && typeof canonicalMetric.eurBreakdown === "object"
    ? canonicalMetric.eurBreakdown.complete === true
    : eurEquivalent.breakdownComplete === true;
  return {
    ...projected,
    grossSales: revenueComplete && breakdownComplete ? eurEquivalent.grossSales ?? null : null,
    returns: revenueComplete && breakdownComplete ? eurEquivalent.returns ?? null : null,
    discounts: revenueComplete && breakdownComplete ? eurEquivalent.discounts ?? null : null,
    netSales: revenueComplete ? projected.netSales ?? eurEquivalent.netSales ?? null : null,
    cost: costComplete ? projected.cost ?? eurEquivalent.cost ?? null : null,
    profit: costComplete ? projected.profit ?? eurEquivalent.profit ?? null : null,
    margin: costComplete ? projected.margin ?? eurEquivalent.margin ?? null : null,
    revenueComplete,
    costComplete,
  };
}

export function attributionStatusLabel(status) {
  if (status === "confirmed") return "Teyitli ticari sorumlu";
  if (status === "inferred") return "Eşlenmiş ticari sorumlu · kesin değil";
  if (status === "review") return "review-required · ticari sahiplik kanıtı yok";
  return "BLOCKED · atıf durumu alanı yok";
}

export function actorActivityLabel(active) {
  if (active === true) return "Aktif çalışan";
  if (active === false) return "inactive actor · tarihsel atıf";
  return "BLOCKED · çalışan durumu yok";
}

export function isOfficialOwnerRankingCandidate(item = {}) {
  return item?.active === true;
}

export function buildEvidenceTags(row = {}) {
  const tags = [];
  const hasCommercialOwner = Boolean(
    String(row.commercialOwner || "").trim()
      || (String(row.commercialOwnerName || "").trim() && row.commercialOwnerName !== "Belirsiz"),
  );
  if (row.attributionStatus === "review") {
    tags.push({ id: "review-required", tone: "review", label: "review-required · ticari sahiplik kanıtı yok" });
  } else if (row.attributionStatus === "inferred") {
    tags.push({ id: "inferred", tone: "inferred", label: "Eşleme · kesin sahiplik değil" });
  } else if (row.attributionStatus === "confirmed") {
    tags.push({ id: "confirmed", tone: "confirmed", label: "Teyitli ticari sorumlu" });
  } else {
    tags.push({ id: "status-blocked", tone: "review", label: "BLOCKED · atıf durumu alanı yok" });
  }
  if (["confirmed", "inferred"].includes(row.attributionStatus) && !hasCommercialOwner) {
    tags.push({ id: "owner-blocked", tone: "review", label: "BLOCKED · ticari sorumlu alanı yok" });
  }

  if (row.ownerActive === false) {
    tags.push({ id: "inactive-actor", tone: "review", label: "inactive actor · tarihsel atıf" });
  } else if (row.ownerActive !== true) {
    tags.push({ id: "actor-status-blocked", tone: "review", label: "BLOCKED · çalışan durumu yok" });
  }
  if (row.crossDepot === true) {
    tags.push({ id: "cross-depot", tone: "inferred", label: "cross-depot · teslimat bağlamı" });
  }
  if (row.batchRisk === true) {
    tags.push({ id: "batch-91-85", tone: "review", label: "91→85 · toplu ekonomik vaka" });
  }
  return tags;
}

function rowAsDocument(row) {
  if (!row?.documentNo) return null;
  return {
    rootId: row.rootId || null,
    lineageId: row.lineageId || row.ancestorId || null,
    headerId: row.headerId || row.recId || row.id || null,
    documentType: row.documentType,
    documentNo: row.documentNo,
    documentDate: row.documentDate,
    depth: 0,
  };
}

function text(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function sharesRootOrLineage(left, right) {
  const hasStableIdentity = (document) => Boolean(
    (text(document?.rootId) || text(document?.lineageId || document?.ancestorId))
      && text(document?.headerId || document?.recId),
  );
  if (!hasStableIdentity(left) || !hasStableIdentity(right)) return false;
  const leftRoot = text(left?.rootId);
  const rightRoot = text(right?.rootId);
  if (leftRoot && rightRoot) return leftRoot === rightRoot;
  const leftLineage = text(left?.lineageId || left?.ancestorId);
  const rightLineage = text(right?.lineageId || right?.ancestorId);
  return Boolean(leftLineage && rightLineage && leftLineage === rightLineage);
}

export function getBatchDocumentEvidence(row = {}) {
  if (row.batchRisk !== true) return { status: "not-applicable", source: null, result: null };
  if (!Array.isArray(row.evidenceDocuments)) {
    return { status: "blocked", source: null, result: null };
  }

  const sources = row.evidenceDocuments.filter((document) => Number(document?.documentType) === 91);
  const results = row.evidenceDocuments.filter((document) => Number(document?.documentType) === 85);
  if (Number(row.documentType) === 85) results.push(rowAsDocument(row));
  const source = sources[0] || null;
  const result = results[0] || null;
  const linkedPair = sources.flatMap((candidateSource) => results.map((candidateResult) => ({
    source: candidateSource,
    result: candidateResult,
  }))).find(({ source: candidateSource, result: candidateResult }) => (
    sharesRootOrLineage(candidateSource, candidateResult)
  ));
  return linkedPair
    ? { status: "linked", ...linkedPair }
    : { status: "blocked", source, result };
}
