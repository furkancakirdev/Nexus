import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const DEFAULT_YEARS = Object.freeze([2024, 2025, 2026]);
const ENDPOINTS = Object.freeze([
  { id: "overview", path: "/api/overview" },
  { id: "departments", path: "/api/department-analysis" },
  { id: "targets", path: "/api/department-targets" },
  { id: "audit", path: "/api/audit-ledger", suffix: "&pageSize=10" },
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function percentile(values, ratio) {
  invariant(values.length > 0, "Yüzdelik dilim için ölçüm gerekli.");
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * ratio) - 1];
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function metric(values) {
  return {
    samples: values.length,
    averageMs: Number(average(values).toFixed(2)),
    p95Ms: Number(percentile(values, 0.95).toFixed(2)),
    maximumMs: Number(Math.max(...values).toFixed(2)),
  };
}

function parseArguments(argv) {
  const options = {
    base: "http://127.0.0.1:4317",
    years: [...DEFAULT_YEARS],
    iterations: 5,
    thresholdMs: 1_000,
    targetMs: 250,
    output: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--base") options.base = argv[++index];
    else if (argument === "--years") options.years = argv[++index].split(",").map(Number);
    else if (argument === "--iterations") options.iterations = Number(argv[++index]);
    else if (argument === "--threshold") options.thresholdMs = Number(argv[++index]);
    else if (argument === "--target") options.targetMs = Number(argv[++index]);
    else if (argument === "--output") options.output = argv[++index];
    else throw new Error(`Bilinmeyen argüman: ${argument}`);
  }
  invariant(/^https?:\/\//.test(options.base), "Geçerli bir --base adresi gerekli.");
  invariant(
    options.years.length > 0 && options.years.every(Number.isInteger),
    "Geçerli --years listesi gerekli.",
  );
  invariant(
    Number.isInteger(options.iterations) && options.iterations >= 2 && options.iterations <= 30,
    "--iterations 2 ile 30 arasında olmalı.",
  );
  invariant(
    Number.isFinite(options.thresholdMs) && options.thresholdMs > 0,
    "Geçerli --threshold gerekli.",
  );
  return options;
}

async function timedJson(base, path) {
  const startedAt = performance.now();
  const response = await fetch(new URL(path, `${base.replace(/\/$/, "")}/`), {
    signal: AbortSignal.timeout(180_000),
    headers: { Accept: "application/json" },
  });
  const elapsedMs = performance.now() - startedAt;
  const payload = await response.json();
  invariant(response.ok, `${path} başarısız (${response.status}): ${payload.error || "bilinmeyen hata"}`);
  invariant(payload.mode === "live", `${path} canlı modda değil.`);
  invariant(payload.readOnly === true, `${path} CPM salt okunur işaretini taşımıyor.`);
  return { elapsedMs, payload };
}

async function primeWarmEndpoints(base, year) {
  for (const endpoint of ENDPOINTS) {
    await timedJson(
      base,
      `${endpoint.path}?year=${year}${endpoint.suffix || ""}`,
    );
  }
}

export async function benchmarkRemoteLedger({
  base,
  years = DEFAULT_YEARS,
  iterations = 5,
  thresholdMs = 1_000,
  targetMs = 250,
}) {
  const cold = [];
  const warm = Object.fromEntries(ENDPOINTS.map((endpoint) => [endpoint.id, []]));
  for (const year of years) {
    const coldRead = await timedJson(base, `/api/overview?year=${year}&refresh=1`);
    cold.push({ year, elapsedMs: Number(coldRead.elapsedMs.toFixed(2)) });
    await primeWarmEndpoints(base, year);
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      for (const endpoint of ENDPOINTS) {
        const result = await timedJson(
          base,
          `${endpoint.path}?year=${year}${endpoint.suffix || ""}`,
        );
        warm[endpoint.id].push(result.elapsedMs);
      }
    }
  }

  const allWarmDurations = Object.values(warm).flat();
  const warmP95 = percentile(allWarmDurations, 0.95);
  invariant(
    warmP95 < thresholdMs,
    `Warm p95 ${warmP95.toFixed(2)} ms ile ${thresholdMs} ms sınırını aştı.`,
  );
  return {
    generatedAt: new Date().toISOString(),
    base,
    years,
    iterations,
    cold,
    warm: Object.fromEntries(
      Object.entries(warm).map(([endpoint, values]) => [endpoint, metric(values)]),
    ),
    aggregateWarm: metric(allWarmDurations),
    thresholdMs,
    targetMs,
    targetMet: warmP95 < targetMs,
    status: "pass",
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const report = await benchmarkRemoteLedger(options);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) {
    const outputPath = resolve(options.output);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, serialized, "utf8");
  }
  process.stdout.write(serialized);
}

main().catch((error) => {
  console.error(`FINAL_LEDGER_BENCHMARK_FAILED: ${error.message}`);
  process.exitCode = 1;
});
