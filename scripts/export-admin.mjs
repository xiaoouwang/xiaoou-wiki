#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const API_BASE =
  process.env.XIAOOU_WIKI_API || "https://xiaoou-wiki-api.singerxo.workers.dev";

function loadEnvToken() {
  for (const name of [".env", ".env.local"]) {
    const p = join(ROOT, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*ADMIN_TOKEN\s*=\s*(.*)$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  return "";
}

const TOKEN = process.env.ADMIN_TOKEN || loadEnvToken();
if (!TOKEN) {
  console.error("Missing ADMIN_TOKEN in env or .env");
  process.exit(1);
}

const res = await fetch(`${API_BASE}/api/admin/export`, {
  headers: { Authorization: `Bearer ${TOKEN}` },
});
const data = await res.json();
if (!res.ok) {
  console.error(data.error || res.status);
  process.exit(1);
}

const out = join(ROOT, `admin-export-${new Date().toISOString().slice(0, 10)}.json`);
writeFileSync(out, JSON.stringify(data, null, 2));
console.log(`Exported ${data.files?.length || 0} files + ${data.records?.length || 0} records → ${out}`);
