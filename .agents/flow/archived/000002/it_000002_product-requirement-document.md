# Requirement: PNG → SVG Tracing Script

## Context

The Zikon pipeline currently stops at PNG generation (`scripts/generate/`). This iteration adds the next stage: converting a PNG into a vector SVG using `imagetracerjs`. The output script must work as a standalone tool (invoked by a human) and as a composable subprocess (invoked by the future `zikon` orchestrator). It follows the same structural conventions as `scripts/generate/`.

## Goals

- Produce a valid, well-formed SVG file from any PNG input.
- Emit a structured JSON object to stdout (mirroring `generate.py` conventions).
- Keep the script self-contained under `scripts/trace/` with its own `package.json`.
- Expose configurable tracing parameters via CLI flags.

## User Stories

### US-001: Basic PNG → SVG conversion

**As a** developer or automated process, **I want** to run `node trace.js input.png` **so that** a valid SVG file is produced in the same directory as the input PNG.

**Acceptance Criteria:**
- [ ] `node trace.js input.png` exits with code `0` and writes a `.svg` file alongside the input PNG.
- [ ] The output SVG is well-formed XML (parseable without errors).
- [ ] If the input file does not exist, the script exits with code `2` and prints an error to stderr.
- [ ] Nothing other than the JSON result is written to stdout.
- [ ] Lint / syntax check passes (`node --check trace.js`).

---

### US-002: Configurable tracing parameters

**As a** developer, **I want** to control tracing quality via CLI flags **so that** I can tune the output for different use cases.

**Acceptance Criteria:**
- [ ] `--colors <int>` sets the number of palette colors (default: `16`).
- [ ] `--tolerance <float>` sets the path simplification tolerance (default: `1.0`).
- [ ] `--scale <float>` sets the output scale factor (default: `1.0`).
- [ ] Invalid flag values (e.g. non-numeric) cause exit code `3` with an error on stderr.
- [ ] Lint / syntax check passes.

---

### US-003: Structured JSON output

**As an** automated process, **I want** the script to emit a JSON object to stdout **so that** the orchestrator can parse `svg_path` and `svg_inline` without reading files.

**Acceptance Criteria:**
- [ ] On success, stdout contains exactly one JSON object with at least: `png_path`, `svg_path`, `svg_inline`, `colors`, `tolerance`, `scale`.
- [ ] `svg_inline` contains the full SVG markup as a string.
- [ ] `svg_path` is the absolute path to the written SVG file.
- [ ] On error, stdout is empty; the error message goes to stderr.
- [ ] Lint / syntax check passes.

---

### US-004: Documentation update

**As a** developer, **I want** project documentation to reflect the new tracing capability **so that** future contributors and agents have accurate context.

**Acceptance Criteria:**
- [ ] `README.md` is updated to mention `scripts/trace/` and its CLI usage.
- [ ] `AGENTS.md` is updated: `trace.js` row in the script layout table filled in (no longer "planned"), and the unified CLI output JSON updated to note that `svg_path` and `svg_inline` are now produced by `trace.js`.
- [ ] `.agents/PROJECT_CONTEXT.md` — `Modular Structure` and `Implemented Capabilities` sections updated to reflect iteration 000002 deliverables.
- [ ] No other documentation files are modified beyond what is listed above.

---

## Functional Requirements

- **FR-1:** The script is located at `scripts/trace/trace.js` and has its own `scripts/trace/package.json` declaring `imagetracerjs` as a dependency.
- **FR-2:** CLI interface: `node trace.js <input.png> [--colors <int>] [--tolerance <float>] [--scale <float>]`.
- **FR-3:** The SVG output file is written to the same directory as the input PNG, with the same basename and `.svg` extension.
- **FR-4:** stdout is reserved exclusively for the JSON result; all diagnostic messages go to stderr.
- **FR-5:** Exit codes: `0` success · `1` tracing error · `2` input file not found · `3` invalid arguments.
- **FR-6:** The script must work both when called directly (`node trace.js`) and when spawned as a subprocess.
- **FR-7:** A `tests/` directory under `scripts/trace/` contains a test file (`test_trace.js` or similar) covering all acceptance criteria.
- **FR-8:** On completion, `README.md`, `AGENTS.md`, and `.agents/PROJECT_CONTEXT.md` are updated to reflect the new `scripts/trace/` module and its capabilities.

## Non-Goals (Out of Scope)

- Integration with `generate.py` or chaining the two scripts together (that is Iteration 3 — unified CLI).
- Producing any output format other than SVG.
- A web UI or API endpoint.
- Batch processing of multiple PNGs in one invocation.
- Publishing the package to npm.

## Open Questions

- None.
