import test from "node:test";
import assert from "node:assert/strict";
import { calculateWorkedMinutes, getAttendanceRecords, recordAttendance, getTimesheetSummary } from "./service.mjs";
import { resetHrMemoryStateForTest } from "../hrStore.mjs";

test("calculateWorkedMinutes handles standard shifts and break deduction", () => {
  // 08:30 - 17:30 (9 hours gross = 540 mins, 60 mins break = 480 mins net / 8 hours)
  assert.equal(calculateWorkedMinutes("08:30", "17:30", 60), 480);

  // Gece vardiyası: 22:00 - 06:00 (8 hours gross = 480 mins, 30 mins break = 450 mins net)
  assert.equal(calculateWorkedMinutes("22:00", "06:00", 30), 450);
});

test("Attendance service records punches and generates monthly summary", async () => {
  await resetHrMemoryStateForTest();

  await recordAttendance({
    employeeId: "emp-001",
    date: "2026-05-04",
    checkIn: "08:30",
    checkOut: "17:30",
    breakMinutes: 60
  });

  await recordAttendance({
    employeeId: "emp-001",
    date: "2026-05-05",
    checkIn: "09:15",
    checkOut: "17:30",
    breakMinutes: 60
  });

  const records = await getAttendanceRecords({ employeeId: "emp-001", month: 5, year: 2026 });
  assert.equal(records.length, 2);

  const summary = await getTimesheetSummary({ employeeId: "emp-001", month: 5, year: 2026 });
  assert.equal(summary.totalRecords, 2);
  assert.equal(summary.normalDays, 1);
  assert.equal(summary.lateDays, 1);
});
