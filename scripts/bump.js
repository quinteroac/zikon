#!/usr/bin/env node
"use strict";

/**
 * bump.js — bump the semver version in package.json and create a git tag
 *
 * Usage:
 *   node scripts/bump.js patch   # X.Y.Z+1
 *   node scripts/bump.js minor   # X.Y+1.0
 *   node scripts/bump.js major   # X+1.0.0
 */

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const kind = process.argv[2];
if (!["patch", "minor", "major"].includes(kind)) {
  process.stderr.write(`Usage: node scripts/bump.js <patch|minor|major>\n`);
  process.exit(1);
}

const pkg_path = path.join(__dirname, "..", "package.json");
const pkg = JSON.parse(fs.readFileSync(pkg_path, "utf8"));

let [major, minor, patch] = pkg.version.split(".").map(Number);
if (kind === "patch") patch++;
else if (kind === "minor") { minor++; patch = 0; }
else if (kind === "major") { major++; minor = 0; patch = 0; }

const next = `${major}.${minor}.${patch}`;
const tag = `v${next}`;

pkg.version = next;
fs.writeFileSync(pkg_path, JSON.stringify(pkg, null, 2) + "\n");
process.stdout.write(`Bumped to ${next}\n`);

try {
  execSync(`git add package.json`, { stdio: "inherit" });
  execSync(`git commit -m "chore: bump version to ${next}"`, { stdio: "inherit" });
  execSync(`git tag ${tag}`, { stdio: "inherit" });
  process.stdout.write(`Tagged ${tag}\n`);
  process.stdout.write(`Run: git push --follow-tags\n`);
} catch (err) {
  process.stderr.write(`Git error: ${err.message}\n`);
  process.exit(1);
}
