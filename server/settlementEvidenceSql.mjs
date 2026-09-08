/**
 * Tahsilat kanıtı için salt-okunur CPM sorgu sözleşmesi.
 *
 * Recordset sırası sabittir:
 * 0: aktif satış faturaları (fatura anahtarı ve kaynak tutar)
 * 1: faturanın cari hesaba işlendiğini gösteren CARENT/CARHAR kayıtları
 * 2: tam belge anahtarı taşıyan banka/cari/belge hareketi adayları
 * 3: faturaya bağlanmamış banka ve günlük nakit özet adayları
 *
 * Bu sorgu tahsilatı kesinleştirmez. Yön ve tutar anlamı ayrıca doğrulanmadan
 * recordset 2 satırları yalnız aday olarak tüketilmelidir.
 */
export const settlementEvidenceSql = `
SET NOCOUNT ON;

CREATE TABLE #invoices (
  documentType smallint NOT NULL,
  documentNo nvarchar(100) NOT NULL,
  accountCode nvarchar(100) NOT NULL,
  documentKey nvarchar(320) NOT NULL,
  documentDate date NULL,
  netAmount decimal(28, 4) NULL,
  invoiceTotalAmount decimal(28, 4) NULL,
  PRIMARY KEY (documentType, documentNo, accountCode)
);

INSERT INTO #invoices (
  documentType, documentNo, accountCode, documentKey, documentDate,
  netAmount, invoiceTotalAmount
)
SELECT
  h.EVRAKTIP,
  CAST(h.EVRAKNO AS nvarchar(100)),
  CAST(h.HESAPKOD AS nvarchar(100)),
  CONCAT(h.EVRAKTIP, '|', h.EVRAKNO, '|', h.HESAPKOD),
  CAST(MIN(h.EVRAKTARIH) AS date),
  CAST(SUM(ISNULL(h.TUTAR, 0) - ISNULL(h.ISKONTO, 0)) AS decimal(28, 4)),
  CAST(SUM(ISNULL(h.TUTAR, 0) - ISNULL(h.ISKONTO, 0) + ISNULL(h.KDV, 0)) AS decimal(28, 4))
FROM STKHAR h
WHERE h.SIRKETNO = @company
  AND h.KAYITDURUM = 1
  AND h.EVRAKTARIH >= @startDate
  AND h.EVRAKTARIH < @endDate
  AND h.EVRAKTIP IN (@saleType17, @saleType85, @saleType91)
  AND NULLIF(LTRIM(RTRIM(CAST(h.EVRAKNO AS nvarchar(100)))), '') IS NOT NULL
  AND NULLIF(LTRIM(RTRIM(CAST(h.HESAPKOD AS nvarchar(100)))), '') IS NOT NULL
GROUP BY h.EVRAKTIP, h.EVRAKNO, h.HESAPKOD;

SELECT
  documentType, documentNo, accountCode, documentKey, documentDate,
  netAmount, invoiceTotalAmount
FROM #invoices
ORDER BY documentDate, documentType, documentNo, accountCode;

SELECT
  i.documentKey invoiceKey,
  CAST('CARENT' AS varchar(16)) sourceTable,
  COUNT_BIG(*) [rowCount]
FROM #invoices i
JOIN CARENT entry
  ON entry.SIRKETNO = @company
  AND entry.KAYNAKEVRAKTIP = i.documentType
  AND CAST(entry.KAYNAKEVRAKNO AS nvarchar(100)) = i.documentNo
  AND CAST(entry.KAYNAKHESAPKOD AS nvarchar(100)) = i.accountCode
GROUP BY i.documentKey
UNION ALL
SELECT
  i.documentKey invoiceKey,
  CAST('CARHAR' AS varchar(16)) sourceTable,
  COUNT_BIG(*) [rowCount]
FROM #invoices i
JOIN CARHAR movement
  ON movement.SIRKETNO = @company
  AND movement.EVRAKTIP = i.documentType
  AND CAST(movement.EVRAKNO AS nvarchar(100)) = i.documentNo
  AND CAST(movement.HESAPKOD AS nvarchar(100)) = i.accountCode
GROUP BY i.documentKey;

SELECT
  i.documentKey invoiceKey,
  CAST('CARHAR' AS varchar(16)) sourceTable,
  CAST('counter' AS varchar(16)) referenceSide,
  CAST(movement.EVRAKTARIH AS date) eventDate,
  CAST(movement.TUTAR AS decimal(28, 4)) amount,
  CAST(1 AS bit) referenceExact,
  CAST(0 AS bit) directionVerified,
  CAST(0 AS bit) amountVerified
FROM #invoices i
JOIN CARHAR movement
  ON movement.SIRKETNO = @company
  AND movement.KARSIEVRAKTIP = i.documentType
  AND CAST(movement.KARSIEVRAKNO AS nvarchar(100)) = i.documentNo
  AND CAST(movement.KARSIHESAPKOD AS nvarchar(100)) = i.accountCode
WHERE movement.EVRAKTARIH >= @startDate
  AND movement.EVRAKTARIH < @endDate
UNION ALL
SELECT
  i.documentKey invoiceKey,
  CAST('CARHAR' AS varchar(16)) sourceTable,
  CAST('source' AS varchar(16)) referenceSide,
  CAST(movement.EVRAKTARIH AS date) eventDate,
  CAST(movement.TUTAR AS decimal(28, 4)) amount,
  CAST(1 AS bit) referenceExact,
  CAST(0 AS bit) directionVerified,
  CAST(0 AS bit) amountVerified
FROM #invoices i
JOIN CARHAR movement
  ON movement.SIRKETNO = @company
  AND movement.SONKAYNAKEVRAKTIP = i.documentType
  AND CAST(movement.SONKAYNAKEVRAKNO AS nvarchar(100)) = i.documentNo
  AND CAST(movement.SONKAYNAKHESAPKOD AS nvarchar(100)) = i.accountCode
WHERE movement.EVRAKTARIH >= @startDate
  AND movement.EVRAKTARIH < @endDate
UNION ALL
SELECT
  i.documentKey invoiceKey,
  CAST('EVRHAR' AS varchar(16)) sourceTable,
  CAST('counter' AS varchar(16)) referenceSide,
  CAST(movement.EVRAKTARIH AS date) eventDate,
  CAST(movement.TUTAR AS decimal(28, 4)) amount,
  CAST(1 AS bit) referenceExact,
  CAST(0 AS bit) directionVerified,
  CAST(0 AS bit) amountVerified
FROM #invoices i
JOIN EVRHAR movement
  ON movement.SIRKETNO = @company
  AND movement.KARSIEVRAKTIP = i.documentType
  AND CAST(movement.KARSIEVRAKNO AS nvarchar(100)) = i.documentNo
  AND CAST(movement.KARSIHESAPKOD AS nvarchar(100)) = i.accountCode
WHERE movement.EVRAKTARIH >= @startDate
  AND movement.EVRAKTARIH < @endDate
UNION ALL
SELECT
  i.documentKey invoiceKey,
  CAST('EVRHAR' AS varchar(16)) sourceTable,
  CAST('source' AS varchar(16)) referenceSide,
  CAST(movement.EVRAKTARIH AS date) eventDate,
  CAST(movement.TUTAR AS decimal(28, 4)) amount,
  CAST(1 AS bit) referenceExact,
  CAST(0 AS bit) directionVerified,
  CAST(0 AS bit) amountVerified
FROM #invoices i
JOIN EVRHAR movement
  ON movement.SIRKETNO = @company
  AND movement.EVRAKTIP = i.documentType
  AND CAST(movement.EVRAKNO AS nvarchar(100)) = i.documentNo
  AND CAST(movement.HESAPKOD AS nvarchar(100)) = i.accountCode
WHERE movement.EVRAKTARIH >= @startDate
  AND movement.EVRAKTARIH < @endDate;

SELECT
  CAST('BNKHAR' AS varchar(32)) sourceTable,
  CAST(EVRAKTARIH AS date) eventDate,
  BORCALACAK directionCode,
  NULLIF(LTRIM(RTRIM(DOVIZCINS)), '') currencyCode,
  COUNT_BIG(*) candidateCount,
  CAST(SUM(ISNULL(TUTAR, 0)) AS decimal(28, 4)) candidateAmount,
  SUM(CASE WHEN NULLIF(LTRIM(RTRIM(KARSIREFERANS)), '') IS NOT NULL THEN 1 ELSE 0 END) referenceHintCount
FROM BNKHAR
WHERE SIRKETNO = @company
  AND EVRAKTARIH >= @startDate
  AND EVRAKTARIH < @endDate
GROUP BY CAST(EVRAKTARIH AS date), BORCALACAK, NULLIF(LTRIM(RTRIM(DOVIZCINS)), '')
UNION ALL
SELECT
  CAST('PROFIL_GUNLUNNAKITTAHSILAT' AS varchar(32)) sourceTable,
  CAST(TARIH AS date) eventDate,
  NULL directionCode,
  CAST(NULL AS varchar(16)) currencyCode,
  COUNT_BIG(*) candidateCount,
  CAST(SUM(ISNULL(NAKIT, 0)) AS decimal(28, 4)) candidateAmount,
  CAST(0 AS int) referenceHintCount
FROM PROFIL_GUNLUNNAKITTAHSILAT
WHERE TARIH >= @startDate
  AND TARIH < @endDate
GROUP BY CAST(TARIH AS date);

DROP TABLE #invoices;
`;
