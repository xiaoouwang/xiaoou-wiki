/**
 * API-only Worker for Xiaoou Wiki.
 * Public site is on GitHub Pages; this Worker holds the D1 database.
 *
 * Everything writable is owned by the single admin identity (`admin`).
 *
 * Public:  GET /api/health, GET /api/records?topic=
 * Admin:   Authorization: Bearer <ADMIN_TOKEN>
 *          records CRUD, POST /api/admin/sync, GET /api/admin/export
 */

const ADMIN_ID = "admin";

const ALLOWED_ORIGINS = [
  "https://xiaoouwang.github.io",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:8787",
  "http://localhost:8787",
];

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }), request);
    }

    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return cors(
        json({
          service: "xiaoou-wiki-api",
          owner: ADMIN_ID,
          docs: "Public site: https://xiaoouwang.github.io/xiaoou-wiki/",
        }),
        request
      );
    }

    try {
      const res = await handleApi(request, env, url);
      return cors(res, request);
    } catch (err) {
      console.error(err);
      return cors(json({ error: "Server error" }, 500), request);
    }
  },
};

async function handleApi(request, env, url) {
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (path === "/api/health" && request.method === "GET") {
    return json({ ok: true, owner: ADMIN_ID });
  }

  if (path === "/api/records" && request.method === "GET") {
    return listRecords(env, url);
  }

  if (path === "/api/admin/records" && request.method === "GET") {
    const denied = requireAdmin(request, env);
    if (denied) return denied;
    return listRecords(env, url);
  }

  if (path === "/api/admin/records" && request.method === "POST") {
    const denied = requireAdmin(request, env);
    if (denied) return denied;
    return createRecord(request, env);
  }

  const match = path.match(/^\/api\/admin\/records\/([^/]+)$/);
  if (match) {
    const denied = requireAdmin(request, env);
    if (denied) return denied;
    const id = decodeURIComponent(match[1]);
    if (request.method === "PUT") return updateRecord(request, env, id);
    if (request.method === "DELETE") return deleteRecord(env, id);
  }

  if (path === "/api/admin/sync" && request.method === "POST") {
    const denied = requireAdmin(request, env);
    if (denied) return denied;
    return syncAdminContent(request, env);
  }

  if (path === "/api/admin/export" && request.method === "GET") {
    const denied = requireAdmin(request, env);
    if (denied) return denied;
    return exportAdmin(env);
  }

  return json({ error: "Not found" }, 404);
}

function requireAdmin(request, env) {
  const expected = env.ADMIN_TOKEN;
  if (!expected) return json({ error: "Admin token not configured." }, 503);
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !timingSafeEqualString(token, expected)) {
    return json({ error: "Unauthorized" }, 401);
  }
  return null;
}

async function ensureAdmin(env) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO users (id, email, password_hash, name, created_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(ADMIN_ID, "admin@xiaoou.wiki", "token-auth-only", "Xiaoou Wang", new Date().toISOString())
    .run();
}

async function syncAdminContent(request, env) {
  await ensureAdmin(env);
  const body = await readJson(request);
  const commitSha = body.commit ? String(body.commit).slice(0, 64) : null;
  const files = Array.isArray(body.files) ? body.files : null;
  if (!files || !files.length) return json({ error: "files array required." }, 400);
  if (files.length > 400) return json({ error: "Too many files in one sync." }, 400);

  const now = new Date().toISOString();
  let upserted = 0;

  for (const file of files) {
    const path = String(file.path || "")
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .slice(0, 400);
    if (!path || path.includes("..")) continue;
    const content = String(file.content ?? "");
    if (content.length > 1_500_000) {
      return json({ error: `File too large: ${path}` }, 413);
    }
    const sha256 = await sha256Hex(content);
    await env.DB.prepare(
      `INSERT INTO admin_content (path, owner_id, content, sha256, commit_sha, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET
         content = excluded.content,
         sha256 = excluded.sha256,
         commit_sha = excluded.commit_sha,
         updated_at = excluded.updated_at,
         owner_id = excluded.owner_id`
    )
      .bind(path, ADMIN_ID, content, sha256, commitSha, now)
      .run();
    upserted += 1;
  }

  const logId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO admin_sync_log (id, owner_id, commit_sha, file_count, created_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(logId, ADMIN_ID, commitSha, upserted, now)
    .run();

  return json({
    ok: true,
    owner: ADMIN_ID,
    commit: commitSha,
    upserted,
    syncedAt: now,
    syncId: logId,
  });
}

async function exportAdmin(env) {
  await ensureAdmin(env);
  const admin = await env.DB.prepare(
    "SELECT id, email, name, created_at FROM users WHERE id = ?"
  )
    .bind(ADMIN_ID)
    .first();

  const { results: files } = await env.DB.prepare(
    `SELECT path, content, sha256, commit_sha, updated_at
     FROM admin_content WHERE owner_id = ? ORDER BY path`
  )
    .bind(ADMIN_ID)
    .all();

  const { results: records } = await env.DB.prepare(
    `SELECT id, topic, kind, title, body, meta, created_at, updated_at
     FROM records ORDER BY updated_at DESC`
  ).all();

  const { results: syncLog } = await env.DB.prepare(
    `SELECT id, commit_sha, file_count, created_at
     FROM admin_sync_log WHERE owner_id = ? ORDER BY created_at DESC LIMIT 50`
  )
    .bind(ADMIN_ID)
    .all();

  return json({
    exportedAt: new Date().toISOString(),
    owner: admin
      ? { id: admin.id, email: admin.email, name: admin.name, createdAt: admin.created_at }
      : { id: ADMIN_ID },
    files: (files || []).map((f) => ({
      path: f.path,
      content: f.content,
      sha256: f.sha256,
      commit: f.commit_sha,
      updatedAt: f.updated_at,
    })),
    records: (records || []).map(formatRecord),
    syncLog: (syncLog || []).map((s) => ({
      id: s.id,
      commit: s.commit_sha,
      fileCount: s.file_count,
      createdAt: s.created_at,
    })),
  });
}

async function listRecords(env, url) {
  const topic = String(url.searchParams.get("topic") || "").trim();
  let sql = "SELECT id, topic, kind, title, body, meta, created_at, updated_at FROM records";
  const binds = [];
  if (topic) {
    sql += " WHERE topic = ?";
    binds.push(topic);
  }
  sql += " ORDER BY updated_at DESC LIMIT 200";
  const stmt = env.DB.prepare(sql);
  const { results } = binds.length ? await stmt.bind(...binds).all() : await stmt.all();
  const records = (results || []).map(formatRecord);
  return json({ records, owner: ADMIN_ID });
}

async function createRecord(request, env) {
  await ensureAdmin(env);
  const body = await readJson(request);
  const topic = String(body.topic || "").trim();
  const title = String(body.title || "").trim().slice(0, 200);
  const kind = String(body.kind || "note").trim().slice(0, 40) || "note";
  const text = String(body.body || "");
  const meta = body.meta && typeof body.meta === "object" ? body.meta : {};
  meta.ownerId = ADMIN_ID;

  if (!topic || !title) return json({ error: "topic and title are required." }, 400);

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO records (id, topic, kind, title, body, meta, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(id, topic, kind, title, text, JSON.stringify(meta), now, now)
    .run();

  return json({
    record: formatRecord({
      id,
      topic,
      kind,
      title,
      body: text,
      meta: JSON.stringify(meta),
      created_at: now,
      updated_at: now,
    }),
  });
}

async function updateRecord(request, env, id) {
  const existing = await env.DB.prepare("SELECT * FROM records WHERE id = ?").bind(id).first();
  if (!existing) return json({ error: "Not found" }, 404);

  const body = await readJson(request);
  const title = body.title != null ? String(body.title).trim().slice(0, 200) : existing.title;
  const kind = body.kind != null ? String(body.kind).trim().slice(0, 40) || "note" : existing.kind;
  const text = body.body != null ? String(body.body) : existing.body;
  const meta =
    body.meta && typeof body.meta === "object" ? body.meta : safeJsonObject(existing.meta);
  meta.ownerId = ADMIN_ID;
  const now = new Date().toISOString();

  await env.DB.prepare(
    "UPDATE records SET kind = ?, title = ?, body = ?, meta = ?, updated_at = ? WHERE id = ?"
  )
    .bind(kind, title, text, JSON.stringify(meta), now, id)
    .run();

  return json({
    record: formatRecord({
      ...existing,
      kind,
      title,
      body: text,
      meta: JSON.stringify(meta),
      updated_at: now,
    }),
  });
}

async function deleteRecord(env, id) {
  const result = await env.DB.prepare("DELETE FROM records WHERE id = ?").bind(id).run();
  if (!result.meta?.changes) return json({ error: "Not found" }, 404);
  return json({ ok: true });
}

function formatRecord(row) {
  return {
    id: row.id,
    topic: row.topic,
    kind: row.kind,
    title: row.title,
    body: row.body,
    meta: safeJsonObject(row.meta),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safeJsonObject(raw) {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw || "{}") : raw;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function cors(response, request) {
  const origin = request.headers.get("Origin") || "";
  const headers = new Headers(response.headers);
  if (ALLOWED_ORIGINS.includes(origin) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    headers.set("Access-Control-Max-Age", "86400");
  }
  return new Response(response.body, { status: response.status, headers });
}

function timingSafeEqualString(a, b) {
  const enc = new TextEncoder();
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  if (aa.byteLength !== bb.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < aa.byteLength; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
