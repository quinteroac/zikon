# Agents entry point

## Project overview

`Zikon` is a developer utility that generates web icons and visual assets via a diffusion model pipeline and converts them to SVG. It is designed to be invoked by AI agents mid-task.

## Pipeline summary

```
prompt → generate.py (diffusers) → PNG → trace.js (imagetracerjs) → SVG + JSON
```

## Script layout

Scripts are grouped under `scripts/`, each as a standalone `uv` project:

| Directory | Purpose |
|---|---|
| `scripts/generate/` | PNG generation — Python + diffusers + torch |

> Future scripts: `scripts/trace/` (PNG→SVG), `scripts/orchestrate/` (unified CLI).

## Key files

| File | Purpose |
|---|---|
| `scripts/generate/generate.py` | CLI entry point — generates PNG from prompt |
| `scripts/generate/diffusers_backend.py` | Real diffusers+torch pipeline |
| `scripts/generate/stub_backend.py` | Stdlib-only fallback (no torch required) |
| `scripts/generate/pyproject.toml` | uv project manifest |
| `trace.js` | Node.js script — converts PNG to SVG (planned) |
| `zikon` | Unified CLI orchestrator (planned) |
| `.agents/skills/zikon/SKILL.md` | Installable skill for Claude Code / Codex (planned) |

## CLI interface

**scripts/generate (current):**
```bash
cd scripts/generate
uv run generate.py --prompt <text> --model <z-image-turbo|sdxl|hf-repo/name> --output <path.png> [--steps <int>] [--seed <int>]
```

**Unified CLI (planned):**
```bash
zikon <prompt> [--model z-image-turbo|sdxl] [--output-dir <path>] [--style <hint>] [--seed <int>]
```

Output is always a JSON object on stdout:

```json
{
  "prompt": "...",
  "model": "...",
  "seed": 0,
  "png_path": "...",
  "svg_path": "...",
  "svg_inline": "<svg>...</svg>"
}
```

Exit codes: `0` success · `1` generation error · `2` tracing error · `3` invalid arguments.

## Agent instructions

- Always pass `--output-dir` to avoid writing to the current working directory.
- Use `--model z-image-turbo` for fast iteration, `--model sdxl` for final output.
- Parse `svg_inline` from the JSON response to embed the SVG directly in markup.
- Do not retry on exit code `1` without changing the prompt — the model error is likely deterministic for that input.

## Tech stack

- **Python 3.11+** + `diffusers` + `torch` + `accelerate` + `Pillow` — image generation
- **uv** — dependency management; each script group has its own `pyproject.toml`
- **Node.js** + `imagetracerjs` — SVG tracing (planned)
- No external API calls — all inference runs locally

## Current iteration

See [ROADMAP.md](./ROADMAP.md).
