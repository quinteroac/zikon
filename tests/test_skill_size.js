"use strict";

/**
 * Acceptance-criteria tests for Iteration 000006 / US-004:
 * `size` parameter support in the agent skill.
 *
 * Run: node --test tests/test_skill_size.js
 *      (from the project root)
 */

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SKILL_PATH = path.resolve(__dirname, "..", "zikon-skills", "index.js");
const skill = require(SKILL_PATH);

function makeTmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeExecutable(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
  fs.chmodSync(filePath, 0o755);
}

test("IT-000006/US-004-AC01+AC02+AC03: run(params) accepts size, forwards --size, and returns svg_files", () => {
  const fakeBinDir = makeTmpDir("zikon-fake-bin-");
  const fakeCapturePath = path.join(fakeBinDir, "captured_args.txt");
  const originalPath = process.env.PATH || "";

  try {
    const fakeZikon = path.join(fakeBinDir, "zikon");
    writeExecutable(
      fakeZikon,
      `#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "${fakeCapturePath}"
cat <<'JSON'
{"prompt":"app icon","model":"z-image-turbo","seed":42,"png_path":"/tmp/app_icon.png","svg_path":null,"svg_inline":null,"svg_files":[{"size":512,"svg_path":"/tmp/app_icon_512.svg","svg_inline":"<svg width=\\"512\\" height=\\"512\\"></svg>"},{"size":24,"svg_path":"/tmp/app_icon_24.svg","svg_inline":"<svg width=\\"24\\" height=\\"24\\"></svg>"},{"size":18,"svg_path":"/tmp/app_icon_18.svg","svg_inline":"<svg width=\\"18\\" height=\\"18\\"></svg>"}]}
JSON
`
    );

    process.env.PATH = `${fakeBinDir}:${originalPath}`;

    const result = skill.run({ prompt: "app icon", size: "512,24,18" });
    const forwardedArgs = fs.readFileSync(fakeCapturePath, "utf8").trim();

    assert.match(
      forwardedArgs,
      /^app icon --size 512,24,18$/,
      `expected forwarded args to include --size; got: ${forwardedArgs}`
    );
    assert.ok(Array.isArray(result.svg_files), "returned object must include svg_files array");
    assert.deepEqual(
      result.svg_files.map((entry) => entry.size),
      [512, 24, 18],
      "svg_files sizes must match the multi-size JSON output"
    );
  } finally {
    process.env.PATH = originalPath;
    fs.rmSync(fakeBinDir, { recursive: true });
  }
});

test("IT-000006/US-004-AC04: { prompt, size } produces correct multi-size output via the real pipeline", () => {
  const tmpDir = makeTmpDir("zikon-skill-run-");

  try {
    const payload = skill.run({
      prompt: "app icon",
      size: "512,24,18",
      output_dir: tmpDir,
    });

    assert.equal(payload.prompt, "app icon", "prompt must be preserved");
    assert.ok(Array.isArray(payload.svg_files), "svg_files must be present");
    assert.deepEqual(
      payload.svg_files.map((entry) => entry.size),
      [512, 24, 18],
      "real run must return one svg_files entry per requested size"
    );

    for (const entry of payload.svg_files) {
      assert.ok(fs.existsSync(entry.svg_path), `missing generated SVG file: ${entry.svg_path}`);
      assert.ok(
        entry.svg_inline.trimStart().startsWith("<svg"),
        `svg_inline must start with <svg for size ${entry.size}`
      );
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

