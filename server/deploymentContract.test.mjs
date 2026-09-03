import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("üretim imajı sunucunun ortak politika modüllerini içerir", async () => {
  const policy = await readFile(
    new URL("../shared/targetPolicy.mjs", import.meta.url),
    "utf8",
  );

  assert.match(policy, /export function buildDepartmentTargets/);
});

test("runtime image exposes the release metadata contract used before prewarm", async () => {
  const releaseContract = await readFile(
    new URL("../server/releaseContract.mjs", import.meta.url),
    "utf8",
  );

  assert.match(releaseContract, /export function buildRuntimeInfo/);
  assert.match(releaseContract, /export function buildReadinessPayload/);
});
