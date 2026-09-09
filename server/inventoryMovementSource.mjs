const MOVEMENT_KINDS = new Set(["opening", "purchase", "purchaseReturn", "sale", "saleReturn"]);
const CPM_LINEAGE_DOCUMENT_TYPES = new Set([13, 14, 15, 64]);
const CPM_TERMINAL_SALE_TYPES = new Set([17, 85, 91]);

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

function finiteNumberOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function movementKind(value) {
  const normalized = text(value);
  if (MOVEMENT_KINDS.has(normalized)) return normalized;
  const aliases = { in: "purchase", out: "sale", return: "saleReturn" };
  return aliases[normalized] || null;
}

const CPM_DOCUMENT_TYPE_KINDS = Object.freeze({
  13: "lineage",
  14: "lineage",
  15: "lineage",
  64: "lineage",
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
  let lineageRowCount = 0;
  for (const row of rows) {
    const documentType = Number(row?.documentType ?? row?.EVRAKTIP);
    const kind = CPM_DOCUMENT_TYPE_KINDS[documentType];
    if (!kind) {
      if (Number.isFinite(documentType)) unmappedDocumentTypes.add(documentType);
      continue;
    }
    mappedRowCount += 1;
    if (kind === "lineage") lineageRowCount += 1;
    kindCounts[kind] = (kindCounts[kind] || 0) + 1;
  }
  const unmapped = [...unmappedDocumentTypes].sort((left, right) => left - right);
  return {
    status: "candidate",
    rowCount: rows.length,
    mappedRowCount,
    movementRowCount: mappedRowCount - lineageRowCount,
    lineageRowCount,
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

function sourceReference(row) {
  const sourceTypeText = text(row?.sourceDocumentType ?? row?.sourceDocumentTypeCode);
  const sourceType = Number(row?.sourceDocumentType ?? row?.sourceDocumentTypeCode);
  const sourceNumber = text(row?.sourceDocumentNumber ?? row?.sourceDocumentNo);
  const sourceLine = text(row?.sourceLineNumber ?? row?.sourceLineNo) === "0"
    ? ""
    : text(row?.sourceLineNumber ?? row?.sourceLineNo);
  return { sourceTypeText, sourceType, sourceNumber, sourceLine };
}

function uniqueSourceRows(rows = []) {
  const byId = new Map();
  for (const row of rows) {
    const id = text(row?.id);
    if (!id || !byId.has(id)) byId.set(id || `${byId.size}`, row);
  }
  return [...byId.values()];
}

function sourceRowsForReference({ sourceType, sourceNumber, productCode, sourceLine }, rowsByDocumentKey) {
  const exactKey = `${sourceType}|${sourceNumber}|${productCode}|${sourceLine}`;
  const exact = uniqueSourceRows(rowsByDocumentKey.get(exactKey) || []);
  if (sourceLine) return { rows: exact, lineScoped: true };
  const documentMatches = [...rowsByDocumentKey.entries()]
    .filter(([key]) => key.startsWith(`${sourceType}|${sourceNumber}|${productCode}|`))
    .flatMap(([, matches]) => matches);
  return { rows: uniqueSourceRows(documentMatches), lineScoped: false };
}

function sourceSaleResolutionForReturn(row, rowsByDocumentKey, visited = new Set()) {
  const { sourceTypeText, sourceType, sourceNumber, sourceLine } = sourceReference(row);
  if (!sourceTypeText || !Number.isFinite(sourceType)) return { id: null, reason: "missing-source-document-type" };
  if (!sourceNumber) return { id: null, reason: "missing-source-document-number" };
  const referenceKey = `${sourceType}|${sourceNumber}|${text(row?.productCode)}|${sourceLine}`;
  if (visited.has(referenceKey)) return { id: null, reason: "source-lineage-cycle" };
  const nextVisited = new Set(visited).add(referenceKey);
  if (!CPM_TERMINAL_SALE_TYPES.has(sourceType) && !CPM_LINEAGE_DOCUMENT_TYPES.has(sourceType)) {
    return {
      id: null,
      reason: "unsupported-source-document-type",
    };
  }
  const productCode = text(row?.productCode);
  const { rows: matches, lineScoped } = sourceRowsForReference(
    { sourceType, sourceNumber, productCode, sourceLine },
    rowsByDocumentKey,
  );
  if (matches.length === 0) {
    return {
      id: null,
      reason: lineScoped ? "source-line-not-found" : "source-document-not-found",
    };
  }
  if (CPM_TERMINAL_SALE_TYPES.has(sourceType)) {
    const ids = [...new Set(matches.map((candidate) => text(candidate?.id)).filter(Boolean))];
    if (ids.length === 1) return { id: ids[0], reason: null };
    return { id: null, reason: lineScoped ? "ambiguous-source-line" : "ambiguous-source-document" };
  }

  const terminalIds = new Set();
  let firstReason = null;
  for (const candidate of matches) {
    const resolution = sourceSaleResolutionForReturn({
      productCode,
      sourceDocumentType: candidate.sourceDocumentType,
      sourceDocumentNumber: candidate.sourceDocumentNumber,
      sourceLineNumber: candidate.sourceLineNumber,
    }, rowsByDocumentKey, nextVisited);
    if (resolution.id) terminalIds.add(resolution.id);
    else if (!firstReason) firstReason = resolution.reason;
  }
  if (terminalIds.size === 1) return { id: [...terminalIds][0], reason: null };
  if (terminalIds.size > 1 || matches.length > 1) {
    return { id: null, reason: lineScoped ? "ambiguous-source-line" : "ambiguous-source-document" };
  }
  return { id: null, reason: firstReason || "source-lineage-not-collected" };
}

/**
 * Ham STKHAR adaylarını WAC motorunun giriş şekline çevirir.
 *
 * Bu fonksiyon kaynak sözleşmesini doğrulamaz ve resmi durumu açmaz. Net alış
 * maliyeti yalnızca pozitif miktar ve brüt-iskonto kanıtı varsa üretilir;
 * STKHAR.TUTAR/ISKONTO yerel para (TRY) alanlarıdır; FIYATDOVIZCINS
 * birim fiyatın dövizini belirtir ve TL net tutara yeniden kur uygulatmaz.
 * Ham fiyat/işlem dövizi kanıtı korunur; doğrulanmamış
 * satırlar review olarak kalır. Depo, ürün anahtarının parçası olarak yalnızca inceleme
 * sinyali taşır; WAC motoru depo transfer sözleşmesi doğrulanmadan ürünleri
 * depolar arasında birleştirmez.
 */
export function buildCpmWacMovementCandidates({ rows = [], excludeUnlinkedReturnBeforeYear = null } = {}) {
  if (!Array.isArray(rows)) throw new TypeError("CPM hareket adayları dizi olmalıdır.");
  const exclusionYear = Number.isInteger(Number(excludeUnlinkedReturnBeforeYear))
    ? Number(excludeUnlinkedReturnBeforeYear) : null;
  const rowsByDocumentKey = new Map();
  for (const row of rows) {
    const key = movementDocumentKey(row);
    if (!key) continue;
    if (!rowsByDocumentKey.has(key)) rowsByDocumentKey.set(key, []);
    rowsByDocumentKey.get(key).push({
      id: text(row?.id ?? row?.movementId),
      productCode: text(row?.productCode ?? row?.cardCode ?? row?.MALKOD),
      sourceDocumentType: row?.sourceDocumentType ?? row?.sourceDocumentTypeCode,
      sourceDocumentNumber: row?.sourceDocumentNumber ?? row?.sourceDocumentNo,
      sourceLineNumber: row?.sourceLineNumber ?? row?.sourceLineNo,
    });
  }

  const movements = [];
  let invalidCostRows = 0;
  const pendingForeignCostRows = 0;
  let invalidMovementRows = 0;
  let excludedNonMovementRows = 0;
  let unlinkedReturnRows = 0;
  const productsByDepot = new Map();
  const reviewReasons = {};
  const unlinkedReturnReasons = {};
  const invalidCostReasons = {};
  const unlinkedReturnYearCounts = {};
  const invalidCostYearCounts = {};
  const excludedUnlinkedReturnYearCounts = {};
  const excludedUnlinkedReturnReasons = {};
  const lineageRowCount = rows.filter((row) => CPM_LINEAGE_DOCUMENT_TYPES.has(Number(row?.documentType ?? row?.EVRAKTIP))).length;
  const addReview = (reason) => { reviewReasons[reason] = (reviewReasons[reason] || 0) + 1; };
  const addYearCount = (target, value) => {
    const year = String(value || "").slice(0, 4);
    if (/^\d{4}$/.test(year)) target[year] = (target[year] || 0) + 1;
    else target.unknown = (target.unknown || 0) + 1;
  };
  const addUnlinkedReturnReview = (reason) => {
    unlinkedReturnReasons[reason] = (unlinkedReturnReasons[reason] || 0) + 1;
  };
  const addInvalidCostReview = (reason) => { invalidCostReasons[reason] = (invalidCostReasons[reason] || 0) + 1; };

  for (const row of rows) {
    const id = text(row?.id ?? row?.movementId);
    const productCode = text(row?.productCode ?? row?.cardCode ?? row?.MALKOD);
    const documentType = Number(row?.documentType ?? row?.EVRAKTIP);
    const kind = CPM_DOCUMENT_TYPE_KINDS[documentType];
    const movementDate = date(row?.movementDate ?? row?.documentDate ?? row?.date);
    const quantity = finiteNumberOrNull(row?.quantity);
    if (CPM_LINEAGE_DOCUMENT_TYPES.has(documentType)) continue;
    if (productCode && text(row?.depotCode)) {
      if (!productsByDepot.has(productCode)) productsByDepot.set(productCode, new Set());
      productsByDepot.get(productCode).add(text(row.depotCode));
    }
    // CPM'de bazı STKHAR satırları belge içinde sıfır miktarlı açıklama/boş
    // satırı olarak tutuluyor. Bunlar ekonomik stok hareketi değildir; eksik
    // veya negatif miktarlı satırlar ise gerçek veri hatası olarak kalır.
    if (id && productCode && kind && movementDate && Number.isFinite(quantity) && quantity === 0) {
      excludedNonMovementRows += 1;
      continue;
    }
    if (!id || !productCode || !kind || !movementDate || !Number.isFinite(quantity) || quantity < 0) {
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
      ...(currency(row?.cardCurrency) ? { productCurrency: currency(row.cardCurrency) } : {}),
      ...(text(row?.depotCode) ? { depotCode: text(row.depotCode) } : {}),
      ...(text(row?.depotCode) ? { stockKey: `${productCode}\u001f${text(row.depotCode)}` } : {}),
      sourceEvidence: {
        documentType,
        documentNumber: text(row?.documentNumber),
        lineNumber: row?.lineNumber ?? null,
        directionCode: row?.directionCode ?? null,
      },
    };

    if (kind === "purchase") {
      const gross = finiteNumberOrNull(row?.grossAmount);
      const discount = finiteNumberOrNull(row?.discountAmount);
      const net = gross - discount;
      if (!Number.isFinite(gross) || !Number.isFinite(discount) || !Number.isFinite(net) || net <= 0) {
        invalidCostRows += 1;
        addInvalidCostReview(
          gross === null ? "missing-gross-amount"
            : discount === null ? "missing-discount-amount"
              : net <= 0 ? "non-positive-net-amount" : "non-finite-cost-amount",
        );
        addYearCount(invalidCostYearCounts, movementDate);
        addReview("invalid-purchase-cost-evidence");
        continue;
      }
      const sourceCurrency = currency(row?.currency ?? row?.priceCurrency ?? row?.FIYATDOVIZCINS);
      const sourceRate = Number(row?.currencyRate ?? row?.priceCurrencyRate ?? row?.FIYATDOVIZKUR);
      const normalizedSourceRate = Number.isFinite(sourceRate) && sourceRate > 0 ? sourceRate : null;
      movement.costEvidence = {
        sourceAmount: net,
        sourceUnitPrice: finiteNumberOrNull(row?.unitPrice),
        sourceCurrency: "TRY",
        sourceRate: 1,
        amountBasis: "STKHAR.TUTAR-ISKONTO",
        priceCurrency: sourceCurrency,
        priceRate: normalizedSourceRate,
        transactionCurrency: currency(row?.transactionCurrency ?? row?.DOVIZCINS),
        transactionRate: Number.isFinite(Number(row?.transactionCurrencyRate ?? row?.DOVIZKUR))
          && Number(row?.transactionCurrencyRate ?? row?.DOVIZKUR) > 0
          ? Number(row.transactionCurrencyRate ?? row.DOVIZKUR) : null,
        documentDate: movementDate,
        rateEvidence: {
          source: "STKHAR.TUTAR-ISKONTO",
          status: "verified",
          method: "cpm-local-currency-amount",
        },
      };
      // Ürün dövizine dönüşüm tarihli Halkbank kuru ile sonraki katmanda yapılır.
      movement.unitCostTryExVat = net / quantity;
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
      const originalSale = sourceSaleResolutionForReturn(row, rowsByDocumentKey);
      if (!originalSale.id) {
        addYearCount(unlinkedReturnYearCounts, movementDate);
        const movementYear = Number(String(movementDate).slice(0, 4));
        if (exclusionYear !== null && Number.isInteger(movementYear) && movementYear < exclusionYear) {
          addYearCount(excludedUnlinkedReturnYearCounts, movementDate);
          const exclusionReason = "unlinked-sale-return-before-calculation-year";
          excludedUnlinkedReturnReasons[exclusionReason] = (excludedUnlinkedReturnReasons[exclusionReason] || 0) + 1;
          continue;
        }
        unlinkedReturnRows += 1;
        addReview("unlinked-sale-return");
        addUnlinkedReturnReview(originalSale.reason);
        continue;
      }
      movement.originalSaleId = originalSale.id;
    }
    movements.push(movement);
  }

  const multiDepotProductCount = [...productsByDepot.values()].filter((depots) => depots.size > 1).length;
  const reviewCounts = {
    invalidCostRows,
    excludedInvalidCostRows: invalidCostRows,
    pendingForeignCostRows,
    invalidMovementRows,
    excludedNonMovementRows,
    unlinkedReturnRows,
    excludedUnlinkedReturnRows: Object.values(excludedUnlinkedReturnYearCounts).reduce((sum, value) => sum + value, 0),
    multiDepotProductCount,
    missingDepotCount: rows.filter((row) => !text(row?.depotCode)).length,
  };
  const unresolvedMovementRows = invalidMovementRows || unlinkedReturnRows;
  const reviewReason = multiDepotProductCount > 0
    ? "depot-grain-not-resolved"
    : (unresolvedMovementRows
      ? "movement-evidence-incomplete"
      : "movement-source-not-verified");
  return {
    status: "candidate",
    movements,
    reviewReason,
    reviewCounts,
    reviewReasons,
    unlinkedReturnReasons,
    invalidCostReasons,
    unlinkedReturnYearCounts,
    invalidCostYearCounts,
    excludedUnlinkedReturnYearCounts,
    excludedUnlinkedReturnReasons,
    sourceRowCount: rows.length,
    movementRowCount: rows.length - lineageRowCount,
    lineageRowCount,
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
