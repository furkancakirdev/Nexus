const DEPARTMENTS = Object.freeze(["service", "parts"]);

function plainRecord(value, fieldName) {
  const prototype = value !== null && typeof value === "object"
    ? Object.getPrototypeOf(value)
    : null;
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || (prototype !== Object.prototype && prototype !== null)
  ) {
    throw new TypeError(`${fieldName} nesne olmalı.`);
  }
  return value;
}

function poolCents(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError("Departman havuzu sonlu sayı olmalı.");
  }
  if (value < 0) throw new RangeError("Departman havuzu negatif olamaz.");
  return Math.round(value * 100);
}

function money(cents) {
  return Number((cents / 100).toFixed(2));
}

/**
 * Hedef API satırlarını aylık, departman ve yıllık havuz görünümüne çevirir.
 *
 * @param {object[]} rows
 */
export function buildDepartmentTargetView(rows) {
  if (!Array.isArray(rows)) throw new TypeError("Hedef satırları dizi olmalı.");
  const normalizedRows = [];
  const monthlyCents = new Map();
  const departmentCents = new Map(DEPARTMENTS.map((department) => [
    department,
    0,
  ]));

  for (const rawRow of rows) {
    const row = plainRecord(rawRow, "Hedef satırı");
    const department = String(row.department ?? "").trim();
    if (!DEPARTMENTS.includes(department)) {
      throw new RangeError("Hedef departmanı service veya parts olmalı.");
    }
    if (!Number.isInteger(row.month) || row.month < 1 || row.month > 12) {
      throw new RangeError("Hedef ayı 1 ile 12 arasında olmalı.");
    }
    const cents = poolCents(row.pool);
    monthlyCents.set(row.month, (monthlyCents.get(row.month) || 0) + cents);
    departmentCents.set(
      department,
      departmentCents.get(department) + cents,
    );
    normalizedRows.push({ ...row });
  }

  const monthlyPools = new Map(
    [...monthlyCents.entries()].map(([month, cents]) => [month, money(cents)]),
  );
  const departmentPools = Object.fromEntries(
    [...departmentCents.entries()].map(([department, cents]) => [
      department,
      money(cents),
    ]),
  );
  const totalCents = [...departmentCents.values()].reduce(
    (sum, cents) => sum + cents,
    0,
  );

  return {
    rows: normalizedRows,
    monthlyPools,
    departmentPools,
    totalPool: money(totalCents),
  };
}

/**
 * Ekonomik aylara otomatik departman hedef havuzlarını ekler.
 *
 * @param {object[]} rows
 * @param {object[]} targetRows
 */
export function mergeMonthlyTargetPools(rows, targetRows) {
  if (!Array.isArray(rows)) throw new TypeError("Ekonomik aylar dizi olmalı.");
  const view = buildDepartmentTargetView(targetRows);
  return rows.map((row) => ({
    ...plainRecord(row, "Ekonomik ay"),
    contribution: view.monthlyPools.get(row.month) || 0,
  }));
}
