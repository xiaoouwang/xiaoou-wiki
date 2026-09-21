#!/usr/bin/env node
import { cpSync, mkdirSync, readdirSync, rmSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const out = join(root, "deploy-assets");
const skip = new Set([
  "node_modules",
  ".wrangler",
  "worker",
  "migrations",
  "deploy-assets",
  ".git",
  ".vscode",
  "package.json",
  "package-lock.json",
  "wrangler.jsonc",
  "README.md",
  ".gitignore",
  ".assetsignore",
  "scripts",
]);

if (existsSync(out)) rmSync(out, { recursive: true, force: true });
mkdirSync(out);

for (const name of readdirSync(root)) {
  if (skip.has(name) || name.endsWith(".toml") || name === ".DS_Store") continue;
  const src = join(root, name);
  cpSync(src, join(out, name), { recursive: statSync(src).isDirectory() });
}

console.log("Prepared deploy-assets/");
