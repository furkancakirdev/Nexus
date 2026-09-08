/**
 * Envanter açılış kanıtı için bounded, salt-okunur aday sorguları.
 * Bu sorgular resmi WAC veya readiness kararına bağlanmaz.
 */
export const cpmMovementCandidateSql = `
SET NOCOUNT ON;
SELECT
  h.ID id,
  h.MALKOD productCode,
  h.DEPOKOD depotCode,
  h.EVRAKTARIH movementDate,
  h.EVRAKTIP documentType,
  h.EVRAKNO documentNumber,
  h.SIRANO lineNumber,
  h.SONKAYNAKEVRAKTIP sourceDocumentType,
  h.SONKAYNAKEVRAKNO sourceDocumentNumber,
  h.SONKAYNAKHESAPKOD sourceCustomerCode,
  h.SONKAYNAKSIRANO sourceLineNumber,
  h.GIRISCIKIS directionCode,
  CAST(h.MIKTAR AS decimal(28, 6)) quantity,
  CAST(ISNULL(h.TUTAR, 0) AS decimal(28, 4)) grossAmount,
  CAST(ISNULL(h.ISKONTO, 0) AS decimal(28, 4)) discountAmount,
  NULLIF(CAST(h.BIRIMFIYAT AS decimal(28, 6)), 0) unitPrice,
  NULLIF(LTRIM(RTRIM(h.FIYATDOVIZCINS)), '') currency,
  NULLIF(CAST(h.FIYATDOVIZKUR AS decimal(28, 8)), 0) currencyRate,
  NULLIF(LTRIM(RTRIM(h.DOVIZCINS)), '') transactionCurrency,
  NULLIF(CAST(h.DOVIZKUR AS decimal(28, 8)), 0) transactionCurrencyRate
FROM STKHAR h
WHERE h.SIRKETNO = @company
  AND h.KAYITDURUM = 1
  AND h.EVRAKTARIH >= @movementStartDate
  AND h.EVRAKTARIH < @endDate
  AND h.EVRAKTIP IN (
    @openingDocumentType,
    @purchaseDocumentType,
    @purchase609DocumentType,
    @sale17DocumentType,
    @sale85DocumentType,
    @sale91DocumentType,
    @returnDocumentType
  )
ORDER BY h.EVRAKTARIH, h.MALKOD, h.DEPOKOD, h.EVRAKNO, h.SIRANO, h.ID;
`;

/** DVZHAR kur kaynağı için banka/tip/tarih kapsamlı salt-okunur aday sorgusu. */
export const dvzharRateCandidateSql = `
SET NOCOUNT ON;
SELECT
  h.ID rateSourceId,
  h.BANKA bankCode,
  b.BANKAAD bankName,
  h.DOVIZTIP rateType,
  h.DOVIZTARIH rateDate,
  NULLIF(LTRIM(RTRIM(h.DOVIZCINS)), '') rateCurrency,
  CAST(h.DOVIZKUR AS decimal(28, 8)) rateValue
FROM DVZHAR h
LEFT JOIN BNKKRT b ON b.ID = h.BANKA
WHERE h.BANKA = @bankCode
  AND h.DOVIZTIP IN (@rateType0, @rateType1)
  AND h.DOVIZTARIH >= @startDate
  AND h.DOVIZTARIH < @endDate
  AND h.DOVIZKUR > 0
ORDER BY h.DOVIZTARIH, h.DOVIZCINS, h.ID;
`;

/** FYTKRT aktif kartını ve MIRFYTKRT eski durumlarını tarihsel fiyat adaylarına açar. */
export const stkkrtPriceCandidateSql = `
SET NOCOUNT ON;
SELECT
  LTRIM(RTRIM(f.STOKKOD)) productCode,
  NULLIF(LTRIM(RTRIM(s.MKOD2)), '') cardCurrency,
  f.SABLONNO priceListNo,
  CAST(CASE
    WHEN f.DEGISTIRENTARIH > '1900-01-01' THEN f.DEGISTIRENTARIH
    WHEN f.GIRENTARIH > '1900-01-01' THEN f.GIRENTARIH
    WHEN f.BASTARIH > '1900-01-01' THEN f.BASTARIH
  END AS date) effectiveDate,
  CAST(NULL AS date) validUntil,
  CAST(f.FIYAT AS decimal(28, 8)) priceExVat,
  NULLIF(LTRIM(RTRIM(f.DOVIZCINS)), '') priceCurrency,
  CAST(1 AS bit) priceVatExempt,
  'FYTKRT' sourceTable,
  f.ID sourceRecordId
FROM FYTKRT f
LEFT JOIN STKKRT s
  ON s.SIRKETNO = @company
 AND LTRIM(RTRIM(s.MALKOD)) = LTRIM(RTRIM(f.STOKKOD))
WHERE f.KDVDH = 0
  AND f.FIYAT > 0
  AND NULLIF(LTRIM(RTRIM(f.STOKKOD)), '') IS NOT NULL
  AND NULLIF(LTRIM(RTRIM(f.DOVIZCINS)), '') IS NOT NULL
  AND CAST(CASE
    WHEN f.DEGISTIRENTARIH > '1900-01-01' THEN f.DEGISTIRENTARIH
    WHEN f.GIRENTARIH > '1900-01-01' THEN f.GIRENTARIH
    WHEN f.BASTARIH > '1900-01-01' THEN f.BASTARIH
  END AS date) < @endDate
UNION ALL
SELECT
  LTRIM(RTRIM(m.STOKKOD)) productCode,
  NULLIF(LTRIM(RTRIM(s.MKOD2)), '') cardCurrency,
  m.SABLONNO priceListNo,
  CAST(CASE
    WHEN m.DEGISTIRENTARIH > '1900-01-01' THEN m.DEGISTIRENTARIH
    WHEN m.GIRENTARIH > '1900-01-01' THEN m.GIRENTARIH
    WHEN m.BASTARIH > '1900-01-01' THEN m.BASTARIH
  END AS date) effectiveDate,
  CAST(CASE WHEN m.CHANGEDATE > '1900-01-01' THEN m.CHANGEDATE END AS date) validUntil,
  CAST(m.FIYAT AS decimal(28, 8)) priceExVat,
  NULLIF(LTRIM(RTRIM(m.DOVIZCINS)), '') priceCurrency,
  CAST(1 AS bit) priceVatExempt,
  'MIRFYTKRT' sourceTable,
  m.RECID sourceRecordId
FROM MIRFYTKRT m
LEFT JOIN STKKRT s
  ON s.SIRKETNO = @company
 AND LTRIM(RTRIM(s.MALKOD)) = LTRIM(RTRIM(m.STOKKOD))
WHERE m.UPDATESTATUS = 0
  AND m.KDVDH = 0
  AND m.FIYAT > 0
  AND NULLIF(LTRIM(RTRIM(m.STOKKOD)), '') IS NOT NULL
  AND NULLIF(LTRIM(RTRIM(m.DOVIZCINS)), '') IS NOT NULL
  AND CAST(CASE
    WHEN m.DEGISTIRENTARIH > '1900-01-01' THEN m.DEGISTIRENTARIH
    WHEN m.GIRENTARIH > '1900-01-01' THEN m.GIRENTARIH
    WHEN m.BASTARIH > '1900-01-01' THEN m.BASTARIH
  END AS date) < @endDate
  AND (m.CHANGEDATE IS NULL OR m.CHANGEDATE <= '1900-01-01' OR m.CHANGEDATE > @startDate)
ORDER BY productCode, effectiveDate, priceListNo, sourceTable, sourceRecordId;
`;

export const stkhArType82SampleSql = `
SET NOCOUNT ON;
SELECT TOP (@sampleLimit)
  h.ID id,
  h.MALKOD productCode,
  h.DEPOKOD depotCode,
  h.EVRAKTARIH movementDate,
  h.EVRAKTIP documentType,
  h.EVRAKNO documentNumber,
  h.SIRANO lineNumber,
  h.GIRISCIKIS directionCode,
  CAST(h.MIKTAR AS decimal(28, 6)) quantity,
  CAST(ISNULL(h.TUTAR, 0) AS decimal(28, 4)) grossAmount,
  CAST(ISNULL(h.ISKONTO, 0) AS decimal(28, 4)) discountAmount,
  CAST(ISNULL(h.TUTAR, 0) - ISNULL(h.ISKONTO, 0) AS decimal(28, 4)) netAmount
  ,NULLIF(CAST(h.BIRIMFIYAT AS decimal(28, 6)), 0) unitCost
  ,NULLIF(LTRIM(RTRIM(h.FIYATDOVIZCINS)), '') priceCurrency
  ,NULLIF(CAST(h.FIYATDOVIZKUR AS decimal(28, 8)), 0) priceCurrencyRate
  ,NULLIF(LTRIM(RTRIM(h.DOVIZCINS)), '') transactionCurrency
  ,NULLIF(CAST(h.DOVIZKUR AS decimal(28, 8)), 0) transactionCurrencyRate
  ,NULLIF(LTRIM(RTRIM(h.MALIYETKOD)), '') costSourceCode
  ,NULLIF(h.MALIYETSIRANO, 0) costSourceLine
  ,h.SONKAYNAKEVRAKTIP sourceDocumentType
  ,NULLIF(LTRIM(RTRIM(h.SONKAYNAKEVRAKNO)), '') sourceDocumentNumber
  ,NULLIF(h.SONKAYNAKSIRANO, 0) sourceLineNumber
FROM STKHAR h
WHERE h.SIRKETNO = @company
  AND h.KAYITDURUM = 1
  AND h.EVRAKTIP = @documentType
  AND h.EVRAKTARIH >= @startDate
  AND h.EVRAKTARIH < @endDate
ORDER BY h.EVRAKTARIH, h.MALKOD, h.DEPOKOD, h.EVRAKNO, h.SIRANO, h.ID;
`;

export const stkhArType81SampleSql = stkhArType82SampleSql.replaceAll("@documentType", "@documentType81");

export const stkhArType82SummarySql = `
SET NOCOUNT ON;
SELECT
  COUNT_BIG(*) AS [rowCount],
  COUNT(DISTINCT NULLIF(LTRIM(RTRIM(h.MALKOD)), '')) distinctProductCount,
  COUNT(DISTINCT NULLIF(LTRIM(RTRIM(h.DEPOKOD)), '')) distinctDepotCount,
  SUM(CASE WHEN h.GIRISCIKIS = 0 THEN 1 ELSE 0 END) direction0Count,
  SUM(CASE WHEN h.GIRISCIKIS = 1 THEN 1 ELSE 0 END) direction1Count,
  SUM(CASE WHEN h.GIRISCIKIS NOT IN (0, 1) OR h.GIRISCIKIS IS NULL THEN 1 ELSE 0 END) otherDirectionCount,
  SUM(CASE WHEN ISNULL(h.TUTAR, 0) - ISNULL(h.ISKONTO, 0) > 0 THEN 1 ELSE 0 END) positiveNetAmountCount,
  SUM(CASE WHEN ISNULL(h.TUTAR, 0) - ISNULL(h.ISKONTO, 0) = 0 THEN 1 ELSE 0 END) zeroNetAmountCount,
  SUM(CASE WHEN ISNULL(h.TUTAR, 0) - ISNULL(h.ISKONTO, 0) < 0 THEN 1 ELSE 0 END) negativeNetAmountCount,
  SUM(CASE WHEN h.MALKOD IS NULL OR LTRIM(RTRIM(h.MALKOD)) = '' THEN 1 ELSE 0 END) nullProductCount,
  SUM(CASE WHEN h.DEPOKOD IS NULL OR LTRIM(RTRIM(h.DEPOKOD)) = '' THEN 1 ELSE 0 END) nullDepotCount,
  SUM(CASE WHEN h.EVRAKNO IS NULL OR LTRIM(RTRIM(h.EVRAKNO)) = '' THEN 1 ELSE 0 END) nullDocumentCount,
  SUM(CASE WHEN h.MIKTAR IS NULL OR h.MIKTAR = 0 THEN 1 ELSE 0 END) zeroOrNullQuantityCount,
  SUM(CASE WHEN h.BIRIMFIYAT > 0 THEN 1 ELSE 0 END) positiveUnitCostCount,
  SUM(CASE WHEN h.BIRIMFIYAT IS NULL OR h.BIRIMFIYAT <= 0 THEN 1 ELSE 0 END) zeroOrMissingUnitCostCount,
  SUM(CASE WHEN NULLIF(LTRIM(RTRIM(h.FIYATDOVIZCINS)), '') IS NOT NULL THEN 1 ELSE 0 END) priceCurrencyPresentCount,
  SUM(CASE WHEN NULLIF(LTRIM(RTRIM(h.DOVIZCINS)), '') IS NOT NULL THEN 1 ELSE 0 END) transactionCurrencyPresentCount,
  SUM(CASE WHEN NULLIF(LTRIM(RTRIM(h.MALIYETKOD)), '') IS NOT NULL OR h.MALIYETSIRANO > 0 THEN 1 ELSE 0 END) costLineagePresentCount
FROM STKHAR h
WHERE h.SIRKETNO = @company
  AND h.KAYITDURUM = 1
  AND h.EVRAKTIP = @documentType
  AND h.EVRAKTARIH >= @startDate
  AND h.EVRAKTARIH < @endDate;
`;

export const stkhArType81SummarySql = stkhArType82SummarySql.replaceAll("@documentType", "@documentType81");

export const stksymDevirSampleSql = `
SET NOCOUNT ON;
SELECT TOP (@sampleLimit)
  s.ID id,
  s.MALKOD productCode,
  s.DEPOKOD depotCode,
  s.EVRAKTARIH sourceDate,
  s.EVRAKNO documentNumber,
  s.SIRANO lineNumber,
  s.EVRAKTIP documentType,
  CAST(s.MIKTAR AS decimal(28, 6)) quantity,
  s.MKOD4 sourceKind
FROM STKSYM s
WHERE s.SIRKETNO = @company
  AND s.MKOD4 = @sourceKind
  AND s.EVRAKTARIH >= @startDate
  AND s.EVRAKTARIH < @endDate
ORDER BY s.EVRAKTARIH, s.MALKOD, s.DEPOKOD, s.EVRAKNO, s.SIRANO, s.ID;
`;

export const stksymDevirSummarySql = `
SET NOCOUNT ON;
SELECT
  COUNT_BIG(*) AS [rowCount],
  COUNT(DISTINCT NULLIF(LTRIM(RTRIM(s.MALKOD)), '')) AS distinctProductCount,
  COUNT(DISTINCT NULLIF(LTRIM(RTRIM(s.DEPOKOD)), '')) AS distinctDepotCount,
  SUM(CASE WHEN s.MIKTAR > 0 THEN 1 ELSE 0 END) AS positiveQuantityCount,
  SUM(CASE WHEN s.MIKTAR = 0 THEN 1 ELSE 0 END) AS zeroQuantityCount,
  SUM(CASE WHEN s.MIKTAR < 0 THEN 1 ELSE 0 END) AS negativeQuantityCount,
  SUM(CASE WHEN s.MALKOD IS NULL OR LTRIM(RTRIM(s.MALKOD)) = '' THEN 1 ELSE 0 END) AS nullProductCount,
  SUM(CASE WHEN s.DEPOKOD IS NULL OR LTRIM(RTRIM(s.DEPOKOD)) = '' THEN 1 ELSE 0 END) AS nullDepotCount
FROM STKSYM s
WHERE s.SIRKETNO = @company
  AND s.MKOD4 = @sourceKind
  AND s.EVRAKTARIH >= @startDate
  AND s.EVRAKTARIH < @endDate;
`;

/**
 * STKSYM DEVIR ile STKHAR tip-82 arasındaki doğal anahtar yakınlığını yalnız
 * tanı özeti olarak ölçer. Bu sorgu resmi açılış/WAC kararı üretmez.
 */
export const stksymStkhArMatchSummarySql = `
SET NOCOUNT ON;
WITH sym AS (
  SELECT
    s.MALKOD productCode,
    s.DEPOKOD depotCode,
    CONVERT(date, s.EVRAKTARIH) sourceDate,
    CAST(s.MIKTAR AS decimal(28, 6)) quantity
  FROM STKSYM s
  WHERE s.SIRKETNO = @company
    AND s.MKOD4 = @sourceKind
    AND s.EVRAKTARIH >= @startDate
    AND s.EVRAKTARIH < @endDate
), har AS (
  SELECT
    h.MALKOD productCode,
    h.DEPOKOD depotCode,
    CONVERT(date, h.EVRAKTARIH) movementDate,
    CAST(h.MIKTAR AS decimal(28, 6)) quantity,
    h.GIRISCIKIS directionCode
  FROM STKHAR h
  WHERE h.SIRKETNO = @company
    AND h.KAYITDURUM = 1
    AND h.EVRAKTIP = @documentType
    AND h.EVRAKTARIH >= @startDate
    AND h.EVRAKTARIH < @endDate
)
SELECT
  COUNT_BIG(*) symRowCount,
  COALESCE(SUM(CASE WHEN matches.sameBaseCount > 0 THEN 1 ELSE 0 END), 0) sameProductDepotDateRowCount,
  COALESCE(SUM(CASE WHEN matches.sameQuantityCount > 0 THEN 1 ELSE 0 END), 0) sameProductDepotDateQuantityRowCount,
  COALESCE(SUM(CASE WHEN matches.sameQuantityCount = 1 THEN 1 ELSE 0 END), 0) uniqueQuantityMatchRowCount,
  COALESCE(SUM(CASE WHEN matches.directionCount > 1 THEN 1 ELSE 0 END), 0) multiDirectionMatchRowCount,
  COALESCE(SUM(CASE WHEN matches.sameBaseCount = 0 THEN 1 ELSE 0 END), 0) unmatchedRowCount
FROM sym s
OUTER APPLY (
  SELECT
    (SELECT COUNT_BIG(*)
     FROM har h
     WHERE h.productCode = s.productCode
       AND h.depotCode = s.depotCode
       AND h.movementDate = s.sourceDate) sameBaseCount,
    (SELECT COUNT_BIG(*)
     FROM har h
     WHERE h.productCode = s.productCode
       AND h.depotCode = s.depotCode
       AND h.movementDate = s.sourceDate
       AND h.quantity = s.quantity) sameQuantityCount,
    (SELECT COUNT(DISTINCT h.directionCode)
     FROM har h
     WHERE h.productCode = s.productCode
       AND h.depotCode = s.depotCode
       AND h.movementDate = s.sourceDate) directionCount
) matches;
`;

/**
 * STKSYM DEVIR ile STKHAR tip-82 arasındaki belge kimliği yakınlığını yalnız
 * tanı özeti olarak ölçer. Bu sorgu resmi açılış/WAC kararı üretmez.
 */
export const stksymStkhArDocumentMatchSummarySql = `
SET NOCOUNT ON;
WITH sym AS (
  SELECT
    s.MALKOD productCode,
    s.DEPOKOD depotCode,
    CONVERT(date, s.EVRAKTARIH) sourceDate,
    s.EVRAKTIP documentType,
    NULLIF(LTRIM(RTRIM(s.EVRAKNO)), '') documentNumber,
    NULLIF(s.SIRANO, 0) lineNumber,
    CAST(s.MIKTAR AS decimal(28, 6)) quantity
  FROM STKSYM s
  WHERE s.SIRKETNO = @company
    AND s.MKOD4 = @sourceKind
    AND s.EVRAKTARIH >= @startDate
    AND s.EVRAKTARIH < @endDate
), har AS (
  SELECT
    h.MALKOD productCode,
    h.DEPOKOD depotCode,
    CONVERT(date, h.EVRAKTARIH) movementDate,
    h.EVRAKTIP documentType,
    NULLIF(LTRIM(RTRIM(h.EVRAKNO)), '') documentNumber,
    NULLIF(h.SIRANO, 0) lineNumber,
    CAST(h.MIKTAR AS decimal(28, 6)) quantity,
    h.GIRISCIKIS directionCode
  FROM STKHAR h
  WHERE h.SIRKETNO = @company
    AND h.KAYITDURUM = 1
    AND h.EVRAKTIP = @documentType
    AND h.EVRAKTARIH >= @startDate
    AND h.EVRAKTARIH < @endDate
)
SELECT
  COUNT_BIG(*) symRowCount,
  COALESCE(SUM(CASE WHEN s.documentNumber IS NULL OR s.lineNumber IS NULL THEN 1 ELSE 0 END), 0) missingDocumentKeyRowCount,
  COALESCE(SUM(CASE WHEN matches.sameDocumentCount > 0 THEN 1 ELSE 0 END), 0) sameDocumentNumberRowCount,
  COALESCE(SUM(CASE WHEN matches.sameDocumentLineCount > 0 THEN 1 ELSE 0 END), 0) sameDocumentLineRowCount,
  COALESCE(SUM(CASE WHEN matches.sameDocumentLineCount = 1 THEN 1 ELSE 0 END), 0) uniqueDocumentLineMatchRowCount,
  COALESCE(SUM(CASE WHEN matches.sameDocumentLineQuantityCount > 0 THEN 1 ELSE 0 END), 0) sameDocumentLineQuantityRowCount,
  COALESCE(SUM(CASE WHEN matches.documentLineDirectionCount > 1 THEN 1 ELSE 0 END), 0) documentLineDirectionConflictRowCount,
  COALESCE(SUM(CASE WHEN s.documentNumber IS NOT NULL AND s.lineNumber IS NOT NULL AND matches.sameDocumentLineCount = 0 THEN 1 ELSE 0 END), 0) documentLineUnmatchedRowCount
FROM sym s
OUTER APPLY (
  SELECT
    (SELECT COUNT_BIG(*)
     FROM har h
     WHERE h.productCode = s.productCode
       AND h.depotCode = s.depotCode
       AND h.movementDate = s.sourceDate
       AND h.documentType = s.documentType
       AND s.documentNumber IS NOT NULL
       AND h.documentNumber = s.documentNumber) sameDocumentCount,
    (SELECT COUNT_BIG(*)
     FROM har h
     WHERE h.productCode = s.productCode
       AND h.depotCode = s.depotCode
       AND h.movementDate = s.sourceDate
       AND h.documentType = s.documentType
       AND s.documentNumber IS NOT NULL
       AND s.lineNumber IS NOT NULL
       AND h.documentNumber = s.documentNumber
       AND h.lineNumber = s.lineNumber) sameDocumentLineCount,
    (SELECT COUNT_BIG(*)
     FROM har h
     WHERE h.productCode = s.productCode
       AND h.depotCode = s.depotCode
       AND h.movementDate = s.sourceDate
       AND h.documentType = s.documentType
       AND s.documentNumber IS NOT NULL
       AND s.lineNumber IS NOT NULL
       AND h.documentNumber = s.documentNumber
       AND h.lineNumber = s.lineNumber
       AND h.quantity = s.quantity) sameDocumentLineQuantityCount,
    (SELECT COUNT(DISTINCT h.directionCode)
     FROM har h
     WHERE h.productCode = s.productCode
       AND h.depotCode = s.depotCode
       AND h.movementDate = s.sourceDate
       AND h.documentType = s.documentType
       AND s.documentNumber IS NOT NULL
       AND s.lineNumber IS NOT NULL
       AND h.documentNumber = s.documentNumber
       AND h.lineNumber = s.lineNumber) documentLineDirectionCount
) matches;
`;
