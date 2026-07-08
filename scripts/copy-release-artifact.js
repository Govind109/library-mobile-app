#!/usr/bin/env node
// Copies a freshly built local Gradle APK/AAB into ./release with a
// version-stamped filename, e.g. release/KYPS-Library-Student-1.0.2.apk

const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const type = process.argv[2];

const sources = {
  apk: path.join(rootDir, "android", "app", "build", "outputs", "apk", "release", "app-release.apk"),
  aab: path.join(rootDir, "android", "app", "build", "outputs", "bundle", "release", "app-release.aab"),
};

if (!sources[type]) {
  console.error('Usage: node scripts/copy-release-artifact.js <apk|aab>');
  process.exit(1);
}

const source = sources[type];
if (!fs.existsSync(source)) {
  console.error(`Build output not found at ${source}`);
  process.exit(1);
}

const { version } = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
const releaseDir = path.join(rootDir, "release");
if (!fs.existsSync(releaseDir)) fs.mkdirSync(releaseDir, { recursive: true });

const destination = path.join(releaseDir, `KYPS-Library-Student-${version}.${type}`);
fs.copyFileSync(source, destination);

console.log(`Copied ${type.toUpperCase()} to ${destination}`);
