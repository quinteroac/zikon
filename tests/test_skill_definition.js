"use strict";

/**
 * Acceptance-criteria tests for US-001: Skill interface definition.
 *
 * Run: node --test tests/test_skill_definition.js
 *      (from the project root)
 */

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const SKILL_PATH = path.resolve(
  __dirname,
  "..",
  ".agents",
  "skills",
  "zikon",
  "SKILL.md"
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readSkill() {
  return fs.readFileSync(SKILL_PATH, "utf8");
}

/**
 * Minimal YAML frontmatter parser — extracts the block between the first two
 * `---` delimiters and returns it as a plain string for assertion purposes.
 */
function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error("No YAML frontmatter found in SKILL.md");
  return match[1];
}

// ---------------------------------------------------------------------------
// US-001-AC01: File exists and follows the Vercel Labs skills schema
// ---------------------------------------------------------------------------

test("US-001-AC01: .agents/skills/zikon/SKILL.md exists", () => {
  assert.ok(fs.existsSync(SKILL_PATH), `Expected file at ${SKILL_PATH}`);
});

test("US-001-AC01: file has YAML frontmatter delimited by ---", () => {
  const content = readSkill();
  assert.match(content, /^---\n[\s\S]*?\n---/, "Missing YAML frontmatter block");
});

test("US-001-AC01: frontmatter contains required schema fields (name, description, parameters, returns)", () => {
  const fm = extractFrontmatter(readSkill());
  assert.match(fm, /^name:/m, "Missing 'name' field");
  assert.match(fm, /^description:/m, "Missing 'description' field");
  assert.match(fm, /^parameters:/m, "Missing 'parameters' field");
  assert.match(fm, /^returns:/m, "Missing 'returns' field");
});

// ---------------------------------------------------------------------------
// US-001-AC02: Typed parameters declared
// ---------------------------------------------------------------------------

test("US-001-AC02: 'prompt' parameter declared as string and required", () => {
  const fm = extractFrontmatter(readSkill());
  assert.match(fm, /name:\s*prompt/, "Missing 'prompt' parameter");
  assert.match(fm, /type:\s*string/, "Missing string type for 'prompt'");
  assert.match(fm, /required:\s*true/, "prompt must be required: true");
});

test("US-001-AC02: 'model' parameter declared as optional string with default z-image-turbo", () => {
  const fm = extractFrontmatter(readSkill());
  assert.match(fm, /name:\s*model/, "Missing 'model' parameter");
  assert.match(fm, /default:\s*z-image-turbo/, "Missing default 'z-image-turbo' for model");
});

test("US-001-AC02: 'style' parameter declared as optional string", () => {
  const fm = extractFrontmatter(readSkill());
  assert.match(fm, /name:\s*style/, "Missing 'style' parameter");
});

test("US-001-AC02: 'output_dir' parameter declared as optional string", () => {
  const fm = extractFrontmatter(readSkill());
  assert.match(fm, /name:\s*output_dir/, "Missing 'output_dir' parameter");
});

// ---------------------------------------------------------------------------
// US-001-AC03: Output contract documented
// ---------------------------------------------------------------------------

test("US-001-AC03: output contract lists all six required JSON fields", () => {
  const content = readSkill();
  const requiredFields = ["prompt", "model", "seed", "png_path", "svg_path", "svg_inline"];
  for (const field of requiredFields) {
    assert.ok(
      content.includes(field),
      `Output contract missing field '${field}'`
    );
  }
});

test("US-001-AC03: svg_inline described as starting with <svg", () => {
  const content = readSkill();
  assert.match(content, /<svg/, "svg_inline description must reference <svg markup");
});

// ---------------------------------------------------------------------------
// US-001-AC04: Usage example with minimal invocation
// ---------------------------------------------------------------------------

test("US-001-AC04: file includes minimal invocation example /zikon \"rocket icon\"", () => {
  const content = readSkill();
  assert.match(
    content,
    /\/zikon\s+"rocket icon"/,
    'Missing minimal usage example: /zikon "rocket icon"'
  );
});
