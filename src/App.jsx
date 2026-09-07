import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  IconLogout,
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
import { ReportsPage } from "./ReportsPage";
import { apiFetch } from "./api.js";
import {
  NAV_ITEMS,
  canAccessPage,
  createIdempotentOpenGuard,
  firstAccessiblePage,
  navItemsFor,
  overviewStateForResponse,
  sessionViewFor,
} from "./sessionGate.js";
import { SummaryPage } from "./SummaryPage";
import { SalesPage } from "./SalesPage";
import { DepartmentAnalysisPage } from "./DepartmentAnalysisPage";
import { AuditPage } from "./AuditPage";
import { InventoryResearchPage } from "./InventoryResearchPage";
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

const DEFAULT_APPEARANCE = { theme: "light", density: "comfortable", highContrast: false, reducedMotion: false, defaultPage: "summary" };

function normalizeAppearance(value = {}) {
  const appearance = { ...DEFAULT_APPEARANCE, ...value };
  const availablePages = new Set(NAV_ITEMS.map((item) => item.page));
  return {
    ...appearance,
    defaultPage: availablePages.has(appearance.defaultPage)
      ? appearance.defaultPage
      : DEFAULT_APPEARANCE.defaultPage,
  };
}

const money = new Intl.NumberFormat("tr-TR", {
  maximumFractionDigits: 0,
});

const compactMoney = new Intl.NumberFormat("tr-TR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const eurMoney = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function fmt(value) {
  return money.format(Math.round(value || 0));
}

function fmtEur(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? "—"
    : eurMoney.format(Math.round(Number(value)));
}

function sumNullable(rows, field) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  if (rows.some((row) => row?.[field] === null || row?.[field] === undefined)) return null;
  return rows.reduce((total, row) => total + Number(row[field] || 0), 0);
}

function WaterfallTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  return (
    <div className="chart-tooltip">
      <strong>{item.name}</strong>
      <span>{fmtEur(item.amount)}</span>
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

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await apiFetch("/api/session/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Giriş yapılamadı.");
      onLogin(payload);
    } catch (submitError) {
      setError(submitError.message || "Giriş yapılamadı.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="login-title">
        <div>
          <div className="login-brand"><IconFish size={30} stroke={1.6} /><span><strong>Marlin Nexus</strong><small>Yönetim Sistemi</small></span></div>
          <h1 id="login-title">Oturum açın</h1>
          <p>Finansal ve operasyonel verileri görmek için yetkili hesabınızla giriş yapın.</p>
        </div>
        <form className="login-form" onSubmit={submit}>
          <label>Kullanıcı adı<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label>
          <label>Parola<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="primary-action" type="submit" disabled={submitting}>{submitting ? "Giriş yapılıyor…" : "Giriş yap"}</button>
        </form>
        <p className="login-boundary"><IconLock size={15} /> CPM yalnızca salt okunur kaynak olarak kullanılır.</p>
      </section>
    </main>
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
  const [session, setSession] = useState({ status: "loading", user: null });
  const [appearance, setAppearance] = useState(()=>{ try{return normalizeAppearance(JSON.parse(localStorage.getItem("marlin-appearance")||"{}"));}catch{return DEFAULT_APPEARANCE;} });
  const [appearanceOpen,setAppearanceOpen]=useState(false);
  const [activePage, setActivePage] = useState(() => {
    const requestedPage = new URLSearchParams(window.location.search).get("page");
    const availablePages = new Set(NAV_ITEMS.map((item) => item.page));
    return availablePages.has(requestedPage)
      ? requestedPage
      : availablePages.has(appearance.defaultPage)
        ? appearance.defaultPage
        : DEFAULT_APPEARANCE.defaultPage;
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
  const [rows, setRows] = useState([]);
  const [eurRateSets, setEurRateSets] = useState({});
  const [canonicalMetric, setCanonicalMetric] = useState(null);
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
  const policyOpenGuard = useRef(null);
  const policyOpenedAt = useRef(0);
  if (!policyOpenGuard.current) policyOpenGuard.current = createIdempotentOpenGuard();
  const openPolicy = () => {
    if (policyOpenGuard.current.open()) {
      policyOpenedAt.current = Date.now();
      setPolicyOpen(true);
    }
  };
  const closePolicy = () => {
    policyOpenGuard.current.close();
    policyOpenedAt.current = 0;
    setPolicyOpen(false);
  };
  const closePolicyFromButton = () => {
    if (Date.now() - policyOpenedAt.current >= 450) closePolicy();
  };
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const signOut = async () => {
    try {
      await apiFetch("/api/session/logout", { method: "POST" });
    } finally {
      setSession({ status: "unauthenticated", user: null });
    }
  };
  const visibleNavItems = navItemsFor(session.user);
  const effectivePage = session.status === "authenticated"
    ? firstAccessiblePage(session.user, activePage)
    : activePage;
  const navigate = (page) => {
    if (!canAccessPage(session.user, page)) return;
    setActivePage(page);
    setMobileNavOpen(false);
  };
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

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/session")
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;
        setSession(response.ok && payload.user
          ? { status: "authenticated", user: payload.user }
          : { status: "unauthenticated", user: null });
      })
      .catch(() => {
        if (!cancelled) setSession({ status: "unauthenticated", user: null });
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(()=>{
    document.documentElement.dataset.theme=appearance.theme;
    document.documentElement.classList.toggle("high-contrast",appearance.highContrast);
    document.documentElement.classList.toggle("reduced-motion",appearance.reducedMotion);
    localStorage.setItem("marlin-appearance",JSON.stringify(appearance));
  },[appearance]);

  useEffect(() => {
    if (session.status !== "authenticated") return undefined;
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
  }, [session.status]);

  useEffect(() => {
    if (session.status !== "authenticated") return undefined;
    let cancelled = false;
    setMode("loading");

    Promise.all([
      fetch(`/api/overview?year=${year}`).then(async (response) => ({
        ok: response.ok,
        status: response.status,
        payload: await response.json().catch(() => ({})),
      })),
      fetchDepartmentTargetState(year),
    ]).then(([overviewResponse, targets]) => {
      if (cancelled) return;
      const overview = overviewStateForResponse(overviewResponse);
      setRows(overview.rows);
      setEurRateSets(overview.eurRateSets);
      setCanonicalMetric(overview.canonicalMetric);
      setMode(overview.mode);
      setTargetState(targets);
    }).catch(() => {
      if (cancelled) return;
      setRows([]);
      setEurRateSets({});
      setCanonicalMetric(null);
      setMode("error");
      setTargetState({
        rows: [],
        mode: "error",
        error: "Departman hedefleri okunamadı.",
        generatedAt: null,
      });
    });

    return () => { cancelled = true; };
  }, [session.status, year]);

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
    const nonPilotLines = Number(row.v2CostCoveredLines || 0) + Number(row.v2ReviewLines || 0);
    const coveredLines = Number(row.v2CostCoveredLines || 0) + Number(row.pilotCardLines || 0) + manualDecisions.length;
    const totalLines = nonPilotLines + Number(row.pilotCardLines || 0);
    return {
      ...row,
      sales: Number(row.sales || 0) + pilotSales,
      returns: Number(row.returns || 0) + pilotReturns,
      discounts: Number(row.discounts || 0) + pilotDiscounts,
      estimatedCost: Number(row.cost || 0) + pilotCost + manualCost,
      uncoveredNetSales: Number(row.reviewNetSales || 0) - resolvedUncoveredNet,
      uncoveredCostLines: Math.max(0, Number(row.v2ReviewLines || 0) - manualDecisions.length),
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
      const profit = row.profit ?? null;
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
    contribution: acc.contribution + row.contribution,
  }), { sales: 0, returns: 0, discounts: 0, cost: 0, contribution: 0 });
  totals.profit = sumNullable(enrichedRows, "profit");

  const coverageTotals = enrichedRows.reduce((acc, row) => ({
    covered: acc.covered + Number(row.coverageCoveredLines || 0),
    total: acc.total + Number(row.coverageTotalLines || 0),
  }), { covered: 0, total: 0 });
  const weightedCoverage = coverageTotals.total ? coverageTotals.covered / coverageTotals.total * 100 : 0;

  const selected = selectedMonth
    ? enrichedRows.find((row) => row.month === selectedMonth)
    : null;

  // Havuzun eski TL görünümü ana finansal çıktı olarak kullanılmaz. EUR gelir
  // kanıtı mevcutsa satış/iade/iskonto gösterilir; WAC kanıtı yoksa maliyet,
  // kâr ve dağıtılabilir tutar bilinçli olarak boş kalır.
  const poolRows = enrichedRows.map((row) => {
    const eur = row.eurEquivalent || {};
    const breakdownComplete = eur.breakdownComplete === true;
    const costComplete = eur.costComplete === true;
    return {
      ...row,
      displaySales: breakdownComplete ? eur.grossSales : null,
      displayReturns: breakdownComplete ? eur.returns : null,
      displayDiscounts: breakdownComplete ? eur.discounts : null,
      displayCost: costComplete ? eur.cost : null,
      displayProfit: costComplete ? eur.profit : null,
      displayContribution: null,
      displayStatus: costComplete ? row.status : "İnceleme",
    };
  });
  const poolDisplayRows = poolRows.filter((row) => (
    statusFilter === "all"
      || (statusFilter === "final" && row.status === "Kesinleşmiş")
      || (statusFilter === "estimate" && row.status === "Tahmini")
  ));
  const sumDisplay = (field) => {
    const values = poolRows.map((row) => row[field]);
    return values.length > 0 && values.every((value) => Number.isFinite(Number(value)))
      ? values.reduce((sum, value) => sum + Number(value), 0)
      : null;
  };
  const poolTotals = {
    sales: canonicalMetric?.eurBreakdown?.complete === true
      ? canonicalMetric.eurBreakdown.grossSales
      : sumDisplay("displaySales"),
    returns: canonicalMetric?.eurBreakdown?.complete === true
      ? canonicalMetric.eurBreakdown.returns
      : sumDisplay("displayReturns"),
    discounts: canonicalMetric?.eurBreakdown?.complete === true
      ? canonicalMetric.eurBreakdown.discounts
      : sumDisplay("displayDiscounts"),
    cost: canonicalMetric?.status === "TAMAM" && canonicalMetric?.eur?.complete === true
      ? canonicalMetric.eur.cost
      : null,
    profit: canonicalMetric?.status === "TAMAM" && canonicalMetric?.eur?.complete === true
      ? canonicalMetric.eur.profit
      : null,
    contribution: null,
  };
  const poolEurReady = poolTotals.profit !== null;
  const waterfall = [
    { name: "Satışlar", base: 0, value: poolTotals.sales, amount: poolTotals.sales, color: "#0a3972" },
    { name: "İadeler", base: Math.max(0, (poolTotals.sales || 0) - (poolTotals.returns || 0)), value: poolTotals.returns, amount: poolTotals.returns == null ? null : -poolTotals.returns, color: "#e84b55" },
    { name: "İskontolar", base: Math.max(0, (poolTotals.sales || 0) - (poolTotals.returns || 0) - (poolTotals.discounts || 0)), value: poolTotals.discounts, amount: poolTotals.discounts == null ? null : -poolTotals.discounts, color: "#e84b55" },
    { name: "Maliyet", base: Math.max(0, poolTotals.profit || 0), value: poolTotals.cost, amount: poolTotals.cost == null ? null : -poolTotals.cost, color: "#ee5c64" },
    { name: "Dağıtıma Esas Kâr", base: 0, value: Math.max(0, poolTotals.profit || 0), amount: poolTotals.profit, color: "#16884e" },
  ];

  const sessionView = sessionViewFor(session);
  if (sessionView === "loading") return <main className="login-shell"><section className="login-card" aria-busy="true"><div className="login-brand"><IconFish size={30} stroke={1.6} /><span><strong>Marlin Nexus</strong><small>Yönetim Sistemi</small></span></div><p>Oturum kontrol ediliyor…</p></section></main>;
  if (sessionView === "login") return <LoginPage onLogin={(user) => setSession({ status: "authenticated", user })} />;

  const persistState = (nextSettings, nextEmployees, nextCostOverrides = costOverrides) => {
    return apiFetch("/api/app-state", {
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
          {visibleNavItems.map((item) => (
            <button
              key={item.page}
              className={activePage === item.page ? "nav__item nav__item--active" : "nav__item"}
              onClick={() => {
                navigate(item.page);
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
        <button className="icon-button" onClick={signOut} aria-label="Çıkış yap"><IconLogout size={19} /></button>
      </header>

      {appearanceOpen&&<div className="appearance-backdrop" onMouseDown={(event)=>event.target===event.currentTarget&&setAppearanceOpen(false)}><aside className="appearance-drawer" role="dialog" aria-modal="true" aria-labelledby="appearance-title"><div className="appearance-drawer__head"><div><p className="eyebrow">Arayüz tercihleri</p><h2 id="appearance-title">Görünüm Ayarları</h2></div><button className="modal-close" onClick={()=>setAppearanceOpen(false)} aria-label="Kapat"><IconX size={20}/></button></div><div className="appearance-fields"><label><span>Tema</span><select value={appearance.theme} onChange={(event)=>setAppearance({...appearance,theme:event.target.value})}><option value="light">Açık</option><option value="dark">Koyu</option></select></label><label><span>Ekran yoğunluğu</span><select value={appearance.density} onChange={(event)=>setAppearance({...appearance,density:event.target.value})}><option value="comfortable">Rahat</option><option value="compact">Kompakt</option></select></label><label><span>Başlangıç sayfası</span><select value={appearance.defaultPage} onChange={(event)=>setAppearance({...appearance,defaultPage:event.target.value})}><option value="summary">Genel Bakış</option><option value="sales">Satış Analizi</option><option value="departments">Departman Analizi</option><option value="audit">Denetim</option><option value="inventory">Stok</option><option value="ledger">Havuz</option><option value="settings">Ayarlar</option></select></label><label className="appearance-check"><span><strong>Yüksek kontrast</strong><small>Metin ve sınır ayrımını güçlendirir.</small></span><input type="checkbox" checked={appearance.highContrast} onChange={(event)=>setAppearance((current) => ({ ...current, highContrast: event.target.checked }))}/></label><label className="appearance-check"><span><strong>Hareketi azalt</strong><small>Grafik ve geçiş animasyonlarını kapatır.</small></span><input type="checkbox" checked={appearance.reducedMotion} onChange={(event)=>setAppearance((current) => ({ ...current, reducedMotion: event.target.checked }))}/></label></div><div className="employee-modal__actions"><button className="secondary-button" onClick={()=>setAppearance(DEFAULT_APPEARANCE)}>Varsayılana dön</button><button className="primary-action" onClick={()=>setAppearanceOpen(false)}><IconCheck size={17}/> Tamam</button></div></aside></div>}

      {effectivePage === "summary" ? (
        <SummaryPage
          rows={enrichedRows}
          settings={appSettings}
          employees={employees}
          targetRows={targetState.rows}
          annualPool={annualPool}
          year={year}
          mode={mode}
          onNavigate={navigate}
          canonicalMetric={canonicalMetric}
          eurRateSets={eurRateSets}
        />
      ) : effectivePage === "sales" ? (
        <SalesPage rows={calculatedRows} year={year} mode={mode} minimumCoverage={appSettings.minimumCoverage} pilotCardCostRates={appSettings.pilotCardCostRates} eurRateSets={eurRateSets} canonicalMetric={canonicalMetric} />
      ) : effectivePage === "departments" ? (
        <DepartmentAnalysisPage year={year} mode={mode} consolidatedRows={calculatedRows} minimumCoverage={appSettings.minimumCoverage} eurRateSets={eurRateSets} />
      ) : effectivePage === "audit" ? (
        <AuditPage year={year} mode={mode} pilotCardCostRates={appSettings.pilotCardCostRates} settings={appSettings} costOverrides={costOverrides} onSaveCostOverrides={saveCostOverrides} />
      ) : effectivePage === "inventory" ? (
        <InventoryResearchPage year={year} mode={mode} />
      ) : effectivePage === "reports" ? (
        <ReportsPage rows={calculatedRows} year={year} mode={mode} minimumCoverage={appSettings.minimumCoverage} pilotCardCostRates={appSettings.pilotCardCostRates} eurRateSets={eurRateSets} />
      ) : effectivePage === "settings" ? (
        <SettingsPage
          settings={appSettings}
          onSave={saveSettings}
          connection={connection}
          mode={mode}
          annualProfit={totals.profit}
          annualPool={annualPool}
          annualProfitEur={poolTotals.profit}
          // Hedef/havuz tahsisinin EUR karşılığı henüz ayrı bir kanıtlı sözleşme
          // değil; TRY havuzunu EUR etiketiyle göstermemek için kapalı kalır.
          annualPoolEur={null}
          employees={employees}
          onSaveEmployees={saveEmployees}
          onBack={() => navigate("ledger")}
        />
      ) : (
      <main className="page" id="top">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Finansal performans</p>
            <h1>Havuz</h1>
          </div>
          <div className="toolbar">
            <button className="policy-button" onClick={openPolicy}>Havuz Kuralları <IconInfoCircle size={16} /></button>
            <div className="menu-wrap">
              <button className="icon-button icon-button--light" onClick={() => setMenuOpen((value) => !value)} aria-label="Diğer işlemler" aria-haspopup="menu" aria-expanded={menuOpen}><IconDots size={20} /></button>
              {menuOpen && (
                <div className="action-menu" role="menu">
                  <button role="menuitem" onClick={() => setMenuOpen(false)}>Özet raporu aç</button>
                  <button role="menuitem" onClick={() => { setMenuOpen(false); openPolicy(); }}>Politikayı incele</button>
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
                  <p>{year} · KDV hariç · EUR · {mode === "live" ? "Canlı CPM verisi" : "Pilot veri"}</p>
                </div>
                <span className={`source-badge source-badge--${mode}`}>{mode === "live" ? "Canlı" : "Pilot"}</span>
              </div>

              <div className="waterfall-layout">
                <div className="chart-wrap" aria-label="Dağıtıma esas kâr grafiği">
                  <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={poolTotals.profit === null ? [] : waterfall} margin={{ top: 24, right: 8, left: 2, bottom: 24 }}>
                      <CartesianGrid vertical={false} stroke="#e5e9ef" />
                      <XAxis dataKey="name" tick={{ fill: "#4f5f73", fontSize: 12 }} axisLine={{ stroke: "#cfd7e2" }} tickLine={false} interval={0} />
                      <YAxis tickFormatter={(value) => eurMoney.format(value)} tick={{ fill: "#728197", fontSize: 11 }} axisLine={false} tickLine={false} width={72} />
                      <Tooltip content={<WaterfallTooltip />} />
                      <Bar dataKey="base" stackId="waterfall" fill="transparent" isAnimationActive={false} />
                      <Bar dataKey="value" stackId="waterfall" radius={[2, 2, 0, 0]}>
                        {waterfall.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="formula">{poolTotals.profit === null ? "EUR maliyet/WAC kanıtı tamamlanınca dağıtıma esas kâr hesaplanır." : "Hesaplama: Satışlar − İadeler − İskontolar − Maliyet = Dağıtıma Esas Kâr"}</p>
                </div>

                <dl className="summary-list">
                  <div><dt>Satışlar · EUR</dt><dd className="positive">{fmtEur(poolTotals.sales)}</dd></div>
                  <div><dt>İadeler · EUR</dt><dd className="negative">{poolTotals.returns == null ? "—" : `−${fmtEur(poolTotals.returns)}`}</dd></div>
                  <div><dt>İskontolar · EUR</dt><dd className="negative">{poolTotals.discounts == null ? "—" : `−${fmtEur(poolTotals.discounts)}`}</dd></div>
                  <div><dt>Maliyet · EUR</dt><dd className="negative">{poolTotals.cost == null ? "—" : `−${fmtEur(poolTotals.cost)}`}</dd></div>
                  <div className="summary-list__total"><dt>Dağıtıma Esas Kâr · EUR</dt><dd>{fmtEur(poolTotals.profit)}</dd></div>
                  <div><dt>Dağıtım Kuralı</dt><dd>Departman hedef bandı</dd></div>
                  <div className="summary-list__pool"><dt>Dağıtılabilir Tutar · EUR</dt><dd>{fmtEur(poolTotals.contribution)}</dd></div>
                </dl>
              </div>
            </section>

            <section className="panel ledger-panel">
              <div className="panel-heading ledger-heading">
                <div>
                  <h2>Aylık Havuz Katkısı</h2>
                  <p>{year} · EUR · Satıra tıklayarak ayı öne çıkarın</p>
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
                    {poolDisplayRows.map((row) => (
                      <tr key={row.month} onClick={() => setSelectedMonth(selectedMonth === row.month ? null : row.month)} className={selectedMonth === row.month ? "selected-row" : ""}>
                        <th>{row.monthName}</th>
                        <td className="positive">{fmtEur(row.displaySales)}</td>
                        <td className="negative">{row.displayReturns == null ? "—" : `−${fmtEur(row.displayReturns)}`}</td>
                        <td className="negative">{row.displayDiscounts == null ? "—" : `−${fmtEur(row.displayDiscounts)}`}</td>
                        <td className="negative">{fmtEur(row.displayCost)}</td>
                        <td className="positive">{fmtEur(row.displayProfit)}</td>
                        <td>{row.displayContribution == null ? "EUR kanıtı bekleniyor" : row.contribution > 0 ? "Hedef bandı" : "Muaf"}</td>
                        <td className="positive">{fmtEur(row.displayContribution)}</td>
                        <td><StatusDot status={row.displayStatus} /></td>
                      </tr>
                    ))}
                    {!filteredRows.length && <tr><td colSpan="9" className="empty-state">Bu filtre için kayıt bulunamadı.</td></tr>}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>Toplam</th><td>{fmtEur(poolTotals.sales)}</td><td className="negative">{poolTotals.returns == null ? "—" : `−${fmtEur(poolTotals.returns)}`}</td><td className="negative">{poolTotals.discounts == null ? "—" : `−${fmtEur(poolTotals.discounts)}`}</td><td className="negative">{fmtEur(poolTotals.cost)}</td><td>{fmtEur(poolTotals.profit)}</td><td>İnceleme</td><td>{fmtEur(poolTotals.contribution)}</td><td>—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="table-note">Ana finansal tutarlar EUR’dur. Kaynak TRY kanıtı ayrı tutulur; WAC/maliyet kanıtı eksikse kâr ve havuz `—` kalır.</p>
            </section>
          </div>

          <aside className={detailsOpen ? "details-panel" : "details-panel details-panel--collapsed"}>
            <button className="details-title" onClick={() => setDetailsOpen((value) => !value)}>
              <span>Hesap Nasıl Yapıldı?</span>{detailsOpen ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
            </button>
            {detailsOpen && (
              <>
                <ol className="calculation-steps">
                  <li><span className="step-number">1</span><div><strong>Satışlar · EUR</strong><p>Aktif satış faturalarının KDV hariç brüt tutarı.</p></div><b className="positive">{fmtEur(poolTotals.sales)}</b></li>
                  <li><span className="step-number">2</span><div><strong>İadeler · EUR</strong><p>Satış iadeleri toplamdan düşülür.</p></div><b className="negative">{poolTotals.returns == null ? "—" : `−${fmtEur(poolTotals.returns)}`}</b></li>
                  <li><span className="step-number">3</span><div><strong>İskontolar · EUR</strong><p>Kalem ve evrak iskontoları düşülür.</p></div><b className="negative">{poolTotals.discounts == null ? "—" : `−${fmtEur(poolTotals.discounts)}`}</b></li>
                  <li><span className="step-number">4</span><div><strong>Maliyet · EUR</strong><p>WAC kanıtı tamamlanmadan kesin maliyet yayınlanmaz.</p></div><b className="negative">{fmtEur(poolTotals.cost)}</b></li>
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
                  <b>{fmtEur(poolTotals.profit)}</b>
                </div>

                <button className="policy-summary" onClick={openPolicy}>
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
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="policy-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={closePolicyFromButton} aria-label="Kapat"><IconX size={20} /></button>
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
            <button className="primary-button" onClick={closePolicy}>Anladım</button>
          </section>
        </div>
      )}
    </div>
  );
}
