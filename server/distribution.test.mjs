import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateDepartmentDistribution,
  calculateEmployeeDistribution,
} from "../src/distribution.js";
import { buildDepartmentTargets } from "../shared/targetPolicy.mjs";

function target(department, month, pool) {
  return { department, month, pool };
}

const employees = [
  {
    id: "furkan",
    name: "Furkan Çakır",
    department: "Servis",
    salaryCoefficient: 2,
    included: true,
    status: "employee",
  },
  {
    id: "burak",
    name: "Burak Çetinel",
    department: "service",
    salaryCoefficient: 1,
    included: true,
    status: "employee",
  },
  {
    id: "mehmet",
    name: "Mehmet Kara",
    department: "Servis",
    salaryCoefficient: 1,
    included: false,
    status: "employee",
  },
  {
    id: "can",
    name: "Can",
    department: "Yedek Parça Satış",
    salaryCoefficient: 1,
    included: true,
    status: "employee",
  },
  {
    id: "eski",
    name: "Ayrılan Personel",
    department: "parts",
    salaryCoefficient: 10,
    included: true,
    status: "departed",
  },
];

test("katsayı dağıtımı yalnız çalışanın kendi departman havuzunu kullanır", () => {
  const result = calculateDepartmentDistribution({
    targetRows: [
      target("service", 1, 100.01),
      target("parts", 1, 50.02),
      target("service", 2, 0),
    ],
    employees,
    settings: { allocationMethod: "coefficient" },
  });

  const furkan = result.employees.find((item) => item.id === "furkan");
  const burak = result.employees.find((item) => item.id === "burak");
  const mehmet = result.employees.find((item) => item.id === "mehmet");
  const can = result.employees.find((item) => item.id === "can");
  const departed = result.employees.find((item) => item.id === "eski");
  assert.equal(furkan.projectedShare, 66.67);
  assert.equal(burak.projectedShare, 33.34);
  assert.equal(mehmet.projectedShare, 0);
  assert.equal(can.projectedShare, 50.02);
  assert.equal(departed.projectedShare, 0);
  assert.equal(
    result.departments.find((item) => item.department === "service").allocatedPool,
    100.01,
  );
  assert.equal(result.totalPool, 150.03);
  assert.equal(result.allocatedPool, 150.03);
  assert.equal(result.difference, 0);
});

test("eşit dağıtım kuruş farkını deterministik biçimde uzlaştırır", () => {
  const result = calculateDepartmentDistribution({
    targetRows: [target("service", 1, 100)],
    employees: employees.slice(0, 2),
    settings: {
      allocationMethod: "equal",
      companyPerformanceScore: 0,
      departmentPerformanceScores: { service: 0 },
      minimumGoalScore: 999,
      maximumMultiplier: 0,
    },
  });

  assert.deepEqual(
    result.employees.map((item) => item.projectedShare),
    [50, 50],
  );
  assert.equal(result.difference, 0);
  assert.equal(
    Object.hasOwn(result.employees[0], "performanceMultiplier"),
    false,
  );
  assert.equal(Object.hasOwn(result.employees[0], "weightedScore"), false);
});

test("sabit pay yalnız kendi departman havuzunda uygulanır ve kalan tutar uzlaşır", () => {
  const result = calculateDepartmentDistribution({
    targetRows: [
      target("service", 1, 100),
      target("parts", 1, 200),
    ],
    employees: [
      {
        id: "fixed-service",
        name: "Servis Sabit",
        department: "service",
        fixedShareRate: 25,
        included: true,
        status: "employee",
      },
      {
        id: "auto-service",
        name: "Servis Otomatik",
        department: "service",
        included: true,
        status: "employee",
      },
      {
        id: "parts",
        name: "Parça",
        department: "parts",
        fixedShareRate: 80,
        included: true,
        status: "employee",
      },
    ],
    settings: { allocationMethod: "equal" },
  });

  assert.deepEqual(
    result.employees.map((item) => [item.id, item.projectedShare]),
    [
      ["fixed-service", 25],
      ["auto-service", 75],
      ["parts", 160],
    ],
  );
  assert.equal(result.difference, 40);
});

test("yüzde yüz sabit pay kuruşları sabit oranların küsuratına göre uzlaştırır", () => {
  const result = calculateDepartmentDistribution({
    targetRows: [target("service", 1, 100)],
    employees: [
      {
        id: "first",
        department: "service",
        fixedShareRate: 33.33,
        salaryCoefficient: 100,
      },
      {
        id: "second",
        department: "service",
        fixedShareRate: 66.67,
        salaryCoefficient: 1,
      },
    ],
    settings: { allocationMethod: "coefficient" },
  });

  assert.deepEqual(
    result.employees.map((item) => [item.id, item.projectedShare]),
    [["first", 33.33], ["second", 66.67]],
  );
  assert.equal(result.difference, 0);
});

test("eski personel hedef onayı ve skor alanları dağıtım uygunluğunu değiştirmez", () => {
  const result = calculateDepartmentDistribution({
    targetRows: [target("service", 1, 90)],
    employees: [
      {
        id: "legacy",
        department: "service",
        included: true,
        status: "employee",
        approvalStatus: "Uygun Değil",
        weightedScore: 0,
        performanceMultiplier: 0,
      },
    ],
    settings: {
      allocationMethod: "equal",
      companyPerformanceScore: 0,
      departmentPerformanceScores: { service: 0 },
      minimumGoalScore: 999,
      maximumMultiplier: 0,
    },
  });

  assert.equal(result.employees[0].eligible, true);
  assert.equal(result.employees[0].projectedShare, 90);
});

test("departmanında uygun çalışan yoksa tutar başka departmana sızmaz", () => {
  const result = calculateDepartmentDistribution({
    targetRows: [
      target("service", 1, 100),
      target("parts", 1, 200),
    ],
    employees: [
      {
        id: "service",
        name: "Servis",
        department: "service",
        included: true,
        status: "employee",
      },
      {
        id: "parts-departed",
        name: "Ayrılan Parça",
        department: "parts",
        included: true,
        status: "departed",
      },
    ],
    settings: { allocationMethod: "equal" },
  });

  assert.equal(
    result.employees.find((item) => item.id === "service").projectedShare,
    100,
  );
  assert.equal(result.allocatedPool, 100);
  assert.equal(result.unallocatedPool, 200);
  assert.equal(result.difference, 200);
});

test("departman sabit pay toplamı yüzde yüzü aşarsa doğrulama reddeder", () => {
  assert.throws(() => calculateDepartmentDistribution({
    targetRows: [target("service", 1, 100)],
    employees: [
      {
        id: "a",
        department: "service",
        fixedShareRate: 60,
      },
      {
        id: "b",
        department: "service",
        fixedShareRate: 50,
      },
    ],
    settings: { allocationMethod: "equal" },
  }), /sabit pay/i);
});

test("yinelenen personel kimliği kuruş dağıtımını bozmak yerine reddedilir", () => {
  assert.throws(() => calculateDepartmentDistribution({
    targetRows: [target("service", 1, 100)],
    employees: [
      { id: "same", department: "service" },
      { id: "same", department: "service" },
    ],
    settings: { allocationMethod: "equal" },
  }), /personel kimliği/i);
});

test("geçersiz ay veya departman taşıyan hedef satırı sessizce dağıtıma girmez", () => {
  assert.throws(() => calculateDepartmentDistribution({
    targetRows: [target("service", 13, 100)],
    employees,
    settings: { allocationMethod: "equal" },
  }), /hedef ayı/i);

  assert.throws(() => calculateDepartmentDistribution({
    targetRows: [target("review", 1, 100)],
    employees,
    settings: { allocationMethod: "equal" },
  }), /hedef departmanı/i);
});

test("nihai satırdan hedefe ve dağıtıma akış hedef altını sıfır tutup departmanları ayırır", () => {
  const policySettings = {
    departmentGrowthTargets: { service: 10, parts: 10 },
    departmentStretchThresholds: { service: 5, parts: 5 },
    rates: { conservative: 3, growth: 8 },
    reserveRate: 5,
    allocationMethod: "equal",
  };
  const targetRows = buildDepartmentTargets({
    year: 2026,
    previousRows: [
      { department: "service", documentDate: "2025-01-10", netSales: 1_000, cost: 400 },
      { department: "parts", documentDate: "2025-01-10", netSales: 2_000, cost: 1_000 },
    ],
    currentRows: [
      { department: "service", documentDate: "2026-01-10", netSales: 1_099, cost: 400 },
      { department: "parts", documentDate: "2026-01-10", netSales: 2_310, cost: 1_000 },
    ],
    settings: policySettings,
  });
  const result = calculateDepartmentDistribution({
    targetRows,
    employees: [
      { id: "service", department: "service", included: true, status: "employee" },
      { id: "parts", department: "parts", included: true, status: "employee" },
      { id: "departed", department: "parts", included: true, status: "departed" },
    ],
    settings: policySettings,
  });

  const serviceTarget = targetRows.find((item) => (
    item.department === "service" && item.month === 1
  ));
  const partsTarget = targetRows.find((item) => (
    item.department === "parts" && item.month === 1
  ));
  assert.equal(serviceTarget.band, "none");
  assert.equal(serviceTarget.pool, 0);
  assert.equal(partsTarget.band, "growth");
  assert.equal(result.employees.find((item) => item.id === "service").projectedShare, 0);
  assert.equal(
    result.employees.find((item) => item.id === "parts").projectedShare,
    partsTarget.pool,
  );
  assert.equal(result.employees.find((item) => item.id === "departed").projectedShare, 0);
  assert.equal(result.difference, 0);
});

test("üç parametreli sayısal havuz çağrısı mevcut ekran alanlarını ve havuzu korur", () => {
  const legacySettings = {
    allocationMethod: "equal",
    companyWeight: 60,
    teamWeight: 40,
    companyPerformanceScore: 100,
    departmentPerformanceScores: {
      "Atölye Teknik": 100,
      "Ofis": 100,
    },
    minimumGoalScore: 80,
    maximumMultiplier: 120,
  };
  const result = calculateEmployeeDistribution([
    {
      id: "workshop",
      department: "Atölye Teknik",
      included: true,
      status: "employee",
    },
    {
      id: "office",
      department: "Ofis",
      included: true,
      status: "employee",
    },
  ], legacySettings, 100);

  assert.equal(result.reduce((sum, employee) => sum + employee.projectedShare, 0), 100);
  assert.deepEqual(
    result.map((employee) => employee.department),
    ["Atölye Teknik", "Ofis"],
  );
  for (const employee of result) {
    assert.equal(employee.projectedShare, 50);
    assert.equal(employee.departmentScore, 100);
    assert.equal(employee.weightedScore, 100);
    assert.equal(employee.performanceMultiplier, 1);
    assert.equal(employee.eligible, true);
  }
});

test("beş parametreli Goals çağrısı skor geçersiz kılmalarını korur", () => {
  const result = calculateEmployeeDistribution([
    {
      id: "workshop",
      department: "Atölye Teknik",
      included: true,
      status: "employee",
      salaryCoefficient: 1,
    },
    {
      id: "office",
      department: "Ofis",
      included: true,
      status: "employee",
      salaryCoefficient: 1,
    },
  ], {
    allocationMethod: "coefficient",
    companyWeight: 60,
    teamWeight: 40,
    companyPerformanceScore: 100,
    departmentPerformanceScores: {},
    minimumGoalScore: 0,
    maximumMultiplier: 120,
  }, 100, 80, {
    "Atölye Teknik": 120,
    "Ofis": 80,
  });

  const workshop = result.find((employee) => employee.id === "workshop");
  const office = result.find((employee) => employee.id === "office");
  assert.equal(workshop.departmentScore, 120);
  assert.equal(workshop.weightedScore, 96);
  assert.equal(office.departmentScore, 80);
  assert.equal(office.weightedScore, 80);
  assert.equal(workshop.projectedShare > office.projectedShare, true);
  assert.equal(result.reduce((sum, employee) => sum + employee.projectedShare, 0), 100);
});

test("hedef satırı adaptör çağrısı yeni departman politikasını kullanır", () => {
  const result = calculateEmployeeDistribution([
    {
      id: "service",
      department: "service",
      included: true,
      status: "employee",
    },
    {
      id: "parts",
      department: "parts",
      included: true,
      status: "employee",
    },
  ], {
    allocationMethod: "equal",
  }, [
    target("service", 1, 30),
    target("parts", 1, 70),
  ]);

  assert.deepEqual(
    result.map((employee) => [employee.id, employee.projectedShare]),
    [["service", 30], ["parts", 70]],
  );
  assert.equal(Object.hasOwn(result[0], "weightedScore"), false);
});

test("katsayı modunda pozitif ağırlık yoksa havuz incelemeye açık kalır", () => {
  const result = calculateDepartmentDistribution({
    targetRows: [target("service", 1, 10)],
    employees: [
      {
        id: "zero",
        department: "service",
        salaryCoefficient: 0,
      },
      {
        id: "negative",
        department: "service",
        salaryCoefficient: -1,
      },
    ],
    settings: { allocationMethod: "coefficient" },
  });

  assert.deepEqual(
    result.employees.map((employee) => employee.projectedShare),
    [0, 0],
  );
  assert.equal(result.allocatedPool, 0);
  assert.equal(result.unallocatedPool, 10);
  assert.equal(result.reviewRequired, true);
  assert.equal(
    result.departments.find((item) => item.department === "service").allocationStatus,
    "review-required",
  );
});

test("normalize edilmiş CPM kimliği iki departmandan çift pay alamaz", () => {
  assert.throws(() => calculateDepartmentDistribution({
    targetRows: [
      target("service", 1, 50),
      target("parts", 1, 50),
    ],
    employees: [
      { id: "FURKAN", department: "service" },
      { id: " furkan ", department: "parts" },
    ],
    settings: { allocationMethod: "equal" },
  }), /personel kimliği/i);

  assert.throws(() => calculateDepartmentDistribution({
    targetRows: [target("service", 1, 50)],
    employees: [
      { id: "TSEMİZ", department: "service" },
      { id: "tsemiz", department: "service" },
    ],
    settings: { allocationMethod: "equal" },
  }), /personel kimliği/i);

  assert.throws(() => calculateDepartmentDistribution({
    targetRows: [
      target("service", 1, 50),
      target("parts", 1, 50),
    ],
    employees: [
      { id: "pilot-1", code: "FURKAN", department: "service" },
      { id: "pilot-2", code: " furkan ", department: "parts" },
    ],
    settings: { allocationMethod: "equal" },
  }), /personel kimliği/i);
});

test("inaktif veya active false personel sıfır pay alır", () => {
  const result = calculateDepartmentDistribution({
    targetRows: [target("service", 1, 100)],
    employees: [
      {
        id: "inactive-status",
        department: "service",
        status: "inactive",
      },
      {
        id: "inactive-flag",
        department: "service",
        status: "employee",
        active: false,
      },
      {
        id: "active",
        department: "service",
        status: "employee",
        active: true,
      },
    ],
    settings: { allocationMethod: "equal" },
  });

  assert.deepEqual(
    result.employees.map((employee) => employee.projectedShare),
    [0, 0, 100],
  );
});

test("dağıtım sınırı bozuk ayar ve personel alanlarını reddeder", () => {
  assert.throws(() => calculateDepartmentDistribution({
    targetRows: [target("service", 1, 100)],
    employees,
    settings: "coefficient",
  }), /ayarları nesne/i);

  assert.throws(() => calculateDepartmentDistribution({
    targetRows: [target("service", 1, 100)],
    employees: [{ id: "fixed", department: "service", fixedShareRate: 100.01 }],
    settings: { allocationMethod: "equal" },
  }), /sabit pay/i);

  assert.throws(() => calculateDepartmentDistribution({
    targetRows: [target("service", 1, 100)],
    employees: [{ id: "coefficient", department: "service", salaryCoefficient: Infinity }],
    settings: { allocationMethod: "coefficient" },
  }), /katsayı/i);

  assert.throws(() => calculateDepartmentDistribution({
    targetRows: [target("service", 1, 100)],
    employees: [{ id: "null-coefficient", department: "service", salaryCoefficient: null }],
    settings: { allocationMethod: "coefficient" },
  }), /katsayı/i);

  assert.throws(() => calculateDepartmentDistribution({
    targetRows: [target("service", 1, 100)],
    employees: [{ id: "null-fixed", department: "service", fixedShareRate: null }],
    settings: { allocationMethod: "equal" },
  }), /sabit pay/i);

  assert.throws(() => calculateDepartmentDistribution({
    targetRows: [target("service", 1, 100)],
    employees: [{ id: "status", department: "service", status: "unknown" }],
    settings: { allocationMethod: "equal" },
  }), /personel durumu/i);

  assert.throws(() => calculateDepartmentDistribution({
    targetRows: [target("service", 1, 100)],
    employees: [{ id: "included", department: "service", included: "false" }],
    settings: { allocationMethod: "equal" },
  }), /dahil/i);

  assert.throws(() => calculateDepartmentDistribution({
    targetRows: [target("service", 1, 100)],
    employees: [{ id: "department", department: "other" }],
    settings: { allocationMethod: "equal" },
  }), /personel departmanı/i);
});

test("dağıtımın finansal havuz katsayı ve sabit pay alanları boolean değerleri reddeder", () => {
  for (const value of [true, false]) {
    assert.throws(() => calculateDepartmentDistribution({
      targetRows: [target("service", 1, value)],
      employees,
      settings: { allocationMethod: "equal" },
    }), /havuzu/i);

    assert.throws(() => calculateDepartmentDistribution({
      targetRows: [target("service", 1, 100)],
      employees: [{
        id: "coefficient",
        department: "service",
        salaryCoefficient: value,
      }],
      settings: { allocationMethod: "coefficient" },
    }), /katsayı/i);

    assert.throws(() => calculateDepartmentDistribution({
      targetRows: [target("service", 1, 100)],
      employees: [{
        id: "fixed",
        department: "service",
        fixedShareRate: value,
      }],
      settings: { allocationMethod: "equal" },
    }), /sabit pay/i);
  }
});

test("dağıtım finansal doğrulayıcıları boxed ve coercible değerleri reddeder", () => {
  const coercibleValues = [
    new Boolean(true),
    new Number(10),
    "10",
    { valueOf: () => 10 },
  ];

  for (const value of coercibleValues) {
    assert.throws(() => calculateDepartmentDistribution({
      targetRows: [target("service", 1, value)],
      employees,
      settings: { allocationMethod: "equal" },
    }), /havuzu/i);

    assert.throws(() => calculateDepartmentDistribution({
      targetRows: [target("service", 1, 100)],
      employees: [{
        id: "coefficient",
        department: "service",
        salaryCoefficient: value,
      }],
      settings: { allocationMethod: "coefficient" },
    }), /katsayı/i);

    assert.throws(() => calculateDepartmentDistribution({
      targetRows: [target("service", 1, 100)],
      employees: [{
        id: "fixed",
        department: "service",
        fixedShareRate: value,
      }],
      settings: { allocationMethod: "equal" },
    }), /sabit pay/i);

    assert.throws(() => calculateEmployeeDistribution(
      employees,
      { allocationMethod: "equal" },
      value,
    ), /havuzu/i);
  }
});

test("hedef satırı ayı boolean boxed veya numeric string olarak kabul edilmez", () => {
  for (const month of [true, false, new Number(1), "1"]) {
    assert.throws(() => calculateDepartmentDistribution({
      targetRows: [target("service", month, 100)],
      employees,
      settings: { allocationMethod: "equal" },
    }), /ayı/i);
  }
});

test("legacy sayısal havuz adaptörünün finansal ayarları boolean değerleri reddeder", () => {
  const baseSettings = {
    allocationMethod: "coefficient",
    companyWeight: 60,
    teamWeight: 40,
    companyPerformanceScore: 100,
    departmentPerformanceScores: { service: 100 },
    minimumGoalScore: 0,
    maximumMultiplier: 120,
  };

  for (const value of [true, false]) {
    const settingCases = [
      { ...baseSettings, companyWeight: value },
      { ...baseSettings, teamWeight: value },
      { ...baseSettings, companyPerformanceScore: value },
      { ...baseSettings, departmentPerformanceScores: { service: value } },
      { ...baseSettings, minimumGoalScore: value },
      { ...baseSettings, maximumMultiplier: value },
    ];

    for (const invalidSettings of settingCases) {
      assert.throws(() => calculateEmployeeDistribution(
        employees,
        invalidSettings,
        100,
      ), /sayı|ağırlığı|skoru|çarpanı/i);
    }

    assert.throws(() => calculateEmployeeDistribution(
      employees,
      baseSettings,
      value,
    ), /havuzu/i);

    assert.throws(() => calculateEmployeeDistribution(
      employees,
      baseSettings,
      100,
      value,
      { service: 100 },
    ), /skoru/i);
  }
});

test("legacy finansal varsayılanlar missing ve undefined alanlarda korunur", () => {
  const missing = calculateEmployeeDistribution(
    [{ id: "service", department: "service" }],
    {},
    100,
  );
  const explicitUndefined = calculateEmployeeDistribution(
    [{
      id: "service",
      department: "service",
      salaryCoefficient: undefined,
      fixedShareRate: undefined,
    }],
    {
      allocationMethod: undefined,
      companyWeight: undefined,
      teamWeight: undefined,
      companyPerformanceScore: undefined,
      departmentPerformanceScores: undefined,
      minimumGoalScore: undefined,
      maximumMultiplier: undefined,
    },
    100,
    undefined,
    undefined,
  );

  assert.equal(missing[0].projectedShare, 100);
  assert.equal(explicitUndefined[0].projectedShare, 100);
  assert.equal(explicitUndefined[0].weightedScore, missing[0].weightedScore);

  const absentPool = calculateDepartmentDistribution({
    targetRows: [{ department: "service", month: 1 }],
    employees: [{ id: "service", department: "service" }],
    settings: {},
  });
  const undefinedPool = calculateDepartmentDistribution({
    targetRows: [{ department: "service", month: 1, pool: undefined }],
    employees: [{ id: "service", department: "service" }],
    settings: { allocationMethod: undefined },
  });
  assert.equal(absentPool.totalPool, 0);
  assert.equal(undefinedPool.totalPool, 0);
});

test("legacy defaultlu finansal alanlarda açık null reddedilir", () => {
  const baseSettings = {
    allocationMethod: "coefficient",
    companyWeight: 60,
    teamWeight: 40,
    companyPerformanceScore: 100,
    departmentPerformanceScores: { service: 100 },
    minimumGoalScore: 0,
    maximumMultiplier: 120,
  };
  const invalidSettings = [
    { ...baseSettings, companyWeight: null },
    { ...baseSettings, teamWeight: null },
    { ...baseSettings, companyPerformanceScore: null },
    { ...baseSettings, departmentPerformanceScores: null },
    { ...baseSettings, departmentPerformanceScores: { service: null } },
    { ...baseSettings, minimumGoalScore: null },
    { ...baseSettings, maximumMultiplier: null },
  ];

  for (const settingsValue of invalidSettings) {
    assert.throws(() => calculateEmployeeDistribution(
      [{ id: "service", department: "service" }],
      settingsValue,
      100,
    ), /sayı|nesne/i);
  }

  assert.throws(() => calculateEmployeeDistribution(
    [{ id: "service", department: "service" }],
    baseSettings,
    100,
    null,
    { service: 100 },
  ), /sayı/i);

  assert.throws(() => calculateEmployeeDistribution(
    [{ id: "service", department: "service" }],
    baseSettings,
    100,
    undefined,
    null,
  ), /nesne/i);

  assert.throws(() => calculateDepartmentDistribution({
    targetRows: [{ department: "service", month: 1, pool: null }],
    employees: [{ id: "service", department: "service" }],
    settings: {},
  }), /havuzu/i);
});

test("legacy finansal alanlar array ve nesne coercion girişlerini reddeder", () => {
  for (const invalid of [[], {}, new Number(10)]) {
    assert.throws(() => calculateEmployeeDistribution(
      [{ id: "service", department: "service" }],
      { companyWeight: invalid },
      100,
    ), /ağırlığı/i);

    assert.throws(() => calculateDepartmentDistribution({
      targetRows: [{ department: "service", month: 1, pool: 100 }],
      employees: [{
        id: "service",
        department: "service",
        salaryCoefficient: invalid,
      }],
      settings: {},
    }), /katsayı/i);
  }

  for (const invalid of [null, [], new Number(10)]) {
    assert.throws(() => calculateEmployeeDistribution(
      [{ id: "service", department: "service" }],
      { departmentPerformanceScores: invalid },
      100,
    ), /nesne/i);
  }
});
