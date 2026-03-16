# Requirement: Configurable SVG Size and SVGO Optimization

## Context
Callers (developers and AI agents) need icons at multiple sizes (e.g. 512px favicon, 24px toolbar, 18px small icon) but currently can only get a single 1024×1024 SVG with no optimization step. Neither `generate.py` nor `zikon.js` expose a size parameter, and there is no SVGO minification in the pipeline. This iteration adds multi-size SVG output and automatic SVGO optimization while preserving backward compatibility for single-size callers.

## Goals
- Allow callers to request one or more SVG output sizes via a `--size` flag.
- Automatically optimize every produced SVG with SVGO.
- Surface all size variants in the JSON output via an `svg_files` array.
- Keep `svg_path` / `svg_inline` top-level fields populated when only one size is requested (backward compatibility).
- Expose the `size` parameter in the agent skill.
- Document the new flag in all relevant docs.

## User Stories

### US-001: `--size` flag on the CLI
**As a** developer, **I want** to run `zikon "app icon" --size 512,24,18` **so that** I receive one PNG and three size-specific, SVGO-optimised SVG files in a single command.

**Acceptance Criteria:**
- [ ] `zikon.js` accepts `--size <px>[,<px>...]` (comma-separated integers); default is `1024`.
- [ ] PNG generation always runs at 1024×1024 regardless of the requested sizes.
- [ ] `imagetracerjs` traces the PNG once; the resulting SVG is the source for all size variants.
- [ ] For each requested size, the pipeline rewrites the SVG `width`, `height`, and `viewBox` attributes and runs SVGO, producing a separate file (e.g. `icon_512.svg`, `icon_24.svg`, `icon_18.svg`).
- [ ] Output files are written to `--output-dir` (existing behaviour).
- [ ] Exit codes remain unchanged: `0` success · `1` PNG error · `2` SVG error · `3` invalid args.

### US-002: Updated JSON output with `svg_files` array
**As a** developer or agent, **I want** the JSON output to list all produced SVGs **so that** I can programmatically access every size variant.

**Acceptance Criteria:**
- [ ] JSON stdout contains an `svg_files` array; each element is `{ "size": <int>, "svg_path": "<abs path>", "svg_inline": "<svg …/>" }`.
- [ ] When `--size` is a single value (including the default `1024`), `svg_path` and `svg_inline` top-level fields are still present and equal the single entry in `svg_files` (backward compatibility).
- [ ] When multiple sizes are requested, top-level `svg_path` / `svg_inline` are omitted or `null`.
- [ ] JSON is the only content on stdout; all progress logs go to stderr.

### US-003: SVGO as a Node dependency
**As a** maintainer, **I want** `svgo` declared in `cli/package.json` **so that** it is installed automatically with `npm install`.

**Acceptance Criteria:**
- [ ] `svgo` appears in `dependencies` in `cli/package.json`.
- [ ] `npm install` in `cli/` completes without errors.
- [ ] SVGO is invoked programmatically (not via shell) inside `zikon.js`.

### US-004: `size` parameter in the agent skill
**As an** AI agent, **I want** to pass a `size` parameter to `/zikon` **so that** I can request multi-size SVGs without leaving the agent context.

**Acceptance Criteria:**
- [ ] `zikon-skills/index.js` `run(params)` accepts an optional `size` string (e.g. `"512,24,18"`).
- [ ] When `size` is provided, it is forwarded as `--size <value>` to `node cli/zikon.js`.
- [ ] The returned object includes the `svg_files` array from the JSON output.
- [ ] Skill invocation `{ prompt: "app icon", size: "512,24,18" }` produces correct multi-size output.

### US-005: Documentation update
**As a** user or agent, **I want** the docs to mention the `--size` flag **so that** I can discover and use it without reading source code.

**Acceptance Criteria:**
- [ ] `README.md` CLI usage section shows `--size` flag with example (`--size 512,24,18`).
- [ ] `AGENTS.md` CLI interface table updated to include `--size`.
- [ ] `.agents/PROJECT_CONTEXT.md` lists US-001 through US-005 of iteration 000006 under Implemented Capabilities.
- [ ] Visually verified in a browser or markdown renderer that the docs render correctly.

## Functional Requirements
- FR-1: `zikon.js` parses `--size` as a comma-separated list of positive integers; invalid values (non-numeric, zero, negative) must cause exit code `3`.
- FR-2: PNG generation resolution stays fixed at 1024×1024; `--size` only controls SVG output dimensions.
- FR-3: The base SVG is produced by a single `imagetracerjs` pass on the 1024×1024 PNG.
- FR-4: For each requested size, a new SVG file is written with `width`, `height` set to `<size>px` and `viewBox="0 0 <size> <size>"`, then passed through SVGO before writing to disk.
- FR-5: Output SVG filenames follow the pattern `<slug>_<size>.svg` (e.g. `minimalist_rocket_icon_512.svg`).
- FR-6: `svg_files` array is always present in the JSON output; it contains one entry per requested size.
- FR-7: Top-level `svg_path` and `svg_inline` are populated only when exactly one size is requested (default behaviour preserved).
- FR-8: `svgo` must be invoked programmatically via its Node.js API, not via a child process shell call.
- FR-9: The skill `run(params)` function passes `size` to the CLI only when the parameter is non-empty/non-null.

## Non-Goals (Out of Scope)
- Changing the PNG generation resolution (stays 1024×1024).
- Exposing SVGO configuration options to callers.
- Rasterizing SVGs to additional PNG sizes.
- Modifying the `scripts/trace/` module directly — all size rewriting and SVGO runs inside `cli/zikon.js`.
- Automated tests (manual smoke test is the acceptance signal for this iteration).

## Open Questions
- None
