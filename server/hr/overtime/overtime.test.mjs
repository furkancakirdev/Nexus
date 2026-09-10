import test from "node:test";
import assert from "node:assert/strict";
import { getOvertimeRequests, createOvertimeRequest, approveOvertimeRequest, rejectOvertimeRequest } from "./service.mjs";
import { resetHrMemoryStateForTest } from "../hrStore.mjs";

test("Overtime service calculates multipliers and handles approval rules", async () => {
  await resetHrMemoryStateForTest();

  // Normal overtime -> multiplier 1.5
  const req1 = await createOvertimeRequest({
    employeeId: "emp-001",
    date: "2026-05-10",
    hours: 3,
    isHoliday: false,
    reason: "Proje teslimi"
  });

  assert.equal(req1.multiplier, 1.5);
  assert.equal(req1.status, "pending");

  // Holiday overtime -> multiplier 2.0
  const req2 = await createOvertimeRequest({
    employeeId: "emp-001",
    date: "2026-05-19",
    hours: 8,
    isHoliday: true,
    reason: "19 Mayıs Tatili Nöbeti"
  });

  assert.equal(req2.multiplier, 2.0);

  // Self-approval must fail
  await assert.rejects(
    async () => {
      await approveOvertimeRequest({ requestId: req1.id, approverId: "emp-001" });
    },
    { message: "Kendi fazla mesai talebinizi onaylayamazsınız." }
  );

  // Manager approval
  const approved = await approveOvertimeRequest({ requestId: req1.id, approverId: "emp-002" });
  assert.equal(approved.status, "approved");

  await assert.rejects(
    () => createOvertimeRequest({ employeeId: "emp-001", date: "2026-05-19", hours: 8, isHoliday: true, reason: "19 Mayıs Tatili Nöbeti" }),
    { message: "Aynı fazla mesai talebi zaten mevcut." },
  );
});

test("concurrent overtime approvals permit exactly one state transition", async () => {
  await resetHrMemoryStateForTest();
  const request = await createOvertimeRequest({ employeeId: "emp-001", date: "2026-06-11", hours: 2, reason: "Eşzamanlı onay testi" });
  const results = await Promise.allSettled([
    approveOvertimeRequest({ requestId: request.id, approverId: "emp-002" }),
    approveOvertimeRequest({ requestId: request.id, approverId: "emp-003" }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
});
