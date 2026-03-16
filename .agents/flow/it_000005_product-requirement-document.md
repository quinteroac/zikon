# Requirement: Installable Agent Skill for Zikon

## Context
Zikon's pipeline (prompt → PNG → SVG) is currently only accessible via a CLI command. AI agents working on web projects must invoke it manually or know the exact CLI interface. An installable skill file exposes Zikon as a first-class agent tool — agents can invoke `/zikon` mid-task and receive a usable SVG result without manual steps.

## Goals
- Provide a skill file that conforms to the Vercel Labs `skills` schema so AI agents discover and use Zikon automatically.
- Allow any developer or agent to install the skill in one command: `npx skills add zikon`.
- Ensure both automated agent invocation and manual human use (`/zikon "<prompt>"`) work without extra setup.

## User Stories

### US-001: Skill interface definition
**As a** developer or AI agent, **I want** a skill file that declares Zikon's typed parameters **so that** I know exactly what inputs are accepted and what output to expect.

**Acceptance Criteria:**
- [ ] `.agents/skills/zikon/SKILL.md` exists and follows the Vercel Labs `skills` file schema.
- [ ] File declares the following typed parameters: `prompt` (string, required), `model` (string, optional, default `z-image-turbo`), `style` (string, optional), `output_dir` (string, optional).
- [ ] File documents the output contract: a JSON object with fields `prompt`, `model`, `seed`, `png_path`, `svg_path`, `svg_inline`.
- [ ] File includes a usage example showing a minimal invocation (`/zikon "rocket icon"`).
- [ ] Typecheck / lint passes (node --check on any JS, python3 -m py_compile on any Python added).

### US-002: Installation via Vercel Labs skills tooling
**As a** developer, **I want** to install the Zikon skill with `npx skills add zikon` **so that** it is available in my AI agent environment without cloning the repository.

**Acceptance Criteria:**
- [ ] The skill is registered / reachable in a form that `npx skills add zikon` (Vercel Labs `@vercel/skill` CLI) can discover and install.
- [ ] After installation, the skill appears in the agent's skill list and `/zikon` is a valid invocation.
- [ ] Any required `package.json` or manifest fields (name, version, description, main) are present and correct.
- [ ] Typecheck / lint passes.

### US-003: Agent invocation returns usable SVG
**As an** AI agent or human developer, **I want** to invoke `/zikon "<prompt>"` **so that** I receive a JSON result containing `svg_inline` that I can embed directly in markup without additional steps.

**Acceptance Criteria:**
- [ ] Running `/zikon "rocket icon"` (or equivalent `node cli/zikon.js "rocket icon"`) exits with code `0`.
- [ ] Stdout contains exactly one JSON object with all six required fields (`prompt`, `model`, `seed`, `png_path`, `svg_path`, `svg_inline`).
- [ ] `svg_inline` is a non-empty string starting with `<svg`.
- [ ] Optional parameters (`--model`, `--style`, `--output-dir`) are forwarded correctly when provided.
- [ ] Typecheck / lint passes.

### US-004: Installation and usage documentation
**As a** developer or AI agent, **I want** updated documentation **so that** I can install and use the skill without reading source code.

**Acceptance Criteria:**
- [ ] `README.md` contains a "Skills" section describing `npx skills add zikon` and the `/zikon` invocation syntax.
- [ ] `AGENTS.md` is updated to reference the skill file location (`.agents/skills/zikon/SKILL.md`) and invocation pattern.
- [ ] `.agents/PROJECT_CONTEXT.md` lists the skill under Implemented Capabilities for iteration 000005.
- [ ] Typecheck / lint passes.

### US-005: Integration test — agent generates icon mid-task
**As a** developer verifying the skill, **I want** an integration test that simulates an agent invoking Zikon in a real web project directory **so that** I can confirm the end-to-end flow works without manual steps.

**Acceptance Criteria:**
- [ ] A test script (e.g. `tests/test_skill_integration.js` or a section in the existing `tests/test_zikon.js`) exists that:
  - Creates a temporary output directory.
  - Invokes `node cli/zikon.js "<prompt>" --output-dir <tmpdir>` programmatically (subprocess).
  - Asserts exit code is `0`.
  - Asserts the parsed JSON contains `svg_inline` starting with `<svg`.
  - Cleans up the temporary directory.
- [ ] Test can be run with `node tests/test_skill_integration.js` (or equivalent) and passes.
- [ ] Typecheck / lint passes.

## Functional Requirements
- FR-1: The skill file MUST conform to the Vercel Labs `skills` schema (fields: name, description, parameters, returns, examples).
- FR-2: All four parameters (`prompt`, `model`, `style`, `output_dir`) MUST be declared with types and descriptions; `prompt` is required, the rest optional.
- FR-3: The skill MUST be installable via `npx skills add ./path/to/skill` (local path) — no npm publishing required; the manifest must be a local directory or file path discoverable by the Vercel Labs `@vercel/skill` tooling.
- FR-4: Invoking the skill MUST ultimately delegate to `node cli/zikon.js` (or the installed `zikon` shim) and return its stdout JSON unchanged.
- FR-5: `svg_inline` in the returned JSON MUST be a non-empty string beginning with `<svg`.
- FR-6: Documentation changes MUST cover `README.md`, `AGENTS.md`, and `.agents/PROJECT_CONTEXT.md`.
- FR-7: The integration test MUST exercise the full pipeline (generate + trace) and assert on `svg_inline`.

## Non-Goals (Out of Scope)
- Publishing the skill to npm or any public registry beyond what `npx skills add` requires.
- GUI or web-based skill management UI.
- Changes to the PNG generation or SVG tracing logic.
- Support for skill hot-reload or dynamic parameter updates at runtime.
- Any new CLI flags beyond those already defined (`prompt`, `model`, `style`, `output_dir`, `seed`).

## Open Questions
- None.
