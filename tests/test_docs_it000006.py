"""
Documentation tests for Iteration 000006 / US-005.

Verifies that README.md, AGENTS.md, and .agents/PROJECT_CONTEXT.md mention
the --size flag and that markdown structure remains render-safe.
"""

import pathlib
import unittest

ROOT = pathlib.Path(__file__).parent.parent


def has_balanced_fenced_code_blocks(content: str) -> bool:
    return content.count("```") % 2 == 0


class TestReadme(unittest.TestCase):
    """US-005-AC01: README usage shows --size with an explicit example."""

    def setUp(self):
        self.content = (ROOT / "README.md").read_text(encoding="utf-8")

    def test_ac01_usage_section_mentions_size_flag(self):
        self.assertIn("## Usage", self.content)
        self.assertIn("--size <px>[,<px>...]", self.content)

    def test_ac01_usage_section_has_requested_example(self):
        self.assertIn("--size 512,24,18", self.content)


class TestAgentsMd(unittest.TestCase):
    """US-005-AC02: AGENTS CLI interface includes --size."""

    def setUp(self):
        self.content = (ROOT / "AGENTS.md").read_text(encoding="utf-8")

    def test_ac02_cli_interface_includes_size_flag(self):
        self.assertIn("## CLI interface", self.content)
        self.assertIn("--size <px>[,<px>...]", self.content)


class TestProjectContext(unittest.TestCase):
    """US-005-AC03: Iteration 000006 lists US-001 through US-005."""

    def setUp(self):
        self.content = (ROOT / ".agents" / "PROJECT_CONTEXT.md").read_text(encoding="utf-8")

    def test_ac03_iteration_000006_section_present(self):
        self.assertIn("### Iteration 000006", self.content)

    def test_ac03_iteration_000006_lists_us001_to_us005(self):
        section = self.content.split("### Iteration 000006", maxsplit=1)[1]
        for us_id in ["US-001", "US-002", "US-003", "US-004", "US-005"]:
            self.assertIn(us_id, section)


class TestMarkdownRenderability(unittest.TestCase):
    """US-005-AC04: markdown docs are structurally render-safe."""

    def test_ac04_markdown_fences_are_balanced(self):
        for rel_path in ["README.md", "AGENTS.md", ".agents/PROJECT_CONTEXT.md"]:
            content = (ROOT / rel_path).read_text(encoding="utf-8")
            self.assertTrue(
                has_balanced_fenced_code_blocks(content),
                f"Unbalanced fenced code blocks in {rel_path}",
            )

    def test_ac04_docs_keep_valid_table_headers(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        self.assertIn("|---|---|---|---|", readme)
        self.assertIn("| Path | Purpose |", agents)


if __name__ == "__main__":
    unittest.main()
