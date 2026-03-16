"use strict";

/**
 * Integration test for US-005: agent generates icon mid-task.
 *
 * Simulates an agent invoking Zikon from within a real web project directory
 * to confirm the end-to-end flow works without manual steps.
 *
 * Run: node --test tests/test_skill_integration.js
 *      (from the project root)
 */

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ZIKON_JS = path.resolve(__dirname, "..", "cli", "zikon.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @param {string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} [options]
 * @returns {{ status: number, stdout: string, stderr: string }}
 */
function runZikon(args, options = {}) {
  const result = spawnSync("node", [ZIKON_JS, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    cwd: options.cwd,
    env: options.env,
    maxBuffer: 20 * 1024 * 1024,
  });
  return result;
}

/**
 * Creates a temporary directory that mimics a real web project structure,
 * as an agent would encounter when asked to generate an icon mid-task.
 */
function makeWebProjectDir() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zikon-webproject-"));

  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "public"), { recursive: true });

  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "my-web-app", version: "1.0.0" }, null, 2),
    "utf8"
  );

  fs.writeFileSync(
    path.join(root, "src", "index.html"),
    "<!DOCTYPE html><html><head><title>My App</title></head><body></body></html>",
    "utf8"
  );

  return root;
}

// ---------------------------------------------------------------------------
// US-005-AC01: test simulates agent invoking Zikon in a real web project
// ---------------------------------------------------------------------------

test("US-005-AC01: exits 0 and emits valid JSON when invoked from a web project directory", () => {
  const projectDir = makeWebProjectDir();
  const assetsDir = path.join(projectDir, "assets", "icons");

  try {
    const result = runZikon(["rocket icon", "--output-dir", assetsDir], {
      cwd: projectDir,
    });
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);

    const trimmed = result.stdout.trim();
    let payload;
    try {
      payload = JSON.parse(trimmed);
    } catch (e) {
      assert.fail(`stdout is not valid JSON: ${e.message}\nstdout: ${result.stdout}`);
    }

    for (const key of ["prompt", "model", "seed", "png_path", "svg_path", "svg_inline"]) {
      assert.ok(key in payload, `JSON output missing required field: ${key}`);
    }
  } finally {
    fs.rmSync(projectDir, { recursive: true });
  }
});

test("US-005-AC01: PNG and SVG files are written into the web project assets directory", () => {
  const projectDir = makeWebProjectDir();
  const assetsDir = path.join(projectDir, "assets", "icons");

  try {
    const result = runZikon(["rocket icon", "--output-dir", assetsDir], {
      cwd: projectDir,
    });
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);

    const payload = JSON.parse(result.stdout.trim());

    assert.ok(
      payload.png_path.startsWith(assetsDir),
      `png_path "${payload.png_path}" must be inside assetsDir "${assetsDir}"`
    );
    assert.ok(
      payload.svg_path.startsWith(assetsDir),
      `svg_path "${payload.svg_path}" must be inside assetsDir "${assetsDir}"`
    );
    assert.ok(fs.existsSync(payload.png_path), "PNG file must exist on disk");
    assert.ok(fs.existsSync(payload.svg_path), "SVG file must exist on disk");
  } finally {
    fs.rmSync(projectDir, { recursive: true });
  }
});

test("US-005-AC01: assets directory is created automatically when absent (typical mid-task scenario)", () => {
  const projectDir = makeWebProjectDir();
  const assetsDir = path.join(projectDir, "assets", "icons");

  try {
    assert.ok(
      !fs.existsSync(assetsDir),
      "assets dir must not exist before invocation to simulate mid-task scenario"
    );

    const result = runZikon(["coffee cup logo", "--output-dir", assetsDir], {
      cwd: projectDir,
    });
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    assert.ok(fs.existsSync(assetsDir), "assetsDir must be created by zikon");
  } finally {
    fs.rmSync(projectDir, { recursive: true });
  }
});

test("US-005-AC01: svg_inline is non-empty and starts with <svg (ready to embed in HTML)", () => {
  const projectDir = makeWebProjectDir();
  const assetsDir = path.join(projectDir, "assets");

  try {
    const result = runZikon(["app icon", "--output-dir", assetsDir], {
      cwd: projectDir,
    });
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);

    const payload = JSON.parse(result.stdout.trim());

    assert.ok(
      typeof payload.svg_inline === "string" && payload.svg_inline.length > 0,
      "svg_inline must be a non-empty string"
    );
    assert.ok(
      payload.svg_inline.trimStart().startsWith("<svg"),
      `svg_inline must start with <svg; got: ${payload.svg_inline.slice(0, 60)}`
    );
  } finally {
    fs.rmSync(projectDir, { recursive: true });
  }
});

test("US-005-AC01: original prompt is preserved in JSON output when --style is used", () => {
  const projectDir = makeWebProjectDir();
  const assetsDir = path.join(projectDir, "assets");

  try {
    const result = runZikon(
      ["nav icon", "--style", "flat minimal", "--output-dir", assetsDir],
      { cwd: projectDir }
    );
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(
      payload.prompt,
      "nav icon",
      "prompt field must be the original prompt, not the style-appended version"
    );
  } finally {
    fs.rmSync(projectDir, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// US-005-AC03: typecheck / lint passes
// ---------------------------------------------------------------------------

test("US-005-AC03: test_skill_integration.js passes node --check", () => {
  const result = spawnSync("node", ["--check", __filename], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.equal(
    result.status,
    0,
    `Syntax error in test_skill_integration.js:\n${result.stderr}`
  );
});

test("US-005-AC03: zikon.js passes node --check", () => {
  const result = spawnSync("node", ["--check", ZIKON_JS], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.equal(result.status, 0, `Syntax error in zikon.js:\n${result.stderr}`);
});
