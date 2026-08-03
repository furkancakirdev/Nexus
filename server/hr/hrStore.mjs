import fs from "fs/promises";
import path from "path";

const HR_STATE_FILE = process.env.HR_STATE_FILE || path.join(process.cwd(), "data", "hr-state.json");

const DEFAULT_HR_STATE = {
  revision: 1,
  updatedAt: new Date().toISOString(),
  employees: [
    {
      id: "emp-001",
      employeeNo: "MY-001",
      name: "BIRCAN",
      email: "bircan@marlin.com.tr",
      department: "Muhasebe & Finans",
      title: "Muhasebe Sorumlusu",
      managerId: null,
      hireDate: "2020-01-15",
      birthDate: "1988-05-12",
      grossSalary: 65000,
      status: "active",
      cpmActorCode: "BIRCAN",
      revision: 1
    },
    {
      id: "emp-002",
      employeeNo: "MY-002",
      name: "YATMARIN",
      email: "yatmarin@marlin.com.tr",
      department: "Servis",
      title: "Servis Merkezi Yöneticisi",
      managerId: null,
      hireDate: "2021-03-01",
      birthDate: "1985-09-20",
      grossSalary: 85000,
      status: "active",
      cpmActorCode: "YATMARIN",
      revision: 1
    },
    {
      id: "emp-003",
      employeeNo: "MY-003",
      name: "DENİZ",
      email: "deniz@marlin.com.tr",
      department: "Yedek Parça Satış",
      title: "Satış Uzmanı",
      managerId: "emp-002",
      hireDate: "2022-06-10",
      birthDate: "1994-11-05",
      grossSalary: 55000,
      status: "active",
      cpmActorCode: "DENIZ",
      revision: 1
    }
  ],
  organization: [
    { id: "org-1", code: "SERVİS", name: "Servis Departmanı", managerId: "emp-002" },
    { id: "org-2", code: "SATIŞ", name: "Yedek Parça Satış Departmanı", managerId: "emp-002" },
    { id: "org-3", code: "MUHASEBE", name: "Muhasebe & Finans", managerId: "emp-001" }
  ],
  leaveTypes: [
    { id: "lt-annual", code: "ANNUAL", name: "Yıllık Ücretli İzin", paid: true, requiresDocument: false },
    { id: "lt-sick", code: "SICK", name: "Hastalık / Rapor İzni", paid: true, requiresDocument: true },
    { id: "lt-unpaid", code: "UNPAID", name: "Ücretsiz İzin", paid: false, requiresDocument: false },
    { id: "lt-maternity", code: "MATERNITY", name: "Analık / Babalık İzni", paid: true, requiresDocument: true }
  ],
  leaveLedger: [
    {
      id: "lleg-1",
      employeeId: "emp-001",
      leaveTypeId: "lt-annual",
      type: "entitlement",
      days: 20,
      effectiveDate: "2026-01-01",
      description: "2026 Yılı Hak Edişi (6. Yıl Kıdem)",
      createdAt: "2026-01-01T00:00:00.000Z"
    },
    {
      id: "lleg-2",
      employeeId: "emp-002",
      leaveTypeId: "lt-annual",
      type: "entitlement",
      days: 20,
      effectiveDate: "2026-01-01",
      description: "2026 Yılı Hak Edişi (5. Yıl Kıdem)",
      createdAt: "2026-01-01T00:00:00.000Z"
    },
    {
      id: "lleg-3",
      employeeId: "emp-003",
      leaveTypeId: "lt-annual",
      type: "entitlement",
      days: 14,
      effectiveDate: "2026-01-01",
      description: "2026 Yılı Hak Edişi (4. Yıl Kıdem)",
      createdAt: "2026-01-01T00:00:00.000Z"
    }
  ],
  leaveRequests: [],
  attendanceRecords: [],
  overtimeRequests: [],
  payrollDrafts: []
};

let memoryState = null;

async function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

export async function readHrState() {
  if (memoryState) return memoryState;
  try {
    const raw = await fs.readFile(HR_STATE_FILE, "utf-8");
    memoryState = JSON.parse(raw);
    return memoryState;
  } catch (err) {
    if (err.code === "ENOENT") {
      memoryState = JSON.parse(JSON.stringify(DEFAULT_HR_STATE));
      await writeHrState(memoryState);
      return memoryState;
    }
    throw err;
  }
}

export async function writeHrState(newState) {
  await ensureDir(HR_STATE_FILE);
  const updatedState = {
    ...newState,
    revision: (newState.revision || 0) + 1,
    updatedAt: new Date().toISOString()
  };
  const tempFile = `${HR_STATE_FILE}.tmp.${Date.now()}`;
  await fs.writeFile(tempFile, JSON.stringify(updatedState, null, 2), "utf-8");
  await fs.rename(tempFile, HR_STATE_FILE);
  memoryState = updatedState;
  return updatedState;
}

export async function resetHrMemoryStateForTest() {
  memoryState = null;
  try {
    await fs.rm(HR_STATE_FILE, { force: true });
  } catch {
    // Diskteki durum temizlenemezse sonraki okuma mevcut dosyayı kullanır; test izolasyonu buna güvenmemelidir.
  }
}
