#!/usr/bin/env node
/**
 * 版本一致性校验：项目版本以**根 package.json** 为唯一事实来源；
 * 后端 Worker 的 vars.APP_VERSION（运行时展示与诊断用）必须与之一致
 * （前端构建时通过 vite define 注入同一个版本号）。
 */
import { readFileSync } from "node:fs";

const rootPkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const wranglerRaw = readFileSync(new URL("../apps/api/wrangler.jsonc", import.meta.url), "utf8");

const match = /"APP_VERSION"\s*:\s*"([^"]+)"/.exec(wranglerRaw);
if (!match) {
  console.error("✗ apps/api/wrangler.jsonc 中未找到 vars.APP_VERSION");
  process.exit(1);
}
if (match[1] !== rootPkg.version) {
  console.error(`✗ 版本不一致：package.json=${rootPkg.version}，wrangler.jsonc APP_VERSION=${match[1]}`);
  process.exit(1);
}
console.log(`✓ 版本一致：${rootPkg.version}`);
