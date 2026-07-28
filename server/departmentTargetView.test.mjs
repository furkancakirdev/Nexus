import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDepartmentTargetView,
  mergeMonthlyTargetPools,
} from "../shared/departmentTargetView.mjs";

const rows = [
  {
    year: 2026,
    department: "service",
    departmentName: "Servis",
    month: 1,
    monthName: "Ocak",
    pool: 100.1,
  },
  {
    year: 2026,
    department: "parts",
    departmentName: "Yedek Parça Satış",
    month: 1,
    monthName: "Ocak",
    pool: 200.2,
  },
  {
    year: 2026,
    department: "service",
    departmentName: "Servis",
    month: 2,
    monthName: "Şubat",
    pool: 50.05,
  },
];

test("iki departmanın aylık ve yıllık havuzunu kuruşla uzlaştırır", () => {
  const view = buildDepartmentTargetView(rows);

  assert.equal(view.totalPool, 350.35);
  assert.deepEqual(view.departmentPools, {
    service: 150.15,
    parts: 200.2,
  });
  assert.equal(view.monthlyPools.get(1), 300.3);
  assert.equal(view.monthlyPools.get(2), 50.05);
});

test("aylık ekonomik satırlara otomatik hedef havuzu katkısını taşır", () => {
  const result = mergeMonthlyTargetPools([
    { month: 1, monthName: "Ocak", contribution: 999 },
    { month: 2, monthName: "Şubat" },
    { month: 3, monthName: "Mart" },
  ], rows);

  assert.equal(result[0].contribution, 300.3);
  assert.equal(result[1].contribution, 50.05);
  assert.equal(result[2].contribution, 0);
});

test("hedef satırı sözleşmesindeki bozuk finansal ve kimlik alanlarını reddeder", () => {
  for (const invalidRows of [
    null,
    [{ department: "other", month: 1, pool: 10 }],
    [{ department: "service", month: 0, pool: 10 }],
    [{ department: "service", month: 1, pool: -1 }],
    [{ department: "service", month: 1, pool: "10" }],
    [{ department: "service", month: 1, pool: null }],
  ]) {
    assert.throws(
      () => buildDepartmentTargetView(invalidRows),
      /hedef|departman|ay|havuz|dizi/i,
    );
  }
});

test("hedef satırlarını değiştirmeden yeni görünüm üretir", () => {
  const input = rows.map((row) => ({ ...row }));
  const before = structuredClone(input);

  const view = buildDepartmentTargetView(input);
  view.rows[0].pool = 999;

  assert.deepEqual(input, before);
});
