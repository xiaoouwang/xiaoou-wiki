const SITE = {
  sport: document.body.dataset.sport || "snowboard",
  title: document.body.dataset.siteTitle || "Snowboard Wikipedia",
  sportLabel: document.body.dataset.sportLabel || "snowboard",
  siblingLabel: document.body.dataset.siblingLabel || "ski",
  siblingHref: document.body.dataset.siblingHref || "ski.html",
  siteRoot: (document.body.dataset.siteRoot || "https://xiaoouwang.github.io/xiaoou-wiki/").replace(
    /\/?$/,
    "/"
  ),
  pagePath: document.body.dataset.pagePath || "",
  defaultDescription:
    document.body.dataset.defaultDescription ||
    document.querySelector('meta[name="description"]')?.content ||
    "",
  videosUrl: document.body.dataset.videosUrl || "data/snowboard/videos.json",
  theoryUrl: document.body.dataset.theoryUrl || "data/snowboard/theory.json",
};

const PROGRAMS_KEY = `${SITE.sport}-wikipedia-programs`;
const API_BASE =
  localStorage.getItem("xiaoou_wiki_api") || "https://xiaoou-wiki-api.singerxo.workers.dev";
const ADMIN_TOKEN_KEY = "xiaoou_wiki_admin_token";

const state = {
  categories: [],
  videos: [],
  resorts: [],
  series: [],
  programs: loadPrograms(),
  activeCategory: "all",
  activeSubtag: null,
  query: "",
  tab: "library",
  activeVideoId: null,
  activeResortId: null,
  activeProgramId: null,
  activeSeriesId: null,
  activeArticleId: null,
  sheetMode: null,
  isAdmin: false,
  noteOverrides: {},
  notesEditMode: false,
  worldResorts: [],
  resortMap: null,
  resortMapMarkers: null,
  resortMapFilter: null, // null | "visited" | "not-yet" | "ucpa"
  resortMapCountry: null,
  resortMapRegion: null,
  resortMapDepartment: null,
  resortMapQuery: "",
  resortMapFocusId: null,
  resortMapPrevFocusId: null,
  resortMapMarkerById: null,
  resortMapCanvas: null,
  resortMapLabelRaf: 0,
};

const els = {
  filters: document.getElementById("filters"),
  categoryRail: document.getElementById("category-rail"),
  subtagRail: document.getElementById("subtag-rail"),
  videoList: document.getElementById("video-list"),
  resortList: document.getElementById("resort-list"),
  resultCount: document.getElementById("result-count"),
  emptyState: document.getElementById("empty-state"),
  viewLibrary: document.getElementById("view-library"),
  resortMapPanel: null,
  resortMapEl: null,
  resortMapList: null,
  resortMapGeo: null,
  theoryShortcut: document.getElementById("theory-shortcut"),
  theoryHome: document.getElementById("theory-home"),
  seriesList: document.getElementById("series-list"),
  theorySeries: document.getElementById("theory-series"),
  theoryArticle: document.getElementById("theory-article"),
  theoryBackSeries: document.getElementById("theory-back-series"),
  theoryBackArticle: document.getElementById("theory-back-article"),
  seriesTitle: document.getElementById("series-title"),
  seriesSummary: document.getElementById("series-summary"),
  articleList: document.getElementById("article-list"),
  articleKicker: document.getElementById("article-kicker"),
  articleTitle: document.getElementById("article-title"),
  articleContent: document.getElementById("article-content"),
  programsHome: document.getElementById("programs-home"),
  programList: document.getElementById("program-list"),
  programsEmpty: document.getElementById("programs-empty"),
  programDetail: document.getElementById("program-detail"),
  programDetailTitle: document.getElementById("program-detail-title"),
  programDetailCount: document.getElementById("program-detail-count"),
  programSteps: document.getElementById("program-steps"),
  programStepsEmpty: document.getElementById("program-steps-empty"),
  newProgramBtn: document.getElementById("new-program-btn"),
  programBack: document.getElementById("program-back"),
  programDelete: document.getElementById("program-delete"),
  searchToggle: document.getElementById("search-toggle"),
  searchBar: document.getElementById("search-bar"),
  searchInput: document.getElementById("search-input"),
  searchClear: document.getElementById("search-clear"),
  sheet: document.getElementById("detail-sheet"),
  backdrop: document.getElementById("sheet-backdrop"),
  sheetMedia: document.getElementById("sheet-media"),
  player: document.getElementById("sheet-player"),
  playerFallback: document.getElementById("player-fallback"),
  sheetMeta: document.getElementById("sheet-meta"),
  sheetTitle: document.getElementById("sheet-title"),
  sheetDesc: document.getElementById("sheet-desc"),
  sheetTags: document.getElementById("sheet-tags"),
  notesCard: document.getElementById("notes-card"),
  notesAbstract: document.getElementById("notes-abstract"),
  notesPoints: document.getElementById("notes-points"),
  notesConclusion: document.getElementById("notes-conclusion"),
  sourceCard: document.getElementById("source-card"),
  sourceCreator: document.getElementById("source-creator"),
  sourcePlatform: document.getElementById("source-platform"),
  sourceLink: document.getElementById("source-link"),
  sheetActions: document.getElementById("sheet-actions"),
  sheetAddProgram: document.getElementById("sheet-add-program"),
  pickerBackdrop: document.getElementById("picker-backdrop"),
  picker: document.getElementById("program-picker"),
  pickerHint: document.getElementById("picker-hint"),
  pickerList: document.getElementById("picker-list"),
  pickerNew: document.getElementById("picker-new"),
  pickerCancel: document.getElementById("picker-cancel"),
  tabs: [...document.querySelectorAll(".tab")],
  views: [...document.querySelectorAll(".view")],
};

const platformLabel = {
  youtube: "YouTube",
  instagram: "Instagram",
  rednote: "Rednote",
};

let syncingRoute = false;

function loadPrograms() {
  try {
    const raw = JSON.parse(localStorage.getItem(PROGRAMS_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function persistPrograms() {
  localStorage.setItem(PROGRAMS_KEY, JSON.stringify(state.programs));
}

function uid() {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function supportsResortMap() {
  return SITE.sport === "ski" || SITE.sport === "snowboard";
}

function categoryById(id) {
  if (id === "all") {
    return {
      id: "all",
      label: "All",
      kind: "videos",
      color: "#3d7ea6",
      subtags: skillTags(),
    };
  }
  if (id === "resort-map" && supportsResortMap()) {
    return {
      id: "resort-map",
      label: "Resort Map",
      kind: "map",
      color: "#5B7C99",
      subtags: [],
    };
  }
  return state.categories.find((c) => c.id === id);
}

function activeCategory() {
  return categoryById(state.activeCategory);
}

function isResortsMode() {
  return activeCategory()?.kind === "resorts";
}

function isMapMode() {
  return activeCategory()?.kind === "map";
}

function skillTags() {
  const map = new Map();
  for (const cat of state.categories) {
    if (cat.kind !== "videos") continue;
    for (const tag of cat.subtags || []) {
      if (!map.has(tag.id)) map.set(tag.id, tag);
    }
  }
  return [...map.values()];
}

function subtagLabel(categoryId, subtagId) {
  const direct = categoryById(categoryId)?.subtags?.find((s) => s.id === subtagId)?.label;
  if (direct) return direct;
  return skillTags().find((s) => s.id === subtagId)?.label
    || state.categories.flatMap((c) => c.subtags || []).find((s) => s.id === subtagId)?.label
    || subtagId;
}

function videoById(id) {
  return state.videos.find((v) => v.id === id);
}

function resortById(id) {
  return state.resorts.find((r) => r.id === id);
}

function programById(id) {
  return state.programs.find((p) => p.id === id);
}

function seriesById(id) {
  return state.series.find((s) => s.id === id);
}

function videoSource(video) {
  return video.source || {};
}

function hrefFor(params) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== "") qs.set(key, value);
  });
  const str = qs.toString();
  return str ? `?${str}` : location.pathname;
}

function libraryHref({ category, subtag, video, resort } = {}) {
  return hrefFor({
    tab: "library",
    category: category || state.activeCategory,
    subtag: subtag || undefined,
    video: video || undefined,
    resort: resort || undefined,
  });
}

function theoryHref({ series, article } = {}) {
  return hrefFor({
    tab: "theory",
    series: series || undefined,
    article: article || undefined,
  });
}

function programsHref({ program } = {}) {
  return hrefFor({
    tab: "programs",
    program: program || undefined,
  });
}

function buildRouteParams() {
  const params = {};
  params.tab = state.tab || "library";

  if (state.tab === "library") {
    params.category = state.activeCategory;
    if (state.activeSubtag) params.subtag = state.activeSubtag;
    if (state.activeVideoId) params.video = state.activeVideoId;
    if (state.activeResortId) params.resort = state.activeResortId;
  } else if (state.tab === "theory") {
    if (state.activeSeriesId) params.series = state.activeSeriesId;
    if (state.activeArticleId) params.article = state.activeArticleId;
  } else if (state.tab === "programs") {
    if (state.activeProgramId) params.program = state.activeProgramId;
  }

  return params;
}

function syncRoute({ replace = false } = {}) {
  if (syncingRoute) return;
  const params = buildRouteParams();
  const nextSearch = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value != null && value !== "")
  ).toString();
  const nextUrl = nextSearch ? `?${nextSearch}` : location.pathname;
  const currentSearch = location.search.replace(/^\?/, "");
  if (nextSearch === currentSearch) {
    updateDocumentSeo();
    return;
  }
  history[replace ? "replaceState" : "pushState"](params, "", nextUrl);
  updateDocumentSeo();
  updateTabHrefs();
}

function setMetaById(id, content) {
  const el = document.getElementById(id);
  if (el && content != null) el.setAttribute("content", content);
}

function absoluteShareUrl() {
  return `${SITE.siteRoot}${SITE.pagePath}${location.search}`;
}

function buildSeoDescription() {
  const topic = SITE.sportLabel;
  const sibling = SITE.siblingLabel;
  if (state.activeVideoId) {
    const video = videoById(state.activeVideoId);
    if (video) {
      return `${video.title} — ${topic} tutorial on ${SITE.title}. ${video.description} Browse ${sibling} anytime.`;
    }
  }
  if (state.activeResortId) {
    const resort = resortById(state.activeResortId);
    if (resort) {
      return `${resort.name} guide on ${SITE.title}. ${resort.summary || ""} Part of Skill Wikipedia.`.trim();
    }
  }
  if (state.tab === "theory" && state.activeArticleId) {
    const series = seriesById(state.activeSeriesId);
    const article = series?.articles.find((a) => a.id === state.activeArticleId);
    if (article) {
      return `${article.title} — ${topic} theory on ${SITE.title}. ${article.readMinutes} min read. Part of Skill Wikipedia.`;
    }
  }
  if (state.tab === "theory" && state.activeSeriesId) {
    const series = seriesById(state.activeSeriesId);
    if (series) {
      return `${series.title}: ${series.summary} ${topic} theory on ${SITE.title}.`;
    }
  }
  if (state.tab === "theory") {
    return `${SITE.title} theory series — concepts behind ${topic}. Part of Skill Wikipedia.`;
  }
  if (state.tab === "programs") {
    return `Build ${topic} exercise programs from library videos on ${SITE.title}.`;
  }
  const cat = categoryById(state.activeCategory);
  if (cat) {
    if (cat.kind === "resorts") {
      return `${cat.label} for ${topic} on ${SITE.title}. Part of Skill Wikipedia.`;
    }
    return `${cat.label} ${topic} videos on ${SITE.title} — technique clips, theory, and training programs.`;
  }
  return SITE.defaultDescription;
}

function updateDocumentSeo() {
  const base = SITE.title;
  let title = base;
  if (state.activeVideoId) {
    const video = videoById(state.activeVideoId);
    if (video) title = `${video.title} · ${base}`;
  } else if (state.activeResortId) {
    const resort = resortById(state.activeResortId);
    if (resort) title = `${resort.name} · ${base}`;
  } else if (state.tab === "theory" && state.activeArticleId) {
    const series = seriesById(state.activeSeriesId);
    const article = series?.articles.find((a) => a.id === state.activeArticleId);
    if (article) title = `${article.title} · ${base}`;
  } else if (state.tab === "theory" && state.activeSeriesId) {
    const series = seriesById(state.activeSeriesId);
    if (series) title = `${series.title} · ${base}`;
  } else if (state.tab === "programs" && state.activeProgramId) {
    const program = programById(state.activeProgramId);
    if (program) title = `${program.name} · ${base}`;
  } else if (state.tab === "theory") {
    title = `Theory · ${base}`;
  } else if (state.tab === "programs") {
    title = `Programs · ${base}`;
  } else {
    const cat = categoryById(state.activeCategory);
    if (cat) title = `${cat.label} · ${base}`;
  }

  document.title = title;
  const description = buildSeoDescription();
  const shareUrl = absoluteShareUrl();

  setMetaById("meta-description", description);
  setMetaById("og-title", title);
  setMetaById("og-description", description);
  setMetaById("og-url", shareUrl);
  setMetaById("twitter-title", title);
  setMetaById("twitter-description", description);

  const canonical = document.getElementById("canonical-link");
  if (canonical) canonical.setAttribute("href", shareUrl);
}

function updateDocumentTitle() {
  updateDocumentSeo();
}

function applyRouteFromUrl() {
  const params = new URLSearchParams(location.search);
  const tab = params.get("tab") || "library";
  const videoId = params.get("video");
  const resortId = params.get("resort");
  const category = params.get("category");
  const subtag = params.get("subtag");
  const seriesId = params.get("series");
  const articleId = params.get("article");
  const programId = params.get("program");

  syncingRoute = true;
  try {
    if (videoId && videoById(videoId)) {
      const video = videoById(videoId);
      state.activeCategory = video.category;
      state.activeSubtag = subtag && video.subtags.includes(subtag) ? subtag : null;
      renderCategoryRail();
      renderSubtagRail();
      renderLibrary();
      setTab("library", { sync: false });
      openVideoSheet(video, { sync: false });
      return;
    }

    if (resortId && resortById(resortId)) {
      state.activeCategory = "resorts";
      state.activeSubtag = subtag || null;
      renderCategoryRail();
      renderSubtagRail();
      renderLibrary();
      setTab("library", { sync: false });
      openResortSheet(resortById(resortId), { sync: false });
      return;
    }

    if (tab === "theory") {
      state.activeSeriesId = null;
      state.activeArticleId = null;
      setTab("theory", { sync: false });
      if (seriesId && seriesById(seriesId)) {
        openSeries(seriesId, { sync: false });
        if (articleId) openArticle(articleId, { sync: false });
      } else {
        showTheoryHome({ sync: false });
      }
      return;
    }

    if (tab === "programs") {
      state.activeProgramId = null;
      setTab("programs", { sync: false });
      if (programId && programById(programId)) openProgram(programId, { sync: false });
      else showProgramsHome({ sync: false });
      return;
    }

    state.activeCategory =
      category === "all" || categoryById(category)?.id
        ? category === "all"
          ? "all"
          : categoryById(category).id
        : "all";
    const cat = activeCategory();
    const tagPool = isMapMode() ? [] : isResortsMode() ? cat?.subtags || [] : skillTags();
    state.activeSubtag =
      subtag && tagPool.some((s) => s.id === subtag) ? subtag : null;
    renderCategoryRail();
    renderSubtagRail();
    renderLibrary();
    setTab("library", { sync: false });
    closeSheet({ sync: false });
  } finally {
    syncingRoute = false;
    updateDocumentTitle();
  }
}

function filteredVideos() {
  const q = state.query.trim().toLowerCase();
  const level = state.activeCategory;
  return state.videos.filter((v) => {
    // Level and skill tags are independent filters.
    if (level && level !== "all" && v.category !== level) return false;
    if (state.activeSubtag && !v.subtags.includes(state.activeSubtag)) return false;
    if (!q) return true;
    const source = videoSource(v);
    const hay = [
      v.title,
      v.description,
      v.notes?.abstract,
      v.notes?.conclusion,
      ...(v.notes?.points || []),
      ...((v.notes?.markers || []).map((m) => m.text)),
      source.platform,
      source.creator,
      ...v.subtags.map((id) => subtagLabel(v.category, id)),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

function filteredResorts() {
  const q = state.query.trim().toLowerCase();
  return state.resorts.filter((r) => {
    if (state.activeSubtag && !r.tags.includes(state.activeSubtag)) return false;
    if (!q) return true;
    const hay = [r.name, r.region, r.summary, r.intro, ...r.tags].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

let leafletReady = null;

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletReady) return leafletReady;

  leafletReady = new Promise((resolve, reject) => {
    const cssId = "leaflet-css";
    if (!document.getElementById(cssId)) {
      const link = document.createElement("link");
      link.id = cssId;
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
      link.crossOrigin = "";
      document.head.appendChild(link);
    }

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
    script.crossOrigin = "";
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error("Failed to load Leaflet"));
    document.head.appendChild(script);
  });

  return leafletReady;
}

function ensureMapPanel() {
  if (
    els.resortMapPanel &&
    els.resortMapEl &&
    els.resortMapList &&
    els.resortMapGeo &&
    els.resortMapPanel.querySelector("#resort-map-search")
  ) {
    if (!els.resortMapPanel.dataset.bound) bindResortMapControls(els.resortMapPanel);
    return;
  }

  document.getElementById("resort-map-panel")?.remove();

  const panel = document.createElement("div");
  panel.id = "resort-map-panel";
  panel.className = "resort-map-panel";
  panel.hidden = true;
  panel.innerHTML = `
    <div class="resort-map-search">
      <label class="resort-map-search-field">
        <span>Search resort</span>
        <input
          id="resort-map-search"
          type="search"
          placeholder="e.g. Chamonix, Niseko, Aspen…"
          autocomplete="off"
          spellcheck="false"
        />
      </label>
    </div>
    <div class="resort-map-geo" id="resort-map-geo">
      <label class="resort-map-geo-field">
        <span>Country</span>
        <select id="resort-map-country" data-geo="country"></select>
      </label>
      <label class="resort-map-geo-field">
        <span>Region</span>
        <select id="resort-map-region" data-geo="region"></select>
      </label>
      <label class="resort-map-geo-field">
        <span>Department</span>
        <select id="resort-map-department" data-geo="department"></select>
      </label>
    </div>
    <div class="resort-map-legend" role="group" aria-label="Resort visit filter">
      <button type="button" class="map-legend-btn" data-map-filter="visited" aria-pressed="false">
        <i class="map-legend-dot map-legend-dot-visited" aria-hidden="true"></i> Visited
      </button>
      <button type="button" class="map-legend-btn" data-map-filter="not-yet" aria-pressed="false">
        <i class="map-legend-dot map-legend-dot-other" aria-hidden="true"></i> Not yet
      </button>
      <button type="button" class="map-legend-btn" data-map-filter="ucpa" aria-pressed="false">
        <i class="map-legend-dot map-legend-dot-ucpa" aria-hidden="true"></i> UCPA
      </button>
    </div>
    <div class="resort-map-list" id="resort-map-list" hidden></div>
    <div class="resort-map-frame">
      <div id="resort-map" class="resort-map" role="img" aria-label="Map of ski resorts around the world"></div>
    </div>
  `;

  const host = els.viewLibrary || document.getElementById("view-library");
  const empty = els.emptyState;
  if (empty && empty.parentNode === host) host.insertBefore(panel, empty);
  else host.appendChild(panel);

  els.resortMapPanel = panel;
  els.resortMapEl = panel.querySelector("#resort-map");
  els.resortMapList = panel.querySelector("#resort-map-list");
  els.resortMapGeo = panel.querySelector("#resort-map-geo");
  if (state.resortMap) {
    state.resortMap.remove();
    state.resortMap = null;
    state.resortMapMarkers = null;
  }
  bindResortMapControls(panel);
}

function bindResortMapControls(panel) {
  if (panel.dataset.bound) return;
  panel.dataset.bound = "1";
  panel.querySelectorAll("[data-map-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.mapFilter;
      state.resortMapFocusId = null;
      setResortMapFilter(state.resortMapFilter === next ? null : next);
    });
  });
  panel.querySelectorAll("[data-geo]").forEach((sel) => {
    sel.addEventListener("change", () => {
      const key = sel.dataset.geo;
      const value = sel.value || null;
      if (key === "country") {
        state.resortMapCountry = value;
        state.resortMapRegion = null;
        state.resortMapDepartment = null;
        state.resortMapFocusId = null;
      } else if (key === "region") {
        state.resortMapRegion = value;
        state.resortMapDepartment = null;
        state.resortMapFocusId = null;
      } else if (key === "department") {
        state.resortMapDepartment = value;
        state.resortMapFocusId = null;
      }
      if (isMapMode()) renderLibrary();
    });
  });
  const search = panel.querySelector("#resort-map-search");
  if (search) {
    search.value = state.resortMapQuery || "";
    search.addEventListener("input", () => {
      state.resortMapQuery = search.value;
      if (!isMapMode()) return;
      // Search updates the result list only — map keeps surrounding resorts.
      renderResortMapList(searchListResorts());
    });
  }
}

function setResortMapFilter(filter) {
  state.resortMapFilter = filter;
  if (!isMapMode()) return;
  renderLibrary();
}

function resortGeoPool(level) {
  // Base pool for cascading options (ignore visit filter & search for option lists)
  return state.worldResorts.filter((r) => {
    if (level !== "country" && state.resortMapCountry && r.country !== state.resortMapCountry) return false;
    if (level === "department" && state.resortMapRegion && r.region !== state.resortMapRegion) return false;
    return true;
  });
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function fillGeoSelect(select, values, current, allLabel) {
  if (!select) return;
  const opts = [`<option value="">${allLabel}</option>`]
    .concat(values.map((v) => `<option value="${escapeHtml(v)}"${v === current ? " selected" : ""}>${escapeHtml(v)}</option>`));
  select.innerHTML = opts.join("");
  // Keep selection valid
  if (current && !values.includes(current)) {
    select.value = "";
  } else {
    select.value = current || "";
  }
}

function renderResortMapGeoFilters() {
  ensureMapPanel();
  const search = els.resortMapPanel.querySelector("#resort-map-search");
  if (search && search.value !== (state.resortMapQuery || "")) {
    search.value = state.resortMapQuery || "";
  }
  const countrySel = els.resortMapPanel.querySelector("#resort-map-country");
  const regionSel = els.resortMapPanel.querySelector("#resort-map-region");
  const deptSel = els.resortMapPanel.querySelector("#resort-map-department");

  const countries = uniqueSorted(state.worldResorts.map((r) => r.country));
  fillGeoSelect(countrySel, countries, state.resortMapCountry, "All countries");

  const regions = uniqueSorted(resortGeoPool("region").map((r) => r.region));
  fillGeoSelect(regionSel, state.resortMapCountry ? regions : [], state.resortMapRegion, "All regions");
  regionSel.disabled = !state.resortMapCountry;

  const departments = uniqueSorted(resortGeoPool("department").map((r) => r.department));
  const deptUseful = !(state.resortMapRegion && departments.length === 1 && departments[0] === state.resortMapRegion);
  fillGeoSelect(
    deptSel,
    state.resortMapCountry && deptUseful ? departments : [],
    state.resortMapDepartment,
    "All departments"
  );
  deptSel.disabled = !state.resortMapCountry || !deptUseful;
  deptSel.closest(".resort-map-geo-field")?.classList.toggle("is-disabled", deptSel.disabled);
  regionSel.closest(".resort-map-geo-field")?.classList.toggle("is-disabled", regionSel.disabled);
}

function mapVisibleResorts() {
  return state.worldResorts.filter((r) => {
    if (state.resortMapFilter === "visited" && !r.visited) return false;
    if (state.resortMapFilter === "not-yet" && r.visited) return false;
    if (state.resortMapFilter === "ucpa" && !r.ucpa) return false;
    if (state.resortMapCountry && r.country !== state.resortMapCountry) return false;
    if (state.resortMapRegion && r.region !== state.resortMapRegion) return false;
    if (state.resortMapDepartment && r.department !== state.resortMapDepartment) return false;
    return true;
  });
}

function searchListResorts() {
  const q = state.resortMapQuery.trim().toLowerCase();
  const base = mapVisibleResorts();
  if (!q && !state.resortMapFilter) return [];
  if (!q) return base;
  return base.filter((r) =>
    [r.name, r.region, r.department, r.country, r.area]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q)
  );
}

function renderResortMapList(resorts) {
  ensureMapPanel();
  const list = els.resortMapList;
  if (!list) return;

  const q = state.resortMapQuery.trim();
  const showList = !!state.resortMapFilter || q.length > 0;
  if (!showList) {
    list.hidden = true;
    list.innerHTML = "";
    return;
  }

  let title;
  if (q) title = `Search · ${resorts.length}`;
  else if (state.resortMapFilter === "visited") title = `Visited · ${resorts.length}`;
  else if (state.resortMapFilter === "not-yet") title = `Not yet · ${resorts.length}`;
  else if (state.resortMapFilter === "ucpa") title = `UCPA · ${resorts.length}`;
  else title = `${resorts.length} resorts`;

  const sorted = [...resorts].sort((a, b) => a.name.localeCompare(b.name));
  list.hidden = false;
  list.innerHTML = `
    <div class="resort-map-list-head">
      <p class="resort-map-list-title">${title}</p>
    </div>
    <ul class="resort-map-list-items">
      ${
        sorted.length
          ? sorted
              .map((r) => {
                const place = [r.department, r.region, r.country].filter(Boolean).join(" · ");
                const site = r.website
                  ? `<a class="resort-map-list-link" href="${escapeHtml(r.website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
                      r.website.replace(/^https?:\/\//, "").replace(/\/$/, "")
                    )}</a>`
                  : `<span class="resort-map-list-link is-missing">No website listed</span>`;
                const focused = r.id === state.resortMapFocusId ? " is-focused" : "";
                return `<li class="resort-map-list-item${r.visited ? " is-visited" : ""}${r.ucpa ? " is-ucpa" : ""}${focused}" data-focus-resort="${escapeHtml(r.id)}">
            <div class="resort-map-list-main">
              <span class="resort-map-list-name">${escapeHtml(r.name)}${r.ucpa ? `<span class="map-list-badge">UCPA</span>` : ""}</span>
              <span class="resort-map-list-place">${escapeHtml(place)}</span>
              ${site}
            </div>
            <button type="button" class="resort-map-list-focus" data-focus-resort="${escapeHtml(r.id)}" aria-label="Show ${escapeHtml(r.name)} on map">Map</button>
          </li>`;
              })
              .join("")
          : `<li class="resort-map-list-empty">No resorts match.</li>`
      }
    </ul>
  `;

  list.querySelectorAll("[data-focus-resort]").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      e.preventDefault();
      const resort = state.worldResorts.find((r) => r.id === el.dataset.focusResort);
      if (resort) focusResortOnMap(resort);
    });
  });
}

function syncResortMapLegend() {
  ensureMapPanel();
  els.resortMapPanel?.querySelectorAll("[data-map-filter]").forEach((btn) => {
    const active = btn.dataset.mapFilter === state.resortMapFilter;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function markerStyleFor(resort, focused) {
  if (focused) {
    return {
      radius: 11,
      color: "#8a1f1f",
      weight: 2.5,
      fillColor: "#e23b3b",
      fillOpacity: 1,
    };
  }
  if (resort.visited) {
    return {
      radius: 8,
      color: "#8a4b12",
      weight: 1.5,
      fillColor: "#e08a2a",
      fillOpacity: 0.95,
    };
  }
  if (resort.ucpa && state.resortMapFilter === "ucpa") {
    return {
      radius: 7,
      color: "#0f5c45",
      weight: 1.5,
      fillColor: "#1f9d6a",
      fillOpacity: 0.92,
    };
  }
  return {
    radius: 6,
    color: "#1e4a6e",
    weight: 1.5,
    fillColor: "#3d7ea6",
    fillOpacity: 0.82,
  };
}

function resortMapLabelClass(resort, focused) {
  if (focused) return "resort-map-label is-focused";
  if (resort.visited) return "resort-map-label is-visited";
  if (resort.ucpa && state.resortMapFilter === "ucpa") return "resort-map-label is-ucpa";
  return "resort-map-label";
}

function setMarkerPermanentLabel(marker, resort, focused) {
  if (marker._permanentLabel) return;
  marker.unbindTooltip();
  marker.bindTooltip(escapeHtml(resort.name), {
    permanent: true,
    direction: "top",
    offset: [0, focused ? -10 : -6],
    opacity: 1,
    className: resortMapLabelClass(resort, focused),
  });
  marker._permanentLabel = true;
}

function clearMarkerPermanentLabel(marker) {
  if (!marker._permanentLabel) return;
  marker.unbindTooltip();
  marker._permanentLabel = false;
}

function refreshMarkerStyle(marker, resort, focused) {
  marker.setStyle(markerStyleFor(resort, focused));
  if (marker._permanentLabel) {
    marker.unbindTooltip();
    marker._permanentLabel = false;
    setMarkerPermanentLabel(marker, resort, focused);
  }
}

function applyResortMapHighlight() {
  const byId = state.resortMapMarkerById;
  if (!byId) return;
  const prevId = state.resortMapPrevFocusId;
  const nextId = state.resortMapFocusId;
  if (prevId && prevId !== nextId) {
    const prev = byId.get(prevId);
    if (prev?.resortData) refreshMarkerStyle(prev, prev.resortData, false);
  }
  if (nextId) {
    const next = byId.get(nextId);
    if (next?.resortData) {
      refreshMarkerStyle(next, next.resortData, true);
      setMarkerPermanentLabel(next, next.resortData, true);
    }
  }
  state.resortMapPrevFocusId = nextId;
  scheduleResortMapLabelSync();
}

function focusResortOnMap(resort) {
  if (!state.resortMap) return;
  state.resortMapFocusId = resort.id;
  applyResortMapHighlight();
  state.resortMap.setView([resort.lat, resort.lng], Math.max(state.resortMap.getZoom(), 10), {
    animate: true,
  });
  const marker = state.resortMapMarkerById?.get(resort.id);
  if (marker) marker.openPopup();
  // Keep list selection in sync without rebuilding the map.
  if (state.resortMapQuery.trim() || state.resortMapFilter) {
    renderResortMapList(searchListResorts());
  }
}

function resortMapPopupHTML(resort) {
  const place = [resort.department, resort.region, resort.country].filter(Boolean).join(" · ");
  const badges = [
    resort.visited ? `<span class="map-popup-badge">Visited</span>` : "",
    resort.ucpa ? `<span class="map-popup-badge map-popup-badge-ucpa">UCPA</span>` : "",
  ].join("");
  const site = resort.website
    ? `<a class="map-popup-link" href="${escapeHtml(resort.website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
        resort.website.replace(/^https?:\/\//, "").replace(/\/$/, "")
      )}</a>`
    : "";
  const ucpaLink = resort.ucpa
    ? `<a class="map-popup-link" href="https://www.ucpa-vacances.com/" target="_blank" rel="noopener noreferrer">ucpa-vacances.com</a>`
    : "";
  return `<div class="map-popup">
    <div class="map-popup-title">${escapeHtml(resort.name)}${badges}</div>
    <div class="map-popup-place">${escapeHtml(place)}</div>
    ${site}
    ${ucpaLink}
  </div>`;
}

function shouldShowResortLabels(count) {
  if (!state.resortMap) return count <= 80;
  const z = state.resortMap.getZoom();
  if (count <= 60) return true;
  if (count <= 200) return z >= 7;
  return z >= 9;
}

const RESORT_MAP_MAX_LABELS = 90;

function scheduleResortMapLabelSync() {
  if (state.resortMapLabelRaf) return;
  state.resortMapLabelRaf = requestAnimationFrame(() => {
    state.resortMapLabelRaf = 0;
    syncResortMapLabelVisibility();
  });
}

/** Toggle in-view labels without rebuilding markers (avoids zoom freezes). */
function syncResortMapLabelVisibility() {
  if (!isMapMode() || !state.resortMap || !state.resortMapMarkerById) return;
  const byId = state.resortMapMarkerById;
  const count = byId.size;
  const want = shouldShowResortLabels(count);
  els.resortMapEl?.classList.toggle("resort-map-dense", !want);

  // World view: keep dots canvas-only; only ensure focused label stays.
  if (!want) {
    if (state.resortMapFocusId) {
      const focused = byId.get(state.resortMapFocusId);
      if (focused?.resortData) setMarkerPermanentLabel(focused, focused.resortData, true);
    }
    for (const [id, marker] of byId) {
      if (id === state.resortMapFocusId) continue;
      clearMarkerPermanentLabel(marker);
    }
    return;
  }

  const bounds = state.resortMap.getBounds().pad(0.05);
  const candidates = [];

  for (const [id, marker] of byId) {
    const resort = marker.resortData;
    if (!resort) continue;
    const focused = id === state.resortMapFocusId;
    if (focused) {
      setMarkerPermanentLabel(marker, resort, true);
      continue;
    }
    if (!bounds.contains(marker.getLatLng())) {
      clearMarkerPermanentLabel(marker);
      continue;
    }
    candidates.push(marker);
  }

  candidates.sort((a, b) => Number(b.resortData.visited) - Number(a.resortData.visited));
  candidates.forEach((marker, i) => {
    if (i < RESORT_MAP_MAX_LABELS) setMarkerPermanentLabel(marker, marker.resortData, false);
    else clearMarkerPermanentLabel(marker);
  });
}

function fitMapToFrance() {
  const fr = state.worldResorts.filter((r) => r.country === "France");
  if (fr.length > 1) {
    state.resortMap.fitBounds(
      fr.map((r) => [r.lat, r.lng]),
      { padding: [28, 28], maxZoom: 7 }
    );
  } else {
    state.resortMap.setView([46.6, 2.5], 6);
  }
}

async function renderWorldResortMap(mapResorts, { preserveView = false } = {}) {
  ensureMapPanel();
  renderResortMapGeoFilters();
  syncResortMapLegend();
  renderResortMapList(searchListResorts());
  try {
    const L = await loadLeaflet();
    if (!isMapMode()) return;

    if (!state.resortMap) {
      state.resortMap = L.map(els.resortMapEl, {
        scrollWheelZoom: true,
        zoomControl: true,
        worldCopyJump: true,
        preferCanvas: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        updateWhenZooming: false,
        keepBuffer: 2,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · resorts <a href="https://openskimap.org/">OpenSkiMap</a>',
      }).addTo(state.resortMap);

      state.resortMapMarkers = L.layerGroup().addTo(state.resortMap);
      state.resortMapCanvas = L.canvas({ padding: 0.5 });
      state.resortMap.on("zoomend", scheduleResortMapLabelSync);
      state.resortMap.on("moveend", () => {
        if (shouldShowResortLabels(state.resortMapMarkerById?.size || 0)) {
          scheduleResortMapLabelSync();
        }
      });
    }

    state.resortMapMarkers.clearLayers();
    state.resortMapMarkerById = new Map();
    state.resortMapPrevFocusId = null;
    const bounds = [];
    const ordered = [...mapResorts].sort((a, b) => Number(a.visited) - Number(b.visited));
    for (const resort of ordered) {
      const focused = resort.id === state.resortMapFocusId;
      const marker = L.circleMarker([resort.lat, resort.lng], {
        ...markerStyleFor(resort, focused),
        renderer: state.resortMapCanvas,
      });
      marker.resortData = resort;
      marker._permanentLabel = false;
      marker.bindPopup(() => resortMapPopupHTML(resort), { maxWidth: 280 });
      marker.on("mouseover", () => {
        if (marker._permanentLabel || marker.getTooltip()) return;
        marker.bindTooltip(escapeHtml(resort.name), {
          direction: "top",
          offset: [0, -6],
          opacity: 1,
          className: "resort-map-label",
        });
        marker.openTooltip();
      });
      marker.on("mouseout", () => {
        if (marker._permanentLabel) return;
        marker.unbindTooltip();
      });
      marker.on("click", () => {
        state.resortMapFocusId = resort.id;
        applyResortMapHighlight();
      });
      state.resortMapMarkers.addLayer(marker);
      state.resortMapMarkerById.set(resort.id, marker);
      bounds.push([resort.lat, resort.lng]);
    }

    requestAnimationFrame(() => {
      state.resortMap.invalidateSize();
      syncResortMapLabelVisibility();
      if (preserveView) return;
      if (state.resortMapFocusId && state.resortMapMarkerById.has(state.resortMapFocusId)) {
        const focused = state.worldResorts.find((r) => r.id === state.resortMapFocusId);
        if (focused) {
          state.resortMap.setView([focused.lat, focused.lng], Math.max(state.resortMap.getZoom(), 10));
          state.resortMapMarkerById.get(focused.id)?.openPopup();
          return;
        }
      }
      const geoFiltered = !!(state.resortMapCountry || state.resortMapRegion || state.resortMapDepartment);
      const visitOnly = state.resortMapFilter === "visited" || state.resortMapFilter === "ucpa";
      if (visitOnly && bounds.length) {
        state.resortMap.fitBounds(bounds, { padding: [28, 28], maxZoom: 9 });
      } else if (geoFiltered && bounds.length > 1) {
        state.resortMap.fitBounds(bounds, { padding: [28, 28], maxZoom: 8 });
      } else if (geoFiltered && bounds.length === 1) {
        state.resortMap.setView(bounds[0], 9);
      } else {
        fitMapToFrance();
      }
    });
  } catch (err) {
    console.error(err);
  }
}

function renderCategoryRail() {
  const levels = [
    { id: "all", label: "All", color: "#3d7ea6" },
    ...state.categories.map((cat) => ({ id: cat.id, label: cat.label, color: cat.color })),
  ];
  if (supportsResortMap()) {
    levels.push({ id: "resort-map", label: "Resort Map", color: "#5B7C99" });
  }

  els.categoryRail.innerHTML = levels
    .map((cat) => {
      const active = state.activeCategory === cat.id;
      return `<a
        class="chip level-chip${active ? " chip-active" : ""}"
        href="${libraryHref({ category: cat.id, subtag: state.activeSubtag })}"
        data-category="${cat.id}"
        style="--chip-color:${cat.color}"
        role="tab"
        aria-selected="${active}"
      >${cat.label}</a>`;
    })
    .join("");
}

function renderSubtagRail() {
  if (isMapMode()) {
    els.subtagRail.hidden = true;
    els.subtagRail.innerHTML = "";
    return;
  }
  els.subtagRail.hidden = false;
  const cat = activeCategory();
  const subtags = isResortsMode()
    ? cat?.subtags || []
    : skillTags();
  const chips = [
    { id: null, label: "All tags" },
    ...subtags.map((s) => ({ id: s.id, label: s.label })),
  ];
  const chipColor = isResortsMode() ? cat?.color || "var(--accent)" : "var(--accent)";

  els.subtagRail.innerHTML = chips
    .map((chip) => {
      const active = state.activeSubtag === chip.id;
      return `<a
        class="chip${active ? " chip-active" : ""}"
        href="${libraryHref({ category: state.activeCategory, subtag: chip.id })}"
        data-subtag="${chip.id ?? ""}"
        style="--chip-color:${chipColor}"
        role="tab"
        aria-selected="${active}"
      >${chip.label}</a>`;
    })
    .join("");
}

function videoCardHTML(video) {
  const cat = categoryById(video.category);
  const source = videoSource(video);
  const platform = source.platform || "";
  const tags = video.subtags
    .slice(0, 3)
    .map((id) => `<span class="mini-tag">${subtagLabel(video.category, id)}</span>`)
    .join("");

  return `<a class="video-card" href="${libraryHref({ category: video.category, video: video.id })}" data-id="${video.id}">
    <div class="thumb">
      <img src="${video.thumbnail}" alt="" loading="lazy" />
      <span class="duration-badge">${video.duration}</span>
    </div>
    <div class="card-body">
      <div class="card-top">
        <h3 class="card-title">${escapeHtml(video.title)}</h3>
        <div class="meta-pills">
          ${
            cat
              ? `<span class="level-pill" style="--level-color:${cat.color}">${cat.label}</span>`
              : ""
          }
          ${
            platform
              ? `<span class="platform-pill platform-${platform}">${platformLabel[platform] || platform}</span>`
              : ""
          }
        </div>
      </div>
      <p class="card-desc">${escapeHtml(video.description)}</p>
      <div class="card-tags">${tags}</div>
    </div>
  </a>`;
}

function resortCardHTML(resort) {
  const cat = categoryById("resorts");
  const tags = resort.tags
    .map((id) => `<span class="mini-tag">${subtagLabel("resorts", id)}</span>`)
    .join("");

  return `<a class="resort-card" href="${libraryHref({ category: "resorts", resort: resort.id })}" data-resort-id="${resort.id}">
    <h3 class="resort-card-name">${escapeHtml(resort.name)}</h3>
    <p class="resort-card-region">${escapeHtml(resort.region)}</p>
    <p class="resort-card-summary">${escapeHtml(resort.summary)}</p>
    <div class="resort-card-tags">${tags}</div>
  </a>`;
}

function renderLibrary() {
  if (isMapMode()) {
    els.videoList.hidden = true;
    els.videoList.innerHTML = "";
    els.resortList.hidden = true;
    els.resortList.innerHTML = "";
    els.emptyState.hidden = true;
    els.resultCount.textContent = "";
    els.resultCount.parentElement?.setAttribute("hidden", "");
    const resorts = mapVisibleResorts();
    ensureMapPanel();
    els.resortMapPanel.hidden = false;
    renderWorldResortMap(resorts);
    return;
  }

  if (els.resortMapPanel) els.resortMapPanel.hidden = true;
  state.resortMapFilter = null;
  state.resortMapCountry = null;
  state.resortMapRegion = null;
  state.resortMapDepartment = null;
  state.resortMapQuery = "";
  state.resortMapFocusId = null;
  els.resultCount.parentElement?.removeAttribute("hidden");

  if (isResortsMode()) {
    const resorts = filteredResorts();
    const videos = filteredVideos().sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    els.videoList.hidden = videos.length === 0;
    els.videoList.innerHTML = videos.map(videoCardHTML).join("");
    els.resortList.hidden = resorts.length === 0;
    els.resortList.innerHTML = resorts.map(resortCardHTML).join("");
    const parts = [];
    if (videos.length) parts.push(`${videos.length} video${videos.length === 1 ? "" : "s"}`);
    if (resorts.length) parts.push(`${resorts.length} resort guide${resorts.length === 1 ? "" : "s"}`);
    els.resultCount.textContent = parts.join(" · ") || "0 items";
    els.emptyState.hidden = videos.length + resorts.length > 0;
    return;
  }

  const list = filteredVideos().sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  els.resortList.hidden = true;
  els.resortList.innerHTML = "";
  els.videoList.hidden = false;
  els.videoList.innerHTML = list.map(videoCardHTML).join("");
  els.resultCount.textContent = `${list.length} video${list.length === 1 ? "" : "s"}`;
  els.emptyState.hidden = list.length > 0;
}

function setSubtag(id, { sync = true } = {}) {
  state.activeSubtag = id || null;
  state.activeVideoId = null;
  state.activeResortId = null;

  renderCategoryRail();
  renderSubtagRail();
  renderLibrary();
  document
    .querySelector(`#subtag-rail [data-subtag="${state.activeSubtag ?? ""}"]`)
    ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  if (sync) syncRoute();
}

function setCategory(id, { sync = true } = {}) {
  if (id !== "all" && !categoryById(id)) return;
  const prevMode = activeCategory()?.kind || "videos";
  state.activeCategory = id;
  const nextMode = activeCategory()?.kind || "videos";
  // Reset tags when switching between video library, resorts, and map.
  if (prevMode !== nextMode) state.activeSubtag = null;
  state.activeVideoId = null;
  state.activeResortId = null;
  renderCategoryRail();
  renderSubtagRail();
  renderLibrary();
  if (sync) syncRoute();
}

function showTheoryHome({ sync = true } = {}) {
  state.activeSeriesId = null;
  state.activeArticleId = null;
  els.theoryHome.hidden = false;
  els.theorySeries.hidden = true;
  els.theoryArticle.hidden = true;
  els.seriesList.innerHTML = state.series
    .map((series) => {
      const n = series.articles.length;
      return `<a class="series-card" href="${theoryHref({ series: series.id })}" data-series-id="${series.id}">
        <h3 class="series-card-title">${escapeHtml(series.title)}</h3>
        <p class="series-card-summary">${escapeHtml(series.summary)} · ${n} part${n === 1 ? "" : "s"}</p>
      </a>`;
    })
    .join("");
  if (sync) syncRoute();
}

function openSeries(id, { sync = true } = {}) {
  const series = seriesById(id);
  if (!series) return;
  state.activeSeriesId = id;
  state.activeArticleId = null;
  els.theoryHome.hidden = true;
  els.theorySeries.hidden = false;
  els.theoryArticle.hidden = true;
  els.seriesTitle.textContent = series.title;
  els.seriesSummary.textContent = series.summary;
  els.articleList.innerHTML = series.articles
    .map(
      (article, index) => `<a class="article-card" href="${theoryHref({ series: series.id, article: article.id })}" data-article-id="${article.id}">
        <h3 class="article-card-title">${index + 1}. ${escapeHtml(article.title)}</h3>
        <p class="article-card-meta">${article.readMinutes} min read</p>
      </a>`
    )
    .join("");
  if (sync) syncRoute();
}

function openArticle(articleId, { sync = true } = {}) {
  const series = seriesById(state.activeSeriesId);
  const article = series?.articles.find((a) => a.id === articleId);
  if (!series || !article) return;
  state.activeArticleId = articleId;
  els.theoryHome.hidden = true;
  els.theorySeries.hidden = true;
  els.theoryArticle.hidden = false;
  els.articleKicker.textContent = `${series.title} · ${article.readMinutes} min`;
  els.articleTitle.textContent = article.title;
  els.articleContent.innerHTML = article.body
    .split(/\n\s*\n/)
    .map((para) => `<p>${escapeHtml(para.trim())}</p>`)
    .join("");
  if (sync) syncRoute();
}

function renderProgramsHome() {
  const list = [...state.programs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  els.programList.innerHTML = list
    .map((program) => {
      const n = program.videoIds.length;
      return `<a class="program-card" href="${programsHref({ program: program.id })}" data-program-id="${program.id}">
        <h3 class="program-card-title">${escapeHtml(program.name)}</h3>
        <p class="program-card-meta">${n} step${n === 1 ? "" : "s"}</p>
      </a>`;
    })
    .join("");
  els.programsEmpty.hidden = list.length > 0;
}

function renderProgramDetail() {
  const program = programById(state.activeProgramId);
  if (!program) {
    showProgramsHome();
    return;
  }

  els.programDetailTitle.textContent = program.name;
  const n = program.videoIds.length;
  els.programDetailCount.textContent = `${n} step${n === 1 ? "" : "s"} · tap a step to watch`;

  els.programSteps.innerHTML = program.videoIds
    .map((id, index) => {
      const video = videoById(id);
      if (!video) return null;
      const cat = categoryById(video.category);
      return `<div class="program-step" data-step-index="${index}">
        <span class="step-num">${index + 1}</span>
        <a class="step-main" href="${libraryHref({ category: video.category, video: video.id })}" data-id="${video.id}">
          <div class="step-thumb"><img src="${video.thumbnail}" alt="" /></div>
          <div class="step-body">
            <h3 class="step-title">${escapeHtml(video.title)}</h3>
            <p class="step-meta">${cat ? cat.label : ""} · ${video.duration}</p>
          </div>
        </a>
        <div class="step-actions">
          <button type="button" class="step-btn" data-move="up" data-index="${index}" ${index === 0 ? "disabled" : ""} aria-label="Move up">↑</button>
          <button type="button" class="step-btn" data-move="down" data-index="${index}" ${index === program.videoIds.length - 1 ? "disabled" : ""} aria-label="Move down">↓</button>
          <button type="button" class="step-btn" data-remove="${index}" aria-label="Remove">×</button>
        </div>
      </div>`;
    })
    .filter(Boolean)
    .join("");

  els.programStepsEmpty.hidden = program.videoIds.length > 0;
}

function showProgramsHome({ sync = true } = {}) {
  state.activeProgramId = null;
  els.programsHome.hidden = false;
  els.programDetail.hidden = true;
  renderProgramsHome();
  if (sync) syncRoute();
}

function openProgram(id, { sync = true } = {}) {
  state.activeProgramId = id;
  els.programsHome.hidden = true;
  els.programDetail.hidden = false;
  renderProgramDetail();
  if (sync) syncRoute();
}

function promptProgramName(defaultName = "") {
  const name = window.prompt("Program name", defaultName || "My practice plan");
  if (name === null) return null;
  const trimmed = name.trim();
  return trimmed || null;
}

function createProgram(name) {
  const program = {
    id: uid(),
    name,
    videoIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.programs.unshift(program);
  persistPrograms();
  return program;
}

function addVideoToProgram(programId, videoId) {
  const program = programById(programId);
  if (!program) return;
  program.videoIds.push(videoId);
  program.updatedAt = new Date().toISOString();
  persistPrograms();
}

function moveStep(index, direction) {
  const program = programById(state.activeProgramId);
  if (!program) return;
  const target = index + direction;
  if (target < 0 || target >= program.videoIds.length) return;
  const ids = program.videoIds;
  [ids[index], ids[target]] = [ids[target], ids[index]];
  program.updatedAt = new Date().toISOString();
  persistPrograms();
  renderProgramDetail();
}

function removeStep(index) {
  const program = programById(state.activeProgramId);
  if (!program) return;
  program.videoIds.splice(index, 1);
  program.updatedAt = new Date().toISOString();
  persistPrograms();
  renderProgramDetail();
}

function deleteActiveProgram() {
  const program = programById(state.activeProgramId);
  if (!program) return;
  if (!window.confirm(`Delete “${program.name}”?`)) return;
  state.programs = state.programs.filter((p) => p.id !== program.id);
  persistPrograms();
  showProgramsHome();
}

function setTab(tab, { sync = true } = {}) {
  state.tab = tab;
  els.tabs.forEach((btn) => {
    btn.classList.toggle("tab-active", btn.dataset.tab === tab);
  });
  els.views.forEach((view) => {
    view.classList.toggle("view-active", view.dataset.view === tab);
  });
  els.filters.hidden = tab !== "library";
  if (tab === "programs") {
    if (state.activeProgramId) openProgram(state.activeProgramId, { sync: false });
    else showProgramsHome({ sync: false });
  }
  if (tab === "theory") {
    if (state.activeArticleId) openArticle(state.activeArticleId, { sync: false });
    else if (state.activeSeriesId) openSeries(state.activeSeriesId, { sync: false });
    else showTheoryHome({ sync: false });
  }
  if (tab === "library") {
    state.activeSeriesId = null;
    state.activeArticleId = null;
    state.activeProgramId = null;
  }
  if (sync) syncRoute();
}

function stopPlayer() {
  els.player.pause();
  els.player.removeAttribute("src");
  els.player.load();
  els.playerFallback.hidden = true;
}

function loadPlayer(video) {
  els.playerFallback.hidden = true;
  els.playerFallback.style.setProperty("--fallback-poster", `url("${video.thumbnail}")`);
  els.player.poster = video.thumbnail;
  els.player.src = video.file;
  els.player.load();
}

function paragraphsHTML(text) {
  return text
    .split(/\n\s*\n/)
    .map((para) => `<p>${escapeHtml(para.trim())}</p>`)
    .join("");
}

function openVideoSheet(video, { sync = true } = {}) {
  const cat = categoryById(video.category);
  const source = videoSource(video);
  const platform = source.platform || "";

  state.sheetMode = "video";
  state.activeVideoId = video.id;
  state.activeResortId = null;
  state.notesEditMode = false;
  // Do not rebuild the library mid-click — that retargets taps onto sheet buttons.

  els.sheetMedia.hidden = false;
  els.sourceCard.hidden = false;
  els.sheetActions.hidden = false;
  loadPlayer(video);

  els.sheetMeta.innerHTML = [
    cat
      ? `<span class="level-pill" style="--level-color:${cat.color}">${cat.label}</span>`
      : "",
    platform
      ? `<span class="platform-pill platform-${platform}">${platformLabel[platform] || platform}</span>`
      : "",
  ].join("");
  els.sheetTitle.textContent = video.title;
  els.sheetDesc.className = "";
  els.sheetDesc.innerHTML = "";
  els.sheetDesc.textContent = video.description;
  els.sheetTags.innerHTML = video.subtags
    .map(
      (id) =>
        `<span class="chip chip-active" style="--chip-color:${cat?.color || "var(--accent)"}">${subtagLabel(video.category, id)}</span>`
    )
    .join("");

  fillNotesCard(video.notes);

  els.sourceCreator.textContent = source.creator || "Unknown creator";
  els.sourcePlatform.textContent = platform
    ? `Originally on ${platformLabel[platform] || platform}`
    : "Original source";
  if (source.url) {
    els.sourceLink.href = source.url;
    els.sourceLink.hidden = false;
  } else {
    els.sourceLink.removeAttribute("href");
    els.sourceLink.hidden = true;
  }

  showSheet();
  if (sync) syncRoute();
}

function openResortSheet(resort, { sync = true } = {}) {
  const cat = categoryById("resorts");

  state.sheetMode = "resort";
  state.activeResortId = resort.id;
  state.activeVideoId = null;
  if (state.activeCategory !== "resorts") {
    state.activeCategory = "resorts";
    state.activeSubtag = null;
    renderCategoryRail();
    renderSubtagRail();
    renderLibrary();
  }
  stopPlayer();

  els.sheetMedia.hidden = true;
  els.sourceCard.hidden = true;
  els.sheetActions.hidden = true;
  clearNotesCard();

  els.sheetMeta.innerHTML = cat
    ? `<span class="level-pill" style="--level-color:${cat.color}">Resort guide</span>
       <span class="platform-pill">${escapeHtml(resort.region)}</span>`
    : "";
  els.sheetTitle.textContent = resort.name;
  els.sheetDesc.className = "sheet-intro";
  els.sheetDesc.innerHTML = paragraphsHTML(resort.intro);
  els.sheetTags.innerHTML = resort.tags
    .map(
      (id) =>
        `<span class="chip chip-active" style="--chip-color:${cat?.color || "var(--accent)"}">${subtagLabel("resorts", id)}</span>`
    )
    .join("");

  showSheet();
  if (sync) syncRoute();
}

function showSheet() {
  els.backdrop.hidden = false;
  els.sheet.setAttribute("aria-hidden", "false");
  // Ignore the opening tap so it cannot hit "Add to program" / picker actions.
  els.sheet.style.pointerEvents = "none";
  requestAnimationFrame(() => {
    els.sheet.classList.add("sheet-open");
    window.setTimeout(() => {
      if (els.sheet.classList.contains("sheet-open")) {
        els.sheet.style.pointerEvents = "";
      }
    }, 320);
  });
}

function closeSheet({ sync = true } = {}) {
  stopPlayer();
  els.sheet.classList.remove("sheet-open");
  els.sheet.setAttribute("aria-hidden", "true");
  state.activeVideoId = null;
  state.activeResortId = null;
  state.sheetMode = null;
  state.notesEditMode = false;
  if (sync) syncRoute({ replace: true });
  setTimeout(() => {
    if (!els.picker.classList.contains("picker-open")) {
      els.backdrop.hidden = true;
    }
    els.sheetMedia.hidden = false;
    els.sourceCard.hidden = false;
    els.sheetActions.hidden = false;
    els.sheetDesc.className = "";
    clearNotesCard();
  }, 220);
}

function formatMarkerTime(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function parseMarkerTime(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, Math.round(raw));
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.max(0, Math.round(Number(s)));
  const m = s.match(/^(\d+):([0-5]?\d)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return null;
}

function normalizeClientNotes(notes) {
  const src = notes && typeof notes === "object" ? notes : {};
  const markers = Array.isArray(src.markers)
    ? src.markers
        .map((m) => {
          if (!m || typeof m !== "object") return null;
          const text = String(m.text || "").trim();
          if (!text) return null;
          const time = parseMarkerTime(m.time);
          return { time: time == null ? 0 : time, text };
        })
        .filter(Boolean)
        .sort((a, b) => a.time - b.time || a.text.localeCompare(b.text))
    : [];
  return {
    abstract: String(src.abstract || "").trim(),
    points: Array.isArray(src.points) ? src.points.filter(Boolean) : [],
    conclusion: String(src.conclusion || "").trim(),
    markers,
  };
}

function getPlayerTime() {
  const player = els.player;
  if (!player) return 0;
  const t = Number(player.currentTime);
  if (!Number.isFinite(t) || t < 0) return 0;
  return Math.floor(t);
}

function seekPlayerTo(seconds) {
  if (!els.player) return;
  const t = Math.max(0, Number(seconds) || 0);
  const apply = () => {
    try {
      els.player.currentTime = t;
    } catch {
      /* ignore */
    }
    els.player.play?.().catch(() => {});
  };
  if (els.player.readyState >= 1) apply();
  else els.player.addEventListener("loadedmetadata", apply, { once: true });
}

function fillNotesCard(notes) {
  if (!els.notesCard) return;
  ensureNotesShell();

  const normalized = normalizeClientNotes(notes);
  const markers = normalized.markers;
  const abstract = normalized.abstract;
  const points = normalized.points;
  const conclusion = normalized.conclusion;
  const hasMarkers = markers.length > 0;
  const hasLegacy = Boolean(abstract || points.length || conclusion);
  const admin = state.isAdmin;

  if (!hasMarkers && !hasLegacy && !admin) {
    clearNotesCard();
    return;
  }

  els.notesCard.hidden = false;
  state.notesEditMode = Boolean(state.isAdmin && state.notesEditMode);
  els.notesCard.classList.toggle("notes-card-markers", hasMarkers || state.isAdmin);

  // Prefer timed markers when present; keep legacy fields for older clips.
  if (hasMarkers || state.isAdmin) {
    els.notesAbstract.hidden = true;
    els.notesPoints.hidden = true;
    els.notesConclusion.hidden = true;
    renderNotesMarkers(markers, { admin: state.isAdmin, editing: state.notesEditMode });
    return;
  }

  setNotesAdminChrome(false);
  if (els.notesMarkers) els.notesMarkers.hidden = true;
  els.notesAbstract.hidden = !abstract;
  els.notesAbstract.textContent = abstract;
  els.notesPoints.hidden = points.length === 0;
  els.notesPoints.innerHTML = points.map((point) => `<li>${escapeHtml(point)}</li>`).join("");
  els.notesConclusion.hidden = !conclusion;
  els.notesConclusion.textContent = conclusion;
}

function clearNotesCard() {
  if (!els.notesCard) return;
  els.notesCard.hidden = true;
  els.notesCard.classList.remove("notes-card-admin", "notes-card-markers");
  state.notesEditMode = false;
  els.notesAbstract.textContent = "";
  els.notesAbstract.hidden = true;
  els.notesPoints.innerHTML = "";
  els.notesPoints.hidden = true;
  els.notesConclusion.textContent = "";
  els.notesConclusion.hidden = true;
  if (els.notesMarkers) {
    els.notesMarkers.hidden = true;
    els.notesMarkers.innerHTML = "";
  }
  if (els.notesEditor) {
    els.notesEditor.hidden = true;
    if (els.notesSaveStatus) els.notesSaveStatus.textContent = "";
  }
}

function ensureNotesShell() {
  if (!els.notesCard) return;
  if (!els.notesMarkers) {
    const list = document.createElement("div");
    list.className = "notes-markers";
    list.id = "notes-markers";
    list.hidden = true;
    els.notesCard.appendChild(list);
    els.notesMarkers = list;
    list.addEventListener("click", onNotesMarkersClick);
  }
  if (!els.notesEditor) {
    const editor = document.createElement("div");
    editor.className = "notes-editor";
    editor.id = "notes-editor";
    editor.hidden = true;
    editor.innerHTML = `
      <div class="notes-editor-actions">
        <button type="button" class="btn-primary" id="notes-edit-toggle">Edit takeaways</button>
        <button type="button" class="btn-primary" id="notes-add-marker" hidden>Add marker</button>
        <button type="button" class="btn-primary" id="notes-save-btn" hidden>Save takeaways</button>
        <span class="notes-save-status" id="notes-save-status" aria-live="polite"></span>
      </div>
    `;
    els.notesCard.appendChild(editor);
    els.notesEditor = editor;
    els.notesEditToggle = editor.querySelector("#notes-edit-toggle");
    els.notesSaveBtn = editor.querySelector("#notes-save-btn");
    els.notesAddMarkerBtn = editor.querySelector("#notes-add-marker");
    els.notesSaveStatus = editor.querySelector("#notes-save-status");
    els.notesEditToggle.addEventListener("click", () => {
      if (!state.isAdmin) return;
      const markers = getCurrentMarkers();
      if (state.notesEditMode) {
        // Leaving edit mode always writes the current markers to the database.
        saveNotesFromEditor().catch((err) => {
          if (els.notesSaveStatus) els.notesSaveStatus.textContent = err.message || "Save failed";
        });
        return;
      }
      state.notesEditMode = true;
      if (els.notesSaveStatus) els.notesSaveStatus.textContent = "";
      renderNotesMarkers(markers, { admin: true, editing: true });
    });
    els.notesSaveBtn.addEventListener("click", () => {
      if (!state.isAdmin) return;
      saveNotesFromEditor().catch((err) => {
        els.notesSaveStatus.textContent = err.message || "Save failed";
      });
    });
    els.notesAddMarkerBtn.addEventListener("click", () => {
      if (!state.isAdmin) return;
      const current = getCurrentMarkers();
      const t = getPlayerTime();
      current.push({ time: t, text: "" });
      state.notesEditMode = true;
      renderNotesMarkers(current, { admin: true, editing: true, focusTime: t });
    });
  }
}

function getCurrentMarkers() {
  if (els.notesMarkers?.querySelector(".notes-marker-edit")) {
    return readNotesFromEditor({ keepEmpty: true }).markers;
  }
  const fromDom = [...(els.notesMarkers?.querySelectorAll(".notes-marker[data-time]") || [])].map((row) => ({
    time: Number(row.dataset.time) || 0,
    text: String(row.querySelector(".notes-marker-text")?.textContent || "").trim(),
  }));
  if (fromDom.length) return fromDom.sort((a, b) => a.time - b.time || a.text.localeCompare(b.text));
  const video = videoById(state.activeVideoId);
  return normalizeClientNotes(video?.notes).markers;
}

function setNotesAdminChrome(admin, { editing = false } = {}) {
  const isAdmin = Boolean(admin && state.isAdmin);
  const showEditor = Boolean(isAdmin && editing);
  els.notesCard?.classList.toggle("notes-card-admin", isAdmin);
  if (els.notesEditor) els.notesEditor.hidden = !isAdmin;
  if (els.notesEditToggle) {
    els.notesEditToggle.hidden = !isAdmin;
    els.notesEditToggle.textContent = showEditor ? "Done editing" : "Edit takeaways";
  }
  if (els.notesAddMarkerBtn) els.notesAddMarkerBtn.hidden = !isAdmin;
  if (els.notesSaveBtn) els.notesSaveBtn.hidden = !showEditor;
  if (!isAdmin && els.notesSaveStatus) els.notesSaveStatus.textContent = "";
  return { isAdmin, showEditor };
}

function renderNotesMarkers(markers, { admin = false, editing = false, focusTime = null } = {}) {
  ensureNotesShell();
  const { isAdmin, showEditor } = setNotesAdminChrome(admin, { editing });
  const sorted = [...markers].sort((a, b) => a.time - b.time || String(a.text).localeCompare(String(b.text)));
  const rows = sorted;
  let focusIndex = -1;
  if (focusTime != null) {
    focusIndex = rows.findIndex((m) => m.time === focusTime && !String(m.text || "").trim());
    if (focusIndex < 0) focusIndex = rows.findIndex((m) => m.time === focusTime);
  }

  els.notesMarkers.hidden = false;
  if (!rows.length) {
    els.notesMarkers.innerHTML = isAdmin
      ? `<p class="notes-empty">No takeaways yet. Add a marker at the current playhead.</p>`
      : "";
  } else {
    els.notesMarkers.innerHTML = rows
      .map((marker, index) => {
        const timeLabel = formatMarkerTime(marker.time);
        const deleteBtn = isAdmin
          ? `<button type="button" class="notes-delete-btn" data-action="delete" data-index="${index}">Delete</button>`
          : "";
        if (showEditor) {
          return `<div class="notes-marker notes-marker-edit" data-index="${index}">
          <input class="notes-time-input" type="text" inputmode="numeric" value="${escapeHtml(timeLabel)}" aria-label="Timestamp" />
          <input class="notes-text-input" type="text" value="${escapeHtml(marker.text)}" placeholder="Brief takeaway" aria-label="Takeaway text" />
          <div class="notes-marker-actions">${deleteBtn}</div>
        </div>`;
        }
        return `<div class="notes-marker" data-time="${Number(marker.time) || 0}">
        <button type="button" class="notes-time" data-seek="${Number(marker.time) || 0}" aria-label="Jump to ${timeLabel}">${timeLabel}</button>
        <p class="notes-marker-text">${escapeHtml(marker.text)}</p>
        ${isAdmin ? `<div class="notes-marker-actions">${deleteBtn}</div>` : ""}
      </div>`;
      })
      .join("");
  }

  if (showEditor && focusIndex >= 0) {
    const row = els.notesMarkers.querySelector(`.notes-marker-edit[data-index="${focusIndex}"]`);
    const textInput = row?.querySelector(".notes-text-input");
    const timeInput = row?.querySelector(".notes-time-input");
    if (timeInput) timeInput.value = formatMarkerTime(rows[focusIndex].time);
    textInput?.focus();
  }
}

function onNotesMarkersClick(e) {
  const actionBtn = e.target.closest("[data-action]");
  if (actionBtn && state.isAdmin) {
    e.preventDefault();
    e.stopPropagation();
    const action = actionBtn.dataset.action;
    const index = Number(actionBtn.dataset.index);
    let markers = getCurrentMarkers();

    if (action === "delete") {
      if (!Number.isFinite(index) || index < 0 || index >= markers.length) return;
      markers.splice(index, 1);
      renderNotesMarkers(markers, { admin: true, editing: state.notesEditMode });
      persistNotesMarkers(markers)
        .then((notes) => {
          state.notesEditMode = false;
          renderNotesMarkers(notes.markers, { admin: true, editing: false });
        })
        .catch((err) => {
          if (els.notesSaveStatus) els.notesSaveStatus.textContent = err.message || "Delete failed";
        });
      return;
    }
    return;
  }

  const seekBtn = e.target.closest("[data-seek]");
  if (seekBtn && !e.target.closest(".notes-marker-edit")) {
    e.preventDefault();
    seekPlayerTo(Number(seekBtn.dataset.seek) || 0);
  }
}

function readNotesFromEditor({ keepEmpty = false } = {}) {
  if (!els.notesMarkers) return { markers: [] };
  const rows = [...els.notesMarkers.querySelectorAll(".notes-marker-edit")];
  const markers = rows
    .map((row) => {
      const timeRaw = row.querySelector(".notes-time-input")?.value;
      const text = String(row.querySelector(".notes-text-input")?.value || "").trim();
      const time = parseMarkerTime(timeRaw);
      if (time == null) return null;
      if (!text && !keepEmpty) return null;
      return { time, text };
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time || a.text.localeCompare(b.text));
  return { markers: keepEmpty ? markers : markers.filter((m) => m.text) };
}

async function adminApi(path, options = {}) {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY) || "";
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    state.isAdmin = false;
    state.notesEditMode = false;
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function persistNotesMarkers(markers) {
  const video = videoById(state.activeVideoId);
  if (!video) throw new Error("No video open.");
  if (!state.isAdmin) throw new Error("Admin login required.");
  const notes = {
    markers: [...markers]
      .map((m) => ({
        time: Number(m.time) || 0,
        text: String(m.text || "").trim(),
      }))
      .filter((m) => m.text)
      .sort((a, b) => a.time - b.time || a.text.localeCompare(b.text)),
  };
  if (els.notesSaveStatus) els.notesSaveStatus.textContent = "Saving…";
  await adminApi("/api/admin/video-notes", {
    method: "PUT",
    body: JSON.stringify({
      topic: SITE.sport,
      videoId: video.id,
      notes,
    }),
  });
  video.notes = notes;
  state.noteOverrides[video.id] = notes;
  if (els.notesSaveStatus) els.notesSaveStatus.textContent = "Saved.";
  return notes;
}

async function saveNotesFromEditor() {
  const notes = await persistNotesMarkers(readNotesFromEditor().markers);
  state.notesEditMode = false;
  renderNotesMarkers(notes.markers, { admin: true, editing: false });
}

function applyNoteOverrides(overrides) {
  state.noteOverrides = overrides && typeof overrides === "object" ? overrides : {};
  for (const video of state.videos) {
    const overlay = state.noteOverrides[video.id];
    if (overlay) video.notes = overlay;
  }
}

async function loadNoteOverrides() {
  try {
    const res = await fetch(
      `${API_BASE}/api/video-notes?topic=${encodeURIComponent(SITE.sport)}`
    );
    if (!res.ok) return;
    const data = await res.json();
    applyNoteOverrides(data.notes || {});
  } catch {
    // Static library still works if the API is unreachable.
  }
}

async function refreshAdminSession() {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  if (!token) {
    state.isAdmin = false;
    state.notesEditMode = false;
    return;
  }
  try {
    await adminApi(`/api/admin/records?topic=${encodeURIComponent(SITE.sport)}`);
    state.isAdmin = true;
  } catch {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    state.isAdmin = false;
    state.notesEditMode = false;
  }
}

function openPicker() {
  const video = videoById(state.activeVideoId);
  if (!video) return;

  els.pickerHint.textContent = `Add “${video.title}” as the next step.`;
  els.pickerList.innerHTML = state.programs
    .map((program) => {
      const already = program.videoIds.includes(video.id);
      const n = program.videoIds.length;
      return `<button type="button" class="picker-item${already ? " in-program" : ""}" data-program-id="${program.id}">
        ${escapeHtml(program.name)}
        <span class="picker-item-meta">${n} step${n === 1 ? "" : "s"}${already ? " · already includes this video" : ""}</span>
      </button>`;
    })
    .join("");

  els.pickerBackdrop.hidden = false;
  els.picker.setAttribute("aria-hidden", "false");
  els.picker.style.pointerEvents = "none";
  requestAnimationFrame(() => {
    els.picker.classList.add("picker-open");
    window.setTimeout(() => {
      if (els.picker.classList.contains("picker-open")) {
        els.picker.style.pointerEvents = "";
      }
    }, 320);
  });
}

function closePicker() {
  els.picker.classList.remove("picker-open");
  els.picker.setAttribute("aria-hidden", "true");
  setTimeout(() => {
    els.pickerBackdrop.hidden = true;
  }, 220);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function seedDemoProgram() {
  if (state.programs.length > 0) return;
  const demos = {
    ski: { name: "Beginner plow day", videoIds: ["sk1", "sk2", "sk3"] },
    snowboard: { name: "Beginner edge day", videoIds: ["v3", "v1", "v2"] },
    singing: { name: "Breath & pitch starter", videoIds: ["sg1", "sg2", "sg3"] },
    piano: { name: "Posture & hands week", videoIds: ["pn1", "pn2", "pn3"] },
    guitar: { name: "Chords & strum day", videoIds: ["gt1", "gt2", "gt3"] },
    badminton: { name: "Grip & footwork day", videoIds: ["bd1", "bd2", "bd3"] },
    swimming: { name: "Float & kick starter", videoIds: ["sw1", "sw2", "sw3"] },
    "self-development": { name: "Habits & focus week", videoIds: ["sd1", "sd2", "sd3"] },
  };
  const demo = demos[SITE.sport] || demos.snowboard;
  const available = demo.videoIds.filter((id) => videoById(id));
  if (!available.length) return;
  state.programs.push({
    id: uid(),
    name: demo.name,
    videoIds: available,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  persistPrograms();
}

function shouldIgnoreNav(e) {
  return e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}

function bindTopicSwitchScroll() {
  const wraps = [...document.querySelectorAll(".topic-switch-wrap")];

  wraps.forEach((wrap) => {
    const scroller = wrap.querySelector(".topic-switch");
    const prev = wrap.querySelector(".topic-switch-prev");
    const next = wrap.querySelector(".topic-switch-next");
    if (!scroller || !prev || !next) return;

    const update = () => {
      const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      const left = scroller.scrollLeft;
      wrap.classList.toggle("can-scroll-left", left > 2);
      wrap.classList.toggle("can-scroll-right", max > 2 && left < max - 2);
    };

    const scrollByAmount = () => Math.max(120, Math.round(scroller.clientWidth * 0.55));

    prev.addEventListener("click", () => {
      scroller.scrollBy({ left: -scrollByAmount(), behavior: "smooth" });
    });
    next.addEventListener("click", () => {
      scroller.scrollBy({ left: scrollByAmount(), behavior: "smooth" });
    });
    scroller.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    wrap._updateTopicScroll = update;
    update();
  });

  return () => wraps.forEach((wrap) => wrap._updateTopicScroll?.());
}

function bindEvents() {
  els.categoryRail.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-category]");
    if (!btn || shouldIgnoreNav(e)) return;
    e.preventDefault();
    closeSheet({ sync: false });
    setCategory(btn.dataset.category);
    if (state.tab !== "library") setTab("library", { sync: false });
    syncRoute();
  });

  els.subtagRail.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-subtag]");
    if (!btn || shouldIgnoreNav(e)) return;
    e.preventDefault();
    closeSheet({ sync: false });
    setSubtag(btn.dataset.subtag || null);
  });

  document.addEventListener("click", (e) => {
    if (shouldIgnoreNav(e)) return;

    const stepOpen = e.target.closest(".step-main");
    if (stepOpen) {
      e.preventDefault();
      const video = videoById(stepOpen.dataset.id);
      if (video) {
        setTab("library", { sync: false });
        openVideoSheet(video);
      }
      return;
    }

    const videoCard = e.target.closest(".video-card");
    if (videoCard) {
      e.preventDefault();
      const video = videoById(videoCard.dataset.id);
      if (video) openVideoSheet(video);
      return;
    }

    const resortCard = e.target.closest(".resort-card");
    if (resortCard) {
      e.preventDefault();
      const resort = resortById(resortCard.dataset.resortId);
      if (resort) openResortSheet(resort);
      return;
    }

    const seriesCard = e.target.closest("a[data-series-id]");
    if (seriesCard) {
      e.preventDefault();
      setTab("theory", { sync: false });
      openSeries(seriesCard.dataset.seriesId);
      return;
    }

    const articleCard = e.target.closest("a[data-article-id]");
    if (articleCard) {
      e.preventDefault();
      openArticle(articleCard.dataset.articleId);
      return;
    }

    const programCard = e.target.closest("a.program-card[data-program-id]");
    if (programCard) {
      e.preventDefault();
      setTab("programs", { sync: false });
      openProgram(programCard.dataset.programId);
    }
  });

  els.programSteps.addEventListener("click", (e) => {
    const move = e.target.closest("[data-move]");
    if (move) {
      moveStep(Number(move.dataset.index), move.dataset.move === "up" ? -1 : 1);
      return;
    }
    const remove = e.target.closest("[data-remove]");
    if (remove) removeStep(Number(remove.dataset.remove));
  });

  els.newProgramBtn.addEventListener("click", () => {
    const name = promptProgramName();
    if (!name) return;
    openProgram(createProgram(name).id);
  });

  els.programBack.addEventListener("click", (e) => {
    e.preventDefault();
    showProgramsHome();
  });
  els.programDelete.addEventListener("click", deleteActiveProgram);

  els.theoryShortcut?.addEventListener("click", () => {
    showTheoryHome({ sync: false });
    setTab("theory");
  });
  els.theoryBackSeries.addEventListener("click", (e) => {
    e.preventDefault();
    showTheoryHome();
  });
  els.theoryBackArticle.addEventListener("click", (e) => {
    e.preventDefault();
    openSeries(state.activeSeriesId);
  });

  els.tabs.forEach((tab) => {
    tab.addEventListener("click", (e) => {
      if (shouldIgnoreNav(e)) return;
      e.preventDefault();
      closeSheet({ sync: false });
      if (tab.dataset.tab === "theory") {
        state.activeSeriesId = null;
        state.activeArticleId = null;
      }
      if (tab.dataset.tab === "programs") {
        state.activeProgramId = null;
      }
      setTab(tab.dataset.tab);
    });
  });

  els.searchToggle.addEventListener("click", () => {
    const open = els.searchBar.hidden;
    els.searchBar.hidden = !open;
    if (open) {
      els.searchInput.focus();
      if (state.tab !== "library") setTab("library");
    } else {
      state.query = "";
      els.searchInput.value = "";
      renderLibrary();
    }
  });

  els.searchInput.addEventListener("input", () => {
    state.query = els.searchInput.value;
    renderLibrary();
    if (state.tab !== "library") setTab("library");
  });

  els.searchClear.addEventListener("click", () => {
    state.query = "";
    els.searchInput.value = "";
    els.searchInput.focus();
    renderLibrary();
  });

  els.backdrop.addEventListener("click", () => {
    if (els.picker.classList.contains("picker-open")) closePicker();
    else closeSheet();
  });

  els.sheetAddProgram.addEventListener("click", openPicker);
  els.pickerBackdrop.addEventListener("click", closePicker);
  els.pickerCancel.addEventListener("click", closePicker);

  els.pickerList.addEventListener("click", (e) => {
    const item = e.target.closest("[data-program-id]");
    if (!item || !state.activeVideoId) return;
    addVideoToProgram(item.dataset.programId, state.activeVideoId);
    closePicker();
    closeSheet({ sync: false });
    setTab("programs", { sync: false });
    openProgram(item.dataset.programId);
  });

  els.pickerNew.addEventListener("click", () => {
    const name = promptProgramName();
    if (!name || !state.activeVideoId) return;
    const program = createProgram(name);
    addVideoToProgram(program.id, state.activeVideoId);
    closePicker();
    closeSheet({ sync: false });
    setTab("programs", { sync: false });
    openProgram(program.id);
  });

  els.player.addEventListener("error", () => {
    els.playerFallback.hidden = false;
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (els.picker.classList.contains("picker-open")) closePicker();
    else closeSheet();
  });

  window.addEventListener("popstate", () => {
    applyRouteFromUrl();
  });

  let startY = 0;
  els.sheet.addEventListener(
    "touchstart",
    (e) => {
      if (e.target.closest("video")) return;
      startY = e.touches[0].clientY;
    },
    { passive: true }
  );
  els.sheet.addEventListener(
    "touchend",
    (e) => {
      if (e.target.closest("video") || els.picker.classList.contains("picker-open")) return;
      const dy = e.changedTouches[0].clientY - startY;
      if (dy > 80 && els.sheet.scrollTop <= 0) closeSheet();
    },
    { passive: true }
  );
}

async function init() {
  const fetches = [fetch(SITE.videosUrl), fetch(SITE.theoryUrl)];
  if (supportsResortMap()) fetches.push(fetch("data/world-resorts.json"));

  const [videosRes, theoryRes, resortsRes] = await Promise.all(fetches);
  const data = await videosRes.json();
  const theory = await theoryRes.json();

  state.categories = data.categories;
  state.videos = data.videos;
  state.resorts = data.resorts || [];
  state.series = theory.series || [];
  state.activeCategory = "all";
  if (supportsResortMap() && resortsRes?.ok) {
    state.worldResorts = await resortsRes.json();
  }

  await Promise.all([loadNoteOverrides(), refreshAdminSession()]);

  seedDemoProgram();
  renderCategoryRail();
  renderSubtagRail();
  renderLibrary();
  showTheoryHome({ sync: false });
  renderProgramsHome();
  bindEvents();
  const refreshTopicScroll = bindTopicSwitchScroll();
  updateTabHrefs();
  applyRouteFromUrl();
  syncRoute({ replace: true });
  document.querySelector(".topic-switch-link.is-active, .sport-switch-link.is-active")?.scrollIntoView({
    inline: "center",
    block: "nearest",
    behavior: "instant",
  });
  requestAnimationFrame(refreshTopicScroll);
}

function updateTabHrefs() {
  els.tabs.forEach((tab) => {
    const name = tab.dataset.tab;
    if (name === "library") tab.setAttribute("href", libraryHref({ category: state.activeCategory }));
    else if (name === "theory") tab.setAttribute("href", theoryHref());
    else if (name === "programs") tab.setAttribute("href", programsHref());
  });
}

init().catch((err) => {
  console.error(err);
  els.emptyState.hidden = false;
  els.emptyState.textContent = "Could not load library data";
});
