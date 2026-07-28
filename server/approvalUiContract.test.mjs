import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Onay ekranı sunucu aylık onay API sözleşmesini kullanır", async () => {
  const source = await readFile(
    new URL("../src/ApprovalPage.jsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /fetch\(`\/api\/approvals\?year=\$\{year\}`/);
  assert.match(source, /method:\s*["']PUT["']/);
  assert.match(source, /\/reopen/);
  assert.match(source, /marlin-approval-migration-/);
  assert.match(source, /approval\??\.stale/);
  assert.match(source, /Hedef bandı/);
  assert.doesNotMatch(source, /const saveApprovals/);
});
