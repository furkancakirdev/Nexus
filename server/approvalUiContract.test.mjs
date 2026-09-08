import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolve } from "node:path";
import { createServer } from "vite";

test("Onay ekranı sunucu aylık onay API sözleşmesini kullanır", async () => {
  const source = await readFile(
    new URL("../src/ApprovalPage.jsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /fetch\(`\/api\/approvals\?year=\$\{year\}`/);
  assert.match(source, /method:\s*["']PUT["']/);
  assert.match(source, /\/reopen/);
  assert.match(source, /marlin-approval-migration-/);
  assert.match(source, /approval\??\.stale/);
  assert.match(source, /rateEvidenceStatus/);
  assert.match(source, /getRateEvidencePresentation/);
  assert.match(source, /getRateEvidenceDetails/);
  assert.match(source, /Halkbank alış kuru/);
  assert.match(source, /Hedef bandı/);
  assert.doesNotMatch(source, /const saveApprovals/);
});

test("Onay ekranı kur kanıtı durumlarını kesin sonuçtan ayırır", async (t) => {
  const vite = await createServer({ configFile: resolve(process.cwd(), "vite.config.mjs") });
  t.after(() => vite.close());
  const source = await readFile(
    new URL("../src/ApprovalPage.jsx", import.meta.url),
    "utf8",
  );
  const approval = await vite.ssrLoadModule("/src/ApprovalPage.jsx");

  assert.equal(approval.getRateEvidencePresentation("frozen").tone, "verified");
  assert.equal(approval.getRateEvidencePresentation("legacy-frozen").tone, "review");
  assert.equal(approval.getRateEvidencePresentation("legacy-month-end-fallback").tone, "review");
  assert.equal(approval.getRateEvidencePresentation("invalid").tone, "blocked");
  assert.equal(approval.getRateEvidencePresentation(undefined).tone, "review");

  assert.deepEqual(
    approval.getApprovalStatusPresentation({
      rateEvidenceStatus: "invalid",
      stale: false,
    }),
    { tone: "blocked", label: "Kur kanıtı geçersiz" },
  );
  assert.deepEqual(
    approval.getApprovalStatusPresentation({
      rateEvidenceStatus: "invalid",
      stale: true,
    }),
    { tone: "blocked", label: "Güncelliğini yitirdi" },
  );
  assert.deepEqual(
    approval.getApprovalStatusPresentation({
      rateEvidenceStatus: "frozen",
      stale: null,
    }),
    { tone: "blocked", label: "Güncellik doğrulanamadı" },
  );
  assert.deepEqual(
    approval.getApprovalStatusPresentation({
      rateEvidenceStatus: "frozen",
      stale: false,
    }),
    { tone: "approved", label: "Onaylandı" },
  );
  assert.match(source, /item\.approvalStatus\?\.tone\s*===\s*["']approved["']/);

  const details = approval.getRateEvidenceDetails({
    bank: "HALKBANK",
    reportDate: "2026-01-31",
    eurTryBuyingRate: 40,
    rates: {
      USD: { buyingRate: 32, rateDate: "2026-01-30", sourceId: "FX-USD" },
      EUR: { buyingRate: 1, rateDate: "2026-01-31", sourceId: "FX-EUR" },
    },
  });
  assert.equal(details.bank, "HALKBANK");
  assert.equal(details.eurTryBuyingRate, 40);
  assert.deepEqual(details.entries.map((entry) => entry.currency), ["EUR", "USD"]);
});

test("Onay kur kanıtı ayrıntıları dar ekranda ve koyu temada okunabilir kalır", async () => {
  const styles = await readFile(
    new URL("../src/styles.css", import.meta.url),
    "utf8",
  );

  assert.match(styles, /\.rate-evidence__details\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
  assert.match(styles, /@media\s*\(max-width:\s*620px\)[\s\S]*?\.rate-evidence__details\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(styles, /:root\[data-theme="dark"\]\s+\.rate-evidence--verified/);
});
