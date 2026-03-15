# Roadmap

## [X]  Iteration 1 — Python generation pipeline

Goal: functional Python script that receives a prompt and generates a PNG using diffusers.

- [ ] Set up Python environment with `diffusers` + `torch`
- [ ] `generate.py` script with model selection (`z-image-turbo` | `sdxl`)
- [ ] CLI parameters: `--prompt`, `--model`, `--output`, `--steps`, `--seed`
- [ ] Output: PNG at specified path + JSON with metadata (prompt, model, seed, path)
- [ ] **Done when:** `generate.py --prompt "minimalist icon" --model sdxl` produces a valid PNG and JSON

---

## [ ]  Iteration 2 — PNG → SVG conversion

Goal: integrate `imagetracerjs` to convert the generated PNG to SVG.

- [ ] Set up Node.js with `imagetracerjs`
- [ ] `trace.js` script that receives a PNG and produces an SVG
- [ ] Configurable parameters: number of colors, path tolerance, scale
- [ ] Output: SVG in the same directory as the PNG + updated metadata in JSON
- [ ] **Done when:** `trace.js input.png` produces a valid, well-formed SVG file

---

## [ ] Iteration 3 — Unified CLI

Goal: a single `zikon` command that orchestrates the full end-to-end pipeline.

- [ ] Orchestrator script (bash or Node) that chains `generate.py` → `trace.js`
- [ ] Interface: `zikon <prompt> [--model] [--output-dir] [--style]`
- [ ] Structured JSON output: `prompt`, `model`, `seed`, `png_path`, `svg_path`, `svg_inline`
- [ ] Clean error handling and exit codes (critical for agent consumption)
- [ ] **Done when:** `zikon "app logo" --model sdxl --output-dir ./assets` produces PNG + SVG + JSON in one command

---

## [ ] Iteration 4 — Installable Agent Skill

Goal: installable `.md` skill for Claude Code and Codex that exposes the pipeline as an agent tool.

- [ ] Define skill interface: typed parameters (`prompt`, `model`, `style`, `output_dir`)
- [ ] Skill invokes the Iteration 3 CLI as a subprocess
- [ ] Installation and usage documentation
- [ ] Integration test: agent generates an icon mid-task in a real web project
- [ ] **Done when:** Claude Code can invoke `/zikon` and receive a usable SVG without manual steps

