import { useCallback, useEffect, useMemo, useState } from "react";
import {
  IconAdjustmentsHorizontal,
  IconAlertTriangle,
  IconCalendar,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconDatabase,
  IconDots,
  IconFish,
  IconInfoCircle,
  IconLock,
  IconMenu2,
  IconX,
} from "@tabler/icons-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SettingsPage } from "./SettingsPage";
import { GoalsPage, PILOT_EMPLOYEES } from "./GoalsPage";
import { ApprovalPage } from "./ApprovalPage";
import { ReportsPage } from "./ReportsPage";
import { SummaryPage } from "./SummaryPage";
import { SalesPage } from "./SalesPage";
import { DepartmentAnalysisPage } from "./DepartmentAnalysisPage";
import { AuditPage } from "./AuditPage";
import { PerformancePage } from "./PerformancePage";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  serializeSettings,
} from "../shared/settingsPolicy.mjs";
import {
  buildDepartmentTargetView,
  mergeMonthlyTargetPools,
} from "../shared/departmentTargetView.mjs";
import { normalizePilotEmployees } from "../shared/employeePolicy.mjs";

const NAV_ITEMS = [
  { page: "summary", label: "Özet" },
  { page: "sales", label: "Satışlar" },
  { page: "departments", label: "Departmanlar" },
  { page: "audit", label: "Veri Denetimi" },
  { page: "ledger", label: "Havuz" },
  { page: "goals", label: "Hedef Takibi" },
  { page: "performance", label: "Katkı & Performans" },
  { page: "reports", label: "Raporlar" },
  { page: "approval", label: "Onay & Kapanış" },
  { page: "settings", label: "Ayarlar" },
];

const DEFAULT_APPEARANCE = { theme: "light", density: "comfortable", highContrast: false, reducedMotion: false, defaultPage: "summary" };

const fallbackRows = [
  [1, "Ocak", 168_520_000, 4_210_000, 6_180_000, 100_845_000, 83.8],
  [2, "Şubat", 181_740_000, 4_520_000, 6_350_000, 105_980_000, 82.4],
  [3, "Mart", 208_660_000, 5_410_000, 7_890_000, 121_775_000, 79.6],
  [4, "Nisan", 215_480_000, 5_670_000, 8_360_000, 132_940_000, 76.3],
  [5, "Mayıs", 251_050_000, 8_540_000, 8_940_000, 140_978_000, 66.1],
].map(([month, monthName, sales, returns, discounts, estimatedCost, costCoveragePct]) => ({
  month, monthName, sales, returns, discounts, estimatedCost, costCoveragePct, source: "demo",
}));

const money = new Intl.NumberFormat("tr-TR", {
  maximumFractionDigits: 0,
});

const compactMoney = new Intl.NumberFormat("tr-TR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function fmt(value) {
  return money.format(Math.round(value || 0));
}

function WaterfallTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  return (
    <div className="chart-tooltip">
      <strong>{item.name}</strong>
      <span>{fmt(item.amount)} TL</span>
    </div>
  );
}

function StatusDot({ status }) {
  return (
    <span className={`status status--${status === "Kesinleşmiş" ? "final" : "estimate"}`}>
      <span className="status__dot" />{status}
    </span>
  );
}

async function fetchDepartmentTargetState(year) {
  const response = await fetch(`/api/department-targets?year=${year}`);
  const payload = await response.json();
  return {
    rows: response.ok && Array.isArray(payload.rows) ? payload.rows : [],
    mode: response.ok ? payload.mode || "live" : "error",
    error: response.ok ? null : payload.error || "Hedef verisi okunamadı.",
    generatedAt: payload.generatedAt || null,
  };
}

export function App() {
  const [appearance, setAppearance] = useState(()=>{ try{return {...DEFAULT_APPEARANCE,...JSON.parse(localStorage.getItem("marlin-appearance")||"{}")};}catch{return DEFAULT_APPEARANCE;} });
  const [appearanceOpen,setAppearanceOpen]=useState(false);
  const [activePage, setActivePage] = useState(() => {
    const requestedPage = new URLSearchParams(window.location.search).get("page");
    const availablePages = new Set(NAV_ITEMS.map((item) => item.page));
    return availablePages.has(requestedPage) ? requestedPage : (appearance.defaultPage || "summary");
  });
  const [employees, setEmployees] = useState(() => {
    try {
      const storedEmployees = JSON.parse(
        localStorage.getItem("marlin-pilot-employees") || "null",
      );
      return normalizePilotEmployees(storedEmployees || PILOT_EMPLOYEES);
    }
    catch { return PILOT_EMPLOYEES; }
  });
  const [appSettings, setAppSettings] = useState(() => {
    try {
      const storedSettings = JSON.parse(localStorage.getItem("marlin-profit-settings") || "{}");
      return normalizeSettings(storedSettings);
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const [costOverrides, setCostOverrides] = useState(() => {
    try { return JSON.parse(localStorage.getItem("marlin-cost-overrides") || "[]"); }
    catch { return []; }
  });
  const [year, setYear] = useState(2026);
  const [rows, setRows] = useState(fallbackRows);
  const [targetState, setTargetState] = useState({
    rows: [],
    mode: "loading",
    error: null,
    generatedAt: null,
  });
  const [mode, setMode] = useState("loading");
  const [connection, setConnection] = useState({ connected: false, readOnly: true });
  const [statusFilter, setStatusFilter] = useState("all");
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const refreshDepartmentTargets = useCallback(async () => {
    try {
      const nextState = await fetchDepartmentTargetState(year);
      setTargetState(nextState);
      return nextState;
    } catch {
      const failedState = {
        rows: [],
        mode: "error",
        error: "Departman hedefleri okunamadı.",
        generatedAt: null,
      };
      setTargetState(failedState);
      return failedState;
    }
  }, [year]);

  useEffect(()=>{
    document.documentElement.dataset.theme=appearance.theme;
    document.documentElement.classList.toggle("high-contrast",appearance.highContrast);
    document.documentElement.classList.toggle("reduced-motion",appearance.reducedMotion);
    localStorage.setItem("marlin-appearance",JSON.stringify(appearance));
  },[appearance]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/health").then((response) => response.json()),
      fetch("/api/app-state")
        .then((response) => response.ok ? response.json() : null)
        .catch(() => null),
    ]).then(([health, savedState]) => {
      if (cancelled) return;
      setConnection(health);
      if (savedState?.settings) {
        const migrated = normalizeSettings(savedState.settings);
        setAppSettings(migrated);
        localStorage.setItem(
          "marlin-profit-settings",
          JSON.stringify(serializeSettings(migrated)),
        );
      }
      if (savedState?.employees?.length) {
        setEmployees(normalizePilotEmployees(savedState.employees));
      }
      if (Array.isArray(savedState?.costOverrides)) {
        setCostOverrides(savedState.costOverrides);
      }
    }).catch(() => {
      if (!cancelled) setConnection({ connected: false, readOnly: true });
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMode("loading");

    Promise.all([
      fetch(`/api/overview?year=${year}`).then((response) => response.json()),
      fetchDepartmentTargetState(year),
    ]).then(([overview, targets]) => {
      if (cancelled) return;
      setRows(overview.rows?.length ? overview.rows : fallbackRows);
      setMode(overview.mode || "demo");
      setTargetState(targets);
    }).catch(() => {
      if (cancelled) return;
      setRows(fallbackRows);
      setMode("demo");
      setTargetState({
        rows: [],
        mode: "error",
        error: "Departman hedefleri okunamadı.",
        generatedAt: null,
      });
    });

    return () => { cancelled = true; };
  }, [year]);

  const calculatedRows = useMemo(() => rows.map((row) => {
    const manualDecisions = costOverrides.filter((decision) => {
      const date = new Date(decision.documentDate);
      const mayEnterPool = !appSettings.requireManagementApprovalForManualCost || decision.status === "approved";
      return mayEnterPool && date.getFullYear() === year && date.getMonth() + 1 === Number(row.month);
    });
    const manualCost = manualDecisions.reduce((sum, decision) => sum + Number(decision.quantity || 0) * Number(decision.unitCost || 0) * (decision.isSale ? 1 : -1), 0);
    const resolvedUncoveredNet = manualDecisions.reduce((sum, decision) => sum + Number(decision.netAmount || 0) * (decision.isSale ? 1 : -1), 0);
    const pilotEntries = Object.entries(row.pilotCards || {});
    const pilotSales = pilotEntries.reduce((sum, [, card]) => sum + Number(card.sales || 0), 0);
    const pilotReturns = pilotEntries.reduce((sum, [, card]) => sum + Number(card.returns || 0), 0);
    const pilotDiscounts = pilotEntries.reduce((sum, [, card]) => sum + Number(card.discounts || 0), 0);
    const pilotCost = pilotEntries.reduce((sum, [key, card]) => {
      const netSales = Number(card.sales || 0) - Number(card.returns || 0) - Number(card.discounts || 0);
      const costRate = Number(appSettings.pilotCardCostRates?.[key] ?? 100) / 100;
      return sum + netSales * costRate;
    }, 0);
    const nonPilotLines = Number(row.masterCostLines || 0) + Number(row.bulkPurchaseCostLines || 0) + Number(row.lastPurchaseCostLines || 0) + Number(row.nextPurchaseCostLines || 0) + Number(row.uncoveredCostLines || 0);
    const coveredLines = Number(row.masterCostLines || 0) + Number(row.bulkPurchaseCostLines || 0) + Number(row.lastPurchaseCostLines || 0) + Number(row.nextPurchaseCostLines || 0) + Number(row.pilotCardLines || 0) + manualDecisions.length;
    const totalLines = nonPilotLines + Number(row.pilotCardLines || 0);
    return {
      ...row,
      sales: Number(row.sales || 0) + pilotSales,
      returns: Number(row.returns || 0) + pilotReturns,
      discounts: Number(row.discounts || 0) + pilotDiscounts,
      estimatedCost: Number(row.estimatedCost || 0) + pilotCost + manualCost,
      uncoveredNetSales: Number(row.uncoveredNetSales || 0) - resolvedUncoveredNet,
      uncoveredCostLines: Math.max(0, Number(row.uncoveredCostLines || 0) - manualDecisions.length),
      manualCost,
      manualCostLines: manualDecisions.length,
      pilotCost,
      pilotNetSales: pilotSales - pilotReturns - pilotDiscounts,
      coverageCoveredLines: coveredLines,
      coverageTotalLines: totalLines,
      costCoveragePct: totalLines ? Number((coveredLines / totalLines * 100).toFixed(1)) : 0,
    };
  }), [rows, appSettings.pilotCardCostRates, appSettings.requireManagementApprovalForManualCost, costOverrides, year]);

  const enrichedRows = useMemo(() => mergeMonthlyTargetPools(
    calculatedRows.map((row) => {
    const profit = row.sales - row.returns - row.discounts - row.estimatedCost - (row.uncoveredNetSales || 0);
    const status = Number(row.uncoveredCostLines || 0) === 0 && Number(row.unlinkedReturnLines || 0) === 0
      ? "Kesinleşmiş"
      : "Tahmini";
    return { ...row, profit, status };
    }),
    targetState.rows,
  ), [calculatedRows, targetState.rows]);

  const targetView = useMemo(
    () => buildDepartmentTargetView(targetState.rows),
    [targetState.rows],
  );
  const annualPool = targetView.totalPool;

  const filteredRows = enrichedRows.filter((row) => (
    statusFilter === "all" ||
    (statusFilter === "final" && row.status === "Kesinleşmiş") ||
    (statusFilter === "estimate" && row.status === "Tahmini")
  ));

  const totals = enrichedRows.reduce((acc, row) => ({
    sales: acc.sales + row.sales,
    returns: acc.returns + row.returns,
    discounts: acc.discounts + row.discounts,
    cost: acc.cost + row.estimatedCost,
    profit: acc.profit + row.profit,
    contribution: acc.contribution + row.contribution,
  }), { sales: 0, returns: 0, discounts: 0, cost: 0, profit: 0, contribution: 0 });

  const coverageTotals = enrichedRows.reduce((acc, row) => ({
    covered: acc.covered + Number(row.coverageCoveredLines || 0),
    total: acc.total + Number(row.coverageTotalLines || 0),
  }), { covered: 0, total: 0 });
  const weightedCoverage = coverageTotals.total ? coverageTotals.covered / coverageTotals.total * 100 : 0;

  const waterfall = [
    { name: "Satışlar", base: 0, value: totals.sales, amount: totals.sales, color: "#0a3972" },
    { name: "İadeler", base: Math.max(0, totals.sales - totals.returns), value: totals.returns, amount: -totals.returns, color: "#e84b55" },
    { name: "İskontolar", base: Math.max(0, totals.sales - totals.returns - totals.discounts), value: totals.discounts, amount: -totals.discounts, color: "#e84b55" },
    { name: "Maliyet", base: Math.max(0, totals.profit), value: totals.cost, amount: -totals.cost, color: "#ee5c64" },
    { name: "Dağıtıma Esas Kâr", base: 0, value: Math.max(0, totals.profit), amount: totals.profit, color: "#16884e" },
  ];

  const selected = selectedMonth
    ? enrichedRows.find((row) => row.month === selectedMonth)
    : null;

  const persistState = (nextSettings, nextEmployees, nextCostOverrides = costOverrides) => {
    return fetch("/api/app-state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settings: serializeSettings(nextSettings),
        employees: nextEmployees,
        costOverrides: nextCostOverrides,
      }),
    });
  };

  const saveSettings = async (nextSettings) => {
    const normalized = normalizeSettings(nextSettings);
    const serialized = serializeSettings(normalized);
    const saved = await persistState(serialized, employees);
    if (!saved.ok) throw new Error("Ayarlar kaydedilemedi.");
    setAppSettings(normalized);
    localStorage.setItem("marlin-profit-settings", JSON.stringify(serialized));
    localStorage.setItem("marlin-settings-saved-at", new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date()));
    try {
      await refreshDepartmentTargets();
    } catch {
      setTargetState({
        rows: [],
        mode: "error",
        error: "Ayarlar kaydedildi fakat hedefler yenilenemedi.",
        generatedAt: null,
      });
    }
  };

  const saveEmployees = (nextEmployees) => {
    const normalizedEmployees = normalizePilotEmployees(nextEmployees);
    setEmployees(normalizedEmployees);
    localStorage.setItem(
      "marlin-pilot-employees",
      JSON.stringify(normalizedEmployees),
    );
    persistState(appSettings, normalizedEmployees).catch(() => {});
  };

  const saveCostOverrides = (nextCostOverrides) => {
    setCostOverrides(nextCostOverrides);
    localStorage.setItem("marlin-cost-overrides", JSON.stringify(nextCostOverrides));
    persistState(appSettings, employees, nextCostOverrides)
      .then((response) => {
        if (!response.ok) throw new Error("Maliyet kararı kaydedilemedi.");
        return refreshDepartmentTargets();
      })
      .catch(() => {});
  };

  return (
    <div className={`app-shell density-${appearance.density}`}>
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setMobileNavOpen((value) => !value)} aria-label="Menüyü aç" aria-expanded={mobileNavOpen}>
          <IconMenu2 size={22} />
        </button>
        <a className="brand" href="#top" aria-label="Marlin Nexus Yönetim Sistemi">
          <IconFish size={30} stroke={1.6} />
          <span className="brand__copy"><strong>Marlin Nexus</strong><small>Yönetim Sistemi</small></span>
        </a>
        <nav className={mobileNavOpen ? "nav nav--open" : "nav"} aria-label="Ana menü">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.page}
              className={activePage === item.page ? "nav__item nav__item--active" : "nav__item"}
              onClick={() => {
                setActivePage(item.page);
                setMobileNavOpen(false);
              }}
            >{item.label}</button>
          ))}
        </nav>
        <label className="year-control">
          <IconCalendar size={18} />
          <select aria-label="Yıl" value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {[2024, 2025, 2026].map((item) => <option key={item}>{item}</option>)}
          </select>
          <IconChevronDown size={16} />
        </label>
        <button className="icon-button" onClick={()=>setAppearanceOpen(true)} aria-label="Görünüm ayarları"><IconAdjustmentsHorizontal size={19} /></button>
      </header>

      {appearanceOpen&&<div className="appearance-backdrop" onMouseDown={(event)=>event.target===event.currentTarget&&setAppearanceOpen(false)}><aside className="appearance-drawer" role="dialog" aria-modal="true" aria-labelledby="appearance-title"><div className="appearance-drawer__head"><div><p className="eyebrow">Arayüz tercihleri</p><h2 id="appearance-title">Görünüm Ayarları</h2></div><button className="modal-close" onClick={()=>setAppearanceOpen(false)} aria-label="Kapat"><IconX size={20}/></button></div><div className="appearance-fields"><label><span>Tema</span><select value={appearance.theme} onChange={(event)=>setAppearance({...appearance,theme:event.target.value})}><option value="light">Açık</option><option value="dark">Koyu</option></select></label><label><span>Ekran yoğunluğu</span><select value={appearance.density} onChange={(event)=>setAppearance({...appearance,density:event.target.value})}><option value="comfortable">Rahat</option><option value="compact">Kompakt</option></select></label><label><span>Başlangıç sayfası</span><select value={appearance.defaultPage} onChange={(event)=>setAppearance({...appearance,defaultPage:event.target.value})}><option value="summary">Özet</option><option value="ledger">Havuz</option><option value="sales">Satışlar</option><option value="departments">Departman Analizi</option><option value="performance">Katkı &amp; Performans</option><option value="reports">Raporlar</option><option value="audit">Veri Denetimi</option></select></label><label className="appearance-check"><span><strong>Yüksek kontrast</strong><small>Metin ve sınır ayrımını güçlendirir.</small></span><input type="checkbox" checked={appearance.highContrast} onChange={(event)=>setAppearance({...appearance,highContrast:event.checked})}/></label><label className="appearance-check"><span><strong>Hareketi azalt</strong><small>Grafik ve geçiş animasyonlarını kapatır.</small></span><input type="checkbox" checked={appearance.reducedMotion} onChange={(event)=>setAppearance({...appearance,reducedMotion:event.checked})}/></label></div><div className="employee-modal__actions"><button className="secondary-button" onClick={()=>setAppearance(DEFAULT_APPEARANCE)}>Varsayılana dön</button><button className="primary-action" onClick={()=>setAppearanceOpen(false)}><IconCheck size={17}/> Tamam</button></div></aside></div>}

      {activePage === "summary" ? (
        <SummaryPage
          rows={enrichedRows}
          settings={appSettings}
          employees={employees}
          targetRows={targetState.rows}
          annualPool={annualPool}
          year={year}
          mode={mode}
          onNavigate={setActivePage}
        />
      ) : activePage === "sales" ? (
        <SalesPage rows={calculatedRows} year={year} mode={mode} minimumCoverage={appSettings.minimumCoverage} pilotCardCostRates={appSettings.pilotCardCostRates} />
      ) : activePage === "departments" ? (
        <DepartmentAnalysisPage year={year} mode={mode} consolidatedRows={calculatedRows} minimumCoverage={appSettings.minimumCoverage} />
      ) : activePage === "audit" ? (
        <AuditPage year={year} mode={mode} pilotCardCostRates={appSettings.pilotCardCostRates} settings={appSettings} costOverrides={costOverrides} onSaveCostOverrides={saveCostOverrides} />
      ) : activePage === "settings" ? (
        <SettingsPage
          settings={appSettings}
          onSave={saveSettings}
          connection={connection}
          mode={mode}
          annualProfit={totals.profit}
          annualPool={annualPool}
          employees={employees}
          onSaveEmployees={saveEmployees}
          onBack={() => setActivePage("ledger")}
        />
      ) : activePage === "goals" ? (
        <GoalsPage
          settings={appSettings}
          targetRows={targetState.rows}
          targetMode={targetState.mode}
          targetError={targetState.error}
          annualPool={annualPool}
          year={year}
          onBack={() => setActivePage("ledger")}
        />
      ) : activePage === "performance" ? (
        <PerformancePage year={year} mode={mode} onNavigate={setActivePage} />
      ) : activePage === "approval" ? (
        <ApprovalPage
          rows={enrichedRows}
          targetRows={targetState.rows}
          targetMode={targetState.mode}
          targetError={targetState.error}
          annualPool={annualPool}
          year={year}
          connection={connection}
          costOverrides={costOverrides}
          onSaveCostOverrides={saveCostOverrides}
          onBack={() => setActivePage("ledger")}
        />
      ) : activePage === "reports" ? (
        <ReportsPage
          settings={appSettings}
          employees={employees}
          targetRows={targetState.rows}
          annualPool={annualPool}
          year={year}
          rows={enrichedRows}
        />
      ) : (
      <main className="page" id="top">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Finansal performans</p>
            <h1>Havuz</h1>
          </div>
          <div className="toolbar">
            <button className="policy-button" onClick={() => setPolicyOpen(true)}>Havuz Kuralları <IconInfoCircle size={16} /></button>
            <div className="segmented" aria-label="Durum filtresi">
              <button aria-pressed={statusFilter === "estimate"} className={statusFilter === "estimate" ? "active" : ""} onClick={() => setStatusFilter(statusFilter === "estimate" ? "all" : "estimate")}><span className="orange-dot" />Tahmini</button>
              <button aria-pressed={statusFilter === "final"} className={statusFilter === "final" ? "active" : ""} onClick={() => setStatusFilter(statusFilter === "final" ? "all" : "final")}><span className="green-dot" />Kesinleşmiş</button>
            </div>
            <div className="menu-wrap">
              <button className="icon-button icon-button--light" onClick={() => setMenuOpen((value) => !value)} aria-label="Diğer işlemler" aria-haspopup="menu" aria-expanded={menuOpen}><IconDots size={20} /></button>
              {menuOpen && (
                <div className="action-menu" role="menu">
                  <button role="menuitem" onClick={() => setMenuOpen(false)}>Özet raporu aç</button>
                  <button role="menuitem" onClick={() => { setMenuOpen(false); setPolicyOpen(true); }}>Politikayı incele</button>
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="content-grid">
          <div className="primary-column">
            <section className="panel waterfall-panel">
              <div className="panel-heading">
                <div>
                  <h2>{selected ? `${selected.monthName} Dağıtıma Esas Kâr` : "Dağıtıma Esas Kâr"}</h2>
                  <p>{year} · KDV hariç · TL · {mode === "live" ? "Canlı CPM verisi" : "Pilot veri"}</p>
                </div>
                <span className={`source-badge source-badge--${mode}`}>{mode === "live" ? "Canlı" : "Pilot"}</span>
              </div>

              <div className="waterfall-layout">
                <div className="chart-wrap" aria-label="Dağıtıma esas kâr grafiği">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={waterfall} margin={{ top: 24, right: 8, left: 2, bottom: 24 }}>
                      <CartesianGrid vertical={false} stroke="#e5e9ef" />
                      <XAxis dataKey="name" tick={{ fill: "#4f5f73", fontSize: 12 }} axisLine={{ stroke: "#cfd7e2" }} tickLine={false} interval={0} />
                      <YAxis tickFormatter={(value) => compactMoney.format(value)} tick={{ fill: "#728197", fontSize: 11 }} axisLine={false} tickLine={false} width={72} />
                      <Tooltip content={<WaterfallTooltip />} />
                      <Bar dataKey="base" stackId="waterfall" fill="transparent" isAnimationActive={false} />
                      <Bar dataKey="value" stackId="waterfall" radius={[2, 2, 0, 0]}>
                        {waterfall.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="formula">Hesaplama: Satışlar − İadeler − İskontolar − Maliyet = Dağıtıma Esas Kâr</p>
                </div>

                <dl className="summary-list">
                  <div><dt>Satışlar</dt><dd className="positive">{fmt(totals.sales)}</dd></div>
                  <div><dt>İadeler</dt><dd className="negative">−{fmt(totals.returns)}</dd></div>
                  <div><dt>İskontolar</dt><dd className="negative">−{fmt(totals.discounts)}</dd></div>
                  <div><dt>Maliyet</dt><dd className="negative">−{fmt(totals.cost)}</dd></div>
                  <div className="summary-list__total"><dt>Dağıtıma Esas Kâr</dt><dd>{fmt(totals.profit)}</dd></div>
                  <div><dt>Dağıtım Kuralı</dt><dd>Departman hedef bandı</dd></div>
                  <div className="summary-list__pool"><dt>Dağıtılabilir Tutar</dt><dd>{fmt(totals.contribution)}</dd></div>
                </dl>
              </div>
            </section>

            <section className="panel ledger-panel">
              <div className="panel-heading ledger-heading">
                <div>
                  <h2>Aylık Havuz Katkısı</h2>
                  <p>{year} · TL · Satıra tıklayarak ayı öne çıkarın</p>
                </div>
                {statusFilter !== "all" && <button className="clear-filter" onClick={() => setStatusFilter("all")}><IconX size={14} /> Filtreyi temizle</button>}
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Ay</th><th>Satışlar</th><th>İadeler</th><th>İskontolar</th><th>Maliyet</th><th>Dağıtıma Esas Kâr</th><th>Dağıtım Oranı</th><th>Dağıtılabilir Tutar</th><th>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr key={row.month} onClick={() => setSelectedMonth(selectedMonth === row.month ? null : row.month)} className={selectedMonth === row.month ? "selected-row" : ""}>
                        <th>{row.monthName}</th>
                        <td className="positive">{fmt(row.sales)}</td>
                        <td className="negative">−{fmt(row.returns)}</td>
                        <td className="negative">−{fmt(row.discounts)}</td>
                        <td className="negative">−{fmt(row.estimatedCost)}</td>
                        <td className="positive">{fmt(row.profit)}</td>
                        <td>{row.contribution > 0 ? "Hedef bandı" : "Muaf"}</td>
                        <td className="positive">{fmt(row.contribution)}</td>
                        <td><StatusDot status={row.status} /></td>
                      </tr>
                    ))}
                    {!filteredRows.length && <tr><td colSpan="9" className="empty-state">Bu filtre için kayıt bulunamadı.</td></tr>}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>Toplam</th><td>{fmt(totals.sales)}</td><td className="negative">−{fmt(totals.returns)}</td><td className="negative">−{fmt(totals.discounts)}</td><td className="negative">−{fmt(totals.cost)}</td><td>{fmt(totals.profit)}</td><td>Otomatik</td><td>{fmt(totals.contribution)}</td><td>—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="table-note">Tutarlar TL cinsindendir. Maliyet kapsamı düşük aylarda sonuçlar yalnızca tahmin olarak değerlendirilmelidir.</p>
            </section>
          </div>

          <aside className={detailsOpen ? "details-panel" : "details-panel details-panel--collapsed"}>
            <button className="details-title" onClick={() => setDetailsOpen((value) => !value)}>
              <span>Hesap Nasıl Yapıldı?</span>{detailsOpen ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
            </button>
            {detailsOpen && (
              <>
                <ol className="calculation-steps">
                  <li><span className="step-number">1</span><div><strong>Satışlar</strong><p>Aktif satış faturalarının KDV hariç brüt tutarı.</p></div><b className="positive">{fmt(totals.sales)}</b></li>
                  <li><span className="step-number">2</span><div><strong>İadeler</strong><p>Satış iadeleri toplamdan düşülür.</p></div><b className="negative">−{fmt(totals.returns)}</b></li>
                  <li><span className="step-number">3</span><div><strong>İskontolar</strong><p>Kalem ve evrak iskontoları düşülür.</p></div><b className="negative">−{fmt(totals.discounts)}</b></li>
                  <li><span className="step-number">4</span><div><strong>Maliyet</strong><p>Kapsanan ürünlerin kur çevrilmiş tahmini maliyeti.</p></div><b className="negative">−{fmt(totals.cost)}</b></li>
                </ol>

                <div className="warning-box">
                  <IconAlertTriangle size={22} />
                  <div><strong>Maliyet inceleme durumu</strong><p>Ortalama doğrulanmış kapsam %{weightedCoverage.toFixed(1).replace(".", ",")}. Eksik satırlar CPM Denetim üzerinden maliyet kararına bağlanabilir.</p></div>
                </div>

                <div className="connection-row">
                  <IconLock size={17} /><span>CPM Salt Okunur</span>
                  <span className={connection.connected ? "connection-live" : "connection-demo"}>{connection.connected ? "Bağlı" : "Pilot"}</span>
                </div>

                <div className="step-result">
                  <span className="step-number">5</span>
                  <div><strong>Dağıtıma Esas Kâr</strong><p>Dağıtım oranıyla çarpılarak havuz katkısı hesaplanır.</p></div>
                  <b>{fmt(totals.profit)}</b>
                </div>

                <button className="policy-summary" onClick={() => setPolicyOpen(true)}>
                  <div><strong>Havuz Kuralları Özeti</strong><p>Hedef altı aylar muaf; hedef tutan aylar temkinli, hedef üstü eşiği geçen aylar büyüme oranıyla hesaplanır.</p></div>
                  <IconChevronDown size={18} />
                </button>

                <div className="source-health">
                  <div><IconDatabase size={18} /><span>Veri kaynağı</span></div>
                  <b>{mode === "live" ? "CPM · Canlı" : "Güvenli pilot veri"}</b>
                </div>
              </>
            )}
          </aside>
        </div>
      </main>
      )}

      {policyOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setPolicyOpen(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="policy-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setPolicyOpen(false)} aria-label="Kapat"><IconX size={20} /></button>
            <p className="eyebrow">Geçerli hesaplama kuralları</p>
            <h2 id="policy-title">Havuz Kuralları</h2>
            <div className="policy-grid">
              <div><span>Temkinli oran</span><strong>%{appSettings.rates.conservative}</strong></div>
              <div><span>Büyüme oranı</span><strong>%{appSettings.rates.growth}</strong></div>
              <div><span>Negatif dönem</span><strong>{appSettings.negativeRule === "zero" ? "Katkı yok" : "Yıl sonunda mahsup"}</strong></div>
              <div><span>Veri kaynağı</span><strong>CPM / Salt okunur</strong></div>
              <div><span>Kesinleşme</span><strong>Yönetim onayı</strong></div>
            </div>
            <ul className="policy-list">
              <li><IconCheck size={17} /> Satışlar, iadeler ve iskontolar yalnızca aktif evraklardan alınır.</li>
              <li><IconCheck size={17} /> Havuz sonucu maliyet kapsamı görünür biçimde yayınlanır.</li>
              <li><IconCheck size={17} /> CPM üzerinde ekleme, güncelleme veya silme yapılmaz.</li>
            </ul>
            <button className="primary-button" onClick={() => setPolicyOpen(false)}>Anladım</button>
          </section>
        </div>
      )}
    </div>
  );
}
