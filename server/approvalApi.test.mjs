import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { createApprovalRouter } from "./approvalApi.mjs";
import { createStateStore } from "./stateStore.mjs";

async function withApi({ loadDepartmentTargets }, run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "marlin-approval-"));
  const store = createStateStore(path.join(directory, "app-state.json"));
  const app = express();
  app.use(express.json());
  app.use(createApprovalRouter({
    store,
    loadDepartmentTargets,
    now: () => new Date("2026-07-28T12:00:00.000Z"),
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`, store);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await rm(directory, { recursive: true, force: true });
  }
}

function targetPayload(version = "ledger-v1", januaryPool = 30) {
  return {
    year: 2026,
    ledgerVersion: version,
    previousLedgerVersion: "ledger-2025-v1",
    generatedAt: "2026-07-28T11:59:00.000Z",
    rows: [
      {
        year: 2026,
        month: 1,
        department: "service",
        priorNetSales: 1000,
        target: 1100,
        stretchTarget: 1155,
        actual: 1200,
        difference: 100,
        achievementPct: 109.09,
        band: "conservative",
        appliedRate: 3,
        eligibleProfit: 500,
        uncoveredNetSales: 0,
        pool: januaryPool / 3,
      },
      {
        year: 2026,
        month: 1,
        department: "parts",
        priorNetSales: 2000,
        target: 2200,
        stretchTarget: 2310,
        actual: 2400,
        difference: 200,
        achievementPct: 109.09,
        band: "conservative",
        appliedRate: 3,
        eligibleProfit: 1000,
        uncoveredNetSales: 0,
        pool: januaryPool * 2 / 3,
      },
    ],
  };
}

test("aylık onay parasal istemci alanlarını yok sayıp sunucu snapshotı üretir", async () => {
  await withApi({
    loadDepartmentTargets: async () => targetPayload(),
  }, async (baseUrl, store) => {
    const response = await fetch(`${baseUrl}/api/approvals/2026/1`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pool: 999_999, approvedBy: "İstemci" }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.approval.pool, 30);
    assert.equal(payload.approval.approvedBy, "Yönetim");
    assert.equal(payload.approval.departments.length, 2);
    assert.match(payload.approval.snapshotHash, /^[a-f0-9]{64}$/);
    const state = await store.read();
    assert.equal(state.approvals["2026"]["1"].pool, 30);
    assert.equal(state.auditEvents.at(-1).action, "approval-approved");
  });
});

test("onay listesi güncel defter değiştiğinde bayat snapshotı işaretler", async () => {
  let version = "ledger-v1";
  await withApi({
    loadDepartmentTargets: async () => targetPayload(version),
  }, async (baseUrl) => {
    await fetch(`${baseUrl}/api/approvals/2026/1`, { method: "PUT" });
    version = "ledger-v2";

    const payload = await fetch(
      `${baseUrl}/api/approvals?year=2026`,
    ).then((response) => response.json());

    assert.equal(payload.approvals["1"].stale, true);
    assert.equal(payload.approvals["1"].ledgerVersion, "ledger-v1");
    assert.equal(payload.currentLedgerVersion, "ledger-v2");
  });
});

test("yeniden açma ayrı denetim olayı bırakır", async () => {
  await withApi({
    loadDepartmentTargets: async () => targetPayload(),
  }, async (baseUrl, store) => {
    await fetch(`${baseUrl}/api/approvals/2026/1`, { method: "PUT" });
    const response = await fetch(
      `${baseUrl}/api/approvals/2026/1/reopen`,
      { method: "POST" },
    );

    assert.equal(response.status, 200);
    const state = await store.read();
    assert.equal(state.approvals["2026"]["1"], undefined);
    assert.equal(state.auditEvents.at(-1).action, "approval-reopened");
  });
});

test("olmayan onayı yeniden açmaz ve sahte denetim olayı üretmez", async () => {
  await withApi({
    loadDepartmentTargets: async () => targetPayload(),
  }, async (baseUrl, store) => {
    const response = await fetch(
      `${baseUrl}/api/approvals/2026/1/reopen`,
      { method: "POST" },
    );

    assert.equal(response.status, 404);
    const state = await store.read();
    assert.deepEqual(state.approvals, {});
    assert.deepEqual(state.auditEvents, []);
  });
});

test("aynı departmanı iki kez içeren hedef sonucunu onaylamaz", async () => {
  const duplicateDepartmentPayload = targetPayload();
  duplicateDepartmentPayload.rows[1].department = "service";

  await withApi({
    loadDepartmentTargets: async () => duplicateDepartmentPayload,
  }, async (baseUrl, store) => {
    const response = await fetch(
      `${baseUrl}/api/approvals/2026/1`,
      { method: "PUT" },
    );

    assert.equal(response.status, 409);
    const state = await store.read();
    assert.deepEqual(state.approvals, {});
    assert.deepEqual(state.auditEvents, []);
  });
});

test("tanımsız departman veya hedef bandı içeren sonucu onaylamaz", async () => {
  for (const mutate of [
    (payload) => { payload.rows[1].department = "accounting"; },
    (payload) => { payload.rows[0].band = "surprise"; },
  ]) {
    const invalidPayload = targetPayload();
    mutate(invalidPayload);

    await withApi({
      loadDepartmentTargets: async () => invalidPayload,
    }, async (baseUrl, store) => {
      const response = await fetch(
        `${baseUrl}/api/approvals/2026/1`,
        { method: "PUT" },
      );

      assert.equal(response.status, 409);
      const state = await store.read();
      assert.deepEqual(state.approvals, {});
      assert.deepEqual(state.auditEvents, []);
    });
  }
});

test("2026 öncesi ve bozuk dönemlere onay yazmaz", async () => {
  await withApi({
    loadDepartmentTargets: async () => targetPayload(),
  }, async (baseUrl) => {
    for (const [year, month] of [[2025, 1], [2026, 0], [2026, 13]]) {
      const response = await fetch(
        `${baseUrl}/api/approvals/${year}/${month}`,
        { method: "PUT" },
      );
      assert.equal(response.status, 400);
    }
  });
});
