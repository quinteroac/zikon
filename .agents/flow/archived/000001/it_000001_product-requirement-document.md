# Requirement: Python Image Generation Pipeline (`generate.py`)

## Context

This is iteration 1 of the logo-creator pipeline. The goal is to build `generate.py`, a Python script that receives a text prompt, enhances it for SVG-friendly output, and generates a PNG using the `diffusers` library — all locally with no external API calls. The script must be usable both by AI agents (as a subprocess) and by developers from the terminal.

## Goals

- Provide a reliable CLI entry point for PNG generation from a text prompt.
- Ensure generated images have characteristics suitable for downstream SVG tracing (flat colors, simple shapes, no gradients).
- Emit structured JSON on stdout so agents can parse results programmatically.
- Run fully offline using local model inference via `diffusers` + `torch`.

## User Stories

### US-001: Basic PNG generation

**As a** developer or AI agent, **I want** to run `python generate.py --prompt "minimalist icon" --model sdxl` **so that** I receive a valid PNG file at the specified output path.

**Acceptance Criteria:**
- [ ] Script accepts `--prompt` (required), `--model` (required), `--output` (optional, defaults to `./output.png`), `--steps` (optional), `--seed` (optional).
- [ ] A valid PNG file is written to the output path on success.
- [ ] Exit code is `0` on success.
- [ ] Typecheck / lint passes.

---

### US-002: Model selection

**As a** developer or AI agent, **I want** to choose between `z-image-turbo` (quality) and `sdxl` (fast, low memory) **so that** I can trade off output quality vs. resource usage depending on the context.

**Acceptance Criteria:**
- [ ] `--model z-image-turbo` uses the z-image-turbo pipeline (higher quality output).
- [ ] `--model sdxl` uses the SDXL pipeline (faster, lower memory usage).
- [ ] `--model <huggingface-repo-or-path>` loads any custom model compatible with the diffusers pipeline, specified as a HuggingFace repo ID (e.g. `myorg/my-model`) or a local directory path.
- [ ] If the custom model fails to load, the script exits with code `1` and prints the error to stderr.
- [ ] Typecheck / lint passes.

---

### US-003: Structured JSON output

**As an** AI agent, **I want** the script to print a JSON object to stdout **so that** I can parse the result programmatically without screen-scraping.

**Acceptance Criteria:**
- [ ] On success, stdout contains exactly one valid JSON object with fields: `prompt` (original), `enhanced_prompt` (sanitized), `model`, `seed`, `png_path`.
- [ ] No other text is printed to stdout (logs go to stderr).
- [ ] The JSON is parseable with `json.loads()` without error.
- [ ] Typecheck / lint passes.

---

### US-004: Configurable generation parameters

**As a** developer, **I want** to control `--output`, `--steps`, and `--seed` **so that** I can reproduce results and direct output to a specific path.

**Acceptance Criteria:**
- [ ] `--output <path>` writes the PNG to the given path (creates parent directories if needed).
- [ ] `--steps <int>` sets the number of diffusion steps (falls back to a sensible model-specific default if omitted).
- [ ] `--seed <int>` makes generation reproducible; same seed + same prompt produces the same image.
- [ ] Typecheck / lint passes.

---

### US-005: Prompt sanitization for SVG output

**As a** developer or AI agent, **I want** the script to automatically enhance the prompt with SVG-friendly descriptors **so that** the generated PNG is easier to vectorize downstream.

**Acceptance Criteria:**
- [ ] Before generation, the script appends (or prepends) terms such as: `flat colors`, `simple shapes`, `no gradients`, `solid background`, `vector art style`, `clean lines`, `icon design` (or equivalent).
- [ ] The original prompt is preserved as-is in the `prompt` field of the JSON output.
- [ ] The enhanced prompt is exposed in the `enhanced_prompt` field of the JSON output.
- [ ] Enhancement is applied to both models.
- [ ] Typecheck / lint passes.

---

## Functional Requirements

- **FR-1:** Script is invoked as `python generate.py <args>` with no required setup beyond the Python environment.
- **FR-2:** All inference runs locally via `diffusers` + `torch`; no external HTTP calls are made.
- **FR-3:** The script supports built-in `--model` values `z-image-turbo` and `sdxl`, and also accepts a HuggingFace repo ID or a local directory path pointing to a diffusers-compatible model. LoRA checkpoints are not supported. Invalid arguments (e.g. missing `--prompt`) exit with code `3`; an unrecognized model string is treated as a custom model and attempted.
- **FR-4:** stdout is reserved exclusively for the JSON result; all informational logging goes to stderr.
- **FR-5:** The prompt enhancement step (US-005) is unconditional and always applied before generation.
- **FR-6:** On any generation error, the script exits with code `1` and prints the error to stderr.
- **FR-7:** On invalid arguments, the script exits with code `3` and prints usage to stderr.

## Non-Goals (Out of Scope)

- SVG conversion (covered in iteration 2).
- Unified CLI orchestrator (covered in iteration 3).
- Batch processing of multiple prompts.
- Fine-tuning or training models.
- Any external API integration.
- Web UI or interactive mode.

## Open Questions

- None.

## Test Plan

**Smoke test (manual/CI):**
```bash
python generate.py --prompt "minimalist app icon" --model z-image-turbo --output /tmp/test_icon.png
# Must exit 0, print valid JSON, and produce a readable PNG at /tmp/test_icon.png
```

**Automated tests (pytest):**
- Test that JSON output schema is correct for both models.
- Test that `--seed` produces reproducible outputs.
- Test that an invalid `--model` exits with code `3`.
- Test that `enhanced_prompt` contains SVG-friendly terms.
- Test that stdout contains only JSON (no stray print statements).
