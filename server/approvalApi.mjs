import { createHash } from "node:crypto";
import express from "express";

const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
const DEPARTMENTS = new Set(["service", "parts"]);
const TARGET_BANDS = new Set(["none", "conservative", "growth"]);

function validYear(value, { writable = false } = {}) {
  const year = Number(value);
  const minimum = writable ? 2026 : 2023;
  return Number.isInteger(year) && year >= minimum && year <= 2030
    ? year
    : null;
}

function validMonth(value) {
  const month = Number(value);
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
}

function number(value, fieldName) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${fieldName} sonlu sayı olmalı.`);
  }
  return Number(value.toFixed(2));
}

function snapshotHash(snapshot) {
  return createHash("sha256")
    .update(JSON.stringify(snapshot))
    .digest("hex");
}

function departmentSnapshot(row) {
  if (!DEPARTMENTS.has(row.department)) {
    throw new RangeError("Onay snapshotında tanımsız departman var.");
  }
  if (!TARGET_BANDS.has(row.band)) {
    throw new RangeError("Onay snapshotında tanımsız hedef bandı var.");
  }
  const actual = number(row.actual, "Gerçekleşme");
  const uncovered = number(
    row.uncoveredNetSales ?? 0,
    "Kapsamsız net satış",
  );
  return {
    department: row.department,
    priorNetSales: number(row.priorNetSales, "Önceki yıl net satışı"),
    target: number(row.target, "Hedef"),
    stretchTarget: number(row.stretchTarget, "Hedef üstü eşik"),
    actual,
    difference: number(row.difference, "Hedef farkı"),
    achievementPct: row.achievementPct === null
      ? null
      : number(row.achievementPct, "Hedef gerçekleşme oranı"),
    band: row.band,
    appliedRate: number(row.appliedRate, "Dağıtım oranı"),
    eligibleProfit: number(row.eligibleProfit, "Dağıtıma esas kâr"),
    uncoveredNetSales: uncovered,
    coveragePct: actual > 0
      ? number(Math.max(0, actual - uncovered) / actual * 100, "Kapsam oranı")
      : 0,
    pool: number(row.pool, "Departman havuzu"),
  };
}

function buildSnapshot(targets, year, month) {
  if (!targets || !Array.isArray(targets.rows)) {
    throw new TypeError("Departman hedef sonucu geçersiz.");
  }
  const rows = targets.rows
    .filter((row) => row.month === month)
    .sort((left, right) => String(left.department).localeCompare(
      String(right.department),
      "tr",
    ));
  if (rows.length !== 2) {
    throw new RangeError("Ay için iki departman hedef satırı bulunmalı.");
  }
  const departmentKeys = new Set(rows.map((row) => row.department));
  if (
    departmentKeys.size !== DEPARTMENTS.size
    || [...DEPARTMENTS].some((department) => !departmentKeys.has(department))
  ) {
    throw new RangeError(
      "Ay için Servis ve Yedek Parça Satış hedefleri ayrı bulunmalı.",
    );
  }
  const departments = rows.map(departmentSnapshot);
  const hasData = departments.some((row) => (
    row.actual !== 0
    || row.eligibleProfit !== 0
    || row.uncoveredNetSales !== 0
  ));
  if (!hasData) throw new RangeError("Ay için onaylanabilir veri yok.");
  const economicSnapshot = {
    year,
    month,
    monthName: MONTH_NAMES[month - 1],
    ledgerVersion: targets.ledgerVersion ?? null,
    previousLedgerVersion: targets.previousLedgerVersion ?? null,
    generatedAt: targets.generatedAt ?? null,
    departments,
    pool: number(
      departments.reduce((sum, row) => sum + row.pool, 0),
      "Aylık havuz",
    ),
  };
  return {
    ...economicSnapshot,
    snapshotHash: snapshotHash(economicSnapshot),
  };
}

/**
 * Nexus yönetim onaylarını sunucu tarafında yıl/ay snapshotı olarak yönetir.
 */
export function createApprovalRouter({
  store,
  loadDepartmentTargets,
  now = () => new Date(),
  logger = console,
} = {}) {
  if (!store || typeof store.read !== "function") {
    throw new TypeError("Durum deposu zorunludur.");
  }
  if (typeof loadDepartmentTargets !== "function") {
    throw new TypeError("Departman hedef yükleyicisi zorunludur.");
  }
  const router = express.Router();

  router.get("/api/approvals", async (request, response) => {
    const year = validYear(request.query.year);
    if (!year) return response.status(400).json({ error: "Geçersiz yıl." });
    try {
      const state = await store.read();
      const storedApprovals = state.approvals[String(year)] || {};
      if (!Object.keys(storedApprovals).length) {
        return response.json({
          year,
          approvals: {},
          auditEvents: state.auditEvents.filter((event) => event.year === year),
          currentLedgerVersion: null,
          readOnlyCpm: true,
        });
      }
      let currentTargets = null;
      try {
        currentTargets = await loadDepartmentTargets(year, { refresh: false });
      } catch (error) {
        logger.error("Marlin Nexus approval freshness read failed:", error);
      }
      const approvals = Object.fromEntries(
        Object.entries(storedApprovals).map(([monthKey, approval]) => {
          let currentHash = null;
          if (currentTargets) {
            try {
              currentHash = buildSnapshot(
                currentTargets,
                year,
                Number(monthKey),
              ).snapshotHash;
            } catch {
              currentHash = null;
            }
          }
          return [monthKey, {
            ...approval,
            currentSnapshotHash: currentHash,
            stale: currentHash === null
              ? null
              : currentHash !== approval.snapshotHash,
          }];
        }),
      );
      return response.json({
        year,
        approvals,
        auditEvents: state.auditEvents.filter((event) => event.year === year),
        currentLedgerVersion: currentTargets?.ledgerVersion ?? null,
        readOnlyCpm: true,
      });
    } catch (error) {
      logger.error("Marlin Nexus approvals read failed:", error);
      return response.status(500).json({ error: "Onaylar okunamadı." });
    }
  });

  router.put("/api/approvals/:year/:month", async (request, response) => {
    const year = validYear(request.params.year, { writable: true });
    const month = validMonth(request.params.month);
    if (!year || !month) {
      return response.status(400).json({ error: "Geçersiz onay dönemi." });
    }
    try {
      const targets = await loadDepartmentTargets(year, { refresh: true });
      const state = await store.read();
      const economicSnapshot = buildSnapshot(targets, year, month);
      const approval = {
        ...economicSnapshot,
        approvedAt: now().toISOString(),
        approvedBy: "Yönetim",
        locked: state.settings?.lockAfterApproval !== false,
      };
      await store.approve({
        year,
        month,
        snapshot: approval,
        actor: "Yönetim",
      });
      return response.json({ saved: true, approval, readOnlyCpm: true });
    } catch (error) {
      if (Number.isInteger(error.statusCode)) {
        return response.status(error.statusCode).json({
          error: error.message,
          readOnlyCpm: true,
        });
      }
      if (error instanceof TypeError || error instanceof RangeError) {
        return response.status(409).json({ error: error.message });
      }
      logger.error("Marlin Nexus approval write failed:", error);
      return response.status(500).json({ error: "Aylık onay kaydedilemedi." });
    }
  });

  router.post("/api/approvals/:year/:month/reopen", async (request, response) => {
    const year = validYear(request.params.year, { writable: true });
    const month = validMonth(request.params.month);
    if (!year || !month) {
      return response.status(400).json({ error: "Geçersiz onay dönemi." });
    }
    try {
      await store.reopen({ year, month, actor: "Yönetim" });
      return response.json({ reopened: true, year, month, readOnlyCpm: true });
    } catch (error) {
      if (error instanceof RangeError && error.message === "Onay bulunamadı.") {
        return response.status(404).json({
          error: error.message,
          readOnlyCpm: true,
        });
      }
      logger.error("Marlin Nexus approval reopen failed:", error);
      return response.status(500).json({ error: "Onay geri açılamadı." });
    }
  });

  return router;
}
