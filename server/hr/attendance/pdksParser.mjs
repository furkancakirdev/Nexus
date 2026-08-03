import { parse } from "csv-parse/sync";
import { recordAttendance } from "./service.mjs";

export async function processPdksFile(fileBuffer) {
  const fileContent = fileBuffer.toString("utf-8");
  
  // Varsayılan format (başlıklı CSV): EmployeeID, Date, CheckIn, CheckOut
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  let successCount = 0;
  const errors = [];

  for (const [index, row] of records.entries()) {
    try {
      const normalizedRow = {};
      for (const key of Object.keys(row)) {
        normalizedRow[key.toLowerCase()] = row[key];
      }

      const employeeId = normalizedRow["employeeid"] || normalizedRow["personel no"];
      const date = normalizedRow["date"] || normalizedRow["tarih"];
      const checkIn = normalizedRow["checkin"] || normalizedRow["giriş"] || normalizedRow["giris"];
      const checkOut = normalizedRow["checkout"] || normalizedRow["çıkış"] || normalizedRow["cikis"];

      if (!employeeId || !date) {
        throw new Error("Çalışan Kimliği (EmployeeID) ve Tarih (Date) zorunludur.");
      }

      await recordAttendance({
        employeeId,
        date,
        checkIn: checkIn || null,
        checkOut: checkOut || null,
        breakMinutes: 60,
        statusNote: "PDKS üzerinden aktarıldı."
      });

      successCount++;
    } catch (err) {
      errors.push(`Satır ${index + 2}: ${err.message}`);
    }
  }

  return {
    totalRecords: records.length,
    successCount,
    errorCount: errors.length,
    errors
  };
}
