import { useEffect, useMemo, useState } from "react";
import {
  IconAlertTriangle,
  IconArrowDownRight,
  IconArrowUpRight,
  IconBox,
  IconCircleCheck,
  IconCoins,
  IconDatabase,
  IconDownload,
  IconFileInvoice,
  IconFilter,
  IconSearch,
  IconShieldCheck,
  IconTrendingUp,
} from "@tabler/icons-react";
import { LedgerView } from "./components/ui/LedgerView.jsx";

const money = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
const integer = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const percent = (value) => `%${Number(value || 0).toFixed(1).replace(".", ",")}`;
const formatMoney = (value) => `${money.format(Math.round(Number(value || 0)))} TL`;
const MOVEMENT_RESEARCH_TIMEOUT_MS = 8000;

const documentEvidenceLabels = {
  verified: "Belge: Doğrulandı",
  configured: "Belge: Oranla hesaplandı",
  excluded: "Belge: Kapsam dışı",
  review: "Belge: İnceleme gerekli",
};

const openingResearchReasonLabels = {
  "direction-semantics-unverified": "Hareket yönü (giriş/çıkış) doğrulanmadı",
  "opening-lineage-unverified": "Açılış satırının belge soy zinciri doğrulanmadı",
  "cost-semantics-unverified": "Maliyet alanlarının anlamı ve kaynağı doğrulanmadı",
};

const unlinkedReturnReasonLabels = {
  "missing-source-document-type": "Kaynak belge türü eksik",
  "missing-source-document-number": "Kaynak belge numarası eksik",
  "source-lineage-not-collected": "Kaynak ara belge zinciri tamamlanamadı",
  "source-lineage-cycle": "Kaynak ara belge zincirinde döngü bulundu",
  "unsupported-source-document-type": "Kaynak belge türü satış için desteklenmiyor",
  "source-line-not-found": "Kaynak satır numarası bulunamadı",
  "ambiguous-source-line": "Kaynak satır numarası birden fazla eşleşti",
  "ambiguous-source-document": "Kaynak belgede birden fazla ürün satırı eşleşti",
  "source-document-not-found": "Kaynak belge bulunamadı",
};

export function getFinancialValidationLabel(row = {}) {
  const costCovered = hasCompleteInventoryCostEvidence(row);
  return {
    document: documentEvidenceLabels[row.verificationStatus] || documentEvidenceLabels.review,
    cost: costCovered
      ? "Maliyet kanıtı: Kapsandı"
      : hasPurchaseInvoiceEvidence(row)
        ? "Alım faturası bulundu · perakende/döviz kanıtı eksik"
        : "Maliyet kanıtı: İnceleme gerekli",
  };
}

export function hasCompleteInventoryCostEvidence(row = {}) {
  return row?.financeV2?.costStatus === "covered"
    && typeof row?.unitCost === "number"
    && Number.isFinite(row.unitCost)
    && typeof row?.financeV2?.unitCostCurrencyExVat === "number"
    && Number.isFinite(row.financeV2.unitCostCurrencyExVat);
}

export function hasPurchaseInvoiceEvidence(row = {}) {
  const purchaseNet = Number(row?.purchaseNetAmount);
  const purchaseQuantity = Number(row?.purchaseQuantity);
  return Boolean(row?.purchaseNo)
    && Number.isFinite(purchaseNet) && purchaseNet > 0
    && Number.isFinite(purchaseQuantity) && purchaseQuantity > 0;
}

export function isOfficialWacReady({ inventorySource = null, comparableYearWac = null, rows = [] } = {}) {
  return inventorySource?.status === "verified"
    && inventorySource?.financialStatus === "ready"
    && comparableYearWac?.eligibleForOfficialWac === true
    && Array.isArray(rows)
    && rows.length > 0
    && rows.every(hasCompleteInventoryCostEvidence);
}

export function getInventorySourceNotice(source = {}) {
  if (!source || typeof source !== "object" || !source.status) return null;
  if (source?.status === "verified"
    && (source?.financialStatus === undefined || source?.financialStatus === "ready")) return null;
  return {
    title: source?.status === "verified" ? "Resmî WAC/maliyet kanıtı hazır değil" : "Resmi stok/WAC kaynağı doğrulanmadı",
    message: "Aşağıdaki satırlar yalnızca denetim araştırmasıdır; resmi WAC, maliyet ve kâr havuzuna dahil değildir.",
  };
}

export function getInventorySourceBadge({ mode, rows = [], openingEvidenceDiagnostics = null, inventorySource = null, comparableYearWac = null } = {}) {
  const wacReady = isOfficialWacReady({ inventorySource, comparableYearWac, rows });
  if (mode === "live" && !wacReady) return "CPM canlı · WAC kapalı";
  if (mode === "live") return "CPM canlı · salt okunur";
  if (mode === "unavailable" && (rows.length > 0 || openingEvidenceDiagnostics?.status === "available")) {
    return "CPM aday araştırması · WAC kapalı";
  }
  return "Kaynak kullanılamıyor";
}

export function buildOpeningEvidenceUrl(year, sampleLimit = 20) {
  const params = new URLSearchParams({ year: String(year), sampleLimit: String(sampleLimit) });
  return `/api/research/inventory-opening-evidence?${params}`;
}

export function getOpeningEvidenceScopeLabel(diagnostics = {}) {
  if (diagnostics.scope === "sample") {
    return `Örneklem tanısı · en fazla ${integer.format(diagnostics.sampleLimit || 0)} satır`;
  }
  return "Açılış kanıtı tanısı";
}

export function getOpeningEvidenceSourceCards(sources = {}) {
  const safeSources = sources || {};
  return [
    { key: "stkhArType81", label: "STKHAR tip 81", summary: safeSources.stkhArType81?.summary },
    { key: "stkhArType82", label: "STKHAR tip 82", summary: safeSources.stkhArType82?.summary },
    { key: "stksymDevir", label: "STKSYM DEVIR", summary: safeSources.stksymDevir?.summary },
  ].filter((card) => card.summary
    && card.summary.rowCount !== null
    && card.summary.rowCount !== undefined
    && String(card.summary.rowCount).trim() !== ""
    && Number.isFinite(Number(card.summary.rowCount)));
}

export function getOpeningResearchReasonLabels(reasonCodes = []) {
  return (Array.isArray(reasonCodes) ? reasonCodes : [])
    .filter((code) => code !== null && code !== undefined && String(code).trim() !== "")
    .map((code) => openingResearchReasonLabels[code] || String(code));
}

export function getUnlinkedReturnReasonLabels(reasons = {}) {
  return Object.entries(reasons || {})
    .filter(([, count]) => Number(count) > 0)
    .sort(([, left], [, right]) => Number(right) - Number(left))
    .map(([code, count]) => ({
      code,
      count: Number(count),
      label: unlinkedReturnReasonLabels[code] || code,
    }));
}

export function getInventoryEvidenceLabel({ selected = null, reviewCount = 0 } = {}) {
  if (!selected) return "Ürün seçilmedi";
  return Number(reviewCount) > 0
    ? `${integer.format(Number(reviewCount))} maliyet kanıtı incelenecek · Tam muavin doğrulanmadı`
    : "Belge ve maliyet kanıtı ayrı · Tam muavin doğrulanmadı";
}

export function getInventoryEmptyStateLabel({ openingEvidenceDiagnostics = null, movementLoadTimedOut = false } = {}) {
  if (movementLoadTimedOut) return "CPM hareket defteri yanıt vermedi; aday açılış kanıtı aşağıda.";
  if (openingEvidenceDiagnostics?.status === "available") return "Hareket defteri satırı yok; aday açılış kanıtı aşağıda.";
  return "Aramaya uygun ürün bulunamadı.";
}

export function preserveOpeningEvidenceOnMovementError(current = {}) {
  return {
    ...current,
    rows: [],
    mode: "error",
    inventorySource: null,
    comparableYearWac: null,
  };
}

const demoRows = [
  { id: "demo-1", cardCode: "MN-4827", cardName: "Güverte Pompası", productCategory: "Güverte Ekipmanları", documentDate: "2026-08-28", documentType: 9, documentNo: "INV-2026-8812", isSale: false, quantity: 12, unitCost: 1418, lineCost: -17016, purchaseNo: "INV-2026-8812", purchasePartyName: "Marin Yedek Parça Ltd.", purchaseDocumentFound: true, verificationStatus: "verified", retailUnitPriceCurrencyExVat: 48, financeV2: { productCurrency: "EUR", retailUnitPriceCurrencyExVat: 48, unitCostCurrencyExVat: 35.45, unitDiscountCurrencyExVat: 12.55, productListGrossMarginPct: 26.1, observationKey: "MN-4827|2026-08-28|CPM-FX-1", exchangeEvidence: { rate: 40.0, date: "2026-08-28", sourceId: "CPM-FX-1", method: "halkbank-selling" }, reviewReason: null } },
  { id: "demo-2", cardCode: "MN-4827", cardName: "Güverte Pompası", productCategory: "Güverte Ekipmanları", documentDate: "2026-08-25", documentType: 85, documentNo: "SF-2026-4419", isSale: true, quantity: 4, unitCost: 1410, lineCost: 5640, purchaseNo: "INV-2026-8730", purchasePartyName: "Marin Yedek Parça Ltd.", purchaseDocumentFound: true, verificationStatus: "verified", retailUnitPriceCurrencyExVat: 48, financeV2: { productCurrency: "EUR", retailUnitPriceCurrencyExVat: 48, unitCostCurrencyExVat: 35.25, unitDiscountCurrencyExVat: 12.75, productListGrossMarginPct: 26.6, observationKey: "MN-4827|2026-08-25|CPM-FX-2", exchangeEvidence: { rate: 40.0, date: "2026-08-25", sourceId: "CPM-FX-2", method: "halkbank-selling" }, reviewReason: null } },
  { id: "demo-3", cardCode: "MN-4827", cardName: "Güverte Pompası", productCategory: "Güverte Ekipmanları", documentDate: "2026-08-20", documentType: 85, documentNo: "SF-2026-4291", isSale: true, quantity: 6, unitCost: 1415.5, lineCost: 8493, purchaseNo: "INV-2026-8664", purchasePartyName: "Marin Yedek Parça Ltd.", purchaseDocumentFound: true, verificationStatus: "verified", retailUnitPriceCurrencyExVat: 48, financeV2: { productCurrency: "EUR", retailUnitPriceCurrencyExVat: 48, unitCostCurrencyExVat: 35.39, unitDiscountCurrencyExVat: 12.61, productListGrossMarginPct: 26.3, observationKey: "MN-4827|2026-08-20|CPM-FX-3", exchangeEvidence: { rate: 40.0, date: "2026-08-20", sourceId: "CPM-FX-3", method: "halkbank-selling" }, reviewReason: null } },
  { id: "demo-4", cardCode: "MN-3114", cardName: "Hidrolik Silindir", productCategory: "Güverte Ekipmanları", documentDate: "2026-08-18", documentType: 85, documentNo: "SF-2026-4211", isSale: true, quantity: 2, unitCost: 980, lineCost: 1960, purchaseNo: null, purchasePartyName: null, purchaseDocumentFound: false, verificationStatus: "review", retailUnitPriceCurrencyExVat: 32, financeV2: { productCurrency: "EUR", retailUnitPriceCurrencyExVat: 32, unitCostCurrencyExVat: null, unitDiscountCurrencyExVat: null, productListGrossMarginPct: null, observationKey: null, exchangeEvidence: null, reviewReason: "missing-exchange-rate" } },
  { id: "demo-5", cardCode: "MN-3201", cardName: "Halat - 16mm", productCategory: "Halat & Zincir", documentDate: "2026-08-12", documentType: 85, documentNo: "SF-2026-4024", isSale: true, quantity: 35, unitCost: 4.2, lineCost: 147, purchaseNo: "INV-2026-8301", purchasePartyName: "Ege Halat Sanayi", purchaseDocumentFound: true, verificationStatus: "verified", retailUnitPriceCurrencyExVat: 0.18, financeV2: { productCurrency: "EUR", retailUnitPriceCurrencyExVat: 0.18, unitCostCurrencyExVat: 0.105, unitDiscountCurrencyExVat: 0.075, productListGrossMarginPct: 41.7, observationKey: "MN-3201|2026-08-12|CPM-FX-4", exchangeEvidence: { rate: 40.0, date: "2026-08-12", sourceId: "CPM-FX-4", method: "halkbank-selling" }, reviewReason: null } },
];

function uniqueProducts(rows) {
  const products = new Map();
  for (const row of rows) {
    if (!row.cardCode || products.has(row.cardCode)) continue;
    products.set(row.cardCode, {
      code: row.cardCode,
      name: row.cardName || row.cardCode,
      category: row.productCategory || row.brand || "Stok kartı",
      currency: row.financeV2?.productCurrency || row.productCurrency || "TRY",
      retailPrice: row.financeV2?.retailUnitPriceCurrencyExVat ?? row.retailUnitPriceCurrencyExVat ?? null,
    });
  }
  return [...products.values()];
}

export function buildChronologicalInventoryLedger({ movements = [], officialWacReady = false, currency = "EUR" } = {}) {
  const rows = Array.isArray(movements) ? movements : [];
  const canRenderOfficialWac = officialWacReady
    && rows.length > 0
    && rows.every(hasCompleteInventoryCostEvidence);
  let runningBalance = 0;
  let runningValue = 0;
  let runningWac = 0;

  return [...rows]
    .sort((a, b) => String(a.documentDate || "").localeCompare(String(b.documentDate || "")))
    .map((row) => {
      const isPurchase = [9, 609].includes(Number(row.documentType));
      const inQty = !row.isSale ? Number(row.quantity || 0) : 0;
      const outQty = row.isSale ? Number(row.quantity || 0) : 0;
      const unitPrice = canRenderOfficialWac ? row.financeV2.unitCostCurrencyExVat : null;

      runningBalance += inQty - outQty;

      if (canRenderOfficialWac) {
        if (inQty > 0) {
          runningValue += inQty * unitPrice;
          runningWac = runningBalance > 0 ? runningValue / runningBalance : unitPrice;
        } else if (outQty > 0) {
          runningValue = Math.max(0, runningBalance * runningWac);
        }
      }

      return {
        id: row.id,
        date: row.documentDate ? new Date(row.documentDate).toLocaleDateString("tr-TR") : "—",
        kind: row.isSale ? "sale" : isPurchase ? "purchase" : "other",
        kindLabel: row.isSale ? "Satış" : isPurchase ? "Alım" : "İade / Devir",
        documentNo: `${row.documentType || ""}/${row.documentNo || ""}`,
        depotCode: row.depotCode || "MRK",
        inQty,
        outQty,
        runningBalance,
        unitPrice: canRenderOfficialWac ? unitPrice : null,
        runningWac: canRenderOfficialWac ? runningWac : null,
        runningValue: canRenderOfficialWac ? runningValue : null,
        currency: row.financeV2?.productCurrency || currency || "EUR",
        status: row.verificationStatus,
        statusLabel: row.verificationStatus === "verified" ? "Doğrulandı" : "İnceleme",
      };
    });
}

export function InventoryResearchPage({ year, mode = "live", refreshToken = 0 }) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [data, setData] = useState({
    rows: mode === "demo" ? demoRows : [],
    mode: "loading",
    inventorySource: null,
    openingEvidenceDiagnostics: null,
    openingEvidenceSources: null,
    openingResearchStatus: null,
    openingResearchReasonCodes: [],
    comparableYearWac: null,
  });
  const [selectedCode, setSelectedCode] = useState("MN-4827");
  const [loading, setLoading] = useState(mode !== "demo");
  const [movementLoadTimedOut, setMovementLoadTimedOut] = useState(false);
  const [movementFilter, setMovementFilter] = useState("all");
  const [viewMode, setViewMode] = useState("ledger");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (mode === "demo") {
      const normalized = debouncedQuery.toLocaleUpperCase("tr-TR");
      setData({
        rows: normalized
          ? demoRows.filter((row) => `${row.cardCode} ${row.cardName}`.toLocaleUpperCase("tr-TR").includes(normalized))
          : demoRows,
        mode: "demo",
        openingEvidenceDiagnostics: null,
        openingEvidenceSources: null,
        openingResearchStatus: null,
        openingResearchReasonCodes: [],
        comparableYearWac: null,
      });
      setLoading(false);
      setMovementLoadTimedOut(false);
      return undefined;
    }
    let cancelled = false;
    const movementTimeout = setTimeout(() => {
      if (!cancelled) {
        setMovementLoadTimedOut(true);
        setLoading(false);
      }
    }, MOVEMENT_RESEARCH_TIMEOUT_MS);
    const params = new URLSearchParams({ year, page: 1, pageSize: 200 });
    if (debouncedQuery) params.set("search", debouncedQuery);
    setMovementLoadTimedOut(false);
    setLoading(true);
    fetch(`/api/inventory-research?${params}`)
      .then((response) => response.json())
      .then((result) => {
        if (cancelled) return;
        clearTimeout(movementTimeout);
        setData((current) => ({
          rows: Array.isArray(result.rows) ? result.rows : [],
          mode: result.mode || "live",
          inventorySource: result.inventorySource || null,
          openingEvidenceDiagnostics: result.openingEvidenceDiagnostics || current.openingEvidenceDiagnostics || null,
          openingEvidenceSources: result.openingEvidenceSources || current.openingEvidenceSources || null,
          openingResearchStatus: result.status || current.openingResearchStatus || null,
          openingResearchReasonCodes: Array.isArray(result.reasonCodes) ? result.reasonCodes : current.openingResearchReasonCodes,
          comparableYearWac: result.comparableYearWac || current.comparableYearWac || null,
        }));
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          clearTimeout(movementTimeout);
          setData((current) => preserveOpeningEvidenceOnMovementError(current));
          setLoading(false);
        }
      });
    fetch(buildOpeningEvidenceUrl(year, 20))
      .then((response) => response.ok ? response.json() : null)
      .then((result) => {
        if (!cancelled && result) {
          setData((current) => ({
            ...current,
            openingEvidenceDiagnostics: result.openingEvidenceDiagnostics || null,
            openingEvidenceSources: {
              stkhArType81: result.stkhArType81 || null,
              stkhArType82: result.stkhArType82 || null,
              stksymDevir: result.stksymDevir || null,
            },
            openingResearchStatus: result.status || null,
            openingResearchReasonCodes: Array.isArray(result.reasonCodes) ? result.reasonCodes : [],
          }));
          if (result.openingEvidenceDiagnostics?.status === "available") setLoading(false);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      clearTimeout(movementTimeout);
    };
  }, [year, mode, debouncedQuery, refreshToken]);

  const products = useMemo(() => uniqueProducts(data.rows), [data.rows]);
  useEffect(() => {
    if (products.length && !products.some((product) => product.code === selectedCode)) {
      setSelectedCode(products[0].code);
    }
  }, [products, selectedCode]);

  const selected = products.find((product) => product.code === selectedCode) || null;

  const rawMovements = useMemo(
    () => data.rows.filter((row) => row.cardCode === selectedCode),
    [data.rows, selectedCode],
  );

  const movements = useMemo(() => {
    return rawMovements.filter((row) => {
      const isPurchase = [9, 609].includes(Number(row.documentType));
      if (movementFilter === "purchase") return isPurchase;
      if (movementFilter === "sale") return row.isSale;
      if (movementFilter === "return") return !row.isSale && !isPurchase;
      return true;
    });
  }, [rawMovements, movementFilter]);

  const summary = useMemo(() => {
    const covered = rawMovements.filter((row) => hasCompleteInventoryCostEvidence(row)
      && Number.isFinite(Number(row.financeV2?.lineCostTryExVat)));
    const validMargins = new Map();
    for (const row of rawMovements) {
      const finance = row.financeV2;
      if (hasCompleteInventoryCostEvidence(row)
        && finance?.reviewReason == null
        && Number.isFinite(finance?.productListGrossMarginPct)) {
        validMargins.set(finance.observationKey || row.id, finance.productListGrossMarginPct);
      }
    }
    const margins = [...validMargins.values()];
    const totalQuantity = rawMovements.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const totalCost = covered.reduce((sum, row) => sum + Math.abs(Number(row.financeV2?.lineCostTryExVat || 0)), 0);

    const latestEvidence = rawMovements.find((r) => hasCompleteInventoryCostEvidence(r)
      && r.financeV2?.productListGrossMarginPct != null)?.financeV2;

    return {
      movementCount: rawMovements.length,
      totalQuantity,
      averageUnitCostTry: totalQuantity ? totalCost / totalQuantity : null,
      latestUnitCostCurrency: latestEvidence?.unitCostCurrencyExVat ?? null,
      retailPriceCurrency: selected?.retailPrice ?? latestEvidence?.retailUnitPriceCurrencyExVat ?? null,
      unitDiscountCurrency: latestEvidence?.unitDiscountCurrencyExVat ?? null,
      currency: selected?.currency || latestEvidence?.productCurrency || "TRY",
      evidenceCoveragePct: rawMovements.length ? (100 * covered.length) / rawMovements.length : 0,
      reviewCount: rawMovements.length - covered.length,
      averageMarginPct: margins.length ? margins.reduce((sum, value) => sum + value, 0) / margins.length : null,
      observationCount: margins.length,
    };
  }, [rawMovements, selected]);

  const exportProductMovementsCsv = () => {
    if (!movements.length || !selected) return;
    const columns = [
      "Tarih", "Belge Türü", "Belge No", "İşlem", "Miktar", "KDV Hariç Tutar (TL)",
      "Birim Maliyet (TL)", "Birim Maliyet (Döviz)", "Döviz", "Perakende Fiyat", "Liste Brüt Marjı %",
      "Alım Faturası", "Alım Cari Adı", "Halkbank Kuru", "Doğrulama Durumu", "İnceleme Gerekçesi",
    ];
    const rows = movements.map((r) => {
      const isPurchase = [9, 609].includes(Number(r.documentType));
      const movementType = r.isSale ? "Satış" : isPurchase ? "Alım" : "İade";
      return [
        new Date(r.documentDate).toLocaleDateString("tr-TR"),
        r.documentType,
        r.documentNo,
        movementType,
        r.quantity,
        r.netAmount || "",
        r.unitCost || "",
        r.financeV2?.unitCostCurrencyExVat || "",
        r.financeV2?.productCurrency || selected.currency,
        r.financeV2?.retailUnitPriceCurrencyExVat || "",
        r.financeV2?.productListGrossMarginPct || "",
        r.purchaseNo || "",
        r.purchasePartyName || "",
        r.financeV2?.exchangeEvidence?.rate || "",
        r.verificationStatus || "review",
        r.financeV2?.reviewReason || "",
      ];
    });

    const csvContent = "\ufeff" + [columns, ...rows].map((row) => row.map((val) => `"${String(val ?? "").replaceAll('"', '""')}"`).join(";")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stok-hareketleri-${selected.code}-${year}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const officialWacReady = isOfficialWacReady({
    inventorySource: data.inventorySource,
    comparableYearWac: data.comparableYearWac,
    rows: rawMovements,
  });

  const chronologicalLedger = useMemo(() => buildChronologicalInventoryLedger({
    movements,
    officialWacReady,
    currency: summary.currency,
  }), [movements, officialWacReady, summary.currency]);

  const movementEvidence = data.inventorySource?.evidence || {};
  const movementReviewCounts = movementEvidence.movementReviewCounts || {};
  const costEvidenceSummary = movementEvidence.costEvidenceSummary || {};
  const marginEvidenceSummary = movementEvidence.marginEvidenceSummary || {};
  const excludedHistoricalReturnCount = Object.values(movementEvidence.excludedUnlinkedReturnYearCounts || {})
    .reduce((sum, value) => sum + (Number(value) || 0), 0);

  return (
    <main className="page inventory-research-page" id="top">
      <section className="page-heading control-room-heading">
        <div>
          <p className="eyebrow">Kanıtlı stok araştırması</p>
          <h1>Stok Kartı ve Hareket Defteri</h1>
          <p>Ürün bazında KDV hariç perakende fiyatı, alım faturaları, Halkbank satış kuru kanıtı ve hareket kronolojisi.</p>
        </div>
        <div className="heading-actions">
          <span className={`source-badge source-badge--${data.mode}`}>
            <IconDatabase size={15} />
            {data.mode === "demo" ? "Demo görünüm" : getInventorySourceBadge({
              mode: data.mode,
              rows: data.rows,
              openingEvidenceDiagnostics: data.openingEvidenceDiagnostics,
              inventorySource: data.inventorySource,
              comparableYearWac: data.comparableYearWac,
            })}
          </span>
        </div>
      </section>

      {data.openingEvidenceDiagnostics && (
        <section className="panel inventory-evidence-diagnostics" aria-label="Açılış kanıtı tanısı">
          <div className="control-section-head">
            <div>
              <h2>{getOpeningEvidenceScopeLabel(data.openingEvidenceDiagnostics)}</h2>
              <p>STKSYM/STKHAR eşleştirmesi yalnızca salt-okuma denetim kanıtıdır; örneklem sayıları tüm CPM nüfusunu temsil etmez ve resmi WAC kararını kendiliğinden değiştirmez.</p>
            </div>
            <span className={`evidence-state ${data.openingEvidenceDiagnostics.status === "available" ? "" : "evidence-state--review"}`}>
              {data.openingEvidenceDiagnostics.status === "available" ? <IconCircleCheck size={17} /> : <IconAlertTriangle size={17} />}
              {data.openingEvidenceDiagnostics.status === "available" ? "Tanı mevcut" : "Tanı mevcut değil"}
            </span>
          </div>
          {data.openingEvidenceDiagnostics.status === "not-available" ? (
            <p className="control-empty">STKSYM/STKHAR eşleştirmesi mevcut değil; resmi WAC'a dahil değil.</p>
          ) : (
            <div className="inventory-diagnostics-grid">
              <span>Resmi adaya uygun <strong>{integer.format(data.openingEvidenceDiagnostics.officialEligibleCount || 0)}</strong></span>
              <span>Exact-key <strong>{integer.format(data.openingEvidenceDiagnostics.exactKeyCount || 0)}</strong></span>
              <span>Yalnız miktar <strong>{integer.format(data.openingEvidenceDiagnostics.quantityOnlyCount || 0)}</strong></span>
              <span>Çatışma <strong>{integer.format(data.openingEvidenceDiagnostics.conflictCount || 0)}</strong></span>
              <span>Maliyet eksik <strong>{integer.format(data.openingEvidenceDiagnostics.missingCostCount || 0)}</strong></span>
              <span>STKHAR tip 82 ile birebir bağlanamayan <strong>{integer.format(data.openingEvidenceDiagnostics.unmatchedCount || 0)}</strong></span>
            </div>
          )}
          {data.openingEvidenceDiagnostics.sourceMatchSummary && (
            <div className="inventory-source-match-summary" role="status">
              <strong>Kaynak nüfusu eşleşme özeti</strong>
              <span>
                STKSYM devir <b>{integer.format(data.openingEvidenceDiagnostics.sourceMatchSummary.symRowCount || 0)}</b> satır;
                aynı ürün + depo + tarih <b>{integer.format(data.openingEvidenceDiagnostics.sourceMatchSummary.sameProductDepotDateRowCount || 0)}</b>;
                aynı miktar <b>{integer.format(data.openingEvidenceDiagnostics.sourceMatchSummary.sameProductDepotDateQuantityRowCount || 0)}</b>;
                benzersiz miktar <b>{integer.format(data.openingEvidenceDiagnostics.sourceMatchSummary.uniqueQuantityMatchRowCount || 0)}</b>.
              </span>
              {data.openingEvidenceDiagnostics.sourceDocumentMatchSummary && (
                <span>
                  aynı belge + satır <b>{integer.format(data.openingEvidenceDiagnostics.sourceDocumentMatchSummary.sameDocumentLineRowCount || 0)}</b>;
                  benzersiz belge + satır <b>{integer.format(data.openingEvidenceDiagnostics.sourceDocumentMatchSummary.uniqueDocumentLineMatchRowCount || 0)}</b>;
                  belge anahtarı eksik <b>{integer.format(data.openingEvidenceDiagnostics.sourceDocumentMatchSummary.missingDocumentKeyRowCount || 0)}</b>.
                </span>
              )}
              {data.openingEvidenceDiagnostics.sourceMatchReasonSummary && (
                <span>
                  Tip 82’de ürün bulunamadı <b>{integer.format(data.openingEvidenceDiagnostics.sourceMatchReasonSummary.type82ReasonNoProductMatchCount || 0)}</b>;
                  depo uyuşmazlığı <b>{integer.format(data.openingEvidenceDiagnostics.sourceMatchReasonSummary.type82ReasonDepotMismatchCount || 0)}</b>;
                  tarih uyuşmazlığı <b>{integer.format(data.openingEvidenceDiagnostics.sourceMatchReasonSummary.type82ReasonDateMismatchCount || 0)}</b>;
                  tip 81 ürün eşleşmesi <b>{integer.format(data.openingEvidenceDiagnostics.sourceMatchReasonSummary.type81ProductMatchCount || 0)}</b>.
                </span>
              )}
              {data.openingEvidenceDiagnostics.salesOverlapSummary && (
                <span>
                  Aynı ürünle satış hareketi örtüşmesi <b>{integer.format(data.openingEvidenceDiagnostics.salesOverlapSummary.productSaleOverlapRowCount || 0)}</b>;
                  aynı ürün + depo <b>{integer.format(data.openingEvidenceDiagnostics.salesOverlapSummary.productDepotSaleOverlapRowCount || 0)}</b>;
                  devir tarihinden sonra ürün + depo satışı <b>{integer.format(data.openingEvidenceDiagnostics.salesOverlapSummary.laterProductDepotSaleOverlapRowCount || 0)}</b>.
                </span>
              )}
              <small>Bu özet yalnızca kanıt karşılaştırmasıdır. Birebir bağ kurulamaması satışın veya tahsilatın olmadığı anlamına gelmez; STKSYM devir satırının STKHAR hareket satırına bağlanamadığını gösterir. Yön, soy zinciri ve maliyet anlamı doğrulanmadan hiçbir satır Ağırlıklı Ortalama Maliyet (WAC) hesabına alınmaz.</small>
              {data.openingEvidenceDiagnostics.salesOverlapSummary && (
                <small>Satış örtüşmesi, STKHAR tip 17/85/91 hareket adayıyla ürün/depo/tarih düzeyinde karşılaştırmadır. Tip 91’in tip 17 veya 85’e dönüşümü burada ekonomik toplam olarak yeniden hesaplanmaz; tahsilat kanıtı ise ayrı cari/kasa/banka kaynağından doğrulanmalıdır.</small>
              )}
            </div>
          )}
        </section>
      )}

      {getOpeningEvidenceSourceCards(data.openingEvidenceSources).length > 0 && (
        <section className="panel inventory-evidence-diagnostics" aria-label="Aday CPM kaynak nüfusu">
          <div className="control-section-head">
            <div>
              <h2>Aday CPM kaynak nüfusu</h2>
              <p>Bu sayılar salt-okunur CPM araştırmasıdır; kaynak satırları resmi WAC veya kâr hesabına henüz bağlanmamıştır.</p>
            </div>
            <span className="evidence-state evidence-state--review"><IconAlertTriangle size={17} /> WAC kapalı</span>
          </div>
          <div className="inventory-diagnostics-grid">
            {getOpeningEvidenceSourceCards(data.openingEvidenceSources).map((card) => (
              <span key={card.key}>
                {card.label} <strong>{integer.format(Number(card.summary.rowCount))}</strong> satır
                <small>{integer.format(Number(card.summary.distinctProductCount || 0))} ürün · {integer.format(Number(card.summary.distinctDepotCount || 0))} depo</small>
              </span>
            ))}
          </div>
        </section>
      )}

      {(data.openingResearchStatus || data.openingResearchReasonCodes.length > 0) && (
        <section className="panel inventory-evidence-diagnostics" aria-label="Aday araştırma durumu">
          <div className="control-section-head">
            <div>
              <h2>Aday araştırma durumu</h2>
              <p>Eksik kanıtlar açıkça listelenir; bu durum resmi WAC ve kâr hesaplarını açmaz.</p>
            </div>
            <span className="evidence-state evidence-state--review"><IconAlertTriangle size={17} /> {data.openingResearchStatus === "candidate" ? "Aday" : "İnceleme"}</span>
          </div>
          {getOpeningResearchReasonLabels(data.openingResearchReasonCodes).length > 0 && (
            <ul className="inventory-evidence-reasons">
              {getOpeningResearchReasonLabels(data.openingResearchReasonCodes).map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
          )}
        </section>
      )}

      {getInventorySourceNotice(data.inventorySource) && (
        <section className="panel inventory-source-warning" role="status" aria-label="Stok kaynağı uyarısı">
          <div className="control-section-head">
            <div>
              <h2>{getInventorySourceNotice(data.inventorySource).title}</h2>
              <p>{getInventorySourceNotice(data.inventorySource).message}</p>
            </div>
            <span className="evidence-state evidence-state--review"><IconAlertTriangle size={17} /> Resmî finansal hesap kapalı</span>
          </div>
          {getUnlinkedReturnReasonLabels(data.inventorySource?.evidence?.movementUnlinkedReturnReasons).length > 0 && (
            <div className="inventory-diagnostics-grid" aria-label="Eşleşmeyen satış iadesi nedenleri">
              {getUnlinkedReturnReasonLabels(data.inventorySource.evidence.movementUnlinkedReturnReasons).map((item) => (
                <span key={item.code}>
                  {item.label} <strong>{integer.format(item.count)}</strong> satır
                </span>
              ))}
            </div>
          )}
          {(Number(movementReviewCounts.excludedInvalidCostRows) > 0
            || Number(movementReviewCounts.excludedNonMovementRows) > 0
            || excludedHistoricalReturnCount > 0
            || Number(movementReviewCounts.unlinkedReturnRows) > 0) && (
            <div className="inventory-diagnostics-grid" aria-label="Hesap kapsamı dışı ve incelemedeki hareketler">
              {Number(movementReviewCounts.excludedInvalidCostRows) > 0 && (
                <span>Geçersiz net maliyet · hesap dışı <strong>{integer.format(Number(movementReviewCounts.excludedInvalidCostRows))}</strong> satır</span>
              )}
              {Number(movementReviewCounts.excludedNonMovementRows) > 0 && (
                <span>Sıfır miktarlı ekonomik olmayan satır · hesap dışı <strong>{integer.format(Number(movementReviewCounts.excludedNonMovementRows))}</strong> satır</span>
              )}
              {excludedHistoricalReturnCount > 0 && (
                <span>2026 öncesi eşleşmeyen satış iadesi · hesap dışı <strong>{integer.format(excludedHistoricalReturnCount)}</strong> satır</span>
              )}
              {Number(movementReviewCounts.unlinkedReturnRows) > 0 && (
                <span>2026 eşleşmeyen satış iadesi · incelemede <strong>{integer.format(Number(movementReviewCounts.unlinkedReturnRows))}</strong> satır</span>
              )}
            </div>
          )}
        </section>
      )}

      {Number(costEvidenceSummary.candidateRows) > 0 && (
        <section className="panel inventory-evidence-diagnostics" aria-label="Tarihsel maliyet ve marj kanıtı özeti">
          <div className="control-section-head">
            <div>
              <h2>Tarihsel alım maliyeti ve marj kanıtı ayrımı</h2>
              <p>Pozitif TUTAR−ISKONTO bulunan satırlar alım maliyeti olarak ayrıca ölçülür. Perakende fiyatı veya ürün dövizi yoksa yalnız marj kanıtı eksik sayılır; alım faturası yokmuş gibi gösterilmez.</p>
            </div>
            <span className="evidence-state evidence-state--review"><IconShieldCheck size={17} /> WAC kapalı</span>
          </div>
          <div className="inventory-diagnostics-grid">
            <span>Alım/devir maliyet adayı <strong>{integer.format(Number(costEvidenceSummary.candidateRows || 0))}</strong> satır</span>
            <span>TRY maliyet kanıtı bulunan <strong>{integer.format(Number(costEvidenceSummary.coveredRows || 0))}</strong> satır</span>
            <span>Kaynak belge numarası bulunan <strong>{integer.format(Number(costEvidenceSummary.sourceDocumentRows || 0))}</strong> satır</span>
            <span>Perakende/döviz kanıtı incelenecek <strong>{integer.format(Number(marginEvidenceSummary.reviewRows || 0))}</strong> satır</span>
            <span>Etkilenen ürün <strong>{integer.format(Number(marginEvidenceSummary.affectedProductCount || 0))}</strong></span>
          </div>
          <small>Bu özet maliyetin bulunduğunu gösterir; tek başına ürün marjını veya resmî WAC uygunluğunu açmaz. Manuel marj kararı yalnız ayrı, onaylı yönetim kararıyla kullanılabilir.</small>
        </section>
      )}

      {data.comparableYearWac?.years?.length > 0 && (
        <section className="panel inventory-evidence-diagnostics" aria-label="2024-2025 aday WAC kapsamı">
          <div className="control-section-head">
            <div>
              <h2>2024–2025 karşılaştırmalı aday WAC</h2>
              <p>Hareketli ağırlıklı ortalama yalnız tarihsel, ürün-depo-döviz anahtarında yürütülür. Bu özet candidate kanıtıdır; official WAC ve EUR KPI’ına bağlı değildir.</p>
            </div>
            <span className="evidence-state evidence-state--review"><IconAlertTriangle size={17} /> Official WAC kapalı</span>
          </div>
          <div className="inventory-diagnostics-grid">
            {data.comparableYearWac.years.map((candidate) => (
              <span key={candidate.year}>
                <strong>{candidate.year}</strong> · covered {integer.format(candidate.coveredRows || 0)} / {integer.format(candidate.sourceRowCount || 0)}
                <small> ({percent(Number(candidate.coveredRatio || 0) * 100)}) · uygunluk: hayır</small>
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="inventory-research-layout">
        {/* Left: Product Search / Autocomplete list */}
        <aside className="panel inventory-search-panel">
          <label className="control-search">
            <IconSearch size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ürün kodu veya adı ile ara…"
            />
          </label>
          <div className="inventory-search-head">
            <strong>Ürünler</strong>
            <span>{products.length}</span>
          </div>
          <div className="inventory-product-list">
            {loading ? (
              <p className="control-empty">CPM defteri okunuyor…</p>
            ) : products.length ? (
              products.map((product) => (
                <button
                  key={product.code}
                  className={selectedCode === product.code ? "inventory-product is-selected" : "inventory-product"}
                  onClick={() => setSelectedCode(product.code)}
                >
                  <span>
                    <strong>{product.code}</strong>
                    <small>{product.name}</small>
                  </span>
                  <em>{product.currency}</em>
                </button>
              ))
            ) : (
              <p className="control-empty">{getInventoryEmptyStateLabel({
                openingEvidenceDiagnostics: data.openingEvidenceDiagnostics,
                movementLoadTimedOut,
              })}</p>
            )}
          </div>
        </aside>

        {/* Right: Selected Product Hero + KPIs + Movement Table */}
        <div className="inventory-research-content">
          <section className="panel inventory-product-hero">
            <div>
              <small>{selected?.code || "Ürün seçilmedi"}</small>
              <h2>{selected?.name || "Araştırmak için bir ürün seçin"}</h2>
              <p>{selected?.category || "CPM stok kartı ve nihai defter kanıtı"}</p>
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <span className="evidence-state evidence-state--review">
                <IconAlertTriangle size={17} />
                {getInventoryEvidenceLabel({ selected, reviewCount: summary.reviewCount })}
              </span>
              <button
                className="secondary-button"
                onClick={exportProductMovementsCsv}
                disabled={!movements.length}
                title="Hareketleri CSV olarak indir"
              >
                <IconDownload size={16} /> CSV İndir
              </button>
            </div>
          </section>

          {/* V2 Financial KPI Summary for Selected Product */}
          <section className="control-kpis inventory-kpis">
            <article>
              <span><IconBox size={22} /></span>
              <div>
                <small>Toplam Hareket</small>
                <strong>{integer.format(summary.movementCount)}</strong>
                <p>{integer.format(summary.totalQuantity)} adet işlem</p>
              </div>
            </article>

            <article>
              <span className="cyan"><IconCoins size={22} /></span>
              <div>
                <small>KDV Hariç Perakende Fiyat</small>
                <strong>
                  {summary.retailPriceCurrency == null ? "—" : `${money.format(summary.retailPriceCurrency)} ${summary.currency}`}
                </strong>
                <p>Ürün stok kartı fiyatı</p>
              </div>
            </article>

            <article>
              <span className="slate"><IconFileInvoice size={22} /></span>
              <div>
                <small>Aday Döviz Birim Maliyeti</small>
                <strong>
                  {summary.latestUnitCostCurrency == null ? "—" : `${money.format(summary.latestUnitCostCurrency)} ${summary.currency}`}
                </strong>
                <p>Belge + maliyet kanıtı; WAC'a dahil değil</p>
              </div>
            </article>

            <article>
              <span className="amber"><IconTrendingUp size={22} /></span>
              <div>
                <small>Aday Ürün Liste Brüt Marjı</small>
                <strong style={{ color: "var(--amber)" }}>
                  {summary.averageMarginPct == null ? "—" : percent(summary.averageMarginPct)}
                </strong>
                <p>{summary.observationCount} maliyet kanıtlı fatura gözlemi · WAC kararı değil</p>
              </div>
            </article>
          </section>

          {/* Chronological Movements Table */}
          <section className="panel inventory-movement-panel">
            <div className="control-section-head">
              <div>
                <h2>Fatura ve Stok Hareket Defteri</h2>
                <p>{movements.length} hareket listeleniyor · API en fazla 200 satır döndürür; toplam/sayfa bilgisi yok. Tam muavin doğrulanmadı.</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div className="segmented" role="group" aria-label="Görünüm biçimi">
                  <button
                    type="button"
                    className={viewMode === "ledger" ? "active" : ""}
                    onClick={() => setViewMode("ledger")}
                  >
                    Muavin Defter
                  </button>
                  <button
                    type="button"
                    className={viewMode === "evidence" ? "active" : ""}
                    onClick={() => setViewMode("evidence")}
                  >
                    Denetim Tablosu
                  </button>
                </div>
                <label className="filter-select-label">
                  <IconFilter size={15} />
                  <select
                    value={movementFilter}
                    onChange={(e) => setMovementFilter(e.target.value)}
                    aria-label="Hareket türü filtresi"
                  >
                    <option value="all">Tüm hareketler</option>
                    <option value="purchase">Yalnız Alımlar (9/609)</option>
                    <option value="sale">Yalnız Satışlar</option>
                    <option value="return">Yalnız İadeler</option>
                  </select>
                </label>
                <IconDatabase size={20} style={{ color: "var(--accent)" }} />
              </div>
            </div>

            {viewMode === "ledger" ? (
              <>
                {!officialWacReady && (
                  <p className="control-empty">WAC ve stok değeri: — · Resmî WAC kanıtı hazır değil; hareketler belge ve maliyet kanıtı olarak ayrı incelenir.</p>
                )}
                <LedgerView
                  transactions={chronologicalLedger}
                  productCurrency={summary.currency}
                  productCode={selected?.code}
                  productName={selected?.name}
                />
              </>
            ) : (
              <div className="table-scroll">
                <table className="control-table">
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>Hareket</th>
                      <th>Belge No</th>
                      <th>Miktar</th>
                      <th>Belge Maliyeti (TL)</th>
                      <th>Maliyet Kanıtı (Döviz)</th>
                      <th>Liste Brüt Marjı</th>
                      <th>Alım Kanıtı</th>
                      <th>Halkbank Kuru</th>
                      <th>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((row) => {
                      const isPurchase = [9, 609].includes(Number(row.documentType));
                      const movementLabel = row.isSale
                        ? "Çıkış / Satış"
                        : isPurchase
                          ? "Giriş / Alım"
                          : "Giriş / İade";
                      const margin = row.financeV2?.productListGrossMarginPct;
                      const fxRate = row.financeV2?.exchangeEvidence?.rate;

                      return (
                        <tr key={row.id}>
                          <td>{new Date(row.documentDate).toLocaleDateString("tr-TR")}</td>
                          <td>
                            <span className={row.isSale ? "movement-type movement-type--out" : "movement-type movement-type--in"}>
                              {row.isSale ? <IconArrowUpRight size={14} /> : <IconArrowDownRight size={14} />}
                              {movementLabel}
                            </span>
                          </td>
                          <td><strong>{row.documentType}/{row.documentNo}</strong></td>
                          <td>
                            <strong>{row.isSale ? "−" : "+"}{money.format(row.quantity || 0)}</strong>
                          </td>
                          <td>{!(hasCompleteInventoryCostEvidence(row) || hasPurchaseInvoiceEvidence(row)) ? "—" : `${money.format(row.unitCost)} TL`}</td>
                          <td>
                            {!hasCompleteInventoryCostEvidence(row)
                              ? "—"
                              : `${money.format(row.financeV2.unitCostCurrencyExVat)} ${row.financeV2.productCurrency || summary.currency}`}
                          </td>
                          <td>
                            {margin == null ? (
                              "—"
                            ) : (
                              <strong style={{ color: "var(--amber)" }}>{percent(margin)}</strong>
                            )}
                          </td>
                          <td>
                            {row.purchaseNo ? (
                              <span title={row.purchasePartyName || ""}>{row.purchaseType}/{row.purchaseNo}</span>
                            ) : (
                              <span style={{ color: "var(--muted)" }}>—</span>
                            )}
                          </td>
                          <td>
                            {fxRate ? (
                              <small>{money.format(fxRate)} TL</small>
                            ) : (
                              <small style={{ color: "var(--muted)" }}>—</small>
                            )}
                          </td>
                          <td>
                            {(() => {
                              const validation = getFinancialValidationLabel(row);
                              return (
                                <div className="inventory-validation-stack">
                                  <span className={`audit-status audit-status--${row.verificationStatus || "review"}`}>
                                    {validation.document}
                                  </span>
                                  <span className={`audit-status audit-status--${hasCompleteInventoryCostEvidence(row) ? "verified" : hasPurchaseInvoiceEvidence(row) ? "configured" : "review"}`}>
                                    {validation.cost}
                                  </span>
                                </div>
                              );
                            })()}
                          </td>
                        </tr>
                      );
                    })}
                    {!movements.length && (
                      <tr>
                        <td colSpan="10">
                          <p className="control-empty">Seçili ürün için uygun hareket bulunamadı.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
