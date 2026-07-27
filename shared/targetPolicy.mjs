const DEPARTMENTS = Object.freeze([
  { id: "service", name: "Servis" },
  { id: "parts", name: "Yedek Parça Satış" },
]);

const MONTH_NAMES = Object.freeze([
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
]);

/**
 * @typedef {"service"|"parts"} DepartmentId
 */

/**
 * @typedef {Object} TargetPolicySettings
 * @property {number} [reserveRate]
 * @property {{conservative?:number,growth?:number}} [rates]
 * @property {Object<string, number>} [departmentGrowthTargets]
 * @property {Object<string, number>} [departmentStretchThresholds]
 */

/**
 * @typedef {Object} TargetSourceRow
 * @property {DepartmentId|string} department
 * @property {number} [year]
 * @property {number} [month]
 * @property {string|Date} [documentDate]
 * @property {string|Date} [date]
 * @property {number} [netSales]
 * @property {number} [signedNetSales]
 * @property {number} [actual]
 * @property {number|null} [cost]
 * @property {number|null} [lineCost]
 * @property {number} [profit]
 * @property {number} [profitBeforeCoverage]
 * @property {number} [uncoveredNetSales]
 */

/**
 * @typedef {Object} MonthlyDepartmentPool
 * @property {number} eligibleProfit
 * @property {number} appliedRate
 * @property {number} reserveRate
 * @property {number} reserve
 * @property {number} pool
 */

function finiteNumber(value, fieldName) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${fieldName} sonlu bir sayı olmalı.`);
  }
  return value;
}

function percentage(value, fieldName, fallback) {
  const parsed = value === undefined || value === null
    ? fallback
    : finiteNumber(value, fieldName);
  if (parsed < 0 || parsed > 100) {
    throw new RangeError(`${fieldName} yüzde 0 ile 100 arasında olmalı.`);
  }
  return parsed;
}

function roundMoney(value) {
  return Math.round((finiteNumber(value, "Tutar") + Number.EPSILON) * 100) / 100;
}

function moneyToCents(value, fieldName = "Tutar") {
  return Math.round((finiteNumber(value, fieldName) + Number.EPSILON) * 100);
}

function centsToMoney(value) {
  return value / 100;
}

function optionalRecord(value, fieldName) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${fieldName} nesne olmalı.`);
  }
  return value;
}

function normalizedText(value) {
  return String(value || "")
    .trim()
    .toLocaleUpperCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * CPM ve Nexus departman etiketlerini iki ticari departman kimliğine indirger.
 *
 * @param {unknown} value
 * @returns {"service"|"parts"|null}
 */
export function normalizeDepartmentId(value) {
  const normalized = normalizedText(value);
  if (["SERVICE", "SERVIS", "ATOLYE TEKNIK"].includes(normalized)) return "service";
  if ([
    "PARTS", "YEDEK PARCA", "YEDEK PARCA SATIS", "OFIS",
  ].includes(normalized)) return "parts";
  return null;
}

function monthOf(row) {
  const direct = row?.month;
  if (Number.isInteger(direct) && direct >= 1 && direct <= 12) return direct;
  const value = row?.documentDate ?? row?.date;
  if (typeof value === "string" && /^\d{4}-\d{2}/.test(value)) {
    const month = Number(value.slice(5, 7));
    return month >= 1 && month <= 12 ? month : null;
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.getUTCMonth() + 1;
}

function yearOf(row) {
  const direct = row?.year;
  if (Number.isInteger(direct)) return direct;
  const value = row?.documentDate ?? row?.date;
  if (typeof value === "string" && /^\d{4}-\d{2}/.test(value)) {
    return Number(value.slice(0, 4));
  }
  if (value === undefined || value === null || value === "") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.getUTCFullYear() : null;
}

function rowNetSales(row) {
  return finiteNumber(
    row?.netSales ?? row?.signedNetSales ?? row?.actual ?? 0,
    "Nihai net satış",
  );
}

function rowProfitBeforeCoverage(row, netSales) {
  if (row?.profitBeforeCoverage !== undefined) {
    return finiteNumber(row.profitBeforeCoverage, "Kapsam öncesi kâr");
  }
  if (row?.cost !== undefined || row?.lineCost !== undefined) {
    return netSales - finiteNumber(row.cost ?? row.lineCost ?? 0, "Maliyet");
  }
  if (row?.profit !== undefined) {
    return finiteNumber(row.profit, "Kâr")
      + finiteNumber(row.uncoveredNetSales ?? 0, "Kapsamsız net satış");
  }
  return netSales;
}

function rowUncoveredNetSales(row, netSales) {
  if (row?.uncoveredNetSales !== undefined && row?.uncoveredNetSales !== null) {
    return finiteNumber(row.uncoveredNetSales, "Kapsamsız net satış");
  }
  const hasExplicitCost = row?.cost !== undefined && row?.cost !== null;
  const hasLedgerCost = row?.lineCost !== undefined && row?.lineCost !== null;
  return hasExplicitCost || hasLedgerCost ? 0 : netSales;
}

function emptyMetric() {
  return { netSales: 0, profit: 0, uncoveredNetSales: 0 };
}

function aggregateRows(rows, { includeProfit, expectedYear }) {
  if (!Array.isArray(rows)) throw new TypeError("Hedef kaynak satırları dizi olmalı.");
  const metrics = new Map();
  for (const department of DEPARTMENTS) {
    for (let month = 1; month <= 12; month += 1) {
      metrics.set(`${department.id}|${month}`, emptyMetric());
    }
  }
  for (const row of rows) {
    const rowYear = yearOf(row);
    if (rowYear !== null && rowYear !== expectedYear) continue;
    const department = normalizeDepartmentId(row?.department);
    const month = monthOf(row);
    if (!department || !month) continue;
    const metric = metrics.get(`${department}|${month}`);
    const netSales = rowNetSales(row);
    metric.netSales += netSales;
    if (includeProfit) {
      metric.profit += rowProfitBeforeCoverage(row, netSales);
      metric.uncoveredNetSales += rowUncoveredNetSales(row, netSales);
    }
  }
  return metrics;
}

function departmentSetting(map, department, fallback) {
  const values = map;
  const aliases = department === "service"
    ? ["service", "Servis", "Atölye Teknik"]
    : ["parts", "Yedek Parça Satış", "Ofis"];
  for (const alias of aliases) {
    if (values[alias] !== undefined) return values[alias];
  }
  return fallback;
}

function normalizePolicySettings(settings = {}) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    throw new TypeError("Hedef ayarları nesne olmalı.");
  }
  const rates = optionalRecord(settings.rates, "Dağıtım oranları");
  const growthTargets = optionalRecord(
    settings.departmentGrowthTargets,
    "Departman hedef büyüme oranları",
  );
  const stretchThresholds = optionalRecord(
    settings.departmentStretchThresholds,
    "Departman hedef üstü eşikleri",
  );
  const reserveRate = percentage(settings.reserveRate, "Risk rezervi", 5);
  const conservativeRate = percentage(
    rates.conservative,
    "Temkinli dağıtım oranı",
    3,
  );
  const growthRate = percentage(
    rates.growth,
    "Büyüme dağıtım oranı",
    8,
  );
  return {
    reserveRate,
    rates: { conservative: conservativeRate, growth: growthRate },
    departments: Object.fromEntries(DEPARTMENTS.map(({ id }) => [
      id,
      {
        growthPct: percentage(
          departmentSetting(growthTargets, id, 10),
          `${id} hedef büyüme oranı`,
          10,
        ),
        stretchPct: percentage(
          departmentSetting(stretchThresholds, id, 10),
          `${id} hedef üstü eşik oranı`,
          10,
        ),
      },
    ])),
  };
}

/**
 * Önceki yıl aynı ay net satışından büyüme hedefi üretir.
 *
 * @param {number} previousNetSales
 * @param {number} growthPct
 * @returns {number}
 */
export function calculateTargetAmount(previousNetSales, growthPct) {
  const prior = Math.max(0, finiteNumber(previousNetSales, "Önceki yıl net satış"));
  const growth = percentage(growthPct, "Hedef büyüme oranı", 10);
  return roundMoney(prior * (1 + growth / 100));
}

/**
 * Aylık gerçekleşmeyi dağıtım bandına ayırır.
 *
 * @param {{actual:number,target:number,stretchPct:number}} input
 */
export function classifyTargetBand({ actual, target, stretchPct }) {
  const normalizedActual = finiteNumber(actual, "Gerçekleşme");
  const normalizedTarget = Math.max(0, finiteNumber(target, "Hedef"));
  const normalizedStretchPct = percentage(
    stretchPct,
    "Hedef üstü eşik oranı",
    10,
  );
  const stretchTarget = roundMoney(
    normalizedTarget * (1 + normalizedStretchPct / 100),
  );
  if (normalizedTarget <= 0) {
    return { band: "none", stretchTarget, reason: "missing-baseline" };
  }
  if (normalizedActual < normalizedTarget) {
    return { band: "none", stretchTarget, reason: "below-target" };
  }
  if (normalizedActual < stretchTarget) {
    return { band: "conservative", stretchTarget, reason: "target-met" };
  }
  return { band: "growth", stretchTarget, reason: "stretch-met" };
}

/**
 * Maliyeti doğrulanmış kârı seçilen oran ve rezervle aylık havuza çevirir.
 *
 * @param {{
 *   profit:number,
 *   uncoveredNetSales:number,
 *   band:"none"|"conservative"|"growth",
 *   settings:TargetPolicySettings
 * }} input
 * @returns {MonthlyDepartmentPool}
 */
export function monthlyDepartmentPool({
  profit,
  uncoveredNetSales,
  band,
  settings,
}) {
  const normalized = normalizePolicySettings(settings);
  if (!["none", "conservative", "growth"].includes(band)) {
    throw new RangeError("Dağıtım bandı none, conservative veya growth olmalı.");
  }
  const grossProfit = finiteNumber(profit, "Kâr");
  const uncovered = Math.max(
    0,
    finiteNumber(uncoveredNetSales, "Kapsamsız net satış"),
  );
  const eligibleProfit = Math.max(0, grossProfit - uncovered);
  const appliedRate = band === "growth"
    ? normalized.rates.growth
    : band === "conservative"
      ? normalized.rates.conservative
      : 0;
  const eligibleProfitCents = moneyToCents(eligibleProfit, "Uygun kâr");
  const preReserveCents = Math.round(
    eligibleProfitCents * appliedRate / 100,
  );
  const poolCents = Math.round(
    preReserveCents * (1 - normalized.reserveRate / 100),
  );
  const reserveCents = preReserveCents - poolCents;
  return {
    eligibleProfit: centsToMoney(eligibleProfitCents),
    appliedRate,
    reserveRate: normalized.reserveRate,
    reserve: centsToMoney(reserveCents),
    pool: centsToMoney(poolCents),
  };
}

/**
 * @typedef {Object} DepartmentTargetRow
 * @property {"service"|"parts"} department
 * @property {string} departmentName
 * @property {number} month
 * @property {string} monthName
 * @property {number} priorNetSales
 * @property {number} target
 * @property {number} stretchTarget
 * @property {number} actual
 * @property {number} difference
 * @property {number|null} achievementPct
 * @property {"none"|"conservative"|"growth"} band
 * @property {number} appliedRate
 * @property {number} profit
 * @property {number} uncoveredNetSales
 * @property {number} eligibleProfit
 * @property {number} reserve
 * @property {number} pool
 */

/**
 * @typedef {Object} BuildDepartmentTargetsInput
 * @property {number} year
 * @property {TargetSourceRow[]} currentRows
 * @property {TargetSourceRow[]} previousRows
 * @property {TargetPolicySettings} settings
 */

/**
 * İki yılın nihai ledger satırlarından 12 ay x 2 departman hedef tablosu üretir.
 *
 * @param {BuildDepartmentTargetsInput} input
 * @returns {DepartmentTargetRow[]}
 */
export function buildDepartmentTargets({
  year,
  currentRows,
  previousRows,
  settings,
}) {
  const normalizedYear = year;
  if (!Number.isInteger(normalizedYear)) {
    throw new TypeError("Hedef yılı tam sayı olmalı.");
  }
  const policy = normalizePolicySettings(settings);
  const current = aggregateRows(currentRows, {
    includeProfit: true,
    expectedYear: normalizedYear,
  });
  const previous = aggregateRows(previousRows, {
    includeProfit: false,
    expectedYear: normalizedYear - 1,
  });
  return DEPARTMENTS.flatMap((department) => (
    Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const key = `${department.id}|${month}`;
      const currentMetric = current.get(key);
      const previousMetric = previous.get(key);
      const departmentPolicy = policy.departments[department.id];
      const priorNetSales = roundMoney(previousMetric.netSales);
      const target = calculateTargetAmount(
        priorNetSales,
        departmentPolicy.growthPct,
      );
      const actual = roundMoney(currentMetric.netSales);
      const classification = classifyTargetBand({
        actual,
        target,
        stretchPct: departmentPolicy.stretchPct,
      });
      const profit = roundMoney(currentMetric.profit);
      const uncoveredNetSales = roundMoney(
        Math.max(0, currentMetric.uncoveredNetSales),
      );
      const pool = monthlyDepartmentPool({
        profit,
        uncoveredNetSales,
        band: classification.band,
        settings,
      });
      return {
        year: normalizedYear,
        department: department.id,
        departmentName: department.name,
        month,
        monthName: MONTH_NAMES[index],
        priorNetSales,
        growthPct: departmentPolicy.growthPct,
        target,
        stretchPct: departmentPolicy.stretchPct,
        stretchTarget: classification.stretchTarget,
        actual,
        difference: roundMoney(actual - target),
        achievementPct: target > 0
          ? roundMoney(actual / target * 100)
          : null,
        band: classification.band,
        bandReason: classification.reason,
        appliedRate: pool.appliedRate,
        profit,
        uncoveredNetSales,
        eligibleProfit: pool.eligibleProfit,
        reserveRate: pool.reserveRate,
        reserve: pool.reserve,
        pool: pool.pool,
      };
    })
  ));
}

/**
 * Hedef satırlarını API ve dağıtım ekranları için uzlaştırır.
 *
 * @param {DepartmentTargetRow[]} rows
 */
export function summarizeDepartmentTargets(rows) {
  if (!Array.isArray(rows)) throw new TypeError("Hedef satırları dizi olmalı.");
  const departments = DEPARTMENTS.map((department) => {
    const matches = rows.filter((row) => row.department === department.id);
    return {
      department: department.id,
      departmentName: department.name,
      priorNetSales: roundMoney(matches.reduce((sum, row) => sum + row.priorNetSales, 0)),
      target: roundMoney(matches.reduce((sum, row) => sum + row.target, 0)),
      actual: roundMoney(matches.reduce((sum, row) => sum + row.actual, 0)),
      profit: roundMoney(matches.reduce((sum, row) => sum + row.profit, 0)),
      uncoveredNetSales: roundMoney(matches.reduce(
        (sum, row) => sum + row.uncoveredNetSales,
        0,
      )),
      eligibleProfit: roundMoney(matches.reduce((sum, row) => sum + row.eligibleProfit, 0)),
      reserve: roundMoney(matches.reduce((sum, row) => sum + row.reserve, 0)),
      pool: roundMoney(matches.reduce((sum, row) => sum + row.pool, 0)),
    };
  });
  return {
    departments,
    priorNetSales: roundMoney(departments.reduce((sum, row) => sum + row.priorNetSales, 0)),
    target: roundMoney(departments.reduce((sum, row) => sum + row.target, 0)),
    actual: roundMoney(departments.reduce((sum, row) => sum + row.actual, 0)),
    profit: roundMoney(departments.reduce((sum, row) => sum + row.profit, 0)),
    uncoveredNetSales: roundMoney(departments.reduce(
      (sum, row) => sum + row.uncoveredNetSales,
      0,
    )),
    eligibleProfit: roundMoney(departments.reduce(
      (sum, row) => sum + row.eligibleProfit,
      0,
    )),
    reserve: roundMoney(departments.reduce((sum, row) => sum + row.reserve, 0)),
    totalPool: roundMoney(departments.reduce((sum, row) => sum + row.pool, 0)),
  };
}
