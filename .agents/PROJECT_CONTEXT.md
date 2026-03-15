# Project Context

<!-- Created or updated by `nvst create project-context`. Cap: 250 lines. -->

## Conventions
- Naming: snake_case for Python files, functions, variables; kebab-case for CLI flags
- Formatting: `ruff check` for lint (when available); `python3 -m py_compile` for syntax validation
- Git flow: feature branches per iteration (`feature/it_XXXXXX`), merge to `main`
- stdout is reserved exclusively for the JSON result; all logs go to stderr

## Tech Stack
- Language: Python 3.11+ (generation) + Node.js (tracing, orchestration)
- Runtime: CPython 3.x; Node.js (LTS)
- Frameworks: `diffusers` + `torch` + `accelerate` + `Pillow` for inference; stdlib for stub backend; `imagetracerjs` for SVG tracing; `commander` for CLI
- Package manager: `uv` for Python (each script group has its own `pyproject.toml`); `npm` for Node.js (`package.json` at project root)
- Build / tooling: `ruff` (lint), `python3 -m py_compile` (syntax check), `node --check` (JS syntax check)

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
- Pipeline: `prompt → generate.py (diffusers) → PNG → imagetracerjs → SVG + JSON`
- Orchestration: `node cli/zikon.js` chains both steps and emits the final JSON
- Current state: PNG generation uses stub backend (solid-color PNG derived from SHA-256 hash); SVG is traced via imagetracerjs
- Main components: unified CLI (`cli/zikon.js`), Python PNG generator, imagetracerjs SVG tracer

## Modular Structure
- `cli/zikon.js` — Node.js unified CLI orchestrator (commander); chains generate.py → imagetracerjs; emits final JSON
- `cli/package.json` — Node.js project manifest; lists `commander` v14 as dependency
- `tests/test_zikon.js` — acceptance-criteria test suite for iteration 3 (US-001..US-005)
- `scripts/generate/` — standalone `uv` project for PNG generation
  - `generate.py`: CLI entry point — arg parsing, pipeline config, prompt enhancement, image generation, JSON output
  - `stub_backend.py`: stdlib-only backend for tests and minimal environments
  - `diffusers_backend.py`: real `diffusers`+`torch` inference backend (auto-selected when available)
  - `pyproject.toml`: `uv` project manifest with all Python dependencies
  - `tests/test_generate.py`: acceptance-criteria test suite for iteration 1 (US-001..US-005)
- `scripts/trace/` — Node.js tracing utilities using `imagetracerjs`

## Implemented Capabilities
### Iteration 000001
- **US-001** Basic PNG generation — `generate.py --prompt --model --output --steps --seed`; writes valid PNG, exits 0
- **US-002** Model selection — `z-image-turbo`, `sdxl`, HuggingFace repo ID, or local directory path
- **US-003** Structured JSON output — single JSON object on stdout: `prompt`, `enhanced_prompt`, `model`, `seed`, `png_path`
- **US-004** Configurable generation parameters — `--output` (creates parent dirs), `--steps` (model-specific defaults), `--seed` (deterministic via SHA-256)
- **US-005** Prompt sanitization — unconditionally appends SVG-friendly terms; original prompt preserved in `prompt` field

### Iteration 000003
- **US-001** End-to-end pipeline — `node zikon.js "<prompt>" [--model] [--output-dir] [--seed] [--style]`; writes PNG + SVG, emits JSON, exits 0
- **US-002** Structured JSON output — stdout contains exactly one JSON object with six fields: `prompt`, `model`, `seed`, `png_path`, `svg_path`, `svg_inline`
- **US-003** Exit codes — `0` success · `1` PNG generation error · `2` SVG tracing error · `3` invalid/missing arguments
- **US-004** `--style` flag — appends style hint to prompt forwarded to `generate.py`; original `prompt` field unaffected
- **US-005** Documentation — `README.md`, `AGENTS.md`, and `.agents/PROJECT_CONTEXT.md` updated to reflect the unified CLI
