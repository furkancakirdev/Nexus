import test from "node:test";
import assert from "node:assert/strict";
import { MODULE_REGISTRY, modulesForCapabilities } from "./moduleRegistry.mjs";

test("product registry exposes only analysis and settings surfaces", () => {
  assert.deepEqual(
    MODULE_REGISTRY.filter((module) => module.active).map((module) => module.page),
    ["summary", "sales", "departments", "settings"],
  );
});

test("disabled inventory, ledger, and audit surfaces never appear for capable users", () => {
  const visible = modulesForCapabilities(["reporting:read", "operations:read", "settings:manage"]);
  assert.deepEqual(visible.map((module) => module.page), ["summary", "sales", "departments", "settings"]);
  assert.equal(visible.some((module) => ["inventory", "ledger", "audit"].includes(module.page)), false);
});
