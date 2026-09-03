import { useMemo, useState } from "react";
import { projectCanonicalMetric, selectCanonicalTopPeriod } from "../shared/financialMetric.mjs";
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
  IconShieldCheck,
  IconTrendingUp,
} from "@tabler/icons-react";

const money = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 });
const eurFormat = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const percent = (value) => value === null || value === undefined ? "—" : `%${Number(value).toFixed(1).replace(".", ",")}`;
const formatMoney = (value) => value === null || value === undefined || !Number.isFinite(value) ? "—" : `${money.format(Math.round(value))} TL`;
const formatEur = (value) => value === null || value === undefined || !Number.isFinite(value) ? "—" : eurFormat.format(Math.round(value));
const sumNullable = (...values) => values.every((value) => Number.isFinite(value)) ? values.reduce((sum, value) => sum + value, 0) : null;
// EUR karşılığı yoksa (demo/bağlantısız mod) TL gösterimine düşer.
const formatReportMoney = (row, field, fallback) => {
  if (["cost", "profit"].includes(field) && row?.canonicalMetric && row.canonicalMetric.status !== "TAMAM") return "—";
  const eurValue = row?.eurEquivalent?.[field];
  if (typeof eurValue === "number" && Number.isFinite(eurValue)) return formatEur(eurValue);
  return formatMoney(fallback);
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
  const [showSecondaryMetrics, setShowSecondaryMetrics] = useState(false);

  const normalizedRows = useMemo(() => {
    return rows.map((row) => {
      const canonicalTry = projectCanonicalMetric(row.canonicalMetric, "TRY");
      const canonicalEur = projectCanonicalMetric(row.canonicalMetric, "EUR");
      const grossSales = row.sales ?? null;
      const returns = row.returns ?? null;
      const discounts = row.discounts ?? null;
      const netSales = canonicalTry.netSales;
      const v2Cost = canonicalTry.cost;
      const uncoveredNetSales = row.canonicalMetric?.scope?.costReview?.netSales ?? null;
      const profit = canonicalTry.profit;
      const netMargin = canonicalTry.margin;
      const productListMargin = typeof row.averageProductListGrossMarginPct === "number" && Number.isFinite(row.averageProductListGrossMarginPct)
        ? row.averageProductListGrossMarginPct
        : null;
      const coveragePct = row.v2CostCoveragePct ?? row.costCoveragePct ?? null;
      // EUR ana görünüm: backend'in ürettiği kur seti karşılıkları; yoksa null (TL gösterimine düşer).
      const eur = canonicalEur.complete ? row.eurEquivalent : null;
      const eurNetSales = canonicalEur.netSales;
      const eurCost = canonicalEur.cost;
      const eurProfit = canonicalEur.profit;
      const eurMargin = canonicalEur.margin;
      const rateMeta = eurRateSets?.[String(row.month)] || eurRateSets?.[row.month] || null;

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
        eurAvailable: canonicalEur.complete && eurNetSales !== null,
        eurFrozen: Boolean(row.eurFrozen),
        eurRateMeta: rateMeta,
        // Grafik için aktif para birimi alanları (EUR varsa o, yoksa TL).
        chartNetSales: eurNetSales ?? netSales,
        chartCost: eurCost ?? v2Cost,
        chartProfit: eurProfit ?? profit,
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
    const base = {
      grossSales: canonicalMetric?.grossSales ?? null,
      returns: canonicalMetric?.returns ?? null,
      discounts: canonicalMetric?.discounts ?? null,
      netSales: canonicalTotals.netSales,
      v2Cost: canonicalTotals.cost,
      uncoveredNetSales: canonicalMetric?.scope?.costReview?.netSales ?? null,
      profit: canonicalTotals.profit,
      lineCount: canonicalMetric?.evidence?.coveredLines ?? null,
      costCoveredLines: canonicalMetric?.evidence?.coveredLines ?? null,
      eurNetSales: canonicalMetric?.eur?.complete ? canonicalMetric.eur.netSales : null,
      eurCost: canonicalMetric?.eur?.complete ? canonicalMetric.eur.cost : null,
      eurProfit: canonicalMetric?.eur?.complete ? canonicalMetric.eur.profit : null,
      eurHasAny: canonicalMetric?.eur?.complete === true && canonicalMetric?.status === "TAMAM",
    };

    const overallMargin = canonicalTotals.margin;
    const overallCoverage = canonicalMetric?.costCoveragePct ?? null;
    const eurOverallMargin = canonicalMetric?.eur?.complete ? canonicalMetric.eurMargin : null;

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
    eurEquivalent: row.eurAvailable ? { netSales: row.eurNetSales } : null,
  })), canonicalMetric), [normalizedRows, canonicalMetric]);

  // Döviz sepetleri: tüm ayların byCurrency toplamları. EUR/USD/GBP/TRY
  // doğrudan toplanmaz; her sepet kendi dövizinde raporlanır.
  const currencyBasket = normalizeCurrencyBasket(canonicalMetric?.byCurrency);

  const eurActive = canonicalMetric?.eur?.complete === true && canonicalMetric?.status === "TAMAM";
  const reportMoney = eurActive ? formatEur : formatMoney;
  const rateMetaList = Object.values(eurRateSets || {});
  const weekendNote = rateMetaList.map((meta) => meta?.weekendOrHolidayNote).find(Boolean) || null;
  const frozenMonths = normalizedRows.filter((row) => row.eurFrozen && row.eurAvailable).length;

  const categoryBreakdownData = useMemo(() => {
    return canonicalMetric?.categoryBreakdown || [];
  }, [totals]);

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

      {/* Ana KPI'lar; ikincil metrikler aşağıdaki açılır gruptadır. */}
      <section className="control-kpis sales-kpis">
        <article>
          <span><IconChartBar size={22} /></span>
          <div>
            <small>Brüt satışlar</small>
            <strong>{formatMoney(totals.grossSales)}</strong>
            <p>Nihai + doğrulanmış faturalar</p>
          </div>
        </article>

        <article>
          <span className="red"><IconReceiptRefund size={22} /></span>
          <div>
            <small>İadeler ve İskontolar</small>
            <strong style={{ color: "var(--red)" }}>
              {sumNullable(totals.returns, totals.discounts) == null ? "—" : `−${formatMoney(sumNullable(totals.returns, totals.discounts))}`}
            </strong>
            <p>
              İade {formatMoney(totals.returns)} · İskonto {formatMoney(totals.discounts)}
            </p>
          </div>
        </article>

        <article>
          <span className="cyan"><IconCoins size={22} /></span>
          <div>
            <small>Net satışlar{eurActive ? " · EUR" : ""}</small>
            <strong>{eurActive ? formatEur(totals.eurNetSales) : formatMoney(totals.netSales)}</strong>
            <p>{eurActive ? "Halkbank alış kuru karşılığı" : "KDV hariç ticari hasılat"}</p>
          </div>
        </article>

        <article>
          <span className="slate"><IconLayersSubtract size={22} /></span>
          <div>
            <small>Satır Maliyeti{eurActive ? " · EUR" : ""}</small>
            <strong>{eurActive ? formatEur(totals.eurCost) : formatMoney(totals.v2Cost)}</strong>
            <p>Alım faturası + Halkbank kuru kanıtı</p>
          </div>
        </article>

        <div className="sales-kpis__secondary" hidden={!showSecondaryMetrics}>
          <article>
            <span className="green"><IconTrendingUp size={22} /></span>
            <div>
              <small>Esas Brüt Kâr{eurActive ? " · EUR" : ""}</small>
              <strong style={{ color: "var(--green)" }}>
                {eurActive ? formatEur(totals.eurProfit) : formatMoney(totals.profit)}
              </strong>
              <p>Net kâr marjı {percent(eurActive ? totals.eurOverallMargin : totals.overallMargin)}</p>
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

          <article>
            <span className="blue"><IconShieldCheck size={22} /></span>
            <div>
              <small>Maliyet / Kur Kapsamı</small>
              <strong>{percent(totals.overallCoverage)}</strong>
              <p>{money.format(totals.costCoveredLines)} / {money.format(totals.lineCount)} satır</p>
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
              <p>Net Satış (bar), Maliyet (bar), Esas Brüt Kâr (line) ve Net Marj % (sağ eksen line) · {eurActive ? "EUR karşılığı" : "TL"}</p>
            </div>
            <div className="sales-highlight">
              <small>En yüksek dönem</small>
              <strong>{topSalesMonth?.monthName || "—"} · {eurActive ? formatEur(topSalesMonth?.eurNetSales) : formatMoney(topSalesMonth?.netSales)}</strong>
            </div>
          </div>
          <div className="sales-chart" style={{ width: "100%", height: 340 }}>
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
                <Bar yAxisId="money" dataKey="chartCost" name="Maliyet" fill="#334155" radius={[4, 4, 0, 0]} />
                <Line yAxisId="money" dataKey="chartProfit" name="Esas Brüt Kâr" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: "#10b981" }} />
                <Line yAxisId="percent" dataKey="netMargin" name="Net Kâr Marjı %" stroke="#00d2d3" strokeWidth={2} dot={{ r: 3, fill: "#00d2d3" }} />
                <Line yAxisId="percent" dataKey="productListMargin" name="Liste Brüt Marjı %" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3, fill: "#f59e0b" }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel sales-category-panel">
          <div className="panel-heading">
            <div>
              <h2>Gelir ve Kategori Dağılımı</h2>
              <p>Hizmet ve Parça bazında net ciro dökümü</p>
            </div>
            <IconCoins size={20} style={{ color: "var(--accent)" }} />
          </div>
          <div style={{ width: "100%", height: 340 }}>
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
          </div>
        </article>
      </section>

      {/* Döviz Sepeti: EUR/USD/GBP/TRY ayrı tutulur, doğrudan toplanmaz */}
      <section className="panel sales-currency-panel">
        <div className="panel-heading">
          <div>
            <h2>Döviz Sepeti</h2>
            <p>Satış, maliyet ve kâr stok kartı dövizinde ayrı tutulur; EUR ana görünüm Halkbank alış kurlarıyla hesaplanır.</p>
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
                <th>Satır</th>
              </tr>
            </thead>
            <tbody>
              {["EUR", "USD", "GBP", "TRY"].map((currency) => {
                const item = currencyBasket[currency];
                if (!item.lineCount && !item.netSales) return null;
                const currencyMoney = new Intl.NumberFormat("tr-TR", { style: "currency", currency: currency === "TRY" ? "TRY" : currency, maximumFractionDigits: 0 });
                const fmt = (value) => currencyMoney.format(Math.round(value));
                return (
                  <tr key={currency}>
                    <th><strong>{currency}</strong></th>
                    <td>{fmt(item.netSales)}</td>
                    <td>{fmt(item.cost)}</td>
                    <td className={item.profit >= 0 ? "positive" : "negative"}><strong>{fmt(item.profit)}</strong></td>
                    <td>{money.format(item.lineCount)}</td>
                  </tr>
                );
              })}
              {currencyBasket.INCELEME.lineCount > 0 && (
                <tr>
                  <th><strong>İNCELEME</strong></th>
                  <td colSpan={3}>Kur veya maliyet kanıtı eksik satırlar EUR toplamına dahil edilmez</td>
                  <td>{money.format(currencyBasket.INCELEME.lineCount)}</td>
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
                <th>Brüt Satış</th>
                <th>İade</th>
                <th>İskonto</th>
                <th>Net Satış</th>
                <th>Maliyet</th>
                <th>Esas Brüt Kâr</th>
                <th>Net Marj</th>
                <th>Liste Brüt Marjı</th>
                <th>Maliyet Kapsamı</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.month}>
                  <th><strong>{row.monthName}{row.eurFrozen ? " 🔒" : ""}</strong></th>
                  <td className="positive">{formatMoney(row.grossSales)}</td>
                  <td className="negative">−{formatMoney(row.returns)}</td>
                  <td className="negative">−{formatMoney(row.discounts)}</td>
                  <td><strong>{formatReportMoney(row, "netSales", row.netSales)}</strong></td>
                  <td>{formatReportMoney(row, "cost", row.v2Cost)}</td>
                  <td className={(row.eurProfit ?? row.profit) >= 0 ? "positive" : "negative"}>
                    <strong>{formatReportMoney(row, "profit", row.profit)}</strong>
                  </td>
                  <td>
                    <span className={`margin-pill ${row.netMargin >= 35 ? "good" : row.netMargin >= 20 ? "warn" : "risk"}`}>
                      {percent(row.eurAvailable ? row.eurMargin : row.netMargin)}
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
                <td>{formatMoney(totals.grossSales)}</td>
                <td className="negative">−{formatMoney(totals.returns)}</td>
                <td className="negative">−{formatMoney(totals.discounts)}</td>
                <td><strong>{eurActive ? formatEur(totals.eurNetSales) : formatMoney(totals.netSales)}</strong></td>
                <td>{eurActive ? formatEur(totals.eurCost) : formatMoney(totals.v2Cost)}</td>
                <td className={(eurActive ? totals.eurProfit : totals.profit) >= 0 ? "positive" : "negative"}>
                  <strong>{eurActive ? formatEur(totals.eurProfit) : formatMoney(totals.profit)}</strong>
                </td>
                <td>{percent(eurActive ? totals.eurOverallMargin : totals.overallMargin)}</td>
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
