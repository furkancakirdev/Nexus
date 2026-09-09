/**
 * Dar, sayfalı ve yalnızca kanıt amaçlı CPM fatura sorgusu.
 *
 * Bu sorgu resmi ekonomik ledger'ın yerine geçmez. İade soy zinciri, ürün
 * maliyeti, kur kanıtı veya ticari sahiplik çözümlemesi üretmez; yalnızca
 * STKHAR ham satırlarını ve belge tipi toplamlarını döndürür.
 */
export const cpmInvoiceAuditSql = `
SET NOCOUNT ON;

SELECT
    h.ID rootId,
    h.EVRAKTIP documentType,
    h.EVRAKNO documentNo,
    h.EVRAKTARIH documentDate,
    h.HESAPKOD customerCode,
    h.SIRANO [lineNo],
    h.MALKOD productCode,
    h.MIKTAR quantity,
    CAST(CASE WHEN h.EVRAKTIP = 18 THEN 0 ELSE 1 END AS bit) isSale,
    h.DEPOKOD depotCode,
    h.MASRAFKOD departmentCode,
    h.SONKAYNAKEVRAKTIP sourceDocumentType,
    h.SONKAYNAKEVRAKNO sourceDocumentNo,
    h.SONKAYNAKHESAPKOD sourceCustomerCode,
    h.SONKAYNAKSIRANO sourceLineNo,
    CASE WHEN h.TUTAR IS NULL THEN 1 ELSE 0 END missingGrossAmount,
    CASE WHEN h.ISKONTO IS NULL THEN 1 ELSE 0 END missingDiscountAmount,
    CASE WHEN h.KDV IS NULL THEN 1 ELSE 0 END missingVatAmount,
    CAST(h.TUTAR AS decimal(28, 4)) grossAmount,
    CAST(h.ISKONTO AS decimal(28, 4)) discountAmount,
    CAST(CASE WHEN h.TUTAR IS NULL OR h.ISKONTO IS NULL THEN NULL
      ELSE h.TUTAR - h.ISKONTO END AS decimal(28, 4)) netAmount,
    CAST(h.KDV AS decimal(28, 4)) vatAmount,
    CAST(CASE WHEN h.TUTAR IS NULL OR h.ISKONTO IS NULL OR h.KDV IS NULL THEN NULL
      ELSE h.TUTAR - h.ISKONTO + h.KDV END AS decimal(28, 4)) invoiceTotalInclVat
INTO #filtered
FROM STKHAR h
WHERE h.SIRKETNO = @company
  AND h.KAYITDURUM = 1
  AND h.EVRAKTARIH >= @startDate
  AND h.EVRAKTARIH < @endDate
  AND h.EVRAKTIP IN (17, 18, 85, 91);
SELECT
  documentType,
  COUNT_BIG(*) lineCount,
  COUNT(DISTINCT documentNo) invoiceCount,
  CAST(SUM(grossAmount) AS decimal(28, 4)) grossAmount,
  CAST(SUM(discountAmount) AS decimal(28, 4)) discountAmount,
  CAST(SUM(netAmount) AS decimal(28, 4)) netAmount,
  CAST(SUM(vatAmount) AS decimal(28, 4)) vatAmount,
  CAST(SUM(invoiceTotalInclVat) AS decimal(28, 4)) invoiceTotalInclVat,
  SUM(missingGrossAmount) missingGrossAmountLineCount,
  SUM(missingDiscountAmount) missingDiscountLineCount,
  SUM(missingVatAmount) missingVatLineCount
FROM #filtered
GROUP BY documentType
ORDER BY documentType;

SELECT COUNT_BIG(*) totalRows
FROM #filtered;

SELECT *
INTO #page
FROM #filtered
ORDER BY documentDate, rootId
OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;

SELECT
  page.rootId,
  page.documentType,
  page.documentNo,
  page.documentDate,
  page.customerCode,
  page.[lineNo],
  page.productCode,
  page.quantity,
  page.isSale,
  page.depotCode,
  page.departmentCode,
  page.grossAmount,
  page.discountAmount,
  page.netAmount,
  page.vatAmount,
  page.invoiceTotalInclVat,
  page.sourceDocumentType,
  page.sourceDocumentNo,
  page.sourceCustomerCode,
  page.sourceLineNo,
  header.ID headerId,
  header.SATICINO commercialOwnerHeaderValue,
  CASE
    WHEN NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), header.SATICINO))), N'') IS NOT NULL
      THEN header.SATICINO
    WHEN NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), header.EVRAKHAZIRLAYAN))), N'') IS NOT NULL
      AND header.EVRAKHAZIRLAYAN NOT LIKE '%[0-9]%'
      AND header.EVRAKHAZIRLAYAN COLLATE Turkish_CI_AI NOT IN (N'BIRCAN', N'SYSTEM', N'ADMIN', N'SA')
      THEN header.EVRAKHAZIRLAYAN
    ELSE NULL
  END commercialOwnerCandidate,
  CASE
    WHEN header.ID IS NULL THEN N'header-missing'
    WHEN NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), header.SATICINO))), N'') IS NOT NULL THEN N'header-owner-candidate'
    WHEN NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100), header.EVRAKHAZIRLAYAN))), N'') IS NOT NULL
      AND header.EVRAKHAZIRLAYAN NOT LIKE '%[0-9]%'
      AND header.EVRAKHAZIRLAYAN COLLATE Turkish_CI_AI NOT IN (N'BIRCAN', N'SYSTEM', N'ADMIN', N'SA')
      THEN N'preparer-fallback-candidate'
    ELSE N'header-owner-empty'
  END commercialOwnerEvidenceStatus,
  header.EVRAKHAZIRLAYAN preparerUser,
  header.GIRENKULLANICI entryUser,
  header.GIRENTARIH entryDate,
  header.DEGISTIRENKULLANICI modifierUser,
  header.DEGISTIRENTARIH modifiedDate,
  page.missingGrossAmount,
  page.missingDiscountAmount,
  page.missingVatAmount,
  CASE WHEN header.ID IS NULL THEN 1 ELSE 0 END missingHeader
FROM #page page
OUTER APPLY (
  SELECT TOP (1)
    candidate.ID,
    candidate.SATICINO,
    candidate.EVRAKHAZIRLAYAN,
    candidate.GIRENKULLANICI,
    candidate.GIRENTARIH,
    candidate.DEGISTIRENKULLANICI,
    candidate.DEGISTIRENTARIH
  FROM EVRBAS candidate
  WHERE candidate.SIRKETNO = @company
    AND candidate.KAYITDURUM = 1
    AND candidate.EVRAKTIP = page.documentType
    AND candidate.EVRAKNO = page.documentNo
    AND candidate.HESAPKOD = page.customerCode
    AND candidate.EVRAKTARIH = page.documentDate
  ORDER BY candidate.ID DESC
) header
ORDER BY page.documentDate, page.rootId;
`;
