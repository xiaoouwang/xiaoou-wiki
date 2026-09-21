#!/usr/bin/env node
import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const hook = join(process.cwd(), ".git", "hooks", "pre-push");
const src = join(process.cwd(), "scripts", "pre-push");
if (!existsSync(join(process.cwd(), ".git"))) {
  console.log("No .git directory — skip hook install.");
  process.exit(0);
}
mkdirSync(join(process.cwd(), ".git", "hooks"), { recursive: true });
copyFileSync(src, hook);
chmodSync(hook, 0o755);
console.log("Installed git pre-push hook (syncs to admin account).");
