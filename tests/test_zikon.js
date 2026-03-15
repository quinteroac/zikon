"use strict";

/**
 * Acceptance-criteria tests for zikon.js (US-001).
 *
 * Run: node --test tests/test_zikon.js
 *      (from the project root)
 */

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ZIKON_JS = path.resolve(__dirname, "..", "zikon.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @param {string[]} args
 * @returns {{ status: number, stdout: string, stderr: string }}
 */
function runZikon(args) {
  const result = spawnSync("node", [ZIKON_JS, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result;
}

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "zikon-test-"));
}

// ---------------------------------------------------------------------------
// US-001-AC01: exits 0 on valid invocation
// ---------------------------------------------------------------------------

test("US-001-AC01: exits 0 for valid invocation", () => {
  const tmpDir = makeTmpDir();
  try {
    const result = runZikon(["app logo", "--model", "z-image-turbo", "--output-dir", tmpDir]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// US-001-AC02: valid PNG written to output-dir
// ---------------------------------------------------------------------------

test("US-001-AC02: valid PNG file is written to output-dir", () => {
  const tmpDir = makeTmpDir();
  try {
    const result = runZikon(["app logo", "--model", "z-image-turbo", "--output-dir", tmpDir]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const payload = JSON.parse(result.stdout.trim());
    assert.ok(fs.existsSync(payload.png_path), "PNG file does not exist");
    const magic = fs.readFileSync(payload.png_path).slice(0, 8);
    assert.deepEqual(
      magic,
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      "File does not have PNG magic bytes"
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// US-001-AC03: valid, well-formed SVG written with same base name as PNG
// ---------------------------------------------------------------------------

test("US-001-AC03: valid SVG file written with same base name as PNG", () => {
  const tmpDir = makeTmpDir();
  try {
    const result = runZikon(["app logo", "--model", "z-image-turbo", "--output-dir", tmpDir]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const payload = JSON.parse(result.stdout.trim());

    // SVG file exists
    assert.ok(fs.existsSync(payload.svg_path), "SVG file does not exist");

    // SVG is well-formed (has opening and closing tag)
    const svgContent = fs.readFileSync(payload.svg_path, "utf8");
    assert.ok(svgContent.includes("<svg"), "SVG file missing <svg> element");
    assert.ok(svgContent.includes("</svg>"), "SVG file missing closing </svg> tag");

    // Same base name as PNG
    const pngBase = path.basename(payload.png_path, ".png");
    const svgBase = path.basename(payload.svg_path, ".svg");
    assert.equal(pngBase, svgBase, "SVG base name does not match PNG base name");

    // Both are in the same directory
    assert.equal(
      path.dirname(payload.png_path),
      path.dirname(payload.svg_path),
      "PNG and SVG are not in the same directory"
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// US-001-AC04: stdout JSON contains required keys
// ---------------------------------------------------------------------------

test("US-001-AC04: stdout JSON contains prompt, model, seed, png_path, svg_path, svg_inline", () => {
  const tmpDir = makeTmpDir();
  try {
    const result = runZikon([
      "app logo",
      "--model", "z-image-turbo",
      "--output-dir", tmpDir,
      "--seed", "42",
    ]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);

    const payload = JSON.parse(result.stdout.trim());

    for (const key of ["prompt", "model", "seed", "png_path", "svg_path", "svg_inline"]) {
      assert.ok(key in payload, `JSON output missing required key: ${key}`);
    }

    assert.equal(payload.prompt, "app logo");
    assert.equal(payload.model, "z-image-turbo");
    assert.equal(payload.seed, 42);

    // svg_inline must be a non-empty string containing SVG markup
    assert.ok(typeof payload.svg_inline === "string" && payload.svg_inline.includes("<svg"),
      "svg_inline is not a valid SVG string");
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// US-001-AC05: nothing other than the final JSON on stdout
// ---------------------------------------------------------------------------

test("US-001-AC05: stdout contains only the final JSON object", () => {
  const tmpDir = makeTmpDir();
  try {
    const result = runZikon(["app logo", "--model", "z-image-turbo", "--output-dir", tmpDir]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);

    // stdout must end with exactly one newline after the JSON
    assert.ok(result.stdout.endsWith("\n"), "stdout should end with a newline");

    const trimmed = result.stdout.trim();

    // Must be parseable as a single JSON object with no trailing content
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      assert.fail(`stdout is not valid JSON: ${e.message}\nstdout: ${result.stdout}`);
    }

    assert.equal(typeof parsed, "object", "stdout JSON is not an object");

    // Verify the JSON consumes the entire trimmed string (no leading/trailing non-JSON)
    assert.equal(JSON.stringify(parsed).length > 0, true, "JSON payload is empty");
    assert.ok(trimmed.startsWith("{"), "stdout does not start with {");
    assert.ok(trimmed.endsWith("}"), "stdout does not end with }");
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// US-001-AC07: syntax check passes (lint/typecheck)
// ---------------------------------------------------------------------------

test("US-001-AC07: node --check syntax validation passes", () => {
  const result = spawnSync("node", ["--check", ZIKON_JS], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.equal(result.status, 0, `Syntax error in zikon.js:\n${result.stderr}`);
});
