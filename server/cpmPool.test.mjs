import test from "node:test";
import assert from "node:assert/strict";
import { createCpmPoolProvider } from "./cpmPool.mjs";

test("CPM pool provider returns null without credentials", async () => {
  let connectCalls = 0;
  const provider = createCpmPoolProvider({ environment: {}, connect: async () => { connectCalls += 1; } });
  assert.equal(await provider.getPool(), null);
  assert.equal(connectCalls, 0);
});

test("CPM pool provider lazily reuses a successful connection", async () => {
  const pool = { id: "pool" };
  let connectCalls = 0;
  let config;
  const provider = createCpmPoolProvider({
    environment: { CPM_SQL_USER: "reader", CPM_SQL_PASSWORD: "redacted", CPM_SQL_DATABASE: "Marlin_Uyg" },
    connect: async (value) => { connectCalls += 1; config = value; return pool; },
  });
  assert.equal(await provider.getPool(), pool);
  assert.equal(await provider.getPool(), pool);
  assert.equal(connectCalls, 1);
  assert.equal(config.database, "Marlin_Uyg");
  assert.equal(config.user, "reader");
});

test("CPM pool provider retries after a failed connection", async () => {
  let connectCalls = 0;
  const provider = createCpmPoolProvider({
    environment: { CPM_SQL_USER: "reader", CPM_SQL_PASSWORD: "redacted" },
    connect: async () => {
      connectCalls += 1;
      if (connectCalls === 1) throw new Error("connection failed");
      return { id: "recovered" };
    },
  });
  await assert.rejects(provider.getPool(), /connection failed/);
  assert.deepEqual(await provider.getPool(), { id: "recovered" });
  assert.equal(connectCalls, 2);
});
