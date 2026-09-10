import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const DOCS_DIR = path.resolve(process.cwd(), "data/hr-documents");

export async function ensureDocsDir() {
  await fs.mkdir(DOCS_DIR, { recursive: true });
}

export async function saveDocument(buffer, originalName, mimeType) {
  const content = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || "");
  const ext = path.extname(String(originalName || "")).toLowerCase();
  const signatures = {
    ".pdf": { mime: "application/pdf", valid: (value) => value.subarray(0, 5).toString() === "%PDF-" },
    ".png": { mime: "image/png", valid: (value) => value.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
    ".jpg": { mime: "image/jpeg", valid: (value) => value.subarray(0, 3).equals(Buffer.from([255, 216, 255])) },
    ".jpeg": { mime: "image/jpeg", valid: (value) => value.subarray(0, 3).equals(Buffer.from([255, 216, 255])) },
    ".gif": { mime: "image/gif", valid: (value) => ["GIF87a", "GIF89a"].includes(value.subarray(0, 6).toString()) },
    ".webp": { mime: "image/webp", valid: (value) => value.subarray(0, 4).toString() === "RIFF" && value.subarray(8, 12).toString() === "WEBP" },
  };
  const signature = signatures[ext];
  if (!signature || String(mimeType || "").toLowerCase() !== signature.mime || !signature.valid(content)) {
    const error = new Error("Desteklenmeyen veya geçersiz belge içeriği.");
    error.code = "INVALID_DOCUMENT_CONTENT";
    error.status = 400;
    throw error;
  }
  await ensureDocsDir();
  const fileId = crypto.randomUUID();
  const fileName = `${fileId}${ext}`;

  const filePath = path.join(DOCS_DIR, fileName);
  await fs.writeFile(filePath, content);

  return {
    id: fileId,
    fileName,
    originalName: String(originalName || ""),
    mimeType: signature.mime,
    createdAt: new Date().toISOString()
  };
}

export async function getDocumentPath(fileName) {
  // Path traversal saldırılarına karşı koruma
  const safeName = path.basename(fileName);
  const filePath = path.join(DOCS_DIR, safeName);
  
  try {
    await fs.access(filePath);
    return filePath;
  } catch {
    throw new Error("Belge bulunamadı veya erişilemiyor.");
  }
}
