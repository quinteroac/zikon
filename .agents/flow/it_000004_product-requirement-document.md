# Requirement: Zikon Build Package & One-Command Installer

## Context
Zikon currently requires manual setup of Python (uv), Node.js, and their respective dependencies before it can be used. Iteration 4 introduces a cross-platform build system (Bun) that packages the CLI and scripts into distributable binaries, and a `zikon install` command that automates the full runtime setup — including dependency detection, system requirement checks, and CUDA selection — on Linux, macOS, and Windows.

## Goals
- Ship Zikon as a self-contained distributable that requires no manual dependency wiring.
- Reduce time-to-first-run on a fresh machine to a single command: `zikon install`.
- Support Linux, macOS, and Windows from the first release.
- Detect hardware capabilities (GPU / VRAM) and select the appropriate CUDA variant automatically.
- Guard against missing runtimes early by validating Node/Bun/npm/pnpm and uv before installation proceeds.

## User Stories

### US-001: Bun build pipeline
**As a** developer distributing Zikon, **I want** a Bun-based build script that compiles the project into standalone binaries **so that** users can download a single file per platform without installing a runtime first.

**Acceptance Criteria:**
- [ ] Running `bun run build` (or equivalent) produces three binaries: `zikon-linux`, `zikon-macos`, `zikon-windows.exe`.
- [ ] Each binary bundles `cli/zikon.js` and all Node dependencies.
- [ ] `scripts/` (Python generate pipeline) is included as an embedded or co-located artifact alongside each binary.
- [ ] Build completes without errors on a machine with Bun installed.
- [ ] Typecheck / lint passes.

### US-002: `zikon install` — default installation to `~/.zikon`
**As a** developer on a fresh machine, **I want** to run `zikon install` **so that** all runtime dependencies are set up automatically in `~/.zikon` and I can immediately use the `zikon` command.

**Acceptance Criteria:**
- [ ] `zikon install` creates `~/.zikon/` (or `%USERPROFILE%\.zikon\` on Windows) if it does not exist.
- [ ] The install directory contains: the CLI entry point, the `scripts/generate/` uv project, and the `scripts/trace/` Node project.
- [ ] uv virtual environment is created and all Python dependencies (`diffusers`, `torch`, `accelerate`, `Pillow`) are installed into it.
- [ ] Node packages for the tracer (`imagetracerjs`, `commander`) are installed via npm or pnpm.
- [ ] After install, running `zikon "test icon"` from any directory exits 0 and emits valid JSON with `png_path`, `svg_path`, and `svg_inline`.
- [ ] On Linux/macOS: `~/.bashrc` and/or `~/.zshrc` contain the install `bin/` path; running the installer a second time does not duplicate the entry.
- [ ] On Windows: installer prints instructions for adding the install directory to PATH manually.
- [ ] Manually verified on Linux, macOS, and Windows.

### US-003: `zikon install --installation-path <path>` — custom install location
**As a** developer who cannot or prefers not to install to the home directory, **I want** to pass `--installation-path <path>` **so that** Zikon is installed entirely under my chosen directory.

**Acceptance Criteria:**
- [ ] `zikon install --installation-path /custom/path` creates and populates that directory with the same layout as the default install.
- [ ] No files are written to `~/.zikon` when `--installation-path` is provided.
- [ ] After install, `zikon "test icon"` invoked from that path exits 0 and emits valid JSON.
- [ ] Passing a non-writable path prints a clear error message and exits with a non-zero code.
- [ ] Manually verified on Linux, macOS, and Windows.

### US-004: System requirements check — GPU detection and backend selection
**As a** developer running `zikon install`, **I want** the installer to detect my GPU vendor and available VRAM **so that** the correct PyTorch backend (CUDA, ROCm, or MPS) is installed automatically.

**Acceptance Criteria:**
- [ ] The installer detects GPU vendor: NVIDIA (CUDA), AMD (ROCm), or Apple Silicon (MPS/Metal).
- [ ] For NVIDIA GPUs with VRAM ≥ 4 GB: CUDA-enabled PyTorch build is installed.
- [ ] For AMD GPUs with VRAM ≥ 4 GB: ROCm-enabled PyTorch build is installed.
- [ ] For Apple Silicon (M-series): MPS-enabled PyTorch build is installed.
- [ ] If no supported GPU is found or VRAM < 4 GB: CPU-only PyTorch build is installed and the user is warned that it might not work.
- [ ] The detected GPU name, VRAM, vendor, and selected backend are printed to the console during install.
- [ ] Manually verified on a CUDA machine, an AMD machine, an Apple Silicon machine, and a CPU-only machine.

### US-005: Runtime dependency validation
**As a** developer running `zikon install`, **I want** the installer to check for required system tools **so that** I know exactly what to install if something is missing before the process fails mid-way.

**Acceptance Criteria:**
- [ ] The installer checks for the presence of: `bun`, `node`, and at least one of `npm` / `pnpm` (Node package managers).
- [ ] The installer checks for the presence of `uv` (Python package manager).
- [ ] If any required tool is missing, the installer prints a clear, actionable message (e.g. "uv not found — install with: curl -Ls https://astral.sh/uv/install.sh | sh") and exits with a non-zero code **before** making any changes to the filesystem.
- [ ] If all required tools are present, the installer proceeds without prompts.
- [ ] Manually verified with at least one tool intentionally missing.

### US-006: Installation documentation
**As a** developer on any supported OS, **I want** clear installation instructions **so that** I can set up Zikon without trial and error.

**Acceptance Criteria:**
- [ ] `README.md` contains an "Installation" section covering Linux, macOS, and Windows.
- [ ] The section documents the prerequisites (Bun, Node.js, uv) with install links for each OS.
- [ ] The section shows the exact commands to run from download to first successful `zikon` invocation.
- [ ] Visually verified in browser (GitHub README render).

## Functional Requirements
- FR-1: The Bun build script must target three platforms: `linux-x64`, `darwin-x64` (macOS), and `win32-x64`.
- FR-2: The default install directory is `~/.zikon` on Linux/macOS and `%USERPROFILE%\.zikon` on Windows.
- FR-3: `--installation-path` overrides the default install directory completely; no fallback to default.
- FR-4: GPU detection must cover NVIDIA (CUDA), AMD (ROCm), and Apple Silicon (MPS); absence of a supported GPU must not crash the installer — fall back to CPU-only.
- FR-5: Runtime validation must run before any filesystem writes.
- FR-6: All installer output (progress, warnings, errors) goes to stderr; no additional stdout output beyond the existing JSON contract.
- FR-7: Exit codes follow the existing convention: `0` success · `1` install error · `3` invalid/missing arguments.
- FR-8: On Linux and macOS, the installer appends the install `bin/` directory to the user's shell config (`~/.bashrc` and/or `~/.zshrc`) if not already present, prints what was changed, and is idempotent (running install twice does not duplicate the entry).
- FR-9: On Windows, the installer does NOT modify the PATH registry; instead it prints a clear one-liner at the end of install telling the user how to add the install directory to their PATH manually.

## Non-Goals (Out of Scope)
- Automatic installation of missing system tools (Node, Bun, uv) — the installer only detects and guides, it does not install these runtimes.
- Auto-update / upgrade mechanism.
- Uninstaller / `zikon uninstall` command.
- Windows ARM or macOS ARM (Apple Silicon) specific builds — x64 only.

## Open Questions
- None.
