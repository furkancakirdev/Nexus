import assert from "node:assert/strict";
import test from "node:test";
import { normalizePilotEmployees } from "../shared/employeePolicy.mjs";

test("eski personel departmanlarını iki ticari departmana taşır", () => {
  const source = [
    {
      id: "old-service",
      code: "X1",
      department: "Atölye Teknik",
      status: "Çalışan",
    },
    {
      id: "accounting",
      code: "BIRCAN",
      department: "Muhasebe",
      status: "active",
    },
    {
      id: "office-6",
      name: "Mehmet Kara",
      department: "Merkez Ofis",
      status: "bilinmeyen",
      included: false,
    },
  ];

  const result = normalizePilotEmployees(source);

  assert.deepEqual(
    result.map((employee) => employee.department),
    ["service", "parts", "service"],
  );
  assert.deepEqual(
    result.map((employee) => employee.status),
    ["employee", "employee", "inactive"],
  );
  assert.equal(source[0].department, "Atölye Teknik");
});

test("bozuk personel listesi sessizce dağıtıma girmez", () => {
  for (const invalid of [null, {}, "personel"]) {
    assert.throws(
      () => normalizePilotEmployees(invalid),
      /personel listesi dizi/i,
    );
  }
});
