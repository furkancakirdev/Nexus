import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { detectSecurityFindings } from "../server/securityScan.mjs";

const root = path.resolve(import.meta.dirname, "..");
const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".cjs"]);
const sourceRoots = ["server", "shared", "src", "scripts"];

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (["node_modules", "dist", ".temp_files", ".wrongstack", ".worktrees"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(absolute));
    else if (sourceExtensions.has(path.extname(entry.name))) files.push(absolute);
  }
  return files;
}

async function checkFormat() {
  await new Promise((resolve, reject) => {
    const child = spawn("git", ["diff", "--check"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error("Formatting gate failed: git diff --check")));
  });
}

async function checkSyntax(files) {
  for (const file of files.filter((candidate) => path.extname(candidate) !== ".jsx")) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["--check", file], { stdio: "inherit" });
      child.once("error", reject);
      child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Syntax check failed: ${path.relative(root, file)}`)));
    });
  }
}

async function checkSecrets(files) {
  const findings = detectSecurityFindings(await Promise.all(files
    .filter((file) => !file.endsWith(".test.mjs") && !file.endsWith(".test.js"))
    .map(async (file) => ({
      path: path.relative(root, file),
      contents: await readFile(file, "utf8"),
    }))));
  const actionable = findings.filter(({ kind }) => ["credential-literal", "tls-bypass", "certificate-verification-disabled"].includes(kind));
  if (actionable.length) throw new Error(`Secret/security scan failed: ${actionable.map(({ path: file, line, kind }) => `${file}:${line}:${kind}`).join(", ")}`);
}

const mode = process.argv[2];
const files = (await Promise.all(sourceRoots.map((name) => sourceFiles(path.join(root, name))))).flat();
if (mode === "format") await checkFormat();
else if (mode === "lint" || mode === "typecheck") await checkSyntax(files);
else if (mode === "secrets") await checkSecrets(files);
else throw new Error("Usage: node scripts/quality-gates.mjs <format|lint|typecheck|secrets>");
console.log(`quality gate passed: ${mode} (${files.length} source files)`);
