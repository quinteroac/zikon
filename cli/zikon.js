#!/usr/bin/env node
"use strict";

/**
 * zikon.js — end-to-end logo pipeline
 *
 * Usage:
 *   node cli/zikon.js "<prompt>" [--model <id>] [--output-dir <dir>] [--seed <int>] [--style <str>]
 *
 * stdout  : single JSON object (prompt, model, seed, png_path, svg_path, svg_inline)
 * stderr  : progress and debug output
 * exit 0  : success
 * exit 1  : PNG generation error (generate.py failed)
 * exit 2  : SVG tracing error (tracer subprocess failed)
 * exit 3  : invalid or missing arguments
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { Command } = require("commander");

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const PROJECT_ROOT = path.join(__dirname, "..");
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

// ---------------------------------------------------------------------------
// Argument parsing (commander.js)
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name("zikon")
  .description("End-to-end logo generation pipeline: prompt → PNG → SVG")
  .argument("<prompt>", "text prompt describing the logo to generate")
  .option("--model <id>", "model to use: z-image-turbo, sdxl, or a HuggingFace repo ID", "z-image-turbo")
  .option("--output-dir <dir>", "directory to write output files", "./out")
  .option("--seed <int>", "integer seed for deterministic generation")
  .option("--style <str>", "style preset to apply to the prompt")
  .configureOutput({
    writeOut: (str) => process.stderr.write(str),
    writeErr: (str) => process.stderr.write(str),
  })
  .exitOverride();

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
  // Parse arguments — throws on invalid/missing args (commander.exitOverride)
  try {
    program.parse(process.argv);
  } catch (err) {
    // commander already wrote the error message to stderr; also print help
    program.outputHelp();
    process.exit(3);
  }

  const opts = program.opts();
  const prompt = program.args[0];

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
  const svgPath = path.join(outputDir, `${safeName}.svg`);

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
    if (genResult.status === 3) {
      program.outputHelp();
      process.exit(3);
    }
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
    process.exit(2);
  }

  // Write SVG file
  fs.writeFileSync(svgPath, svgInline, "utf8");

  // Emit final JSON to stdout (only line on stdout)
  const result = {
    prompt: prompt,
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
