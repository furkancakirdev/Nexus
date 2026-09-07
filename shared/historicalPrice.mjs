function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function dateKey(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  const normalized = text(value);
  return /^\d{4}-\d{2}-\d{2}/.test(normalized) ? normalized.slice(0, 10) : null;
}

function currency(value) {
  const normalized = text(value).toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function normalizePriceRow(row) {
  const validUntil = dateKey(row?.validUntil ?? row?.effectiveEnd);
  return {
    productCode: text(row?.productCode ?? row?.cardCode),
    currency: currency(row?.currency ?? row?.priceCurrency),
    effectiveDate: dateKey(row?.effectiveDate ?? row?.date),
    priceExVat: Number(row?.priceExVat ?? row?.price),
    ...(validUntil ? { validUntil } : {}),
  };
}

/** Ürün ve döviz başına sıralı tarihsel fiyat adaylarını bir kez hazırlar. */
export function createHistoricalRetailPriceSelector(priceRows = []) {
  const index = new Map();
  for (const row of Array.isArray(priceRows) ? priceRows : []) {
    const normalized = normalizePriceRow(row);
    if (!normalized.productCode || !normalized.currency || !normalized.effectiveDate
      || !Number.isFinite(normalized.priceExVat) || normalized.priceExVat <= 0) continue;
    const key = `${normalized.productCode}\u001f${normalized.currency}`;
    const candidates = index.get(key) || [];
    candidates.push(normalized);
    index.set(key, candidates);
  }
  for (const candidates of index.values()) {
    candidates.sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate, "en"));
  }

  return ({ productCode, productCurrency, asOfDate } = {}) => {
    const code = text(productCode);
    const targetCurrency = currency(productCurrency);
    const targetDate = dateKey(asOfDate);
    const candidates = index.get(`${code}\u001f${targetCurrency}`) || [];
    const selected = targetDate
      ? candidates.find((row) => row.effectiveDate <= targetDate
        && (!row.validUntil || targetDate < row.validUntil))
      : null;
    if (!selected) {
      return {
        productCode: code || null,
        currency: targetCurrency,
        priceExVat: null,
        effectiveDate: null,
        lagDays: null,
        reviewReason: "missing-historical-retail-price",
      };
    }
    return {
      ...selected,
      lagDays: Math.round((Date.parse(targetDate) - Date.parse(selected.effectiveDate)) / 86_400_000),
      reviewReason: null,
    };
  };
}

/** İşlem tarihinden ileri gitmeden KDV hariç tarihsel perakende fiyatı seçer. */
export function selectHistoricalRetailPrice({ productCode, productCurrency, asOfDate, priceRows = [] } = {}) {
  return createHistoricalRetailPriceSelector(priceRows)({ productCode, productCurrency, asOfDate });
}
