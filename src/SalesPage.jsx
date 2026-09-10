import { useMemo, useState } from "react";
import { projectCanonicalMetric, selectCanonicalTopPeriod } from "../shared/financialMetric.mjs";
import { FinancialVisibilityPanel } from "./components/FinancialVisibilityPanel.jsx";
import { formatCurrencyAmount } from "./utils/formatters.js";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  IconAlertTriangle,
  IconChartBar,
  IconCircleCheck,
  IconCoins,
  IconDatabase,
  IconDiscount,
  IconFileInvoice,
  IconFilter,
  IconLayersSubtract,
  IconReceiptRefund,
  IconTrendingUp,
} from "@tabler/icons-react";

const money = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 });
const eurFormat = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const percent = (value) => value === null || value === undefined ? "—" : `%${Number(value).toFixed(1).replace(".", ",")}`;
const formatMoney = (value) => value === null || value === undefined || !Number.isFinite(value) ? "—" : `${money.format(Math.round(value))} TL`;
const formatEur = (value) => value === null || value === undefined || !Number.isFinite(value) ? "—" : eurFormat.format(Math.round(value));
const sumNullable = (...values) => values.every((value) => Number.isFinite(value)) ? values.reduce((sum, value) => sum + value, 0) : null;
const profitTone = (value) => value == null ? "" : value >= 0 ? "positive" : "negative";
export const formatReportMoney = (row, field, fallback) => {
  const eurValue = row?.eurAvailable === true ? row?.eurEquivalent?.[field] : null;
  if (typeof eurValue === "number" && Number.isFinite(eurValue)) return formatEur(eurValue);
  return "—";
};

export function normalizeCurrencyBasket(basket = {}) {
  return Object.fromEntries([
    "EUR", "USD", "GBP", "TRY", "INCELEME",
  ].map((currency) => [currency, { lineCount: 0, ...(basket?.[currency] || {}) }]));
}

function CustomSalesTooltip({ active, payload, label, moneyFormatter = formatMoney }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip" style={{ minWidth: "220px" }}>
      <strong style={{ display: "block", marginBottom: "6px", color: "var(--ink)", borderBottom: "1px solid var(--line)", paddingBottom: "4px" }}>
        {label}
      </strong>
      <div style={{ display: "grid", gap: "4px", fontSize: "12px" }}>
        {payload.map((entry) => {
          const isPercent = entry.name.includes("marj") || entry.name.includes("Marj") || entry.name.includes("%");
          return (
            <div key={entry.dataKey || entry.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--muted)" }}>
                <i style={{ width: "8px", height: "8px", borderRadius: "2px", background: entry.color || entry.fill || entry.stroke, display: "inline-block" }} />
                {entry.name}
              </span>
              <strong style={{ color: entry.color || entry.fill || entry.stroke }}>
                {isPercent ? percent(entry.value) : moneyFormatter(entry.value)}
              </strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SalesPage({ rows = [], year, mode = "live", minimumCoverage = 80, eurRateSets = {}, canonicalMetric = null }) {
  const [view, setView] = useState("all");
  const [sort, setSort] = useState("month");
  const [showSecondaryMetrics, setShowSecondaryMetrics] = useState(true);

  const normalizedRows = useMemo(() => {
    return rows.map((row) => {
      const canonicalTry = projectCanonicalMetric(row.canonicalMetric, "TRY");
      const canonicalEur = projectCanonicalMetric(row.canonicalMetric, "EUR");
      const grossSales = row.sales ?? null;
      const returns = row.returns ?? null;
      const discounts = row.discounts ?? null;
      const netSales = canonicalTry.netSales ?? (row.sales != null ? Number(row.sales) - Number(row.returns || 0) - Number(row.discounts || 0) : null);
      const v2Cost = canonicalTry.cost;
      const uncoveredNetSales = row.canonicalMetric?.scope?.costReview?.netSales ?? null;
      const profit = canonicalTry.profit;
      const netMargin = canonicalTry.margin;
      const productListMargin = typeof row.averageProductListGrossMarginPct === "number" && Number.isFinite(row.averageProductListGrossMarginPct)
        ? row.averageProductListGrossMarginPct
        : null;
      const coveragePct = row.v2CostCoveragePct ?? row.costCoveragePct ?? null;
      // EUR ana görünüm: satış dönüşümü maliyet/WAC kanıtından bağımsızdır.
      // Maliyet ve kâr ise canonicalEur tarafından kanıt yoksa null bırakılır.
      const eur = row.eurEquivalent || null;
      const eurNetSales = canonicalEur.netSales;
      const eurCost = canonicalEur.cost ?? null;
      const eurProfit = canonicalEur.profit ?? null;
      const eurMargin = canonicalEur.margin ?? null;
      const eurAvailable = canonicalEur.revenueComplete === true && eurNetSales !== null;
      const rateMeta = eurRateSets?.[String(row.month)] || eurRateSets?.[row.month] || null;

      const chartNetSales = eurAvailable ? eurNetSales : null;
      const chartCost = eurCost;
      const chartProfit = eurProfit;

      return {
        ...row,
        grossSales,
        returns,
        discounts,
        netSales,
        v2Cost,
        uncoveredNetSales,
        profit,
        netMargin,
        productListMargin,
        coveragePct,
        eurNetSales,
        eurCost,
        eurProfit,
        eurMargin,
        eurAvailable,
        eurFrozen: Boolean(row.eurFrozen),
        eurRateMeta: rateMeta,
        // Grafikler kanıtlanmış EUR alanlarını kullanır; eksik kanıt boş kalır.
        chartNetSales,
        chartCost,
        chartProfit,
      };
    });
  }, [rows, eurRateSets]);

  const filtered = useMemo(() => {
    return normalizedRows
      .filter((row) => {
        if (view === "healthy") return row.coveragePct >= minimumCoverage;
        if (view === "risk") return row.coveragePct < minimumCoverage;
        return true;
      })
      .sort((a, b) => {
        if (sort === "sales") return b.netSales - a.netSales;
        if (sort === "profit") return b.profit - a.profit;
        if (sort === "margin") return b.netMargin - a.netMargin;
        if (sort === "productListMargin") return (b.productListMargin || 0) - (a.productListMargin || 0);
        return a.month - b.month;
      });
  }, [normalizedRows, view, sort, minimumCoverage]);

  const totals = useMemo(() => {
    const canonicalTotals = projectCanonicalMetric(canonicalMetric, "TRY");
    const canonicalEurTotals = projectCanonicalMetric(canonicalMetric, "EUR");
    const rowGrossSales = normalizedRows.reduce((sum, r) => sum + (Number(r.grossSales) || 0), 0);
    const rowReturns = normalizedRows.reduce((sum, r) => sum + (Number(r.returns) || 0), 0);
    const rowDiscounts = normalizedRows.reduce((sum, r) => sum + (Number(r.discounts) || 0), 0);
    const rowNetSales = normalizedRows.reduce((sum, r) => sum + (Number(r.netSales) || 0), 0);
    const base = {
      grossSales: canonicalMetric?.grossSales ?? (rowGrossSales > 0 ? rowGrossSales : null),
      returns: canonicalMetric?.returns ?? (rowReturns > 0 ? rowReturns : null),
      discounts: canonicalMetric?.discounts ?? (rowDiscounts > 0 ? rowDiscounts : null),
      netSales: canonicalTotals.netSales ?? (rowNetSales > 0 ? rowNetSales : null),
      v2Cost: canonicalTotals.cost,
      uncoveredNetSales: canonicalMetric?.scope?.costReview?.netSales ?? null,
      profit: canonicalTotals.profit,
      lineCount: canonicalMetric?.evidence?.reviewLines || canonicalMetric?.evidence?.coveredLines || null,
      costCoveredLines: canonicalMetric?.evidence?.coveredLines ?? null,
      eurGrossSales: canonicalMetric?.eurBreakdown?.complete ? canonicalMetric.eurBreakdown.grossSales : null,
      eurReturns: canonicalMetric?.eurBreakdown?.complete ? canonicalMetric.eurBreakdown.returns : null,
      eurDiscounts: canonicalMetric?.eurBreakdown?.complete ? canonicalMetric.eurBreakdown.discounts : null,
      eurNetSales: canonicalEurTotals.revenueComplete ? canonicalEurTotals.netSales : null,
      eurCost: canonicalEurTotals.costComplete ? canonicalEurTotals.cost : null,
      eurProfit: canonicalEurTotals.costComplete ? canonicalEurTotals.profit : null,
      eurHasAny: canonicalEurTotals.revenueComplete === true,
    };

    const overallMargin = canonicalTotals.margin;
    const overallCoverage = canonicalMetric?.costCoveragePct ?? null;
    const eurOverallMargin = canonicalEurTotals.costComplete ? canonicalMetric?.eurMargin : null;

    return {
      ...base,
      overallMargin,
      avgProductListMargin: canonicalMetric?.averageProductListGrossMarginPct ?? null,
      overallCoverage,
      eurOverallMargin,
    };
  }, [normalizedRows, canonicalMetric]);

  const topSalesMonth = useMemo(() => selectCanonicalTopPeriod(normalizedRows.map((row) => ({
    ...row,
    eurComplete: row.eurAvailable === true,
    eurRevenueComplete: row.eurAvailable === true,
    eurEquivalent: row.eurAvailable ? { netSales: row.eurNetSales } : null,
  })), canonicalMetric), [normalizedRows, canonicalMetric]);

  // Döviz sepetleri: tüm ayların byCurrency toplamları. EUR/USD/GBP/TRY
  // doğrudan toplanmaz; her sepet kendi dövizinde raporlanır.
  const currencyBasket = normalizeCurrencyBasket(canonicalMetric?.byCurrency);

  const eurTotals = projectCanonicalMetric(canonicalMetric, "EUR");
  const eurActive = eurTotals.revenueComplete === true && Number.isFinite(totals.eurNetSales);
  const reportMoney = formatEur;
  const rateMetaList = Object.values(eurRateSets || {});
  const weekendNote = rateMetaList.map((meta) => meta?.weekendOrHolidayNote).find(Boolean) || null;
  const rateSourceLabel = rateMetaList.some((meta) => (meta?.sourceKinds || []).includes("TCMB"))
    ? "CPM öncelikli · TCMB fallback"
    : "Halkbank alış kuru";
  const frozenMonths = normalizedRows.filter((row) => row.eurFrozen && row.eurAvailable).length;
  const hasSalesTrendData = normalizedRows.some((row) => [
    row.chartNetSales,
    row.chartCost,
    row.chartProfit,
    row.netMargin,
    row.productListMargin,
  ].some((value) => Number.isFinite(Number(value))));

  const categoryBreakdownData = useMemo(() => {
    if (Array.isArray(canonicalMetric?.categoryBreakdown) && canonicalMetric.categoryBreakdown.length > 0) {
      return canonicalMetric.categoryBreakdown;
    }
    let laborSales = 0;
    let srfSales = 0;
    let tsrSales = 0;
    let roadSales = 0;
    let totalGross = 0;

    for (const r of normalizedRows) {
      totalGross += Number(r.grossSales || 0);
      if (r.pilotCards) {
        laborSales += Number(r.pilotCards.labor?.sales || 0);
        srfSales += Number(r.pilotCards.srf?.sales || 0);
        tsrSales += Number(r.pilotCards.tsr?.sales || 0);
        roadSales += Number(r.pilotCards.road?.sales || 0);
      }
    }
    const partsSales = Math.max(0, totalGross - (laborSales + srfSales + tsrSales + roadSales));
    return [
      { name: "Yedek Parça", sales: partsSales, color: "var(--blue, #2563eb)" },
      { name: "İşçilik", sales: laborSales, color: "var(--teal, #0d9488)" },
      { name: "Sörf / Hizmet", sales: srfSales, color: "var(--indigo, #6366f1)" },
      { name: "Yol / Seyahat", sales: roadSales, color: "var(--amber, #f59e0b)" },
      { name: "TSR / Taşeron", sales: tsrSales, color: "var(--rose, #f43f5e)" },
    ].filter((item) => item.sales > 0);
  }, [canonicalMetric, normalizedRows]);

  return (
    <main className="page sales-page" id="top">
      <section className="page-heading control-room-heading">
        <div>
          <p className="eyebrow">Satış ve kârlılık kokpiti</p>
          <h1>Satış Analizi ve Marj Defteri</h1>
          <p>{year} yılı KDV hariç satışları, alım faturası ve kur kanıtlı maliyetleri ve kârlılık trendini izleyin.</p>
        </div>
        <div className="heading-actions">
          <span className={`source-badge source-badge--${mode}`}>
            <IconDatabase size={15} />
            {mode === "live" ? "CPM canlı · salt okunur" : "Pilot / simüle veri"}
          </span>
          {eurActive && (
            <span className="source-badge source-badge--eur" title={weekendNote || undefined}>
              <IconCoins size={15} />
              EUR raporlama{frozenMonths > 0 ? ` · ${frozenMonths} dönem donuk` : ""}
            </span>
          )}
        </div>
      </section>
      {weekendNote && (
        <p className="eur-rate-note" role="note">{weekendNote}</p>
      )}

      <FinancialVisibilityPanel metric={canonicalMetric} title="Satış kârlılığı · tüm görünür kapsam" />

      {/* Ana KPI'lar; ikincil metrikler aşağıdaki açılır gruptadır. */}
      <section className="control-kpis sales-kpis">
        <article>
          <span><IconChartBar size={22} /></span>
          <div>
             <small>Brüt satışlar · EUR</small>
             <strong>{formatEur(totals.eurGrossSales)}</strong>
             <p>{totals.eurGrossSales == null ? "EUR dönüşüm kanıtı bekleniyor" : "Halkbank alış kuru karşılığı"}</p>
          </div>
        </article>

        <article>
          <span className="red"><IconReceiptRefund size={22} /></span>
          <div>
             <small>İadeler ve İskontolar · EUR</small>
             <strong style={{ color: "var(--red)" }}>
               {sumNullable(totals.eurReturns, totals.eurDiscounts) == null ? "—" : `−${formatEur(sumNullable(totals.eurReturns, totals.eurDiscounts))}`}
             </strong>
             <p>
               İade {formatEur(totals.eurReturns)} · İskonto {formatEur(totals.eurDiscounts)}
            </p>
          </div>
        </article>

        <article>
          <span className="cyan"><IconCoins size={22} /></span>
          <div>
             <small>Net satışlar · EUR</small>
             <strong>{formatEur(totals.eurNetSales)}</strong>
             <p>{eurActive ? `${rateSourceLabel} karşılığı` : "EUR dönüşüm kanıtı bekleniyor"}</p>
          </div>
        </article>

        <article>
          <span className="slate"><IconLayersSubtract size={22} /></span>
          <div>
             <small>Satır Maliyeti · EUR</small>
             <strong>{formatEur(totals.eurCost)}</strong>
             <p>{totals.eurCost == null ? "WAC / maliyet kanıtı incelemede" : "Alım faturası + Halkbank kuru kanıtı"}</p>
          </div>
        </article>

        <div className="sales-kpis__secondary" hidden={!showSecondaryMetrics}>
          <article>
            <span className="green"><IconTrendingUp size={22} /></span>
            <div>
               <small>Esas Brüt Kâr · EUR</small>
               <strong style={{ color: "var(--green)" }}>
                 {formatEur(totals.eurProfit)}
              </strong>
               <p>Net kâr marjı {totals.eurOverallMargin != null ? percent(totals.eurOverallMargin) : "WAC Bekleniyor"}</p>
            </div>
          </article>

          <article>
            <span className="amber"><IconFileInvoice size={22} /></span>
            <div>
              <small>Ortalama Liste Brüt Marjı</small>
              <strong style={{ color: "var(--amber)" }}>
                {totals.avgProductListMargin == null ? "—" : percent(totals.avgProductListMargin)}
              </strong>
              <p>Perakende fiyat − döviz maliyeti</p>
            </div>
          </article>

        </div>
      </section>
      <button className="sales-kpis__toggle" type="button" aria-expanded={showSecondaryMetrics} onClick={() => setShowSecondaryMetrics((value) => !value)}>
        {showSecondaryMetrics ? "Daha az metrik göster" : "İkincil metrikleri göster"}
      </button>

      {/* Main Dual-Axis Chart & Category Breakdown Grid */}
      <section className="sales-charts-layout">
        <article className="panel sales-chart-panel">
          <div className="panel-heading">
            <div>
              <h2>Aylık Satış, Maliyet ve Marj Trendi</h2>
               <p>Net Satış (bar), Maliyet (bar), Esas Brüt Kâr (line) ve Net Marj % (sağ eksen line) · EUR karşılığı</p>
            </div>
            <div className="sales-highlight">
              <small>En yüksek dönem</small>
               <strong>{topSalesMonth?.monthName || "—"} · {formatEur(topSalesMonth?.eurNetSales)}</strong>
            </div>
          </div>
          {!hasSalesTrendData ? (
            <div className="report-state report-state--empty" role="status">
              Grafik gösterilemiyor: EUR kur, maliyet veya satış kanıtı bu dönem için tamamlanmadı.
            </div>
          ) : <div className="sales-chart" style={{ width: "100%", height: 340 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={normalizedRows} margin={{ top: 18, right: 24, left: 6, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 3" />
                <XAxis dataKey="monthName" tick={{ fontSize: 11, fill: "var(--muted)" }} />
                <YAxis
                  yAxisId="money"
                  tickFormatter={(v) => compact.format(v)}
                  tick={{ fontSize: 11, fill: "var(--muted)" }}
                  width={72}
                />
                <YAxis
                  yAxisId="percent"
                  orientation="right"
                  tickFormatter={(v) => `%${Number(v).toFixed(0)}`}
                  tick={{ fontSize: 11, fill: "var(--muted)" }}
                  width={48}
                />
                <Tooltip content={<CustomSalesTooltip moneyFormatter={reportMoney} />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar yAxisId="money" dataKey="chartNetSales" name="Net Satış" fill="#0284c7" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="money" dataKey="chartCost" name="Maliyet" fill="var(--chart-cost, #475569)" radius={[4, 4, 0, 0]} />
                <Line yAxisId="money" dataKey="chartProfit" name="Esas Brüt Kâr" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: "#10b981" }} />
                <Line yAxisId="percent" dataKey="netMargin" name="Net Kâr Marjı %" stroke="#00d2d3" strokeWidth={2} dot={{ r: 3, fill: "#00d2d3" }} />
                <Line yAxisId="percent" dataKey="productListMargin" name="Liste Brüt Marjı %" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3, fill: "#f59e0b" }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>}
        </article>

        <article className="panel sales-category-panel">
          <div className="panel-heading">
            <div>
              <h2>Gelir ve Kategori Dağılımı · kaynak TRY</h2>
              <p>Hizmet ve Parça bazında kaynak tutar; EUR ana finansal göstergeler yukarıdadır</p>
            </div>
            <IconCoins size={20} style={{ color: "var(--accent)" }} />
          </div>
          {categoryBreakdownData.length === 0 ? <div className="report-state report-state--empty" role="status">Kategori grafiği için kaynak satış verisi bulunamadı.</div> : <div style={{ width: "100%", height: 340 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryBreakdownData} layout="vertical" margin={{ top: 12, right: 20, left: 10, bottom: 4 }}>
                <CartesianGrid horizontal={false} stroke="var(--line)" strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v) => compact.format(v)} tick={{ fontSize: 10, fill: "var(--muted)" }} />
                <YAxis type="category" dataKey="name" width={95} tick={{ fontSize: 11, fill: "var(--ink)" }} />
                <Tooltip content={<CustomSalesTooltip />} />
                <Bar dataKey="sales" name="Net Ciro" radius={[0, 4, 4, 0]}>
                  {categoryBreakdownData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>}
        </article>
      </section>

      {/* Döviz Sepeti: EUR/USD/GBP/TRY ayrı tutulur, doğrudan toplanmaz */}
      <section className="panel sales-currency-panel">
        <div className="panel-heading">
          <div>
            <h2>Döviz Sepeti</h2>
            <p>Satış, maliyet ve kâr stok kartı dövizinde ayrı tutulur; EUR ana görünüm CPM öncelikli kur kanıtı, gerektiğinde TCMB fallback ile hesaplanır.</p>
          </div>
        </div>
        <div className="table-scroll">
          <table className="control-table sales-table">
            <thead>
              <tr>
                <th>Döviz</th>
                <th>Net Satış</th>
                <th>Maliyet</th>
                <th>Brüt Kâr</th>
              </tr>
            </thead>
            <tbody>
              {["EUR", "USD", "GBP", "TRY"].map((currency) => {
                const item = currencyBasket[currency];
                if (!item.lineCount && !item.netSales) return null;
                return (
                  <tr key={currency}>
                    <th><strong>{currency}</strong></th>
                    <td>{formatCurrencyAmount(item.netSales, currency)}</td>
                    <td>{formatCurrencyAmount(item.cost, currency)}</td>
                    <td className={profitTone(item.profit)}><strong>{formatCurrencyAmount(item.profit, currency)}</strong></td>
                  </tr>
                );
              })}
              {currencyBasket.INCELEME.lineCount > 0 && (
                <tr>
                  <th><strong>İNCELEME</strong></th>
                  <td colSpan={3}>Kur veya maliyet kanıtı eksik; finansal toplamlar dışında tutuldu</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Monthly Sales Ledger Table */}
      <section className="panel sales-table-panel">
        <div className="sales-table-head">
          <div>
            <h2>Aylık Satış ve Kârlılık Defteri</h2>
            <p>{filtered.length} dönem gösteriliyor · KDV hariç uzlaşmalı defter</p>
          </div>
          <div className="sales-filters">
            <label className="filter-select-label">
              <IconFilter size={16} />
              <select
                aria-label="Maliyet kapsam filtresi"
                value={view}
                onChange={(e) => setView(e.target.value)}
              >
                <option value="all">Tüm dönemler</option>
                <option value="healthy">Kapsamı yeterli (&gt;=%{minimumCoverage})</option>
                <option value="risk">Kapsam riski (&lt;%{minimumCoverage})</option>
              </select>
            </label>

            <select
              aria-label="Satış sıralaması"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="month">Aya göre sırala</option>
              <option value="sales">Net Satışa göre sırala</option>
              <option value="profit">Kâra göre sırala</option>
              <option value="margin">Net Marja göre sırala</option>
              <option value="productListMargin">Ürün Liste Marjına göre sırala</option>
            </select>
          </div>
        </div>

        <div className="table-scroll">
          <table className="control-table sales-table">
            <thead>
              <tr>
                <th>Ay</th>
                 <th>Brüt Satış (EUR)</th>
                 <th>İade (EUR)</th>
                 <th>İskonto (EUR)</th>
                 <th>Net Satış (EUR)</th>
                 <th>Maliyet (EUR)</th>
                 <th>Esas Brüt Kâr (EUR)</th>
                <th>Net Marj</th>
                <th>Liste Brüt Marjı</th>
                <th>Maliyet Kapsamı</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.month}>
                  <th><strong>{row.monthName}{row.eurFrozen ? " 🔒" : ""}</strong></th>
                   <td className="positive">{formatEur(row.eurEquivalent?.grossSales)}</td>
                   <td className="negative">−{formatEur(row.eurEquivalent?.returns)}</td>
                   <td className="negative">−{formatEur(row.eurEquivalent?.discounts)}</td>
                   <td><strong>{formatReportMoney(row, "netSales", null)}</strong></td>
                   <td>{formatReportMoney(row, "cost", null)}</td>
                  <td className={profitTone(row.eurProfit ?? row.profit)}>
                    <strong>{formatReportMoney(row, "profit", row.profit)}</strong>
                  </td>
                  <td>
                    <span className={`margin-pill ${row.netMargin >= 35 ? "good" : row.netMargin >= 20 ? "warn" : "risk"}`}>
                       {percent(row.eurMargin)}
                    </span>
                  </td>
                  <td>
                    <strong style={{ color: "var(--amber)" }}>
                      {row.productListMargin == null ? "—" : percent(row.productListMargin)}
                    </strong>
                  </td>
                  <td>
                    <span className={row.coveragePct >= minimumCoverage ? "coverage-pill good" : "coverage-pill risk"}>
                      {percent(row.coveragePct)}
                    </span>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan="10" className="empty-cell" style={{ textAlign: "center", padding: "28px" }}>
                    Filtrelere uygun satış dönemi bulunamadı.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <th>Toplam</th>
                 <td>{formatEur(totals.eurGrossSales)}</td>
                 <td className="negative">−{formatEur(totals.eurReturns)}</td>
                 <td className="negative">−{formatEur(totals.eurDiscounts)}</td>
                 <td><strong>{formatEur(totals.eurNetSales)}</strong></td>
                 <td>{formatEur(totals.eurCost)}</td>
                   <td className={profitTone(totals.eurProfit)}>
                   <strong>{formatEur(totals.eurProfit)}</strong>
                 </td>
                 <td>{percent(totals.eurOverallMargin)}</td>
                <td>
                  <strong style={{ color: "var(--amber)" }}>
                    {totals.avgProductListMargin == null ? "—" : percent(totals.avgProductListMargin)}
                  </strong>
                </td>
                <td>
                  <span className={totals.overallCoverage >= minimumCoverage ? "coverage-pill good" : "coverage-pill risk"}>
                    {percent(totals.overallCoverage)}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </main>
  );
}
