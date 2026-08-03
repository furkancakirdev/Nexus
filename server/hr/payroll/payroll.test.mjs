import test from "node:test";
import assert from "node:assert/strict";
import { calculateIncomeTax, calculateSingleEmployeePayroll, generatePayrollDraft, approvePayrollStep } from "./service.mjs";
import { resetHrMemoryStateForTest } from "../hrStore.mjs";

test("calculateIncomeTax handles progressive tax brackets correctly", () => {
  // 50,000 TL matrah -> %15 tax = 7,500 TL
  assert.equal(calculateIncomeTax(50000, 0), 7500);

  // Kümülatif 100,000 TL'deyken 30,000 TL matrah: 10,000 TL'si %15 (1500), 20,000 TL'si %20 (4000) = 5500 TL
  assert.equal(calculateIncomeTax(30000, 100000), 5500);
});

test("calculateSingleEmployeePayroll computes net pay, SGK, income tax exemption", () => {
  const result = calculateSingleEmployeePayroll({
    employee: { id: "emp-test", employeeNo: "T1", name: "TEST", department: "Servis" },
    grossSalary: 65000,
    cumulativeTaxBase: 0,
    overtimePay: 0
  });

  assert.equal(result.totalGross, 65000);
  assert.equal(result.sgkWorker, 9100); // 65000 * 0.14
  assert.equal(result.unemploymentWorker, 650); // 65000 * 0.01
  assert.equal(result.monthlyTaxBase, 55250); // 65000 - 9750
  assert.ok(result.taxExemption > 0); // Asgari ücret vergi istisnası düşüldü
  assert.ok(result.netPay > 0 && result.netPay < result.totalGross);
});

test("Payroll draft generation and 4-eye dual authorization flow", async () => {
  await resetHrMemoryStateForTest();

  const draft = await generatePayrollDraft({ year: 2026, month: 5 });
  assert.equal(draft.year, 2026);
  assert.equal(draft.month, 5);
  assert.equal(draft.status, "draft");
  assert.ok(draft.records.length >= 3);

  // 1st approval by user1
  const step1 = await approvePayrollStep({ draftId: draft.id, actorUsername: "hr_manager" });
  assert.equal(step1.status, "step1_approved");
  assert.equal(step1.finalizedBy1, "hr_manager");

  // Same user approval must fail due to 4-eye rule!
  await assert.rejects(
    async () => {
      await approvePayrollStep({ draftId: draft.id, actorUsername: "hr_manager" });
    },
    { message: "Dört-göz ilkesi gereği 2. onayı birinci onaylayandan farklı bir yetkili vermelidir." }
  );

  // 2nd approval by distinct user
  const finalized = await approvePayrollStep({ draftId: draft.id, actorUsername: "finance_director" });
  assert.equal(finalized.status, "finalized");
  assert.equal(finalized.finalizedBy2, "finance_director");
});
