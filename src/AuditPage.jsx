import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  IconAlertTriangle, IconChevronDown, IconChevronLeft, IconChevronRight, IconChevronUp,
  IconCircleCheck, IconDatabase, IconDownload, IconFileInvoice, IconFilter, IconSearch,
  IconSettings, IconShieldCheck, IconX, IconEdit, IconCheck,
} from "@tabler/icons-react";
import { DOCUMENT_TYPE_LABELS } from "./departmentEvidencePresentation.js";

const money = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
const preciseMoney = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eurMoney = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const months = ["Tümü", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const documentTypes = DOCUMENT_TYPE_LABELS;
const methodLabels = {
  bulkPurchase: "Toplu alım stoku",
  priorPurchase: "İade hariç önceki son alım", nextPurchase: "İade hariç sonraki ilk alım",
  originalSaleCost: "Orijinal satış maliyeti",
  configuredLabor: "İşçilik oranı", configuredSrf: "SRF / BARNACLE oranı",
  configuredTsr: "TSR oranı", configuredRoad: "YOL oranı",
  missingPurchase: "Alım bulunamadı", excludedIncome: "Kapsam dışı gelir",
};
const verificationLabels = { verified: "Faturayla doğrulandı", configured: "Oranla hesaplandı", review: "İnceleme gerekli", excluded: "Kapsam dışı" };
const evidenceClassLabels = { genuinePurchase: "Gerçek alım", configuredRate: "Yönetim oranı", excluded: "Kapsam dışı", missing: "Alım bulunamadı" };
const sourceLabels = { invoice: "Nihai fatura", provisional: "Kapanmış / aktarılmış", return: "Satış iadesi" };
const initialFilters = { search: "", month: "0", documentType: "0", source: "", method: "", verification: "", returnRisk: "" };

function configuredRate(method, rates) {
  if (method === "configuredLabor") return Number(rates?.labor ?? 0);
  if (method === "configuredSrf") return Number(rates?.srf ?? 100);
  if (method === "configuredTsr") return Number(rates?.tsr ?? 100);
  if (method === "configuredRoad") return Number(rates?.road ?? 100);
  return null;
}

function signed(value, isSale) { return Number(value || 0) * (isSale ? 1 : -1); }
function formatMoney(value) { return `${Number(value || 0) < 0 ? "−" : ""}${money.format(Math.abs(Number(value || 0)))} TL`; }
function formatEur(value) { return value == null || !Number.isFinite(Number(value)) ? "—" : eurMoney.format(Math.round(Number(value))); }
export function formatPreciseMoney(value) { return `${Number(value || 0) < 0 ? "−" : ""}${preciseMoney.format(Math.abs(Number(value || 0)))} TL`; }

export function AuditPage({ year, mode, refreshToken = 0, pilotCardCostRates, settings, costOverrides = [], onSaveCostOverrides }) {
  const [filters, setFilters] = useState(initialFilters);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [data, setData] = useState({ rows: [], summary: { totalRows: 0 }, mode: "loading" });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [costEditor, setCostEditor] = useState(null);
  const auditTableTopScrollRef = useRef(null);
  const auditTableScrollRef = useRef(null);

  useEffect(() => {
    const topScroll = auditTableTopScrollRef.current;
    const tableScroll = auditTableScrollRef.current;
    if (!topScroll || !tableScroll) return undefined;
    let syncing = false;
    const sync = (source, target) => {
      if (syncing) return;
      syncing = true;
      target.scrollLeft = source.scrollLeft;
      syncing = false;
    };
    const syncTop = () => sync(topScroll, tableScroll);
    const syncTable = () => sync(tableScroll, topScroll);
    topScroll.addEventListener("scroll", syncTop, { passive: true });
    tableScroll.addEventListener("scroll", syncTable, { passive: true });
    topScroll.scrollLeft = tableScroll.scrollLeft;
    return () => {
      topScroll.removeEventListener("scroll", syncTop);
      tableScroll.removeEventListener("scroll", syncTable);
    };
  }, [data.rows.length]);

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(filters.search.trim()); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [filters.search]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ year, page, pageSize, month: filters.month, documentType: filters.documentType });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (filters.source) params.set("source", filters.source);
    if (filters.method) params.set("method", filters.method);
    if (filters.verification) params.set("verification", filters.verification);
    if (filters.returnRisk) params.set("returnRisk", filters.returnRisk);
    setLoading(true);
    fetch(`/api/audit-ledger?${params}`).then((response) => response.json()).then((result) => {
      if (!cancelled) { setData(result); setLoading(false); setExpanded(null); }
    }).catch(() => { if (!cancelled) { setData({ rows: [], summary: { totalRows: 0 }, mode: "error" }); setLoading(false); } });
    return () => { cancelled = true; };
  }, [year, refreshToken, page, pageSize, filters.month, filters.documentType, filters.source, filters.method, filters.verification, filters.returnRisk, debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(Number(data.summary?.totalRows || 0) / pageSize));
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => key === "search" ? value.trim() : value && value !== "0").length;
  const rows = useMemo(() => data.rows.map((row) => {
    const override = costOverrides.find((decision) => String(decision.rowId) === String(row.id));
    // Server canonicalMetric derives financeV2.lineCostTryExVat; UI never recalculates it.
    const calculatedCost = row.calculatedCost ?? null;
    const netSigned = signed(row.netAmount, row.isSale);
    const grossProfit = row.grossProfit ?? null;
    const eurNetSales = row.eurAvailable === true ? row.eurEquivalent?.netSales ?? null : null;
    const eurCost = row.eurComplete === true ? row.eurEquivalent?.cost ?? null : null;
    const eurProfit = row.eurComplete === true ? row.eurEquivalent?.profit ?? null : null;
    return { ...row, override, configuredRate: null, calculatedCost, netSigned, grossProfit, eurNetSales, eurCost, eurProfit };
  }), [costOverrides, data.rows, pilotCardCostRates]);

  const setFilter = (key, value) => { setFilters((current) => ({ ...current, [key]: value })); if (key !== "search") setPage(1); };
  const resetFilters = () => { setFilters(initialFilters); setDebouncedSearch(""); setPage(1); };
  const openCostEditor = (row) => setCostEditor({
    row,
    unitCost: row.override?.unitCost ?? "",
    reason: row.override?.reason ?? "",
    reference: row.override?.reference ?? "",
    note: row.override?.note ?? "",
  });
  const saveManualCost = () => {
    const unitCost = Number(costEditor?.unitCost);
    if (!costEditor || !Number.isFinite(unitCost) || unitCost < 0 || !costEditor.reason.trim()) return;
    const previous = costEditor.row.override;
    const decision = {
      id: previous?.id || `manual-cost-${costEditor.row.id}`,
      rowId: costEditor.row.id,
      documentType: costEditor.row.documentType,
      documentNo: costEditor.row.documentNo,
      documentDate: costEditor.row.documentDate,
      cardCode: costEditor.row.cardCode,
      cardName: costEditor.row.cardName,
      quantity: Number(costEditor.row.quantity || 0),
      netAmount: Number(costEditor.row.netAmount || 0),
      isSale: Boolean(costEditor.row.isSale),
      unitCost,
      currency: "TL",
      reason: costEditor.reason.trim(),
      reference: costEditor.reference.trim(),
      note: costEditor.note.trim(),
      status: settings.requireManagementApprovalForManualCost ? "pending" : "approved",
      createdAt: previous?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onSaveCostOverrides([...costOverrides.filter((item) => String(item.rowId) !== String(decision.rowId)), decision]);
    setCostEditor(null);
  };
  const approveManualCost = (row) => {
    onSaveCostOverrides(costOverrides.map((item) => String(item.rowId) === String(row.id) ? { ...item, status: "approved", approvedAt: new Date().toISOString(), approvedBy: "Yönetim" } : item));
  };
  const exportCsv = async () => {
    setExporting(true);
    const params = new URLSearchParams({ year, page: 1, pageSize: 100, export: "1", month: filters.month, documentType: filters.documentType });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (filters.source) params.set("source", filters.source);
    if (filters.method) params.set("method", filters.method);
    if (filters.verification) params.set("verification", filters.verification);
    if (filters.returnRisk) params.set("returnRisk", filters.returnRisk);
    let exportRows = [];
    try {
      const result = await fetch(`/api/audit-ledger?${params}`).then((response) => response.json());
      exportRows = Array.isArray(result.rows) ? result.rows : [];
    } finally {
      setExporting(false);
    }
    const columns = [
      "Belge türü","Belge no","Tarih","Kaynak","Cari kodu","Kart kodu","Kart adı","Miktar",
      "Satış brüt (EUR)","Satış iskontosu (EUR)","Satış net (EUR)","Satış brüt (kaynak TRY)","Satış iskontosu (kaynak TRY)","Satış net (kaynak TRY)","Satış iskonto %","Satış KDV (kaynak TRY)","Fatura toplamı (kaynak TRY)",
      "Ürün dövizi","Satır dövizi","Satır dövizi yöntemi","Satır dövizi inceleme nedeni",
      "Maliyet yöntemi","Maliyet belge sınıfı","Doğrulama","Doğrulama gerekçesi",
      "Resmi WAC durumu","Resmi WAC inceleme nedeni",
      "Alım firması","Alım cari kodu","Alım belge türü","Alım belge no","Alım tarihi","Alım miktarı",
      "Alım brüt (KDV hariç)","Alım iskontosu","Alım iskonto 1 %","Alım iskonto 2 %","Alım efektif iskonto %","Alım net (KDV hariç)","Alım KDV","Alım KDV %",
      "Maliyet (EUR)","Brüt kâr (EUR)","Birim maliyet (kaynak TRY)","Satır maliyeti (kaynak TRY)","Brüt kâr (kaynak TRY)",
      "Alım belgesi bulundu","Maliyet doğrulandı","Müşteri iadesi ayıklandı","Ayıklanan iade firması","Ayıklanan iade belgesi","Ayıklanan iade tarihi",
    ];
    const values = exportRows.map((row) => {
      const override = costOverrides.find((decision) => String(decision.rowId) === String(row.id));
      const calculatedCost = row.calculatedCost ?? null;
      const grossProfit = row.grossProfit ?? "";
      return [
        row.documentType,row.documentNo,row.documentDate,sourceLabels[row.revenueSource]||row.revenueSource,row.customerCode,row.cardCode,row.cardName,row.quantity,
        row.eurEquivalent?.grossSales ?? "",row.eurEquivalent?.discounts ?? "",row.eurEquivalent?.netSales ?? "",row.grossAmount,row.discountAmount,row.netAmount,row.discountPct,row.vatAmount,row.invoiceTotalInclVat,
        row.financeV2?.productCurrency || row.productCurrency || "",
        row.lineCurrency || row.financeV2?.lineCurrencyEvidence?.currency || "",
        row.financeV2?.lineCurrencyEvidence?.method || "",
        row.financeV2?.lineCurrencyEvidence?.reviewReason || "",
        override?"manualCost":row.costMethod,evidenceClassLabels[row.costEvidenceClass]||row.costEvidenceClass,override?.status||row.verificationStatus,row.costValidationReason,
        row.financeV2?.costStatus || "",row.financeV2?.reviewReason || "",
        row.purchasePartyName,row.purchaseAccountCode,row.purchaseType,row.purchaseNo,row.purchaseDate,row.purchaseQuantity,
        row.purchaseGrossAmount,row.purchaseDiscountAmount,row.purchaseDiscountRate1,row.purchaseDiscountRate2,row.purchaseEffectiveDiscountPct,row.purchaseNetAmount,row.purchaseVatAmount,row.purchaseVatRate,
        row.eurEquivalent?.cost ?? "",row.eurEquivalent?.profit ?? "",override?.unitCost??row.unitCost,calculatedCost,grossProfit,
        row.purchaseDocumentFound?"Evet":"Hayır",row.costValidated?"Evet":"Hayır",row.returnRisk?"Evet":"Hayır",row.rejectedReturnPartyName,row.rejectedReturnNo,row.rejectedReturnDate,
      ];
    });
    const metadata = [
      ["CPM Denetim Dışa Aktarımı"],
      ["Oluşturma zamanı", new Date().toLocaleString("tr-TR")],
      ["Yıl", year],
      ["Filtreler", JSON.stringify({ ...filters, search: debouncedSearch })],
      ["Satır sayısı", exportRows.length],
      [],
    ];
    const csv = [...metadata, columns, ...values].map((line) => line.map((value) => `"${String(value ?? "").replaceAll('"','""')}"`).join(";")).join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })); link.download = `cpm-denetim-${year}-${activeFilterCount ? "filtreli" : "tum-veri"}.csv`; link.click(); URL.revokeObjectURL(link.href);
  };

  return <main className="page audit-page" id="top">
    <section className="page-heading audit-heading"><div><p className="eyebrow">Finansal izlenebilirlik</p><h1>CPM Denetim Merkezi</h1><p>Hesaplamaya giren, oranla değerlendirilen, dışlanan ve inceleme bekleyen tüm belge satırlarını doğrulayın.</p></div><span className={`source-badge source-badge--${mode}`}>{mode === "live" ? "CPM canlı · salt okunur" : "Veri kullanılamıyor"}</span></section>

    <section className="audit-kpis">
      <article><span><IconFileInvoice /></span><div><small>Filtrelenen satır</small><strong>{loading ? "…" : integer.format(data.summary?.totalRows || 0)}</strong><p>{loading ? "CPM defteri taranıyor…" : `${data.summary?.filteredEurNetAmount == null ? "—" : formatEur(data.summary.filteredEurNetAmount)} EUR net hareket`}</p><small>{loading ? "Kaynak TRY: —" : `Kaynak TRY: ${formatMoney(data.summary?.filteredNetAmount || 0)} · kapsam dışı dahil`}</small><small>Kapsam dışı kaynak TRY: {loading ? "—" : formatPreciseMoney(data.summary?.excludedNetAmount || 0)}</small></div></article>
      <article><span className="green"><IconCircleCheck /></span><div><small>Doğrulanan</small><strong>{loading ? "…" : integer.format((data.summary?.verifiedRows || 0) + (data.summary?.configuredRows || 0))}</strong><p>{loading ? "Faturalar eşleniyor…" : `${integer.format(data.summary?.verifiedRows || 0)} fatura · ${integer.format(data.summary?.configuredRows || 0)} oran`}</p></div></article>
      <article><span className="amber"><IconAlertTriangle /></span><div><small>İnceleme / iade kontrolü</small><strong>{loading ? "…" : integer.format(data.summary?.reviewRows || 0)}</strong><p>{loading ? "İadeler ayıklanıyor…" : `${integer.format(data.summary?.returnRiskRows || 0)} satırda müşteri iadesi maliyetten ayıklandı`}</p></div></article>
      <article><span><IconShieldCheck /></span><div><small>Kapsam dışı</small><strong>{loading ? "…" : integer.format(data.summary?.excludedRows || 0)}</strong><p>Kâra ve havuza alınmaz</p></div></article>
    </section>

    <section className="panel audit-workspace">
      <div className="audit-toolbar"><div><h2>Belge ve Hesap Satırları</h2><p>{year} · sayfa {page}/{totalPages} · {loading ? "CPM okunuyor…" : `${integer.format(data.summary?.totalRows || 0)} sonuç`}</p></div><div><button className="secondary-button" onClick={exportCsv} disabled={!data.summary?.totalRows || exporting}><IconDownload size={17} /> {exporting ? "CSV hazırlanıyor…" : activeFilterCount ? "Tüm filtreli sonucu indir" : "Tüm veriyi indir"}</button></div></div>
      <div className="audit-filters">
        <label className="audit-search"><IconSearch size={18} /><input value={filters.search} onChange={(event)=>setFilter("search",event.target.value)} placeholder="Evrak no, stok kodu, ürün veya alım faturası ara" /></label>
        <label><span>Ay</span><select value={filters.month} onChange={(event)=>setFilter("month",event.target.value)}>{months.map((item,index)=><option key={item} value={index}>{item}</option>)}</select></label>
        <label><span>Belge</span><select value={filters.documentType} onChange={(event)=>setFilter("documentType",event.target.value)}><option value="0">Tümü</option>{Object.entries(documentTypes).map(([value,label])=><option key={value} value={value}>{value} · {label}</option>)}</select></label>
        <label><span>Kaynak</span><select value={filters.source} onChange={(event)=>setFilter("source",event.target.value)}><option value="">Tümü</option>{Object.entries(sourceLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>Doğrulama</span><select value={filters.verification} onChange={(event)=>setFilter("verification",event.target.value)}><option value="">Tümü</option>{Object.entries(verificationLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>Maliyet yöntemi</span><select value={filters.method} onChange={(event)=>setFilter("method",event.target.value)}><option value="">Tümü</option>{Object.entries(methodLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>İade kontrolü</span><select value={filters.returnRisk} onChange={(event)=>setFilter("returnRisk",event.target.value)}><option value="">Tümü</option><option value="1">İade ayıklananlar</option><option value="0">İade kanıtı olmayanlar</option></select></label>
        {activeFilterCount > 0 && <button className="clear-filter" onClick={resetFilters}><IconX size={15} /> Temizle ({activeFilterCount})</button>}
      </div>

      <div className="audit-table-top-scroll" ref={auditTableTopScrollRef} tabIndex="0" aria-label="Denetim tablosunda yatay kaydırma" aria-controls="audit-table-scroll"><div /></div>
      <div className="table-scroll audit-table-wrap" ref={auditTableScrollRef} id="audit-table-scroll"><table className="audit-table"><thead><tr>
        <th aria-label="Detay" /><th>Belge</th><th>Stok / hizmet</th>
        <th>Satış net · EUR<small>KDV hariç · kaynak TRY ayrıntıda</small></th>
        <th className="audit-table__cost">Satır maliyeti · EUR<small>KDV hariç</small></th>
        <th className="audit-table__profit">Brüt kâr · EUR<small>KDV hariç</small></th>
        <th className="audit-table__validation">Doğrulama</th>
      </tr></thead><tbody>
        {loading && rows.length === 0 ? (
          <tr><td colSpan={7} className="empty-cell">CPM veritabanından 22.000+ satır ve maliyet kanıtları taranıyor…</td></tr>
        ) : rows.length === 0 ? (
          <tr><td colSpan={7} className="empty-cell">Filtrelere uygun belge bulunamadı.</td></tr>
        ) : rows.map((row)=><Fragment key={row.id}>
          <tr className={expanded===row.id?"is-expanded":""}>
            <td><button className="row-action" onClick={()=>setExpanded(expanded===row.id?null:row.id)} aria-label={expanded===row.id?"Detayı kapat":"Detayı aç"} aria-expanded={expanded===row.id} aria-controls={`audit-detail-${row.id}`}>{expanded===row.id?<IconChevronUp size={17}/>:<IconChevronDown size={17}/>}</button></td>
            <th><strong>{row.documentType}/{row.documentNo}</strong><small>{new Date(row.documentDate).toLocaleDateString("tr-TR")}</small></th>
            <td><strong>{row.cardCode}</strong><small>{row.cardName||"—"}</small></td>
            <td className={row.isSale?"positive":"negative"}><strong>{formatEur(row.eurNetSales)}</strong><small>{formatMoney(row.netSigned)} kaynak TRY</small></td>
            <td className="audit-table__cost">{formatEur(row.eurCost)}<small>{row.calculatedCost == null ? "Maliyet kaynağı: —" : `${formatMoney(row.calculatedCost)} kaynak TRY`}</small></td>
            <td className={`audit-table__profit ${row.eurProfit==null?"":row.eurProfit>=0?"positive":"negative"}`}>{formatEur(row.eurProfit)}<small>{row.grossProfit == null ? "Kâr kanıtı bekleniyor" : `${formatMoney(row.grossProfit)} kaynak TRY`}</small></td>
            <td className="audit-table__validation"><span className={`audit-status audit-status--${row.override?.status === "approved" ? "verified" : row.override ? "review" : row.verificationStatus}`}>{row.override?.status === "approved" ? "Manuel · onaylı" : row.override ? "Yönetim onayı bekliyor" : verificationLabels[row.verificationStatus]}</span>{row.returnRisk&&<span className="audit-return-flag">İade ayıklandı</span>}</td>
          </tr>
          {expanded===row.id&&<tr className="audit-detail-row" id={`audit-detail-${row.id}`}><td colSpan="7"><div className="audit-detail-grid">
            <div><small>Belge bağlamı</small><strong>{sourceLabels[row.revenueSource]||row.revenueSource} · {money.format(row.quantity||0)} {row.unitName||"miktar"}</strong><p>Cari {row.customerCode||"—"} · stok kartı {row.cardCode} · CPM satır kimliği {row.id}</p></div>
            <div><small>Satış hesabı · EUR · KDV hariç</small><strong>{formatEur(row.eurEquivalent?.grossSales)} − {formatEur(row.eurEquivalent?.discounts)} = {formatEur(row.eurNetSales)}</strong><p>Kaynak TRY: {formatMoney(row.grossAmount||0)} − {formatMoney(row.discountAmount||0)} = {formatMoney(row.netAmount||0)} · iskonto %{money.format(row.discountPct||0)}</p></div>
            <div><small>KDV ve fatura toplamı · kaynak TRY</small><strong>{money.format(row.netAmount||0)} + {money.format(row.vatAmount||0)} = {money.format(row.invoiceTotalInclVat||0)} TL</strong><p>KDV %{money.format(row.vatRate||0)} · toplam KDV dahil</p></div>
            <div><small>Kaynak evrak</small><strong>{row.sourceDocumentNo?`${row.sourceDocumentType}/${row.sourceDocumentNo}`:"Doğrudan oluşturulmuş"}</strong><p>{sourceLabels[row.revenueSource]}{row.originalSaleNo?` · Orijinal satış ${row.originalSaleType}/${row.originalSaleNo}`:""}</p></div>
            <div><small>Seçilen maliyet belgesi</small><strong>{row.purchaseNo?`${row.purchaseType}/${row.purchaseNo}`:row.configuredRate!=null?`Yönetim oranı %${money.format(row.configuredRate)}`:"Alım faturası yok"}</strong><p>{row.purchasePartyName||evidenceClassLabels[row.costEvidenceClass]||"CPM kontrolü gerekli"}{row.purchaseDate?` · ${new Date(row.purchaseDate).toLocaleDateString("tr-TR")}`:""}</p></div>
            <div><small>Alım faturası · kaynak TRY</small><strong>{row.purchaseNo?`${money.format(row.purchaseGrossAmount||0)} − ${money.format(row.purchaseDiscountAmount||0)} = ${money.format(row.purchaseNetAmount||0)} TL`:"Belge tutarı yok"}</strong><p>{row.purchaseNo?`%${money.format(row.purchaseDiscountRate1||0)} + %${money.format(row.purchaseDiscountRate2||0)} → efektif %${money.format(row.purchaseEffectiveDiscountPct||0)} · KDV ${money.format(row.purchaseVatAmount||0)} TL`:"Pilot kart veya manuel maliyet"}</p></div>
            <div><small>Maliyet doğrulama ve brüt kâr · EUR</small><strong>{formatEur(row.eurCost)} / {formatEur(row.eurProfit)}</strong><p>{row.calculatedCost == null ? "Kaynak maliyet veya EUR maliyet kanıtı bekleniyor." : `${formatMoney(row.calculatedCost)} kaynak TRY · ${row.costValidationReason || "KDV maliyete dahil değildir."}`}</p>{(row.verificationStatus === "review" || row.override) && <div className="table-actions"><button className="secondary-button" onClick={() => openCostEditor(row)}><IconEdit size={16}/> {row.override ? "Kararı düzenle" : "Maliyet gir"}</button>{row.override?.status === "pending" && <button className="primary-action" onClick={() => approveManualCost(row)}><IconCheck size={16}/> Yönetim onayı ver</button>}</div>}</div>
            {row.returnRisk&&<div className="audit-return-evidence"><small>Maliyetten çıkarılan müşteri iadesi</small><strong>{row.rejectedReturnType}/{row.rejectedReturnNo}</strong><p>{row.rejectedReturnPartyName||row.rejectedReturnAccountCode||"—"}{row.rejectedReturnDate?` · ${new Date(row.rejectedReturnDate).toLocaleDateString("tr-TR")}`:""} · EFAGLN açıklamasında iade kanıtı bulundu.</p></div>}
          </div></td></tr>}
        </Fragment>)}
        {!loading&&!rows.length&&<tr><td colSpan="7" className="empty-state">Bu filtrelere uygun CPM kaydı bulunamadı.</td></tr>}
      </tbody></table></div>
      <div className="audit-pagination"><label>Sayfa boyutu <select value={pageSize} onChange={(event)=>{setPageSize(Number(event.target.value));setPage(1);}}>{[25,50,100].map((size)=><option key={size}>{size}</option>)}</select></label><span>{integer.format((page-1)*pageSize+Math.min(rows.length?1:0,1))}–{integer.format((page-1)*pageSize+rows.length)} / {integer.format(data.summary?.totalRows||0)}</span><div><button disabled={page<=1} onClick={()=>setPage((value)=>value-1)}><IconChevronLeft size={17}/> Önceki</button><button disabled={page>=totalPages} onClick={()=>setPage((value)=>value+1)}>Sonraki <IconChevronRight size={17}/></button></div></div>
    </section>
    <section className="audit-source-note"><IconDatabase size={18}/><p>Kaynak: CPM STKHAR, STKKRT, CARKRT ve EFAGLN. Tip 9/609 belgeler e-Fatura iade kanıtından geçirilir; müşteri iadeleri maliyet adayı olamaz. CPM’e veri yazılmaz.</p><IconFilter size={18}/></section>
    {costEditor && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setCostEditor(null)}><section className="modal employee-modal" role="dialog" aria-modal="true" aria-labelledby="manual-cost-title"><button className="modal-close" onClick={() => setCostEditor(null)} aria-label="Kapat"><IconX size={19}/></button><p className="eyebrow">Uygulama içi maliyet kararı</p><h2 id="manual-cost-title">{costEditor.row.cardCode} · {costEditor.row.documentNo}</h2><p className="employee-modal__lead">Bu karar CPM’ye yazılmaz. Kaynak maliyet TRY olarak girilir; EUR karşılığı belge tarihinin doğrulanmış kur kanıtıyla üretilir. {settings.requireManagementApprovalForManualCost ? "Yönetim onayına kadar kesin havuza alınmaz." : "Kaydedildiğinde havuz hesabına katılır."}</p><div className="form-grid form-grid--2"><label className="settings-field"><span>Birim maliyet · kaynak TRY</span><input type="number" min="0" value={costEditor.unitCost} onChange={(event)=>setCostEditor({...costEditor,unitCost:event.target.value})}/></label><label className="settings-field"><span>Dayanak / neden</span><select value={costEditor.reason} onChange={(event)=>setCostEditor({...costEditor,reason:event.target.value})}><option value="">Seçin</option><option>Teklif veya tedarikçi belgesi</option><option>Sonraki alım teyidi</option><option>Yönetim maliyet kararı</option><option>Diğer doğrulanmış kaynak</option></select></label><label className="settings-field"><span>Belge / referans</span><input value={costEditor.reference} onChange={(event)=>setCostEditor({...costEditor,reference:event.target.value})} placeholder="Belge no veya açıklama"/></label><label className="settings-field"><span>Not</span><input value={costEditor.note} onChange={(event)=>setCostEditor({...costEditor,note:event.target.value})} placeholder="İnceleme notu"/></label></div><div className="employee-modal__actions"><button className="secondary-button" onClick={()=>setCostEditor(null)}>Vazgeç</button><button className="primary-action" onClick={saveManualCost} disabled={!costEditor.reason || costEditor.unitCost === ""}><IconCheck size={17}/> Maliyet kararını kaydet</button></div></section></div>}
  </main>;
}
