# Project Context

<!-- Created or updated by `nvst create project-context`. Cap: 250 lines. -->

## Conventions
- Naming: snake_case for Python files, functions, variables; kebab-case for CLI flags
- Formatting: `ruff check` for lint (when available); `python3 -m py_compile` for syntax validation
- Git flow: feature branches per iteration (`feature/it_XXXXXX`), merge to `main`
- stdout is reserved exclusively for the JSON result; all logs go to stderr

## Tech Stack
- Language: Python 3.11+ (generate) · Node.js (trace)
- Runtime: CPython 3.x · Node.js
- Frameworks: `diffusers` + `torch` + `accelerate` + `Pillow` for inference; stdlib for stub backend; `imagetracerjs` for SVG tracing
- Package manager: `uv` for Python script groups; `npm` for Node.js script groups
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
- Current state: PNG generation stub + PNG → SVG tracing operational
- Main components: CLI parser, pipeline config resolver, prompt enhancer, PNG writer, SVG tracer

## Modular Structure
- `scripts/generate/` — standalone `uv` project for PNG generation
  - `generate.py`: CLI entry point — arg parsing, pipeline config, prompt enhancement, image generation, JSON output
  - `stub_backend.py`: stdlib-only backend for tests and minimal environments
  - `diffusers_backend.py`: real `diffusers`+`torch` inference backend (auto-selected when available)
  - `pyproject.toml`: `uv` project manifest with all Python dependencies
  - `tests/test_generate.py`: acceptance-criteria test suite for all US-001..US-005
- `scripts/trace/` — standalone `npm` project for PNG → SVG tracing
  - `trace.js`: CLI entry point — accepts PNG path, traces via imagetracerjs, writes SVG, outputs JSON
  - `package.json`: npm project manifest with imagetracerjs dependency
  - `tests/test_trace.js`: acceptance-criteria test suite using Node.js built-in test runner

## Implemented Capabilities
### Iteration 000001
- **US-001** Basic PNG generation — `generate.py --prompt --model --output --steps --seed`; writes valid PNG, exits 0
- **US-002** Model selection — `z-image-turbo`, `sdxl`, HuggingFace repo ID, or local directory path
- **US-003** Structured JSON output — single JSON object on stdout: `prompt`, `enhanced_prompt`, `model`, `seed`, `png_path`
- **US-004** Configurable generation parameters — `--output` (creates parent dirs), `--steps` (model-specific defaults), `--seed` (deterministic via SHA-256)
- **US-005** Prompt sanitization — unconditionally appends SVG-friendly terms; original prompt preserved in `prompt` field

### Iteration 000002
- **US-001** Basic PNG → SVG conversion — `trace.js <path.png>`; reads PNG, traces via imagetracerjs, writes `.svg` alongside input, outputs JSON with `png_path`, `svg_path`, `svg_inline`
- **US-002** Configurable tracing parameters — `--colors <int>`, `--tolerance <float>`, `--scale <float>`; invalid values exit 3
- **US-003** Structured JSON output from trace.js — single JSON object on stdout including `png_path`, `svg_path`, `svg_inline`, `colors`, `tolerance`, `scale`
- **US-004** Documentation update — README, AGENTS.md, and PROJECT_CONTEXT.md updated to reflect iteration 000002 deliverables
