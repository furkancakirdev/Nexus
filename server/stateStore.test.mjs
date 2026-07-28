import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createStateStore } from "./stateStore.mjs";

async function withStore(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "marlin-state-"));
  const filePath = path.join(directory, "app-state.json");
  try {
    await run(createStateStore(filePath), filePath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("onayları yıl ve ay bazında ayrı saklar", async () => {
  await withStore(async (store) => {
    await store.approve({
      year: 2026,
      month: 1,
      snapshot: { snapshotHash: "ocak" },
    });
    await store.approve({
      year: 2026,
      month: 2,
      snapshot: { snapshotHash: "subat" },
    });

    const state = await store.read();
    assert.deepEqual(Object.keys(state.approvals["2026"]), ["1", "2"]);
    assert.equal(state.approvals["2026"]["1"].snapshotHash, "ocak");
    assert.equal(state.approvals["2026"]["2"].snapshotHash, "subat");
  });
});

test("yeniden açma onayı kaldırır fakat denetim olayını korur", async () => {
  await withStore(async (store) => {
    await store.approve({
      year: 2026,
      month: 1,
      snapshot: { snapshotHash: "ocak" },
    });
    await store.reopen({ year: 2026, month: 1, actor: "Yönetim" });

    const state = await store.read();
    assert.equal(state.approvals["2026"]["1"], undefined);
    assert.equal(state.auditEvents.at(-1).action, "approval-reopened");
    assert.equal(state.auditEvents.at(-1).actor, "Yönetim");
  });
});

test("olmayan onayı yeniden açma durum dosyasını değiştirmez", async () => {
  await withStore(async (store) => {
    await assert.rejects(
      store.reopen({ year: 2026, month: 1, actor: "Yönetim" }),
      /Onay bulunamadı/,
    );

    const state = await store.read();
    assert.deepEqual(state.approvals, {});
    assert.deepEqual(state.auditEvents, []);
    assert.equal(state.savedAt, null);
  });
});

test("uygulama ayarı güncellemesi onay ve denetim geçmişini korur", async () => {
  await withStore(async (store) => {
    await store.approve({
      year: 2026,
      month: 3,
      snapshot: { snapshotHash: "mart" },
    });
    await store.update((state) => ({
      ...state,
      settings: { rates: { conservative: 3, growth: 8 } },
      employees: [{ id: "FURKAN" }],
      costOverrides: [{ id: "cost-1" }],
    }));

    const state = await store.read();
    assert.equal(state.approvals["2026"]["3"].snapshotHash, "mart");
    assert.equal(state.auditEvents.length, 1);
    assert.equal(state.employees[0].id, "FURKAN");
  });
});

test("eşzamanlı güncellemeleri kaybetmeden sıraya alır", async () => {
  await withStore(async (store) => {
    await Promise.all([
      store.update((state) => ({
        ...state,
        settings: { first: true },
      })),
      store.update((state) => ({
        ...state,
        employees: [{ id: "second" }],
      })),
    ]);

    const state = await store.read();
    assert.deepEqual(state.settings, { first: true });
    assert.deepEqual(state.employees, [{ id: "second" }]);
  });
});

test("atomik yazım geçerli JSON bırakır ve geçici dosyayı temizler", async () => {
  await withStore(async (store, filePath) => {
    await store.update((state) => ({ ...state, settings: { saved: true } }));

    const diskState = JSON.parse(await readFile(filePath, "utf8"));
    assert.equal(diskState.settings.saved, true);
    await assert.rejects(readFile(`${filePath}.tmp`, "utf8"), /ENOENT/);
  });
});
