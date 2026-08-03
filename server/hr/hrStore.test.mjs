import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import { readHrState, writeHrState, resetHrMemoryStateForTest } from "./hrStore.mjs";

test("hrStore reads default state and handles atomic updates", async () => {
  await resetHrMemoryStateForTest();
  const state = await readHrState();
  assert.equal(typeof state.revision, "number");
  assert.ok(Array.isArray(state.employees));
  assert.ok(state.employees.length >= 3);

  const initialRev = state.revision;
  state.employees.push({
    id: "emp-test-01",
    employeeNo: "MY-TEST",
    name: "TEST USER",
    email: "test@marlin.com.tr",
    department: "Servis",
    title: "Test Teknisyeni",
    status: "active",
    revision: 1
  });

  const updated = await writeHrState(state);
  assert.equal(updated.revision, initialRev + 1);
  assert.equal(updated.employees.length, state.employees.length);

  await resetHrMemoryStateForTest();
  const reloaded = await readHrState();
  // reset, diski de temizleyerek izole durum üretir: DEFAULT (revision 1) + ilk yazım (1) → 2.
  assert.equal(reloaded.revision, 2);
  assert.ok(!reloaded.employees.some(e => e.id === "emp-test-01"));
});
