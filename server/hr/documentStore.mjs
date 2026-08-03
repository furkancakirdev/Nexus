import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const DOCS_DIR = path.resolve(process.cwd(), "data/hr-documents");

export async function ensureDocsDir() {
  await fs.mkdir(DOCS_DIR, { recursive: true });
}

export async function saveDocument(buffer, originalName, mimeType) {
  await ensureDocsDir();
  const fileId = crypto.randomUUID();
  // Güvenli uzantı kontrolü
  const ext = path.extname(originalName).toLowerCase();
  const allowedExts = [".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp"];
  const safeExt = allowedExts.includes(ext) ? ext : ".bin";
  const fileName = `${fileId}${safeExt}`;
  
  const filePath = path.join(DOCS_DIR, fileName);
  await fs.writeFile(filePath, buffer);
  
  return {
    id: fileId,
    fileName,
    originalName,
    mimeType,
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
