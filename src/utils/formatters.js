/**
 * Marlin Nexus — Merkezi Finansal Formatlama ve Gösterim Kütüphanesi
 * 
 * Tüm para birimi, yüzde ve sayısal gösterimler bu sözleşme üzerinden geçer.
 * Asla sessizce sıfır veya NaN üretmez; eksik veya geçersiz değerlerde tutarlı
 * "—" veya durum etiketi döndürür.
 */

const tryFormatter = new Intl.NumberFormat("tr-TR", {
  maximumFractionDigits: 0,
});

const preciseTryFormatter = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const eurFormatter = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const currencyFormatters = Object.freeze({
  EUR: eurFormatter,
  USD: new Intl.NumberFormat("tr-TR", { style: "currency", currency: "USD", maximumFractionDigits: 0 }),
  GBP: new Intl.NumberFormat("tr-TR", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }),
  TRY: new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }),
});

const compactFormatter = new Intl.NumberFormat("tr-TR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const integerFormatter = new Intl.NumberFormat("tr-TR", {
  maximumFractionDigits: 0,
});

/**
 * Tutarı TL formatında döndürür (Örn: "228.590.441 TL").
 * Değer geçersiz veya null ise "—" döner.
 */
export function formatMoney(value, { fallback = "—", showSign = false } = {}) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return fallback;
  }
  const num = Number(value);
  const rounded = Math.round(num);
  const formatted = tryFormatter.format(Math.abs(rounded));
  if (num < 0) return `−${formatted} TL`;
  if (showSign && num > 0) return `+${formatted} TL`;
  return `${formatted} TL`;
}

/**
 * Hassas kuruşlu TL formatı (Örn: "1.418,50 TL").
 */
export function formatPreciseMoney(value, { fallback = "—" } = {}) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return fallback;
  }
  const num = Number(value);
  const formatted = preciseTryFormatter.format(Math.abs(num));
  return `${num < 0 ? "−" : ""}${formatted} TL`;
}

/**
 * EUR para birimi formatı (Örn: "5.377.490 €").
 */
export function formatEur(value, { fallback = "—", showSign = false } = {}) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return fallback;
  }
  const num = Number(value);
  const rounded = Math.round(num);
  const formatted = eurFormatter.format(Math.abs(rounded));
  if (num < 0) return `−${formatted}`;
  if (showSign && num > 0) return `+${formatted}`;
  return formatted;
}

/**
 * Döviz sepeti tutarı: EUR/USD/GBP/TRY ayrı tutulur; eksik kanıt sıfıra
 * dönüştürülmez. Hesaplama veya kur dönüşümü yapmaz, yalnızca hazır tutarı
 * gösterir.
 */
export function formatCurrencyAmount(value, currency = "TRY", { fallback = "—" } = {}) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return fallback;
  }
  const formatter = currencyFormatters[currency];
  if (!formatter) return fallback;
  return formatter.format(Math.round(Number(value)));
}

/**
 * Kompakt finansal gösterim (Örn: "228,6 Mn TL" veya "5,4 Mn €").
 */
export function formatCompact(value, currency = "TRY") {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "—";
  }
  const num = Number(value);
  const formatted = compactFormatter.format(num);
  return currency === "EUR" ? `${formatted} €` : `${formatted} TL`;
}

/**
 * Yüzde gösterimi (Örn: "%26,4").
 * Null veya tanımsız durumlarda "—" döner.
 */
export function formatPercent(value, { fallback = "—", decimals = 1 } = {}) {
  if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) {
    return fallback;
  }
  return `%${Number(value).toFixed(decimals).replace(".", ",")}`;
}

/**
 * Tamsayı / Adet formatı (Örn: "22.077").
 */
export function formatInteger(value, fallback = "0") {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return fallback;
  }
  return integerFormatter.format(Math.round(Number(value)));
}

/**
 * Tarih formatlayıcısı (Örn: "04.09.2026").
 */
export function formatDate(value, fallback = "—") {
  if (!value) return fallback;
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return fallback;
    return new Intl.DateTimeFormat("tr-TR").format(d);
  } catch {
    return fallback;
  }
}
