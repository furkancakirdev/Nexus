import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDepartmentTargets,
  calculateTargetAmount,
  classifyTargetBand,
} from "../shared/targetPolicy.mjs";

const settings = {
  departmentGrowthTargets: { service: 10, parts: 10 },
  departmentStretchThresholds: { service: 5, parts: 5 },
  rates: { conservative: 3, growth: 8 },
  reserveRate: 5,
};

function row({
  department,
  documentDate,
  netSales,
  cost = 0,
  uncoveredNetSales = 0,
}) {
  return { department, documentDate, netSales, cost, uncoveredNetSales };
}

test("hedef altı dağıtım üretmez", () => {
  assert.equal(classifyTargetBand({
    actual: 999,
    target: 1_000,
    stretchPct: 5,
  }).band, "none");
});

test("hedef karşılandığında temkinli oran seçilir", () => {
  assert.equal(classifyTargetBand({
    actual: 1_000,
    target: 1_000,
    stretchPct: 5,
  }).band, "conservative");
});

test("hedef üzeri eşik karşılandığında büyüme oranı seçilir", () => {
  const result = classifyTargetBand({
    actual: 1_050,
    target: 1_000,
    stretchPct: 5,
  });
  assert.equal(result.band, "growth");
  assert.equal(result.stretchTarget, 1_050);
});

test("aylık hedef önceki yıl aynı ay nihai net satışından hesaplanır", () => {
  assert.equal(calculateTargetAmount(1_000_000, 10), 1_100_000);
});

test("önceki yıl satışı sıfır veya eksik olan ay güvenli biçimde havuz dışı kalır", () => {
  const rows = buildDepartmentTargets({
    year: 2026,
    previousRows: [],
    currentRows: [
      row({
        department: "service",
        documentDate: "2026-01-15T10:00:00.000Z",
        netSales: 100_000,
        cost: 50_000,
      }),
    ],
    settings,
  });

  const serviceJanuary = rows.find((item) => (
    item.department === "service" && item.month === 1
  ));
  assert.equal(rows.length, 24);
  assert.equal(serviceJanuary.priorNetSales, 0);
  assert.equal(serviceJanuary.target, 0);
  assert.equal(serviceJanuary.band, "none");
  assert.equal(serviceJanuary.appliedRate, 0);
  assert.equal(serviceJanuary.pool, 0);
  assert.equal(serviceJanuary.achievementPct, null);
});

test("istenen yıl dışındaki tarihli satırlar aylık hedefe karışmaz", () => {
  const rows = buildDepartmentTargets({
    year: 2026,
    previousRows: [
      row({
        department: "service",
        documentDate: "2025-01-10T10:00:00.000Z",
        netSales: 1_000,
        cost: 400,
      }),
      row({
        department: "service",
        documentDate: "2024-01-10T10:00:00.000Z",
        netSales: 9_000,
        cost: 4_000,
      }),
    ],
    currentRows: [
      row({
        department: "service",
        documentDate: "2026-01-10T10:00:00.000Z",
        netSales: 1_100,
        cost: 500,
      }),
      row({
        department: "service",
        documentDate: "2025-01-10T10:00:00.000Z",
        netSales: 8_000,
        cost: 4_000,
      }),
    ],
    settings,
  });

  const january = rows.find((item) => (
    item.department === "service" && item.month === 1
  ));
  assert.equal(january.priorNetSales, 1_000);
  assert.equal(january.actual, 1_100);
  assert.equal(january.band, "conservative");
});

test("negatif önceki yıl neti hedef üretmez ve gerçekleşmeyi dağıtıma açmaz", () => {
  const rows = buildDepartmentTargets({
    year: 2026,
    previousRows: [
      row({
        department: "parts",
        documentDate: "2025-04-10T10:00:00.000Z",
        netSales: -100,
        cost: -40,
      }),
    ],
    currentRows: [
      row({
        department: "parts",
        documentDate: "2026-04-10T10:00:00.000Z",
        netSales: 500,
        cost: 100,
      }),
    ],
    settings,
  });

  const april = rows.find((item) => (
    item.department === "parts" && item.month === 4
  ));
  assert.equal(april.priorNetSales, -100);
  assert.equal(april.target, 0);
  assert.equal(april.band, "none");
  assert.equal(april.pool, 0);
});

test("nihai ledger satırları iki departman ve on iki ay için hedef ile havuza dönüşür", () => {
  const rows = buildDepartmentTargets({
    year: 2026,
    previousRows: [
      row({
        department: "service",
        documentDate: "2025-01-10T10:00:00.000Z",
        netSales: 1_000,
        cost: 400,
      }),
      row({
        department: "parts",
        documentDate: "2025-01-11T10:00:00.000Z",
        netSales: 2_000,
        cost: 1_200,
      }),
    ],
    currentRows: [
      row({
        department: "service",
        documentDate: "2026-01-10T10:00:00.000Z",
        netSales: 1_100,
        cost: 500,
      }),
      row({
        department: "parts",
        documentDate: "2026-01-11T10:00:00.000Z",
        netSales: 2_310,
        cost: 1_000,
        uncoveredNetSales: 100,
      }),
      row({
        department: "review",
        documentDate: "2026-01-12T10:00:00.000Z",
        netSales: 50_000,
        cost: 0,
      }),
    ],
    settings,
  });

  const service = rows.find((item) => item.department === "service" && item.month === 1);
  const parts = rows.find((item) => item.department === "parts" && item.month === 1);
  assert.equal(rows.length, 24);
  assert.deepEqual(
    {
      prior: service.priorNetSales,
      target: service.target,
      stretch: service.stretchTarget,
      actual: service.actual,
      band: service.band,
      rate: service.appliedRate,
      profit: service.profit,
      uncovered: service.uncoveredNetSales,
      reserve: service.reserve,
      pool: service.pool,
    },
    {
      prior: 1_000,
      target: 1_100,
      stretch: 1_155,
      actual: 1_100,
      band: "conservative",
      rate: 3,
      profit: 600,
      uncovered: 0,
      reserve: 0.9,
      pool: 17.1,
    },
  );
  assert.equal(parts.band, "growth");
  assert.equal(parts.profit, 1_310);
  assert.equal(parts.eligibleProfit, 1_210);
  assert.equal(parts.reserve, 4.84);
  assert.equal(parts.pool, 91.96);
  assert.equal(rows.reduce((sum, item) => sum + item.actual, 0), 3_410);
});

test("iadeler hedef gerçekleşmesini ve negatif kâr havuzunu güvenli biçimde azaltır", () => {
  const rows = buildDepartmentTargets({
    year: 2026,
    previousRows: [
      row({
        department: "service",
        documentDate: "2025-02-10T10:00:00.000Z",
        netSales: 100,
        cost: 40,
      }),
    ],
    currentRows: [
      row({
        department: "service",
        documentDate: "2026-02-10T10:00:00.000Z",
        netSales: 150,
        cost: 200,
      }),
      row({
        department: "service",
        documentDate: "2026-02-11T10:00:00.000Z",
        netSales: -40,
        cost: -10,
      }),
    ],
    settings,
  });

  const february = rows.find((item) => (
    item.department === "service" && item.month === 2
  ));
  assert.equal(february.actual, 110);
  assert.equal(february.band, "conservative");
  assert.equal(february.profit, -80);
  assert.equal(february.eligibleProfit, 0);
  assert.equal(february.pool, 0);
});

test("ham nihai ledger satırında null maliyet kapsamsız satış olarak havuzdan çıkarılır", () => {
  const rows = buildDepartmentTargets({
    year: 2026,
    previousRows: [{
      department: "service",
      documentDate: "2025-03-10T10:00:00.000Z",
      signedNetSales: 100,
      lineCost: 50,
    }],
    currentRows: [{
      department: "service",
      documentDate: "2026-03-10T10:00:00.000Z",
      signedNetSales: 120,
      lineCost: null,
    }],
    settings,
  });

  const march = rows.find((item) => (
    item.department === "service" && item.month === 3
  ));
  assert.equal(march.band, "growth");
  assert.equal(march.profit, 120);
  assert.equal(march.uncoveredNetSales, 120);
  assert.equal(march.eligibleProfit, 0);
  assert.equal(march.pool, 0);
});

test("geçersiz hedef ayarı çalışma zamanı doğrulamasında reddedilir", () => {
  assert.throws(() => buildDepartmentTargets({
    year: 2026,
    currentRows: [],
    previousRows: [],
    settings: {
      ...settings,
      reserveRate: 101,
    },
  }), /rezerv/i);
});
