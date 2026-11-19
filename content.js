// Deep Bible: Study Tools for YouVersion (Bible.com) — Content Script
(async function () {
  // Check for one-click first-install reset trigger via URL param (?bbe_reset=1 or #bbe_reset)
  if (location.search.includes("bbe_reset=1") || location.hash.includes("bbe_reset")) {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime?.id && chrome.storage) {
        try {
          if (chrome.storage.sync) await new Promise(r => chrome.storage.sync.clear(() => { if (chrome.runtime?.lastError){} r(); }));
          if (chrome.storage.local) await new Promise(r => chrome.storage.local.clear(() => { if (chrome.runtime?.lastError){} r(); }));
        } catch (_) {}
      }
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && key.startsWith("bbe_")) localStorage.removeItem(key);
        }
      } catch (e) {}
      await bbeSave(BBE_DEFAULTS);
      const cleanUrl = location.href.replace(/[?&]bbe_reset=1/, "").replace(/#bbe_reset/, "");
      location.replace(cleanUrl);
      return;
    } catch (e) {
      console.warn("BBE reset error:", e);
    }
  }

  // Inspect raw storage without defaults to check if schemaVersion: 3 was explicitly written
  const rawStorage = await new Promise(resolve => {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime?.id && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get(null, (res) => {
          if (chrome.runtime?.lastError) resolve({});
          else resolve(res || {});
        });
      } else {
        resolve({});
      }
    } catch (_) {
      resolve({});
    }
  });

  // If storage lacks schemaVersion 3, execute a complete wipe and enforce clean first-install defaults!
  if (!rawStorage || rawStorage.schemaVersion !== 3) {
    if (typeof chrome !== "undefined" && chrome.runtime?.id && chrome.storage) {
      try {
        if (chrome.storage.sync) await new Promise(r => chrome.storage.sync.clear(() => { if (chrome.runtime?.lastError){} r(); }));
        if (chrome.storage.local) await new Promise(r => chrome.storage.local.clear(() => { if (chrome.runtime?.lastError){} r(); }));
      } catch (_) {}
    }
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith("bbe_")) localStorage.removeItem(key);
      }
    } catch (e) {}

    const freshDefaults = JSON.parse(JSON.stringify(BBE_DEFAULTS));
    freshDefaults.schemaVersion = 3;
    freshDefaults.showAaMenu = true;
    freshDefaults.columnWidth = 950;
    freshDefaults.fontSize = 100;
    freshDefaults.fontFamily = "serif";
    freshDefaults.readerTheme = "system";
    await bbeSave(freshDefaults);
  }

  let S = await bbeLoad();
  const html = document.documentElement;
  const chapterCache = new Map(); // "id|book.chapter" -> Promise<string>
  const chapterMaxVerses = new Map(); // "BOOK.CHAPTER" -> number (e.g. "GAL.3" -> 29)
  let lastRenderKey = "";
  let lastCompareKey = "";
  let lastPreloadedChapter = "";

  /* ---- Per-render DOM query caches (invalidated by tick() and by any DOM mutation) ---- */
  const CHAPTER_SEL = '[class*="_chapter"]:not(#bbe-compare-grid *)';
  let cachedChapterEl = null;
  let cachedNativeReaderEl = null;
  let cachedTextEl = null;
  let cachedVerseOwner = null;
  let cachedVerseEls = null;

  function invalidateDomCaches() {
    cachedChapterEl = null;
    cachedNativeReaderEl = null;
    cachedTextEl = null;
    cachedVerseOwner = null;
    cachedVerseEls = null;
  }

  // First scripture text container anywhere on the page (native or Deep Bible's verse-page wrapper).
  function getTextEl() {
    if (cachedTextEl && cachedTextEl.isConnected) return cachedTextEl;
    cachedTextEl = document.querySelector('[class*="_yv-bible-text"]');
    return cachedTextEl;
  }

  // Bible.com's own scripture container (excludes the Deep Bible verse-page wrapper).
  function getNativeReaderEl() {
    if (cachedNativeReaderEl && cachedNativeReaderEl.isConnected) return cachedNativeReaderEl;
    cachedNativeReaderEl = document.querySelector('[class*="_yv-bible-text"]:not(#bbe-verse-page-reader *)');
    return cachedNativeReaderEl;
  }

  // The native (non-compare) chapter element. Re-queried when detached or after invalidation.
  function getChapterEl() {
    if (cachedChapterEl && cachedChapterEl.isConnected) return cachedChapterEl;
    cachedChapterEl = document.querySelector(CHAPTER_SEL);
    return cachedChapterEl;
  }

  // Verse elements inside a chapter element; returns a fresh array copy so callers may mutate it.
  function getChapterVerseEls(chapterEl) {
    if (!chapterEl) return [];
    if (cachedVerseOwner === chapterEl && cachedVerseEls && cachedVerseEls.length > 0 &&
        cachedVerseEls[0].isConnected && chapterEl.contains(cachedVerseEls[0])) {
      return cachedVerseEls.slice();
    }
    cachedVerseEls = Array.from(chapterEl.querySelectorAll('[class*="_verse"][data-usfm]'));
    cachedVerseOwner = chapterEl;
    return cachedVerseEls.slice();
  }

  function getAllVersions() {
    return bbeGetAllVersions(S.userTranslations);
  }

  function getKeyMap() {
    return bbeGetKeyMap(S.customShortcuts);
  }

  function safeSendMessage(message, callback) {
    try {
      if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.id) {
        if (callback) callback(null);
        return;
      }
      chrome.runtime.sendMessage(message, (res) => {
        // Consuming lastError prevents "Unchecked runtime.lastError"
        const err = chrome.runtime?.lastError;
        if (err) {
          if (callback) callback(null);
          return;
        }
        if (callback) callback(res);
      });
    } catch (e) {
      if (callback) callback(null);
    }
  }

  // Cohesive currentColor line-art vector icon library (inherits active theme ink automatically)
  const bbeIcon = (paths, size = 14, sw = 2, extraClass = "") =>
    `<svg class="bbe-svg-icon${extraClass ? " " + extraClass : ""}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

  const BBE_ICONS = {
    search: (s = 13) => bbeIcon('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/>', s, 2.2),
    compare: (s = 13) => bbeIcon('<rect x="3" y="4" width="18" height="16" rx="2"/><line x1="12" y1="4" x2="12" y2="20"/>', s, 2),
    columns: (s = 13) => bbeIcon('<rect x="3" y="4" width="18" height="16" rx="2"/><line x1="12" y1="4" x2="12" y2="20"/>', s, 2),
    interleaved: (s = 13) => bbeIcon('<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/>', s, 2),
    book: (s = 13) => bbeIcon('<path d="M2 5.5A2.5 2.5 0 0 1 4.5 3H9a3 3 0 0 1 3 3v14a2.5 2.5 0 0 0-2.5-2.5H4.5A2.5 2.5 0 0 0 2 20V5.5z"/><path d="M22 5.5A2.5 2.5 0 0 0 19.5 3H15a3 3 0 0 0-3 3v14a2.5 2.5 0 0 1 2.5-2.5h5A2.5 2.5 0 0 1 22 20V5.5z"/>', s, 2),
    lexicon: (s = 13) => bbeIcon('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><circle cx="12.5" cy="9.5" r="2.5"/><path d="m16 13-1.8-1.8"/>', s, 2),
    sermon: (s = 13) => bbeIcon('<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="1.5"/>', s, 2),
    eye: (s = 13) => bbeIcon('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>', s, 2),
    settings: (s = 13) => bbeIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>', s, 1.9),
    keyboard: (s = 13) => bbeIcon('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M9 15h6"/>', s, 2),
    copy: (s = 13) => bbeIcon('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', s, 2),
    link: (s = 13) => bbeIcon('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>', s, 2),
    dockBottom: (s = 13) => bbeIcon('<rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="14" x2="21" y2="14"/>', s, 2),
    dockRight: (s = 13) => bbeIcon('<rect x="3" y="4" width="18" height="16" rx="2"/><line x1="14" y1="4" x2="14" y2="20"/>', s, 2),
    expand: (s = 13) => bbeIcon('<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>', s, 2),
    minimize: (s = 13) => bbeIcon('<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>', s, 2),
    note: (s = 13) => bbeIcon('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z"/>', s, 2),
    lock: (s = 13) => bbeIcon('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', s, 2),
    cloud: (s = 13) => bbeIcon('<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>', s, 2),
    spinner: (s = 13) => bbeIcon('<path d="M21 12a9 9 0 1 1-6.219-8.56"/>', s, 2.2, "bbe-icon-spin"),
    warn: (s = 14) => bbeIcon('<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', s, 2),
    error: (s = 14) => bbeIcon('<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>', s, 2),
    check: (s = 14) => bbeIcon('<path d="M20 6 9 17l-5-5"/>', s, 2.3),
    zap: (s = 13) => bbeIcon('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', s, 2),
    reset: (s = 13) => bbeIcon('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>', s, 2),
    bookmark: (s = 13) => bbeIcon('<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>', s, 2),
    quote: (s = 13) => bbeIcon('<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>', s, 1.9),
    // Minimalist monochrome theme swatch icons
    themeSystem: (s = 13) => bbeIcon('<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor" stroke="none"/>', s, 2),
    themeSepia: (s = 13) => bbeIcon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>', s, 2),
    themeLight: (s = 13) => bbeIcon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>', s, 2),
    themeDark: (s = 13) => bbeIcon('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>', s, 2),
    themeOled: (s = 13) => bbeIcon('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>', s, 2),
    themeBlue: (s = 13) => bbeIcon('<path d="M2 10c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>', s, 2),
    themeGreen: (s = 13) => bbeIcon('<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>', s, 2),
    themeHistorical: (s = 13) => bbeIcon('<path d="M3 21h18"/><path d="M5 21V7"/><path d="M19 21V7"/><path d="M9 21V7"/><path d="M15 21V7"/><path d="M3 7h18l-9-4-9 4z"/>', s, 1.9)
  };

  function inferToastIcon(msg) {
    const s = String(msg || "").toLowerCase();
    if (s.includes("failed") || s.includes("error")) return "error";
    if (s.includes("could not") || s.includes("not saved") || s.includes("not removed")) return "warn";
    if (s.includes("copied")) return "copy";
    if (s.includes("swapped") || s.includes("jumped") || s.includes("compare:")) return "zap";
    if (s.includes("word study")) return "lexicon";
    if (s.includes("sermon")) return "sermon";
    if (s.includes("reset")) return "reset";
    if (s.includes("settings") || s.includes("retired")) return "settings";
    if (s.includes("bible") || s.includes("chapter") || s.includes("navigating")) return "book";
    return "check";
  }

  // Toast notification element (created lazily on first show to avoid mutating <body> on startup)
  let toastEl = null;
  let toastTimer = null;
  function showToast(msg, durationOrOpts) {
    if (!document.body) return;
    if (!toastEl || !toastEl.isConnected) {
      toastEl = document.getElementById("bbe-toast");
      if (!toastEl) {
        toastEl = document.createElement("div");
        toastEl.id = "bbe-toast";
        document.body.appendChild(toastEl);
      }
    }
    let duration = 1200;
    let iconKey = null;
    if (typeof durationOrOpts === "number") {
      duration = durationOrOpts;
    } else if (durationOrOpts && typeof durationOrOpts === "object") {
      if (typeof durationOrOpts.duration === "number") duration = durationOrOpts.duration;
      if (durationOrOpts.icon) iconKey = durationOrOpts.icon;
    }
    const cleanMsg = String(msg || "").replace(/^\s*(?:⚡|📖|📋|⚠️?|🔬|✏|💾|❌|✓|↺|↖|👁)\s*/u, "");
    const resolvedKey = iconKey || inferToastIcon(cleanMsg);
    const iconFn = BBE_ICONS[resolvedKey] || BBE_ICONS.check;
    toastEl.innerHTML = `<span class="bbe-toast-icon">${iconFn(14)}</span><span class="bbe-toast-msg"></span>`;
    toastEl.querySelector(".bbe-toast-msg").textContent = cleanMsg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove("show");
    }, duration);
  }

  /* ---------------- Cookie Consent Suppression ---------------- */
  function suppressCookiePopup() {
    try {
      if (!document.cookie.includes("cookieConsentBannerConfirmed=true")) {
        const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000 * 5).toUTCString();
        document.cookie = `cookieConsentBannerConfirmed=true; expires=${expires}; path=/; domain=.bible.com; SameSite=Lax`;
        document.cookie = `cookieConsentBannerConfirmed=true; expires=${expires}; path=/; SameSite=Lax`;
      }
    } catch (e) {}

    const closeBtn = document.querySelector('[data-testid="close-cookie-banner"], [class*="ccBanner"] button');
    if (closeBtn) {
      closeBtn.click();
    }
    const banner = document.querySelector('[data-testid="cookie-banner-wrapper"], .cc-banner, [class*="ccBanner"], #branch-banner-iframe');
    if (banner) {
      banner.remove();
    }
  }

  suppressCookiePopup();
  setTimeout(suppressCookiePopup, 1200);

  /* ---------------- Lazy-Load Historical Artwork & Instant-Boot Snapshot ---------------- */
  let historicalLoadPromise = null;
  function ensureHistoricalLoaded() {
    if (window.BBE_HIST) return Promise.resolve(window.BBE_HIST);
    if (historicalLoadPromise) return historicalLoadPromise;
    try {
      if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
        historicalLoadPromise = import(chrome.runtime.getURL("historical.js"))
          .then(() => window.BBE_HIST || null)
          .catch(() => {
            historicalLoadPromise = null;
            return null;
          });
        return historicalLoadPromise;
      }
    } catch (e) {
      historicalLoadPromise = null;
    }
    return Promise.resolve(null);
  }

  /* ---------------- Lazy-Load Sermon Mode Engine (100% Off by Default) ---------------- */
  let sermonLoadPromise = null;
  function buildSermonHostApi() {
    return {
      getChapterEl,
      getTextEl,
      getSettings: () => S,
      saveSettings: (patch) => bbeSave(patch),
      getPassage: () => {
        const allVers = getAllVersions();
        const p = bbeParsePath(location.pathname, allVers);
        if (!p) return null;
        const versionKey = bbeKeyForId(p.id, allVers) || p.abbr || "ESV";
        const bookTitle = BBE_BOOK_NAMES[p.book] || p.book;
        return { ...p, versionKey, bookTitle };
      },
      switchToVersion: (targetKey) => {
        const allVers = getAllVersions();
        const p = bbeParsePath(location.pathname, allVers);
        if (p) switchToVersion(targetKey, p);
      },
      showToast,
      onStateChange: () => {
        lastRenderKey = "";
        const p = bbeParsePath(location.pathname, getAllVersions());
        if (p) renderToolbar(p);
      }
    };
  }

  function ensureSermonModeLoaded() {
    if (window.BBE_SERMON) {
      window.BBE_SERMON.init(buildSermonHostApi());
      return Promise.resolve(window.BBE_SERMON);
    }
    if (sermonLoadPromise) return sermonLoadPromise;
    try {
      if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
        sermonLoadPromise = import(chrome.runtime.getURL("sermon_mode.js"))
          .then(() => {
            if (window.BBE_SERMON) {
              window.BBE_SERMON.init(buildSermonHostApi());
            }
            return window.BBE_SERMON || null;
          })
          .catch(() => {
            sermonLoadPromise = null;
            return null;
          });
        return sermonLoadPromise;
      }
    } catch (e) {
      sermonLoadPromise = null;
    }
    return Promise.resolve(null);
  }

  let lastBootJson = "";
  function saveBootSnapshot(histPalette) {
    try {
      const snap = !S.enabled ? { enabled: false } : {
        enabled: true,
        hideHeader: !!S.hideHeader,
        hideSidebar: !!S.hideSidebar,
        hideDistractionCards: !!S.hideDistractionCards,
        hideFooter: !!S.hideFooter,
        hideBottomBar: !!S.hideBottomBar,
        hideFootnotes: !!S.hideFootnotes,
        hideHeadings: !!S.hideHeadings,
        hideVerseNumbers: !!S.hideVerseNumbers,
        hideCopyright: S.hideCopyright !== false,
        hideSwitcher: !!S.hideSwitcher,
        toolbarBehavior: S.toolbarBehavior || "smart",
        autoDimBar: S.autoDimBar !== false,
        wordStudyMode: !!S.wordStudyMode,
        fontFamily: S.fontFamily || "serif",
        readerTheme: S.readerTheme || "system",
        columnWidth: Number(S.columnWidth) || 950,
        fontSize: Number(S.fontSize) || 100,
        lineHeight: Number(S.lineHeight) || 1.8,
        historicalScene: S.historicalScene || "olive",
        historicalParchment: S.historicalParchment || "scroll",
        historicalInk: S.historicalInk || "iron",
        historicalRubrics: S.historicalRubrics !== false,
        historicalOrnate: S.historicalOrnate !== false,
        historicalSceneDim: Math.min(100, Math.max(0, Number(S.historicalSceneDim ?? 15))),
        historicalBase: histPalette?.base || "",
        historicalEdge: histPalette?.edge || "",
        historicalRule: histPalette?.rule || ""
      };
      const json = JSON.stringify(snap);
      if (json !== lastBootJson) {
        lastBootJson = json;
        localStorage.setItem("bbe_boot_v1", json);
      }
    } catch (e) {}
  }

  /* ---------------- Sync Classes & Layout to DOM ---------------- */
  let lastDomSyncKey = "";
  let lastSyncedBody = null;
  function syncDomClasses() {
    if (!S.enabled) {
      lastDomSyncKey = "disabled";
      lastSyncedBody = null;
      residualClearanceActive = false;
      setDrawerClearancePx(0);
      if (html.classList.contains("bbe-on")) {
        html.className = html.className.replace(/\bbbe-[a-z0-9\-]+\b/g, "").trim();
      }
      const yv = getTextEl();
      const readerContainer = yv ? yv.parentElement : null;
      if (readerContainer) {
        readerContainer.style.removeProperty("max-width");
        readerContainer.style.removeProperty("width");
      }
      saveBootSnapshot();
      return;
    }

    // Force scripture container width directly on element to override Tailwind
    const yv = getTextEl();
    const readerContainer = yv ? yv.parentElement : null;
    if (readerContainer) {
      const targetW = S.compareOn ? "97vw" : (S.columnWidth + "px");
      if (readerContainer.style.maxWidth !== targetW) {
        readerContainer.style.setProperty("max-width", targetW, "important");
        readerContainer.style.setProperty("width", "100%", "important");
      }
    }

    const domSyncKey = [
      S.enabled, S.hideHeader, S.hideSidebar, S.hideDistractionCards, S.hideFooter,
      S.hideBottomBar, S.hideFootnotes, S.hideHeadings, S.hideVerseNumbers, S.hideCopyright,
      S.hideSwitcher, S.toolbarBehavior, S.autoDimBar, S.wordStudyMode, S.fontFamily,
      S.readerTheme, S.historicalScene, S.historicalParchment, S.historicalInk,
      S.historicalRubrics, S.historicalOrnate, S.historicalSceneDim,
      S.columnWidth, S.fontSize, S.lineHeight, S.compareOn,
      !!document.body
    ].join("|");

    // When Historical theme is active, also check if newly mounted chapter containers need parchment applied
    const isHistActive = S.enabled && S.readerTheme === "historical";
    if (domSyncKey === lastDomSyncKey && html.classList.contains("bbe-on") && lastSyncedBody === document.body && !isHistActive) {
      return;
    }
    lastDomSyncKey = domSyncKey;
    lastSyncedBody = document.body;

    const t = (cls, cond) => {
      const has = html.classList.contains(cls);
      if (cond && !has) html.classList.add(cls);
      else if (!cond && has) html.classList.remove(cls);
    };

    t("bbe-on", S.enabled);
    t("bbe-hide-header", S.hideHeader);
    t("bbe-hide-sidebar", S.hideSidebar);
    t("bbe-hide-cards", S.hideDistractionCards);
    t("bbe-hide-footer", S.hideFooter);
    t("bbe-hide-bottombar", S.hideBottomBar);
    t("bbe-hide-notes", S.hideFootnotes);
    t("bbe-hide-headings", S.hideHeadings);
    t("bbe-hide-vnum", S.hideVerseNumbers);
    t("bbe-hide-copyright", S.hideCopyright !== false);
    t("bbe-hide-switcher", S.hideSwitcher);
    t("bbe-bar-static", S.toolbarBehavior === "static");
    t("bbe-autodim-bar", S.toolbarBehavior === "smart" || (S.toolbarBehavior !== "static" && S.autoDimBar !== false));
    t("bbe-wordstudy-active", S.wordStudyMode);

    // Font Family
    const fontFam = S.fontFamily || "serif";
    t("bbe-font-serif", fontFam === "serif");
    t("bbe-font-sans", fontFam === "sans");
    t("bbe-font-mono", fontFam === "mono");
    t("bbe-font-dyslexic", fontFam === "dyslexic");

    // Reader Theme
    let rTheme = S.readerTheme || "system";
    if (rTheme === "pink") rTheme = "system";
    t("bbe-theme-sepia", rTheme === "sepia");
    t("bbe-theme-light", rTheme === "light");
    t("bbe-theme-dark", rTheme === "dark");
    t("bbe-theme-oled", rTheme === "oled");
    t("bbe-theme-blue", rTheme === "blue");
    t("bbe-theme-green", rTheme === "green");
    t("bbe-theme-system", rTheme === "system");
    t("bbe-theme-historical", rTheme === "historical");

    // Historical theme: backdrop scene, parchment texture and ink/ornament variants
    const isHistTheme = S.enabled && rTheme === "historical";
    const hScene = S.historicalScene || "olive";
    const hParch = S.historicalParchment || "scroll";
    const hInk = S.historicalInk || "iron";
    t("bbe-hist-scroll", !!isHistTheme && hParch === "scroll");
    t("bbe-hist-rubric", !!isHistTheme && S.historicalRubrics !== false);
    t("bbe-hist-ornate", !!isHistTheme && S.historicalOrnate !== false);
    ["iron", "sepia", "black"].forEach(k => t("bbe-hist-ink-" + k, !!isHistTheme && hInk === k));
    ["night"].forEach(k => t("bbe-hist-scene-" + k, !!isHistTheme && hScene === k));
    const histVars = ["--bbe-hist-scene", "--bbe-hist-parch", "--bbe-hist-base", "--bbe-hist-edge", "--bbe-hist-rule", "--bbe-hist-veil"];
    let activeHistPt = null;
    if (isHistTheme) {
      if (!window.BBE_HIST) {
        ensureHistoricalLoaded().then((hist) => {
          if (hist) {
            lastDomSyncKey = "";
            syncDomClasses();
          }
        });
      } else {
        const dim = Math.min(100, Math.max(0, Number(S.historicalSceneDim ?? 15)));
        const sc = window.BBE_HIST.get("scene", hScene);
        const pt = window.BBE_HIST.get("parchment", hParch);
        if (!sc || !pt) {
          // Artwork is rasterised once, asynchronously; repaint as soon as it is ready.
          Promise.all([window.BBE_HIST.load("scene", hScene), window.BBE_HIST.load("parchment", hParch)]).then(() => syncDomClasses());
        } else {
          activeHistPt = pt;
          const histKey = [hScene, hParch, dim].join("|");
          if (html.dataset.bbeHistKey !== histKey) {
            // Never store data: URLs in CSS custom properties on <html>: Bible.com's strict
            // img-src CSP blocks data: URLs when Blink substitutes var(--*) in the document context.
            html.style.removeProperty("--bbe-hist-scene");
            html.style.removeProperty("--bbe-hist-parch");
            html.style.setProperty("--bbe-hist-base", pt.base);
            html.style.setProperty("--bbe-hist-edge", pt.edge);
            html.style.setProperty("--bbe-hist-rule", pt.rule);
            html.style.setProperty("--bbe-hist-veil", `rgba(18, 10, 4, ${(dim / 100).toFixed(2)})`);
            html.dataset.bbeHistKey = histKey;
          }
          if (document.body) {
            let bd = document.getElementById("bbe-hist-backdrop");
            if (!bd) {
              bd = document.createElement("div");
              bd.id = "bbe-hist-backdrop";
              bd.innerHTML = `<canvas id="bbe-hist-backdrop-canvas" width="1920" height="1080"></canvas><div id="bbe-hist-backdrop-veil"></div>`;
              document.body.prepend(bd);
            }
            const bdCanvas = bd.querySelector("#bbe-hist-backdrop-canvas");
            if (bdCanvas && sc.canvas && bdCanvas.dataset.scene !== hScene) {
              bdCanvas.getContext("2d").drawImage(sc.canvas, 0, 0, bdCanvas.width, bdCanvas.height);
              bdCanvas.dataset.scene = hScene;
            }
            // Parchment targets: the <div> wrapping each scripture text container, plus the compare grid.
            // (Resolved via parentElement: avoids the costly document-wide `div:has(> ...)` scan.)
            const parchTargets = new Set();
            document.querySelectorAll('[class*="_yv-bible-text"]').forEach(yvEl => {
              const par = yvEl.parentElement;
              if (par && par.tagName === "DIV" && document.body.contains(par)) parchTargets.add(par);
            });
            const cmpGridEl = document.getElementById("bbe-compare-grid");
            if (cmpGridEl) parchTargets.add(cmpGridEl);
            parchTargets.forEach(el => {
              if (el.dataset.bbeParch !== hParch) {
                el.style.setProperty("background-image", pt.url, "important");
                el.dataset.bbeParch = hParch;
              }
            });
          }
        }
      }
    } else {
      if (html.dataset.bbeHistKey) {
        histVars.forEach(v => html.style.removeProperty(v));
        delete html.dataset.bbeHistKey;
      }
      const bd = document.getElementById("bbe-hist-backdrop");
      if (bd) bd.remove();
      document.querySelectorAll("[data-bbe-parch]").forEach(el => {
        el.style.removeProperty("background-image");
        delete el.dataset.bbeParch;
      });
    }

    if (S.enabled && document.body) {
      if (rTheme === "sepia") {
        document.body.style.backgroundColor = "#fbf0d9";
        document.body.style.color = "#2c2825";
      } else if (rTheme === "light") {
        document.body.style.backgroundColor = "#ffffff";
        document.body.style.color = "#121212";
      } else if (rTheme === "dark") {
        document.body.style.backgroundColor = "#181a20";
        document.body.style.color = "#e2e8f0";
      } else if (rTheme === "oled") {
        document.body.style.backgroundColor = "#000000";
        document.body.style.color = "#e0e0e0";
      } else if (rTheme === "blue") {
        document.body.style.backgroundColor = "#0b1329";
        document.body.style.color = "#d8e2fd";
      } else if (rTheme === "green") {
        document.body.style.backgroundColor = "#f0f5ee";
        document.body.style.color = "#1f2e23";
      } else {
        document.body.style.removeProperty("background-color");
        document.body.style.removeProperty("color");
      }
    } else if (document.body) {
      document.body.style.removeProperty("background-color");
      document.body.style.removeProperty("color");
    }

    const targetWidth = S.columnWidth + "px";
    if (html.style.getPropertyValue("--bbe-width") !== targetWidth) {
      html.style.setProperty("--bbe-width", targetWidth);
    }
    const targetFont = String(S.fontSize || 100);
    if (html.style.getPropertyValue("--bbe-font") !== targetFont) {
      html.style.setProperty("--bbe-font", targetFont);
    }
    const targetLh = String(S.lineHeight || 1.8);
    if (html.style.getPropertyValue("--bbe-lh") !== targetLh) {
      html.style.setProperty("--bbe-lh", targetLh);
    }

    saveBootSnapshot(activeHistPt);
  }

  // Storage listener for changes from popup or toolbar
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes) => {
      let shouldRerender = false;
      let commentaryChanged = false;
      let modernFetchChanged = false;
      let dockChanged = false;
      let defaultTabChanged = false;
      for (const k in changes) {
        S[k] = changes[k].newValue;
        if (k === "hiddenCommentaries" || k === "commentaryOrder") {
          commentaryChanged = true;
        }
        if (k === "commEnableTgc" || k === "commEnableGuzik" || k === "commEnableConstable" || k === "commEnableUtley") {
          commentaryChanged = true;
          modernFetchChanged = true;
        }
        if (k === "commentaryDock" || k === "commentaryBottomHeight") {
          dockChanged = true;
        }
        if (k === "defaultStudyTab") {
          defaultTabChanged = true;
        }
        // Don't re-render toolbar when quickStudyShowCount increments on focus,
        // but re-render if it was reset to 0 from settings/popup.
        if (k === "quickStudyShowCount") {
          if (changes[k].newValue === 0) {
            shouldRerender = true;
          }
        } else {
          shouldRerender = true;
        }
      }
      syncDomClasses();
      if (dockChanged) {
        const drawerEl = document.getElementById("bbe-drawer");
        if (drawerEl) applyDrawerDockClasses(drawerEl);
      }
      if (defaultTabChanged) {
        activeStudyTab = S.defaultStudyTab || "commentary";
        if (isDrawerOpen) {
          switchStudyTab(activeStudyTab);
        }
      }
      if (commentaryChanged && isDrawerOpen && activeStudyTab === "commentary" && currentDrawerPassage?.book) {
        refreshOpenCommentaryDrawer(modernFetchChanged);
      }
      if (shouldRerender) {
        lastRenderKey = ""; // trigger re-render
        if (!S.prefetchTranslations) {
          cancelPreloading();
        }
        if (S.preloadAdjacentChapters === false) {
          clearTimeout(preloadAdjacentTimer);
          preloadAdjacentTimer = null;
          lastAdjacentPreloadChap = "";
        }
        const p = bbeParsePath(location.pathname, getAllVersions());
        if (p) {
          preloadOtherVersions(p, true); // Force preload newly added translations or shortcuts
        }
        tick();
      }
    });
  }

  /* ---------------- Fetching, Verse-Segment Filtering & Preloading ---------------- */
  function parseVerseRangeSpec(versesStr) {
    if (!versesStr) return null;
    const clean = String(versesStr).replace(/–/g, "-").trim();
    if (!clean) return null;
    const set = new Set();
    const parts = clean.split(",");
    for (const part of parts) {
      const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
      if (!m) continue;
      const a = parseInt(m[1], 10);
      const b = m[2] ? parseInt(m[2], 10) : a;
      if (isNaN(a) || isNaN(b)) continue;
      const start = Math.min(a, b);
      const end = Math.max(a, b);
      for (let v = start; v <= end && v <= start + 300; v++) {
        set.add(v);
      }
    }
    if (set.size === 0) return null;
    const list = Array.from(set).sort((x, y) => x - y);
    return {
      raw: clean,
      set,
      list,
      min: list[0],
      max: list[list.length - 1],
      isSingle: list.length === 1
    };
  }

  function extractUsfmVerseNums(usfm) {
    if (!usfm) return [];
    const nums = [];
    const tokens = String(usfm).split(/[+\s,]+/);
    for (const tok of tokens) {
      const m = tok.match(/\.(\d+)(?:-(\d+))?$/);
      if (m) {
        const a = parseInt(m[1], 10);
        const b = m[2] ? parseInt(m[2], 10) : a;
        if (!isNaN(a) && !isNaN(b)) {
          const s = Math.min(a, b);
          const e = Math.max(a, b);
          for (let v = s; v <= e && v <= s + 50; v++) nums.push(v);
        }
      }
    }
    return nums;
  }

  function filterChapterNodeToVerses(chapterElOrHtml, p) {
    const container = document.createElement("div");
    if (typeof chapterElOrHtml === "string") {
      container.innerHTML = chapterElOrHtml;
    } else if (chapterElOrHtml) {
      container.innerHTML = chapterElOrHtml.innerHTML;
    }

    // 1. Detect max verse in this chapter dynamically and cache it
    const allVerses = Array.from(container.querySelectorAll('[class*="_verse"]'));
    const chapterVerses = [];
    for (const vEl of allVerses) {
      const usfm = vEl.getAttribute("data-usfm") || "";
      const vNums = extractUsfmVerseNums(usfm);
      for (const n of vNums) chapterVerses.push(n);
    }
    const maxVerseInChapter = chapterVerses.length > 0 ? Math.max(...chapterVerses) : null;
    if (maxVerseInChapter && p && p.book && p.chapter) {
      chapterMaxVerses.set(`${p.book}.${p.chapter}`, maxVerseInChapter);
    }

    if (!p || !p.verses) {
      return {
        html: container.innerHTML,
        clamped: false,
        fallbackFullChapter: false,
        clampedVerses: null,
        maxVerse: maxVerseInChapter,
        toString() { return this.html; }
      };
    }

    const rawSpec = parseVerseRangeSpec(p.verses);
    if (!rawSpec) {
      return {
        html: container.innerHTML,
        clamped: false,
        fallbackFullChapter: false,
        clampedVerses: null,
        maxVerse: maxVerseInChapter,
        toString() { return this.html; }
      };
    }

    let activeSpec = rawSpec;
    let clamped = false;
    let fallbackFullChapter = false;

    if (maxVerseInChapter && maxVerseInChapter > 0) {
      if (rawSpec.min > maxVerseInChapter || rawSpec.max < 1) {
        // Starting verse is beyond what the chapter contains (e.g. Gal 3:35 when max is 29)
        fallbackFullChapter = true;
        clamped = true;
      } else if (rawSpec.max > maxVerseInChapter) {
        clamped = true;
        // If starting at verse 1, capping at max means the full chapter (e.g. Gal 3:1-35 -> 1-29)
        if (rawSpec.min === 1) {
          fallbackFullChapter = true;
        } else {
          // Clamp upper bound to maxVerseInChapter (e.g. Gal 3:3-30 -> Gal 3:3-29)
          const clampedList = rawSpec.list.filter(n => n <= maxVerseInChapter);
          const newMax = maxVerseInChapter;
          const newMin = rawSpec.min;
          const newRaw = (newMin === newMax) ? String(newMin) : `${newMin}-${newMax}`;
          activeSpec = {
            raw: newRaw,
            set: new Set(clampedList),
            list: clampedList,
            min: newMin,
            max: newMax,
            isSingle: newMin === newMax
          };
        }
      }
    }

    if (fallbackFullChapter) {
      return {
        html: container.innerHTML,
        clamped: true,
        fallbackFullChapter: true,
        clampedVerses: null,
        maxVerse: maxVerseInChapter,
        toString() { return this.html; }
      };
    }

    // 2. Remove top-level chapter drop-cap label
    container.querySelectorAll(':scope > [class*="_label"]').forEach(el => el.remove());

    // 3. Determine which section headings precede a kept verse
    const topChildren = Array.from(container.children);
    for (let i = 0; i < topChildren.length; i++) {
      const child = topChildren[i];
      const hasVersesInside = !!child.querySelector('[class*="_verse"]');
      if (!hasVersesInside) {
        // Check if this is a blank line break (.cat7xG_b) or a section heading (.cat7xG_s1, .cat7xG_d, etc.)
        const cls = child.className || "";
        if (/(?:^|\s)[^\s]*_b(?:\s|$)/.test(cls)) {
          continue; // Handled in step 5 after verses are filtered
        }
        // Find the first non-empty verse in subsequent top-level blocks
        let nextVerseNum = null;
        for (let j = i + 1; j < topChildren.length; j++) {
          const vEls = topChildren[j].querySelectorAll('[class*="_verse"][data-usfm]');
          for (const vEl of vEls) {
            if (vEl.textContent && vEl.textContent.trim()) {
              const vNums = extractUsfmVerseNums(vEl.getAttribute("data-usfm"));
              if (vNums.length > 0) {
                nextVerseNum = vNums[0];
                break;
              }
            }
          }
          if (nextVerseNum !== null) break;
        }
        if (nextVerseNum === null || !activeSpec.set.has(nextVerseNum)) {
          child.remove();
        }
      }
    }

    // 4. Remove all verse spans whose USFM verse numbers are not in activeSpec.set
    for (const vEl of allVerses) {
      const usfm = vEl.getAttribute("data-usfm") || "";
      const vNums = extractUsfmVerseNums(usfm);
      const keep = vNums.some(n => activeSpec.set.has(n));
      if (!keep) {
        vEl.remove();
      }
    }

    // 5. Remove empty verse spans (whitespace-only placeholders) and empty block containers
    for (const block of Array.from(container.children)) {
      const versesInBlock = Array.from(block.querySelectorAll('[class*="_verse"]'));
      if (versesInBlock.length > 0) {
        const hasRealText = versesInBlock.some(v => v.textContent && v.textContent.trim().length > 0);
        if (!hasRealText) {
          block.remove();
        }
      }
    }

    // Clean up leading/trailing poetic blank spacer blocks (_b)
    const remainingBlocks = Array.from(container.children);
    for (let i = 0; i < remainingBlocks.length; i++) {
      const b = remainingBlocks[i];
      if (/(?:^|\s)[^\s]*_b(?:\s|$)/.test(b.className || "")) {
        const prevHasVerse = i > 0 && remainingBlocks[i - 1].querySelector('[class*="_verse"]');
        const nextHasVerse = i < remainingBlocks.length - 1 && remainingBlocks[i + 1].querySelector('[class*="_verse"]');
        if (!prevHasVerse || !nextHasVerse) {
          b.remove();
        }
      }
    }

    return {
      html: container.innerHTML,
      clamped,
      fallbackFullChapter: false,
      clampedVerses: clamped ? activeSpec.raw : p.verses,
      maxVerse: maxVerseInChapter,
      toString() { return this.html; }
    };
  }

  function ensureReaderChunkStyles(doc) {
    if (!doc || !document.head) return;
    try {
      const links = doc.querySelectorAll('link[rel="stylesheet"][href*="/_next/static/chunks/"]');
      links.forEach(l => {
        const href = l.getAttribute("href");
        if (href && !document.head.querySelector(`link[href="${href}"]`)) {
          const clone = document.createElement("link");
          clone.rel = "stylesheet";
          clone.href = href;
          document.head.appendChild(clone);
        }
      });
    } catch (e) {}
  }

  const chapterH1BookTitles = new Map(); // "vid|BOOK" -> localized book title from Bible.com's <h1>

  function getPageBookTitle(p) {
    if (!p || !p.book) return "";
    const englishName = BBE_BOOK_NAMES[p.book] || p.book;
    const key = `${p.id}|${p.book}`;
    if (chapterH1BookTitles.has(key)) {
      return chapterH1BookTitles.get(key);
    }
    const readerH1 = document.querySelector('[class*="_reader"] h1:not(#bbe-verse-reader-h1)');
    if (readerH1) {
      const rawTitle = readerH1.textContent.trim().replace(/\s+\d+(?::[0-9,\-–]+)?\s*$/, "").trim();
      const isStalePrevBook = readerH1.dataset.bbeBook && readerH1.dataset.bbeBook !== p.book && readerH1.dataset.bbeTitle === rawTitle;
      const isOtherEnglishBook = Object.entries(BBE_BOOK_NAMES).some(
        ([code, name]) => code !== p.book && name.toLowerCase() === rawTitle.toLowerCase()
      );
      if (rawTitle && !isStalePrevBook && !isOtherEnglishBook) {
        chapterH1BookTitles.set(key, rawTitle);
        return rawTitle;
      }
    }
    return chapterH1BookTitles.get(p.book) || englishName;
  }

  function extractChapterNode(htmlOrDoc) {
    const doc = typeof htmlOrDoc === "string"
      ? new DOMParser().parseFromString(htmlOrDoc, "text/html")
      : htmlOrDoc;
    if (!doc) return null;
    ensureReaderChunkStyles(doc);
    const chapter = doc.querySelector('[class*="_chapter"]');
    if (!chapter) return null;

    const h1El = doc.querySelector('[class*="_reader"] h1');
    const vid = doc.querySelector('[data-vid]')?.getAttribute("data-vid") || "";
    const usfm = chapter.getAttribute("data-usfm") || "";
    const bookCode = usfm.split(".")[0];
    if (h1El && bookCode) {
      const parsedTitle = h1El.textContent.trim().replace(/\s+\d+(?::[0-9,\-–]+)?\s*$/, "").trim();
      if (parsedTitle) {
        if (vid) chapterH1BookTitles.set(`${vid}|${bookCode}`, parsedTitle);
        chapterH1BookTitles.set(bookCode, parsedTitle);
      }
    }

    // Sanitize scripts and event handlers without allocating temporary arrays per element
    chapter.querySelectorAll("script, style, iframe, object, embed, link").forEach(n => n.remove());
    const allEls = chapter.querySelectorAll("*");
    for (let i = 0; i < allEls.length; i++) {
      const attrs = allEls[i].attributes;
      for (let j = attrs.length - 1; j >= 0; j--) {
        if (/^on/i.test(attrs[j].name)) {
          allEls[i].removeAttribute(attrs[j].name);
        }
      }
    }
    return chapter;
  }

  function fetchChapter(versionKey, p) {
    const allVers = getAllVersions();
    const v = allVers[versionKey] || (p && p.id ? { id: p.id, name: versionKey, short: versionKey } : null);
    if (!v) return Promise.reject(new Error("Unknown version " + versionKey));
    const cacheKey = `${v.id}|${p.book}.${p.chapter}`;
    if (!chapterCache.has(cacheKey)) {
      const suffix = versionKey ? `.${versionKey}` : "";
      const url = `/bible/${v.id}/${p.book}.${p.chapter}${suffix}`;
      const promise = fetch(url, { credentials: "same-origin" })
        .then(res => {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.text();
        })
        .then(text => {
          const node = extractChapterNode(text);
          if (!node) throw new Error("Chapter content not found");
          return node.innerHTML;
        })
        .catch(err => {
          chapterCache.delete(cacheKey);
          throw err;
        });
      chapterCache.set(cacheKey, promise);

      // Temporary cache size limit (keeps up to 80 chapters in memory)
      if (chapterCache.size > 80) {
        const oldestKey = chapterCache.keys().next().value;
        chapterCache.delete(oldestKey);
      }
    }
    return chapterCache.get(cacheKey);
  }

  function fetchPassageHtml(versionKey, p) {
    return fetchChapter(versionKey, p).then(fullHtml => {
      if (p && p.verses) {
        return filterChapterNodeToVerses(fullHtml, p);
      }
      return fullHtml;
    });
  }

  function getAdjacentChapterHrefs(p) {
    if (!p || !p.book || !p.chapter || typeof BBE_BOOK_CHAPTER_COUNTS === "undefined") {
      return { prevHref: null, nextHref: null };
    }
    const books = Object.keys(BBE_BOOK_CHAPTER_COUNTS);
    const idx = books.indexOf(p.book);
    const chapNum = parseInt(p.chapter, 10);
    const maxChap = BBE_BOOK_CHAPTER_COUNTS[p.book] || 1;
    const allVers = getAllVersions();
    const verKey = bbeKeyForId(p.id, allVers) || p.abbr || "";
    const verSuffix = verKey ? `.${verKey}` : "";

    let prevHref = null;
    if (chapNum > 1) {
      prevHref = `/bible/${p.id}/${p.book}.${chapNum - 1}${verSuffix}`;
    } else if (idx > 0) {
      const prevBook = books[idx - 1];
      const prevMax = BBE_BOOK_CHAPTER_COUNTS[prevBook] || 1;
      prevHref = `/bible/${p.id}/${prevBook}.${prevMax}${verSuffix}`;
    }

    let nextHref = null;
    if (chapNum < maxChap) {
      nextHref = `/bible/${p.id}/${p.book}.${chapNum + 1}${verSuffix}`;
    } else if (idx >= 0 && idx < books.length - 1) {
      const nextBook = books[idx + 1];
      nextHref = `/bible/${p.id}/${nextBook}.1${verSuffix}`;
    }

    return { prevHref, nextHref };
  }

  function updateAdjacentChapterLinks(prevHref, nextHref) {
    const prevSet = new Set(document.querySelectorAll('a[aria-label="Previous Chapter"], #bbe-verse-prev-link'));
    const nextSet = new Set(document.querySelectorAll('a[aria-label="Next Chapter"], #bbe-verse-next-link'));
    if (prevSet.size === 0) {
      const fallbackPrev = document.querySelector('a[aria-label*="Previous"]');
      if (fallbackPrev) prevSet.add(fallbackPrev);
    }
    if (nextSet.size === 0) {
      const fallbackNext = document.querySelector('a[aria-label*="Next"]');
      if (fallbackNext) nextSet.add(fallbackNext);
    }
    const applyLink = (el, href) => {
      if (href) {
        el.setAttribute("href", href);
        el.removeAttribute("aria-disabled");
        if (el.id === "bbe-verse-prev-link" || el.id === "bbe-verse-next-link") {
          el.style.visibility = "visible";
        }
      } else {
        el.removeAttribute("href");
        el.setAttribute("aria-disabled", "true");
        if (el.id === "bbe-verse-prev-link" || el.id === "bbe-verse-next-link") {
          el.style.visibility = "hidden";
        }
      }
    };
    prevSet.forEach(el => applyLink(el, prevHref));
    nextSet.forEach(el => applyLink(el, nextHref));
  }

  function syncAdjacentChapterLinks(p) {
    if (!p) return;
    const { prevHref, nextHref } = getAdjacentChapterHrefs(p);
    updateAdjacentChapterLinks(prevHref, nextHref);
  }

  async function transitionPassageInPlace(targetP, activeKey) {
    const allVers = getAllVersions();
    const verKey = activeKey || bbeKeyForId(targetP.id, allVers) || targetP.abbr || "ESV";
    const v = allVers[verKey] || { id: targetP.id, short: verKey };
    const curChapterEl = getChapterEl();
    const newPath = bbeBuildPath(v.id, verKey, targetP);
    if (!curChapterEl) {
      location.href = newPath;
      return;
    }

    try {
      const res = await fetchPassageHtml(verKey, targetP);
      const newHtml = (res && typeof res.html === "string") ? res.html : String(res);
      if (res && res.clamped) {
        if (res.fallbackFullChapter) targetP.verses = null;
        else if (res.clampedVerses) targetP.verses = res.clampedVerses;
      }
      await applyChapterTransition(curChapterEl, newHtml, null);
      fetchCloudHighlightsForChapter(`${targetP.book}.${targetP.chapter}`, v.id, true);

      const targetPassageKey = `${v.id}|${targetP.book}.${targetP.chapter}|${targetP.verses || "FULL"}`;
      curChapterEl.dataset.bbePassageKey = targetPassageKey;
      curChapterEl.dataset.bbeFiltered = targetP.verses ? "1" : "";
      curChapterEl.setAttribute("data-usfm", `${targetP.book}.${targetP.chapter}`);

      const bookTitle = getPageBookTitle({ ...targetP, id: v.id });
      const headingText = targetP.verses
        ? `${bookTitle} ${targetP.chapter}:${targetP.verses}`
        : `${bookTitle} ${targetP.chapter}`;
      const readerH1 = document.querySelector('[class*="_reader"] h1') || document.querySelector("#bbe-verse-reader-h1");
      if (readerH1) {
        readerH1.textContent = headingText;
        readerH1.dataset.bbeBook = targetP.book;
        readerH1.dataset.bbeTitle = bookTitle;
      }

      syncAdjacentChapterLinks({ ...targetP, id: v.id, abbr: verKey });
      const finalPath = bbeBuildPath(v.id, verKey, targetP);
      lastRenderKey = "";
      history.pushState({ bbePassageSwapped: true }, "", finalPath + location.search + location.hash);
      document.title = `${headingText} | ${verKey} Bible | YouVersion`;

      tick();
    } catch (err) {
      location.href = newPath;
    }
  }

  function ensureVersePageReader(p) {
    if (!S.enabled || !p || !document.body) {
      html.classList.remove("bbe-verse-view");
      return;
    }

    const nativeReader = getNativeReaderEl();
    const allVers = getAllVersions();
    const activeKey = bbeKeyForId(p.id, allVers) || p.abbr || "ESV";
    const bookTitle = getPageBookTitle(p);
    const headingText = p.verses ? `${bookTitle} ${p.chapter}:${p.verses}` : `${bookTitle} ${p.chapter}`;

    if (!nativeReader) {
      html.classList.add("bbe-verse-view");
      const mainEl = document.querySelector("main") || document.body;
      let wrapper = document.getElementById("bbe-verse-page-reader");
      if (!wrapper) {
        wrapper = document.createElement("div");
        wrapper.id = "bbe-verse-page-reader";
        wrapper.innerHTML = `
          <div class="relative mbe-24 w-full">
            <div class="relative w-full">
              <div class="px-6 md:px-10">
                <div class="mx-auto w-full max-w-[600px]">
                  <div class="cat7xG_yv-bible-text" data-testid="chapter-content" lang="en">
                    <div class="cat7xG_bible-reader" dir="ltr">
                      <div class="cat7xG_reader" style="font-family:Source Serif Pro;font-size:20px">
                        <h1 class="font-bold text-31 md:text-39 leading-[1.15] tracking-[-0.004em]" id="bbe-verse-reader-h1"></h1>
                        <div>
                          <div class="version vid${p.id} iso6393eng" data-vid="${p.id}" data-iso6393="eng" id="bbe-verse-reader-version">
                            <div class="cat7xG_book">
                              <div class="cat7xG_chapter" data-usfm="${p.book}.${p.chapter}"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="bbe-full-chapter-bar" id="bbe-full-chapter-bar" style="display:none;"></div>
                </div>
              </div>
              <div class="sticky z-docked bbe-verse-nav-dock" id="bbe-verse-nav-dock">
                <div>
                  <a aria-label="Previous Chapter" class="bbe-verse-nav-btn" id="bbe-verse-prev-link" href="#">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                  </a>
                </div>
                <div>
                  <a aria-label="Next Chapter" class="bbe-verse-nav-btn" id="bbe-verse-next-link" href="#">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                  </a>
                </div>
              </div>
            </div>
          </div>
        `;
        mainEl.prepend(wrapper);
      }

      const h1El = wrapper.querySelector("#bbe-verse-reader-h1");
      if (h1El && h1El.textContent !== headingText) {
        h1El.textContent = headingText;
      }

      const verEl = wrapper.querySelector("#bbe-verse-reader-version");
      if (verEl) {
        verEl.className = `version vid${p.id} iso6393eng`;
        verEl.setAttribute("data-vid", String(p.id));
      }

      const chapEl = wrapper.querySelector(".cat7xG_chapter");
      if (chapEl) {
        chapEl.setAttribute("data-usfm", `${p.book}.${p.chapter}`);
      }

      // Update Prev / Next Chapter links
      const { prevHref, nextHref } = getAdjacentChapterHrefs(p);
      const prevLink = wrapper.querySelector("#bbe-verse-prev-link");
      const nextLink = wrapper.querySelector("#bbe-verse-next-link");
      if (prevLink) {
        if (prevHref) {
          prevLink.setAttribute("href", prevHref);
          prevLink.style.visibility = "visible";
        } else {
          prevLink.removeAttribute("href");
          prevLink.style.visibility = "hidden";
        }
      }
      if (nextLink) {
        if (nextHref) {
          nextLink.setAttribute("href", nextHref);
          nextLink.style.visibility = "visible";
        } else {
          nextLink.removeAttribute("href");
          nextLink.style.visibility = "hidden";
        }
      }

      // Seed immediate fallback text from Bible.com's native verse card <p> while full chapter fetch is in-flight
      if (chapEl && !chapEl.innerHTML.trim()) {
        const nativeP = Array.from(mainEl.querySelectorAll(':scope > :not(#bbe-verse-page-reader) p'))
          .find(el => el.textContent && el.textContent.trim().length > 10 && !el.closest('a'));
        if (nativeP && !nativeP.textContent.includes("No Available Verses")) {
          const spec = parseVerseRangeSpec(p.verses);
          const firstV = spec ? spec.min : 1;
          const vLabel = p.verses || String(firstV);
          chapEl.innerHTML = `<div class="cat7xG_p"><span class="cat7xG_verse" data-usfm="${p.book}.${p.chapter}.${firstV}"><span class="cat7xG_label">${bbeEscapeHtml(vLabel)}</span><span class="cat7xG_content">${bbeEscapeHtml(nativeP.textContent.trim())}</span></span></div>`;
        }
      }
    } else {
      html.classList.remove("bbe-verse-view");
      const readerH1 = nativeReader.querySelector('[class*="_reader"] h1');
      if (readerH1) {
        if (readerH1.textContent !== headingText) {
          readerH1.textContent = headingText;
        }
        readerH1.dataset.bbeBook = p.book;
        readerH1.dataset.bbeTitle = bookTitle;
      }
    }

    // Ensure "Read Full Chapter" action bar below the reader when viewing a single verse or segment
    const activeReader = nativeReader || document.querySelector('#bbe-verse-page-reader [class*="_yv-bible-text"]');
    if (activeReader && activeReader.parentElement) {
      let fullChapBar = document.getElementById("bbe-full-chapter-bar");
      if (!fullChapBar) {
        fullChapBar = document.createElement("div");
        fullChapBar.id = "bbe-full-chapter-bar";
        fullChapBar.className = "bbe-full-chapter-bar";
        activeReader.insertAdjacentElement("afterend", fullChapBar);
      }
      if (p.verses) {
        const fullUrl = `/bible/${p.id}/${p.book}.${p.chapter}.${activeKey}`;
        const barKey = `${p.id}|${p.book}.${p.chapter}|${p.verses}|${activeKey}`;
        fullChapBar.style.display = "flex";
        if (fullChapBar.dataset.bbeBarKey !== barKey) {
          fullChapBar.dataset.bbeBarKey = barKey;
          fullChapBar.innerHTML = `
            <span class="bbe-full-chapter-info">Showing segment <b>${bbeEscapeHtml(headingText)}</b></span>
            <a href="${fullUrl}" class="bbe-read-full-chapter-btn" id="bbe-read-full-chapter-btn" title="View all of ${bbeEscapeHtml(bookTitle)} ${p.chapter}">
              ${BBE_ICONS.book(14)}
              <span>Read Full Chapter (${bbeEscapeHtml(bookTitle)} ${p.chapter})</span>
            </a>
          `;
          fullChapBar.querySelector("#bbe-read-full-chapter-btn")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const fullP = { ...p, verses: null };
            transitionPassageInPlace(fullP, activeKey);
          });
        }
      } else {
        fullChapBar.style.display = "none";
      }
    }

    // Populate or filter the .cat7xG_chapter DOM if needed
    const chapterEl = getChapterEl();
    if (chapterEl) {
      const targetPassageKey = `${p.id}|${p.book}.${p.chapter}|${p.verses || "FULL"}`;
      const needsFetch = (!nativeReader || p.verses || chapterEl.dataset.bbeFiltered === "1") &&
                         chapterEl.dataset.bbePassageKey !== targetPassageKey &&
                         chapterEl.dataset.bbeLoadingKey !== targetPassageKey;
      if (needsFetch) {
        chapterEl.dataset.bbeLoadingKey = targetPassageKey;
        fetchPassageHtml(activeKey, p)
          .then(res => {
            const curP = bbeParsePath(location.pathname, getAllVersions());
            if (!curP) return;
            const htmlStr = (res && typeof res.html === "string") ? res.html : String(res);

            // Handle verse-range overshoot: clamp upper bound or fall back to full chapter
            if (res && res.clamped) {
              if (res.fallbackFullChapter) {
                curP.verses = null;
                p.verses = null;
                const cleanUrl = `/bible/${p.id}/${p.book}.${p.chapter}.${activeKey}`;
                history.replaceState({ bbeNormalized: true }, "", cleanUrl + location.search + location.hash);
              } else if (res.clampedVerses) {
                curP.verses = res.clampedVerses;
                p.verses = res.clampedVerses;
                const clampedUrl = `/bible/${p.id}/${p.book}.${p.chapter}.${p.verses}.${activeKey}`;
                history.replaceState({ bbeNormalized: true }, "", clampedUrl + location.search + location.hash);
              }

              const newHeading = p.verses ? `${bookTitle} ${p.chapter}:${p.verses}` : `${bookTitle} ${p.chapter}`;
              const rH1 = document.querySelector('[class*="_reader"] h1') || document.querySelector("#bbe-verse-reader-h1");
              if (rH1) rH1.textContent = newHeading;
              const sInput = document.querySelector(".bbe-search-input");
              if (sInput && document.activeElement !== sInput) {
                sInput.value = newHeading;
              }
              document.title = `${newHeading} | ${activeKey} Bible | YouVersion`;

              const fullChapBar = document.getElementById("bbe-full-chapter-bar");
              if (fullChapBar) {
                if (p.verses) {
                  fullChapBar.style.display = "flex";
                  const barInfo = fullChapBar.querySelector(".bbe-full-chapter-info");
                  if (barInfo) barInfo.innerHTML = `Showing segment <b>${bbeEscapeHtml(newHeading)}</b>`;
                } else {
                  fullChapBar.style.display = "none";
                }
              }
            }

            const curTargetKey = `${curP.id}|${curP.book}.${curP.chapter}|${curP.verses || "FULL"}`;
            chapterEl.innerHTML = htmlStr;
            chapterEl.dataset.bbePassageKey = curTargetKey;
            chapterEl.dataset.bbeFiltered = curP.verses ? "1" : "";
            delete chapterEl.dataset.bbeLoadingKey;
            renderVerseBadges(curP, true);
            if (S.wordStudyMode) enhanceVersesForWordStudy(curP);
            if (S.compareOn) renderCompare(curP);
            syncDomClasses();
            if (window.BBE_SERMON && window.BBE_SERMON.isActive()) window.BBE_SERMON.onPassageOrLayoutChange();
          })
          .catch(() => {
            delete chapterEl.dataset.bbeLoadingKey;
          });
      }
    }
  }

  // Preloads core translations intelligently with a 3s idle delay and staggered queue
  let preloadTimer = null;
  let preloadIdleId = null;
  let preloadQueueTimeouts = [];

  function cancelPreloading() {
    const hadPending = preloadTimer !== null || preloadIdleId !== null || preloadQueueTimeouts.length > 0;
    if (preloadTimer) {
      clearTimeout(preloadTimer);
      preloadTimer = null;
    }
    if (preloadIdleId !== null && typeof cancelIdleCallback === "function") {
      cancelIdleCallback(preloadIdleId);
      preloadIdleId = null;
    }
    preloadQueueTimeouts.forEach(t => clearTimeout(t));
    preloadQueueTimeouts = [];
    if (hadPending) {
      lastPreloadedChapter = "";
    }
  }

  function preloadOtherVersions(p, force = false) {
    if (!S.prefetchTranslations) {
      cancelPreloading();
      return;
    }
    const chapKey = `${p.book}.${p.chapter}`;
    if (!force && lastPreloadedChapter === chapKey) return;

    const allVers = getAllVersions();
    const curKey = bbeKeyForId(p.id, allVers) || p.abbr;
    const curChapterEl = getChapterEl();
    if (curChapterEl && curKey && !p.verses && !curChapterEl.dataset.bbeFiltered) {
      const curCacheKey = `${p.id}|${chapKey}`;
      if (!chapterCache.has(curCacheKey)) {
        chapterCache.set(curCacheKey, Promise.resolve(curChapterEl.innerHTML));
      }
    }

    // Cancel any previous chapter's pending preload requests before recording the new chapter
    cancelPreloading();
    lastPreloadedChapter = chapKey;

    // Delay background preloading by 3 seconds (or requestIdleCallback) so page load rendering is never competed with
    const schedulePreload = (cb) => {
      if (typeof requestIdleCallback === "function") {
        preloadTimer = setTimeout(() => {
          preloadTimer = null;
          preloadIdleId = requestIdleCallback(() => {
            preloadIdleId = null;
            cb();
          }, { timeout: 2000 });
        }, 3000);
      } else {
        preloadTimer = setTimeout(() => {
          preloadTimer = null;
          cb();
        }, 3000);
      }
    };

    schedulePreload(() => {
      // Ensure user has not navigated away in the meantime
      const curP = bbeParsePath(location.pathname, allVers);
      if (!curP || `${curP.book}.${curP.chapter}` !== chapKey) return;

      // 1. Prioritize top 2 most likely translations
      const priorityList = [];
      const remainingList = [];

      // Check comparison versions first if comparison mode is active
      if (S.compareOn && Array.isArray(S.compareVersions)) {
        S.compareVersions.forEach(k => {
          if (k !== curKey && allVers[k] && !priorityList.includes(k)) {
            priorityList.push(k);
          }
        });
      }

      // Check primary toolbar versions
      const coreKeys = (S.toolbarVersions && S.toolbarVersions.length > 0)
        ? S.toolbarVersions
        : ["ESV", "NIV", "NASB", "NLT", "BSB", "NKJV", "KJV"];

      coreKeys.forEach(k => {
        if (k !== curKey && allVers[k]) {
          if (priorityList.length < 2 && !priorityList.includes(k)) {
            priorityList.push(k);
          } else if (!priorityList.includes(k) && !remainingList.includes(k)) {
            remainingList.push(k);
          }
        }
      });

      // Shortcut and user translations
      const keyMap = getKeyMap();
      Object.values(keyMap).forEach(k => {
        if (k !== curKey && allVers[k] && !priorityList.includes(k) && !remainingList.includes(k)) {
          remainingList.push(k);
        }
      });

      if (S.userTranslations) {
        Object.keys(S.userTranslations).forEach(k => {
          if (k !== curKey && allVers[k] && !priorityList.includes(k) && !remainingList.includes(k)) {
            remainingList.push(k);
          }
        });
      }

      // Fetch the top 2 immediately (chapter HTML + cloud highlights)
      priorityList.forEach(key => {
        fetchChapter(key, p).catch(() => {});
        if (allVers[key]?.id) {
          fetchCloudHighlightsForChapter(chapKey, allVers[key].id, false, { isPrefetch: true });
        }
      });

      // Queue the remaining versions with a 200ms gap to eliminate bandwidth spikes
      remainingList.forEach((key, index) => {
        const timeout = setTimeout(() => {
          preloadQueueTimeouts = preloadQueueTimeouts.filter(t => t !== timeout);
          const checkP = bbeParsePath(location.pathname, allVers);
          if (checkP && `${checkP.book}.${checkP.chapter}` === chapKey) {
            fetchChapter(key, p).catch(() => {});
            if (allVers[key]?.id) {
              fetchCloudHighlightsForChapter(chapKey, allVers[key].id, false, { isPrefetch: true });
            }
          }
        }, 200 * (index + 1));
        preloadQueueTimeouts.push(timeout);
      });
    });
  }

  /* ---------------- Zero-Delay Instant Translation Swapping ---------------- */
  function findActiveVerse() {
    if (S.preserveReadingPosition === false) return null;
    const verses = document.querySelectorAll('[class*="_chapter"]:not(#bbe-compare-grid *) [data-usfm]');
    if (!verses || verses.length === 0) return null;
    const viewportTop = 90; // account for top floating study bar
    for (const v of verses) {
      const rect = v.getBoundingClientRect();
      if (rect.bottom > viewportTop) {
        const usfm = v.getAttribute("data-usfm");
        if (usfm) {
          return {
            usfm,
            offsetTop: rect.top
          };
        }
      }
    }
    return null;
  }

  function restoreActiveVerse(activeVerse) {
    if (!activeVerse || !activeVerse.usfm) return;
    const target = document.querySelector(`[class*="_chapter"]:not(#bbe-compare-grid *) [data-usfm="${activeVerse.usfm}"]`);
    if (target) {
      const newRect = target.getBoundingClientRect();
      const diff = newRect.top - activeVerse.offsetTop;
      if (Math.abs(diff) > 2) {
        window.scrollBy({ top: diff, behavior: "instant" });
      }
    }
  }

  async function applyChapterTransition(curChapterEl, newHtml, activeVerse) {
    const half = 35;

    // Apply hardware acceleration and cubic-bezier easing
    curChapterEl.style.willChange = "opacity";
    curChapterEl.style.transition = `opacity ${half}ms cubic-bezier(0.25, 1, 0.5, 1)`;

    // Phase 1: Crisp micro-dissolve out
    curChapterEl.style.opacity = "0.2";

    await new Promise(r => setTimeout(r, half));

    // Phase 2: Replace DOM and anchor reading position
    curChapterEl.innerHTML = newHtml;
    if (activeVerse) restoreActiveVerse(activeVerse);

    // Force browser reflow to register new DOM before animating in
    void curChapterEl.offsetHeight;

    // Phase 3: Animate in
    curChapterEl.style.opacity = "1";

    // Clean up inline styles after transition completes
    setTimeout(() => {
      curChapterEl.style.removeProperty("will-change");
      curChapterEl.style.removeProperty("transition");
      curChapterEl.style.removeProperty("opacity");
    }, half + 20);
  }

  async function switchToVersion(targetKey, p) {
    const allVers = getAllVersions();
    const v = allVers[targetKey];
    if (!v) return;
    const activeKey = bbeKeyForId(p.id, allVers) || p.abbr;
    if (targetKey === activeKey && v.id === p.id) return;

    // If in compare mode, update primary compare column
    if (S.compareOn) {
      const set = new Set(S.compareVersions || ["NIV", "ESV"]);
      set.add(targetKey);
      const ordered = [targetKey, ...Array.from(set).filter(k => k !== targetKey)];
      await bbeSave({ compareVersions: ordered });
      showToast(`Compare: Added ${targetKey}`, { icon: "zap" });
      return;
    }

    const curChapterEl = getChapterEl();
    if (!curChapterEl) {
      location.href = bbeBuildPath(v.id, targetKey, p);
      return;
    }

    const toastLabel = v.name ? `Swapped to ${targetKey} · ${v.name}` : `Swapped to ${targetKey}`;
    showToast(toastLabel, { icon: "zap" });

    // Update active button UI immediately for instant feedback
    document.querySelectorAll("#bbe-bar .bbe-version-btn").forEach(btn => {
      btn.classList.toggle("bbe-active", btn.dataset.version === targetKey);
    });

    try {
      const activeVerse = findActiveVerse();
      const res = await fetchPassageHtml(targetKey, p);
      const newHtml = (res && typeof res.html === "string") ? res.html : String(res);
      if (res && res.clamped) {
        if (res.fallbackFullChapter) p.verses = null;
        else if (res.clampedVerses) p.verses = res.clampedVerses;
      }
      await applyChapterTransition(curChapterEl, newHtml, activeVerse);
      fetchCloudHighlightsForChapter(`${p.book}.${p.chapter}`, v.id, true);

      p.id = v.id;
      p.abbr = targetKey;
      curChapterEl.dataset.bbePassageKey = `${v.id}|${p.book}.${p.chapter}|${p.verses || "FULL"}`;
      curChapterEl.dataset.bbeFiltered = p.verses ? "1" : "";
      syncAdjacentChapterLinks(p);

      // Update URL and document title without full page reload (triggers handleUrlChange -> tick)
      const newPath = bbeBuildPath(v.id, targetKey, p);
      lastRenderKey = "";
      history.pushState({ bbeSwapped: true, key: targetKey, id: v.id }, "", newPath + location.search + location.hash);
      document.title = document.title.replace(/\| .*? Bible/i, `| ${targetKey} Bible`);

      ensureVersePageReader(p);
      renderVerseBadges(p, true);
      renderToolbar(p);
    } catch (err) {
      console.warn("Instant swap failed, falling back to full navigation:", err);
      location.href = bbeBuildPath(v.id, targetKey, p);
    }
  }

  /* ---------------- Zero-Delay Instant Adjacent Chapter Navigation ---------------- */
  const adjacentChapterCache = new Map(); // cleanUrl -> Promise<{ url, html, prevHref, nextHref, title }>
  let isNavigatingChapter = false;

  function cleanChapterUrl(url) {
    if (!url) return "";
    try {
      const u = new URL(url, location.origin);
      return u.pathname;
    } catch {
      return (url || "").split("?")[0].split("#")[0];
    }
  }

  function getNativeChapterUrls() {
    const prevA = document.querySelector('a[aria-label="Previous Chapter"], a[aria-label*="Previous"]');
    const nextA = document.querySelector('a[aria-label="Next Chapter"], a[aria-label*="Next"]');
    let prevUrl = (prevA && prevA.getAttribute("aria-disabled") !== "true") ? cleanChapterUrl(prevA.getAttribute("href")) : null;
    let nextUrl = (nextA && nextA.getAttribute("aria-disabled") !== "true") ? cleanChapterUrl(nextA.getAttribute("href")) : null;

    if (!prevA || !nextA) {
      const curP = bbeParsePath(location.pathname, getAllVersions());
      if (curP) {
        const computed = getAdjacentChapterHrefs(curP);
        if (!prevA) prevUrl = computed.prevHref;
        if (!nextA) nextUrl = computed.nextHref;
      }
    }

    return {
      prevUrl: prevUrl || null,
      nextUrl: nextUrl || null,
      prevEl: prevA,
      nextEl: nextA
    };
  }

  function fetchAdjacentChapter(url) {
    const clean = cleanChapterUrl(url);
    if (!clean || !clean.startsWith("/bible/")) return null;
    if (adjacentChapterCache.has(clean)) {
      return adjacentChapterCache.get(clean);
    }

    const promise = fetch(clean, { credentials: "same-origin" })
      .then(res => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then(text => {
        const doc = new DOMParser().parseFromString(text, "text/html");
        const chapter = extractChapterNode(doc);
        if (!chapter) throw new Error("Chapter content missing from " + clean);
        const prevA = doc.querySelector('a[aria-label="Previous Chapter"], a[aria-label*="Previous"]');
        const nextA = doc.querySelector('a[aria-label="Next Chapter"], a[aria-label*="Next"]');
        return {
          url: clean,
          html: chapter.innerHTML,
          prevHref: prevA ? cleanChapterUrl(prevA.getAttribute("href")) : null,
          nextHref: nextA ? cleanChapterUrl(nextA.getAttribute("href")) : null,
          title: doc.title || document.title
        };
      })
      .catch(err => {
        adjacentChapterCache.delete(clean);
        throw err;
      });

    adjacentChapterCache.set(clean, promise);

    // Keep cache memory bounded (up to 20 adjacent chapters)
    if (adjacentChapterCache.size > 20) {
      const oldest = adjacentChapterCache.keys().next().value;
      adjacentChapterCache.delete(oldest);
    }

    return promise;
  }

  let preloadAdjacentTimer = null;
  let lastAdjacentPreloadChap = "";
  function preloadAdjacentChapters(p) {
    if (S.preloadAdjacentChapters === false) {
      clearTimeout(preloadAdjacentTimer);
      preloadAdjacentTimer = null;
      lastAdjacentPreloadChap = "";
      return;
    }
    const chapKey = p ? `${p.book}.${p.chapter}.${p.id || p.abbr}` : "";
    if (chapKey && lastAdjacentPreloadChap === chapKey) return;
    if (chapKey) lastAdjacentPreloadChap = chapKey;

    clearTimeout(preloadAdjacentTimer);
    preloadAdjacentTimer = setTimeout(() => {
      preloadAdjacentTimer = null;
      const { prevUrl, nextUrl } = getNativeChapterUrls();
      if (nextUrl) fetchAdjacentChapter(nextUrl)?.catch(() => {});
      if (prevUrl) fetchAdjacentChapter(prevUrl)?.catch(() => {});
    }, 3500);
  }

  async function applyChapterDirectionalTransition(curChapterEl, newHtml, direction) {
    const half = 45;
    const outOffset = direction === "next" ? "-28px" : "28px";
    const inOffset = direction === "next" ? "28px" : "-28px";

    curChapterEl.style.willChange = "opacity, transform";
    curChapterEl.style.transition = `opacity ${half}ms cubic-bezier(0.25, 1, 0.5, 1), transform ${half}ms cubic-bezier(0.25, 1, 0.5, 1)`;

    // Phase 1: Animate current chapter out in the direction of reading
    curChapterEl.style.opacity = "0.15";
    curChapterEl.style.transform = `translateX(${outOffset})`;

    await new Promise(r => setTimeout(r, half));

    // Phase 2: Insert new HTML and position at incoming offset
    curChapterEl.innerHTML = newHtml;
    curChapterEl.style.transition = "none";
    curChapterEl.style.opacity = "0.15";
    curChapterEl.style.transform = `translateX(${inOffset})`;

    // Force browser reflow
    void curChapterEl.offsetHeight;

    // Phase 3: Animate into center
    curChapterEl.style.transition = `opacity ${half}ms cubic-bezier(0.16, 1, 0.3, 1), transform ${half}ms cubic-bezier(0.16, 1, 0.3, 1)`;
    curChapterEl.style.opacity = "1";
    curChapterEl.style.transform = "translateX(0)";

    setTimeout(() => {
      curChapterEl.style.removeProperty("will-change");
      curChapterEl.style.removeProperty("transition");
      curChapterEl.style.removeProperty("opacity");
      curChapterEl.style.removeProperty("transform");
    }, half + 30);
  }

  async function navigateToAdjacentChapter(direction, triggerEl = null) {
    if (isNavigatingChapter) return;
    const { prevUrl, nextUrl, prevEl, nextEl } = getNativeChapterUrls();
    const targetUrl = direction === "next" ? nextUrl : prevUrl;
    const activeBtn = triggerEl || (direction === "next" ? nextEl : prevEl);

    if (!targetUrl) {
      showToast(direction === "next" ? "Reached the end of the Bible" : "Reached the beginning of the Bible", { icon: "book" });
      return;
    }

    const curChapterEl = getChapterEl();
    if (!curChapterEl) {
      location.href = targetUrl;
      return;
    }

    isNavigatingChapter = true;

    // If fetch is in flight, pulse the active button
    if (activeBtn) activeBtn.classList.add("bbe-nav-loading");

    try {
      const dataPromise = fetchAdjacentChapter(targetUrl);
      if (!dataPromise) throw new Error("Could not initiate fetch for " + targetUrl);

      const data = await dataPromise;
      if (activeBtn) activeBtn.classList.remove("bbe-nav-loading");

      // Reset any active passage focus mode range so full new chapter displays
      if (typeof focusedRange !== "undefined" && focusedRange) {
        focusedRange = null;
      }

      // Scroll to top of scripture reading column
      window.scrollTo({ top: 0, behavior: "instant" });

      // Apply directional slide transition (Right-to-Left for Next, Left-to-Right for Prev)
      await applyChapterDirectionalTransition(curChapterEl, data.html, direction);

      const nextP = bbeParsePath(targetUrl, getAllVersions());
      if (nextP) {
        curChapterEl.dataset.bbePassageKey = `${nextP.id}|${nextP.book}.${nextP.chapter}|${nextP.verses || "FULL"}`;
        curChapterEl.dataset.bbeFiltered = nextP.verses ? "1" : "";
        curChapterEl.setAttribute("data-usfm", `${nextP.book}.${nextP.chapter}`);
        fetchCloudHighlightsForChapter(`${nextP.book}.${nextP.chapter}`, nextP.id, true);
      }

      // Update native floating buttons' hrefs (including clearing boundary hrefs) before pushState triggers tick()
      updateAdjacentChapterLinks(data.prevHref, data.nextHref);

      // Update URL and document title in browser history
      lastRenderKey = "";
      history.pushState({ bbeChapterSwapped: true, url: targetUrl }, "", targetUrl);
      if (data.title) {
        document.title = data.title;
      }

      // Trigger immediate tick to re-render toolbar with new chapter number, verse badges, and adjacent preloading
      tick();
    } catch (err) {
      console.warn("Instant chapter swap failed, falling back to standard navigation:", err);
      if (activeBtn) activeBtn.classList.remove("bbe-nav-loading");
      location.href = targetUrl;
    } finally {
      isNavigatingChapter = false;
    }
  }

  // Intercept clicks on Bible.com's native Previous and Next Chapter floating buttons
  document.addEventListener("click", (e) => {
    const prevBtn = e.target.closest('a[aria-label="Previous Chapter"], a[aria-label*="Previous"]');
    if (prevBtn) {
      e.preventDefault();
      e.stopPropagation();
      navigateToAdjacentChapter("prev", prevBtn);
      return;
    }
    const nextBtn = e.target.closest('a[aria-label="Next Chapter"], a[aria-label*="Next"]');
    if (nextBtn) {
      e.preventDefault();
      e.stopPropagation();
      navigateToAdjacentChapter("next", nextBtn);
      return;
    }
  }, true);

  // Hover-to-preload on native Previous and Next Chapter buttons
  document.addEventListener("mouseover", (e) => {
    const adjBtn = e.target.closest('a[aria-label="Previous Chapter"], a[aria-label*="Previous"], a[aria-label="Next Chapter"], a[aria-label*="Next"]');
    if (adjBtn) {
      const href = adjBtn.getAttribute("href");
      if (href) fetchAdjacentChapter(href).catch(() => {});
    }
  }, { passive: true });

  /* ---------------- Study Commentary Drawer ---------------- */
  let isDrawerOpen = false;
  let isDrawerFullscreen = false;
  let currentDrawerPassage = { book: "ROM", chapter: "9", verse: 1 };
  let activeStudyTab = S.defaultStudyTab || "commentary"; // "commentary" | "crossref"
  let cachedCommentaryData = null;
  let cachedCrossrefData = null;
  let activeAuthorFilter = "all";

  // Chip horizontal dragging & sliding state
  let isDraggingChips = false;
  let chipsStartX = 0;
  let chipsScrollLeft = 0;
  let chipsDidDrag = false;

  // Bottom-docked drawer vertical resize & scroll clearance state
  let isResizingDrawer = false;
  let drawerResizeStartY = 0;
  let drawerResizeStartH = 0;
  const DRAWER_CLEARANCE_BREATHING_PX = 140;
  const DRAWER_GLIDE_SAFE_GAP_PX = 104;
  let currentDrawerClearancePx = 0;
  let residualClearanceActive = false;
  let drawerScrollAnimRaf = null;

  function clampBottomDrawerHeight(px) {
    const minH = 160;
    const maxH = Math.max(minH, Math.floor(window.innerHeight * 0.88));
    return Math.min(maxH, Math.max(minH, Math.round(px)));
  }

  function isBottomDrawerActive() {
    return Boolean(S.enabled && isDrawerOpen && !isDrawerFullscreen && (S.commentaryDock || "bottom") === "bottom");
  }

  function getBottomDrawerHeightPx() {
    const fallback = (Number(S.commentaryBottomHeight) >= 160)
      ? clampBottomDrawerHeight(Number(S.commentaryBottomHeight))
      : clampBottomDrawerHeight(Math.round((window.innerHeight || 800) * 0.44));
    const drawer = document.getElementById("bbe-drawer");
    if (drawer && drawer.classList.contains("bbe-dock-bottom") && !isDrawerFullscreen) {
      const measured = Math.round(drawer.getBoundingClientRect().height);
      if (measured >= 160) return Math.max(fallback, measured);
    }
    return fallback;
  }

  function getRequiredBottomClearancePx(overrideDrawerH) {
    const drawerH = (typeof overrideDrawerH === "number" && overrideDrawerH > 0)
      ? overrideDrawerH
      : getBottomDrawerHeightPx();
    const baseClearance = drawerH + DRAWER_CLEARANCE_BREATHING_PX;
    const docEl = document.scrollingElement || document.documentElement;
    const viewportH = window.innerHeight || docEl.clientHeight || 800;
    const naturalScrollHeight = Math.max(viewportH, docEl.scrollHeight - currentDrawerClearancePx);
    const scriptRect = getActiveScriptureBounds();
    if (scriptRect && scriptRect.height > 0) {
      const textBottomInDoc = Math.round(window.scrollY + scriptRect.bottom);
      const neededForText = (textBottomInDoc + drawerH + DRAWER_CLEARANCE_BREATHING_PX) - naturalScrollHeight;
      return Math.max(baseClearance, neededForText);
    }
    return baseClearance;
  }

  function setDrawerClearancePx(px) {
    const next = Math.max(0, Math.round(px || 0));
    currentDrawerClearancePx = next;
    if (next > 0) {
      html.style.setProperty("--bbe-drawer-clearance", `${next}px`);
      if (document.body) document.body.style.setProperty("padding-bottom", `${next}px`, "important");
    } else {
      html.style.removeProperty("--bbe-drawer-clearance");
      if (document.body) document.body.style.removeProperty("padding-bottom");
    }
  }

  function cancelDrawerScrollAnim() {
    if (drawerScrollAnimRaf) {
      cancelAnimationFrame(drawerScrollAnimRaf);
      drawerScrollAnimRaf = null;
    }
  }

  // Exact evaluator for CSS cubic-bezier(0.16, 1, 0.3, 1) matching #bbe-drawer slide transition
  function easeDrawerBezier(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const x1 = 0.16, y1 = 1.0, x2 = 0.3, y2 = 1.0;
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;
    const sampleX = (u) => ((ax * u + bx) * u + cx) * u;
    const sampleDerivX = (u) => (3 * ax * u + 2 * bx) * u + cx;
    const sampleY = (u) => ((ay * u + by) * u + cy) * u;
    let u = t;
    for (let i = 0; i < 6; i++) {
      const err = sampleX(u) - t;
      if (Math.abs(err) < 1e-5) break;
      const d = sampleDerivX(u);
      if (Math.abs(d) < 1e-5) break;
      u -= err / d;
    }
    u = Math.max(0, Math.min(1, u));
    return sampleY(u);
  }

  function animateDrawerScrollBy(deltaY, durationMs = 280) {
    cancelDrawerScrollAnim();
    const delta = Math.round(deltaY);
    if (Math.abs(delta) < 2) return;
    const startY = window.scrollY;
    const startTime = performance.now();
    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = easeDrawerBezier(progress);
      window.scrollTo(0, Math.round(startY + delta * eased));
      if (progress < 1) {
        drawerScrollAnimRaf = requestAnimationFrame(step);
      } else {
        drawerScrollAnimRaf = null;
      }
    };
    drawerScrollAnimRaf = requestAnimationFrame(step);
  }

  function getPreClearanceNaturalMaxScrollY() {
    const docEl = document.scrollingElement || document.documentElement;
    const viewportH = window.innerHeight || docEl.clientHeight || 800;
    const naturalScrollHeight = Math.max(viewportH, docEl.scrollHeight - currentDrawerClearancePx);
    return Math.max(0, naturalScrollHeight - viewportH);
  }

  // Option B on close: keep only the exact excess scroll offset so visible text doesn't move 1px on close,
  // and silently collapse the leftover space as the user scrolls back up.
  function releaseDrawerBottomClearanceHoldPosition() {
    cancelDrawerScrollAnim();
    if (!S.enabled || currentDrawerClearancePx <= 0) {
      residualClearanceActive = false;
      setDrawerClearancePx(0);
      return;
    }
    const naturalMaxScrollY = getPreClearanceNaturalMaxScrollY();
    const excessScroll = Math.round(window.scrollY - naturalMaxScrollY);
    if (excessScroll > 0) {
      residualClearanceActive = true;
      setDrawerClearancePx(Math.min(currentDrawerClearancePx, excessScroll));
    } else {
      residualClearanceActive = false;
      setDrawerClearancePx(0);
    }
  }

  function syncDrawerBottomClearance() {
    if (isBottomDrawerActive()) {
      residualClearanceActive = false;
      setDrawerClearancePx(getRequiredBottomClearancePx());
    } else {
      releaseDrawerBottomClearanceHoldPosition();
    }
  }

  window.addEventListener("scroll", () => {
    if (!residualClearanceActive) return;
    if (isBottomDrawerActive() || !S.enabled || currentDrawerClearancePx <= 0) {
      if (!isBottomDrawerActive()) {
        residualClearanceActive = false;
        setDrawerClearancePx(0);
      }
      return;
    }
    const naturalMaxScrollY = getPreClearanceNaturalMaxScrollY();
    const needed = Math.max(0, Math.round(window.scrollY - naturalMaxScrollY));
    if (needed <= 0) {
      residualClearanceActive = false;
      setDrawerClearancePx(0);
    } else if (needed < currentDrawerClearancePx) {
      setDrawerClearancePx(needed);
    }
  }, { passive: true });

  window.addEventListener("wheel", () => {
    if (drawerScrollAnimRaf) cancelDrawerScrollAnim();
  }, { passive: true });
  window.addEventListener("touchmove", () => {
    if (drawerScrollAnimRaf) cancelDrawerScrollAnim();
  }, { passive: true });
  window.addEventListener("resize", () => {
    if (isBottomDrawerActive()) {
      setDrawerClearancePx(getRequiredBottomClearancePx());
    }
  }, { passive: true });

  function getTopSafeZone() {
    const bar = document.getElementById("bbe-bar");
    if (bar && S.toolbarBehavior !== "static" && !bar.classList.contains("bbe-hidden")) {
      const r = bar.getBoundingClientRect();
      if (r.height > 0 && r.bottom > 0 && r.bottom < 220) {
        return Math.max(24, Math.round(r.bottom + 14));
      }
    }
    return 24;
  }

  function getActiveScriptureBounds() {
    if (S.compareOn) {
      const cmp = document.getElementById("bbe-compare-grid");
      if (cmp) return cmp.getBoundingClientRect();
    }
    if (html.classList.contains("bbe-verse-view")) {
      const vpChap = document.querySelector('#bbe-verse-page-reader [class*="_chapter"]') || document.getElementById("bbe-verse-page-reader");
      if (vpChap) return vpChap.getBoundingClientRect();
    }
    const chap = getChapterEl();
    return chap ? chap.getBoundingClientRect() : null;
  }

  function getVerseBoundsInActiveView(bookCode, chapter, vNum) {
    const num = Number(vNum) || 1;
    if (S.compareOn) {
      const interRow = document.getElementById(`bbe-interleaved-v-${num}`);
      if (interRow) return interRow.getBoundingClientRect();
      const cmpCols = document.querySelectorAll(`#bbe-compare-grid .bbe-compare-col [class*="_verse"][data-usfm$=".${num}"]`);
      if (cmpCols.length > 0) {
        let top = Infinity, bottom = -Infinity;
        cmpCols.forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.width > 0 || r.height > 0) {
            if (r.top < top) top = r.top;
            if (r.bottom > bottom) bottom = r.bottom;
          }
        });
        if (top < Infinity) return { top, bottom, height: bottom - top };
      }
    }
    const root = html.classList.contains("bbe-verse-view")
      ? (document.querySelector('#bbe-verse-page-reader [class*="_chapter"]') || getChapterEl())
      : getChapterEl();
    if (!root) return null;
    const prefix = `${bookCode}.${chapter}.`;
    const matches = [];
    root.querySelectorAll('[class*="_verse"][data-usfm]').forEach(vEl => {
      const usfm = vEl.getAttribute("data-usfm") || "";
      if (usfm === `${prefix}${num}` || extractUsfmVerseNums(usfm).includes(num)) {
        const r = vEl.getBoundingClientRect();
        if (r.width > 0 || r.height > 0) matches.push(r);
      }
    });
    if (matches.length === 0) return null;
    let top = Infinity, bottom = -Infinity;
    for (const r of matches) {
      if (r.top < top) top = r.top;
      if (r.bottom > bottom) bottom = r.bottom;
    }
    return top < Infinity ? { top, bottom, height: bottom - top } : null;
  }

  function glideScriptureAboveBottomDrawer(bookCode, chapter, vNum, opts = {}) {
    if (!isBottomDrawerActive()) return;
    const viewportH = window.innerHeight || document.documentElement.clientHeight || 800;
    const drawerH = getBottomDrawerHeightPx();
    const drawerTop = viewportH - drawerH;
    const safeBottom = drawerTop - DRAWER_GLIDE_SAFE_GAP_PX;
    const topSafe = getTopSafeZone();
    const chapterRect = getActiveScriptureBounds();
    const verseRect = getVerseBoundsInActiveView(bookCode, chapter, vNum);

    const chapterNearBottom = Boolean(
      opts.wasAtBottomOfPage ||
      (chapterRect && window.scrollY > 10 && chapterRect.bottom <= viewportH + 56)
    );

    // 1. User is already at the bottom of the chapter and the final lines are behind the drawer
    if (chapterNearBottom && chapterRect && chapterRect.bottom > safeBottom) {
      let delta = chapterRect.bottom - safeBottom;
      if (opts.explicitVerse && verseRect && verseRect.bottom > safeBottom) {
        delta = Math.max(delta, verseRect.bottom - safeBottom);
      }
      if (opts.explicitVerse && verseRect && (verseRect.top - delta < topSafe)) {
        delta = Math.max(0, verseRect.top - topSafe);
      }
      if (delta > 2) {
        animateDrawerScrollBy(delta, 280);
      }
      return;
    }

    // 2. User explicitly clicked/stepped to a verse that is covered by the bottom drawer
    if (opts.explicitVerse && verseRect) {
      if (verseRect.bottom > safeBottom) {
        let delta = verseRect.bottom - safeBottom;
        if (chapterRect && Math.abs(chapterRect.bottom - verseRect.bottom) < 72) {
          delta = Math.max(delta, chapterRect.bottom - safeBottom);
        }
        if (verseRect.top - delta < topSafe) {
          delta = Math.max(0, verseRect.top - topSafe);
        }
        if (delta > 2) {
          animateDrawerScrollBy(delta, 280);
        }
      } else if (opts.isStepper && verseRect.top < topSafe) {
        const delta = verseRect.top - topSafe - 12;
        if (delta < -2) {
          animateDrawerScrollBy(delta, 280);
        }
      }
    }
  }

  function applyDrawerDockClasses(drawer) {
    if (!drawer) return;
    const dock = S.commentaryDock || "bottom";
    drawer.classList.toggle("bbe-dock-bottom", dock === "bottom");
    drawer.classList.toggle("bbe-dock-right", dock !== "bottom");
    drawer.classList.toggle("bbe-fullscreen", isDrawerFullscreen);
    const backdrop = document.getElementById("bbe-drawer-backdrop");
    if (backdrop) {
      backdrop.classList.toggle("bbe-backdrop-bottom", dock === "bottom");
    }

    if (dock === "bottom" && !isDrawerFullscreen && Number(S.commentaryBottomHeight) >= 160) {
      drawer.style.setProperty("--bbe-bottom-height", `${clampBottomDrawerHeight(Number(S.commentaryBottomHeight))}px`);
    } else {
      drawer.style.removeProperty("--bbe-bottom-height");
    }

    syncDrawerBottomClearance();

    const dockIcon = drawer.querySelector("#bbe-drawer-dock-icon");
    const dockLabel = drawer.querySelector("#bbe-drawer-dock-label");
    const dockBtn = drawer.querySelector("#bbe-drawer-dock-btn");
    if (dockIcon && dockLabel) {
      if (dock === "bottom") {
        dockIcon.innerHTML = BBE_ICONS.dockRight(13);
        dockLabel.textContent = "Sidebar";
        if (dockBtn) dockBtn.title = "Dock as Right Sidebar";
      } else {
        dockIcon.innerHTML = BBE_ICONS.dockBottom(13);
        dockLabel.textContent = "Bottom";
        if (dockBtn) dockBtn.title = "Dock at Bottom (Logos Bible style)";
      }
    }

    const fsIcon = drawer.querySelector("#bbe-drawer-fs-icon");
    const fsLabel = drawer.querySelector("#bbe-drawer-fs-label");
    const fsBtn = drawer.querySelector("#bbe-drawer-fs-btn");
    if (fsIcon && fsLabel) {
      if (isDrawerFullscreen) {
        fsIcon.innerHTML = BBE_ICONS.minimize(13);
        fsLabel.textContent = "Exit";
        if (fsBtn) fsBtn.title = "Exit Fullscreen (Esc)";
      } else {
        fsIcon.innerHTML = BBE_ICONS.expand(13);
        fsLabel.textContent = "Fullscreen";
        if (fsBtn) fsBtn.title = "Toggle Fullscreen View";
      }
    }
  }

  function ensureDrawerElements() {
    let backdrop = document.getElementById("bbe-drawer-backdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "bbe-drawer-backdrop";
      backdrop.addEventListener("click", () => closeCommentaryDrawer());
      document.body.appendChild(backdrop);
    }

    let drawer = document.getElementById("bbe-drawer");
    if (!drawer) {
      drawer = document.createElement("div");
      drawer.id = "bbe-drawer";
      drawer.lang = "en";
      drawer.innerHTML = `
        <div class="bbe-drawer-resizer" id="bbe-drawer-resizer" title="Drag up or down to resize (double-click to reset)">
          <span class="bbe-drawer-resizer-pill"></span>
        </div>
        <div class="bbe-drawer-header">
          <div class="bbe-drawer-title-group">
            <div class="bbe-drawer-ref" id="bbe-drawer-ref">Scripture Commentary</div>
            <span class="bbe-drawer-badge">Commentary</span>
            <div class="bbe-drawer-stepper" id="bbe-drawer-stepper">
              <button type="button" class="bbe-stepper-btn" id="bbe-stepper-prev" title="Previous verse">‹</button>
              <span class="bbe-stepper-text" id="bbe-stepper-label">v. 1</span>
              <button type="button" class="bbe-stepper-btn" id="bbe-stepper-next" title="Next verse">›</button>
            </div>
          </div>
          <div class="bbe-drawer-actions">
            <button type="button" class="bbe-drawer-tool-btn" id="bbe-drawer-copy-btn" title="Copy active verse text">
              ${BBE_ICONS.copy(13)}
              <span id="bbe-drawer-copy-label">Copy</span>
            </button>
            <button type="button" class="bbe-drawer-tool-btn" id="bbe-drawer-dock-btn" title="Dock at Bottom (Logos Bible style)">
              <span id="bbe-drawer-dock-icon" style="display:inline-flex;align-items:center;">${BBE_ICONS.dockBottom(13)}</span>
              <span id="bbe-drawer-dock-label">Bottom</span>
            </button>
            <button type="button" class="bbe-drawer-tool-btn" id="bbe-drawer-fs-btn" title="Toggle Fullscreen">
              <span id="bbe-drawer-fs-icon" style="display:inline-flex;align-items:center;">${BBE_ICONS.expand(13)}</span>
              <span id="bbe-drawer-fs-label">Fullscreen</span>
            </button>
            <a href="#" target="_blank" rel="noopener" class="bbe-drawer-link" id="bbe-drawer-hublink">BibleHub ↗</a>
            <button type="button" class="bbe-drawer-close" id="bbe-drawer-close" title="Close (Esc)">✕</button>
          </div>
        </div>
        <div class="bbe-drawer-tabs">
          <button type="button" class="bbe-drawer-tab" id="bbe-tab-commentary">${BBE_ICONS.book(13)}<span>Commentary</span></button>
          <button type="button" class="bbe-drawer-tab" id="bbe-tab-crossref">${BBE_ICONS.link(13)}<span>Cross-References (TSK)</span></button>
          <button type="button" class="bbe-drawer-tab" id="bbe-tab-wordstudy">${BBE_ICONS.lexicon(13)}<span>Word Study</span></button>
        </div>
        <div class="bbe-drawer-verse-preview" id="bbe-drawer-preview"></div>
        <div class="bbe-drawer-chips" id="bbe-drawer-chips"></div>
        <div class="bbe-drawer-body" id="bbe-drawer-body"></div>
        <div class="bbe-drawer-crossref" id="bbe-drawer-crossref" style="display:none;"></div>
        <div class="bbe-drawer-wordstudy" id="bbe-drawer-wordstudy" style="display:none;"></div>
      `;
      document.body.appendChild(drawer);

      applyDrawerDockClasses(drawer);

      // Drag handle at top of bottom-docked panel (Logos / Accordance split resize)
      const resizerEl = drawer.querySelector("#bbe-drawer-resizer");
      if (resizerEl) {
        resizerEl.addEventListener("pointerdown", (e) => {
          if (e.button !== 0 && e.pointerType === "mouse") return;
          if (!drawer.classList.contains("bbe-dock-bottom") || isDrawerFullscreen) return;
          e.preventDefault();
          isResizingDrawer = true;
          drawerResizeStartY = e.clientY;
          drawerResizeStartH = drawer.getBoundingClientRect().height;
          drawer.classList.add("bbe-resizing");
          document.body.style.cursor = "ns-resize";
        });

        resizerEl.addEventListener("dblclick", async () => {
          if (!drawer.classList.contains("bbe-dock-bottom") || isDrawerFullscreen) return;
          S.commentaryBottomHeight = null;
          drawer.style.removeProperty("--bbe-bottom-height");
          syncDrawerBottomClearance();
          await bbeSave({ commentaryBottomHeight: null });
          showToast("Reset study panel height", { icon: "reset" });
        });
      }

      window.addEventListener("pointermove", (e) => {
        if (!isResizingDrawer) return;
        const nextH = clampBottomDrawerHeight(drawerResizeStartH + (drawerResizeStartY - e.clientY));
        drawer.style.setProperty("--bbe-bottom-height", `${nextH}px`);
        if (isBottomDrawerActive()) {
          const prevClearance = currentDrawerClearancePx;
          const nextClearance = getRequiredBottomClearancePx(nextH);
          setDrawerClearancePx(nextClearance);
          // If the user is at the bottom of the chapter and drags the drawer taller over the final lines,
          // keep the final lines riding cleanly above the top edge of the drawer.
          if (nextClearance > prevClearance) {
            const chapterRect = getActiveScriptureBounds();
            const viewportH = window.innerHeight || document.documentElement.clientHeight || 800;
            const safeBottom = viewportH - nextH - 80;
            if (chapterRect && window.scrollY > 10 && chapterRect.bottom > safeBottom && chapterRect.bottom <= viewportH + 40) {
              window.scrollBy(0, Math.min(nextClearance - prevClearance, Math.round(chapterRect.bottom - safeBottom)));
            }
          }
        }
      });

      const finishDrawerResize = async () => {
        if (!isResizingDrawer) return;
        isResizingDrawer = false;
        drawer.classList.remove("bbe-resizing");
        document.body.style.cursor = "";
        const finalH = clampBottomDrawerHeight(drawer.getBoundingClientRect().height);
        S.commentaryBottomHeight = finalH;
        await bbeSave({ commentaryBottomHeight: finalH });
      };
      window.addEventListener("pointerup", finishDrawerResize);
      window.addEventListener("pointercancel", finishDrawerResize);

      drawer.querySelector("#bbe-tab-commentary").addEventListener("click", () => {
        switchStudyTab("commentary");
      });

      drawer.querySelector("#bbe-tab-crossref").addEventListener("click", () => {
        switchStudyTab("crossref");
      });

      drawer.querySelector("#bbe-tab-wordstudy").addEventListener("click", () => {
        switchStudyTab("wordstudy");
      });

      drawer.querySelector("#bbe-drawer-copy-btn")?.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const v = currentDrawerPassage.verse || 1;
        const btn = drawer.querySelector("#bbe-drawer-copy-btn");
        await copySingleVerse(v, btn);
      });

      drawer.querySelector("#bbe-drawer-dock-btn").addEventListener("click", async () => {
        const currentDock = S.commentaryDock || "bottom";
        const newDock = (currentDock === "bottom") ? "right" : "bottom";
        const naturalMaxScrollY = getPreClearanceNaturalMaxScrollY();
        const wasAtBottomOfPage = (naturalMaxScrollY > 0 && window.scrollY >= naturalMaxScrollY - 48);
        S.commentaryDock = newDock;
        applyDrawerDockClasses(drawer);
        if (newDock === "bottom" && !isDrawerFullscreen) {
          glideScriptureAboveBottomDrawer(currentDrawerPassage.book, currentDrawerPassage.chapter, currentDrawerPassage.verse, {
            wasAtBottomOfPage,
            explicitVerse: false
          });
        }
        await bbeSave({ commentaryDock: newDock });
      });

      drawer.querySelector("#bbe-drawer-fs-btn").addEventListener("click", () => {
        const naturalMaxScrollY = getPreClearanceNaturalMaxScrollY();
        const wasAtBottomOfPage = (naturalMaxScrollY > 0 && window.scrollY >= naturalMaxScrollY - 48);
        isDrawerFullscreen = !isDrawerFullscreen;
        applyDrawerDockClasses(drawer);
        if (!isDrawerFullscreen && (S.commentaryDock || "bottom") === "bottom") {
          glideScriptureAboveBottomDrawer(currentDrawerPassage.book, currentDrawerPassage.chapter, currentDrawerPassage.verse, {
            wasAtBottomOfPage,
            explicitVerse: false
          });
        }
      });

      drawer.querySelector("#bbe-drawer-close").addEventListener("click", () => closeCommentaryDrawer());
      drawer.querySelector("#bbe-stepper-prev").addEventListener("click", () => {
        const v = Math.max(1, (currentDrawerPassage.verse || 1) - 1);
        openCommentaryDrawer(currentDrawerPassage.book, currentDrawerPassage.chapter, v, null, null, { explicitVerse: true, isStepper: true });
      });
      drawer.querySelector("#bbe-stepper-next").addEventListener("click", () => {
        const v = (currentDrawerPassage.verse || 1) + 1;
        openCommentaryDrawer(currentDrawerPassage.book, currentDrawerPassage.chapter, v, null, null, { explicitVerse: true, isStepper: true });
      });

      // Grabable & Slideable chips with mouse drag + mousewheel
      const chipsEl = drawer.querySelector("#bbe-drawer-chips");
      chipsEl.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        isDraggingChips = true;
        chipsDidDrag = false;
        chipsStartX = e.pageX - chipsEl.offsetLeft;
        chipsScrollLeft = chipsEl.scrollLeft;
        chipsEl.classList.add("grabbing");
      });

      window.addEventListener("mouseup", () => {
        if (isDraggingChips) {
          isDraggingChips = false;
          chipsEl.classList.remove("grabbing");
          setTimeout(() => { chipsDidDrag = false; }, 60);
        }
      });

      chipsEl.addEventListener("mousemove", (e) => {
        if (!isDraggingChips) return;
        e.preventDefault();
        const x = e.pageX - chipsEl.offsetLeft;
        const walk = (x - chipsStartX) * 1.5;
        if (Math.abs(walk) > 4) {
          chipsDidDrag = true;
        }
        chipsEl.scrollLeft = chipsScrollLeft - walk;
      });

      chipsEl.addEventListener("wheel", (e) => {
        if (e.deltaY !== 0) {
          e.preventDefault();
          chipsEl.scrollLeft += e.deltaY;
        }
      }, { passive: false });
    }
    return { backdrop, drawer };
  }

  function closeCommentaryDrawer() {
    isDrawerOpen = false;
    isDrawerFullscreen = false;
    releaseDrawerBottomClearanceHoldPosition();
    const drawer = document.getElementById("bbe-drawer");
    if (drawer) {
      drawer.classList.remove("open");
      drawer.classList.remove("bbe-fullscreen");
    }
    document.getElementById("bbe-drawer-backdrop")?.classList.remove("open");
    const p = bbeParsePath(location.pathname, getAllVersions());
    if (p) renderToolbar(p);
  }

  function getVerseTextFromDom(verseNum) {
    const chapterEl = getChapterEl();
    if (!chapterEl) return "";

    const cleanVerseClone = (clone) => {
      if (!S.copyIncludeVerseNumbers) {
        clone.querySelectorAll('[class*="_label"], [class*="_verse-number"]').forEach(e => e.remove());
      }
      if (!S.copyIncludeHeadings) {
        clone.querySelectorAll('[class*="_heading"], h1, h2, h3, h4, [class*="_title"]').forEach(e => e.remove());
      }
      clone.querySelectorAll('.bbe-verse-badge, .bbe-verse-actions-wrap, [class*="_note"], sup, .ref, [class*="_ref"], [class*="_footnote"], .bbe-has-note').forEach(e => e.remove());
    };

    // 1. Precise lookup by [data-usfm$=".verseNum"] (supports split verse spans)
    const verseElements = Array.from(chapterEl.querySelectorAll(`[class*="_verse"][data-usfm$=".${verseNum}"]`));
    if (verseElements.length > 0) {
      const parts = [];
      for (const el of verseElements) {
        const clone = el.cloneNode(true);
        cleanVerseClone(clone);
        const t = clone.textContent.replace(/\s+/g, " ").trim();
        if (t) parts.push(t);
      }
      if (parts.length > 0) return parts.join(" ");
    }

    // 2. Fallback: label match
    const labels = chapterEl.querySelectorAll('[class*="_label"]');
    for (const label of labels) {
      const vText = label.textContent.trim();
      const num = parseInt(vText, 10);
      if (num === Number(verseNum)) {
        const verseEl = label.closest('[class*="_verse"]') || label.parentElement;
        if (verseEl) {
          const clone = verseEl.cloneNode(true);
          cleanVerseClone(clone);
          return clone.textContent.replace(/\s+/g, " ").trim();
        }
      }
    }
    return "";
  }

  /* ---------------- Smart Verse Copy & Clean Text ---------------- */
  async function copyTextToClipboard(text) {
    if (!text) return false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {
      // fallback
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "-9999px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const res = document.execCommand("copy");
      ta.remove();
      return res;
    } catch (err) {
      return false;
    }
  }

  function formatVerseCopy(text, bookCode, chapter, verseStart, verseEnd, versionAbbr) {
    const clean = (text || "").replace(/\s+/g, " ").trim();
    const includeRef = S.copyIncludeReference === true;
    if (!includeRef) return clean;

    const bookName = BBE_BOOK_NAMES[bookCode] || bookCode || "Scripture";
    const verseStr = (verseStart === verseEnd || !verseEnd) ? `${verseStart}` : `${verseStart}-${verseEnd}`;
    const ver = (S.copyIncludeVersion === true && versionAbbr) ? versionAbbr.toUpperCase() : "";
    const cite = ver ? `${bookName} ${chapter}:${verseStr} (${ver})` : `${bookName} ${chapter}:${verseStr}`;
    return `${clean} — ${cite}`;
  }

  async function copySingleVerse(verseNum, buttonEl) {
    const p = bbeParsePath(location.pathname, getAllVersions());
    if (!p) return;
    const text = getVerseTextFromDom(verseNum);
    if (!text) {
      showToast(`Could not read verse ${verseNum}`, { icon: "warn" });
      return;
    }
    const formatted = formatVerseCopy(text, p.book, p.chapter, verseNum, verseNum, p.versionName || p.abbr);
    const success = await copyTextToClipboard(formatted);
    if (success) {
      const bookName = BBE_BOOK_NAMES[p.book] || p.book;
      showToast(`Copied ${bookName} ${p.chapter}:${verseNum}`, { icon: "copy" });

      if (buttonEl) {
        buttonEl.classList.add("bbe-copied");
        const origSvg = buttonEl.innerHTML;
        buttonEl.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        setTimeout(() => {
          buttonEl.classList.remove("bbe-copied");
          buttonEl.innerHTML = origSvg;
        }, 1200);
      }
    } else {
      showToast("Could not copy to clipboard", { icon: "warn" });
    }
  }

  const YOUVERSION_HIGHLIGHT_COLORS = [
    { id: "fffe00", name: "Yellow", hex: "#fdefc5" },
    { id: "5dff79", name: "Green", hex: "#d9e9ce" },
    { id: "00d6ff", name: "Blue", hex: "#baddff" },
    { id: "ffc66f", name: "Orange", hex: "#fcd7b6" },
    { id: "ff95ef", name: "Pink", hex: "#f5c8d6" }
  ];

  let cachedSignedInStatus = null;

  function bbeEscapeHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function isUserSignedIn() {
    // 1. Definite logged-out marker
    if (document.querySelector('[data-testid="blankAvatar"]')) return false;

    // 2. Definite logged-in markers
    if (document.querySelector('img[src*="user-avatars"]') || document.querySelector('img[src*="youversion-user-avatars"]')) return true;
    const userLink = document.querySelector('a[href*="/users/"]');
    if (userLink && !userLink.href.includes('/users/sign-in')) return true;
    if (window.__NEXT_DATA__?.props?.pageProps?.user) return true;
    if (document.cookie.includes('token=')) return true;

    // 3. Cached status from bridge if available
    if (cachedSignedInStatus !== null) return cachedSignedInStatus;
    return false;
  }

  let tempHlBannerEl = null;
  let tempHlBannerTimer = null;

  function showTemporaryHighlightBanner(refLabel) {
    if (!tempHlBannerEl) {
      tempHlBannerEl = document.createElement("div");
      tempHlBannerEl.id = "bbe-temp-hl-banner";
      document.body.appendChild(tempHlBannerEl);
    }

    const signInUrl = `https://www.bible.com/sign-in?from=${encodeURIComponent(location.pathname)}`;

    tempHlBannerEl.innerHTML = `
      <div class="bbe-temp-hl-content">
        <span class="bbe-temp-hl-icon" style="display:inline-flex;align-items:center;">${BBE_ICONS.warn(18)}</span>
        <div class="bbe-temp-hl-text">
          <strong class="bbe-temp-hl-title">Temporary Highlight (${bbeEscapeHtml(refLabel || 'Scripture')})</strong>
          <span class="bbe-temp-hl-desc">You are not logged in. This highlight is temporary and will disappear when the page is reloaded.</span>
        </div>
        <div class="bbe-temp-hl-actions">
          <a href="${signInUrl}" class="bbe-temp-hl-btn-login">Log In to Save</a>
          <button type="button" class="bbe-temp-hl-close" title="Dismiss" aria-label="Dismiss">✕</button>
        </div>
      </div>
    `;

    tempHlBannerEl.querySelector(".bbe-temp-hl-close").addEventListener("click", () => {
      tempHlBannerEl.classList.remove("show");
    });

    tempHlBannerEl.classList.add("show");
    clearTimeout(tempHlBannerTimer);
    tempHlBannerTimer = setTimeout(() => {
      tempHlBannerEl.classList.remove("show");
    }, 8500);
  }

  let signInModalEl = null;

  function showSignInRequiredModal(refLabel) {
    if (!signInModalEl) {
      signInModalEl = document.createElement("div");
      signInModalEl.id = "bbe-signin-required-modal";
      document.body.appendChild(signInModalEl);
    }

    const signInUrl = `https://www.bible.com/sign-in?from=${encodeURIComponent(location.pathname)}`;

    signInModalEl.innerHTML = `
      <div class="bbe-signin-modal-backdrop"></div>
      <div class="bbe-signin-modal-card">
        <div class="bbe-signin-modal-header">
          <div class="bbe-signin-modal-badge" style="display:inline-flex;align-items:center;gap:5px;">${BBE_ICONS.lock(13)}<span>Sign-in Required</span></div>
          <button type="button" class="bbe-signin-modal-close" aria-label="Close">✕</button>
        </div>
        <div class="bbe-signin-modal-body">
          <h3 class="bbe-signin-modal-title">Log in to save personal notes</h3>
          <p class="bbe-signin-modal-ref">${bbeEscapeHtml(refLabel || 'Selected Scripture')}</p>
          <p class="bbe-signin-modal-desc">
            Personal notes are saved directly to your YouVersion / Bible.com cloud account so they stay preserved forever and sync across all your devices and the mobile Bible App.
          </p>
          <p class="bbe-signin-modal-notice">
            Notes cannot be taken without being logged in. Please sign in or create an account to write and save notes.
          </p>
        </div>
        <div class="bbe-signin-modal-footer">
          <button type="button" class="bbe-signin-modal-cancel">Cancel</button>
          <a href="${signInUrl}" class="bbe-signin-modal-login-btn">Sign In to Bible.com</a>
        </div>
      </div>
    `;

    const close = () => signInModalEl.classList.remove("open");
    signInModalEl.querySelector(".bbe-signin-modal-close").addEventListener("click", close);
    signInModalEl.querySelector(".bbe-signin-modal-cancel").addEventListener("click", close);
    signInModalEl.querySelector(".bbe-signin-modal-backdrop").addEventListener("click", close);

    signInModalEl.classList.add("open");
  }

  // Listen for bridge auth updates and warnings
  window.addEventListener("BBE_AUTH_WARNING", (e) => {
    const detail = e.detail || {};
    if (detail.action === "highlight") {
      showTemporaryHighlightBanner(detail.refLabel || "Scripture");
    }
  });

  window.addEventListener("BBE_AUTH_INFO", (e) => {
    if (typeof e.detail?.signedIn === "boolean") {
      cachedSignedInStatus = e.detail.signedIn;
    }
  });

  // Query bridge for auth status on startup
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent("BBE_CMD_GET_AUTH"));
  }, 400);

  // ---- Direct Bible.com Cloud Highlight Sync & Per-Version Painting ----
  const BBE_HL_BG = { fffe00: "#fdefc5", fef100: "#fdefc5", "5dff79": "#d9e9ce", "00d6ff": "#baddff", ffc66f: "#fcd7b6", ff95ef: "#f5c8d6" };
  let currentChapterHighlights = [];

  window.addEventListener("BBE_HIGHLIGHTS_SYNC", (e) => {
    const list = e.detail?.highlights;
    if (Array.isArray(list)) {
      currentChapterHighlights = list;
    }
  });

  function bbePaintHighlightsInScope(scopeEl, highlights) {
    if (!scopeEl) return;
    // Clear existing painted highlights in scope
    scopeEl.querySelectorAll("[data-bbe-temp-hl], [data-usfm][style], [data-usfm] [style]").forEach((el) => {
      if (el.hasAttribute("data-bbe-temp-hl") || (el.getAttribute("style") || "").includes("background-color")) {
        el.style.backgroundColor = "";
        el.removeAttribute("data-bbe-temp-hl");
      }
    });
    if (!Array.isArray(highlights) || !highlights.length) return;
    const byNum = {};
    highlights.forEach((h) => {
      if (!h || !h.usfm || !h.color) return;
      const cid = h.color === "fef100" ? "fffe00" : h.color;
      if (!BBE_HL_BG[cid]) return;
      extractUsfmVerseNums(h.usfm).forEach((n) => { byNum[n] = cid; });
    });
    scopeEl.querySelectorAll("[data-usfm]").forEach((vEl) => {
      const val = vEl.getAttribute("data-usfm") || "";
      if (val.split(".").length < 3) return;
      const nums = extractUsfmVerseNums(val);
      const id = nums.map((n) => byNum[n]).find(Boolean);
      if (!id) return;
      let contentEls = Array.from(vEl.querySelectorAll('.content, [class*="_content"]'));
      contentEls = contentEls.filter((c) => !contentEls.some((o) => o !== c && o.contains(c)));
      (contentEls.length ? contentEls : [vEl]).forEach((t) => {
        t.style.backgroundColor = BBE_HL_BG[id];
        t.setAttribute("data-bbe-temp-hl", id);
      });
    });
  }

  function fetchCloudHighlightsForChapter(chapterUsfm, versionId, applyToMainDom = false, opts = {}) {
    return new Promise((resolve) => {
      const reqId = "hl_fetch_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      let resolved = false;
      const onDone = (e) => {
        if (resolved || e.detail?.reqId !== reqId) return;
        resolved = true;
        window.removeEventListener("BBE_CMD_FETCH_HIGHLIGHTS_DONE", onDone);
        resolve(e.detail?.highlights || []);
      };
      window.addEventListener("BBE_CMD_FETCH_HIGHLIGHTS_DONE", onDone);
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          window.removeEventListener("BBE_CMD_FETCH_HIGHLIGHTS_DONE", onDone);
          resolve([]);
        }
      }, 4500);
      window.dispatchEvent(new CustomEvent("BBE_CMD_FETCH_HIGHLIGHTS", {
        detail: { reqId, chapterUsfm, versionId, applyToMainDom, isPrefetch: !!opts.isPrefetch }
      }));
    });
  }

  function batchSaveCloudHighlights(items, versionIds) {
    return new Promise((resolve) => {
      const reqId = "hl_batch_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      let resolved = false;
      const onDone = (e) => {
        if (resolved || e.detail?.reqId !== reqId) return;
        resolved = true;
        window.removeEventListener("BBE_CMD_BATCH_HIGHLIGHT_DONE", onDone);
        resolve(e.detail || { success: true });
      };
      window.addEventListener("BBE_CMD_BATCH_HIGHLIGHT_DONE", onDone);
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          window.removeEventListener("BBE_CMD_BATCH_HIGHLIGHT_DONE", onDone);
          resolve({ success: false, error: "Timed out syncing to Bible.com" });
        }
      }, 6000);
      window.dispatchEvent(new CustomEvent("BBE_CMD_BATCH_HIGHLIGHT", {
        detail: { reqId, items, versionIds }
      }));
    });
  }

  // Reflect a highlight change in every compare column immediately
  function bbeSyncCompareHighlights(usfms, colorId) {
    const cols = document.querySelectorAll("#bbe-compare-grid .bbe-compare-col .bbe-compare-body");
    if (!cols.length) return;
    const nums = new Set((usfms || []).map((u) => parseInt(u.split(".").pop(), 10)));
    const cid = colorId === "fef100" ? "fffe00" : colorId;
    cols.forEach((col) => {
      col.querySelectorAll("[data-usfm]").forEach((vEl) => {
        const val = vEl.getAttribute("data-usfm") || "";
        if (val.split(".").length < 3) return;
        if (!extractUsfmVerseNums(val).some((n) => nums.has(n))) return;
        let contentEls = Array.from(vEl.querySelectorAll('.content, [class*="_content"]'));
        contentEls = contentEls.filter((c) => !contentEls.some((o) => o !== c && o.contains(c)));
        const targets = [vEl, ...(contentEls.length ? contentEls : [])];
        targets.forEach((t) => {
          if (cid && BBE_HL_BG[cid] && (t !== vEl || !contentEls.length)) {
            t.style.backgroundColor = BBE_HL_BG[cid];
            t.setAttribute("data-bbe-temp-hl", cid);
          } else if (!cid) {
            t.style.backgroundColor = "";
            t.removeAttribute("data-bbe-temp-hl");
          }
        });
      });
    });
  }

  function getActiveTargetVersionIds() {
    const allVers = getAllVersions();
    const p = bbeParsePath(location.pathname, allVers);
    if (S.compareOn) {
      const cmpVers = (S.compareVersions || ["NIV", "ESV"]).filter(k => allVers[k]);
      const ids = cmpVers.map(k => allVers[k]?.id).filter(Boolean);
      if (ids.length) return Array.from(new Set(ids));
    }
    return [p?.id || 59];
  }

  async function applyNativeHighlight(usfmArray, colorHex, explicitVersionIds = null) {
    if (!usfmArray || !usfmArray.length) return false;
    const cleanHex = colorHex ? colorHex.replace("#", "").toLowerCase() : null;
    const versionIds = Array.isArray(explicitVersionIds) && explicitVersionIds.length
      ? explicitVersionIds
      : getActiveTargetVersionIds();
    const reqId = "hl_cmd_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    return new Promise((resolve) => {
      let resolved = false;
      const onDone = (e) => {
        if (resolved || (e.detail?.reqId && e.detail.reqId !== reqId)) return;
        resolved = true;
        window.removeEventListener("BBE_CMD_HIGHLIGHT_DONE", onDone);
        resolve(e?.detail || { success: true });
      };
      window.addEventListener("BBE_CMD_HIGHLIGHT_DONE", onDone);
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          window.removeEventListener("BBE_CMD_HIGHLIGHT_DONE", onDone);
          resolve({ success: true, timedOut: true });
        }
      }, 4000);

      window.dispatchEvent(new CustomEvent("BBE_CMD_HIGHLIGHT", {
        detail: { reqId, usfms: usfmArray, color: cleanHex, versionIds }
      }));
    });
  }

  function saveNativeNote(usfmArray, content, versionId) {
    if (!usfmArray || !usfmArray.length || !content) {
      return { success: false, error: "Missing verse or content" };
    }
    return new Promise((resolve) => {
      let resolved = false;
      const onDone = (e) => {
        if (resolved) return;
        resolved = true;
        window.removeEventListener("BBE_CMD_NOTE_DONE", onDone);
        resolve(e.detail || { success: false });
      };
      window.addEventListener("BBE_CMD_NOTE_DONE", onDone);
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          window.removeEventListener("BBE_CMD_NOTE_DONE", onDone);
          resolve({ success: false, error: "Timed out waiting for YouVersion cloud" });
        }
      }, 7000);

      window.dispatchEvent(new CustomEvent("BBE_CMD_SAVE_NOTE", {
        detail: { usfms: usfmArray, content, versionId }
      }));
    });
  }

  let noteModalEl = null;
  function ensureYouVersionNoteModal() {
    if (noteModalEl && document.body.contains(noteModalEl)) return noteModalEl;
    noteModalEl = document.createElement("div");
    noteModalEl.id = "bbe-youversion-note-modal";
    noteModalEl.className = "bbe-note-modal-overlay";
    noteModalEl.innerHTML = `
      <div class="bbe-note-modal-card" role="dialog" aria-modal="true" aria-labelledby="bbe-note-modal-title">
        <div class="bbe-note-modal-header">
          <div class="bbe-note-modal-title-wrap">
            <span class="bbe-note-modal-icon" style="display:inline-flex;align-items:center;justify-content:center;">${BBE_ICONS.note(18)}</span>
            <div>
              <h3 id="bbe-note-modal-title" class="bbe-note-modal-title">YouVersion Cloud Note</h3>
              <p class="bbe-note-modal-sub">
                <span class="bbe-note-modal-ref"></span>
                <span class="bbe-note-modal-account"></span>
              </p>
            </div>
          </div>
          <button type="button" class="bbe-note-modal-close" aria-label="Close note dialog">✕</button>
        </div>
        <div class="bbe-note-modal-body">
          <textarea class="bbe-note-modal-textarea" rows="4" placeholder="Write your personal study reflection here... (Saved directly to your YouVersion account)"></textarea>
          <div class="bbe-note-modal-cloud-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>
            <span>Stored 100% on Bible.com cloud servers. Tied to your YouVersion account &amp; synced across your Bible apps.</span>
          </div>
        </div>
        <div class="bbe-note-modal-footer">
          <button type="button" class="bbe-note-btn bbe-note-btn-cancel">Cancel</button>
          <button type="button" class="bbe-note-btn bbe-note-btn-save">
            <span class="bbe-note-save-icon" style="display:inline-flex;align-items:center;">${BBE_ICONS.cloud(14)}</span>
            <span class="bbe-note-save-text">Save to YouVersion</span>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(noteModalEl);

    const closeBtn = noteModalEl.querySelector(".bbe-note-modal-close");
    const cancelBtn = noteModalEl.querySelector(".bbe-note-btn-cancel");
    const hideModal = () => {
      noteModalEl.classList.remove("open");
    };

    closeBtn.addEventListener("click", hideModal);
    cancelBtn.addEventListener("click", hideModal);
    noteModalEl.addEventListener("click", (e) => {
      if (e.target === noteModalEl) hideModal();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && noteModalEl && noteModalEl.classList.contains("open")) {
        hideModal();
      }
    });

    return noteModalEl;
  }

  function triggerYouVersionNote(usfmArray, refLabel, p) {
    if (!usfmArray || !usfmArray.length) return;

    // Check signed in status
    if (!isUserSignedIn()) {
      showSignInRequiredModal(refLabel);
      return;
    }

    const userLink = document.querySelector('a[href*="/users/"]');
    const match = userLink ? userLink.getAttribute('href').match(/\/users\/([^/?#]+)/) : null;
    const username = match ? match[1] : (window.__NEXT_DATA__?.props?.pageProps?.user?.username || null);

    const modal = ensureYouVersionNoteModal();
    const refEl = modal.querySelector(".bbe-note-modal-ref");
    const acctEl = modal.querySelector(".bbe-note-modal-account");
    const textarea = modal.querySelector(".bbe-note-modal-textarea");
    const saveBtn = modal.querySelector(".bbe-note-btn-save");

    refEl.textContent = refLabel || "Selected Scripture";
    acctEl.textContent = username ? `• @${username}` : "• Cloud Account";
    textarea.value = "";

    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

    const activeSaveText = newSaveBtn.querySelector(".bbe-note-save-text");
    const activeSaveIcon = newSaveBtn.querySelector(".bbe-note-save-icon");
    activeSaveText.textContent = "Save to YouVersion";
    activeSaveIcon.innerHTML = BBE_ICONS.cloud(14);
    newSaveBtn.disabled = false;

    newSaveBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const text = textarea.value.trim();
      if (!text) {
        showToast("Please enter a note before saving.", { duration: 2500, icon: "warn" });
        textarea.focus();
        return;
      }

      newSaveBtn.disabled = true;
      activeSaveIcon.innerHTML = BBE_ICONS.spinner(14);
      activeSaveText.textContent = "Saving to YouVersion...";

      const res = await saveNativeNote(usfmArray, text, p?.id || 59);
      if (res && res.success) {
        modal.classList.remove("open");
        showToast(`Note saved directly to your YouVersion account! (${refLabel})`, { duration: 4000, icon: "check" });
      } else {
        newSaveBtn.disabled = false;
        activeSaveIcon.innerHTML = BBE_ICONS.cloud(14);
        activeSaveText.textContent = "Save to YouVersion";
        showToast(`Failed to save to YouVersion: ${res?.error || "Unknown error"}`, { duration: 4500, icon: "error" });
      }
    });

    modal.classList.add("open");
    setTimeout(() => textarea.focus(), 80);
  }

  let selectionBarEl = null;

  function ensureSelectionBar() {
    if (selectionBarEl) return selectionBarEl;
    selectionBarEl = document.createElement("div");
    selectionBarEl.id = "bbe-selection-copy-bar";
    selectionBarEl.className = "bbe-selection-copy-bar";
    document.body.appendChild(selectionBarEl);
    return selectionBarEl;
  }

  function handlePassageSelection() {
    if (!S.enabled || html.classList.contains("bbe-sermon-drawing")) {
      if (selectionBarEl) selectionBarEl.classList.remove("show");
      return;
    }

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      if (selectionBarEl) selectionBarEl.classList.remove("show");
      return;
    }

    const chapterEl = (() => {
      // Selections made inside a compare column (columns layout) count as selections of the chapter
      const s0 = window.getSelection();
      const anchor = s0 && s0.rangeCount ? s0.getRangeAt(0).commonAncestorContainer : null;
      const node = anchor && (anchor.nodeType === 1 ? anchor : anchor.parentElement);
      const col = node && node.closest ? node.closest("#bbe-compare-grid .bbe-compare-col .bbe-compare-body") : null;
      return col || getChapterEl();
    })();
    if (!chapterEl) {
      if (selectionBarEl) selectionBarEl.classList.remove("show");
      return;
    }

    const range = sel.getRangeAt(0);

    if (!chapterEl.contains(range.commonAncestorContainer)) {
      if (selectionBarEl) selectionBarEl.classList.remove("show");
      return;
    }

    const frag = range.cloneContents();
    const tempDiv = document.createElement("div");
    tempDiv.appendChild(frag);
    tempDiv.querySelectorAll('.bbe-verse-badge, .bbe-verse-actions-wrap, [class*="_note"], sup, .ref, [class*="_ref"], [class*="_footnote"], .bbe-has-note').forEach(el => el.remove());

    const cleanText = tempDiv.textContent.replace(/\s+/g, " ").trim();
    if (cleanText.length < 3) {
      if (selectionBarEl) selectionBarEl.classList.remove("show");
      return;
    }

    const p = bbeParsePath(location.pathname, getAllVersions());
    if (!p) return;

    const allVerses = getChapterVerseEls(chapterEl);
    const matched = [];
    const prefix = `${p.book}.${p.chapter}.`;

    for (const v of allVerses) {
      if (!range.intersectsNode(v)) continue;
      // intersectsNode is true even when the range merely touches the node's edge,
      // which over-selects the neighbouring verse. Require real selected text.
      try {
        const ir = document.createRange();
        ir.selectNodeContents(v);
        if (range.compareBoundaryPoints(Range.START_TO_START, ir) > 0) ir.setStart(range.startContainer, range.startOffset);
        if (range.compareBoundaryPoints(Range.END_TO_END, ir) < 0) ir.setEnd(range.endContainer, range.endOffset);
        const t = ir.cloneContents();
        const tmp = document.createElement("div");
        tmp.appendChild(t);
        tmp.querySelectorAll('.bbe-verse-badge, .bbe-verse-actions-wrap, [class*="_label"], [class*="_note"], sup, .ref, [class*="_ref"], [class*="_footnote"]').forEach(el => el.remove());
        if (!tmp.textContent.trim()) continue;
      } catch (err) { /* fall through and trust intersectsNode */ }
      const usfm = v.getAttribute("data-usfm") || "";
      if (usfm.startsWith(prefix)) {
        for (const num of extractUsfmVerseNums(usfm)) {
          if (!matched.includes(num)) matched.push(num);
        }
      }
    }
    matched.sort((a, b) => a - b);

    let vStart = matched.length > 0 ? matched[0] : 1;
    let vEnd = matched.length > 0 ? matched[matched.length - 1] : vStart;

    const bookName = BBE_BOOK_NAMES[p.book] || p.book;
    const rangeStr = (vStart === vEnd) ? `${vStart}` : `${vStart}-${vEnd}`;
    const refLabel = `${bookName} ${p.chapter}:${rangeStr}`;

    const usfmList = [];
    for (let i = vStart; i <= vEnd; i++) {
      usfmList.push(`${p.book}.${p.chapter}.${i}`);
    }

    // Check if any selected verse is currently highlighted
    let isHighlighted = false;
    for (const usfm of usfmList) {
      const vEl = chapterEl.querySelector(`[data-usfm="${usfm}"]`);
      if (vEl) {
        const checkEls = [vEl, ...Array.from(vEl.querySelectorAll('*'))];
        const hasBg = checkEls.some(el => {
          const style = el.getAttribute('style') || '';
          return style.includes('background-color') && !style.includes('transparent') && !style.includes('rgba(0, 0, 0, 0)');
        });
        if (hasBg) {
          isHighlighted = true;
          break;
        }
      }
    }

    const signedIn = isUserSignedIn();
    const bar = ensureSelectionBar();
    bar.innerHTML = `
      <span class="bbe-sel-highlight-group">
        ${YOUVERSION_HIGHLIGHT_COLORS.map(c => `
          <button type="button" class="bbe-swatch-btn ${(S.defaultHighlightColor || 'fffe00') === c.id ? 'default' : ''}" data-color="${c.id}" style="background-color:${c.hex};" title="${signedIn ? `Highlight: ${c.name}` : `Temporary Highlight: ${c.name} (Disappears on reload unless signed in)`}"></button>
        `).join('')}
        ${isHighlighted ? `
          <button type="button" class="bbe-swatch-clear" title="Remove highlight">✕</button>
        ` : ''}
      </span>
      <span class="bbe-sel-sep"></span>
      <button type="button" class="bbe-sel-btn bbe-sel-note" title="${signedIn ? `Add personal note for ${refLabel} (Saved to your YouVersion account)` : `Log in required to take personal notes for ${refLabel}`}">
        <span class="bbe-sel-note-icon" style="display:inline-flex;align-items:center;">${signedIn ? BBE_ICONS.note(13) : BBE_ICONS.lock(13)}</span>
        <span>${signedIn ? 'Note' : 'Note (Log in)'}</span>
      </button>
    `;

    // Attach swatch click handlers
    bar.querySelectorAll(".bbe-swatch-btn").forEach(swBtn => {
      swBtn.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
      swBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const color = swBtn.dataset.color;
        const res = await applyNativeHighlight(usfmList, color);
        if (res && res.success === false) { bar.classList.remove("show"); showToast(`Not saved: ${res.error}`, 5000); return; }
        bar.classList.remove("show");
        bbeSyncCompareHighlights(usfmList, color);
        if (isUserSignedIn()) {
          showToast(`Highlighted ${refLabel}`);
        } else {
          showTemporaryHighlightBanner(refLabel);
        }
      });
    });

    // Attach clear highlight handler
    const clearHlBtn = bar.querySelector(".bbe-swatch-clear");
    if (clearHlBtn) {
      clearHlBtn.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
      clearHlBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const rm = await applyNativeHighlight(usfmList, null);
        bar.classList.remove("show");
        if (rm && rm.success === false) { showToast(`Not removed: ${rm.error}`, 5000); return; }
        bbeSyncCompareHighlights(usfmList, null);
        showToast(`Removed highlight on ${refLabel}`);
      });
    }

    // Attach note handler
    const selNoteBtn = bar.querySelector(".bbe-sel-note");
    if (selNoteBtn) {
      selNoteBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      selNoteBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        bar.classList.remove("show");
        triggerYouVersionNote(usfmList, refLabel, p);
      });
    }

    const rect = range.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    let top = rect.top + scrollTop - 42;
    if (rect.top < 50) {
      top = rect.bottom + scrollTop + 8;
    }
    let left = rect.left + scrollLeft + (rect.width / 2) - 100;
    if (left < 10) left = 10;
    if (left + 220 > window.innerWidth) left = window.innerWidth - 230;

    bar.style.top = `${top}px`;
    bar.style.left = `${left}px`;
    bar.classList.add("show");
  }

  document.addEventListener("mouseup", () => setTimeout(handlePassageSelection, 30));
  document.addEventListener("keyup", (e) => {
    if (e.shiftKey) setTimeout(handlePassageSelection, 30);
  });
  document.addEventListener("mousedown", (e) => {
    if (selectionBarEl && !selectionBarEl.contains(e.target)) {
      selectionBarEl.classList.remove("show");
    }
  });

  // Double-clicking a verse while the bottom-docked study bar is open switches the drawer to that verse
  document.addEventListener("dblclick", (e) => {
    if (!S.enabled || !isDrawerOpen || (S.commentaryDock || "bottom") !== "bottom" || isDrawerFullscreen) return;
    if (!e.target || !e.target.closest) return;
    if (e.target.closest("a, button, input, textarea, select, [contenteditable='true'], #bbe-drawer, #bbe-bar, #bbe-selection-copy-bar, #bbe-word-tooltip")) return;

    const chapterEl = getChapterEl();
    if (!chapterEl || !chapterEl.contains(e.target)) return;

    const verseEl = e.target.closest("[data-usfm]");
    if (!verseEl || !chapterEl.contains(verseEl)) return;

    const p = bbeParsePath(location.pathname, getAllVersions());
    if (!p) return;
    const prefix = `${p.book}.${p.chapter}.`;
    const usfm = verseEl.getAttribute("data-usfm") || "";
    if (!usfm.startsWith(prefix)) return;

    const vNum = parseInt(usfm.slice(prefix.length), 10);
    if (!isNaN(vNum) && vNum >= 1) {
      openCommentaryDrawer(p.book, p.chapter, vNum, null, null, { explicitVerse: true });
    }
  });

  // Intercept native Ctrl+C / Cmd+C on highlighted scripture text to strip footnotes and apply paste formatting
  document.addEventListener("copy", (e) => {
    if (!S.enabled || S.copyCleanSelection === false) return;

    // Do not intercept if copying from inputs, textareas, notes editor, or modals
    const active = document.activeElement;
    if (active) {
      const tag = active.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (active.isContentEditable || active.getAttribute("contenteditable") === "true") return;
      if (active.closest && active.closest("#bbe-drawer")) return;
    }

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;

    const chapterEl = getChapterEl();
    if (!chapterEl) return;

    const range = sel.getRangeAt(0);
    if (!chapterEl.contains(range.commonAncestorContainer) && !range.intersectsNode(chapterEl)) return;

    const frag = range.cloneContents();
    const tempDiv = document.createElement("div");
    tempDiv.appendChild(frag);

    if (!S.copyIncludeVerseNumbers) {
      tempDiv.querySelectorAll('[class*="_label"], [class*="_verse-number"]').forEach(el => el.remove());
    }
    if (!S.copyIncludeHeadings) {
      tempDiv.querySelectorAll('[class*="_heading"], h1, h2, h3, h4, [class*="_title"], [class*="_section-heading"]').forEach(el => el.remove());
    }
    tempDiv.querySelectorAll('.bbe-verse-badge, .bbe-verse-actions-wrap, [class*="_note"], sup, .ref, [class*="_ref"], [class*="_footnote"], .bbe-has-note').forEach(el => el.remove());

    const clean = tempDiv.textContent.replace(/\s+/g, " ").trim();
    if (!clean) return;

    let finalText = clean;
    const p = bbeParsePath(location.pathname, getAllVersions());

    if (S.copyIncludeReference && p) {
      const allVerses = getChapterVerseEls(chapterEl);
      const matched = [];
      for (const v of allVerses) {
        if (range.intersectsNode(v)) {
          const usfm = v.getAttribute("data-usfm") || "";
          const parts = usfm.split(".");
          const num = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(num) && !matched.includes(num)) matched.push(num);
        }
      }
      matched.sort((a, b) => a - b);
      const vStart = matched.length > 0 ? matched[0] : 1;
      const vEnd = matched.length > 0 ? matched[matched.length - 1] : vStart;
      finalText = formatVerseCopy(clean, p.book, p.chapter, vStart, vEnd, p.versionName || p.abbr);
    }

    if (e.clipboardData) {
      e.clipboardData.setData("text/plain", finalText);
      e.preventDefault();
      showToast("Copied clean scripture text", { icon: "copy" });
    }
  });

  function buildCommentaryChips(commentaries, containerEl, onSelect) {
    if (!containerEl) return;
    containerEl.replaceChildren();
    if (!commentaries || commentaries.length === 0) return;

    const seen = new Set();
    const authors = [{ key: "all", label: "All Commentaries" }];
    for (const c of commentaries) {
      if (!seen.has(c.key)) {
        seen.add(c.key);
        authors.push({ key: c.key, label: bbeGetCommentaryLabel(c.key, c.title) });
      }
    }

    if (activeAuthorFilter !== "all" && !seen.has(activeAuthorFilter)) {
      activeAuthorFilter = "all";
    }

    authors.forEach(a => {
      const chip = document.createElement("span");
      chip.className = "bbe-chip" + (a.key === activeAuthorFilter ? " active" : "");
      chip.textContent = a.label;
      chip.addEventListener("click", () => {
        if (chipsDidDrag) return;
        containerEl.querySelectorAll(".bbe-chip").forEach(p => p.classList.remove("active"));
        chip.classList.add("active");
        activeAuthorFilter = a.key;
        onSelect(a.key);
      });
      containerEl.appendChild(chip);
    });
  }

  function renderCommentaryItems(commentaries, filterKey, targetEl) {
    if (!targetEl) return;
    targetEl.replaceChildren();

    const filtered = filterKey === "all" ? commentaries : commentaries.filter(c => c.key === filterKey);
    if (!filtered || filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "bbe-comm-empty";
      empty.textContent = "No commentary notes found for this author filter.";
      targetEl.appendChild(empty);
      return;
    }

    filtered.forEach(item => {
      const card = document.createElement("div");
      card.className = "bbe-comm-card" + (item.isPericopeCard ? " bbe-comm-pericope-card" : "");

      const header = document.createElement("div");
      header.className = "bbe-comm-author";

      const titleWrap = document.createElement("div");
      titleWrap.className = "bbe-comm-title-wrap";

      const authorTitle = document.createElement("span");
      authorTitle.style.cssText = "display:inline-flex;align-items:center;gap:6px;";
      authorTitle.innerHTML = `${BBE_ICONS.book(13)}<span>${bbeEscapeHtml(item.title)}</span>`;
      titleWrap.appendChild(authorTitle);

      if (item.badge) {
        const badgeEl = document.createElement("span");
        badgeEl.className = "bbe-comm-badge";
        badgeEl.textContent = item.badge;
        titleWrap.appendChild(badgeEl);
      }
      header.appendChild(titleWrap);

      const actionsEl = document.createElement("div");
      actionsEl.className = "bbe-comm-header-actions";

      if (item.externalUrl) {
        const linkBtn = document.createElement("a");
        linkBtn.href = item.externalUrl;
        linkBtn.target = "_blank";
        linkBtn.rel = "noopener noreferrer";
        linkBtn.className = "bbe-comm-link-btn";
        const linkLabel = item.key === "the_gospel_coalition" ? "↗ TGC"
          : item.key === "david_guzik" ? "↗ Enduring Word"
          : item.key === "thomas_constable" ? "↗ Sonic Light"
          : item.key === "bob_utley" ? "↗ Free Bible Comm"
          : "↗ Source";
        linkBtn.textContent = linkLabel;
        linkBtn.title = "Open commentary source in new tab";
        actionsEl.appendChild(linkBtn);
      }

      const orderedKeys = bbeGetOrderedCommentarySources(S).map(s => s.key);
      if (item.key && orderedKeys[0] !== item.key) {
        const pinBtn = document.createElement("button");
        pinBtn.type = "button";
        pinBtn.className = "bbe-comm-copy-btn bbe-comm-subtle-btn";
        pinBtn.textContent = "↑ Top";
        pinBtn.title = "Display this commentary first";
        pinBtn.addEventListener("click", async () => {
          const patch = bbeBuildCommentaryOrderPatch("top", item.key, S);
          Object.assign(S, patch);
          await bbeSave(patch);
          refreshOpenCommentaryDrawer(false);
          showToast(`Pinned ${bbeGetCommentaryLabel(item.key, item.title)} to top`);
        });
        actionsEl.appendChild(pinBtn);
      }

      if (item.key && item.key !== "other") {
        const hideBtn = document.createElement("button");
        hideBtn.type = "button";
        hideBtn.className = "bbe-comm-copy-btn bbe-comm-subtle-btn";
        hideBtn.textContent = "Hide";
        hideBtn.title = "Hide this commentary source (re-enable anytime in Settings)";
        hideBtn.addEventListener("click", async () => {
          const patch = bbeBuildCommentaryTogglePatch(item.key, false, S);
          Object.assign(S, patch);
          await bbeSave(patch);
          refreshOpenCommentaryDrawer(false);
          showToast(`Hidden ${bbeGetCommentaryLabel(item.key, item.title)} (restore in Settings)`);
        });
        actionsEl.appendChild(hideBtn);
      }

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "bbe-comm-copy-btn";
      copyBtn.textContent = "Copy";
      copyBtn.title = "Copy note text";
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(`${item.title}\n\n${item.text}`).then(() => {
          copyBtn.textContent = "Copied!";
          setTimeout(() => { copyBtn.textContent = "Copy"; }, 1500);
        });
      });
      actionsEl.appendChild(copyBtn);
      header.appendChild(actionsEl);

      card.appendChild(header);

      if (item.heading) {
        const headingEl = document.createElement("div");
        headingEl.className = "bbe-comm-section-heading";
        headingEl.textContent = item.heading;
        card.appendChild(headingEl);
      }

      const textEl = document.createElement("div");
      textEl.className = "bbe-comm-text";
      textEl.textContent = item.text;
      card.appendChild(textEl);

      if (item.isPericopeCard && item.externalUrl) {
        const ctaBtn = document.createElement("a");
        ctaBtn.href = item.externalUrl;
        ctaBtn.target = "_blank";
        ctaBtn.rel = "noopener noreferrer";
        ctaBtn.className = "bbe-comm-cta-btn";
        ctaBtn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;">${BBE_ICONS.book(13)}<span>Read <b>"${bbeEscapeHtml(item.sectionTitle || 'Section')}"</b> on The Gospel Coalition</span></span> <span>↗</span>`;
        card.appendChild(ctaBtn);
      }

      targetEl.appendChild(card);
    });
  }

  function switchStudyTab(tab) {
    activeStudyTab = tab || "commentary";
    const drawer = document.getElementById("bbe-drawer");
    if (!drawer) return;

    const commTab = drawer.querySelector("#bbe-tab-commentary");
    const crossTab = drawer.querySelector("#bbe-tab-crossref");
    const wordTab = drawer.querySelector("#bbe-tab-wordstudy");
    const chipsEl = drawer.querySelector("#bbe-drawer-chips");
    const commBody = drawer.querySelector("#bbe-drawer-body");
    const crossBody = drawer.querySelector("#bbe-drawer-crossref");
    const wordBody = drawer.querySelector("#bbe-drawer-wordstudy");
    const badge = drawer.querySelector(".bbe-drawer-badge");
    const hubLink = drawer.querySelector("#bbe-drawer-hublink");

    const bookCode = currentDrawerPassage.book;
    const bookSlug = BBE_BH_BOOK_SLUGS[bookCode] || (bookCode ? bookCode.toLowerCase() : "romans");
    const ch = currentDrawerPassage.chapter;
    const v = currentDrawerPassage.verse;

    commTab?.classList.remove("active");
    crossTab?.classList.remove("active");
    wordTab?.classList.remove("active");
    if (chipsEl) chipsEl.style.display = "none";
    if (commBody) commBody.style.display = "none";
    if (crossBody) crossBody.style.display = "none";
    if (wordBody) wordBody.style.display = "none";

    if (activeStudyTab === "crossref") {
      crossTab?.classList.add("active");
      if (crossBody) crossBody.style.display = "flex";
      if (badge) badge.textContent = "TSK Cross-References";
      if (hubLink) hubLink.href = `https://biblehub.com/tsk/${bookSlug}/${ch}-${v}.htm`;
      fetchAndRenderCrossrefs(bookCode, ch, v);
    } else if (activeStudyTab === "wordstudy") {
      wordTab?.classList.add("active");
      if (wordBody) wordBody.style.display = "flex";
      if (badge) badge.textContent = "Strong's Lexicon & Interlinear";
      if (hubLink) hubLink.href = `https://biblehub.com/interlinear/${bookSlug}/${ch}-${v}.htm`;
      fetchAndRenderWordStudy(bookCode, ch, v, activeWordStudyIndex);
    } else {
      commTab?.classList.add("active");
      if (chipsEl) chipsEl.style.display = "";
      if (commBody) commBody.style.display = "";
      if (badge) badge.textContent = "Commentary";
      if (hubLink) hubLink.href = `https://biblehub.com/commentaries/${bookSlug}/${ch}-${v}.htm`;
      fetchAndRenderCommentary(bookCode, ch, v);
    }
  }

  function jumpToVerse(usfm, chapter, verseNum) {
    const curP = bbeParsePath(location.pathname, getAllVersions());
    const targetUSFM = (usfm || "ROM").toUpperCase();
    const targetCh = String(chapter || 1);
    const targetV = Number(verseNum) || 1;

    // Check if target is within the active chapter on page
    if (curP && curP.book === targetUSFM && String(curP.chapter) === targetCh) {
      const chapterEl = getChapterEl();
      if (chapterEl) {
        const labels = chapterEl.querySelectorAll('[class*="_label"]');
        for (const label of labels) {
          const num = parseInt(label.textContent.trim(), 10);
          if (num === targetV) {
            const verseEl = label.closest('[class*="_verse"]') || label.parentElement;
            if (verseEl) {
              if (isBottomDrawerActive()) {
                const r = verseEl.getBoundingClientRect();
                const topSafe = getTopSafeZone();
                const visibleBottom = (window.innerHeight || 800) - getBottomDrawerHeightPx();
                const targetCenter = topSafe + Math.max(80, (visibleBottom - topSafe) * 0.45);
                const verseCenter = r.top + (r.height / 2);
                animateDrawerScrollBy(verseCenter - targetCenter, 280);
              } else {
                verseEl.scrollIntoView({ behavior: "smooth", block: "center" });
              }
              verseEl.style.transition = "outline 0.2s, background-color 0.3s";
              verseEl.style.outline = "2px solid #2563eb";
              verseEl.style.backgroundColor = "rgba(37, 99, 235, 0.12)";
              setTimeout(() => {
                verseEl.style.outline = "";
                verseEl.style.backgroundColor = "";
              }, 2200);
              showToast(`Jumped to ${BBE_BOOK_NAMES[targetUSFM] || targetUSFM} ${targetCh}:${targetV}`, { icon: "zap" });
              return;
            }
          }
        }
      }
    }

    // Different chapter or book: navigate directly on Bible.com
    const verId = curP ? curP.id : 59;
    const verAbbr = curP ? curP.abbr : "ESV";
    const targetUrl = `/bible/${verId}/${targetUSFM}.${targetCh}.${verAbbr}#${targetUSFM}.${targetCh}.${targetV}`;
    showToast(`Navigating to ${BBE_BOOK_NAMES[targetUSFM] || targetUSFM} ${targetCh}:${targetV}...`);
    window.location.href = targetUrl;
  }

  function refreshOpenCommentaryDrawer(refetchIfModernEnabled) {
    const drawer = document.getElementById("bbe-drawer");
    if (!drawer || !isDrawerOpen || activeStudyTab !== "commentary") return;
    if (refetchIfModernEnabled && currentDrawerPassage?.book) {
      fetchAndRenderCommentary(currentDrawerPassage.book, currentDrawerPassage.chapter, currentDrawerPassage.verse || 1);
      return;
    }
    if (!cachedCommentaryData || !Array.isArray(cachedCommentaryData.commentaries)) return;
    const bodyEl = drawer.querySelector("#bbe-drawer-body");
    const chipsEl = drawer.querySelector("#bbe-drawer-chips");
    const hubLink = drawer.querySelector("#bbe-drawer-hublink");
    const visible = bbeSortAndFilterCommentaries(cachedCommentaryData.commentaries, S);
    if (visible.length === 0) {
      chipsEl?.replaceChildren();
      if (bodyEl) {
        bodyEl.innerHTML = `
          <div class="bbe-comm-empty">
            All matching commentary sources are hidden in Settings.<br><br>
            <a href="${hubLink ? hubLink.href : '#'}" target="_blank" rel="noopener">View on BibleHub ↗</a>
          </div>
        `;
      }
      return;
    }
    buildCommentaryChips(visible, chipsEl, (authorKey) => {
      renderCommentaryItems(visible, authorKey, bodyEl);
    });
    renderCommentaryItems(visible, activeAuthorFilter, bodyEl);
  }

  function fetchAndRenderCommentary(bookCode, chapter, vNum) {
    const drawer = document.getElementById("bbe-drawer");
    if (!drawer) return;
    const bodyEl = drawer.querySelector("#bbe-drawer-body");
    const chipsEl = drawer.querySelector("#bbe-drawer-chips");
    const hubLink = drawer.querySelector("#bbe-drawer-hublink");

    chipsEl.replaceChildren();
    bodyEl.innerHTML = `
      <div class="bbe-comm-loading">
        <div class="bbe-spinner"></div>
        <span>Loading commentary notes…</span>
      </div>
    `;

    safeSendMessage({
      type: "GET_COMMENTARY",
      bookCode,
      chapter: String(chapter),
      verse: vNum,
      settings: {
        commEnableTgc: bbeIsCommentaryEnabled("the_gospel_coalition", S),
        commEnableGuzik: bbeIsCommentaryEnabled("david_guzik", S),
        commEnableConstable: bbeIsCommentaryEnabled("thomas_constable", S),
        commEnableUtley: bbeIsCommentaryEnabled("bob_utley", S)
      }
    }, (res) => {
        if (!isDrawerOpen || currentDrawerPassage.book !== bookCode || currentDrawerPassage.chapter !== String(chapter) || currentDrawerPassage.verse !== vNum || activeStudyTab !== "commentary") return;

        if (res && res.bibleHubUrl && hubLink) {
          hubLink.href = res.bibleHubUrl;
        }

        if (!res || !res.ok || !Array.isArray(res.commentaries) || res.commentaries.length === 0) {
          bodyEl.innerHTML = `
            <div class="bbe-comm-empty">
              No commentary notes found for this verse.<br><br>
              <a href="${hubLink ? hubLink.href : '#'}" target="_blank" rel="noopener">Search on BibleHub ↗</a>
            </div>
          `;
          return;
        }

        cachedCommentaryData = res;
        const visible = bbeSortAndFilterCommentaries(res.commentaries, S);
        if (visible.length === 0) {
          bodyEl.innerHTML = `
            <div class="bbe-comm-empty">
              All available commentary sources for this verse are hidden in Settings.<br><br>
              <a href="${hubLink ? hubLink.href : '#'}" target="_blank" rel="noopener">View on BibleHub ↗</a>
            </div>
          `;
          return;
        }
        buildCommentaryChips(visible, chipsEl, (authorKey) => {
          renderCommentaryItems(visible, authorKey, bodyEl);
        });
        renderCommentaryItems(visible, activeAuthorFilter, bodyEl);
      });
  }

  function fetchAndRenderCrossrefs(bookCode, chapter, vNum) {
    const drawer = document.getElementById("bbe-drawer");
    if (!drawer) return;
    const crossBody = drawer.querySelector("#bbe-drawer-crossref");
    const hubLink = drawer.querySelector("#bbe-drawer-hublink");
    if (!crossBody) return;

    crossBody.innerHTML = `
      <div class="bbe-comm-loading">
        <div class="bbe-spinner"></div>
        <span>Loading cross-references from Treasury of Scripture Knowledge (TSK)…</span>
      </div>
    `;

    safeSendMessage({
      type: "GET_CROSSREFS",
      bookCode,
      chapter: String(chapter),
      verse: vNum
    }, (res) => {
        if (!isDrawerOpen || currentDrawerPassage.book !== bookCode || currentDrawerPassage.chapter !== String(chapter) || currentDrawerPassage.verse !== vNum || activeStudyTab !== "crossref") return;

        if (res && res.bibleHubUrl && hubLink) {
          hubLink.href = res.bibleHubUrl;
        }

        if (!res || !res.ok || !Array.isArray(res.sections) || res.sections.length === 0) {
          crossBody.innerHTML = `
            <div class="bbe-comm-empty">
              No cross-references found for this verse in the Treasury of Scripture Knowledge.<br><br>
              <a href="${hubLink ? hubLink.href : '#'}" target="_blank" rel="noopener">Explore Treasury of Scripture Knowledge on BibleHub ↗</a>
            </div>
          `;
          return;
        }

        cachedCrossrefData = res;
        crossBody.replaceChildren();

        let totalVerses = 0;
        res.sections.forEach(s => totalVerses += (s.verses ? s.verses.length : 0));

        const summaryEl = document.createElement("div");
        summaryEl.className = "bbe-crossref-summary";
        summaryEl.innerHTML = `<b>Treasury of Scripture Knowledge (TSK)</b> — <b>${totalVerses}</b> connected ${totalVerses === 1 ? "verse" : "verses"} across <b>${res.sections.length}</b> thematic ${res.sections.length === 1 ? "phrase" : "phrases"}. Click any reference or <b>↗ Jump</b> to view on Bible.com, or <b>Study</b> to inspect in this drawer.`;
        crossBody.appendChild(summaryEl);

        res.sections.forEach(sec => {
          const secEl = document.createElement("div");
          secEl.className = "bbe-crossref-section";

          const headingEl = document.createElement("div");
          headingEl.className = "bbe-crossref-heading";
          headingEl.innerHTML = `${BBE_ICONS.quote(13)} <span class="bbe-crossref-quote">“${sec.phrase}”</span>`;
          secEl.appendChild(headingEl);

          sec.verses.forEach(v => {
            const card = document.createElement("div");
            card.className = "bbe-crossref-card";

            const header = document.createElement("div");
            header.className = "bbe-crossref-header";

            const refLink = document.createElement("a");
            refLink.className = "bbe-crossref-ref";
            refLink.href = "#";
            refLink.textContent = v.ref;
            refLink.title = `Jump to ${v.ref} on Bible.com`;
            refLink.addEventListener("click", (e) => {
              e.preventDefault();
              jumpToVerse(v.usfm, v.chapter, v.verseNum);
            });
            header.appendChild(refLink);

            const actions = document.createElement("div");
            actions.className = "bbe-crossref-actions";

            // Jump button
            const jumpBtn = document.createElement("button");
            jumpBtn.type = "button";
            jumpBtn.className = "bbe-crossref-btn bbe-crossref-btn-jump";
            jumpBtn.innerHTML = "↗ Jump";
            jumpBtn.title = `Jump to ${v.ref} on Bible.com`;
            jumpBtn.addEventListener("click", () => {
              jumpToVerse(v.usfm, v.chapter, v.verseNum);
            });
            actions.appendChild(jumpBtn);

            // Study button (switches drawer to study that verse)
            const studyBtn = document.createElement("button");
            studyBtn.type = "button";
            studyBtn.className = "bbe-crossref-btn";
            studyBtn.style.cssText = "display:inline-flex;align-items:center;gap:4px;";
            studyBtn.innerHTML = `${BBE_ICONS.book(11)}<span>Study</span>`;
            studyBtn.title = `Open verse study drawer for ${v.ref}`;
            studyBtn.addEventListener("click", () => {
              openCommentaryDrawer(v.usfm, v.chapter, v.verseNum);
            });
            actions.appendChild(studyBtn);

            // Copy button
            const copyBtn = document.createElement("button");
            copyBtn.type = "button";
            copyBtn.className = "bbe-crossref-btn";
            copyBtn.textContent = "Copy";
            copyBtn.title = "Copy reference and preview text";
            copyBtn.addEventListener("click", () => {
              navigator.clipboard.writeText(`${v.ref}\n\n${v.text}`).then(() => {
                copyBtn.textContent = "Copied!";
                setTimeout(() => { copyBtn.textContent = "Copy"; }, 1500);
              });
            });
            actions.appendChild(copyBtn);

            header.appendChild(actions);
            card.appendChild(header);

            if (v.text) {
              const textEl = document.createElement("div");
              textEl.className = "bbe-crossref-text";
              textEl.textContent = `“${v.text}”`;
              card.appendChild(textEl);
            }

            secEl.appendChild(card);
          });

          crossBody.appendChild(secEl);
        });
      });
  }

  /** Pick the most relevant verse for opening the study drawer (visible selection -> URL verse -> reading-zone verse). */
  function getContextualStudyVerse(p) {
    if (!p) return 1;
    const prefix = `${p.book}.${p.chapter}.`;
    const chapterEl = getChapterEl();

    const parseUsfmNum = (el) => {
      const usfm = el?.getAttribute?.("data-usfm") || "";
      if (!usfm.startsWith(prefix)) return NaN;
      return parseInt(usfm.slice(prefix.length), 10);
    };

    // 1. Active text selection inside the chapter, only if currently visible in the viewport
    try {
      const sel = window.getSelection();
      if (chapterEl && sel && !sel.isCollapsed && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (chapterEl.contains(range.commonAncestorContainer)) {
          const rect = range.getBoundingClientRect();
          const isVisible = (rect.width > 0 || rect.height > 0) && rect.bottom > 0 && rect.top < window.innerHeight;
          if (isVisible) {
            const matched = [];
            chapterEl.querySelectorAll('[data-usfm]').forEach(v => {
              if (range.intersectsNode(v)) {
                const n = parseUsfmNum(v);
                if (!isNaN(n)) matched.push(n);
              }
            });
            if (matched.length > 0) return Math.min(...matched);
          }
        }
      }
    } catch (_) {}

    // 2. URL-specified verse (e.g. /ROM.8.13.ESV), or multi-verse URL while near the top
    const urlSpec = p.verses ? parseVerseRangeSpec(p.verses) : null;
    if (urlSpec && (urlSpec.min === urlSpec.max || window.scrollY <= 40)) {
      return urlSpec.min;
    }

    // 3. Top of chapter -> v. 1; scrolled down -> verse in the reading zone (~22% down viewport)
    if (window.scrollY <= 40) return urlSpec ? urlSpec.min : 1;

    if (chapterEl) {
      const readingY = Math.min(220, Math.round(window.innerHeight * 0.22));
      let lastVisibleNum = null;
      const verses = chapterEl.querySelectorAll('[data-usfm]');
      for (const v of verses) {
        const rect = v.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        const n = parseUsfmNum(v);
        if (isNaN(n)) continue;
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          lastVisibleNum = n;
        }
        if (rect.bottom > readingY && rect.top < window.innerHeight) {
          return n;
        }
      }
      if (lastVisibleNum !== null) return lastVisibleNum;
    }

    return urlSpec ? urlSpec.min : 1;
  }

  function updateDrawerPreview(bookCode, chapter, verseNum, p) {
    const drawer = document.getElementById("bbe-drawer");
    if (!drawer) return;
    const previewEl = drawer.querySelector("#bbe-drawer-preview");
    if (!previewEl) return;
    const allVers = getAllVersions();
    const activeP = p || bbeParsePath(location.pathname, allVers);
    const activeKey = activeP ? (bbeKeyForId(activeP.id, allVers) || activeP.abbr || "NIV") : "NIV";
    const matchesPageChapter = !activeP || (activeP.book === bookCode && String(activeP.chapter) === String(chapter));
    const vNum = Number(verseNum) || 1;
    const verseText = matchesPageChapter ? getVerseTextFromDom(vNum) : "";

    if (verseText) {
      const bookTitle = BBE_BOOK_NAMES[bookCode] || bookCode;
      previewEl.style.display = "";
      previewEl.innerHTML = `<b>${bookTitle} ${chapter}:${vNum} (${activeKey})</b> “${verseText}”`;
    } else {
      previewEl.style.display = "none";
    }
  }

  function openCommentaryDrawer(bookCode, chapter, verseNum, optTab, optWordIdx, triggerOpts) {
    const { backdrop, drawer } = ensureDrawerElements();
    const wasOpen = isDrawerOpen;
    const naturalMaxScrollY = getPreClearanceNaturalMaxScrollY();
    const wasAtBottomOfPage = (naturalMaxScrollY > 0 && window.scrollY >= naturalMaxScrollY - 48);
    isDrawerOpen = true;
    activeWordStudyIndex = (typeof optWordIdx === "number" && optWordIdx >= 0) ? optWordIdx : 0;

    applyDrawerDockClasses(drawer);

    const vNum = Number(verseNum) || 1;
    currentDrawerPassage = {
      book: bookCode,
      chapter: String(chapter),
      verse: vNum
    };

    backdrop.classList.add("open");
    drawer.classList.add("open");

    glideScriptureAboveBottomDrawer(bookCode, chapter, vNum, {
      wasAtBottomOfPage,
      explicitVerse: Boolean(triggerOpts?.explicitVerse),
      isStepper: Boolean(triggerOpts?.isStepper)
    });

    const bookTitle = BBE_BOOK_NAMES[bookCode] || bookCode;
    const refText = `${bookTitle} ${chapter}:${vNum}`;

    drawer.querySelector("#bbe-drawer-ref").textContent = refText;
    drawer.querySelector("#bbe-stepper-label").textContent = `v. ${vNum}`;
    drawer.querySelector("#bbe-stepper-prev").disabled = (vNum <= 1);

    const allVers = getAllVersions();
    const p = bbeParsePath(location.pathname, allVers);
    updateDrawerPreview(bookCode, chapter, vNum, p);

    if (optTab) {
      activeStudyTab = optTab;
    } else if (!wasOpen) {
      activeStudyTab = S.defaultStudyTab || "commentary";
    }
    switchStudyTab(activeStudyTab || S.defaultStudyTab || "commentary");

    if (p) renderToolbar(p);
  }

  function renderVerseBadges(p, force = false) {
    const chapterEl = getChapterEl();
    if (!chapterEl) return;

    const chapKey = `${p.book}.${p.chapter}.${p.verses || "FULL"}.${p.id || p.abbr}`;
    if (!force && chapterEl.dataset.bbeBound === chapKey) {
      return;
    }
    chapterEl.dataset.bbeBound = chapKey;

    // Remove any inline action wraps / buttons completely so scripture text is clean and unobstructed
    chapterEl.querySelectorAll(".bbe-verse-badge, .bbe-verse-actions-wrap").forEach(b => b.remove());

    // Configure the native verse number labels to open commentary on click
    const labels = chapterEl.querySelectorAll('[class*="_label"]');
    labels.forEach(label => {
      const vNum = parseInt(label.textContent.trim(), 10);
      if (isNaN(vNum) || vNum < 1) return;

      label.style.cursor = "pointer";
      label.title = `Click for ${BBE_BOOK_NAMES[p.book] || p.book} ${p.chapter}:${vNum} study commentary`;
      label.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openCommentaryDrawer(p.book, p.chapter, vNum, null, null, { explicitVerse: true });
      };
    });
  }

  // Ensure no legacy browser notes remain in local/sync storage
  try {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local?.remove?.(["bbe_user_notes"]);
      chrome.storage.sync?.remove?.(["bbe_user_notes"]);
    }
    localStorage.removeItem("bbe_user_notes");
  } catch (e) {}

  /* ---------------- Word Study & Strong's Lexicon ---------------- */
  let cachedWordStudyData = null;
  let activeWordStudyIndex = 0;
  let wordTooltipEl = null;
  let activeTooltipTarget = null;
  let wordHoverTimer = null;

  function fetchAndRenderWordStudy(bookCode, chapter, vNum, targetWordIndex = 0) {
    const drawer = document.getElementById("bbe-drawer");
    if (!drawer) return;
    const wordBody = drawer.querySelector("#bbe-drawer-wordstudy");
    const hubLink = drawer.querySelector("#bbe-drawer-hublink");
    if (!wordBody) return;

    wordBody.innerHTML = `
      <div class="bbe-comm-loading">
        <div class="bbe-spinner"></div>
        <span>Loading Strong's Greek/Hebrew interlinear &amp; lexicon from BibleHub…</span>
      </div>
    `;

    safeSendMessage({
      type: "GET_INTERLINEAR",
      bookCode,
      chapter: String(chapter),
      verse: vNum
    }, (res) => {
        if (!isDrawerOpen || currentDrawerPassage.book !== bookCode || currentDrawerPassage.chapter !== String(chapter) || currentDrawerPassage.verse !== vNum || activeStudyTab !== "wordstudy") return;

        if (res && res.bibleHubUrl && hubLink) {
          hubLink.href = res.bibleHubUrl;
        }

        if (!res || !res.ok || !Array.isArray(res.words) || res.words.length === 0) {
          wordBody.innerHTML = `
            <div class="bbe-comm-empty">
              No interlinear word data found for this verse.<br><br>
              <a href="${hubLink ? hubLink.href : '#'}" target="_blank" rel="noopener">Explore Interlinear on BibleHub ↗</a>
            </div>
          `;
          return;
        }

        cachedWordStudyData = res;
        renderWordStudyContent(wordBody, res.words, targetWordIndex);
      });
  }

  function renderWordStudyContent(container, words, selectedIndex = 0) {
    container.replaceChildren();

    const isHebrew = words.some(w => w.lang === "hebrew");
    const langLabel = isHebrew ? "Hebrew (Old Testament)" : "Greek (New Testament)";
    const langClass = isHebrew ? "hebrew" : "greek";

    // Summary banner
    const summary = document.createElement("div");
    summary.className = "bbe-crossref-summary";
    summary.innerHTML = `<b>Interlinear &amp; Strong's Lexicon</b> — <b>${words.length}</b> original ${langLabel} root words. Click any word card to inspect its full Strong's definition, grammatical morphology, and Bible occurrences.`;
    container.appendChild(summary);

    // Grid of word cards
    const grid = document.createElement("div");
    grid.className = "bbe-interlinear-grid";

    // Lexicon detail container
    const detailCard = document.createElement("div");
    detailCard.className = "bbe-lexicon-detail-card";
    detailCard.id = "bbe-lexicon-detail-card";

    const initialIdx = Math.max(0, Math.min(words.length - 1, selectedIndex));

    words.forEach((w, idx) => {
      const card = document.createElement("div");
      card.className = "bbe-word-card" + (idx === initialIdx ? " active" : "");

      card.innerHTML = `
        <div class="bbe-card-orig notranslate ${w.lang === 'hebrew' ? 'hebrew' : 'greek'}" translate="no">${w.original || ''}</div>
        <div class="bbe-card-translit">${w.translit || ''}</div>
        <div class="bbe-card-gloss">“${w.gloss || ''}”</div>
        <span class="bbe-card-strongs notranslate ${w.lang === 'hebrew' ? 'hebrew' : 'greek'}" translate="no">${w.strongs || ''}</span>
        <div class="bbe-card-pos">${w.posCode || ''}</div>
      `;

      card.addEventListener("click", () => {
        grid.querySelectorAll(".bbe-word-card").forEach(c => c.classList.remove("active"));
        card.classList.add("active");
        renderLexiconDetail(detailCard, w);
      });

      grid.appendChild(card);
    });

    container.appendChild(grid);
    container.appendChild(detailCard);

    // Load details for initial word
    const initialWord = words[initialIdx] || words[0];
    if (initialWord) {
      renderLexiconDetail(detailCard, initialWord);
    }
  }

  function renderLexiconDetail(container, word) {
    if (!word || !word.num) {
      container.innerHTML = `<div class="bbe-comm-empty">Select a word card above to inspect Strong's details.</div>`;
      return;
    }

    container.innerHTML = `
      <div class="bbe-comm-loading" style="padding:16px 0;">
        <div class="bbe-spinner"></div>
        <span>Loading Strong's ${word.strongs} entry...</span>
      </div>
    `;

    safeSendMessage({
      type: "GET_STRONGS_ENTRY",
      lang: word.lang,
      number: word.num
    }, (res) => {
      if (!res || !res.ok || !res.entry) {
        container.innerHTML = `
          <div style="font-size:13px;color:#dc2626;">
            Unable to load Strong's lexicon details for ${word.strongs}.
            <a href="https://biblehub.com/${word.lang}/${word.num}.htm" target="_blank" rel="noopener" style="margin-left:8px;color:#2563eb;">View on BibleHub ↗</a>
          </div>
        `;
        return;
      }

      const e = res.entry;
      const langClass = word.lang === "hebrew" ? "hebrew" : "greek";
      const bibleHubUrl = `https://biblehub.com/${word.lang}/${word.num}.htm`;

      container.innerHTML = `
        <div class="bbe-tooltip-header">
          <div class="bbe-tooltip-badge-group">
            <span class="bbe-strongs-pill notranslate ${langClass}" translate="no">${e.strongs}</span>
            <span class="bbe-tooltip-translit">${e.translit || word.translit || ''}</span>
            ${e.phonetic ? `<span class="bbe-tooltip-phonetic">(${e.phonetic})</span>` : ''}
          </div>
          <div class="bbe-tooltip-actions">
            <a href="${bibleHubUrl}" target="_blank" rel="noopener" class="bbe-tooltip-link">BibleHub Lexicon ↗</a>
          </div>
        </div>
        <div class="bbe-tooltip-main">
          <div class="bbe-tooltip-orig-row">
            <span class="bbe-tooltip-orig notranslate ${langClass}" translate="no">${e.original || word.original || ''}</span>
            <span class="bbe-tooltip-pos">${e.pos || word.posFull || word.posCode || ''}</span>
          </div>
          ${e.pronunciation ? `<div style="font-size:11px;color:#64748b;">Pronunciation: <i>${e.pronunciation}</i></div>` : ''}
          <div class="bbe-tooltip-def"><b>Definition:</b> ${e.definition || word.shortDef || word.gloss}</div>
          ${e.occurrences ? `
            <div class="bbe-tooltip-occ">
              <b>Bible Occurrences:</b> ${e.totalOccurrences ? `<b>${e.totalOccurrences}</b> total — ` : ''}${e.occurrences}
            </div>
          ` : ''}
          ${e.origin ? `<div style="font-size:11.5px;color:#64748b;margin-top:2px;"><b>Origin:</b> ${e.origin}</div>` : ''}
        </div>
      `;
    });
  }

  function ensureWordTooltip() {
    if (wordTooltipEl) return wordTooltipEl;
    wordTooltipEl = document.getElementById("bbe-word-tooltip");
    if (!wordTooltipEl) {
      wordTooltipEl = document.createElement("div");
      wordTooltipEl.id = "bbe-word-tooltip";
      wordTooltipEl.lang = "en";
      document.body.appendChild(wordTooltipEl);

      wordTooltipEl.addEventListener("click", (e) => {
        e.stopPropagation();
      });

      document.addEventListener("click", (e) => {
        if (wordTooltipEl && wordTooltipEl.classList.contains("open")) {
          if (!wordTooltipEl.contains(e.target)) {
            hideWordTooltip();
          }
        }
      });
    }
    return wordTooltipEl;
  }

  function hideWordTooltip() {
    if (wordTooltipEl) {
      wordTooltipEl.classList.remove("open");
    }
    activeTooltipTarget = null;
    hideWordHoverHighlight();
  }

  function positionWordTooltip(targetSpan, tooltip) {
    const rect = (targetSpan && typeof targetSpan.getBoundingClientRect === "function")
      ? targetSpan.getBoundingClientRect()
      : targetSpan;
    if (!rect) return;
    const tooltipWidth = 340;
    const tooltipHeight = 240;
    const margin = 10;

    let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
    left = Math.max(margin, Math.min(window.innerWidth - tooltipWidth - margin, left));

    let top = rect.bottom + 8;
    const visibleBottom = isBottomDrawerActive()
      ? Math.max(260, window.innerHeight - getBottomDrawerHeightPx())
      : window.innerHeight;
    if (top + tooltipHeight > visibleBottom && rect.top > tooltipHeight + margin) {
      top = rect.top - tooltipHeight - 8;
    }

    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
  }

  function showWordTooltip(targetSpan, bookCode, chapter, vNum, wordText) {
    if (!S.enabled || !S.wordStudyMode) return;
    const tooltip = ensureWordTooltip();
    activeTooltipTarget = targetSpan;

    positionWordTooltip(targetSpan, tooltip);
    tooltip.classList.add("open");

    tooltip.innerHTML = `
      <div class="bbe-comm-loading" style="padding:10px 0;">
        <div class="bbe-spinner"></div>
        <span>Looking up “${wordText}” in Strong's Lexicon…</span>
      </div>
    `;

    safeSendMessage({
      type: "GET_INTERLINEAR",
      bookCode,
      chapter: String(chapter),
      verse: vNum
    }, (res) => {
      if (activeTooltipTarget !== targetSpan) return;

      if (!res || !res.ok || !Array.isArray(res.words) || res.words.length === 0) {
        tooltip.innerHTML = `
          <div style="font-size:12px;color:#dc2626;padding:4px 0;">
            No Strong's interlinear data available for ${BBE_BOOK_NAMES[bookCode] || bookCode} ${chapter}:${vNum}.
          </div>
        `;
        return;
      }

      const words = res.words;
      const cleanTarget = (wordText || "").toLowerCase().replace(/[^a-z0-9]/gi, "");

      let matchedIdx = words.findIndex(w => {
        const cleanGloss = (w.gloss || "").toLowerCase().replace(/[^a-z0-9]/gi, "");
        return cleanGloss === cleanTarget;
      });

      if (matchedIdx === -1) {
        matchedIdx = words.findIndex(w => {
          const cleanGloss = (w.gloss || "").toLowerCase().replace(/[^a-z0-9]/gi, "");
          const cleanDef = (w.shortDef || "").toLowerCase().replace(/[^a-z0-9]/gi, "");
          return cleanGloss.includes(cleanTarget) || cleanTarget.includes(cleanGloss) ||
                 cleanDef.includes(cleanTarget);
        });
      }

      if (matchedIdx === -1) {
        matchedIdx = 0;
      }

      renderTooltipContent(tooltip, targetSpan, bookCode, chapter, vNum, words, matchedIdx);
    });
  }

  function renderTooltipContent(tooltip, targetSpan, bookCode, chapter, vNum, words, selectedIdx) {
    const w = words[selectedIdx];
    if (!w) return;

    const langClass = w.lang === "hebrew" ? "hebrew" : "greek";
    const bibleHubUrl = `https://biblehub.com/${w.lang}/${w.num}.htm`;

    tooltip.innerHTML = `
      <div class="bbe-tooltip-header">
        <div class="bbe-tooltip-badge-group">
          <span class="bbe-strongs-pill notranslate ${langClass}" translate="no">${w.strongs}</span>
          <span class="bbe-tooltip-translit">${w.translit || ''}</span>
        </div>
        <div class="bbe-tooltip-actions">
          <a href="${bibleHubUrl}" target="_blank" rel="noopener" class="bbe-tooltip-link">BibleHub ↗</a>
          <button type="button" class="bbe-tooltip-close" title="Close">✕</button>
        </div>
      </div>
      <div class="bbe-tooltip-main" id="bbe-tooltip-main-content">
        <div class="bbe-tooltip-orig-row">
          <span class="bbe-tooltip-orig notranslate ${langClass}" translate="no">${w.original || ''}</span>
          <span class="bbe-tooltip-pos">${w.posCode || ''}</span>
        </div>
        <div class="bbe-tooltip-def">${w.shortDef || w.gloss || ''}</div>
        <div class="bbe-comm-loading" style="padding:6px 0;font-size:11px;">
          <div class="bbe-spinner" style="width:12px;height:12px;border-width:1.5px;"></div>
          <span>Loading Strong's definition...</span>
        </div>
      </div>
      <div class="bbe-tooltip-words-strip" id="bbe-tooltip-words-strip"></div>
      <div style="margin-top:8px;padding-top:6px;border-top:1px solid #f1f5f9;display:flex;justify-content:flex-end;">
        <button type="button" class="bbe-preview-btn" id="bbe-tooltip-drawer-btn" style="font-size:11px;padding:3px 8px;display:inline-flex;align-items:center;gap:5px;">${BBE_ICONS.book(12)}<span>Open in Study Drawer</span></button>
      </div>
    `;

    tooltip.querySelector(".bbe-tooltip-close").addEventListener("click", () => hideWordTooltip());

    tooltip.querySelector("#bbe-tooltip-drawer-btn").addEventListener("click", () => {
      hideWordTooltip();
      openCommentaryDrawer(bookCode, chapter, vNum, "wordstudy", selectedIdx, { explicitVerse: true });
    });

    const strip = tooltip.querySelector("#bbe-tooltip-words-strip");
    words.forEach((item, idx) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "bbe-tooltip-chip" + (idx === selectedIdx ? " active" : "");
      chip.textContent = item.gloss || item.translit || item.strongs;
      chip.title = `${item.strongs} (${item.translit}): ${item.original}`;
      chip.addEventListener("click", () => {
        renderTooltipContent(tooltip, targetSpan, bookCode, chapter, vNum, words, idx);
      });
      strip.appendChild(chip);
    });

    positionWordTooltip(targetSpan, tooltip);

    safeSendMessage({
      type: "GET_STRONGS_ENTRY",
      lang: w.lang,
      number: w.num
    }, (res) => {
      const mainEl = tooltip.querySelector("#bbe-tooltip-main-content");
      if (!mainEl) return;

      if (res && res.ok && res.entry) {
        const e = res.entry;
        mainEl.innerHTML = `
          <div class="bbe-tooltip-orig-row">
            <span class="bbe-tooltip-orig notranslate ${langClass}" translate="no">${e.original || w.original || ''}</span>
            <span class="bbe-tooltip-pos">${e.pos || w.posFull || w.posCode || ''}</span>
          </div>
          ${e.phonetic ? `<div class="bbe-tooltip-phonetic">Phonetic: ${e.phonetic} ${e.pronunciation ? `(${e.pronunciation})` : ''}</div>` : ''}
          <div class="bbe-tooltip-def">${e.definition || w.shortDef || w.gloss}</div>
          ${e.occurrences ? `<div class="bbe-tooltip-occ"><b>Bible Occurrences:</b> ${e.totalOccurrences ? `<b>${e.totalOccurrences}</b> — ` : ''}${e.occurrences}</div>` : ''}
        `;
        positionWordTooltip(targetSpan, tooltip);
      }
    });
  }

  // --- Native Caret Range Word Detection (Zero DOM Mutation) ---
  let wordHoverBox = null;
  let lastHoveredWord = null;

  function ensureWordHoverBox() {
    if (wordHoverBox && wordHoverBox.isConnected) return wordHoverBox;
    wordHoverBox = document.getElementById("bbe-word-hover-box");
    if (!wordHoverBox) {
      wordHoverBox = document.createElement("div");
      wordHoverBox.id = "bbe-word-hover-box";
      wordHoverBox.className = "bbe-word-hover-box";
      document.body.appendChild(wordHoverBox);
    }
    return wordHoverBox;
  }

  function showWordHoverHighlight(rect) {
    if (!rect) return hideWordHoverHighlight();
    const box = ensureWordHoverBox();
    box.style.display = "block";
    box.style.left = `${Math.round(rect.left + window.scrollX)}px`;
    box.style.top = `${Math.round(rect.top + window.scrollY)}px`;
    box.style.width = `${Math.round(rect.width)}px`;
    box.style.height = `${Math.round(rect.height)}px`;
  }

  function hideWordHoverHighlight() {
    if (wordHoverBox) {
      wordHoverBox.style.display = "none";
    }
  }

  function getWordAtPoint(x, y) {
    let node = null;
    let offset = 0;

    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(x, y);
      if (range) {
        node = range.startContainer;
        offset = range.startOffset;
      }
    } else if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      if (pos) {
        node = pos.offsetNode;
        offset = pos.offset;
      }
    }

    if (!node) return null;
    if (node.nodeType !== Node.TEXT_NODE) {
      if (node.childNodes && node.childNodes[offset]?.nodeType === Node.TEXT_NODE) {
        node = node.childNodes[offset];
        offset = 0;
      } else {
        return null;
      }
    }

    const verseEl = node.parentElement?.closest('[class*="_verse"]');
    if (!verseEl) return null;

    const label = verseEl.querySelector('[class*="_label"]');
    const vNum = label ? parseInt(label.textContent.trim(), 10) : null;
    if (!vNum || isNaN(vNum)) return null;

    const text = node.nodeValue;
    if (!text) return null;

    const isWordChar = (ch) => /[\p{L}\p{M}'-]/u.test(ch);

    let start = offset;
    let end = offset;

    if (start >= text.length || !isWordChar(text[start])) {
      if (start > 0 && isWordChar(text[start - 1])) {
        start--;
        end = start;
      } else {
        return null;
      }
    }

    while (start > 0 && isWordChar(text[start - 1])) {
      start--;
    }
    while (end < text.length && isWordChar(text[end])) {
      end++;
    }

    const word = text.slice(start, end).trim();
    if (!word || word.length < 1) return null;

    const wordRange = document.createRange();
    wordRange.setStart(node, start);
    wordRange.setEnd(node, end);
    const rect = wordRange.getBoundingClientRect();

    return {
      word,
      vNum,
      rect,
      targetObj: {
        getBoundingClientRect: () => rect,
        dataset: { verse: String(vNum), word }
      }
    };
  }

  function enhanceVersesForWordStudy(p) {
    if (!S.enabled || !S.wordStudyMode) {
      hideWordHoverHighlight();
      return;
    }
    const chapterEl = getChapterEl();
    if (!chapterEl) return;

    if (!chapterEl.dataset.bbeWordStudyBound) {
      chapterEl.dataset.bbeWordStudyBound = "1";

      let wordMouseMoveRaf = null;
      chapterEl.addEventListener("mousemove", (e) => {
        if (!S.enabled || !S.wordStudyMode || html.classList.contains("bbe-sermon-drawing")) return;
        const clientX = e.clientX;
        const clientY = e.clientY;

        if (wordMouseMoveRaf) return;
        wordMouseMoveRaf = requestAnimationFrame(() => {
          wordMouseMoveRaf = null;
          const info = getWordAtPoint(clientX, clientY);
          if (!info) {
            lastHoveredWord = null;
            hideWordHoverHighlight();
            clearTimeout(wordHoverTimer);
            return;
          }

          showWordHoverHighlight(info.rect);

          if (S.wordStudyTrigger === "click") return;

          if (lastHoveredWord !== info.word) {
            lastHoveredWord = info.word;
            clearTimeout(wordHoverTimer);
            wordHoverTimer = setTimeout(() => {
              const curP = bbeParsePath(location.pathname, getAllVersions());
              if (curP && info.vNum && info.word) {
                showWordTooltip(info.targetObj, curP.book, curP.chapter, info.vNum, info.word);
              }
            }, 180);
          }
        });
      }, { passive: true });

      chapterEl.addEventListener("mouseleave", () => {
        if (wordMouseMoveRaf) {
          cancelAnimationFrame(wordMouseMoveRaf);
          wordMouseMoveRaf = null;
        }
        lastHoveredWord = null;
        hideWordHoverHighlight();
        clearTimeout(wordHoverTimer);
      });

      chapterEl.addEventListener("click", (e) => {
        if (!S.enabled || !S.wordStudyMode || html.classList.contains("bbe-sermon-drawing")) return;
        // Don't intercept clicks on verse labels, buttons, or links
        if (e.target.closest('[class*="_label"]') || e.target.closest('button') || e.target.closest('a')) return;

        const info = getWordAtPoint(e.clientX, e.clientY);
        if (!info) return;

        clearTimeout(wordHoverTimer);
        const curP = bbeParsePath(location.pathname, getAllVersions());
        if (curP && info.vNum && info.word) {
          showWordTooltip(info.targetObj, curP.book, curP.chapter, info.vNum, info.word);
        }
      });
    }
  }

  /* ---------------- Keyboard Shortcuts & Navigation ---------------- */
  window.addEventListener("popstate", () => {
    const allVers = getAllVersions();
    const p = bbeParsePath(location.pathname, allVers);
    if (!p) return;
    const clean = cleanChapterUrl(location.pathname);
    const curChapterEl = getChapterEl();
    if (curChapterEl && adjacentChapterCache.has(clean)) {
      adjacentChapterCache.get(clean).then(data => {
        curChapterEl.innerHTML = data.html;
        if (data.title) document.title = data.title;
        updateAdjacentChapterLinks(data.prevHref, data.nextHref);
        lastRenderKey = "";
        tick();
      }).catch(() => {
        location.reload();
      });
      return;
    }
    const targetKey = bbeKeyForId(p.id, allVers) || p.abbr;
    if (targetKey) {
      switchToVersion(targetKey, p);
    }
  });

  window.addEventListener("keydown", (e) => {
    // Escape key closes commentary drawer
    if (e.key === "Escape") {
      if (isDrawerOpen) {
        e.preventDefault();
        if (isDrawerFullscreen) {
          isDrawerFullscreen = false;
          const drawer = document.getElementById("bbe-drawer");
          if (drawer) applyDrawerDockClasses(drawer);
          return;
        }
        closeCommentaryDrawer();
        return;
      }
    }

    if (!S.enabled) return;

    // Ignore if input, textarea, select, or editable element is focused
    const active = document.activeElement;
    if (active) {
      const tag = active.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (active.isContentEditable || active.getAttribute("contenteditable") === "true") return;
      if (active.closest && active.closest('[contenteditable="true"]')) return;
    }

    // Ignore if search dropdown or input is active
    const searchInput = document.querySelector(".bbe-search-input");
    if (searchInput && (document.activeElement === searchInput || searchInput.matches(":focus"))) return;

    // Ignore if modifier keys are held (Ctrl, Alt, Meta/Cmd)
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    // Arrow keys for Left / Right instant chapter navigation (independent of single-key translation shortcuts)
    if (S.chapterArrowKeys !== false) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const prevA = document.querySelector('a[aria-label="Previous Chapter"], a[aria-label*="Previous"]');
        if (prevA) {
          prevA.classList.add("bbe-key-pressed");
          setTimeout(() => prevA.classList.remove("bbe-key-pressed"), 180);
        }
        navigateToAdjacentChapter("prev", prevA);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const nextA = document.querySelector('a[aria-label="Next Chapter"], a[aria-label*="Next"]');
        if (nextA) {
          nextA.classList.add("bbe-key-pressed");
          setTimeout(() => nextA.classList.remove("bbe-key-pressed"), 180);
        }
        navigateToAdjacentChapter("next", nextA);
        return;
      }
    }

    const rawKey = /^[a-zA-Z0-9]$/.test(e.key)
      ? e.key
      : (/^(?:Key[A-Z]|Digit[0-9])$/.test(e.code || "") ? e.code.slice(-1) : (e.key || ""));
    const k = rawKey.toLowerCase();

    function toggleDrawerShortcutTab(tab, event) {
      const allVers = getAllVersions();
      const p = bbeParsePath(location.pathname, allVers);
      if (!p) return;
      event.preventDefault();
      if (isDrawerOpen && activeStudyTab === tab) {
        closeCommentaryDrawer();
      } else if (isDrawerOpen) {
        switchStudyTab(tab);
      } else {
        openCommentaryDrawer(p.book, p.chapter, getContextualStudyVerse(p), tab);
      }
    }

    // Hardcoded study drawer hotkeys (cannot be reassigned to translations)
    if (k === "c" || k === "r") {
      const allVers = getAllVersions();
      const p = bbeParsePath(location.pathname, allVers);
      if (!p) return;
      e.preventDefault();
      if (k === "r") {
        toggleDrawerShortcutTab("crossref", e);
      } else if (isDrawerOpen) {
        const defaultTab = S.defaultStudyTab || "commentary";
        if (activeStudyTab === "crossref" && defaultTab !== "crossref") {
          switchStudyTab("commentary");
        } else {
          closeCommentaryDrawer();
        }
      } else {
        openCommentaryDrawer(p.book, p.chapter, getContextualStudyVerse(p));
      }
      return;
    }

    const keyMap = getKeyMap();

    // Check if key is mapped to a translation shortcut (only when Single-Key Shortcuts is enabled)
    if (S.enableKeyShortcuts) {
      const targetVersion = keyMap[k];
      if (targetVersion) {
        const allVers = getAllVersions();
        const p = bbeParsePath(location.pathname, allVers);
        if (p) {
          e.preventDefault();
          switchToVersion(targetVersion, p);
        }
        return;
      }
    }

    // 'W' shortcut toggles Strong's Word Study mode if not mapped to a translation
    if (k === "w" && !(S.enableKeyShortcuts && keyMap["w"])) {
      e.preventDefault();
      const next = !S.wordStudyMode;
      bbeSave({ wordStudyMode: next }).then(() => {
        showToast(next ? "Word Study mode activated. Hover or click words for Strong's lexicon." : "Word Study mode deactivated.", { icon: "lexicon" });
      });
      return;
    }

    // 'H' shortcut highlights current selection with default color
    if (k === "h" && !(S.enableKeyShortcuts && keyMap["h"])) {
      if (selectionBarEl && selectionBarEl.classList.contains("show")) {
        const defColor = S.defaultHighlightColor || "fffe00";
        const swatch = selectionBarEl.querySelector(`.bbe-swatch-btn[data-color="${defColor}"]`) || selectionBarEl.querySelector(".bbe-swatch-btn");
        if (swatch) {
          e.preventDefault();
          swatch.click();
          return;
        }
      }
      const hoveredHlBtn = document.querySelector(".bbe-verse-highlight-btn:hover");
      if (hoveredHlBtn && hoveredHlBtn.dataset.usfm) {
        e.preventDefault();
        const usfm = hoveredHlBtn.dataset.usfm;
        const currentHl = (currentChapterHighlights || []).find(h => h.usfm === usfm);
        const defColor = S.defaultHighlightColor || "fffe00";
        if (currentHl && currentHl.color === defColor) {
          applyNativeHighlight([usfm], null);
          showToast(`Removed highlight`);
        } else {
          applyNativeHighlight([usfm], defColor);
          if (isUserSignedIn()) {
            showToast(`Highlighted ${usfm.split('.').pop()}`);
          } else {
            showTemporaryHighlightBanner(`Verse ${usfm.split('.').pop()}`);
          }
        }
        return;
      }
    }
  });

  /* ---------------- Toolbar Construction ---------------- */
  function createBtn(text, title, onClick, isActive, isSmall, iconSvg) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "bbe-btn" + (isActive ? " bbe-active" : "") + (isSmall ? " bbe-btn-sm" : "");
    if (iconSvg) {
      b.innerHTML = `${iconSvg}<span>${bbeEscapeHtml(text)}</span>`;
    } else {
      b.textContent = text;
    }
    b.title = title || "";
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  function executeSearch(query, p, activeKey) {
    const q = query.trim();
    if (!q) return;

    const ref = bbeParseSearch(q);
    const allVers = getAllVersions();
    const targetKey = (ref && ref.version) || activeKey;
    const targetId = (ref && ref.version) ? (bbeIdForSuffix(ref.version, allVers) || (allVers[ref.version] ? allVers[ref.version].id : null)) : null;
    const ver = (targetId && targetKey) ? { id: targetId, short: targetKey } : (allVers[activeKey] || allVers.NIV || BBE_VERSIONS.NIV);
    const finalKey = targetKey || activeKey;

    if (ref) {
      // Pre-check if this chapter's max verse count is already known
      const chapKey = `${ref.book}.${ref.chapter}`;
      if (chapterMaxVerses.has(chapKey)) {
        const maxV = chapterMaxVerses.get(chapKey);
        const spec = parseVerseRangeSpec(ref.verses);
        if (spec && maxV && maxV > 0) {
          if (spec.min > maxV || spec.max < 1) {
            // Out of bounds -> fallback to clean full chapter
            ref.verses = null;
          } else if (spec.max > maxV) {
            if (spec.min === 1) {
              ref.verses = null; // 1 to max is the entire chapter
            } else {
              ref.verses = `${spec.min}-${maxV}`;
            }
          }
        }
      }

      if (p && ref.book === p.book && String(ref.chapter) === String(p.chapter) && ver.id === p.id) {
        transitionPassageInPlace({
          id: ver.id,
          book: ref.book,
          chapter: String(ref.chapter),
          verses: ref.verses || null,
          abbr: finalKey
        }, finalKey);
        return;
      }
      // Direct jump to scripture reference
      const path = `/bible/${ver.id}/${ref.book}.${ref.chapter}${ref.verses ? "." + ref.verses : ""}.${finalKey}`;
      location.href = path;
    } else {
      // Keyword search on Bible.com
      location.href = `/search/bible?q=${encodeURIComponent(q)}&version_id=${ver.id}`;
    }
  }

  /* ---------- Smart Auto-Hide Toolbar (Scroll & Top-Edge Aware) ---------- */
  let lastScrollY = window.scrollY;
  let isBarHidden = false;
  let topHoverTimeout = null;
  const SCROLL_THRESHOLD = 10;

  function showBar() {
    const bar = document.getElementById("bbe-bar");
    if (!bar) return;
    if (topHoverTimeout) {
      clearTimeout(topHoverTimeout);
      topHoverTimeout = null;
    }
    if (isBarHidden) {
      isBarHidden = false;
      bar.classList.remove("bbe-hidden");
    }
  }

  function hideBar() {
    const bar = document.getElementById("bbe-bar");
    if (!bar) return;
    if (S.toolbarBehavior === "static" || S.toolbarBehavior === "floating") return;
    if (S.toolbarBehavior === "never") return;

    // Do not hide if search input is focused, or modal/drawer is open, or mouse is hovering bar
    if (bar.matches(":hover") || bar.classList.contains("bbe-hover")) return;
    const searchInput = bar.querySelector(".bbe-search-input");
    if (searchInput && (document.activeElement === searchInput || searchInput.matches(":focus"))) return;

    if (!isBarHidden) {
      isBarHidden = true;
      bar.classList.add("bbe-hidden");
    }
  }

  let scrollRafTicking = false;
  window.addEventListener("scroll", () => {
    if (scrollRafTicking) return;
    scrollRafTicking = true;
    requestAnimationFrame(() => {
      scrollRafTicking = false;

      if (S.toolbarBehavior === "static" || S.toolbarBehavior === "floating") {
        showBar();
        return;
      }
      const currentScrollY = window.scrollY;

      // At top of chapter: always keep visible in home position
      if (currentScrollY <= 45) {
        showBar();
        lastScrollY = currentScrollY;
        return;
      }

      const delta = currentScrollY - lastScrollY;

      // Scrolling down -> tuck bar away so scripture is 100% unobstructed
      if (delta > SCROLL_THRESHOLD) {
        hideBar();
      }
      // Scrolling up -> reveal bar
      else if (delta < -SCROLL_THRESHOLD) {
        showBar();
      }

      lastScrollY = currentScrollY;
    });
  }, { passive: true });

  // Top Edge Hover: Moving mouse to top 36px of screen reveals the bar without needing to scroll (throttled with rAF)
  let windowMouseMoveRaf = null;
  window.addEventListener("mousemove", (e) => {
    if (S.toolbarBehavior === "static" || S.toolbarBehavior === "floating") return;
    const clientY = e.clientY;

    if (windowMouseMoveRaf) return;
    windowMouseMoveRaf = requestAnimationFrame(() => {
      windowMouseMoveRaf = null;
      const bar = document.getElementById("bbe-bar");
      if (!bar) return;

      if (clientY <= 36) {
        showBar();
      } else if (clientY > 90 && window.scrollY > 45 && !isBarHidden) {
        bar.classList.remove("bbe-hover");
        // If mouse moved away from top into reading area while scrolled down,
        // gently tuck bar away after 1.2s grace period so it doesn't linger over text
        if (!topHoverTimeout) {
          const searchInput = bar.querySelector(".bbe-search-input");
          if (!searchInput || document.activeElement !== searchInput) {
            topHoverTimeout = setTimeout(() => {
              topHoverTimeout = null;
              if (window.scrollY > 45 && !bar.matches(":hover")) {
                hideBar();
              }
            }, 1200);
          }
        }
      }
    });
  }, { passive: true });

  // Single global listener to close open toolbar popovers on outside click (avoids leaking listeners per render)
  document.addEventListener("click", (e) => {
    document.querySelectorAll(".bbe-versions-popover.open").forEach(pop => {
      if (!pop.closest(".bbe-popover-wrap")?.contains(e.target)) {
        pop.classList.remove("open");
      }
    });
    document.querySelectorAll(".bbe-width-popover.open").forEach(pop => {
      if (!pop.closest(".bbe-width-wrap")?.contains(e.target)) {
        pop.classList.remove("open");
      }
    });
    document.querySelectorAll(".bbe-aa-popover.open").forEach(pop => {
      if (!pop.closest(".bbe-aa-wrap")?.contains(e.target)) {
        pop.classList.remove("open");
      }
    });
  });

  function clampPopoverPosition(pop) {
    if (!pop || !pop.classList.contains("open")) return;
    pop.style.left = "50%";
    pop.style.right = "auto";
    pop.style.transform = "translateX(-50%)";
    const rect = pop.getBoundingClientRect();
    const pad = 12;
    if (rect.right > window.innerWidth - pad) {
      const overflow = rect.right - (window.innerWidth - pad);
      pop.style.transform = `translateX(calc(-50% - ${Math.ceil(overflow)}px))`;
    } else if (rect.left < pad) {
      const overflow = pad - rect.left;
      pop.style.transform = `translateX(calc(-50% + ${Math.ceil(overflow)}px))`;
    }
  }

  function buildGroupedVersionPopover({ id, title, allVers, selectedKeys, minSelected = 1, presets = [], onToggle, wasOtherOpen = false }) {
    const popover = document.createElement("div");
    popover.className = "bbe-versions-popover";
    if (id) popover.id = id;

    const header = document.createElement("div");
    header.className = "bbe-popover-title";
    const titleSpan = document.createElement("span");
    titleSpan.textContent = title;
    header.appendChild(titleSpan);

    if (presets.length > 0) {
      const presetsWrap = document.createElement("div");
      presetsWrap.className = "bbe-popover-presets";
      for (const preset of presets) {
        const pBtn = document.createElement("button");
        pBtn.type = "button";
        pBtn.className = "bbe-popover-preset-btn" + (preset.active ? " active" : "");
        pBtn.textContent = preset.label;
        if (preset.title) pBtn.title = preset.title;
        pBtn.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await preset.onClick();
        });
        presetsWrap.appendChild(pBtn);
      }
      header.appendChild(presetsWrap);
    }
    popover.appendChild(header);

    const selectedSet = new Set(selectedKeys);
    const groups = bbeGroupVersions(allVers, S.userTranslations);

    const createPillGrid = (keys) => {
      const grid = document.createElement("div");
      grid.className = "bbe-popover-grid";
      for (const verKey of keys) {
        const v = allVers[verKey];
        if (!v) continue;
        const pill = document.createElement("span");
        const isSel = selectedSet.has(verKey);
        pill.className = "bbe-popover-pill notranslate" + (isSel ? " active" : "");
        pill.setAttribute("translate", "no");
        pill.textContent = (isSel ? "✓ " : "") + verKey;
        pill.title = v.name;
        pill.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (selectedSet.has(verKey)) {
            if (selectedSet.size > minSelected) {
              selectedSet.delete(verKey);
            }
          } else {
            selectedSet.add(verKey);
          }
          const updated = Object.keys(allVers).filter(k => selectedSet.has(k));
          await onToggle(updated);
        });
        grid.appendChild(pill);
      }
      return grid;
    };

    if (groups.english.length > 0) {
      const engLabel = document.createElement("div");
      engLabel.className = "bbe-popover-section-label";
      engLabel.textContent = "English";
      popover.appendChild(engLabel);
      popover.appendChild(createPillGrid(groups.english));
    }

    if (groups.custom.length > 0) {
      const custLabel = document.createElement("div");
      custLabel.className = "bbe-popover-section-label";
      custLabel.textContent = "Custom";
      popover.appendChild(custLabel);
      popover.appendChild(createPillGrid(groups.custom));
    }

    if (groups.other.length > 0) {
      const otherSelectedCount = groups.other.filter(k => selectedSet.has(k)).length;
      const details = document.createElement("details");
      details.className = "bbe-popover-lang-details";
      if (wasOtherOpen || otherSelectedCount > 0) {
        details.open = true;
      }
      const summary = document.createElement("summary");
      summary.className = "bbe-popover-lang-summary";
      summary.textContent = otherSelectedCount > 0
        ? `Other Languages (${otherSelectedCount}/${groups.other.length})`
        : `Other Languages (${groups.other.length})`;
      summary.addEventListener("click", (e) => e.stopPropagation());
      details.appendChild(summary);
      details.appendChild(createPillGrid(groups.other));
      popover.appendChild(details);
    }

    const footer = document.createElement("div");
    footer.className = "bbe-popover-footer";
    const shortcutsLink = document.createElement("button");
    shortcutsLink.type = "button";
    shortcutsLink.className = "bbe-popover-link-btn";
    shortcutsLink.style.cssText = "display:inline-flex;align-items:center;justify-content:center;gap:5px;";
    shortcutsLink.innerHTML = `${BBE_ICONS.keyboard(13)}<span>Edit Shortcuts &amp; Versions</span>`;
    shortcutsLink.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      popover.classList.remove("open");
      openExtensionOptionsTab("shortcuts");
    });
    footer.appendChild(shortcutsLink);
    popover.appendChild(footer);

    return popover;
  }

  function renderToolbar(p) {
    if (S.hideSwitcher || !S.enabled) {
      document.getElementById("bbe-bar")?.remove();
      return;
    }

    let bar = document.getElementById("bbe-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "bbe-bar";
      bar.addEventListener("mouseenter", () => {
        bar.classList.add("bbe-hover");
        showBar();
      });
      bar.addEventListener("mouseleave", () => {
        bar.classList.remove("bbe-hover");
      });
      const textContainer = getTextEl() ||
                            document.querySelector('[class*="max-w-[600px]"]');
      const readerCol = textContainer ? (textContainer.closest('.mx-auto') || textContainer.parentElement) : null;
      if (readerCol && readerCol.parentElement) {
        readerCol.parentElement.insertBefore(bar, readerCol);
      } else {
        const targetContainer = textContainer || document.querySelector('main') || document.body;
        if (targetContainer === document.body) {
          document.body.prepend(bar);
        } else {
          targetContainer.parentElement.insertBefore(bar, targetContainer);
        }
      }
    } else {
      const textContainer = getTextEl() ||
                            document.querySelector('[class*="max-w-[600px]"]');
      const readerCol = textContainer ? (textContainer.closest('.mx-auto') || textContainer.parentElement) : null;
      if (readerCol && readerCol.parentElement && bar.parentElement !== readerCol.parentElement) {
        readerCol.parentElement.insertBefore(bar, readerCol);
      }
    }

    if (isBarHidden && S.toolbarBehavior !== "static" && S.toolbarBehavior !== "floating") {
      bar.classList.add("bbe-hidden");
    } else {
      bar.classList.remove("bbe-hidden");
    }

    const wasToolbarPopOpen = !!bar.querySelector("#bbe-toolbar-versions-popover.open");
    const wasToolbarOtherOpen = !!bar.querySelector("#bbe-toolbar-versions-popover .bbe-popover-lang-details[open]");
    const wasComparePopOpen = !!bar.querySelector("#bbe-compare-versions-popover.open");
    const wasCompareOtherOpen = !!bar.querySelector("#bbe-compare-versions-popover .bbe-popover-lang-details[open]");

    bar.replaceChildren();

    const allVers = getAllVersions();
    const activeKey = bbeKeyForId(p.id, allVers) || p.abbr || "NIV";
    const bookTitle = getPageBookTitle(p);

    // --- Main Row ---
    const mainRow = document.createElement("div");
    mainRow.className = "bbe-row";

    // 1. Left Section: Passage / Search Input Pill (Scripture input, same as BibleGateway & stock Bible.com)
    const leftSec = document.createElement("div");
    leftSec.className = "bbe-section bbe-passage-section";

    const passagePill = document.createElement("div");
    passagePill.className = "bbe-passage-badge bbe-search-wrap";

    const searchIcon = document.createElement("span");
    searchIcon.className = "bbe-search-icon";
    searchIcon.innerHTML = BBE_ICONS.search(13);

    const currentPassageTitle = p.verses ? `${bookTitle} ${p.chapter}:${p.verses}` : `${bookTitle} ${p.chapter}`;

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = "bbe-search-input bbe-passage-title";
    searchInput.value = currentPassageTitle;
    searchInput.size = Math.max(8, currentPassageTitle.length);
    searchInput.placeholder = "Search scripture or topic…";
    searchInput.title = `Current Scripture: ${currentPassageTitle} • Click to search or jump to passage`;
    searchInput.autocomplete = "off";
    searchInput.spellcheck = false;

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "bbe-search-clear";
    clearBtn.textContent = "×";
    clearBtn.title = "Clear";
    clearBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
    });
    clearBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      searchInput.value = "";
      clearBtn.classList.remove("active");
      searchInput.focus();
    });

    // Quick Study Dropdown (shown only for the very first 3 times, then retired)
    const quickStudyCount = Number(S.quickStudyShowCount) || 0;
    const shouldShowQuickStudy = quickStudyCount < 3;
    let dropdown = null;

    if (shouldShowQuickStudy) {
      dropdown = document.createElement("div");
      dropdown.className = "bbe-search-dropdown";
      dropdown.innerHTML = `
        <div class="bbe-dropdown-title">Quick Study Passages</div>
        <div class="bbe-quick-links">
          <span class="bbe-quick-chip">Genesis 1</span>
          <span class="bbe-quick-chip">Psalm 23</span>
          <span class="bbe-quick-chip">Proverbs 3</span>
          <span class="bbe-quick-chip">Matthew 5</span>
          <span class="bbe-quick-chip">John 1</span>
          <span class="bbe-quick-chip">John 3:16</span>
          <span class="bbe-quick-chip">Romans 8</span>
          <span class="bbe-quick-chip">1 Corinthians 13</span>
          <span class="bbe-quick-chip">Ephesians 6</span>
          <span class="bbe-quick-chip">Hebrews 11</span>
        </div>
      `;

      dropdown.querySelectorAll(".bbe-quick-chip").forEach(chip => {
        chip.addEventListener("mousedown", (e) => {
          e.preventDefault();
          executeSearch(chip.textContent, p, activeKey);
        });
      });
    }

    let justFocused = false;
    searchInput.addEventListener("focus", () => {
      bar.classList.add("bbe-focused");
      if (dropdown && (Number(S.quickStudyShowCount) || 0) < 3) {
        dropdown.classList.add("open");
        S.quickStudyShowCount = (Number(S.quickStudyShowCount) || 0) + 1;
        bbeSave({ quickStudyShowCount: S.quickStudyShowCount });
      }
      if (searchInput.value) {
        clearBtn.classList.add("active");
      }
      justFocused = true;
      try { searchInput.select(); } catch (_) {}
      setTimeout(fitBarWidth, 50);
    });

    searchInput.addEventListener("click", () => {
      if (justFocused) {
        try { searchInput.select(); } catch (_) {}
        justFocused = false;
      }
    });

    passagePill.addEventListener("click", (e) => {
      if (e.target !== clearBtn && (!dropdown || !dropdown.contains(e.target))) {
        searchInput.focus();
      }
    });

    searchInput.addEventListener("input", () => {
      clearBtn.classList.toggle("active", !!searchInput.value);
    });

    searchInput.addEventListener("blur", () => {
      justFocused = false;
      bar.classList.remove("bbe-focused");
      clearBtn.classList.remove("active");
      if (dropdown) {
        setTimeout(() => dropdown.classList.remove("open"), 200);
      }
      if (!searchInput.value.trim()) {
        searchInput.value = currentPassageTitle;
      }
      setTimeout(fitBarWidth, 50);
    });

    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const query = searchInput.value.trim();
        if (query) {
          executeSearch(query, p, activeKey);
        }
      } else if (e.key === "Escape") {
        searchInput.value = currentPassageTitle;
        searchInput.blur();
        if (dropdown) dropdown.classList.remove("open");
      }
    });

    passagePill.appendChild(searchIcon);
    passagePill.appendChild(searchInput);
    passagePill.appendChild(clearBtn);
    if (dropdown) {
      passagePill.appendChild(dropdown);
    }

    leftSec.appendChild(passagePill);
    mainRow.appendChild(leftSec);

    // 2. Center Section: Version Switcher Segmented Pills with Dynamic Shortcut Hints & Customizer
    const centerSec = document.createElement("div");
    centerSec.className = "bbe-section bbe-versions-section";

    const activeToolbarList = (S.toolbarVersions && S.toolbarVersions.length > 0)
      ? S.toolbarVersions.filter(k => allVers[k])
      : ["ESV", "NIV", "NASB", "NLT", "BSB", "NKJV", "KJV"];

    // Ensure the currently active translation has a visible pill
    const displayVersions = [...activeToolbarList];
    if (activeKey && allVers[activeKey] && !displayVersions.includes(activeKey)) {
      displayVersions.push(activeKey);
    }

    for (const key of displayVersions) {
      const v = allVers[key];
      if (!v) continue;
      const isCur = (key === activeKey || v.id === p.id);
      
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bbe-btn bbe-version-btn notranslate" + (isCur ? " bbe-active" : "");
      btn.setAttribute("translate", "no");
      btn.dataset.version = key;
      const hint = bbeGetKeyHintForVersion(key, S.customShortcuts);
      btn.title = `${v.name}${hint ? " (Shortcut: " + hint + ")" : ""}`;
      
      const labelSpan = document.createElement("span");
      labelSpan.textContent = key;
      btn.appendChild(labelSpan);

      // Key shortcut badge
      if (hint && S.enableKeyShortcuts) {
        const hintSpan = document.createElement("span");
        hintSpan.className = "bbe-key-hint notranslate";
        hintSpan.setAttribute("translate", "no");
        hintSpan.textContent = hint;
        btn.appendChild(hintSpan);
      }

      btn.addEventListener("mouseenter", () => {
        if (!isCur) {
          fetchChapter(key, p).catch(() => {});
          if (allVers[key]?.id) {
            fetchCloudHighlightsForChapter(`${p.book}.${p.chapter}`, allVers[key].id, false, { isPrefetch: true });
          }
        }
      });

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        switchToVersion(key, p);
      });

      centerSec.appendChild(btn);
    }

    // Add '+' quick customizer button & dropdown popover
    const popoverWrap = document.createElement("div");
    popoverWrap.className = "bbe-popover-wrap";

    const customizeBtn = document.createElement("button");
    customizeBtn.type = "button";
    customizeBtn.className = "bbe-customize-btn";
    customizeBtn.textContent = "+";
    customizeBtn.title = "Customize which translation buttons appear on the top pill";

    const popover = buildGroupedVersionPopover({
      id: "bbe-toolbar-versions-popover",
      title: "Choose Translations",
      allVers,
      selectedKeys: activeToolbarList,
      minSelected: 1,
      wasOtherOpen: wasToolbarOtherOpen,
      onToggle: async (updated) => {
        await bbeSave({ toolbarVersions: updated });
      }
    });
    if (wasToolbarPopOpen) {
      popover.classList.add("open");
    }

    customizeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.querySelectorAll(".bbe-versions-popover.open").forEach(other => {
        if (other !== popover) other.classList.remove("open");
      });
      popover.classList.toggle("open");
      clampPopoverPosition(popover);
    });

    popoverWrap.appendChild(customizeBtn);
    popoverWrap.appendChild(popover);
    centerSec.appendChild(popoverWrap);

    mainRow.appendChild(centerSec);

    // 3. Right Section: Compare, Width, Typography, Clean View
    const rightSec = document.createElement("div");
    rightSec.className = "bbe-section bbe-tools-section";

    // Compare Button
    const compareBtn = createBtn(
      S.compareOn ? "Comparing" : "Compare",
      "Toggle side-by-side translation comparison",
      async () => {
        await bbeSave({ compareOn: !S.compareOn });
      },
      S.compareOn,
      false,
      BBE_ICONS.compare(13)
    );
    rightSec.appendChild(compareBtn);

    // Commentary Drawer Button
    const commBtn = createBtn(
      isDrawerOpen ? "Commentary On" : "Commentary",
      "Open study drawer (C: Commentary, R: Cross-References)",
      () => {
        if (isDrawerOpen) {
          closeCommentaryDrawer();
        } else {
          openCommentaryDrawer(p.book, p.chapter, getContextualStudyVerse(p));
        }
      },
      isDrawerOpen,
      true,
      BBE_ICONS.book(13)
    );
    rightSec.appendChild(commBtn);

    // Word Study Mode Toggle Button
    const wordStudyBtn = createBtn(
      S.wordStudyMode ? "Word Study On" : "Word Study",
      "Toggle Strong's Greek/Hebrew word study mode (Shortcut: W)",
      async () => {
        const next = !S.wordStudyMode;
        await bbeSave({ wordStudyMode: next });
        showToast(next ? "Word Study mode activated. Hover or click words for Strong's lexicon." : "Word Study mode deactivated.", { icon: "lexicon" });
      },
      S.wordStudyMode,
      true,
      BBE_ICONS.lexicon(13)
    );
    wordStudyBtn.classList.add("bbe-wordstudy-btn");
    rightSec.appendChild(wordStudyBtn);

    // Sermon Mode ("Look at the Book" Markup) Toggle Button — Lazy-loaded only when toggled on
    if (S.showSermonBtn !== false) {
      const isSermonActive = Boolean(window.BBE_SERMON && window.BBE_SERMON.isActive());
      const sermonBtn = createBtn(
        isSermonActive ? "Sermon On" : "Sermon",
        S.compareOn
          ? "Sermon Mode is not available in Compare Mode (exit Compare first)"
          : "Toggle Sermon Mode ('Look at the Book' word circles, underlines, arrows & handwritten notes)",
        async () => {
          if (S.compareOn) {
            showToast("Exit Compare Mode first to use Sermon Mode", { icon: "sermon" });
            return;
          }
          const sm = await ensureSermonModeLoaded();
          if (sm) sm.toggle();
        },
        isSermonActive,
        true,
        BBE_ICONS.sermon(13)
      );
      sermonBtn.classList.add("bbe-sermon-btn");
      if (S.compareOn) {
        sermonBtn.style.opacity = "0.45";
        sermonBtn.style.cursor = "not-allowed";
      }
      rightSec.appendChild(sermonBtn);
    }

    const sep1 = document.createElement("span");
    sep1.className = "bbe-sep";
    rightSec.appendChild(sep1);

    // Unified Aa Reader Menu (Appearance: Column Width, Text Size, Font Family, Theme Swatches + Retire to Settings)
    if (S.showAaMenu !== false) {
      const curFont = S.fontFamily || "serif";
      const curTheme = S.readerTheme || "system";
      const curFontSize = S.fontSize || 100;
      const sizePct = Math.max(0, Math.min(100, Math.round(((curFontSize - 70) / (180 - 70)) * 100)));
      const curWidth = S.columnWidth || 950;
      let widthLabel = "950px";
      if (Math.abs(curWidth - 750) < 40) widthLabel = "750px";
      else if (Math.abs(curWidth - 950) < 40) widthLabel = "950px";
      else if (Math.abs(curWidth - 1200) < 40) widthLabel = "1200px";
      else if (Math.abs(curWidth - 1800) < 40) widthLabel = "Max (1800px)";
      else widthLabel = curWidth + "px";

      const prettyFonts = {
        serif: "Classic Book Serif",
        sans: "Modern Clean Sans",
        mono: "Warm Monospace",
        dyslexic: "Dyslexia Friendly"
      };

      const prettyThemes = {
        system: "System Default",
        sepia: "Warm Paper (Sepia)",
        light: "Clean Light",
        dark: "Night Dark",
        oled: "OLED Pitch Black",
        blue: "Midnight Navy",
        green: "Sage Herb",
        historical: "Historical (Ancient Scroll)"
      };

      const aaWrap = document.createElement("div");
      aaWrap.className = "bbe-aa-wrap";

      const aaBtn = document.createElement("button");
      aaBtn.type = "button";
      aaBtn.className = "bbe-btn bbe-btn-sm bbe-aa-btn";
      aaBtn.title = `Reader Appearance: ${curWidth}px • ${prettyFonts[curFont] || curFont} • ${prettyThemes[curTheme] || curTheme} (${curFontSize}%) (hover to customize)`;
      aaBtn.innerHTML = `<span class="bbe-aa-label">Aa</span><span class="bbe-aa-caret">▾</span>`;

      const aaPop = document.createElement("div");
      aaPop.className = "bbe-aa-popover";
      aaPop.innerHTML = `
        <!-- 1. Column Width -->
        <div class="bbe-aa-section">
          <div class="bbe-aa-label-row">
            <span class="bbe-aa-title">Column Width</span>
            <span class="bbe-aa-val" id="bbe-aa-width-val">${widthLabel}</span>
          </div>
          <div class="bbe-aa-width-row">
            <button type="button" class="bbe-popover-pill ${Math.abs(curWidth - 750) < 40 ? 'active' : ''}" data-width="750" title="750px — Standard readable column">750</button>
            <button type="button" class="bbe-popover-pill ${Math.abs(curWidth - 950) < 40 ? 'active' : ''}" data-width="950" title="950px — Optimal comfortable reading">950</button>
            <button type="button" class="bbe-popover-pill ${Math.abs(curWidth - 1200) < 40 ? 'active' : ''}" data-width="1200" title="1200px — Wide widescreen view">1200</button>
            <button type="button" class="bbe-popover-pill ${Math.abs(curWidth - 1800) < 40 ? 'active' : ''}" data-width="1800" title="Max (1800px) — Full viewport span">Max</button>
          </div>
        </div>

        <!-- 2. Text Size -->
        <div class="bbe-aa-section">
          <div class="bbe-aa-label-row">
            <span class="bbe-aa-title">Text Size</span>
            <span class="bbe-aa-val" id="bbe-aa-size-val">${curFontSize}%</span>
          </div>
          <div class="bbe-aa-size-controls">
            <button type="button" class="bbe-popover-pill bbe-aa-size-btn" id="bbe-aa-dec-btn" title="Decrease text size (A-)">A-</button>
            <div class="bbe-aa-size-bar">
              <div class="bbe-aa-size-fill" id="bbe-aa-size-fill" style="width:${sizePct}%;"></div>
            </div>
            <button type="button" class="bbe-popover-pill bbe-aa-size-btn" id="bbe-aa-inc-btn" title="Increase text size (A+)">A+</button>
          </div>
        </div>

        <!-- 3. Font Family -->
        <div class="bbe-aa-section">
          <div class="bbe-aa-title">Font</div>
          <div class="bbe-aa-font-row">
            <button type="button" class="bbe-popover-pill ${curFont === 'serif' ? 'active' : ''}" data-font="serif" style="font-family:Georgia,serif;">Serif</button>
            <button type="button" class="bbe-popover-pill ${curFont === 'sans' ? 'active' : ''}" data-font="sans" style="font-family:system-ui,sans-serif;">Sans</button>
            <button type="button" class="bbe-popover-pill ${curFont === 'mono' ? 'active' : ''}" data-font="mono" style="font-family:monospace;">Mono</button>
            <button type="button" class="bbe-popover-pill ${curFont === 'dyslexic' ? 'active' : ''}" data-font="dyslexic" style="font-family:OpenDyslexic,sans-serif;">Dyslexic</button>
          </div>
        </div>

        <!-- 4. Theme Palette -->
        <div class="bbe-aa-section">
          <div class="bbe-aa-label-row">
            <span class="bbe-aa-title">Theme</span>
            <span class="bbe-aa-theme-name" id="bbe-aa-theme-name">${prettyThemes[curTheme] || curTheme}</span>
          </div>
          <div class="bbe-aa-theme-grid">
            <button type="button" class="bbe-theme-swatch swatch-system ${curTheme === 'system' ? 'active' : ''}" data-theme="system" title="System Default">${BBE_ICONS.themeSystem(13)}</button>
            <button type="button" class="bbe-theme-swatch swatch-sepia ${curTheme === 'sepia' ? 'active' : ''}" data-theme="sepia" title="Warm Paper (Sepia)">${BBE_ICONS.themeSepia(12)}</button>
            <button type="button" class="bbe-theme-swatch swatch-light ${curTheme === 'light' ? 'active' : ''}" data-theme="light" title="Clean Light">${BBE_ICONS.themeLight(13)}</button>
            <button type="button" class="bbe-theme-swatch swatch-dark ${curTheme === 'dark' ? 'active' : ''}" data-theme="dark" title="Night Dark">${BBE_ICONS.themeDark(12)}</button>
            <button type="button" class="bbe-theme-swatch swatch-oled ${curTheme === 'oled' ? 'active' : ''}" data-theme="oled" title="OLED Pitch Black">${BBE_ICONS.themeOled(13)}</button>
            <button type="button" class="bbe-theme-swatch swatch-blue ${curTheme === 'blue' ? 'active' : ''}" data-theme="blue" title="Midnight Navy">${BBE_ICONS.themeBlue(13)}</button>
            <button type="button" class="bbe-theme-swatch swatch-green ${curTheme === 'green' ? 'active' : ''}" data-theme="green" title="Sage Herb">${BBE_ICONS.themeGreen(12)}</button>
            <button type="button" class="bbe-theme-swatch swatch-historical ${curTheme === 'historical' ? 'active' : ''}" data-theme="historical" title="Ancient Manuscript (Historical)">${BBE_ICONS.themeHistorical(12)}</button>
          </div>
        </div>

        <!-- 5. Footer: Retire to Settings -->
        <div class="bbe-popover-footer" style="padding-top:2px;">
          <button type="button" class="bbe-popover-link-btn bbe-retire-aa-btn" id="bbe-retire-aa-btn" title="Permanently retire Aa reader menu to extension settings and remove it from the main pill">
            ${BBE_ICONS.settings(12)}<span>Retire to Settings (Remove from pill)</span>
          </button>
        </div>
      `;

      // 0. Column Width Presets
      const widthValEl = aaPop.querySelector("#bbe-aa-width-val");
      aaPop.querySelectorAll(".bbe-aa-width-row .bbe-popover-pill").forEach(chip => {
        chip.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const targetWidth = parseInt(chip.dataset.width, 10);
          S.columnWidth = targetWidth;
          syncDomClasses();
          await bbeSave({ columnWidth: targetWidth });
          aaPop.querySelectorAll(".bbe-aa-width-row .bbe-popover-pill").forEach(c => c.classList.remove("active"));
          chip.classList.add("active");
          const lbl = targetWidth === 1800 ? "Max (1800px)" : targetWidth + "px";
          if (widthValEl) widthValEl.textContent = lbl;
          aaBtn.title = `Reader Appearance: ${lbl} • ${prettyFonts[S.fontFamily || "serif"] || S.fontFamily} • ${prettyThemes[S.readerTheme || "system"] || S.readerTheme} (${S.fontSize || 100}%) (hover to customize)`;
          showToast(`Column Width: ${lbl}`);
        });
      });

      // 1. Text Size A- / A+
      const sizeValEl = aaPop.querySelector("#bbe-aa-size-val");
      const sizeFillEl = aaPop.querySelector("#bbe-aa-size-fill");

      const updateFontSizeLive = async (newSize) => {
        S.fontSize = newSize;
        syncDomClasses();
        await bbeSave({ fontSize: newSize });
        if (sizeValEl) sizeValEl.textContent = newSize + "%";
        if (sizeFillEl) {
          const p = Math.max(0, Math.min(100, Math.round(((newSize - 70) / (180 - 70)) * 100)));
          sizeFillEl.style.width = p + "%";
        }
        showToast(`Text Size: ${newSize}%`);
      };

      aaPop.querySelector("#bbe-aa-dec-btn")?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = Math.max(70, (S.fontSize || 100) - 10);
        updateFontSizeLive(next);
      });

      aaPop.querySelector("#bbe-aa-inc-btn")?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = Math.min(180, (S.fontSize || 100) + 10);
        updateFontSizeLive(next);
      });

      // 2. Font Family Chips
      aaPop.querySelectorAll(".bbe-aa-font-row .bbe-popover-pill").forEach(chip => {
        chip.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const font = chip.dataset.font;
          S.fontFamily = font;
          syncDomClasses();
          await bbeSave({ fontFamily: font });
          aaPop.querySelectorAll(".bbe-aa-font-row .bbe-popover-pill").forEach(c => c.classList.remove("active"));
          chip.classList.add("active");
          showToast(`Font: ${prettyFonts[font] || font}`);
          lastRenderKey = "";
          renderToolbar(p);
        });
      });

      // 3. Theme Swatches
      const themeNameEl = aaPop.querySelector("#bbe-aa-theme-name");
      aaPop.querySelectorAll(".bbe-theme-swatch").forEach(swatch => {
        swatch.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const theme = swatch.dataset.theme;
          S.readerTheme = theme;
          syncDomClasses();
          await bbeSave({ readerTheme: theme });
          aaPop.querySelectorAll(".bbe-theme-swatch").forEach(s => s.classList.remove("active"));
          swatch.classList.add("active");
          if (themeNameEl) themeNameEl.textContent = prettyThemes[theme] || theme;
          showToast(`Theme: ${prettyThemes[theme] || theme}`);
          lastRenderKey = "";
          renderToolbar(p);
        });
      });

      // 4. Retire Aa Menu to Settings
      const retireAaBtn = aaPop.querySelector("#bbe-retire-aa-btn");
      if (retireAaBtn) {
        retireAaBtn.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          S.showAaMenu = false;
          await bbeSave({ showAaMenu: false });
          showToast("Aa Reader Menu retired. Restore anytime in Settings > Typography & Themes.", { icon: "settings" });
          aaPop.classList.remove("open");
          lastRenderKey = "";
          renderToolbar(p);
        });
      }

      // Smooth hover with grace period
      let aaCloseTimer = null;
      aaWrap.addEventListener("mouseenter", () => {
        clearTimeout(aaCloseTimer);
        aaPop.classList.add("open");
      });
      aaWrap.addEventListener("mouseleave", () => {
        clearTimeout(aaCloseTimer);
        aaCloseTimer = setTimeout(() => {
          aaPop.classList.remove("open");
        }, 160);
      });

      aaBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        aaPop.classList.toggle("open");
      });

      aaWrap.appendChild(aaBtn);
      aaWrap.appendChild(aaPop);
      rightSec.appendChild(aaWrap);

      const sepEnd = document.createElement("span");
      sepEnd.className = "bbe-sep";
      rightSec.appendChild(sepEnd);
    }

    // Clean View Toggle (1-click hide/show distractions)
    const isCleanView = S.hideHeader && S.hideSidebar && S.hideDistractionCards && S.hideFooter;
    rightSec.appendChild(createBtn(isCleanView ? "Clean View On" : "Clean View", "Toggle clean reading view (distraction-free)", async () => {
      const turnOn = !isCleanView;
      await bbeSave({
        hideHeader: turnOn,
        hideSidebar: turnOn,
        hideDistractionCards: turnOn,
        hideFooter: turnOn,
        hideBottomBar: turnOn,
        hideCopyright: turnOn
      });
    }, isCleanView, true, BBE_ICONS.eye(13)));

    // Settings Button (opens Full Settings page)
    const settingsBtn = createBtn("Settings", "Open Deep Bible Settings", () => {
      openExtensionOptionsTab();
    }, false, true, BBE_ICONS.settings(13));
    settingsBtn.classList.add("bbe-settings-btn");
    rightSec.appendChild(settingsBtn);

    mainRow.appendChild(rightSec);
    bar.appendChild(mainRow);

    // --- Secondary Row (Only when Compare is Active) ---
    if (S.compareOn) {
      const compRow = document.createElement("div");
      compRow.id = "bbe-compare-options";

      const compLabel = document.createElement("span");
      compLabel.className = "bbe-label";
      compLabel.textContent = "Compare:";
      compRow.appendChild(compLabel);

      const isInter = S.compareLayout === "interleaved";
      const layoutToggleBtn = createBtn(
        isInter ? "Interleaved" : "Columns",
        "Toggle comparison layout: Columns (whole chapters) vs Interleaved (verse-by-verse)",
        async () => {
          await bbeSave({ compareLayout: isInter ? "columns" : "interleaved" });
        },
        true,
        true,
        isInter ? BBE_ICONS.interleaved(13) : BBE_ICONS.columns(13)
      );
      compRow.appendChild(layoutToggleBtn);

      const sep = document.createElement("div");
      sep.className = "bbe-sep";
      compRow.appendChild(sep);

      const defaultCompareBar = (typeof BBE_ENGLISH_VERSIONS !== "undefined" && BBE_ENGLISH_VERSIONS.length > 0)
        ? BBE_ENGLISH_VERSIONS
        : ["ESV", "NIV", "NASB", "NLT", "BSB", "NKJV", "KJV", "CSB", "AMP", "NET", "NRSVUE", "LSB"];

      const activeCompareBarList = (Array.isArray(S.compareBarVersions) && S.compareBarVersions.length > 0)
        ? S.compareBarVersions.filter(k => allVers[k])
        : defaultCompareBar.filter(k => allVers[k]);

      const selSet = new Set(S.compareVersions || ["NIV", "ESV"]);

      // Ensure any currently compared translation stays visible so it can be seen & untoggled
      const displayCompareBar = [...activeCompareBarList];
      for (const activeCmpKey of selSet) {
        if (allVers[activeCmpKey] && !displayCompareBar.includes(activeCmpKey)) {
          displayCompareBar.push(activeCmpKey);
        }
      }

      for (const key of displayCompareBar) {
        const isSelected = selSet.has(key);
        compRow.appendChild(createBtn(
          (isSelected ? "✓ " : "") + key,
          "Toggle " + (allVers[key]?.name || key),
          async () => {
            if (selSet.has(key)) {
              if (selSet.size > 1) selSet.delete(key);
            } else {
              selSet.add(key);
            }
            const ordered = Object.keys(allVers).filter(k => selSet.has(k));
            await bbeSave({ compareVersions: ordered });
          },
          isSelected,
          true
        ));
      }

      // Add '+' quick customizer button & popover for Compare Bar translations
      const compPopWrap = document.createElement("div");
      compPopWrap.className = "bbe-popover-wrap";

      const compCustomizeBtn = document.createElement("button");
      compCustomizeBtn.type = "button";
      compCustomizeBtn.className = "bbe-customize-btn";
      compCustomizeBtn.textContent = "+";
      compCustomizeBtn.title = "Customize which translations appear on the Compare bar";

      const sameKeys = (a, b) => a.length === b.length && a.every((k, i) => k === b[i]);
      const allKeys = Object.keys(allVers);
      const englishKeys = defaultCompareBar.filter(k => allVers[k]);

      const compPopover = buildGroupedVersionPopover({
        id: "bbe-compare-versions-popover",
        title: "Compare Bar",
        allVers,
        selectedKeys: activeCompareBarList,
        minSelected: 1,
        wasOtherOpen: wasCompareOtherOpen,
        presets: [
          {
            label: "English",
            title: "Show English translations only",
            active: sameKeys(activeCompareBarList, englishKeys),
            onClick: async () => {
              await bbeSave({ compareBarVersions: englishKeys });
            }
          },
          {
            label: "Match Top",
            title: "Match the translations shown on the top pill",
            active: sameKeys(activeCompareBarList, activeToolbarList),
            onClick: async () => {
              await bbeSave({ compareBarVersions: [...activeToolbarList] });
            }
          },
          {
            label: "All",
            title: "Show all available translations",
            active: sameKeys(activeCompareBarList, allKeys),
            onClick: async () => {
              await bbeSave({ compareBarVersions: allKeys });
            }
          }
        ],
        onToggle: async (updated) => {
          await bbeSave({ compareBarVersions: updated });
        }
      });
      if (wasComparePopOpen) {
        compPopover.classList.add("open");
      }

      compCustomizeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        document.querySelectorAll(".bbe-versions-popover.open").forEach(other => {
          if (other !== compPopover) other.classList.remove("open");
        });
        compPopover.classList.toggle("open");
        clampPopoverPosition(compPopover);
      });

      compPopWrap.appendChild(compCustomizeBtn);
      compPopWrap.appendChild(compPopover);
      compRow.appendChild(compPopWrap);

      bar.appendChild(compRow);
    }

    fitBarWidth();

    // Keep any restored open popover cleanly inside the viewport
    bar.querySelectorAll(".bbe-versions-popover.open").forEach(pop => clampPopoverPosition(pop));
  }

  let barParentObserver = null;
  let observedBarParent = null;
  let lastObservedParentW = -1;
  let barFitRaf = 0;

  function ensureBarParentObserver(bar) {
    const parent = bar && bar.parentElement;
    if (!parent || typeof ResizeObserver === "undefined") return;
    if (observedBarParent === parent && barParentObserver) return;

    if (barParentObserver) {
      barParentObserver.disconnect();
    }
    observedBarParent = parent;
    lastObservedParentW = parent.clientWidth;
    barParentObserver = new ResizeObserver(() => {
      if (!observedBarParent) return;
      const w = observedBarParent.clientWidth;
      if (w === lastObservedParentW) return;
      lastObservedParentW = w;
      if (barFitRaf) cancelAnimationFrame(barFitRaf);
      barFitRaf = requestAnimationFrame(() => {
        barFitRaf = 0;
        fitBarWidth();
      });
    });
    barParentObserver.observe(parent);
  }

  function fitBarWidth() {
    const bar = document.getElementById("bbe-bar");
    if (!bar) return;

    ensureBarParentObserver(bar);

    // Reset inline max-width to allow accurate measurement of natural content widths
    bar.style.maxWidth = "min(97vw, 1400px)";

    const passageSec = bar.querySelector(".bbe-passage-section");
    const versionsSec = bar.querySelector(".bbe-versions-section");
    const toolsSec = bar.querySelector(".bbe-tools-section");
    if (!passageSec || !versionsSec || !toolsSec) return;

    const pad = 32; // bar padding (14px * 2) + border (1px * 2) + subpixel safety
    const gap = 8;

    const passageW = passageSec.offsetWidth;
    const versionsW = versionsSec.offsetWidth;
    const toolsW = toolsSec.offsetWidth;

    const singleLineWidth = passageW + gap + versionsW + gap + toolsW + pad;
    const viewportAvailable = Math.min(window.innerWidth * 0.97, 1400);
    let maxAvailable = viewportAvailable;
    const parent = bar.parentElement;
    if (parent && parent.clientWidth > 0) {
      const cs = getComputedStyle(parent);
      const parentInnerW = parent.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      if (parentInnerW > 0) {
        maxAvailable = Math.min(viewportAvailable, parentInnerW);
      }
    }

    const compRow = bar.querySelector("#bbe-compare-options");
    const compW = compRow ? (compRow.scrollWidth + pad) : 0;

    if (singleLineWidth <= maxAvailable) {
      // Everything fits on a single line
      const targetW = Math.ceil(Math.max(singleLineWidth, compW));
      bar.style.maxWidth = targetW + "px";
    } else {
      // Elements wrap: fit bar snugly to the widest line so there is no dead space
      const line1W = passageW + gap + versionsW + pad;
      const line2W = toolsW + pad;
      const widest = Math.min(maxAvailable, Math.max(line1W, line2W, compW));
      bar.style.maxWidth = Math.ceil(widest) + "px";
    }
  }

  window.addEventListener("resize", () => {
    fitBarWidth();
  }, { passive: true });

  /* ---------------- Comparison Grid & Interleaved Parallel View ---------------- */
  function removeCompare() {
    document.getElementById("bbe-compare-grid")?.remove();
    html.classList.remove("bbe-compare-active");
    const origChapter = getChapterEl();
    if (origChapter) origChapter.style.display = "";
  }

  function extractVerseMapFromHtmlOrEl(target) {
    const map = {};
    if (!target) return map;
    let container = target;
    if (typeof target === "string") {
      container = document.createElement("div");
      container.innerHTML = target;
    }
    const verseEls = Array.from(container.querySelectorAll('[class*="_verse"][data-usfm]'));
    for (const el of verseEls) {
      const usfm = el.getAttribute("data-usfm") || "";
      const parts = usfm.split(".");
      const num = parseInt(parts[parts.length - 1], 10);
      if (isNaN(num)) continue;

      const clone = el.cloneNode(true);
      clone.querySelectorAll('[class*="_label"], .bbe-verse-badge, .bbe-verse-actions-wrap, [class*="_note"], sup, .ref, [class*="_ref"]').forEach(n => n.remove());
      const text = clone.textContent.replace(/\s+/g, " ").trim();
      if (text) {
        map[num] = (map[num] ? (map[num] + " ") : "") + text;
      }
    }
    return map;
  }

  function appendGroupedSelectOptions(select, allVers, { currentKey = null, excludeKeys = [], prefix = "" } = {}) {
    const groups = bbeGroupVersions(allVers, S.userTranslations);
    const excludeSet = new Set(excludeKeys);
    const sections = [
      { label: "English", keys: groups.english },
      { label: "Custom", keys: groups.custom },
      { label: "Other Languages", keys: groups.other }
    ];
    for (const sec of sections) {
      const visibleKeys = sec.keys.filter(k => allVers[k] && !excludeSet.has(k));
      if (visibleKeys.length === 0) continue;
      const og = document.createElement("optgroup");
      og.label = sec.label;
      for (const key of visibleKeys) {
        const v = allVers[key];
        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = prefix ? `${prefix}${key} (${v.name})` : `${key} — ${v.name}`;
        if (currentKey && key === currentKey) opt.selected = true;
        og.appendChild(opt);
      }
      select.appendChild(og);
    }
  }

  function createCompareVersionSelect(currentKey, onSelectVersion) {
    const allVers = getAllVersions();
    const select = document.createElement("select");
    select.className = "bbe-compare-version-dropdown";
    select.title = "Switch translation for this slot";

    appendGroupedSelectOptions(select, allVers, { currentKey });

    select.addEventListener("change", (e) => {
      e.stopPropagation();
      onSelectVersion(select.value);
    });
    return select;
  }

  function createAddVersionSelect(currentVersions, onAddVersion) {
    const allVers = getAllVersions();
    const select = document.createElement("select");
    select.className = "bbe-add-version-select";
    select.title = "Add another translation to compare";

    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = "+ Add Translation ▾";
    defaultOpt.disabled = true;
    defaultOpt.selected = true;
    select.appendChild(defaultOpt);

    appendGroupedSelectOptions(select, allVers, { excludeKeys: currentVersions, prefix: "+ " });

    select.addEventListener("change", (e) => {
      e.stopPropagation();
      if (select.value) {
        onAddVersion(select.value);
        select.selectedIndex = 0;
      }
    });
    return select;
  }

  function renderCompare(p) {
    let grid = document.getElementById("bbe-compare-grid");
    if (!grid) {
      grid = document.createElement("div");
      grid.id = "bbe-compare-grid";
      const chapterEl = document.querySelector('[class*="_chapter"]');
      if (chapterEl && chapterEl.parentElement) {
        chapterEl.parentElement.insertBefore(grid, chapterEl);
      } else {
        const reader = getTextEl() || document.querySelector('main');
        if (reader) reader.appendChild(grid);
      }
    }

    html.classList.add("bbe-compare-active");

    const allVers = getAllVersions();
    const versions = (S.compareVersions || ["NIV", "ESV"]).filter(k => allVers[k]);
    if (versions.length === 0) versions.push("NIV", "ESV");

    grid.replaceChildren();

    const origChapter = getChapterEl();
    if (origChapter) origChapter.style.display = "none";

    // 1. Top Control Bar (Layout Toggle + Add Version + Close)
    const controlBar = document.createElement("div");
    controlBar.className = "bbe-compare-control-bar";

    const leftControls = document.createElement("div");
    leftControls.className = "bbe-compare-controls-left";

    const barLabel = document.createElement("span");
    barLabel.className = "bbe-compare-bar-label";
    barLabel.textContent = "Compare Mode:";
    leftControls.appendChild(barLabel);

    const toggleGroup = document.createElement("div");
    toggleGroup.className = "bbe-layout-toggle-group";

    const isInterleaved = S.compareLayout === "interleaved";

    const colsBtn = document.createElement("button");
    colsBtn.type = "button";
    colsBtn.className = "bbe-layout-toggle-btn" + (!isInterleaved ? " active" : "");
    colsBtn.innerHTML = `${BBE_ICONS.columns(13)}<span>Columns</span>`;
    colsBtn.title = "Side-by-side whole chapters comparison";
    colsBtn.addEventListener("click", async () => {
      if (S.compareLayout !== "columns") {
        await bbeSave({ compareLayout: "columns" });
      }
    });

    const interBtn = document.createElement("button");
    interBtn.type = "button";
    interBtn.className = "bbe-layout-toggle-btn" + (isInterleaved ? " active" : "");
    interBtn.innerHTML = `${BBE_ICONS.interleaved(13)}<span>Interleaved</span>`;
    interBtn.title = "Verse-by-verse parallel comparison";
    interBtn.addEventListener("click", async () => {
      if (S.compareLayout !== "interleaved") {
        await bbeSave({ compareLayout: "interleaved" });
      }
    });

    toggleGroup.appendChild(colsBtn);
    toggleGroup.appendChild(interBtn);
    leftControls.appendChild(toggleGroup);
    controlBar.appendChild(leftControls);

    const rightControls = document.createElement("div");
    rightControls.className = "bbe-compare-controls-right";

    const addSelect = createAddVersionSelect(versions, async (newKey) => {
      const updated = [...versions, newKey];
      await bbeSave({ compareVersions: updated });
    });
    rightControls.appendChild(addSelect);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "bbe-compare-close-btn";
    closeBtn.textContent = "✕ Close";
    closeBtn.title = "Exit compare mode";
    closeBtn.addEventListener("click", async () => {
      await bbeSave({ compareOn: false });
    });
    rightControls.appendChild(closeBtn);

    controlBar.appendChild(rightControls);
    grid.appendChild(controlBar);

    // 2. Dispatch to Columns or Interleaved view
    if (isInterleaved) {
      renderInterleavedCompare(grid, p, versions, allVers, origChapter);
    } else {
      renderColumnsCompare(grid, p, versions, allVers, origChapter);
    }
  }

  function renderColumnsCompare(container, p, versions, allVers, origChapter) {
    const colsGrid = document.createElement("div");
    colsGrid.className = "bbe-columns-grid";
    colsGrid.style.gridTemplateColumns = `repeat(${Math.max(versions.length, 1)}, minmax(0, 1fr))`;

    for (let idx = 0; idx < versions.length; idx++) {
      const key = versions[idx];
      const v = allVers[key];
      const col = document.createElement("section");
      col.className = "bbe-compare-col";
      col.dataset.versionKey = key;
      col.dataset.versionId = String(v.id);

      // Sticky Column Header
      const header = document.createElement("div");
      header.className = "bbe-compare-header";

      const titleWrap = document.createElement("div");
      titleWrap.className = "bbe-compare-title";

      // Dynamic In-place translation switcher dropdown
      const versionSelect = createCompareVersionSelect(key, async (newKey) => {
        const updated = [...versions];
        updated[idx] = newKey;
        await bbeSave({ compareVersions: updated });
      });
      titleWrap.appendChild(versionSelect);
      header.appendChild(titleWrap);

      // Actions in Header (Remove Column)
      if (versions.length > 1) {
        const actions = document.createElement("div");
        actions.className = "bbe-col-actions";

        const removeCol = document.createElement("button");
        removeCol.type = "button";
        removeCol.className = "bbe-col-btn";
        removeCol.textContent = "✕";
        removeCol.title = `Remove ${key} from comparison`;
        removeCol.addEventListener("click", async () => {
          const updated = versions.filter((_, i) => i !== idx);
          await bbeSave({ compareVersions: updated });
        });
        actions.appendChild(removeCol);
        header.appendChild(actions);
      }
      col.appendChild(header);

      // Column Body
      const body = document.createElement("div");
      body.className = "bbe-compare-body";

      const loading = document.createElement("div");
      loading.className = "bbe-compare-loading";
      loading.textContent = `Loading ${v.name}…`;
      body.appendChild(loading);
      col.appendChild(body);

      colsGrid.appendChild(col);

      // Render content immediately when ready & paint per-version cloud highlights asynchronously
      const chapterUsfm = `${p.book}.${p.chapter}`;
      if (v.id === p.id && origChapter && (!p.verses || origChapter.dataset.bbeFiltered === "1")) {
        body.replaceChildren(origChapter.cloneNode(true));
        const cloned = body.querySelector('[class*="_chapter"]');
        if (cloned) cloned.style.display = "";
        fetchCloudHighlightsForChapter(chapterUsfm, v.id, false).then((hlList) => {
          if (!body.isConnected) return;
          if (hlList && hlList.length) bbePaintHighlightsInScope(body, hlList);
          col.dataset.bbeHlLoaded = "1";
          scheduleHlRefresh();
        });
      } else {
        const hlPromise = fetchCloudHighlightsForChapter(chapterUsfm, v.id, false);
        fetchPassageHtml(key, p)
          .then((chapterRes) => {
            if (!body.isConnected) return;
            const chapterHtml = (chapterRes && typeof chapterRes.html === "string") ? chapterRes.html : String(chapterRes);
            const temp = document.createElement("div");
            temp.className = "cat7xG_chapter";
            temp.innerHTML = chapterHtml;
            body.replaceChildren(temp);
            scheduleHlRefresh();
            hlPromise.then((hlList) => {
              if (!body.isConnected) return;
              if (hlList && hlList.length) bbePaintHighlightsInScope(body, hlList);
              col.dataset.bbeHlLoaded = "1";
              scheduleHlRefresh();
            });
          })
          .catch((err) => {
            loading.textContent = `Could not load ${key} (${err.message})`;
          });
      }
    }

    container.appendChild(colsGrid);

    // ---- Copy & Cloud-Sync highlights between visible translations ----
    const HL_RGB_TO_ID = {
      "255, 254, 0": "fffe00", "254, 241, 0": "fffe00", "253, 239, 197": "fffe00",
      "93, 255, 121": "5dff79", "217, 233, 206": "5dff79",
      "0, 214, 255": "00d6ff", "186, 221, 255": "00d6ff",
      "255, 198, 111": "ffc66f", "252, 215, 182": "ffc66f",
      "255, 149, 239": "ff95ef", "245, 200, 214": "ff95ef"
    };
    const HL_ID_TO_BG = { fffe00: "#fdefc5", fef100: "#fdefc5", "5dff79": "#d9e9ce", "00d6ff": "#baddff", ffc66f: "#fcd7b6", ff95ef: "#f5c8d6" };

    const hlIdOfEl = (el) => {
      const tagged = el.getAttribute("data-bbe-temp-hl");
      if (tagged && HL_ID_TO_BG[tagged]) return tagged === "fef100" ? "fffe00" : tagged;
      const st = (el.getAttribute("style") || "").toLowerCase();
      for (const [rgb, id] of Object.entries(HL_RGB_TO_ID)) if (st.includes(rgb) || st.includes(id)) return id;
      return null;
    };

    // verse number -> highlight id, for one column
    const readColumnHighlights = (col) => {
      const map = {};
      col.querySelectorAll('[data-usfm]').forEach((vEl) => {
        const nums = extractUsfmVerseNums(vEl.getAttribute("data-usfm") || "");
        if (!nums.length) return;
        let id = hlIdOfEl(vEl);
        if (!id) {
          for (const d of vEl.querySelectorAll("[style], [data-bbe-temp-hl]")) { id = hlIdOfEl(d); if (id) break; }
        }
        if (id) nums.forEach((n) => { map[n] = id; });
      });
      return map;
    };

    const applyHighlightsToColumn = (col, map) => {
      col.querySelectorAll('[data-usfm]').forEach((vEl) => {
        const nums = extractUsfmVerseNums(vEl.getAttribute("data-usfm") || "");
        const id = nums.map((n) => map[n]).find(Boolean);
        if (!id) return;
        let contentEls = Array.from(vEl.querySelectorAll('.content, [class*="_content"]'));
        contentEls = contentEls.filter((c) => !contentEls.some((o) => o !== c && o.contains(c)));
        const targets = contentEls.length ? contentEls : [vEl];
        targets.forEach((t) => {
          t.style.backgroundColor = HL_ID_TO_BG[id];
          t.setAttribute("data-bbe-temp-hl", id);
        });
      });
    };

    const HL_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l-5 5v4h4l5-5"/><path d="M14 6l4 4"/><path d="M12 8l5-5 4 4-5 5z"/></svg>';
    let hlTimer = null;
    // Per-column "copy highlights from this version" buttons (source picker)
    function refreshCopyHlBtn() {
      const cols = Array.from(colsGrid.querySelectorAll(".bbe-compare-col"));
      const states = cols.map((c) => ({
        c,
        vid: parseInt(c.dataset.versionId, 10) || 0,
        vkey: c.dataset.versionKey || "",
        map: readColumnHighlights(c),
        loaded: !!c.querySelector("[data-usfm]")
      }));
      states.forEach((s) => {
        const actions = s.c.querySelector(".bbe-compare-header");
        if (!actions) return;
        let btn = s.c.querySelector(".bbe-copy-hl-from-btn");
        const others = states.filter((o) => o !== s && o.loaded);
        const differs = others.some((o) => Object.keys(s.map).some((n) => s.map[n] !== o.map[n]));
        if (!s.loaded || !Object.keys(s.map).length || !differs) { btn?.remove(); return; }
        if (!btn) {
          btn = document.createElement("button");
          btn.type = "button";
          btn.className = "bbe-col-btn bbe-copy-hl-from-btn";
          btn.innerHTML = `${HL_ICON}<span style="margin-left:4px">Copy highlights to other versions</span>`;
          btn.style.cssText = "display:inline-flex;align-items:center;white-space:nowrap;";
          btn.title = `Copy and save ${s.vkey} highlights to the other visible translations on Bible.com`;
          btn.addEventListener("click", async () => {
            const srcMap = readColumnHighlights(s.c);
            const otherCols = Array.from(colsGrid.querySelectorAll(".bbe-compare-col")).filter((c) => c !== s.c);
            otherCols.forEach((c) => applyHighlightsToColumn(c, srcMap));
            refreshCopyHlBtn();

            // Group verses by color and persist to Bible.com for all other visible versions
            const byColor = {};
            Object.entries(srcMap).forEach(([vNum, colorId]) => {
              if (!byColor[colorId]) byColor[colorId] = [];
              byColor[colorId].push(`${p.book}.${p.chapter}.${vNum}`);
            });
            const items = Object.entries(byColor).map(([color, usfms]) => ({ color, usfms }));
            const targetVids = otherCols.map((c) => parseInt(c.dataset.versionId, 10)).filter(Boolean);
            // If the page's base version is one of the target versions, also paint the hidden origChapter
            if (origChapter && targetVids.includes(p.id)) {
              applyHighlightsToColumn(origChapter, srcMap);
            }
            if (items.length && targetVids.length) {
              const res = await batchSaveCloudHighlights(items, targetVids);
              if (res && res.success) {
                showToast(`Synced ${s.vkey} highlights to ${otherCols.map(c => c.dataset.versionKey).join(", ")} on Bible.com`);
              } else if (res && res.isTemporary) {
                showTemporaryHighlightBanner(`${BBE_BOOK_NAMES[p.book] || p.book} ${p.chapter}`);
              } else {
                showToast(`Not saved: ${res?.error || "Cloud sync failed"}`, 4500);
              }
            }
          });
          const acts = s.c.querySelector(".bbe-col-actions");
          if (acts) acts.insertBefore(btn, acts.firstChild); else actions.appendChild(btn);
        }
      });
    }
    function scheduleHlRefresh() { clearTimeout(hlTimer); hlTimer = setTimeout(refreshCopyHlBtn, 250); }
    new MutationObserver(scheduleHlRefresh).observe(colsGrid, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "data-bbe-temp-hl"] });
    scheduleHlRefresh();

    // Synchronized cross-column verse hover highlighting
    let activeSyncEls = [];
    let activeSyncKey = "";

    const clearSyncHover = () => {
      if (activeSyncEls.length === 0) return;
      for (const el of activeSyncEls) el.classList.remove("bbe-sync-hover");
      activeSyncEls = [];
      activeSyncKey = "";
    };

    colsGrid.addEventListener("mouseover", (e) => {
      const vEl = e.target?.closest?.('[class*="_verse"][data-usfm]');
      if (!vEl || !colsGrid.contains(vEl)) return;
      const nums = extractUsfmVerseNums(vEl.getAttribute("data-usfm") || "");
      if (nums.length === 0) return;
      const key = nums.join(",");
      if (key === activeSyncKey) return;

      clearSyncHover();
      activeSyncKey = key;
      const numSet = new Set(nums);
      const matches = [];
      for (const candidate of colsGrid.querySelectorAll('[class*="_verse"][data-usfm]')) {
        const cNums = extractUsfmVerseNums(candidate.getAttribute("data-usfm") || "");
        if (cNums.some(n => numSet.has(n))) {
          candidate.classList.add("bbe-sync-hover");
          matches.push(candidate);
        }
      }
      activeSyncEls = matches;
    });

    colsGrid.addEventListener("mouseout", (e) => {
      if (!activeSyncKey) return;
      const related = e.relatedTarget;
      if (related && colsGrid.contains(related) && related.closest?.('[class*="_verse"][data-usfm]')) {
        return;
      }
      clearSyncHover();
    });

    colsGrid.addEventListener("mouseleave", clearSyncHover);
  }

  async function renderInterleavedCompare(container, p, versions, allVers, origChapter) {
    const interWrap = document.createElement("div");
    interWrap.className = "bbe-compare-interleaved";

    // Sticky Translation Header Bar
    const stickyBar = document.createElement("div");
    stickyBar.className = "bbe-interleaved-sticky-bar";
    stickyBar.style.gridTemplateColumns = `repeat(${Math.max(versions.length, 1)}, minmax(0, 1fr))`;

    for (let idx = 0; idx < versions.length; idx++) {
      const key = versions[idx];
      const v = allVers[key];
      const colHead = document.createElement("div");
      colHead.className = "bbe-interleaved-col-head";

      const select = createCompareVersionSelect(key, async (newKey) => {
        const updated = [...versions];
        updated[idx] = newKey;
        await bbeSave({ compareVersions: updated });
      });
      colHead.appendChild(select);

      if (versions.length > 1) {
        const cellActions = document.createElement("div");
        cellActions.className = "bbe-interleaved-cell-actions";

        const removeCol = document.createElement("button");
        removeCol.type = "button";
        removeCol.className = "bbe-col-btn";
        removeCol.textContent = "✕";
        removeCol.title = `Remove ${key} from comparison`;
        removeCol.addEventListener("click", async () => {
          const updated = versions.filter((_, i) => i !== idx);
          await bbeSave({ compareVersions: updated });
        });
        cellActions.appendChild(removeCol);
        colHead.appendChild(cellActions);
      }
      stickyBar.appendChild(colHead);
    }
    interWrap.appendChild(stickyBar);

    const loadingIndicator = document.createElement("div");
    loadingIndicator.className = "bbe-compare-loading";
    loadingIndicator.textContent = `Loading verse-by-verse comparison for ${versions.join(", ")}…`;
    interWrap.appendChild(loadingIndicator);
    container.appendChild(interWrap);

    // Fetch and extract verse maps
    try {
      const promises = versions.map(async (key) => {
        if (allVers[key].id === p.id && origChapter) {
          return { key, map: extractVerseMapFromHtmlOrEl(origChapter) };
        }
        try {
          const chapterHtml = await fetchChapter(key, p);
          return { key, map: extractVerseMapFromHtmlOrEl(chapterHtml) };
        } catch (err) {
          return { key, map: {}, error: err.message };
        }
      });

      const results = await Promise.all(promises);
      const verseMaps = Object.fromEntries(results.map(r => [r.key, r.map]));

      const rangeSpec = p.verses ? parseVerseRangeSpec(p.verses) : null;
      const allVerseNums = Array.from(new Set(
        results.flatMap(r => Object.keys(r.map).map(Number))
      )).filter(n => !rangeSpec || rangeSpec.set.has(n)).sort((a, b) => a - b);

      loadingIndicator.remove();

      if (allVerseNums.length === 0) {
        const emptyMsg = document.createElement("div");
        emptyMsg.className = "bbe-compare-loading";
        emptyMsg.textContent = "No verses found to compare for this chapter.";
        interWrap.appendChild(emptyMsg);
        return;
      }

      for (const verseNum of allVerseNums) {
        const row = document.createElement("div");
        row.className = "bbe-interleaved-row";
        row.id = `bbe-interleaved-v-${verseNum}`;

        // Row Header (Verse number + Reference + Action buttons)
        const header = document.createElement("div");
        header.className = "bbe-interleaved-header";

        const left = document.createElement("div");
        left.className = "bbe-interleaved-vnum";
        left.innerHTML = `<span>Verse ${verseNum}</span> <span class="bbe-interleaved-pill">${p.book} ${p.chapter}:${verseNum}</span>`;
        header.appendChild(left);

        const actions = document.createElement("div");
        actions.className = "bbe-interleaved-actions";



        // Study Drawer button
        const studyBtn = document.createElement("button");
        studyBtn.type = "button";
        studyBtn.className = "bbe-interleaved-action-btn";
        studyBtn.innerHTML = `${BBE_ICONS.book(12)}<span>Study</span>`;
        studyBtn.title = `Study: Open commentary and cross-references for Verse ${verseNum}`;
        studyBtn.addEventListener("click", () => {
          openCommentaryDrawer(p.book, p.chapter, verseNum, S.defaultStudyTab || "commentary", null, { explicitVerse: true });
        });
        actions.appendChild(studyBtn);

        header.appendChild(actions);
        row.appendChild(header);

        // Verse Grid (One cell per translation)
        const vGrid = document.createElement("div");
        vGrid.className = "bbe-interleaved-grid";
        vGrid.style.gridTemplateColumns = `repeat(${Math.max(versions.length, 1)}, minmax(0, 1fr))`;

        for (let idx = 0; idx < versions.length; idx++) {
          const key = versions[idx];
          const cell = document.createElement("div");
          cell.className = "bbe-interleaved-cell";

          // Cell header with Version tag and single verse copy button
          const cellHeader = document.createElement("div");
          cellHeader.className = "bbe-interleaved-cell-header";

          const vtag = document.createElement("span");
          vtag.className = "bbe-interleaved-cell-vtag notranslate";
          vtag.setAttribute("translate", "no");
          vtag.textContent = key;
          vtag.title = allVers[key]?.name || key;
          cellHeader.appendChild(vtag);


          cell.appendChild(cellHeader);

          // Verse text
          const textEl = document.createElement("div");
          textEl.className = "bbe-interleaved-text";
          const rawText = verseMaps[key]?.[verseNum];
          if (rawText) {
            textEl.textContent = rawText;
          } else {
            textEl.innerHTML = `<span style="font-style:italic;color:#94a3b8;">(Verse omitted or not found in this translation)</span>`;
          }
          cell.appendChild(textEl);

          vGrid.appendChild(cell);
        }

        row.appendChild(vGrid);
        interWrap.appendChild(row);
      }
    } catch (err) {
      loadingIndicator.textContent = `Error rendering comparison: ${err.message}`;
    }
  }

  /* ---------- Full Settings Launcher ---------- */
  function openExtensionOptionsTab(section) {
    try {
      safeSendMessage({ type: "OPEN_OPTIONS", section: section || "" }, (res) => {
        if (!res?.ok) {
          try {
            if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
              const baseUrl = chrome.runtime.getURL("popup.html");
              window.open(section ? baseUrl + "#" + section : baseUrl, "_blank");
            }
          } catch (e) {}
        }
      });
    } catch (e) {}
  }

  /* ---------------- Main Lifecycle Loop ---------------- */
  let lifecycleObserver = null;
  let lastDomSig = "";

  function getDomSig(p) {
    const chapterEl = getChapterEl();
    const nativeReader = getNativeReaderEl();
    const yv = nativeReader || document.querySelector('#bbe-verse-page-reader [class*="_yv-bible-text"]');
    const readerH1 = (nativeReader ? nativeReader.querySelector('[class*="_reader"] h1') : null) ||
                     document.getElementById("bbe-verse-reader-h1");
    const barOk = S.hideSwitcher ? !document.getElementById("bbe-bar") : !!document.getElementById("bbe-bar");
    const compareOk = S.compareOn ? !!document.getElementById("bbe-compare-grid") : !document.getElementById("bbe-compare-grid");
    const fullChapBarOk = !p.verses || !!document.getElementById("bbe-full-chapter-bar");
    const histOk = S.readerTheme !== "historical" || !!document.getElementById("bbe-hist-backdrop");
    // Historical theme: parchment must be present on the reader wrapper and the compare grid (if any)
    let parchOk = true;
    if (S.enabled && S.readerTheme === "historical" && window.BBE_HIST) {
      const wantParch = S.historicalParchment || "scroll";
      const gridEl = document.getElementById("bbe-compare-grid");
      const yvParent = yv ? yv.parentElement : null;
      parchOk = (!gridEl || gridEl.dataset.bbeParch === wantParch) &&
                (!yvParent || yvParent.dataset.bbeParch === wantParch);
    }

    return [
      html.classList.contains("bbe-on") ? 1 : 0,
      nativeReader ? 1 : 0,
      yv?.parentElement?.style?.maxWidth || "",
      readerH1?.textContent || "",
      chapterEl ? 1 : 0,
      chapterEl?.dataset?.bbeBound || "",
      chapterEl?.dataset?.bbePassageKey || "",
      chapterEl?.dataset?.bbeLoadingKey || "",
      chapterEl?.dataset?.bbeFiltered || "",
      S.wordStudyMode ? (chapterEl?.dataset?.bbeWordStudyBound || "") : "",
      barOk ? 1 : 0,
      compareOk ? 1 : 0,
      fullChapBarOk ? 1 : 0,
      histOk ? 1 : 0,
      parchOk ? 1 : 0
    ].join("|");
  }

  function flushLifecycleRecords() {
    invalidateDomCaches();
    if (lifecycleObserver) lifecycleObserver.takeRecords();
  }

  function tick() {
    if (!document.body) return;
    invalidateDomCaches(); // one fresh query per render pass, shared by every helper below

    const allVers = getAllVersions();
    const p = bbeParsePath(location.pathname, allVers);
    if (!S.enabled || !p) {
      if (window.BBE_SERMON && window.BBE_SERMON.isActive()) {
        window.BBE_SERMON.deactivate(true);
      }
      ensureVersePageReader(null);
      syncDomClasses();
      document.getElementById("bbe-bar")?.remove();
      removeCompare();
      lastRenderKey = "";
      lastCompareKey = "";
      lastDomSig = "";
      flushLifecycleRecords();
      return;
    }

    const stateKey = [
      location.pathname,
      S.enabled,
      S.hideSwitcher,
      S.columnWidth,
      S.fontSize,
      S.lineHeight,
      S.enableKeyShortcuts,
      S.commentaryDock,
      S.toolbarBehavior,
      S.autoDimBar,
      S.wordStudyMode,
      S.wordStudyTrigger,
      S.smartVerseCopy,
      S.copyCleanSelection,
      S.copyIncludeReference,
      S.copyIncludeVersion,
      S.copyIncludeVerseNumbers,
      S.copyIncludeHeadings,
      S.fontFamily,
      S.readerTheme,
      S.showAaMenu,
      (S.toolbarVersions || []).join(),
      JSON.stringify(S.customShortcuts || {}),
      JSON.stringify(S.userTranslations || {}),
      isDrawerOpen,
      isDrawerFullscreen,
      S.compareOn,
      S.compareLayout,
      (S.compareVersions || []).join(),
      (S.compareBarVersions || []).join(),
      S.youversionHighlighting,
      S.showVerseHighlightBadges,
      S.defaultHighlightColor,
      S.hideHeader,
      S.hideSidebar,
      S.hideDistractionCards,
      S.hideFooter,
      S.hideBottomBar,
      S.hideFootnotes,
      S.hideHeadings,
      S.hideVerseNumbers,
      S.hideCopyright,
      S.historicalScene,
      S.historicalParchment,
      S.historicalInk,
      S.historicalRubrics,
      S.historicalOrnate,
      S.historicalSceneDim,
      S.prefetchTranslations,
      S.preloadAdjacentChapters,
      S.showSermonBtn,
      S.sermonExpandSpacing,
      S.sermonSaveMode,
      S.sermonMaxSaved,
      Boolean(window.BBE_SERMON && window.BBE_SERMON.isActive())
    ].join("|");

    const curDomSig = getDomSig(p);
    if (stateKey === lastRenderKey && curDomSig === lastDomSig) {
      flushLifecycleRecords();
      return;
    }

    // Ensure single-verse & verse-segment pages have the full Deep Bible reader structure
    ensureVersePageReader(p);
    syncDomClasses();

    // Trigger background preloading for instant swapping
    preloadOtherVersions(p);
    preloadAdjacentChapters(p);

    // Render unobtrusive commentary badges next to verse numbers
    renderVerseBadges(p);

    // Enhance verses for Strong's Word Study if active
    if (S.wordStudyMode) {
      enhanceVersesForWordStudy(p);
    }

    const barOk = S.hideSwitcher ? !document.getElementById("bbe-bar") : !!document.getElementById("bbe-bar");
    const compareOk = S.compareOn ? !!document.getElementById("bbe-compare-grid") : !document.getElementById("bbe-compare-grid");
    const compareStateKey = [
      location.pathname,
      S.compareOn,
      S.compareLayout,
      (S.compareVersions || []).join(),
      JSON.stringify(S.userTranslations || {}),
      getChapterEl()?.dataset?.bbePassageKey || ""
    ].join("|");

    if (stateKey !== lastRenderKey || !barOk || !compareOk) {
      lastRenderKey = stateKey;
      renderToolbar(p);
    }

    if (compareStateKey !== lastCompareKey || !compareOk) {
      lastCompareKey = compareStateKey;
      if (S.compareOn) {
        renderCompare(p);
      } else {
        removeCompare();
      }
    }

    // Historical theme: re-apply parchment now that the compare grid / toolbar exist (old polling did this on the next tick)
    if (S.enabled && S.readerTheme === "historical") syncDomClasses();

    // Sermon Mode: enforce Compare Mode exclusion or sync active Sermon overlay
    if (S.compareOn) {
      if (window.BBE_SERMON && window.BBE_SERMON.isActive()) {
        window.BBE_SERMON.deactivate(true);
        showToast("Sermon Mode closed for Compare view", { icon: "sermon" });
      }
    } else if (window.BBE_SERMON && window.BBE_SERMON.isActive()) {
      window.BBE_SERMON.onPassageOrLayoutChange();
    } else if (!window.BBE_SERMON) {
      try {
        if (sessionStorage.getItem("bbe_sermon_active") === "1") {
          ensureSermonModeLoaded().then((sm) => {
            if (sm && !sm.isActive() && !S.compareOn) sm.activate();
          });
        }
      } catch (_) {}
    }

    lastDomSig = getDomSig(p);
    flushLifecycleRecords();
  }

  /* ---------------- Immediate SPA Navigation Hooks ---------------- */
  let lastObservedUrl = location.href;
  let lastObservedPathname = location.pathname;

  function syncOpenDrawerToPassageChange(prevPath, nextPath) {
    if (!isDrawerOpen) return;
    const allVers = getAllVersions();
    const prevP = bbeParsePath(prevPath, allVers);
    const nextP = bbeParsePath(nextPath, allVers);
    if (!nextP) {
      closeCommentaryDrawer();
      return;
    }
    const prevPassageKey = prevP ? `${prevP.book}|${prevP.chapter}|${prevP.verses || ""}` : "";
    const nextPassageKey = `${nextP.book}|${nextP.chapter}|${nextP.verses || ""}`;
    if (nextPassageKey !== prevPassageKey) {
      const urlSpec = nextP.verses ? parseVerseRangeSpec(nextP.verses) : null;
      const targetVerse = urlSpec ? urlSpec.min : 1;
      openCommentaryDrawer(nextP.book, nextP.chapter, targetVerse);
    } else if (
      prevP &&
      (prevP.id !== nextP.id || prevP.abbr !== nextP.abbr) &&
      currentDrawerPassage.book === nextP.book &&
      currentDrawerPassage.chapter === String(nextP.chapter)
    ) {
      updateDrawerPreview(currentDrawerPassage.book, currentDrawerPassage.chapter, currentDrawerPassage.verse || 1, nextP);
    }
  }

  function handleUrlChange() {
    if (location.href !== lastObservedUrl) {
      const prevPath = lastObservedPathname;
      lastObservedUrl = location.href;
      lastObservedPathname = location.pathname;
      if (!isBottomDrawerActive() && residualClearanceActive) {
        residualClearanceActive = false;
        setDrawerClearancePx(0);
      }
      lastRenderKey = "";
      cancelPreloading();
      tick();
      syncOpenDrawerToPassageChange(prevPath, location.pathname);
    }
  }

  const origPushState = history.pushState;
  history.pushState = function (...args) {
    const res = origPushState.apply(this, args);
    handleUrlChange();
    return res;
  };

  const origReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    const res = origReplaceState.apply(this, args);
    handleUrlChange();
    return res;
  };

  window.addEventListener("popstate", () => {
    handleUrlChange();
  });

  if (!document.body) syncDomClasses();
  tick();

  // Event-driven lifecycle (replaces the old 1500ms polling loop).
  // NOTE: content scripts live in an isolated world, so the history hooks above do NOT see the
  // page's own (Next.js) pushState calls. SPA navigation and React re-renders always mutate the
  // DOM, so a debounced MutationObserver detects them and re-runs the same URL check + tick().
  let lifecycleTimer = null;
  function scheduleLifecycle() {
    if (lifecycleTimer) return;
    lifecycleTimer = setTimeout(() => {
      lifecycleTimer = null;
      if (document.hidden) return; // visibilitychange re-syncs when the tab returns
      handleUrlChange();
      tick();
    }, 250);
  }
  // Expose for toolbar show/hide (isBarHidden is part of tick's render key, which polling used to pick up)
  window.__bbeScheduleLifecycle = scheduleLifecycle;

  const MANAGED_ROOT_IDS = new Set([
    "bbe-bar",
    "bbe-compare-grid",
    "bbe-full-chapter-bar",
    "bbe-verse-page-reader",
    "bbe-hist-backdrop"
  ]);

  function isInOwnContainer(el) {
    return !!(el && el.nodeType === 1 && el.closest && el.closest('[id^="bbe-"]'));
  }

  function isOwnNode(n, target) {
    if (isInOwnContainer(target)) return true;
    if (!n) return false;
    if (n.nodeType === 1) {
      if (n === document.body || n === document.documentElement) return false;
      if ((n.id && n.id.startsWith("bbe-")) ||
          (typeof n.className === "string" && n.className.indexOf("bbe-") !== -1)) {
        return true;
      }
      return isInOwnContainer(n);
    }
    return isInOwnContainer(n.parentElement);
  }

  lifecycleObserver = new MutationObserver((records) => {
    for (const r of records) {
      if (!r.target || !r.target.isConnected || isInOwnContainer(r.target)) continue;
      let foreign = false;
      for (const n of r.addedNodes) { if (!isOwnNode(n, r.target)) { foreign = true; break; } }
      if (!foreign) {
        for (const n of r.removedNodes) {
          if ((n.nodeType === 1 && MANAGED_ROOT_IDS.has(n.id)) || !isOwnNode(n, r.target)) {
            foreign = true;
            break;
          }
        }
      }
      if (foreign) { invalidateDomCaches(); scheduleLifecycle(); return; } // page DOM changed: drop cached queries
    }
    // Any record whose only changes were our own nodes is ignored
  });
  lifecycleObserver.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleLifecycle();
  });
  window.addEventListener("focus", scheduleLifecycle);
})();
