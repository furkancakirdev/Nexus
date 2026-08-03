import { readHrState, writeHrState } from "../hrStore.mjs";

export async function getOvertimeRequests({ employeeId, status } = {}) {
  const state = await readHrState();
  let list = state.overtimeRequests || [];
  if (employeeId) {
    list = list.filter(o => o.employeeId === employeeId);
  }
  if (status) {
    list = list.filter(o => o.status === status);
  }
  return list;
}

export async function createOvertimeRequest({ employeeId, date, hours, isHoliday = false, reason = "" }) {
  if (!employeeId || !date || !hours) {
    throw new Error("Çalışan, tarih ve fazla mesai saati zorunludur.");
  }
  const numHours = Number(hours);
  if (numHours <= 0) throw new Error("Mesai saati 0'dan büyük olmalıdır.");

  const state = await readHrState();
  const emp = state.employees.find(e => e.id === employeeId);
  if (!emp) throw new Error("Çalışan bulunamadı.");

  const multiplier = isHoliday ? 2.0 : 1.5;

  const newReq = {
    id: `ot-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    employeeId,
    date,
    hours: numHours,
    isHoliday: Boolean(isHoliday),
    multiplier,
    reason,
    status: "pending",
    approvedBy: null,
    createdAt: new Date().toISOString()
  };

  state.overtimeRequests.push(newReq);
  await writeHrState(state);
  return newReq;
}

export async function approveOvertimeRequest({ requestId, approverId }) {
  const state = await readHrState();
  const req = state.overtimeRequests.find(o => o.id === requestId);
  if (!req) throw new Error("Fazla mesai talebi bulunamadı.");
  if (req.status !== "pending") throw new Error("Yalnızca bekleyen talepler onaylanabilir.");

  if (approverId && req.employeeId === approverId) {
    throw new Error("Kendi fazla mesai talebinizi onaylayamazsınız.");
  }

  req.status = "approved";
  req.approvedBy = approverId || "system-hr";
  req.approvedAt = new Date().toISOString();

  await writeHrState(state);
  return req;
}

export async function rejectOvertimeRequest({ requestId, approverId, reason }) {
  const state = await readHrState();
  const req = state.overtimeRequests.find(o => o.id === requestId);
  if (!req) throw new Error("Fazla mesai talebi bulunamadı.");
  if (req.status !== "pending") throw new Error("Yalnızca bekleyen talepler reddedilebilir.");

  req.status = "rejected";
  req.approvedBy = approverId || "system-hr";
  req.rejectionReason = reason || "";
  req.rejectedAt = new Date().toISOString();

  await writeHrState(state);
  return req;
}
