#!/usr/bin/env node
/**
 * Add a YouTube video into a topic library:
 * download mp4 + thumbnail, draft notes from title/description/subs, update videos.json
 *
 * Usage:
 *   node scripts/add-youtube-video.mjs \
 *     --url https://www.youtube.com/watch?v=... \
 *     --topic badminton \
 *     --category beginner \
 *     --subtags net
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

const ROOT = process.cwd();
const MEDIA_BASE =
  process.env.XIAOOU_MEDIA_BASE || "https://xiaoou-wiki-api.singerxo.workers.dev/media";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function parseList(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function ytJson(url) {
  const raw = execFileSync(
    "yt-dlp",
    ["--dump-single-json", "--no-download", "--no-warnings", url],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }
  );
  return JSON.parse(raw);
}

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function nextVideoId(videos, topic) {
  const prefix = {
    badminton: "bd",
    ski: "sk",
    snowboard: "v",
    singing: "sg",
    piano: "pn",
    guitar: "gt",
    swimming: "sw",
    "self-development": "sd",
  }[topic] || "vid";
  let max = 0;
  for (const v of videos) {
    const m = String(v.id || "").match(new RegExp(`^${prefix}(\\d+)$`));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${max + 1}`;
}

function formatDuration(seconds) {
  const s = Math.round(Number(seconds) || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function stripVtt(text) {
  return text
    .replace(/^WEBVTT[\s\S]*?\n\n/, "")
    .replace(/\d{2}:\d{2}:\d{2}\.\d{3}\s-->\s\d{2}:\d{2}:\d{2}\.\d{3}.*\n/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l && !/^\d+$/.test(l))
    .filter((l, i, arr) => l !== arr[i - 1])
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function downloadSubs(url, workDir, videoId) {
  ensureDir(workDir);
  try {
    execFileSync(
      "yt-dlp",
      [
        "--skip-download",
        "--write-auto-sub",
        "--write-sub",
        "--sub-langs",
        "zh-Hans,zh,en.*,en",
        "--convert-subs",
        "vtt",
        "-o",
        join(workDir, videoId),
        url,
      ],
      { stdio: "pipe" }
    );
  } catch {
    return "";
  }
  const files = readdirSync(workDir).filter((f) => f.startsWith(videoId) && f.endsWith(".vtt"));
  if (!files.length) return "";
  // Prefer Chinese if present
  files.sort((a, b) => {
    const score = (f) => (/\.zh/.test(f) ? 0 : /\.en/.test(f) ? 1 : 2);
    return score(a) - score(b);
  });
  return stripVtt(readFileSync(join(workDir, files[0]), "utf8")).slice(0, 6000);
}

function draftNotes({ title, description, transcript, category, subtags }) {
  const corpus = [title, description, transcript].filter(Boolean).join("\n");
  const lines = description
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l && !/^#/.test(l) && !/^http/i.test(l) && l.length > 8)
    .slice(0, 8);

  const points = [];
  const pushUnique = (p) => {
    const clean = p.replace(/\s+/g, " ").trim();
    if (!clean || clean.length < 8) return;
    if (points.some((x) => x === clean)) return;
    points.push(clean.slice(0, 160));
  };

  for (const line of lines) {
    if (/^[•\-–*\d.、]/.test(line) || /[：:]/.test(line)) pushUnique(line.replace(/^[•\-–*\d.、]+\s*/, ""));
  }

  // Keyword heuristics for badminton net / general coaching
  const heuristics = [
    [/框|架子|framework|frame/i, "Set a stable racket frame before contact — don’t poke with a floppy wrist."],
    [/手.*网|网带|tape|平齐|齐网/i, "Keep the hitting hand near net-tape height so soft net shots stay controlled."],
    [/搓|切|soft|touch/i, "Use a soft rubbing / touch action at the net instead of a hard swing."],
    [/接|接球|receive/i, "Prepare early for the next contact — recovery starts as you finish the net shot."],
    [/低|重心|center of gravity|gravity/i, "Stay low while moving; rise only into contact when needed."],
    [/步法|footwork|split/i, "Arrive with balanced footwork so the net shot is an option, not a scramble."],
  ];
  for (const [re, tip] of heuristics) {
    if (re.test(corpus)) pushUnique(tip);
  }

  while (points.length < 3) {
    pushUnique(
      [
        `Focus on the ${subtags[0] || category} details shown in this clip and repeat them slowly.`,
        "Pause and copy one key position from the demo before adding speed.",
        "Film one short practice set and compare your shape to the coach’s.",
      ][points.length]
    );
  }

  const titleLine = String(title || "").replace(/\s+/g, " ").trim();
  const descLine = description
    .split(/\n+/)
    .map((s) => s.trim())
    .find((s) => s.length > 20 && !/^#/.test(s) && s !== titleLine);

  const abstract = (descLine && descLine.length > 40 ? descLine : titleLine || descLine || "Coaching clip.")
    .replace(/\s+/g, " ")
    .slice(0, 220);

  const conclusion =
    transcript && transcript.length > 80
      ? "Revisit the clip once after practice and check whether your contact height and recovery match the demo."
      : "Watch once for the shape, then drill the same contact with fewer shuttles and cleaner balance.";

  return {
    abstract,
    points: points.slice(0, 5),
    conclusion,
  };
}

function englishTitleFromChinese(title, subtags) {
  // Keep original as description seed; provide a clear English library title when possible
  if (/网前|搓|网/.test(title) || subtags.includes("net")) {
    return "Net touch: frame set, hand at tape height";
  }
  return title.slice(0, 90);
}

function main() {
  const url = arg("url");
  const topic = arg("topic");
  const category = arg("category", "beginner");
  const subtags = parseList(arg("subtags", ""));
  if (!url || !topic) {
    console.error("Required: --url --topic [--category] [--subtags a,b]");
    process.exit(1);
  }

  const dataPath = join(ROOT, "data", topic, "videos.json");
  if (!existsSync(dataPath)) {
    console.error("Missing", dataPath);
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(dataPath, "utf8"));

  // Ensure subtags exist on the category
  const cat = data.categories.find((c) => c.id === category);
  if (!cat) {
    console.error("Unknown category", category);
    process.exit(1);
  }
  for (const sid of subtags) {
    if (!cat.subtags.some((s) => s.id === sid)) {
      cat.subtags.push({
        id: sid,
        label: sid === "net" ? "Net play" : sid.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase()),
      });
    }
  }

  console.log("Fetching metadata…");
  const meta = ytJson(url);
  const ytId = meta.id;
  const id = nextVideoId(data.videos, topic);
  const duration = formatDuration(meta.duration);
  const creator = meta.uploader || meta.channel || "YouTube";
  const description = (meta.description || "").trim();
  const titleZh = meta.title || "Untitled";

  ensureDir(join(ROOT, "videos"));
  ensureDir(join(ROOT, "thumbnails"));
  ensureDir(join(ROOT, "videos", "_meta"));

  const mp4Name = `${id}-${ytId}.mp4`;
  const thumbName = `${id}-${ytId}.jpg`;
  const mp4Path = join(ROOT, "videos", mp4Name);
  const thumbPath = join(ROOT, "thumbnails", thumbName);

  console.log("Downloading video…");
  execFileSync(
    "yt-dlp",
    [
      "-f",
      "bv*[ext=mp4][height<=720]+ba[ext=m4a]/b[ext=mp4]/b/bv*[height<=720]+ba/b",
      "--merge-output-format",
      "mp4",
      "--extractor-args",
      "youtube:player_client=android,web",
      "-o",
      mp4Path,
      "--no-playlist",
      url,
    ],
    { stdio: "inherit" }
  );

  console.log("Downloading thumbnail…");
  try {
    execFileSync(
      "yt-dlp",
      ["--skip-download", "--write-thumbnail", "--convert-thumbnails", "jpg", "-o", join(ROOT, "thumbnails", `${id}-${ytId}`), url],
      { stdio: "pipe" }
    );
    // yt-dlp may write .jpg directly
    if (!existsSync(thumbPath)) {
      const candidates = readdirSync(join(ROOT, "thumbnails")).filter((f) => f.startsWith(`${id}-${ytId}`) && /\.(jpg|jpeg|png|webp)$/i.test(f));
      if (candidates.length) {
        const src = join(ROOT, "thumbnails", candidates[0]);
        if (src !== thumbPath) {
          copyFileSync(src, thumbPath);
          if (/\.webp$/i.test(candidates[0]) || candidates[0] !== thumbName) {
            try {
              unlinkSync(src);
            } catch {
              /* ignore */
            }
          }
        }
      }
    }
  } catch {
    // fallback: ffmpeg from video
  }
  if (!existsSync(thumbPath) && existsSync(mp4Path)) {
    execFileSync("ffmpeg", ["-y", "-ss", "00:00:03", "-i", mp4Path, "-frames:v", "1", "-q:v", "3", thumbPath], {
      stdio: "pipe",
    });
  }

  console.log("Reading captions for notes…");
  const transcript = downloadSubs(url, join(ROOT, "videos", "_meta"), ytId);
  const notes = draftNotes({
    title: titleZh,
    description,
    transcript,
    category,
    subtags,
  });

  console.log("Uploading media to Cloudflare R2…");
  execFileSync("node", [join(ROOT, "scripts/upload-media-r2.mjs"), `videos/${mp4Name}`, `thumbnails/${thumbName}`], {
    stdio: "inherit",
    cwd: ROOT,
  });

  const entry = {
    id,
    title: englishTitleFromChinese(titleZh, subtags),
    description: titleZh,
    thumbnail: `${MEDIA_BASE}/thumbnails/${thumbName}`,
    file: `${MEDIA_BASE}/videos/${mp4Name}`,
    source: {
      platform: "youtube",
      creator,
      url,
    },
    category,
    subtags,
    duration,
    addedAt: new Date().toISOString().slice(0, 10),
    notes,
  };

  data.videos.push(entry);
  writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, id, file: entry.file, thumbnail: entry.thumbnail, notes }, null, 2));
}

main();
