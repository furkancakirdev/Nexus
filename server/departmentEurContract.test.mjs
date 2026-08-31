import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

async function source(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("departman analizi ortak EUR sepeti ve kanıtlı kur sözleşmesine bağlanır", async () => {
  const appSource = await source("src/App.jsx");
  const departmentSource = await source("src/DepartmentAnalysisPage.jsx");

  assert.match(appSource, /<DepartmentAnalysisPage[\s\S]*eurRateSets=\{eurRateSets\}/);
  assert.match(departmentSource, /eurRateSets = \{\}/);
  assert.match(departmentSource, /byCurrency/);
  assert.match(departmentSource, /eurEquivalent/);
  assert.match(departmentSource, /Halkbank alış kuru/);
  assert.match(departmentSource, /selectedMetric\?\.eurEquivalent/);
  assert.doesNotMatch(departmentSource, /selectedMetric\?\.byCurrency\s*&&\s*selectedMetric\?\.eurEquivalent/);
});
