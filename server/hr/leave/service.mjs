import { readHrState, updateHrState } from "../hrStore.mjs";

/**
 * İş Kanunu Madde 53'e göre yıllık izin gün hesabı
 */
export function calculateAnnualEntitlementDays(hireDateStr, birthDateStr, targetYear = new Date().getFullYear()) {
  const hireDate = new Date(hireDateStr);
  const birthDate = new Date(birthDateStr);
  const targetDate = new Date(`${targetYear}-12-31`);

  const age = Math.floor((targetDate - birthDate) / (365.25 * 24 * 60 * 60 * 1000));
  const tenureYears = Math.floor((targetDate - hireDate) / (365.25 * 24 * 60 * 60 * 1000));

  if (tenureYears < 1) return 0;

  let days = 14;
  if (tenureYears > 5 && tenureYears < 15) {
    days = 20;
  } else if (tenureYears >= 15) {
    days = 26;
  }

  // 18 yaş altı veya 50 yaş ve üzeri için min 20 gün yasal kuralı
  if ((age < 18 || age >= 50) && days < 20) {
    days = 20;
  }

  return days;
}

export async function getLeaveBalance(employeeId) {
  const state = await readHrState();
  const ledger = (state.leaveLedger || []).filter(l => l.employeeId === employeeId);

  let entitled = 0;
  let consumed = 0;

  for (const entry of ledger) {
    if (entry.type === "entitlement" || entry.type === "rollover" || entry.type === "adjustment_plus") {
      entitled += entry.days;
    } else if (entry.type === "consumption") {
      consumed += entry.days;
    } else if (entry.type === "adjustment_minus") {
      entitled -= entry.days;
    }
  }

  return {
    employeeId,
    entitledDays: entitled,
    consumedDays: consumed,
    remainingDays: entitled - consumed,
    ledgerHistory: ledger
  };
}

export async function getLeaveRequests({ employeeId, status } = {}) {
  const state = await readHrState();
  let list = state.leaveRequests || [];
  if (employeeId) {
    list = list.filter(r => r.employeeId === employeeId);
  }
  if (status) {
    list = list.filter(r => r.status === status);
  }
  return list;
}

export async function createLeaveRequest({ employeeId, leaveTypeId, startDate, endDate, workDaysCount, reason, documentId, documentName }) {
  if (!employeeId || !startDate || !endDate || !workDaysCount) {
    throw new Error("Çalışan, başlangıç/bitiş tarihi ve gün sayısı zorunludur.");
  }
  const daysNeeded = Number(workDaysCount);
  if (!Number.isFinite(daysNeeded) || daysNeeded <= 0) throw new Error("İzin gün sayısı 0'dan büyük olmalıdır.");

  return updateHrState((state) => {
    const emp = (state.employees || []).find((employee) => employee.id === employeeId);
    if (!emp) throw new Error("Çalışan bulunamadı.");
    const selectedLeaveType = leaveTypeId || "lt-annual";
    if (selectedLeaveType === "lt-annual") {
      const ledger = (state.leaveLedger || []).filter((entry) => entry.employeeId === employeeId);
      const entitled = ledger.reduce((sum, entry) => (
        ["entitlement", "rollover", "adjustment_plus"].includes(entry.type) ? sum + Number(entry.days || 0)
          : entry.type === "adjustment_minus" ? sum - Number(entry.days || 0) : sum
      ), 0);
      const consumed = ledger.reduce((sum, entry) => entry.type === "consumption" ? sum + Number(entry.days || 0) : sum, 0);
      if (entitled - consumed < daysNeeded) {
        throw new Error(`Yetersiz yıllık izin bakiyesi! Kalan: ${entitled - consumed} gün, İstenen: ${daysNeeded} gün.`);
      }
    }
    const hasOverlap = (state.leaveRequests || []).some((request) => request.employeeId === employeeId
      && !["rejected", "cancelled"].includes(request.status)
      && startDate <= request.endDate && endDate >= request.startDate);
    if (hasOverlap) throw new Error("Belirtilen tarihlerde zaten onaylı veya bekleyen bir izin talebi bulunmaktadır.");
    const newRequest = {
      id: `lreq-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      employeeId, leaveTypeId: selectedLeaveType, startDate, endDate, workDaysCount: daysNeeded,
      reason: reason || "", status: "pending", approverId: null,
      documentId: documentId || null, documentName: documentName || null, createdAt: new Date().toISOString(),
    };
    state.leaveRequests = [...(state.leaveRequests || []), newRequest];
    return state;
  }).then((state) => state.leaveRequests.at(-1));
}

export async function approveLeaveRequest({ requestId, approverId }) {
  let approvedRequest;
  await updateHrState((state) => {
    const request = (state.leaveRequests || []).find((entry) => entry.id === requestId);
    if (!request) throw new Error("İzin talebi bulunamadı.");
    if (request.status !== "pending") throw new Error("Yalnızca bekleyen talepler onaylanabilir.");
    if (approverId && request.employeeId === approverId) throw new Error("Kendi izin talebinizi onaylayamazsınız.");
    const updated = { ...request, status: "approved", approverId: approverId || "system-hr", approvedAt: new Date().toISOString() };
    state.leaveRequests = state.leaveRequests.map((entry) => entry.id === requestId ? updated : entry);
    state.leaveLedger = [...(state.leaveLedger || []), {
      id: `lleg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, type: "consumption", days: request.workDaysCount,
      effectiveDate: request.startDate, description: `İzin Kullanımı (${request.startDate} - ${request.endDate})`, createdAt: new Date().toISOString(),
    }];
    approvedRequest = updated;
    return state;
  });
  return approvedRequest;
}

export async function rejectLeaveRequest({ requestId, approverId, reason }) {
  let rejectedRequest;
  await updateHrState((state) => {
    const request = (state.leaveRequests || []).find((entry) => entry.id === requestId);
    if (!request) throw new Error("İzin talebi bulunamadı.");
    if (request.status !== "pending") throw new Error("Yalnızca bekleyen talepler reddedilebilir.");
    const updated = { ...request, status: "rejected", approverId: approverId || "system-hr", rejectionReason: reason || "", rejectedAt: new Date().toISOString() };
    state.leaveRequests = state.leaveRequests.map((entry) => entry.id === requestId ? updated : entry);
    rejectedRequest = updated;
    return state;
  });
  return rejectedRequest;
}
