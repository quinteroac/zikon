from __future__ import annotations

import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import generate


class GenerateScriptTests(unittest.TestCase):
    def test_ac01_model_z_image_turbo_uses_z_image_turbo_pipeline(self) -> None:
        pipeline = generate.load_pipeline_config("z-image-turbo")
        self.assertEqual(pipeline.pipeline_name, "z-image-turbo")
        self.assertEqual(pipeline.model_id, "z-image-turbo")

    def test_ac02_model_sdxl_uses_sdxl_pipeline(self) -> None:
        pipeline = generate.load_pipeline_config("sdxl")
        self.assertEqual(pipeline.pipeline_name, "sdxl")
        self.assertEqual(pipeline.model_id, "sdxl")

    def test_ac03_custom_model_accepts_repo_id_and_local_directory_path(self) -> None:
        repo_pipeline = generate.load_pipeline_config("myorg/my-model")
        self.assertEqual(repo_pipeline.pipeline_name, "custom")
        self.assertEqual(repo_pipeline.model_id, "myorg/my-model")

        with tempfile.TemporaryDirectory() as tmpdir:
            local_pipeline = generate.load_pipeline_config(tmpdir)
            self.assertEqual(local_pipeline.pipeline_name, "custom")
            self.assertEqual(local_pipeline.model_id, str(Path(tmpdir).resolve()))

            output = Path(tmpdir) / "nested" / "icon.png"
            code = generate.run(["--prompt", "minimalist icon", "--model", tmpdir, "--output", str(output)])
            self.assertEqual(code, 0)
            self.assertTrue(output.exists())
            self.assertGreater(output.stat().st_size, 8)
            self.assertEqual(output.read_bytes()[:8], b"\x89PNG\r\n\x1a\n")

    def test_ac04_invalid_custom_model_exits_with_code_1_and_prints_stderr(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "icon.png"
            result = subprocess.run(
                [
                    "python3",
                    "generate.py",
                    "--prompt",
                    "minimalist icon",
                    "--model",
                    "not-a-valid-model-id",
                    "--output",
                    str(output),
                ],
                check=False,
                capture_output=True,
                text=True,
            )

            self.assertEqual(result.returncode, 1)
            self.assertEqual(result.stdout, "")
            self.assertIn("Custom model must be a HuggingFace repo id", result.stderr)
            self.assertFalse(output.exists())

    def test_ac05_lint_and_type_checks_pass(self) -> None:
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
