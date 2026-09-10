import { mkdir, open, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

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

function validPeriod(year, month) {
  if (!Number.isInteger(year) || year < 2023 || year > 2030) {
    throw new RangeError("Onay yılı geçersiz.");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError("Onay ayı geçersiz.");
  }
}

function normalizeState(value = {}) {
  const state = plainRecord(value, "Nexus durumu");
  return {
    settings: state.settings ?? null,
    employees: Array.isArray(state.employees) ? [...state.employees] : null,
    costOverrides: Array.isArray(state.costOverrides)
      ? [...state.costOverrides]
      : [],
    settingsRevision: Number.isInteger(state.settingsRevision) && state.settingsRevision >= 0
      ? state.settingsRevision
      : 0,
    settingsFingerprint: typeof state.settingsFingerprint === "string"
      ? state.settingsFingerprint
      : null,
    settingsHistory: Array.isArray(state.settingsHistory)
      ? structuredClone(state.settingsHistory).slice(-50)
      : [],
    approvals: state.approvals && typeof state.approvals === "object"
      && !Array.isArray(state.approvals)
      ? structuredClone(state.approvals)
      : {},
    auditEvents: Array.isArray(state.auditEvents)
      ? [...state.auditEvents]
      : [],
    savedAt: state.savedAt ?? null,
  };
}

function settingsFingerprint(settings, employees, costOverrides) {
  return createHash("sha256")
    .update(JSON.stringify({ settings, employees, costOverrides }))
    .digest("hex");
}

function revisionConflict() {
  const error = new Error("Ayarlar başka bir oturumda değiştirildi.");
  error.code = "SETTINGS_REVISION_CONFLICT";
  return error;
}

async function atomicWrite(filePath, state) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempFile = `${filePath}.tmp`;
  const handle = await open(tempFile, "w");
  try {
    await handle.writeFile(JSON.stringify(state, null, 2), "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tempFile, filePath);
}

/**
 * Nexus'a ait ayar, onay ve denetim durumunu atomik olarak saklar.
 *
 * @param {string} filePath
 * @param {{now?:()=>Date}} options
 */
export function createStateStore(filePath, { now = () => new Date() } = {}) {
  if (typeof filePath !== "string" || !filePath.trim()) {
    throw new TypeError("Durum dosyası yolu zorunludur.");
  }
  let queue = Promise.resolve();

  async function readDisk() {
    try {
      return normalizeState(JSON.parse(await readFile(filePath, "utf8")));
    } catch (error) {
      if (error.code === "ENOENT") return normalizeState();
      throw error;
    }
  }

  function runExclusive(operation) {
    const pending = queue.then(operation, operation);
    queue = pending.catch(() => {});
    return pending;
  }

  async function read() {
    await queue;
    return structuredClone(await readDisk());
  }

  async function update(mutator) {
    if (typeof mutator !== "function") {
      throw new TypeError("Durum güncelleme fonksiyonu zorunludur.");
    }
    return runExclusive(async () => {
      const current = await readDisk();
      const changed = await mutator(structuredClone(current));
      const next = normalizeState(changed);
      next.savedAt = now().toISOString();
      await atomicWrite(filePath, next);
      return structuredClone(next);
    });
  }

  async function saveSettings({
    settings,
    employees,
    costOverrides,
    actor = "Yönetim",
    expectedRevision,
  }) {
    const nextSettings = structuredClone(plainRecord(settings, "Ayarlar"));
    if (!Array.isArray(employees) || !Array.isArray(costOverrides)) {
      throw new TypeError("Personel ve maliyet kararları dizi olmalı.");
    }
    return runExclusive(async () => {
      const current = await readDisk();
      if (expectedRevision !== undefined && expectedRevision !== current.settingsRevision) {
        throw revisionConflict();
      }
      const revision = current.settingsRevision + 1;
      const occurredAt = now().toISOString();
      const fingerprint = settingsFingerprint(nextSettings, employees, costOverrides);
      const historyEntry = {
        revision,
        action: "save",
        actor: String(actor || "Yönetim").slice(0, 120),
        occurredAt,
        fingerprint,
        settings: nextSettings,
        employees: structuredClone(employees),
        costOverrides: structuredClone(costOverrides),
      };
      const next = normalizeState({
        ...current,
        settings: nextSettings,
        employees,
        costOverrides,
        settingsRevision: revision,
        settingsFingerprint: fingerprint,
        settingsHistory: [...current.settingsHistory, historyEntry].slice(-50),
        auditEvents: [...current.auditEvents, {
          id: randomUUID(),
          action: "settings-saved",
          actor: historyEntry.actor,
          occurredAt,
          revision,
          fingerprint,
        }],
        savedAt: occurredAt,
      });
      await atomicWrite(filePath, next);
      return structuredClone(next);
    });
  }

  async function rollbackSettings({ revision, expectedRevision, actor = "Yönetim" }) {
    if (!Number.isInteger(revision) || revision < 1) {
      throw new RangeError("Geri alınacak ayar revisionı geçersiz.");
    }
    return runExclusive(async () => {
      const current = await readDisk();
      if (expectedRevision !== undefined && expectedRevision !== current.settingsRevision) {
        throw revisionConflict();
      }
      const source = current.settingsHistory.find((entry) => entry.revision === revision);
      if (!source) throw new RangeError("Ayar revisionı bulunamadı.");

      const nextRevision = current.settingsRevision + 1;
      const occurredAt = now().toISOString();
      const settings = structuredClone(source.settings);
      const employees = structuredClone(source.employees || []);
      const costOverrides = structuredClone(source.costOverrides || []);
      const fingerprint = settingsFingerprint(settings, employees, costOverrides);
      const historyEntry = {
        revision: nextRevision,
        action: "rollback",
        sourceRevision: revision,
        actor: String(actor || "Yönetim").slice(0, 120),
        occurredAt,
        fingerprint,
        settings,
        employees,
        costOverrides,
      };
      const next = normalizeState({
        ...current,
        settings,
        employees,
        costOverrides,
        settingsRevision: nextRevision,
        settingsFingerprint: fingerprint,
        settingsHistory: [...current.settingsHistory, historyEntry].slice(-50),
        auditEvents: [...current.auditEvents, {
          id: randomUUID(),
          action: "settings-rolled-back",
          actor: historyEntry.actor,
          occurredAt,
          revision: nextRevision,
          sourceRevision: revision,
          fingerprint,
        }],
        savedAt: occurredAt,
      });
      await atomicWrite(filePath, next);
      return structuredClone(next);
    });
  }

  async function approve({ year, month, snapshot, actor = "Yönetim" }) {
    validPeriod(year, month);
    const approval = plainRecord(snapshot, "Onay snapshotı");
    return update((state) => {
      const yearKey = String(year);
      const monthKey = String(month);
      const approvals = {
        ...state.approvals,
        [yearKey]: {
          ...(state.approvals[yearKey] || {}),
          [monthKey]: structuredClone(approval),
        },
      };
      const event = {
        id: randomUUID(),
        action: "approval-approved",
        year,
        month,
        actor,
        occurredAt: now().toISOString(),
        snapshotHash: approval.snapshotHash ?? null,
      };
      return {
        ...state,
        approvals,
        auditEvents: [...state.auditEvents, event],
      };
    });
  }

  async function reopen({ year, month, actor = "Yönetim" }) {
    validPeriod(year, month);
    return update((state) => {
      const yearKey = String(year);
      const monthKey = String(month);
      const yearApprovals = { ...(state.approvals[yearKey] || {}) };
      const previous = yearApprovals[monthKey];
      if (!previous) throw new RangeError("Onay bulunamadı.");
      delete yearApprovals[monthKey];
      const approvals = {
        ...state.approvals,
        [yearKey]: yearApprovals,
      };
      const event = {
        id: randomUUID(),
        action: "approval-reopened",
        year,
        month,
        actor,
        occurredAt: now().toISOString(),
        snapshotHash: previous?.snapshotHash ?? null,
      };
      return {
        ...state,
        approvals,
        auditEvents: [...state.auditEvents, event],
      };
    });
  }

  return { read, update, saveSettings, rollbackSettings, approve, reopen };
}
