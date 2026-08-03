import { readHrState, writeHrState } from "../hrStore.mjs";

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
  const state = await readHrState();
  const emp = state.employees.find(e => e.id === employeeId);
  if (!emp) throw new Error("Çalışan bulunamadı.");

  const daysNeeded = Number(workDaysCount);
  if (daysNeeded <= 0) throw new Error("İzin gün sayısı 0'dan büyük olmalıdır.");

  // Yıllık izin bakiye kontrolü
  if (leaveTypeId === "lt-annual") {
    const balance = await getLeaveBalance(employeeId);
    if (balance.remainingDays < daysNeeded) {
      throw new Error(`Yetersiz yıllık izin bakiyesi! Kalan: ${balance.remainingDays} gün, İstenen: ${daysNeeded} gün.`);
    }
  }

  // Çakışan talep kontrolü
  const hasOverlap = state.leaveRequests.some(r =>
    r.employeeId === employeeId &&
    r.status !== "rejected" &&
    r.status !== "cancelled" &&
    ((startDate >= r.startDate && startDate <= r.endDate) ||
     (endDate >= r.startDate && endDate <= r.endDate))
  );

  if (hasOverlap) {
    throw new Error("Belirtilen tarihlerde zaten onaylı veya bekleyen bir izin talebi bulunmaktadır.");
  }

  const newRequest = {
    id: `lreq-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    employeeId,
    leaveTypeId: leaveTypeId || "lt-annual",
    startDate,
    endDate,
    workDaysCount: daysNeeded,
    reason: reason || "",
    status: "pending",
    approverId: null,
    documentId: documentId || null,
    documentName: documentName || null,
    createdAt: new Date().toISOString()
  };

  state.leaveRequests.push(newRequest);
  await writeHrState(state);
  return newRequest;
}

export async function approveLeaveRequest({ requestId, approverId }) {
  const state = await readHrState();
  const req = state.leaveRequests.find(r => r.id === requestId);
  if (!req) throw new Error("İzin talebi bulunamadı.");
  if (req.status !== "pending") throw new Error("Yalnızca bekleyen talepler onaylanabilir.");

  // Kendi talebini onaylama yasağı
  if (approverId && req.employeeId === approverId) {
    throw new Error("Kendi izin talebinizi onaylayamazsınız.");
  }

  req.status = "approved";
  req.approverId = approverId || "system-hr";
  req.approvedAt = new Date().toISOString();

  // Bakiye defterine tüketim hareketi yaz
  state.leaveLedger.push({
    id: `lleg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    employeeId: req.employeeId,
    leaveTypeId: req.leaveTypeId,
    type: "consumption",
    days: req.workDaysCount,
    effectiveDate: req.startDate,
    description: `İzin Kullanımı (${req.startDate} - ${req.endDate})`,
    createdAt: new Date().toISOString()
  });

  await writeHrState(state);
  return req;
}

export async function rejectLeaveRequest({ requestId, approverId, reason }) {
  const state = await readHrState();
  const req = state.leaveRequests.find(r => r.id === requestId);
  if (!req) throw new Error("İzin talebi bulunamadı.");
  if (req.status !== "pending") throw new Error("Yalnızca bekleyen talepler reddedilebilir.");

  req.status = "rejected";
  req.approverId = approverId || "system-hr";
  req.rejectionReason = reason || "";
  req.rejectedAt = new Date().toISOString();

  await writeHrState(state);
  return req;
}
