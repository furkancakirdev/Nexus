import { apiFetch } from "../api.js";

export async function fetchEmployees(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await apiFetch(`/api/hr/employees?${query}`);
  if (!res.ok) throw new Error("Personel listesi alınamadı.");
  return res.json();
}

export async function fetchEmployeeById(id) {
  const res = await apiFetch(`/api/hr/employees/${id}`);
  if (!res.ok) throw new Error("Personel kaydı alınamadı.");
  const body = await res.json();
  return body.employee;
}

export async function saveEmployee(data) {
  const res = await apiFetch("/api/hr/employees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message || "Personel eklenemedi.");
  return body.employee;
}

export async function updateEmployee(id, data) {
  const res = await apiFetch(`/api/hr/employees/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message || "Personel güncellenemedi.");
  return body.employee;
}

export async function fetchLeaveBalance(employeeId) {
  const res = await apiFetch(`/api/hr/leaves/balance/${employeeId}`);
  if (!res.ok) throw new Error("İzin bakiyesi alınamadı.");
  return res.json();
}

export async function fetchLeaveRequests(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await apiFetch(`/api/hr/leaves/requests?${query}`);
  if (!res.ok) throw new Error("İzin talepleri alınamadı.");
  return res.json();
}

export async function createLeaveRequest(data) {
  const res = await apiFetch("/api/hr/leaves/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message || "İzin talebi oluşturulamadı.");
  return body.request;
}

export async function approveLeaveRequest(requestId) {
  const res = await apiFetch("/api/hr/leaves/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId })
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message || "İzin onaylanamadı.");
  return body.request;
}

export async function rejectLeaveRequest(requestId, reason) {
  const res = await apiFetch("/api/hr/leaves/reject", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId, reason })
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message || "İzin reddedilemedi.");
  return body.request;
}

export async function fetchAttendanceRecords(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await apiFetch(`/api/hr/attendance/records?${query}`);
  if (!res.ok) throw new Error("Puantaj kayıtları alınamadı.");
  return res.json();
}

export async function recordAttendance(data) {
  const res = await apiFetch("/api/hr/attendance/records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message || "Puantaj kaydı eklenemedi.");
  return body.record;
}

export async function fetchTimesheetSummary(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await apiFetch(`/api/hr/attendance/summary?${query}`);
  if (!res.ok) throw new Error("Puantaj özeti alınamadı.");
  return res.json();
}

export async function fetchOvertimeRequests(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await apiFetch(`/api/hr/overtimes?${query}`);
  if (!res.ok) throw new Error("Fazla mesai talepleri alınamadı.");
  return res.json();
}

export async function createOvertimeRequest(data) {
  const res = await apiFetch("/api/hr/overtimes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message || "Fazla mesai eklenemedi.");
  return body.overtime;
}

export async function approveOvertimeRequest(requestId) {
  const res = await apiFetch("/api/hr/overtimes/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId })
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message || "Mesai onaylanamadı.");
  return body.overtime;
}

export async function fetchPayrollDrafts(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await apiFetch(`/api/hr/payrolls?${query}`);
  if (!res.ok) throw new Error("Bordro listesi alınamadı.");
  return res.json();
}

export async function generatePayrollDraft(year, month) {
  const res = await apiFetch("/api/hr/payrolls/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ year, month })
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message || "Bordro hesaplanamadı.");
  return body.payroll;
}

export async function approvePayrollStep(draftId) {
  const res = await apiFetch("/api/hr/payrolls/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draftId })
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message || "Bordro onaylanamadı.");
  return body.payroll;
}

export async function uploadDocument(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await apiFetch("/api/hr/documents", {
    method: "POST",
    body: formData
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message || "Belge yüklenemedi.");
  return body.document;
}

export async function uploadPdksFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await apiFetch("/api/hr/attendance/pdks-upload", {
    method: "POST",
    body: formData
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message || "PDKS dosyası yüklenemedi.");
  return body.result;
}

