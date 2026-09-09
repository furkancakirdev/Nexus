/**
 * Local evidence-discovery SQL only. These strings are deliberately static:
 * table and column names never come from metadata or caller input.
 *
 * This module does not prove that the live CPM schema or permissions match it.
 */

export const ALLOWED_SOURCE_TABLES = Object.freeze([
  "CARHAR",
  "EVRHAR",
  "BNKHAR",
  "STKSYM",
  "STKHAR",
  "EVRBAS",
]);

const makeSampleSql = (table, fields, dateField = "EVRAKTARIH") => `
SELECT TOP (@sampleLimit)
  ${fields.join(",\n  ")}
FROM ${table}
WHERE SIRKETNO = @company
  AND ${dateField} >= @startDate
  AND ${dateField} < @endDate
ORDER BY ${dateField};
`;

export const SOURCE_EVIDENCE_SQL = Object.freeze({
  CARHAR: makeSampleSql("CARHAR", ["ID sourceRecordId", "SIRKETNO company", "EVRAKTARIH eventDate", "EVRAKTIP documentType", "EVRAKNO documentNumber", "SIRANO lineNumber", "HESAPKOD accountCode", "TUTAR amount"]),
  EVRHAR: makeSampleSql("EVRHAR", ["ID sourceRecordId", "SIRKETNO company", "EVRAKTARIH eventDate", "EVRAKTIP documentType", "EVRAKNO documentNumber", "SIRANO lineNumber", "HESAPKOD accountCode", "TUTAR amount"]),
  BNKHAR: makeSampleSql("BNKHAR", ["ID sourceRecordId", "SIRKETNO company", "EVRAKTARIH eventDate", "EVRAKTIP documentType", "EVRAKNO documentNumber", "SIRANO lineNumber", "TUTAR amount", "DOVIZCINS currencyCode"]),
  STKSYM: makeSampleSql("STKSYM", ["ID sourceRecordId", "SIRKETNO company", "EVRAKTARIH eventDate", "EVRAKTIP documentType", "EVRAKNO documentNumber", "SIRANO lineNumber", "MALKOD productCode", "DEPOKOD depotCode", "MIKTAR quantity", "MKOD4 sourceKind"]),
  STKHAR: makeSampleSql("STKHAR", ["ID sourceRecordId", "SIRKETNO company", "EVRAKTARIH eventDate", "EVRAKTIP documentType", "EVRAKNO documentNumber", "SIRANO lineNumber", "MALKOD productCode", "DEPOKOD depotCode", "MIKTAR quantity", "GIRISCIKIS directionCode", "TUTAR grossAmount", "ISKONTO discountAmount", "DOVIZCINS transactionCurrency", "FIYATDOVIZCINS priceCurrency", "MALIYETKOD costSourceCode", "MALIYETSIRANO costSourceLine"]),
  EVRBAS: makeSampleSql("EVRBAS", ["ID sourceRecordId", "SIRKETNO company", "EVRAKTARIH eventDate", "EVRAKTIP documentType", "EVRAKNO documentNumber", "EVRAKSN documentSequence", "EVRAKGUID documentGuid"]),
});

export const SOURCE_EVIDENCE_FIELDS = Object.freeze({
  CARHAR: Object.freeze(["sourceRecordId", "company", "eventDate", "documentType", "documentNumber", "lineNumber", "accountCode", "amount"]),
  EVRHAR: Object.freeze(["sourceRecordId", "company", "eventDate", "documentType", "documentNumber", "lineNumber", "accountCode", "amount"]),
  BNKHAR: Object.freeze(["sourceRecordId", "company", "eventDate", "documentType", "documentNumber", "lineNumber", "amount", "currencyCode"]),
  STKSYM: Object.freeze(["sourceRecordId", "company", "eventDate", "documentType", "documentNumber", "lineNumber", "productCode", "depotCode", "quantity", "sourceKind"]),
  STKHAR: Object.freeze(["sourceRecordId", "company", "eventDate", "documentType", "documentNumber", "lineNumber", "productCode", "depotCode", "quantity", "directionCode", "grossAmount", "discountAmount", "transactionCurrency", "priceCurrency", "costSourceCode", "costSourceLine"]),
  EVRBAS: Object.freeze(["sourceRecordId", "company", "eventDate", "documentType", "documentNumber", "documentSequence", "documentGuid"]),
});

export const SOURCE_EVIDENCE_QUERY_IDS = Object.freeze(ALLOWED_SOURCE_TABLES.map((table) => `source-evidence-${table.toLowerCase()}-v1`));

export function getSourceEvidenceQuery(table) {
  if (!ALLOWED_SOURCE_TABLES.includes(table)) throw new RangeError(`Kaynak tablo allowlist dışında: ${table}`);
  return SOURCE_EVIDENCE_SQL[table];
}
