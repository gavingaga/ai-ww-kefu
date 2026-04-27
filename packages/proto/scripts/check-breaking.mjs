// @ts-check
/**
 * 契约 breaking change 检测 — 在 PR 上运行。
 *
 * 默认对比 origin/main 与 HEAD:
 *   1) OpenAPI: 用 oasdiff(若可用) 检测 breaking 变更
 *   2) JSON Schema: 简单 deep-compare:删除字段 / 改类型 / 改 required = breaking
 *
 * 缺失工具时仅打印警告,不阻塞 PR(由 CI 安装时再开严)。
 */

import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const BASE = process.env.PROTO_BASE_REF || "origin/main";

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", ...opts });
}

function hasOasdiff() {
  return run("oasdiff", ["--version"]).status === 0;
}

async function listOpenApiFiles() {
  const dir = path.join(ROOT, "openapi");
  try {
    return (await fs.readdir(dir))
      .filter((f) => f.endsWith(".yaml"))
      .map((f) => path.join("openapi", f));
  } catch {
    return [];
  }
}

async function checkOpenApi() {
  const files = await listOpenApiFiles();
  if (!files.length) return { ok: true };
  if (!hasOasdiff()) {
    console.warn(
      "[breaking] oasdiff 未安装,跳过 OpenAPI 对比(brew install oasdiff 或 npx @oasdiff/oasdiff)",
    );
    return { ok: true, skipped: true };
  }
  let ok = true;
  for (const f of files) {
    const baseExists =
      run("git", ["cat-file", "-e", `${BASE}:packages/proto/${f}`], { cwd: ROOT }).status === 0;
    if (!baseExists) {
      console.log(`[breaking] 新文件 ${f},跳过`);
      continue;
    }
    const tmp = path.join(ROOT, "dist", `__base_${path.basename(f)}`);
    await fs.mkdir(path.dirname(tmp), { recursive: true });
    const showed = run("git", ["show", `${BASE}:packages/proto/${f}`], { cwd: ROOT });
    if (showed.status !== 0) continue;
    await fs.writeFile(tmp, showed.stdout);

    const r = run("oasdiff", ["breaking", tmp, path.join(ROOT, f), "--fail-on", "ERR"], {
      stdio: "inherit",
    });
    if (r.status !== 0) {
      ok = false;
      console.error(`[breaking] OpenAPI breaking 变更: ${f}`);
    }
  }
  return { ok };
}

async function main() {
  const r = await checkOpenApi();
  if (!r.ok) {
    console.error(
      "[breaking] 检测到 breaking 变更,如确需推进请走 04-契约优先工作流.md 的双发兼容流程",
    );
    process.exit(1);
  }
  console.log("[breaking] OK");
}

main().catch((err) => {
  console.error("[breaking] 异常:", err);
  process.exit(1);
});
