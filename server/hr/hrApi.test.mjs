import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createHrRouter } from "./router.mjs";
import { resetHrMemoryStateForTest } from "./hrStore.mjs";

test("HR Express Router handles all REST endpoints", async () => {
  await resetHrMemoryStateForTest();

  const app = express();
  app.use(express.json());
  app.use("/api/hr", createHrRouter());

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/hr`;

  try {
    // GET /employees
    const resEmp = await fetch(`${baseUrl}/employees`);
    assert.equal(resEmp.status, 200);
    const dataEmp = await resEmp.json();
    assert.ok(Array.isArray(dataEmp.employees));

    // GET /leaves/balance/emp-001
    const resBal = await fetch(`${baseUrl}/leaves/balance/emp-001`);
    assert.equal(resBal.status, 200);
    const dataBal = await resBal.json();
    assert.equal(dataBal.employeeId, "emp-001");
    assert.ok(dataBal.remainingDays > 0);

    // POST /leaves/requests
    const resLreq = await fetch(`${baseUrl}/leaves/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: "emp-001",
        leaveTypeId: "lt-annual",
        startDate: "2026-07-10",
        endDate: "2026-07-12",
        workDaysCount: 3,
        reason: "Yaz izni"
      })
    });
    assert.equal(resLreq.status, 201);
    const dataLreq = await resLreq.json();
    assert.equal(dataLreq.request.status, "pending");

    // POST /attendance/records
    const resAtt = await fetch(`${baseUrl}/attendance/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: "emp-001",
        date: "2026-07-01",
        checkIn: "08:30",
        checkOut: "17:30",
        breakMinutes: 60
      })
    });
    assert.equal(resAtt.status, 200);

    // POST /overtimes
    const resOt = await fetch(`${baseUrl}/overtimes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: "emp-001",
        date: "2026-07-05",
        hours: 4,
        isHoliday: false,
        reason: "Mesai"
      })
    });
    assert.equal(resOt.status, 201);

    // POST /payrolls/generate
    const resPayGen = await fetch(`${baseUrl}/payrolls/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: 2026, month: 7 })
    });
    assert.equal(resPayGen.status, 201);
    const dataPayGen = await resPayGen.json();
    assert.equal(dataPayGen.payroll.status, "draft");
    assert.ok(dataPayGen.payroll.records.length >= 3);

  } finally {
    server.close();
  }
});

test("HR employee endpoints enforce capability and return single employee", async () => {
  await resetHrMemoryStateForTest();

  const denied = [];
  const app = express();
  app.use(express.json());
  app.use("/api/hr", createHrRouter({
    requireCapability: (capability) => (req, res, next) => {
      denied.push(capability);
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Yetersiz yetki." } });
    }
  }));

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/hr`;

  try {
    // Capability kontrolü: employees:read olmadan listeleme 403 döner.
    const resList = await fetch(`${baseUrl}/employees`);
    assert.equal(resList.status, 403);
    assert.ok(denied.includes("employees:read"));

    // GET /employees/emp-001 yetkisizken 403.
    const resById = await fetch(`${baseUrl}/employees/emp-001`);
    assert.equal(resById.status, 403);
    assert.ok(denied.includes("employees:read"));

    // Capability'siz router: GET /employees/:id çalışır.
    const appOpen = express();
    appOpen.use(express.json());
    appOpen.use("/api/hr", createHrRouter());
    const serverOpen = appOpen.listen(0);
    const portOpen = serverOpen.address().port;
    const baseUrlOpen = `http://127.0.0.1:${portOpen}/api/hr`;
    try {
      const resFound = await fetch(`${baseUrlOpen}/employees/emp-001`);
      assert.equal(resFound.status, 200);
      const found = await resFound.json();
      assert.equal(found.employee.id, "emp-001");

      const resMissing = await fetch(`${baseUrlOpen}/employees/emp-yok`);
      assert.equal(resMissing.status, 404);
      const missing = await resMissing.json();
      assert.equal(missing.error.code, "NOT_FOUND");
    } finally {
      serverOpen.close();
    }
  } finally {
    server.close();
  }
});
