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
- Package manager: `uv` for Python (each script group has its own `pyproject.toml`); `npm`/`pnpm` for Node.js runtime deps; Bun is the cross-platform build target for packaging
- Build / tooling: `ruff` (lint), `python3 -m py_compile` (syntax check), `node --check` (JS syntax check), Bun for distributable builds

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
- Orchestration: `node cli/zikon.js` chains both steps and emits the final JSON; `node cli/zikon.js install` installs a self-contained runtime
- Current state: PNG generation uses stub backend (solid-color PNG derived from SHA-256 hash); SVG is traced via imagetracerjs
- Main components: unified CLI (`cli/zikon.js`), installer flow, Python PNG generator, imagetracerjs SVG tracer

## Modular Structure
- `cli/zikon.js` — Node.js unified CLI orchestrator (commander); chains generate.py → imagetracerjs; emits final JSON; supports `install` mode with `--installation-path`
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

### Iteration 000004
- **US-001** Installer entry point — `node cli/zikon.js install [--installation-path <path>]`; installs into `~/.zikon` by default or a caller-provided path
- **US-002** Runtime setup — installer copies `cli/`, `scripts/generate/`, and `scripts/trace/`; runs `uv sync`; installs PyTorch backend based on detected GPU; installs Node dependencies for CLI and tracer
- **US-003** Executable layout — installation creates `bin/zikon` on Unix-like systems or `bin/zikon.cmd` on Windows so the command can be run outside the repository
- **US-004** Shell integration — Unix install updates `~/.bashrc` and `~/.zshrc` idempotently; Windows install prints manual PATH instructions
- **US-005** Documentation — `README.md`, `AGENTS.md`, and `.agents/PROJECT_CONTEXT.md` document installation, custom installation paths, and post-install usage

### Iteration 000005
- **US-001** Skill entry point — `zikon-skills/index.js` exports a `run(params)` function that shells out to `node cli/zikon.js` (or the installed `zikon` shim) and returns parsed JSON
- **US-002** Installation via Vercel Labs skills tooling — `npx skills add https://github.com/quinteroac/zikon/zikon-skills` installs the skill; `package.json` declares `name: "zikon"` and the `main` entry point
- **US-003** Agent invocation returns usable SVG — `/zikon "<prompt>"` runs the full pipeline and surfaces `svg_inline` directly in the agent context
- **US-004** Documentation — `README.md` has a "Skills" section with install URL and `/zikon` syntax; `AGENTS.md` references `zikon-skills/SKILL.md` and invocation pattern; `.agents/PROJECT_CONTEXT.md` lists skill under Implemented Capabilities for iteration 000005

### Iteration 000006
- **US-001** Multi-size SVG output — unified CLI accepts `--size <px>[,<px>...]`; PNG remains 1024x1024, tracing runs once, and one SVG is emitted per requested size
- **US-002** Updated JSON contract — output includes `svg_files` (`size`, `svg_path`, `svg_inline`); single-size keeps top-level `svg_path`/`svg_inline`, multi-size sets both to `null`
- **US-003** SVG optimization dependency — `cli/package.json` declares `svgo`; `cli/zikon.js` optimizes SVG markup via the Node API (no shell `svgo` subprocess)
- **US-004** Skill size support — `zikon-skills/index.js` accepts `size`, forwards `--size` to CLI, and returns multi-size `svg_files` in agent responses
- **US-005** Documentation update — `README.md` usage and `AGENTS.md` CLI interface document `--size`, including `--size 512,24,18` examples

## Installation Notes
- Default install directory: `~/.zikon` on Unix-like systems; `%USERPROFILE%\\.zikon` on Windows
- Custom install directory: use `--installation-path <path>`
- Required tools detected before install: `bun`, `node`, `uv`, and either `npm` or `pnpm`
- Bun is the distribution/build target for this iteration; repository-local development still runs through `node cli/zikon.js`
