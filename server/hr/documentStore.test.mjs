import { describe, it } from "node:test";
import assert from "node:assert";
import { saveDocument, getDocumentPath } from "./documentStore.mjs";
import fs from "fs/promises";

describe("Document Store Security and Operations", () => {
  it("should save document, generate UUID and sanitize extension", async () => {
    const buffer = Buffer.from("test content");
    const result = await saveDocument(buffer, "test_file.PDF", "application/pdf");
    
    assert.ok(result.id);
    assert.ok(result.fileName.endsWith(".pdf")); // Lowercase and safe
    assert.strictEqual(result.originalName, "test_file.PDF");
    
    // Clean up
    const filePath = await getDocumentPath(result.fileName);
    await fs.unlink(filePath);
  });

  it("should use .bin for unsafe or unknown extensions", async () => {
    const buffer = Buffer.from("test content");
    const result = await saveDocument(buffer, "test_file.exe.bat", "application/octet-stream");
    
    assert.ok(result.fileName.endsWith(".bin")); // Sanitized fallback
    
    const filePath = await getDocumentPath(result.fileName);
    await fs.unlink(filePath);
  });
  
  it("should prevent path traversal when retrieving documents", async () => {
    await assert.rejects(
      getDocumentPath("../../../etc/passwd"),
      /Belge bulunamadı veya erişilemiyor/
    );
  });
});
