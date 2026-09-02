"""Marlin Nexus için fail-closed release runner sözleşmesi.

Bu ilk dilim ağ bağlantısı veya deploy yapmaz. Yalnızca güvenli runner
yapılandırmasını doğrular; gerçek cutover sonraki ayrı ve onaylı dilimdir.
"""

import os
import re
import shlex
import sys
from decimal import Decimal, InvalidOperation

from release_artifact import validate_release_manifest, validate_target_capacity


IMMUTABLE_DIGEST = re.compile(r"^sha256:[a-f0-9]{64}$", re.IGNORECASE)
SOURCE_COMMIT = re.compile(r"^[a-f0-9]{40}$", re.IGNORECASE)
RELEASE_ID = re.compile(r"^[a-z0-9][a-z0-9-]{2,63}$")
IMAGE_REPOSITORY = re.compile(r"^[a-z0-9][a-z0-9./_-]*$")
HOST = re.compile(r"^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*$")


def _candidate_name(release_id, error_code):
    if not isinstance(release_id, str) or not RELEASE_ID.fullmatch(release_id):
        raise ValueError(error_code)
    return "marlin-nexus-candidate-" + release_id


def build_runner_config(source=None):
    values = dict(os.environ if source is None else source)
    return {
        "host": values.get("NEXUS_HOST", "").strip(),
        "user": values.get("NEXUS_USER", "").strip(),
        "ssh_key_file": values.get("NEXUS_SSH_KEY_FILE", "").strip(),
        "known_hosts_file": values.get("NEXUS_KNOWN_HOSTS_FILE", "").strip(),
        "host_key": values.get("NEXUS_SSH_HOST_KEY", "").strip(),
        "tls_ca_file": values.get("NEXUS_TLS_CA_FILE", "").strip(),
        "release_id": values.get("NEXUS_RELEASE_ID", "").strip(),
        "source_commit": values.get("NEXUS_SOURCE_COMMIT", "").strip(),
        "image_digest": values.get("NEXUS_IMAGE_DIGEST", "").strip(),
        "compose_config_hash": values.get("NEXUS_COMPOSE_CONFIG_HASH", "").strip(),
        "previous_release_id": values.get("NEXUS_PREVIOUS_RELEASE_ID", "").strip(),
        "previous_image_digest": values.get("NEXUS_PREVIOUS_IMAGE_DIGEST", "").strip(),
        "accepted_risks": values.get("NEXUS_ACCEPTED_RISKS", "").strip(),
        "password_present": bool(values.get("NEXUS_PASSWORD")),
        "auto_accept_host_key": values.get("NEXUS_AUTO_ACCEPT_HOST_KEY", "").lower() == "true",
    }


def validate_runner_config(config):
    errors = []
    if not config.get("host") or not config.get("user"):
        errors.append("target-missing")
    if not config.get("ssh_key_file"):
        errors.append("ssh-key-file-missing")
    if not config.get("known_hosts_file"):
        errors.append("known-hosts-file-missing")
    if not config.get("host_key"):
        errors.append("ssh-host-key-missing")
    if config.get("password_present"):
        errors.append("password-auth-disabled")
    if config.get("auto_accept_host_key"):
        errors.append("host-key-auto-accept-disabled")
    if not config.get("tls_ca_file") or re.search(r"(?:^|[\\/\s])(?:insecure|--insecure|-k)(?:$|[\\/\s])", config["tls_ca_file"], re.IGNORECASE):
        errors.append("tls-ca-invalid")
    if not config.get("release_id"):
        errors.append("release-id-missing")
    if not SOURCE_COMMIT.fullmatch(config.get("source_commit", "")):
        errors.append("source-commit-invalid")
    if not IMMUTABLE_DIGEST.fullmatch(config.get("image_digest", "")):
        errors.append("image-digest-invalid")
    if not IMMUTABLE_DIGEST.fullmatch(config.get("compose_config_hash", "")):
        errors.append("compose-config-hash-invalid")
    if not config.get("previous_release_id") or not IMMUTABLE_DIGEST.fullmatch(config.get("previous_image_digest", "")):
        errors.append("rollback-manifest-missing")
    return errors


def validate_release_gate(config, manifest, capacity):
    """Combine runner, immutable manifest, identity, and target capacity gates."""
    errors = list(validate_runner_config(config))
    errors.extend(validate_release_manifest(manifest))
    if isinstance(manifest, dict):
        identity_pairs = (
            ("release_id", "releaseId", "runner-release-id-mismatch"),
            ("source_commit", "sourceCommit", "runner-source-commit-mismatch"),
            ("image_digest", "imageDigest", "runner-image-digest-mismatch"),
            ("compose_config_hash", "composeConfigHash", "runner-compose-hash-mismatch"),
        )
        for config_key, manifest_key, error in identity_pairs:
            if config.get(config_key) != manifest.get(manifest_key):
                errors.append(error)
    if not isinstance(capacity, dict):
        errors.append("target-capacity-missing")
    else:
        errors.extend(validate_target_capacity(
            capacity.get("available_bytes"),
            capacity.get("required_bytes"),
            capacity.get("reserve_bytes"),
        ))
    return sorted(set(errors))


def validate_candidate_evidence(expected, observed):
    """Validate evidence collected from an isolated candidate container."""
    errors = []
    if observed.get("container_running") is not True:
        errors.append("candidate-container-not-running")
    if observed.get("build_id") != expected.get("build_id"):
        errors.append("candidate-build-id-mismatch")
    if observed.get("build_commit") != expected.get("source_commit"):
        errors.append("candidate-commit-mismatch")
    if observed.get("image_digest") != expected.get("image_digest"):
        errors.append("candidate-image-mismatch")
    if observed.get("readiness") is not True:
        allowed_blockers = set(expected.get("allowed_readiness_blockers", ()))
        observed_blockers = set(observed.get("readiness_blockers", ()))
        if not observed_blockers or not observed_blockers.issubset(allowed_blockers):
            errors.append("candidate-readiness-failed")
    if observed.get("prewarm") is not True:
        errors.append("candidate-prewarm-unverified")
    if observed.get("authenticated_smoke") is not True:
        errors.append("candidate-authenticated-smoke-failed")
    if observed.get("read_only") is not True:
        errors.append("candidate-read-only-unverified")
    if expected.get("financial_parity_required") is True:
        errors.extend(validate_candidate_financial_parity(
            observed.get("financial_parity"),
            year=expected.get("year", 2026),
        ))
    return errors


def _finite_decimal(value):
    if isinstance(value, bool) or value is None:
        return None
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None
    return result if result.is_finite() else None


def validate_candidate_financial_parity(observed, year, tolerance=Decimal("0.01")):
    """Validate authenticated candidate financial values without recalculating sales."""
    if not isinstance(observed, dict) or not isinstance(year, int):
        return ["candidate-parity-evidence-missing"]

    overview = observed.get("overview")
    department = observed.get("department")
    if not isinstance(overview, dict) or not isinstance(department, dict):
        return ["candidate-parity-evidence-missing"]

    errors = []
    sections = (overview, department)
    required_fields = ("http_status", "mode", "readOnly", "year", "currency", "ledgerVersion", "scope")
    if any(
        section.get("http_status") != 200
        or section.get("mode") != "live"
        or section.get("readOnly") is not True
        or section.get("year") != year
        or section.get("currency") != "EUR"
        or any(not section.get(field) for field in required_fields if field not in {"http_status", "mode", "readOnly", "year", "currency"})
        for section in sections
    ):
        errors.append("candidate-financial-scope-mismatch")

    if overview.get("ledgerVersion") != department.get("ledgerVersion") or overview.get("scope") != department.get("scope"):
        errors.append("candidate-financial-scope-mismatch")

    overview_net = _finite_decimal(overview.get("eurNetSales"))
    department_net = _finite_decimal(department.get("eurNetSales"))
    department_profit = _finite_decimal(department.get("eurGrossProfit"))
    department_margin = _finite_decimal(department.get("eurMargin"))
    if overview_net is None or department_net is None or department_profit is None:
        errors.append("candidate-parity-evidence-missing")
    else:
        if abs(overview_net - department_net) > tolerance:
            errors.append("candidate-overview-department-net-sales-mismatch")
        if department_net == 0:
            if department_margin is not None:
                errors.append("candidate-department-margin-invalid")
        elif department_margin is None or abs(department_margin - (department_profit / department_net * Decimal("100"))) > tolerance:
            errors.append("candidate-department-margin-invalid")

    return list(dict.fromkeys(errors))


def validate_readiness_payload(expected, payload):
    """Validate the authenticated readiness response without changing its status."""
    if not isinstance(payload, dict):
        return ["readiness-payload-invalid"]

    errors = []
    runtime = payload.get("runtime") if isinstance(payload.get("runtime"), dict) else {}
    blockers = payload.get("blockers")
    if not isinstance(blockers, list) or not all(isinstance(item, str) and item for item in blockers):
        return ["readiness-blockers-invalid"]

    build_id = runtime.get("buildId", payload.get("buildId"))
    connected = runtime.get("connected", payload.get("connected"))
    read_only = runtime.get("readOnly", payload.get("readOnly"))
    accepted_risks = runtime.get("acceptedRisks", payload.get("acceptedRisks", []))
    if not isinstance(accepted_risks, list):
        accepted_risks = []
    if build_id != expected.get("build_id"):
        errors.append("readiness-build-id-mismatch")
    if connected is not True:
        errors.append("readiness-connection-unverified")
    if read_only is not True and "cpm-extra-permissions" not in accepted_risks:
        errors.append("readiness-read-only-unverified")

    blocker_set = set(blockers)
    allowed = set(expected.get("allowed_readiness_blockers", ()))
    if payload.get("ready") is True:
        if payload.get("http_status") != 200 or blocker_set:
            errors.append("readiness-success-payload-invalid")
    elif payload.get("ready") is False:
        if payload.get("http_status") != 503 or blocker_set != allowed or not blocker_set:
            errors.append("readiness-blockers-invalid")
    else:
        errors.append("readiness-status-invalid")
    return errors


def build_candidate_compose_override(config):
    """Build a deterministic isolated candidate override; never executes Compose."""
    required = (
        "release_id", "image_repository", "image_digest", "build_id", "build_version",
        "source_commit", "artifact_sha256", "candidate_port", "state_host_path",
        "cpm_secret_host_path", "session_secret_source", "admin_identity_source",
        "cpm_server", "cpm_instance", "cpm_database", "cpm_company", "public_origin",
    )
    missing = [key for key in required if not config.get(key)]
    if missing:
        raise ValueError("candidate-compose-missing:" + ",".join(missing))
    candidate_name = _candidate_name(config["release_id"], "candidate-release-id-invalid")
    if not IMAGE_REPOSITORY.fullmatch(str(config["image_repository"])) or ":" in str(config["image_repository"]):
        raise ValueError("candidate-image-repository-invalid")
    if not IMMUTABLE_DIGEST.fullmatch(str(config["image_digest"])):
        raise ValueError("candidate-image-digest-invalid")
    if not SOURCE_COMMIT.fullmatch(str(config["source_commit"])):
        raise ValueError("candidate-source-commit-invalid")
    if not re.fullmatch(r"[a-f0-9]{64}", str(config["artifact_sha256"]), re.IGNORECASE):
        raise ValueError("candidate-artifact-sha256-invalid")
    if isinstance(config["candidate_port"], bool) or not isinstance(config["candidate_port"], int):
        raise ValueError("candidate-port-invalid")
    if not 1024 <= config["candidate_port"] <= 65535:
        raise ValueError("candidate-port-invalid")
    if config["candidate_port"] == 4318:
        raise ValueError("candidate-port-production-collision")
    for key in ("state_host_path", "cpm_secret_host_path", "session_secret_source", "admin_identity_source"):
        path_value = str(config[key])
        is_absolute = os.path.isabs(path_value) or path_value.startswith("/") or bool(re.match(r"^[A-Za-z]:[\\/]", path_value))
        if not is_absolute:
            raise ValueError("candidate-state-path-invalid" if key == "state_host_path" else "candidate-secret-path-invalid")

    service = {
        "image": f'{config["image_repository"]}@{config["image_digest"]}',
        "container_name": candidate_name,
        "restart": "no",
        "ports": [f'127.0.0.1:{config["candidate_port"]}:4318'],
        "environment": {
            "HOST": "0.0.0.0",
            "PORT": "4318",
            "APP_STATE_FILE": "/app/data/app-state.json",
            "CPM_CREDENTIAL_FILE": "/run/secrets/cpm-credentials.txt",
            "BUILD_ID": str(config["build_id"]),
            "NEXUS_BUILD_VERSION": str(config["build_version"]),
            "NEXUS_BUILD_COMMIT": str(config["source_commit"]),
            "NEXUS_IMAGE_DIGEST": str(config["image_digest"]),
            "NEXUS_ARTIFACT_SHA256": str(config["artifact_sha256"]),
            "NEXUS_ACCEPTED_RISKS": str(config.get("accepted_risks", "")),
            "CPM_SQL_SERVER": str(config["cpm_server"]),
            "CPM_SQL_INSTANCE": str(config["cpm_instance"]),
            "CPM_SQL_DATABASE": str(config["cpm_database"]),
            "CPM_SQL_COMPANY": str(config["cpm_company"]),
            "NEXUS_PUBLIC_ORIGIN": str(config["public_origin"]),
            "NEXUS_SESSION_SECRET_FILE": str(config["session_secret_source"]),
            "NEXUS_ADMIN_IDENTITY_FILE": str(config["admin_identity_source"]),
        },
        "volumes": [
            f'{config["state_host_path"]}:/app/data',
            f'{config["cpm_secret_host_path"]}:/run/secrets/cpm-credentials.txt:ro',
        ],
        "read_only": True,
        "tmpfs": ["/tmp"],
        "cap_drop": ["ALL"],
        "security_opt": ["no-new-privileges:true"],
    }
    return {"services": {"marlin-profit-sharing": service}}


def build_candidate_verification_plan(config, year):
    """Return reviewable POSIX commands; this function never executes them."""
    required = ("host", "candidate_port", "tls_ca_file", "auth_payload_file", "cookie_jar", "image_digest", "release_id")
    missing = [key for key in required if not config.get(key)]
    if missing:
        raise ValueError("candidate-plan-missing:" + ",".join(missing))
    if not isinstance(config["host"], str) or not HOST.fullmatch(config["host"]):
        raise ValueError("candidate-plan-host-invalid")
    candidate_name = _candidate_name(config["release_id"], "candidate-plan-release-id-invalid")
    if isinstance(config["candidate_port"], bool) or not isinstance(config["candidate_port"], int):
        raise ValueError("candidate-plan-port-invalid")
    if not 1024 <= config["candidate_port"] <= 65535:
        raise ValueError("candidate-plan-port-invalid")
    if config["candidate_port"] == 4318:
        raise ValueError("candidate-plan-port-production-collision")
    if not IMMUTABLE_DIGEST.fullmatch(config["image_digest"]):
        raise ValueError("candidate-plan-image-digest-invalid")
    if not isinstance(year, int) or not 2000 <= year <= 2100:
        raise ValueError("candidate-plan-year-invalid")

    ca_file = shlex.quote(config["tls_ca_file"])
    auth_payload = shlex.quote(config["auth_payload_file"])
    cookie_jar = shlex.quote(config["cookie_jar"])
    image = shlex.quote(config["image_digest"])
    candidate_name = shlex.quote(candidate_name)
    base_url = f'https://{config["host"]}:{config["candidate_port"]}'
    url = lambda path: shlex.quote(base_url + path)
    curl = f"curl --fail --silent --show-error --cacert {ca_file}"
    readiness_curl = f"curl --silent --show-error --cacert {ca_file}"
    return [
        {"name": "inspect-immutable-image", "command": f"docker image inspect --format '{{{{.Id}}}}' {image}"},
        {"name": "inspect-candidate-container", "command": f"docker inspect --format '{{{{.State.Running}}}}' {candidate_name}"},
        {"name": "health-with-ca", "command": f"{curl} {url('/api/health')}"},
        {"name": "login-with-ca", "command": f"{curl} -X POST -H 'Content-Type: application/json' --data-binary @{auth_payload} -c {cookie_jar} {url('/api/session/login')}"},
        {"name": "authenticated-overview-with-ca", "command": f"{curl} -b {cookie_jar} {url(f'/api/overview?year={year}')}"},
        {"name": "authenticated-department-analysis-with-ca", "command": f"{curl} -b {cookie_jar} {url(f'/api/department-analysis?year={year}')}"},
        {"name": "prewarm-2025", "command": f"{readiness_curl} -b {cookie_jar} {url('/api/readiness?year=2025')}"},
        {"name": "prewarm-2026", "command": f"{readiness_curl} -b {cookie_jar} {url('/api/readiness?year=2026')}"},
        {"name": "authenticated-build-info-with-ca", "command": f"{curl} -b {cookie_jar} {url('/api/build-info')}"},
        {"name": "authenticated-readiness-with-ca", "command": f"{readiness_curl} -b {cookie_jar} {url(f'/api/readiness?year={year}')}"},
    ]


def build_secure_transfer_plan(config, archive_path, remote_archive_path, archive_sha256):
    """Return a reviewable key-only transfer plan; never opens SSH or SFTP."""
    required = ("host", "user", "ssh_key_file", "known_hosts_file", "host_key")
    missing = [key for key in required if not config.get(key)]
    if missing:
        raise ValueError("transfer-plan-missing:" + ",".join(missing))
    if not re.fullmatch(r"SHA256:[A-Za-z0-9+/=]+", str(config["host_key"])):
        raise ValueError("transfer-plan-host-key-invalid")
    if not isinstance(archive_sha256, str) or not re.fullmatch(r"[a-f0-9]{64}", archive_sha256, re.IGNORECASE):
        raise ValueError("transfer-plan-sha256-invalid")

    key = shlex.quote(config["ssh_key_file"])
    known_hosts = shlex.quote(config["known_hosts_file"])
    local_archive = shlex.quote(archive_path)
    remote_archive = shlex.quote(remote_archive_path)
    target = f"{shlex.quote(config['user'])}@{shlex.quote(config['host'])}"
    ssh_options = f"-o StrictHostKeyChecking=yes -o UserKnownHostsFile={known_hosts} -o IdentitiesOnly=yes -i {key}"
    return [
        {"name": "verify-local-artifact-digest", "command": f"printf '%s  %s\\n' {archive_sha256} {local_archive} | sha256sum -c -"},
        {"name": "upload-over-pinned-ssh", "command": f"scp {ssh_options} {local_archive} {target}:{remote_archive}"},
        {"name": "verify-remote-artifact-digest", "command": f"printf '%s  %s\\n' {archive_sha256} {remote_archive} | ssh {ssh_options} {target} sha256sum -c -"},
    ]


def main():
    errors = validate_runner_config(build_runner_config())
    if errors:
        print("RELEASE_PREFLIGHT_BLOCKED")
        for error in errors:
            print(error)
        return 2
    print("RELEASE_PREFLIGHT_CONFIG_VALID")
    print("NO_DEPLOY_PERFORMED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
