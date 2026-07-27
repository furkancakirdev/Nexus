import { normalizeDepartmentId } from "../shared/targetPolicy.mjs";

function toCents(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new TypeError("Dağıtım tutarı sonlu sayı olmalı.");
  return Math.round((parsed + Number.EPSILON) * 100);
}

function fromCents(value) {
  return value / 100;
}

function allocateCents(totalCents, recipients) {
  if (!recipients.length || totalCents <= 0) return new Map();
  let weights = recipients.map((recipient) => Math.max(0, Number(recipient.weight) || 0));
  if (!weights.some((weight) => weight > 0)) weights = recipients.map(() => 1);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const allocations = recipients.map((recipient, index) => {
    const exact = totalCents * weights[index] / totalWeight;
    const cents = Math.floor(exact);
    return { id: recipient.id, cents, remainder: exact - cents, index };
  });
  let remaining = totalCents - allocations.reduce((sum, item) => sum + item.cents, 0);
  const order = allocations
    .slice()
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (let index = 0; index < remaining; index += 1) {
    order[index % order.length].cents += 1;
  }
  return new Map(allocations.map((item) => [item.id, item.cents]));
}

function employeeKey(employee, index) {
  return String(employee.id ?? employee.code ?? `${employee.name || "personel"}-${index}`);
}

export function normalizeEmployee(employee, index = 0) {
  if (!employee || typeof employee !== "object" || Array.isArray(employee)) {
    throw new TypeError("Personel kaydı nesne olmalı.");
  }
  return {
    included: true,
    fixedShareRate: 0,
    salaryCoefficient: 1,
    tenure: 0,
    status: "employee",
    approvalStatus: "Yönetici Onayı",
    ...employee,
    id: employeeKey(employee, index),
    department: normalizeDepartmentId(employee.department),
  };
}

/**
 * @typedef {Object} DepartmentDistribution
 * @property {Array<Object>} employees
 * @property {Array<Object>} departments
 * @property {number} totalPool
 * @property {number} allocatedPool
 * @property {number} unallocatedPool
 * @property {number} difference
 */

/**
 * Aylık departman havuzlarını yalnız aynı departmandaki uygun personele dağıtır.
 *
 * @param {Object} input
 * @param {Array<Object>} input.targetRows
 * @param {Array<Object>} input.employees
 * @param {Object} input.settings
 * @returns {DepartmentDistribution}
 */
export function calculateDepartmentDistribution({
  targetRows,
  employees,
  settings = {},
}) {
  if (!Array.isArray(targetRows)) throw new TypeError("Hedef satırları dizi olmalı.");
  if (!Array.isArray(employees)) throw new TypeError("Personel kayıtları dizi olmalı.");
  const allocationMethod = settings.allocationMethod ?? "coefficient";
  if (!["equal", "coefficient"].includes(allocationMethod)) {
    throw new RangeError("Dağıtım yöntemi eşit veya katsayı olmalı.");
  }
  const calculated = employees.map(normalizeEmployee).map((employee) => {
    const fixedShareRate = Number(employee.fixedShareRate || 0);
    if (!Number.isFinite(fixedShareRate) || fixedShareRate < 0 || fixedShareRate > 100) {
      throw new RangeError("Personel sabit pay oranı yüzde 0 ile 100 arasında olmalı.");
    }
    const eligible = Boolean(
      employee.department
      && employee.included !== false
      && employee.status !== "departed",
    );
    return {
      ...employee,
      fixedShareRate: eligible ? fixedShareRate : 0,
      eligible,
      allocationWeight: eligible
        ? allocationMethod === "equal"
          ? 1
          : Math.max(0, Number(employee.salaryCoefficient) || 0)
        : 0,
      projectedShare: 0,
      shareMode: fixedShareRate > 0
        ? "Sabit"
        : allocationMethod === "equal"
          ? "Eşit"
      : "Katsayı ağırlıklı",
    };
  });
  const employeeIds = new Set();
  for (const employee of calculated) {
    if (employeeIds.has(employee.id)) {
      throw new RangeError(`Yinelenen personel kimliği: ${employee.id}`);
    }
    employeeIds.add(employee.id);
  }

  const pools = new Map([["service", 0], ["parts", 0]]);
  for (const row of targetRows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new TypeError("Hedef satırı nesne olmalı.");
    }
    const department = normalizeDepartmentId(row?.department);
    if (!department) throw new RangeError("Hedef departmanı Servis veya Yedek Parça Satış olmalı.");
    const month = Number(row.month);
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new RangeError("Hedef ayı 1 ile 12 arasında tam sayı olmalı.");
    }
    const poolCents = toCents(row?.pool ?? 0);
    if (poolCents < 0) throw new RangeError("Departman havuzu negatif olamaz.");
    pools.set(
      department,
      pools.get(department) + poolCents,
    );
  }

  const shareCents = new Map(calculated.map((employee) => [employee.id, 0]));
  const departments = [];
  for (const department of ["service", "parts"]) {
    const poolCents = pools.get(department);
    const eligible = calculated.filter((employee) => (
      employee.department === department && employee.eligible
    ));
    const fixedRate = eligible.reduce(
      (sum, employee) => sum + employee.fixedShareRate,
      0,
    );
    if (fixedRate > 100 + Number.EPSILON) {
      throw new RangeError(`${department} departmanı sabit pay toplamı yüzde 100'ü aşamaz.`);
    }
    const fixed = eligible.filter((item) => item.fixedShareRate > 0);
    let fixedCents = 0;
    if (fixedRate >= 100 - Number.EPSILON) {
      const fixedShares = allocateCents(
        poolCents,
        fixed.map((employee) => ({
          id: employee.id,
          weight: employee.fixedShareRate,
        })),
      );
      for (const employee of fixed) {
        const cents = fixedShares.get(employee.id) || 0;
        shareCents.set(employee.id, cents);
        fixedCents += cents;
      }
    } else {
      for (const employee of fixed) {
        const cents = Math.floor(poolCents * employee.fixedShareRate / 100);
        shareCents.set(employee.id, cents);
        fixedCents += cents;
      }
    }
    const remainingCents = Math.max(0, poolCents - fixedCents);
    const automatic = fixedRate >= 100 - Number.EPSILON
      ? []
      : eligible.filter((employee) => employee.fixedShareRate === 0);
    const automaticShares = allocateCents(
      remainingCents,
      automatic.map((employee) => ({
        id: employee.id,
        weight: employee.allocationWeight,
      })),
    );
    for (const employee of automatic) {
      shareCents.set(
        employee.id,
        (shareCents.get(employee.id) || 0) + (automaticShares.get(employee.id) || 0),
      );
    }
    const allocatedCents = eligible.reduce(
      (sum, employee) => sum + (shareCents.get(employee.id) || 0),
      0,
    );
    departments.push({
      department,
      departmentName: department === "service" ? "Servis" : "Yedek Parça Satış",
      pool: fromCents(poolCents),
      allocatedPool: fromCents(allocatedCents),
      unallocatedPool: fromCents(poolCents - allocatedCents),
      difference: fromCents(poolCents - allocatedCents),
      eligibleEmployeeCount: eligible.length,
    });
  }

  const distributedEmployees = calculated.map((employee) => ({
    ...employee,
    projectedShare: fromCents(shareCents.get(employee.id) || 0),
  }));
  const totalPoolCents = departments.reduce(
    (sum, department) => sum + toCents(department.pool),
    0,
  );
  const allocatedCents = departments.reduce(
    (sum, department) => sum + toCents(department.allocatedPool),
    0,
  );
  return {
    employees: distributedEmployees,
    departments,
    totalPool: fromCents(totalPoolCents),
    allocatedPool: fromCents(allocatedCents),
    unallocatedPool: fromCents(totalPoolCents - allocatedCents),
    difference: fromCents(totalPoolCents - allocatedCents),
  };
}

/**
 * Eski ekran sözleşmesini Task 6 geçişine kadar puansız biçimde korur.
 */
export function calculateEmployeeDistribution(employees, settings, targetRows) {
  return calculateDepartmentDistribution({
    targetRows: Array.isArray(targetRows) ? targetRows : [],
    employees,
    settings,
  }).employees;
}
