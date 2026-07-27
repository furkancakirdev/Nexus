import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDepartmentTargets,
  calculateTargetAmount,
  classifyTargetBand,
  monthlyDepartmentPool,
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

test("rezerv ve havuz kuruşları rezerv öncesi tutarla tam uzlaşır", () => {
  const result = monthlyDepartmentPool({
    profit: 10,
    uncoveredNetSales: 0,
    band: "conservative",
    settings: {
      ...settings,
      rates: { conservative: 3, growth: 8 },
      reserveRate: 5,
    },
  });

  assert.equal(result.reserve, 0.01);
  assert.equal(result.pool, 0.29);
  assert.equal(result.reserve + result.pool, 0.3);
});

test("maliyetsiz satış ve iadeyi satır bazında netleyip toplu yolla aynı sonucu üretir", () => {
  const previousRows = [{
    department: "service",
    documentDate: "2025-05-10T10:00:00.000Z",
    signedNetSales: 100,
    lineCost: 50,
  }];
  const rawRows = [
    {
      department: "service",
      documentDate: "2026-05-10T10:00:00.000Z",
      signedNetSales: 100,
      lineCost: 50,
    },
    {
      department: "service",
      documentDate: "2026-05-11T10:00:00.000Z",
      signedNetSales: 100,
      lineCost: null,
    },
    {
      department: "service",
      documentDate: "2026-05-12T10:00:00.000Z",
      signedNetSales: -20,
      lineCost: null,
    },
  ];
  const aggregateRows = [{
    department: "service",
    month: 5,
    netSales: 180,
    cost: 50,
    uncoveredNetSales: 80,
  }];
  const raw = buildDepartmentTargets({
    year: 2026,
    previousRows,
    currentRows: rawRows,
    settings,
  }).find((item) => item.department === "service" && item.month === 5);
  const aggregate = buildDepartmentTargets({
    year: 2026,
    previousRows,
    currentRows: aggregateRows,
    settings,
  }).find((item) => item.department === "service" && item.month === 5);

  assert.equal(raw.uncoveredNetSales, 80);
  assert.equal(raw.eligibleProfit, 50);
  assert.deepEqual(
    {
      profit: raw.profit,
      uncoveredNetSales: raw.uncoveredNetSales,
      eligibleProfit: raw.eligibleProfit,
      reserve: raw.reserve,
      pool: raw.pool,
    },
    {
      profit: aggregate.profit,
      uncoveredNetSales: aggregate.uncoveredNetSales,
      eligibleProfit: aggregate.eligibleProfit,
      reserve: aggregate.reserve,
      pool: aggregate.pool,
    },
  );
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

test("bozuk hedef ayarı ve dağıtım bandı çalışma zamanı sınırında reddedilir", () => {
  assert.throws(() => monthlyDepartmentPool({
    profit: 100,
    uncoveredNetSales: 0,
    band: "unknown",
    settings,
  }), /dağıtım bandı/i);

  assert.throws(() => buildDepartmentTargets({
    year: 2026,
    currentRows: [],
    previousRows: [],
    settings: {
      ...settings,
      rates: "invalid",
    },
  }), /oran/i);
});

test("hedef politikasının tüm finansal oranları primitive boolean değerleri reddeder", () => {
  for (const value of [true, false]) {
    const cases = [
      {
        ...settings,
        reserveRate: value,
      },
      {
        ...settings,
        rates: { ...settings.rates, conservative: value },
      },
      {
        ...settings,
        rates: { ...settings.rates, growth: value },
      },
      {
        ...settings,
        departmentGrowthTargets: {
          ...settings.departmentGrowthTargets,
          service: value,
        },
      },
      {
        ...settings,
        departmentStretchThresholds: {
          ...settings.departmentStretchThresholds,
          parts: value,
        },
      },
    ];

    for (const invalidSettings of cases) {
      assert.throws(() => buildDepartmentTargets({
        year: 2026,
        currentRows: [],
        previousRows: [],
        settings: invalidSettings,
      }), /sayı/i);
    }
  }
});

test("hedef finansal tutarları boolean ve sayı gibi davranan nesneleri reddeder", () => {
  const coercibleValues = [
    true,
    false,
    new Boolean(true),
    new Number(10),
    "10",
    { valueOf: () => 10 },
  ];

  for (const value of coercibleValues) {
    assert.throws(() => calculateTargetAmount(value, 10), /sayı/i);
    assert.throws(() => calculateTargetAmount(100, value), /sayı/i);
    assert.throws(() => classifyTargetBand({
      actual: value,
      target: 100,
      stretchPct: 10,
    }), /sayı/i);
    assert.throws(() => classifyTargetBand({
      actual: 100,
      target: value,
      stretchPct: 10,
    }), /sayı/i);
    assert.throws(() => monthlyDepartmentPool({
      profit: value,
      uncoveredNetSales: 0,
      band: "conservative",
      settings,
    }), /sayı/i);
    assert.throws(() => monthlyDepartmentPool({
      profit: 100,
      uncoveredNetSales: value,
      band: "conservative",
      settings,
    }), /sayı/i);
  }
});

test("hedef yılı boolean boxed veya numeric string olarak kabul edilmez", () => {
  for (const year of [true, false, new Number(2026), "2026"]) {
    assert.throws(() => buildDepartmentTargets({
      year,
      currentRows: [],
      previousRows: [],
      settings,
    }), /yılı/i);
  }
});

test("ham hedef satırındaki finansal alanlar sessiz sayı dönüşümüne girmez", () => {
  const invalidRows = [
    { netSales: true, cost: 10, uncoveredNetSales: 0 },
    { netSales: 100, cost: false, uncoveredNetSales: 0 },
    { netSales: 100, cost: 10, uncoveredNetSales: new Number(5) },
    { netSales: "100", cost: 10, uncoveredNetSales: 0 },
  ];

  for (const invalid of invalidRows) {
    assert.throws(() => buildDepartmentTargets({
      year: 2026,
      currentRows: [{
        department: "service",
        documentDate: "2026-01-10",
        ...invalid,
      }],
      previousRows: [],
      settings,
    }), /sayı/i);
  }
});
