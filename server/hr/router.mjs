import express from "express";
import multer from "multer";
import { saveDocument, getDocumentPath } from "./documentStore.mjs";
import { processPdksFile } from "./attendance/pdksParser.mjs";
import { getEmployees, getEmployeeById, createEmployee, updateEmployee } from "./employees/service.mjs";
import { getLeaveBalance, getLeaveRequests, createLeaveRequest, approveLeaveRequest, rejectLeaveRequest } from "./leave/service.mjs";
import { getAttendanceRecords, recordAttendance, getTimesheetSummary } from "./attendance/service.mjs";
import { getOvertimeRequests, createOvertimeRequest, approveOvertimeRequest, rejectOvertimeRequest } from "./overtime/service.mjs";
import { getPayrollDrafts, generatePayrollDraft, approvePayrollStep } from "./payroll/service.mjs";

export function createHrRouter({ requireCapability } = {}) {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

  const authorize = (capability) => {
    if (typeof requireCapability === "function") {
      return requireCapability(capability);
    }
    return (_req, res) => res.status(403).json({ error: { code: "FORBIDDEN", message: "Bu işlem için yetki gerekli." } });
  };

  const authenticatedActor = (req, suppliedActor) => {
    const actor = String(req.nexusUser?.username || "").trim();
    if (!actor) {
      const error = new Error("Kimlik doğrulama gerekli.");
      error.status = 401;
      error.code = "AUTHENTICATION_REQUIRED";
      throw error;
    }
    if (suppliedActor && String(suppliedActor).trim() !== actor) {
      const error = new Error("Onaylayan kullanıcı oturum kullanıcısıyla eşleşmiyor.");
      error.status = 403;
      error.code = "ACTOR_MISMATCH";
      throw error;
    }
    return actor;
  };

  // Employees
  router.get("/employees", authorize("employees:read"), async (req, res) => {
    try {
      const list = await getEmployees(req.query);
      res.json({ employees: list });
    } catch (err) {
      res.status(500).json({ error: { code: "EMPLOYEE_FETCH_FAILED", message: err.message } });
    }
  });

  router.get("/employees/:id", authorize("employees:read"), async (req, res) => {
    try {
      const employee = await getEmployeeById(req.params.id);
      if (!employee) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Çalışan bulunamadı." } });
      }
      res.json({ employee });
    } catch (err) {
      res.status(500).json({ error: { code: "EMPLOYEE_FETCH_FAILED", message: err.message } });
    }
  });

  router.post("/employees", authorize("employees:write"), async (req, res) => {
    try {
      const created = await createEmployee(req.body);
      res.status(201).json({ employee: created });
    } catch (err) {
      res.status(err.status || 400).json({ error: { code: err.code || "EMPLOYEE_CREATE_FAILED", message: err.message } });
    }
  });

  router.put("/employees/:id", authorize("employees:write"), async (req, res) => {
    try {
      const updated = await updateEmployee(req.params.id, req.body);
      res.json({ employee: updated });
    } catch (err) {
      res.status(err.status || 400).json({ error: { code: err.code || "EMPLOYEE_UPDATE_FAILED", message: err.message } });
    }
  });

  // Documents
  router.post("/documents", authorize("leave:apply"), upload.single("file"), async (req, res) => {
    try {
      if (!req.file) throw new Error("Dosya yüklenmedi.");
      const doc = await saveDocument(req.file.buffer, req.file.originalname, req.file.mimetype);
      res.status(201).json({ document: doc });
    } catch (err) {
      res.status(400).json({ error: { code: "DOCUMENT_UPLOAD_FAILED", message: err.message } });
    }
  });

  router.get("/documents/:fileName", authorize("leave:read"), async (req, res) => {
    try {
      const filePath = await getDocumentPath(req.params.fileName);
      res.sendFile(filePath);
    } catch (err) {
      res.status(404).json({ error: { code: "DOCUMENT_NOT_FOUND", message: err.message } });
    }
  });

  // Leaves
  router.get("/leaves/balance/:employeeId", authorize("leave:read"), async (req, res) => {
    try {
      const balance = await getLeaveBalance(req.params.employeeId);
      res.json(balance);
    } catch (err) {
      res.status(500).json({ error: { code: "LEAVE_BALANCE_FAILED", message: err.message } });
    }
  });

  router.get("/leaves/requests", authorize("leave:read"), async (req, res) => {
    try {
      const list = await getLeaveRequests(req.query);
      res.json({ requests: list });
    } catch (err) {
      res.status(500).json({ error: { code: "LEAVE_REQUESTS_FAILED", message: err.message } });
    }
  });

  router.post("/leaves/requests", authorize("leave:apply"), async (req, res) => {
    try {
      const created = await createLeaveRequest(req.body);
      res.status(201).json({ request: created });
    } catch (err) {
      res.status(400).json({ error: { code: "LEAVE_CREATE_FAILED", message: err.message } });
    }
  });

  router.post("/leaves/approve", authorize("leave:approve"), async (req, res) => {
    try {
      const { requestId, approverId } = req.body;
      const actor = authenticatedActor(req, approverId);
      const approved = await approveLeaveRequest({ requestId, approverId: actor });
      res.json({ request: approved });
    } catch (err) {
      const status = err.status === 401 || err.status === 403 ? err.status : 400;
      res.status(status).json({ error: { code: err.code || "LEAVE_APPROVE_FAILED", message: err.message } });
    }
  });

  router.post("/leaves/reject", authorize("leave:approve"), async (req, res) => {
    try {
      const { requestId, approverId, reason } = req.body;
      const actor = authenticatedActor(req, approverId);
      const rejected = await rejectLeaveRequest({ requestId, approverId: actor, reason });
      res.json({ request: rejected });
    } catch (err) {
      const status = err.status === 401 || err.status === 403 ? err.status : 400;
      res.status(status).json({ error: { code: err.code || "LEAVE_REJECT_FAILED", message: err.message } });
    }
  });

  // Attendance
  router.get("/attendance/records", authorize("attendance:read"), async (req, res) => {
    try {
      const records = await getAttendanceRecords(req.query);
      res.json({ records });
    } catch (err) {
      res.status(500).json({ error: { code: "ATTENDANCE_FETCH_FAILED", message: err.message } });
    }
  });

  router.post("/attendance/records", authorize("attendance:record"), async (req, res) => {
    try {
      const record = await recordAttendance(req.body);
      res.json({ record });
    } catch (err) {
      res.status(400).json({ error: { code: "ATTENDANCE_RECORD_FAILED", message: err.message } });
    }
  });

  router.post("/attendance/pdks-upload", authorize("attendance:record"), upload.single("file"), async (req, res) => {
    try {
      if (!req.file) throw new Error("PDKS dosyası bulunamadı.");
      const result = await processPdksFile(req.file.buffer);
      res.json({ result });
    } catch (err) {
      res.status(400).json({ error: { code: "PDKS_SYNC_FAILED", message: err.message } });
    }
  });

  router.get("/attendance/summary", authorize("attendance:read"), async (req, res) => {
    try {
      const summary = await getTimesheetSummary(req.query);
      res.json({ summary });
    } catch (err) {
      res.status(500).json({ error: { code: "TIMESHEET_SUMMARY_FAILED", message: err.message } });
    }
  });

  // Overtime
  router.get("/overtimes", authorize("overtime:read"), async (req, res) => {
    try {
      const list = await getOvertimeRequests(req.query);
      res.json({ overtimes: list });
    } catch (err) {
      res.status(500).json({ error: { code: "OVERTIME_FETCH_FAILED", message: err.message } });
    }
  });

  router.post("/overtimes", authorize("overtime:apply"), async (req, res) => {
    try {
      const created = await createOvertimeRequest(req.body);
      res.status(201).json({ overtime: created });
    } catch (err) {
      res.status(400).json({ error: { code: "OVERTIME_CREATE_FAILED", message: err.message } });
    }
  });

  router.post("/overtimes/approve", authorize("overtime:approve"), async (req, res) => {
    try {
      const { requestId, approverId } = req.body;
      const actor = authenticatedActor(req, approverId);
      const approved = await approveOvertimeRequest({ requestId, approverId: actor });
      res.json({ overtime: approved });
    } catch (err) {
      const status = err.status === 401 || err.status === 403 ? err.status : 400;
      res.status(status).json({ error: { code: err.code || "OVERTIME_APPROVE_FAILED", message: err.message } });
    }
  });

  router.post("/overtimes/reject", authorize("overtime:approve"), async (req, res) => {
    try {
      const { requestId, approverId, reason } = req.body;
      const actor = authenticatedActor(req, approverId);
      const rejected = await rejectLeaveRequest({ requestId, approverId: actor, reason });
      res.json({ overtime: rejected });
    } catch (err) {
      const status = err.status === 401 || err.status === 403 ? err.status : 400;
      res.status(status).json({ error: { code: err.code || "OVERTIME_REJECT_FAILED", message: err.message } });
    }
  });

  // Payroll
  router.get("/payrolls", authorize("payroll:read"), async (req, res) => {
    try {
      const list = await getPayrollDrafts(req.query);
      res.json({ payrolls: list });
    } catch (err) {
      res.status(500).json({ error: { code: "PAYROLL_FETCH_FAILED", message: err.message } });
    }
  });

  router.post("/payrolls/generate", authorize("payroll:calculate"), async (req, res) => {
    try {
      const draft = await generatePayrollDraft(req.body);
      res.status(201).json({ payroll: draft });
    } catch (err) {
      res.status(400).json({ error: { code: "PAYROLL_GENERATE_FAILED", message: err.message } });
    }
  });

  router.post("/payrolls/approve", authorize("payroll:finalize"), async (req, res) => {
    try {
      const { draftId, actorUsername } = req.body;
      const actor = authenticatedActor(req, actorUsername);
      const updated = await approvePayrollStep({ draftId, actorUsername: actor });
      res.json({ payroll: updated });
    } catch (err) {
      res.status(400).json({ error: { code: "PAYROLL_APPROVE_FAILED", message: err.message } });
    }
  });

  return router;
}
