#!/usr/bin/env node
/**
 * Sync local site content into the Cloudflare D1 admin store.
 * Every synced file is owned by the single admin identity for later export.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const API_BASE =
  process.env.XIAOOU_WIKI_API || "https://xiaoou-wiki-api.singerxo.workers.dev";
const TOKEN =
  process.env.ADMIN_TOKEN ||
  loadEnvToken() ||
  "";

const INCLUDE_DIRS = ["data", "css", "js"];
const INCLUDE_ROOT_FILES = [
  "index.html",
  "ski.html",
  "singing.html",
  "piano.html",
  "guitar.html",
  "badminton.html",
  "swimming.html",
  "self-development.html",
  "admin.html",
  "sitemap.xml",
  "robots.txt",
  "README.md",
  "package.json",
  "wrangler.jsonc",
];
const TEXT_EXT = new Set([
  ".html",
  ".css",
  ".js",
  ".json",
  ".md",
  ".txt",
  ".xml",
  ".svg",
  ".jsonc",
]);

function loadEnvToken() {
  for (const name of [".env", ".env.local"]) {
    const p = join(ROOT, name);
    if (!existsSync(p)) continue;
    const lines = readFileSync(p, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^\s*ADMIN_TOKEN\s*=\s*(.*)$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  return "";
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === ".DS_Store" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function isTextPath(filePath) {
  const lower = filePath.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot === -1) return false;
  return TEXT_EXT.has(lower.slice(dot));
}

function collectFiles() {
  const files = [];
  for (const dir of INCLUDE_DIRS) {
    for (const full of walk(join(ROOT, dir))) {
      if (!isTextPath(full)) continue;
      files.push(full);
    }
  }
  for (const name of INCLUDE_ROOT_FILES) {
    const full = join(ROOT, name);
    if (existsSync(full) && isTextPath(full)) files.push(full);
  }
  // theory/video JSON already covered by data/
  return [...new Set(files)];
}

function gitCommit() {
  try {
    return execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

async function main() {
  if (!TOKEN) {
    console.error(
      "Missing ADMIN_TOKEN. Put it in .env (gitignored) or export ADMIN_TOKEN=..."
    );
    process.exit(1);
  }

  const paths = collectFiles();
  const payload = {
    commit: gitCommit(),
    files: paths.map((full) => {
      const path = relative(ROOT, full).replace(/\\/g, "/");
      const content = readFileSync(full, "utf8");
      return { path, content };
    }),
  };

  const bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
  console.log(`Syncing ${payload.files.length} files (${Math.round(bytes / 1024)} KB) as admin…`);

  const res = await fetch(`${API_BASE}/api/admin/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Sync failed:", data.error || res.status);
    process.exit(1);
  }
  console.log(
    `OK owner=${data.owner} upserted=${data.upserted} commit=${data.commit || "n/a"}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
