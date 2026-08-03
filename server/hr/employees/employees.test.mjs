import test from "node:test";
import assert from "node:assert/strict";
import { getEmployees, getEmployeeById, createEmployee, updateEmployee } from "./service.mjs";
import { resetHrMemoryStateForTest } from "../hrStore.mjs";

test("Employee service manages lifecycle", async () => {
  await resetHrMemoryStateForTest();
  const list = await getEmployees();
  assert.ok(list.length >= 3);

  const emp1 = await getEmployeeById("emp-001");
  assert.equal(emp1.name, "BIRCAN");

  const created = await createEmployee({
    employeeNo: "MY-999",
    name: "AHMET YILMAZ",
    email: "ahmet@marlin.com.tr",
    department: "Servis",
    grossSalary: 60000
  });

  assert.equal(created.employeeNo, "MY-999");
  assert.equal(created.grossSalary, 60000);
  assert.equal(created.status, "active");
  assert.equal(created.revision, 1);

  const updated = await updateEmployee(created.id, { title: "Kıdemli Teknisyen", grossSalary: 70000 });
  assert.equal(updated.title, "Kıdemli Teknisyen");
  assert.equal(updated.grossSalary, 70000);
  assert.equal(updated.revision, 2);
});

test("Employee service rejects duplicate employee numbers with conflict", async () => {
  await resetHrMemoryStateForTest();
  await assert.rejects(
    () => createEmployee({ employeeNo: "MY-001", name: "KOPYA", department: "Servis" }),
    (error) => error.code === "CONFLICT" && error.status === 409
  );
});

test("Employee service validates input", async () => {
  await resetHrMemoryStateForTest();
  await assert.rejects(
    () => createEmployee({ employeeNo: "MY-100", department: "Servis" }),
    (error) => error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () => createEmployee({ employeeNo: "x y", name: "ADI", department: "Servis" }),
    (error) => error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () => createEmployee({ employeeNo: "MY-100", name: "ADI", department: "Servis", status: "bogus" }),
    (error) => error.code === "VALIDATION_ERROR"
  );
});

test("Employee service enforces optimistic concurrency", async () => {
  await resetHrMemoryStateForTest();
  const created = await createEmployee({ employeeNo: "MY-777", name: "REVİZYON", department: "Servis" });
  assert.equal(created.revision, 1);

  await assert.rejects(
    () => updateEmployee(created.id, { title: "Yeni", expectedRevision: 9 }),
    (error) => error.code === "CONFLICT" && error.status === 409
  );

  const updated = await updateEmployee(created.id, { title: "Yeni", expectedRevision: 1 });
  assert.equal(updated.revision, 2);
});

test("Employee service prevents self-management", async () => {
  await resetHrMemoryStateForTest();
  const created = await createEmployee({ employeeNo: "MY-888", name: "YÖNETİCİ", department: "Servis" });
  await assert.rejects(
    () => updateEmployee(created.id, { managerId: created.id }),
    (error) => error.code === "VALIDATION_ERROR"
  );
});

test("Employee service returns null for unknown id", async () => {
  await resetHrMemoryStateForTest();
  const missing = await getEmployeeById("emp-yok");
  assert.equal(missing, null);
});
