function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function imageDigest(value) {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/i.test(value);
}

function artifactDigest(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

export function validateReleaseManifest(manifest = {}) {
  const errors = [];
  const release = manifest && typeof manifest === "object" ? manifest : {};
  if (!nonEmpty(release.releaseId)) errors.push("release-id-missing");
  if (!/^[0-9a-f]{40}$/i.test(String(release.sourceCommit || ""))) errors.push("source-commit-invalid");
  if (!nonEmpty(release.buildId) || !nonEmpty(release.buildVersion)) errors.push("build-identity-missing");
  if (!imageDigest(release.imageDigest)) errors.push("image-digest-invalid");
  if (!imageDigest(release.composeConfigHash)) errors.push("compose-config-hash-invalid");
  if (!artifactDigest(release.artifactSha256)) errors.push("artifact-digest-invalid");

  if (!nonEmpty(release.cpm?.database) || !nonEmpty(release.cpm?.company)) {
    errors.push("cpm-target-missing");
  }
  if (!/^SHA256:[A-Za-z0-9+/=]+$/.test(String(release.ssh?.hostKey || ""))) {
    errors.push("ssh-host-key-missing");
  }
  const caFile = String(release.tls?.caFile || "");
  if (!nonEmpty(caFile) || /(?:^|[\\/\s])(?:insecure|--insecure|-k)(?:$|[\\/\s])/i.test(caFile)) {
    errors.push("tls-ca-missing");
  }
  if (!nonEmpty(release.previous?.releaseId) || !imageDigest(release.previous?.imageDigest)) {
    errors.push("rollback-manifest-missing");
  }
  if (!artifactDigest(release.previous?.artifactSha256)) {
    errors.push("rollback-artifact-digest-missing");
  }
  return { valid: errors.length === 0, errors };
}
