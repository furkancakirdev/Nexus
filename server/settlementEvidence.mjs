import { CURRENCY_BASKETS, currencyCode as normalizeCurrencyCode } from "../shared/eurReporting.mjs";

/**
 * Fatura, cari kayıt ve tahsilat adaylarını ayrı kanıt katmanları olarak tutar.
 *
 * Bu modül CPM sorgusu çalıştırmaz ve EUR dönüşümü yapmaz. Tam belge anahtarı
 * ile doğrulanmayan banka/kasa tutarı faturaya dağıtılmaz; eksik kanıt null
 * olarak kalır.
 */

function clean(value) {
  if (value === null || value === undefined || typeof value === "boolean") return "";
  return String(value).trim();
}

function documentKey(row = {}) {
  const type = clean(row.documentType ?? row.invoiceType);
  const no = clean(row.documentNo ?? row.invoiceNo);
  const account = clean(row.accountCode ?? row.customerCode);
  if (!type || !no || !account) return null;
  return `${type}|${no}|${account}`;
}

function finiteAmount(value) {
  if (value === null || value === undefined || typeof value === "boolean") return null;
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
    value = normalized;
  } else if (typeof value !== "number") {
    return null;
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function safeRowCount(value) {
  if (value === null || value === undefined) return 1;
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : 1;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const count = Number(value.trim());
    return Number.isSafeInteger(count) ? count : 1;
  }
  return 1;
}

function currencyCode(row = {}) {
  return normalizeCurrencyCode(row.currencyCode ?? row.currency ?? row.currencyType ?? row.dovizCins) || "";
}

const SUPPORTED_SETTLEMENT_CURRENCIES = new Set(
  CURRENCY_BASKETS.filter((currency) => currency !== "INCELEME"),
);

function movementIdentity(row = {}) {
  return clean(
    row.movementId
      ?? row.movementKey
      ?? row.canonicalMovementKey
      ?? row.sourceMovementId
      ?? row.transactionId
      ?? row.sourceRowId
      ?? row.rowId,
  ) || null;
}

function isReversal(row = {}) {
  if (row.isReversal === true || row.reversal === true || row.reverse === true) return true;
  const direction = clean(row.direction ?? row.directionCode ?? row.entryDirection).toLowerCase();
  return ["reverse", "reversal", "reversed", "ters", "iade"].includes(direction);
}

function sameAmount(left, right) {
  return left !== null && right !== null && Math.abs(left - right) <= 1e-9;
}

function canonicalGroupAmount(amounts) {
  if (amounts.length === 0 || amounts.some((value) => value === null)) return null;
  const sorted = [...amounts].sort((left, right) => left - right);
  const range = sorted.at(-1) - sorted[0];
  if (range > 1e-9) return null;
  return (sorted[0] + sorted.at(-1)) / 2;
}

function deterministicSum(values) {
  const sorted = values
    .filter((value) => value !== null)
    .sort((left, right) => left - right);
  let sum = 0;
  let compensation = 0;
  for (const value of sorted) {
    const adjusted = value - compensation;
    const next = sum + adjusted;
    compensation = (next - sum) - adjusted;
    sum = next;
  }
  return sum;
}

function amountsByCurrency(rows) {
  const totals = new Map();
  rows.forEach((row) => {
    const amount = finiteAmount(row.amount);
    if (amount === null || amount <= 0) return;
    const currency = currencyCode(row);
    const amounts = totals.get(currency) ?? [];
    amounts.push(amount);
    totals.set(currency, amounts);
  });
  return Object.fromEntries(
    [...totals.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, amounts]) => [currency, deterministicSum(amounts)]),
  );
}

function currencyMatches(invoice, candidate) {
  if (invoice.invoiceCurrencyConflict === true) return false;
  const invoiceCurrency = currencyCode(invoice);
  const candidateCurrency = currencyCode(candidate);
  return Boolean(
    invoiceCurrency
      && candidateCurrency
      && SUPPORTED_SETTLEMENT_CURRENCIES.has(invoiceCurrency)
      && SUPPORTED_SETTLEMENT_CURRENCIES.has(candidateCurrency)
      && invoiceCurrency === candidateCurrency,
  );
}

function deduplicateCandidates(candidates, blockedMovementIds = new Set()) {
  const groups = new Map();
  const unverifiedGroups = [];
  candidates.forEach((candidate) => {
    const identity = movementIdentity(candidate);
    if (!identity) {
      unverifiedGroups.push([candidate]);
      return;
    }
    const group = groups.get(identity) ?? [];
    group.push(candidate);
    groups.set(identity, group);
  });

  return [...groups.values(), ...unverifiedGroups].map((group) => {
    const amounts = group.map((row) => finiteAmount(row.amount));
    const amount = canonicalGroupAmount(amounts);
    const currencies = group.map((row) => currencyCode(row));
    const currencyConsistent = currencies.every((value) => value === currencies[0]);
    const reversals = group.map((row) => isReversal(row));
    const reversalConsistent = reversals.every((value) => value === reversals[0]);
    const referenceStates = group.map((row) => row.referenceExact === true);
    const referenceConsistent = referenceStates.every((value) => value === referenceStates[0]);
    const directionStates = group.map((row) => row.directionVerified === true);
    const directionConsistent = directionStates.every((value) => value === directionStates[0]);
    const amountEvidenceConsistent = amount !== null && group.every((row) => row.amountVerified === true);
    const movementReferenceConflict = blockedMovementIds.has(movementIdentity(group[0]));
    const groupHasConflict = !currencyConsistent
      || !reversalConsistent
      || !referenceConsistent
      || !directionConsistent
      || !amountEvidenceConsistent
      || movementReferenceConflict;
    return {
      ...group[0],
      currencyCode: currencyConsistent && !groupHasConflict ? currencies[0] : "",
      amount: groupHasConflict ? null : amount,
      evidenceConflict: groupHasConflict,
      isReversal: reversals.some(Boolean),
      movementIdentityVerified: movementIdentity(group[0]) !== null,
      referenceExact: !groupHasConflict && referenceStates.every(Boolean),
      directionVerified: !groupHasConflict && directionStates.every(Boolean),
      amountVerified: !groupHasConflict && amountEvidenceConsistent && amount !== null,
      duplicateReferenceCount: group.length,
    };
  });
}

function globallyBlockedMovementIds(candidates) {
  const groups = new Map();
  candidates.forEach((candidate) => {
    const identity = movementIdentity(candidate);
    if (!identity) return;
    const group = groups.get(identity) ?? [];
    group.push(candidate);
    groups.set(identity, group);
  });

  return new Set([...groups.entries()]
    .filter(([, group]) => {
      const references = new Set(group.map(exactReferenceKey));
      const currencies = group.map(currencyCode);
      const amounts = group.map((row) => finiteAmount(row.amount));
      const directions = group.map((row) => row.directionVerified === true);
      const reversals = group.map(isReversal);
      const referenceAmbiguous = references.has(null) || references.size > 1;
      const currencyAmbiguous = currencies.some((value) => value === "")
        || currencies.some((value) => value !== currencies[0]);
      const amountAmbiguous = canonicalGroupAmount(amounts) === null
        || group.some((row) => row.amountVerified !== true);
      const directionAmbiguous = directions.some((value) => value !== directions[0]);
      const reversalAmbiguous = reversals.some((value) => value);
      return referenceAmbiguous
        || currencyAmbiguous
        || amountAmbiguous
        || directionAmbiguous
        || reversalAmbiguous;
    })
    .map(([identity]) => identity));
}

function exactReferenceKey(row = {}) {
  const explicit = clean(row.invoiceKey ?? row.documentKey);
  if (explicit) return explicit;
  return documentKey({
    documentType: row.sourceDocumentType ?? row.sourceType ?? row.counterDocumentType ?? row.counterType,
    documentNo: row.sourceDocumentNo ?? row.sourceNo ?? row.counterDocumentNo ?? row.counterNo,
    accountCode: row.sourceAccountCode ?? row.sourceCustomerCode ?? row.counterAccountCode ?? row.counterCustomerCode,
  });
}

function invoiceAmount(invoice) {
  return finiteAmount(
    invoice.settlementAmount
      ?? invoice.invoiceTotalAmount
      ?? invoice.totalAmount
      ?? invoice.grossAmount
      ?? invoice.netAmount,
  );
}

function buildInvoiceEvidence(invoice, postings, candidates, blockedMovementIds) {
  const key = documentKey(invoice);
  const postingRows = postings.filter((row) => clean(row.invoiceKey ?? row.documentKey) === key);
  const exactCandidates = deduplicateCandidates(
    candidates.filter((row) => exactReferenceKey(row) === key),
    blockedMovementIds,
  );
  const confirmed = exactCandidates.filter((row) => (
    row.movementIdentityVerified === true
    &&
    row.referenceExact === true
    && row.directionVerified === true
    && row.amountVerified === true
    && finiteAmount(row.amount) > 0
    && !isReversal(row)
    && currencyMatches(invoice, row)
  ));
  const candidateAmounts = exactCandidates
    .map((row) => finiteAmount(row.amount))
    .filter((amount) => amount !== null && amount > 0);
  const candidateSettlementByCurrency = amountsByCurrency(exactCandidates);
  const candidateCurrencies = Object.keys(candidateSettlementByCurrency);
  const candidateAmount = deterministicSum(candidateAmounts);
  const confirmedAmount = deterministicSum(confirmed.map((row) => finiteAmount(row.amount)));
  const hasExactReversal = exactCandidates.some((row) => isReversal(row));
  const hasEvidenceConflict = exactCandidates.some((row) => row.evidenceConflict === true);
  const invoiceTotal = invoice.invoiceAmountConflict === true ? null : invoiceAmount(invoice);
  const fullySettled = confirmed.length > 0
    && !hasExactReversal
    && !hasEvidenceConflict
    && candidateCurrencies.length === 1
    && invoiceTotal !== null
    && invoiceTotal > 0
    && sameAmount(confirmedAmount, invoiceTotal);

  return {
    invoiceKey: key,
    invoicePostedToCurrentAccount: postingRows.length > 0,
    currentAccountPostingCount: postingRows.reduce((sum, row) => sum + safeRowCount(row.rowCount), 0),
    settlementStatus: fullySettled
      ? "confirmed"
      : exactCandidates.length > 0
        ? "candidate"
        : "unverified",
    exactSettlementReferenceCount: exactCandidates.length,
    verifiedSettlementReferenceCount: confirmed.length,
    candidateSettlementAmount: exactCandidates.length > 0
      ? (candidateAmounts.length > 0 && candidateCurrencies.length <= 1 && !hasEvidenceConflict ? candidateAmount : null)
      : null,
    candidateSettlementByCurrency,
    candidateEvidenceConflict: hasEvidenceConflict,
    confirmedSettlementAmount: fullySettled ? confirmedAmount : null,
  };
}

export function buildSettlementEvidence({ invoices = [], currentAccountPostings = [], settlementCandidates = [], unlinkedCandidates = [] } = {}) {
  const invoiceGroups = new Map();
  invoices.forEach((invoice) => {
    const invoiceKey = documentKey(invoice);
    if (!invoiceKey) return;
    const group = invoiceGroups.get(invoiceKey) ?? [];
    group.push({ ...invoice, invoiceKey });
    invoiceGroups.set(invoiceKey, group);
  });
  const normalizedInvoices = [...invoiceGroups.values()].map((group) => {
    const amounts = group.map(invoiceAmount);
    const currencies = group.map(currencyCode);
    return {
      ...group[0],
      invoiceAmountConflict: !amounts.every((value) => value === amounts[0]),
      invoiceCurrencyConflict: !currencies.every((value) => value === currencies[0]),
    };
  });
  const blockedMovementIds = globallyBlockedMovementIds(settlementCandidates);
  const rows = normalizedInvoices.map((invoice) => buildInvoiceEvidence(
    invoice,
    currentAccountPostings,
    settlementCandidates,
    blockedMovementIds,
  ));
  const confirmedRows = rows.filter((row) => row.settlementStatus === "confirmed");
  const candidateRows = rows.filter((row) => row.settlementStatus === "candidate");
  const confirmedSettlementByCurrency = Object.fromEntries(
    [...confirmedRows.reduce((totals, row) => {
      const invoice = normalizedInvoices.find((candidate) => documentKey(candidate) === row.invoiceKey);
      const currency = currencyCode(invoice);
      totals.set(currency, (totals.get(currency) ?? 0) + row.confirmedSettlementAmount);
      return totals;
    }, new Map())].sort(([left], [right]) => left.localeCompare(right)),
  );
  const confirmedCurrencies = Object.keys(confirmedSettlementByCurrency);

  return {
    status: "read-only-evidence",
    financialStatus: "blocked",
    rows,
    summary: {
      invoiceCount: rows.length,
      invoicePostedCount: rows.filter((row) => row.invoicePostedToCurrentAccount).length,
      confirmedInvoiceCount: confirmedRows.length,
      candidateInvoiceCount: candidateRows.length,
      unverifiedInvoiceCount: rows.length - confirmedRows.length - candidateRows.length,
      confirmedSettlementAmount: confirmedCurrencies.length === 1
        ? confirmedSettlementByCurrency[confirmedCurrencies[0]]
        : null,
      confirmedSettlementByCurrency,
      unlinkedCandidateCount: Array.isArray(unlinkedCandidates) ? unlinkedCandidates.length : 0,
    },
  };
}
