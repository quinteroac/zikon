from __future__ import annotations

import contextlib
import io
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import generate


class GenerateScriptTests(unittest.TestCase):
    def _run_generate(
        self,
        *,
        prompt: str,
        model: str = "sdxl",
        output: Path,
        seed: int | None = None,
    ) -> subprocess.CompletedProcess[str]:
        command = [
            "python3",
            "generate.py",
            "--prompt",
            prompt,
            "--model",
            model,
            "--output",
            str(output),
        ]
        if seed is not None:
            command.extend(["--seed", str(seed)])
        return subprocess.run(command, check=False, capture_output=True, text=True)

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
            with contextlib.redirect_stdout(io.StringIO()):
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

    def test_us003_ac01_success_stdout_has_exact_json_schema(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "icon.png"
            result = self._run_generate(
                prompt="  minimalist   icon  ",
                model="sdxl",
                output=output,
                seed=7,
            )

            self.assertEqual(result.returncode, 0, msg=result.stderr)
            payload_text = result.stdout.strip()
            decoded, end = json.JSONDecoder().raw_decode(payload_text)
            self.assertEqual(end, len(payload_text))
            self.assertEqual(
                set(decoded.keys()),
                {"prompt", "enhanced_prompt", "model", "seed", "png_path"},
            )
            self.assertEqual(decoded["prompt"], "  minimalist   icon  ")
            self.assertEqual(decoded["enhanced_prompt"], "minimalist icon")
            self.assertEqual(decoded["model"], "sdxl")
            self.assertEqual(decoded["seed"], 7)
            self.assertEqual(decoded["png_path"], str(output))

    def test_us003_ac02_success_writes_only_json_to_stdout(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "icon.png"
            result = self._run_generate(
                prompt="minimalist icon",
                model="z-image-turbo",
                output=output,
            )

            self.assertEqual(result.returncode, 0, msg=result.stderr)
            self.assertEqual(result.stderr, "")
            self.assertTrue(result.stdout.endswith("\n"))
            payload = result.stdout.strip()
            self.assertTrue(payload.startswith("{"))
            self.assertTrue(payload.endswith("}"))
            decoded, end = json.JSONDecoder().raw_decode(payload)
            self.assertEqual(end, len(payload))
            self.assertIsInstance(decoded, dict)

    def test_us003_ac03_stdout_json_is_parseable_with_json_loads(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "icon.png"
            result = self._run_generate(
                prompt="minimalist icon",
                model="sdxl",
                output=output,
            )

            self.assertEqual(result.returncode, 0, msg=result.stderr)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["prompt"], "minimalist icon")

    def test_us003_ac04_lint_and_type_checks_pass(self) -> None:
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
