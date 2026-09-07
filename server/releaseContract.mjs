import { evaluateReleaseReadiness } from "./releaseReadiness.mjs";

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function acceptedRisks(value) {
  const allowed = new Set(["cpm-extra-permissions"]);
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => allowed.has(item));
}

export function buildRuntimeInfo({ env = process.env, connected = false } = {}) {
  const effectiveReadOnly = env.CPM_EFFECTIVE_READ_ONLY === "true";
  return {
    buildId: text(env.BUILD_ID),
    buildVersion: text(env.NEXUS_BUILD_VERSION),
    buildCommit: text(env.NEXUS_BUILD_COMMIT || env.GIT_COMMIT),
    imageDigest: text(env.NEXUS_IMAGE_DIGEST || env.IMAGE_DIGEST),
    artifactSha256: text(env.NEXUS_ARTIFACT_SHA256),
    database: text(env.CPM_SQL_DATABASE),
    company: text(env.CPM_SQL_COMPANY) || "01",
    acceptedRisks: acceptedRisks(env.NEXUS_ACCEPTED_RISKS),
    connected: Boolean(connected),
    readOnly: effectiveReadOnly,
    readOnlyEvidence: effectiveReadOnly ? "verified-by-runtime" : "unverified",
  };
}

export function buildReadinessPayload({ runtime = {}, inventorySource = null, sourceProvenance = null } = {}) {
  const result = evaluateReleaseReadiness({
    ...runtime,
    inventorySource,
    sourceProvenance,
    acceptedRisks: runtime.acceptedRisks,
  });
  return {
    ...result,
    runtime: {
      connected: Boolean(runtime.connected),
      readOnly: runtime.readOnly === true,
      readOnlyEvidence: runtime.readOnlyEvidence || "unverified",
      buildId: runtime.buildId || null,
      buildVersion: runtime.buildVersion || null,
      buildCommit: runtime.buildCommit || null,
      imageDigest: runtime.imageDigest || null,
      artifactSha256: runtime.artifactSha256 || null,
      acceptedRisks: Array.isArray(runtime.acceptedRisks) ? runtime.acceptedRisks : [],
      database: runtime.database || null,
      company: runtime.company || "01",
    },
    inventorySource: inventorySource || { status: "missing" },
    sourceProvenance,
  };
}
