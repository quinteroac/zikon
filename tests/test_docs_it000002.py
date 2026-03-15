"""
Documentation tests for US-004 (iteration 000002).

Verifies that README.md, AGENTS.md, and .agents/PROJECT_CONTEXT.md have been
updated to reflect the scripts/trace/ tracing capability.
"""

import pathlib
import unittest

ROOT = pathlib.Path(__file__).parent.parent


class TestReadme(unittest.TestCase):
    """US-004-AC01: README.md mentions scripts/trace/ and its CLI usage."""

    def setUp(self):
        self.content = (ROOT / "README.md").read_text()

    def test_ac01_scripts_trace_directory_mentioned(self):
        self.assertIn("scripts/trace/", self.content)

    def test_ac01_trace_cli_usage_shown(self):
        self.assertIn("node trace.js", self.content)

    def test_ac01_trace_optional_flags_shown(self):
        self.assertIn("--colors", self.content)
        self.assertIn("--tolerance", self.content)
        self.assertIn("--scale", self.content)


class TestAgentsMd(unittest.TestCase):
    """US-004-AC02: AGENTS.md script layout table and JSON output updated."""

    def setUp(self):
        self.content = (ROOT / "AGENTS.md").read_text()

    def test_ac02_trace_row_in_script_layout_table(self):
        self.assertIn("scripts/trace/", self.content)

    def test_ac02_trace_row_not_planned(self):
        # trace.js should no longer be described as "(planned)"
        self.assertNotIn("trace.js` | Node.js script — converts PNG to SVG (planned)", self.content)

    def test_ac02_trace_js_key_file_listed(self):
        self.assertIn("scripts/trace/trace.js", self.content)

    def test_ac02_svg_path_produced_by_trace_js(self):
        self.assertIn("svg_path", self.content)
        self.assertIn("svg_inline", self.content)
        self.assertIn("trace.js", self.content)

    def test_ac02_trace_cli_section_present(self):
        self.assertIn("scripts/trace (current)", self.content)


class TestProjectContext(unittest.TestCase):
    """US-004-AC03: PROJECT_CONTEXT.md Modular Structure and Implemented Capabilities updated."""

    def setUp(self):
        self.content = (ROOT / ".agents" / "PROJECT_CONTEXT.md").read_text()

    def test_ac03_modular_structure_includes_trace(self):
        self.assertIn("scripts/trace/", self.content)
        self.assertIn("trace.js", self.content)

    def test_ac03_iteration_000002_section_present(self):
        self.assertIn("Iteration 000002", self.content)

    def test_ac03_iteration_000002_us001_basic_conversion(self):
        # Basic PNG → SVG conversion
        self.assertIn("PNG → SVG", self.content)

    def test_ac03_iteration_000002_us002_configurable_params(self):
        self.assertIn("--colors", self.content)
        self.assertIn("--tolerance", self.content)

    def test_ac03_iteration_000002_us003_json_output(self):
        self.assertIn("svg_path", self.content)
        self.assertIn("svg_inline", self.content)


if __name__ == "__main__":
    unittest.main()
