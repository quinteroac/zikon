#!/usr/bin/env node
"use strict";

/**
 * build.js — cross-platform Bun compile script
 *
 * Produces three standalone binaries in dist/:
 *   zikon-linux        (bun-linux-x64)
 *   zikon-macos        (bun-darwin-x64)
 *   zikon-windows.exe  (bun-windows-x64)
 *
 * Also copies scripts/ (excluding generated artifacts) alongside
 * the binaries as dist/scripts/ so compiled executables can locate
 * the Python generate pipeline and Node tracer at runtime.
 *
 * Usage:
 *   bun run build
 *   node scripts/build.js
 *
 * Exit codes:
 *   0  all targets compiled successfully
 *   1  one or more targets failed
 */

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const ENTRY = path.join(ROOT, "cli", "zikon.js");

const TARGETS = [
  { target: "bun-linux-x64",   outfile: "zikon-linux" },
  { target: "bun-darwin-x64",  outfile: "zikon-macos" },
  { target: "bun-windows-x64", outfile: "zikon-windows.exe" },
];

const COPY_IGNORES = new Set([
  "node_modules",
  ".venv",
  "__pycache__",
  ".pytest_cache",
  ".ruff_cache",
  ".mypy_cache",
]);

function copy_tree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (COPY_IGNORES.has(entry.name)) {
      continue;
    }
    const src_path = path.join(src, entry.name);
    const dst_path = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copy_tree(src_path, dst_path);
    } else {
      fs.copyFileSync(src_path, dst_path);
    }
  }
}

fs.mkdirSync(DIST, { recursive: true });

let all_ok = true;

for (const { target, outfile } of TARGETS) {
  const out_path = path.join(DIST, outfile);
  process.stderr.write(`[build] Compiling ${outfile} (${target})...\n`);

  const result = spawnSync(
    "bun",
    ["build", "--compile", `--target=${target}`, `--outfile=${out_path}`, ENTRY],
    { cwd: ROOT, stdio: "inherit" }
  );

  if (result.error) {
    process.stderr.write(`[build] Error spawning bun: ${result.error.message}\n`);
    all_ok = false;
    continue;
  }

  if (result.status !== 0) {
    process.stderr.write(`[build] FAILED: ${outfile} (exit ${result.status})\n`);
    all_ok = false;
  } else {
    process.stderr.write(`[build] OK: ${out_path}\n`);
  }
}

if (!all_ok) {
  process.stderr.write("[build] One or more targets failed.\n");
  process.exit(1);
}

const scripts_src = path.join(ROOT, "scripts");
const scripts_dst = path.join(DIST, "scripts");

process.stderr.write("[build] Copying scripts/ alongside binaries...\n");
copy_tree(scripts_src, scripts_dst);

process.stderr.write(`[build] Done. Artifacts in: ${DIST}\n`);
