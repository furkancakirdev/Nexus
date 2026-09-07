import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MODULE_REGISTRY } from "../shared/moduleRegistry.mjs";

async function source(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("aktif ürün modülleri ilk plandaki yedi ekranla sınırlıdır", () => {
  assert.deepEqual(
    MODULE_REGISTRY.filter((module) => module.active).map((module) => module.page),
    ["summary", "sales", "departments", "audit", "inventory", "ledger", "settings"],
  );
  assert.deepEqual(
    MODULE_REGISTRY.filter((module) => module.active).map((module) => module.label),
    ["Genel Bakış", "Satış Analizi", "Departman Analizi", "Denetim", "Stok", "Havuz", "Ayarlar"],
  );
});

test("Katkı ve Performans sayfası menüden yönlendirmeden ve görünüm ayarından kaldırılır", async () => {
  const appSource = await source("src/App.jsx");

  assert.doesNotMatch(appSource, /PerformancePage/);
  assert.doesNotMatch(appSource, /page:\s*["']performance["']/);
  assert.doesNotMatch(appSource, /value=["']performance["']/);
  assert.doesNotMatch(appSource, /Katkı\s*&amp;\s*Performans/);
});

test("Inventory research is reachable from the main navigation", async () => {
  const appSource = await source("src/App.jsx");
  const gateSource = await source("src/sessionGate.js");

  assert.match(appSource, /import \{ InventoryResearchPage \} from "\.\/InventoryResearchPage"/);
  assert.match(gateSource, /page: "inventory", label: "Stok(?: Araştırması)?"/);
  assert.match(appSource, /effectivePage === "inventory"/);
});

test("departman satırı tam evrak ve aktör kanıtını görünür kılar", async () => {
  const departmentSource = await source("src/DepartmentAnalysisPage.jsx");

  assert.match(departmentSource, /Evrak zinciri/);
  assert.match(departmentSource, /Aktör geçmişi/);
  assert.match(departmentSource, /Dışlanan aktörler/);
  assert.match(departmentSource, /documentTypeLabel\(document\.documentType\)/);
  assert.match(departmentSource, /actorDisplayName\(code, preferredName\)/);
  assert.match(departmentSource, /row\.evidenceDocuments/);
  assert.match(departmentSource, /row\.actorEvents/);
  assert.match(departmentSource, /row\.ownershipEvidence/);
});

test("CPM Denetim ilk görünümü ekonomik karar kolonlarına odaklanır", async () => {
  const auditSource = await source("src/AuditPage.jsx");
  const styles = await source("src/styles.css");
  const header = auditSource.match(
    /<table className="audit-table"><thead><tr>([\s\S]*?)<\/tr><\/thead>/,
  )?.[1] || "";

  for (const label of [
    "Belge",
    "Stok / hizmet",
    "Satış net",
    "Satır maliyeti",
    "Brüt kâr",
    "Doğrulama",
  ]) assert.match(header, new RegExp(label));

  for (const secondaryLabel of [
    "Kaynak",
    "Miktar",
    "Satış brüt",
    "Satış iskontosu",
    "Satış KDV",
    "Fatura toplamı",
    "Maliyet belgesi",
  ]) assert.doesNotMatch(header, new RegExp(secondaryLabel));

  assert.match(auditSource, /Maliyet doğrulama/);
  assert.match(auditSource, /colSpan="7"/);
  assert.match(styles, /\.audit-table__profit[\s\S]*position:\s*sticky/);
  assert.match(styles, /\.audit-table__validation[\s\S]*position:\s*sticky/);
  assert.match(styles, /\.audit-table__cost[\s\S]*position:\s*sticky/);
  assert.match(styles, /\.audit-table__cost\s*\{[^}]*right:\s*265px/);
  assert.match(styles, /\.audit-filters\s*\{[^}]*grid-template-columns:\s*minmax\(0,2fr\)\s+repeat\(6,minmax\(0,1fr\)\)\s+auto/);
  assert.match(styles, /\.audit-filters\s*\{[^}]*min-width:\s*0/);
  assert.match(styles, /\.audit-workspace\s*\{[^}]*overflow:\s*hidden/);
  assert.match(auditSource, /audit-table-top-scroll/);
  assert.match(auditSource, /auditTableTopScrollRef/);
  assert.match(auditSource, /kapsam dışı dahil/);
  assert.match(auditSource, /excludedNetAmount/);
  assert.match(styles, /:root\[data-theme="dark"\] \.audit-table td strong/);
  assert.match(styles, /:root\[data-theme="dark"\] \.audit-table td strong[^}]*color:\s*#dbe8f5/);
  assert.match(styles, /:root\[data-theme="dark"\] \.audit-table td small/);
  assert.match(
    styles,
    /\.audit-table thead \.audit-table__profit,[\s\S]{0,240}?position:\s*static/,
  );
  assert.match(auditSource, /aria-expanded=\{expanded===row\.id\}/);
  assert.match(auditSource, /aria-controls=\{`audit-detail-\$\{row\.id\}`\}/);
});

test("CPM Denetim kapsam dışı farkı iki ondalıkla gösterir", async (t) => {
  const vite = await createServer({ configFile: resolve(process.cwd(), "vite.config.mjs") });
  t.after(() => vite.close());
  const audit = await vite.ssrLoadModule("/src/AuditPage.jsx");

  assert.equal(audit.formatPreciseMoney(617127.456), "617.127,46 TL");
  assert.equal(audit.formatPreciseMoney(-0.01), "−0,01 TL");
});

test("Stok hareketi belge kanıtı ile finansal maliyet doğrulamasını ayrı gösterir", async (t) => {
  const vite = await createServer({ configFile: resolve(process.cwd(), "vite.config.mjs") });
  t.after(() => vite.close());
  const inventory = await vite.ssrLoadModule("/src/InventoryResearchPage.jsx");

  assert.deepEqual(inventory.getFinancialValidationLabel({
    verificationStatus: "verified",
    financeV2: { costStatus: "review" },
  }), { document: "Belge: Doğrulandı", cost: "Maliyet: İnceleme gerekli" });
  assert.deepEqual(inventory.getFinancialValidationLabel({
    verificationStatus: "verified",
    financeV2: { costStatus: "covered" },
  }), { document: "Belge: Doğrulandı", cost: "Maliyet: Kapsandı" });
});

test("doğrulanmamış stok kaynağı araştırma verisini resmi WAC'tan ayırır", async (t) => {
  const vite = await createServer({ configFile: resolve(process.cwd(), "vite.config.mjs") });
  t.after(() => vite.close());
  const inventory = await vite.ssrLoadModule("/src/InventoryResearchPage.jsx");

  assert.deepEqual(inventory.getInventorySourceNotice({ status: "missing" }), {
    title: "Resmi stok/WAC kaynağı doğrulanmadı",
    message: "Aşağıdaki satırlar yalnızca denetim araştırmasıdır; resmi WAC, maliyet ve kâr havuzuna dahil değildir.",
  });
  assert.equal(inventory.getInventorySourceNotice({ status: "verified" }), null);
  assert.equal(inventory.getInventorySourceBadge({ mode: "unavailable", rows: [{ id: "movement-1" }] }), "CPM aday araştırması · WAC kapalı");
  assert.equal(inventory.getInventorySourceBadge({
    mode: "unavailable",
    rows: [],
    openingEvidenceDiagnostics: { status: "available" },
  }), "CPM aday araştırması · WAC kapalı");
  assert.equal(inventory.getInventorySourceBadge({ mode: "unavailable", rows: [] }), "Kaynak kullanılamıyor");
  assert.equal(inventory.getInventoryEmptyStateLabel({ movementLoadTimedOut: true }), "CPM hareket defteri yanıt vermedi; aday açılış kanıtı aşağıda.");
  assert.equal(inventory.getInventoryEmptyStateLabel({ openingEvidenceDiagnostics: { status: "available" } }), "Hareket defteri satırı yok; aday açılış kanıtı aşağıda.");
  const preservedEvidence = inventory.preserveOpeningEvidenceOnMovementError({
    rows: [{ id: "candidate-1" }],
    mode: "loading",
    openingEvidenceDiagnostics: { status: "available", officialEligibleCount: 0 },
    openingEvidenceSources: { stkhArType82: { summary: { rowCount: "760" } } },
    openingResearchStatus: "candidate",
    openingResearchReasonCodes: ["direction-semantics-unverified"],
  });
  assert.equal(preservedEvidence.mode, "error");
  assert.deepEqual(preservedEvidence.openingEvidenceDiagnostics, { status: "available", officialEligibleCount: 0 });
  assert.equal(preservedEvidence.openingEvidenceSources.stkhArType82.summary.rowCount, "760");
  assert.deepEqual(preservedEvidence.openingResearchReasonCodes, ["direction-semantics-unverified"]);
  assert.deepEqual(
    inventory.getOpeningEvidenceSourceCards({
      stkhArType81: { summary: { rowCount: "12", distinctProductCount: "8", distinctDepotCount: "2" } },
      stkhArType82: { summary: { rowCount: "760", distinctProductCount: "627", distinctDepotCount: "7" } },
      stksymDevir: { summary: { rowCount: "6439", distinctProductCount: "4469", distinctDepotCount: "4" } },
    }).map(({ key, label }) => ({ key, label })),
    [
      { key: "stkhArType81", label: "STKHAR tip 81" },
      { key: "stkhArType82", label: "STKHAR tip 82" },
      { key: "stksymDevir", label: "STKSYM DEVIR" },
    ],
  );
  assert.deepEqual(
    inventory.getOpeningResearchReasonLabels([
      "direction-semantics-unverified",
      "opening-lineage-unverified",
      "cost-semantics-unverified",
    ]),
    [
      "Hareket yönü (giriş/çıkış) doğrulanmadı",
      "Açılış satırının belge soy zinciri doğrulanmadı",
      "Maliyet alanlarının anlamı ve kaynağı doğrulanmadı",
    ],
  );
  assert.equal(inventory.buildOpeningEvidenceUrl(2026, 20), "/api/research/inventory-opening-evidence?year=2026&sampleLimit=20");
  assert.match(await readFile(resolve(process.cwd(), "src/InventoryResearchPage.jsx"), "utf8"), /current\.openingEvidenceDiagnostics/);
  assert.match(await readFile(resolve(process.cwd(), "src/InventoryResearchPage.jsx"), "utf8"), /Aday CPM kaynak nüfusu/);
  assert.match(await readFile(resolve(process.cwd(), "src/InventoryResearchPage.jsx"), "utf8"), /Aday araştırma durumu/);
  assert.match(await readFile(resolve(process.cwd(), "src/styles.css"), "utf8"), /\.inventory-diagnostics-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit/);
});

test("Departman uzlaşma farkının TRY tabanını açıkça etiketler", async (t) => {
  const vite = await createServer({ configFile: resolve(process.cwd(), "vite.config.mjs") });
  t.after(() => vite.close());
  const department = await vite.ssrLoadModule("/src/DepartmentAnalysisPage.jsx");

  assert.equal(department.formatReconciliationDifference(0, "EUR"), "TRY net fark 0 TL");
  assert.equal(department.formatReconciliationDifference(null, "EUR"), "Uzlaşma kanıtı bekleniyor");
});

test("departman belge defteri filtrelerini server pagination sözleşmesine taşır", async () => {
  const departmentSource = await source("src/DepartmentAnalysisPage.jsx");

  for (const parameter of ["department", "month", "status", "depot", "search", "page", "pageSize"]) {
    assert.match(departmentSource, new RegExp(`params\\.set\\("${parameter}"`));
  }
  assert.match(departmentSource, /detailPagination\.totalRows/);
  assert.match(departmentSource, /detailPagination\.totalPages/);
  assert.doesNotMatch(departmentSource, /const detailRows = useMemo\(\(\) => \(data\.detailRows/);
});

test("Task 3 chart consumers expose visible, accessible series and explicit states", async () => {
  const reportsSource = await source("src/ReportsPage.jsx");
  const summarySource = await source("src/SummaryPage.jsx");
  const departmentSource = await source("src/DepartmentAnalysisPage.jsx");

  assert.match(reportsSource, /Legend/);
  assert.match(reportsSource, /role="img" aria-label="Marka satış ve kâr grafiği"/);
  assert.match(reportsSource, /role="status"/);
  assert.match(reportsSource, /role="alert"/);
  assert.match(summarySource, /Legend/);
  assert.match(summarySource, /role="img" aria-label="Aylık satış ve kârlılık grafiği"/);
  assert.match(departmentSource, /role="img" aria-label="Departman aylık net satış ve kâr grafiği"/);
  assert.match(departmentSource, /role="status"/);
  assert.match(departmentSource, /role="alert"/);
});

test("finansal UI eksik kanıtı tahmini maliyet veya ham kârla doldurmaz", async () => {
  const salesSource = await source("src/SalesPage.jsx");
  const summarySource = await source("src/SummaryPage.jsx");
  const departmentSource = await source("src/DepartmentAnalysisPage.jsx");

  assert.match(salesSource, /const v2Cost = canonicalTry\.cost/);
  assert.doesNotMatch(salesSource, /row\.estimatedCost\s*\|\|\s*row\.legacyEstimatedCost/);
  assert.match(salesSource, /v2Cost: canonicalTotals\.cost/);
  assert.match(salesSource, /profit: canonicalTotals\.profit/);
  assert.match(salesSource, /const profitTone = \(value\) => value == null \? "" : value >= 0 \? "positive" : "negative"/);
  assert.match(salesSource, /totals\.eurProfit != null/);
  assert.match(summarySource, /const canonicalReady = canonicalMetric\?\.status === "TAMAM"/);
  assert.match(summarySource, /const totalProfitTry = canonicalProfit \?\? null/);
  assert.match(summarySource, /cost: canonicalReady \? sumField\(reportRows, "cost"\) : null/);
  assert.match(departmentSource, /selectedMetric\.profit != null/);
  assert.match(departmentSource, /item\.profit == null \? ""/);
  assert.match(departmentSource, /className=\{profitTone\(row\.profit\)\}/);
});

test("finansal UI mixed CPM/TCMB kur kaynağını Halkbank-only diye göstermemeli", async () => {
  const reportsSource = await source("src/ReportsPage.jsx");
  const salesSource = await source("src/SalesPage.jsx");
  const departmentSource = await source("src/DepartmentAnalysisPage.jsx");

  for (const sourceText of [reportsSource, salesSource, departmentSource]) {
    assert.match(sourceText, /sourceKinds/);
    assert.match(sourceText, /CPM öncelikli · TCMB fallback/);
  }
});

test("Task 3 visual contract uses theme-safe chart colors, separated values, and contained responsive chrome", async () => {
  const styles = await source("src/styles.css");

  assert.match(styles, /--chart-sales:/);
  assert.match(styles, /--chart-profit:/);
  assert.match(styles, /--chart-service:/);
  assert.match(styles, /--chart-parts:/);
  assert.match(styles, /--chart-review:/);
  assert.match(styles, /data-theme="dark"[^}]*--chart-sales:/s);
  assert.match(styles, /\.label-value\s*\{[^}]*display:\s*grid;[^}]*gap:\s*(?:[3-9]|1[0-9])px/s);
  assert.match(styles, /\.info-banner[^}]*gap:\s*(?:1[0-9]|[2-9][0-9])px/s);
  assert.match(styles, /@media\s*\(max-width:\s*768px\)/);
  assert.match(styles, /@media\s*\(max-width:\s*768px\)[\s\S]*?\.topbar[^}]*min-width:\s*0/s);
  assert.match(styles, /\.topbar\s*>\s*\*[^}]*min-width:\s*0/);
  assert.match(styles, /\.brand__copy\s*\{[^}]*display:\s*grid/s);
  assert.match(styles, /\.brand__copy\s+small\s*\{[^}]*display:\s*block/s);
});

test("critical light-theme panels keep readable interactive text in dark mode", async () => {
  const styles = await source("src/styles.css");

  assert.match(styles, /\.inventory-product\s*\{[^}]*appearance:\s*none/s);
  assert.match(styles, /\.inventory-product\s*\{[^}]*background:\s*var\(--surface\)[^}]*color:\s*var\(--ink\)/s);
  assert.match(styles, /:root\[data-theme="dark"\]\s+\.inventory-product\s*\{[^}]*background:\s*var\(--surface\)[^}]*color:\s*var\(--ink\)/s);
  assert.match(styles, /\.inventory-product\s+strong\s*\{[^}]*margin-right:\s*0\.35rem/s);
  assert.match(styles, /:root\[data-theme="dark"\]\s+\.summary-attention\s*,[\s\S]*?:root\[data-theme="dark"\]\s+\.summary-attention\s+\.attention-list\s+button\s*\{[^}]*background:\s*var\(--surface\)[^}]*color:\s*var\(--ink\)/s);
});

test("live shell exposes logout and preserves independent appearance toggles", async () => {
  const appSource = await source("src/App.jsx");

  assert.match(appSource, /apiFetch\("\/api\/session\/logout"/);
  assert.match(appSource, /IconLogout/);
  assert.match(appSource, /aria-label="Çıkış yap"/);
  assert.match(appSource, /setAppearance\(\(current\) => \(\{ \.\.\.current, highContrast: event\.target\.checked \}\)\)/);
  assert.match(appSource, /setAppearance\(\(current\) => \(\{ \.\.\.current, reducedMotion: event\.target\.checked \}\)\)/);
});

test("mobile shell keeps appearance and logout controls reachable", async () => {
  const styles = await source("src/styles.css");
  assert.match(styles, /\.topbar\s*>\s*\.icon-button\s*\{[^}]*display:\s*inline-flex/);
});

test("sales KPI grid uses the responsive sales layout contract", async () => {
  const salesSource = await source("src/SalesPage.jsx");
  assert.match(salesSource, /<section className="control-kpis sales-kpis">/);
});

test("sales currency basket remains renderable when the live payload omits review scope", async (t) => {
  const vite = await createServer({ configFile: resolve(process.cwd(), "vite.config.mjs") });
  t.after(() => vite.close());
  const sales = await vite.ssrLoadModule("/src/SalesPage.jsx");

  assert.deepEqual(sales.normalizeCurrencyBasket({}), {
    EUR: { lineCount: 0 }, USD: { lineCount: 0 }, GBP: { lineCount: 0 },
    TRY: { lineCount: 0 }, INCELEME: { lineCount: 0 },
  });
  assert.deepEqual(sales.normalizeCurrencyBasket({ EUR: { lineCount: 2 } }), {
    EUR: { lineCount: 2 },
    USD: { lineCount: 0 },
    GBP: { lineCount: 0 },
    TRY: { lineCount: 0 },
    INCELEME: { lineCount: 0 },
  });
  assert.deepEqual(sales.normalizeCurrencyBasket({ INCELEME: { lineCount: 3 } }), {
    EUR: { lineCount: 0 },
    USD: { lineCount: 0 },
    GBP: { lineCount: 0 },
    TRY: { lineCount: 0 },
    INCELEME: { lineCount: 3 },
  });
});

test("dark audit surfaces keep KPI and expanded detail text readable", async () => {
  const styles = await source("src/styles.css");
  assert.match(styles, /:root\[data-theme="dark"\] \.audit-kpis article strong[^}]*color:\s*var\(--ink\)/);
  assert.match(styles, /:root\[data-theme="dark"\] \.audit-detail-row td[^}]*background:\s*var\(--surface\)[^}]*color:\s*var\(--ink\)/);
  assert.match(styles, /:root\[data-theme="dark"\] \.audit-detail-grid strong[^}]*color:\s*var\(--ink\)/);
  assert.match(styles, /:root\[data-theme="dark"\] \.audit-detail-grid small[^}]*color:\s*var\(--muted\)/);
});

test("inventory evidence label does not claim completion without a selected product", async (t) => {
  const vite = await createServer({ configFile: resolve(process.cwd(), "vite.config.mjs") });
  t.after(() => vite.close());
  const inventory = await vite.ssrLoadModule("/src/InventoryResearchPage.jsx");

  assert.equal(inventory.getInventoryEvidenceLabel({ selected: null, reviewCount: 0 }), "Ürün seçilmedi");
  assert.equal(inventory.getInventoryEvidenceLabel({ selected: { code: "P-1" }, reviewCount: 0 }), "Kanıt zinciri tamam");
  assert.equal(inventory.getInventoryEvidenceLabel({ selected: { code: "P-1" }, reviewCount: 2 }), "2 kanıt incelenecek");
});

test("Task 3 charts render semantic legends outside image wrappers and consume spacing classes", async (t) => {
  const vite = await createServer({ configFile: resolve(process.cwd(), "vite.config.mjs") });
  t.after(() => vite.close());
  const reports = await vite.ssrLoadModule("/src/ReportsPage.jsx");
  const summary = await vite.ssrLoadModule("/src/SummaryPage.jsx");
  const department = await vite.ssrLoadModule("/src/DepartmentAnalysisPage.jsx");

  for (const [legend, label, names] of [
    [reports.AccessibleChartLegend, "Marka satış ve kâr serileri", ["Net satış", "Kâr"]],
    [summary.AccessibleChartLegend, "Aylık satış ve kârlılık serileri", ["Satış", "Kâr"]],
    [department.AccessibleChartLegend, "Departman satış ve kâr serileri", ["Servis net satış", "Toplam kâr"]],
  ]) {
    const markup = renderToStaticMarkup(React.createElement(legend, { label, items: names.map((name) => ({ name, color: "#fff" })) }));
    assert.equal(markup.startsWith(`<ul class="chart-legend" aria-label="${label}">`), true);
    assert.equal((markup.match(/<li/g) || []).length, names.length);
    for (const name of names) assert.equal(markup.includes(`>${name}</span>`), true);
  }

  const summaryMarkup = renderToStaticMarkup(React.createElement(summary.SummaryPage, {
    rows: [{ month: 1, monthName: "Ocak", sales: 100, returns: 0, discounts: 0, estimatedCost: 40 }],
    settings: {}, employees: [], targetRows: [], annualPool: 0, year: 2026, mode: "live", onNavigate: () => {},
  }));
  const summaryImage = summaryMarkup.indexOf('role="img" aria-label="Aylık satış ve kârlılık grafiği"');
  const summaryLegend = summaryMarkup.indexOf('class="chart-legend" aria-label="Aylık satış ve kârlılık serileri"');
  assert.ok(summaryImage >= 0);
  assert.ok(summaryLegend > summaryImage);
  assert.equal(summaryMarkup.includes('class="label-value"'), true);

  const departmentMarkup = renderToStaticMarkup(React.createElement(department.DepartmentAnalysisPage, { year: 2026, mode: "demo" }));
  assert.equal(departmentMarkup.includes('class="department-notice info-banner"'), true);
  assert.equal(departmentMarkup.includes('class="label-value"'), true);
});

test("Summary renders an explicit overview error instead of pilot or empty chart state", async (t) => {
  const vite = await createServer({ configFile: resolve(process.cwd(), "vite.config.mjs") });
  t.after(() => vite.close());
  const summary = await vite.ssrLoadModule("/src/SummaryPage.jsx");
  const markup = renderToStaticMarkup(React.createElement(summary.SummaryPage, {
    rows: [{ month: 1, monthName: "Ocak", sales: 100, returns: 0, discounts: 0, estimatedCost: 40 }],
    settings: {}, employees: [], targetRows: [], annualPool: 0, year: 2026, mode: "error", onNavigate: () => {},
  }));

  assert.match(markup, /role="alert"/);
  assert.match(markup, /Yönetici özeti verileri okunamadı/);
  assert.doesNotMatch(markup, /Pilot veri/);
  assert.doesNotMatch(markup, /role="img" aria-label="Aylık satış ve kârlılık grafiği"/);
  assert.doesNotMatch(markup, /Aylık grafik için veri bulunamadı/);
});

test("Inventory research labels opening diagnostics as sample-scoped", async (t) => {
  const vite = await createServer({ configFile: resolve(process.cwd(), "vite.config.mjs") });
  t.after(() => vite.close());
  const inventory = await vite.ssrLoadModule("/src/InventoryResearchPage.jsx");

  assert.equal(
    inventory.getOpeningEvidenceScopeLabel({ scope: "sample", sampleLimit: 5 }),
    "Örneklem tanısı · en fazla 5 satır",
  );
  assert.equal(
    inventory.getOpeningEvidenceScopeLabel({ scope: "full" }),
    "Açılış kanıtı tanısı",
  );
});

test("Department semantic legend follows the visible chart series and chart presence", async (t) => {
  const vite = await createServer({ configFile: resolve(process.cwd(), "vite.config.mjs") });
  t.after(() => vite.close());
  const department = await vite.ssrLoadModule("/src/DepartmentAnalysisPage.jsx");

  assert.deepEqual(department.getDepartmentChartSeries("service").map((item) => item.name), ["Servis net satış", "Servis kâr"]);
  assert.deepEqual(department.getDepartmentChartSeries("parts").map((item) => item.name), ["Yedek Parça net satış", "Yedek Parça kâr"]);
  assert.deepEqual(department.getDepartmentChartSeries("review").map((item) => item.name), ["İnceleme gerekli", "Toplam kâr"]);
  assert.deepEqual(department.getDepartmentChartSeries("all").map((item) => item.name), ["Servis net satış", "Yedek Parça net satış", "İnceleme gerekli", "Toplam kâr"]);

  const legendMarkup = renderToStaticMarkup(React.createElement(department.AccessibleChartLegend, {
    label: "Departman satış ve kâr serileri",
    items: department.getDepartmentChartSeries("parts"),
  }));
  assert.equal((legendMarkup.match(/<li/g) || []).length, 2);
  assert.match(legendMarkup, /Yedek Parça net satış/);
  assert.match(legendMarkup, /Yedek Parça kâr/);
  assert.doesNotMatch(legendMarkup, /Servis net satış|İnceleme gerekli/);

  const initialMarkup = renderToStaticMarkup(React.createElement(department.DepartmentAnalysisPage, { year: 2026, mode: "demo" }));
  assert.doesNotMatch(initialMarkup, /class="chart-legend"/);
});

test("authenticated navigation follows capability boundaries and guards direct routes", async (t) => {
  const vite = await createServer({ configFile: resolve(process.cwd(), "vite.config.mjs") });
  t.after(() => vite.close());
  const gate = await vite.ssrLoadModule("/src/sessionGate.js");
  const operational = { role: "operational", capabilities: ["operations:read"] };
  const reporting = { role: "reporting", capabilities: ["reporting:read"] };
  const admin = { role: "admin", capabilities: ["reporting:read", "operations:read", "approvals:manage", "settings:manage"] };

  assert.deepEqual(gate.navItemsFor(operational).map((item) => item.page), ["inventory"]);
  assert.equal(gate.canAccessPage(operational, "summary"), false);
  assert.equal(gate.canAccessPage(operational, "inventory"), true);
  assert.equal(gate.canAccessPage(reporting, "summary"), true);
  assert.equal(gate.canAccessPage(reporting, "settings"), false);
  assert.equal(gate.canAccessPage(admin, "settings"), true);
  for (const inactivePage of ["reports", "goals", "approval", "performance"]) {
    assert.equal(gate.canAccessPage(admin, inactivePage), false, `${inactivePage} aktif route olmamalı`);
  }
  assert.equal(gate.firstAccessiblePage(operational, "summary"), "inventory");
});

test("overview response policy never substitutes pilot finance data for blocked or empty responses", async (t) => {
  const vite = await createServer({ configFile: resolve(process.cwd(), "vite.config.mjs") });
  t.after(() => vite.close());
  const gate = await vite.ssrLoadModule("/src/sessionGate.js");
  const blocked = gate.overviewStateForResponse({ ok: false, status: 403, payload: { error: "forbidden" } });
  const unavailable = gate.overviewStateForResponse({ ok: false, status: 503, payload: { error: "unavailable" } });
  const empty = gate.overviewStateForResponse({ ok: true, status: 200, payload: { rows: [], mode: "demo" } });

  for (const state of [blocked, unavailable, empty]) {
    assert.deepEqual(state.rows, []);
    assert.deepEqual(state.eurRateSets, {});
    assert.equal(state.canonicalMetric, null);
    assert.equal(JSON.stringify(state).includes("1.025.450.000"), false);
    assert.equal(JSON.stringify(state).includes("Pilot veri"), false);
  }
  assert.equal(blocked.mode, "blocked");
  assert.equal(unavailable.mode, "error");
  assert.equal(empty.mode, "empty");
});

test("policy modal open guard is idempotent across single and rapid repeated activation", async (t) => {
  const vite = await createServer({ configFile: resolve(process.cwd(), "vite.config.mjs") });
  t.after(() => vite.close());
  const gate = await vite.ssrLoadModule("/src/sessionGate.js");
  const guard = gate.createIdempotentOpenGuard();

  assert.equal(guard.open(), true);
  assert.equal(guard.open(), false);
  assert.equal(guard.isOpen(), true);
  guard.close();
  assert.equal(guard.isOpen(), false);
  assert.equal(guard.open(), true);
});

test("Department delivery-depot chart and semantic legend share theme tokens", async (t) => {
  const vite = await createServer({ configFile: resolve(process.cwd(), "vite.config.mjs") });
  t.after(() => vite.close());
  const department = await vite.ssrLoadModule("/src/DepartmentAnalysisPage.jsx");
  const depotSeries = department.DELIVERY_DEPOT_CHART_SERIES;

  assert.deepEqual(depotSeries.map((item) => item.name), ["Merkez Depo", "Yatmarin Depo", "Belirsiz"]);
  assert.deepEqual(depotSeries.map((item) => item.color), ["var(--chart-service)", "var(--chart-parts)", "var(--chart-review)"]);
  const markup = renderToStaticMarkup(React.createElement(department.AccessibleChartLegend, {
    label: "Teslimat deposu serileri", items: depotSeries,
  }));
  for (const item of depotSeries) assert.match(markup, new RegExp(`background:${item.color.replace(/[()]/g, "\\$&")}`));
});

test("Reports brand semantic legend follows the active visible chart", async (t) => {
  const vite = await createServer({ configFile: resolve(process.cwd(), "vite.config.mjs") });
  t.after(() => vite.close());
  const reports = await vite.ssrLoadModule("/src/ReportsPage.jsx");

  assert.equal(reports.isBrandChartVisible({ active: "summary", loading: false, error: null, brand: [{ name: "Acme" }] }), true);
  assert.equal(reports.isBrandChartVisible({ active: "brand", loading: false, error: null, brand: [{ name: "Acme" }] }), false);
  assert.equal(reports.isBrandChartVisible({ active: "summary", loading: true, error: null, brand: [{ name: "Acme" }] }), false);
  assert.equal(reports.isBrandChartVisible({ active: "summary", loading: false, error: null, brand: [] }), false);

  const initialMarkup = renderToStaticMarkup(React.createElement(reports.ReportsPage, { year: 2026, rows: [], settings: {}, employees: [], targetRows: [], annualPool: 0 }));
  assert.doesNotMatch(initialMarkup, /class="chart-legend"/);
});
