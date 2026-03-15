#!/usr/bin/env python3
"""Generate a PNG icon from a text prompt.

This iteration keeps generation dependency-free so the CLI remains usable in
minimal environments. The output is a valid PNG and deterministic for the same
prompt/model/seed tuple.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
import sys
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

EXIT_SUCCESS = 0
EXIT_GENERATION_ERROR = 1
EXIT_INVALID_ARGUMENTS = 3

DEFAULT_OUTPUT = "./output.png"
HF_REPO_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*$")
DEFAULT_STEPS_BY_PIPELINE = {"z-image-turbo": 8, "sdxl": 40, "custom": 30}


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
    return parser


def _chunk(chunk_type: bytes, payload: bytes) -> bytes:
    return (
        struct.pack(">I", len(payload))
        + chunk_type
        + payload
        + struct.pack(">I", zlib.crc32(chunk_type + payload) & 0xFFFFFFFF)
    )


def write_png(path: Path, rgb: tuple[int, int, int], width: int = 256, height: int = 256) -> None:
    """Write a valid 8-bit RGB PNG without external dependencies."""
    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)

    row = bytes([0]) + bytes(rgb) * width
    raw_image = row * height
    idat = zlib.compress(raw_image, level=9)

    png = signature + _chunk(b"IHDR", ihdr) + _chunk(b"IDAT", idat) + _chunk(b"IEND", b"")
    path.write_bytes(png)


def resolve_steps(steps: int | None, pipeline_name: str) -> int:
    if steps is not None:
        if steps < 1:
            raise ValueError("--steps must be >= 1")
        return steps
    return DEFAULT_STEPS_BY_PIPELINE[pipeline_name]


def seed_to_color(prompt: str, model: str, seed: int | None, steps: int) -> tuple[int, int, int]:
    material = f"{prompt}|{model}|{seed if seed is not None else 'none'}|{steps}".encode("utf-8")
    digest = hashlib.sha256(material).digest()
    return digest[0], digest[1], digest[2]


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


def sanitize_prompt(prompt: str) -> str:
    return " ".join(prompt.split())


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
        enhanced_prompt = sanitize_prompt(args.prompt)
        effective_steps = resolve_steps(args.steps, pipeline.pipeline_name)
        color = seed_to_color(enhanced_prompt, pipeline.model_id, args.seed, effective_steps)
        write_png(output_path, color)
    except Exception as exc:  # pragma: no cover - defensive top-level handler
        print(str(exc), file=sys.stderr)
        return EXIT_GENERATION_ERROR

    result = {
        "prompt": args.prompt,
        "enhanced_prompt": enhanced_prompt,
        "model": args.model,
        "seed": args.seed,
        "png_path": str(output_path),
    }
    print(json.dumps(result, separators=(",", ":")))
    return EXIT_SUCCESS


def main() -> None:
    code = run()
    raise SystemExit(code)


if __name__ == "__main__":
    main()
