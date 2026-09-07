import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconChartBar,
  IconFileCheck,
  IconLayersLinked,
  IconWallet,
  IconTrendingUp,
  IconReceipt2,
  IconBuildingStore,
} from "@tabler/icons-react";
import { calculateDepartmentDistribution } from "./distribution";
import { MetricCard } from "./components/ui/MetricCard.jsx";
import {
  formatMoney,
  formatEur,
  formatPercent,
  formatInteger,
} from "./utils/formatters.js";

const compact = new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 });

const sumField = (rows, field) => {
  const values = rows.map((row) => row[field]);
  return values.some((value) => value == null || !Number.isFinite(Number(value)))
    ? null
    : values.reduce((sum, value) => sum + Number(value), 0);
};

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
  const [reportType, setReportType] = useState("management");
  const [startMonth, setStartMonth] = useState(1);
  const [endMonth, setEndMonth] = useState(12);

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

  const canonicalReady = canonicalMetric?.status === "TAMAM";
  const chartRows = effectiveRows.map((row) => ({
    ...row,
    sales: row.eurEquivalent?.netSales ?? null,
    profit: row.eurEquivalent?.profit ?? null,
  }));

  // Ciro ve Kâr: Tekil güven kaynağı canonicalMetric üzerinden okunur; yoksa dönem toplamı fallback olur.
  const canonicalNetSales = canonicalMetric?.try?.netSales != null && Number.isFinite(canonicalMetric.try.netSales)
    ? canonicalMetric.try.netSales
    : sumField(effectiveRows, "sales");
  const totalSalesTry = canonicalNetSales ?? 0;

  // EUR satış dönüşümü maliyet kanıtından bağımsızdır; kâr/havuz ise WAC kanıtı
  // tamamlanmadan kesin değer olarak gösterilmez.
  const eurRevenueComplete = canonicalMetric?.eurRevenue?.complete === true;
  const eurCostComplete = canonicalReady && canonicalMetric?.eur?.complete === true;
  const totalSalesEur = eurRevenueComplete ? canonicalMetric.eurRevenue.netSales : null;
  const totalProfitEur = eurCostComplete ? canonicalMetric.eur.profit : null;
  const eurActive = eurRevenueComplete && Number.isFinite(totalSalesEur);
  const annualPoolEur = eurCostComplete && totalSalesTry > 0 && totalSalesEur != null ? Math.round(annualPool * (totalSalesEur / totalSalesTry)) : null;

  // Brüt kâr ve marj: Maliyet inceleme durumundaysa yanıltıcı sıfır basılmaz; durum açıkça etiketlenir.
  const isCostReviewPending = !canonicalReady || (canonicalMetric?.scope?.costReview?.lines || 0) > 0;
  const canonicalProfit = canonicalReady ? canonicalMetric?.try?.profit : null;
  const totalProfitTry = canonicalProfit ?? null;
  const grossMarginPct = totalSalesTry > 0 && !isCostReviewPending && totalProfitTry != null
    ? (totalProfitTry / totalSalesTry) * 100
    : null;

  const eligible = distribution.filter((employee) => employee.eligible).length;
  const reviewPeriods = effectiveRows.filter((row) => Number(row.uncoveredCostLines || 0) > 0);

  const reportRows = chartRows.filter((row) => row.month >= startMonth && row.month <= endMonth);
  const reportTotals = {
    sales: sumField(reportRows, "sales"),
    returns: sumField(reportRows.map((row) => ({ returns: row.eurEquivalent?.returns })), "returns"),
    discounts: sumField(reportRows.map((row) => ({ discounts: row.eurEquivalent?.discounts })), "discounts"),
    cost: eurCostComplete ? sumField(reportRows, "cost") : null,
    profit: eurCostComplete ? sumField(reportRows, "profit") : null,
  };

  const rankedProfitRows = reportRows.filter((row) => row.profit != null);
  const bestProfit = [...rankedProfitRows].sort((a, b) => b.profit - a.profit)[0];
  const worstProfit = [...rankedProfitRows].sort((a, b) => a.profit - b.profit)[0];
  const firstName = reportRows[0]?.monthName || "—";
  const lastName = reportRows.at(-1)?.monthName || "—";

  const narratives = {
    management: `${year} ${firstName}–${lastName} döneminde ${formatEur(reportTotals.sales)} net ciro ve ${reportTotals.profit != null ? formatEur(reportTotals.profit) : "inceleme aşamasında"} brüt kâr elde edildi. ${grossMarginPct != null ? `Brüt kâr marjı %${grossMarginPct.toFixed(1)} seviyesindedir.` : "WAC maliyet doğrulaması devam etmektedir."}`,
    sales: `Seçilen dönemde fatura satışları ${formatEur(reportTotals.sales)} olarak gerçekleşti. ${formatEur(reportTotals.returns)} satış iadesi ve ${formatEur(reportTotals.discounts)} fatura iskontosu düşüldükten sonra net ticari ciro EUR kanıtı kapsamında gösterildi.`,
    profit: `Seçilen dönemde toplam brüt kâr ${reportTotals.profit != null ? formatEur(reportTotals.profit) : "maliyet onayı bekliyor"}. WAC maliyet modeli doğrultusunda dağıtıma esas havuz rezervler ve hedef gerçekleşmeleriyle entegre edildi.`,
    cost: `Seçilen dönemin CPM fatura ve hareketli ağırlıklı ortalama (WAC) bazlı toplam maliyeti ${reportTotals.cost != null ? formatEur(reportTotals.cost) : "inceleme aşamasında"} olarak kaydedildi.`,
    discount: `Seçilen dönemde gerçekleşen fatura iskontoları toplamı ${formatEur(reportTotals.discounts)}, iade düşüşleri ise ${formatEur(reportTotals.returns)} tutarındadır.`,
  };

  const stateText = isLoading
    ? "Yönetici özeti verileri yükleniyor…"
    : mode === "blocked"
      ? "Bu yönetici özetini görme yetkiniz yok. Finansal veri gösterilmiyor."
      : "Yönetici özeti verileri okunamadı. Canlı veya pilot veri gösterilmiyor.";

  return (
    <main className="page summary-page" id="top">
      <section className="page-heading summary-heading">
        <div>
          <p className="eyebrow">Üst Düzey Yönetim Paneli</p>
          <h1>Genel Bakış</h1>
          <p>{year} yılı ticari ciro, çoklu dövizli WAC kârlılığı ve operasyonel göstergeleri.</p>
        </div>
        {!(isLoading || isError) && (
          <span className={`source-badge source-badge--${mode}`}>
            {mode === "live" ? "CPM Canlı" : mode === "demo" ? "Pilot Veri" : mode}
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
          {/* 1. Üst Yönetim Karar Kartları (3-4 Temel Metrik) */}
          <div className="nexus-metric-grid" aria-label="Temel Yönetim Göstergeleri">
            <MetricCard
              title="Net Ciro"
              value={
                <div className="label-value">
                  <strong>{formatEur(totalSalesEur)}</strong>
                </div>
              }
              secondaryValue={eurActive ? `${formatMoney(totalSalesTry)} kaynak TRY` : "EUR dönüşüm kanıtı bekleniyor"}
              subtitle={`${effectiveRows.length} dönem fatura toplamı`}
              icon={IconChartBar}
              badge={eurActive ? "EUR-First" : "EUR İnceleme"}
              badgeVariant="info"
              onClick={() => onNavigate?.("sales")}
            />
            <MetricCard
              title="Brüt Kâr"
              value={
                <div className="label-value">
                  <strong>
                    {isCostReviewPending
                      ? "İncelemede"
                      : eurCostComplete && totalProfitEur != null
                        ? formatEur(totalProfitEur)
                        : "—"}
                  </strong>
                </div>
              }
              secondaryValue={isCostReviewPending ? "Maliyet kapsamı bekleniyor" : "WAC maliyet düşüldükten sonra"}
              subtitle="Gerçek alım faturası kanıtı"
              icon={IconTrendingUp}
              badge={isCostReviewPending ? "Kapsam Bekleniyor" : grossMarginPct != null ? `%${grossMarginPct.toFixed(1)} Marj` : "—"}
              badgeVariant={isCostReviewPending ? "warning" : grossMarginPct >= 25 ? "success" : "warning"}
              onClick={() => onNavigate?.("sales")}
            />
            <MetricCard
              title="Ortalama Brüt Marj"
              value={
                <div className="label-value">
                  <strong>
                    {isCostReviewPending ? "Hesaplanıyor" : grossMarginPct != null ? `%${grossMarginPct.toFixed(1)}` : "—"}
                  </strong>
                </div>
              }
              secondaryValue={isCostReviewPending ? "Alım kanıtları inceleniyor" : "100 × (Satış − Maliyet) ÷ Satış"}
              subtitle="Liste ve perakende marj tabanı"
              icon={IconReceipt2}
              badge={isCostReviewPending ? "WAC Bekleniyor" : "WAC Esaslı"}
              badgeVariant={isCostReviewPending ? "warning" : "info"}
            />
            <MetricCard
              title="Net Dağıtım Havuzu"
              value={
                <div className="label-value">
                  <strong>{formatEur(annualPoolEur)}</strong>
                </div>
              }
              secondaryValue={`${eligible} personel hak kazandı`}
              subtitle="Departman hedef bandı"
              icon={IconWallet}
              badge="Havuz"
              badgeVariant="success"
              onClick={() => onNavigate?.("ledger")}
            />
          </div>

          {/* 2. Aksiyon Odaklı Operasyonel Durum Çubuğu */}
          {reviewPeriods.length > 0 && (
            <div
              className="nexus-action-banner"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "16px",
                padding: "16px 20px",
                background: "var(--surface)",
                border: "1px solid color-mix(in srgb, var(--amber) 35%, var(--line))",
                borderLeft: "4px solid var(--amber)",
                borderRadius: "var(--radius-md)",
                margin: "18px 0",
                boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <span style={{ color: "var(--amber)", display: "flex" }}>
                  <IconAlertTriangle size={24} />
                </span>
                <div>
                  <strong style={{ color: "var(--ink)", fontSize: "14px", display: "block" }}>
                    {reviewPeriods.length} dönemde maliyet veya döviz kuru incelemesi bekleniyor
                  </strong>
                  <p style={{ margin: "2px 0 0", color: "var(--muted)", fontSize: "12px" }}>
                    Alım faturası veya kur kanıtı eksik satırlar kârı yanıltıcı göstermemek için askıya alınmıştır.
                  </p>
                </div>
              </div>
              <button
                className="primary-action"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "9px 18px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
                onClick={() => onNavigate?.("audit")}
              >
                Denetim Ekranında İncele <IconArrowRight size={16} />
              </button>
            </div>
          )}

          {/* 3. Dönemsel Yönetici Raporu */}
          <section className="panel narrative-report">
            <div className="narrative-report__head">
              <div>
                <p className="eyebrow">Yönetici Analiz Raporu</p>
                <h2>Dönemsel Yönetim Özeti</h2>
              </div>
              <div className="narrative-controls">
                <select value={reportType} onChange={(e) => setReportType(e.target.value)}>
                  <option value="management">Yönetim Özeti</option>
                  <option value="sales">Satış Raporu</option>
                  <option value="profit">Kârlılık Raporu</option>
                  <option value="cost">Maliyet Raporu</option>
                  <option value="discount">İskonto & İade</option>
                </select>
                <select
                  value={startMonth}
                  onChange={(e) => setStartMonth(Math.min(Number(e.target.value), endMonth))}
                >
                  {rows.map((row) => (
                    <option key={row.month} value={row.month}>
                      {row.monthName}
                    </option>
                  ))}
                </select>
                <select
                  value={endMonth}
                  onChange={(e) => setEndMonth(Math.max(Number(e.target.value), startMonth))}
                >
                  {rows.map((row) => (
                    <option key={row.month} value={row.month}>
                      {row.monthName}
                    </option>
                  ))}
                </select>
                <button className="secondary-button" onClick={() => window.print()}>
                  Yazdır
                </button>
              </div>
            </div>
            <p className="narrative-copy">{narratives[reportType]}</p>
            <small>Devam eden aylar tamamlanmış ay gibi yorumlanmaz; rapor seçilen veri aralığıyla sınırlıdır.</small>
          </section>

          {/* 4. Aylık Net Trend Grafiği ve Operasyonel Durum */}
          <div className="summary-grid">
            <section className="panel summary-performance">
              <div className="panel-heading">
                <div>
                  <h2>Aylık Satış ve Kârlılık Trendi</h2>
                  <p>CPM net satış ve hareketli ortalama maliyete göre brüt kâr seyri</p>
                </div>
              </div>
              {chartRows.length ? (
                <div className="summary-chart" role="img" aria-label="Aylık satış ve kârlılık grafiği">
                  <ResponsiveContainer width="100%" height={310}>
                    <AreaChart data={chartRows} margin={{ top: 18, right: 18, left: 4, bottom: 4 }}>
                      <defs>
                        <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--chart-sales)" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="var(--chart-sales)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                      <XAxis dataKey="monthName" tick={{ fontSize: 11, fill: "var(--muted)" }} />
                      <YAxis
                        tickFormatter={(value) => compact.format(value)}
                        tick={{ fontSize: 11, fill: "var(--muted)" }}
                        width={72}
                      />
                      <Tooltip formatter={(value) => formatEur(value)} />
                      <Legend iconType="line" wrapperStyle={{ fontSize: 12 }} />
                      <Area
                        dataKey="sales"
                        name="Satış · EUR"
                        stroke="var(--chart-sales)"
                        fill="url(#salesFill)"
                        strokeWidth={2}
                      />
                      <Area
                        dataKey="profit"
                        name="Kâr · EUR"
                        stroke="var(--chart-profit)"
                        fill="transparent"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="report-state report-state--empty">Aylık grafik için veri bulunamadı.</div>
              )}
              {chartRows.length > 0 && (
                <AccessibleChartLegend
                  label="Aylık satış ve kârlılık serileri"
                  items={[
                    { name: "Satış", color: "var(--chart-sales)" },
                    { name: "Kâr", color: "var(--chart-profit)" },
                  ]}
                />
              )}
            </section>

            <aside className="summary-attention">
              <div className="summary-attention__head">
                <IconAlertTriangle />
                <strong>Operasyonel Durum</strong>
                <span>{reviewPeriods.length}</span>
              </div>
              <div className="attention-list">
                <button onClick={() => onNavigate?.("audit")}>
                  <span className="attention-icon warning"><IconFileCheck /></span>
                  <div>
                    <strong>{reviewPeriods.length} dönem maliyet incelemesi var</strong>
                    <small>Doğrulanmamış veya negatif stok satırları.</small>
                  </div>
                  <IconArrowRight />
                </button>
                <button onClick={() => onNavigate?.("departments")}>
                  <span className="attention-icon info"><IconBuildingStore /></span>
                  <div>
                    <strong>Departman Gelir Dağılımı</strong>
                    <small>Servis ve Yedek Parça ticari sorumluları.</small>
                  </div>
                  <IconArrowRight />
                </button>
                <button onClick={() => onNavigate?.("inventory")}>
                  <span className="attention-icon ok"><IconLayersLinked /></span>
                  <div>
                    <strong>Stok Muavin Defteri</strong>
                    <small>Kronolojik hareketler, alım-satım dökümü.</small>
                  </div>
                  <IconArrowRight />
                </button>
              </div>
            </aside>
          </div>

          {/* 5. Alt Kısayol Menüsü */}
          <section className="summary-shortcuts">
            <button onClick={() => onNavigate?.("sales")}>
              <IconChartBar />
              <span><strong>Satış Analizi</strong><small>Döviz sepeti, iskonto ve brüt marj</small></span>
              <IconArrowRight />
            </button>
            <button onClick={() => onNavigate?.("departments")}>
              <IconBuildingStore />
              <span><strong>Departman Analizi</strong><small>Servis, Yedek Parça, Ticari Sorumlular</small></span>
              <IconArrowRight />
            </button>
            <button onClick={() => onNavigate?.("inventory")}>
              <IconLayersLinked />
              <span><strong>Stok Modülü</strong><small>Muavin defter, alım/satım kronolojisi</small></span>
              <IconArrowRight />
            </button>
            <button onClick={() => onNavigate?.("audit")}>
              <IconFileCheck />
              <span><strong>Veri Denetimi</strong><small>WAC doğrulama ve maliyet kontrolü</small></span>
              <IconArrowRight />
            </button>
            <button onClick={() => onNavigate?.("ledger")}>
              <IconWallet />
              <span><strong>Havuz & Dağıtım</strong><small>Personel payları ve kâr şelalesi</small></span>
              <IconArrowRight />
            </button>
          </section>
        </>
      )}
    </main>
  );
}
