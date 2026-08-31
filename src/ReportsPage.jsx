import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { IconBuilding, IconChartBar, IconDatabase, IconDiscount, IconReportAnalytics, IconSearch, IconUsers, IconWallet } from "@tabler/icons-react";
import { calculateDepartmentDistribution } from "./distribution";

const moneyFormatter=new Intl.NumberFormat("tr-TR",{maximumFractionDigits:0});
const money={format:(value)=>value===null||value===undefined?"—":moneyFormatter.format(value)};
const eurFormat=new Intl.NumberFormat("tr-TR",{style:"currency",currency:"EUR",maximumFractionDigits:0});
const reportValue=(value)=>value===null||value===undefined?"—":`${money.format(value)} TL`;
const tabs=[
  ["summary","Yönetim Özeti"],["brand","Marka"],["dealer","Bayi"],["channel","Kanal / Modül"],["service","Teknik Servis"],["cost","Alım ve Maliyet"],["discount","İskonto ve İade"],["confidence","Veri Güveni"],["pool","Havuz Dağılımı"],
];
const pilotMethodRates={configuredLabor:"labor",configuredSrf:"srf",configuredTsr:"tsr",configuredRoad:"road"};

export function ReportsPage({settings,employees,targetRows,annualPool,year,rows,eurRateSets={},canonicalMetric=null}){
  const [active,setActive]=useState("summary");
  const [ledger,setLedger]=useState([]);
  const [query,setQuery]=useState("");
  const [loading,setLoading]=useState(true);
  const [projections,setProjections]=useState({brand:[],dealer:[],channel:[],service:[],cost:[],confidence:[]});
  useEffect(()=>{let cancelled=false;setLoading(true);fetch(`/api/audit-ledger?year=${year}&export=1`).then((response)=>response.json()).then((data)=>{if(!cancelled){setLedger(data.rows||[]);setProjections(data.projections||{});setLoading(false);}}).catch(()=>{if(!cancelled){setLedger([]);setProjections({});setLoading(false);}});return()=>{cancelled=true;};},[year]);
  const totals=projections.summary || {discounts:null,returns:null};
  const eurComplete = canonicalMetric?.eur?.complete === true && canonicalMetric?.status === "TAMAM";
  const eurNetSales = eurComplete ? canonicalMetric.eur.netSales : null;
  const eurProfit = eurComplete ? canonicalMetric.eur.profit : null;
  const eurRateCount = Object.values(eurRateSets || {}).filter((set) => Number.isFinite(Number(set?.eurTryBuyingRate))).length;
  const brand=projections.brand||[]; const dealer=projections.dealer||[]; const channel=projections.channel||[]; const service=projections.service||[]; const costs=projections.cost||[]; const confidence=projections.confidence||[];
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

  return <main className="page reports-page" id="top"><section className="page-heading reports-heading"><div><p className="eyebrow">CPM iş analitiği</p><h1>Raporlar Merkezi</h1><p>Satış, kârlılık, marka, bayi, kanal, servis, maliyet ve havuz sonuçlarını tek merkezde inceleyin.</p></div><span className="source-badge source-badge--live">{loading?"CPM okunuyor…":"CPM canlı · salt okunur"}</span></section>
  <section className="report-kpis"><article><span><IconChartBar/></span><div><small>Net satış · EUR</small><strong>{eurNetSales ? `${money.format(eurNetSales)} EUR` : "—"}</strong><p>{eurRateCount ? `Halkbank alış kuru · ${eurRateCount} dönem` : "Kur kanıtı bekleniyor"}</p></div></article><article><span className="report-kpi--green"><IconWallet/></span><div><small>Hesaplanan kâr · EUR</small><strong>{eurProfit ? eurFormat.format(eurProfit) : "—"}</strong><p>{eurRateCount ? "Doğrulanmış kur seti karşılığı" : "Kur kanıtı bekleniyor"}</p></div></article><article><span className="report-kpi--blue"><IconBuilding/></span><div><small>Bayi satışı</small><strong>{money.format(projections.summary?.dealerNetSales)} TL</strong><p>DBS kodlu {dealer.length} bayi</p></div></article><article><span className="report-kpi--amber"><IconDatabase/></span><div><small>Teknik servis</small><strong>{money.format(projections.summary?.serviceNetSales)} TL</strong><p>Kaynak evrak 64</p></div></article></section>
  <section className="panel"><div className="report-tabs">{tabs.map(([id,label])=><button key={id} className={active===id?"active":""} onClick={()=>setActive(id)}>{label}</button>)}</div></section>
  {active==="summary"?<div className="report-grid"><section className="panel department-report"><div className="panel-heading"><div><h2>En Yüksek Net Satışlı Markalar</h2><p>CPM stok kartı marka alanı</p></div></div><ResponsiveContainer width="100%" height={320}><BarChart data={brand.slice(0,10)}><CartesianGrid vertical={false} stroke="#e5e9ef"/><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tickFormatter={(v)=>`${Math.round(v/1e6)} Mn`}/><Tooltip formatter={(v)=>`${money.format(v)} TL`}/><Bar dataKey="netSales" fill="#0a3972" radius={[3,3,0,0]}/><Bar dataKey="profit" fill="#16884e" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer></section><aside className="report-notes"><div className="report-notes__head"><IconReportAnalytics/><strong>Yönetim Özeti</strong></div><ul><li>{brand.length} marka satış hareketi oluşturdu.</li><li>DBS kodlu bayiler {money.format(projections.summary?.dealerNetSales)} TL net satış yarattı.</li><li>Teknik servis kaynaklı satış {money.format(projections.summary?.serviceNetSales)} TL.</li><li>{confidence.find(r=>r.name==="İnceleme gerekli")?.lines||0} satır maliyet incelemesi bekliyor.</li></ul></aside></div>:active==="discount"?<section className="panel distribution-report"><div className="panel-heading"><div><h2>İskonto ve İade Özeti</h2><p>Brüt satıştan düşülen ticari hareketler</p></div></div><div className="report-kpis"><article><span><IconDiscount/></span><div><small>İskonto</small><strong>{money.format(totals.discounts)} TL</strong></div></article><article><span><IconChartBar/></span><div><small>İade</small><strong>{money.format(totals.returns)} TL</strong></div></article></div></section>:<section className="panel distribution-report"><div className="distribution-report__head"><div><h2>{tabs.find(([id])=>id===active)?.[1]}</h2><p>{filtered.length} analiz satırı</p></div><label className="goal-search"><IconSearch size={17}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Ara"/></label></div><div className="table-scroll"><table className="report-table"><thead><tr><th>Boyut</th><th>Satır</th><th>{active==="pool"?"Toplam havuz":"Net satış / pay"}</th><th>{active==="pool"?"Dağıtılamayan":"Maliyet"}</th><th>{active==="pool"?"Dağıtılan":"Kâr"}</th><th>{active==="pool"?"Dağıtım oranı":"Marj"}</th></tr></thead><tbody>{filtered.map((item)=><tr key={item.name}><th>{item.name}</th><td>{money.format(item.lines)}</td><td>{money.format(item.netSales)} TL</td><td>{money.format(item.cost)} TL</td><td className={item.profit>=0?"positive":"negative"}>{money.format(item.profit)} TL</td><td>%{item.margin === null ? "—" : Number(item.margin).toFixed(1)}</td></tr>)}{!filtered.length&&<tr><td colSpan="6" className="empty-state">Veri bulunamadı.</td></tr>}</tbody></table></div></section>}
  </main>;
}
