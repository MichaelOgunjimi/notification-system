"""Regression checks for worktree Compose project names."""

import runpy
import tempfile
import unittest
from pathlib import Path


SETUP_WORKTREE = runpy.run_path(Path(__file__).with_name("setup-worktree.py"))
PROJECT_NAME = SETUP_WORKTREE["project_name"]
RESOLVE_NAME = SETUP_WORKTREE["resolve_name"]
LINK_TUNNEL_CREDENTIALS = SETUP_WORKTREE["link_tunnel_credentials"]


class ProjectNameTest(unittest.TestCase):
    """Check issue-aware and legacy branch names."""

    def test_issue_branch_is_compact(self) -> None:
        self.assertEqual(
            PROJECT_NAME("feat/67-stop-all-and-loading-skeletons"),
            "beaco-67-stop-all-d0300e07",
        )

    def test_branch_without_issue_stays_distinctive(self) -> None:
        self.assertEqual(
            PROJECT_NAME("feat/stop-all-and-loading-skeletons"),
            "beaco-stop-all-413c3e8d",
        )

    def test_truncated_branches_do_not_share_a_project(self) -> None:
        self.assertNotEqual(
            PROJECT_NAME("feat/67-stop-all-api"),
            PROJECT_NAME("feat/67-stop-all-web"),
        )
        self.assertNotEqual(
            PROJECT_NAME("feat/67-stop-all-api"),
            PROJECT_NAME("fix/67-stop-all-api"),
        )

    def test_existing_assignment_survives_plain_rerun(self) -> None:
        existing = {
            "COMPOSE_PROJECT_NAME": "beaco-67-stop",
            **{
                key: str(prefix * 1000 + 804)
                for key, prefix in zip(
                    SETUP_WORKTREE["PORT_KEYS"], SETUP_WORKTREE["PORT_PREFIXES"]
                )
            },
        }
        self.assertEqual(RESOLVE_NAME(None, existing), "beaco-67-stop")

    def test_tunnel_credentials_are_shared_with_new_worktree(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "main-credentials.json"
            destination = root / "worktree" / "credentials.json"
            destination.parent.mkdir()
            source.write_text("credential")

            self.assertTrue(LINK_TUNNEL_CREDENTIALS(source, destination))
            self.assertTrue(destination.is_symlink())
            self.assertEqual(destination.read_text(), "credential")


if __name__ == "__main__":
    unittest.main()
