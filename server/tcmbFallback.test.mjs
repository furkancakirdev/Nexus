import assert from "node:assert/strict";
import test from "node:test";
import { loadTcmbFallbackRows } from "./tcmbRateSource.mjs";

test("TCMB fallback CPM'de bulunan para birimini çağırmadan korur", async () => {
  const requested = [];
  const rows = await loadTcmbFallbackRows({
    cpmRows: [
      { rateDate: "2026-09-01", rateCurrency: "USD", buyingRate: 48, sellingRate: 49 },
      { rateDate: "2026-09-01", rateCurrency: "EUR", buyingRate: 56, sellingRate: 57 },
    ],
    requestedDates: ["2026-09-01", "2026-09-30"],
    currencies: ["USD", "EUR"],
    source: { load: async (date) => { requested.push(date); return [{ rateDate: date, rateCurrency: "EUR", buyingRate: 56, sellingRate: 57, source: "TCMB" }]; } },
  });
  assert.deepEqual(requested, []);
  assert.deepEqual(rows, []);
});

test("TCMB fallback CPM'de hiç bulunmayan para birimi için rapor satırı üretir", async () => {
  const rows = await loadTcmbFallbackRows({
    cpmRows: [],
    requestedDates: ["2026-09-30"],
    currencies: ["GBP"],
    source: { load: async (date) => [{ rateDate: "2026-09-29", requestedDate: date, rateCurrency: "GBP", buyingRate: 65, sellingRate: 66, source: "TCMB" }] },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].requestedDate, "2026-09-30");
});
