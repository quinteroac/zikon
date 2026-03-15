# Agents entry point

## Project overview

`logo-creator` is a developer utility that generates web icons and visual assets via a diffusion model pipeline and converts them to SVG. It is designed to be invoked by AI agents mid-task.

## Pipeline summary

```
prompt → generate.py (diffusers) → PNG → trace.js (imagetracerjs) → SVG + JSON
```

## Key files (when built)

| File | Purpose |
|---|---|
| `generate.py` | Python script — generates PNG from prompt using diffusers |
| `trace.js` | Node.js script — converts PNG to SVG using imagetracerjs |
| `generate-icon` | Unified CLI orchestrator for the full pipeline |
| `.agents/skills/generate-icon/SKILL.md` | Installable skill for Claude Code / Codex |

## CLI interface

```bash
generate-icon <prompt> [--model z-image-turbo|sdxl] [--output-dir <path>] [--style <hint>] [--seed <int>]
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

- **Python** + `diffusers` + `torch` — image generation
- **Node.js** + `imagetracerjs` — SVG tracing
- No external API calls — all inference runs locally

## Current iteration

See [ROADMAP.md](./ROADMAP.md).
