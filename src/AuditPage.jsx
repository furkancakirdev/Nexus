import { Fragment, useEffect, useMemo, useState } from "react";
import {
  IconAlertTriangle, IconChevronDown, IconChevronLeft, IconChevronRight, IconChevronUp,
  IconCircleCheck, IconDatabase, IconDownload, IconFileInvoice, IconFilter, IconSearch,
  IconSettings, IconShieldCheck, IconX, IconEdit, IconCheck,
} from "@tabler/icons-react";

const money = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
const integer = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const months = ["Tümü", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const documentTypes = { 13: "Teklif", 14: "Satış siparişi", 15: "Satış irsaliyesi", 17: "Satış faturası", 18: "Satış iadesi", 64: "Sipariş onay", 85: "İrsaliyesiz fatura", 91: "Perakende satış" };
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

export function AuditPage({ year, mode, pilotCardCostRates, settings, costOverrides = [], onSaveCostOverrides }) {
  const [filters, setFilters] = useState(initialFilters);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [data, setData] = useState({ rows: [], summary: { totalRows: 0 }, mode: "loading" });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [costEditor, setCostEditor] = useState(null);

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
  }, [year, page, pageSize, filters.month, filters.documentType, filters.source, filters.method, filters.verification, filters.returnRisk, debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(Number(data.summary?.totalRows || 0) / pageSize));
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => key === "search" ? value.trim() : value && value !== "0").length;
  const rows = useMemo(() => data.rows.map((row) => {
    const override = costOverrides.find((decision) => String(decision.rowId) === String(row.id));
    const rate = configuredRate(row.costMethod, pilotCardCostRates);
    const calculatedCost = override
      ? signed(Number(row.quantity || 0) * Number(override.unitCost || 0), row.isSale)
      : rate == null ? row.lineCost : signed(Number(row.netAmount || 0) * rate / 100, row.isSale);
    const netSigned = signed(row.netAmount, row.isSale);
    const grossProfit = row.costMethod === "excludedIncome" || calculatedCost == null ? null : netSigned - Number(calculatedCost);
    return { ...row, override, configuredRate: rate, calculatedCost, netSigned, grossProfit };
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
      "Satış brüt (KDV hariç)","Satış iskontosu","Satış iskonto %","Satış net (KDV hariç)","Satış KDV","Fatura toplamı (KDV dahil)",
      "Maliyet yöntemi","Maliyet belge sınıfı","Doğrulama","Doğrulama gerekçesi",
      "Alım firması","Alım cari kodu","Alım belge türü","Alım belge no","Alım tarihi","Alım miktarı",
      "Alım brüt (KDV hariç)","Alım iskontosu","Alım iskonto 1 %","Alım iskonto 2 %","Alım efektif iskonto %","Alım net (KDV hariç)","Alım KDV","Alım KDV %",
      "Birim maliyet (KDV hariç)","Satır maliyeti (KDV hariç)","Brüt kâr (KDV hariç)",
      "Alım belgesi bulundu","Maliyet doğrulandı","Müşteri iadesi ayıklandı","Ayıklanan iade firması","Ayıklanan iade belgesi","Ayıklanan iade tarihi",
    ];
    const values = exportRows.map((row) => {
      const override = costOverrides.find((decision) => String(decision.rowId) === String(row.id));
      const rate = configuredRate(row.costMethod, pilotCardCostRates);
      const calculatedCost = override ? signed(Number(row.quantity || 0) * Number(override.unitCost || 0), row.isSale) : rate == null ? row.lineCost : signed(Number(row.netAmount || 0) * rate / 100, row.isSale);
      const grossProfit = row.costMethod === "excludedIncome" || calculatedCost == null ? "" : signed(row.netAmount, row.isSale) - Number(calculatedCost);
      return [
        row.documentType,row.documentNo,row.documentDate,sourceLabels[row.revenueSource]||row.revenueSource,row.customerCode,row.cardCode,row.cardName,row.quantity,
        row.grossAmount,row.discountAmount,row.discountPct,row.netAmount,row.vatAmount,row.invoiceTotalInclVat,
        override?"manualCost":row.costMethod,evidenceClassLabels[row.costEvidenceClass]||row.costEvidenceClass,override?.status||row.verificationStatus,row.costValidationReason,
        row.purchasePartyName,row.purchaseAccountCode,row.purchaseType,row.purchaseNo,row.purchaseDate,row.purchaseQuantity,
        row.purchaseGrossAmount,row.purchaseDiscountAmount,row.purchaseDiscountRate1,row.purchaseDiscountRate2,row.purchaseEffectiveDiscountPct,row.purchaseNetAmount,row.purchaseVatAmount,row.purchaseVatRate,
        override?.unitCost??row.unitCost,calculatedCost,grossProfit,
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
      <article><span><IconFileInvoice /></span><div><small>Filtrelenen satır</small><strong>{integer.format(data.summary?.totalRows || 0)}</strong><p>{integer.format(data.summary?.filteredNetAmount || 0)} TL net hareket</p></div></article>
      <article><span className="green"><IconCircleCheck /></span><div><small>Doğrulanan</small><strong>{integer.format((data.summary?.verifiedRows || 0) + (data.summary?.configuredRows || 0))}</strong><p>{integer.format(data.summary?.verifiedRows || 0)} fatura · {integer.format(data.summary?.configuredRows || 0)} oran</p></div></article>
      <article><span className="amber"><IconAlertTriangle /></span><div><small>İnceleme / iade kontrolü</small><strong>{integer.format(data.summary?.reviewRows || 0)}</strong><p>{integer.format(data.summary?.returnRiskRows || 0)} satırda müşteri iadesi maliyetten ayıklandı</p></div></article>
      <article><span><IconShieldCheck /></span><div><small>Kapsam dışı</small><strong>{integer.format(data.summary?.excludedRows || 0)}</strong><p>Kâra ve havuza alınmaz</p></div></article>
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

      <div className="table-scroll audit-table-wrap"><table className="audit-table"><thead><tr>
        <th /><th>Belge</th><th>Kaynak</th><th>Stok / hizmet</th><th>Miktar</th>
        <th>Satış brüt<small>KDV hariç</small></th><th>Satış iskontosu</th><th>Satış net<small>KDV hariç</small></th>
        <th>Satış KDV</th><th>Fatura toplamı<small>KDV dahil</small></th><th>Maliyet belgesi</th>
        <th>Satır maliyeti<small>KDV hariç</small></th><th>Brüt kâr<small>KDV hariç</small></th><th>Doğrulama</th>
      </tr></thead><tbody>
        {rows.map((row)=><Fragment key={row.id}>
          <tr className={expanded===row.id?"is-expanded":""}>
            <td><button className="row-action" onClick={()=>setExpanded(expanded===row.id?null:row.id)} aria-label="Detayı aç">{expanded===row.id?<IconChevronUp size={17}/>:<IconChevronDown size={17}/>}</button></td>
            <th><strong>{row.documentType}/{row.documentNo}</strong><small>{new Date(row.documentDate).toLocaleDateString("tr-TR")}</small></th>
            <td>{sourceLabels[row.revenueSource]||row.revenueSource}</td>
            <td><strong>{row.cardCode}</strong><small>{row.cardName||"—"}</small></td>
            <td>{money.format(row.quantity||0)}</td>
            <td>{formatMoney(signed(row.grossAmount,row.isSale))}</td>
            <td>{formatMoney(signed(row.discountAmount,row.isSale))}<small>%{money.format(row.discountPct||0)}</small></td>
            <td className={row.isSale?"positive":"negative"}>{formatMoney(row.netSigned)}</td>
            <td>{formatMoney(signed(row.vatAmount,row.isSale))}</td>
            <td>{formatMoney(signed(row.invoiceTotalInclVat,row.isSale))}</td>
            <td className="audit-purchase-cell"><strong>{row.purchaseNo?`${row.purchaseType}/${row.purchaseNo}`:row.configuredRate!=null?`Oran %${money.format(row.configuredRate)}`:"—"}</strong><small>{row.purchasePartyName||row.override?.reference||methodLabels[row.costMethod]}</small></td>
            <td>{row.calculatedCost==null?"—":formatMoney(row.calculatedCost)}</td>
            <td className={row.grossProfit==null?"":row.grossProfit>=0?"positive":"negative"}>{row.grossProfit==null?"—":formatMoney(row.grossProfit)}</td>
            <td><span className={`audit-status audit-status--${row.override?.status === "approved" ? "verified" : row.override ? "review" : row.verificationStatus}`}>{row.override?.status === "approved" ? "Manuel · onaylı" : row.override ? "Yönetim onayı bekliyor" : verificationLabels[row.verificationStatus]}</span>{row.returnRisk&&<span className="audit-return-flag">İade ayıklandı</span>}</td>
          </tr>
          {expanded===row.id&&<tr className="audit-detail-row"><td colSpan="14"><div className="audit-detail-grid">
            <div><small>Satış hesabı · KDV hariç</small><strong>{money.format(row.grossAmount||0)} − {money.format(row.discountAmount||0)} = {money.format(row.netAmount||0)} TL</strong><p>İskonto %{money.format(row.discountPct||0)} · CPM satır kimliği {row.id}</p></div>
            <div><small>KDV ve fatura toplamı</small><strong>{money.format(row.netAmount||0)} + {money.format(row.vatAmount||0)} = {money.format(row.invoiceTotalInclVat||0)} TL</strong><p>KDV %{money.format(row.vatRate||0)} · toplam KDV dahil</p></div>
            <div><small>Kaynak evrak</small><strong>{row.sourceDocumentNo?`${row.sourceDocumentType}/${row.sourceDocumentNo}`:"Doğrudan oluşturulmuş"}</strong><p>{sourceLabels[row.revenueSource]}{row.originalSaleNo?` · Orijinal satış ${row.originalSaleType}/${row.originalSaleNo}`:""}</p></div>
            <div><small>Seçilen maliyet belgesi</small><strong>{row.purchaseNo?`${row.purchaseType}/${row.purchaseNo}`:row.configuredRate!=null?`Yönetim oranı %${money.format(row.configuredRate)}`:"Alım faturası yok"}</strong><p>{row.purchasePartyName||evidenceClassLabels[row.costEvidenceClass]||"CPM kontrolü gerekli"}{row.purchaseDate?` · ${new Date(row.purchaseDate).toLocaleDateString("tr-TR")}`:""}</p></div>
            <div><small>Alım faturası · KDV hariç</small><strong>{row.purchaseNo?`${money.format(row.purchaseGrossAmount||0)} − ${money.format(row.purchaseDiscountAmount||0)} = ${money.format(row.purchaseNetAmount||0)} TL`:"Belge tutarı yok"}</strong><p>{row.purchaseNo?`%${money.format(row.purchaseDiscountRate1||0)} + %${money.format(row.purchaseDiscountRate2||0)} → efektif %${money.format(row.purchaseEffectiveDiscountPct||0)} · KDV ${money.format(row.purchaseVatAmount||0)} TL`:"Pilot kart veya manuel maliyet"}</p></div>
            <div><small>Maliyet ve brüt kâr · KDV hariç</small><strong>{row.override?`${money.format(row.quantity||0)} × ${money.format(row.override.unitCost)} = ${money.format(Math.abs(row.calculatedCost||0))} TL`:row.unitCost!=null?`${money.format(row.quantity||0)} × ${money.format(row.unitCost)} = ${money.format(Math.abs(row.calculatedCost||0))} TL`:row.configuredRate!=null?`${money.format(row.netAmount||0)} × %${row.configuredRate} = ${money.format(Math.abs(row.calculatedCost||0))} TL`:"Hesaba alınmadı"}</strong><p>{row.costValidationReason} KDV maliyete dahil değildir.</p>{(row.verificationStatus === "review" || row.override) && <div className="table-actions"><button className="secondary-button" onClick={() => openCostEditor(row)}><IconEdit size={16}/> {row.override ? "Kararı düzenle" : "Maliyet gir"}</button>{row.override?.status === "pending" && <button className="primary-action" onClick={() => approveManualCost(row)}><IconCheck size={16}/> Yönetim onayı ver</button>}</div>}</div>
            {row.returnRisk&&<div className="audit-return-evidence"><small>Maliyetten çıkarılan müşteri iadesi</small><strong>{row.rejectedReturnType}/{row.rejectedReturnNo}</strong><p>{row.rejectedReturnPartyName||row.rejectedReturnAccountCode||"—"}{row.rejectedReturnDate?` · ${new Date(row.rejectedReturnDate).toLocaleDateString("tr-TR")}`:""} · EFAGLN açıklamasında iade kanıtı bulundu.</p></div>}
          </div></td></tr>}
        </Fragment>)}
        {!loading&&!rows.length&&<tr><td colSpan="14" className="empty-state">Bu filtrelere uygun CPM kaydı bulunamadı.</td></tr>}
      </tbody></table></div>
      <div className="audit-pagination"><label>Sayfa boyutu <select value={pageSize} onChange={(event)=>{setPageSize(Number(event.target.value));setPage(1);}}>{[25,50,100].map((size)=><option key={size}>{size}</option>)}</select></label><span>{integer.format((page-1)*pageSize+Math.min(rows.length?1:0,1))}–{integer.format((page-1)*pageSize+rows.length)} / {integer.format(data.summary?.totalRows||0)}</span><div><button disabled={page<=1} onClick={()=>setPage((value)=>value-1)}><IconChevronLeft size={17}/> Önceki</button><button disabled={page>=totalPages} onClick={()=>setPage((value)=>value+1)}>Sonraki <IconChevronRight size={17}/></button></div></div>
    </section>
    <section className="audit-source-note"><IconDatabase size={18}/><p>Kaynak: CPM STKHAR, STKKRT, CARKRT ve EFAGLN. Tip 9/609 belgeler e-Fatura iade kanıtından geçirilir; müşteri iadeleri maliyet adayı olamaz. CPM’e veri yazılmaz.</p><IconFilter size={18}/></section>
    {costEditor && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setCostEditor(null)}><section className="modal employee-modal" role="dialog" aria-modal="true" aria-labelledby="manual-cost-title"><button className="modal-close" onClick={() => setCostEditor(null)} aria-label="Kapat"><IconX size={19}/></button><p className="eyebrow">Uygulama içi maliyet kararı</p><h2 id="manual-cost-title">{costEditor.row.cardCode} · {costEditor.row.documentNo}</h2><p className="employee-modal__lead">Bu karar CPM’ye yazılmaz. {settings.requireManagementApprovalForManualCost ? "Yönetim onayına kadar kesin havuza alınmaz." : "Kaydedildiğinde havuz hesabına katılır."}</p><div className="form-grid form-grid--2"><label className="settings-field"><span>Birim maliyet (TL)</span><input type="number" min="0" value={costEditor.unitCost} onChange={(event)=>setCostEditor({...costEditor,unitCost:event.target.value})}/></label><label className="settings-field"><span>Dayanak / neden</span><select value={costEditor.reason} onChange={(event)=>setCostEditor({...costEditor,reason:event.target.value})}><option value="">Seçin</option><option>Teklif veya tedarikçi belgesi</option><option>Sonraki alım teyidi</option><option>Yönetim maliyet kararı</option><option>Diğer doğrulanmış kaynak</option></select></label><label className="settings-field"><span>Belge / referans</span><input value={costEditor.reference} onChange={(event)=>setCostEditor({...costEditor,reference:event.target.value})} placeholder="Belge no veya açıklama"/></label><label className="settings-field"><span>Not</span><input value={costEditor.note} onChange={(event)=>setCostEditor({...costEditor,note:event.target.value})} placeholder="İnceleme notu"/></label></div><div className="employee-modal__actions"><button className="secondary-button" onClick={()=>setCostEditor(null)}>Vazgeç</button><button className="primary-action" onClick={saveManualCost} disabled={!costEditor.reason || costEditor.unitCost === ""}><IconCheck size={17}/> Maliyet kararını kaydet</button></div></section></div>}
  </main>;
}
