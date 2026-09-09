import { buildCpmWacMovementCandidates } from "./inventoryMovementSource.mjs";

const LINEAGE_TYPES = new Set([13, 14, 15, 64]);
const SALE_TYPES = new Set([17, 85, 91]);
const MOVEMENT_TYPES = new Set([9, 18, 17, 81, 85, 91, 609]);

const text = (value) => value === null || value === undefined ? "" : String(value).trim();
const number = (value) => {
  if (value === null || value === undefined || text(value) === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const movementDate = (value) => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  const normalized = text(value);
  return /^\d{4}-\d{2}-\d{2}/.test(normalized) ? normalized.slice(0, 10) : null;
};

function keyFor(row) {
  const productCode = text(row?.productCode);
  const depotCode = text(row?.depotCode);
  return productCode && depotCode ? `${productCode}\u001f${depotCode}` : null;
}

function isExactZero(row) {
  return Boolean(text(row?.id) && text(row?.productCode)
    && MOVEMENT_TYPES.has(Number(row?.documentType))
    && movementDate(row?.movementDate)
    && number(row?.quantity) === 0);
}

function isEconomic(row) {
  return !LINEAGE_TYPES.has(Number(row?.documentType)) && !isExactZero(row);
}

function isUnknownIdentityOrDate(row) {
  return !text(row?.id) || !text(row?.productCode) || !text(row?.depotCode)
    || !movementDate(row?.movementDate);
}

function unresolvedReason(row) {
  const documentType = Number(row?.documentType);
  const quantity = number(row?.quantity);
  if (!text(row?.id) || !text(row?.productCode) || !MOVEMENT_TYPES.has(documentType)
    || !movementDate(row?.movementDate) || quantity === null || quantity < 0) {
    return "invalid-movement";
  }
  if ([9, 81, 609].includes(documentType)) {
    const gross = number(row?.grossAmount);
    const discount = number(row?.discountAmount);
    if (gross === null || discount === null || gross - discount <= 0) return "invalid-cost";
  }
  if (documentType === 18) return "unlinked-return";
  return "invalid-movement";
}

function scopeComparator(left, right) {
  return `${left.productCode}\u001f${left.depotCode}`.localeCompare(`${right.productCode}\u001f${right.depotCode}`);
}

/**
 * Maps raw CPM inventory evidence gaps to affected sale rows. This is a
 * diagnostic candidate only: it does not calculate amounts or enable official
 * WAC/profit/readiness decisions.
 */
export function buildInventoryEvidenceImpact({ rows = [] } = {}) {
  if (!Array.isArray(rows)) throw new TypeError("Stok kanıt etkisi satırları dizi olmalıdır.");

  const candidate = buildCpmWacMovementCandidates({ rows });
  const candidateIds = new Set(candidate.movements.map((movement) => text(movement.id)).filter(Boolean));
  const economicRows = rows.filter(isEconomic);
  const saleRows = economicRows.filter((row) => SALE_TYPES.has(Number(row?.documentType)));
  const unresolvedRows = economicRows.filter((row) => !candidateIds.has(text(row?.id)));
  const globalUnknown = economicRows.some(isUnknownIdentityOrDate);
  const salesByStockKey = new Map();
  for (const row of saleRows) {
    const key = keyFor(row);
    if (!key) continue;
    if (!salesByStockKey.has(key)) salesByStockKey.set(key, []);
    salesByStockKey.get(key).push(row);
  }

  const scopeMap = new Map();
  const addScope = (row, reason = null) => {
    const key = keyFor(row);
    if (!key) return;
    if (!scopeMap.has(key)) {
      scopeMap.set(key, {
        productCode: text(row.productCode),
        depotCode: text(row.depotCode),
        firstUnresolvedDate: null,
        unresolvedRowCount: 0,
        reasons: new Set(),
      });
    }
    const scope = scopeMap.get(key);
    if (reason) {
      scope.unresolvedRowCount += 1;
      scope.reasons.add(reason);
      const date = movementDate(row.movementDate);
      if (date && (!scope.firstUnresolvedDate || date < scope.firstUnresolvedDate)) scope.firstUnresolvedDate = date;
    }
  };

  for (const row of unresolvedRows) {
    const reason = unresolvedReason(row);
    addScope(row, reason);
  }
  if (globalUnknown) {
    for (const row of saleRows) addScope(row);
  }

  const scopes = [...scopeMap.values()].sort(scopeComparator).map((scope) => {
    const scopeSales = salesByStockKey.get(`${scope.productCode}\u001f${scope.depotCode}`) || [];
    const affected = globalUnknown ? scopeSales.length : (scope.firstUnresolvedDate !== null
      ? scopeSales.filter((row) => movementDate(row.movementDate) >= scope.firstUnresolvedDate).length
      : 0);
    const earlier = globalUnknown ? 0 : scopeSales.length - affected;
    return {
      productCode: scope.productCode,
      depotCode: scope.depotCode,
      firstUnresolvedDate: globalUnknown ? null : scope.firstUnresolvedDate,
      unresolvedRowCount: scope.unresolvedRowCount,
      affectedSaleRowCount: affected,
      unaffectedEarlierSaleRowCount: earlier,
      reasons: [...scope.reasons].concat(globalUnknown ? ["unknown-identity-or-date"] : [])
        .filter((reason, index, all) => all.indexOf(reason) === index).sort(),
    };
  });

  const affectedSaleRows = globalUnknown
    ? saleRows.length
    : scopes.reduce((sum, scope) => sum + scope.affectedSaleRowCount, 0);
  const affectedStockKeys = scopes
    .filter((scope) => scope.affectedSaleRowCount > 0)
    .map((scope) => `${scope.productCode}\u001f${scope.depotCode}`);

  return {
    status: "candidate",
    official: false,
    rawSaleRows: saleRows.length,
    affectedSaleRows,
    noKnownBlockerSaleRows: saleRows.length - affectedSaleRows,
    affectedStockKeys: affectedStockKeys.length,
    affectedStockKeyList: affectedStockKeys,
    unresolvedSourceRows: unresolvedRows.length,
    scopes,
  };
}
