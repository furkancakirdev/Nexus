import { normalizeDepartmentId } from "./targetPolicy.mjs";

const SERVICE_IDENTITIES = new Set([
  "FURKAN",
  "FURKANCAKIR",
  "BCETINEL",
  "BURAKCETINEL",
  "MKARA",
  "MEHMETKARA",
]);
const STATUS_ALIASES = new Map([
  ["EMPLOYEE", "employee"],
  ["CALISAN", "employee"],
  ["ACTIVE", "employee"],
  ["MANAGER", "manager"],
  ["YONETICI", "manager"],
  ["DEPARTED", "departed"],
  ["AYRILDI", "departed"],
  ["INACTIVE", "inactive"],
  ["PASIF", "inactive"],
]);

function plainRecord(value) {
  const prototype = value !== null && typeof value === "object"
    ? Object.getPrototypeOf(value)
    : null;
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || (prototype !== Object.prototype && prototype !== null)
  ) {
    throw new TypeError("Personel kaydı nesne olmalı.");
  }
  return value;
}

function normalizedText(value) {
  return String(value ?? "")
    .trim()
    .toLocaleUpperCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Eski pilot personel kayıtlarını iki ticari departman sözleşmesine taşır.
 *
 * @param {object[]} employees
 * @returns {object[]}
 */
export function normalizePilotEmployees(employees) {
  if (!Array.isArray(employees)) {
    throw new TypeError("Personel listesi dizi olmalı.");
  }
  return employees.map((rawEmployee) => {
    const employee = plainRecord(rawEmployee);
    const isKnownService = [employee.code, employee.id, employee.name]
      .some((value) => SERVICE_IDENTITIES.has(normalizedText(value)));
    const department = isKnownService
      ? "service"
      : normalizeDepartmentId(employee.department) || "parts";
    const status = STATUS_ALIASES.get(normalizedText(employee.status))
      || (employee.included === false || employee.active === false
        ? "inactive"
        : "employee");
    return { ...employee, department, status };
  });
}
