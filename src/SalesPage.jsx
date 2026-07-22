import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { IconChartBar, IconDiscount, IconFilter, IconReceiptRefund, IconTrendingUp } from "@tabler/icons-react";

const money = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 });

export function SalesPage({ rows, year, mode, minimumCoverage }) {
  const [view, setView] = useState("all");
  const [sort, setSort] = useState("month");
  const data = useMemo(() => rows.map((row) => {
    const netSales = row.sales - row.returns - row.discounts;
    const profit = netSales - row.estimatedCost - (row.uncoveredNetSales || 0);
    return { ...row, netSales, profit, margin: netSales ? profit / netSales * 100 : 0 };
  }), [rows]);
  const filtered = data.filter((row) => view === "all" || (view === "healthy" ? row.costCoveragePct >= minimumCoverage : row.costCoveragePct < minimumCoverage)).sort((a,b) => sort === "sales" ? b.sales - a.sales : sort === "profit" ? b.profit - a.profit : a.month - b.month);
  const totals = data.reduce((acc,row) => ({
    sales: acc.sales+row.sales, returns: acc.returns+row.returns, discounts: acc.discounts+row.discounts,
    profit: acc.profit+row.profit, netSales: acc.netSales+row.netSales,
    bulkPurchaseCostLines:acc.bulkPurchaseCostLines+(row.bulkPurchaseCostLines||0),
    lastPurchaseCostLines:acc.lastPurchaseCostLines+(row.lastPurchaseCostLines||0),
    nextPurchaseCostLines:acc.nextPurchaseCostLines+(row.nextPurchaseCostLines||0),
    uncoveredCostLines:acc.uncoveredCostLines+(row.uncoveredCostLines||0),
    uncoveredNetSales:acc.uncoveredNetSales+(row.uncoveredNetSales||0),
    pilotCardLines:acc.pilotCardLines+(row.pilotCardLines||0), pilotCost:acc.pilotCost+(row.pilotCost||0),
    invoiceLineCount:acc.invoiceLineCount+(row.invoiceLineCount||0),
    provisionalLineCount:acc.provisionalLineCount+(row.provisionalLineCount||0),
    invoiceNetSales:acc.invoiceNetSales+(row.invoiceNetSales||0),
    provisionalNetSales:acc.provisionalNetSales+(row.provisionalNetSales||0),
    linkedReturnLines:acc.linkedReturnLines+(row.linkedReturnLines||0),
    unlinkedReturnLines:acc.unlinkedReturnLines+(row.unlinkedReturnLines||0),
  }), { sales:0, returns:0, discounts:0, profit:0, netSales:0, bulkPurchaseCostLines:0, lastPurchaseCostLines:0, nextPurchaseCostLines:0, uncoveredCostLines:0, uncoveredNetSales:0, pilotCardLines:0, pilotCost:0, invoiceLineCount:0, provisionalLineCount:0, invoiceNetSales:0, provisionalNetSales:0, linkedReturnLines:0, unlinkedReturnLines:0 });
  const top = [...data].sort((a,b) => b.sales-a.sales)[0];

  return <main className="page sales-page" id="top">
    <section className="page-heading sales-heading"><div><p className="eyebrow">Satış performansı</p><h1>Satışlar ve Kârlılık</h1><p>{year} satışlarını, iadeleri, iskontoları ve maliyet sonrası kârlılığı inceleyin.</p></div><span className={`source-badge source-badge--${mode}`}>{mode === "live" ? "CPM canlı" : "Pilot veri"}</span></section>
    <section className="sales-kpis"><article><span><IconChartBar/></span><div><small>Brüt satışlar</small><strong>{money.format(totals.sales)} TL</strong><p>Nihai + doğrulanmış geçici evraklar</p></div></article><article><span className="red"><IconReceiptRefund/></span><div><small>İadeler</small><strong>{money.format(totals.returns)} TL</strong><p>Brüt satışın %{totals.sales ? (totals.returns/totals.sales*100).toFixed(1).replace(".",",") : 0}</p></div></article><article><span className="amber"><IconDiscount/></span><div><small>İskontolar</small><strong>{money.format(totals.discounts)} TL</strong><p>Brüt satışın %{totals.sales ? (totals.discounts/totals.sales*100).toFixed(1).replace(".",",") : 0}</p></div></article><article><span className="green"><IconTrendingUp/></span><div><small>Esas kâr</small><strong>{money.format(totals.profit)} TL</strong><p>Eksik maliyetli gelir havuz dışında · marj %{totals.netSales ? (totals.profit/totals.netSales*100).toFixed(1).replace(".",",") : 0}</p></div></article></section>
    <section className="panel sales-chart-panel"><div className="panel-heading"><div><h2>Aylık Satış ve Marj Trendi</h2><p>Brüt satış, dağıtıma esas kâr ve net marj</p></div><div className="sales-highlight"><small>En yüksek satış</small><strong>{top?.monthName || "—"} · {money.format(top?.sales || 0)} TL</strong></div></div><div className="sales-chart"><ResponsiveContainer width="100%" height={320}><ComposedChart data={data} margin={{ top: 20, right: 18, left: 6, bottom: 4 }}><CartesianGrid vertical={false} stroke="#e5e9ef"/><XAxis dataKey="monthName" tick={{fontSize:11,fill:"#52677d"}}/><YAxis yAxisId="money" tickFormatter={(v)=>compact.format(v)} tick={{fontSize:11,fill:"#728197"}} width={72}/><YAxis yAxisId="percent" orientation="right" tickFormatter={(v)=>`%${v.toFixed(0)}`} tick={{fontSize:11,fill:"#728197"}}/><Tooltip formatter={(value,name)=>name==="Net marj"?`%${Number(value).toFixed(1)}`:`${money.format(value)} TL`}/><Bar yAxisId="money" dataKey="sales" name="Brüt satış" fill="#0a3972" radius={[3,3,0,0]}/><Bar yAxisId="money" dataKey="profit" name="Kâr" fill="#16884e" radius={[3,3,0,0]}/><Line yAxisId="percent" dataKey="margin" name="Net marj" stroke="#d58a19" strokeWidth={2}/></ComposedChart></ResponsiveContainer></div></section>
    <section className="panel sales-table-panel"><div className="sales-table-head"><div><h2>Aylık Satış Defteri</h2><p>{filtered.length} dönem gösteriliyor</p></div><div className="sales-filters"><label><IconFilter/><select aria-label="Maliyet kapsam filtresi" value={view} onChange={(e)=>setView(e.target.value)}><option value="all">Tüm dönemler</option><option value="healthy">Kapsamı yeterli</option><option value="risk">Kapsam riski</option></select></label><select aria-label="Satış sıralaması" value={sort} onChange={(e)=>setSort(e.target.value)}><option value="month">Aya göre</option><option value="sales">Satışa göre</option><option value="profit">Kâra göre</option></select></div></div><div className="table-scroll"><table className="sales-table"><thead><tr><th>Ay</th><th>Brüt satış</th><th>İade</th><th>İskonto</th><th>Net satış</th><th>Maliyet</th><th>Kâr</th><th>Marj</th><th>Maliyet kapsamı</th></tr></thead><tbody>{filtered.map((row)=><tr key={row.month}><th>{row.monthName}</th><td className="positive">{money.format(row.sales)}</td><td className="negative">-{money.format(row.returns)}</td><td className="negative">-{money.format(row.discounts)}</td><td>{money.format(row.netSales)}</td><td>{money.format(row.estimatedCost)}</td><td className={row.profit>=0?"positive":"negative"}>{money.format(row.profit)}</td><td>%{row.margin.toFixed(1).replace(".",",")}</td><td><span className={row.costCoveragePct>=minimumCoverage?"coverage-pill good":"coverage-pill risk"}>%{row.costCoveragePct.toFixed(1).replace(".",",")}</span></td></tr>)}</tbody><tfoot><tr><th>Toplam</th><td>{money.format(totals.sales)}</td><td className="negative">-{money.format(totals.returns)}</td><td className="negative">-{money.format(totals.discounts)}</td><td>{money.format(totals.netSales)}</td><td>—</td><td>{money.format(totals.profit)}</td><td>%{totals.netSales?(totals.profit/totals.netSales*100).toFixed(1).replace(".",","):0}</td><td>—</td></tr></tfoot></table></div></section>
  </main>;
}
