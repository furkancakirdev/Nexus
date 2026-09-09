import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBuildingStore,
  IconChartBar,
  IconCircleCheck,
  IconFileCheck,
  IconLayersLinked,
  IconReceipt2,
  IconShieldCheck,
  IconTrendingUp,
  IconWallet,
} from "@tabler/icons-react";
import { calculateDepartmentDistribution } from "./distribution";
import { MetricCard } from "./components/ui/MetricCard.jsx";
import { FinancialVisibilityPanel } from "./components/FinancialVisibilityPanel.jsx";
import { buildFinancialVisibility } from "./financialVisibility.mjs";
import {
  formatEur,
  formatInteger,
  formatMoney,
  formatPercent,
} from "./utils/formatters.js";

const compact = new Intl.NumberFormat("tr-TR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const sumField = (rows, field) => {
  const values = rows.map((row) => row[field]);
  return values.some((value) => value == null || !Number.isFinite(Number(value)))
    ? null
    : values.reduce((sum, value) => sum + Number(value), 0);
};

const finiteNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

function formatTimestamp(value) {
  if (!value) return "Zaman damgası taşınmıyor";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Zaman damgası geçersiz"
    : new Intl.DateTimeFormat("tr-TR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
}

function getSourceLabel(mode) {
  if (mode === "live") return "CPM canlı · salt okunur";
  if (mode === "demo") return "Pilot veri · finansal karar değil";
  return mode || "Kaynak belirtilmedi";
}

function getRateLabel(eurRateSets) {
  const rateSets = Object.values(eurRateSets || {});
  const sourceKinds = [...new Set(rateSets.flatMap((rateSet) => rateSet?.sourceKinds || []))];
  if (sourceKinds.includes("TCMB")) return "CPM öncelikli · TCMB fallback";
  if (rateSets.length > 0) return "Halkbank alış kuru kanıtı";
  return "EUR kur kanıtı bekleniyor";
}

function departmentBreakdownRows(canonicalMetric) {
  const raw = canonicalMetric?.departmentBreakdown || canonicalMetric?.departments;
  const candidates = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? Object.entries(raw).map(([id, value]) => ({ id, ...value }))
      : [];

  return candidates.map((item) => {
    const id = item.id || item.department || item.key;
    const value = finiteNumber(item.eurEquivalent?.netSales)
      ?? finiteNumber(item.eur?.netSales)
      ?? finiteNumber(item.netSales);
    const currency = item.eurEquivalent?.netSales != null || item.eur?.netSales != null
      ? "EUR"
      : "TRY";
    const labels = {
      service: "Servis",
      parts: "Yedek Parça Satış",
      review: "İnceleme gerekli",
    };
    return {
      id: id || item.name,
      name: item.name || labels[id] || "Tanımsız",
      value,
      currency,
      color: id === "service"
        ? "var(--chart-service)"
        : id === "parts"
          ? "var(--chart-parts)"
          : "var(--chart-review)",
    };
  }).filter((item) => item.id && item.value != null);
}

export function AccessibleChartLegend({ label, items }) {
  return (
    <ul className="chart-legend" aria-label={label}>
      {items.map((item) => (
        <li key={item.name}>
          <i aria-hidden="true" style={{ background: item.color }} />
          <span>{item.name}</span>
        </li>
      ))}
    </ul>
  );
}

function ActionItem({ icon: Icon, tone, title, detail, actionLabel, onClick }) {
  return (
    <li>
      <button
        type="button"
        className="attention-list__action"
        onClick={onClick}
        aria-label={actionLabel}
        style={{
          width: "100%",
          padding: "13px 0",
          display: "grid",
          gridTemplateColumns: "34px minmax(0, 1fr) 18px",
          alignItems: "center",
          gap: "10px",
          border: 0,
          borderBottom: "1px solid var(--line)",
          background: "transparent",
          color: "var(--ink)",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span aria-hidden="true" className={`attention-icon ${tone}`} style={{ width: 34, height: 34 }}>
          <Icon size={17} />
        </span>
        <span style={{ minWidth: 0, display: "grid", gap: 3 }}>
          <strong>{title}</strong>
          <small>{detail}</small>
        </span>
        <IconArrowRight aria-hidden="true" size={17} />
      </button>
    </li>
  );
}

export function SummaryPage({
  rows = [],
  settings,
  employees,
  targetRows = [],
  annualPool = 0,
  year = 2026,
  mode = "demo",
  onNavigate,
  canonicalMetric = null,
  eurRateSets = {},
}) {
  const isLoading = mode === "loading";
  const isError = mode === "error" || mode === "blocked";
  const effectiveRows = isLoading || isError ? [] : rows;
  const effectiveTargetRows = isLoading || isError ? [] : targetRows;

  const distributionResult = useMemo(
    () => calculateDepartmentDistribution({
      employees,
      settings,
      targetRows: effectiveTargetRows,
    }),
    [employees, settings, effectiveTargetRows],
  );
  const distribution = distributionResult.employees;

  // Official figures remain projections of the backend canonicalMetric only.
  const canonicalReady = canonicalMetric?.status === "TAMAM";
  const eurRevenueComplete = canonicalMetric?.eurRevenue?.complete === true;
  const totalSalesEur = eurRevenueComplete && Number.isFinite(canonicalMetric?.eurRevenue?.netSales)
    ? canonicalMetric.eurRevenue.netSales
    : null;
  const totalSalesTry = canonicalMetric?.try?.netSales != null && Number.isFinite(canonicalMetric.try.netSales)
    ? canonicalMetric.try.netSales
    : null;
  const eurCostComplete = canonicalReady && canonicalMetric?.eur?.complete === true;
  const totalProfitEur = eurCostComplete ? canonicalMetric.eur.profit : null;
  const eurActive = eurRevenueComplete && Number.isFinite(totalSalesEur);
  // There is no canonical EUR pool contract; never convert annualPool in the UI.
  const annualPoolEur = null;
  const rawCostReviewLines = canonicalMetric?.scope?.costReview?.lines;
  const costReviewLines = typeof rawCostReviewLines === "number" && Number.isFinite(rawCostReviewLines)
    ? rawCostReviewLines
    : null;
  const isCostReviewPending = !canonicalReady || costReviewLines === null || costReviewLines > 0;
  const financialVisibility = buildFinancialVisibility(canonicalMetric);
  const canonicalProfit = canonicalReady ? canonicalMetric?.try?.profit : null;
  const totalProfitTry = canonicalProfit ?? null;
  const grossMarginPct = !isCostReviewPending && Number.isFinite(canonicalMetric?.try?.margin)
    ? canonicalMetric.try.margin
    : null;

  const reviewPeriods = effectiveRows.filter((row) => (
    Number(row.uncoveredCostLines || 0) > 0 || Number(row.unlinkedReturnLines || 0) > 0
  ));
  const reviewLines = costReviewLines !== null
    ? costReviewLines
    : reviewPeriods.length > 0
      ? reviewPeriods.reduce((total, row) => total + Number(row.uncoveredCostLines || 0), 0)
      : null;
  const unlinkedReturnLines = reviewPeriods.reduce(
    (total, row) => total + Number(row.unlinkedReturnLines || 0),
    0,
  );
  const reviewQueueCount = reviewLines === null ? null : reviewLines + unlinkedReturnLines;
  const reviewNetSales = canonicalMetric?.scope?.costReview?.netSales ?? null;
  const canonicalCoverage = finiteNumber(canonicalMetric?.costCoveragePct);
  const eligible = distribution.filter((employee) => employee.eligible).length;
  const poolTry = effectiveTargetRows.length > 0 && Number.isFinite(Number(annualPool))
    ? annualPool
    : null;

  const sourceTimestamp = canonicalMetric?.generatedAt
    || effectiveRows.find((row) => row.generatedAt)?.generatedAt
    || null;
  const departmentRows = useMemo(
    () => departmentBreakdownRows(canonicalMetric),
    [canonicalMetric],
  );

  const chartRows = totalSalesEur == null
    ? effectiveRows.map((row) => ({ ...row, sales: null, profit: null }))
    : effectiveRows.map((row) => ({
      ...row,
      sales: row.eurEquivalent?.netSales ?? null,
      profit: eurCostComplete ? row.eurEquivalent?.profit ?? null : null,
    }));

  // These are display-only monthly source rows for the trend; annual official
  // figures above never fall back to a local EUR sum.
  const reportRows = chartRows;
  const reportTotals = {
    cost: eurCostComplete ? sumField(reportRows, "cost") : null,
  };
  void reportTotals;

  const actionQueue = [];
  if (isCostReviewPending) {
    actionQueue.push({
      icon: IconFileCheck,
      tone: "warning",
      title: reviewLines > 0 ? `${formatInteger(reviewLines)} maliyet satırı incelenmeli` : "Maliyet kanıtı tamamlanmadı",
      detail: reviewNetSales != null
        ? `${formatMoney(reviewNetSales)} kaynak TRY kâr/havuza alınmadı.`
        : "WAC kanıtı tamamlanmadan resmî kâr yayınlanmaz.",
      actionLabel: "Denetim ekranında maliyet kanıtını aç",
      page: "audit",
    });
  }
  if (!eurRevenueComplete) {
    actionQueue.push({
      icon: IconReceipt2,
      tone: "info",
      title: "EUR kur kapsamı tamamlanmadı",
      detail: "Eksik kur kanıtı bulunan dönemler EUR özetine dahil edilmez.",
      actionLabel: "Satış analizinde EUR kanıtını aç",
      page: "sales",
    });
  }
  if (unlinkedReturnLines > 0) {
    actionQueue.push({
      icon: IconLayersLinked,
      tone: "warning",
      title: `${formatInteger(unlinkedReturnLines)} iade bağlantısı incelenmeli`,
      detail: "İade, bağlı ekonomik vaka bulunmadan kâr veya maliyet kararına taşınmaz.",
      actionLabel: "Stok ve iade kanıtını aç",
      page: "inventory",
    });
  }

  const stateText = isLoading
    ? "Yönetici özeti verileri yükleniyor…"
    : mode === "blocked"
      ? "Bu yönetici özetini görme yetkiniz yok. Finansal veri gösterilmiyor."
      : "Yönetici özeti verileri okunamadı. Canlı veya pilot veri gösterilmiyor.";

  return (
    <main className="page summary-page" id="top">
      <section className="page-heading summary-heading">
        <div>
          <p className="eyebrow">5 saniyelik yönetim görünümü</p>
          <h1>Genel Bakış</h1>
          <p>{year} ticari görünüm · karar için önce kaynak ve kanıt durumunu kontrol edin.</p>
        </div>
        {!(isLoading || isError) && (
          <span className={`source-badge source-badge--${mode}`}>
            {getSourceLabel(mode)}
          </span>
        )}
      </section>

      {(isLoading || isError) && (
        <div
          className={`report-state report-state--${isError ? "error" : "loading"}`}
          role={isError ? "alert" : "status"}
          aria-live="polite"
        >
          {stateText}
        </div>
      )}

      {!(isLoading || isError) && (
        <>
          <section
            className="panel"
            aria-label="Veri güveni ve güncellik"
            style={{
              marginBottom: 18,
              padding: "12px 16px",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "10px 22px",
              color: "var(--muted)",
              fontSize: 12,
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <IconShieldCheck aria-hidden="true" size={17} color="var(--green)" />
              <strong style={{ color: "var(--ink)" }}>Güven: {canonicalReady && !isCostReviewPending ? "kanıt tamam" : "inceleme gerekli"}</strong>
            </span>
            <span>Kaynak: {getSourceLabel(mode)}</span>
            <span>Son güncelleme: {formatTimestamp(sourceTimestamp)}</span>
            <span>Kur: {getRateLabel(eurRateSets)}</span>
            {canonicalCoverage != null && <span>Maliyet kapsamı: {formatPercent(canonicalCoverage)}</span>}
          </section>

          <FinancialVisibilityPanel metric={canonicalMetric} title="Kârlılık ve marj görünürlüğü" />

          <section className="nexus-metric-grid" aria-label="Yönetim göstergeleri">
            <MetricCard
              title="Net Ciro"
              value={<div className="label-value"><strong>{formatEur(totalSalesEur)}</strong></div>}
              secondaryValue={eurActive && totalSalesTry != null ? `${formatMoney(totalSalesTry)} kaynak TRY` : "EUR dönüşüm kanıtı bekleniyor"}
              subtitle={`${effectiveRows.length} aylık kaynak dönem`}
              icon={IconChartBar}
              badge={eurActive ? "EUR kanıtlı" : "EUR inceleme"}
              badgeVariant={eurActive ? "info" : "warning"}
              onClick={() => onNavigate?.("sales")}
            />
            <MetricCard
              title={isCostReviewPending ? "Geçici Brüt Kâr · TRY" : "Brüt Kâr"}
              value={<div className="label-value"><strong>{isCostReviewPending ? formatMoney(financialVisibility.provisionalProfit) : formatEur(totalProfitEur)}</strong></div>}
              secondaryValue={isCostReviewPending ? financialVisibility.hasKnownCostEvidence ? "Eksik maliyetler hesaba katılmamıştır" : "Maliyet kanıtı olmadan kâr hesaplanmaz" : "Canonical EUR kâr"}
              subtitle="Resmî maliyet kanıtı"
              icon={IconTrendingUp}
              badge={isCostReviewPending ? "Kapalı" : "WAC kanıtlı"}
              badgeVariant={isCostReviewPending ? "warning" : "success"}
              onClick={() => onNavigate?.("sales")}
            />
            <MetricCard
              title={isCostReviewPending ? "Geçici Brüt Marj" : "Ortalama Brüt Marj"}
              value={<div className="label-value"><strong>{isCostReviewPending ? formatPercent(financialVisibility.provisionalMargin) : `%${Number(grossMarginPct).toFixed(1)}`}</strong></div>}
              secondaryValue={totalProfitTry != null ? `${formatMoney(totalProfitTry)} kaynak TRY kâr` : "Canonical TRY kâr bekleniyor"}
              subtitle="Canonical TRY marjı"
              icon={IconReceipt2}
              badge={isCostReviewPending ? "WAC bekleniyor" : "Canonical"}
              badgeVariant={isCostReviewPending ? "warning" : "info"}
              onClick={() => onNavigate?.("sales")}
            />
            <MetricCard
              title="İnceleme Kuyruğu"
              value={<div className="label-value"><strong>{formatInteger(reviewQueueCount, "—")}</strong></div>}
              secondaryValue={`${formatInteger(actionQueue.length)} karar başlığı`}
              subtitle="Maliyet, kur veya iade kanıtı"
              icon={IconAlertTriangle}
              badge={actionQueue.length > 0 ? "Aksiyon gerekli" : "Temiz"}
              badgeVariant={actionQueue.length > 0 ? "warning" : "success"}
              onClick={() => onNavigate?.("audit")}
            />
            <MetricCard
              title="Net Dağıtım Havuzu"
              value={<div className="label-value"><strong>{formatEur(annualPoolEur)}</strong></div>}
              secondaryValue={poolTry == null ? "EUR havuz kanıtı yok" : `${formatMoney(poolTry)} kaynak TRY · EUR dönüşümü yok`}
              subtitle={`${eligible} personel uygun · yönetim onayı gerekir`}
              icon={IconWallet}
              badge="EUR kapalı"
              badgeVariant="warning"
              onClick={() => onNavigate?.("ledger")}
            />
          </section>

          <section className="summary-grid" aria-label="Karar özeti">
            <section className="panel summary-performance">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Aylık ritim</p>
                  <h2>Net satış ve brüt kâr trendi</h2>
                  <p>EUR serileri yalnız ilgili canonical kur ve WAC kanıtı açık olduğunda değer taşır.</p>
                </div>
                <button type="button" className="secondary-button" onClick={() => onNavigate?.("sales")}>
                  Satışa git <IconArrowRight aria-hidden="true" size={16} />
                </button>
              </div>
              {chartRows.length ? (
                <>
                  <div className="summary-chart" role="img" aria-label="Aylık satış ve kârlılık grafiği" aria-describedby="summary-trend-help">
                    <ResponsiveContainer width="100%" height={270}>
                      <AreaChart data={chartRows} margin={{ top: 18, right: 18, left: 4, bottom: 4 }}>
                        <defs>
                          <linearGradient id="summarySalesFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--chart-sales)" stopOpacity={0.24} />
                            <stop offset="95%" stopColor="var(--chart-sales)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                        <XAxis dataKey="monthName" tick={{ fontSize: 11, fill: "var(--muted)" }} />
                        <YAxis tickFormatter={(value) => compact.format(value)} tick={{ fontSize: 11, fill: "var(--muted)" }} width={66} />
                        <Tooltip formatter={(value) => formatEur(value)} />
                        <Legend iconType="line" wrapperStyle={{ fontSize: 12 }} />
                        <Area dataKey="sales" name="Net satış · EUR" stroke="var(--chart-sales)" fill="url(#summarySalesFill)" strokeWidth={2} isAnimationActive={false} />
                        <Area dataKey="profit" name="Brüt kâr · EUR" stroke="var(--chart-profit)" fill="transparent" strokeWidth={2} isAnimationActive={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <p id="summary-trend-help" style={{ margin: "0 0 4px", color: "var(--muted)", fontSize: 12 }}>
                    Grafik özeti: {chartRows.length} dönem; devam eden dönemler tamamlanmış dönem gibi yorumlanmamalıdır.
                  </p>
                  <AccessibleChartLegend
                    label="Aylık satış ve kârlılık serileri"
                    items={[
                      { name: "Net satış", color: "var(--chart-sales)" },
                      { name: "Brüt kâr", color: "var(--chart-profit)" },
                    ]}
                  />
                  <details style={{ marginTop: 10 }}>
                    <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: 12 }}>Grafik verisini tablo olarak gör</summary>
                    <div className="table-scroll" style={{ marginTop: 8 }}>
                      <table>
                        <caption className="sr-only">Aylık net satış ve brüt kâr değerleri</caption>
                        <thead><tr><th scope="col">Dönem</th><th scope="col">Net satış · EUR</th><th scope="col">Brüt kâr · EUR</th></tr></thead>
                        <tbody>{chartRows.map((row) => (
                          <tr key={row.month}>
                            <th scope="row">{row.monthName || row.month}</th>
                            <td>{formatEur(row.sales)}</td>
                            <td>{formatEur(row.profit)}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </details>
                </>
              ) : (
                <div className="report-state report-state--empty">Aylık grafik için veri bulunamadı.</div>
              )}
            </section>

            <aside className="summary-attention" aria-labelledby="summary-attention-title">
              <div className="summary-attention__head">
                <IconAlertTriangle aria-hidden="true" />
                <strong id="summary-attention-title">Aksiyon kuyruğu</strong>
                <span aria-label={`${actionQueue.length} aksiyon`}>{actionQueue.length}</span>
              </div>
              <ul className="attention-list" style={{ margin: 0, padding: "0 16px", listStyle: "none" }}>
                {actionQueue.length > 0 ? actionQueue.map((item) => (
                  <ActionItem key={item.title} {...item} onClick={() => onNavigate?.(item.page)} />
                )) : (
                  <li style={{ padding: "18px 0", color: "var(--muted)", fontSize: 13 }}>
                    <IconCircleCheck aria-hidden="true" size={17} color="var(--green)" /> Aksiyon gerektiren açık kanıt bulunmuyor.
                  </li>
                )}
              </ul>
              <div style={{ padding: "12px 16px", borderTop: "1px solid var(--line)", color: "var(--muted)", fontSize: 12 }}>
                Kesinleşmeyen maliyet, kur ve iade satırları resmî kâr veya havuz kararına taşınmaz.
              </div>
            </aside>
          </section>

          <section className="panel" aria-labelledby="summary-departments-title" style={{ marginBottom: 16 }}>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Ticari mercek</p>
                  <h2 id="summary-departments-title">Servis · Yedek Parça · İnceleme</h2>
                  <p>Yalnız mevcut payload içindeki doğrudan departman kanıtı gösterilir; eksik mercek tahmin edilmez.</p>
                </div>
                <button type="button" className="secondary-button" onClick={() => onNavigate?.("departments")}>
                  Detay <IconArrowRight aria-hidden="true" size={16} />
                </button>
              </div>
              {departmentRows.length === 0 ? (
                <div className="report-state report-state--empty" role="status">
                  Departman kırılımı bu yönetici özeti payload’ında taşınmıyor; tahmin üretilmedi. Ayrıntılı departman endpoint’ini açın.
                </div>
              ) : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                {departmentRows.map((item) => (
                  <article key={item.id} style={{ padding: 14, border: "1px solid var(--line)", borderRadius: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 12 }}>
                      <i aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", background: item.color }} />
                      <span>{item.name}</span>
                    </div>
                    <strong style={{ display: "block", marginTop: 8, fontSize: 20 }}>{item.currency === "EUR" ? formatEur(item.value) : formatMoney(item.value)}</strong>
                  </article>
                ))}
              </div>}
          </section>

          <section className="summary-shortcuts" aria-label="Detay ekranları">
            <button type="button" onClick={() => onNavigate?.("sales")}>
              <IconChartBar aria-hidden="true" />
              <span><strong>Satış analizi</strong><small>Döviz, iskonto ve kâr kanıtı</small></span>
              <IconArrowRight aria-hidden="true" />
            </button>
            <button type="button" onClick={() => onNavigate?.("departments")}>
              <IconBuildingStore aria-hidden="true" />
              <span><strong>Departman analizi</strong><small>Servis ve Yedek Parça merceği</small></span>
              <IconArrowRight aria-hidden="true" />
            </button>
            <button type="button" onClick={() => onNavigate?.("audit")}>
              <IconFileCheck aria-hidden="true" />
              <span><strong>Veri denetimi</strong><small>WAC, kur ve iade incelemesi</small></span>
              <IconArrowRight aria-hidden="true" />
            </button>
            <button type="button" onClick={() => onNavigate?.("inventory")}>
              <IconLayersLinked aria-hidden="true" />
              <span><strong>Stok defteri</strong><small>Hareket ve kaynak belge soy zinciri</small></span>
              <IconArrowRight aria-hidden="true" />
            </button>
            <button type="button" onClick={() => onNavigate?.("ledger")}>
              <IconWallet aria-hidden="true" />
              <span><strong>Havuz ve dağıtım</strong><small>TRY hedefi · yönetim onayı</small></span>
              <IconArrowRight aria-hidden="true" />
            </button>
          </section>
        </>
      )}
    </main>
  );
}
