/**
 * Piano Sheets tab — catalog cards + AlphaTab score viewer + MP4 playback.
 */
import * as alphaTab from "https://cdn.jsdelivr.net/npm/@coderline/alphatab@1.6.3/dist/alphaTab.min.mjs";
import { unzipSync, strFromU8 } from "https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js";

const AT_VERSION = "1.6.3";
const FONT_DIR = `https://cdn.jsdelivr.net/npm/@coderline/alphatab@${AT_VERSION}/dist/font/`;
const SHEETS_URL = "data/piano/sheets.json";

const els = {
  list: document.getElementById("sheets-list"),
  detail: document.getElementById("sheets-detail"),
  cards: document.getElementById("sheets-cards"),
  count: document.getElementById("sheets-count"),
  empty: document.getElementById("sheets-empty"),
  back: document.getElementById("sheets-back"),
  title: document.getElementById("sheets-detail-title"),
  meta: document.getElementById("sheets-detail-meta"),
  status: document.getElementById("sheets-status"),
  videoWrap: document.getElementById("sheets-video-wrap"),
  video: document.getElementById("sheets-video"),
  downloadMxl: document.getElementById("sheets-download-mxl"),
  downloadPdf: document.getElementById("sheets-download-pdf"),
  description: document.getElementById("sheets-description"),
  viewport: document.getElementById("sheets-viewport"),
  alphaTab: document.getElementById("alphaTab"),
};

let catalog = [];
let api = null;
let loading = null;
let activeSheetId = null;

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setStatus(text, isError = false) {
  if (!els.status) return;
  els.status.textContent = text || "";
  els.status.classList.toggle("is-error", Boolean(isError && text));
  els.status.hidden = !text;
}

function linkifyEscaped(escaped) {
  return escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
}

function markdownToHtml(md) {
  const blocks = String(md || "")
    .trim()
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  return blocks
    .map((block) => {
      const lines = block.split("\n").map((l) => l.trim());
      if (lines.every((l) => /^([•\-*]|\d+\.)\s+/.test(l))) {
        const items = lines
          .map((l) => l.replace(/^([•\-*]|\d+\.)\s+/, ""))
          .map((l) => `<li>${linkifyEscaped(escapeHtml(l))}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      const withBreaks = linkifyEscaped(escapeHtml(lines.join("\n"))).replaceAll("\n", "<br />");
      return `<p>${withBreaks}</p>`;
    })
    .join("");
}

function sheetById(id) {
  return catalog.find((s) => s.id === id) || null;
}

function sheetHref(id) {
  const qs = new URLSearchParams({ tab: "sheets" });
  if (id) qs.set("sheet", id);
  return `?${qs.toString()}`;
}

function syncSheetRoute(id, { replace = false } = {}) {
  const url = sheetHref(id);
  if (replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
}

function sheetCardHTML(sheet) {
  const subtitle = sheet.titleAlt ? `${sheet.titleAlt}` : "Piano sheet";
  const thumb = sheet.thumbnail
    ? `<img src="${escapeHtml(sheet.thumbnail)}" alt="" loading="lazy" />`
    : `<span class="sheet-score-mark">♪</span>`;
  return `<a class="video-card sheet-score-card" href="${sheetHref(sheet.id)}" data-sheet-id="${escapeHtml(sheet.id)}">
    <div class="thumb sheet-score-thumb" aria-hidden="true">
      ${thumb}
      <span class="duration-badge">Sheet</span>
    </div>
    <div class="card-body">
      <div class="card-top">
        <h3 class="card-title">${escapeHtml(sheet.title)}</h3>
        <div class="meta-pills">
          <span class="level-pill" style="--level-color:#4a6fa5">Piano</span>
        </div>
      </div>
      <p class="card-desc">${escapeHtml(sheet.teaser || subtitle)}</p>
      <div class="card-tags"><span class="mini-tag">${escapeHtml(subtitle)}</span></div>
    </div>
  </a>`;
}

function renderCatalog() {
  if (!els.cards) return;
  const n = catalog.length;
  if (els.count) els.count.textContent = `${n} music sheet${n === 1 ? "" : "s"}`;
  if (els.empty) els.empty.hidden = n > 0;
  els.cards.innerHTML = catalog.map(sheetCardHTML).join("");
}

function loadDescription(sheet) {
  if (!els.description) return;
  const md = sheet.description || sheet.teaser || "";
  els.description.innerHTML = md ? markdownToHtml(md) : "";
}

async function mxlToMusicXmlBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch ${url} (${res.status})`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const files = unzipSync(buf);
  const entry =
    Object.keys(files).find((k) => /\.musicxml$/i.test(k)) ||
    Object.keys(files).find((k) => /(^|\/)score\.xml$/i.test(k)) ||
    Object.keys(files).find((k) => /\.xml$/i.test(k) && !/container\.xml$/i.test(k));
  if (!entry) throw new Error("No MusicXML found inside the .mxl archive");
  return files[entry];
}

function stopVideo() {
  if (!els.video) return;
  els.video.pause();
  els.video.removeAttribute("src");
  els.video.load();
  if (els.videoWrap) els.videoWrap.hidden = true;
}

function loadVideo(sheet) {
  if (!els.video || !els.videoWrap) return;
  if (!sheet.video) {
    stopVideo();
    return;
  }
  els.videoWrap.hidden = false;
  els.video.src = sheet.video;
  els.video.load();
}

function destroyApi() {
  if (api) {
    try {
      api.destroy();
    } catch {
      /* ignore */
    }
  }
  api = null;
  if (els.alphaTab) els.alphaTab.innerHTML = "";
}

async function loadScoreIntoAlphaTab(sheet) {
  if (!els.alphaTab || !els.viewport) return;
  if (loading) await loading.catch(() => {});

  destroyApi();
  setStatus("Loading score…");

  loading = (async () => {
    const xmlBytes = await mxlToMusicXmlBytes(sheet.mxl);

    api = new alphaTab.AlphaTabApi(els.alphaTab, {
      core: {
        fontDirectory: FONT_DIR,
        engine: "html5",
      },
      importer: {
        mergePartGroupsInMusicXml: true,
      },
      display: {
        scale: 0.95,
        stretchForce: 0.8,
      },
      player: {
        enablePlayer: false,
      },
    });

    api.error.on((err) => {
      console.error(err);
      setStatus(err?.message || "Could not render this score.", true);
    });

    api.renderFinished.on(() => {
      setStatus("");
    });

    try {
      api.load(xmlBytes);
    } catch {
      api.load(strFromU8(xmlBytes));
    }
  })()
    .catch((err) => {
      console.error(err);
      setStatus(err?.message || "Could not load the sheet.", true);
      destroyApi();
    })
    .finally(() => {
      loading = null;
    });

  return loading;
}

async function openSheet(id, { sync = true } = {}) {
  const sheet = sheetById(id);
  if (!sheet || !els.detail || !els.list) return;

  activeSheetId = id;
  els.list.hidden = true;
  els.detail.hidden = false;

  if (els.title) els.title.textContent = sheet.title;
  if (els.meta) {
    els.meta.textContent = sheet.titleAlt
      ? `${sheet.titleAlt} · Piano arrangement`
      : "Piano arrangement · MusicXML via AlphaTab";
  }
  if (els.downloadMxl) {
    els.downloadMxl.href = sheet.mxl;
    els.downloadMxl.download = sheet.mxl.split("/").pop() || "score.mxl";
  }
  if (els.downloadPdf) {
    els.downloadPdf.href = sheet.pdf;
    els.downloadPdf.download = sheet.pdf.split("/").pop() || "score.pdf";
    els.downloadPdf.hidden = !sheet.pdf;
  }

  loadVideo(sheet);
  loadDescription(sheet);
  if (sync) syncSheetRoute(id);
  await loadScoreIntoAlphaTab(sheet);
}

function showSheetList({ sync = true } = {}) {
  activeSheetId = null;
  stopVideo();
  destroyApi();
  if (els.list) els.list.hidden = false;
  if (els.detail) els.detail.hidden = true;
  if (sync) syncSheetRoute(null, { replace: true });
}

async function ensureCatalog() {
  if (catalog.length) return catalog;
  const res = await fetch(SHEETS_URL);
  if (!res.ok) throw new Error("Could not load sheets catalog");
  const data = await res.json();
  catalog = Array.isArray(data.sheets) ? data.sheets : [];
  renderCatalog();
  return catalog;
}

async function onSheetsTab() {
  try {
    await ensureCatalog();
  } catch (err) {
    console.error(err);
    if (els.count) els.count.textContent = "Music sheets";
    if (els.empty) {
      els.empty.hidden = false;
      els.empty.textContent = "Could not load sheets.";
    }
    return;
  }

  const sheetId = new URLSearchParams(location.search).get("sheet");
  if (sheetId && sheetById(sheetId)) openSheet(sheetId, { sync: false });
  else showSheetList({ sync: false });
}

function onTabChange(tab) {
  if (tab === "sheets") onSheetsTab();
  else stopVideo();
}

els.cards?.addEventListener("click", (e) => {
  const card = e.target.closest("[data-sheet-id]");
  if (!card) return;
  e.preventDefault();
  openSheet(card.dataset.sheetId);
});

els.back?.addEventListener("click", (e) => {
  e.preventDefault();
  showSheetList();
});

document.addEventListener("wiki:tabchange", (e) => {
  onTabChange(e.detail?.tab);
});

window.addEventListener("popstate", () => {
  const tab = new URLSearchParams(location.search).get("tab");
  if (tab === "sheets") onSheetsTab();
});

queueMicrotask(() => {
  const active = document.querySelector(".tab.tab-active")?.dataset?.tab;
  const fromUrl = new URLSearchParams(location.search).get("tab");
  onTabChange(active || fromUrl || "");
});
