import { createHash } from "node:crypto";
import { dateKey, currencyCode } from "../shared/eurReporting.mjs";

const TCMB_ORIGIN = "https://www.tcmb.gov.tr";
const MAX_XML_LENGTH = 2_000_000;
const RATE_CURRENCIES = new Set(["USD", "EUR", "GBP"]);

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function number(value) {
  const normalized = text(value).replace(",", ".");
  if (!normalized) return null;
  const result = Number(normalized);
  return Number.isFinite(result) && result > 0 ? result : null;
}

function attribute(attributes, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(attributes);
  return match ? text(match[1]) : "";
}

function tag(body, name) {
  const match = new RegExp(`<${name}\\b[^>]*>([^<]*)</${name}>`, "i").exec(body);
  return match ? text(match[1]) : "";
}

function tcmbDate(value) {
  const raw = text(value);
  const dotted = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw);
  if (dotted) return `${dotted[3]}-${dotted[2]}-${dotted[1]}`;
  return dateKey(raw);
}

export function tcmbDailyXmlUrl(value, origin = TCMB_ORIGIN) {
  const day = dateKey(value);
  if (!day) throw new RangeError("TCMB tarih anahtarı geçersiz.");
  const [year, month, date] = day.split("-");
  return `${String(origin).replace(/\/$/, "")}/kurlar/${year}${month}/${date}${month}${year}.xml`;
}

export function planTcmbFallbackDates({ requestedDates = [], maxRequestedDates = Infinity } = {}) {
  const dates = [...new Set((Array.isArray(requestedDates) ? requestedDates : []).map(dateKey).filter(Boolean))];
  const cap = Number.isFinite(maxRequestedDates) && maxRequestedDates >= 0
    ? Math.floor(maxRequestedDates)
    : dates.length;
  return {
    selectedDates: dates.slice(0, cap),
    skippedDates: dates.slice(cap),
  };
}

export function collectHistoricalFallbackDates({ movements = [], priceRows = [] } = {}) {
  const currenciesByProduct = new Map();
  for (const row of Array.isArray(priceRows) ? priceRows : []) {
    const productCode = text(row?.productCode ?? row?.cardCode);
    const currency = currencyCode(row?.cardCurrency ?? row?.productCurrency ?? row?.priceCurrency ?? row?.currency);
    if (!productCode || !RATE_CURRENCIES.has(currency)) continue;
    const currencies = currenciesByProduct.get(productCode) || new Set();
    currencies.add(currency);
    currenciesByProduct.set(productCode, currencies);
  }
  const dates = new Set();
  for (const movement of Array.isArray(movements) ? movements : []) {
    if (!movement || !["opening", "purchase"].includes(text(movement.kind))) continue;
    const productCode = text(movement.productCode ?? movement.cardCode);
    const movementCurrency = currencyCode(movement.productCurrency);
    const mappedCurrencies = currenciesByProduct.get(productCode) || new Set();
    const currency = movementCurrency || (mappedCurrencies.size === 1 ? [...mappedCurrencies][0] : null);
    const date = dateKey(movement.date ?? movement.documentDate ?? movement.movementDate);
    if (date && RATE_CURRENCIES.has(currency)) dates.add(date);
  }
  return [...dates].sort((left, right) => left.localeCompare(right, "en"));
}

/**
 * TCMB'nin tarihli gösterge kuru XML'ini sadece USD/EUR/GBP için kanıta dönüştürür.
 * Bu fonksiyon ağ çağrısı yapmaz; XML metni test edilebilir bir sınır girdisidir.
 */
export function parseTcmbDailyXml(xml, { requestedDate = null, sourceUrl = null } = {}) {
  if (typeof xml !== "string" || !xml.trim() || xml.length > MAX_XML_LENGTH) {
    throw new RangeError("TCMB XML gövdesi geçersiz veya fazla büyük.");
  }
  const root = /<Tarih_Date\b([^>]*)>/i.exec(xml);
  if (!root) throw new RangeError("TCMB XML kökü bulunamadı.");
  const rateDate = tcmbDate(attribute(root[1], "Tarih") || attribute(root[1], "Date"));
  if (!rateDate) throw new RangeError("TCMB XML tarihi geçersiz.");
  const requestedDay = requestedDate ? dateKey(requestedDate) : rateDate;
  if (!requestedDay || rateDate > requestedDay) throw new RangeError("TCMB XML ileri tarihli.");

  const rows = [];
  const evidenceHash = `sha256:${createHash("sha256").update(xml, "utf8").digest("hex")}`;
  const currencyPattern = /<Currency\b([^>]*)>([\s\S]*?)<\/Currency>/gi;
  for (const match of xml.matchAll(currencyPattern)) {
    const code = currencyCode(attribute(match[1], "CurrencyCode") || attribute(match[1], "Kod"));
    if (!code || !RATE_CURRENCIES.has(code)) continue;
    const unit = number(tag(match[2], "Unit"));
    const buying = number(tag(match[2], "ForexBuying"));
    const selling = number(tag(match[2], "ForexSelling"));
    if (!unit || (!buying && !selling)) continue;
    rows.push({
      exchangeSourceId: `TCMB-${rateDate}-${code}`,
      source: "TCMB",
      buyingSourceIdentifier: `TP.DK.${code}.A`,
      sellingSourceIdentifier: `TP.DK.${code}.S`,
      rateDate,
      rateCurrency: code,
      buyingRate: buying === null ? null : buying / unit,
      sellingRate: selling === null ? null : selling / unit,
      requestedDate: requestedDay,
      selectionReason: rateDate === requestedDay ? "tcmb-date-match" : "tcmb-previous-valid-date",
      sourceUrl: sourceUrl || null,
      evidenceHash,
    });
  }
  if (!rows.length) throw new RangeError("TCMB XML'inde kullanılabilir kur bulunamadı.");
  return rows;
}

/**
 * Tarih ve önceki geçerli iş günü için TCMB XML'ini okur. Cache yalnız süreç içidir;
 * kalıcı veya doğrulanmamış kur verisi yazmaz.
 */
export function createTcmbRateSource({
  fetchImpl = globalThis.fetch,
  origin = TCMB_ORIGIN,
  maxLagDays = 7,
  maxHttpAttempts = 64,
  deadlineMs = 15_000,
  now = () => new Date(),
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("TCMB fetch sağlayıcısı zorunludur.");
  const cache = new Map();
  const stats = {
    httpAttemptCount: 0,
    deadlineExceeded: false,
    attemptCapReached: false,
  };
  const startedAt = Number(now?.()) || Date.now();
  const withinBudget = () => {
    if (stats.httpAttemptCount >= maxHttpAttempts) {
      stats.attemptCapReached = true;
      return false;
    }
    if (Date.now() - startedAt >= deadlineMs) {
      stats.deadlineExceeded = true;
      return false;
    }
    return true;
  };
  async function load(requestedDate) {
    const requestedDay = dateKey(requestedDate);
    if (!requestedDay) throw new RangeError("TCMB istenen tarih geçersiz.");
    for (let lagDays = 0; lagDays <= maxLagDays; lagDays += 1) {
      const candidate = new Date(`${requestedDay}T00:00:00.000Z`);
      candidate.setUTCDate(candidate.getUTCDate() - lagDays);
      const candidateDay = candidate.toISOString().slice(0, 10);
      const url = tcmbDailyXmlUrl(candidateDay, origin);
      let xml = cache.get(url);
      const retrievalMode = xml === undefined ? "live" : "validated-immutable-cache";
      if (xml === undefined) {
        if (!withinBudget()) return [];
        stats.httpAttemptCount += 1;
        try {
          const response = await fetchImpl(url, { headers: { Accept: "application/xml,text/xml" } });
          if (!response?.ok) continue;
          xml = await response.text();
          if (typeof xml !== "string" || xml.length > MAX_XML_LENGTH) continue;
          cache.set(url, xml);
        } catch {
          continue;
        }
      }
      try {
        return parseTcmbDailyXml(xml, { requestedDate: requestedDay, sourceUrl: url })
          .map((row) => ({ ...row, retrievalMode }));
      } catch {
        continue;
      }
    }
    return [];
  }
  return { load, cache, now, stats };
}

function hasCpmRateOnOrBefore(rows, currency, requestedDate) {
  const target = dateKey(requestedDate);
  return (Array.isArray(rows) ? rows : []).some((row) => {
    const rowCurrency = currencyCode(row?.rateCurrency);
    const rowDate = dateKey(row?.rateDate);
    const buying = number(row?.buyingRate ?? row?.halkbankBuyingRate);
    const selling = number(row?.sellingRate ?? row?.halkbankSellingRate);
    return rowCurrency === currency && rowDate && rowDate <= target && buying !== null && selling !== null;
  });
}

/**
 * Rapor ve tarihsel hareket dönemleri için yalnız CPM kapsamının gerçekten boş
 * kaldığı tarihleri TCMB'den yükler. CPM satırları üzerine yazılmaz; sonuç
 * merge edilmeden önce resmi rate resolver'a bırakılır.
 */
export async function loadTcmbFallbackRows({ cpmRows = [], requestedDates = [], currencies = ["USD", "EUR", "GBP"], source } = {}) {
  if (!source || typeof source.load !== "function") throw new TypeError("TCMB fallback sağlayıcısı zorunludur.");
  const dates = [...new Set((Array.isArray(requestedDates) ? requestedDates : []).map(dateKey).filter(Boolean))];
  const wanted = [...new Set((Array.isArray(currencies) ? currencies : []).map(currencyCode).filter(Boolean))];
  const rows = [];
  for (const requestedDate of dates) {
    const missingCurrencies = wanted.filter((currency) => !hasCpmRateOnOrBefore(cpmRows, currency, requestedDate));
    if (!missingCurrencies.length) continue;
    const fetched = await source.load(requestedDate);
    for (const row of fetched) {
      if (missingCurrencies.includes(currencyCode(row?.rateCurrency))) rows.push(row);
    }
  }
  const unique = new Map();
  for (const row of rows) unique.set(`${row.rateDate}|${row.rateCurrency}`, row);
  return [...unique.values()].sort((a, b) => String(a.rateDate).localeCompare(String(b.rateDate), "en")
    || String(a.rateCurrency).localeCompare(String(b.rateCurrency), "en"));
}
