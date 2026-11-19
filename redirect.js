// Intercepts URL suffix changes so that changing the trailing abbreviation (e.g. .ESV, .NIV, .NASB)
// immediately loads that Bible translation by switching to its numeric ID.
(function () {
  // Preemptively confirm cookie consent so Bible.com's Next.js app never mounts the cookie banner
  try {
    if (!document.cookie.includes("cookieConsentBannerConfirmed=true")) {
      const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000 * 5).toUTCString();
      document.cookie = `cookieConsentBannerConfirmed=true; expires=${expires}; path=/; domain=.bible.com; SameSite=Lax`;
      document.cookie = `cookieConsentBannerConfirmed=true; expires=${expires}; path=/; SameSite=Lax`;
    }
  } catch (e) {}

  // Instant Boot (Anti-Flash): synchronously apply visual classes and CSS variables from the
  // last saved snapshot before Bible.com paints its first frame. content.js syncs & refreshes this later.
  function applyInstantBoot() {
    try {
      const raw = localStorage.getItem("bbe_boot_v1");
      if (!raw) return;
      const b = JSON.parse(raw);
      if (!b || !b.enabled) return;

      const html = document.documentElement;
      if (!html) return;

      const add = (cls, cond) => { if (cond) html.classList.add(cls); };
      add("bbe-on", true);
      add("bbe-hide-header", b.hideHeader);
      add("bbe-hide-sidebar", b.hideSidebar);
      add("bbe-hide-cards", b.hideDistractionCards);
      add("bbe-hide-footer", b.hideFooter);
      add("bbe-hide-bottombar", b.hideBottomBar);
      add("bbe-hide-notes", b.hideFootnotes);
      add("bbe-hide-headings", b.hideHeadings);
      add("bbe-hide-vnum", b.hideVerseNumbers);
      add("bbe-hide-copyright", b.hideCopyright !== false);
      add("bbe-hide-switcher", b.hideSwitcher);
      add("bbe-bar-static", b.toolbarBehavior === "static");
      add("bbe-autodim-bar", b.toolbarBehavior === "smart" || (b.toolbarBehavior !== "static" && b.autoDimBar !== false));
      add("bbe-wordstudy-active", b.wordStudyMode);

      const validFonts = ["serif", "sans", "mono", "dyslexic"];
      const fontFam = validFonts.includes(b.fontFamily) ? b.fontFamily : "serif";
      html.classList.add("bbe-font-" + fontFam);

      let rTheme = b.readerTheme || "system";
      if (rTheme === "pink") rTheme = "system";
      const validThemes = ["sepia", "light", "dark", "oled", "blue", "green", "system", "historical"];
      if (!validThemes.includes(rTheme)) rTheme = "system";
      html.classList.add("bbe-theme-" + rTheme);

      if (rTheme === "historical") {
        const hScene = b.historicalScene || "olive";
        const hParch = b.historicalParchment || "scroll";
        const hInk = b.historicalInk || "iron";
        if (hParch === "scroll") html.classList.add("bbe-hist-scroll");
        if (b.historicalRubrics !== false) html.classList.add("bbe-hist-rubric");
        if (b.historicalOrnate !== false) html.classList.add("bbe-hist-ornate");
        if (["iron", "sepia", "black"].includes(hInk)) html.classList.add("bbe-hist-ink-" + hInk);
        if (hScene === "night") html.classList.add("bbe-hist-scene-night");
        const dim = Math.min(100, Math.max(0, Number(b.historicalSceneDim ?? 15)));
        html.style.setProperty("--bbe-hist-veil", `rgba(18, 10, 4, ${(dim / 100).toFixed(2)})`);
        if (b.historicalBase) html.style.setProperty("--bbe-hist-base", b.historicalBase);
        if (b.historicalEdge) html.style.setProperty("--bbe-hist-edge", b.historicalEdge);
        if (b.historicalRule) html.style.setProperty("--bbe-hist-rule", b.historicalRule);
      }

      if (b.columnWidth) html.style.setProperty("--bbe-width", b.columnWidth + "px");
      html.style.setProperty("--bbe-font", String(b.fontSize || 100));
      html.style.setProperty("--bbe-lh", String(b.lineHeight || 1.8));
    } catch (e) {}
  }

  applyInstantBoot();

  function checkAndRedirect() {
    const p = bbeParsePath(location.pathname);
    if (!p || !p.abbr) return;
    const targetId = bbeIdForSuffix(p.abbr);
    if (targetId && targetId !== p.id) {
      const newPath = `/bible/${targetId}/${p.book}.${p.chapter}${p.verses ? "." + p.verses : ""}.${p.abbr}${location.search}${location.hash}`;
      location.replace(newPath);
    }
  }

  // Intercepts searches on bible.com/search/bible?q=... and redirects direct scripture references
  // immediately to the passage reader view (like BibleGateway's quicksearch)
  function checkSearchRedirect() {
    if (!location.pathname.includes("/search/bible")) return;
    const params = new URLSearchParams(location.search);
    const q = params.get("q");
    if (!q) return;

    const ref = typeof bbeParseSearch === "function" ? bbeParseSearch(q) : null;
    if (!ref) return;

    let targetAbbr = ref.version || null;
    let targetId = targetAbbr ? (typeof bbeIdForSuffix === "function" ? bbeIdForSuffix(targetAbbr) : null) : null;

    if (!targetId && params.has("version_id")) {
      const vid = Number(params.get("version_id"));
      if (vid) {
        targetId = vid;
        targetAbbr = typeof bbeKeyForId === "function" ? bbeKeyForId(vid) : "ESV";
      }
    }

    if (!targetId && typeof chrome !== "undefined" && chrome.runtime?.id && chrome.storage?.sync) {
      try {
        chrome.storage.sync.get(["toolbarVersions", "activeTranslation"], (data) => {
          if (chrome.runtime?.lastError) return;
          let vCode = "ESV";
          if (data && data.activeTranslation) {
            vCode = data.activeTranslation.toUpperCase();
          } else if (data && Array.isArray(data.toolbarVersions) && data.toolbarVersions.length > 0) {
            vCode = data.toolbarVersions[0].toUpperCase();
          }
          const vId = (typeof bbeIdForSuffix === "function" ? bbeIdForSuffix(vCode) : null) || 59;
          const vPart = ref.verses ? `.${ref.verses}` : "";
          location.replace(`/bible/${vId}/${ref.book}.${ref.chapter}${vPart}.${vCode}`);
        });
        return;
      } catch (_) {}
    }

    if (!targetId) {
      targetId = 59;
      targetAbbr = "ESV";
    }

    const vPart = ref.verses ? `.${ref.verses}` : "";
    location.replace(`/bible/${targetId}/${ref.book}.${ref.chapter}${vPart}.${targetAbbr || "ESV"}`);
  }

  checkAndRedirect();
  checkSearchRedirect();

  // Watch for history pushState / replaceState and SPA URL transitions via event hooks
  let lastHref = location.href;
  function onUrlChange() {
    if (location.href !== lastHref) {
      lastHref = location.href;
      checkAndRedirect();
      checkSearchRedirect();
    }
  }

  const origPush = history.pushState;
  history.pushState = function (...args) {
    const res = origPush.apply(this, args);
    onUrlChange();
    return res;
  };

  const origReplace = history.replaceState;
  history.replaceState = function (...args) {
    const res = origReplace.apply(this, args);
    onUrlChange();
    return res;
  };

  window.addEventListener("popstate", onUrlChange);

  // Relaxed idle safety fallback (every 2.5s instead of 250ms, paused when tab is inactive)
  setInterval(() => {
    if (document.hidden) return;
    onUrlChange();
  }, 2500);
})();
