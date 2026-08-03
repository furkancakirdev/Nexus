import { describe, it } from "node:test";
import assert from "node:assert";
import { processPdksFile } from "./pdksParser.mjs";
import { writeHrState } from "../hrStore.mjs";

describe("PDKS CSV Parser and Sync", () => {
  it("should parse valid CSV, sync attendance, and skip invalid rows", async () => {
    // Setup dummy employee
    await writeHrState({
      employees: [{ id: "EMP-01", name: "Test User" }],
      attendanceRecords: [],
      leaveRequests: [],
      leaveLedger: [],
      overtimeRequests: [],
      payrollDrafts: []
    });

    const csvData = `EmployeeID,Date,CheckIn,CheckOut\nEMP-01,2026-08-01,08:30,17:30\nINVALID,2026-08-01,08:00,18:00\n`;
    const buffer = Buffer.from(csvData);
    
    const result = await processPdksFile(buffer);
    
    assert.strictEqual(result.totalRecords, 2);
    assert.strictEqual(result.successCount, 1);
    assert.strictEqual(result.errorCount, 1);
    
    // Check if the error correctly caught the missing employee
    assert.ok(result.errors[0].includes("Çalışan bulunamadı"));
  });

  it("should handle different column names case-insensitively", async () => {
    const csvData = `personel no,Tarih,GİRİŞ,Çıkış\nEMP-01,2026-08-02,09:00,18:00\n`;
    const buffer = Buffer.from(csvData);
    
    const result = await processPdksFile(buffer);
    
    assert.strictEqual(result.totalRecords, 1);
    assert.strictEqual(result.successCount, 1);
    assert.strictEqual(result.errorCount, 0);
  });
});
