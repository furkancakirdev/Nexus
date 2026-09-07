import { withReadOnlyCpmTransaction } from "./cpmTransaction.mjs";
import { buildSourceCoverageEvidence, buildSourceProvenanceEvidence } from "./sourceProvenance.mjs";

function rowsFromResult(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.recordset)) return result.recordset;
  if (Array.isArray(result?.rows)) return result.rows;
  return null;
}

/**
 * Canonical ve bağımsız kaynak loader'larını aynı CPM read transaction'ında
 * çalıştırır. Loader sonucu rowset değilse kanıtı unavailable bırakır.
 */
export async function collectCpmSourceProvenance({
  transactionFactory,
  executeRead,
  loadCanonical,
  canonicalRows: suppliedCanonicalRows,
  loadSource,
  loadCoverage,
  isolationLevel = "read committed",
  versions,
  source,
} = {}) {
  if ((!Array.isArray(suppliedCanonicalRows) && typeof loadCanonical !== "function")
    || typeof loadSource !== "function") {
    throw new TypeError("canonicalRows veya loadCanonical ile loadSource gerekli.");
  }

  return withReadOnlyCpmTransaction({
    transactionFactory,
    executeRead,
    isolationLevel,
    run: async ({ request, execute }) => {
      // mssql Request nesnesi aynı anda iki query çalıştırmak için güvenli bir
      // kuyruk değildir; ayrıca sıralı okuma snapshot kanıtını daha açık kılar.
      const canonicalResult = Array.isArray(suppliedCanonicalRows)
        ? suppliedCanonicalRows
        : await loadCanonical({ request, execute });
      const canonicalRows = rowsFromResult(canonicalResult);
      const sourceResult = await loadSource({ request, execute, canonicalRows });
      const sourceRows = rowsFromResult(sourceResult);
      const coverageResult = typeof loadCoverage === "function"
        ? await loadCoverage({ request, execute, canonicalRows })
        : null;
      const coverageRows = rowsFromResult(coverageResult);
      return {
        evidence: buildSourceProvenanceEvidence({
          canonicalRows,
          sourceRows,
          versions,
          source: { ...source, isolationLevel },
        }),
        coverage: typeof loadCoverage === "function"
          ? buildSourceCoverageEvidence({ canonicalRows, candidateRows: coverageRows })
          : null,
      };
    },
  });
}
