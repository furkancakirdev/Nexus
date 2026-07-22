import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { IconAlertTriangle, IconArrowRight, IconChartBar, IconFileCheck, IconTargetArrow, IconUsers, IconWallet } from "@tabler/icons-react";
import { calculateEmployeeDistribution } from "./distribution";

const money = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 });

export function SummaryPage({ rows, settings, employees, annualPool, year, mode, onNavigate }) {
  const [reportType,setReportType]=useState("management");
  const [startMonth,setStartMonth]=useState(1);
  const [endMonth,setEndMonth]=useState(12);
  const distribution = useMemo(() => calculateEmployeeDistribution(employees, settings, annualPool), [annualPool, employees, settings]);
  const chartRows = rows.map((row) => ({ ...row, profit: row.profit ?? (row.sales - row.returns - row.discounts - row.estimatedCost - (row.uncoveredNetSales || 0)) }));
  const totals = chartRows.reduce((acc, row) => ({ sales: acc.sales + row.sales, profit: acc.profit + row.profit }), { sales: 0, profit: 0 });
  const eligible = distribution.filter((employee) => employee.eligible).length;
  const approvedGoals = distribution.filter((employee) => employee.approvalStatus === "Onaylandı").length;
  const reviewPeriods = rows.filter((row) => Number(row.uncoveredCostLines || 0) > 0);
  const averageScore = distribution.length ? distribution.reduce((sum, employee) => sum + employee.weightedScore, 0) / distribution.length : 0;
  const reportRows=chartRows.filter((row)=>row.month>=startMonth&&row.month<=endMonth);
  const reportTotals=reportRows.reduce((acc,row)=>({sales:acc.sales+row.sales,returns:acc.returns+row.returns,discounts:acc.discounts+row.discounts,cost:acc.cost+row.estimatedCost,profit:acc.profit+row.profit}),{sales:0,returns:0,discounts:0,cost:0,profit:0});
  const bestProfit=[...reportRows].sort((a,b)=>b.profit-a.profit)[0];
  const worstProfit=[...reportRows].sort((a,b)=>a.profit-b.profit)[0];
  const firstName=reportRows[0]?.monthName||"—"; const lastName=reportRows.at(-1)?.monthName||"—";
  const narratives={
    management:`${year} ${firstName}–${lastName} döneminde ${money.format(reportTotals.sales)} TL brüt satış ve ${money.format(reportTotals.profit)} TL dağıtıma esas ${reportTotals.profit>=0?"kâr":"zarar"} oluştu. En güçlü kâr ayı ${bestProfit?.monthName||"—"} (${money.format(bestProfit?.profit||0)} TL), en düşük sonuç ${worstProfit?.monthName||"—"} (${money.format(worstProfit?.profit||0)} TL) oldu.`,
    sales:`Seçilen dönemde brüt satış ${money.format(reportTotals.sales)} TL oldu. ${money.format(reportTotals.returns)} TL iade ve ${money.format(reportTotals.discounts)} TL iskonto sonrasında net satış ${money.format(reportTotals.sales-reportTotals.returns-reportTotals.discounts)} TL olarak gerçekleşti.`,
    profit:`Seçilen dönemde ${money.format(reportTotals.profit)} TL esas ${reportTotals.profit>=0?"kâr":"zarar"} oluştu. En yüksek sonuç ${bestProfit?.monthName||"—"}, en düşük sonuç ${worstProfit?.monthName||"—"} ayında kaydedildi.`,
    cost:`Seçilen dönemin hesaplanan maliyeti ${money.format(reportTotals.cost)} TL oldu. Maliyet/net satış oranı %${reportTotals.sales?((reportTotals.cost/(reportTotals.sales-reportTotals.returns-reportTotals.discounts))*100).toFixed(1).replace(".",","):0}.`,
    discount:`Seçilen dönemde ${money.format(reportTotals.discounts)} TL iskonto ve ${money.format(reportTotals.returns)} TL satış iadesi oluştu. Toplam ticari düşüş brüt satışın %${reportTotals.sales?(((reportTotals.discounts+reportTotals.returns)/reportTotals.sales)*100).toFixed(1).replace(".",","):0} seviyesindedir.`,
  };

  return <main className="page summary-page" id="top">
    <section className="page-heading summary-heading"><div><p className="eyebrow">Yönetim özeti</p><h1>Havuz Genel Bakış</h1><p>{year} performansını, havuz oluşumunu ve personel hedef durumunu tek ekranda izleyin.</p></div><span className={`source-badge source-badge--${mode}`}>{mode === "live" ? "CPM canlı" : "Pilot veri"}</span></section>
    <section className="summary-kpis">
      <article><span><IconChartBar /></span><div><small>Net satışlar</small><strong>{money.format(totals.sales)} TL</strong><p>{rows.length} dönem verisi</p></div></article>
      <article><span className="green"><IconWallet /></span><div><small>Net dağıtım havuzu</small><strong>{money.format(annualPool)} TL</strong><p>Temel senaryo, rezerv sonrası</p></div></article>
      <article><span className="blue"><IconUsers /></span><div><small>Uygun personel</small><strong>{eligible} / {distribution.length}</strong><p>{distribution.length - eligible} kişi kapsam dışında</p></div></article>
      <article><span className="amber"><IconTargetArrow /></span><div><small>Ortalama hedef</small><strong>%{averageScore.toFixed(1).replace(".", ",")}</strong><p>{approvedGoals} hedef onaylandı</p></div></article>
    </section>
    <section className="panel narrative-report"><div className="narrative-report__head"><div><p className="eyebrow">Yazılı analiz</p><h2>Seçilebilir Yönetim Raporu</h2></div><div className="narrative-controls"><select value={reportType} onChange={(event)=>setReportType(event.target.value)}><option value="management">Yönetim özeti</option><option value="sales">Satış raporu</option><option value="profit">Kârlılık raporu</option><option value="cost">Maliyet raporu</option><option value="discount">İskonto ve iade raporu</option></select><select value={startMonth} onChange={(event)=>setStartMonth(Math.min(Number(event.target.value),endMonth))}>{rows.map((row)=><option key={row.month} value={row.month}>{row.monthName}</option>)}</select><select value={endMonth} onChange={(event)=>setEndMonth(Math.max(Number(event.target.value),startMonth))}>{rows.map((row)=><option key={row.month} value={row.month}>{row.monthName}</option>)}</select><button className="secondary-button" onClick={()=>window.print()}>Raporu yazdır</button></div></div><p className="narrative-copy">{narratives[reportType]}</p><small>Devam eden aylar tamamlanmış ay gibi yorumlanmaz; rapor seçilen veri aralığıyla sınırlıdır.</small></section>
    <div className="summary-grid">
      <section className="panel summary-performance"><div className="panel-heading"><div><h2>Aylık Satış ve Kârlılık</h2><p>CPM'den gelen satış ve hesaplanan dağıtıma esas kâr · TL</p></div></div><div className="summary-chart"><ResponsiveContainer width="100%" height={310}><AreaChart data={chartRows} margin={{ top: 18, right: 18, left: 4, bottom: 4 }}><defs><linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0a3972" stopOpacity={.25}/><stop offset="95%" stopColor="#0a3972" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#e5e9ef"/><XAxis dataKey="monthName" tick={{ fontSize: 11, fill: "#52677d" }}/><YAxis tickFormatter={(value) => compact.format(value)} tick={{ fontSize: 11, fill: "#728197" }} width={72}/><Tooltip formatter={(value) => `${money.format(value)} TL`}/><Area dataKey="sales" name="Satış" stroke="#0a3972" fill="url(#salesFill)" strokeWidth={2}/><Area dataKey="profit" name="Kâr" stroke="#16884e" fill="transparent" strokeWidth={2}/></AreaChart></ResponsiveContainer></div>
      </section>
      <aside className="summary-attention"><div className="summary-attention__head"><IconAlertTriangle/><strong>Dikkat Gerektirenler</strong><span>{reviewPeriods.length + (distribution.length - approvedGoals)}</span></div><div className="attention-list"><button onClick={() => onNavigate("audit")}><span className="attention-icon warning"><IconFileCheck/></span><div><strong>{reviewPeriods.length} dönem maliyet incelemesi var</strong><small>Eksik satırları CPM Denetim merkezinden doğrulayın.</small></div><IconArrowRight/></button><button onClick={() => onNavigate("goals")}><span className="attention-icon info"><IconTargetArrow/></span><div><strong>{distribution.length - approvedGoals} hedef onay bekliyor</strong><small>Yönetici değerlendirmeleri tamamlanmalı.</small></div><IconArrowRight/></button><button onClick={() => onNavigate("settings")}><span className="attention-icon ok"><IconUsers/></span><div><strong>{distribution.length} personel parametresi</strong><small>Katsayı, eşit dağıtım ve sabit pay kurallarını yönetin.</small></div><IconArrowRight/></button></div></aside>
    </div>
    <section className="summary-shortcuts"><button onClick={() => onNavigate("sales")}><IconChartBar/><span><strong>Satış analizini aç</strong><small>Aylık satış, iskonto ve kârlılık</small></span><IconArrowRight/></button><button onClick={() => onNavigate("goals")}><IconTargetArrow/><span><strong>Hedefleri incele</strong><small>Kişi skoru ve tahmini pay</small></span><IconArrowRight/></button><button onClick={() => onNavigate("reports")}><IconFileCheck/><span><strong>Yönetim raporu</strong><small>Excel ve PDF çıktıları</small></span><IconArrowRight/></button></section>
  </main>;
}
