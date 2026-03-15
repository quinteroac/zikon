# Project Context

<!-- Created or updated by `nvst create project-context`. Cap: 250 lines. -->

## Conventions
- Naming: snake_case for Python files, functions, variables; kebab-case for CLI flags
- Formatting: `ruff check` for lint (when available); `python3 -m py_compile` for syntax validation
- Git flow: feature branches per iteration (`feature/it_XXXXXX`), merge to `main`
- stdout is reserved exclusively for the JSON result; all logs go to stderr

## Tech Stack
- Language: Python 3.11+
- Runtime: CPython 3.x
- Frameworks: `diffusers` + `torch` + `accelerate` + `Pillow` for inference; stdlib for stub backend
- Future: `imagetracerjs` (Node.js) for SVG tracing
- Package manager: `uv` — each script group has its own `pyproject.toml`
- Build / tooling: `ruff` (lint), `python3 -m py_compile` (syntax check)

## Code Standards
- Style patterns: dataclasses for config objects, typed signatures throughout
- Error handling: invalid args → exit 3; generation errors → exit 1; success → exit 0
- Module organisation: scripts grouped under `scripts/<name>/`; each group is a standalone `uv` project with its own `pyproject.toml`
- Forbidden patterns: no print() to stdout except final JSON result

## Testing Strategy
- Approach: code-first, tests after (tests written alongside implementation)
- Runner: `uv run python -m unittest discover -s tests` (run from the script's directory)
- Coverage targets: all acceptance criteria covered by named test methods
- Test location: `tests/test_generate.py` inside each script group; tests import the script directly + subprocess calls

## Product Architecture
- Pipeline: `prompt → generate.py (diffusers) → PNG → trace.js (imagetracerjs) → SVG + JSON`
- Current state: PNG generation stub (solid-color PNG derived from SHA-256 hash of inputs)
- Main components: CLI parser, pipeline config resolver, prompt enhancer, PNG writer

## Modular Structure
- `scripts/generate/` — standalone `uv` project for PNG generation
  - `generate.py`: CLI entry point — arg parsing, pipeline config, prompt enhancement, image generation, JSON output
  - `stub_backend.py`: stdlib-only backend for tests and minimal environments
  - `diffusers_backend.py`: real `diffusers`+`torch` inference backend (auto-selected when available)
  - `pyproject.toml`: `uv` project manifest with all Python dependencies
  - `tests/test_generate.py`: acceptance-criteria test suite for all US-001..US-005

## Implemented Capabilities
### Iteration 000001
- **US-001** Basic PNG generation — `generate.py --prompt --model --output --steps --seed`; writes valid PNG, exits 0
- **US-002** Model selection — `z-image-turbo`, `sdxl`, HuggingFace repo ID, or local directory path
- **US-003** Structured JSON output — single JSON object on stdout: `prompt`, `enhanced_prompt`, `model`, `seed`, `png_path`
- **US-004** Configurable generation parameters — `--output` (creates parent dirs), `--steps` (model-specific defaults), `--seed` (deterministic via SHA-256)
- **US-005** Prompt sanitization — unconditionally appends SVG-friendly terms; original prompt preserved in `prompt` field
