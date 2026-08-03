import { readHrState, writeHrState } from "../hrStore.mjs";

const EMPLOYEE_STATUSES = new Set(["active", "suspended", "terminated", "archived"]);
const EMPLOYEE_NO_PATTERN = /^[A-Z0-9._-]{2,20}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function validateEmployeeInput(data, { partial = false } = {}) {
  if (!partial || data.name !== undefined) {
    if (typeof data.name !== "string" || !data.name.trim()) {
      throw httpError(400, "VALIDATION_ERROR", "Çalışan adı zorunludur.");
    }
  }
  if (!partial || data.employeeNo !== undefined) {
    if (typeof data.employeeNo !== "string" || !EMPLOYEE_NO_PATTERN.test(data.employeeNo)) {
      throw httpError(400, "VALIDATION_ERROR", "Sicil numarası 2-20 karakter A-Z/0-9/._- olmalıdır.");
    }
  }
  if (data.status !== undefined && !EMPLOYEE_STATUSES.has(data.status)) {
    throw httpError(400, "VALIDATION_ERROR", `Geçersiz durum: '${data.status}' (active/suspended/terminated/archived).`);
  }
  if (data.hireDate !== undefined && !ISO_DATE_PATTERN.test(data.hireDate)) {
    throw httpError(400, "VALIDATION_ERROR", "İşe giriş tarihi YYYY-MM-DD biçiminde olmalıdır.");
  }
  if (data.grossSalary !== undefined) {
    const salary = Number(data.grossSalary);
    if (!Number.isFinite(salary) || salary < 0) {
      throw httpError(400, "VALIDATION_ERROR", "Brüt ücret geçersiz.");
    }
  }
  if (data.managerId !== undefined && data.managerId !== null && typeof data.managerId !== "string") {
    throw httpError(400, "VALIDATION_ERROR", "Yönetici kimliği geçersiz.");
  }
}

export async function getEmployees({ department, status } = {}) {
  const state = await readHrState();
  let list = state.employees || [];
  if (department) {
    list = list.filter((employee) => employee.department?.toLowerCase() === department.toLowerCase());
  }
  if (status) {
    list = list.filter((employee) => employee.status === status);
  }
  return list;
}

export async function getEmployeeById(id) {
  const state = await readHrState();
  return (state.employees || []).find((employee) => employee.id === id) || null;
}

export async function createEmployee(data) {
  validateEmployeeInput(data);
  if (!data.department || typeof data.department !== "string") {
    throw httpError(400, "VALIDATION_ERROR", "Departman zorunludur.");
  }
  const state = await readHrState();
  const exists = (state.employees || []).some((employee) => employee.employeeNo === data.employeeNo);
  if (exists) {
    throw httpError(409, "CONFLICT", `'${data.employeeNo}' sicil numaralı çalışan zaten mevcut.`);
  }

  const newEmployee = {
    id: `emp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    employeeNo: data.employeeNo,
    name: data.name.trim(),
    email: typeof data.email === "string" ? data.email : "",
    department: data.department,
    title: typeof data.title === "string" && data.title ? data.title : "Çalışan",
    managerId: data.managerId || null,
    hireDate: data.hireDate || new Date().toISOString().split("T")[0],
    birthDate: data.birthDate || "1990-01-01",
    grossSalary: data.grossSalary !== undefined ? Number(data.grossSalary) : 0,
    status: data.status || "active",
    cpmActorCode: typeof data.cpmActorCode === "string" && data.cpmActorCode ? data.cpmActorCode : data.name.toUpperCase(),
    revision: 1
  };

  state.employees.push(newEmployee);
  await writeHrState(state);
  return newEmployee;
}

export async function updateEmployee(id, updates) {
  if (typeof id !== "string" || !id) {
    throw httpError(400, "VALIDATION_ERROR", "Çalışan kimliği zorunludur.");
  }
  validateEmployeeInput(updates, { partial: true });

  const state = await readHrState();
  const index = (state.employees || []).findIndex((employee) => employee.id === id);
  if (index === -1) {
    throw httpError(404, "NOT_FOUND", "Çalışan bulunamadı.");
  }

  const current = state.employees[index];
  const expectedRevision = updates.expectedRevision !== undefined ? Number(updates.expectedRevision) : null;
  if (expectedRevision !== null && expectedRevision !== (current.revision || 1)) {
    throw httpError(409, "CONFLICT", `Çalışan kaydı başka bir işlemle güncellendi (beklenen revizyon ${expectedRevision}, mevcut ${current.revision}).`);
  }

  if (updates.managerId === id) {
    throw httpError(400, "VALIDATION_ERROR", "Çalışan kendi yöneticisi olamaz.");
  }

  const { expectedRevision: _ignored, ...cleanUpdates } = updates;
  const updated = {
    ...current,
    ...cleanUpdates,
    revision: (current.revision || 1) + 1
  };

  state.employees[index] = updated;
  await writeHrState(state);
  return updated;
}
