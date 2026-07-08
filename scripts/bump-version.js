#!/usr/bin/env node
// Bumps the patch version (package.json + app.json expo.version) and the
// Android versionCode / iOS buildNumber before every release build.

const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");
const appJsonPath = path.join(rootDir, "app.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function bumpPatch(version) {
  const parts = version.split(".").map(Number);
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  return parts.join(".");
}

const packageJson = readJson(packageJsonPath);
const appJson = readJson(appJsonPath);

const newVersion = bumpPatch(packageJson.version);

packageJson.version = newVersion;
appJson.expo.version = newVersion;

if (appJson.expo.android && typeof appJson.expo.android.versionCode === "number") {
  appJson.expo.android.versionCode += 1;
}

if (appJson.expo.ios && appJson.expo.ios.buildNumber !== undefined) {
  const nextBuildNumber = parseInt(appJson.expo.ios.buildNumber, 10) + 1;
  appJson.expo.ios.buildNumber = String(nextBuildNumber);
}

writeJson(packageJsonPath, packageJson);
writeJson(appJsonPath, appJson);

console.log(
  `Version bumped to ${newVersion}` +
    (appJson.expo.android ? ` (android versionCode: ${appJson.expo.android.versionCode})` : "")
);
