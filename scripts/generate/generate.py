#!/usr/bin/env python3
"""Generate a PNG icon from a text prompt.

Backend selection
-----------------
The script tries to import ``diffusers_backend`` first (requires diffusers,
torch, accelerate, and Pillow). When those libraries are not installed it
falls back automatically to ``stub_backend``, which uses only the standard
library and produces a deterministic solid-colour PNG.

Null seed
---------
When ``--seed`` is not provided the ``seed`` field in the JSON output is
``null``. Downstream consumers must handle both ``null`` and integer values.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

EXIT_SUCCESS = 0
EXIT_GENERATION_ERROR = 1
EXIT_INVALID_ARGUMENTS = 3

DEFAULT_OUTPUT = "./output.png"

# HuggingFace repo IDs: two segments separated by '/'.
# Each segment must start and end with an alphanumeric character
# and may contain alphanumerics, dots, underscores, or hyphens.
# Maximum 96 characters per segment (HuggingFace platform constraint).
HF_REPO_ID_PATTERN = re.compile(
    r"^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,94}[A-Za-z0-9])?/[A-Za-z0-9](?:[A-Za-z0-9._-]{0,94}[A-Za-z0-9])?$"
)
DEFAULT_STEPS_BY_PIPELINE = {"z-image-turbo": 8, "sdxl": 40, "custom": 30}
SVG_FRIENDLY_TERMS = (
    "flat colors",
    "simple shapes",
    "no gradients",
    "solid background",
    "vector art style",
    "clean lines",
    "icon design",
)

# ---------------------------------------------------------------------------
# Backend selection: prefer real diffusers pipeline; fall back to stdlib stub.
# ---------------------------------------------------------------------------
try:
    import diffusers_backend as backend  # type: ignore[import]

    if not backend.DIFFUSERS_AVAILABLE:
        raise ImportError("diffusers/torch not installed")
except ImportError:
    import stub_backend as backend  # type: ignore[no-redef]


@dataclass(frozen=True)
class PipelineConfig:
    model_id: str
    pipeline_name: str


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate a PNG from text prompt")
    parser.add_argument("--prompt", required=True, help="Prompt describing the icon")
    parser.add_argument("--model", required=True, help="Model id to use for generation")
    parser.add_argument(
        "--output",
        default=DEFAULT_OUTPUT,
        help=f"Output PNG path (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument("--steps", type=int, help="Optional diffusion step count")
    parser.add_argument("--seed", type=int, help="Optional seed for reproducibility")
    parser.add_argument("--style", default=None, help="Optional style hint appended to the enhanced prompt")
    return parser


def resolve_steps(steps: int | None, pipeline_name: str) -> int:
    if steps is not None:
        if steps < 1:
            raise ValueError("--steps must be >= 1")
        return steps
    return DEFAULT_STEPS_BY_PIPELINE[pipeline_name]


def load_pipeline_config(model: str) -> PipelineConfig:
    if model == "z-image-turbo":
        return PipelineConfig(model_id=model, pipeline_name="z-image-turbo")
    if model == "sdxl":
        return PipelineConfig(model_id=model, pipeline_name="sdxl")
    return load_custom_pipeline_config(model)


def load_custom_pipeline_config(model: str) -> PipelineConfig:
    candidate_path = Path(model).expanduser()
    if candidate_path.is_dir():
        return PipelineConfig(model_id=str(candidate_path.resolve()), pipeline_name="custom")
    if HF_REPO_ID_PATTERN.match(model):
        return PipelineConfig(model_id=model, pipeline_name="custom")
    raise ValueError(
        "Custom model must be a HuggingFace repo id like 'org/name' or an existing local directory."
    )


def normalize_prompt(prompt: str) -> str:
    return " ".join(prompt.split())


def enhance_prompt_for_svg(prompt: str, style_hint: str | None = None) -> str:
    normalized_prompt = normalize_prompt(prompt)
    svg_terms = ", ".join(SVG_FRIENDLY_TERMS)
    base = f"{normalized_prompt}, {svg_terms}" if normalized_prompt else svg_terms
    if style_hint:
        normalized_style = normalize_prompt(style_hint)
        if normalized_style:
            base = f"{base}, {normalized_style}"
    return base


def write_svg_stub(png_path: Path) -> tuple[Path, str]:
    """Write a minimal stub SVG adjacent to the PNG and return (svg_path, svg_inline)."""
    svg_path = png_path.with_suffix(".svg")
    svg_inline = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">'
        '<rect width="256" height="256" fill="#cccccc"/>'
        "</svg>"
    )
    svg_path.write_text(svg_inline, encoding="utf-8")
    return svg_path, svg_inline


def run(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()

    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        # argparse uses exit code 2 for invalid args; story/PRD reserve 3.
        return EXIT_INVALID_ARGUMENTS if exc.code != 0 else EXIT_SUCCESS

    output_path = Path(args.output)

    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        pipeline = load_pipeline_config(args.model)
        enhanced_prompt = enhance_prompt_for_svg(args.prompt, args.style)
        effective_steps = resolve_steps(args.steps, pipeline.pipeline_name)
        image = backend.generate_image(enhanced_prompt, pipeline, effective_steps, args.seed)
        image.save(output_path)
        svg_path, svg_inline = write_svg_stub(output_path)
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return EXIT_GENERATION_ERROR

    result = {
        "prompt": args.prompt,
        "enhanced_prompt": enhanced_prompt,
        "model": args.model,
        "seed": args.seed,  # null in JSON when --seed is not supplied
        "png_path": str(output_path.resolve()),
        "svg_path": str(svg_path.resolve()),
        "svg_inline": svg_inline,
    }
    print(json.dumps(result, separators=(",", ":")))
    return EXIT_SUCCESS


def main() -> None:
    code = run()
    raise SystemExit(code)


if __name__ == "__main__":
    main()
