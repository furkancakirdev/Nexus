import test from "node:test";
import assert from "node:assert/strict";
import { normalizeStoredAppState } from "./index.mjs";

test("persisted null settings are treated as missing only at the app-state adapter boundary", () => {
  const state = { settings: null, employees: null, savedAt: null };
  const normalized = normalizeStoredAppState(state);

  assert.equal(Object.hasOwn(normalized, "settings"), true);
  assert.equal(normalized.settings, undefined);
  assert.equal(normalized.employees, null);
  assert.notEqual(normalized, state);
});

test("explicit malformed app-state containers remain fail-closed", () => {
  assert.deepEqual(normalizeStoredAppState(null), {});
  assert.deepEqual(normalizeStoredAppState([]), {});
  assert.deepEqual(normalizeStoredAppState(new Date("2026-01-01")), {});
});
