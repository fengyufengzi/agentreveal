#!/usr/bin/env node

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

function fail(message) {
  console.error(`macOS 发布预检失败：${message}`);
  process.exitCode = 1;
}

function command(command, args) {
  return spawnSync(command, args, { encoding: "utf8" });
}

function completeGroup(names) {
  const present = names.filter((name) => Boolean(process.env[name]));
  if (present.length > 0 && present.length !== names.length) {
    fail(`${names.join(" / ")} 必须成组提供；当前只配置了部分变量。`);
    return false;
  }
  return present.length === names.length;
}

if (process.platform !== "darwin") {
  fail("签名与公证只能在 macOS 构建机执行。");
} else {
  if (!existsSync("desktop/icon.icns")) {
    fail("尚未提供正式应用图标 desktop/icon.icns；禁止使用 Electron 默认图标发布。");
  }
  const requiredCommands = [
    ["xcode", "xcode-select", ["-p"]],
    ["notarytool", "xcrun", ["notarytool", "--version"]],
    ["codesign", "xcrun", ["--find", "codesign"]],
    ["security", "security", ["find-identity", "-v", "-p", "codesigning"]],
  ];
  const results = new Map();
  for (const [label, name, args] of requiredCommands) {
    const result = command(name, args);
    results.set(label, result);
    if (result.status !== 0) fail(`缺少可用的 ${label}。`);
  }

  const identities = results.get("security")?.stdout ?? "";
  const keychainIdentity = identities.includes("Developer ID Application:");
  const cscCredentials = completeGroup(["CSC_LINK", "CSC_KEY_PASSWORD"]);
  if (!keychainIdentity && !cscCredentials) {
    fail("未找到 Developer ID Application 证书，也未配置 CSC_LINK / CSC_KEY_PASSWORD。");
  }

  const apiCredentials = completeGroup([
    "APPLE_API_KEY",
    "APPLE_API_KEY_ID",
    "APPLE_API_ISSUER",
  ]);
  const appleIdCredentials = completeGroup([
    "APPLE_ID",
    "APPLE_APP_SPECIFIC_PASSWORD",
    "APPLE_TEAM_ID",
  ]);
  const keychainProfile = Boolean(process.env.APPLE_KEYCHAIN_PROFILE);
  if (!apiCredentials && !appleIdCredentials && !keychainProfile) {
    fail("未配置 App Store Connect API Key、Apple ID 公证凭据或 notarytool Keychain Profile。");
  }
  if (apiCredentials && !existsSync(process.env.APPLE_API_KEY)) {
    fail("APPLE_API_KEY 必须指向本机可读的 .p8 文件。");
  }

  const notaryAuthorization = keychainProfile
    ? [
        "--keychain-profile",
        process.env.APPLE_KEYCHAIN_PROFILE,
        ...(process.env.APPLE_KEYCHAIN
          ? ["--keychain", process.env.APPLE_KEYCHAIN]
          : []),
      ]
    : apiCredentials
      ? [
          "--key",
          process.env.APPLE_API_KEY,
          "--key-id",
          process.env.APPLE_API_KEY_ID,
          "--issuer",
          process.env.APPLE_API_ISSUER,
        ]
      : appleIdCredentials
        ? [
            "--apple-id",
            process.env.APPLE_ID,
            "--password",
            process.env.APPLE_APP_SPECIFIC_PASSWORD,
            "--team-id",
            process.env.APPLE_TEAM_ID,
          ]
        : [];
  if (
    notaryAuthorization.length > 0 &&
    command("xcrun", [
      "notarytool",
      "history",
      ...notaryAuthorization,
    ]).status !== 0
  ) {
    fail("Apple 公证凭据或 Keychain Profile 验证失败。");
  }
}

if (!process.exitCode) {
  console.log("✓ macOS 发布预检通过（未输出任何凭据值）");
}
