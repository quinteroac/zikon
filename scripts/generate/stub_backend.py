"""Stub image backend for unit tests and minimal environments without torch.

Produces a deterministic solid-color PNG using only the standard library,
preserving the same generate_image interface as diffusers_backend.
"""
from __future__ import annotations

import hashlib
import struct
import zlib
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from generate import PipelineConfig


DEFAULT_IMAGE_SIZE = 1024


class StubImage:
    """Duck-typed image object with a PIL-compatible save() interface."""

    def __init__(self, rgb: tuple[int, int, int], width: int = DEFAULT_IMAGE_SIZE, height: int = DEFAULT_IMAGE_SIZE) -> None:
        self.rgb = rgb
        self.width = width
        self.height = height

    def save(self, path: str | Path, **kwargs: object) -> None:
        _write_png(Path(path), self.rgb, self.width, self.height)


def _chunk(chunk_type: bytes, payload: bytes) -> bytes:
    return (
        struct.pack(">I", len(payload))
        + chunk_type
        + payload
        + struct.pack(">I", zlib.crc32(chunk_type + payload) & 0xFFFFFFFF)
    )


def _write_png(
    path: Path,
    rgb: tuple[int, int, int],
    width: int = DEFAULT_IMAGE_SIZE,
    height: int = DEFAULT_IMAGE_SIZE,
) -> None:
    """Write a valid 8-bit RGB PNG without external dependencies."""
    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)

    row = bytes([0]) + bytes(rgb) * width
    raw_image = row * height
    idat = zlib.compress(raw_image, level=9)

    png = signature + _chunk(b"IHDR", ihdr) + _chunk(b"IDAT", idat) + _chunk(b"IEND", b"")
    path.write_bytes(png)


def generate_image(
    enhanced_prompt: str,
    pipeline_config: PipelineConfig,
    steps: int,
    seed: int | None,
) -> StubImage:
    """Generate a deterministic solid-color stub image (no torch required).

    The colour is derived from a SHA-256 hash of the input parameters so that
    identical inputs always produce identical outputs.
    """
    material = f"{enhanced_prompt}|{pipeline_config.model_id}|{seed if seed is not None else 'none'}|{steps}".encode("utf-8")
    digest = hashlib.sha256(material).digest()
    rgb: tuple[int, int, int] = (digest[0], digest[1], digest[2])
    return StubImage(rgb)
