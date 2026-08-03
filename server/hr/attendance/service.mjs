import { readHrState, writeHrState } from "../hrStore.mjs";

export function calculateWorkedMinutes(checkInStr, checkOutStr, breakMinutes = 60) {
  if (!checkInStr || !checkOutStr) return 0;
  const [inH, inM] = checkInStr.split(":").map(Number);
  const [outH, outM] = checkOutStr.split(":").map(Number);

  let inTotal = inH * 60 + inM;
  let outTotal = outH * 60 + outM;

  // Gece yarısını aşan vardiyalar
  if (outTotal < inTotal) {
    outTotal += 24 * 60;
  }

  const grossMinutes = outTotal - inTotal;
  const netMinutes = Math.max(0, grossMinutes - Number(breakMinutes));
  return netMinutes;
}

export async function getAttendanceRecords({ employeeId, date, month, year } = {}) {
  const state = await readHrState();
  let list = state.attendanceRecords || [];
  if (employeeId) {
    list = list.filter(a => a.employeeId === employeeId);
  }
  if (date) {
    list = list.filter(a => a.date === date);
  }
  if (month && year) {
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    list = list.filter(a => a.date.startsWith(prefix));
  }
  return list;
}

export async function recordAttendance({ employeeId, date, checkIn, checkOut, breakMinutes = 60, statusNote = "" }) {
  if (!employeeId || !date) {
    throw new Error("Çalışan ve tarih zorunludur.");
  }
  const state = await readHrState();
  const emp = state.employees.find(e => e.id === employeeId);
  if (!emp) throw new Error("Çalışan bulunamadı.");

  const workedMinutes = calculateWorkedMinutes(checkIn, checkOut, breakMinutes);
  let status = "normal";

  if (!checkIn || !checkOut) {
    status = "missing_punch";
  } else if (checkIn > "09:00") {
    status = "late";
  }

  const existingIndex = state.attendanceRecords.findIndex(a => a.employeeId === employeeId && a.date === date);
  const record = {
    id: existingIndex !== -1 ? state.attendanceRecords[existingIndex].id : `att-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    employeeId,
    date,
    checkIn: checkIn || null,
    checkOut: checkOut || null,
    breakMinutes: Number(breakMinutes),
    workedMinutes,
    status,
    statusNote,
    updatedAt: new Date().toISOString()
  };

  if (existingIndex !== -1) {
    state.attendanceRecords[existingIndex] = record;
  } else {
    state.attendanceRecords.push(record);
  }

  await writeHrState(state);
  return record;
}

export async function getTimesheetSummary({ employeeId, month, year }) {
  const records = await getAttendanceRecords({ employeeId, month, year });
  let totalWorkedMinutes = 0;
  let normalDays = 0;
  let lateDays = 0;
  let missingPunchDays = 0;

  for (const r of records) {
    totalWorkedMinutes += r.workedMinutes || 0;
    if (r.status === "normal") normalDays++;
    else if (r.status === "late") lateDays++;
    else if (r.status === "missing_punch") missingPunchDays++;
  }

  return {
    employeeId,
    year,
    month,
    totalRecords: records.length,
    totalWorkedHours: Math.round((totalWorkedMinutes / 60) * 10) / 10,
    normalDays,
    lateDays,
    missingPunchDays
  };
}
