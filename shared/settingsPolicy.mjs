const DEFAULT_DEPARTMENT_TARGETS = Object.freeze({
  service: Object.freeze({ growthPct: 10, stretchPct: 5 }),
  parts: Object.freeze({ growthPct: 10, stretchPct: 5 }),
});

export const DEFAULT_SETTINGS = Object.freeze({
  rates: Object.freeze({ conservative: 3, growth: 8 }),
  reserveRate: 5,
  minimumProfit: 0,
  negativeRule: "annual",
  distributionMonth: 2,
  costMethod: "lastPurchase",
  pilotCardCostRates: Object.freeze({
    labor: 0,
    srf: 100,
    tsr: 100,
    road: 100,
  }),
  minimumCoverage: 85,
  exchangeRateRule: "document",
  requireManagementApprovalForManualCost: true,
  allocationMethod: "coefficient",
  departmentTargets: DEFAULT_DEPARTMENT_TARGETS,
  monthlyCloseDay: 10,
  boardApproval: true,
  lockAfterApproval: true,
  auditLog: true,
  monthlyNotifications: true,
  employeeVisibility: "summary",
  identityMap: Object.freeze({}),
});

function optionalRecord(value, fieldName) {
  if (value === undefined) return {};
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

function valueOrDefault(record, key, fallback) {
  return record[key] === undefined ? fallback : record[key];
}

function finiteNumber(value, fieldName) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${fieldName} sonlu sayı olmalı.`);
  }
  return value;
}

function rangedNumber(value, fieldName, minimum, maximum) {
  const number = finiteNumber(value, fieldName);
  if (number < minimum || number > maximum) {
    throw new RangeError(
      `${fieldName} ${minimum} ile ${maximum} arasında olmalı.`,
    );
  }
  return number;
}

function integerInRange(value, fieldName, minimum, maximum) {
  const number = rangedNumber(value, fieldName, minimum, maximum);
  if (!Number.isInteger(number)) {
    throw new TypeError(`${fieldName} tam sayı olmalı.`);
  }
  return number;
}

function booleanValue(value, fieldName) {
  if (typeof value !== "boolean") {
    throw new TypeError(`${fieldName} boolean olmalı.`);
  }
  return value;
}

function enumValue(value, fieldName, allowedValues) {
  if (typeof value !== "string" || !allowedValues.includes(value)) {
    throw new RangeError(`${fieldName} geçerli bir değer olmalı.`);
  }
  return value;
}

function legacyDepartmentValue(record, department, fallback) {
  const aliases = department === "service"
    ? ["service", "Servis", "Atölye Teknik"]
    : ["parts", "Yedek Parça Satış", "Ofis"];
  for (const alias of aliases) {
    if (record[alias] !== undefined) return record[alias];
  }
  return fallback;
}

function normalizeDepartmentTargets(stored) {
  const canonical = optionalRecord(
    stored.departmentTargets,
    "Departman hedef ayarları",
  );
  const legacyGrowth = optionalRecord(
    stored.departmentGrowthTargets,
    "Departman hedef büyüme oranları",
  );
  const legacyStretch = optionalRecord(
    stored.departmentStretchThresholds,
    "Departman hedef üstü eşikleri",
  );

  return Object.fromEntries(["service", "parts"].map((department) => {
    const source = optionalRecord(
      canonical[department],
      `${department} departman hedef ayarı`,
    );
    const defaults = DEFAULT_DEPARTMENT_TARGETS[department];
    return [
      department,
      {
        growthPct: valueOrDefault(
          source,
          "growthPct",
          legacyDepartmentValue(legacyGrowth, department, defaults.growthPct),
        ),
        stretchPct: valueOrDefault(
          source,
          "stretchPct",
          legacyDepartmentValue(legacyStretch, department, defaults.stretchPct),
        ),
      },
    ];
  }));
}

/**
 * Eski tarayıcı ayarlarını kanonik Nexus ayar sözleşmesine taşır.
 *
 * @param {object|undefined} stored
 * @returns {object}
 */
export function normalizeSettings(stored) {
  const source = optionalRecord(stored, "Nexus ayarları");
  const sourceRates = optionalRecord(source.rates, "Dağıtım oranları");
  const pilotCardCostRates = optionalRecord(
    source.pilotCardCostRates,
    "Pilot kart maliyet oranları",
  );
  const identityMap = optionalRecord(source.identityMap, "Kimlik eşleme ayarları");

  const result = {
    rates: {
      conservative: valueOrDefault(
        sourceRates,
        "conservative",
        DEFAULT_SETTINGS.rates.conservative,
      ),
      growth: valueOrDefault(
        sourceRates,
        "growth",
        DEFAULT_SETTINGS.rates.growth,
      ),
    },
    departmentTargets: normalizeDepartmentTargets(source),
    pilotCardCostRates: {
      labor: valueOrDefault(
        pilotCardCostRates,
        "labor",
        DEFAULT_SETTINGS.pilotCardCostRates.labor,
      ),
      srf: valueOrDefault(
        pilotCardCostRates,
        "srf",
        DEFAULT_SETTINGS.pilotCardCostRates.srf,
      ),
      tsr: valueOrDefault(
        pilotCardCostRates,
        "tsr",
        DEFAULT_SETTINGS.pilotCardCostRates.tsr,
      ),
      road: valueOrDefault(
        pilotCardCostRates,
        "road",
        DEFAULT_SETTINGS.pilotCardCostRates.road,
      ),
    },
    identityMap: Object.fromEntries(
      Object.entries(identityMap).map(([code, name]) => {
        if (typeof name !== "string" || !name.trim()) {
          throw new TypeError("Kimlik eşleme adı geçerli metin olmalı.");
        }
        return [code, name];
      }),
    ),
  };

  result.rates.conservative = rangedNumber(
    result.rates.conservative,
    "Temkinli dağıtım oranı",
    0,
    100,
  );
  result.rates.growth = rangedNumber(
    result.rates.growth,
    "Büyüme dağıtım oranı",
    0,
    100,
  );
  result.reserveRate = rangedNumber(
    valueOrDefault(source, "reserveRate", DEFAULT_SETTINGS.reserveRate),
    "Risk rezervi",
    0,
    100,
  );
  result.minimumProfit = rangedNumber(
    valueOrDefault(source, "minimumProfit", DEFAULT_SETTINGS.minimumProfit),
    "Asgari kâr",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  result.negativeRule = enumValue(
    valueOrDefault(source, "negativeRule", DEFAULT_SETTINGS.negativeRule),
    "Negatif dönem kuralı",
    ["zero", "carry", "annual"],
  );
  result.distributionMonth = integerInRange(
    valueOrDefault(
      source,
      "distributionMonth",
      DEFAULT_SETTINGS.distributionMonth,
    ),
    "Dağıtım ayı",
    1,
    12,
  );
  result.costMethod = enumValue(
    valueOrDefault(source, "costMethod", DEFAULT_SETTINGS.costMethod),
    "Maliyet yöntemi",
    ["lastPurchase"],
  );
  for (const [key, value] of Object.entries(result.pilotCardCostRates)) {
    result.pilotCardCostRates[key] = rangedNumber(
      value,
      `${key} pilot kart maliyet oranı`,
      0,
      100,
    );
  }
  result.minimumCoverage = rangedNumber(
    valueOrDefault(
      source,
      "minimumCoverage",
      DEFAULT_SETTINGS.minimumCoverage,
    ),
    "Asgari maliyet kapsamı",
    60,
    100,
  );
  result.exchangeRateRule = enumValue(
    valueOrDefault(
      source,
      "exchangeRateRule",
      DEFAULT_SETTINGS.exchangeRateRule,
    ),
    "Kur dönüşüm kuralı",
    ["document", "monthEnd", "centralBank"],
  );
  result.requireManagementApprovalForManualCost = booleanValue(
    valueOrDefault(
      source,
      "requireManagementApprovalForManualCost",
      DEFAULT_SETTINGS.requireManagementApprovalForManualCost,
    ),
    "Manuel maliyet yönetim onayı",
  );
  result.allocationMethod = enumValue(
    valueOrDefault(
      source,
      "allocationMethod",
      DEFAULT_SETTINGS.allocationMethod,
    ),
    "Dağıtım yöntemi",
    ["coefficient", "equal"],
  );
  result.monthlyCloseDay = integerInRange(
    valueOrDefault(
      source,
      "monthlyCloseDay",
      DEFAULT_SETTINGS.monthlyCloseDay,
    ),
    "Aylık kapanış günü",
    1,
    28,
  );
  for (const key of [
    "boardApproval",
    "lockAfterApproval",
    "auditLog",
    "monthlyNotifications",
  ]) {
    result[key] = booleanValue(
      valueOrDefault(source, key, DEFAULT_SETTINGS[key]),
      key,
    );
  }
  result.employeeVisibility = enumValue(
    valueOrDefault(
      source,
      "employeeVisibility",
      DEFAULT_SETTINGS.employeeVisibility,
    ),
    "Personel görünürlüğü",
    ["summary", "details", "hidden"],
  );
  for (const [department, target] of Object.entries(result.departmentTargets)) {
    target.growthPct = rangedNumber(
      target.growthPct,
      `${department} hedef büyüme oranı`,
      -100,
      300,
    );
    target.stretchPct = rangedNumber(
      target.stretchPct,
      `${department} hedef üstü eşik oranı`,
      0,
      100,
    );
  }
  return result;
}

/**
 * Yalnız desteklenen Nexus ayarlarını kalıcılaştırılabilir nesneye çevirir.
 *
 * @param {object|undefined} settings
 * @returns {object}
 */
export function serializeSettings(settings) {
  const normalized = normalizeSettings(settings);
  return {
    ...normalized,
    rates: { ...normalized.rates },
    departmentTargets: {
      service: { ...normalized.departmentTargets.service },
      parts: { ...normalized.departmentTargets.parts },
    },
    pilotCardCostRates: { ...normalized.pilotCardCostRates },
    identityMap: { ...normalized.identityMap },
  };
}
