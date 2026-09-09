import { ALLOWED_SOURCE_TABLES, SOURCE_EVIDENCE_SQL } from "./sourceEvidenceDiscoverySql.mjs";
import { buildDiscoveryContract, validateSampleLimit } from "./sourceEvidenceDiscoveryContract.mjs";

export async function runSourceEvidenceDiscovery({ adapter, company, startDate, endDate, sampleLimit = 20, now = () => new Date().toISOString() } = {}) {
  validateSampleLimit(sampleLimit);
  if (!adapter || typeof adapter.beginTransaction !== "function" || typeof adapter.execute !== "function" || typeof adapter.rollback !== "function" || typeof adapter.close !== "function") throw new TypeError("Injected adapter beginTransaction, execute, rollback ve close sağlamalıdır.");
  if (typeof company !== "string" || company.length === 0) throw new TypeError("company boş olmayan metin olmalıdır.");
  if (typeof startDate !== "string" || typeof endDate !== "string") throw new TypeError("startDate ve endDate metin olmalıdır.");

  const startedAt = now();
  let transaction;
  let operationError = null;
  const results = {};
  try {
    transaction = await adapter.beginTransaction();
    for (const table of ALLOWED_SOURCE_TABLES) {
      const response = await adapter.execute(SOURCE_EVIDENCE_SQL[table], { company, startDate, endDate, sampleLimit }, transaction);
      results[table] = Array.isArray(response?.rows) ? response.rows : Array.isArray(response) ? response : [];
    }
  } catch (error) {
    operationError = error;
  }

  let rollbackError = null;
  try { if (transaction !== undefined) await adapter.rollback(transaction); } catch (error) { rollbackError = error; }
  let closeError = null;
  try { await adapter.close(); } catch (error) { closeError = error; }

  if (operationError || rollbackError || closeError) return {
    contractVersion: "source-evidence-discovery-v1",
    status: "blocked",
    metadataCandidates: [], sourceIdentityCandidates: [], coverage: {},
    freshness: { startedAt, finishedAt: now(), evidenceMode: "injected-local-read", liveEvidence: false },
    reviewRequiredReasons: ["cleanup-or-read-failure", ...(rollbackError ? ["rollback-failed"] : []), ...(closeError ? ["close-failed"] : [])],
    error: { operation: operationError?.message ?? null, rollback: rollbackError?.message ?? null, close: closeError?.message ?? null },
  };
  return buildDiscoveryContract({ results, startedAt, finishedAt: now() });
}
