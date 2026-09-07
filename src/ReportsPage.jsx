import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { IconAlertTriangle, IconBuilding, IconChartBar, IconDatabase, IconDiscount, IconReportAnalytics, IconSearch, IconUsers, IconWallet } from "@tabler/icons-react";
import { calculateDepartmentDistribution } from "./distribution";

const moneyFormatter=new Intl.NumberFormat("tr-TR",{maximumFractionDigits:0});
const money={format:(value)=>value===null||value===undefined?"—":moneyFormatter.format(value)};
const eurFormat=new Intl.NumberFormat("tr-TR",{style:"currency",currency:"EUR",maximumFractionDigits:0});
const reportValue=(value)=>value===null||value===undefined?"—":`${money.format(value)} TL`;
const tabs=[
  ["summary","Yönetim Özeti"],["brand","Marka"],["dealer","Bayi"],["channel","Kanal / Modül"],["service","Teknik Servis"],["cost","Alım ve Maliyet"],["discount","İskonto ve İade"],["confidence","Veri Güveni"],["pool","Havuz Dağılımı"],
];
const pilotMethodRates={configuredLabor:"labor",configuredSrf:"srf",configuredTsr:"tsr",configuredRoad:"road"};
const REPORT_CHART_COLORS = { sales: "var(--chart-sales)", profit: "var(--chart-profit)" };

export function isBrandChartVisible({ active, loading, error, brand }) {
  return active === "summary" && !loading && !error && brand.length > 0;
}

export function AccessibleChartLegend({ label, items }) {
  return <ul className="chart-legend" aria-label={label}>{items.map((item) => <li key={item.name}><i aria-hidden="true" style={{ background: item.color }} /><span>{item.name}</span></li>)}</ul>;
}

export function ReportsPage({settings,employees,targetRows,annualPool,year,rows,eurRateSets={},canonicalMetric=null}){
  const [active,setActive]=useState("summary");
  const [ledger,setLedger]=useState([]);
  const [query,setQuery]=useState("");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(null);
  const [projections,setProjections]=useState({brand:[],dealer:[],channel:[],service:[],cost:[],confidence:[]});
  useEffect(()=>{let cancelled=false;setLoading(true);setError(null);fetch(`/api/audit-ledger?year=${year}&export=1`).then((response)=>{if(!response.ok) throw new Error("report-fetch-failed"); return response.json();}).then((data)=>{if(!cancelled){setLedger(data.rows||[]);setProjections(data.projections||{});setLoading(false);}}).catch(()=>{if(!cancelled){setLedger([]);setProjections({});setError("Rapor verileri okunamadı. Lütfen yeniden deneyin.");setLoading(false);}});return()=>{cancelled=true;};},[year]);
  const totals=projections.summary || {discounts:null,returns:null,discountsEur:null,returnsEur:null};
  const eurRevenueComplete = canonicalMetric?.eurRevenue?.complete === true;
  const eurComplete = canonicalMetric?.eur?.complete === true && canonicalMetric?.status === "TAMAM";
  const eurNetSales = eurRevenueComplete ? canonicalMetric.eurRevenue.netSales : null;
  const eurProfit = eurComplete ? canonicalMetric.eur.profit : null;
  const eurRateCount = Object.values(eurRateSets || {}).filter((set) => Number.isFinite(Number(set?.eurTryBuyingRate))).length;
  const eurRateSourceLabel = Object.values(eurRateSets || {}).some((set) => (set?.sourceKinds || []).includes("TCMB"))
    ? "CPM öncelikli · TCMB fallback"
    : "Halkbank alış kuru";
  const reviewNetSales = canonicalMetric?.scope?.costReview?.netSales ?? null;
  const reviewLines = canonicalMetric?.scope?.costReview?.lines ?? 0;
  const currencyBaskets = Object.entries(canonicalMetric?.byCurrency || {})
    .filter(([, basket]) => Number(basket?.lineCount || 0) > 0);
  const toEurRows=(items)=>(items||[]).map((item)=>({...item,netSales:item.eurEquivalent?.netSales??null,cost:item.eurEquivalent?.cost??null,profit:item.eurEquivalent?.profit??null,margin:item.eurEquivalent?.margin??null}));
  const brand=toEurRows(projections.brand); const dealer=toEurRows(projections.dealer); const channel=toEurRows(projections.channel); const service=toEurRows(projections.service); const costs=toEurRows(projections.cost); const confidence=toEurRows(projections.confidence);
  const eurDiscounts=totals.discountsEur ?? null;
  const eurReturns=totals.returnsEur ?? null;
  const distributionResult=useMemo(
    ()=>calculateDepartmentDistribution({employees,settings,targetRows}),
    [employees,settings,targetRows],
  );
  const pool=distributionResult.departments.map((department)=>({
    name:department.departmentName,
    lines:department.eligibleEmployeeCount,
    netSales:department.pool,
    cost:department.unallocatedPool,
    profit:department.allocatedPool,
    discount:0,
    returns:0,
  }));
  const datasets={brand,dealer,channel,service,cost:costs,confidence,pool};
  const current=datasets[active]||[];
  const filtered=current.filter((item)=>item.name.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR")));

  return <main className="page reports-page" id="top"><section className="page-heading reports-heading"><div><p className="eyebrow">CPM iş analitiği</p><h1>Raporlar Merkezi</h1><p>Satış, kârlılık, marka, bayi, kanal, servis, maliyet ve havuz sonuçlarını tek merkezde inceleyin.</p></div><span className={`source-badge source-badge--${loading ? "loading" : error ? "demo" : "live"}`}>{loading?"CPM okunuyor…":error?"Veri kullanılamıyor":"CPM canlı · salt okunur"}</span></section>
  {loading && <div className="report-state report-state--loading" role="status" aria-live="polite">Rapor verileri yükleniyor…</div>}
  {error && <div className="report-state report-state--error" role="alert">{error}</div>}
  <section className="report-kpis"><article><span><IconChartBar/></span><div><small>Net satış · EUR</small><strong>{eurNetSales == null ? "—" : eurFormat.format(eurNetSales)}</strong><p>{eurRateCount ? `${eurRateSourceLabel} · ${eurRateCount} dönem` : "Kur kanıtı bekleniyor"}</p></div></article><article><span className="report-kpi--green"><IconWallet/></span><div><small>Hesaplanan kâr · EUR</small><strong>{eurProfit == null ? "—" : eurFormat.format(eurProfit)}</strong><p>{eurComplete ? "Doğrulanmış WAC ve kur seti karşılığı" : "Maliyet kanıtı bekleniyor"}</p></div></article><article><span className="report-kpi--blue"><IconBuilding/></span><div><small>Bayi satışı · EUR</small><strong>{projections.summary?.dealerEurNetSales == null ? "—" : eurFormat.format(projections.summary.dealerEurNetSales)}</strong><p>DBS kodlu {dealer.length} bayi · EUR kanıtı</p></div></article><article><span className="report-kpi--amber"><IconDatabase/></span><div><small>Teknik servis · EUR</small><strong>{projections.summary?.serviceEurNetSales == null ? "—" : eurFormat.format(projections.summary.serviceEurNetSales)}</strong><p>Kaynak evrak 64 · EUR kanıtı</p></div></article><article><span className="report-kpi--amber"><IconAlertTriangle/></span><div><small>İnceleme gerekli · kaynak TRY</small><strong>{reviewNetSales == null ? "—" : `${money.format(reviewNetSales)} TL`}</strong><p>{reviewLines} satırda resmî kâr yayınlanmaz</p></div></article></section>
  <section className="panel"><div className="report-tabs">{tabs.map(([id,label])=><button key={id} className={active===id?"active":""} onClick={()=>setActive(id)}>{label}</button>)}</div></section>
  {active === "summary" && <>
    <section className="panel report-finance-evidence">
      <div className="panel-heading"><div><h2>Finansal kanıt özeti</h2><p>Net satış, maliyet ve kâr kaynak dövizinde ayrı tutulur; EUR yalnız tam kur kanıtında yayınlanır.</p></div><span className={`evidence-state ${eurComplete ? "" : "evidence-state--review"}`}>{eurComplete ? "EUR tamamlandı" : "EUR inceleme gerekli"}</span></div>
      <div className="table-scroll"><table className="report-table"><thead><tr><th>Kaynak dövizi</th><th>Satır</th><th>Net satış · kaynak</th><th>Maliyet · kaynak</th><th>Brüt kâr · kaynak</th></tr></thead><tbody>
        {currencyBaskets.map(([currency, basket])=><tr key={currency}><th>{currency}</th><td>{money.format(basket.lineCount)}</td><td>{money.format(basket.netSales)} {currency}</td><td>{money.format(basket.cost)} {currency}</td><td className={basket.profit >= 0 ? "positive" : "negative"}>{money.format(basket.profit)} {currency}</td></tr>)}
        {!currencyBaskets.length&&<tr><td colSpan="5" className="empty-state">Finansal kanıt henüz bulunamadı.</td></tr>}
      </tbody></table></div>
      <p className="table-note">İnceleme gereken tutar: {reviewNetSales == null ? "—" : `${money.format(reviewNetSales)} TL kaynak tutarı`} · {reviewLines} satır. Bu tutar resmî kâr veya havuz toplamına dahil edilmez.</p>
    </section>
    <div className="report-grid">
      <section className="panel department-report"><div className="panel-heading"><div><h2>En Yüksek Net Satışlı Markalar</h2><p>EUR karşılığı · KDV hariç</p></div></div>
        {!loading&&!error&&!brand.length ? <div className="report-state report-state--empty">Marka grafiği için veri bulunamadı.</div> : !loading&&!error && <div className="report-chart" role="img" aria-label="Marka satış ve kâr grafiği"><ResponsiveContainer width="100%" height={320}><BarChart data={brand.slice(0,10)}><CartesianGrid vertical={false} stroke="var(--chart-grid)"/><XAxis dataKey="name" tick={{fontSize:10,fill:"var(--muted)"}}/><YAxis tickFormatter={(v)=>`${Math.round(v/1e6)} Mn`} tick={{fill:"var(--muted)"}}/><Tooltip formatter={(v)=>eurFormat.format(v)}/><Legend iconType="square" wrapperStyle={{fontSize:12}}/><Bar dataKey="netSales" name="Net satış · EUR" fill={REPORT_CHART_COLORS.sales} radius={[3,3,0,0]}/><Bar dataKey="profit" name="Kâr · EUR" fill={REPORT_CHART_COLORS.profit} radius={[3,3,0,0]}/></BarChart></ResponsiveContainer></div>}
      </section>
      <aside className="report-notes"><div className="report-notes__head"><IconReportAnalytics/><strong>Yönetim Özeti</strong></div><ul><li>{brand.length} marka satış hareketi oluşturdu.</li><li>DBS kodlu bayiler {projections.summary?.dealerEurNetSales == null ? "—" : eurFormat.format(projections.summary.dealerEurNetSales)} EUR net satış yarattı.</li><li>Teknik servis kaynaklı satış {projections.summary?.serviceEurNetSales == null ? "—" : eurFormat.format(projections.summary.serviceEurNetSales)} EUR.</li><li>{confidence.find(r=>r.name==="İnceleme gerekli")?.lines||0} satır maliyet incelemesi bekliyor.</li></ul></aside>
    </div>
  </>}
  {active === "discount" && <section className="panel distribution-report"><div className="panel-heading"><div><h2>İskonto ve İade Özeti</h2><p>EUR karşılığı · kur kanıtı eksikse değer gösterilmez</p></div></div><div className="report-kpis"><article><span><IconDiscount/></span><div><small>İskonto · EUR</small><strong>{eurDiscounts == null ? "—" : eurFormat.format(eurDiscounts)}</strong></div></article><article><span><IconChartBar/></span><div><small>İade · EUR</small><strong>{eurReturns == null ? "—" : eurFormat.format(eurReturns)}</strong></div></article></div></section>}
  {active !== "summary" && active !== "discount" && <section className="panel distribution-report"><div className="distribution-report__head"><div><h2>{tabs.find(([id])=>id===active)?.[1]}</h2><p>{filtered.length} analiz satırı · {active === "pool" ? "kaynak TRY" : "EUR karşılığı"}</p></div><label className="goal-search"><IconSearch size={17}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Ara"/></label></div><div className="table-scroll"><table className="report-table"><thead><tr><th>Boyut</th><th>Satır</th><th>{active==="pool"?"Toplam havuz · kaynak TRY":"Net satış · EUR"}</th><th>{active==="pool"?"Dağıtılamayan · kaynak TRY":"Maliyet · EUR"}</th><th>{active==="pool"?"Dağıtılan · kaynak TRY":"Kâr · EUR"}</th><th>{active==="pool"?"Dağıtım oranı":"Marj"}</th></tr></thead><tbody>{filtered.map((item)=><tr key={item.name}><th>{item.name}</th><td>{money.format(item.lines)}</td><td>{active === "pool" ? `${money.format(item.netSales)} TL` : (item.netSales == null ? "—" : eurFormat.format(item.netSales))}</td><td>{active === "pool" ? `${money.format(item.cost)} TL` : (item.cost == null ? "—" : eurFormat.format(item.cost))}</td><td className={item.profit>=0?"positive":"negative"}>{active === "pool" ? `${money.format(item.profit)} TL` : (item.profit == null ? "—" : eurFormat.format(item.profit))}</td><td>%{item.margin === null || item.margin === undefined ? "—" : Number(item.margin).toFixed(1)}</td></tr>)}{!filtered.length&&<tr><td colSpan="6" className="empty-state">Veri bulunamadı.</td></tr>}</tbody></table></div></section>}
  {isBrandChartVisible({ active, loading, error, brand }) && <AccessibleChartLegend label="Marka satış ve kâr serileri" items={[{ name: "Net satış", color: REPORT_CHART_COLORS.sales }, { name: "Kâr", color: REPORT_CHART_COLORS.profit }]} />}
  </main>;
}
