"""Real diffusers + torch image backend.

Exposes the same generate_image interface as stub_backend so that
generate.py can swap backends transparently.

Requires: diffusers, torch, accelerate, Pillow.
Import this module only after verifying DIFFUSERS_AVAILABLE is True, or
catch ImportError at the call site.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from generate import PipelineConfig

try:
    import torch
    from diffusers import AutoPipelineForText2Image, StableDiffusionXLPipeline, ZImagePipeline
    from PIL.Image import Image as PILImage

    DIFFUSERS_AVAILABLE = True
except ImportError:  # pragma: no cover
    DIFFUSERS_AVAILABLE = False


_PIPELINE_CACHE: dict[str, object] = {}

_MODEL_REPO_BY_PIPELINE = {
    "z-image-turbo": "Tongyi-MAI/Z-Image-Turbo",
    "sdxl": "stabilityai/stable-diffusion-xl-base-1.0",
}

# Inference defaults per pipeline.
# Z-Image-Turbo uses 9 steps (= 8 DiT forwards / NFEs) and guidance_scale=0.
_INFERENCE_DEFAULTS: dict[str, dict[str, object]] = {
    "z-image-turbo": {"num_inference_steps": 9, "guidance_scale": 0.0},
    "sdxl": {"num_inference_steps": 40, "guidance_scale": 7.5},
    "custom": {"num_inference_steps": 30, "guidance_scale": 7.5},
}


def _load_pipeline(pipeline_config: PipelineConfig) -> object:
    """Load (and cache) the diffusers pipeline for the given config."""
    cache_key = pipeline_config.model_id
    if cache_key in _PIPELINE_CACHE:
        return _PIPELINE_CACHE[cache_key]

    repo_or_path = _MODEL_REPO_BY_PIPELINE.get(pipeline_config.pipeline_name, pipeline_config.model_id)

    device = "cuda" if torch.cuda.is_available() else "cpu"

    if pipeline_config.pipeline_name == "z-image-turbo":
        # ZImagePipeline requires bfloat16 and low_cpu_mem_usage=True per model card.
        pipe = ZImagePipeline.from_pretrained(
            repo_or_path,
            torch_dtype=torch.bfloat16,
            low_cpu_mem_usage=True,
        )
    elif pipeline_config.pipeline_name == "sdxl":
        dtype = torch.float16 if device == "cuda" else torch.float32
        pipe = StableDiffusionXLPipeline.from_pretrained(
            repo_or_path, torch_dtype=dtype, variant="fp16" if dtype == torch.float16 else None
        )
    else:
        # Custom model: HF repo ID or local directory path.
        dtype = torch.float16 if device == "cuda" else torch.float32
        pipe = AutoPipelineForText2Image.from_pretrained(repo_or_path, torch_dtype=dtype)

    # Memory optimizations: applied in order from cheapest to most aggressive.
    # enable_attention_slicing reduces peak VRAM by processing attention in chunks.
    pipe.enable_attention_slicing()

    # Offload pipeline components to CPU between steps; requires accelerate.
    # Must be enabled before moving the pipeline to CUDA to have effect.
    if device == "cuda":
        try:
            pipe.enable_sequential_cpu_offload()
        except Exception:  # pragma: no cover
            pipe = pipe.to(device)
    else:
        pipe = pipe.to(device)
 
    _PIPELINE_CACHE[cache_key] = pipe
    return pipe


def generate_image(
    enhanced_prompt: str,
    pipeline_config: PipelineConfig,
    steps: int,
    seed: int | None,
) -> PILImage:
    """Generate an image using the diffusers pipeline.

    Args:
        enhanced_prompt: SVG-optimised prompt string.
        pipeline_config: Resolved pipeline name and model identifier.
        steps: Number of diffusion steps.
        seed: Optional RNG seed for reproducibility; None means random.

    Returns:
        A PIL.Image.Image in RGB mode.
    """
    pipe = _load_pipeline(pipeline_config)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    generator = None
    if seed is not None:
        generator = torch.Generator(device=device).manual_seed(seed)

    defaults = _INFERENCE_DEFAULTS.get(pipeline_config.pipeline_name, _INFERENCE_DEFAULTS["custom"])

    result = pipe(
        prompt=enhanced_prompt,
        height=1024,
        width=1024,
        num_inference_steps=steps,
        guidance_scale=defaults["guidance_scale"],
        generator=generator,
    )
    return result.images[0]
