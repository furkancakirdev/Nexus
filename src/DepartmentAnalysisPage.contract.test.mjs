import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("departman sorumlu görünümü teyitsiz adayları resmi performanstan ayırır", async () => {
  const source = await readFile(new URL("./DepartmentAnalysisPage.jsx", import.meta.url), "utf8");

  assert.match(source, /data\.topOwners \|\| \[\]\)\.filter\(\(item\) => isOfficialOwnerRankingCandidate\(item\)/);
  assert.match(source, /Kanıt adayı sorumlular/);
  assert.match(source, /data\.ownerEvidenceTotals \|\| \[\]/);
  assert.match(source, /resmi performans sıralamasına dahil değildir/);
  assert.match(source, /İnceleme gerekli/);
});
