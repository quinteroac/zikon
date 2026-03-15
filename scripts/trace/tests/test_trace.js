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

// US-002-AC01: --colors sets the number of palette colors (default: 16)
test('US-002-AC01: --colors sets palette color count, default is 16', () => {
  const { tmpDir, pngPath } = createTmpPng();
  try {
    // Default
    const defaultResult = spawnSync('node', [TRACE_JS, pngPath], { encoding: 'utf8' });
    assert.strictEqual(defaultResult.status, 0);
    const defaultParsed = JSON.parse(defaultResult.stdout.trim());
    assert.strictEqual(defaultParsed.colors, 16, 'Default colors should be 16');

    // Custom value
    const customResult = spawnSync('node', [TRACE_JS, '--colors', '32', pngPath], { encoding: 'utf8' });
    assert.strictEqual(customResult.status, 0);
    const customParsed = JSON.parse(customResult.stdout.trim());
    assert.strictEqual(customParsed.colors, 32, '--colors 32 should set colors to 32');
  } finally {
    cleanup(tmpDir);
  }
});

// US-002-AC02: --tolerance sets the path simplification tolerance (default: 1.0)
test('US-002-AC02: --tolerance sets path simplification tolerance, default is 1.0', () => {
  const { tmpDir, pngPath } = createTmpPng();
  try {
    // Default
    const defaultResult = spawnSync('node', [TRACE_JS, pngPath], { encoding: 'utf8' });
    assert.strictEqual(defaultResult.status, 0);
    const defaultParsed = JSON.parse(defaultResult.stdout.trim());
    assert.strictEqual(defaultParsed.tolerance, 1.0, 'Default tolerance should be 1.0');

    // Custom value
    const customResult = spawnSync('node', [TRACE_JS, '--tolerance', '2.5', pngPath], { encoding: 'utf8' });
    assert.strictEqual(customResult.status, 0);
    const customParsed = JSON.parse(customResult.stdout.trim());
    assert.strictEqual(customParsed.tolerance, 2.5, '--tolerance 2.5 should set tolerance to 2.5');
  } finally {
    cleanup(tmpDir);
  }
});

// US-002-AC03: --scale sets the output scale factor (default: 1.0)
test('US-002-AC03: --scale sets output scale factor, default is 1.0', () => {
  const { tmpDir, pngPath } = createTmpPng();
  try {
    // Default
    const defaultResult = spawnSync('node', [TRACE_JS, pngPath], { encoding: 'utf8' });
    assert.strictEqual(defaultResult.status, 0);
    const defaultParsed = JSON.parse(defaultResult.stdout.trim());
    assert.strictEqual(defaultParsed.scale, 1.0, 'Default scale should be 1.0');

    // Custom value
    const customResult = spawnSync('node', [TRACE_JS, '--scale', '2.0', pngPath], { encoding: 'utf8' });
    assert.strictEqual(customResult.status, 0);
    const customParsed = JSON.parse(customResult.stdout.trim());
    assert.strictEqual(customParsed.scale, 2.0, '--scale 2.0 should set scale to 2.0');
  } finally {
    cleanup(tmpDir);
  }
});

// US-002-AC04: invalid flag values cause exit code 3 with error on stderr
test('US-002-AC04: non-numeric --colors value exits 3 with stderr error', () => {
  const { tmpDir, pngPath } = createTmpPng();
  try {
    const result = spawnSync('node', [TRACE_JS, '--colors', 'abc', pngPath], { encoding: 'utf8' });
    assert.strictEqual(result.status, 3, `Expected exit code 3, got ${result.status}`);
    assert.ok(result.stderr.trim().length > 0, 'Expected error message on stderr');
  } finally {
    cleanup(tmpDir);
  }
});

test('US-002-AC04: non-numeric --tolerance value exits 3 with stderr error', () => {
  const { tmpDir, pngPath } = createTmpPng();
  try {
    const result = spawnSync('node', [TRACE_JS, '--tolerance', 'xyz', pngPath], { encoding: 'utf8' });
    assert.strictEqual(result.status, 3, `Expected exit code 3, got ${result.status}`);
    assert.ok(result.stderr.trim().length > 0, 'Expected error message on stderr');
  } finally {
    cleanup(tmpDir);
  }
});

test('US-002-AC04: non-numeric --scale value exits 3 with stderr error', () => {
  const { tmpDir, pngPath } = createTmpPng();
  try {
    const result = spawnSync('node', [TRACE_JS, '--scale', 'bad', pngPath], { encoding: 'utf8' });
    assert.strictEqual(result.status, 3, `Expected exit code 3, got ${result.status}`);
    assert.ok(result.stderr.trim().length > 0, 'Expected error message on stderr');
  } finally {
    cleanup(tmpDir);
  }
});

// US-002-AC05: syntax check passes (covered by AC05 above, but verify explicitly for US-002)
test('US-002-AC05: node --check trace.js syntax check passes', () => {
  const result = spawnSync('node', ['--check', TRACE_JS], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, `Syntax check failed: ${result.stderr}`);
});

// US-003-AC01: stdout contains exactly one JSON object with required fields
test('US-003-AC01: stdout contains JSON with png_path, svg_path, svg_inline, colors, tolerance, scale', () => {
  const { tmpDir, pngPath } = createTmpPng();
  try {
    const result = spawnSync('node', [TRACE_JS, pngPath], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0);
    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse(result.stdout.trim()); }, 'stdout must be valid JSON');
    assert.ok('png_path' in parsed, 'JSON must contain png_path');
    assert.ok('svg_path' in parsed, 'JSON must contain svg_path');
    assert.ok('svg_inline' in parsed, 'JSON must contain svg_inline');
    assert.ok('colors' in parsed, 'JSON must contain colors');
    assert.ok('tolerance' in parsed, 'JSON must contain tolerance');
    assert.ok('scale' in parsed, 'JSON must contain scale');
    const nonEmptyLines = result.stdout.split('\n').filter((l) => l.trim());
    assert.strictEqual(nonEmptyLines.length, 1, 'stdout must contain exactly one JSON object');
  } finally {
    cleanup(tmpDir);
  }
});

// US-003-AC02: svg_inline contains the full SVG markup as a string
test('US-003-AC02: svg_inline contains full SVG markup', () => {
  const { tmpDir, pngPath } = createTmpPng();
  try {
    const result = spawnSync('node', [TRACE_JS, pngPath], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0);
    const parsed = JSON.parse(result.stdout.trim());
    assert.ok(typeof parsed.svg_inline === 'string', 'svg_inline must be a string');
    assert.ok(parsed.svg_inline.includes('<svg'), 'svg_inline must contain opening <svg tag');
    assert.ok(parsed.svg_inline.includes('</svg>'), 'svg_inline must contain closing </svg> tag');
    const openIdx = parsed.svg_inline.indexOf('<svg');
    const closeIdx = parsed.svg_inline.lastIndexOf('</svg>');
    assert.ok(openIdx < closeIdx, '<svg> must appear before </svg> in svg_inline');
  } finally {
    cleanup(tmpDir);
  }
});

// US-003-AC03: svg_path is the absolute path to the written SVG file
test('US-003-AC03: svg_path is the absolute path to the written SVG file', () => {
  const { tmpDir, pngPath } = createTmpPng();
  try {
    const result = spawnSync('node', [TRACE_JS, pngPath], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0);
    const parsed = JSON.parse(result.stdout.trim());
    assert.ok(path.isAbsolute(parsed.svg_path), 'svg_path must be an absolute path');
    assert.ok(fs.existsSync(parsed.svg_path), 'svg_path must point to an existing file');
    assert.ok(parsed.svg_path.endsWith('.svg'), 'svg_path must end with .svg');
  } finally {
    cleanup(tmpDir);
  }
});

// US-003-AC04: on error, stdout is empty; error message goes to stderr
test('US-003-AC04: on error stdout is empty and error message goes to stderr', () => {
  const result = spawnSync(
    'node',
    [TRACE_JS, '/nonexistent/path/no_such_file.png'],
    { encoding: 'utf8' }
  );
  assert.notStrictEqual(result.status, 0, 'Should exit non-zero on error');
  assert.strictEqual(result.stdout.trim(), '', 'stdout must be empty on error');
  assert.ok(result.stderr.trim().length > 0, 'Error message must appear on stderr');
});

// US-003-AC05: lint / syntax check passes
test('US-003-AC05: node --check trace.js syntax check passes', () => {
  const result = spawnSync('node', ['--check', TRACE_JS], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, `Syntax check failed: ${result.stderr}`);
});
