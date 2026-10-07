"""Regression checks for worktree Compose project names."""

import runpy
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

SETUP_WORKTREE = runpy.run_path(Path(__file__).with_name("setup-worktree.py"))
PROJECT_NAME = SETUP_WORKTREE["project_name"]
RESOLVE_NAME = SETUP_WORKTREE["resolve_name"]
LINK_TUNNEL_CREDENTIALS = SETUP_WORKTREE["link_tunnel_credentials"]
IS_PRIMARY_CHECKOUT = SETUP_WORKTREE["is_primary_checkout"]
INHERIT_ENV = SETUP_WORKTREE["inherit_env"]
SHARED_KEYS = SETUP_WORKTREE["SHARED_KEYS"]


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

    def test_primary_checkout_is_detected_from_git_directories(self) -> None:
        with patch.dict(IS_PRIMARY_CHECKOUT.__globals__, {"ROOT": Path("/repo")}):
            with patch(
                "subprocess.run",
                side_effect=[
                    SimpleNamespace(stdout="/repo/.git\n"),
                    SimpleNamespace(stdout="/repo/.git\n"),
                ],
            ):
                self.assertTrue(IS_PRIMARY_CHECKOUT())

    def test_linked_worktree_is_not_the_primary_checkout(self) -> None:
        with patch.dict(
            IS_PRIMARY_CHECKOUT.__globals__, {"ROOT": Path("/repo/worktree")}
        ):
            with patch(
                "subprocess.run",
                side_effect=[
                    SimpleNamespace(stdout="/repo/.git/worktrees/feature\n"),
                    SimpleNamespace(stdout="/repo/.git\n"),
                ],
            ):
                self.assertFalse(IS_PRIMARY_CHECKOUT())

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


class InheritEnvTest(unittest.TestCase):
    """Shared credentials flow from the primary checkout without clobbering a worktree."""

    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        self.example = root / ".env.example"
        self.primary = root / "primary.env"
        self.worktree = root / "worktree.env"
        self.example.write_text("RESEND_API_KEY=re_xxxxxxxxxxxx\nGITHUB_CLIENT_ID=\n")

    def test_placeholder_and_empty_values_are_filled(self) -> None:
        self.primary.write_text("RESEND_API_KEY=re_real\nGITHUB_CLIENT_ID=gh_real\n")
        self.worktree.write_text("RESEND_API_KEY=re_xxxxxxxxxxxx\nGITHUB_CLIENT_ID=\n")

        filled = INHERIT_ENV(self.primary, self.worktree, SHARED_KEYS, self.example)

        self.assertEqual(filled, ["RESEND_API_KEY", "GITHUB_CLIENT_ID"])
        self.assertEqual(
            self.worktree.read_text(),
            "RESEND_API_KEY=re_real\nGITHUB_CLIENT_ID=gh_real\n",
        )

    def test_existing_real_values_are_never_overwritten(self) -> None:
        self.primary.write_text("RESEND_API_KEY=re_primary\n")
        self.worktree.write_text("RESEND_API_KEY=re_own\n")

        self.assertEqual(
            INHERIT_ENV(self.primary, self.worktree, SHARED_KEYS, self.example), []
        )
        self.assertEqual(self.worktree.read_text(), "RESEND_API_KEY=re_own\n")

    def test_primary_placeholder_is_not_inherited(self) -> None:
        self.primary.write_text("RESEND_API_KEY=re_xxxxxxxxxxxx\n")
        self.worktree.write_text("RESEND_API_KEY=\n")

        self.assertEqual(
            INHERIT_ENV(self.primary, self.worktree, SHARED_KEYS, self.example), []
        )

    def test_only_listed_keys_are_inherited(self) -> None:
        self.primary.write_text("JWT_SECRET=primary-secret\nRESEND_API_KEY=re_real\n")
        self.worktree.write_text("JWT_SECRET=\n")

        filled = INHERIT_ENV(self.primary, self.worktree, SHARED_KEYS, self.example)

        self.assertEqual(filled, ["RESEND_API_KEY"])
        self.assertNotIn("primary-secret", self.worktree.read_text())
        self.assertIn(
            "# Inherited from the primary checkout", self.worktree.read_text()
        )


if __name__ == "__main__":
    unittest.main()
