import { currencyCode, dateKey } from "../shared/eurReporting.mjs";

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function finitePositive(value) {
  const result = Number(value);
  return Number.isFinite(result) && result > 0 ? result : null;
}

function rowSide(row, side) {
  return finitePositive(row?.[side === "buying" ? "buyingRate" : "sellingRate"])
    ?? finitePositive(row?.[side === "buying" ? "halkbankBuyingRate" : "halkbankSellingRate"]);
}

function normalizedRows(rows, source) {
  return (Array.isArray(rows) ? rows : []).flatMap((row) => {
    const currency = currencyCode(row?.rateCurrency);
    const rateDate = dateKey(row?.rateDate);
    if (!currency || !rateDate) return [];
    const sourceName = text(row?.source) || source;
    return ["buying", "selling"].flatMap((side) => {
      const rate = rowSide(row, side);
      if (rate === null) return [];
      const sourceIdentifier = text(row?.[side === "buying" ? "buyingSourceIdentifier" : "sellingSourceIdentifier"])
        || (text(row?.sourceIdentifier).endsWith("/A/S")
          ? `${text(row.sourceIdentifier).slice(0, -4)}.${side === "buying" ? "A" : "S"}`
          : text(row?.sourceIdentifier || row?.exchangeSourceId));
      return [{
        ...row,
        rateDate,
        rateCurrency: currency,
        source: sourceName,
        side,
        rate,
        sourceIdentifier: sourceIdentifier || null,
      }];
    });
  });
}

function key(row) {
  return `${row.rateDate}|${row.rateCurrency}|${row.side}`;
}

/**
 * CPM/Halkbank satırlarını öncelikli tutar, yalnız eksik tarih-döviz-taraf
 * anahtarlarını TCMB ile doldurur. Aritmetik yapmaz; sadece kanıt seçer.
 */
export function resolveOfficialRateRows({ cpmRows = [], tcmbRows = [], requestedDates = [] } = {}) {
  const cpm = normalizedRows(cpmRows, "CPM");
  const tcmb = normalizedRows(tcmbRows, "TCMB");
  const selected = new Map();
  for (const row of cpm) selected.set(key(row), { ...row, source: row.source || "CPM", selectionReason: "cpm-primary" });
  for (const row of tcmb) {
    const rowKey = key(row);
    if (!selected.has(rowKey)) selected.set(rowKey, { ...row, source: "TCMB", selectionReason: "cpm-rate-unavailable" });
  }
  const requested = new Set((Array.isArray(requestedDates) ? requestedDates : [])
    .map(dateKey).filter(Boolean));
  const rows = [...selected.values()]
    .filter((row) => !requested.size || requested.has(row.rateDate) || requested.has(dateKey(row.requestedDate)))
    .sort((a, b) => key(a).localeCompare(key(b), "en"));
  const sourceKinds = [...new Set(rows.map((row) => row.source))].sort();
  return {
    rows,
    sourceKinds,
    mixedSources: sourceKinds.length > 1,
    cpmRowCount: cpm.length,
    tcmbRowCount: tcmb.length,
    fallbackRowCount: rows.filter((row) => row.source === "TCMB").length,
  };
}
