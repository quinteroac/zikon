"use strict";

/**
 * Zikon skill entry point — installable via:
 *   npx skills add https://github.com/quinteroac/zikon/zikon-skills
 *
 * Exports the skill definition so that Vercel Labs `@vercel/skill` tooling
 * can discover, install, and register the skill in an AI agent environment.
 *
 * After installation `/zikon` becomes a valid agent invocation that delegates
 * to `node cli/zikon.js` and returns a JSON object with six fields:
 * prompt, model, seed, png_path, svg_path, svg_inline.
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SKILL_MD = path.resolve(__dirname, "SKILL.md");

/**
 * Programmatically invoke the Zikon pipeline.
 *
 * @param {object} params
 * @param {string}  params.prompt      - Text description of the logo/icon (required).
 * @param {string} [params.model]      - Diffusion model ID (default: "z-image-turbo").
 * @param {string} [params.style]      - Style hint appended to the prompt.
 * @param {string} [params.output_dir] - Directory for generated files.
 * @returns {{ prompt: string, model: string, seed: number, png_path: string, svg_path: string, svg_inline: string }}
 */
function run(params = {}) {
  const { prompt, model, style, output_dir } = params;

  if (!prompt) throw new Error("run(params): 'prompt' is required");

  const args = [prompt];
  if (model)      args.push("--model", model);
  if (style)      args.push("--style", style);
  if (output_dir) args.push("--output-dir", output_dir);

  // Resolve invocation: prefer local repo CLI (one level up from zikon-skills/),
  // fall back to the installed `zikon` shim created by `zikon install`.
  const localCli = path.resolve(__dirname, "..", "cli", "zikon.js");
  let result;

  if (fs.existsSync(localCli)) {
    result = spawnSync("node", [localCli, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 20 * 1024 * 1024,
    });
  } else {
    result = spawnSync("zikon", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 20 * 1024 * 1024,
    });
  }

  if (result.status !== 0) {
    throw new Error(
      `zikon exited ${result.status}: ${result.stderr || result.error?.message}`
    );
  }

  return JSON.parse(result.stdout.trim());
}

const skill = {
  name: "zikon",
  description:
    "Generate an SVG logo from a text prompt using Zikon's pipeline " +
    "(prompt → PNG → SVG). Returns a JSON object with paths and inline SVG markup.",
  invocation: "/zikon",
  definition: fs.readFileSync(SKILL_MD, "utf8"),
  parameters: [
    {
      name: "prompt",
      type: "string",
      description: "Text description of the logo or icon to generate.",
      required: true,
    },
    {
      name: "model",
      type: "string",
      description:
        'Diffusion model to use. Accepts "z-image-turbo", "sdxl", a HuggingFace repo ID, or a local directory path.',
      required: false,
      default: "z-image-turbo",
    },
    {
      name: "style",
      type: "string",
      description:
        'Optional style hint (e.g. "flat", "outline", "gradient") appended to the prompt during generation.',
      required: false,
    },
    {
      name: "output_dir",
      type: "string",
      description:
        "Directory where the generated PNG and SVG files will be saved. Created automatically if it does not exist.",
      required: false,
    },
  ],
  run,
};

module.exports = skill;
