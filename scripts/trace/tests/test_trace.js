'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Use the bundled smiley.png from imagetracerjs as a known-valid test PNG
const FIXTURE_PNG = path.join(
  __dirname, '..', 'node_modules', 'imagetracerjs', 'smiley.png'
);

const TRACE_JS = path.join(__dirname, '..', 'trace.js');

function createTmpPng() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-test-'));
  const pngPath = path.join(tmpDir, 'test.png');
  fs.copyFileSync(FIXTURE_PNG, pngPath);
  return { tmpDir, pngPath };
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// AC01: exits 0 and writes .svg file alongside the input PNG
test('AC01: exits 0 and writes SVG alongside PNG', () => {
  const { tmpDir, pngPath } = createTmpPng();
  try {
    const result = spawnSync('node', [TRACE_JS, pngPath], { encoding: 'utf8' });
    assert.strictEqual(
      result.status, 0,
      `Expected exit code 0, got ${result.status}; stderr: ${result.stderr}`
    );
    const svgPath = path.join(path.dirname(pngPath), 'test.svg');
    assert.ok(fs.existsSync(svgPath), `SVG file not found at ${svgPath}`);
  } finally {
    cleanup(tmpDir);
  }
});

// AC02: the output SVG is well-formed XML
test('AC02: output SVG is well-formed XML', () => {
  const { tmpDir, pngPath } = createTmpPng();
  try {
    spawnSync('node', [TRACE_JS, pngPath], { encoding: 'utf8' });
    const svgPath = path.join(path.dirname(pngPath), 'test.svg');
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    assert.ok(svgContent.trim().length > 0, 'SVG file should not be empty');
    assert.ok(
      svgContent.includes('<svg'),
      'SVG should contain opening <svg tag'
    );
    assert.ok(
      svgContent.includes('</svg>'),
      'SVG should contain closing </svg> tag'
    );
    // Opening tag must precede closing tag
    const openIdx = svgContent.indexOf('<svg');
    const closeIdx = svgContent.lastIndexOf('</svg>');
    assert.ok(openIdx < closeIdx, '<svg> must appear before </svg>');
  } finally {
    cleanup(tmpDir);
  }
});

// AC03: missing input exits 2 with error on stderr
test('AC03: missing input file exits 2 with stderr error', () => {
  const result = spawnSync(
    'node',
    [TRACE_JS, '/nonexistent/path/no_such_file.png'],
    { encoding: 'utf8' }
  );
  assert.strictEqual(
    result.status, 2,
    `Expected exit code 2, got ${result.status}`
  );
  assert.ok(result.stderr.trim().length > 0, 'Expected error message on stderr');
});

// AC04: nothing other than the JSON result is written to stdout
test('AC04: stdout contains only the JSON result', () => {
  const { tmpDir, pngPath } = createTmpPng();
  try {
    const result = spawnSync('node', [TRACE_JS, pngPath], { encoding: 'utf8' });
    const stdout = result.stdout.trim();
    let parsed;
    assert.doesNotThrow(
      () => { parsed = JSON.parse(stdout); },
      'stdout must be valid JSON'
    );
    // Verify required fields are present
    assert.ok('png_path' in parsed, 'JSON must contain png_path');
    assert.ok('svg_path' in parsed, 'JSON must contain svg_path');
    assert.ok('svg_inline' in parsed, 'JSON must contain svg_inline');
    assert.ok('colors' in parsed, 'JSON must contain colors');
    assert.ok('tolerance' in parsed, 'JSON must contain tolerance');
    assert.ok('scale' in parsed, 'JSON must contain scale');
    // Only one JSON object on stdout (no extra lines)
    const nonEmptyLines = result.stdout.split('\n').filter((l) => l.trim());
    assert.strictEqual(
      nonEmptyLines.length, 1,
      'stdout must contain exactly one non-empty line'
    );
  } finally {
    cleanup(tmpDir);
  }
});

// AC05: node --check syntax validation passes
test('AC05: node --check trace.js passes syntax check', () => {
  const result = spawnSync('node', ['--check', TRACE_JS], { encoding: 'utf8' });
  assert.strictEqual(
    result.status, 0,
    `Syntax check failed: ${result.stderr}`
  );
});
