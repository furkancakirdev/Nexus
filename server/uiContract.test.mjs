import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

async function source(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("Katkı ve Performans sayfası menüden yönlendirmeden ve görünüm ayarından kaldırılır", async () => {
  const appSource = await source("src/App.jsx");

  assert.doesNotMatch(appSource, /PerformancePage/);
  assert.doesNotMatch(appSource, /page:\s*["']performance["']/);
  assert.doesNotMatch(appSource, /value=["']performance["']/);
  assert.doesNotMatch(appSource, /Katkı\s*&amp;\s*Performans/);
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
  assert.match(
    styles,
    /\.audit-table thead \.audit-table__profit,[\s\S]{0,240}?position:\s*static/,
  );
  assert.match(auditSource, /aria-expanded=\{expanded===row\.id\}/);
  assert.match(auditSource, /aria-controls=\{`audit-detail-\$\{row\.id\}`\}/);
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
