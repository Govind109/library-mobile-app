#!/usr/bin/env node
// Runs a Gradle task (assembleRelease / bundleRelease) directly against the
// production API, bypassing Expo/EAS entirely for the actual build step.

const { spawnSync } = require("child_process");
const path = require("path");

const task = process.argv[2];
if (!task) {
  console.error("Usage: node scripts/run-android-release.js <gradleTask>");
  process.exit(1);
}

const androidDir = path.join(__dirname, "..", "android");
const gradlew = path.join(androidDir, process.platform === "win32" ? "gradlew.bat" : "gradlew");

const result = spawnSync(gradlew, [task], {
  cwd: androidDir,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    EXPO_PUBLIC_API_BASE_URL: "https://lib.kypsapp.in/api",
    EXPO_PUBLIC_SHOW_GOOGLE_ADS: "true",
  },
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
