'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { pngPath: null, colors: 16, tolerance: 1.0, scale: 1.0 };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--colors') {
      const raw = argv[++i];
      const val = parseInt(raw, 10);
      if (!raw || isNaN(val) || String(val) !== raw.trim()) {
        process.stderr.write(`Error: --colors requires an integer value, got: ${raw}\n`);
        process.exit(3);
      }
      args.colors = val;
    } else if (arg === '--tolerance') {
      const raw = argv[++i];
      const val = parseFloat(raw);
      if (!raw || isNaN(val)) {
        process.stderr.write(`Error: --tolerance requires a numeric value, got: ${raw}\n`);
        process.exit(3);
      }
      args.tolerance = val;
    } else if (arg === '--scale') {
      const raw = argv[++i];
      const val = parseFloat(raw);
      if (!raw || isNaN(val)) {
        process.stderr.write(`Error: --scale requires a numeric value, got: ${raw}\n`);
        process.exit(3);
      }
      args.scale = val;
    } else if (!arg.startsWith('--')) {
      args.pngPath = arg;
    } else {
      process.stderr.write(`Error: unknown flag: ${arg}\n`);
      process.exit(3);
    }
  }

  return args;
}

function main() {
  const { pngPath, colors, tolerance, scale } = parseArgs(process.argv);

  if (!pngPath) {
    process.stderr.write('Error: input PNG path is required\n');
    process.exit(3);
  }

  const absPngPath = path.resolve(pngPath);

  if (!fs.existsSync(absPngPath)) {
    process.stderr.write(`Error: input file not found: ${absPngPath}\n`);
    process.exit(2);
  }

  const dir = path.dirname(absPngPath);
  const base = path.basename(absPngPath, path.extname(absPngPath));
  const svgPath = path.join(dir, base + '.svg');

  const ImageTracer = require('imagetracerjs');
  // Use the bundled PNGReader to avoid browser-only loadImage
  const PNGReader = require('imagetracerjs/nodecli/PNGReader');

  const options = {
    numberofcolors: colors,
    ltres: tolerance,
    qtres: tolerance,
    scale: scale,
  };

  fs.readFile(absPngPath, (readErr, bytes) => {
    if (readErr) {
      process.stderr.write(`Error reading input file: ${readErr.message}\n`);
      process.exit(1);
    }

    const reader = new PNGReader(bytes);

    reader.parse((parseErr, png) => {
      if (parseErr) {
        process.stderr.write(`Error parsing PNG: ${parseErr.message}\n`);
        process.exit(1);
      }

      let svgStr;
      try {
        const imgData = { width: png.width, height: png.height, data: png.pixels };
        svgStr = ImageTracer.imagedataToSVG(imgData, options);
      } catch (traceErr) {
        process.stderr.write(`Error tracing image: ${traceErr.message}\n`);
        process.exit(1);
      }

      try {
        fs.writeFileSync(svgPath, svgStr, 'utf8');
      } catch (writeErr) {
        process.stderr.write(`Error writing SVG: ${writeErr.message}\n`);
        process.exit(1);
      }

      const result = {
        png_path: absPngPath,
        svg_path: svgPath,
        svg_inline: svgStr,
        colors,
        tolerance,
        scale,
      };
      process.stdout.write(JSON.stringify(result) + '\n');
      process.exit(0);
    });
  });
}

main();
