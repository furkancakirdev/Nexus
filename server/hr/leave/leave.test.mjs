import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateAnnualEntitlementDays,
  getLeaveBalance,
  getLeaveRequests,
  createLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest
} from "./service.mjs";
import { resetHrMemoryStateForTest } from "../hrStore.mjs";

test("calculateAnnualEntitlementDays follows İş Kanunu 4857 rules", () => {
  // 3 yıllık kıdem (1-5 yıl arası) -> 14 gün
  assert.equal(calculateAnnualEntitlementDays("2023-01-01", "1990-01-01", 2026), 14);

  // 8 yıllık kıdem (5-15 yıl arası) -> 20 gün
  assert.equal(calculateAnnualEntitlementDays("2018-01-01", "1988-01-01", 2026), 20);

  // 16 yıllık kıdem (15+ yıl) -> 26 gün
  assert.equal(calculateAnnualEntitlementDays("2010-01-01", "1985-01-01", 2026), 26);

  // 52 yaşında, 3 yıl kıdem -> min 20 gün kuralı!
  assert.equal(calculateAnnualEntitlementDays("2023-01-01", "1974-01-01", 2026), 20);
});

test("Leave service handles request creation, balance check and approval flow", async () => {
  await resetHrMemoryStateForTest();

  // Initial balance for emp-001 is 20 days
  const initialBalance = await getLeaveBalance("emp-001");
  assert.equal(initialBalance.remainingDays, 20);

  // Create request for 5 days
  const req = await createLeaveRequest({
    employeeId: "emp-001",
    leaveTypeId: "lt-annual",
    startDate: "2026-06-01",
    endDate: "2026-06-05",
    workDaysCount: 5,
    reason: "Yaz tatili"
  });

  assert.equal(req.status, "pending");
  assert.equal(req.workDaysCount, 5);

  // Self-approval must fail!
  await assert.rejects(
    async () => {
      await approveLeaveRequest({ requestId: req.id, approverId: "emp-001" });
    },
    { message: "Kendi izin talebinizi onaylayamazsınız." }
  );

  // Manager/HR approval
  const approved = await approveLeaveRequest({ requestId: req.id, approverId: "emp-002" });
  assert.equal(approved.status, "approved");

  // Check updated balance (20 - 5 = 15)
  const updatedBalance = await getLeaveBalance("emp-001");
  assert.equal(updatedBalance.remainingDays, 15);
});
