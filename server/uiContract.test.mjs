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
