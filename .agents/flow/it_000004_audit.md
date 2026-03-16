# Audit — Iteration 000004

## Executive Summary

Iteration 000004 is largely successful: five of six user stories (US-002 through US-006) are fully implemented and conform to all acceptance criteria. The single non-conforming area is **US-001 (Bun build pipeline)** — no build script exists in `package.json`, no `bunfig.toml`, and no tooling to produce the three cross-platform standalone binaries (`zikon-linux`, `zikon-macos`, `zikon-windows.exe`). The CLI is fully functional when invoked via `node cli/zikon.js`, but the distributable binary artifact goal stated in FR-1 and US-001-AC01 through AC04 is unmet. All other functional requirements (FR-2 through FR-9) are satisfied.

---

## Verification by FR

| FR | Assessment | Notes |
|----|-----------|-------|
| FR-1 | **does_not_comply** | No build script; no `bun build` targeting `linux-x64`, `darwin-x64`, `win32-x64`. Only a `test` script exists in `package.json`. |
| FR-2 | comply | `get_install_dir()` returns `~/.zikon` (Linux/macOS) and `%USERPROFILE%\.zikon` (Windows). `cli/zikon.js` lines 72–81. |
| FR-3 | comply | `parse_install_arguments()` handles both `--installation-path=<path>` and `--installation-path <path>`. Custom path fully overrides default with no fallback. Lines 83–104, 574. |
| FR-4 | comply | `detect_nvidia_gpu()`, `detect_amd_gpu()`, `detect_apple_silicon_gpu()` cover all three vendors. Returns `{ vendor: "none" }` on no GPU and falls back to CPU-only without crashing. Lines 210–386. |
| FR-5 | comply | `validate_install_dependencies()` runs at lines 565–571, before `install_runtime()` (all filesystem writes). Missing tools trigger `process.exit(1)` with no directory creation. |
| FR-6 | comply | All installer/progress messages use `write_stderr()`. `process.stdout.write()` is called only once (final JSON object) in the generate flow. Install flow produces no stdout output. |
| FR-7 | comply | Constants at lines 27–30: `EXIT_SUCCESS=0`, `EXIT_GENERATION_ERROR=1`, `EXIT_TRACE_ERROR=2`, `EXIT_INVALID_ARGUMENTS=3`. All code paths use the correct constant. |
| FR-8 | comply | `ensure_profile_path_entry()` appends a marked block (`# >>> zikon >>>` / `# <<< zikon <<<`) to `~/.bashrc` and `~/.zshrc` and checks for the marker before writing (idempotent). Lines 428–440. |
| FR-9 | comply | On `win32`, prints `"Add <bin_dir> to PATH manually, then open a new terminal."` and returns immediately. No registry writes. Lines 512–514. |

---

## Verification by US

| US | Assessment | Notes |
|----|-----------|-------|
| US-001 | **does_not_comply** | AC01: no three-binary build. AC02: no bundling of `cli/zikon.js` with Node deps. AC03: no embedding or co-location of `scripts/`. AC04: build cannot complete — no build script. AC05: cannot assess lint/typecheck in context of a build pipeline that does not exist. |
| US-002 | comply | AC01: `mkdirSync` recursive creates install dir. AC02: `cli/`, `scripts/generate/`, `scripts/trace/` all copied. AC03: `uv sync` runs for Python deps. AC04: `npm` (or `pnpm`) install runs for tracer Node deps. AC05: functional via `node`. AC06: `~/.bashrc` and `~/.zshrc` updated idempotently. AC07: Windows prints manual PATH instructions. AC08: manual cross-platform verification is outside code audit scope. |
| US-003 | comply | AC01: custom path parsed, created, populated with same layout. AC02: no files written to `~/.zikon` when flag is provided. AC03: functional after install. AC04: `ensure_writable_install_dir()` throws clear error on non-writable path; caught as `exit(1)`. AC05: manual cross-platform verification outside scope. |
| US-004 | comply | AC01–AC04: NVIDIA→cuda, AMD→rocm, Apple Silicon→mps, CPU fallback. AC05: no supported GPU or <4 GB VRAM → cpu-only with warning. AC06: GPU name, VRAM, vendor, and backend printed to stderr. AC07: manual multi-machine verification outside scope. |
| US-005 | comply | AC01: `bun`, `node`, `npm`/`pnpm` all checked. AC02: `uv` checked. AC03: each missing tool prints actionable message with install URL; exits non-zero before any filesystem change. AC04: all tools present → proceeds without prompts. AC05: manual verification outside scope. |
| US-006 | comply | AC01: `README.md` has an "Installation" section covering Linux, macOS, and Windows. AC02: prerequisites table lists Bun, Node.js, uv with install links for each OS. AC03: exact command sequences from clone to first `zikon` invocation for Bash and PowerShell. AC04: visual browser verification checklist included. |

---

## Minor Observations

- The README `Installation` commands use `node cli/zikon.js install` rather than a downloaded binary path. Once US-001 ships, the README needs updating to reflect binary download and usage.
- `ensure_profile_path_entry()` creates `~/.bashrc` / `~/.zshrc` even if they do not exist. This is intentional but may be unexpected for fish, nushell, or other shell users.
- Missing dependency check exits with `EXIT_GENERATION_ERROR` (code 1) rather than `EXIT_INVALID_ARGUMENTS` (code 3). Minor semantic mismatch in constant naming; behavior is not incorrect.
- Apple Silicon VRAM is read from system RAM via `system_profiler` (unified memory). Technically correct, but may overstate the effective GPU budget for inference workloads.
- No integration tests against a real filesystem — all install tests use stubs/mocks. Unit coverage is comprehensive but integration coverage is absent.
- The Windows `zikon.cmd` shim hardcodes a relative path (`%~dp0\..\cli\zikon.js`) that assumes the install layout is always `bin/../cli/zikon.js`. This breaks if the `bin/` directory is relocated.

---

## Conclusions and Recommendations

The implementation of iteration 000004 is strong overall with one critical gap: the Bun build pipeline (US-001 / FR-1) was not implemented.

### Refactor plan (see below)

The refactor addresses: (1) the build pipeline gap, (2) the `PROJECT_ROOT` path resolution required to make compiled binaries find their co-located `scripts/`, and (3) a README update to document binary-based installation.

---

## Refactor Plan

### 1. Create `scripts/build.js`

New Node.js build script that:
- Runs `bun build --compile --target=bun-{linux,darwin,windows}-x64` for each platform, outputting to `dist/`
- Copies `scripts/` (excluding `node_modules`, `.venv`, etc.) alongside the binaries as `dist/scripts/`
- Exits non-zero on any compilation failure

### 2. Add `build` entry to root `package.json`

```json
"build": "node scripts/build.js"
```

### 3. Fix `PROJECT_ROOT` in `cli/zikon.js` for compiled binary mode

When compiled with Bun, `__dirname` resolves to the directory of the executable, not the original source `cli/` directory. The co-located `scripts/` is therefore at `__dirname/scripts`, not `__dirname/../scripts`. Detection: check whether `scripts/` exists one level up (dev mode) or at the same level (compiled binary mode).

```js
const _scripts_at_parent = path.join(__dirname, "..", "scripts");
const PROJECT_ROOT = fs.existsSync(_scripts_at_parent)
  ? path.join(__dirname, "..")   // dev: scripts/ is at project root
  : __dirname;                    // compiled binary: scripts/ is co-located
```

### 4. Update `README.md` Installation section

Add a "Binary download" subsection above the git clone flow, showing:
- Download `zikon-{linux,macos,windows.exe}` + `scripts/` from the release archive
- Make binary executable (`chmod +x` on Linux/macOS)
- Run `./zikon-linux install` (or equivalent)

Update the existing `node cli/zikon.js install` steps to be clearly labeled as the "from source" flow.
