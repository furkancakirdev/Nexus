import { normalizeDepartmentId } from "../shared/targetPolicy.mjs";

const EMPLOYEE_STATUSES = new Set([
  "employee", "manager", "departed", "inactive",
]);
const PERCENT_TOLERANCE = 1e-9;

/**
 * @typedef {"service"|"parts"} DepartmentId
 */

/**
 * @typedef {"employee"|"manager"|"departed"|"inactive"} EmployeeStatus
 */

/**
 * @typedef {Object} DistributionEmployeeInput
 * @property {string|number} [id]
 * @property {string|number} [code]
 * @property {string} [name]
 * @property {string} department
 * @property {number} [salaryCoefficient]
 * @property {number} [fixedShareRate]
 * @property {boolean} [included]
 * @property {boolean} [active]
 * @property {EmployeeStatus} [status]
 * @property {string} [approvalStatus]
 */

/**
 * @typedef {Object} NormalizedDistributionEmployee
 * @property {string} id
 * @property {string} identityKey
 * @property {string} sourceDepartment
 * @property {DepartmentId} department
 * @property {number} salaryCoefficient
 * @property {number} fixedShareRate
 * @property {boolean} included
 * @property {boolean} active
 * @property {EmployeeStatus} status
 */

/**
 * @typedef {Object} DepartmentPoolRow
 * @property {DepartmentId|string} department
 * @property {number} month
 * @property {number} pool
 */

/**
 * @typedef {Object} DistributionSettings
 * @property {"equal"|"coefficient"} [allocationMethod]
 */

/**
 * @typedef {DistributionSettings & Object} LegacyDistributionSettings
 * @property {number} [companyWeight]
 * @property {number} [teamWeight]
 * @property {number} [companyPerformanceScore]
 * @property {Object<string, number>} [departmentPerformanceScores]
 * @property {number} [minimumGoalScore]
 * @property {number} [maximumMultiplier]
 */

/**
 * @typedef {Object} DistributedEmployee
 * @property {string} id
 * @property {DepartmentId|string} department
 * @property {boolean} eligible
 * @property {number} allocationWeight
 * @property {number} fixedShareRate
 * @property {number} projectedShare
 * @property {string} shareMode
 */

/**
 * @typedef {Object} DepartmentAllocationSummary
 * @property {DepartmentId} department
 * @property {string} departmentName
 * @property {number} pool
 * @property {number} allocatedPool
 * @property {number} unallocatedPool
 * @property {number} difference
 * @property {number} eligibleEmployeeCount
 * @property {"allocated"|"review-required"} allocationStatus
 */

/**
 * @typedef {Object} DepartmentDistribution
 * @property {DistributedEmployee[]} employees
 * @property {DepartmentAllocationSummary[]} departments
 * @property {number} totalPool
 * @property {number} allocatedPool
 * @property {number} unallocatedPool
 * @property {number} difference
 * @property {boolean} reviewRequired
 */

function plainObject(value, fieldName) {
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

function defaultValue(value, fallback) {
  return value === undefined ? fallback : value;
}

function finiteNumber(value, fieldName) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${fieldName} sonlu sayı olmalı.`);
  }
  return value;
}

function toCents(value, fieldName = "Dağıtım tutarı") {
  return Math.round((finiteNumber(value, fieldName) + Number.EPSILON) * 100);
}

function fromCents(value) {
  return value / 100;
}

function normalizedIdentity(value) {
  return String(value)
    .trim()
    .toLocaleUpperCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

function employeeIdentity(employee) {
  const displayRaw = [employee.id, employee.code, employee.name].find((value) => (
    value !== undefined && value !== null && String(value).trim()
  ));
  const identityRaw = [employee.code, employee.id, employee.name].find((value) => (
    value !== undefined && value !== null && String(value).trim()
  ));
  const display = String(displayRaw ?? "").trim();
  const identityKey = normalizedIdentity(identityRaw ?? "");
  if (!identityKey) {
    throw new TypeError("Personel kimliği id, kod veya ad alanından belirlenmeli.");
  }
  return { display, identityKey };
}

function normalizeDistributionSettings(settings = {}) {
  plainObject(settings, "Dağıtım ayarları");
  const allocationMethod = defaultValue(
    settings.allocationMethod,
    "coefficient",
  );
  if (!["equal", "coefficient"].includes(allocationMethod)) {
    throw new RangeError("Dağıtım yöntemi eşit veya katsayı olmalı.");
  }
  return { allocationMethod };
}

/**
 * Personel girdisini ticari departman ve CPM kimliğiyle doğrular.
 *
 * @param {DistributionEmployeeInput} employee
 * @returns {NormalizedDistributionEmployee}
 */
export function normalizeEmployee(employee) {
  plainObject(employee, "Personel kaydı");
  const identity = employeeIdentity(employee);
  const sourceDepartment = String(employee.department ?? "").trim();
  const department = normalizeDepartmentId(sourceDepartment);
  if (!department) {
    throw new RangeError("Personel departmanı Servis veya Yedek Parça Satış olmalı.");
  }
  const included = employee.included === undefined ? true : employee.included;
  if (typeof included !== "boolean") {
    throw new TypeError("Personelin dağıtıma dahil alanı boolean olmalı.");
  }
  const active = employee.active === undefined ? true : employee.active;
  if (typeof active !== "boolean") {
    throw new TypeError("Personelin active alanı boolean olmalı.");
  }
  const status = employee.status === undefined ? "employee" : employee.status;
  if (!EMPLOYEE_STATUSES.has(status)) {
    throw new RangeError("Personel durumu employee, manager, departed veya inactive olmalı.");
  }
  const salaryCoefficient = finiteNumber(
    employee.salaryCoefficient === undefined ? 1 : employee.salaryCoefficient,
    "Personel katsayısı",
  );
  const fixedShareRate = finiteNumber(
    employee.fixedShareRate === undefined ? 0 : employee.fixedShareRate,
    "Personel sabit pay oranı",
  );
  if (fixedShareRate < 0 || fixedShareRate > 100) {
    throw new RangeError("Personel sabit pay oranı yüzde 0 ile 100 arasında olmalı.");
  }
  return {
    tenure: 0,
    approvalStatus: "Yönetici Onayı",
    ...employee,
    id: identity.display,
    identityKey: identity.identityKey,
    sourceDepartment,
    department,
    included,
    active,
    status,
    salaryCoefficient,
    fixedShareRate,
  };
}

function assertUniqueEmployees(employees) {
  const identities = new Set();
  for (const employee of employees) {
    if (identities.has(employee.identityKey)) {
      throw new RangeError(`Yinelenen personel kimliği: ${employee.id}`);
    }
    identities.add(employee.identityKey);
  }
}

function isEligibleEmployee(employee) {
  return Boolean(
    employee.included
    && employee.active
    && !["departed", "inactive"].includes(employee.status),
  );
}

function allocateCents(totalCents, recipients) {
  if (!recipients.length || totalCents <= 0) return new Map();
  const weights = recipients.map((recipient) => (
    Math.max(0, finiteNumber(recipient.weight, "Dağıtım ağırlığı"))
  ));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) return new Map();
  const allocations = recipients.map((recipient, index) => {
    const exact = totalCents * weights[index] / totalWeight;
    const cents = Math.floor(exact);
    return {
      identityKey: recipient.identityKey,
      cents,
      remainder: exact - cents,
      index,
    };
  });
  const remaining = totalCents - allocations.reduce(
    (sum, item) => sum + item.cents,
    0,
  );
  const order = allocations
    .slice()
    .sort((left, right) => (
      right.remainder - left.remainder || left.index - right.index
    ));
  for (let index = 0; index < remaining; index += 1) {
    order[index % order.length].cents += 1;
  }
  return new Map(allocations.map((item) => [
    item.identityKey,
    item.cents,
  ]));
}

function allocateEmployeePool({
  poolCents,
  eligible,
  shareCents,
  allocationMethod,
  scopeName,
}) {
  const fixedRate = eligible.reduce(
    (sum, employee) => sum + employee.fixedShareRate,
    0,
  );
  if (fixedRate > 100 + PERCENT_TOLERANCE) {
    throw new RangeError(`${scopeName} sabit pay toplamı yüzde 100'ü aşamaz.`);
  }
  const fixed = eligible.filter((employee) => employee.fixedShareRate > 0);
  let fixedCents = 0;
  if (fixedRate >= 100 - PERCENT_TOLERANCE) {
    const fixedShares = allocateCents(
      poolCents,
      fixed.map((employee) => ({
        identityKey: employee.identityKey,
        weight: employee.fixedShareRate,
      })),
    );
    for (const employee of fixed) {
      const cents = fixedShares.get(employee.identityKey) || 0;
      shareCents.set(employee.identityKey, cents);
      fixedCents += cents;
    }
  } else {
    for (const employee of fixed) {
      const cents = Math.floor(poolCents * employee.fixedShareRate / 100);
      shareCents.set(employee.identityKey, cents);
      fixedCents += cents;
    }
  }

  const remainingCents = Math.max(0, poolCents - fixedCents);
  const automatic = fixedRate >= 100 - PERCENT_TOLERANCE
    ? []
    : eligible.filter((employee) => employee.fixedShareRate === 0);
  const automaticShares = allocateCents(
    remainingCents,
    automatic.map((employee) => ({
      identityKey: employee.identityKey,
      weight: allocationMethod === "equal"
        ? 1
        : Math.max(0, employee.allocationWeight),
    })),
  );
  for (const employee of automatic) {
    shareCents.set(
      employee.identityKey,
      (shareCents.get(employee.identityKey) || 0)
        + (automaticShares.get(employee.identityKey) || 0),
    );
  }
  return eligible.reduce(
    (sum, employee) => sum + (shareCents.get(employee.identityKey) || 0),
    0,
  );
}

function publicEmployee(employee, projectedShare, department) {
  const { identityKey, sourceDepartment, ...visible } = employee;
  return {
    ...visible,
    department,
    projectedShare,
  };
}

/**
 * @typedef {Object} DepartmentDistributionInput
 * @property {DepartmentPoolRow[]} targetRows
 * @property {DistributionEmployeeInput[]} employees
 * @property {DistributionSettings} settings
 */

/**
 * Aylık departman havuzlarını yalnız aynı departmandaki uygun personele dağıtır.
 *
 * @param {DepartmentDistributionInput} input
 * @returns {DepartmentDistribution}
 */
export function calculateDepartmentDistribution({
  targetRows,
  employees,
  settings = {},
}) {
  if (!Array.isArray(targetRows)) throw new TypeError("Hedef satırları dizi olmalı.");
  if (!Array.isArray(employees)) throw new TypeError("Personel kayıtları dizi olmalı.");
  const { allocationMethod } = normalizeDistributionSettings(settings);
  const normalizedEmployees = employees.map(normalizeEmployee);
  assertUniqueEmployees(normalizedEmployees);
  const calculated = normalizedEmployees.map((employee) => {
    const eligible = isEligibleEmployee(employee);
    return {
      ...employee,
      fixedShareRate: eligible ? employee.fixedShareRate : 0,
      eligible,
      allocationWeight: eligible
        ? allocationMethod === "equal"
          ? 1
          : Math.max(0, employee.salaryCoefficient)
        : 0,
      projectedShare: 0,
      shareMode: employee.fixedShareRate > 0
        ? "Sabit"
        : allocationMethod === "equal"
          ? "Eşit"
          : "Katsayı ağırlıklı",
    };
  });

  const pools = new Map([["service", 0], ["parts", 0]]);
  for (const row of targetRows) {
    plainObject(row, "Hedef satırı");
    const department = normalizeDepartmentId(row.department);
    if (!department) {
      throw new RangeError("Hedef departmanı Servis veya Yedek Parça Satış olmalı.");
    }
    const month = row.month;
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new RangeError("Hedef ayı 1 ile 12 arasında tam sayı olmalı.");
    }
    const rawPool = finiteNumber(
      row.pool === undefined ? 0 : row.pool,
      "Departman havuzu",
    );
    if (rawPool < 0) throw new RangeError("Departman havuzu negatif olamaz.");
    pools.set(department, pools.get(department) + toCents(rawPool));
  }

  const shareCents = new Map(calculated.map((employee) => [
    employee.identityKey,
    0,
  ]));
  const departments = [];
  for (const department of ["service", "parts"]) {
    const poolCents = pools.get(department);
    const eligible = calculated.filter((employee) => (
      employee.department === department && employee.eligible
    ));
    const allocatedCents = allocateEmployeePool({
      poolCents,
      eligible,
      shareCents,
      allocationMethod,
      scopeName: department,
    });
    const unallocatedCents = poolCents - allocatedCents;
    departments.push({
      department,
      departmentName: department === "service" ? "Servis" : "Yedek Parça Satış",
      pool: fromCents(poolCents),
      allocatedPool: fromCents(allocatedCents),
      unallocatedPool: fromCents(unallocatedCents),
      difference: fromCents(unallocatedCents),
      eligibleEmployeeCount: eligible.length,
      allocationStatus: unallocatedCents > 0
        ? "review-required"
        : "allocated",
    });
  }

  const distributedEmployees = calculated.map((employee) => publicEmployee(
    employee,
    fromCents(shareCents.get(employee.identityKey) || 0),
    employee.department,
  ));
  const totalPoolCents = [...pools.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  const allocatedCents = distributedEmployees.reduce(
    (sum, employee) => sum + toCents(employee.projectedShare),
    0,
  );
  const unallocatedCents = totalPoolCents - allocatedCents;
  return {
    employees: distributedEmployees,
    departments,
    totalPool: fromCents(totalPoolCents),
    allocatedPool: fromCents(allocatedCents),
    unallocatedPool: fromCents(unallocatedCents),
    difference: fromCents(unallocatedCents),
    reviewRequired: unallocatedCents > 0,
  };
}

function legacySettings(
  settings,
  companyScoreOverride,
  departmentScoresOverride,
) {
  settings = settings === undefined ? {} : settings;
  const { allocationMethod } = normalizeDistributionSettings(settings);
  const companyWeight = finiteNumber(
    defaultValue(settings.companyWeight, 60),
    "Şirket hedef ağırlığı",
  );
  const teamWeight = finiteNumber(
    defaultValue(settings.teamWeight, 40),
    "Departman hedef ağırlığı",
  );
  const companyScoreValue = companyScoreOverride === undefined
    ? defaultValue(settings.companyPerformanceScore, 100)
    : companyScoreOverride;
  const companyScore = finiteNumber(
    companyScoreValue,
    "Şirket gerçekleşme skoru",
  );
  const departmentScores = departmentScoresOverride === undefined
    ? defaultValue(settings.departmentPerformanceScores, {})
    : departmentScoresOverride;
  plainObject(departmentScores, "Departman gerçekleşme skorları");
  const minimumGoalScore = finiteNumber(
    defaultValue(settings.minimumGoalScore, 0),
    "Asgari hedef skoru",
  );
  const maximumMultiplier = finiteNumber(
    defaultValue(settings.maximumMultiplier, 100),
    "Azami performans çarpanı",
  );
  if (maximumMultiplier < 0) {
    throw new RangeError("Azami performans çarpanı negatif olamaz.");
  }
  return {
    allocationMethod,
    companyWeight,
    teamWeight,
    companyScore,
    departmentScores,
    minimumGoalScore,
    maximumMultiplier,
  };
}

function calculateLegacyEmployeeDistribution({
  employees,
  settings,
  annualPool,
  companyScore,
  departmentScores,
}) {
  if (!Array.isArray(employees)) throw new TypeError("Personel kayıtları dizi olmalı.");
  const pool = finiteNumber(annualPool, "Yıllık dağıtım havuzu");
  if (pool < 0) throw new RangeError("Yıllık dağıtım havuzu negatif olamaz.");
  const policy = legacySettings(settings, companyScore, departmentScores);
  const normalizedEmployees = employees.map(normalizeEmployee);
  assertUniqueEmployees(normalizedEmployees);
  const calculated = normalizedEmployees.map((employee) => {
    const sourceScore = policy.departmentScores[employee.sourceDepartment];
    const normalizedScore = policy.departmentScores[employee.department];
    const scoreValue = sourceScore !== undefined
      ? sourceScore
      : normalizedScore !== undefined
        ? normalizedScore
        : 100;
    const departmentScore = finiteNumber(
      scoreValue,
      "Departman gerçekleşme skoru",
    );
    const weightedScore = (
      policy.companyScore * policy.companyWeight
      + departmentScore * policy.teamWeight
    ) / 100;
    const eligible = Boolean(
      isEligibleEmployee(employee)
      && employee.approvalStatus !== "Uygun Değil"
      && weightedScore >= policy.minimumGoalScore
    );
    const performanceMultiplier = eligible
      ? Math.min(weightedScore / 100, policy.maximumMultiplier / 100)
      : 0;
    const allocationWeight = eligible
      ? policy.allocationMethod === "equal"
        ? 1
        : Math.max(0, employee.salaryCoefficient * performanceMultiplier)
      : 0;
    return {
      ...employee,
      departmentScore,
      weightedScore,
      eligible,
      performanceMultiplier,
      allocationWeight,
      fixedShareRate: eligible ? employee.fixedShareRate : 0,
      shareMode: employee.fixedShareRate > 0
        ? "Sabit"
        : policy.allocationMethod === "equal"
          ? "Eşit"
          : "Katsayı ağırlıklı",
    };
  });
  const shareCents = new Map(calculated.map((employee) => [
    employee.identityKey,
    0,
  ]));
  allocateEmployeePool({
    poolCents: toCents(pool),
    eligible: calculated.filter((employee) => employee.eligible),
    shareCents,
    allocationMethod: policy.allocationMethod,
    scopeName: "Yıllık havuz",
  });
  return calculated.map((employee) => publicEmployee(
    employee,
    fromCents(shareCents.get(employee.identityKey) || 0),
    employee.sourceDepartment,
  ));
}

/**
 * Task 6 geçişine kadar hem sayısal eski havuzu hem hedef satırı sözleşmesini
 * destekleyen uyumluluk adaptörüdür.
 *
 * @param {DistributionEmployeeInput[]} employees
 * @param {LegacyDistributionSettings} settings
 * @param {number|DepartmentPoolRow[]} annualPoolOrTargetRows
 * @param {number} [companyScore]
 * @param {Object<string, number>} [departmentScores]
 * @returns {DistributedEmployee[]}
 */
export function calculateEmployeeDistribution(
  employees,
  settings,
  annualPoolOrTargetRows,
  companyScore,
  departmentScores,
) {
  if (Array.isArray(annualPoolOrTargetRows)) {
    return calculateDepartmentDistribution({
      targetRows: annualPoolOrTargetRows,
      employees,
      settings,
    }).employees;
  }
  return calculateLegacyEmployeeDistribution({
    employees,
    settings,
    annualPool: annualPoolOrTargetRows,
    companyScore,
    departmentScores,
  });
}
