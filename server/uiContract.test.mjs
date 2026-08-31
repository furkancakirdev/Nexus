import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
