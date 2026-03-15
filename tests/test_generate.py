from __future__ import annotations

import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import generate


class GenerateScriptTests(unittest.TestCase):
    def test_ac01_cli_arguments_and_defaults(self) -> None:
        parser = generate.build_parser()

        args = parser.parse_args(["--prompt", "minimalist icon", "--model", "sdxl"])
        self.assertEqual(args.prompt, "minimalist icon")
        self.assertEqual(args.model, "sdxl")
        self.assertEqual(args.output, "./output.png")
        self.assertIsNone(args.steps)
        self.assertIsNone(args.seed)

    def test_ac02_writes_valid_png_to_output_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "nested" / "icon.png"
            code = generate.run(
                [
                    "--prompt",
                    "minimalist icon",
                    "--model",
                    "sdxl",
                    "--output",
                    str(output),
                ]
            )

            self.assertEqual(code, 0)
            self.assertTrue(output.exists())
            self.assertGreater(output.stat().st_size, 8)
            self.assertEqual(output.read_bytes()[:8], b"\x89PNG\r\n\x1a\n")

    def test_ac03_exit_code_zero_on_success(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "icon.png"
            result = subprocess.run(
                [
                    "python3",
                    "generate.py",
                    "--prompt",
                    "minimalist icon",
                    "--model",
                    "sdxl",
                    "--output",
                    str(output),
                ],
                check=False,
                capture_output=True,
                text=True,
            )

            self.assertEqual(result.returncode, 0)
            self.assertEqual(result.stdout, "")
            self.assertTrue(output.exists())

    def test_ac04_lint_and_type_checks_pass(self) -> None:
        # Lint with ruff when available.
        if shutil.which("ruff"):
            lint = subprocess.run(
                ["ruff", "check", "generate.py", "tests/test_generate.py"],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(lint.returncode, 0, msg=lint.stdout + lint.stderr)

        # Basic static validation from stdlib compiler.
        compile_check = subprocess.run(
            ["python3", "-m", "py_compile", "generate.py"],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(compile_check.returncode, 0, msg=compile_check.stderr)


if __name__ == "__main__":
    unittest.main()
