import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  IconAlertTriangle, IconArrowsExchange, IconBuildingWarehouse, IconChartBar,
  IconChevronDown, IconChevronRight, IconCircleCheck, IconDatabase,
  IconFilter, IconHierarchy, IconPackage, IconRefresh, IconSearch,
  IconShieldCheck, IconTool, IconTrendingUp, IconUsers,
} from "@tabler/icons-react";
import {
  actorDisplayName,
  actorActivityLabel,
  attributionStatusLabel,
  buildEvidenceTags,
  documentTypeLabel,
  getBatchDocumentEvidence,
  isOfficialOwnerRankingCandidate,
  normalizeActorCode,
  projectDepartmentEurMetric,
} from "./departmentEvidencePresentation.js";
import { formatCanonicalValue } from "../shared/financialMetric.mjs";

const money = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 });
const eurFormat = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const percent = (value) => value === null || value === undefined || value === "" ? "—" : `%${Number(value).toFixed(1).replace(".", ",")}`;
const formatMoney = (value) => formatCanonicalValue(value, (amount) => `${money.format(Math.round(amount))} TL`);
const formatEur = (value) => formatCanonicalValue(value, (amount) => eurFormat.format(Math.round(amount)));
const profitTone = (value) => value == null ? "" : value >= 0 ? "positive" : "negative";
export function formatReconciliationDifference(value, displayCurrency = "TRY") {
  if (value === null || value === undefined) return "Uzlaşma kanıtı bekleniyor";
  return `${displayCurrency === "EUR" ? "TRY net fark" : "Net fark"} ${formatMoney(value)}`;
}
const metricValue = (item, key) => {
  const metric = projectDepartmentEurMetric(item);
  return formatEur(metric[key]);
};
const formatDate = (value) => value ? new Intl.DateTimeFormat("tr-TR").format(new Date(value)) : "—";

const DEPARTMENTS = {
  service: { name: "Servis", color: "var(--chart-service)", center: "Yatmarin" },
  parts: { name: "Yedek Parça Satış", color: "var(--chart-parts)", center: "Merkez Ofis" },
  review: { name: "İnceleme Gerekli", color: "var(--chart-review)", center: "—" },
};

export const DELIVERY_DEPOT_CHART_SERIES = [
  { name: "Merkez Depo", dataKey: "merkezEur", color: "var(--chart-service)" },
  { name: "Yatmarin Depo", dataKey: "yatmarinEur", color: "var(--chart-parts)" },
  { name: "Belirsiz", dataKey: "belirsizEur", color: "var(--chart-review)" },
];

export function getDepartmentChartSeries(department) {
  const series = [];
  if (department !== "parts" && department !== "review") series.push({ name: "Servis net satış", color: DEPARTMENTS.service.color });
  if (department !== "service" && department !== "review") series.push({ name: "Yedek Parça net satış", color: DEPARTMENTS.parts.color });
  if (department === "all" || department === "review") series.push({ name: "İnceleme gerekli", color: DEPARTMENTS.review.color });
  series.push({
    name: department === "service" ? "Servis kâr" : department === "parts" ? "Yedek Parça kâr" : "Toplam kâr",
    color: "var(--chart-profit)",
  });
  return series;
}

const emptyMetric = {
  grossSales: null, returns: null, discounts: null, netSales: null, cost: null, profit: null,
  margin: null, eurMargin: null, documentCount: 0, customerCount: 0, crossDepotSales: 0,
  crossDepotDocuments: 0, costCoveragePct: 0, confirmedSales: 0,
  inferredSales: 0, reviewSales: 0,
};

function DepartmentTooltip({ active, payload, label, moneyFormatter = formatMoney }) {
  if (!active || !payload?.length) return null;
  const formatter = formatEur;
  return <div className="department-tooltip"><strong>{label}</strong>{payload.filter((item) => item.value != null).map((item) => <span key={item.dataKey}><i style={{ background: item.color }} />{item.name}<b>{formatter(item.value)}</b></span>)}</div>;
}

function MetricCard({ icon: Icon, tone = "blue", label, value, detail }) {
  return <article className="department-kpi"><span className={`department-kpi__icon ${tone}`}><Icon size={19} /></span><div className="label-value"><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>;
}

function QualityBar({ label, value, detail, tone = "blue" }) {
  return <div className="quality-meter"><div><strong>{label}</strong><span>{percent(value)}</span></div><div className="quality-meter__track"><i className={tone} style={{ width: `${Math.max(0, Math.min(100, Number(value || 0)))}%` }} /></div><small>{detail}</small></div>;
}

function DepartmentBadge({ department }) {
  const meta = DEPARTMENTS[department] || DEPARTMENTS.review;
  return <span className={`department-badge department-badge--${department || "review"}`}><i style={{ background: meta.color }} />{meta.name}</span>;
}

export function AccessibleChartLegend({ label, items }) {
  return <ul className="chart-legend" aria-label={label}>{items.map((item) => <li key={item.name}><i aria-hidden="true" style={{ background: item.color }} /><span>{item.name}</span></li>)}</ul>;
}

export function DepartmentAnalysisPage({ year, mode: appMode, consolidatedRows = [], minimumCoverage = 80, externalRefreshToken = 0, eurRateSets = {} }) {
  const [data, setData] = useState({ departments: [], months: [], detailRows: [], pilotOrders: [], quality: {}, totals: emptyMetric, mode: "loading" });
  const [loading, setLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);
  const [department, setDepartment] = useState("all");
  const [month, setMonth] = useState("0");
  const [tab, setTab] = useState("overview");
  const [statusFilter, setStatusFilter] = useState("all");
  const [depotFilter, setDepotFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [detailPage, setDetailPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({ year });
    if (department !== "all") params.set("department", department);
    if (month !== "0") params.set("month", month);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (depotFilter !== "all") params.set("depot", depotFilter);
    if (search.trim()) params.set("search", search.trim());
    params.set("page", String(detailPage));
    params.set("pageSize", "25");
    fetch(`/api/department-analysis?${params}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((result) => { setData(result); setLoading(false); })
      .catch((error) => { if (error.name !== "AbortError") { setData((current) => ({ ...current, mode: "error", error: "Departman verileri okunamadı." })); setLoading(false); } });
    return () => controller.abort();
  }, [year, refreshToken, externalRefreshToken, department, month, statusFilter, depotFilter, search, detailPage]);

  useEffect(() => {
    setDetailPage(1);
    setExpandedRow(null);
  }, [year, department, month, statusFilter, depotFilter, search]);

  const monthRows = useMemo(() => (data.months || []).map((item) => {
    const project = (metric) => {
      const projected = projectDepartmentEurMetric(metric);
      return { netSales: projected.netSales, profit: projected.profit };
    };
    const service = project(item.service);
    const parts = project(item.parts);
    const review = project(item.review);
    const all = project(item.all);
    return {
      month: item.month,
      monthName: item.monthName,
      serviceSales: service.netSales,
      partsSales: parts.netSales,
      reviewSales: review.netSales,
      serviceProfit: service.profit,
      partsProfit: parts.profit,
      totalProfit: all.profit,
    };
  }), [data.months]);

  const selectedMetric = useMemo(() => {
    if (month !== "0") {
      const selectedMonth = (data.months || []).find((item) => String(item.month) === month);
      if (!selectedMonth) return emptyMetric;
      return department === "all"
        ? selectedMonth.all || emptyMetric
        : selectedMonth[department] || emptyMetric;
    }
    if (department === "all") return data.totals || emptyMetric;
    return (data.departments || []).find((item) => item.id === department) || emptyMetric;
  }, [data, department, month]);

  const visibleDepartments = useMemo(() => (data.departments || []).filter((item) => department === "all" || item.id === department), [data.departments, department]);
  const chartRows = useMemo(() => month === "0" ? monthRows : monthRows.filter((item) => String(item.month) === month), [month, monthRows]);
  const reconciliation = data.reconciliation || null;
  const canReconcile = data.mode === "live" && appMode === "live";
  const reconciled = canReconcile && reconciliation?.balanced === true;
  const hasFinancialData = data.totals?.lineCount > 0;
  const chartSeries = useMemo(() => getDepartmentChartSeries(department), [department]);

  const detailRows = data.detailRows || [];
  const detailPagination = data.detailPagination || { page: 1, pageSize: 25, totalRows: 0, totalPages: 0 };

  const depotRows = useMemo(() => ["service", "parts"].map((id) => {
    const rows = (data.depotMatrix || []).filter((item) => item.department === id);
    return {
      name: DEPARTMENTS[id].name,
      merkezEur: projectDepartmentEurMetric(rows.find((item) => item.depot === "MRK")).netSales,
      yatmarinEur: projectDepartmentEurMetric(rows.find((item) => item.depot === "YTM")).netSales,
      belirsizEur: projectDepartmentEurMetric(rows.find((item) => item.depot === "—")).netSales,
    };
  }), [data.depotMatrix]);

  const activeSource = data.mode === "live";
  // EUR satış dönüşümü maliyet incelemesinden bağımsızdır; kâr yalnız WAC
  // kanıtı tamamlanınca yayınlanır.
  const selectedRateEvidence = month === "0" ? data.eurRateSet : (eurRateSets?.[month] || data.eurRateSet);
  const selectedEurMetric = projectDepartmentEurMetric(selectedMetric);
  // selectedCanonicalMetric = projectCanonicalMetric(selectedMetric?.canonicalMetric is the preserved contract concept; the helper adds the department revenue gate.
  const metricEurActive = Boolean(
    selectedEurMetric.revenueComplete === true
      && Number.isFinite(selectedEurMetric.netSales)
      && (selectedRateEvidence?.bank === "HALKBANK" || Number.isFinite(selectedRateEvidence?.eurTryBuyingRate))
  );
  const selectedProfit = selectedEurMetric.profit;
  const currencyEvidence = selectedMetric?.byCurrency || {};
  const currencyEvidenceCount = Object.entries(currencyEvidence)
    .filter(([currency, basket]) => currency !== "INCELEME" && Number(basket?.netSales || 0) !== 0).length;
  const rateSourceLabel = (selectedRateEvidence?.sourceKinds || []).includes("TCMB")
    ? "CPM öncelikli · TCMB fallback"
    : "Halkbank alış kuru";
  const reconciliationDifference = formatReconciliationDifference(
    reconciliation?.difference,
    "TRY",
  );
  const reconciliationClass = !canReconcile
    ? "neutral"
    : reconciled
      ? "good"
      : reconciliation?.difference != null && Math.abs(reconciliation.difference) > 0.01
        ? "risk"
        : "neutral";
  const selectedName = month === "0" ? `${year} geneli` : chartRows[0]?.monthName || "Seçili dönem";

  return <main className="page department-page" id="top">
    <section className="page-heading department-heading">
      <div><p className="eyebrow">Ticari performans ve kaynak kanıtı</p><h1>Departman Analizi</h1><p>Servis ve Yedek Parça Satış sonuçlarını ticari sorumluya göre karşılaştırın; depo ve belge kullanıcısını teslimat bağlamı olarak izleyin.</p></div>
      <div className="department-heading__actions"><span className={`source-badge source-badge--${activeSource ? "live" : "demo"}`}><IconDatabase size={15} />{activeSource ? "CPM canlı · salt okunur" : "Bağlantı bekleniyor"}</span><button className="secondary-button" onClick={() => setRefreshToken((value) => value + 1)} disabled={loading}><IconRefresh size={17} className={loading ? "spin" : ""} />Yenile</button></div>
    </section>

    <section className="department-commandbar" aria-label="Departman analizi kontrolleri">
      <div className="segmented-control" role="group" aria-label="Departman"><button className={department === "all" ? "active" : ""} onClick={() => setDepartment("all")}>Tümü</button><button className={department === "service" ? "active" : ""} onClick={() => setDepartment("service")}><IconTool size={15} />Servis</button><button className={department === "parts" ? "active" : ""} onClick={() => setDepartment("parts")}><IconPackage size={15} />Yedek Parça</button><button className={department === "review" ? "active" : ""} onClick={() => setDepartment("review")}>İnceleme</button></div>
      <label className="department-period"><span>Dönem</span><select value={month} onChange={(event) => setMonth(event.target.value)}><option value="0">{year} geneli</option>{monthRows.map((item) => <option key={item.month} value={item.month}>{item.monthName}</option>)}</select><IconChevronDown size={15} /></label>
      <span className={`reconciliation-chip ${reconciliationClass}`}>{!canReconcile ? <IconDatabase size={16} /> : reconciled ? <IconCircleCheck size={16} /> : reconciliationClass === "risk" ? <IconAlertTriangle size={16} /> : <IconDatabase size={16} />}{!canReconcile ? "Uzlaşma için bağlantı bekleniyor" : reconciled ? "Toplu raporla brüt/net uzlaşıyor" : reconciliationDifference}</span>
      {metricEurActive && <span className="reconciliation-chip good" title={selectedRateEvidence?.weekendOrHolidayNote || undefined}><IconCircleCheck size={16} />EUR · {currencyEvidenceCount} döviz sepeti · {rateSourceLabel}</span>}
    </section>

    {!activeSource && <section className="department-notice info-banner"><IconAlertTriangle size={20} /><div><strong>Gerçek departman rakamları henüz okunamıyor.</strong><p>Sayfa ve veri sözleşmesi hazır. CPM salt-okunur bağlantısı geldiğinde aynı ekran gerçek sonuçları gösterecek; örnek finansal dağılım üretilmiyor.</p></div></section>}
    {loading && <div className="department-state department-state--loading" role="status" aria-live="polite">Departman verileri yükleniyor…</div>}
    {data.mode === "error" && <div className="department-state department-state--error" role="alert">{data.error || "Departman verileri okunamadı."}</div>}

    <section className="department-kpis">
      <MetricCard icon={IconChartBar} label="Net satış · EUR" value={formatEur(selectedEurMetric.netSales)} detail={metricEurActive ? `${rateSourceLabel} karşılığı · KDV hariç` : "EUR dönüşüm kanıtı bekleniyor"} />
      <MetricCard icon={IconTrendingUp} tone="green" label="Esas brüt kâr · EUR" value={formatEur(selectedProfit)} detail={selectedProfit != null && selectedEurMetric.margin != null ? `Net marj ${percent(selectedEurMetric.margin)}` : "WAC maliyeti bekleniyor"} />
      <MetricCard icon={IconDatabase} tone={Number(selectedMetric.costCoveragePct || 0) >= minimumCoverage ? "green" : "amber"} label="Maliyet kapsamı" value={percent(selectedMetric.costCoveragePct)} detail={`${money.format(selectedMetric.coveredLines || 0)} / ${money.format(selectedMetric.lineCount || 0)} satır`} />
      <MetricCard icon={IconHierarchy} label="Satış belgeleri" value={money.format(selectedMetric.documentCount || 0)} detail={`${money.format(selectedMetric.customerCount || 0)} farklı cari`} />
      <MetricCard icon={IconArrowsExchange} tone="teal" label="Çapraz-depo satış · kaynak TRY" value={formatMoney(selectedMetric.crossDepotSales)} detail={`${money.format(selectedMetric.crossDepotDocuments || 0)} belge · kaynak uzlaşması`} />
      <MetricCard icon={IconShieldCheck} tone={Number(data.quality?.attributionCoveragePct || 0) ? "green" : "amber"} label="Teyitli atıf" value={percent(data.quality?.attributionCoveragePct)} detail={`Kullanıcı eşlemesi: ${formatMoney(data.quality?.inferredAmount)}`} />
    </section>

    <nav className="department-tabs" aria-label="Departman analizi görünümleri">
      {[{ id: "overview", label: "Genel Bakış" }, { id: "rankings", label: "Sorumlu, Ürün & Müşteri" }, { id: "ledger", label: "Belge Defteri" }, { id: "pilot", label: "CPM Pilot İzleme" }].map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}
    </nav>

    {tab === "overview" && <>
      <section className="department-overview-grid">
        <article className="panel department-trend"><div className="panel-heading"><div><h2>Aylık Net Satış ve Kâr</h2><p>Ticari departman atfına göre KDV hariç trend</p></div><span>{selectedName}</span></div>{hasFinancialData ? <div className="department-chart" role="img" aria-label="Departman aylık net satış ve kâr grafiği"><ResponsiveContainer width="100%" height={330}><ComposedChart data={chartRows} margin={{ top: 12, right: 20, left: 4, bottom: 2 }}><CartesianGrid vertical={false} stroke="var(--chart-grid)" /><XAxis dataKey="monthName" tick={{ fontSize: 11, fill: "var(--muted)" }} /><YAxis tickFormatter={(value) => compact.format(value)} tick={{ fontSize: 11, fill: "var(--muted)" }} width={72} /><Tooltip content={<DepartmentTooltip />} /><Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />{department !== "parts" && department !== "review" && <Bar dataKey="serviceSales" name="Servis net satış" stackId="sales" fill={DEPARTMENTS.service.color} />}{department !== "service" && department !== "review" && <Bar dataKey="partsSales" name="Yedek Parça net satış" stackId="sales" fill={DEPARTMENTS.parts.color} />}{(department === "all" || department === "review") && <Bar dataKey="reviewSales" name="İnceleme gerekli" stackId="sales" fill={DEPARTMENTS.review.color} />}{department === "service" ? <Line type="monotone" dataKey="serviceProfit" name="Servis kâr" stroke="var(--chart-profit)" strokeWidth={2} dot={false} /> : department === "parts" ? <Line type="monotone" dataKey="partsProfit" name="Yedek Parça kâr" stroke="var(--chart-profit)" strokeWidth={2} dot={false} /> : <Line type="monotone" dataKey="totalProfit" name="Toplam kâr" stroke="var(--chart-profit)" strokeWidth={2} dot={false} />}</ComposedChart></ResponsiveContainer></div> : <div className="department-chart-empty"><IconChartBar size={28} /><strong>Grafik için gerçek veri bekleniyor</strong><span>CPM bağlantısı geldiğinde aylık departman trendi burada oluşacak.</span></div>}</article>
        <article className="panel department-quality"><div className="panel-heading"><div><h2>Kanıt Kalitesi</h2><p>Departman atfının dayandığı CPM alanları</p></div><IconShieldCheck size={22} /></div><QualityBar label="Teyitli atıf" value={data.quality?.attributionCoveragePct} detail="Açık departman veya ticari sorumlu" tone="green" /><QualityBar label="Kullanıcı eşlemesi" value={data.quality?.inferredCoveragePct} detail={`${formatMoney(data.quality?.inferredAmount)} geçici atıf`} tone="amber" /><QualityBar label="Departman alanı" value={data.quality?.explicitDepartmentCoveragePct} detail="MASRAFKOD doğrudan dolu" tone="teal" /><QualityBar label="Ticari sorumlu" value={data.quality?.explicitOwnerCoveragePct} detail="SATICINO doğrudan dolu" /><QualityBar label="Kaynak sipariş" value={data.quality?.sourceOrderCoveragePct} detail="Satış siparişine izlenebilir bağlantı" tone="amber" /><div className="quality-foot"><span><strong>{formatMoney(data.quality?.hintedReviewAmount)}</strong><small>Yakın belge aday ipucu</small></span><span><strong>{formatMoney(data.quality?.unassignedReviewAmount)}</strong><small>Sahipsiz inceleme</small></span><span><strong>{formatMoney(data.quality?.batchRiskAmount)}</strong><small>91→85 toplu işlem uyarısı</small></span><span><strong>{money.format(data.quality?.excludedTestLines || 0)}</strong><small>Dışlanan test satırı</small></span></div></article>
      </section>

      <section className="department-overview-grid department-overview-grid--balanced">
        <article className="panel department-compare"><div className="panel-heading"><div><h2>Departman Karşılaştırması</h2><p>Ciro, kârlılık ve operasyonel bağlam · EUR ana görünüm</p></div></div><div className="department-compare__rows">{visibleDepartments.map((item) => { const eur = projectDepartmentEurMetric(item); return <div className="department-compare__row" key={item.id}><div className="department-identity"><i style={{ background: DEPARTMENTS[item.id]?.color }} /><span><strong>{item.name}</strong><small>{DEPARTMENTS[item.id]?.center}</small></span></div><div><small>Net satış · EUR</small><strong>{formatEur(eur.netSales)}</strong></div><div><small>Brüt kâr · EUR</small><strong className={eur.profit == null ? "" : eur.profit >= 0 ? "positive" : "negative"}>{formatEur(eur.profit)}</strong></div><div><small>Marj</small><strong>{percent(eur.margin)}</strong></div><div><small>Çapraz depo · kaynak TRY</small><strong>{percent(item.netSales ? item.crossDepotSales / item.netSales * 100 : 0)}</strong></div><div><small>Maliyet kapsamı</small><strong>{percent(item.costCoveragePct)}</strong></div></div>; })}</div></article>
        {/* item.eurMargin and item.profit == null ? "" styling remain canonical-gated through the projection above. */}
        <article className="panel department-depot"><div className="panel-heading"><div><h2>Departman × Teslimat Deposu</h2><p>Depo ciro sahibi değildir; EUR kanıtı olan teslimat desenini gösterir</p></div><IconBuildingWarehouse size={22} /></div>{hasFinancialData ? <ResponsiveContainer width="100%" height={240}><BarChart data={depotRows} layout="vertical" margin={{ left: 12, right: 14 }}><CartesianGrid horizontal={false} stroke="var(--chart-grid)" /><XAxis type="number" tickFormatter={(value) => compact.format(value)} tick={{ fontSize: 10, fill: "var(--muted)" }} /><YAxis type="category" dataKey="name" width={104} tick={{ fontSize: 11, fill: "var(--muted)" }} /><Tooltip content={<DepartmentTooltip />} /><Legend iconType="square" wrapperStyle={{ fontSize: 11 }} />{DELIVERY_DEPOT_CHART_SERIES.map((item) => <Bar key={item.dataKey} dataKey={item.dataKey} name={item.name} stackId="depot" fill={item.color} />)}</BarChart></ResponsiveContainer> : <div className="department-chart-empty department-chart-empty--small"><IconBuildingWarehouse size={26} /><strong>Depo deseni için veri bekleniyor</strong><span>Depo, ticari sorumluluğu değiştirmeden burada karşılaştırılacak.</span></div>}</article>
      </section>

      <section className="panel department-table-panel"><div className="panel-heading"><div><h2>Yönetim Karşılaştırma Tablosu</h2><p>Finansal ana göstergeler EUR; kaynak uzlaşma tutarları kanıt durumuna göre gösterilir.</p></div></div><div className="table-scroll"><table className="department-summary-table"><thead><tr><th>Departman</th><th>Brüt satış · EUR</th><th>İade · EUR</th><th>İskonto · EUR</th><th>Net satış · EUR</th><th>Maliyet · EUR</th><th>Brüt kâr · EUR</th><th>Marj</th><th>Belge</th><th>Cari</th></tr></thead><tbody>{visibleDepartments.map((item) => { const eur = projectDepartmentEurMetric(item); return <tr key={item.id}><th><DepartmentBadge department={item.id} /></th><td>{formatEur(eur.grossSales)}</td><td className="negative">{eur.returns == null ? "—" : `-${formatEur(eur.returns)}`}</td><td className="negative">{eur.discounts == null ? "—" : `-${formatEur(eur.discounts)}`}</td><td><strong>{formatEur(eur.netSales)}</strong></td><td>{formatEur(eur.cost)}</td><td className={eur.profit == null ? "" : eur.profit >= 0 ? "positive" : "negative"}>{formatEur(eur.profit)}</td><td>{percent(eur.margin)}</td><td>{money.format(item.documentCount)}</td><td>{money.format(item.customerCount)}</td></tr>; })}</tbody></table></div></section>
    </>}

    {tab === "rankings" && <section className="ranking-grid">
      <article className="panel ranking-panel"><div className="panel-heading"><div><h2>Ticari Sorumlular</h2><p>EUR net satış kanıtına göre · 91→85 riskli toplu işler kişi sıralamasına alınmaz</p></div><IconUsers size={21} /></div><div className="ranking-list">{(data.topOwners || []).filter((item) => isOfficialOwnerRankingCandidate(item) && (department === "all" || item.department === department)).map((item, index) => { const eur = projectDepartmentEurMetric(item); return <div key={item.id} style={{ cursor: "pointer" }} onClick={() => { setTab("ledger"); setSearch(item.code || item.name); }} title={`${item.name} belgelerini filtrele`}><span className="rank">{index + 1}</span><span className="ranking-name"><strong title={item.name} aria-label={item.name}>{item.name}</strong><small>{item.code || "—"} · {item.location} · {actorActivityLabel(item.active)}</small></span><DepartmentBadge department={item.department} /><span className="ranking-value"><strong>{formatEur(eur.netSales)}</strong><small>{money.format(item.documentCount)} belge · Ort. {formatEur(item.documentCount ? eur.netSales / item.documentCount : null)}</small></span></div>; })}{!data.topOwners?.some(isOfficialOwnerRankingCandidate) && <p className="empty-copy">Teyitli aktif ticari sorumlu verisi henüz yok.</p>}</div></article>
      <article className="panel ranking-panel"><div className="panel-heading"><div><h2>En Çok Satılan Ürünler</h2><p>EUR net satış kanıtına göre ilk 10</p></div><IconPackage size={21} /></div><div className="ranking-list">{(data.topProducts || []).map((item, index) => { const eur = projectDepartmentEurMetric(item); return <div key={item.id}><span className="rank">{index + 1}</span><span className="ranking-name"><strong>{item.name}</strong><small>{item.code} · {item.brand || "Marka yok"}</small></span><span className="ranking-value"><strong>{formatEur(eur.netSales)}</strong><small>Kâr {formatEur(eur.profit)}</small></span></div>; })}{!data.topProducts?.length && <p className="empty-copy">Ürün verisi henüz yok.</p>}</div></article>
      <article className="panel ranking-panel"><div className="panel-heading"><div><h2>En Yüksek Hacimli Müşteriler</h2><p>EUR net satış kanıtına göre ilk 10</p></div><IconChartBar size={21} /></div><div className="ranking-list">{(data.topCustomers || []).map((item, index) => { const eur = projectDepartmentEurMetric(item); return <div key={item.id}><span className="rank">{index + 1}</span><span className="ranking-name"><strong>{item.name}</strong><small>{item.code}</small></span><span className="ranking-value"><strong>{formatEur(eur.netSales)}</strong><small>{money.format(item.documentCount)} belge</small></span></div>; })}{!data.topCustomers?.length && <p className="empty-copy">Müşteri verisi henüz yok.</p>}</div></article>
    </section>}

    {tab === "ledger" && <section className="panel department-ledger">
      <div className="department-ledger__head"><div><p className="eyebrow">İzlenebilir ekonomik satırlar</p><h2>Departman Belge Defteri</h2><p>{money.format(detailRows.length)} / {money.format(detailPagination.totalRows)} satır gösteriliyor · seçili yılın tamamı aranır</p></div><div className="ledger-filters"><label className="search-control"><IconSearch size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Belge, müşteri, ürün veya sorumlu ara" /></label><label><IconFilter size={16} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Tüm atıflar</option><option value="confirmed">Teyitli</option><option value="inferred">Kullanıcı eşlemesi</option><option value="review">İnceleme gerekli</option></select></label><select value={depotFilter} onChange={(event) => setDepotFilter(event.target.value)}><option value="all">Tüm depolar</option><option value="MRK">Merkez Depo</option><option value="YTM">Yatmarin Depo</option><option value="—">Belirsiz depo</option></select></div></div>
      <div className="table-scroll"><table className="department-ledger-table"><thead><tr><th aria-label="Detay" /><th>Belge / tarih</th><th>Departman</th><th>Ticari sorumlu</th><th>Müşteri</th><th>Ürün</th><th>Net satış · EUR</th><th>Maliyet · EUR</th><th>Brüt kâr · EUR</th><th>Teslimat</th><th>Kanıt</th></tr></thead><tbody>{detailRows.map((row) => <FragmentRow key={row.id} row={row} expanded={expandedRow === row.id} onToggle={() => setExpandedRow(expandedRow === row.id ? null : row.id)} />)}{!detailRows.length && <tr><td colSpan="11" className="empty-cell">Filtrelere uyan ekonomik satır bulunamadı.</td></tr>}</tbody></table></div>
      {detailPagination.totalPages > 1 && <nav className="table-pagination" aria-label="Belge defteri sayfaları"><button type="button" className="secondary-button" disabled={detailPage <= 1} onClick={() => setDetailPage((page) => page - 1)}>Önceki</button><span>Sayfa {detailPage} / {detailPagination.totalPages}</span><button type="button" className="secondary-button" disabled={detailPage >= detailPagination.totalPages} onClick={() => setDetailPage((page) => page + 1)}>Sonraki</button></nav>}
    </section>}

    {tab === "pilot" && <>
      <section className="pilot-readiness-grid">
        <article className={`pilot-status ${data.quality?.firstRealPilotDetected ? "ready" : "waiting"}`}><span>{data.quality?.firstRealPilotDetected ? <IconCircleCheck size={22} /> : <IconRefresh size={22} />}</span><div><small>İlk gerçek sipariş</small><strong>{data.quality?.firstRealPilotDetected ? "Algılandı" : "Bekleniyor"}</strong><p>Yeni satış siparişi kaydedildikten sonra Yenile düğmesiyle kontrol edin.</p></div></article>
        <article className="pilot-status ready"><span><IconShieldCheck size={22} /></span><div><small>Nexus sınırı</small><strong>Salt okunur</strong><p>CPM alanları yalnız okunur; atıf ve analiz Nexus’ta üretilir.</p></div></article>
        <article className="pilot-status"><span><IconHierarchy size={22} /></span><div><small>Kaynak zinciri kapsamı</small><strong>{percent(data.quality?.sourceOrderCoveragePct)}</strong><p>Siparişten teslimat ve faturaya bağlanan net satış oranı.</p></div></article>
        <article className="pilot-status"><span><IconArrowsExchange size={22} /></span><div><small>Çapraz-depo</small><strong>{formatMoney(data.totals?.crossDepotSales)}</strong><p>Ticari departman ile teslimat deposu farklı olan satışlar.</p></div></article>
      </section>
      <section className="panel pilot-flow"><div className="panel-heading"><div><h2>Yeni CPM Atıf Akışı</h2><p>Az önce eklenen alanların Nexus tarafından nasıl yorumlandığı</p></div></div><div className="pilot-flow__steps"><div><span>1</span><strong>Satış Siparişi</strong><small>SATICINO + MASRAFKOD</small></div><IconChevronRight /><div><span>2</span><strong>Kaynak Bağlantısı</strong><small>SONKAYNAK*</small></div><IconChevronRight /><div><span>3</span><strong>Teslimat</strong><small>DEPOKOD · MRK/YTM</small></div><IconChevronRight /><div><span>4</span><strong>Nexus Analizi</strong><small>Ciro, maliyet, kâr, kanıt</small></div></div></section>
      <section className="panel pilot-orders"><div className="panel-heading"><div><h2>Algılanan Gerçek Pilot Siparişleri</h2><p>`SSP-00979` silindi ve kalıcı dışlama listesinde; burada yalnız yeni gerçek siparişler görünür.</p></div><button className="secondary-button" onClick={() => setRefreshToken((value) => value + 1)}><IconRefresh size={16} />Şimdi kontrol et</button></div><div className="table-scroll"><table><thead><tr><th>Sipariş</th><th>Tarih</th><th>Müşteri</th><th>Ticari sorumlu</th><th>Departman</th><th>Teslimat deposu</th><th>Durum</th></tr></thead><tbody>{(data.pilotOrders || []).map((order) => <tr key={`${order.documentNo}-${order.customerCode}`}><th>{order.documentNo}</th><td>{formatDate(order.documentDate)}</td><td>{order.customerCode}</td><td><strong>{order.ownerName}</strong><small>{order.ownerCode}</small></td><td><DepartmentBadge department={order.department} /></td><td>{order.depot?.name || "Belirsiz"}</td><td><span className={`evidence-pill evidence-pill--${order.status === "ready" ? "confirmed" : "review"}`}>{order.status === "ready" ? "Analize hazır" : "İncele"}</span></td></tr>)}{!data.pilotOrders?.length && <tr><td colSpan="7" className="empty-cell">Henüz gerçek pilot siparişi algılanmadı.</td></tr>}</tbody></table></div></section>
    </>}
    {tab === "overview" && hasFinancialData && <>
      <AccessibleChartLegend label="Departman satış ve kâr serileri" items={chartSeries} />
      <AccessibleChartLegend label="Teslimat deposu serileri" items={DELIVERY_DEPOT_CHART_SERIES} />
    </>}
  </main>;
}

const ATTRIBUTION_LABELS = {
  "macro-source-order": "Kaynak siparişteki açık atıf",
  "supported-source-seller": "Kaynak evrak ve işlem geçmişi",
  "retail-history": "Perakende satış işlem geçmişi",
  "upstream-history": "İlk ticari işlem geçmişi",
  "same-department-consensus": "Aynı departman aktör uzlaşısı",
  "b2b-candidate-hint": "Yakın B2B belge aday ipucu",
  "depot-fallback": "Yalnız depo ipucu, inceleme gerekli",
  "original-sale-owner": "Bağlı ilk satışın ticari sahibi",
  review: "review-required · ticari sahiplik kanıtı yok",
  "review-required": "Ticari sahiplik kanıtı bulunamadı",
  "macro-conflict": "Kaynak sipariş atıfları çelişkili",
};

const COST_LABELS = {
  bulkPurchase: "Toplu alım stoku",
  priorPurchase: "Önceki nihai alım faturası",
  nextPurchase: "Sonraki nihai alım faturası",
  originalSaleCost: "İlk satışın maliyet kanıtı",
  configuredLabor: "İşçilik oranı",
  configuredSrf: "SRF oranı",
  configuredTsr: "TSR oranı",
  configuredRoad: "Yol oranı",
  manualDecision: "Yönetim maliyet kararı",
  missingPurchase: "Maliyet kanıtı eksik",
};

const ACTOR_ROLE_LABELS = {
  "history-entry": "İlk kayıt",
  "history-change": "Değişiklik / muhasebe işlemi",
};

const EXCLUSION_LABELS = {
  "customer-like-code": "Cari kart kodu, personel değil",
  "non-commercial-user": "Ticari olmayan / muhasebe aktörü",
  "outside-employment-period": "Çalışma dönemi dışında",
  "invalid-event-date": "İşlem tarihi doğrulanamadı",
  "seller-without-stable-entry-event": "İlk ticari işlemle doğrulanamadı",
};

function actorName(code, row) {
  const preferredName = normalizeActorCode(code) === normalizeActorCode(row.commercialOwner)
    ? row.commercialOwnerName
    : null;
  return actorDisplayName(code, preferredName);
}

function EvidenceTags({ row }) {
  return <div className="evidence-tag-list" aria-label={attributionStatusLabel(row.attributionStatus)}>
    {buildEvidenceTags(row).map((tag) => <span key={tag.id} className={`evidence-pill evidence-pill--${tag.tone}`}>{tag.label}</span>)}
  </div>;
}

function documentIdentity(document) {
  return document.headerId
    || document.lineageId
    || `${document.documentType}|${document.documentNo}|${document.customerCode || ""}`;
}

function orderedDocuments(row) {
  const unique = new Map();
  for (const document of row.evidenceDocuments || []) {
    if (!document?.documentNo) continue;
    unique.set(documentIdentity(document), document);
  }
  return [...unique.values()].sort((left, right) => (
    Number(right.depth || 0) - Number(left.depth || 0)
    || String(left.documentDate || "").localeCompare(String(right.documentDate || ""))
    || Number(left.documentType || 0) - Number(right.documentType || 0)
  ));
}

function orderedActors(row) {
  return [...(row.actorEvents || [])].sort((left, right) => (
    String(left.firstSeen || "").localeCompare(String(right.firstSeen || ""))
    || String(left.actorCode || "").localeCompare(String(right.actorCode || ""), "tr")
  ));
}

function FragmentRow({ row, expanded, onToggle }) {
  const eur = projectDepartmentEurMetric(row);
  // className={profitTone(row.eurEquivalent?.profit)} is intentionally replaced by the gated EUR projection.
  const documents = orderedDocuments(row);
  const actors = orderedActors(row);
  const excludedActors = row.ownershipEvidence?.excludedActors || [];
  const batchEvidence = getBatchDocumentEvidence(row);

  return <>
    <tr className={expanded ? "expanded" : ""}>
      <td>
        <button
          className="row-toggle"
          onClick={onToggle}
          aria-label={expanded ? "Detayı kapat" : "Detayı aç"}
          aria-expanded={expanded}
          aria-controls={`department-detail-${row.id}`}
        >
          {expanded
            ? <IconChevronDown size={16} />
            : <IconChevronRight size={16} />}
        </button>
      </td>
      <th>
        <strong>{row.documentType}/{row.documentNo}</strong>
        <small>{formatDate(row.documentDate)}</small>
      </th>
      <td><DepartmentBadge department={row.department} /></td>
      <td>
        <strong>{row.commercialOwnerName || "Belirsiz"}</strong>
        <small>{row.commercialOwner || "Kod yok"}</small>
        <small>{actorActivityLabel(row.ownerActive)}</small>
      </td>
      <td><strong>{row.customerName}</strong><small>{row.customerCode}</small></td>
      <td><strong>{row.productName}</strong><small>{row.productCode}</small></td>
      <td><strong>{formatEur(eur.netSales)}</strong></td>
      <td>{eur.cost != null
        ? formatEur(eur.cost)
        : <span className="negative">Eksik</span>}
      </td>
      <td className={profitTone(eur.profit)}>
        <strong>{formatEur(eur.profit)}</strong><small>{percent(eur.margin)}</small>
      </td>
      <td>
        <strong>{row.fulfillmentDepotName}</strong>
        {row.crossDepot && <small className="cross-depot-label">Çapraz depo</small>}
      </td>
      <td>
        <EvidenceTags row={row} />
      </td>
    </tr>
    {expanded && (
      <tr className="department-ledger-detail" id={`department-detail-${row.id}`}>
        <td colSpan="11">
          <div className="department-evidence-summary">
            <span>
              <small>Atıf dayanağı</small>
              <strong>
                {ATTRIBUTION_LABELS[row.attributionMethod]
                  || row.attributionMethod
                  || "İnceleme gerekli"}
              </strong>
            </span>
            <span>
              <small>Ticari sorumlu</small>
              <strong>
                {row.commercialOwnerName || "Belirsiz"}
                {row.commercialOwner ? ` (${row.commercialOwner})` : ""}
              </strong>
              <small>{actorActivityLabel(row.ownerActive)}</small>
            </span>
            <span>
              <small>Kaynak sipariş</small>
              <strong>{row.sourceOrderNo || "Bağlantı yok"}</strong>
            </span>
            <span>
              <small>Teslimat bağlamı</small>
              <strong>
                {row.fulfillmentDepotName}
                {row.crossDepot ? " · çapraz depo" : ""}
              </strong>
            </span>
            <span>
              <small>Maliyet kanıtı</small>
              <strong>{COST_LABELS[row.costMethod] || row.costMethod || "Eksik"}</strong>
            </span>
            <span>
              <small>Kontrol</small>
              <strong>
                {row.batchRisk
                  ? batchEvidence.status === "linked"
                    ? "91→85 bağlı ekonomik vaka"
                    : "BLOCKED · 91→85 bağlantı kanıtı eksik"
                  : row.candidateDocumentNo
                    ? `Aday ${row.candidateDocumentType}/${row.candidateDocumentNo}`
                    : "Standart akış"}
              </strong>
            </span>
          </div>

          <div className="department-evidence-sections">
            <section>
              <h3>Evrak zinciri</h3>
              <div className="evidence-timeline">
                {documents.map((document) => (
                  <div key={documentIdentity(document)}>
                    <i />
                    <span>
                      <small>
                        {documentTypeLabel(document.documentType)}
                      </small>
                      <strong>{document.documentType}/{document.documentNo}</strong>
                      <em>
                        {formatDate(document.documentDate)}
                        {Number(document.depth || 0) > 0
                          ? ` · kaynak derinliği ${document.depth}`
                          : " · sonuç belgesi"}
                      </em>
                    </span>
                  </div>
                ))}
                {!documents.length && <p>Bağlı evrak kanıtı bulunamadı.</p>}
              </div>
            </section>

            {row.batchRisk && <section>
              <h3>91→85 kanıt bağlantısı</h3>
              {batchEvidence.status === "linked"
                ? <p>{documentTypeLabel(batchEvidence.source.documentType)} <strong>{batchEvidence.source.documentNo}</strong> → {documentTypeLabel(batchEvidence.result.documentType)} <strong>{batchEvidence.result.documentNo}</strong></p>
                : <p>BLOCKED · 91→85 bağlantısının iki evrakı mevcut payload’da doğrulanamadı.</p>}
            </section>}

            <section>
              <h3>Aktör geçmişi</h3>
              <div className="actor-history">
                {actors.map((actor, index) => (
                  <div key={`${actor.actorCode}-${actor.firstSeen}-${index}`}>
                    <span>
                      <strong>{actorName(actor.actorCode, row)}</strong>
                      <small>{normalizeActorCode(actor.actorCode) || "Kod yok"}</small>
                    </span>
                    <span>
                      <strong>
                        {ACTOR_ROLE_LABELS[actor.actorRole]
                          || actor.actorRole
                          || "CPM işlemi"}
                      </strong>
                      <small>{formatDate(actor.firstSeen)}</small>
                    </span>
                  </div>
                ))}
                {!actors.length && <p>Aktör geçmişi bulunamadı.</p>}
              </div>
            </section>

            <section>
              <h3>Dışlanan aktörler</h3>
              <div className="excluded-actors">
                {excludedActors.map((actor, index) => (
                  <div key={`${actor.code}-${actor.reason}-${index}`}>
                    <strong>{actorName(actor.code, row)}</strong>
                    <small>
                      {normalizeActorCode(actor.code)}
                      {" · "}
                      {EXCLUSION_LABELS[actor.reason] || actor.reason}
                    </small>
                  </div>
                ))}
                {!excludedActors.length && (
                  <p>Ticari sahiplikten dışlanan aktör bulunmuyor.</p>
                )}
              </div>
            </section>
          </div>
        </td>
      </tr>
    )}
  </>;
}
