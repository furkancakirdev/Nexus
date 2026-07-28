import { mkdir, open, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

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

  return { read, update, approve, reopen };
}
