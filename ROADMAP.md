# Roadmap

## [X]  Iteration 1 — Python generation pipeline

Goal: functional Python script that receives a prompt and generates a PNG using diffusers.

- [X] Set up Python environment with `diffusers` + `torch`
- [X] `generate.py` script with model selection (`z-image-turbo` | `sdxl`)
- [X] CLI parameters: `--prompt`, `--model`, `--output`, `--steps`, `--seed`
- [X] Output: PNG at specified path + JSON with metadata (prompt, model, seed, path)
- [X] **Done when:** `generate.py --prompt "minimalist icon" --model sdxl` produces a valid PNG and JSON

---

## [X]  Iteration 2 — PNG → SVG conversion

Goal: integrate `imagetracerjs` to convert the generated PNG to SVG.

- [X] Set up Node.js with `imagetracerjs`
- [X] `trace.js` script that receives a PNG and produces an SVG
- [X] Configurable parameters: number of colors, path tolerance, scale
- [X] Output: SVG in the same directory as the PNG + updated metadata in JSON
- [X] **Done when:** `trace.js input.png` produces a valid, well-formed SVG file

---

## [X] Iteration 3 — Unified CLI

Goal: a single `zikon` command that orchestrates the full end-to-end pipeline.

- [X] Orchestrator script (bash or Node) that chains `generate.py` → `trace.js`
- [X] Interface: `zikon <prompt> [--model] [--output-dir] [--style]`
- [X] Structured JSON output: `prompt`, `model`, `seed`, `png_path`, `svg_path`, `svg_inline`
- [X] Clean error handling and exit codes (critical for agent consumption)
- [X] **Done when:** `zikon "app logo" --model sdxl --output-dir ./assets` produces PNG + SVG + JSON in one command

---

## [X] Iteration 4 — Zikon build package

Goal: cross-platform build package using Bun that ships the CLI and scripts with a one-command installer.

- [X] Create Bun-based build pipeline that packages `cli/` + `scripts/` for Linux, macOS, and Windows
- [X] Add `zikon install` command in the CLI
- [X] `zikon install` sets up runtime dependencies (`uv` Python environment + Node packages for tracer)
- [X] Default installation directory is `~/.zikon` (or OS-equivalent user home location)
- [X] If user passes `--instalation-path <path>`, install everything in that explicit location
- [X] Ensure generated install layout is self-contained and usable by subsequent `zikon` commands
- [X] Installation and usage documentation for all supported OSesa
- [X] Integration test: fresh machine setup → `zikon install` → successful end-to-end PNG+SVG generation
- [X] **Done when:** user can run `zikon install` and immediately use `zikon` without manual dependency setup

---

## [ ] Iteration 5 — Installable Agent Skill

Goal: installable `.md` skill for AI Agents that exposes the pipeline as an agent tool.

- [ ] Define skill interface: typed parameters (`prompt`, `model`, `style`, `output_dir`)
- [ ] AI Agents uses skills to invoke the zikon to create icons or web assets
- [ ] Installation and usage documentation
- [ ] Zikon Skills can be installed using `npx skills add` from Vercel Labs
- [ ] Integration test: agent generates an icon mid-task in a real web project
- [ ] **Done when:** AI Agents can invoke `/zikon` and receive a usable SVG without manual steps

---

## [ ] Iteration 6 — Layered tracing via segmentation

Goal: refine the tracing pipeline by segmenting the generated PNG with GroundingDINO + SAM2 before sending each region through `imagetracerjs`, producing a cleaner SVG with tighter, more controllable layers.

- [ ] Extend the tracer pipeline to detect meaningful regions or objects with GroundingDINO
- [ ] Use SAM2 masks to isolate segments before vectorization
- [ ] Run `imagetracerjs` independently on each segmented region instead of tracing the whole image at once
- [ ] Recompose the final SVG from ordered layer groups with tighter bounds and less cross-shape bleeding
- [ ] Expose configuration for segmentation prompts, mask thresholds, and layer ordering
- [ ] Persist intermediate artifacts for debugging (`masks/`, cropped PNGs, per-layer SVGs, manifest JSON)
- [ ] **Done when:** a generated PNG can be segmented and traced region-by-region into a layered SVG with visibly cleaner shape boundaries than the single-pass tracer

