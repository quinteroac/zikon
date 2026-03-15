# Refactor Report — Iteration 000001

## Summary of changes

### Priority 1 — Real inference integration (FR-2 gap)

**`stub_backend.py` (new)**
Extracted the solid-colour PNG generation logic from `generate.py` into a dedicated `stub_backend` module. The module exposes a `StubImage` duck-typed image class (with a PIL-compatible `save()` method) and a `generate_image(enhanced_prompt, pipeline_config, steps, seed) -> StubImage` function. No external dependencies are required; the file uses only the standard library.

**`diffusers_backend.py` (new)**
Implemented a real `diffusers` + `torch` pipeline backend with the same `generate_image` interface. Supports all three pipeline types (`z-image-turbo` → `stabilityai/sdxl-turbo`, `sdxl` → SDXL base 1.0, `custom` → any HF repo ID or local path). Pipelines are cached after first load. A module-level `DIFFUSERS_AVAILABLE` flag is set during import so the caller can detect missing dependencies without an exception traceback.

**`generate.py` (modified)**
- Removed `write_png` and `seed_to_color` (now live in `stub_backend.py`).
- Added backend selection: `diffusers_backend` is imported first; if it is unavailable (ImportError or `DIFFUSERS_AVAILABLE == False`), `stub_backend` is used automatically. The active backend is exposed as the module-level name `backend` so tests can patch it.
- Updated `run()` to call `backend.generate_image()` and `image.save()` instead of the old stub calls, preserving the CLI contract and exit-code semantics unchanged.
- Removed `# pragma: no cover` from the top-level exception handler (the handler is now covered by the new error-handler test).
- Added null-seed documentation in the module docstring explaining that `seed` serialises as JSON `null` when `--seed` is omitted.

**`requirements.txt` (new)**
Added `diffusers>=0.27.0`, `torch>=2.2.0`, `accelerate>=0.28.0`, and `Pillow>=10.0.0`.

### Priority 2 — Test hardening

**`tests/test_generate.py` (modified)**
- Added `import unittest.mock`.
- Added three explicit US-001 acceptance-criteria tests:
  - `test_us001_ac01_generates_valid_png_for_valid_arguments` — confirms a valid PNG is written on success.
  - `test_us001_ac02_exits_zero_on_success` — confirms exit code 0.
  - `test_us001_ac03_missing_prompt_exits_with_code_3` — confirms the argparse remapping to exit code 3.
- Added `test_error_handler_returns_exit_code_1_and_prints_to_stderr` — patches `generate.backend.generate_image` to raise `RuntimeError`, then asserts exit code 1 and that the error message appears on stderr. This closes the `pragma: no cover` gap.

### Priority 3 — Input validation tightening

Tightened `HF_REPO_ID_PATTERN` in `generate.py` to enforce HuggingFace's naming constraints:
- Each segment must start **and end** with an alphanumeric character (no leading/trailing hyphens or dots).
- Each segment is limited to a maximum of 96 characters.

---

## Quality checks

| Check | Command | Outcome |
|-------|---------|---------|
| Compile check | `python3 -m py_compile generate.py stub_backend.py diffusers_backend.py tests/test_generate.py` | **PASS** |
| Lint | `ruff check generate.py stub_backend.py diffusers_backend.py tests/test_generate.py` | **PASS** — all checks passed |
| Unit tests | `python3 -m unittest discover -s tests` | **PASS** — 20 tests in 0.58 s (4 new, 16 pre-existing) |
| `bun run typecheck` | — | Not configured for this Python project; `python3 -m py_compile` used instead |
| `bun test` | — | Not applicable (no JavaScript sources) |

---

## Deviations from refactor plan

None. All three priority items in the audit JSON were implemented:

- **Priority 1**: `stub_backend.py` extracted, `diffusers_backend.py` created, `generate.py` updated with guarded import and backend swap.
- **Priority 2**: Explicit `test_us001_ac01_*`–`test_us001_ac03_*` tests added, error-handler coverage test added, null-seed behaviour documented in module docstring.
- **Priority 3**: `HF_REPO_ID_PATTERN` tightened (max 96 chars per segment, no leading/trailing hyphens/dots).
