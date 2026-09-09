import hashlib
import tarfile
import tempfile
import unittest
from pathlib import Path

from release_artifact import (
    build_release_manifest,
    create_release_archive,
    validate_archive_members,
    validate_release_manifest,
    validate_target_capacity,
)


class ReleaseArtifactTests(unittest.TestCase):
    def _valid_manifest(self):
        return build_release_manifest(
            release_id="nexus-20260901-120000",
            source_commit="a" * 40,
            build_id="nexus-20260901-120000",
            build_version="2026.09.01",
            image_digest="sha256:" + "b" * 64,
            compose_config_hash="sha256:" + "c" * 64,
            artifact_sha256="d" * 64,
            cpm_database="192.168.12.17\\MARLINSQL",
            cpm_company="01",
            ssh_host_key="SHA256:AbCdEf1234567890+/=",
            tls_ca_file="/run/secrets/marlin-ca.crt",
            previous_release_id="nexus-20260831-230128",
            previous_image_digest="sha256:" + "e" * 64,
            previous_artifact_sha256="f" * 64,
        )

    def test_builds_and_validates_immutable_release_manifest_with_rollback(self):
        manifest = self._valid_manifest()
        self.assertEqual(validate_release_manifest(manifest), [])
        self.assertEqual(manifest["cpm"], {"database": "192.168.12.17\\MARLINSQL", "company": "01"})
        self.assertEqual(manifest["previous"]["releaseId"], "nexus-20260831-230128")

    def test_manifest_rejects_mutable_or_incomplete_release_evidence(self):
        manifest = self._valid_manifest()
        manifest["imageDigest"] = "latest"
        manifest["tls"]["caFile"] = "--insecure"
        manifest["previous"].pop("artifactSha256")
        errors = validate_release_manifest(manifest)
        self.assertIn("image-digest-invalid", errors)
        self.assertIn("tls-ca-invalid", errors)
        self.assertIn("rollback-artifact-digest-missing", errors)

    def test_manifest_rejects_numeric_contract_strings(self):
        for field in ("sourceCommit", "imageDigest", "composeConfigHash", "artifactSha256"):
            manifest = self._valid_manifest()
            manifest[field] = 123
            self.assertTrue(validate_release_manifest(manifest), field)

        manifest = self._valid_manifest()
        manifest["cpm"] = {"database": 123, "company": 456}
        self.assertIn("cpm-evidence-missing", validate_release_manifest(manifest))

        manifest = self._valid_manifest()
        manifest["ssh"]["hostKey"] = 123
        self.assertIn("ssh-host-key-invalid", validate_release_manifest(manifest))

        manifest = self._valid_manifest()
        manifest["tls"]["caFile"] = 123
        self.assertIn("tls-ca-invalid", validate_release_manifest(manifest))

        manifest = self._valid_manifest()
        manifest["previous"] = {"releaseId": 123, "imageDigest": 456, "artifactSha256": 789}
        self.assertIn("rollback-manifest-missing", validate_release_manifest(manifest))
        self.assertIn("rollback-artifact-digest-missing", validate_release_manifest(manifest))

    def test_target_capacity_requires_release_and_rollback_reserve(self):
        self.assertEqual(validate_target_capacity(500, 300, 200), [])
        self.assertIn("target-disk-insufficient", validate_target_capacity(499, 300, 200))
        self.assertIn("target-capacity-invalid", validate_target_capacity(-1, 300, 200))
    def test_allowlist_excludes_runtime_state_secrets_and_generated_files(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            for relative, content in {
                "server/index.mjs": "server",
                "src/App.jsx": "src",
                "dist/index.html": "dist",
                "package.json": "{}",
                "data/app-state.json": "state",
                "secrets/cpm-credentials.txt": "secret",
                ".env": "secret",
                ".git/config": "git",
                "node_modules/example.js": "generated",
            }.items():
                path = root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content, encoding="utf-8")
            result = create_release_archive(root, root.parent / "release.tar.gz")
            self.assertEqual(result["members"], ["dist/index.html", "package.json", "server/index.mjs", "src/App.jsx"])
            with tarfile.open(result["archive_path"], "r:gz") as archive:
                self.assertEqual(archive.getnames(), result["members"])

    def test_archive_reports_sha256_and_rejects_unsafe_member_names(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "server").mkdir()
            (root / "server/index.mjs").write_text("server", encoding="utf-8")
            result = create_release_archive(root, root.parent / "release.tar.gz")
            expected = hashlib.sha256(Path(result["archive_path"]).read_bytes()).hexdigest()
            self.assertEqual(result["sha256"], expected)
        self.assertEqual(validate_archive_members(["server/index.mjs", "package.json"]), [])
        self.assertIn("archive-member-path-traversal", validate_archive_members(["../secrets.txt"]))
        self.assertIn("archive-member-forbidden-root", validate_archive_members(["data/app-state.json"]))


if __name__ == "__main__":
    unittest.main()
