"use strict";

/**
 * Zikon skill entry point.
 *
 * Exports the skill definition so that Vercel Labs `@vercel/skill` tooling
 * (`npx skills add zikon` or `npx skills add ./path/to/skill`) can discover,
 * install, and register the skill in an AI agent environment.
 *
 * After installation `/zikon` becomes a valid agent invocation that delegates
 * to `node cli/zikon.js` and returns a JSON object with six fields:
 * prompt, model, seed, png_path, svg_path, svg_inline.
 */

const fs = require("node:fs");
const path = require("node:path");

const SKILL_MD = path.resolve(__dirname, "SKILL.md");

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
};

module.exports = skill;
