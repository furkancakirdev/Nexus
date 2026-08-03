import { readHrState, writeHrState } from "../hrStore.mjs";

const MINIMUM_WAGE_GROSS_2026 = 20002.50;
const SGK_TABAN = MINIMUM_WAGE_GROSS_2026;
const SGK_TAVAN = MINIMUM_WAGE_GROSS_2026 * 7.5; // 150,018.75 TL

/**
 * 2026 Türkiye Gelir Vergisi Dilim Tarifesi
 */
const TAX_BRACKETS_2026 = [
  { limit: 110000, rate: 0.15 },
  { limit: 230000, rate: 0.20 },
  { limit: 870000, rate: 0.27 },
  { limit: 3000000, rate: 0.35 },
  { limit: Infinity, rate: 0.40 }
];

export function calculateIncomeTax(monthlyBase, cumulativeBase = 0) {
  let remainingBase = monthlyBase;
  let tax = 0;
  let currentCum = cumulativeBase;

  for (let i = 0; i < TAX_BRACKETS_2026.length; i++) {
    const prevLimit = i === 0 ? 0 : TAX_BRACKETS_2026[i - 1].limit;
    const currentLimit = TAX_BRACKETS_2026[i].limit;
    const rate = TAX_BRACKETS_2026[i].rate;

    if (currentCum < currentLimit && remainingBase > 0) {
      const roomInBracket = currentLimit - currentCum;
      const taxableInThisBracket = Math.min(remainingBase, roomInBracket);
      tax += taxableInThisBracket * rate;
      remainingBase -= taxableInThisBracket;
      currentCum += taxableInThisBracket;
    }
  }
  return Math.round(tax * 100) / 100;
}

export function calculateSingleEmployeePayroll({ employee, grossSalary, cumulativeTaxBase = 0, overtimePay = 0 }) {
  const totalGross = Number(grossSalary) + Number(overtimePay);

  // SGK Matrahı (Taban / Tavan Sınırları)
  const sgkBase = Math.min(Math.max(totalGross, SGK_TABAN), SGK_TAVAN);
  const sgkWorker = Math.round(sgkBase * 0.14 * 100) / 100; // %14 SGK İşçi
  const unemploymentWorker = Math.round(sgkBase * 0.01 * 100) / 100; // %1 İşsizlik

  // Gelir Vergisi Matrahı
  const monthlyTaxBase = Math.max(0, totalGross - sgkWorker - unemploymentWorker);

  // Brüt Gelir Vergisi
  const grossIncomeTax = calculateIncomeTax(monthlyTaxBase, cumulativeTaxBase);

  // Asgari Ücret Vergi İstisnası Hesabı
  const minWageSgkWorker = Math.round(MINIMUM_WAGE_GROSS_2026 * 0.14 * 100) / 100;
  const minWageUnemployment = Math.round(MINIMUM_WAGE_GROSS_2026 * 0.01 * 100) / 100;
  const minWageTaxBase = MINIMUM_WAGE_GROSS_2026 - minWageSgkWorker - minWageUnemployment;
  const minWageTaxExemption = calculateIncomeTax(minWageTaxBase, 0);

  // Net Gelir Vergisi
  const netIncomeTax = Math.max(0, Math.round((grossIncomeTax - minWageTaxExemption) * 100) / 100);

  // Damga Vergisi (%0.759) ve İstisnası
  const grossStampDuty = Math.round(totalGross * 0.00759 * 100) / 100;
  const minWageStampExemption = Math.round(MINIMUM_WAGE_GROSS_2026 * 0.00759 * 100) / 100;
  const netStampDuty = Math.max(0, Math.round((grossStampDuty - minWageStampExemption) * 100) / 100);

  // Toplam Kesintiler ve Net Ücret
  const totalDeductions = Math.round((sgkWorker + unemploymentWorker + netIncomeTax + netStampDuty) * 100) / 100;
  const netPay = Math.round((totalGross - totalDeductions) * 100) / 100;

  return {
    employeeId: employee.id,
    employeeNo: employee.employeeNo,
    name: employee.name,
    department: employee.department,
    grossSalary: Number(grossSalary),
    overtimePay: Number(overtimePay),
    totalGross,
    sgkBase,
    sgkWorker,
    unemploymentWorker,
    monthlyTaxBase,
    cumulativeTaxBaseBefore: cumulativeTaxBase,
    cumulativeTaxBaseAfter: cumulativeTaxBase + monthlyTaxBase,
    grossIncomeTax,
    taxExemption: minWageTaxExemption,
    netIncomeTax,
    grossStampDuty,
    netStampDuty,
    totalDeductions,
    netPay
  };
}

export async function getPayrollDrafts({ year, month } = {}) {
  const state = await readHrState();
  let list = state.payrollDrafts || [];
  if (year) {
    list = list.filter(p => p.year === Number(year));
  }
  if (month) {
    list = list.filter(p => p.month === Number(month));
  }
  return list;
}

export async function generatePayrollDraft({ year, month }) {
  if (!year || !month) {
    throw new Error("Yıl ve ay zorunludur.");
  }
  const state = await readHrState();
  const activeEmployees = (state.employees || []).filter(e => e.status === "active");

  const records = activeEmployees.map(emp => {
    // Toplam onaylı mesai tutarı hesabı
    const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
    const approvedOvertimes = (state.overtimeRequests || []).filter(o =>
      o.employeeId === emp.id && o.status === "approved" && o.date.startsWith(monthPrefix)
    );

    const hourlyRate = (emp.grossSalary || 40000) / 225; // 225 saat aylık yasal çalışma
    let overtimePay = 0;
    for (const ot of approvedOvertimes) {
      overtimePay += ot.hours * hourlyRate * (ot.multiplier || 1.5);
    }
    overtimePay = Math.round(overtimePay * 100) / 100;

    return calculateSingleEmployeePayroll({
      employee: emp,
      grossSalary: emp.grossSalary || 40000,
      cumulativeTaxBase: (month - 1) * ((emp.grossSalary || 40000) * 0.85), // Tahmini kümülatif matrah
      overtimePay
    });
  });

  const totalGross = records.reduce((sum, r) => sum + r.totalGross, 0);
  const totalNet = records.reduce((sum, r) => sum + r.netPay, 0);
  const totalSgk = records.reduce((sum, r) => sum + r.sgkWorker + r.unemploymentWorker, 0);
  const totalTax = records.reduce((sum, r) => sum + r.netIncomeTax, 0);

  const existingIndex = state.payrollDrafts.findIndex(p => p.year === Number(year) && p.month === Number(month));
  const draft = {
    id: existingIndex !== -1 ? state.payrollDrafts[existingIndex].id : `pay-${year}-${month}-${Date.now()}`,
    year: Number(year),
    month: Number(month),
    status: "draft",
    totalGross: Math.round(totalGross * 100) / 100,
    totalNet: Math.round(totalNet * 100) / 100,
    totalSgk: Math.round(totalSgk * 100) / 100,
    totalTax: Math.round(totalTax * 100) / 100,
    recordsCount: records.length,
    records,
    finalizedBy1: null,
    finalizedBy2: null,
    updatedAt: new Date().toISOString()
  };

  if (existingIndex !== -1) {
    state.payrollDrafts[existingIndex] = draft;
  } else {
    state.payrollDrafts.push(draft);
  }

  await writeHrState(state);
  return draft;
}

export async function approvePayrollStep({ draftId, actorUsername }) {
  if (!actorUsername) throw new Error("Onaylayan kullanıcı adı zorunludur.");
  const state = await readHrState();
  const draft = state.payrollDrafts.find(p => p.id === draftId);
  if (!draft) throw new Error("Bordro taslağı bulunamadı.");

  if (!draft.finalizedBy1) {
    draft.finalizedBy1 = actorUsername;
    draft.status = "step1_approved";
  } else if (!draft.finalizedBy2) {
    if (draft.finalizedBy1 === actorUsername) {
      throw new Error("Dört-göz ilkesi gereği 2. onayı birinci onaylayandan farklı bir yetkili vermelidir.");
    }
    draft.finalizedBy2 = actorUsername;
    draft.status = "finalized";
    draft.finalizedAt = new Date().toISOString();
  }

  await writeHrState(state);
  return draft;
}
