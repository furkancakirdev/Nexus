export function evaluateReleaseReadiness({
  connected = false,
  readOnly = false,
  acceptedRisks = [],
  sourceProvenance = null,
  inventorySource = null,
  buildId = "",
  buildVersion = "",
  buildCommit = "",
  imageDigest = "",
} = {}) {
  const blockers = [];
  const configuredAcceptedRisks = Array.isArray(acceptedRisks) ? acceptedRisks : [];
  const accepted = [];
  if (!connected) blockers.push("cpm-not-connected");
  if (!readOnly) {
    if (configuredAcceptedRisks.includes("cpm-extra-permissions")) accepted.push("cpm-extra-permissions");
    else blockers.push("read-only-boundary-failed");
  }
  const provenanceStatus = sourceProvenance?.evidence?.status ?? sourceProvenance?.status;
  if (sourceProvenance
    && (provenanceStatus !== "verified" || sourceProvenance.coverage?.status !== "complete")) {
    blockers.push("source-provenance-unverified");
  }
  if (inventorySource?.status !== "verified") blockers.push("inventory-source-not-verified");
  if (inventorySource?.reviewReason) blockers.push("inventory-source-review-required");
  if (inventorySource && inventorySource.financialStatus !== "ready") {
    blockers.push("official-cost-coverage-insufficient");
  }
  if (inventorySource?.evidence?.openingEvidenceStatus === "ambiguous") {
    blockers.push("inventory-opening-evidence-ambiguous");
  }
  if (!String(buildId || "").trim()) blockers.push("build-id-missing");
  if (!String(buildVersion || "").trim() || ["local", "dev-local"].includes(String(buildVersion))) blockers.push("build-version-unverified");
  if (!String(buildCommit || "").trim() || String(buildCommit) === "unknown") blockers.push("build-commit-unverified");
  if (!String(imageDigest || "").trim() || String(imageDigest) === "unknown") blockers.push("image-digest-unverified");
  return { ready: blockers.length === 0, blockers, acceptedRisks: accepted };
}
