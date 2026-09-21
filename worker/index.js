/**
 * API-only Worker for Xiaoou Wiki.
 * Public site is on GitHub Pages; this Worker holds the D1 database.
 *
 * Public:  GET /api/health, GET /api/records?topic=
 * Admin:   Authorization: Bearer <ADMIN_TOKEN>
 *          GET/POST /api/admin/records, PUT/DELETE /api/admin/records/:id
 */

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
    return json({ ok: true });
  }

  if (path === "/api/records" && request.method === "GET") {
    return listRecords(env, url, { publicOnly: true });
  }

  if (path === "/api/admin/records" && request.method === "GET") {
    const denied = requireAdmin(request, env);
    if (denied) return denied;
    return listRecords(env, url, { publicOnly: false });
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

async function listRecords(env, url, { publicOnly }) {
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
  return json({ records });
}

async function createRecord(request, env) {
  const body = await readJson(request);
  const topic = String(body.topic || "").trim();
  const title = String(body.title || "").trim().slice(0, 200);
  const kind = String(body.kind || "note").trim().slice(0, 40) || "note";
  const text = String(body.body || "");
  const meta = body.meta && typeof body.meta === "object" ? body.meta : {};

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
