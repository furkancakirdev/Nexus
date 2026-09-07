/**
 * Bağımsız CPM satır kanıtı için aday terminal hareketleri.
 *
 * Bu sorgu canonical ledger'ın perakende soy ağacı dışlamalarını üretmez;
 * yalnızca karşılaştırma girdisi sağlar. Sonuç mismatch/unavailable olmadan
 * resmi WAC veya release readiness'a bağlanamaz.
 */
export const sourceProvenanceSql = `
SET NOCOUNT ON;
SELECT
  h.ID sourceRowId,
  h.EVRAKTIP documentType,
  h.EVRAKTARIH documentDate,
  h.MALKOD productCode,
  CAST(h.MIKTAR AS decimal(28, 4)) quantity,
  CAST(ISNULL(h.TUTAR, 0) - ISNULL(h.ISKONTO, 0) AS decimal(28, 4)) netAmount,
  CAST(CASE WHEN h.EVRAKTIP = 18 THEN 0 ELSE 1 END AS bit) isSale
FROM STKHAR h
WHERE h.SIRKETNO = @company
  AND h.KAYITDURUM = 1
  AND YEAR(h.EVRAKTARIH) = @year
  AND h.EVRAKTIP IN (17, 18, 85, 91)
  AND h.MIKTAR > 0
ORDER BY h.ID;
`;

/**
 * Canonical ledger'ın ürettiği kimlikleri CPM'den bağımsız olarak tekrar okur.
 * @canonicalIdsJson yalnız veri parametresidir; sorgu metni sabit kalır.
 */
export const sourceProvenanceByCanonicalIdsSql = `
SET NOCOUNT ON;
WITH canonicalIds AS (
  SELECT TRY_CONVERT(bigint, [value]) sourceRowId
  FROM OPENJSON(@canonicalIdsJson)
  WHERE TRY_CONVERT(bigint, [value]) IS NOT NULL
)
SELECT
  h.ID sourceRowId,
  h.EVRAKTIP documentType,
  h.EVRAKTARIH documentDate,
  h.MALKOD productCode,
  CAST(h.MIKTAR AS decimal(28, 4)) quantity,
  CAST(ISNULL(h.TUTAR, 0) - ISNULL(h.ISKONTO, 0) AS decimal(28, 4)) netAmount,
  CAST(CASE WHEN h.EVRAKTIP = 18 THEN 0 ELSE 1 END AS bit) isSale
FROM STKHAR h
JOIN canonicalIds ids ON ids.sourceRowId = h.ID
WHERE h.SIRKETNO = @company
  AND h.KAYITDURUM = 1
ORDER BY h.ID;
`;
