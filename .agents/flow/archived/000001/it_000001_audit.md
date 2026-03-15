# Audit — Iteration 000001

## Executive Summary

The iteration is functionally complete as a scaffold. All five user stories and six of seven functional requirements fully comply with the PRD. The single partial non-conformance (FR-2) is the deliberate absence of real `diffusers` + `torch` inference, documented in the script's own docstring. The existing CLI contract, JSON schema, prompt enhancement logic, and exit-code behaviour are solid and should be preserved as the foundation for the next iteration.

---

## Verification by FR

| FR | Assessment | Notes |
|----|-----------|-------|
| FR-1 | comply | No setup beyond stdlib; `python generate.py <args>` works out of the box. |
| FR-2 | partially_comply | Fully local / no HTTP calls ✅ — but `diffusers` + `torch` are not used; generation is a stdlib stub producing a deterministic solid-color PNG. |
| FR-3 | comply | Built-ins `z-image-turbo` / `sdxl` routed explicitly; any other string treated as custom model (HF repo ID or local dir); missing `--prompt` exits with code 3. |
| FR-4 | comply | `stdout` used exclusively for the JSON result; all errors and info go to `stderr`. |
| FR-5 | comply | `enhance_prompt_for_svg()` called unconditionally before generation for every model. |
| FR-6 | comply | Top-level `except Exception` prints error to stderr and returns exit code 1. |
| FR-7 | comply | argparse `SystemExit(2)` remapped to `EXIT_INVALID_ARGUMENTS = 3`; usage/error printed to stderr by argparse. |

---

## Verification by US

| US | Assessment | Notes |
|----|-----------|-------|
| US-001 | comply | All five args present; valid PNG written; exit 0 on success; lint/typecheck pass. |
| US-002 | comply | Both built-in pipelines routed; custom model accepts HF repo ID and local dir; invalid model exits 1 with stderr message. |
| US-003 | comply | Exactly one JSON object on stdout with all required fields; stderr clean on success; parseable with `json.loads()`. |
| US-004 | comply | Parent dirs created automatically; model-specific step defaults applied; same seed + prompt + model + steps produces identical output. |
| US-005 | comply | All seven SVG_FRIENDLY_TERMS appended; original prompt preserved in `prompt` field; enhanced prompt exposed in `enhanced_prompt` field; enhancement applied to both models. |

---

## Minor Observations

1. No dedicated `test_us001_*` test methods exist — US-001 acceptance criteria are covered implicitly by other test cases but lack explicit traceability.
2. `--steps` only affects the deterministic hash color in the stub, not real inference fidelity; this may confuse future contributors expecting step-count to influence render quality.
3. The top-level exception handler carries `# pragma: no cover` — a simple mock test exercising a `write_png` failure would close this coverage gap.
4. `HF_REPO_ID_PATTERN` regex is permissive (no segment-length limits, allows consecutive special characters). Sufficient for the current stub but may need tightening when real model loading is introduced.
5. `seed` serialises as JSON `null` when not provided — downstream consumers must handle null vs. integer explicitly.

---

## Conclusions and Recommendations

The scaffold delivers a clean, testable CLI foundation. The priority recommendation is to replace the stub PNG generator with a real `diffusers` pipeline in the next iteration, preserving the existing CLI contract, JSON output schema, prompt enhancement logic, and exit-code semantics unchanged. Secondary hardening tasks:

1. Add explicit `test_us001_*` test methods for direct AC traceability.
2. Add a test that exercises the top-level error handler (mock `write_png` to raise).
3. Clarify or document null-seed behaviour for downstream consumers.
4. Tighten `HF_REPO_ID_PATTERN` once real model loading is introduced.

---

## Refactor Plan

### Priority 1 — Real inference (FR-2 gap)

**Goal:** Replace the stdlib stub in `generate.py` with an actual `diffusers` + `torch` pipeline, keeping the public interface unchanged.

**Steps:**
1. Add `diffusers`, `torch`, and `accelerate` to a `requirements.txt` (or `pyproject.toml`).
2. Extract the current `write_png` stub into a separate `stub_backend.py` so it can be kept for unit testing without `torch` installed.
3. Implement `diffusers_backend.py` exposing the same interface: `generate_image(enhanced_prompt, pipeline_config, steps, seed) -> PIL.Image`.
4. In `run()`, swap in the real backend; keep `write_png` only as a fallback/test shim.
5. Guard the import with a try/except so the CLI exits with a clear message if `diffusers`/`torch` are missing, rather than an ImportError traceback.

### Priority 2 — Test hardening

| Task | File | Action |
|------|------|--------|
| Explicit US-001 tests | `tests/test_generate.py` | Add `test_us001_ac01_*` … `test_us001_ac03_*` methods |
| Error handler coverage | `tests/test_generate.py` | Mock `write_png` to raise; assert exit code 1 and stderr content |
| Null-seed documentation | `generate.py` docstring | Document that `seed` field is `null` in JSON when not supplied |

### Priority 3 — Input validation tightening

Once real model loading is in place, tighten `HF_REPO_ID_PATTERN` to enforce HuggingFace's actual naming constraints (max 96 chars per segment, no leading/trailing hyphens).
