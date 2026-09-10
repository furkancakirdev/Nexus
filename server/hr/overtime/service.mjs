import { readHrState, updateHrState } from "../hrStore.mjs";

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

  let newReq;
  await updateHrState((state) => {
    const emp = (state.employees || []).find(e => e.id === employeeId);
    if (!emp) throw new Error("Çalışan bulunamadı.");

    const duplicate = (state.overtimeRequests || []).some((request) =>
      request.employeeId === employeeId && request.date === date && request.status !== "rejected"
      && Number(request.hours) === numHours
    );
    if (duplicate) throw new Error("Aynı fazla mesai talebi zaten mevcut.");

    const multiplier = isHoliday ? 2.0 : 1.5;
    newReq = {
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
    state.overtimeRequests = [...(state.overtimeRequests || []), newReq];
    return state;
  });
  return newReq;
}

export async function approveOvertimeRequest({ requestId, approverId }) {
  let approved;
  await updateHrState((state) => {
    const req = (state.overtimeRequests || []).find(o => o.id === requestId);
    if (!req) throw new Error("Fazla mesai talebi bulunamadı.");
    if (req.status !== "pending") throw new Error("Yalnızca bekleyen talepler onaylanabilir.");
    if (approverId && req.employeeId === approverId) {
      throw new Error("Kendi fazla mesai talebinizi onaylayamazsınız.");
    }
    approved = { ...req, status: "approved", approvedBy: approverId || "system-hr", approvedAt: new Date().toISOString() };
    state.overtimeRequests = state.overtimeRequests.map((entry) => entry.id === requestId ? approved : entry);
    return state;
  });
  return approved;
}

export async function rejectOvertimeRequest({ requestId, approverId, reason }) {
  let rejected;
  await updateHrState((state) => {
    const req = (state.overtimeRequests || []).find(o => o.id === requestId);
    if (!req) throw new Error("Fazla mesai talebi bulunamadı.");
    if (req.status !== "pending") throw new Error("Yalnızca bekleyen talepler reddedilebilir.");
    rejected = { ...req, status: "rejected", approvedBy: approverId || "system-hr", rejectionReason: reason || "", rejectedAt: new Date().toISOString() };
    state.overtimeRequests = state.overtimeRequests.map((entry) => entry.id === requestId ? rejected : entry);
    return state;
  });
  return rejected;
}
