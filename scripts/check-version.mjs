#!/usr/bin/env node
/**
 * 版本一致性校验：项目版本以 package.json 为唯一事实来源，
 * wrangler.jsonc 的 vars.APP_VERSION（运行时展示用）必须与之一致。
 */
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const wranglerRaw = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");

const match = /"APP_VERSION"\s*:\s*"([^"]+)"/.exec(wranglerRaw);
if (!match) {
  console.error("✗ wrangler.jsonc 中未找到 vars.APP_VERSION");
  process.exit(1);
}
if (match[1] !== pkg.version) {
  console.error(`✗ 版本不一致：package.json=${pkg.version}，wrangler.jsonc APP_VERSION=${match[1]}`);
  process.exit(1);
}
console.log(`✓ 版本一致：${pkg.version}`);
