import unittest

from docker_cleanup import plan_image_cleanup


class DockerCleanupPlanTests(unittest.TestCase):
    def setUp(self):
        self.active_id = "sha256:" + "a" * 64
        self.old_id = "sha256:" + "b" * 64
        self.rollback_id = "sha256:" + "c" * 64
        self.rows = [
            {"id": self.active_id, "repo_tags": ["marlin-profit-sharing-marlin-profit-sharing:latest"]},
            {"id": self.old_id, "repo_tags": ["marlin-nexus:13e0606"]},
            {"id": self.rollback_id, "repo_tags": ["marlin-nexus:release-old", "marlin-nexus-rollback:20260809"]},
        ]

    def test_only_explicitly_approved_nonrollback_unused_digest_is_candidate(self):
        result = plan_image_cleanup(self.rows, {self.active_id}, {self.old_id})
        self.assertEqual(result["candidates"], [self.old_id])
        self.assertEqual(result["protected"], [self.active_id, self.rollback_id])
        self.assertEqual(result["blockers"], [])

    def test_without_allowlist_fails_closed_and_preserves_all_images(self):
        result = plan_image_cleanup(self.rows, {self.active_id}, set())
        self.assertEqual(result["candidates"], [])
        self.assertIn("image-retention-allowlist-missing", result["blockers"])
        self.assertIn(self.old_id, result["protected"])


if __name__ == "__main__":
    unittest.main()
