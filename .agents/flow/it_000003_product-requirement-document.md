# Requirement: Unified CLI Orchestrator (`zikon`)

## Context
Currently the pipeline requires two manual steps: run `generate.py` to produce a PNG, then a separate tracer script to convert it to SVG. This friction affects both developers and AI agents that need to invoke the full pipeline in one call. Iteration 3 introduces a single `zikon` command that chains both steps, enforces structured JSON output, and exposes a clean commander.js-backed interface with predictable exit codes.

## Goals
- Reduce the full pipeline to a single command invocation for humans and agents alike.
- Guarantee a machine-readable JSON object on stdout so downstream agents can parse results without shell scripting.
- Provide built-in argument validation with auto-generated `--help` output via commander.js.

## User Stories

### US-001: End-to-end pipeline in one command
**As a** developer or AI agent, **I want** to run `node zikon.js "<prompt>" [--model] [--output-dir] [--seed] [--style]` **so that** I receive a PNG, an SVG, and a JSON metadata object without invoking two scripts manually.

**Acceptance Criteria:**
- [ ] Running `node zikon.js "app logo" --model z-image-turbo --output-dir ./out` exits 0.
- [ ] A valid PNG file is written to `--output-dir`.
- [ ] A valid, well-formed SVG file is written to `--output-dir` (same base name as PNG).
- [ ] A single JSON object is printed to stdout containing: `prompt`, `model`, `seed`, `png_path`, `svg_path`, `svg_inline`.
- [ ] Nothing other than the final JSON is written to stdout; all progress/debug output goes to stderr.
- [ ] Visually verified in browser: the SVG renders without errors.
- [ ] Typecheck / lint passes.

### US-002: Structured JSON output
**As an** AI agent, **I want** the JSON on stdout to always follow the same schema **so that** I can parse it with a single `JSON.parse()` call.

**Acceptance Criteria:**
- [ ] stdout contains exactly one JSON object (no leading/trailing text).
- [ ] The object includes all six fields: `prompt` (string), `model` (string), `seed` (integer), `png_path` (absolute path string), `svg_path` (absolute path string), `svg_inline` (SVG markup string).
- [ ] `svg_inline` is the full SVG file contents as a string (not a path).
- [ ] Typecheck / lint passes.

### US-003: Exit codes for error conditions
**As an** AI agent, **I want** predictable exit codes **so that** I can distinguish argument errors from pipeline failures without parsing stderr.

**Acceptance Criteria:**
- [ ] Exit `0` on success.
- [ ] Exit `1` on PNG generation error (subprocess `generate.py` fails).
- [ ] Exit `2` on SVG tracing error (tracer subprocess fails).
- [ ] Exit `3` on invalid or missing arguments (e.g., missing `<prompt>`, unrecognised `--model`).
- [ ] On exit `3`, commander.js prints the help text to stderr before exiting.
- [ ] Typecheck / lint passes.

### US-004: `--style` flag influences prompt
**As a** developer, **I want** to pass `--style <hint>` **so that** the style hint is appended to the prompt before it reaches `generate.py`.

**Acceptance Criteria:**
- [ ] Running with `--style "flat minimalist"` appends the style hint to the enhanced prompt forwarded to `generate.py`.
- [ ] The `prompt` field in JSON output reflects the original prompt only; the style-augmented string is used internally.
- [ ] Omitting `--style` produces no change in behaviour vs. the current pipeline.
- [ ] Typecheck / lint passes.

### US-005: Documentation updated to reflect the unified CLI
**As a** developer or AI agent reading the project docs, **I want** `README.md`, `AGENTS.md`, and `.agents/PROJECT_CONTEXT.md` to describe the `zikon` CLI **so that** I know how to invoke the full pipeline without reading source code.

**Acceptance Criteria:**
- [ ] `README.md` includes a usage example: `node cli/zikon.js "<prompt>" --model <model> --output-dir <path>` with the expected JSON output schema.
- [ ] `AGENTS.md` — Script layout table updated to include `cli/` row; CLI interface section updated to show the unified command and its flags.
- [ ] `AGENTS.md` — Output JSON example updated to show all six fields (`prompt`, `model`, `seed`, `png_path`, `svg_path`, `svg_inline`).
- [ ] `.agents/PROJECT_CONTEXT.md` — Modular structure section updated to document `cli/zikon.js` and `cli/package.json`; Implemented Capabilities section updated to list Iteration 3 stories.
- [ ] No doc change introduces outdated invocation examples (e.g., references to `scripts/orchestrate/`).
- [ ] Typecheck / lint passes.

## Functional Requirements
- **FR-1:** The orchestrator lives at `cli/zikon.js` with its own `package.json` listing `commander` as a dependency.
- **FR-2:** Use `commander` v14. Define the CLI with `program.argument('<prompt>', 'text description of the icon')`. Options: `--model <model>` (default `z-image-turbo`), `--output-dir <path>` (default `./output`), `--seed <number>` (optional integer), `--style <hint>` (optional string).
- **FR-3:** Use `program.exitOverride()` so that commander errors (missing required arg, unknown option) are caught and re-thrown with `process.exit(3)` after printing help to stderr (`program.help()` or the built-in error message).
- **FR-4:** The orchestrator spawns `generate.py` as a child process via `child_process.spawnSync` (or `execFileSync`). It captures the JSON from stdout and propagates stderr to its own stderr. If the subprocess exits non-zero, the orchestrator exits `1`.
- **FR-5:** The orchestrator spawns the tracer script as a child process, passing the PNG path from step FR-4. If the subprocess exits non-zero, the orchestrator exits `2`.
- **FR-6:** `svg_inline` is read from the written SVG file and embedded as a string in the final JSON.
- **FR-7:** The final JSON is written with `process.stdout.write(JSON.stringify(result) + '\n')`. No `console.log` or other writes to stdout anywhere in the orchestrator.
- **FR-8:** `--output-dir` is created if it does not exist (using `fs.mkdirSync` with `{ recursive: true }`).
- **FR-9:** All model identifiers accepted by `generate.py` (`z-image-turbo`, `sdxl`, or any HuggingFace repo ID) are passed through without validation in the orchestrator — `generate.py` is the source of truth for valid models (exit `1` handles invalid model errors).
- **FR-10:** After a successful run, update `README.md` to include the `cli/zikon.js` usage example and the output JSON schema.
- **FR-11:** Update `AGENTS.md`: add `cli/` to the Script layout table, replace the planned unified CLI section with the actual command signature, and update the output JSON example to show all six fields.
- **FR-12:** Update `.agents/PROJECT_CONTEXT.md`: add `cli/zikon.js` and `cli/package.json` to the Modular Structure section; append Iteration 3 implemented capabilities (US-001 through US-005).

## Non-Goals (Out of Scope)
- No daemon mode, watch mode, or HTTP server.
- No changes to `generate.py` or the tracer script internals.
- No global `zikon` binary / PATH installation — invoked as `node cli/zikon.js` for now (Iteration 4 handles the installable skill).
- No streaming or partial JSON output.
- No interactive prompts.

## Open Questions
- None.
