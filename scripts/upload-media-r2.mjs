#!/usr/bin/env node
/**
 * Upload local media files to Cloudflare R2 (xiaoou-wiki-media).
 * Usage:
 *   node scripts/upload-media-r2.mjs videos/bd6-….mp4 thumbnails/bd6-….jpg
 *   node scripts/upload-media-r2.mjs --all-local-downloads
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

const ROOT = process.cwd();
const BUCKET = "xiaoou-wiki-media";

function contentType(path) {
  if (/\.mp4$/i.test(path)) return "video/mp4";
  if (/\.webm$/i.test(path)) return "video/webm";
  if (/\.jpg$/i.test(path) || /\.jpeg$/i.test(path)) return "image/jpeg";
  if (/\.png$/i.test(path)) return "image/png";
  if (/\.webp$/i.test(path)) return "image/webp";
  if (/\.svg$/i.test(path)) return "image/svg+xml";
  return "application/octet-stream";
}

function uploadOne(localRel) {
  const local = join(ROOT, localRel);
  if (!existsSync(local)) throw new Error(`Missing ${localRel}`);
  const key = localRel.replace(/\\/g, "/").replace(/^\/+/, "");
  console.log(`→ r2://${BUCKET}/${key} (${Math.round(statSync(local).size / 1024)} KB)`);
  execFileSync(
    "npx",
    [
      "wrangler",
      "r2",
      "object",
      "put",
      `${BUCKET}/${key}`,
      "--file",
      local,
      "--content-type",
      contentType(local),
      "--remote",
    ],
    { stdio: "inherit", cwd: ROOT }
  );
  return key;
}

function listDownloadedMedia() {
  const out = [];
  for (const dir of ["videos", "thumbnails"]) {
    const full = join(ROOT, dir);
    if (!existsSync(full)) continue;
    for (const name of readdirSync(full)) {
      // downloaded youtube assets look like bd6-xxxx.mp4 / bd7-xxxx.jpg
      if (/^[a-z]+?\d+-[A-Za-z0-9_-]+\.(mp4|jpg|jpeg|png|webp)$/i.test(name)) {
        out.push(`${dir}/${name}`);
      }
    }
  }
  return out;
}

const args = process.argv.slice(2).filter((a) => a !== "--");
const files = args.includes("--all-local-downloads")
  ? listDownloadedMedia()
  : args.filter((a) => !a.startsWith("--"));

if (!files.length) {
  console.error("Pass file paths or --all-local-downloads");
  process.exit(1);
}

const keys = files.map(uploadOne);
console.log(JSON.stringify({ ok: true, uploaded: keys }, null, 2));
