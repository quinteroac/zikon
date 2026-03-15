# Agents entry point

## Project overview

`Zikon` is a developer utility that generates web icons and visual assets via a diffusion model pipeline and converts them to SVG. It is designed to be invoked by AI agents mid-task.

## Pipeline summary

```
prompt → generate.py (diffusers) → PNG → trace.js (imagetracerjs) → SVG + JSON
```

## Script layout

Python scripts are grouped under `scripts/`, each as a standalone `uv` project. The Node.js orchestrator lives under `cli/`:

| Path | Purpose |
|---|---|
| `scripts/generate/` | PNG generation — Python + diffusers + torch |
| `scripts/trace/` | PNG → SVG tracing — Node.js + imagetracerjs |
| `cli/` | Unified CLI orchestrator — Node.js + commander |

## Key files

| File | Purpose |
|---|---|
| `cli/zikon.js` | Unified CLI entry point — orchestrates PNG + SVG pipeline |
| `cli/package.json` | Node.js project manifest (commander dependency) |
| `scripts/generate/generate.py` | Python CLI — generates PNG from prompt |
| `scripts/generate/diffusers_backend.py` | Real diffusers+torch pipeline |
| `scripts/generate/stub_backend.py` | Stdlib-only fallback (no torch required) |
| `scripts/generate/pyproject.toml` | uv project manifest |
| `.agents/skills/zikon/SKILL.md` | Installable skill for Claude Code / Codex (planned) |

## CLI interface

**Unified CLI (current):**
```bash
node cli/zikon.js "<prompt>" [--model z-image-turbo|sdxl|<hf-repo>] [--output-dir <path>] [--style <hint>] [--seed <int>]
```

**Python generate script (standalone):**
```bash
cd scripts/generate
uv run generate.py --prompt <text> --model <z-image-turbo|sdxl|hf-repo/name> --output <path.png> [--steps <int>] [--seed <int>]
```

Output is always a single JSON object on stdout:

```json
{
  "prompt": "minimalist rocket icon",
  "model": "z-image-turbo",
  "seed": 42,
  "png_path": "/abs/path/output/minimalist_rocket_icon.png",
  "svg_path": "/abs/path/output/minimalist_rocket_icon.svg",
  "svg_inline": "<svg xmlns=\"http://www.w3.org/2000/svg\">...</svg>"
}
```

Exit codes: `0` success · `1` PNG generation error · `2` SVG tracing error · `3` invalid arguments.

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
