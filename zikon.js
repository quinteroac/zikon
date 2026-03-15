#!/usr/bin/env node
"use strict";

/**
 * zikon.js — end-to-end logo pipeline
 *
 * Usage:
 *   node zikon.js "<prompt>" [--model <id>] [--output-dir <dir>] [--seed <int>] [--style <str>]
 *
 * stdout  : single JSON object (prompt, model, seed, png_path, svg_path, svg_inline)
 * stderr  : progress and debug output
 * exit 0  : success
 * exit 1  : generation or tracing error
 * exit 3  : invalid arguments
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const SCRIPT_DIR = __dirname;
const GENERATE_PY = path.join(SCRIPT_DIR, "scripts", "generate", "generate.py");
const IMAGETRACER_JS = path.join(
  SCRIPT_DIR,
  "scripts",
  "trace",
  "node_modules",
  "imagetracerjs",
  "imagetracer_v1.2.6.js"
);
const PNGREADER_JS = path.join(
  SCRIPT_DIR,
  "scripts",
  "trace",
  "node_modules",
  "imagetracerjs",
  "nodecli",
  "PNGReader.js"
);

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

/**
 * @param {string[]} argv
 * @returns {{ prompt: string|null, model: string, outputDir: string, seed: number|null, style: string|null }}
 */
function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    prompt: null,
    model: "z-image-turbo",
    outputDir: "./out",
    seed: null,
    style: null,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--model") {
      opts.model = args[++i];
    } else if (arg === "--output-dir") {
      opts.outputDir = args[++i];
    } else if (arg === "--seed") {
      const parsed = parseInt(args[++i], 10);
      if (!Number.isNaN(parsed)) opts.seed = parsed;
    } else if (arg === "--style") {
      opts.style = args[++i];
    } else if (!arg.startsWith("--")) {
      opts.prompt = arg;
    }
    i++;
  }

  return opts;
}

// ---------------------------------------------------------------------------
// PNG → SVG via imagetracerjs
// ---------------------------------------------------------------------------

/**
 * @param {string} pngPath  Absolute path to the PNG file.
 * @returns {Promise<string>}  SVG markup string.
 */
function pngToSvg(pngPath) {
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv);

  if (!opts.prompt) {
    process.stderr.write("Error: a prompt is required as the first positional argument.\n");
    process.stderr.write("Usage: node zikon.js \"<prompt>\" [--model <id>] [--output-dir <dir>] [--seed <int>]\n");
    process.exit(3);
  }

  // Resolve output directory
  const outputDir = path.resolve(opts.outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  // Derive a filesystem-safe base name from the prompt
  const safeName =
    opts.prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "output";

  const pngPath = path.join(outputDir, `${safeName}.png`);
  const svgPath = path.join(outputDir, `${safeName}.svg`);

  // Build generate.py invocation
  const pyArgs = [
    GENERATE_PY,
    "--prompt", opts.prompt,
    "--model", opts.model,
    "--output", pngPath,
  ];
  if (opts.seed !== null) {
    pyArgs.push("--seed", String(opts.seed));
  }

  process.stderr.write("[zikon] Generating PNG...\n");
  const genResult = spawnSync("python3", pyArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (genResult.stderr) process.stderr.write(genResult.stderr);

  if (genResult.status !== 0) {
    process.stderr.write(`[zikon] generate.py exited with code ${genResult.status}\n`);
    process.exit(1);
  }

  // Parse generate.py JSON output
  let genPayload;
  try {
    genPayload = JSON.parse(genResult.stdout.trim());
  } catch (err) {
    process.stderr.write(`[zikon] Failed to parse generate.py output: ${err.message}\n`);
    process.exit(1);
  }

  // Trace PNG → SVG
  process.stderr.write("[zikon] Tracing PNG to SVG...\n");
  let svgInline;
  try {
    svgInline = await pngToSvg(pngPath);
  } catch (err) {
    process.stderr.write(`[zikon] SVG tracing failed: ${err.message}\n`);
    process.exit(1);
  }

  // Write SVG file
  fs.writeFileSync(svgPath, svgInline, "utf8");

  // Emit final JSON to stdout (only line on stdout)
  const result = {
    prompt: opts.prompt,
    model: opts.model,
    seed: genPayload.seed,
    png_path: pngPath,
    svg_path: svgPath,
    svg_inline: svgInline,
  };
  process.stdout.write(JSON.stringify(result) + "\n");
}

main().catch((err) => {
  process.stderr.write(`[zikon] Unexpected error: ${err.message}\n`);
  process.exit(1);
});
