const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} 失败，退出码 ${result.status ?? "unknown"}。`);
  }
}

function authorizationArgs() {
  if (process.env.APPLE_KEYCHAIN_PROFILE) {
    return [
      "--keychain-profile",
      process.env.APPLE_KEYCHAIN_PROFILE,
      ...(process.env.APPLE_KEYCHAIN
        ? ["--keychain", process.env.APPLE_KEYCHAIN]
        : []),
    ];
  }
  if (
    process.env.APPLE_API_KEY &&
    process.env.APPLE_API_KEY_ID &&
    process.env.APPLE_API_ISSUER
  ) {
    return [
      "--key",
      process.env.APPLE_API_KEY,
      "--key-id",
      process.env.APPLE_API_KEY_ID,
      "--issuer",
      process.env.APPLE_API_ISSUER,
    ];
  }
  if (
    process.env.APPLE_ID &&
    process.env.APPLE_APP_SPECIFIC_PASSWORD &&
    process.env.APPLE_TEAM_ID
  ) {
    return [
      "--apple-id",
      process.env.APPLE_ID,
      "--password",
      process.env.APPLE_APP_SPECIFIC_PASSWORD,
      "--team-id",
      process.env.APPLE_TEAM_ID,
    ];
  }
  throw new Error("缺少可用的 Apple 公证凭据。");
}

module.exports = async function notarizeMacos(context) {
  if (context.electronPlatformName !== "darwin") return;
  const appPath = join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );
  const workRoot = mkdtempSync(join(tmpdir(), "agentguard-notary-"));
  const archivePath = join(workRoot, "AgentGuard.zip");
  try {
    run("codesign", [
      "--verify",
      "--deep",
      "--strict",
      "--verbose=2",
      appPath,
    ]);
    run("ditto", [
      "-c",
      "-k",
      "--sequesterRsrc",
      "--keepParent",
      appPath,
      archivePath,
    ]);
    run("xcrun", [
      "notarytool",
      "submit",
      archivePath,
      ...authorizationArgs(),
      "--no-s3-acceleration",
      "--wait",
      "--timeout",
      "30m",
    ]);
    run("xcrun", ["stapler", "staple", appPath]);
    run("xcrun", ["stapler", "validate", appPath]);
    console.log("✓ Apple 公证 Accepted，App ticket 已 staple 并验证。");
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
};
