import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("üretim imajı sunucunun ortak politika modüllerini içerir", async () => {
  const dockerfile = await readFile(
    new URL("../Dockerfile", import.meta.url),
    "utf8",
  );

  assert.match(
    dockerfile,
    /COPY --from=build \/app\/shared \.\/shared/,
  );
});
