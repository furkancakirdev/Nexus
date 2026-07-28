import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CENT_TOLERANCE = 0.01;
const DEFAULT_YEARS = Object.freeze([2024, 2025, 2026]);
const FORMER_SERVICE_END = "2024-06-30";

function number(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`Sonlu sayı bekleniyordu, alınan: ${value}`);
  }
  return parsed;
}

function roundMoney(value) {
  return Math.round((number(value) + Number.EPSILON) * 100) / 100;
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function assertWithinCent(actual, expected, label) {
  const difference = roundMoney(number(actual) - number(expected));
  invariant(
    Math.abs(difference) <= CENT_TOLERANCE,
    `${label} mutabakat farkı ${difference.toFixed(2)} TL.`,
  );
  return difference;
}

function overviewNetSales(rows) {
  return roundMoney((rows || []).reduce((total, row) => {
    const pilotNet = Object.values(row.pilotCards || {}).reduce((sum, card) => (
      sum
      + number(card.sales || 0)
      - number(card.returns || 0)
      - number(card.discounts || 0)
    ), 0);
    return total
      + number(row.sales || 0)
      - number(row.returns || 0)
      - number(row.discounts || 0)
      + pilotNet;
  }, 0));
}

function normalizedActorCode(value) {
  return String(value || "")
    .trim()
    .toLocaleUpperCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

function selectedOwnerEvidenceDate(row) {
  const ownerCode = normalizedActorCode(row?.commercialOwner);
  const selectedDocumentKey = String(
    row?.ownershipEvidence?.selected?.documentKey || "",
  ).trim();
  if (!ownerCode || !selectedDocumentKey) return null;

  const matchingEvents = (Array.isArray(row?.actorEvents) ? row.actorEvents : [])
    .filter((event) => (
      String(event?.documentKey || "").trim() === selectedDocumentKey
      && normalizedActorCode(event?.actorCode) === ownerCode
      && event?.actorRole === "history-entry"
    ))
    .map((event) => String(event?.firstSeen || "").slice(0, 10))
    .filter(Boolean)
    .sort();

  return matchingEvents[0] || null;
}

function commercialOwnershipDate(row) {
  return selectedOwnerEvidenceDate(row)
    || String(row?.documentDate || "").slice(0, 10);
}

function assertLivePayload(name, payload) {
  invariant(payload && typeof payload === "object", `${name} yanıtı yok.`);
  invariant(payload.mode === "live", `${name} canlı modda değil: ${payload.mode || "yok"}.`);
  invariant(payload.readOnly === true, `${name} CPM salt okunur işaretini taşımıyor.`);
}

export function validateHealth(health) {
  invariant(health?.connected === true, "CPM bağlantısı aktif değil.");
  invariant(health?.mode === "live", `Sağlık yanıtı canlı modda değil: ${health?.mode || "yok"}.`);
  invariant(health?.readOnly === true, "CPM bağlantısı salt okunur değil.");
  invariant(health?.database === "Marlin_Uyg", `Beklenmeyen CPM veritabanı: ${health?.database || "yok"}.`);
  return {
    connected: true,
    mode: health.mode,
    readOnly: health.readOnly,
    database: health.database,
  };
}

export function validateYearPayloads(year, payloads) {
  const {
    overview,
    departments,
    targets,
    audit,
    approvals,
  } = payloads;
  assertLivePayload("Özet", overview);
  assertLivePayload("Departman", departments);
  assertLivePayload("Hedef", targets);
  assertLivePayload("Denetim", audit);
  invariant(approvals?.readOnlyCpm === true, `${year} onay yanıtı CPM salt okunur sınırını taşımıyor.`);

  const overviewTotal = overviewNetSales(overview.rows);
  const departmentTotal = roundMoney(departments.totals?.netSales || 0);
  const auditTotal = roundMoney(audit.summary?.analysisNetAmount || 0);
  const departmentRows = Array.isArray(departments.departments)
    ? departments.departments
    : [];
  const serviceAndPartsTotal = roundMoney(departmentRows
    .filter((row) => ["service", "parts"].includes(row.id))
    .reduce((sum, row) => sum + number(row.netSales || 0), 0));
  const departmentComponentTotal = roundMoney(departmentRows
    .reduce((sum, row) => sum + number(row.netSales || 0), 0));
  const attributionTotal = roundMoney(
    number(departments.totals?.confirmedSales || 0)
    + number(departments.totals?.inferredSales || 0)
    + number(departments.totals?.reviewSales || 0),
  );

  const targetRows = Array.isArray(targets.rows) ? targets.rows : [];
  const targetActual = roundMoney(targetRows
    .reduce((sum, row) => sum + number(row.actual || 0), 0));
  const monthlyPoolTotal = roundMoney(targetRows
    .reduce((sum, row) => sum + number(row.pool || 0), 0));
  const summaryActual = roundMoney(targets.summary?.actual || 0);
  const summaryPool = roundMoney(targets.summary?.totalPool || 0);

  assertWithinCent(overviewTotal, departmentTotal, `${year} özet/departman`);
  assertWithinCent(overviewTotal, auditTotal, `${year} özet/denetim`);
  assertWithinCent(departmentComponentTotal, departmentTotal, `${year} departman bileşenleri`);
  assertWithinCent(attributionTotal, departmentTotal, `${year} atıf kapsamı`);
  assertWithinCent(targetActual, serviceAndPartsTotal, `${year} hedef gerçekleşen/departman`);
  assertWithinCent(targetActual, summaryActual, `${year} hedef satır/özet`);
  assertWithinCent(monthlyPoolTotal, summaryPool, `${year} aylık havuz toplamı`);

  const provisionalEconomicRows = (overview.rows || [])
    .reduce((sum, row) => sum + number(row.provisionalLineCount || 0), 0)
    + number(audit.summary?.provisionalEconomicRows ?? 0);
  invariant(
    provisionalEconomicRows === 0,
    `${year} için ${provisionalEconomicRows} geçici ekonomik satır bulundu.`,
  );

  const convertedRetailEconomicRows = number(
    audit.summary?.convertedRetailEconomicRows ?? 0,
  );
  invariant(
    convertedRetailEconomicRows === 0,
    `${year} için ${convertedRetailEconomicRows} nihai faturaya dönüşmüş perakende satırı ekonomide kaldı.`,
  );

  const ownershipRows = Array.isArray(departments.detailRows)
    ? departments.detailRows
    : [];
  const accountantRows = ownershipRows.filter(
    (row) => normalizedActorCode(row.commercialOwner) === "BIRCAN",
  );
  invariant(
    accountantRows.length === 0,
    `${year} için BIRCAN ticari sahip olarak görünen ${accountantRows.length} satır bulundu.`,
  );
  const customerLikeOwners = ownershipRows.filter((row) => (
    /\d/.test(normalizedActorCode(row.commercialOwner))
  ));
  invariant(
    customerLikeOwners.length === 0,
    `${year} için personel olmayan cari kodlu ${customerLikeOwners.length} ticari sahip bulundu.`,
  );
  const formerServiceRows = ownershipRows.filter((row) => (
    normalizedActorCode(row.commercialOwner) === "OGENCOGLU"
    && commercialOwnershipDate(row) > FORMER_SERVICE_END
  ));
  invariant(
    formerServiceRows.length === 0,
    `${year} için ayrılış sonrası OGENCOGLU sahipli ${formerServiceRows.length} satır bulundu.`,
  );

  return {
    year,
    ledgerVersion: departments.ledgerVersion || overview.ledgerVersion || null,
    overviewNetSales: overviewTotal,
    departmentNetSales: departmentTotal,
    targetActualNetSales: targetActual,
    auditNetSales: auditTotal,
    attributionNetSales: attributionTotal,
    unassignedReviewNetSales: roundMoney(departments.quality?.unassignedReviewAmount || 0),
    provisionalEconomicRows,
    convertedRetailEconomicRows,
    accountantOwnerRows: accountantRows.length,
    customerLikeOwnerRows: customerLikeOwners.length,
    formerServiceAfterDepartureRows: formerServiceRows.length,
    auditRows: number(audit.summary?.totalRows || 0),
    targetRows: targetRows.length,
    approvalMonths: Object.keys(approvals.approvals || {}).length,
    totalPool: summaryPool,
    differences: {
      overviewToDepartment: roundMoney(overviewTotal - departmentTotal),
      overviewToAudit: roundMoney(overviewTotal - auditTotal),
      targetsToAssignedDepartments: roundMoney(targetActual - serviceAndPartsTotal),
      monthlyPoolToSummary: roundMoney(monthlyPoolTotal - summaryPool),
    },
  };
}

function parseArguments(argv) {
  const options = {
    base: "http://127.0.0.1:4317",
    years: [...DEFAULT_YEARS],
    output: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--base") options.base = argv[++index];
    else if (argument === "--years") {
      options.years = argv[++index].split(",").map(Number);
    } else if (argument === "--output") options.output = argv[++index];
    else throw new Error(`Bilinmeyen argüman: ${argument}`);
  }
  invariant(/^https?:\/\//.test(options.base), "Geçerli bir --base adresi gerekli.");
  invariant(
    options.years.length > 0
    && options.years.every((year) => Number.isInteger(year) && year >= 2024 && year <= 2100),
    "Geçerli --years listesi gerekli.",
  );
  return options;
}

async function fetchJson(base, path) {
  const response = await fetch(new URL(path, `${base.replace(/\/$/, "")}/`), {
    signal: AbortSignal.timeout(180_000),
    headers: { Accept: "application/json" },
  });
  const body = await response.text();
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(`${path} JSON döndürmedi (${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(`${path} başarısız (${response.status}): ${payload.error || "bilinmeyen hata"}`);
  }
  return payload;
}

async function loadYearPayloads(base, year) {
  const query = `year=${year}`;
  const [overview, departments, targets, audit, approvals] = await Promise.all([
    fetchJson(base, `/api/overview?${query}`),
    fetchJson(base, `/api/department-analysis?${query}`),
    fetchJson(base, `/api/department-targets?${query}`),
    fetchJson(base, `/api/audit-ledger?${query}&pageSize=10`),
    fetchJson(base, `/api/approvals?${query}`),
  ]);
  return { overview, departments, targets, audit, approvals };
}

export async function validateRemoteLedger({
  base,
  years = DEFAULT_YEARS,
}) {
  const health = validateHealth(await fetchJson(base, "/api/health"));
  const results = [];
  for (const year of years) {
    results.push(validateYearPayloads(
      year,
      await loadYearPayloads(base, year),
    ));
  }
  return {
    generatedAt: new Date().toISOString(),
    base,
    health,
    years: results,
    status: "pass",
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const report = await validateRemoteLedger(options);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) {
    const outputPath = resolve(options.output);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, serialized, "utf8");
  }
  process.stdout.write(serialized);
}

const isMain = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    console.error(`FINAL_LEDGER_VALIDATION_FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
