const MOVEMENT_KINDS = new Set(["opening", "purchase", "purchaseReturn", "sale", "saleReturn"]);

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function currency(value) {
  const normalized = text(value).toUpperCase();
  if (!normalized || normalized === "TL") return normalized === "TL" ? "TRY" : null;
  return normalized;
}

function date(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  const normalized = text(value);
  return /^\d{4}-\d{2}-\d{2}/.test(normalized) ? normalized.slice(0, 10) : null;
}

function positiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new TypeError(`${label} pozitif olmalıdır.`);
  return number;
}

function movementKind(value) {
  const normalized = text(value);
  if (MOVEMENT_KINDS.has(normalized)) return normalized;
  const aliases = { in: "purchase", out: "sale", return: "saleReturn" };
  return aliases[normalized] || null;
}

const CPM_DOCUMENT_TYPE_KINDS = Object.freeze({
  81: "opening",
  9: "purchase",
  609: "purchase",
  17: "sale",
  85: "sale",
  91: "sale",
  18: "saleReturn",
});

/** CPM aday belge türlerini yalnızca tanısal olarak WAC hareket türlerine eşler. */
export function summarizeCpmMovementCandidates({ rows = [] } = {}) {
  if (!Array.isArray(rows)) throw new TypeError("CPM hareket adayları dizi olmalıdır.");
  const kindCounts = {};
  const unmappedDocumentTypes = new Set();
  let mappedRowCount = 0;
  for (const row of rows) {
    const documentType = Number(row?.documentType ?? row?.EVRAKTIP);
    const kind = CPM_DOCUMENT_TYPE_KINDS[documentType];
    if (!kind) {
      if (Number.isFinite(documentType)) unmappedDocumentTypes.add(documentType);
      continue;
    }
    mappedRowCount += 1;
    kindCounts[kind] = (kindCounts[kind] || 0) + 1;
  }
  const unmapped = [...unmappedDocumentTypes].sort((left, right) => left - right);
  return {
    status: "candidate",
    rowCount: rows.length,
    mappedRowCount,
    kindCounts,
    unmappedDocumentTypes: unmapped,
    reviewReason: unmapped.length ? "movement-kind-unverified" : "movement-source-not-verified",
  };
}

/**
 * Açılış maliyetini hesaplamadan hareket etkisini ürün-depo doğal anahtarında
 * görünür kılar. Belirsiz türler ve eksik anahtarlar ayrı karantinada kalır.
 */
export function summarizeMovementImpact(rows = []) {
  if (!Array.isArray(rows)) throw new TypeError("Hareket etkisi satırları dizi olmalıdır.");
  const byStockKey = {};
  const unmappedKinds = new Set();
  let quarantineRows = 0;
  for (const row of rows) {
    const kind = movementKind(row?.kind ?? row?.movementType ?? row?.movementKind);
    const productCode = text(row?.productCode ?? row?.cardCode ?? row?.MALKOD);
    const depotCode = text(row?.depotCode ?? row?.DEPOKOD);
    const quantity = Number(row?.quantity ?? row?.MIKTAR);
    if (!kind) {
      const label = text(row?.kind ?? row?.movementType ?? row?.movementKind) || "unknown";
      unmappedKinds.add(label);
      quarantineRows += 1;
      continue;
    }
    if (!productCode || !depotCode || !Number.isFinite(quantity) || quantity <= 0) {
      quarantineRows += 1;
      continue;
    }
    const stockKey = `${productCode}\u001f${depotCode}`;
    const current = byStockKey[stockKey] || {
      productCode,
      depotCode,
      openingQuantity: 0,
      purchaseQuantity: 0,
      saleQuantity: 0,
      saleReturnQuantity: 0,
      purchaseReturnQuantity: 0,
      netQuantityImpact: 0,
      rowCount: 0,
      quarantineCount: 0,
    };
    const field = {
      opening: "openingQuantity",
      purchase: "purchaseQuantity",
      sale: "saleQuantity",
      saleReturn: "saleReturnQuantity",
      purchaseReturn: "purchaseReturnQuantity",
    }[kind];
    current[field] += quantity;
    current.netQuantityImpact += ["opening", "purchase", "saleReturn"].includes(kind) ? quantity : -quantity;
    current.rowCount += 1;
    byStockKey[stockKey] = current;
  }
  return {
    status: "candidate",
    byStockKey,
    unmappedKinds: [...unmappedKinds].sort(),
    quarantineRows,
    official: false,
    reviewReason: unmappedKinds.size || quarantineRows ? "movement-evidence-incomplete" : "movement-source-not-verified",
  };
}

function movementDocumentKey(row, { includeLine = true } = {}) {
  const documentType = Number(row?.documentType ?? row?.EVRAKTIP);
  const documentNumber = text(row?.documentNumber ?? row?.documentNo ?? row?.EVRAKNO);
  const productCode = text(row?.productCode ?? row?.cardCode ?? row?.MALKOD);
  const lineNumber = text(row?.lineNumber ?? row?.lineNo ?? row?.SIRANO);
  if (!Number.isFinite(documentType) || !documentNumber || !productCode) return null;
  return `${documentType}|${documentNumber}|${productCode}|${includeLine ? lineNumber : ""}`;
}

function sourceSaleIdForReturn(row, rowsByDocumentKey) {
  const sourceType = Number(row?.sourceDocumentType);
  const sourceNumber = text(row?.sourceDocumentNumber);
  const sourceLine = text(row?.sourceLineNumber);
  if (!CPM_DOCUMENT_TYPE_KINDS[sourceType] || ![17, 85, 91].includes(sourceType)
    || !sourceNumber) return null;
  const productCode = text(row?.productCode);
  const exactKey = `${sourceType}|${sourceNumber}|${productCode}|${sourceLine}`;
  const exact = rowsByDocumentKey.get(exactKey) || [];
  if (exact.length === 1) return exact[0].id;
  if (sourceLine) return null;
  const documentMatches = [...rowsByDocumentKey.entries()]
    .filter(([key]) => key.startsWith(`${sourceType}|${sourceNumber}|${productCode}|`))
    .flatMap(([, matches]) => matches);
  return documentMatches.length === 1 ? documentMatches[0].id : null;
}

/**
 * Ham STKHAR adaylarını WAC motorunun giriş şekline çevirir.
 *
 * Bu fonksiyon kaynak sözleşmesini doğrulamaz ve resmi durumu açmaz. Net alış
 * maliyeti yalnızca pozitif miktar ve brüt-iskonto kanıtı varsa üretilir;
 * DVZHAR/STKKRT sözleşmesi doğrulanmadığı için yabancı kaynak maliyeti burada
 * TRY'ye çevrilmez. Ham kaynak/işlem dövizi kanıtı korunur; doğrulanmamış
 * satırlar review olarak kalır. Depo, ürün anahtarının parçası olarak yalnızca inceleme
 * sinyali taşır; WAC motoru depo transfer sözleşmesi doğrulanmadan ürünleri
 * depolar arasında birleştirmez.
 */
export function buildCpmWacMovementCandidates({ rows = [] } = {}) {
  if (!Array.isArray(rows)) throw new TypeError("CPM hareket adayları dizi olmalıdır.");
  const rowsByDocumentKey = new Map();
  for (const row of rows) {
    const key = movementDocumentKey(row);
    if (!key) continue;
    if (!rowsByDocumentKey.has(key)) rowsByDocumentKey.set(key, []);
    rowsByDocumentKey.get(key).push({
      id: text(row?.id ?? row?.movementId),
      productCode: text(row?.productCode ?? row?.cardCode ?? row?.MALKOD),
    });
  }

  const movements = [];
  let invalidCostRows = 0;
  let invalidMovementRows = 0;
  let unlinkedReturnRows = 0;
  const productsByDepot = new Map();
  const reviewReasons = {};
  const addReview = (reason) => { reviewReasons[reason] = (reviewReasons[reason] || 0) + 1; };

  for (const row of rows) {
    const id = text(row?.id ?? row?.movementId);
    const productCode = text(row?.productCode ?? row?.cardCode ?? row?.MALKOD);
    const documentType = Number(row?.documentType ?? row?.EVRAKTIP);
    const kind = CPM_DOCUMENT_TYPE_KINDS[documentType];
    const movementDate = date(row?.movementDate ?? row?.documentDate ?? row?.date);
    const quantity = Number(row?.quantity);
    if (productCode && text(row?.depotCode)) {
      if (!productsByDepot.has(productCode)) productsByDepot.set(productCode, new Set());
      productsByDepot.get(productCode).add(text(row.depotCode));
    }
    if (!id || !productCode || !kind || !movementDate || !Number.isFinite(quantity) || quantity <= 0) {
      invalidMovementRows += 1;
      addReview(!kind ? "movement-kind-unverified" : "invalid-movement-fields");
      continue;
    }

    const movement = {
      id,
      productCode,
      kind,
      date: movementDate,
      quantity,
      sourceSequence: Number.isFinite(Number(row?.lineNumber)) ? Number(row.lineNumber) : null,
      ...(text(row?.depotCode) ? { depotCode: text(row.depotCode) } : {}),
      ...(text(row?.depotCode) ? { stockKey: `${productCode}\u001f${text(row.depotCode)}` } : {}),
      sourceEvidence: {
        documentType,
        documentNumber: text(row?.documentNumber),
        lineNumber: row?.lineNumber ?? null,
        directionCode: row?.directionCode ?? null,
      },
    };

    if (["opening", "purchase"].includes(kind)) {
      const gross = Number(row?.grossAmount);
      const discount = Number(row?.discountAmount);
      const net = gross - discount;
      if (!Number.isFinite(gross) || !Number.isFinite(discount) || !Number.isFinite(net) || net <= 0) {
        invalidCostRows += 1;
        addReview("invalid-purchase-cost-evidence");
        continue;
      }
      const sourceCurrency = currency(row?.currency ?? row?.priceCurrency ?? row?.FIYATDOVIZCINS);
      const sourceRate = Number(row?.currencyRate ?? row?.priceCurrencyRate ?? row?.FIYATDOVIZKUR);
      const normalizedSourceRate = Number.isFinite(sourceRate) && sourceRate > 0 ? sourceRate : null;
      movement.costEvidence = {
        sourceAmount: net,
        sourceUnitPrice: Number.isFinite(Number(row?.unitPrice)) ? Number(row.unitPrice) : null,
        sourceCurrency,
        sourceRate: normalizedSourceRate,
        transactionCurrency: currency(row?.transactionCurrency ?? row?.DOVIZCINS),
        transactionRate: Number.isFinite(Number(row?.transactionCurrencyRate ?? row?.DOVIZKUR))
          && Number(row?.transactionCurrencyRate ?? row?.DOVIZKUR) > 0
          ? Number(row.transactionCurrencyRate ?? row.DOVIZKUR) : null,
        documentDate: movementDate,
        rateEvidence: null,
      };
      const tryParity = (!sourceCurrency || sourceCurrency === "TRY")
        && (!normalizedSourceRate || normalizedSourceRate === 1);
      if (tryParity) {
        movement.unitCostTryExVat = net / quantity;
        movement.costEvidence.rateEvidence = {
          source: "FIYATDOVIZKUR",
          status: "verified",
          method: "try-parity",
        };
      } else {
        movement.unitCostTryExVat = null;
        movement.costEvidence.rateEvidence = {
          source: null,
          status: "review_required",
          reason: "foreign-cost-awaiting-halkbank-rate",
        };
        invalidCostRows += 1;
        addReview("foreign-cost-awaiting-halkbank-rate");
      }
    }

    if (kind === "sale") {
      const gross = Number(row?.grossAmount);
      const discount = Number(row?.discountAmount);
      const net = gross - discount;
      if (Number.isFinite(gross) && Number.isFinite(discount) && Number.isFinite(net) && net >= 0) {
        // Negatif stok fallback'i yalnız açıkça kanıtlanmış net satış tutarıyla
        // çalışır; eksik veya geçersiz fatura tutarı maliyet uydurmaz.
        movement.netAmountTryExVat = net;
      }
    }

    if (kind === "saleReturn") {
      const originalSaleId = sourceSaleIdForReturn(row, rowsByDocumentKey);
      if (!originalSaleId) {
        unlinkedReturnRows += 1;
        addReview("unlinked-sale-return");
        continue;
      }
      movement.originalSaleId = originalSaleId;
    }
    movements.push(movement);
  }

  const multiDepotProductCount = [...productsByDepot.values()].filter((depots) => depots.size > 1).length;
  const reviewCounts = {
    invalidCostRows,
    invalidMovementRows,
    unlinkedReturnRows,
    multiDepotProductCount,
    missingDepotCount: rows.filter((row) => !text(row?.depotCode)).length,
  };
  const reviewReason = multiDepotProductCount > 0
    ? "depot-grain-not-resolved"
    : (invalidCostRows || invalidMovementRows || unlinkedReturnRows
      ? "movement-evidence-incomplete"
      : "movement-source-not-verified");
  return {
    status: "candidate",
    movements,
    reviewReason,
    reviewCounts,
    reviewReasons,
    sourceRowCount: rows.length,
    candidateMovementCount: movements.length,
  };
}

/** WAC kaynağının açılış ve tarihsel döviz kanıtını özetler; hiçbir satırı değiştirmez. */
export function summarizeInventoryMovementEvidence(rows = []) {
  if (!Array.isArray(rows)) throw new TypeError("Stok hareketleri dizi olmalıdır.");
  const products = new Set();
  const openingProducts = new Set();
  const openingCounts = new Map();
  const economicProducts = new Set();
  const dates = [];
  let foreignCostEvidenceRows = 0;
  for (const row of rows) {
    const productCode = text(row?.productCode ?? row?.cardCode);
    if (productCode) products.add(productCode);
    const kind = movementKind(row?.kind ?? row?.movementType ?? row?.movementKind);
    if (kind === "opening") {
      if (productCode) {
        openingProducts.add(productCode);
        openingCounts.set(productCode, (openingCounts.get(productCode) || 0) + 1);
      }
    }
    if (["sale", "saleReturn"].includes(kind) && productCode) economicProducts.add(productCode);
    const movementDate = date(row?.date ?? row?.documentDate ?? row?.movementDate);
    if (movementDate) dates.push(movementDate);
    const productCurrency = text(row?.productCurrency).toUpperCase();
    if (["opening", "purchase"].includes(kind)
      && productCurrency && productCurrency !== "TRY"
      && Number.isFinite(Number(row?.unitCostCurrencyExVat))
      && Number(row.unitCostCurrencyExVat) > 0) {
      foreignCostEvidenceRows += 1;
    }
  }
  const duplicateOpeningProductCount = [...openingCounts.values()].filter((count) => count > 1).length;
  const economicDuplicateOpeningProductCount = [...openingCounts.entries()]
    .filter(([productCode, count]) => count > 1 && economicProducts.has(productCode)).length;
  return {
    rowCount: rows.length,
    productCount: products.size,
    openingProductCount: openingProducts.size,
    duplicateOpeningProductCount,
    economicDuplicateOpeningProductCount,
    foreignCostEvidenceRows,
    dateMin: dates.length ? dates.sort()[0] : null,
    dateMax: dates.length ? dates.sort().at(-1) : null,
    openingEvidenceStatus: duplicateOpeningProductCount > 0
      ? "ambiguous"
      : (products.size > 0 && openingProducts.size === products.size ? "complete" : "partial"),
  };
}

/** Önceki kapanış ile seçili yıl açılışını ürün seviyesinde uzlaştırır. */
export function buildAnnualOpeningStates({ year, openingRows = [], priorClosingRows = [] } = {}) {
  if (!Number.isInteger(year) || year < 2000) throw new TypeError("Geçerli bir rapor yılı zorunludur.");
  const groups = new Map();
  const add = (row, kind) => {
    const productCode = text(row?.productCode ?? row?.cardCode);
    const quantity = Number(row?.quantity);
    const unitCost = Number(row?.unitCostTryExVat ?? row?.unitCost);
    const currency = text(row?.productCurrency).toUpperCase() || "TRY";
    if (!productCode || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost <= 0) return;
    const state = groups.get(productCode) || { opening: [], prior: [] };
    state[kind].push({ id: text(row?.id ?? row?.movementId), quantity, unitCost, currency });
    groups.set(productCode, state);
  };
  openingRows.forEach((row) => add(row, "opening"));
  priorClosingRows.forEach((row) => add(row, "prior"));
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "tr")).map(([productCode, state]) => {
    const rows = state.opening.length ? state.opening : state.prior;
    const currencies = new Set(rows.map((row) => row.currency));
    const quantity = rows.reduce((sum, row) => sum + row.quantity, 0);
    const valueTryExVat = rows.reduce((sum, row) => sum + row.quantity * row.unitCost, 0);
    const priorQuantity = state.prior.reduce((sum, row) => sum + row.quantity, 0);
    const openingQuantity = state.opening.reduce((sum, row) => sum + row.quantity, 0);
    const difference = Number((openingQuantity - priorQuantity).toFixed(6));
    const hasBoth = state.opening.length > 0 && state.prior.length > 0;
    const reconciliationStatus = currencies.size === 1 && (!hasBoth || Math.abs(difference) < 0.000001)
      ? "matched"
      : "review";
    return {
      productCode, year, quantity, valueTryExVat,
      unitCostTryExVat: valueTryExVat / quantity,
      productCurrency: currencies.size === 1 ? rows[0].currency : null,
      method: state.opening.length ? "cpm-opening" : "prior-year-closing",
      sourceRows: rows.map((row) => row.id).filter(Boolean),
      reconciliation: {
        previousClosingQuantity: priorQuantity || null,
        cpmOpeningQuantity: openingQuantity || null,
        difference,
        status: reconciliationStatus,
        official: reconciliationStatus === "matched",
      },
    };
  });
}

/** Resmî maliyet gerektiren terminal ekonomik satırların kapsamını ölçer. */
export function summarizeCostCoverage(rows = []) {
  if (!Array.isArray(rows)) throw new TypeError("Ekonomik satırlar dizi olmalıdır.");
  const required = rows.filter((row) => row?.costMethod !== "excludedIncome");
  const covered = required.filter((row) => row?.financeV2?.costStatus === "covered");
  const netSales = required.reduce((sum, row) => sum + Math.abs(Number(row?.netAmount || 0)), 0);
  const coveredNetSales = covered.reduce((sum, row) => sum + Math.abs(Number(row?.netAmount || 0)), 0);
  const byReviewReason = {};
  const reviewNetSalesByReason = {};
  const affectedProducts = new Set();
  for (const row of required) {
    if (row?.financeV2?.costStatus === "covered") continue;
    const reason = String(row?.financeV2?.reviewReason || row?.reviewReason || "unspecified-review");
    byReviewReason[reason] = (byReviewReason[reason] || 0) + 1;
    reviewNetSalesByReason[reason] = (reviewNetSalesByReason[reason] || 0) + Math.abs(Number(row?.netAmount || 0));
    const productCode = text(row?.productCode ?? row?.cardCode);
    if (productCode) affectedProducts.add(productCode);
  }
  const pct = (value, total) => total ? Number((value / total * 100).toFixed(1)) : 0;
  return {
    lineCount: required.length,
    coveredLines: covered.length,
    reviewLines: required.length - covered.length,
    netSales,
    coveredNetSales,
    netSalesCoveragePct: pct(coveredNetSales, netSales),
    lineCoveragePct: pct(covered.length, required.length),
    byReviewReason,
    affectedProductCount: affectedProducts.size,
    reviewNetSalesByReason,
  };
}

/** Ham CPM stok satırlarını WAC motorunun salt veri sözleşmesine çevirir. */
export function normalizeInventoryMovements(rows = []) {
  if (!Array.isArray(rows)) throw new TypeError("Stok hareketleri dizi olmalıdır.");
  return rows.map((row) => {
    const id = text(row?.id ?? row?.movementId);
    const productCode = text(row?.productCode ?? row?.cardCode);
    const kind = movementKind(row?.kind ?? row?.movementType ?? row?.movementKind);
    const movementDate = date(row?.date ?? row?.documentDate ?? row?.movementDate);
    if (!id) throw new TypeError("Stok hareketi kimliği zorunludur.");
    if (!productCode) throw new TypeError("Stok hareketi ürün kodu taşımalıdır.");
    if (!kind) throw new TypeError("Geçersiz stok hareket türü.");
    if (!movementDate) throw new TypeError("Stok hareketi tarihi geçerli olmalıdır.");
    const quantity = positiveNumber(row?.quantity, "Stok hareketi miktarı");
    const unitCostRaw = row?.unitCostTryExVat ?? row?.unitCost;
    const unitCostTryExVat = ["opening", "purchase"].includes(kind)
      ? positiveNumber(unitCostRaw, "Stok hareketi birim maliyeti")
      : (Number.isFinite(Number(unitCostRaw)) ? Number(unitCostRaw) : null);
    const unitCostCurrencyRaw = row?.unitCostCurrencyExVat ?? row?.unitCostCurrency;
    const unitCostCurrencyExVat = ["opening", "purchase"].includes(kind)
      && unitCostCurrencyRaw != null
      ? positiveNumber(unitCostCurrencyRaw, "Stok hareketi ürün dövizi birim maliyeti")
      : (Number.isFinite(Number(unitCostCurrencyRaw)) ? Number(unitCostCurrencyRaw) : null);
    const sourceSequence = Number.isFinite(Number(row?.sourceSequence)) ? Number(row.sourceSequence) : null;
    const originalSaleId = text(row?.originalSaleId ?? row?.sourceSaleId) || null;
    const originalPurchaseId = text(row?.originalPurchaseId ?? row?.sourcePurchaseId) || null;
    if (kind === "saleReturn" && !originalSaleId) throw new TypeError("Satış iadesi köken satışını taşımalıdır.");
    if (kind === "purchaseReturn" && !originalPurchaseId) throw new TypeError("Alış iadesi köken alımını taşımalıdır.");
    return {
      id, productCode, kind, date: movementDate, quantity, unitCostTryExVat,
      unitCostCurrencyExVat,
      productCurrency: text(row?.productCurrency) || null,
      sourceSequence, originalSaleId, originalPurchaseId,
      ...(text(row?.depotCode) ? { depotCode: text(row.depotCode) } : {}),
    };
  });
}

/** CPM aday satırlarını açık, kaynak-dışı hareket türü eşlemesiyle doğrular. */
export function resolveCpmMovementCandidates({ source = {}, rows = [], kindById = {} } = {}) {
  if (!Array.isArray(rows)) throw new TypeError("CPM hareket adayları dizi olmalıdır.");
  const lookup = kindById instanceof Map
    ? (id) => kindById.get(id)
    : (id) => kindById?.[id];
  const unmapped = rows.filter((row) => {
    const id = text(row?.id ?? row?.movementId);
    return !movementKind(row?.kind ?? row?.movementType ?? row?.movementKind ?? lookup(id));
  });
  if (unmapped.length > 0) {
    return {
      status: "missing", movements: [], reviewReason: "movement-kind-unverified",
      evidence: { unmappedRowCount: unmapped.length },
    };
  }
  const mappedRows = rows.map((row) => {
    const id = text(row?.id ?? row?.movementId);
    return {
      ...row,
      kind: movementKind(row?.kind ?? row?.movementType ?? row?.movementKind ?? lookup(id)),
    };
  });
  return resolveInventoryMovementSource({ source, rows: mappedRows });
}

/** Kaynak sözleşmesi doğrulanmadan resmi WAC akışını açmaz. */
export function resolveInventoryMovementSource({ source = {}, rows = [] } = {}) {
  const evidence = source?.evidence && typeof source.evidence === "object" ? { ...source.evidence } : {};
  if (source?.status !== "verified" || Number(source?.contractVersion) !== 1) {
    return {
      status: source?.status === "invalid" ? "invalid" : "missing",
      movements: [], reviewReason: "source-contract-missing", evidence,
    };
  }
  try {
    return { status: "verified", movements: normalizeInventoryMovements(rows), reviewReason: null, evidence };
  } catch (error) {
    return {
      status: "invalid", movements: [], reviewReason: "source-contract-invalid",
      evidence: { ...evidence, error: error.message },
    };
  }
}
