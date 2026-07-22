import { useEffect, useMemo, useRef, useState } from "react";
import {
  IconAlertTriangle,
  IconChartBar,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconCircleCheck,
  IconClock,
  IconDatabase,
  IconFileInvoice,
  IconHistory,
  IconLock,
  IconRefresh,
  IconScale,
  IconSearch,
  IconShieldCheck,
  IconTargetArrow,
  IconUsers,
} from "@tabler/icons-react";

const number = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const money = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const stageOptions = [
  ["", "Tüm aşamalar"], ["offer", "Teklif"], ["order", "Sipariş"],
  ["fulfillment", "Teslimat"], ["retail", "Peşin / perakende"],
  ["invoiced", "Faturalandı"], ["correction", "İade / düzeltme"], ["other", "Diğer"],
];

const confidenceLabels = { high: "Yüksek", medium: "Orta", low: "Düşük" };
const issueLabels = {
  "multiple-customers": "Birden fazla cari kodu",
  "missing-header": "Başlık kaydı eksik",
  "missing-history": "Kullanıcı geçmişi eksik",
  "unresolved-source": "Kaynak evrak çözülemedi",
};
const controlLabels = { pass: "Geçti", warning: "İncele", fail: "Başarısız", blocked: "Blokeli" };

const dimensions = [
  [IconChartBar, "Katkı", "Seçilen dönemde satış vakasına eklenen doğrulanabilir ekonomik ve operasyonel değer."],
  [IconTargetArrow, "Performans", "Benzer rol, koşul ve zorluktaki işleri ne kadar istikrarlı yürüttüğü."],
  [IconUsers, "Yetenek", "Farklı vakalarda tekrar eden ve başkalarına aktarılabilen çalışma becerisi."],
  [IconScale, "Potansiyel", "Yapılandırılmış gelişim görüşmesi gerektirir; CPM hareketlerinden otomatik çıkarılmaz."],
];

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString("tr-TR") : "—";
}

function formatTimestamp(value) {
  return value ? new Date(value).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "—";
}

export function PerformancePage({ year, onNavigate }) {
  const [data, setData] = useState({ rows: [], total: 0, summary: null, quality: null, mode: "loading" });
  const [filters, setFilters] = useState({ search: "", stage: "", confidence: "" });
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [expanded, setExpanded] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const forceRefreshRef = useRef(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedSearch(filters.search.trim()); setPage(1); }, 350);
    return () => window.clearTimeout(timer);
  }, [filters.search]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ year, page, pageSize });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (filters.stage) params.set("stage", filters.stage);
    if (filters.confidence) params.set("confidence", filters.confidence);
    if (forceRefreshRef.current) {
      params.set("refresh", "1");
      forceRefreshRef.current = false;
    }
    setLoading(true);
    fetch(`/api/sales-cases?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Satış vakaları okunamadı.");
        return payload;
      })
      .then((payload) => setData(payload))
      .catch((error) => {
        if (error.name !== "AbortError") setData({ rows: [], total: 0, summary: null, quality: null, mode: "error", error: error.message });
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [year, page, pageSize, debouncedSearch, filters.stage, filters.confidence, refreshKey]);

  useEffect(() => { setPage(1); setExpanded(null); }, [year]);

  const totalPages = Math.max(1, Math.ceil((data.total || 0) / pageSize));
  const controls = data.quality?.controls || [];
  const controlCounts = useMemo(() => controls.reduce((acc, item) => ({ ...acc, [item.status]: (acc[item.status] || 0) + 1 }), {}), [controls]);
  const summary = data.summary;

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    if (key !== "search") setPage(1);
    setExpanded(null);
  };

  return (
    <main className="page performance-page" id="top">
      <section className="page-heading performance-heading">
        <div>
          <p className="eyebrow">Marlin Nexus · Gerçek satış vakaları</p>
          <h1>Katkı &amp; Performans</h1>
          <p>Tekliften fatura ve iadeye kadar CPM evraklarını tek ekonomik vakada birleştirir; kişi puanına geçmeden önce kanıt ve adalet kapılarını denetler.</p>
        </div>
        <div className="performance-heading__actions">
          <span className={`live-state live-state--${data.mode}`}>{data.mode === "live" ? <IconCircleCheck /> : <IconAlertTriangle />} {data.mode === "live" ? "CPM · Canlı ve salt okunur" : data.mode === "loading" ? "CPM okunuyor" : "Gerçek veri kullanılamıyor"}</span>
          <button className="secondary-button" onClick={() => { forceRefreshRef.current = true; setRefreshKey((value) => value + 1); }} disabled={loading}><IconRefresh size={17} className={loading ? "spin" : ""} /> Yenile</button>
        </div>
      </section>

      <section className="nexus-boundary" aria-label="Marlin Nexus veri sınırı">
        <div className="nexus-boundary__source"><IconDatabase size={22} /><span><small>Kaynak sistem</small><strong>CPM · Salt okunur</strong></span></div>
        <div className="nexus-boundary__flow"><span /><span /><span /></div>
        <div className="nexus-boundary__product"><IconLock size={22} /><span><small>Vaka ve karar katmanı</small><strong>Marlin Nexus · Yönetilen veri</strong></span></div>
        <p>CPM’e yazılmaz. Bağlantılar iki yıllık pencerede kurulur; finansal sonuç yalnız {year} içindeki aktif ve tekilleştirilmiş terminal evraklarından hesaplanır.</p>
      </section>

      {data.error && <section className="performance-error"><IconAlertTriangle /><div><strong>Gerçek veri ekranı oluşturulamadı</strong><p>{data.error}</p></div></section>}

      {summary && <section className="case-kpis">
        <article><span><IconFileInvoice /></span><small>Satış vakası</small><strong>{number.format(summary.totalCases)}</strong><p>{number.format(summary.totalDocuments)} aktif evraktan</p></article>
        <article><span><IconHistory /></span><small>Bağlı vaka</small><strong>%{percent.format(summary.linkedCasePct)}</strong><p>{number.format(summary.linkedCaseCount)} çok evraklı vaka</p></article>
        <article><span className="green"><IconCheck /></span><small>Terminal vaka</small><strong>{number.format(summary.terminalCases)}</strong><p>{number.format(summary.openCases)} açık süreç</p></article>
        <article><span><IconChartBar /></span><small>Tekilleştirilmiş net satış</small><strong>{money.format(summary.netSales)} TL</strong><p>KDV hariç · {year}</p></article>
        <article><span className="amber"><IconShieldCheck /></span><small>91→85 çift sayım önleme</small><strong>{number.format(summary.prepaidDeduplicatedDocuments)}</strong><p>{number.format(summary.casesWith91And85)} bağlı vakada</p></article>
        <article><span className="violet"><IconScale /></span><small>Yüksek güvenli vaka</small><strong>%{percent.format(summary.highConfidencePct)}</strong><p>{number.format(summary.highConfidenceCases)} vaka</p></article>
      </section>}

      {data.quality && <div className="quality-layout">
        <section className="panel quality-panel">
          <div className="panel-heading quality-panel__head"><div><p className="eyebrow">Otomatik kontrol mekanizmaları</p><h2>Veri güven kapıları</h2><p>Her yenilemede kaynak, geçmiş, bağlantı ve tekilleştirme kontrolleri yeniden hesaplanır.</p></div><div className="quality-summary"><span className="pass">{controlCounts.pass || 0} geçti</span><span className="warning">{(controlCounts.warning || 0) + (controlCounts.fail || 0)} inceleme</span><span className="blocked">{controlCounts.blocked || 0} blokeli</span></div></div>
          <div className="control-grid">
            {controls.map((control) => <article key={control.id} className={`control-card control-card--${control.status}`}><div><span>{control.status === "pass" ? <IconCheck /> : control.status === "blocked" ? <IconLock /> : <IconAlertTriangle />}</span><small>{controlLabels[control.status]}</small></div><strong>{control.label}</strong><p>{control.value}</p></article>)}
          </div>
          <div className="quality-foot"><span><IconClock size={16} /> Veri zamanı: {formatTimestamp(data.quality.generatedAt)}</span><span>Pencere: {data.quality.sourceWindow.from} – {data.quality.sourceWindow.to}</span><span>Saat dilimi: Europe/Istanbul</span></div>
        </section>
        <aside className="panel scoring-gate">
          <span className="scoring-gate__icon"><IconLock /></span>
          <p className="eyebrow">Kişi puanı kapısı</p>
          <h2>Şimdilik kapalı</h2>
          <p>{number.format(data.quality.rawActorCount)} CPM kullanıcı kodu bulundu; doğrulanmış çalışan eşleşmesi, tahsilat mutabakatı ve 200 vaka incelemesi tamamlanmadı.</p>
          <ul><li><IconCheck /> Takım ve süreç analizi kullanılabilir</li><li><IconCheck /> Vaka bazlı kayıt izi incelenebilir</li><li><IconLock /> Ücret, disiplin veya sıralama üretilemez</li></ul>
        </aside>
      </div>}

      <section className="panel case-explorer">
        <div className="case-explorer__head"><div><p className="eyebrow">Kaynak bağlantılı kayıt izi</p><h2>Gerçek satış vakaları</h2><p>{loading ? "CPM verisi işleniyor…" : `${number.format(data.total || 0)} vaka · sayfa ${page}/${totalPages}`}</p></div><button className="secondary-button" onClick={() => onNavigate("audit")}>Finansal veri denetimi <IconChevronRight size={17} /></button></div>
        <div className="case-filters">
          <label className="case-search"><IconSearch size={18} /><input value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} placeholder="Vaka, evrak, cari veya CPM kullanıcı kodu ara" /></label>
          <label><span>Aşama</span><select value={filters.stage} onChange={(event) => updateFilter("stage", event.target.value)}>{stageOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>Kanıt güveni</span><select value={filters.confidence} onChange={(event) => updateFilter("confidence", event.target.value)}><option value="">Tümü</option><option value="high">Yüksek</option><option value="medium">Orta</option><option value="low">Düşük</option></select></label>
          {(filters.search || filters.stage || filters.confidence) && <button className="clear-filter" onClick={() => { setFilters({ search: "", stage: "", confidence: "" }); setPage(1); }}>Filtreleri temizle</button>}
        </div>
        <div className="table-scroll"><table className="case-table"><thead><tr><th /><th>Vaka</th><th>Son hareket</th><th>Aşama</th><th>Evrak</th><th>Kullanıcı kodu</th><th>Net satış<small>KDV hariç</small></th><th>Kanıt güveni</th></tr></thead><tbody>
          {data.rows?.map((item) => <CaseRows key={item.caseId} item={item} expanded={expanded === item.caseId} onToggle={() => setExpanded(expanded === item.caseId ? null : item.caseId)} />)}
          {!loading && !data.rows?.length && <tr><td colSpan="8" className="empty-state">Bu filtrelerde gerçek satış vakası bulunamadı.</td></tr>}
        </tbody></table></div>
        <div className="case-pagination"><label>Sayfa boyutu <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>{[10,25,50,100].map((size) => <option key={size}>{size}</option>)}</select></label><span>{data.total ? number.format((page - 1) * pageSize + 1) : 0}–{number.format(Math.min(page * pageSize, data.total || 0))} / {number.format(data.total || 0)}</span><div><button disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><IconChevronLeft size={17} /> Önceki</button><button disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>Sonraki <IconChevronRight size={17} /></button></div></div>
      </section>

      <section className="panel performance-model compact-model">
        <div className="panel-heading"><div><p className="eyebrow">Değerlendirme sözleşmesi</p><h2>Tek puan yok; dört ayrı mercek var</h2></div></div>
        <div className="performance-dimensions">{dimensions.map(([Icon, title, description]) => <article key={title}><span className="dimension-icon"><Icon size={21} /></span><h3>{title}</h3><p>{description}</p></article>)}</div>
      </section>
    </main>
  );
}

function CaseRows({ item, expanded, onToggle }) {
  return <>
    <tr className={expanded ? "is-expanded" : ""}>
      <td><button className="row-action" onClick={onToggle} aria-label={`${item.caseId} detayını ${expanded ? "kapat" : "aç"}`}>{expanded ? <IconChevronUp size={17} /> : <IconChevronDown size={17} />}</button></td>
      <th><strong>{item.caseId}</strong><small>{item.customerCode} · {formatDate(item.startDate)}</small></th>
      <td>{formatDate(item.lastDate)}</td>
      <td><span className={`case-stage case-stage--${item.stage}`}>{item.stageLabel}</span></td>
      <td><strong>{number.format(item.documentCount)}</strong><small>{number.format(item.lineCount)} satır</small></td>
      <td><strong>{number.format(item.actorCount)}</strong><small>doğrulanmamış kod</small></td>
      <td className={item.netSales >= 0 ? "positive" : "negative"}>{item.economicDocumentCount ? `${money.format(item.netSales)} TL` : "Terminal evrak yok"}</td>
      <td><span className={`confidence confidence--${item.confidence}`}>{confidenceLabels[item.confidence]}</span>{item.issueCount > 0 && <small>{item.issueCount} kontrol notu</small>}</td>
    </tr>
    {expanded && <tr className="case-detail-row"><td colSpan="8"><div className="case-detail">
      <section><h3>Evrak zinciri</h3><div className="document-chain">{item.documents.map((document, index) => <article key={document.documentKey} className={!document.isActiveDocument ? "inactive" : ""}><div><span>{index + 1}</span>{index < item.documents.length - 1 && <i />}</div><section><strong>{document.documentType}/{document.documentNo}</strong><small>{document.documentTypeLabel} · {formatDate(document.documentDate)}</small><p>{number.format(document.lineCount)} satır · {money.format(document.netAmount)} TL · {document.isActiveDocument ? "Aktif" : "Kaynak izi / pasif"}</p></section></article>)}</div></section>
      <section><h3>CPM kullanıcı kodları <small>Doğrulanmış personel değildir</small></h3><div className="actor-list">{item.actors.length ? item.actors.map((actor) => <span key={actor.code}><strong>{actor.code}</strong><small>{number.format(actor.actionCount)} geçmiş/onay kaydı</small></span>) : <p>Kullanıcı geçmişi bulunamadı.</p>}</div></section>
      <section className="case-evidence-summary"><div><small>Ekonomik evrak</small><strong>{number.format(item.economicDocumentCount)}</strong></div><div><small>Peşin evrak izi</small><strong>{number.format(item.prepaidDocumentCount)}</strong></div><div><small>91→85 tekilleştirilen</small><strong>{number.format(item.prepaidDeduplicated)}</strong></div><div><small>Tahsilat kanıtı</small><strong>{item.settlementStatus === "unverified" ? "Doğrulanmadı" : "Uygulanmaz"}</strong></div>{item.issues.length > 0 && <div className="case-issues"><small>Kontrol notları</small><p>{item.issues.map((issue) => issueLabels[issue] || issue).join(" · ")}</p></div>}</section>
    </div></td></tr>}
  </>;
}
