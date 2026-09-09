"""Marlin Nexus için yerel, allowlist tabanlı immutable artifact üretimi."""

import hashlib
import os
import re
import tarfile
from pathlib import Path, PurePosixPath


ALLOWED_DIRECTORIES = ("dist", "public", "server", "shared", "src")
ALLOWED_FILES = (
    "Dockerfile",
    "compose.yaml",
    "index.html",
    "package-lock.json",
    "package.json",
    "vite.config.mjs",
)
FORBIDDEN_ROOTS = {".git", ".cache", "data", "node_modules", "secrets", "tmp"}
SOURCE_COMMIT = re.compile(r"^[a-f0-9]{40}$", re.IGNORECASE)
SHA256_HEX = re.compile(r"^[a-f0-9]{64}$", re.IGNORECASE)
IMAGE_DIGEST = re.compile(r"^sha256:[a-f0-9]{64}$", re.IGNORECASE)
SSH_HOST_KEY = re.compile(r"^SHA256:[A-Za-z0-9+/=]+$")


def build_release_manifest(
    *,
    release_id,
    source_commit,
    build_id,
    build_version,
    image_digest,
    compose_config_hash,
    artifact_sha256,
    cpm_database,
    cpm_company,
    ssh_host_key,
    tls_ca_file,
    previous_release_id,
    previous_image_digest,
    previous_artifact_sha256,
):
    """Build the immutable evidence contract without writing or deploying anything."""
    return {
        "releaseId": release_id,
        "sourceCommit": source_commit,
        "buildId": build_id,
        "buildVersion": build_version,
        "imageDigest": image_digest,
        "composeConfigHash": compose_config_hash,
        "artifactSha256": artifact_sha256,
        "cpm": {"database": cpm_database, "company": cpm_company},
        "ssh": {"hostKey": ssh_host_key},
        "tls": {"caFile": tls_ca_file},
        "previous": {
            "releaseId": previous_release_id,
            "imageDigest": previous_image_digest,
            "artifactSha256": previous_artifact_sha256,
        },
    }


def validate_release_manifest(manifest):
    """Return explicit blockers for an immutable release/rollback manifest."""
    errors = []
    if not isinstance(manifest, dict):
        return ["manifest-invalid"]
    for key in ("releaseId", "buildId", "buildVersion"):
        if not isinstance(manifest.get(key), str) or not manifest[key].strip():
            errors.append(f"{key[0].lower() + key[1:]}-missing")
    if not isinstance(manifest.get("sourceCommit"), str) or not SOURCE_COMMIT.fullmatch(manifest["sourceCommit"]):
        errors.append("source-commit-invalid")
    if not isinstance(manifest.get("imageDigest"), str) or not IMAGE_DIGEST.fullmatch(manifest["imageDigest"]):
        errors.append("image-digest-invalid")
    if not isinstance(manifest.get("composeConfigHash"), str) or not IMAGE_DIGEST.fullmatch(manifest["composeConfigHash"]):
        errors.append("compose-config-hash-invalid")
    if not isinstance(manifest.get("artifactSha256"), str) or not SHA256_HEX.fullmatch(manifest["artifactSha256"]):
        errors.append("artifact-digest-invalid")

    cpm = manifest.get("cpm")
    if not isinstance(cpm, dict) or not isinstance(cpm.get("database"), str) or not cpm["database"].strip() or not isinstance(cpm.get("company"), str) or not cpm["company"].strip():
        errors.append("cpm-evidence-missing")
    ssh = manifest.get("ssh")
    if not isinstance(ssh, dict) or not isinstance(ssh.get("hostKey"), str) or not SSH_HOST_KEY.fullmatch(ssh["hostKey"]):
        errors.append("ssh-host-key-invalid")
    tls = manifest.get("tls")
    ca_file = tls.get("caFile", "") if isinstance(tls, dict) else ""
    if not isinstance(ca_file, str) or not ca_file.strip() or re.search(r"(?:^|[\\/\s])(?:insecure|--insecure|-k)(?:$|[\\/\s])", ca_file, re.IGNORECASE):
        errors.append("tls-ca-invalid")

    previous = manifest.get("previous")
    if not isinstance(previous, dict) or not isinstance(previous.get("releaseId"), str) or not previous["releaseId"].strip() or not isinstance(previous.get("imageDigest"), str) or not IMAGE_DIGEST.fullmatch(previous["imageDigest"]):
        errors.append("rollback-manifest-missing")
    if not isinstance(previous, dict) or not isinstance(previous.get("artifactSha256"), str) or not SHA256_HEX.fullmatch(previous["artifactSha256"]):
        errors.append("rollback-artifact-digest-missing")
    return sorted(set(errors))


def validate_target_capacity(available_bytes, required_bytes, reserve_bytes):
    """Ensure the target can hold the candidate and retained rollback artifact."""
    values = (available_bytes, required_bytes, reserve_bytes)
    if any(not isinstance(value, int) or isinstance(value, bool) or value < 0 for value in values):
        return ["target-capacity-invalid"]
    if available_bytes < required_bytes + reserve_bytes:
        return ["target-disk-insufficient"]
    return []


def validate_archive_members(members):
    errors = []
    for member in members:
        normalized = str(member).replace("\\", "/")
        path = PurePosixPath(normalized)
        if path.is_absolute() or ".." in path.parts:
            errors.append("archive-member-path-traversal")
        if path.parts and path.parts[0] in FORBIDDEN_ROOTS:
            errors.append("archive-member-forbidden-root")
    return sorted(set(errors))


def _release_members(source_root):
    members = []
    for relative in ALLOWED_FILES:
        path = source_root / relative
        if path.is_file():
            members.append((relative, path))
    for directory in ALLOWED_DIRECTORIES:
        path = source_root / directory
        if not path.is_dir():
            continue
        for child in sorted(path.rglob("*")):
            if child.is_file():
                if child.is_symlink():
                    raise ValueError("archive-member-symlink")
                members.append((child.relative_to(source_root).as_posix(), child))
            elif child.is_symlink():
                raise ValueError("archive-member-symlink")
    members.sort(key=lambda item: item[0])
    validation_errors = validate_archive_members([name for name, _ in members])
    if validation_errors:
        raise ValueError(",".join(validation_errors))
    return members


def create_release_archive(source_root, archive_path):
    source = Path(source_root).resolve()
    destination = Path(archive_path).resolve()
    if not source.is_dir():
        raise ValueError("archive-source-missing")
    try:
        destination.relative_to(source)
    except ValueError:
        pass
    else:
        raise ValueError("archive-destination-inside-source")

    members = _release_members(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(destination, "w:gz") as archive:
        for name, path in members:
            archive.add(path, arcname=name, recursive=False)
    digest = hashlib.sha256(destination.read_bytes()).hexdigest()
    return {"archive_path": os.fspath(destination), "members": [name for name, _ in members], "sha256": digest}
