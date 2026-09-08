import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  serializeSettings,
} from "./settingsPolicy.mjs";

const validPolicy = {
  id: "manual-margin-1",
  productCode: " gd-100 ",
  marginPct: 25.5,
  year: 2024,
  reason: "missing-purchase-or-opening-cost",
  reference: "Sayım ve belge incelemesi",
  note: "Alım veya devir maliyeti bulunamadı.",
  status: "pending",
};

test("manuel marj varsayılan olarak yönetim onayı gerektirir", () => {
  const settings = normalizeSettings({});
  assert.equal(settings.requireManagementApprovalForManualMargin, true);
  assert.deepEqual(settings.manualMarginPolicies, []);
  assert.equal(DEFAULT_SETTINGS.requireManagementApprovalForManualMargin, true);
});

test("manuel marj politikasını normalize eder ve bağımsız kopyalar", () => {
  const source = { manualMarginPolicies: [validPolicy] };
  const settings = serializeSettings(source);

  assert.deepEqual(settings.manualMarginPolicies[0], {
    ...validPolicy,
    productCode: "GD-100",
  });
  source.manualMarginPolicies[0].marginPct = 99;
  assert.equal(settings.manualMarginPolicies[0].marginPct, 25.5);
});

test("manuel marj alanlarını ve tekil ürün-yıl dönemini fail-closed doğrular", () => {
  const invalidPolicies = [
    { ...validPolicy, productCode: "" },
    { ...validPolicy, productCode: "GD 100" },
    { ...validPolicy, marginPct: -0.01 },
    { ...validPolicy, marginPct: 100.01 },
    { ...validPolicy, year: 2024.5 },
    { ...validPolicy, reason: "purchase-invoice-exists" },
    { ...validPolicy, status: "draft" },
    { ...validPolicy, note: "x".repeat(1001) },
  ];

  for (const policy of invalidPolicies) {
    assert.throws(() => serializeSettings({ manualMarginPolicies: [policy] }));
  }
  assert.throws(() => serializeSettings({ manualMarginPolicies: {} }), /dizi/i);
  assert.throws(() => serializeSettings({
    manualMarginPolicies: [validPolicy, { ...validPolicy, id: "manual-margin-2", productCode: "GD-100" }],
  }), /aynı ürün ve yıl/i);
  assert.throws(() => serializeSettings({ requireManagementApprovalForManualMargin: 1 }), /boolean/i);
});
