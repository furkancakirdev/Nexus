import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  serializeSettings,
} from "../shared/settingsPolicy.mjs";
import { buildDepartmentTargets } from "../shared/targetPolicy.mjs";

test("eski kişi hedef ayarlarını kaldırırken canlı oranları korur", () => {
  const result = normalizeSettings({
    rates: { conservative: 3, base: 5, growth: 8 },
    individualWeight: 30,
    companyWeight: 60,
    teamWeight: 40,
    companyPerformanceScore: 110,
    departmentPerformanceScores: { service: 95 },
    minimumGoalScore: 80,
    maximumMultiplier: 120,
    scoreScale: 5,
  });

  assert.deepEqual(result.rates, { conservative: 3, growth: 8 });
  for (const key of [
    "individualWeight",
    "companyWeight",
    "teamWeight",
    "companyPerformanceScore",
    "departmentPerformanceScores",
    "minimumGoalScore",
    "maximumMultiplier",
    "scoreScale",
  ]) {
    assert.equal(key in result, false);
  }
});

test("varsayılan departman hedef ayarlarını oluşturur", () => {
  const result = normalizeSettings({});

  assert.deepEqual(result.departmentTargets.service, {
    growthPct: 10,
    stretchPct: 5,
  });
  assert.deepEqual(result.departmentTargets.parts, {
    growthPct: 10,
    stretchPct: 5,
  });
  assert.deepEqual(result.rates, { conservative: 3, growth: 8 });
  assert.equal(result.reserveRate, 5);
});

test("eski departman adlarını yeni iki departman modeline taşır", () => {
  const result = normalizeSettings({
    departmentGrowthTargets: {
      "Atölye Teknik": 12,
      Ofis: 14,
    },
    departmentStretchThresholds: {
      Servis: 6,
      "Yedek Parça Satış": 7,
    },
  });

  assert.deepEqual(result.departmentTargets, {
    service: { growthPct: 12, stretchPct: 6 },
    parts: { growthPct: 14, stretchPct: 7 },
  });
  assert.equal("departmentGrowthTargets" in result, false);
  assert.equal("departmentStretchThresholds" in result, false);
});

test("desteklenen Nexus ayarlarını korur ve bilinmeyen anahtarları temizler", () => {
  const result = serializeSettings({
    ...DEFAULT_SETTINGS,
    allocationMethod: "equal",
    monthlyCloseDay: 8,
    employeeVisibility: "summary",
    identityMap: { FURKAN: "Furkan Çakır" },
    unsupportedSetting: "sil",
    companyGrowthTarget: 99,
  });

  assert.equal(result.allocationMethod, "equal");
  assert.equal(result.monthlyCloseDay, 8);
  assert.equal(result.employeeVisibility, "summary");
  assert.deepEqual(result.identityMap, { FURKAN: "Furkan Çakır" });
  assert.equal("unsupportedSetting" in result, false);
  assert.equal("companyGrowthTarget" in result, false);
});

test("serialize edilen ayar özgün nesneden bağımsızdır", () => {
  const stored = {
    rates: { conservative: 4, growth: 9 },
    departmentTargets: {
      service: { growthPct: 11, stretchPct: 6 },
      parts: { growthPct: 12, stretchPct: 7 },
    },
    pilotCardCostRates: { labor: 1, srf: 90, tsr: 80, road: 70 },
  };

  const result = serializeSettings(stored);
  stored.rates.conservative = 99;
  stored.departmentTargets.service.growthPct = 99;
  stored.pilotCardCostRates.labor = 99;

  assert.equal(result.rates.conservative, 4);
  assert.equal(result.departmentTargets.service.growthPct, 11);
  assert.equal(result.pilotCardCostRates.labor, 1);
});

test("ayar kökü undefined olabilir fakat açık bozuk değerler reddedilir", () => {
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS);

  for (const invalid of [null, [], new Date(), new Number(1), () => ({})]) {
    assert.throws(() => normalizeSettings(invalid), /ayarları nesne/i);
  }
});

test("hedef ve dağıtım finansal alanları primitive sayı ve ürün aralığı kullanır", () => {
  const invalidSettings = [
    { rates: { conservative: -0.01 } },
    { rates: { growth: 100.01 } },
    { reserveRate: null },
    { reserveRate: true },
    { departmentTargets: { service: { growthPct: -100.01 } } },
    { departmentTargets: { parts: { growthPct: 300.01 } } },
    { departmentTargets: { service: { stretchPct: -0.01 } } },
    { departmentTargets: { parts: { stretchPct: 100.01 } } },
    { departmentTargets: { service: { growthPct: "10" } } },
    { departmentTargets: { service: { stretchPct: new Number(5) } } },
  ];

  for (const invalid of invalidSettings) {
    assert.throws(
      () => serializeSettings(invalid),
      /sayı|aralığında|arasında/i,
    );
  }

  assert.doesNotThrow(() => serializeSettings({
    rates: { conservative: 0, growth: 100 },
    reserveRate: 100,
    departmentTargets: {
      service: { growthPct: -100, stretchPct: 0 },
      parts: { growthPct: 300, stretchPct: 100 },
    },
  }));
});

test("desteklenen politika alanlarının tür ve ürün sözleşmesini doğrular", () => {
  const invalidSettings = [
    { minimumProfit: null },
    { minimumProfit: -0.01 },
    { negativeRule: "bilinmeyen" },
    { distributionMonth: 0 },
    { distributionMonth: 2.5 },
    { costMethod: "bilinmeyen" },
    { pilotCardCostRates: { labor: null } },
    { pilotCardCostRates: { srf: 100.01 } },
    { minimumCoverage: 59.99 },
    { minimumCoverage: "85" },
    { exchangeRateRule: "bilinmeyen" },
    { requireManagementApprovalForManualCost: 1 },
    { allocationMethod: "bilinmeyen" },
    { monthlyCloseDay: 29 },
    { boardApproval: "true" },
    { lockAfterApproval: null },
    { auditLog: 1 },
    { monthlyNotifications: 0 },
    { employeeVisibility: "bilinmeyen" },
  ];

  for (const invalid of invalidSettings) {
    assert.throws(
      () => serializeSettings(invalid),
      /geçerli|sayı|boolean|arasında|olmalı/i,
    );
  }
});

test("hedef politikası yeni departman hedef ayarlarını doğrudan tüketir", () => {
  const rows = buildDepartmentTargets({
    year: 2026,
    previousRows: [
      {
        department: "service",
        documentDate: "2025-01-15",
        netSales: 1_000,
        cost: 400,
      },
    ],
    currentRows: [
      {
        department: "service",
        documentDate: "2026-01-15",
        netSales: 1_320,
        cost: 600,
      },
    ],
    settings: serializeSettings({
      departmentTargets: {
        service: { growthPct: 20, stretchPct: 10 },
        parts: { growthPct: 10, stretchPct: 10 },
      },
      rates: { conservative: 3, growth: 8 },
      reserveRate: 5,
    }),
  });

  const january = rows.find((row) => (
    row.department === "service" && row.month === 1
  ));
  assert.equal(january.target, 1_200);
  assert.equal(january.stretchTarget, 1_320);
  assert.equal(january.band, "growth");
  assert.equal(january.appliedRate, 8);
});

test("uygulama ayarı API yazımı sunucu allow-list serileştiricisini kullanır", async () => {
  const source = await readFile(new URL("./index.mjs", import.meta.url), "utf8");

  assert.match(
    source,
    /import\s*\{\s*serializeSettings\s*\}\s*from\s*["']\.\.\/shared\/settingsPolicy\.mjs["']/,
  );
  assert.match(source, /settings:\s*serializeSettings\(settings\)/);
});

test("hedef kullanan ekranlar nesne döndüren departman dağıtım sözleşmesini kullanır", async () => {
  const [summarySource, reportsSource] = await Promise.all([
    readFile(new URL("../src/SummaryPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/ReportsPage.jsx", import.meta.url), "utf8"),
  ]);

  for (const source of [summarySource, reportsSource]) {
    assert.match(source, /calculateDepartmentDistribution/);
    assert.doesNotMatch(source, /calculateEmployeeDistribution/);
  }
});

test("maliyet kararı kaydedildiğinde departman hedef havuzu yeniden yüklenir", async () => {
  const source = await readFile(
    new URL("../src/App.jsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /saveCostOverrides[\s\S]*persistState[\s\S]*refreshDepartmentTargets/,
  );
});
