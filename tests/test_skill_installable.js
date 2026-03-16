"use strict";

/**
 * Acceptance-criteria tests for US-002: Installation via Vercel Labs skills tooling.
 *
 * Run: node --test tests/test_skill_installable.js
 *      (from the project root)
 */

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const SKILL_DIR = path.resolve(__dirname, "..", ".agents", "skills", "zikon");
const PKG_PATH = path.join(SKILL_DIR, "package.json");
const SKILL_MD_PATH = path.join(SKILL_DIR, "SKILL.md");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readPkg() {
  const raw = fs.readFileSync(PKG_PATH, "utf8");
  return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// US-002-AC01: Skill is discoverable by `npx skills add zikon`
// ---------------------------------------------------------------------------

test("US-002-AC01: .agents/skills/zikon/package.json exists", () => {
  assert.ok(fs.existsSync(PKG_PATH), `Expected package.json at ${PKG_PATH}`);
});

test("US-002-AC01: package name is 'zikon' so the skill is addressable by name", () => {
  const pkg = readPkg();
  assert.equal(pkg.name, "zikon", "package.json name must be 'zikon'");
});

// ---------------------------------------------------------------------------
// US-002-AC02: After installation /zikon is a valid invocation
// ---------------------------------------------------------------------------

test("US-002-AC02: index.js (main entry point) exists", () => {
  const pkg = readPkg();
  const mainPath = path.join(SKILL_DIR, pkg.main);
  assert.ok(
    fs.existsSync(mainPath),
    `Expected main entry point at ${mainPath}`
  );
});

test("US-002-AC02: index.js exports skill with invocation '/zikon'", () => {
  const skillModule = require(path.join(SKILL_DIR, "index.js"));
  assert.equal(
    skillModule.invocation,
    "/zikon",
    "skill.invocation must be '/zikon'"
  );
});

test("US-002-AC02: SKILL.md is readable from the entry point (skill.definition is non-empty)", () => {
  const skillModule = require(path.join(SKILL_DIR, "index.js"));
  assert.ok(
    typeof skillModule.definition === "string" && skillModule.definition.length > 0,
    "skill.definition must be a non-empty string sourced from SKILL.md"
  );
});

test("US-002-AC02: SKILL.md references /zikon invocation pattern", () => {
  const content = fs.readFileSync(SKILL_MD_PATH, "utf8");
  assert.match(content, /\/zikon/, "SKILL.md must include /zikon invocation");
});

// ---------------------------------------------------------------------------
// US-002-AC03: Required package.json fields are present and correct
// ---------------------------------------------------------------------------

test("US-002-AC03: package.json has 'name' field", () => {
  const pkg = readPkg();
  assert.ok(pkg.name, "package.json must have a 'name' field");
});

test("US-002-AC03: package.json has 'version' field", () => {
  const pkg = readPkg();
  assert.ok(pkg.version, "package.json must have a 'version' field");
});

test("US-002-AC03: package.json has 'description' field", () => {
  const pkg = readPkg();
  assert.ok(pkg.description, "package.json must have a 'description' field");
});

test("US-002-AC03: package.json has 'main' field", () => {
  const pkg = readPkg();
  assert.ok(pkg.main, "package.json must have a 'main' field");
});

test("US-002-AC03: package.json 'main' field points to an existing file", () => {
  const pkg = readPkg();
  const mainPath = path.join(SKILL_DIR, pkg.main);
  assert.ok(
    fs.existsSync(mainPath),
    `package.json 'main' (${pkg.main}) must point to an existing file`
  );
});

// ---------------------------------------------------------------------------
// US-002-AC04: Typecheck / lint passes (syntax check via node --check)
// ---------------------------------------------------------------------------

test("US-002-AC04: index.js passes Node.js syntax check", () => {
  const { execFileSync } = require("node:child_process");
  const mainPath = path.join(SKILL_DIR, "index.js");
  // node --check exits 0 on valid syntax, non-zero on syntax error
  assert.doesNotThrow(() => {
    execFileSync(process.execPath, ["--check", mainPath], { stdio: "pipe" });
  }, "index.js must pass node --check (no syntax errors)");
});
