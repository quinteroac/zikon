#!/usr/bin/env node
"use strict";

/**
 * zikon.js — end-to-end logo pipeline
 *
 * Usage:
 *   node cli/zikon.js "<prompt>" [--model <id>] [--output-dir <dir>] [--seed <int>] [--style <str>] [--size <px>[,<px>...]]
 *
 * stdout  : single JSON object (prompt, model, seed, png_path, svg_path, svg_inline)
 * stderr  : progress and debug output
 * exit 0  : success
 * exit 1  : PNG generation error (generate.py failed)
 * exit 2  : SVG tracing error (tracer subprocess failed)
 * exit 3  : invalid or missing arguments
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { Command } = require("commander");
const { optimize: optimize_svg } = require("svgo");

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const EXIT_SUCCESS = 0;
const EXIT_GENERATION_ERROR = 1;
const EXIT_TRACE_ERROR = 2;
const EXIT_INVALID_ARGUMENTS = 3;
const DEFAULT_SVG_SIZE = 1024;

// In dev mode (node cli/zikon.js), __dirname is the cli/ directory and scripts/
// lives one level up at the project root.  When compiled with `bun build --compile`,
// __dirname resolves to the directory of the executable; scripts/ is co-located
// there (copied by scripts/build.js).  Detect which layout is active at runtime.
const _scripts_at_parent = path.join(__dirname, "..", "scripts");
const PROJECT_ROOT = fs.existsSync(_scripts_at_parent)
  ? path.join(__dirname, "..")  // dev mode: scripts/ at project root
  : __dirname;                  // compiled binary: scripts/ alongside executable
const GENERATE_PY = path.join(PROJECT_ROOT, "scripts", "generate", "generate.py");
const GENERATE_PROJECT = path.join(PROJECT_ROOT, "scripts", "generate");
const IMAGETRACER_JS = path.join(
  PROJECT_ROOT,
  "scripts",
  "trace",
  "node_modules",
  "imagetracerjs",
  "imagetracer_v1.2.6.js"
);
const PNGREADER_JS = path.join(
  PROJECT_ROOT,
  "scripts",
  "trace",
  "node_modules",
  "imagetracerjs",
  "nodecli",
  "PNGReader.js"
);

const COPY_IGNORES = new Set([
  "node_modules",
  ".venv",
  "__pycache__",
  ".pytest_cache",
  ".ruff_cache",
]);
const ZIKON_PATH_MARKER_START = "# >>> zikon >>>";
const ZIKON_PATH_MARKER_END = "# <<< zikon <<<";
const MIN_GPU_VRAM_GB = 4;

// ---------------------------------------------------------------------------
// Install helpers
// ---------------------------------------------------------------------------

function get_platform() {
  return process.env.ZIKON_TEST_PLATFORM || process.platform;
}

function get_home_directory(platform) {
  if (platform === "win32") {
    return process.env.USERPROFILE || os.homedir();
  }
  return process.env.HOME || os.homedir();
}

function get_install_dir() {
  return path.join(get_home_directory(get_platform()), ".zikon");
}

function parse_install_arguments(raw_args) {
  if (raw_args.length === 0) {
    return { ok: true, installation_path: null };
  }

  if (raw_args.length === 1 && raw_args[0].startsWith("--installation-path=")) {
    const value = raw_args[0].slice("--installation-path=".length);
    if (!value) {
      return { ok: false };
    }
    return { ok: true, installation_path: path.resolve(value) };
  }

  if (raw_args.length === 2 && raw_args[0] === "--installation-path") {
    if (!raw_args[1] || raw_args[1].startsWith("--")) {
      return { ok: false };
    }
    return { ok: true, installation_path: path.resolve(raw_args[1]) };
  }

  return { ok: false };
}

function write_stderr(message) {
  process.stderr.write(message);
}

function copy_tree(source_dir, destination_dir) {
  fs.mkdirSync(destination_dir, { recursive: true });
  for (const entry of fs.readdirSync(source_dir, { withFileTypes: true })) {
    if (COPY_IGNORES.has(entry.name)) {
      continue;
    }
    const source_path = path.join(source_dir, entry.name);
    const destination_path = path.join(destination_dir, entry.name);
    if (entry.isDirectory()) {
      copy_tree(source_path, destination_path);
      continue;
    }
    fs.copyFileSync(source_path, destination_path);
  }
}

function run_command(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.stdout) {
    write_stderr(result.stdout);
  }
  if (result.stderr) {
    write_stderr(result.stderr);
  }
  return result;
}

function run_probe_command(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function get_forced_missing_tools() {
  const raw = process.env.ZIKON_TEST_FORCE_MISSING_TOOLS || "";
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  );
}

function has_command(command) {
  const forced_missing = get_forced_missing_tools();
  if (forced_missing.has(command)) {
    return false;
  }
  const result = run_probe_command(command, ["--version"]);
  if (result.error && result.error.code === "ENOENT") {
    return false;
  }
  return true;
}

function validate_install_dependencies() {
  const missing_messages = [];

  if (!has_command("bun")) {
    missing_messages.push("bun not found - install with: curl -fsSL https://bun.sh/install | bash");
  }
  if (!has_command("node")) {
    missing_messages.push("node not found - install from: https://nodejs.org/en/download");
  }
  if (!has_command("uv")) {
    missing_messages.push("uv not found - install with: curl -Ls https://astral.sh/uv/install.sh | sh");
  }
  if (!has_command("npm") && !has_command("pnpm")) {
    missing_messages.push(
      "npm/pnpm not found - install npm (bundled with Node.js) or pnpm: https://pnpm.io/installation"
    );
  }

  return {
    ok: missing_messages.length === 0,
    missing_messages,
  };
}

function parse_vram_gb_from_mb(megabytes_text) {
  const parsed = Number.parseFloat(String(megabytes_text).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed / 1024;
}

function parse_vram_gb_from_bytes(bytes_text) {
  const parsed = Number.parseFloat(String(bytes_text).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed / (1024 * 1024 * 1024);
}

function detect_nvidia_gpu() {
  const result = run_probe_command("nvidia-smi", [
    "--query-gpu=name,memory.total",
    "--format=csv,noheader,nounits",
  ]);
  if (result.error || result.status !== 0) {
    return null;
  }
  const first_line = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!first_line) {
    return null;
  }
  const [name, memory_mb] = first_line.split(",").map((part) => part.trim());
  const vram_gb = parse_vram_gb_from_mb(memory_mb || "");
  return {
    vendor: "nvidia",
    name: name || "Unknown NVIDIA GPU",
    vram_gb: vram_gb,
  };
}

function detect_amd_gpu() {
  const result = run_probe_command("rocm-smi", ["--showproductname", "--showmeminfo", "vram", "--json"]);
  if (result.error || result.status !== 0) {
    return null;
  }

  const json_text = result.stdout.trim();
  if (json_text.length > 0) {
    try {
      const parsed = JSON.parse(json_text);
      const card = Object.values(parsed)[0] || {};
      const name =
        card["Card series"] ||
        card["Card model"] ||
        card["Product Name"] ||
        "Unknown AMD GPU";
      const vram_gb = parse_vram_gb_from_bytes(card["VRAM Total Memory (B)"] || card["VRAM Total Used Memory (B)"] || "");
      return { vendor: "amd", name: String(name), vram_gb };
    } catch {
      // fall through to regex parsing
    }
  }

  const name_match = result.stdout.match(/Card (?:series|model)\s*:\s*(.+)/i);
  const bytes_match = result.stdout.match(/VRAM Total Memory \(B\)\s*:\s*([0-9]+)/i);
  return {
    vendor: "amd",
    name: name_match ? name_match[1].trim() : "Unknown AMD GPU",
    vram_gb: bytes_match ? parse_vram_gb_from_bytes(bytes_match[1]) : null,
  };
}

function get_arch() {
  return process.env.ZIKON_TEST_ARCH || process.arch;
}

function detect_apple_silicon_gpu(platform) {
  if (platform !== "darwin" || get_arch() !== "arm64") {
    return null;
  }

  let name = "Apple Silicon";
  const cpu_result = run_probe_command("sysctl", ["-n", "machdep.cpu.brand_string"]);
  if (!cpu_result.error && cpu_result.status === 0 && cpu_result.stdout.trim()) {
    name = cpu_result.stdout.trim();
  }

  let vram_gb = null;
  const hw_result = run_probe_command("system_profiler", ["SPHardwareDataType"]);
  if (!hw_result.error && hw_result.status === 0) {
    const memory_match = hw_result.stdout.match(/Memory:\s*([0-9.]+)\s*GB/i);
    if (memory_match) {
      vram_gb = Number.parseFloat(memory_match[1]);
    }
  }

  return {
    vendor: "apple",
    name,
    vram_gb,
  };
}

function detect_test_gpu_override() {
  const profile = process.env.ZIKON_TEST_GPU_PROFILE;
  if (!profile) {
    return null;
  }

  const vram_text = process.env.ZIKON_TEST_GPU_VRAM_GB;
  const vram_gb = vram_text == null ? null : Number.parseFloat(vram_text);
  const safe_vram = Number.isFinite(vram_gb) ? vram_gb : null;

  if (profile === "nvidia") {
    return {
      vendor: "nvidia",
      name: process.env.ZIKON_TEST_GPU_NAME || "Test NVIDIA GPU",
      vram_gb: safe_vram,
    };
  }
  if (profile === "amd") {
    return {
      vendor: "amd",
      name: process.env.ZIKON_TEST_GPU_NAME || "Test AMD GPU",
      vram_gb: safe_vram,
    };
  }
  if (profile === "apple") {
    return {
      vendor: "apple",
      name: process.env.ZIKON_TEST_GPU_NAME || "Test Apple Silicon",
      vram_gb: safe_vram,
    };
  }
  if (profile === "none") {
    return {
      vendor: "none",
      name: process.env.ZIKON_TEST_GPU_NAME || "No supported GPU detected",
      vram_gb: safe_vram,
    };
  }

  if (profile === "auto") {
    return null;
  }

  return {
    vendor: "none",
    name: `Unknown test GPU profile: ${profile}`,
    vram_gb: safe_vram,
  };
}

function detect_gpu(platform) {
  const override = detect_test_gpu_override();
  if (override) {
    return override;
  }

  const nvidia = detect_nvidia_gpu();
  if (nvidia) {
    return nvidia;
  }
  const amd = detect_amd_gpu();
  if (amd) {
    return amd;
  }
  const apple = detect_apple_silicon_gpu(platform);
  if (apple) {
    return apple;
  }
  return {
    vendor: "none",
    name: "No supported GPU detected",
    vram_gb: null,
  };
}

function select_torch_backend(gpu_info) {
  if (gpu_info.vendor === "nvidia" && (gpu_info.vram_gb || 0) >= MIN_GPU_VRAM_GB) {
    return { backend: "cuda", warning: null };
  }
  if (gpu_info.vendor === "amd" && (gpu_info.vram_gb || 0) >= MIN_GPU_VRAM_GB) {
    return { backend: "rocm", warning: null };
  }
  if (gpu_info.vendor === "apple") {
    return { backend: "mps", warning: null };
  }
  return {
    backend: "cpu",
    warning: "[zikon] WARNING: No supported high-memory GPU found; CPU-only PyTorch may be too slow or unsupported.",
  };
}

function get_venv_python_path(generate_dir, platform) {
  if (platform === "win32") {
    return path.join(generate_dir, ".venv", "Scripts", "python.exe");
  }
  return path.join(generate_dir, ".venv", "bin", "python");
}

function install_torch_backend(generate_dir, platform, backend) {
  const python_path = get_venv_python_path(generate_dir, platform);
  const args = ["pip", "install", "--python", python_path, "--upgrade"];
  if (backend === "cuda") {
    args.push("--index-url", "https://download.pytorch.org/whl/cu124");
  } else if (backend === "rocm") {
    args.push("--index-url", "https://download.pytorch.org/whl/rocm6.2.4");
  } else if (backend === "cpu") {
    args.push("--index-url", "https://download.pytorch.org/whl/cpu");
  }
  args.push("torch");

  const result = run_command("uv", args, generate_dir);
  if (result.status !== 0) {
    throw new Error(`Failed to install PyTorch backend "${backend}".`);
  }
}

function install_node_dependencies(project_dir) {
  const npm_result = run_command("npm", ["install"], project_dir);
  if (npm_result.status === 0) {
    return;
  }
  if (npm_result.error && npm_result.error.code === "ENOENT") {
    const pnpm_result = run_command("pnpm", ["install"], project_dir);
    if (pnpm_result.status === 0) {
      return;
    }
    throw new Error("Failed to install Node dependencies with pnpm.");
  }
  throw new Error("Failed to install Node dependencies with npm.");
}

function ensure_profile_path_entry(profile_path, bin_dir) {
  const path_line = `export PATH="${bin_dir}:$PATH"`;
  const managed_block = `${ZIKON_PATH_MARKER_START}\n${path_line}\n${ZIKON_PATH_MARKER_END}\n`;
  let current_content = "";
  if (fs.existsSync(profile_path)) {
    current_content = fs.readFileSync(profile_path, "utf8");
  }
  if (current_content.includes(ZIKON_PATH_MARKER_START) || current_content.includes(path_line)) {
    return;
  }
  const separator = current_content.length > 0 && !current_content.endsWith("\n") ? "\n" : "";
  fs.writeFileSync(profile_path, `${current_content}${separator}${managed_block}`, "utf8");
}

function write_unix_shim(bin_dir, install_dir) {
  const shim_path = path.join(bin_dir, "zikon");
  const script = `#!/usr/bin/env bash
node "${path.join(install_dir, "cli", "zikon.js")}" "$@"
`;
  fs.writeFileSync(shim_path, script, "utf8");
  fs.chmodSync(shim_path, 0o755);
}

function write_windows_shim(bin_dir) {
  const shim_path = path.join(bin_dir, "zikon.cmd");
  const script = "@echo off\r\nnode \"%~dp0\\..\\cli\\zikon.js\" %*\r\n";
  fs.writeFileSync(shim_path, script, "utf8");
}

function ensure_writable_install_dir(install_dir) {
  try {
    fs.mkdirSync(install_dir, { recursive: true });
    const probe = path.join(install_dir, `.zikon-write-check-${process.pid}-${Date.now()}`);
    fs.writeFileSync(probe, "ok", "utf8");
    fs.unlinkSync(probe);
  } catch (err) {
    throw new Error(
      `Installation path "${install_dir}" is not writable or cannot be created: ${err.message}`
    );
  }
}

function install_runtime(install_dir, platform) {
  const cli_dir = path.join(install_dir, "cli");
  const scripts_dir = path.join(install_dir, "scripts");
  const generate_dir = path.join(scripts_dir, "generate");
  const trace_dir = path.join(scripts_dir, "trace");
  const bin_dir = path.join(install_dir, "bin");

  ensure_writable_install_dir(install_dir);
  copy_tree(path.join(PROJECT_ROOT, "cli"), cli_dir);
  copy_tree(path.join(PROJECT_ROOT, "scripts", "generate"), generate_dir);
  copy_tree(path.join(PROJECT_ROOT, "scripts", "trace"), trace_dir);
  fs.mkdirSync(bin_dir, { recursive: true });

  if (platform === "win32") {
    write_windows_shim(bin_dir);
  } else {
    write_unix_shim(bin_dir, install_dir);
  }

  write_stderr("[zikon] Installing Python dependencies with uv...\n");
  const uv_result = run_command("uv", ["sync"], generate_dir);
  if (uv_result.status !== 0) {
    throw new Error("uv sync failed for scripts/generate.");
  }

  const gpu_info = detect_gpu(platform);
  const selected = select_torch_backend(gpu_info);
  const vram_text = gpu_info.vram_gb == null ? "unknown" : `${gpu_info.vram_gb.toFixed(2)} GB`;
  write_stderr(
    `[zikon] GPU detected: vendor=${gpu_info.vendor}, name="${gpu_info.name}", vram=${vram_text}\n`
  );
  write_stderr(`[zikon] Selected PyTorch backend: ${selected.backend}\n`);
  if (selected.warning) {
    write_stderr(`${selected.warning}\n`);
  }
  install_torch_backend(generate_dir, platform, selected.backend);

  write_stderr("[zikon] Installing Node dependencies for cli/...\n");
  install_node_dependencies(cli_dir);
  write_stderr("[zikon] Installing Node dependencies for scripts/trace/...\n");
  install_node_dependencies(trace_dir);

  if (platform === "win32") {
    write_stderr(`[zikon] Add "${bin_dir}" to PATH manually, then open a new terminal.\n`);
    return;
  }

  const home_dir = get_home_directory(platform);
  ensure_profile_path_entry(path.join(home_dir, ".bashrc"), bin_dir);
  ensure_profile_path_entry(path.join(home_dir, ".zshrc"), bin_dir);
  write_stderr(`[zikon] Added "${bin_dir}" to ~/.bashrc and ~/.zshrc if needed.\n`);
}

// ---------------------------------------------------------------------------
// PNG → SVG via imagetracerjs
// ---------------------------------------------------------------------------

/**
 * @param {string} pngPath  Absolute path to the PNG file.
 * @returns {Promise<string>}  SVG markup string.
 */
function pngToSvg(pngPath) {
  if (process.env.ZIKON_TEST_TRACE_COUNT_FILE) {
    fs.appendFileSync(process.env.ZIKON_TEST_TRACE_COUNT_FILE, "trace\n", "utf8");
  }
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ImageTracer = require(IMAGETRACER_JS);
    const PNGReader = require(PNGREADER_JS);

    let bytes;
    try {
      bytes = fs.readFileSync(pngPath);
    } catch (err) {
      return reject(err);
    }

    const reader = new PNGReader(bytes);
    reader.parse((err, png) => {
      if (err) return reject(err);
      const imageData = { width: png.width, height: png.height, data: png.pixels };
      const svgString = ImageTracer.imagedataToSVG(imageData, {});
      resolve(svgString);
    });
  });
}

function parse_size_list(raw_sizes) {
  if (typeof raw_sizes !== "string" || raw_sizes.trim() === "") {
    throw new Error("--size must be a comma-separated list of integers.");
  }

  const parsed = [];
  const seen = new Set();
  for (const token of raw_sizes.split(",")) {
    const trimmed = token.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new Error(`Invalid --size value "${trimmed}". Expected positive integers.`);
    }
    const value = Number.parseInt(trimmed, 10);
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`Invalid --size value "${trimmed}". Expected positive integers.`);
    }
    if (!seen.has(value)) {
      parsed.push(value);
      seen.add(value);
    }
  }

  if (parsed.length === 0) {
    throw new Error("--size must include at least one integer.");
  }
  return parsed;
}

function rewrite_svg_dimensions(svg_markup, size) {
  const open_tag_match = svg_markup.match(/<svg\b[^>]*>/i);
  if (!open_tag_match) {
    throw new Error("Tracer returned invalid SVG content.");
  }
  const open_tag = open_tag_match[0];
  const without_dimensions = open_tag
    .replace(/\swidth=(?:"[^"]*"|'[^']*')/gi, "")
    .replace(/\sheight=(?:"[^"]*"|'[^']*')/gi, "")
    .replace(/\sviewBox=(?:"[^"]*"|'[^']*')/gi, "");
  const resized_tag = without_dimensions.replace(
    /^<svg\b/i,
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"`
  );
  return svg_markup.replace(open_tag, resized_tag);
}

function optimize_svg_markup(svg_markup, output_path) {
  const result = optimize_svg(svg_markup, {
    path: output_path,
    multipass: true,
    plugins: [
      {
        name: "preset-default",
        params: {
          overrides: {
            removeViewBox: false,
          },
        },
      },
    ],
  });
  if (result.error) {
    throw new Error(result.error);
  }
  if (process.env.ZIKON_TEST_SVGO_COUNT_FILE) {
    fs.appendFileSync(process.env.ZIKON_TEST_SVGO_COUNT_FILE, "svgo\n", "utf8");
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (process.argv[2] === "install") {
    const parsed_install = parse_install_arguments(process.argv.slice(3));
    if (!parsed_install.ok) {
      write_stderr("Usage: zikon install [--installation-path <path>]\n");
      process.exit(EXIT_INVALID_ARGUMENTS);
    }
    const dependencies = validate_install_dependencies();
    if (!dependencies.ok) {
      write_stderr("[zikon] Missing required runtime tools:\n");
      for (const message of dependencies.missing_messages) {
        write_stderr(`[zikon] - ${message}\n`);
      }
      process.exit(EXIT_GENERATION_ERROR);
    }
    try {
      const install_dir = parsed_install.installation_path || get_install_dir();
      const platform = get_platform();
      write_stderr(`[zikon] Installing into "${install_dir}"...\n`);
      install_runtime(install_dir, platform);
      write_stderr("[zikon] Installation complete.\n");
      process.exit(EXIT_SUCCESS);
    } catch (err) {
      write_stderr(`[zikon] Install failed: ${err.message}\n`);
      process.exit(EXIT_GENERATION_ERROR);
    }
  }

  const program = new Command();
  program
    .name("zikon")
    .description("End-to-end logo generation pipeline: prompt → PNG → SVG")
    .argument("<prompt>", "text prompt describing the logo to generate")
    .option("--model <id>", "model to use: z-image-turbo, sdxl, or a HuggingFace repo ID", "z-image-turbo")
    .option("--output-dir <dir>", "directory to write output files", "./out")
    .option("--seed <int>", "integer seed for deterministic generation")
    .option("--style <str>", "style preset to apply to the prompt")
    .option(
      "--size <px>[,<px>...]",
      "comma-separated output SVG sizes in px (PNG generation remains 1024x1024)",
      String(DEFAULT_SVG_SIZE)
    )
    .configureOutput({
      writeOut: (str) => process.stderr.write(str),
      writeErr: (str) => process.stderr.write(str),
    })
    .exitOverride();

  // Parse arguments — throws on invalid/missing args (commander.exitOverride)
  try {
    program.parse(process.argv);
  } catch (err) {
    // commander already wrote the error message to stderr; also print help
    program.outputHelp();
    process.exit(EXIT_INVALID_ARGUMENTS);
  }

  const opts = program.opts();
  const prompt = program.args[0];
  let requested_sizes;
  try {
    requested_sizes = parse_size_list(opts.size);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    program.outputHelp();
    process.exit(EXIT_INVALID_ARGUMENTS);
  }

  // Resolve output directory
  const outputDir = path.resolve(opts.outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  // Derive a filesystem-safe base name from the prompt
  const safeName =
    prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "output";

  const pngPath = path.join(outputDir, `${safeName}.png`);

  // Build the effective prompt: append style hint if provided (US-004)
  const effectivePrompt = opts.style ? `${prompt}, ${opts.style}` : prompt;

  // Build generate.py invocation
  const pyArgs = [
    GENERATE_PY,
    "--prompt", effectivePrompt,
    "--model", opts.model,
    "--output", pngPath,
  ];
  if (opts.seed !== undefined) {
    pyArgs.push("--seed", String(opts.seed));
  }

  process.stderr.write("[zikon] Generating PNG...\n");
  const genResult = spawnSync("uv", ["run", "--project", GENERATE_PROJECT, ...pyArgs], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (genResult.stderr) process.stderr.write(genResult.stderr);

  if (genResult.status !== 0) {
    process.stderr.write(`[zikon] generate.py exited with code ${genResult.status}\n`);
    // generate.py exit 3 means invalid arguments → propagate as exit 3
    if (genResult.status === EXIT_INVALID_ARGUMENTS) {
      program.outputHelp();
      process.exit(EXIT_INVALID_ARGUMENTS);
    }
    process.exit(EXIT_GENERATION_ERROR);
  }

  // Parse generate.py JSON output
  let genPayload;
  try {
    genPayload = JSON.parse(genResult.stdout.trim());
  } catch (err) {
    process.stderr.write(`[zikon] Failed to parse generate.py output: ${err.message}\n`);
    process.exit(EXIT_GENERATION_ERROR);
  }

  // Trace PNG → SVG once, then derive all requested size variants from this source.
  process.stderr.write("[zikon] Tracing PNG to SVG...\n");
  let tracedSvgInline;
  try {
    tracedSvgInline = await pngToSvg(pngPath);
  } catch (err) {
    process.stderr.write(`[zikon] SVG tracing failed: ${err.message}\n`);
    process.exit(EXIT_TRACE_ERROR);
  }

  let svg_files;
  try {
    svg_files = requested_sizes.map((size) => {
      const output_name =
        requested_sizes.length === 1 && size === DEFAULT_SVG_SIZE
          ? `${safeName}.svg`
          : `${safeName}_${size}.svg`;
      const sized_path = path.join(outputDir, output_name);
      const resized = rewrite_svg_dimensions(tracedSvgInline, size);
      const optimized = optimize_svg_markup(resized, sized_path);
      fs.writeFileSync(sized_path, optimized, "utf8");
      return {
        size,
        svg_path: sized_path,
        svg_inline: optimized,
      };
    });
  } catch (err) {
    process.stderr.write(`[zikon] SVG post-processing failed: ${err.message}\n`);
    process.exit(EXIT_TRACE_ERROR);
  }
  const primary_svg = svg_files[0] || null;
  const has_single_svg_variant = svg_files.length === 1;

  // Emit final JSON to stdout (only line on stdout)
  const result = {
    prompt: prompt,
    model: opts.model,
    seed: genPayload.seed,
    png_path: pngPath,
    svg_path: has_single_svg_variant ? primary_svg.svg_path : null,
    svg_inline: has_single_svg_variant ? primary_svg.svg_inline : null,
    svg_files,
  };
  process.stdout.write(JSON.stringify(result) + "\n");
}

main().catch((err) => {
  process.stderr.write(`[zikon] Unexpected error: ${err.message}\n`);
  process.exit(EXIT_GENERATION_ERROR);
});
