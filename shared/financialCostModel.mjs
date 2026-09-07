function finitePrimitive(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function currencyCode(value) {
  const normalized = text(value).toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function stockKey(movement) {
  return `${text(movement?.productCode)}\u001f${text(movement?.depotCode)}`;
}

function inventoryStateKey(movement) {
  return `${stockKey(movement)}\u001f${currencyCode(movement?.productCurrency) || ""}`;
}

/** Satırdaki açık döviz/parite kanıtını ürün dövizinden bağımsız çözer. */
export function resolveLineCurrency({ lineCurrency = null, lineFxRate = null, productCurrency = null } = {}) {
  const line = currencyCode(lineCurrency);
  const product = currencyCode(productCurrency);
  const rate = typeof lineFxRate === "number" ? lineFxRate : Number(lineFxRate);
  if (line) return { currency: line, method: "line-currency", reviewReason: null };
  if (Number.isFinite(rate) && rate === 1) {
    return {
      currency: "TRY",
      method: "try-parity",
      reviewReason: product && product !== "TRY" ? "line-product-currency-mismatch" : null,
    };
  }
  return { currency: null, method: null, reviewReason: "missing-line-currency" };
}

function dateKey(value) {
  // CPM okuma katmanı tarihleri Date nesnesi olarak taşır; UTC takvim günü esas alınır.
  if (value instanceof Date) {
    const timestamp = value.getTime();
    if (!Number.isFinite(timestamp)) return null;
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const normalized = text(value);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(normalized);
  return match?.[1] || null;
}

function conversionReview(productCurrency, reviewReason) {
  return {
    amountCurrency: null,
    productCurrency,
    exchangeEvidence: null,
    reviewReason,
  };
}

/**
 * TRY tutarını ürün kartı dövizine, yalnız doğrulanmış Halkbank satış kuru ile çevirir.
 *
 * @param {Object} input
 * @param {number} input.amountTry
 * @param {string} input.productCurrency
 * @param {number|null} [input.halkbankSellingRate]
 * @param {string|null} [input.exchangeDate]
 * @param {string|null} [input.exchangeSourceId]
 */
export function convertTryToProductCurrency({
  amountTry,
  productCurrency: rawProductCurrency,
  halkbankSellingRate = null,
  exchangeDate = null,
  exchangeSourceId = null,
} = {}) {
  const productCurrency = currencyCode(rawProductCurrency);
  if (!productCurrency) return conversionReview(null, "missing-product-currency");
  if (!finitePrimitive(amountTry) || amountTry < 0) {
    return conversionReview(productCurrency, "invalid-try-amount");
  }

  if (productCurrency === "TRY") {
    return {
      amountCurrency: amountTry,
      productCurrency,
      exchangeEvidence: {
        rate: 1,
        date: null,
        sourceId: "TRY",
        method: "try-parity",
      },
      reviewReason: null,
    };
  }

  if (!finitePrimitive(halkbankSellingRate) || halkbankSellingRate <= 0) {
    return conversionReview(productCurrency, "missing-exchange-rate");
  }
  if (!dateKey(exchangeDate) || !text(exchangeSourceId)) {
    return conversionReview(productCurrency, "missing-exchange-evidence");
  }

  return {
    amountCurrency: amountTry / halkbankSellingRate,
    productCurrency,
    exchangeEvidence: {
      rate: halkbankSellingRate,
      date: dateKey(exchangeDate),
      sourceId: text(exchangeSourceId),
      method: "halkbank-selling",
    },
    reviewReason: null,
  };
}

function marginReview(input, reviewReason, extra = {}) {
  return {
    productCode: text(input?.productCode) || null,
    productCurrency: currencyCode(input?.productCurrency),
    retailUnitPriceCurrencyExVat: finitePrimitive(input?.retailUnitPriceCurrencyExVat)
      ? input.retailUnitPriceCurrencyExVat
      : null,
    purchaseDate: dateKey(input?.purchaseDate),
    purchaseQuantity: finitePrimitive(input?.purchaseQuantity) ? input.purchaseQuantity : null,
    purchaseNetAmountTryExVat: finitePrimitive(input?.purchaseNetAmountTryExVat)
      ? input.purchaseNetAmountTryExVat
      : null,
    unitCostTryExVat: null,
    unitCostCurrencyExVat: null,
    unitDiscountCurrencyExVat: null,
    productListGrossMarginPct: null,
    observationKey: null,
    exchangeEvidence: null,
    reviewReason,
    ...extra,
  };
}

/**
 * Bir alım faturası kanıtından ürün liste brüt marjı gözlemi üretir.
 * Ham girdiyi değiştirmez ve eksik kanıtta sıfır maliyet uydurmaz.
 *
 * @param {Object} input
 */
export function calculateProductMarginObservation(input = {}) {
  const productCode = text(input.productCode);
  const productCurrency = currencyCode(input.productCurrency);
  const purchaseDate = dateKey(input.purchaseDate);
  const exchangeDate = dateKey(input.exchangeDate);
  const purchaseQuantity = input.purchaseQuantity;
  const purchaseNetAmountTryExVat = input.purchaseNetAmountTryExVat;
  const retailUnitPriceCurrencyExVat = input.retailUnitPriceCurrencyExVat;

  if (!productCode) return marginReview(input, "missing-product-code");
  if (!productCurrency) return marginReview(input, "missing-product-currency");
  if (!purchaseDate) return marginReview(input, "missing-purchase-date");
  if (!finitePrimitive(purchaseQuantity) || purchaseQuantity <= 0) {
    return marginReview(input, "invalid-purchase-quantity");
  }
  if (!finitePrimitive(purchaseNetAmountTryExVat) || purchaseNetAmountTryExVat < 0) {
    return marginReview(input, "invalid-purchase-net");
  }
  if (!finitePrimitive(retailUnitPriceCurrencyExVat) || retailUnitPriceCurrencyExVat <= 0) {
    return marginReview(input, "missing-retail-price");
  }
  // Kur kanıtı alış faturası tarihinde veya önceki en yakın iş gününde olabilir;
  // gelecek tarihli kur kabul edilmez. Gecikme günü kanıt üzerinde raporlanır.
  let exchangeLagDays = 0;
  if (productCurrency !== "TRY") {
    if (!exchangeDate) {
      return marginReview(input, "missing-exchange-evidence");
    }
    if (exchangeDate > purchaseDate) {
      return marginReview(input, "exchange-date-mismatch");
    }
    exchangeLagDays = Math.round(
      (Date.parse(purchaseDate) - Date.parse(exchangeDate)) / 86_400_000,
    );
  }

  const unitCostTryExVat = purchaseNetAmountTryExVat / purchaseQuantity;
  const conversion = convertTryToProductCurrency({
    amountTry: unitCostTryExVat,
    productCurrency,
    halkbankSellingRate: input.halkbankSellingRate,
    exchangeDate: input.exchangeDate,
    exchangeSourceId: input.exchangeSourceId,
  });
  if (conversion.reviewReason) {
    return marginReview(input, conversion.reviewReason, {
      unitCostTryExVat,
    });
  }

  const unitCostCurrencyExVat = conversion.amountCurrency;
  const unitDiscountCurrencyExVat = retailUnitPriceCurrencyExVat - unitCostCurrencyExVat;
  const productListGrossMarginPct = 100
    * unitDiscountCurrencyExVat
    / retailUnitPriceCurrencyExVat;
  const sourceId = conversion.exchangeEvidence.sourceId;

  return {
    productCode,
    productCurrency,
    retailUnitPriceCurrencyExVat,
    purchaseDate,
    purchaseQuantity,
    purchaseNetAmountTryExVat,
    unitCostTryExVat,
    unitCostCurrencyExVat,
    unitDiscountCurrencyExVat,
    productListGrossMarginPct,
    observationKey: `${productCode}|${purchaseDate}|${sourceId}`,
    exchangeEvidence: conversion.exchangeEvidence,
    reviewReason: null,
  };
}

function validateMovement(movement, { requireProductCode = false } = {}) {
  const kind = movement?.kind;
  if (!text(movement?.id)) throw new TypeError("Stok hareketi kimliği zorunludur.");
  if (requireProductCode && !text(movement?.productCode)) {
    throw new TypeError("Stok hareketi ürün kodu taşımalıdır.");
  }
  if (!["purchase", "purchaseReturn", "sale", "saleReturn", "opening"].includes(kind)) {
    throw new TypeError("Stok hareketi purchase, purchaseReturn, sale, saleReturn veya opening olmalıdır.");
  }
  if (!dateKey(movement?.date)) throw new TypeError("Stok hareketi tarihi geçerli olmalıdır.");
  if (!finitePrimitive(movement?.quantity) || movement.quantity <= 0) {
    throw new TypeError("Stok hareketi miktarı pozitif sayı olmalıdır.");
  }
  if (["opening", "purchase"].includes(kind)
    && (!finitePrimitive(movement?.unitCostTryExVat) || movement.unitCostTryExVat <= 0)) {
    throw new TypeError(`${kind === "opening" ? "Açılış" : "Alım"} hareketi KDV hariç birim maliyet taşımalıdır.`);
  }
  if (["opening", "purchase"].includes(kind)
    && movement?.unitCostCurrencyExVat != null
    && (!finitePrimitive(movement.unitCostCurrencyExVat) || movement.unitCostCurrencyExVat <= 0)) {
    throw new TypeError(`${kind === "opening" ? "Açılış" : "Alım"} hareketi ürün dövizinde geçerli birim maliyet taşımalıdır.`);
  }
  if (kind === "saleReturn") {
    if (!text(movement?.originalSaleId)) {
      throw new TypeError("Satış iadesi originalSaleId taşımalıdır.");
    }
  }
  if (kind === "purchaseReturn" && !text(movement?.originalPurchaseId)) {
    throw new TypeError("Alış iadesi originalPurchaseId taşımalıdır.");
  }
}

/**
 * Kendi başına dönüşüm olmayan satışlar için km/hiz partasyon davranışını withType,Noise analitiği hallederek
 * her hareketin resmi (ofis/CMH) maliyeti ve güncel KMG,İST,İstanbul km/gün analizlerini hesaplar.
 *
 * @param {Object[]} movements
 */
export function buildOfficialMovementCosts(movements = [], options = {}) {
  if (!Array.isArray(movements)) throw new TypeError("Stok hareketleri dizi olmalıdır.");
  const marginObservationsByStockKey = options?.marginObservationsByStockKey instanceof Map
    ? options.marginObservationsByStockKey
    : new Map();
  const ordered = movements.map((m) => ({ ...m }));
  for (const movement of ordered) validateMovement(movement, { requireProductCode: true });

  // CPM'nin kaynak sırası varsa aynı gün içindeki ekonomik sırayı korur.
  ordered.sort((left, right) => (
    String(dateKey(left.date)).localeCompare(String(dateKey(right.date)), "en")
    || (Number.isFinite(left.sourceSequence) ? left.sourceSequence : Number.MAX_SAFE_INTEGER)
      - (Number.isFinite(right.sourceSequence) ? right.sourceSequence : Number.MAX_SAFE_INTEGER)
    || String(left.id).localeCompare(String(right.id), "tr")
  ));

  const states = new Map();
  const soldRegistry = new Map();
  const purchaseRegistry = new Map();

  const getState = (movement) => {
    const key = inventoryStateKey(movement);
    if (!states.has(key)) {
      states.set(key, {
        stockQuantity: 0,
        stockValueTryExVat: 0,
        weightedUnitCostTryExVat: null,
        stockValueCurrencyExVat: null,
        weightedUnitCostCurrencyExVat: null,
        productCurrency: currencyCode(null),
      });
    }
    return states.get(key);
  };

  const snapshot = (state) => ({
    stockQuantity: state.stockQuantity,
    stockValueTryExVat: state.stockValueTryExVat,
    weightedUnitCostTryExVat: state.weightedUnitCostTryExVat,
    stockValueCurrencyExVat: state.stockValueCurrencyExVat,
    weightedUnitCostCurrencyExVat: state.weightedUnitCostCurrencyExVat,
    productCurrency: state.productCurrency,
  });

  const rows = [];
  for (const movement of ordered) {
    const state = getState(movement);
    const beforeQuantity = state.stockQuantity;
    const beforeUnitCost = state.weightedUnitCostTryExVat;
    let officialLineCostTryExVat = null;
    let officialLineCostCurrencyExVat = null;
    let officialCostStatus = "review";
    let reviewReason = "missing-opening-or-purchase-cost";
    let appliedUnitCostTryExVat = null;
    let appliedUnitCostCurrencyExVat = null;
    let costMethod = null;
    let appliedMarginPct = null;
    let appliedQuantity = 0;
    const movementCurrency = currencyCode(movement.productCurrency);
    if (movementCurrency) state.productCurrency = movementCurrency;

    if (movement.kind === "opening") {
      state.stockQuantity += movement.quantity;
      state.stockValueTryExVat += movement.quantity * movement.unitCostTryExVat;
      state.weightedUnitCostTryExVat = state.stockValueTryExVat / state.stockQuantity;
      if (finitePrimitive(movement.unitCostCurrencyExVat)) {
        state.stockValueCurrencyExVat = (state.stockValueCurrencyExVat || 0)
          + movement.quantity * movement.unitCostCurrencyExVat;
        state.weightedUnitCostCurrencyExVat = state.stockValueCurrencyExVat / state.stockQuantity;
      } else {
        state.stockValueCurrencyExVat = null;
        state.weightedUnitCostCurrencyExVat = null;
      }
      officialCostStatus = "covered";
      reviewReason = null;
    } else if (movement.kind === "purchase") {
      const deficit = Math.max(0, -state.stockQuantity);
      const appliedToDeficit = Math.min(deficit, movement.quantity);
      const addedToStock = movement.quantity - appliedToDeficit;
      state.stockQuantity += movement.quantity;
      state.stockValueTryExVat = addedToStock * movement.unitCostTryExVat
        + (deficit > 0 ? 0 : state.stockValueTryExVat);
      state.stockValueCurrencyExVat = finitePrimitive(movement.unitCostCurrencyExVat)
        ? addedToStock * movement.unitCostCurrencyExVat
          + (deficit > 0 ? 0 : (state.stockValueCurrencyExVat || 0))
        : null;
      state.weightedUnitCostTryExVat = state.stockQuantity > 0
        ? state.stockValueTryExVat / state.stockQuantity
        : null;
      state.weightedUnitCostCurrencyExVat = state.stockQuantity > 0 && state.stockValueCurrencyExVat != null
        ? state.stockValueCurrencyExVat / state.stockQuantity
        : null;
      purchaseRegistry.set(movement.id, {
        productCode: text(movement.productCode),
        depotCode: text(movement.depotCode),
        productCurrency: movementCurrency,
        remainingQuantity: movement.quantity,
        unitCostTryExVat: movement.unitCostTryExVat,
        unitCostCurrencyExVat: movement.unitCostCurrencyExVat ?? null,
      });
      officialCostStatus = "covered";
      reviewReason = null;
    } else if (movement.kind === "purchaseReturn") {
      const purchase = purchaseRegistry.get(movement.originalPurchaseId);
      const canReverse = purchase
        && purchase.productCode === text(movement.productCode)
        && purchase.depotCode === text(movement.depotCode)
        && purchase.productCurrency === movementCurrency
        && movement.quantity <= purchase.remainingQuantity
        && movement.quantity <= state.stockQuantity;
      if (canReverse) {
        state.stockQuantity -= movement.quantity;
        state.stockValueTryExVat -= movement.quantity * purchase.unitCostTryExVat;
        state.stockValueTryExVat = Math.max(0, state.stockValueTryExVat);
        if (purchase.unitCostCurrencyExVat != null && state.stockValueCurrencyExVat != null) {
          state.stockValueCurrencyExVat = Math.max(
            0,
            state.stockValueCurrencyExVat - movement.quantity * purchase.unitCostCurrencyExVat,
          );
        } else {
          state.stockValueCurrencyExVat = null;
        }
        state.weightedUnitCostTryExVat = state.stockQuantity > 0
          ? state.stockValueTryExVat / state.stockQuantity
          : null;
        state.weightedUnitCostCurrencyExVat = state.stockQuantity > 0 && state.stockValueCurrencyExVat != null
          ? state.stockValueCurrencyExVat / state.stockQuantity
          : null;
        purchase.remainingQuantity -= movement.quantity;
        officialLineCostTryExVat = -(movement.quantity * purchase.unitCostTryExVat);
        officialLineCostCurrencyExVat = purchase.unitCostCurrencyExVat != null
          ? -(movement.quantity * purchase.unitCostCurrencyExVat)
          : null;
        appliedUnitCostCurrencyExVat = purchase.unitCostCurrencyExVat;
        officialCostStatus = "covered";
        reviewReason = null;
        appliedUnitCostTryExVat = purchase.unitCostTryExVat;
      } else {
        reviewReason = "unmatched-or-insufficient-purchase-return";
      }
    } else {
      const availableQuantity = Math.max(0, state.stockQuantity);
      const unitCost = state.weightedUnitCostTryExVat;
      const unitCostCurrency = state.weightedUnitCostCurrencyExVat;

      if (movement.kind === "sale") {
        if (movement.quantity <= availableQuantity) {
          state.stockQuantity -= movement.quantity;
          state.stockValueTryExVat -= movement.quantity * (unitCost || 0);
          if (unitCostCurrency != null && state.stockValueCurrencyExVat != null) {
            state.stockValueCurrencyExVat -= movement.quantity * unitCostCurrency;
          }
          if (state.stockQuantity === 0) state.stockValueTryExVat = 0;
          if (state.stockQuantity === 0) state.stockValueCurrencyExVat = 0;
          officialLineCostTryExVat = unitCost != null ? unitCost * movement.quantity : null;
          officialLineCostCurrencyExVat = unitCostCurrency != null
            ? unitCostCurrency * movement.quantity
            : null;
          officialCostStatus = unitCost != null ? "covered" : "review";
          reviewReason = unitCost != null ? null : "missing-opening-or-purchase-cost";
          appliedUnitCostTryExVat = unitCost;
          appliedUnitCostCurrencyExVat = unitCostCurrency;
          costMethod = unitCost != null ? "movingWeightedAverage" : null;
        } else {
          state.stockQuantity -= movement.quantity;
          state.stockValueTryExVat = 0;
          officialCostStatus = "review";
          reviewReason = unitCost == null ? "missing-opening-or-purchase-cost" : "negative-stock";
          appliedUnitCostTryExVat = unitCost;

          const fallback = calculateNegativeStockMarginFallback({
            soldQuantity: movement.quantity,
            availableQuantity,
            observations: marginObservationsByStockKey.get(stockKey(movement)) || [],
          });
          const netSalesTryExVat = Number(movement.netAmountTryExVat);
          if (fallback.applied && Number.isFinite(netSalesTryExVat) && netSalesTryExVat >= 0) {
            appliedMarginPct = fallback.appliedMarginPct;
            appliedQuantity = fallback.appliedQuantity;
            officialLineCostTryExVat = netSalesTryExVat * (1 - appliedMarginPct / 100);
            officialCostStatus = "covered";
            reviewReason = null;
            costMethod = "negativeStockMarginFallback";
          }
        }
        soldRegistry.set(movement.id, {
          productCode: text(movement.productCode),
          depotCode: text(movement.depotCode),
          productCurrency: movementCurrency,
          remainingQuantity: movement.quantity,
          unitCostTryExVat: unitCost,
          unitCostCurrencyExVat: unitCostCurrency,
        });
      } else if (movement.kind === "saleReturn") {
        const original = soldRegistry.get(movement.originalSaleId);
        if (!original) {
          rows.push({
            ...movement,
            ...snapshot(state),
            beforeQuantity,
            beforeUnitCost,
            officialLineCostTryExVat: null,
            officialLineCostCurrencyExVat: null,
            officialCostStatus: "review",
            reviewReason: "missing-original-sale-cost",
            appliedUnitCostTryExVat: null,
            appliedUnitCostCurrencyExVat: null,
          });
          continue;
        }
        const canReverse = original.productCode === text(movement.productCode)
          && original.depotCode === text(movement.depotCode)
          && original.productCurrency === movementCurrency
          && original.unitCostTryExVat != null
          && movement.quantity <= original.remainingQuantity;
        if (canReverse) {
          state.stockQuantity += movement.quantity;
          state.stockValueTryExVat += movement.quantity * original.unitCostTryExVat;
          if (original.unitCostCurrencyExVat != null) {
            state.stockValueCurrencyExVat = (state.stockValueCurrencyExVat || 0)
              + movement.quantity * original.unitCostCurrencyExVat;
          }
          state.weightedUnitCostTryExVat = state.stockQuantity > 0
            ? state.stockValueTryExVat / state.stockQuantity
            : original.unitCostTryExVat;
          state.weightedUnitCostCurrencyExVat = state.stockQuantity > 0 && state.stockValueCurrencyExVat != null
            ? state.stockValueCurrencyExVat / state.stockQuantity
            : original.unitCostCurrencyExVat;
          officialLineCostTryExVat = -(movement.quantity * original.unitCostTryExVat);
          officialLineCostCurrencyExVat = original.unitCostCurrencyExVat != null
            ? -(movement.quantity * original.unitCostCurrencyExVat)
            : null;
          appliedUnitCostCurrencyExVat = original.unitCostCurrencyExVat;
          officialCostStatus = "covered";
          reviewReason = null;
          appliedUnitCostTryExVat = original.unitCostTryExVat;
          original.remainingQuantity -= movement.quantity;
        } else {
          officialCostStatus = "review";
          reviewReason = original.unitCostTryExVat == null
            ? "missing-original-sale-cost"
            : "sale-return-exceeds-original-quantity";
        }
      }
    }

    if (movement.kind !== "saleReturn" && movement.kind !== "purchaseReturn") {
      state.weightedUnitCostTryExVat = state.stockQuantity > 0
        ? state.stockValueTryExVat / state.stockQuantity
        : state.weightedUnitCostTryExVat;
    }
    if (movement.kind === "sale" && beforeUnitCost != null && appliedUnitCostTryExVat == null) {
      appliedUnitCostTryExVat = beforeUnitCost;
    }

    rows.push({
      ...movement,
      ...snapshot(state),
      appliedUnitCostTryExVat,
      appliedUnitCostCurrencyExVat,
      negativeQuantity: Math.max(0, -state.stockQuantity),
      officialLineCostTryExVat,
      officialLineCostCurrencyExVat,
      officialCostStatus,
      reviewReason,
      costMethod,
      appliedMarginPct,
      appliedQuantity,
    });
  }

  return rows;
}

function comparableStockKey(movement) {
  return `${text(movement?.productCode)}\u001f${text(movement?.depotCode)}\u001f${currencyCode(movement?.productCurrency) || ""}`;
}

function priorClosingEntry(key, value) {
  const parts = String(key).split("\u001f");
  const productCode = text(value?.productCode) || parts[0] || "";
  const depotCode = text(value?.depotCode) || parts[1] || "";
  const productCurrency = currencyCode(value?.productCurrency) || currencyCode(parts[2]);
  const quantity = Number(value?.quantity);
  const unitCostTryExVat = Number(value?.unitCostTryExVat ?? value?.unitCost);
  const unitCostCurrencyExVat = value?.unitCostCurrencyExVat == null
    ? null
    : Number(value.unitCostCurrencyExVat);
  if (!productCode || !depotCode || !productCurrency || !Number.isFinite(quantity) || quantity <= 0
    || !Number.isFinite(unitCostTryExVat) || unitCostTryExVat <= 0
    || (productCurrency !== "TRY"
      && (!Number.isFinite(unitCostCurrencyExVat) || unitCostCurrencyExVat <= 0))) return null;
  return {
    id: `prior-closing:${productCode}:${depotCode}:${productCurrency}`,
    productCode,
    depotCode,
    productCurrency,
    kind: "opening",
    date: null,
    quantity,
    unitCostTryExVat,
    unitCostCurrencyExVat,
    sourceSequence: Number.NEGATIVE_INFINITY,
    sourceEvidence: { method: "prior-year-closing", closingDate: dateKey(value?.closingDate) },
  };
}

function comparableReviewRow(row, costStatus, reviewReason) {
  return {
    ...row,
    costStatus,
    financialStatus: "blocked",
    officialCostStatus: "review",
    officialLineCostTryExVat: null,
    officialLineCostCurrencyExVat: null,
    costMethod: null,
    reviewReason,
  };
}

/**
 * Seçili iki-yıllık karşılaştırma için candidate WAC kapsamı üretir.
 *
 * Bu wrapper resmi kaynak sözleşmesini açmaz. Maliyetsiz açılış/alım satırları
 * modelin validation katmanına sokulmadan `review`/`unpriced` karantinasında
 * tutulur; önceki kapanış yalnız aynı ürün-depo-para birimi anahtarında seed
 * olarak taşınır. Negatif stok için marj tahmini özellikle etkinleştirilmez.
 */
export function buildComparableYearWac({ year, movements = [], priorClosingWac = new Map() } = {}) {
  if (!Number.isInteger(year) || year < 2000) throw new TypeError("Geçerli bir karşılaştırma yılı zorunludur.");
  if (!Array.isArray(movements)) throw new TypeError("Karşılaştırma hareketleri dizi olmalıdır.");
  const start = `${year}-01-01`;
  const end = `${year + 1}-01-01`;
  const validKinds = new Set(["opening", "purchase", "purchaseReturn", "sale", "saleReturn"]);
  const sourceRows = movements
    .map((row) => ({ ...row, date: dateKey(row?.date ?? row?.movementDate) }))
    .filter((row) => row.date && row.date >= start && row.date < end);
  const reviewRows = [];
  const eligible = [];
  const validKeys = new Set();
  const hasCostedOpening = new Set();

  for (const row of sourceRows) {
    const kind = text(row?.kind);
    const productCode = text(row?.productCode);
    const depotCode = text(row?.depotCode);
    const productCurrency = currencyCode(row?.productCurrency);
    const quantity = Number(row?.quantity);
    const normalized = { ...row, productCode, depotCode, productCurrency, kind, quantity };
    const key = comparableStockKey(normalized);
    if (!productCode || !depotCode || !productCurrency || !validKinds.has(kind)
      || !Number.isFinite(quantity) || quantity <= 0) {
      reviewRows.push(comparableReviewRow(normalized, "review", !productCode || !depotCode
        ? "invalid-stock-identity"
        : (!productCurrency ? "missing-product-currency" : (!validKinds.has(kind)
          ? "movement-kind-unverified" : "invalid-quantity"))));
      continue;
    }
    validKeys.add(key);
    if (["opening", "purchase"].includes(kind)) {
      const unitCostTryExVat = Number(row?.unitCostTryExVat);
      const unitCostCurrencyExVat = row?.unitCostCurrencyExVat == null
        ? null
        : Number(row.unitCostCurrencyExVat);
      const validTryCost = Number.isFinite(unitCostTryExVat) && unitCostTryExVat > 0;
      const validCurrencyCost = productCurrency === "TRY"
        || (Number.isFinite(unitCostCurrencyExVat) && unitCostCurrencyExVat > 0);
      if (!validTryCost || !validCurrencyCost) {
        reviewRows.push(comparableReviewRow(normalized, kind === "purchase" ? "unpriced" : "review",
          kind === "purchase" ? "unpriced" : "opening-cost-unknown"));
        continue;
      }
      hasCostedOpening.add(key);
    }
    if (kind === "saleReturn" && !text(row?.originalSaleId)) {
      reviewRows.push(comparableReviewRow(normalized, "review", "missing-original-sale-cost"));
      continue;
    }
    if (kind === "purchaseReturn" && !text(row?.originalPurchaseId)) {
      reviewRows.push(comparableReviewRow(normalized, "review", "unmatched-purchase-return"));
      continue;
    }
    eligible.push({ ...normalized });
  }

  const carried = [];
  const priorEntries = priorClosingWac instanceof Map
    ? [...priorClosingWac.entries()]
    : Object.entries(priorClosingWac || {});
  for (const [key, value] of priorEntries) {
    if (!validKeys.has(key) || hasCostedOpening.has(key)) continue;
    const seed = priorClosingEntry(key, value);
    if (!seed) continue;
    carried.push({ ...seed, date: start });
  }

  const calculated = buildOfficialMovementCosts([...carried, ...eligible]);
  const calculatedById = new Map(calculated.map((row) => [String(row.id), row]));
  const outputRows = sourceRows.map((row) => {
    const result = calculatedById.get(String(row.id));
    if (!result) return reviewRows.find((review) => String(review.id) === String(row.id))
      || comparableReviewRow(row, "review", "not-calculated");
    const estimated = result.costMethod === "negativeStockMarginFallback";
    const normalizedReviewReason = result.reviewReason === "missing-opening-or-purchase-cost"
      ? "opening-cost-unknown"
      : result.reviewReason;
    return {
      ...result,
      costStatus: estimated ? "review" : result.officialCostStatus,
      financialStatus: "blocked",
      reviewReason: estimated ? "estimated-negative-stock-cost" : normalizedReviewReason,
    };
  });

  const lastByKey = new Map();
  for (const row of calculated) lastByKey.set(comparableStockKey(row), row);
  const closingWacByStockKey = {};
  for (const [key, row] of lastByKey.entries()) {
    if (row.stockQuantity > 0 && row.weightedUnitCostTryExVat > 0) {
      closingWacByStockKey[key] = {
        quantity: row.stockQuantity,
        unitCostTryExVat: row.weightedUnitCostTryExVat,
        unitCostCurrencyExVat: row.weightedUnitCostCurrencyExVat,
        productCurrency: row.productCurrency,
        closingDate: dateKey(row.date),
        source: "comparable-year-wac",
      };
    }
  }
  const coveredRows = outputRows.filter((row) => row.costStatus === "covered").length;
  const reviewCountByReason = {};
  for (const row of outputRows) {
    if (row.costStatus === "covered") continue;
    const reason = row.reviewReason || "unspecified-review";
    reviewCountByReason[reason] = (reviewCountByReason[reason] || 0) + 1;
  }
  const dates = [
    ...outputRows.filter((row) => row.costStatus === "covered" && row.date).map((row) => row.date),
    ...(carried.length ? [start] : []),
  ];
  return {
    year,
    dateRange: { start, endExclusive: end },
    status: "candidate",
    financialStatus: "blocked",
    eligibleForOfficialWac: false,
    sourceRowCount: sourceRows.length,
    rows: outputRows,
    coveredRows,
    reviewRows: outputRows.length - coveredRows,
    coveredRatio: outputRows.length ? coveredRows / outputRows.length : 0,
    carriedClosingWacCount: carried.length,
    carriedClosingWacKeys: carried.map(comparableStockKey),
    closingWacByStockKey,
    firstReliableCalculationDate: dates.length ? dates.sort()[0] : null,
    reviewCountByReason,
  };
}

/** Doğrulanmış WAC çıktısını ekonomik ledger satırlarına bağlar. */
export function attachOfficialMovementCosts({ source = {}, economicRows = [], movements = [], marginObservationsByStockKey = new Map(), observationByMovementId = new Map() } = {}) {
  if (!Array.isArray(economicRows)) throw new TypeError("Ekonomik satırlar dizi olmalıdır.");
  if (!Array.isArray(movements)) throw new TypeError("Stok hareketleri dizi olmalıdır.");
  const financialEvidenceReady = source?.financialStatus === undefined
    || source?.financialStatus === "ready";
  if (source?.status !== "verified"
    || Number(source?.contractVersion) !== 1
    || !financialEvidenceReady) {
    return economicRows.map((row) => ({ ...row }));
  }

  const costRows = buildOfficialMovementCosts(movements, { marginObservationsByStockKey });
  const byId = new Map(costRows.map((row) => [String(row.id), row]));
  return economicRows.map((row) => {
    const movementId = row?.inventoryMovementId ?? row?.sourceRowId ?? row?.rootId ?? row?.id;
    const cost = byId.get(String(movementId));
    if (!cost) return { ...row };
    const stockObservations = marginObservationsByStockKey instanceof Map
      ? marginObservationsByStockKey.get(stockKey(cost)) || []
      : [];
    const observation = observationByMovementId instanceof Map
      ? observationByMovementId.get(String(movementId)) || stockObservations[0] || null
      : stockObservations[0] || null;
    return {
      ...row,
      financeV2: {
        ...(row.financeV2 || {}),
        schemaVersion: 2,
        costMethod: cost.costMethod || "movingWeightedAverage",
        costStatus: cost.officialCostStatus,
        lineCostTryExVat: cost.officialLineCostTryExVat,
        lineCostCurrencyExVat: cost.officialLineCostCurrencyExVat,
        appliedUnitCostTryExVat: cost.appliedUnitCostTryExVat,
        appliedUnitCostCurrencyExVat: cost.appliedUnitCostCurrencyExVat,
        appliedMarginPct: cost.appliedMarginPct,
        appliedQuantity: cost.appliedQuantity,
        productCurrency: cost.productCurrency || observation?.productCurrency || row.financeV2?.productCurrency || null,
        retailUnitPriceCurrencyExVat: observation?.retailUnitPriceCurrencyExVat ?? row.financeV2?.retailUnitPriceCurrencyExVat ?? null,
        unitCostCurrencyExVat: observation?.unitCostCurrencyExVat ?? cost.appliedUnitCostCurrencyExVat ?? row.financeV2?.unitCostCurrencyExVat ?? null,
        unitDiscountCurrencyExVat: observation?.unitDiscountCurrencyExVat ?? row.financeV2?.unitDiscountCurrencyExVat ?? null,
        productListGrossMarginPct: observation?.productListGrossMarginPct ?? row.financeV2?.productListGrossMarginPct ?? null,
        observationKey: observation?.observationKey ?? row.financeV2?.observationKey ?? null,
        exchangeEvidence: observation?.exchangeEvidence ?? row.financeV2?.exchangeEvidence ?? null,
        reviewReason: cost.reviewReason,
      },
    };
  });
}

/**
 * Tarihli alım ve satış hareketlerinden hareketli ağırlıklı ortalama maliyet zaman çizgisi üretir.
 * Tarihli alım ve satış hareketlerinden hareketli ağırlıklı ortalama maliyet zaman çizgisi üretir.
 * Negatif satış adedi sonraki alımlara fiziksel stok açığı olarak devredilir.
 *
 * @param {Object[]} movements
 */
export function buildMovingWeightedAverageCosts(movements = []) {
  if (!Array.isArray(movements)) throw new TypeError("Stok hareketleri dizi olmalıdır.");
  const ordered = movements.map((movement) => ({ ...movement }));
  for (const movement of ordered) validateMovement(movement);
  ordered.sort((left, right) => (
    String(left.date).localeCompare(String(right.date), "tr")
    || String(left.id).localeCompare(String(right.id), "tr")
  ));

  let stockQuantity = 0;
  let stockValueTryExVat = 0;
  let weightedUnitCostTryExVat = null;

  return ordered.map((movement) => {
    let negativeQuantity = 0;
    let appliedUnitCostTryExVat = null;

    if (movement.kind === "purchase") {
      const openingQuantity = stockQuantity;
      if (openingQuantity < 0) {
        stockQuantity = openingQuantity + movement.quantity;
        stockValueTryExVat = stockQuantity > 0
          ? stockQuantity * movement.unitCostTryExVat
          : 0;
      } else {
        stockQuantity += movement.quantity;
        stockValueTryExVat += movement.quantity * movement.unitCostTryExVat;
      }
      weightedUnitCostTryExVat = stockQuantity > 0
        ? stockValueTryExVat / stockQuantity
        : null;
      negativeQuantity = Math.max(0, -stockQuantity);
    } else {
      const availableQuantity = Math.max(0, stockQuantity);
      appliedUnitCostTryExVat = weightedUnitCostTryExVat;
      negativeQuantity = Math.max(0, movement.quantity - availableQuantity);
      if (movement.quantity <= availableQuantity) {
        stockQuantity -= movement.quantity;
        stockValueTryExVat -= movement.quantity * (weightedUnitCostTryExVat || 0);
        if (stockQuantity === 0) stockValueTryExVat = 0;
      } else {
        stockQuantity -= movement.quantity;
        stockValueTryExVat = 0;
      }
      weightedUnitCostTryExVat = stockQuantity > 0
        ? stockValueTryExVat / stockQuantity
        : appliedUnitCostTryExVat;
    }

    return {
      ...movement,
      stockQuantity,
      stockValueTryExVat,
      weightedUnitCostTryExVat,
      appliedUnitCostTryExVat,
      negativeQuantity,
    };
  });
}

/**
 * Miktardan fazla satışta benzersiz ürün marjı kanıtlarının aritmetik ortalamasını
 * satılan tüm adede, eksiye düşen adetler dahil, uygular.
 *
 * @param {Object} input
 */
export function calculateNegativeStockMarginFallback({
  soldQuantity,
  availableQuantity,
  observations = [],
  weightByQuantity = true,
} = {}) {
  if (!finitePrimitive(soldQuantity) || soldQuantity <= 0
    || !finitePrimitive(availableQuantity) || availableQuantity < 0) {
    throw new TypeError("Satılan ve mevcut miktar geçerli sayı olmalıdır.");
  }
  if (!Array.isArray(observations)) throw new TypeError("Marj gözlemleri dizi olmalıdır.");

  const negativeQuantity = Math.max(0, soldQuantity - availableQuantity);
  if (negativeQuantity === 0) {
    return {
      applied: false,
      method: null,
      appliedMarginPct: null,
      appliedQuantity: 0,
      negativeQuantity: 0,
      observationCount: 0,
      purchaseEvidenceQuantity: 0,
      reviewReason: null,
    };
  }

  const unique = new Map();
  for (const observation of observations) {
    const key = text(observation?.observationKey);
    const margin = observation?.productListGrossMarginPct;
    const purchaseQuantity = observation?.purchaseQuantity;
    if (!key || !finitePrimitive(margin)
      || !finitePrimitive(purchaseQuantity) || purchaseQuantity <= 0
      || unique.has(key)) continue;
    unique.set(key, { margin, purchaseQuantity });
  }
  const valid = [...unique.values()];
  if (valid.length === 0) {
    return {
      applied: false,
      method: "negative-stock-average-product-list-margin",
      appliedMarginPct: null,
      appliedQuantity: 0,
      negativeQuantity,
      observationCount: 0,
      purchaseEvidenceQuantity: 0,
      reviewReason: "missing-margin-observation",
    };
  }

  const purchaseEvidenceQuantity = valid.reduce((sum, item) => sum + item.purchaseQuantity, 0);
  const appliedMarginPct = weightByQuantity && purchaseEvidenceQuantity > 0
    ? valid.reduce((sum, item) => sum + item.margin * item.purchaseQuantity, 0) / purchaseEvidenceQuantity
    : valid.reduce((sum, item) => sum + item.margin, 0) / valid.length;

  return {
    applied: true,
    method: "negative-stock-average-product-list-margin",
    appliedMarginPct,
    appliedQuantity: soldQuantity,
    negativeQuantity,
    observationCount: valid.length,
    purchaseEvidenceQuantity,
    reviewReason: null,
  };
}
