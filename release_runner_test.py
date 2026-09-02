import unittest

from release_runner import (
    build_candidate_verification_plan,
    build_candidate_compose_override,
    build_runner_config,
    build_secure_transfer_plan,
    validate_candidate_evidence,
    validate_candidate_financial_parity,
    validate_readiness_payload,
    validate_runner_config,
    validate_release_gate,
)
from release_artifact import validate_release_manifest


class ReleaseRunnerContractTests(unittest.TestCase):
    def _valid_manifest(self):
        return {
            "releaseId": "nexus-20260901-120000",
            "sourceCommit": "0" * 40,
            "buildId": "nexus-20260901-120000",
            "buildVersion": "2026.09.01",
            "imageDigest": "sha256:" + "a" * 64,
            "composeConfigHash": "sha256:" + "c" * 64,
            "artifactSha256": "d" * 64,
            "cpm": {"database": "MARLINSQL", "company": "01"},
            "ssh": {"hostKey": "SHA256:hostfingerprint"},
            "tls": {"caFile": "/secure/marlin-nexus-ca.pem"},
            "previous": {
                "releaseId": "nexus-previous",
                "imageDigest": "sha256:" + "b" * 64,
                "artifactSha256": "e" * 64,
            },
        }

    def test_python_manifest_rejects_whitespace_padded_identity_and_digests(self):
        manifest = self._valid_manifest()
        for field in ("sourceCommit", "imageDigest", "composeConfigHash", "artifactSha256"):
            candidate = dict(manifest)
            candidate[field] = f" {manifest[field]} "
            self.assertIn(
                {"sourceCommit": "source-commit-invalid", "imageDigest": "image-digest-invalid",
                 "composeConfigHash": "compose-config-hash-invalid", "artifactSha256": "artifact-digest-invalid"}[field],
                validate_release_manifest(candidate),
            )
        candidate = dict(manifest)
        candidate["previous"] = {**manifest["previous"], "imageDigest": f" {manifest['previous']['imageDigest']} ", "artifactSha256": f" {manifest['previous']['artifactSha256']} "}
        errors = validate_release_manifest(candidate)
        self.assertIn("rollback-manifest-missing", errors)
        self.assertIn("rollback-artifact-digest-missing", errors)

    def test_release_gate_requires_runner_manifest_and_target_capacity(self):
        config = build_runner_config({
            "NEXUS_HOST": "192.168.12.11",
            "NEXUS_USER": "serviceproadmin",
            "NEXUS_SSH_KEY_FILE": "C:/secure/nexus_ed25519",
            "NEXUS_KNOWN_HOSTS_FILE": "C:/secure/known_hosts",
            "NEXUS_SSH_HOST_KEY": "ssh-ed25519 256 SHA256:host",
            "NEXUS_TLS_CA_FILE": "C:/secure/marlin-nexus-ca.pem",
            "NEXUS_RELEASE_ID": "nexus-20260901-120000",
            "NEXUS_SOURCE_COMMIT": "0" * 40,
            "NEXUS_IMAGE_DIGEST": "sha256:" + "a" * 64,
            "NEXUS_COMPOSE_CONFIG_HASH": "sha256:" + "c" * 64,
            "NEXUS_PREVIOUS_RELEASE_ID": "nexus-previous",
            "NEXUS_PREVIOUS_IMAGE_DIGEST": "sha256:" + "b" * 64,
            "NEXUS_ACCEPTED_RISKS": "cpm-extra-permissions",
        })
        self.assertEqual(config["accepted_risks"], "cpm-extra-permissions")
        self.assertEqual(validate_release_gate(config, self._valid_manifest(), {
            "available_bytes": 1000,
            "required_bytes": 400,
            "reserve_bytes": 600,
        }), [])

    def test_release_gate_blocks_manifest_mismatch_and_insufficient_capacity(self):
        config = build_runner_config({
            "NEXUS_RELEASE_ID": "different-release",
            "NEXUS_SOURCE_COMMIT": "1" * 40,
            "NEXUS_IMAGE_DIGEST": "sha256:" + "f" * 64,
        })
        errors = validate_release_gate(config, self._valid_manifest(), {
            "available_bytes": 999,
            "required_bytes": 400,
            "reserve_bytes": 600,
        })
        self.assertIn("runner-release-id-mismatch", errors)
        self.assertIn("runner-source-commit-mismatch", errors)
        self.assertIn("runner-image-digest-mismatch", errors)
        self.assertIn("target-disk-insufficient", errors)
    def test_requires_immutable_release_and_transport_evidence(self):
        config = build_runner_config({
            "NEXUS_HOST": "192.168.12.11",
            "NEXUS_USER": "serviceproadmin",
            "NEXUS_SSH_KEY_FILE": "C:/secure/nexus_ed25519",
            "NEXUS_KNOWN_HOSTS_FILE": "C:/secure/known_hosts",
            "NEXUS_SSH_HOST_KEY": "ssh-ed25519 256 SHA256:host",
            "NEXUS_TLS_CA_FILE": "C:/secure/marlin-nexus-ca.pem",
            "NEXUS_RELEASE_ID": "nexus-20260901-120000",
            "NEXUS_SOURCE_COMMIT": "0123456789abcdef0123456789abcdef01234567",
            "NEXUS_IMAGE_DIGEST": "sha256:" + "a" * 64,
            "NEXUS_COMPOSE_CONFIG_HASH": "sha256:" + "c" * 64,
            "NEXUS_PREVIOUS_RELEASE_ID": "nexus-previous",
            "NEXUS_PREVIOUS_IMAGE_DIGEST": "sha256:" + "b" * 64,
        })
        self.assertEqual(validate_runner_config(config), [])

    def test_rejects_passwords_auto_accept_and_insecure_tls(self):
        config = build_runner_config({
            "NEXUS_HOST": "192.168.12.11",
            "NEXUS_USER": "serviceproadmin",
            "NEXUS_PASSWORD": "should-not-be-used",
            "NEXUS_AUTO_ACCEPT_HOST_KEY": "true",
            "NEXUS_TLS_CA_FILE": "insecure",
            "NEXUS_IMAGE_DIGEST": "latest",
        })
        errors = validate_runner_config(config)
        self.assertIn("ssh-key-file-missing", errors)
        self.assertIn("known-hosts-file-missing", errors)
        self.assertIn("password-auth-disabled", errors)
        self.assertIn("host-key-auto-accept-disabled", errors)
        self.assertIn("tls-ca-invalid", errors)
        self.assertIn("image-digest-invalid", errors)

    def test_candidate_requires_immutable_identity_readiness_prewarm_and_smoke(self):
        expected = {
            "build_id": "nexus-20260901-120000",
            "source_commit": "0123456789abcdef0123456789abcdef01234567",
            "image_digest": "sha256:" + "a" * 64,
            "financial_parity_required": True,
        }
        observed = {
            "container_running": True,
            "build_id": expected["build_id"],
            "build_commit": expected["source_commit"],
            "image_digest": expected["image_digest"],
            "readiness": True,
            "prewarm": True,
            "authenticated_smoke": True,
            "read_only": True,
            "financial_parity": self._passing_financial_parity(),
        }
        self.assertEqual(validate_candidate_evidence(expected, observed), [])

    def _passing_financial_parity(self):
        return {
            "overview": {
                "http_status": 200, "mode": "live", "readOnly": True, "year": 2026,
                "currency": "EUR", "ledgerVersion": "ledger-1", "scope": "2026",
                "eurNetSales": 1007898.12,
            },
            "department": {
                "http_status": 200, "mode": "live", "readOnly": True, "year": 2026,
                "currency": "EUR", "ledgerVersion": "ledger-1", "scope": "2026",
                "eurNetSales": 1007898.125, "eurGrossProfit": 280401.25,
                "eurMargin": 27.8223,
            },
        }

    def test_financial_parity_rejects_live_eur_regression_and_invalid_margin(self):
        observed = self._passing_financial_parity()
        observed["department"]["eurNetSales"] = 1969724.0
        observed["department"]["eurMargin"] = 0.0
        errors = validate_candidate_financial_parity(observed, year=2026)
        self.assertEqual(errors, [
            "candidate-overview-department-net-sales-mismatch",
            "candidate-department-margin-invalid",
        ])

    def test_financial_parity_requires_live_scope_identity_and_tolerates_rounding(self):
        observed = self._passing_financial_parity()
        self.assertEqual(validate_candidate_financial_parity(observed, year=2026), [])

        observed["department"]["ledgerVersion"] = "ledger-2"
        self.assertIn("candidate-financial-scope-mismatch", validate_candidate_financial_parity(observed, year=2026))

        missing = {"overview": observed["overview"]}
        self.assertIn("candidate-parity-evidence-missing", validate_candidate_financial_parity(missing, year=2026))

    def test_candidate_rejects_identity_mismatch_and_unverified_runtime(self):
        errors = validate_candidate_evidence(
            {"build_id": "nexus", "source_commit": "0" * 40, "image_digest": "sha256:" + "a" * 64, "financial_parity_required": True},
            {"container_running": True, "build_id": "other", "build_commit": "1" * 40,
             "image_digest": "sha256:" + "b" * 64, "readiness": False, "prewarm": False,
             "authenticated_smoke": False, "read_only": False, "financial_parity": {}},
        )
        self.assertEqual(errors, [
            "candidate-build-id-mismatch",
            "candidate-commit-mismatch",
            "candidate-image-mismatch",
            "candidate-readiness-failed",
            "candidate-prewarm-unverified",
            "candidate-authenticated-smoke-failed",
            "candidate-read-only-unverified",
            "candidate-parity-evidence-missing",
        ])

    def test_candidate_accepts_known_financial_readiness_blockers_but_rejects_unknown(self):
        expected = {
            "build_id": "nexus",
            "source_commit": "0" * 40,
            "image_digest": "sha256:" + "a" * 64,
            "allowed_readiness_blockers": [
                "official-cost-coverage-insufficient",
                "inventory-opening-evidence-ambiguous",
            ],
            "financial_parity_required": True,
        }
        observed = {
            "container_running": True,
            "build_id": "nexus",
            "build_commit": "0" * 40,
            "image_digest": "sha256:" + "a" * 64,
            "readiness": False,
            "readiness_blockers": [
                "inventory-opening-evidence-ambiguous",
                "official-cost-coverage-insufficient",
            ],
            "prewarm": True,
            "authenticated_smoke": True,
            "read_only": True,
            "financial_parity": self._passing_financial_parity(),
        }
        self.assertEqual(validate_candidate_evidence(expected, observed), [])

        observed["readiness_blockers"] = ["unexpected-blocker"]
        self.assertIn("candidate-readiness-failed", validate_candidate_evidence(expected, observed))

    def test_readiness_payload_accepts_only_expected_financial_503(self):
        expected = {
            "build_id": "nexus",
            "allowed_readiness_blockers": [
                "official-cost-coverage-insufficient",
                "inventory-opening-evidence-ambiguous",
            ],
        }
        payload = {
            "http_status": 503,
            "ready": False,
            "connected": True,
            "readOnly": True,
            "buildId": "nexus",
            "blockers": [
                "official-cost-coverage-insufficient",
                "inventory-opening-evidence-ambiguous",
            ],
        }
        self.assertEqual(validate_readiness_payload(expected, payload), [])

        payload["blockers"] = ["unexpected-blocker"]
        self.assertIn("readiness-blockers-invalid", validate_readiness_payload(expected, payload))

    def test_readiness_payload_reads_runtime_metadata_from_nested_contract(self):
        expected = {
            "build_id": "nexus",
            "allowed_readiness_blockers": [
                "official-cost-coverage-insufficient",
                "inventory-opening-evidence-ambiguous",
            ],
        }
        payload = {
            "http_status": 503,
            "ready": False,
            "blockers": expected["allowed_readiness_blockers"],
            "runtime": {
                "buildId": "nexus",
                "connected": True,
                "readOnly": False,
                "readOnlyEvidence": "unverified",
                "acceptedRisks": ["cpm-extra-permissions"],
            },
        }
        self.assertEqual(validate_readiness_payload(expected, payload), [])

    def test_builds_isolated_candidate_compose_override_from_immutable_identity(self):
        override = build_candidate_compose_override({
            "release_id": "nexus-20260901-120000",
            "image_repository": "marlin-nexus-candidate",
            "image_digest": "sha256:" + "a" * 64,
            "build_id": "nexus-20260901-120000",
            "build_version": "2026.09.01",
            "source_commit": "0" * 40,
            "artifact_sha256": "d" * 64,
            "candidate_port": 14318,
            "state_host_path": "/var/tmp/marlin-nexus-candidate-state",
            "cpm_secret_host_path": "/secure/cpm-credentials.txt",
            "session_secret_source": "/secure/session-secret",
            "admin_identity_source": "/secure/admin-identity",
            "cpm_server": "192.168.12.17",
            "cpm_instance": "MARLINSQL",
            "cpm_database": "Marlin_Uyg",
            "cpm_company": "01",
            "public_origin": "https://127.0.0.1:14318",
            "accepted_risks": "cpm-extra-permissions",
        })
        service = override["services"]["marlin-profit-sharing"]
        self.assertEqual(service["image"], "marlin-nexus-candidate@sha256:" + "a" * 64)
        self.assertEqual(service["container_name"], "marlin-nexus-candidate-nexus-20260901-120000")
        self.assertEqual(service["ports"], ["127.0.0.1:14318:4318"])
        self.assertEqual(service["restart"], "no")
        self.assertEqual(service["environment"]["NEXUS_ACCEPTED_RISKS"], "cpm-extra-permissions")
        self.assertTrue(service["read_only"])
        self.assertEqual(service["volumes"], [
            "/var/tmp/marlin-nexus-candidate-state:/app/data",
            "/secure/cpm-credentials.txt:/run/secrets/cpm-credentials.txt:ro",
        ])

    def test_candidate_compose_override_rejects_production_collision_and_mutable_inputs(self):
        base = {
            "release_id": "nexus-20260901-120000",
            "image_repository": "marlin-nexus-candidate",
            "image_digest": "sha256:" + "a" * 64,
            "build_id": "nexus",
            "build_version": "2026.09.01",
            "source_commit": "0" * 40,
            "artifact_sha256": "d" * 64,
            "candidate_port": 14318,
            "state_host_path": "/var/tmp/candidate-state",
            "cpm_secret_host_path": "/secure/cpm-credentials.txt",
            "session_secret_source": "/secure/session-secret",
            "admin_identity_source": "/secure/admin-identity",
            "cpm_server": "192.168.12.17",
            "cpm_instance": "MARLINSQL",
            "cpm_database": "Marlin_Uyg",
            "cpm_company": "01",
            "public_origin": "https://127.0.0.1:14318",
        }
        for key, value, error in [
            ("image_repository", "marlin-nexus:latest", "candidate-image-repository-invalid"),
            ("candidate_port", 4318, "candidate-port-production-collision"),
            ("candidate_port", 70000, "candidate-port-invalid"),
            ("state_host_path", "relative/state", "candidate-state-path-invalid"),
        ]:
            candidate = dict(base)
            candidate[key] = value
            with self.subTest(key=key, value=value):
                with self.assertRaisesRegex(ValueError, error):
                    build_candidate_compose_override(candidate)

    def test_builds_tls_verified_immutable_candidate_plan_without_credentials(self):
        config = {
            "host": "192.168.12.11",
            "candidate_port": 14318,
            "tls_ca_file": "/secure/marlin-nexus-ca.pem",
            "auth_payload_file": "/secure/nexus-login.json",
            "cookie_jar": "/tmp/nexus-candidate.cookies",
            "image_digest": "sha256:" + "a" * 64,
            "release_id": "nexus-20260901-120000",
        }
        plan = build_candidate_verification_plan(config, year=2026)
        commands = [step["command"] for step in plan]
        self.assertEqual([step["name"] for step in plan], [
            "inspect-immutable-image",
            "inspect-candidate-container",
            "health-with-ca",
            "login-with-ca",
            "authenticated-overview-with-ca",
            "authenticated-department-analysis-with-ca",
            "prewarm-2025",
            "prewarm-2026",
            "authenticated-build-info-with-ca",
            "authenticated-readiness-with-ca",
        ])
        self.assertTrue(all("--insecure" not in command and "curl -k" not in command for command in commands))
        self.assertTrue(all("Marlin48" not in command for command in commands))
        self.assertIn(config["image_digest"], commands[0])
        self.assertIn("marlin-nexus-candidate-nexus-20260901-120000", commands[1])
        self.assertTrue(all("https://192.168.12.11:14318" in command for command in commands[2:]))
        self.assertIn("--cacert /secure/marlin-nexus-ca.pem", commands[2])
        self.assertIn("--data-binary @/secure/nexus-login.json", commands[3])
        self.assertIn("-b /tmp/nexus-candidate.cookies", commands[-1])
        for index in (6, 7, 9):
            self.assertNotIn("--fail", commands[index])
            self.assertIn("--cacert /secure/marlin-nexus-ca.pem", commands[index])

    def test_candidate_verification_plan_requires_valid_candidate_port(self):
        config = {
            "host": "192.168.12.11",
            "tls_ca_file": "/secure/marlin-nexus-ca.pem",
            "auth_payload_file": "/secure/nexus-login.json",
            "cookie_jar": "/tmp/nexus-candidate.cookies",
            "image_digest": "sha256:" + "a" * 64,
            "release_id": "nexus-20260901-120000",
        }
        with self.assertRaisesRegex(ValueError, "candidate-plan-missing:candidate_port"):
            build_candidate_verification_plan(config, year=2026)
        config["candidate_port"] = "14318"
        with self.assertRaisesRegex(ValueError, "candidate-plan-port-invalid"):
            build_candidate_verification_plan(config, year=2026)

    def test_candidate_compose_and_verification_contracts_agree_on_port_and_container(self):
        common = {
            "release_id": "nexus-20260901-120000",
            "image_repository": "marlin-nexus-candidate",
            "image_digest": "sha256:" + "a" * 64,
            "build_id": "nexus-20260901-120000",
            "build_version": "2026.09.01",
            "source_commit": "0" * 40,
            "artifact_sha256": "d" * 64,
            "candidate_port": 14318,
            "state_host_path": "/var/tmp/marlin-nexus-candidate-state",
            "cpm_secret_host_path": "/secure/cpm-credentials.txt",
            "session_secret_source": "/secure/session-secret",
            "admin_identity_source": "/secure/admin-identity",
            "cpm_server": "192.168.12.17",
            "cpm_instance": "MARLINSQL",
            "cpm_database": "Marlin_Uyg",
            "cpm_company": "01",
            "public_origin": "https://127.0.0.1:14318",
        }
        compose = build_candidate_compose_override(common)
        plan = build_candidate_verification_plan({
            "host": "192.168.12.11",
            "candidate_port": common["candidate_port"],
            "tls_ca_file": "/secure/marlin-nexus-ca.pem",
            "auth_payload_file": "/secure/nexus-login.json",
            "cookie_jar": "/tmp/nexus-candidate.cookies",
            "image_digest": common["image_digest"],
            "release_id": common["release_id"],
        }, year=2026)
        service = compose["services"]["marlin-profit-sharing"]
        commands = [step["command"] for step in plan]
        self.assertEqual(service["ports"], ["127.0.0.1:14318:4318"])
        self.assertIn("marlin-nexus-candidate-nexus-20260901-120000", commands[1])
        self.assertTrue(all("https://192.168.12.11:14318" in command for command in commands[2:]))

    def test_candidate_compose_and_verification_reject_invalid_release_id(self):
        compose_config = {
            "release_id": "nexus/20260901",
            "image_repository": "marlin-nexus-candidate",
            "image_digest": "sha256:" + "a" * 64,
            "build_id": "nexus-20260901-120000",
            "build_version": "2026.09.01",
            "source_commit": "0" * 40,
            "artifact_sha256": "d" * 64,
            "candidate_port": 14318,
            "state_host_path": "/var/tmp/marlin-nexus-candidate-state",
            "cpm_secret_host_path": "/secure/cpm-credentials.txt",
            "session_secret_source": "/secure/session-secret",
            "admin_identity_source": "/secure/admin-identity",
            "cpm_server": "192.168.12.17",
            "cpm_instance": "MARLINSQL",
            "cpm_database": "Marlin_Uyg",
            "cpm_company": "01",
            "public_origin": "https://127.0.0.1:14318",
        }
        plan_config = {
            "host": "192.168.12.11",
            "candidate_port": 14318,
            "tls_ca_file": "/secure/marlin-nexus-ca.pem",
            "auth_payload_file": "/secure/nexus-login.json",
            "cookie_jar": "/tmp/nexus-candidate.cookies",
            "image_digest": compose_config["image_digest"],
            "release_id": compose_config["release_id"],
        }

        with self.assertRaisesRegex(ValueError, "candidate-release-id-invalid"):
            build_candidate_compose_override(compose_config)
        with self.assertRaisesRegex(ValueError, "candidate-plan-release-id-invalid"):
            build_candidate_verification_plan(plan_config, year=2026)

    def test_candidate_verification_plan_rejects_malformed_host_before_url_construction(self):
        config = {
            "host": "192.168.12.11; touch /tmp/pwned",
            "candidate_port": 14318,
            "tls_ca_file": "/secure/marlin-nexus-ca.pem",
            "auth_payload_file": "/secure/nexus-login.json",
            "cookie_jar": "/tmp/nexus-candidate.cookies",
            "image_digest": "sha256:" + "a" * 64,
            "release_id": "nexus-20260901-120000",
        }
        with self.assertRaisesRegex(ValueError, "candidate-plan-host-invalid"):
            build_candidate_verification_plan(config, year=2026)

    def test_builds_pinned_key_only_transfer_plan_with_remote_digest_check(self):
        config = {
            "host": "192.168.12.11",
            "user": "serviceproadmin",
            "ssh_key_file": "/secure/nexus_ed25519",
            "known_hosts_file": "/secure/known_hosts",
            "host_key": "SHA256:hostfingerprint",
        }
        plan = build_secure_transfer_plan(
            config,
            "/tmp/nexus-release.tar.gz",
            "/home/serviceproadmin/.release-incoming/nexus-release.tar.gz",
            "a" * 64,
        )
        commands = [step["command"] for step in plan]
        self.assertEqual([step["name"] for step in plan], [
            "verify-local-artifact-digest",
            "upload-over-pinned-ssh",
            "verify-remote-artifact-digest",
        ])
        self.assertTrue(all("StrictHostKeyChecking=yes" in command for command in commands[1:]))
        self.assertTrue(all("UserKnownHostsFile=/secure/known_hosts" in command for command in commands[1:]))
        self.assertTrue(all("IdentitiesOnly=yes" in command for command in commands[1:]))
        self.assertTrue(all(token not in " ".join(commands) for token in ("sshpass", "StrictHostKeyChecking=no", "-k")))

    def test_rejects_unpinned_host_key_evidence(self):
        config = {
            "host": "192.168.12.11",
            "user": "serviceproadmin",
            "ssh_key_file": "/secure/nexus_ed25519",
            "known_hosts_file": "/secure/known_hosts",
            "host_key": "unverified",
        }
        with self.assertRaisesRegex(ValueError, "transfer-plan-host-key-invalid"):
            build_secure_transfer_plan(config, "/tmp/release.tar.gz", "/tmp/release.tar.gz", "a" * 64)


if __name__ == "__main__":
    unittest.main()
