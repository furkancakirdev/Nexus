import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateDepartmentDistribution,
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
