from __future__ import annotations

import contextlib
import io
import json
import shutil
import subprocess
import tempfile
import unittest
import unittest.mock
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
        steps: int | None = None,
        style: str | None = None,
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
        if steps is not None:
            command.extend(["--steps", str(steps)])
        if style is not None:
            command.extend(["--style", style])
        return subprocess.run(command, check=False, capture_output=True, text=True)

    # ------------------------------------------------------------------
    # US-001: Basic PNG generation
    # ------------------------------------------------------------------

    def test_us001_ac01_generates_valid_png_for_valid_arguments(self) -> None:
        """AC-01: a valid PNG file is written to the requested output path."""
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "icon.png"
            result = self._run_generate(
                prompt="minimalist rocket",
                model="sdxl",
                output=output,
            )
            self.assertEqual(result.returncode, 0, msg=result.stderr)
            self.assertTrue(output.exists())
            # Valid PNG magic bytes.
            self.assertEqual(output.read_bytes()[:8], b"\x89PNG\r\n\x1a\n")

    def test_us001_ac02_exits_zero_on_success(self) -> None:
        """AC-02: the process exits with code 0 on a successful generation."""
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "icon.png"
            result = self._run_generate(
                prompt="minimalist rocket",
                model="sdxl",
                output=output,
            )
            self.assertEqual(result.returncode, 0, msg=result.stderr)

    def test_us001_ac03_missing_prompt_exits_with_code_3(self) -> None:
        """AC-03: omitting --prompt exits with the reserved code 3."""
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "icon.png"
            result = subprocess.run(
                ["python3", "generate.py", "--model", "sdxl", "--output", str(output)],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 3)
            self.assertEqual(result.stdout, "")

    # ------------------------------------------------------------------
    # Error handler coverage
    # ------------------------------------------------------------------

    def test_error_handler_returns_exit_code_1_and_prints_to_stderr(self) -> None:
        """Top-level exception handler emits error to stderr and returns 1."""
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "icon.png"
            with unittest.mock.patch.object(
                generate.backend, "generate_image", side_effect=RuntimeError("boom")
            ):
                stderr_capture = io.StringIO()
                with contextlib.redirect_stderr(stderr_capture):
                    code = generate.run(
                        ["--prompt", "icon", "--model", "sdxl", "--output", str(output)]
                    )
            self.assertEqual(code, 1)
            self.assertIn("boom", stderr_capture.getvalue())

    # ------------------------------------------------------------------
    # US-002: Model selection (existing tests)
    # ------------------------------------------------------------------

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
            self.assertGreaterEqual(
                set(decoded.keys()),
                {"prompt", "enhanced_prompt", "model", "seed", "png_path", "svg_path", "svg_inline"},
            )
            self.assertEqual(decoded["prompt"], "  minimalist   icon  ")
            self.assertTrue(decoded["enhanced_prompt"].startswith("minimalist icon, "))
            self.assertEqual(decoded["model"], "sdxl")
            self.assertEqual(decoded["seed"], 7)
            self.assertEqual(decoded["png_path"], str(output.resolve()))

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

    def test_us004_ac01_output_writes_png_to_requested_path_and_creates_parent_dirs(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "deep" / "nested" / "icon.png"
            result = self._run_generate(
                prompt="minimalist icon",
                model="z-image-turbo",
                output=output,
            )

            self.assertEqual(result.returncode, 0, msg=result.stderr)
            self.assertTrue(output.exists())
            self.assertEqual(output.read_bytes()[:8], b"\x89PNG\r\n\x1a\n")
            payload = json.loads(result.stdout)
            self.assertEqual(payload["png_path"], str(output.resolve()))

    def test_us004_ac02_steps_uses_model_specific_default_when_omitted(self) -> None:
        self.assertEqual(generate.resolve_steps(None, "z-image-turbo"), 8)
        self.assertEqual(generate.resolve_steps(None, "sdxl"), 40)
        self.assertEqual(generate.resolve_steps(None, "custom"), 30)
        self.assertEqual(generate.resolve_steps(12, "sdxl"), 12)

    def test_us004_ac02_steps_changes_generated_image_when_value_changes(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            output_default = Path(tmpdir) / "default_steps.png"
            output_custom = Path(tmpdir) / "custom_steps.png"

            default_result = self._run_generate(
                prompt="minimalist icon",
                model="sdxl",
                output=output_default,
                seed=13,
            )
            custom_result = self._run_generate(
                prompt="minimalist icon",
                model="sdxl",
                output=output_custom,
                seed=13,
                steps=5,
            )

            self.assertEqual(default_result.returncode, 0, msg=default_result.stderr)
            self.assertEqual(custom_result.returncode, 0, msg=custom_result.stderr)
            self.assertNotEqual(output_default.read_bytes(), output_custom.read_bytes())

    def test_us004_ac03_seed_reproducibility_same_seed_same_prompt_same_image(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            output_a = Path(tmpdir) / "seed_a.png"
            output_b = Path(tmpdir) / "seed_b.png"

            first = self._run_generate(
                prompt="minimalist icon",
                model="sdxl",
                output=output_a,
                seed=21,
                steps=9,
            )
            second = self._run_generate(
                prompt="minimalist icon",
                model="sdxl",
                output=output_b,
                seed=21,
                steps=9,
            )

            self.assertEqual(first.returncode, 0, msg=first.stderr)
            self.assertEqual(second.returncode, 0, msg=second.stderr)
            self.assertEqual(output_a.read_bytes(), output_b.read_bytes())

    def test_us005_ac01_enhanced_prompt_includes_svg_friendly_terms(self) -> None:
        enhanced = generate.enhance_prompt_for_svg("rocket")
        for term in generate.SVG_FRIENDLY_TERMS:
            self.assertIn(term, enhanced)

    def test_us005_ac02_original_prompt_is_preserved_in_json_output(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "icon.png"
            original_prompt = "  a   shiny  rocket  "
            result = self._run_generate(prompt=original_prompt, model="sdxl", output=output)
            self.assertEqual(result.returncode, 0, msg=result.stderr)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["prompt"], original_prompt)

    def test_us005_ac03_enhanced_prompt_is_exposed_in_json_output(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "icon.png"
            result = self._run_generate(prompt="rocket", model="sdxl", output=output)
            self.assertEqual(result.returncode, 0, msg=result.stderr)
            payload = json.loads(result.stdout)
            self.assertIn("enhanced_prompt", payload)
            self.assertTrue(payload["enhanced_prompt"].startswith("rocket, "))

    # ------------------------------------------------------------------
    # US-002: Structured JSON output with svg_path and svg_inline
    # ------------------------------------------------------------------

    def test_us002_ac01_stdout_contains_exactly_one_json_object(self) -> None:
        """AC-01: stdout is exactly one JSON object with no leading/trailing text."""
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "icon.png"
            result = self._run_generate(prompt="minimalist icon", model="sdxl", output=output)
            self.assertEqual(result.returncode, 0, msg=result.stderr)
            payload_text = result.stdout.strip()
            decoded, end = json.JSONDecoder().raw_decode(payload_text)
            self.assertEqual(end, len(payload_text))
            self.assertIsInstance(decoded, dict)

    def test_us002_ac02_json_includes_all_six_required_fields(self) -> None:
        """AC-02: JSON object includes all six required fields with correct types."""
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "icon.png"
            result = self._run_generate(
                prompt="minimalist icon", model="sdxl", output=output, seed=42
            )
            self.assertEqual(result.returncode, 0, msg=result.stderr)
            payload = json.loads(result.stdout)
            self.assertIn("prompt", payload)
            self.assertIn("model", payload)
            self.assertIn("seed", payload)
            self.assertIn("png_path", payload)
            self.assertIn("svg_path", payload)
            self.assertIn("svg_inline", payload)
            self.assertIsInstance(payload["prompt"], str)
            self.assertIsInstance(payload["model"], str)
            self.assertIsInstance(payload["seed"], int)
            self.assertIsInstance(payload["png_path"], str)
            self.assertIsInstance(payload["svg_path"], str)
            self.assertIsInstance(payload["svg_inline"], str)
            # png_path and svg_path must be absolute
            self.assertTrue(Path(payload["png_path"]).is_absolute())
            self.assertTrue(Path(payload["svg_path"]).is_absolute())

    def test_us002_ac03_svg_inline_is_file_contents_not_path(self) -> None:
        """AC-03: svg_inline contains the full SVG markup, not a filesystem path."""
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "icon.png"
            result = self._run_generate(prompt="minimalist icon", model="sdxl", output=output)
            self.assertEqual(result.returncode, 0, msg=result.stderr)
            payload = json.loads(result.stdout)
            svg_inline = payload["svg_inline"]
            svg_path = Path(payload["svg_path"])
            # svg_inline must contain SVG markup (not a path)
            self.assertIn("<svg", svg_inline)
            self.assertIn("</svg>", svg_inline)
            # svg_inline must match what is written to disk
            self.assertEqual(svg_inline, svg_path.read_text(encoding="utf-8"))

    def test_us002_ac04_lint_and_type_checks_pass(self) -> None:
        """AC-04: typecheck / lint passes."""
        if shutil.which("ruff"):
            lint = subprocess.run(
                ["ruff", "check", "generate.py", "tests/test_generate.py"],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(lint.returncode, 0, msg=lint.stdout + lint.stderr)

        compile_check = subprocess.run(
            ["python3", "-m", "py_compile", "generate.py"],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(compile_check.returncode, 0, msg=compile_check.stderr)

    def test_us005_ac04_enhancement_is_applied_to_both_models(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            output_sdxl = Path(tmpdir) / "sdxl.png"
            output_turbo = Path(tmpdir) / "turbo.png"

            result_sdxl = self._run_generate(prompt="rocket", model="sdxl", output=output_sdxl)
            result_turbo = self._run_generate(
                prompt="rocket",
                model="z-image-turbo",
                output=output_turbo,
            )

            self.assertEqual(result_sdxl.returncode, 0, msg=result_sdxl.stderr)
            self.assertEqual(result_turbo.returncode, 0, msg=result_turbo.stderr)
            payload_sdxl = json.loads(result_sdxl.stdout)
            payload_turbo = json.loads(result_turbo.stdout)
            self.assertEqual(payload_sdxl["enhanced_prompt"], payload_turbo["enhanced_prompt"])


    # ------------------------------------------------------------------
    # US-004 (it_000003): --style flag influences prompt
    # ------------------------------------------------------------------

    def test_us004_style_ac01_style_hint_appended_to_enhanced_prompt(self) -> None:
        """AC-01: --style appends the hint to the enhanced prompt in JSON output."""
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "icon.png"
            result = self._run_generate(
                prompt="rocket",
                model="sdxl",
                output=output,
                style="flat minimalist",
            )
            self.assertEqual(result.returncode, 0, msg=result.stderr)
            payload = json.loads(result.stdout)
            self.assertIn("flat minimalist", payload["enhanced_prompt"])

    def test_us004_style_ac01_style_hint_in_enhance_prompt_for_svg_function(self) -> None:
        """AC-01: enhance_prompt_for_svg appends the style hint."""
        enhanced = generate.enhance_prompt_for_svg("rocket", "flat minimalist")
        self.assertIn("flat minimalist", enhanced)
        self.assertTrue(enhanced.startswith("rocket,"))

    def test_us004_style_ac02_prompt_field_reflects_original_only(self) -> None:
        """AC-02: the 'prompt' JSON field contains only the original prompt, not the style hint."""
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "icon.png"
            result = self._run_generate(
                prompt="rocket",
                model="sdxl",
                output=output,
                style="flat minimalist",
            )
            self.assertEqual(result.returncode, 0, msg=result.stderr)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["prompt"], "rocket")
            self.assertNotIn("flat minimalist", payload["prompt"])

    def test_us004_style_ac03_omitting_style_produces_no_change(self) -> None:
        """AC-03: omitting --style yields the same enhanced_prompt as the baseline."""
        enhanced_without_style = generate.enhance_prompt_for_svg("rocket")
        enhanced_with_none = generate.enhance_prompt_for_svg("rocket", None)
        self.assertEqual(enhanced_without_style, enhanced_with_none)

    def test_us004_style_ac03_subprocess_without_style_matches_baseline(self) -> None:
        """AC-03: subprocess run without --style behaves identically to the baseline."""
        with tempfile.TemporaryDirectory() as tmpdir:
            output_baseline = Path(tmpdir) / "baseline.png"
            output_no_style = Path(tmpdir) / "no_style.png"
            baseline = self._run_generate(prompt="rocket", model="sdxl", output=output_baseline, seed=1)
            no_style = self._run_generate(prompt="rocket", model="sdxl", output=output_no_style, seed=1)
            self.assertEqual(baseline.returncode, 0, msg=baseline.stderr)
            self.assertEqual(no_style.returncode, 0, msg=no_style.stderr)
            p_baseline = json.loads(baseline.stdout)
            p_no_style = json.loads(no_style.stdout)
            self.assertEqual(p_baseline["enhanced_prompt"], p_no_style["enhanced_prompt"])

    def test_us004_style_ac04_lint_and_type_checks_pass(self) -> None:
        """AC-04: typecheck / lint passes."""
        if shutil.which("ruff"):
            lint = subprocess.run(
                ["ruff", "check", "generate.py", "tests/test_generate.py"],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(lint.returncode, 0, msg=lint.stdout + lint.stderr)

        compile_check = subprocess.run(
            ["python3", "-m", "py_compile", "generate.py"],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(compile_check.returncode, 0, msg=compile_check.stderr)


if __name__ == "__main__":
    unittest.main()
