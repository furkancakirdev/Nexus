import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { saveDocument, getDocumentPath } from "./documentStore.mjs";

const docsDir = path.resolve(process.cwd(), "data/hr-documents");

test("document store saves a valid PDF, generates UUID, and normalizes extension", async () => {
  const result = await saveDocument(Buffer.from("%PDF-1.7\n"), "test_file.PDF", "application/pdf");
  assert.ok(result.id);
  assert.ok(result.fileName.endsWith(".pdf"));
  assert.equal(result.originalName, "test_file.PDF");
  const filePath = await getDocumentPath(result.fileName);
  await fs.unlink(filePath);
});

test("document store rejects unsafe or unknown extensions", async () => {
  await assert.rejects(
    saveDocument(Buffer.from("test content"), "test_file.exe.bat", "application/octet-stream"),
    (error) => error.code === "INVALID_DOCUMENT_CONTENT" && error.status === 400,
  );
});

test("document store rejects extension, MIME, and content spoofing", async () => {
  await assert.rejects(
    saveDocument(Buffer.from("not an image"), "statement.png", "image/png"),
    (error) => error.code === "INVALID_DOCUMENT_CONTENT" && error.status === 400,
  );
  await assert.rejects(
    saveDocument(Buffer.from("%PDF-1.7\n"), "statement.pdf", "image/png"),
    (error) => error.code === "INVALID_DOCUMENT_CONTENT" && error.status === 400,
  );
});

test("document store prevents path traversal when retrieving documents", async () => {
  await assert.rejects(
    getDocumentPath("../../../etc/passwd"),
    /Belge bulunamadı veya erişilemiyor/,
  );
});
