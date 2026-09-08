import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("SettingsPage manuel marjı yalnız eksik alım/devir maliyeti için taslak olarak yönetir", async () => {
  const source = await readFile(new URL("./SettingsPage.jsx", import.meta.url), "utf8");

  assert.match(source, /requireManagementApprovalForManualMargin/);
  assert.match(source, /missing-purchase-or-opening-cost/);
  assert.match(source, /Alım\/devir maliyeti bulunamadı/);
  assert.match(source, /status:\s*draft\.requireManagementApprovalForManualMargin === false \? "approved" : "pending"/);
  assert.match(source, /Bu turda hesaplamaya bağlanmaz/);
  assert.doesNotMatch(source, /financialMetric|ledgerApi|calculateManualMargin/);
});

test("SettingsPage manuel marj formu ekleme, listeleme, onay ve silme kontrollerini sunar", async () => {
  const source = await readFile(new URL("./SettingsPage.jsx", import.meta.url), "utf8");

  assert.match(source, /addManualMarginPolicy/);
  assert.match(source, /approveManualMarginPolicy/);
  assert.match(source, /deleteManualMarginPolicy/);
  assert.match(source, /<form[^>]+noValidate/);
  assert.match(source, /Marj kararını ekle/);
  assert.match(source, /Onay bekliyor/);
  assert.match(source, /manuel marjını sil/);
});
