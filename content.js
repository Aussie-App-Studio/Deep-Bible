// Deep Bible: Study Tools for YouVersion (Bible.com) — Content Script
(async function () {
  // Check for one-click first-install reset trigger via URL param (?bbe_reset=1 or #bbe_reset)
  if (location.search.includes("bbe_reset=1") || location.hash.includes("bbe_reset")) {
    try {
      if (typeof chrome !== "undefined" && chrome.storage) {
        if (chrome.storage.sync) await new Promise(r => chrome.storage.sync.clear(r));
        if (chrome.storage.local) await new Promise(r => chrome.storage.local.clear(r));
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
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(null, resolve);
    } else {
      resolve({});
    }
  });

  // If storage lacks schemaVersion 3, execute a complete wipe and enforce clean first-install defaults!
  if (!rawStorage || rawStorage.schemaVersion !== 3) {
    if (typeof chrome !== "undefined" && chrome.storage) {
      if (chrome.storage.sync) await new Promise(r => chrome.storage.sync.clear(r));
      if (chrome.storage.local) await new Promise(r => chrome.storage.local.clear(r));
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
    freshDefaults.showWidthControls = true;
    freshDefaults.columnWidth = 950;
    freshDefaults.fontSize = 100;
    freshDefaults.fontFamily = "serif";
    freshDefaults.readerTheme = "system";
    await bbeSave(freshDefaults);
  }

  let S = await bbeLoad();
  const html = document.documentElement;
  const chapterCache = new Map(); // "id|book.chapter" -> Promise<string>
  let lastRenderKey = "";
  let lastPreloadedChapter = "";

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

  // Custom CSS injection element
  let customStyle = document.getElementById("bbe-custom-style");
  if (!customStyle) {
    customStyle = document.createElement("style");
    customStyle.id = "bbe-custom-style";
    (document.head || html).appendChild(customStyle);
  }

  // Toast notification element
  let toastEl = document.getElementById("bbe-toast");
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.id = "bbe-toast";
    document.body.appendChild(toastEl);
  }
  let toastTimer = null;
  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove("show");
    }, 1200);
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

  /* ---------------- Sync Classes & Layout to DOM ---------------- */
  let lastDomSyncKey = "";
  function syncDomClasses() {
    if (!S.enabled) {
      lastDomSyncKey = "disabled";
      if (html.classList.contains("bbe-on")) {
        html.className = html.className.replace(/\bbbe-[a-z0-9\-]+\b/g, "").trim();
      }
      const yv = document.querySelector('[class*="_yv-bible-text"]');
      const readerContainer = yv ? yv.parentElement : null;
      if (readerContainer) {
        readerContainer.style.removeProperty("max-width");
        readerContainer.style.removeProperty("width");
      }
      return;
    }

    // Force scripture container width directly on element to override Tailwind
    const yv = document.querySelector('[class*="_yv-bible-text"]');
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
      S.columnWidth, S.fontSize, S.lineHeight, S.compareOn, S.customCss,
      !!document.body
    ].join("|");

    // When Historical theme is active, also check if newly mounted chapter containers need parchment applied
    const isHistActive = S.enabled && S.readerTheme === "historical" && window.BBE_HIST;
    if (domSyncKey === lastDomSyncKey && html.classList.contains("bbe-on") && !isHistActive) {
      return;
    }
    lastDomSyncKey = domSyncKey;

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
    const isHist = S.enabled && rTheme === "historical" && window.BBE_HIST;
    const hScene = S.historicalScene || "olive";
    const hParch = S.historicalParchment || "scroll";
    const hInk = S.historicalInk || "iron";
    t("bbe-hist-scroll", !!isHist && hParch === "scroll");
    t("bbe-hist-rubric", !!isHist && S.historicalRubrics !== false);
    t("bbe-hist-ornate", !!isHist && S.historicalOrnate !== false);
    ["iron", "sepia", "black"].forEach(k => t("bbe-hist-ink-" + k, !!isHist && hInk === k));
    ["night"].forEach(k => t("bbe-hist-scene-" + k, !!isHist && hScene === k));
    const histVars = ["--bbe-hist-scene", "--bbe-hist-parch", "--bbe-hist-base", "--bbe-hist-edge", "--bbe-hist-rule", "--bbe-hist-veil"];
    if (isHist) {
      const dim = Math.min(100, Math.max(0, Number(S.historicalSceneDim ?? 15)));
      const sc = window.BBE_HIST.get("scene", hScene);
      const pt = window.BBE_HIST.get("parchment", hParch);
      if (!sc || !pt) {
        // Artwork is rasterised once, asynchronously; repaint as soon as it is ready.
        Promise.all([window.BBE_HIST.load("scene", hScene), window.BBE_HIST.load("parchment", hParch)]).then(() => syncDomClasses());
      } else {
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
          document.querySelectorAll('body div:has(> [class*="_yv-bible-text"]), #bbe-compare-grid').forEach(el => {
            if (el.dataset.bbeParch !== hParch) {
              el.style.setProperty("background-image", pt.url, "important");
              el.dataset.bbeParch = hParch;
            }
          });
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

    const targetCustom = S.enabled ? S.customCss || "" : "";
    if (customStyle.textContent !== targetCustom) {
      customStyle.textContent = targetCustom;
    }
  }

  // Storage listener for changes from popup or toolbar
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes) => {
      let shouldRerender = false;
      for (const k in changes) {
        S[k] = changes[k].newValue;
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
      if (shouldRerender) {
        lastRenderKey = ""; // trigger re-render
        const p = bbeParsePath(location.pathname, getAllVersions());
        if (p) {
          preloadOtherVersions(p, true); // Force preload newly added translations or shortcuts
        }
        tick();
      }
    });
  }

  /* ---------------- Fetching & Preloading Chapter Content ---------------- */
  function extractChapterNode(htmlOrDoc) {
    const doc = typeof htmlOrDoc === "string"
      ? new DOMParser().parseFromString(htmlOrDoc, "text/html")
      : htmlOrDoc;
    if (!doc) return null;
    const chapter = doc.querySelector('[class*="_chapter"]');
    if (!chapter) return null;

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
    const v = allVers[versionKey];
    if (!v) return Promise.reject(new Error("Unknown version " + versionKey));
    const cacheKey = `${v.id}|${p.book}.${p.chapter}`;
    if (!chapterCache.has(cacheKey)) {
      const url = `/bible/${v.id}/${p.book}.${p.chapter}.${versionKey}`;
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

  // Preloads core translations intelligently with a 3s idle delay and staggered queue
  let preloadTimer = null;
  let preloadQueueTimeouts = [];

  function cancelPreloading() {
    if (preloadTimer) {
      clearTimeout(preloadTimer);
      preloadTimer = null;
    }
    preloadQueueTimeouts.forEach(t => clearTimeout(t));
    preloadQueueTimeouts = [];
  }

  function preloadOtherVersions(p, force = false) {
    if (!S.prefetchTranslations) return;
    const chapKey = `${p.book}.${p.chapter}`;
    if (!force && lastPreloadedChapter === chapKey) return;
    lastPreloadedChapter = chapKey;

    const allVers = getAllVersions();
    const curKey = bbeKeyForId(p.id, allVers) || p.abbr;
    const curChapterEl = document.querySelector('[class*="_chapter"]:not(#bbe-compare-grid *)');
    if (curChapterEl && curKey) {
      const curCacheKey = `${p.id}|${chapKey}`;
      if (!chapterCache.has(curCacheKey)) {
        chapterCache.set(curCacheKey, Promise.resolve(curChapterEl.innerHTML));
      }
    }

    // Cancel any previous chapter's pending preload requests
    cancelPreloading();

    // Delay background preloading by 3 seconds (or requestIdleCallback) so page load rendering is never competed with
    const schedulePreload = (cb) => {
      if (typeof requestIdleCallback === "function") {
        preloadTimer = setTimeout(() => {
          requestIdleCallback(() => cb(), { timeout: 2000 });
        }, 3000);
      } else {
        preloadTimer = setTimeout(cb, 3000);
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

      // Fetch the top 2 immediately
      priorityList.forEach(key => {
        fetchChapter(key, p).catch(() => {});
      });

      // Queue the remaining versions with a 200ms gap to eliminate bandwidth spikes
      remainingList.forEach((key, index) => {
        const timeout = setTimeout(() => {
          const checkP = bbeParsePath(location.pathname, allVers);
          if (checkP && `${checkP.book}.${checkP.chapter}` === chapKey) {
            fetchChapter(key, p).catch(() => {});
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
      showToast(`⚡ Compare: Added ${targetKey}`);
      return;
    }

    const curChapterEl = document.querySelector('[class*="_chapter"]:not(#bbe-compare-grid *)');
    if (!curChapterEl) {
      location.href = bbeBuildPath(v.id, targetKey, p);
      return;
    }

    const toastLabel = v.name ? `⚡ Swapped to ${targetKey} · ${v.name}` : `⚡ Swapped to ${targetKey}`;
    showToast(toastLabel);

    // Update active button UI immediately for instant feedback
    document.querySelectorAll("#bbe-bar .bbe-version-btn").forEach(btn => {
      btn.classList.toggle("bbe-active", btn.dataset.version === targetKey);
    });

    try {
      const activeVerse = findActiveVerse();
      const newHtml = await fetchChapter(targetKey, p);
      await applyChapterTransition(curChapterEl, newHtml, activeVerse);

      // Update URL and document title without full page reload
      const newPath = bbeBuildPath(v.id, targetKey, p);
      history.pushState({ bbeSwapped: true, key: targetKey, id: v.id }, "", newPath + location.search + location.hash);
      document.title = document.title.replace(/\| .*? Bible/i, `| ${targetKey} Bible`);

      p.id = v.id;
      p.abbr = targetKey;
      lastRenderKey = "";
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
    return {
      prevUrl: prevA ? cleanChapterUrl(prevA.getAttribute("href")) : null,
      nextUrl: nextA ? cleanChapterUrl(nextA.getAttribute("href")) : null,
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
    if (S.preloadAdjacentChapters === false) return;
    const chapKey = p ? `${p.book}.${p.chapter}.${p.id || p.abbr}` : "";
    if (chapKey && lastAdjacentPreloadChap === chapKey) return;
    if (chapKey) lastAdjacentPreloadChap = chapKey;

    clearTimeout(preloadAdjacentTimer);
    preloadAdjacentTimer = setTimeout(() => {
      const { prevUrl, nextUrl } = getNativeChapterUrls();
      if (nextUrl) fetchAdjacentChapter(nextUrl);
      if (prevUrl) fetchAdjacentChapter(prevUrl);
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
      showToast(direction === "next" ? "📖 Reached the end of the Bible" : "📖 Reached the beginning of the Bible");
      return;
    }

    const curChapterEl = document.querySelector('[class*="_chapter"]:not(#bbe-compare-grid *)');
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

      // Update URL and document title in browser history
      history.pushState({ bbeChapterSwapped: true, url: targetUrl }, "", targetUrl);
      if (data.title) {
        document.title = data.title;
      }

      // Update native floating buttons' hrefs
      if (prevEl && data.prevHref) {
        prevEl.setAttribute("href", data.prevHref);
        prevEl.removeAttribute("aria-disabled");
      }
      if (nextEl && data.nextHref) {
        nextEl.setAttribute("href", data.nextHref);
        nextEl.removeAttribute("aria-disabled");
      }

      // Trigger immediate tick to re-render toolbar with new chapter number, verse badges
      lastRenderKey = "";
      tick();

      // Trigger preloading for the next adjacent chapters
      preloadAdjacentChapters();
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

  function applyDrawerDockClasses(drawer) {
    if (!drawer) return;
    const dock = S.commentaryDock || "right";
    drawer.classList.toggle("bbe-dock-bottom", dock === "bottom");
    drawer.classList.toggle("bbe-dock-right", dock !== "bottom");
    drawer.classList.toggle("bbe-fullscreen", isDrawerFullscreen);

    const dockIcon = drawer.querySelector("#bbe-drawer-dock-icon");
    const dockLabel = drawer.querySelector("#bbe-drawer-dock-label");
    const dockBtn = drawer.querySelector("#bbe-drawer-dock-btn");
    if (dockIcon && dockLabel) {
      if (dock === "bottom") {
        dockIcon.textContent = "⬒";
        dockLabel.textContent = "Sidebar";
        if (dockBtn) dockBtn.title = "Dock as Right Sidebar";
      } else {
        dockIcon.textContent = "⬓";
        dockLabel.textContent = "Bottom";
        if (dockBtn) dockBtn.title = "Dock at Bottom (Logos Bible style)";
      }
    }

    const fsIcon = drawer.querySelector("#bbe-drawer-fs-icon");
    const fsLabel = drawer.querySelector("#bbe-drawer-fs-label");
    const fsBtn = drawer.querySelector("#bbe-drawer-fs-btn");
    if (fsIcon && fsLabel) {
      if (isDrawerFullscreen) {
        fsIcon.textContent = "⤡";
        fsLabel.textContent = "Exit";
        if (fsBtn) fsBtn.title = "Exit Fullscreen (Esc)";
      } else {
        fsIcon.textContent = "⤢";
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
      drawer.innerHTML = `
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
              <span>📋</span>
              <span id="bbe-drawer-copy-label">Copy</span>
            </button>
            <button type="button" class="bbe-drawer-tool-btn" id="bbe-drawer-dock-btn" title="Dock at Bottom (Logos Bible style)">
              <span id="bbe-drawer-dock-icon">⬓</span>
              <span id="bbe-drawer-dock-label">Bottom</span>
            </button>
            <button type="button" class="bbe-drawer-tool-btn" id="bbe-drawer-fs-btn" title="Toggle Fullscreen">
              <span id="bbe-drawer-fs-icon">⤢</span>
              <span id="bbe-drawer-fs-label">Fullscreen</span>
            </button>
            <a href="#" target="_blank" rel="noopener" class="bbe-drawer-link" id="bbe-drawer-hublink">BibleHub ↗</a>
            <button type="button" class="bbe-drawer-close" id="bbe-drawer-close" title="Close (Esc)">✕</button>
          </div>
        </div>
        <div class="bbe-drawer-tabs">
          <button type="button" class="bbe-drawer-tab" id="bbe-tab-commentary">📖 Commentary</button>
          <button type="button" class="bbe-drawer-tab" id="bbe-tab-crossref">🔗 Cross-References (TSK)</button>
          <button type="button" class="bbe-drawer-tab" id="bbe-tab-wordstudy">🔤 Word Study</button>
        </div>
        <div class="bbe-drawer-verse-preview" id="bbe-drawer-preview"></div>
        <div class="bbe-drawer-chips" id="bbe-drawer-chips"></div>
        <div class="bbe-drawer-body" id="bbe-drawer-body"></div>
        <div class="bbe-drawer-crossref" id="bbe-drawer-crossref" style="display:none;"></div>
        <div class="bbe-drawer-wordstudy" id="bbe-drawer-wordstudy" style="display:none;"></div>
      `;
      document.body.appendChild(drawer);

      applyDrawerDockClasses(drawer);

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
        const newDock = (S.commentaryDock === "bottom") ? "right" : "bottom";
        S.commentaryDock = newDock;
        applyDrawerDockClasses(drawer);
        await bbeSave({ commentaryDock: newDock });
      });

      drawer.querySelector("#bbe-drawer-fs-btn").addEventListener("click", () => {
        isDrawerFullscreen = !isDrawerFullscreen;
        applyDrawerDockClasses(drawer);
      });

      drawer.querySelector("#bbe-drawer-close").addEventListener("click", () => closeCommentaryDrawer());
      drawer.querySelector("#bbe-stepper-prev").addEventListener("click", () => {
        const v = Math.max(1, (currentDrawerPassage.verse || 1) - 1);
        openCommentaryDrawer(currentDrawerPassage.book, currentDrawerPassage.chapter, v);
      });
      drawer.querySelector("#bbe-stepper-next").addEventListener("click", () => {
        const v = (currentDrawerPassage.verse || 1) + 1;
        openCommentaryDrawer(currentDrawerPassage.book, currentDrawerPassage.chapter, v);
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
    const chapterEl = document.querySelector('[class*="_chapter"]:not(#bbe-compare-grid *)');
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
      showToast(`⚠️ Could not read verse ${verseNum}`);
      return;
    }
    const formatted = formatVerseCopy(text, p.book, p.chapter, verseNum, verseNum, p.versionName || p.abbr);
    const success = await copyTextToClipboard(formatted);
    if (success) {
      const bookName = BBE_BOOK_NAMES[p.book] || p.book;
      showToast(`📋 Copied ${bookName} ${p.chapter}:${verseNum}`);

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
      showToast("⚠️ Could not copy to clipboard");
    }
  }

  const YOUVERSION_HIGHLIGHT_COLORS = [
    { id: "fffe00", name: "Yellow", hex: "#fffe00" },
    { id: "5dff79", name: "Mint Green", hex: "#5dff79" },
    { id: "00d6ff", name: "Sky Blue", hex: "#00d6ff" },
    { id: "ffc66f", name: "Warm Amber", hex: "#ffc66f" },
    { id: "ff95ef", name: "Gentle Rose", hex: "#ff95ef" }
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
        <span class="bbe-temp-hl-icon">⚠️</span>
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
          <div class="bbe-signin-modal-badge">🔒 Sign-in Required</div>
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

  async function applyNativeHighlight(usfmArray, colorHex) {
    if (!usfmArray || !usfmArray.length) return false;
    const cleanHex = colorHex ? colorHex.replace("#", "").toLowerCase() : null;
    return new Promise((resolve) => {
      let resolved = false;
      const onDone = (e) => {
        if (resolved) return;
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
      }, 1800);

      window.dispatchEvent(new CustomEvent("BBE_CMD_HIGHLIGHT", {
        detail: { usfms: usfmArray, color: cleanHex }
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
            <span class="bbe-note-modal-icon">📝</span>
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
            <span class="bbe-note-save-icon">☁️</span>
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
    activeSaveIcon.textContent = "☁️";
    newSaveBtn.disabled = false;

    newSaveBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const text = textarea.value.trim();
      if (!text) {
        showToast("Please enter a note before saving.", 2500);
        textarea.focus();
        return;
      }

      newSaveBtn.disabled = true;
      activeSaveIcon.textContent = "⏳";
      activeSaveText.textContent = "Saving to YouVersion...";

      const res = await saveNativeNote(usfmArray, text, p?.id || 59);
      if (res && res.success) {
        modal.classList.remove("open");
        showToast(`✓ Note saved directly to your YouVersion account! (${refLabel})`, 4000);
      } else {
        newSaveBtn.disabled = false;
        activeSaveIcon.textContent = "☁️";
        activeSaveText.textContent = "Save to YouVersion";
        showToast(`❌ Failed to save to YouVersion: ${res?.error || "Unknown error"}`, 4500);
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
    if (!S.enabled) {
      if (selectionBarEl) selectionBarEl.classList.remove("show");
      return;
    }

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      if (selectionBarEl) selectionBarEl.classList.remove("show");
      return;
    }

    const chapterEl = document.querySelector('[class*="_chapter"]:not(#bbe-compare-grid *)');
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

    const allVerses = Array.from(chapterEl.querySelectorAll('[class*="_verse"][data-usfm]'));
    const matched = [];
    const prefix = `${p.book}.${p.chapter}.`;

    for (const v of allVerses) {
      if (range.intersectsNode(v)) {
        const usfm = v.getAttribute("data-usfm") || "";
        if (usfm.startsWith(prefix)) {
          const num = parseInt(usfm.slice(prefix.length), 10);
          if (!isNaN(num) && !matched.includes(num)) {
            matched.push(num);
          }
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
        <span class="bbe-sel-note-icon">${signedIn ? '📝' : '🔒'}</span>
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
        bar.classList.remove("show");
        if (isUserSignedIn()) {
          showToast(`🖍️ Highlighted ${refLabel}`);
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
        await applyNativeHighlight(usfmList, null);
        bar.classList.remove("show");
        showToast(`🖍️ Removed highlight on ${refLabel}`);
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

  // Intercept native Ctrl+C / Cmd+C on highlighted scripture text to strip verse numbers & headings
  document.addEventListener("copy", (e) => {
    if (!S.enabled || S.smartVerseCopy === false || S.copyCleanSelection === false) return;

    // Do not intercept if copying from inputs, textareas, notes editor, or modals
    const active = document.activeElement;
    if (active) {
      const tag = active.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (active.isContentEditable || active.getAttribute("contenteditable") === "true") return;
      if (active.closest && (active.closest("#bbe-drawer") || active.closest("#bbe-shortcuts-modal"))) return;
    }

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;

    const chapterEl = document.querySelector('[class*="_chapter"]:not(#bbe-compare-grid *)');
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
      const allVerses = Array.from(chapterEl.querySelectorAll('[class*="_verse"][data-usfm]'));
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
      showToast("📋 Copied clean scripture text");
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
        let short = c.title
          .replace(/['']s Commentary.*|'s Concise.*|'s Notes.*|'s Exposition.*| Commentary.*| Notes.*/gi, "")
          .trim();
        if (c.key === "the_gospel_coalition") short = "The Gospel Coalition";
        else if (c.key === "david_guzik") short = "David Guzik";
        else if (c.key === "thomas_constable") short = "Thomas Constable";
        else if (c.key === "bob_utley") short = "Bob Utley";
        else if (c.key === "matthew_henry") short = "Matthew Henry";
        else if (c.key === "john_calvin") short = "John Calvin";
        else if (c.key === "jfb") short = "JFB";
        else if (c.key === "pulpit") short = "Pulpit";
        else if (c.key === "keil_delitzsch") short = "Keil & Delitzsch";
        else if (c.key === "barnes") short = "Barnes";
        else if (c.key === "cambridge") short = "Cambridge";
        else if (c.key === "john_gill") short = "John Gill";
        else if (c.key === "meyer") short = "Meyer";
        else if (c.key === "vincent") short = "Vincent Word Studies";
        else if (c.key === "adam_clarke") short = "Adam Clarke";
        else if (c.key === "wesley") short = "Wesley";
        else if (c.key === "scofield") short = "Scofield";
        else if (c.key === "darby") short = "Darby";
        else if (c.key === "spurgeon") short = "Spurgeon";
        else if (c.key === "lange") short = "Lange";
        else if (c.key === "maclaren") short = "MacLaren";
        else if (c.key === "ellicott") short = "Ellicott";
        else if (c.key === "benson") short = "Benson";
        else if (c.key === "poole") short = "Matthew Poole";
        else if (c.key === "bengel") short = "Bengel";
        else if (c.key === "geneva_1599") short = "Geneva";
        authors.push({ key: c.key, label: short });
      }
    }

    const priorityOrder = [
      "all", "the_gospel_coalition", "david_guzik", "thomas_constable", "bob_utley",
      "matthew_henry", "john_calvin", "jfb", "pulpit", "keil_delitzsch",
      "barnes", "cambridge", "john_gill", "meyer", "vincent",
      "adam_clarke", "wesley", "scofield", "darby", "spurgeon",
      "lange", "maclaren", "ellicott", "benson", "poole", "bengel", "geneva_1599"
    ];
    authors.sort((a, b) => {
      const ai = priorityOrder.indexOf(a.key);
      const bi = priorityOrder.indexOf(b.key);
      const ar = ai === -1 ? 999 : ai;
      const br = bi === -1 ? 999 : bi;
      return ar - br;
    });

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
      authorTitle.textContent = `📖 ${item.title}`;
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
        ctaBtn.innerHTML = `<span>📖 Read <b>"${item.sectionTitle || 'Section'}"</b> on The Gospel Coalition</span> <span>↗</span>`;
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
      fetchAndRenderWordStudy(bookCode, ch, v);
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
      const chapterEl = document.querySelector('[class*="_chapter"]:not(#bbe-compare-grid *)');
      if (chapterEl) {
        const labels = chapterEl.querySelectorAll('[class*="_label"]');
        for (const label of labels) {
          const num = parseInt(label.textContent.trim(), 10);
          if (num === targetV) {
            const verseEl = label.closest('[class*="_verse"]') || label.parentElement;
            if (verseEl) {
              verseEl.scrollIntoView({ behavior: "smooth", block: "center" });
              verseEl.style.transition = "outline 0.2s, background-color 0.3s";
              verseEl.style.outline = "2px solid #2563eb";
              verseEl.style.backgroundColor = "rgba(37, 99, 235, 0.12)";
              setTimeout(() => {
                verseEl.style.outline = "";
                verseEl.style.backgroundColor = "";
              }, 2200);
              showToast(`⚡ Jumped to ${BBE_BOOK_NAMES[targetUSFM] || targetUSFM} ${targetCh}:${targetV}`);
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
        commEnableTgc: S.commEnableTgc !== false,
        commEnableGuzik: S.commEnableGuzik !== false,
        commEnableConstable: S.commEnableConstable !== false,
        commEnableUtley: S.commEnableUtley !== false
      }
    }, (res) => {
        if (!isDrawerOpen || currentDrawerPassage.verse !== vNum || activeStudyTab !== "commentary") return;

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
        buildCommentaryChips(res.commentaries, chipsEl, (authorKey) => {
          renderCommentaryItems(res.commentaries, authorKey, bodyEl);
        });
        renderCommentaryItems(res.commentaries, activeAuthorFilter, bodyEl);
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
        if (!isDrawerOpen || currentDrawerPassage.verse !== vNum || activeStudyTab !== "crossref") return;

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
        summaryEl.innerHTML = `<b>Treasury of Scripture Knowledge (TSK)</b> — <b>${totalVerses}</b> connected ${totalVerses === 1 ? "verse" : "verses"} across <b>${res.sections.length}</b> thematic ${res.sections.length === 1 ? "phrase" : "phrases"}. Click any reference or <b>↗ Jump</b> to view on Bible.com, or <b>💬 Study</b> to inspect in this drawer.`;
        crossBody.appendChild(summaryEl);

        res.sections.forEach(sec => {
          const secEl = document.createElement("div");
          secEl.className = "bbe-crossref-section";

          const headingEl = document.createElement("div");
          headingEl.className = "bbe-crossref-heading";
          headingEl.innerHTML = `<span>💬</span> <span class="bbe-crossref-quote">“${sec.phrase}”</span>`;
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
            studyBtn.innerHTML = "💬 Study";
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

  function openCommentaryDrawer(bookCode, chapter, verseNum, optTab) {
    const { backdrop, drawer } = ensureDrawerElements();
    isDrawerOpen = true;

    applyDrawerDockClasses(drawer);

    const vNum = Number(verseNum) || 1;
    currentDrawerPassage = {
      book: bookCode,
      chapter: String(chapter),
      verse: vNum
    };

    backdrop.classList.add("open");
    drawer.classList.add("open");

    const bookTitle = BBE_BOOK_NAMES[bookCode] || bookCode;
    const refText = `${bookTitle} ${chapter}:${vNum}`;

    drawer.querySelector("#bbe-drawer-ref").textContent = refText;
    drawer.querySelector("#bbe-stepper-label").textContent = `v. ${vNum}`;
    drawer.querySelector("#bbe-stepper-prev").disabled = (vNum <= 1);

    const previewEl = drawer.querySelector("#bbe-drawer-preview");
    const verseText = getVerseTextFromDom(vNum);
    const p = bbeParsePath(location.pathname);
    const activeKey = p ? (bbeKeyForId(p.id) || p.abbr || "NIV") : "NIV";

    if (verseText) {
      previewEl.style.display = "";
      previewEl.innerHTML = `<b>${bookTitle} ${chapter}:${vNum} (${activeKey})</b> “${verseText}”`;
    } else {
      previewEl.style.display = "none";
    }

    if (optTab) {
      activeStudyTab = optTab;
    }
    switchStudyTab(activeStudyTab || S.defaultStudyTab || "commentary");

    if (p) renderToolbar(p);
  }

  function renderVerseBadges(p, force = false) {
    const chapterEl = document.querySelector('[class*="_chapter"]:not(#bbe-compare-grid *)');
    if (!chapterEl) return;

    const chapKey = `${p.book}.${p.chapter}.${p.id || p.abbr}`;
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
        openCommentaryDrawer(p.book, p.chapter, vNum);
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
        if (!isDrawerOpen || currentDrawerPassage.verse !== vNum || activeStudyTab !== "wordstudy") return;

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
        <div class="bbe-card-orig ${w.lang === 'hebrew' ? 'hebrew' : 'greek'}">${w.original || ''}</div>
        <div class="bbe-card-translit">${w.translit || ''}</div>
        <div class="bbe-card-gloss">“${w.gloss || ''}”</div>
        <span class="bbe-card-strongs ${w.lang === 'hebrew' ? 'hebrew' : 'greek'}">${w.strongs || ''}</span>
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
            <span class="bbe-strongs-pill ${langClass}">${e.strongs}</span>
            <span class="bbe-tooltip-translit">${e.translit || word.translit || ''}</span>
            ${e.phonetic ? `<span class="bbe-tooltip-phonetic">(${e.phonetic})</span>` : ''}
          </div>
          <div class="bbe-tooltip-actions">
            <a href="${bibleHubUrl}" target="_blank" rel="noopener" class="bbe-tooltip-link">BibleHub Lexicon ↗</a>
          </div>
        </div>
        <div class="bbe-tooltip-main">
          <div class="bbe-tooltip-orig-row">
            <span class="bbe-tooltip-orig ${langClass}">${e.original || word.original || ''}</span>
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
    if (top + tooltipHeight > window.innerHeight && rect.top > tooltipHeight + margin) {
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
          <span class="bbe-strongs-pill ${langClass}">${w.strongs}</span>
          <span class="bbe-tooltip-translit">${w.translit || ''}</span>
        </div>
        <div class="bbe-tooltip-actions">
          <a href="${bibleHubUrl}" target="_blank" rel="noopener" class="bbe-tooltip-link">BibleHub ↗</a>
          <button type="button" class="bbe-tooltip-close" title="Close">✕</button>
        </div>
      </div>
      <div class="bbe-tooltip-main" id="bbe-tooltip-main-content">
        <div class="bbe-tooltip-orig-row">
          <span class="bbe-tooltip-orig ${langClass}">${w.original || ''}</span>
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
        <button type="button" class="bbe-preview-btn" id="bbe-tooltip-drawer-btn" style="font-size:11px;padding:3px 8px;">📖 Open in Study Drawer</button>
      </div>
    `;

    tooltip.querySelector(".bbe-tooltip-close").addEventListener("click", () => hideWordTooltip());

    tooltip.querySelector("#bbe-tooltip-drawer-btn").addEventListener("click", () => {
      hideWordTooltip();
      openCommentaryDrawer(bookCode, chapter, vNum, "wordstudy", selectedIdx);
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
            <span class="bbe-tooltip-orig ${langClass}">${e.original || w.original || ''}</span>
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
    const chapterEl = document.querySelector('[class*="_chapter"]:not(#bbe-compare-grid *)');
    if (!chapterEl) return;

    if (!chapterEl.dataset.bbeWordStudyBound) {
      chapterEl.dataset.bbeWordStudyBound = "1";

      let wordMouseMoveRaf = null;
      chapterEl.addEventListener("mousemove", (e) => {
        if (!S.enabled || !S.wordStudyMode) return;
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
        if (!S.enabled || !S.wordStudyMode) return;
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
    const curChapterEl = document.querySelector('[class*="_chapter"]:not(#bbe-compare-grid *)');
    if (curChapterEl && adjacentChapterCache.has(clean)) {
      adjacentChapterCache.get(clean).then(data => {
        curChapterEl.innerHTML = data.html;
        if (data.title) document.title = data.title;
        const { prevEl, nextEl } = getNativeChapterUrls();
        if (prevEl && data.prevHref) prevEl.setAttribute("href", data.prevHref);
        if (nextEl && data.nextHref) nextEl.setAttribute("href", data.nextHref);
        lastRenderKey = "";
        tick();
        preloadAdjacentChapters();
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
    // Escape key closes modal or commentary drawer
    if (e.key === "Escape") {
      if (isShortcutsModalOpen) {
        e.preventDefault();
        closeShortcutsModal();
        return;
      }
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

    if (!S.enabled || !S.enableKeyShortcuts) return;

    // Ignore if shortcuts modal is open
    if (isShortcutsModalOpen) return;

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

    // Arrow keys for Left / Right instant chapter navigation
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

    const k = e.key.toLowerCase();
    const keyMap = getKeyMap();

    // Check if key is mapped to a translation shortcut
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

    // 'C' shortcut toggles commentary drawer if not mapped to a translation
    if (k === "c") {
      const allVers = getAllVersions();
      const p = bbeParsePath(location.pathname, allVers);
      if (p) {
        e.preventDefault();
        if (isDrawerOpen) {
          closeCommentaryDrawer();
        } else {
          openCommentaryDrawer(p.book, p.chapter, 1);
        }
      }
      return;
    }

    // 'W' shortcut toggles Strong's Word Study mode if not mapped to a translation
    if (k === "w") {
      e.preventDefault();
      const next = !S.wordStudyMode;
      bbeSave({ wordStudyMode: next }).then(() => {
        showToast(next ? "🔬 Word Study mode activated. Hover or click words for Strong's lexicon." : "🔬 Word Study mode deactivated.");
      });
      return;
    }

    // 'H' shortcut highlights current selection or hovered verse with default color
    if (k === "h" && !keyMap["h"] && S.youversionHighlighting !== false) {
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
          showToast(`🖍️ Removed highlight`);
        } else {
          applyNativeHighlight([usfm], defColor);
          if (isUserSignedIn()) {
            showToast(`🖍️ Highlighted ${usfm.split('.').pop()}`);
          } else {
            showTemporaryHighlightBanner(`Verse ${usfm.split('.').pop()}`);
          }
        }
        return;
      }
    }
  });

  /* ---------------- Toolbar Construction ---------------- */
  function createBtn(text, title, onClick, isActive, isSmall) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "bbe-btn" + (isActive ? " bbe-active" : "") + (isSmall ? " bbe-btn-sm" : "");
    b.textContent = text;
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
    const ver = allVers[activeKey] || allVers.NIV || BBE_VERSIONS.NIV;

    if (ref) {
      // Direct jump to scripture reference
      const path = `/bible/${ver.id}/${ref.book}.${ref.chapter}${ref.verses ? "." + ref.verses : ""}.${activeKey}`;
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
    if (isShortcutsModalOpen) return;

    if (!isBarHidden) {
      isBarHidden = true;
      bar.classList.add("bbe-hidden");
    }
  }

  function updateScrollProgress() {
    const fill = document.querySelector(".bbe-scroll-progress-fill");
    if (!fill) return;
    const chapterEl = document.querySelector('[class*="_chapter"]:not(#bbe-compare-grid *)') || document.querySelector('main');
    if (!chapterEl) return;
    const rect = chapterEl.getBoundingClientRect();
    const totalHeight = rect.height;
    const viewportHeight = window.innerHeight;
    const scrollable = totalHeight - viewportHeight * 0.5;
    if (scrollable <= 0) {
      fill.style.width = "100%";
      return;
    }
    const scrolled = Math.max(0, -rect.top + 80);
    const pct = Math.min(100, Math.max(0, (scrolled / scrollable) * 100));
    fill.style.width = pct.toFixed(1) + "%";
  }

  let scrollRafTicking = false;
  window.addEventListener("scroll", () => {
    if (scrollRafTicking) return;
    scrollRafTicking = true;
    requestAnimationFrame(() => {
      scrollRafTicking = false;
      updateScrollProgress();

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
      const textContainer = document.querySelector('[class*="_yv-bible-text"]') ||
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
      const textContainer = document.querySelector('[class*="_yv-bible-text"]') ||
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

    bar.replaceChildren();

    const allVers = getAllVersions();
    const activeKey = bbeKeyForId(p.id, allVers) || p.abbr || "NIV";
    const bookTitle = BBE_BOOK_NAMES[p.book] || p.book;

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
    searchIcon.textContent = "🔍";

    const currentPassageTitle = `${bookTitle} ${p.chapter}`;

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
      btn.className = "bbe-btn bbe-version-btn" + (isCur ? " bbe-active" : "");
      btn.dataset.version = key;
      const hint = bbeGetKeyHintForVersion(key, S.customShortcuts);
      btn.title = `${v.name}${hint ? " (Shortcut: " + hint + ")" : ""}`;
      
      const labelSpan = document.createElement("span");
      labelSpan.textContent = key;
      btn.appendChild(labelSpan);

      // Key shortcut badge
      if (hint && S.enableKeyShortcuts) {
        const hintSpan = document.createElement("span");
        hintSpan.className = "bbe-key-hint";
        hintSpan.textContent = hint;
        btn.appendChild(hintSpan);
      }

      btn.addEventListener("mouseenter", () => {
        if (!isCur) fetchChapter(key, p).catch(() => {});
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

    const popover = document.createElement("div");
    popover.className = "bbe-versions-popover";
    popover.innerHTML = `
      <div class="bbe-popover-title">
        <span>Choose Translations</span>
      </div>
      <div class="bbe-popover-grid" id="bbe-popover-grid"></div>
      <div class="bbe-popover-footer">
        <button type="button" class="bbe-popover-link-btn" id="bbe-open-shortcuts-link">⌨ Edit Shortcuts &amp; Versions</button>
      </div>
    `;

    const popoverGrid = popover.querySelector("#bbe-popover-grid");
    const selectedSet = new Set(activeToolbarList);

    for (const verKey of Object.keys(allVers)) {
      const pill = document.createElement("span");
      const isSel = selectedSet.has(verKey);
      pill.className = "bbe-popover-pill" + (isSel ? " active" : "");
      pill.textContent = (isSel ? "✓ " : "") + verKey;
      pill.title = allVers[verKey].name;

      pill.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (selectedSet.has(verKey)) {
          if (selectedSet.size > 1) {
            selectedSet.delete(verKey);
          }
        } else {
          selectedSet.add(verKey);
        }
        const updated = Object.keys(allVers).filter(k => selectedSet.has(k));
        await bbeSave({ toolbarVersions: updated });
      });

      popoverGrid.appendChild(pill);
    }

    const shortcutsLink = popover.querySelector("#bbe-open-shortcuts-link");
    if (shortcutsLink) {
      shortcutsLink.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        popover.classList.remove("open");
        openShortcutsModal();
      });
    }

    customizeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      popover.classList.toggle("open");
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
      S.compareOn ? "⫴ Comparing" : "⫴ Compare",
      "Toggle side-by-side translation comparison",
      async () => {
        await bbeSave({ compareOn: !S.compareOn });
      },
      S.compareOn
    );
    rightSec.appendChild(compareBtn);

    // Commentary Drawer Button
    const commBtn = createBtn(
      isDrawerOpen ? "💬 Commentary On" : "💬 Commentary",
      "Open verse study commentary (Shortcut: C)",
      () => {
        if (isDrawerOpen) {
          closeCommentaryDrawer();
        } else {
          openCommentaryDrawer(p.book, p.chapter, 1);
        }
      },
      isDrawerOpen,
      true
    );
    rightSec.appendChild(commBtn);

    // Word Study Mode Toggle Button
    const wordStudyBtn = createBtn(
      S.wordStudyMode ? "🔬 Word Study On" : "🔬 Word Study",
      "Toggle Strong's Greek/Hebrew word study mode (Shortcut: W)",
      async () => {
        const next = !S.wordStudyMode;
        await bbeSave({ wordStudyMode: next });
        showToast(next ? "🔬 Word Study mode activated. Hover or click words for Strong's lexicon." : "🔬 Word Study mode deactivated.");
      },
      S.wordStudyMode,
      true
    );
    wordStudyBtn.classList.add("bbe-wordstudy-btn");
    rightSec.appendChild(wordStudyBtn);

    const sep1 = document.createElement("span");
    sep1.className = "bbe-sep";
    rightSec.appendChild(sep1);

    // Width Resizer Hover-Expandable Pill & Popover (750, 950, 1200, Max + Retire to Settings)
    if (S.showWidthControls !== false) {
      const curWidth = S.columnWidth || 950;
      let activeLabel = "950";
      if (Math.abs(curWidth - 750) < 40) activeLabel = "750";
      else if (Math.abs(curWidth - 950) < 40) activeLabel = "950";
      else if (Math.abs(curWidth - 1200) < 40) activeLabel = "1200";
      else if (Math.abs(curWidth - 1800) < 40) activeLabel = "Max";
      else activeLabel = curWidth + "px";

      const widthWrap = document.createElement("div");
      widthWrap.className = "bbe-width-wrap";

      const widthBtn = document.createElement("button");
      widthBtn.type = "button";
      widthBtn.className = "bbe-btn bbe-btn-sm bbe-width-btn";
      widthBtn.title = `Reading column width: ${curWidth}px (hover to change or retire)`;
      widthBtn.innerHTML = `<span class="bbe-width-icon">↔</span><span class="bbe-width-label">${activeLabel}</span><span class="bbe-width-caret">▾</span>`;

      const widthPop = document.createElement("div");
      widthPop.className = "bbe-width-popover";
      widthPop.innerHTML = `
        <div class="bbe-popover-title">
          <span>Column Width</span>
          <span class="bbe-width-pop-val">${activeLabel === "Max" ? "Max (1800px)" : curWidth + "px"}</span>
        </div>
        <div class="bbe-width-presets-row"></div>
        <div class="bbe-popover-footer" style="padding-top:2px;">
          <button type="button" class="bbe-popover-link-btn bbe-retire-width-btn" id="bbe-retire-width-btn" title="Permanently retire width resizer to extension settings and remove it from the main pill">
            ⚙ Retire to Settings
          </button>
        </div>
      `;

      const presetsRow = widthPop.querySelector(".bbe-width-presets-row");
      const widths = [
        { label: "750", val: 750, title: "750px — Standard readable column" },
        { label: "950", val: 950, title: "950px — Optimal comfortable reading" },
        { label: "1200", val: 1200, title: "1200px — Wide widescreen view" },
        { label: "Max", val: 1800, title: "Max (1800px) — Full viewport span" }
      ];

      widths.forEach(w => {
        const isW = Math.abs(curWidth - w.val) < 40;
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "bbe-popover-pill" + (isW ? " active" : "");
        chip.textContent = w.label;
        chip.title = w.title;

        chip.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          S.columnWidth = w.val;
          syncDomClasses();
          await bbeSave({ columnWidth: w.val });
          showToast(`Column Width: ${w.label === "Max" ? "Max (1800px)" : w.val + "px"}`);
          widthPop.classList.remove("open");
          lastRenderKey = "";
          renderToolbar(p);
        });

        presetsRow.appendChild(chip);
      });

      const retireBtn = widthPop.querySelector("#bbe-retire-width-btn");
      if (retireBtn) {
        retireBtn.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          S.showWidthControls = false;
          await bbeSave({ showWidthControls: false });
          showToast("Width resizer retired. Restore anytime in Settings (⚙) > Floating Toolbar or Typography.");
          widthPop.classList.remove("open");
          lastRenderKey = "";
          renderToolbar(p);
        });
      }

      // Smooth hover with grace period to prevent flickering
      let widthCloseTimer = null;
      widthWrap.addEventListener("mouseenter", () => {
        clearTimeout(widthCloseTimer);
        widthPop.classList.add("open");
      });
      widthWrap.addEventListener("mouseleave", () => {
        clearTimeout(widthCloseTimer);
        widthCloseTimer = setTimeout(() => {
          widthPop.classList.remove("open");
        }, 160);
      });

      widthBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        widthPop.classList.toggle("open");
      });

      widthWrap.appendChild(widthBtn);
      widthWrap.appendChild(widthPop);
      rightSec.appendChild(widthWrap);
    }

    // Unified Aa Reader Menu (Appearance: Text Size, Font Family, Theme Swatches + Retire to Settings)
    if (S.showAaMenu !== false) {
      if (S.showWidthControls !== false) {
        const sepWidthAa = document.createElement("span");
        sepWidthAa.className = "bbe-sep";
        rightSec.appendChild(sepWidthAa);
      }

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
            <button type="button" class="bbe-theme-swatch swatch-system ${curTheme === 'system' ? 'active' : ''}" data-theme="system" title="System Default">⚪</button>
            <button type="button" class="bbe-theme-swatch swatch-sepia ${curTheme === 'sepia' ? 'active' : ''}" data-theme="sepia" title="Warm Paper (Sepia)">📜</button>
            <button type="button" class="bbe-theme-swatch swatch-light ${curTheme === 'light' ? 'active' : ''}" data-theme="light" title="Clean Light">☀️</button>
            <button type="button" class="bbe-theme-swatch swatch-dark ${curTheme === 'dark' ? 'active' : ''}" data-theme="dark" title="Night Dark">🌙</button>
            <button type="button" class="bbe-theme-swatch swatch-oled ${curTheme === 'oled' ? 'active' : ''}" data-theme="oled" title="OLED Pitch Black">🖤</button>
            <button type="button" class="bbe-theme-swatch swatch-blue ${curTheme === 'blue' ? 'active' : ''}" data-theme="blue" title="Midnight Navy">🌊</button>
            <button type="button" class="bbe-theme-swatch swatch-green ${curTheme === 'green' ? 'active' : ''}" data-theme="green" title="Sage Herb">🌿</button>
            <button type="button" class="bbe-theme-swatch swatch-historical ${curTheme === 'historical' ? 'active' : ''}" data-theme="historical" title="Ancient Manuscript (Historical)">🏛</button>
          </div>
        </div>

        <!-- 5. Footer: Retire to Settings -->
        <div class="bbe-popover-footer" style="padding-top:2px;">
          <button type="button" class="bbe-popover-link-btn bbe-retire-aa-btn" id="bbe-retire-aa-btn" title="Permanently retire Aa reader menu to extension settings and remove it from the main pill">
            ⚙ Retire to Settings (Remove from pill)
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
          showToast(`Column Width: ${lbl}`);
          lastRenderKey = "";
          renderToolbar(p);
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
          showToast("Aa Reader Menu retired. Restore anytime in Settings (⚙) > Floating Toolbar or Typography.");
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
    }

    if (S.showWidthControls !== false || S.showAaMenu !== false) {
      const sepEnd = document.createElement("span");
      sepEnd.className = "bbe-sep";
      rightSec.appendChild(sepEnd);
    }

    // Clean View Toggle (1-click hide/show distractions)
    const isCleanView = S.hideHeader && S.hideSidebar && S.hideDistractionCards && S.hideFooter;
    rightSec.appendChild(createBtn(isCleanView ? "👁 Clean View On" : "👁 Clean View", "Toggle clean reading view (distraction-free)", async () => {
      const turnOn = !isCleanView;
      await bbeSave({
        hideHeader: turnOn,
        hideSidebar: turnOn,
        hideDistractionCards: turnOn,
        hideFooter: turnOn,
        hideBottomBar: turnOn,
        hideCopyright: turnOn
      });
    }, isCleanView, true));

    // Settings Button (opens on-page modal with all advanced options)
    const settingsBtn = createBtn("⚙ Settings", "Extension Settings & Advanced Options (Click to open, right-click for options tab)", () => {
      openSettingsModal();
    }, isSettingsModalOpen, true);
    settingsBtn.classList.add("bbe-settings-btn");
    settingsBtn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openExtensionOptionsTab();
    });
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
        isInter ? "📑 Interleaved" : "🏛 Columns",
        "Toggle comparison layout: Columns (whole chapters) vs Interleaved (verse-by-verse)",
        async () => {
          await bbeSave({ compareLayout: isInter ? "columns" : "interleaved" });
        },
        true,
        true
      );
      compRow.appendChild(layoutToggleBtn);

      const sep = document.createElement("div");
      sep.className = "bbe-sep";
      compRow.appendChild(sep);

      const selSet = new Set(S.compareVersions || ["NIV", "ESV"]);
      for (const key of Object.keys(allVers)) {
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
      bar.appendChild(compRow);
    }

    // Subtle Scroll Progress Bar along bottom edge of floating pill
    if (S.showScrollProgress !== false) {
      const scrollLine = document.createElement("div");
      scrollLine.className = "bbe-scroll-progress-line";
      const scrollFill = document.createElement("div");
      scrollFill.className = "bbe-scroll-progress-fill";
      scrollLine.appendChild(scrollFill);
      bar.appendChild(scrollLine);
      updateScrollProgress();
    }

    fitBarWidth();
  }

  function fitBarWidth() {
    const bar = document.getElementById("bbe-bar");
    if (!bar) return;

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
    const maxAvailable = window.innerWidth * 0.97;

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
    const origChapter = document.querySelector('[class*="_chapter"]:not(#bbe-compare-grid *)');
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

  function createCompareVersionSelect(currentKey, onSelectVersion) {
    const allVers = getAllVersions();
    const select = document.createElement("select");
    select.className = "bbe-compare-version-dropdown";
    select.title = "Switch translation for this slot";

    for (const [key, v] of Object.entries(allVers)) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = `${key} — ${v.name}`;
      if (key === currentKey) opt.selected = true;
      select.appendChild(opt);
    }

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

    for (const [key, v] of Object.entries(allVers)) {
      if (currentVersions.includes(key)) continue;
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = `+ ${key} (${v.name})`;
      select.appendChild(opt);
    }

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
        const reader = document.querySelector('[class*="_yv-bible-text"]') || document.querySelector('main');
        if (reader) reader.appendChild(grid);
      }
    }

    html.classList.add("bbe-compare-active");

    const allVers = getAllVersions();
    const versions = (S.compareVersions || ["NIV", "ESV"]).filter(k => allVers[k]);
    if (versions.length === 0) versions.push("NIV", "ESV");

    grid.replaceChildren();

    const origChapter = document.querySelector('[class*="_chapter"]:not(#bbe-compare-grid *)');
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
    colsBtn.innerHTML = `<span>🏛</span> Columns`;
    colsBtn.title = "Side-by-side whole chapters comparison";
    colsBtn.addEventListener("click", async () => {
      if (S.compareLayout !== "columns") {
        await bbeSave({ compareLayout: "columns" });
      }
    });

    const interBtn = document.createElement("button");
    interBtn.type = "button";
    interBtn.className = "bbe-layout-toggle-btn" + (isInterleaved ? " active" : "");
    interBtn.innerHTML = `<span>📑</span> Interleaved`;
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

      // Actions in Header (Make Primary + Remove Column)
      const actions = document.createElement("div");
      actions.className = "bbe-col-actions";

      const makePrimary = document.createElement("button");
      makePrimary.type = "button";
      makePrimary.className = "bbe-col-btn bbe-col-btn-primary";
      makePrimary.textContent = "Make Primary";
      makePrimary.title = `Switch main reading translation to ${v.name}`;
      makePrimary.addEventListener("click", () => {
        location.href = bbeBuildPath(v.id, key, p);
      });
      actions.appendChild(makePrimary);

      if (versions.length > 1) {
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
      }

      header.appendChild(actions);
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

      // Render content
      if (v.id === p.id && origChapter) {
        body.replaceChildren(origChapter.cloneNode(true));
        const cloned = body.querySelector('[class*="_chapter"]');
        if (cloned) cloned.style.display = "";
      } else {
        fetchChapter(key, p)
          .then((chapterHtml) => {
            const temp = document.createElement("div");
            temp.innerHTML = chapterHtml;
            body.replaceChildren(temp);
          })
          .catch((err) => {
            loading.textContent = `Could not load ${key} (${err.message})`;
          });
      }
    }

    container.appendChild(colsGrid);
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

      const cellActions = document.createElement("div");
      cellActions.className = "bbe-interleaved-cell-actions";

      const makePrimary = document.createElement("button");
      makePrimary.type = "button";
      makePrimary.className = "bbe-col-btn bbe-col-btn-primary";
      makePrimary.textContent = "Primary";
      makePrimary.title = `Switch main reading translation to ${v.name}`;
      makePrimary.addEventListener("click", () => {
        location.href = bbeBuildPath(v.id, key, p);
      });
      cellActions.appendChild(makePrimary);

      if (versions.length > 1) {
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
      }

      colHead.appendChild(cellActions);
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

      const allVerseNums = Array.from(new Set(
        results.flatMap(r => Object.keys(r.map).map(Number))
      )).sort((a, b) => a - b);

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
        left.innerHTML = `<span>📖 Verse ${verseNum}</span> <span class="bbe-interleaved-pill">${p.book} ${p.chapter}:${verseNum}</span>`;
        header.appendChild(left);

        const actions = document.createElement("div");
        actions.className = "bbe-interleaved-actions";

        // Copy Comparison button
        const copyCompBtn = document.createElement("button");
        copyCompBtn.type = "button";
        copyCompBtn.className = "bbe-interleaved-action-btn";
        copyCompBtn.innerHTML = `<span>📋</span> Copy Comparison`;
        copyCompBtn.title = "Copy this verse across all compared translations";
        copyCompBtn.addEventListener("click", async () => {
          const lines = [
            `${p.book} ${p.chapter}:${verseNum} Comparison:`
          ];
          for (const k of versions) {
            const vText = verseMaps[k]?.[verseNum] || "(omitted)";
            lines.push(`[${k}] ${vText}`);
          }
          const textToCopy = lines.join("\n");
          try {
            await navigator.clipboard.writeText(textToCopy);
            copyCompBtn.innerHTML = `<span>✓</span> Copied!`;
            setTimeout(() => {
              copyCompBtn.innerHTML = `<span>📋</span> Copy Comparison`;
            }, 1800);
          } catch (e) {
            showToast("Failed to copy comparison text.");
          }
        });
        actions.appendChild(copyCompBtn);

        // Study Drawer button
        const studyBtn = document.createElement("button");
        studyBtn.type = "button";
        studyBtn.className = "bbe-interleaved-action-btn";
        studyBtn.innerHTML = `<span>💬</span> Study`;
        studyBtn.title = `Study: Open commentary and cross-references for Verse ${verseNum}`;
        studyBtn.addEventListener("click", () => {
          openCommentaryDrawer(p.book, p.chapter, verseNum, S.defaultStudyTab || "commentary");
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
          vtag.className = "bbe-interleaved-cell-vtag";
          vtag.textContent = key;
          vtag.title = allVers[key]?.name || key;
          cellHeader.appendChild(vtag);

          const copySingleBtn = document.createElement("button");
          copySingleBtn.type = "button";
          copySingleBtn.className = "bbe-col-btn";
          copySingleBtn.innerHTML = `📋 Copy`;
          copySingleBtn.title = `Copy ${key} text for verse ${verseNum}`;
          copySingleBtn.addEventListener("click", async () => {
            const vText = verseMaps[key]?.[verseNum] || "";
            if (!vText) return;
            const formatted = formatVerseCopy(vText, p.book, p.chapter, verseNum, verseNum, key);
            try {
              await navigator.clipboard.writeText(formatted);
              copySingleBtn.textContent = `✓ Copied!`;
              setTimeout(() => {
                copySingleBtn.innerHTML = `📋 Copy`;
              }, 1600);
            } catch (err) {}
          });
          cellHeader.appendChild(copySingleBtn);
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

  /* ---------- Settings & Advanced Options Modal Dialog ---------- */
  let isShortcutsModalOpen = false;
  let isSettingsModalOpen = false;
  let activeSettingsTab = "shortcuts";
  let recordingKeyForVersion = null;

  function closeSettingsModal() {
    isSettingsModalOpen = false;
    isShortcutsModalOpen = false;
    recordingKeyForVersion = null;
    const backdrop = document.getElementById("bbe-modal-backdrop");
    const modal = document.getElementById("bbe-shortcuts-modal");
    if (backdrop) backdrop.classList.remove("open");
    if (modal) modal.classList.remove("open");
  }

  function openExtensionOptionsTab() {
    try {
      safeSendMessage({ type: "OPEN_OPTIONS" }, (res) => {
        if (!res?.ok) {
          try {
            if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
              window.open(chrome.runtime.getURL("popup.html"), "_blank");
            }
          } catch (e) {}
        }
      });
    } catch (e) {}
  }

  function closeShortcutsModal() {
    closeSettingsModal();
  }

  function ensureSettingsModal() {
    let backdrop = document.getElementById("bbe-modal-backdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "bbe-modal-backdrop";
      backdrop.addEventListener("click", closeSettingsModal);
      document.body.appendChild(backdrop);
    }

    let modal = document.getElementById("bbe-shortcuts-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "bbe-shortcuts-modal";
      document.body.appendChild(modal);

      // Keydown listener on modal to capture single key when recording
      modal.addEventListener("keydown", async (e) => {
        if (!recordingKeyForVersion) return;
        e.preventDefault();
        e.stopPropagation();

        const versionKey = recordingKeyForVersion;
        recordingKeyForVersion = null;

        if (e.key === "Escape") {
          renderSettingsModalContent();
          return;
        }

        if (e.key === "Backspace" || e.key === "Delete") {
          const updated = { ...(S.customShortcuts || BBE_KEY_MAP) };
          for (const [k, mapped] of Object.entries(updated)) {
            if (mapped === versionKey) delete updated[k];
          }
          S.customShortcuts = updated;
          await bbeSave({ customShortcuts: updated });
          renderSettingsModalContent();
          lastRenderKey = "";
          const p = bbeParsePath(location.pathname, getAllVersions());
          if (p) renderToolbar(p);
          return;
        }

        // Single alphanumeric character
        if (/^[a-zA-Z0-9]$/.test(e.key)) {
          const assignedKey = e.key.toLowerCase();
          const updated = { ...(S.customShortcuts || BBE_KEY_MAP) };

          // Clear any existing assignment for this version
          for (const [k, mapped] of Object.entries(updated)) {
            if (mapped === versionKey) delete updated[k];
          }

          updated[assignedKey] = versionKey;
          S.customShortcuts = updated;
          await bbeSave({ customShortcuts: updated });
          showToast(`⚡ Assigned [${assignedKey.toUpperCase()}] to ${versionKey}`);
          renderSettingsModalContent();

          // Trigger background preloading for this version immediately
          const p = bbeParsePath(location.pathname, getAllVersions());
          if (p) {
            preloadOtherVersions(p, true);
            lastRenderKey = "";
            renderToolbar(p);
          }
        }
      });
    }
  }

  function ensureShortcutsModal() {
    ensureSettingsModal();
  }

  function renderSettingsModalContent() {
    const modal = document.getElementById("bbe-shortcuts-modal");
    if (!modal) return;

    const allVers = getAllVersions();
    const currentShortcuts = { ...(S.customShortcuts || BBE_KEY_MAP) };

    const isPillRetired = (S.showAaMenu === false) || (S.showWidthControls === false);
    let retiredBannerHtml = "";
    if (isPillRetired) {
      let retiredText = "";
      if (S.showAaMenu === false && S.showWidthControls === false) {
        retiredText = "Unified Aa Reader Menu and Standalone Width controls are hidden from the floating toolbar.";
      } else if (S.showAaMenu === false) {
        retiredText = "Unified Aa Reader Menu is hidden from the floating toolbar.";
      } else {
        retiredText = "Standalone Width Resizer is hidden from the floating toolbar.";
      }

      retiredBannerHtml = `
        <div class="bbe-modal-retired-banner">
          <div class="bbe-retired-banner-content">
            <span class="bbe-retired-banner-icon">💡</span>
            <div class="bbe-retired-banner-text">
              <strong>Toolbar Controls Retired:</strong> ${retiredText}
            </div>
          </div>
          <button type="button" class="bbe-restore-banner-btn" id="bbe-modal-quick-restore-btn" title="Click to instantly restore all retired quick controls to the floating top toolbar">
            ↺ Restore to Toolbar
          </button>
        </div>
      `;
    }

    modal.innerHTML = `
      <div class="bbe-modal-header">
        <div class="bbe-modal-title">
          <span>⚙ Deep Bible Settings</span>
        </div>
        <div class="bbe-modal-header-actions">
          <a href="https://forms.gle/FN8w2g7MakzTS9GZ9" target="_blank" rel="noopener noreferrer" class="bbe-modal-feedback-btn" id="bbe-modal-feedback-btn" title="Submit feedback, report a bug, or request a feature">💬 Feedback / Bugs ↗</a>
          <button type="button" class="bbe-modal-reset-btn" id="bbe-modal-reset-all-btn" title="Reset all settings and customizations to brand-new first-install state">↺ Reset to First Install</button>
          <button type="button" class="bbe-modal-ext-tab-btn" id="bbe-modal-ext-tab-btn" title="Open extension options in new browser tab">Open Options Tab ↗</button>
          <button type="button" class="bbe-modal-close" id="bbe-modal-close-btn" title="Close (Esc)">✕</button>
        </div>
      </div>
      <div class="bbe-modal-tabs">
        <button type="button" class="bbe-modal-tab ${activeSettingsTab === 'shortcuts' ? 'active' : ''}" data-tab="shortcuts">⚡ Shortcuts &amp; Versions</button>
        <button type="button" class="bbe-modal-tab ${activeSettingsTab === 'typography' ? 'active' : ''}" data-tab="typography">📖 Reading &amp; Typography</button>
        <button type="button" class="bbe-modal-tab ${activeSettingsTab === 'animation' ? 'active' : ''}" data-tab="animation">⚡ Navigation &amp; Reading</button>
        <button type="button" class="bbe-modal-tab ${activeSettingsTab === 'study' ? 'active' : ''}" data-tab="study">💬 Study &amp; Lexicon</button>
        <button type="button" class="bbe-modal-tab ${activeSettingsTab === 'toolbar' ? 'active' : ''}" data-tab="toolbar">🛠 Floating Toolbar</button>
        <button type="button" class="bbe-modal-tab ${activeSettingsTab === 'distractions' ? 'active' : ''}" data-tab="distractions">👁 Distraction-Free</button>
        <button type="button" class="bbe-modal-tab ${activeSettingsTab === 'css' ? 'active' : ''}" data-tab="css">🎨 Custom CSS</button>
      </div>
      ${retiredBannerHtml}
      <div class="bbe-modal-body" id="bbe-modal-tab-body"></div>
    `;

    modal.querySelector("#bbe-modal-close-btn").addEventListener("click", closeSettingsModal);

    modal.querySelector("#bbe-modal-feedback-btn")?.addEventListener("click", (e) => {
      e.preventDefault();
      window.open("https://forms.gle/FN8w2g7MakzTS9GZ9", "_blank", "noopener,noreferrer");
    });

    modal.querySelector("#bbe-modal-ext-tab-btn")?.addEventListener("click", () => {
      openExtensionOptionsTab();
    });

    modal.querySelector("#bbe-modal-reset-all-btn")?.addEventListener("click", async () => {
      if (!confirm("Reset Deep Bible to original first-install state?\n\nThis will remove all user-customized settings, shortcuts, themes, and retired pills back to original factory defaults.")) {
        return;
      }
      if (typeof chrome !== "undefined" && chrome.storage) {
        if (chrome.storage.sync) await new Promise(r => chrome.storage.sync.clear(r));
        if (chrome.storage.local) await new Promise(r => chrome.storage.local.clear(r));
      }
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && key.startsWith("bbe_")) localStorage.removeItem(key);
        }
      } catch (e) {}
      await bbeSave(BBE_DEFAULTS);
      Object.assign(S, JSON.parse(JSON.stringify(BBE_DEFAULTS)));
      showToast("↺ Restored to original first-install defaults!");
      setTimeout(() => location.reload(), 500);
    });

    const quickRestoreBtn = modal.querySelector("#bbe-modal-quick-restore-btn");
    if (quickRestoreBtn) {
      quickRestoreBtn.addEventListener("click", async () => {
        S.showAaMenu = true;
        S.showWidthControls = true;
        await bbeSave({ showAaMenu: true, showWidthControls: true });
        showToast("✓ Restored Unified Aa Menu & Width controls to toolbar!");
        lastRenderKey = "";
        const p = bbeParsePath(location.pathname, getAllVersions());
        if (p) renderToolbar(p);
        renderSettingsModalContent();
      });
    }

    // Wire up tabs
    modal.querySelectorAll(".bbe-modal-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        activeSettingsTab = btn.dataset.tab;
        renderSettingsModalContent();
      });
    });

    const bodyEl = modal.querySelector("#bbe-modal-tab-body");

    /* ---------------- TAB 1: Shortcuts & Custom Versions ---------------- */
    if (activeSettingsTab === "shortcuts") {
      bodyEl.innerHTML = `
        <div class="bbe-modal-card">
          <div class="bbe-modal-card-title">Single-Key Translation Shortcuts</div>
          <div class="bbe-modal-hint">
            Click any shortcut key button below, then press a single letter or number to assign it. Press Backspace or ✕ to clear.
          </div>
          <div class="bbe-shortcuts-grid" id="bbe-modal-shortcuts-grid"></div>
        </div>

        <div class="bbe-modal-card">
          <div class="bbe-modal-card-title">Add Custom Translation from Bible.com</div>
          <div class="bbe-modal-hint">
            <b>Smart Quick Fill:</b> Paste any Bible.com link, or enter just the numeric ID (e.g. <b>149</b>) or abbreviation (e.g. <b>RVR1960</b>, <b>ASV</b>). Everything else auto-fills!
          </div>
          <div class="bbe-add-grid">
            <div class="bbe-input-group" style="grid-column: span 2;">
              <label class="bbe-input-label">⚡ Quick Fill (Bible.com URL, Numeric ID, or Code)</label>
              <input type="text" id="bbe-add-smart" class="bbe-modal-input" placeholder="e.g. bible.com/bible/149/ROM.9.RVR1960, or 149, or ASV">
            </div>
            <div class="bbe-input-group">
              <label class="bbe-input-label">Abbreviation / Code</label>
              <input type="text" id="bbe-add-abbr" class="bbe-modal-input" placeholder="Auto-fills (e.g. RVR1960)" maxlength="12">
            </div>
            <div class="bbe-input-group">
              <label class="bbe-input-label">Bible.com Numeric ID</label>
              <input type="number" id="bbe-add-id" class="bbe-modal-input" placeholder="Auto-fills (e.g. 149)" min="1" max="99999">
            </div>
            <div class="bbe-input-group" style="grid-column: span 2;">
              <label class="bbe-input-label">Full Translation Name <span style="font-weight:400;opacity:0.75;">(optional - auto-detected)</span></label>
              <input type="text" id="bbe-add-name" class="bbe-modal-input" placeholder="Auto-detected name from Bible.com">
            </div>
            <div class="bbe-input-group">
              <label class="bbe-input-label">Shortcut Key <span style="font-weight:400;opacity:0.75;">(optional)</span></label>
              <input type="text" id="bbe-add-key" class="bbe-modal-input" placeholder="e.g. R" maxlength="1">
            </div>
            <div class="bbe-input-group" style="justify-content: flex-end;">
              <button type="button" class="bbe-add-submit-btn" id="bbe-add-submit-btn">+ Add Translation</button>
            </div>
          </div>
          <div id="bbe-add-feedback" style="font-size:11px;margin-top:6px;min-height:16px;"></div>

          <div id="bbe-modal-custom-list-wrap" style="margin-top:12px;display:none;">
            <div class="bbe-input-label" style="margin-bottom:4px;">Your Custom Added Translations:</div>
            <div class="bbe-custom-list" id="bbe-modal-custom-list"></div>
          </div>
        </div>
      `;

      // Populate shortcuts grid
      const grid = bodyEl.querySelector("#bbe-modal-shortcuts-grid");
      for (const key of Object.keys(allVers)) {
        const v = allVers[key];
        const hint = bbeGetKeyHintForVersion(key, currentShortcuts);

        const row = document.createElement("div");
        row.className = "bbe-shortcut-item";

        const info = document.createElement("div");
        info.className = "bbe-shortcut-info";
        info.innerHTML = `
          <div class="bbe-shortcut-name">${key}</div>
          <div class="bbe-shortcut-abbr" title="${v.name}">${v.name}</div>
        `;

        const actions = document.createElement("div");
        actions.className = "bbe-shortcut-actions";

        const keyBtn = document.createElement("button");
        keyBtn.type = "button";
        keyBtn.className = "bbe-key-capture-btn" + (hint ? "" : " empty");
        keyBtn.textContent = hint || "+";
        keyBtn.title = hint ? `Shortcut: ${hint}. Click to change.` : "Click to set shortcut";

        keyBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (recordingKeyForVersion === key) {
            recordingKeyForVersion = null;
            keyBtn.classList.remove("recording");
            keyBtn.textContent = hint || "+";
          } else {
            modal.querySelectorAll(".bbe-key-capture-btn.recording").forEach(b => {
              b.classList.remove("recording");
              b.textContent = b.dataset.key || "+";
            });
            recordingKeyForVersion = key;
            keyBtn.classList.add("recording");
            keyBtn.textContent = "...";
            keyBtn.dataset.key = hint || "";
            keyBtn.focus();
          }
        });

        const clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.className = "bbe-clear-key-btn";
        clearBtn.textContent = "✕";
        clearBtn.title = "Clear shortcut";
        clearBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const updated = { ...(S.customShortcuts || BBE_KEY_MAP) };
          for (const [k, mapped] of Object.entries(updated)) {
            if (mapped === key) delete updated[k];
          }
          S.customShortcuts = updated;
          await bbeSave({ customShortcuts: updated });
          renderSettingsModalContent();
          lastRenderKey = "";
          const p = bbeParsePath(location.pathname, getAllVersions());
          if (p) renderToolbar(p);
        });

        actions.appendChild(keyBtn);
        if (hint) actions.appendChild(clearBtn);

        row.appendChild(info);
        row.appendChild(actions);
        grid.appendChild(row);
      }

      // Populate user translations list
      const userTrans = S.userTranslations || {};
      const userKeys = Object.keys(userTrans);
      const customWrap = bodyEl.querySelector("#bbe-modal-custom-list-wrap");
      const customList = bodyEl.querySelector("#bbe-modal-custom-list");
      if (userKeys.length > 0) {
        customWrap.style.display = "block";
        for (const uk of userKeys) {
          const item = document.createElement("div");
          item.className = "bbe-custom-item";
          item.innerHTML = `
            <div style="font-size:12px;">
              <b>${uk}</b> (ID: ${userTrans[uk].id}) — <span>${userTrans[uk].name}</span>
            </div>
            <button type="button" class="bbe-del-btn" title="Remove translation">🗑 Remove</button>
          `;
          item.querySelector(".bbe-del-btn").addEventListener("click", async () => {
            delete userTrans[uk];
            const updatedShortcuts = { ...(S.customShortcuts || BBE_KEY_MAP) };
            for (const [k, mapped] of Object.entries(updatedShortcuts)) {
              if (mapped === uk) delete updatedShortcuts[k];
            }
            const updatedToolbar = (S.toolbarVersions || []).filter(v => v !== uk);
            await bbeSave({
              userTranslations: userTrans,
              customShortcuts: updatedShortcuts,
              toolbarVersions: updatedToolbar
            });
            S.userTranslations = userTrans;
            S.customShortcuts = updatedShortcuts;
            S.toolbarVersions = updatedToolbar;
            renderSettingsModalContent();
            lastRenderKey = "";
            const p = bbeParsePath(location.pathname, getAllVersions());
            if (p) renderToolbar(p);
          });
          customList.appendChild(item);
        }
      }

      // Add translation inputs & smart auto-detect
      const smartInput = bodyEl.querySelector("#bbe-add-smart");
      const abbrInput = bodyEl.querySelector("#bbe-add-abbr");
      const idInput = bodyEl.querySelector("#bbe-add-id");
      const nameInput = bodyEl.querySelector("#bbe-add-name");
      const keyInput = bodyEl.querySelector("#bbe-add-key");
      const addBtn = bodyEl.querySelector("#bbe-add-submit-btn");
      const feedback = bodyEl.querySelector("#bbe-add-feedback");

      let autoFillTimer = null;
      const triggerAutoDetect = (sourceVal) => {
        clearTimeout(autoFillTimer);
        autoFillTimer = setTimeout(async () => {
          const val = sourceVal || (smartInput ? smartInput.value.trim() : "") || (idInput ? idInput.value.trim() : "");
          if (!val) return;
          try {
            const resolved = await bbeResolveTranslation(val);
            if (resolved) {
              if (resolved.short && abbrInput && !abbrInput.value) abbrInput.value = resolved.short;
              if (resolved.id && idInput && !idInput.value) idInput.value = resolved.id;
              if (resolved.name && nameInput && !nameInput.value) nameInput.value = resolved.name;
              feedback.style.color = "#2563eb";
              feedback.textContent = `✨ Detected: ${resolved.name} (${resolved.short}, ID: ${resolved.id})`;
            }
          } catch (e) {
            // Passive detect, user may still be typing
          }
        }, 250);
      };

      if (smartInput) {
        smartInput.addEventListener("input", () => triggerAutoDetect(smartInput.value.trim()));
        smartInput.addEventListener("paste", () => setTimeout(() => triggerAutoDetect(smartInput.value.trim()), 50));
      }
      if (idInput) {
        idInput.addEventListener("input", () => {
          const v = idInput.value.trim();
          if (/^\d+$/.test(v)) triggerAutoDetect(v);
        });
      }
      if (abbrInput) {
        abbrInput.addEventListener("change", () => {
          const v = abbrInput.value.trim();
          if (v && (!idInput.value || !nameInput.value)) triggerAutoDetect(v);
        });
      }

      // Enter key on any input submits
      [smartInput, abbrInput, idInput, nameInput, keyInput].forEach(inp => {
        if (!inp) return;
        inp.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addBtn.click();
          }
        });
      });

      // Add translation submission
      addBtn.addEventListener("click", async () => {
        const smartVal = smartInput ? smartInput.value.trim() : "";
        const rawAbbr = abbrInput.value.trim().toUpperCase();
        const rawId = parseInt(idInput.value.trim(), 10);
        const rawName = nameInput.value.trim();
        const rawKey = keyInput.value.trim().toLowerCase();

        feedback.style.color = "#64748b";
        feedback.textContent = "⏳ Looking up translation details...";

        try {
          // Resolve from smart input OR explicit fields
          let resolved = null;
          if (smartVal) {
            resolved = await bbeResolveTranslation(smartVal);
          } else if (rawId || rawAbbr) {
            resolved = await bbeResolveTranslation({ id: rawId, abbr: rawAbbr, name: rawName, shortcut: rawKey });
          } else {
            throw new Error("Please enter a Bible.com link, numeric ID (e.g. 149), or code (e.g. RVR1960).");
          }

          const finalAbbr = (rawAbbr || resolved.short).toUpperCase();
          const finalId = rawId || resolved.id;
          const finalName = rawName || resolved.name || finalAbbr;
          const finalKey = rawKey || resolved.shortcut || "";

          const updatedUserTrans = { ...(S.userTranslations || {}) };
          updatedUserTrans[finalAbbr] = { id: finalId, name: finalName, short: finalAbbr };

          const updatedShortcuts = { ...(S.customShortcuts || BBE_KEY_MAP) };
          if (finalKey && /^[a-z0-9]$/.test(finalKey)) {
            for (const [k, mapped] of Object.entries(updatedShortcuts)) {
              if (mapped === finalAbbr) delete updatedShortcuts[k];
            }
            updatedShortcuts[finalKey] = finalAbbr;
          }

          const updatedToolbar = Array.from(new Set([...(S.toolbarVersions || []), finalAbbr]));

          await bbeSave({
            userTranslations: updatedUserTrans,
            customShortcuts: updatedShortcuts,
            toolbarVersions: updatedToolbar
          });

          S.userTranslations = updatedUserTrans;
          S.customShortcuts = updatedShortcuts;
          S.toolbarVersions = updatedToolbar;

          feedback.style.color = "#16a34a";
          feedback.textContent = `✓ Added ${finalAbbr} (${finalName})! Preloading for instant switching...`;

          if (smartInput) smartInput.value = "";
          abbrInput.value = "";
          idInput.value = "";
          nameInput.value = "";
          keyInput.value = "";

          const p = bbeParsePath(location.pathname, getAllVersions());
          if (p) {
            preloadOtherVersions(p, true);
            lastRenderKey = "";
            renderToolbar(p);
          }

          setTimeout(() => { renderSettingsModalContent(); }, 900);
        } catch (err) {
          feedback.style.color = "#dc2626";
          feedback.textContent = err.message || "Failed to resolve translation. Please check the ID or code.";
        }
      });
    }

    /* ---------------- TAB 2: Reading & Typography ---------------- */
    else if (activeSettingsTab === "typography") {
      const curTheme = S.readerTheme || "system";
      const curFont = S.fontFamily || "serif";

      let histOptionsHtml = "";
      if (curTheme === "historical" && window.BBE_HIST) {
        const H = window.BBE_HIST;
        const hScene = S.historicalScene || "olive";
        const hParch = S.historicalParchment || "scroll";
        const hInk = S.historicalInk || "iron";
        const sceneNames = { olive: "Olive Grove", library: "Ancient Library", ruins: "Classical Ruins", night: "Starlit Hills" };
        const parchNames = { scroll: "Rolled Scroll", vellum: "Pale Vellum", papyrus: "Golden Papyrus", aged: "Weathered" };
        const inkNames = { iron: "Iron-Gall Brown", sepia: "Soft Sepia", black: "Lampblack" };
        histOptionsHtml = `
        <div class="bbe-modal-card" id="bbe-hist-options">
          <div class="bbe-modal-card-title">🏛 Historical Theme Options</div>
          <div class="bbe-modal-hint">Compose your own manuscript: choose the world around the page, the material it is written on, and the ink.</div>

          <div class="bbe-input-label" style="margin-top:8px;">Backdrop</div>
          <div class="bbe-hist-picker" data-hist="historicalScene">
            ${H.scenes.map(k => `<button type="button" class="bbe-hist-chip ${hScene === k ? "active" : ""}" data-value="${k}"><canvas class="bbe-hist-chip-canvas" width="320" height="180"></canvas><span>${sceneNames[k]}</span></button>`).join("")}
          </div>

          <div class="bbe-input-label" style="margin-top:12px;">Page</div>
          <div class="bbe-hist-picker small" data-hist="historicalParchment">
            ${H.parchments.map(k => `<button type="button" class="bbe-hist-chip ${hParch === k ? "active" : ""}" data-value="${k}"><canvas class="bbe-hist-chip-canvas" width="256" height="128"></canvas><span>${parchNames[k]}</span></button>`).join("")}
          </div>

          <div class="bbe-input-label" style="margin-top:12px;">Ink</div>
          <div class="bbe-hist-picker small ink" data-hist="historicalInk">
            ${["iron", "sepia", "black"].map(k => `<button type="button" class="bbe-hist-chip ink-${k} ${hInk === k ? "active" : ""}" data-value="${k}"><span>${inkNames[k]}</span></button>`).join("")}
          </div>

          <label class="bbe-hist-check"><input type="checkbox" id="bbe-hist-rubrics" ${S.historicalRubrics !== false ? "checked" : ""}> Rubrication — headings &amp; verse numbers in manuscript red</label>
          <label class="bbe-hist-check"><input type="checkbox" id="bbe-hist-ornate" ${S.historicalOrnate !== false ? "checked" : ""}> Illuminated double-rule frame around the page</label>

          <div class="bbe-modal-slider-row" style="margin-top:12px;">
            <div class="bbe-modal-slider-header">
              <span class="bbe-input-label">Backdrop Darkness</span>
              <span class="bbe-modal-slider-val" id="bbe-hist-dim-val">${S.historicalSceneDim ?? 15}%</span>
            </div>
            <input type="range" id="bbe-hist-dim" min="0" max="100" step="5" value="${S.historicalSceneDim ?? 15}">
          </div>
        </div>`;
      }

      bodyEl.innerHTML = `
        <div class="bbe-modal-card">
          <div class="bbe-modal-card-title">Reading Theme &amp; Warm Paper</div>
          <div class="bbe-modal-hint">Choose your palette. <b>System Default</b> matches Bible.com's native theme. Custom themes (like <b>Warm Paper</b>, <b>Clean Light</b>, or <b>Night Dark</b>) give specialized comfort.</div>

          <div class="bbe-theme-cards-grid" id="bbe-modal-theme-grid">
            <div class="bbe-theme-card system ${curTheme === 'system' ? 'active' : ''}" data-theme="system">
              <div class="bbe-theme-card-title">⚙ System Default</div>
              <div class="bbe-theme-card-desc">Bible.com's native appearance.</div>
            </div>
            <div class="bbe-theme-card sepia ${curTheme === 'sepia' ? 'active' : ''}" data-theme="sepia">
              <div class="bbe-theme-card-title">📜 Warm Paper</div>
              <div class="bbe-theme-card-desc">Soft ivory (#fbf0d9) with charcoal text. High comfort.</div>
            </div>
            <div class="bbe-theme-card light ${curTheme === 'light' ? 'active' : ''}" data-theme="light">
              <div class="bbe-theme-card-title">☀️ Clean Light</div>
              <div class="bbe-theme-card-desc">Pure crisp white with clean contrast.</div>
            </div>
            <div class="bbe-theme-card dark ${curTheme === 'dark' ? 'active' : ''}" data-theme="dark">
              <div class="bbe-theme-card-title">🌙 Night Dark</div>
              <div class="bbe-theme-card-desc">Deep slate dark theme for nighttime reading.</div>
            </div>
            <div class="bbe-theme-card oled ${curTheme === 'oled' ? 'active' : ''}" data-theme="oled">
              <div class="bbe-theme-card-title">🖤 OLED Pitch Black</div>
              <div class="bbe-theme-card-desc">True #000000 black. Max contrast, zero battery drain.</div>
            </div>
            <div class="bbe-theme-card blue ${curTheme === 'blue' ? 'active' : ''}" data-theme="blue">
              <div class="bbe-theme-card-title">🌊 Midnight Navy</div>
              <div class="bbe-theme-card-desc">Deep ocean navy (#0b1329) with ice-blue text. Serene.</div>
            </div>
            <div class="bbe-theme-card green ${curTheme === 'green' ? 'active' : ''}" data-theme="green">
              <div class="bbe-theme-card-title">🌿 Sage Herb</div>
              <div class="bbe-theme-card-desc">Soothing sage paper (#f0f5ee) with forest text. Anti-fatigue.</div>
            </div>
            <div class="bbe-theme-card historical ${curTheme === 'historical' ? 'active' : ''}" data-theme="historical">
              <div class="bbe-theme-card-title">🏛 Historical</div>
              <div class="bbe-theme-card-desc">Ancient scroll on a faded olive grove, library or ruins backdrop.</div>
            </div>
          </div>
        </div>

        ${histOptionsHtml}
        <div class="bbe-modal-card">
          <div class="bbe-modal-card-title">Classic Book Typography &amp; Font Family</div>
          <div class="bbe-modal-hint">Select a typography style. <b>Classic Book Serif</b> gives Bible reading the feel of a premium printed Bible.</div>

          <div class="bbe-font-cards-grid" id="bbe-modal-font-grid">
            <div class="bbe-font-card serif ${curFont === 'serif' ? 'active' : ''}" data-font="serif">
              <div class="bbe-font-card-title">📖 Classic Book Serif</div>
              <div class="bbe-font-card-desc">Georgia, Merriweather, Garamond, Bookerly</div>
            </div>
            <div class="bbe-font-card sans ${curFont === 'sans' ? 'active' : ''}" data-font="sans">
              <div class="bbe-font-card-title">🔤 Modern Sans</div>
              <div class="bbe-font-card-desc">Clean, contemporary digital typography (Inter/System)</div>
            </div>
            <div class="bbe-font-card mono ${curFont === 'mono' ? 'active' : ''}" data-font="mono">
              <div class="bbe-font-card-title">⌨ Warm Monospace</div>
              <div class="bbe-font-card-desc">Structured, editorial typewriter aesthetic</div>
            </div>
            <div class="bbe-font-card dyslexic ${curFont === 'dyslexic' ? 'active' : ''}" data-font="dyslexic">
              <div class="bbe-font-card-title">👓 Dyslexia Friendly</div>
              <div class="bbe-font-card-desc">OpenDyslexic with weighted baselines to prevent letter flipping</div>
            </div>
          </div>

          <div class="bbe-typography-preview" id="bbe-typography-preview">
            “For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life.”
            <div style="font-size:11px;opacity:0.75;margin-top:4px;">— John 3:16 (Live Typography Preview)</div>
          </div>
        </div>

        <div class="bbe-modal-card">
          <div class="bbe-modal-card-title">Column Width &amp; Sizing</div>
          <div class="bbe-modal-hint">Adjust the layout and sizing of the scripture text. Changes apply instantly live.</div>

          <div class="bbe-modal-slider-row">
            <div class="bbe-modal-slider-header">
              <span class="bbe-input-label">Column Width</span>
              <span class="bbe-modal-slider-val" id="bbe-modal-width-val">${S.columnWidth || 950}px</span>
            </div>
            <input type="range" id="bbe-modal-width-slider" min="500" max="2200" step="25" value="${S.columnWidth || 950}">
            <div style="display:flex;gap:6px;margin-top:4px;">
              <button type="button" class="bbe-preview-btn" data-preset="750">750px</button>
              <button type="button" class="bbe-preview-btn" data-preset="950">950px</button>
              <button type="button" class="bbe-preview-btn" data-preset="1200">1200px</button>
              <button type="button" class="bbe-preview-btn" data-preset="1800">Max (1800px)</button>
            </div>

            <div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(0,0,0,0.06);">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <div class="bbe-modal-card-title" style="margin:0;">🎯 Floating Toolbar Quick Pills</div>
                <button type="button" class="bbe-preview-btn bbe-preview-btn-primary" id="bbe-restore-typo-pills-btn" title="Restore quick controls to the floating top pill">
                  ↺ Restore Toolbar Pills
                </button>
              </div>

              <label class="bbe-modal-row" style="margin-top:6px;">
                <div>
                  <div class="bbe-modal-row-label">Show Unified Aa Reader Menu on Floating Pill (Aa ▾)</div>
                  <div class="bbe-modal-row-hint">Display the unified Aa reader menu (Column Width, Text Size, Font Family, Theme Swatches).</div>
                </div>
                <input type="checkbox" id="bbe-modal-aa-menu-typo-check" ${S.showAaMenu !== false ? 'checked' : ''}>
              </label>

              <label class="bbe-modal-row" style="margin-top:6px;">
                <div>
                  <div class="bbe-modal-row-label">Show Standalone Width Resizer on Floating Pill (↔ 950 ▾)</div>
                  <div class="bbe-modal-row-hint">Display the dedicated expandable width button (750 / 950 / 1200 / Max) on the floating toolbar.</div>
                </div>
                <input type="checkbox" id="bbe-modal-width-controls-typo-check" ${S.showWidthControls !== false ? 'checked' : ''}>
              </label>
            </div>
          </div>

          <div class="bbe-modal-slider-row" style="margin-top:12px;">
            <div class="bbe-modal-slider-header">
              <span class="bbe-input-label">Text Size</span>
              <span class="bbe-modal-slider-val" id="bbe-modal-font-val">${S.fontSize || 100}%</span>
            </div>
            <input type="range" id="bbe-modal-font-slider" min="70" max="180" step="5" value="${S.fontSize || 100}">
          </div>

          <div class="bbe-modal-slider-row" style="margin-top:12px;">
            <div class="bbe-modal-slider-header">
              <span class="bbe-input-label">Line Spacing</span>
              <span class="bbe-modal-slider-val" id="bbe-modal-line-val">${S.lineHeight || 1.8}</span>
            </div>
            <input type="range" id="bbe-modal-line-slider" min="1.3" max="2.4" step="0.1" value="${S.lineHeight || 1.8}">
          </div>
        </div>
      `;

      // Theme cards click
      bodyEl.querySelectorAll(".bbe-theme-card").forEach(card => {
        card.addEventListener("click", async () => {
          bodyEl.querySelectorAll(".bbe-theme-card").forEach(c => c.classList.remove("active"));
          card.classList.add("active");
          const theme = card.dataset.theme;
          S.readerTheme = theme;
          syncDomClasses();
          await bbeSave({ readerTheme: theme });
          const p = bbeParsePath(location.pathname, getAllVersions());
          if (p) renderToolbar(p);
          renderSettingsModalContent(); // show / hide the Historical options card
        });
      });

      // Historical theme options
      bodyEl.querySelectorAll(".bbe-hist-picker").forEach(group => {
        group.querySelectorAll(".bbe-hist-chip").forEach(chip => {
          chip.addEventListener("click", async () => {
            group.querySelectorAll(".bbe-hist-chip").forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            S[group.dataset.hist] = chip.dataset.value;
            syncDomClasses();
            await bbeSave({ [group.dataset.hist]: chip.dataset.value });
          });
        });
      });
      // Fill Historical thumbnails once their artwork has been rendered.
      // Draw directly onto a <canvas> inside each chip so Bible.com's img-src CSP can never block it.
      const fillHistChip = (group, kind, value) => {
        window.BBE_HIST.load(kind, value).then(a => {
          const live = document.querySelector(`#bbe-modal-tab-body .bbe-hist-picker[data-hist="${group}"] .bbe-hist-chip[data-value="${value}"]`);
          if (!live) return;
          if (kind === "parchment") live.style.backgroundColor = a.base;
          const cv = live.querySelector("canvas.bbe-hist-chip-canvas");
          const src = a.thumbCanvas || a.canvas;
          if (cv && src) {
            cv.getContext("2d").drawImage(src, 0, 0, cv.width, cv.height);
          }
        });
      };
      bodyEl.querySelectorAll('.bbe-hist-picker[data-hist="historicalScene"] .bbe-hist-chip').forEach(chip => fillHistChip("historicalScene", "scene", chip.dataset.value));
      bodyEl.querySelectorAll('.bbe-hist-picker[data-hist="historicalParchment"] .bbe-hist-chip').forEach(chip => fillHistChip("historicalParchment", "parchment", chip.dataset.value));
      const histRub = bodyEl.querySelector("#bbe-hist-rubrics");
      if (histRub) histRub.addEventListener("change", async () => { S.historicalRubrics = histRub.checked; syncDomClasses(); await bbeSave({ historicalRubrics: histRub.checked }); });
      const histOrn = bodyEl.querySelector("#bbe-hist-ornate");
      if (histOrn) histOrn.addEventListener("change", async () => { S.historicalOrnate = histOrn.checked; syncDomClasses(); await bbeSave({ historicalOrnate: histOrn.checked }); });
      const histDim = bodyEl.querySelector("#bbe-hist-dim");
      if (histDim) {
        histDim.addEventListener("input", () => {
          const v = Number(histDim.value);
          S.historicalSceneDim = v;
          bodyEl.querySelector("#bbe-hist-dim-val").textContent = v + "%";
          syncDomClasses();
        });
        histDim.addEventListener("change", () => bbeSave({ historicalSceneDim: Number(histDim.value) }));
      }

      // Font cards click
      bodyEl.querySelectorAll(".bbe-font-card").forEach(card => {
        card.addEventListener("click", async () => {
          bodyEl.querySelectorAll(".bbe-font-card").forEach(c => c.classList.remove("active"));
          card.classList.add("active");
          const font = card.dataset.font;
          S.fontFamily = font;
          syncDomClasses();
          await bbeSave({ fontFamily: font });
          const p = bbeParsePath(location.pathname, getAllVersions());
          if (p) renderToolbar(p);
        });
      });

      const widthSlider = bodyEl.querySelector("#bbe-modal-width-slider");
      const widthVal = bodyEl.querySelector("#bbe-modal-width-val");
      const fontSlider = bodyEl.querySelector("#bbe-modal-font-slider");
      const fontVal = bodyEl.querySelector("#bbe-modal-font-val");
      const lineSlider = bodyEl.querySelector("#bbe-modal-line-slider");
      const lineVal = bodyEl.querySelector("#bbe-modal-line-val");

      const updateWidth = async (val) => {
        S.columnWidth = val;
        widthSlider.value = val;
        widthVal.textContent = val + "px";
        syncDomClasses();
        await bbeSave({ columnWidth: val });
        const p = bbeParsePath(location.pathname, getAllVersions());
        if (p) renderToolbar(p);
      };

      widthSlider.addEventListener("input", () => {
        const val = Number(widthSlider.value);
        widthVal.textContent = val + "px";
        S.columnWidth = val;
        syncDomClasses();
      });
      widthSlider.addEventListener("change", () => updateWidth(Number(widthSlider.value)));

      bodyEl.querySelectorAll("[data-preset]").forEach(b => {
        b.addEventListener("click", () => updateWidth(Number(b.dataset.preset)));
      });

      const restoreTypoPillsBtn = bodyEl.querySelector("#bbe-restore-typo-pills-btn");
      if (restoreTypoPillsBtn) {
        restoreTypoPillsBtn.addEventListener("click", async () => {
          S.showAaMenu = true;
          S.showWidthControls = true;
          await bbeSave({ showAaMenu: true, showWidthControls: true });
          showToast("✓ Restored Unified Aa Menu & Width controls to toolbar!");
          lastRenderKey = "";
          const p = bbeParsePath(location.pathname, getAllVersions());
          if (p) renderToolbar(p);
          renderSettingsModalContent();
        });
      }

      const widthControlsTypoCheck = bodyEl.querySelector("#bbe-modal-width-controls-typo-check");
      if (widthControlsTypoCheck) {
        widthControlsTypoCheck.addEventListener("change", async () => {
          S.showWidthControls = widthControlsTypoCheck.checked;
          await bbeSave({ showWidthControls: widthControlsTypoCheck.checked });
          showToast(widthControlsTypoCheck.checked ? "✓ Width resizer restored to floating pill" : "Width resizer retired to Settings");
          lastRenderKey = "";
          const p = bbeParsePath(location.pathname, getAllVersions());
          if (p) renderToolbar(p);
        });
      }

      const aaMenuTypoCheck = bodyEl.querySelector("#bbe-modal-aa-menu-typo-check");
      if (aaMenuTypoCheck) {
        aaMenuTypoCheck.addEventListener("change", async () => {
          S.showAaMenu = aaMenuTypoCheck.checked;
          await bbeSave({ showAaMenu: aaMenuTypoCheck.checked });
          showToast(aaMenuTypoCheck.checked ? "✓ Aa menu restored to floating pill" : "Aa menu retired to Settings");
          lastRenderKey = "";
          const p = bbeParsePath(location.pathname, getAllVersions());
          if (p) renderToolbar(p);
        });
      }

      fontSlider.addEventListener("input", () => {
        const val = Number(fontSlider.value);
        fontVal.textContent = val + "%";
        S.fontSize = val;
        syncDomClasses();
      });
      fontSlider.addEventListener("change", async () => {
        const val = Number(fontSlider.value);
        S.fontSize = val;
        syncDomClasses();
        await bbeSave({ fontSize: val });
      });

      lineSlider.addEventListener("input", () => {
        const val = Number(lineSlider.value);
        lineVal.textContent = val;
        S.lineHeight = val;
        syncDomClasses();
      });
      lineSlider.addEventListener("change", async () => {
        const val = Number(lineSlider.value);
        S.lineHeight = val;
        syncDomClasses();
        await bbeSave({ lineHeight: val });
      });
    }

    /* ---------------- TAB 3: Navigation & Reading Position ---------------- */
    else if (activeSettingsTab === "animation") {
      bodyEl.innerHTML = `
        <div class="bbe-modal-card">
          <div class="bbe-modal-card-title">Instant Navigation &amp; Reading Position</div>
          <div class="bbe-modal-hint">Configure zero-delay adjacent chapter switching, arrow key shortcuts, and reading position anchoring.</div>

          <label class="bbe-modal-row" style="margin-top:6px;">
            <div>
              <div class="bbe-modal-row-label">Anchor Reading Position</div>
              <div class="bbe-modal-row-hint">Locks your active verse in viewport on translation switches to eliminate jarring jumps</div>
            </div>
            <input type="checkbox" id="bbe-modal-pos-check">
          </label>

          <label class="bbe-modal-row" style="margin-top:6px;">
            <div>
              <div class="bbe-modal-row-label">Preload Adjacent Chapters</div>
              <div class="bbe-modal-row-hint">Pre-fetches next and previous chapters in the background for zero-delay instant switching</div>
            </div>
            <input type="checkbox" id="bbe-modal-preload-chapters-check">
          </label>

          <label class="bbe-modal-row" style="margin-top:6px;">
            <div>
              <div class="bbe-modal-row-label">Arrow Keys Navigate Chapters</div>
              <div class="bbe-modal-row-hint">Use Left &amp; Right arrow keys (← / →) to move to previous and next chapters instantly</div>
            </div>
            <input type="checkbox" id="bbe-modal-arrow-keys-check">
          </label>
        </div>
      `;

      const posCheck = bodyEl.querySelector("#bbe-modal-pos-check");
      const preloadChaptersCheck = bodyEl.querySelector("#bbe-modal-preload-chapters-check");
      const arrowKeysCheck = bodyEl.querySelector("#bbe-modal-arrow-keys-check");

      posCheck.checked = S.preserveReadingPosition !== false;
      posCheck.addEventListener("change", async () => {
        S.preserveReadingPosition = posCheck.checked;
        await bbeSave({ preserveReadingPosition: posCheck.checked });
      });

      preloadChaptersCheck.checked = S.preloadAdjacentChapters !== false;
      preloadChaptersCheck.addEventListener("change", async () => {
        S.preloadAdjacentChapters = preloadChaptersCheck.checked;
        await bbeSave({ preloadAdjacentChapters: preloadChaptersCheck.checked });
        if (preloadChaptersCheck.checked) preloadAdjacentChapters();
      });

      arrowKeysCheck.checked = S.chapterArrowKeys !== false;
      arrowKeysCheck.addEventListener("change", async () => {
        S.chapterArrowKeys = arrowKeysCheck.checked;
        await bbeSave({ chapterArrowKeys: arrowKeysCheck.checked });
      });
    }

    /* ---------------- TAB 4: Study Commentary, TSK & Lexicon ---------------- */
    else if (activeSettingsTab === "study") {
      bodyEl.innerHTML = `
        <div class="bbe-modal-card">
          <div class="bbe-modal-card-title">Study Drawer &amp; Treasury of Scripture Knowledge (TSK)</div>
          <div class="bbe-modal-hint">Configure verse study commentaries and cross-reference research tools.</div>

          <div class="bbe-add-grid" style="margin-bottom:10px;">
            <div class="bbe-input-group">
              <label class="bbe-input-label">Default Study Tab</label>
              <select id="bbe-modal-study-tab-select" class="bbe-modal-input">
                <option value="commentary">📖 Scripture Commentary</option>
                <option value="crossref">🔗 Cross-References (TSK)</option>
                <option value="wordstudy">🔤 Word Study / Strong's Lexicon</option>
              </select>
            </div>
            <div class="bbe-input-group">
              <label class="bbe-input-label">Drawer Dock Position</label>
              <select id="bbe-modal-dock-select" class="bbe-modal-input">
                <option value="right">Right Sidebar</option>
                <option value="bottom">Bottom Panel (Logos Bible style)</option>
              </select>
            </div>
          </div>

          <label class="bbe-modal-row">
            <div>
              <div class="bbe-modal-row-label">Verse Hover Badges</div>
              <div class="bbe-modal-row-hint">Shows a subtle 💬 icon when hovering over verses to quickly open study notes</div>
            </div>
            <input type="checkbox" id="bbe-modal-badges-check">
          </label>
        </div>

        <div class="bbe-modal-card">
          <div class="bbe-modal-card-title">Modern &amp; Expository Commentaries</div>
          <div class="bbe-modal-hint">Choose which modern evangelical and verse-by-verse expository commentaries to include in the Study Commentary drawer.</div>

          <label class="bbe-modal-row" style="margin-top:8px;">
            <div>
              <div class="bbe-modal-row-label">The Gospel Coalition (TGC) Bible Commentary</div>
              <div class="bbe-modal-row-hint">Theological and pastoral exposition with pericope cards and 1-click deep jumping to exact section anchors</div>
            </div>
            <input type="checkbox" id="bbe-modal-comm-tgc-check">
          </label>

          <label class="bbe-modal-row" style="margin-top:6px;">
            <div>
              <div class="bbe-modal-row-label">David Guzik — Enduring Word</div>
              <div class="bbe-modal-row-hint">Popular verse-by-verse pastoral commentary with historical background and modern life application</div>
            </div>
            <input type="checkbox" id="bbe-modal-comm-guzik-check">
          </label>

          <label class="bbe-modal-row" style="margin-top:6px;">
            <div>
              <div class="bbe-modal-row-label">Dr. Thomas Constable — Expository Notes (DTS)</div>
              <div class="bbe-modal-row-hint">45-year Dallas Theological Seminary professor's 66-book exegetical and historical notes (Sonic Light)</div>
            </div>
            <input type="checkbox" id="bbe-modal-comm-constable-check">
          </label>

          <label class="bbe-modal-row" style="margin-top:6px;">
            <div>
              <div class="bbe-modal-row-label">Dr. Bob Utley — Free Bible Commentary</div>
              <div class="bbe-modal-row-hint">Verse-by-verse hermeneutical, contextual, and linguistic commentary series for pastors and missionaries</div>
            </div>
            <input type="checkbox" id="bbe-modal-comm-utley-check">
          </label>
        </div>

        <div class="bbe-modal-card">
          <div class="bbe-modal-card-title">Strong's Greek &amp; Hebrew Lexicon / Word Study</div>
          <div class="bbe-modal-hint">Uncover original Greek (NT) and Hebrew (OT) root words directly on Bible text with Strong's definitions and occurrences.</div>

          <label class="bbe-modal-row" style="margin-bottom:10px;">
            <div>
              <div class="bbe-modal-row-label">Word Study Mode</div>
              <div class="bbe-modal-row-hint">Makes scripture words clickable/hoverable for Strong's lexicon lookups (Shortcut: <b>W</b>)</div>
            </div>
            <input type="checkbox" id="bbe-modal-wordstudy-check">
          </label>

          <div class="bbe-input-group">
            <label class="bbe-input-label">Tooltip Trigger Action</label>
            <select id="bbe-modal-wordstudy-trigger" class="bbe-modal-input">
              <option value="hover">Hover over word (unobtrusive tooltip)</option>
              <option value="click">Click on word only</option>
            </select>
          </div>
        </div>

        <div class="bbe-modal-card">
          <div class="bbe-modal-card-title">📋 Smart Verse Copy &amp; Clean Text</div>
          <div class="bbe-modal-hint">Quickly quote and copy scripture. Strips verse numbers and headings by default with no reference at the end.</div>

          <label class="bbe-modal-row" style="margin-bottom:8px;">
            <div>
              <div class="bbe-modal-row-label">Smart Verse Copy</div>
              <div class="bbe-modal-row-hint">Enables 1-click 📋 copy badge on verse hover and passage selection floating bar</div>
            </div>
            <input type="checkbox" id="bbe-modal-smartcopy-check">
          </label>

          <label class="bbe-modal-row" style="margin-bottom:10px;">
            <div>
              <div class="bbe-modal-row-label">Clean Highlight Copy (Ctrl+C)</div>
              <div class="bbe-modal-row-hint">Automatically strip verse numbers &amp; headings when copying highlighted text in scripture view</div>
            </div>
            <input type="checkbox" id="bbe-modal-copyclean-check">
          </label>


          <div class="bbe-modal-hint" style="font-weight:700;text-transform:uppercase;font-size:10px;margin-bottom:6px;letter-spacing:0.04em;">Include / Exclude Elements:</div>

          <label class="bbe-modal-row" style="margin-bottom:6px;">
            <div>
              <div class="bbe-modal-row-label">Include Scripture Reference</div>
              <div class="bbe-modal-row-hint">Append scripture reference (e.g. Genesis 1:1) at end (Off by default)</div>
            </div>
            <input type="checkbox" id="bbe-modal-copyref-check">
          </label>

          <label class="bbe-modal-row" style="margin-bottom:6px;">
            <div>
              <div class="bbe-modal-row-label">Include Translation Code</div>
              <div class="bbe-modal-row-hint">Append translation abbreviation (e.g. NIV, ESV)</div>
            </div>
            <input type="checkbox" id="bbe-modal-copyver-check">
          </label>

          <label class="bbe-modal-row" style="margin-bottom:6px;">
            <div>
              <div class="bbe-modal-row-label">Include Verse Numbers</div>
              <div class="bbe-modal-row-hint">Keep verse numbers (1, 2, 3) in copied text (Off by default)</div>
            </div>
            <input type="checkbox" id="bbe-modal-copyvnum-check">
          </label>

          <label class="bbe-modal-row" style="margin-bottom:6px;">
            <div>
              <div class="bbe-modal-row-label">Include Section Headings</div>
              <div class="bbe-modal-row-hint">Keep section titles and headings in copied text (Off by default)</div>
            </div>
            <input type="checkbox" id="bbe-modal-copyheading-check">
          </label>

          <div class="bbe-typography-preview" id="bbe-modal-copy-preview-box" style="margin-top:8px;">
            <div class="bbe-preview-tag" style="font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;font-weight:700;margin-bottom:4px;">Live Copy Preview</div>
            <div id="bbe-modal-copy-preview-text" style="font-size:12px;white-space:pre-wrap;line-height:1.6;"></div>
          </div>
        </div>



        <div class="bbe-modal-card">
          <div class="bbe-modal-card-title">🖍️ YouVersion Color Highlighting</div>
          <div class="bbe-modal-hint">Highlight meaningful scripture directly using YouVersion's native highlighting system. Highlights sync automatically to the YouVersion mobile app and account, and remain visible whether or not the extension is active. Press <b>H</b> on selection to highlight instantly with your default color.</div>

          <label class="bbe-modal-row" style="margin-top:8px;">
            <div>
              <div class="bbe-modal-row-label">Enable YouVersion Highlighting</div>
              <div class="bbe-modal-row-hint">Adds color highlighter palettes to selection action bar and verse hover badges</div>
            </div>
            <input type="checkbox" id="bbe-modal-highlighting-check">
          </label>

          <label class="bbe-modal-row" style="margin-top:4px;">
            <div>
              <div class="bbe-modal-row-label">Verse Highlighter Badges</div>
              <div class="bbe-modal-row-hint">Shows 🖍️ button next to verse numbers on hover</div>
            </div>
            <input type="checkbox" id="bbe-modal-highlight-badges-check">
          </label>

          <div class="bbe-input-group" style="margin-top:8px;margin-bottom:8px;">
            <label class="bbe-input-label">Default Highlighter Color</label>
            <select id="bbe-modal-default-hl-color" class="bbe-modal-input">
              <option value="fffe00">🟡 Yellow (#fffe00)</option>
              <option value="5dff79">🟢 Mint (#5dff79)</option>
              <option value="00d6ff">🔵 Sky Blue (#00d6ff)</option>
              <option value="ffc66f">🟠 Amber (#ffc66f)</option>
              <option value="ff95ef">🌸 Rose (#ff95ef)</option>
            </select>
          </div>
        </div>

        <div class="bbe-modal-card">
          <div class="bbe-modal-card-title">About the Integrated Study Tools</div>
          <div style="font-size:12px;color:#475569;line-height:1.5;">
            • <b>Commentary</b>: Parses and displays expositions from Matthew Henry, John Calvin, Pulpit Commentary, Jamieson-Fausset-Brown (JFB), Keil &amp; Delitzsch, Albert Barnes, John Gill, and more.<br>
            • <b>Treasury of Scripture Knowledge (TSK)</b>: Connects over 500,000 cross-references throughout Scripture grouped by thematic phrase, with live verse previews and one-click jumping.<br>
            • <b>Strong's Lexicon &amp; Interlinear</b>: Full Greek and Hebrew lexicon entries with transliteration, pronunciation, morphological part of speech, definitions, and Bible-wide occurrence frequencies.<br>
            • <b>Smart Verse Copy</b>: Instantly quotes clean passages via selection action bar or drawer copy button.<br>
            • <b>Private Personal Notes</b>: Personal reflections, observations, and prayers attached to verses, with YouVersion app synchronization and markdown export.
          </div>
        </div>
      `;

      const studyTabSelect = bodyEl.querySelector("#bbe-modal-study-tab-select");
      const dockSelect = bodyEl.querySelector("#bbe-modal-dock-select");
      const badgesCheck = bodyEl.querySelector("#bbe-modal-badges-check");
      const wordStudyCheck = bodyEl.querySelector("#bbe-modal-wordstudy-check");
      const wordStudyTrigger = bodyEl.querySelector("#bbe-modal-wordstudy-trigger");
      const copyCheck = bodyEl.querySelector("#bbe-modal-smartcopy-check");
      const copyCleanCheck = bodyEl.querySelector("#bbe-modal-copyclean-check");
      const copyRefCheck = bodyEl.querySelector("#bbe-modal-copyref-check");
      const copyVerCheck = bodyEl.querySelector("#bbe-modal-copyver-check");
      const copyVNumCheck = bodyEl.querySelector("#bbe-modal-copyvnum-check");
      const copyHeadingCheck = bodyEl.querySelector("#bbe-modal-copyheading-check");
      const copyPreviewText = bodyEl.querySelector("#bbe-modal-copy-preview-text");

      const updateCopyPreview = () => {
        if (!copyPreviewText) return;
        const incVer = copyVerCheck ? copyVerCheck.checked : (S.copyIncludeVersion === true);
        const incVNum = copyVNumCheck ? copyVNumCheck.checked : (S.copyIncludeVerseNumbers === true);
        const incHeading = copyHeadingCheck ? copyHeadingCheck.checked : (S.copyIncludeHeadings === true);

        const p = bbeParsePath(location.pathname, getAllVersions());
        const curVer = incVer ? (p ? (p.versionName || p.abbr) : "ESV") : "";

        let sample = "";
        if (incHeading) sample += "[God’s Sovereign Choice]\n";
        if (incVNum) sample += "1 ";
        sample += "I am speaking the truth in Christ—I am not lying; my conscience bears me witness in the Holy Spirit—";

        const formatted = formatVerseCopy(sample, p ? p.book : "ROM", p ? p.chapter : "9", 1, 1, curVer);
        copyPreviewText.textContent = formatted;
      };

      if (copyCheck) {
        copyCheck.checked = S.smartVerseCopy !== false;
        copyCheck.addEventListener("change", async () => {
          S.smartVerseCopy = copyCheck.checked;
          await bbeSave({ smartVerseCopy: copyCheck.checked });
          const p = bbeParsePath(location.pathname, getAllVersions());
          if (p) renderVerseBadges(p, true);
        });
      }

      if (copyCleanCheck) {
        copyCleanCheck.checked = S.copyCleanSelection !== false;
        copyCleanCheck.addEventListener("change", async () => {
          S.copyCleanSelection = copyCleanCheck.checked;
          await bbeSave({ copyCleanSelection: copyCleanCheck.checked });
        });
      }


      if (copyRefCheck) {
        copyRefCheck.checked = S.copyIncludeReference === true;
        copyRefCheck.addEventListener("change", async () => {
          S.copyIncludeReference = copyRefCheck.checked;
          await bbeSave({ copyIncludeReference: copyRefCheck.checked });
          updateCopyPreview();
        });
      }

      if (copyVerCheck) {
        copyVerCheck.checked = S.copyIncludeVersion === true;
        copyVerCheck.addEventListener("change", async () => {
          S.copyIncludeVersion = copyVerCheck.checked;
          await bbeSave({ copyIncludeVersion: copyVerCheck.checked });
          updateCopyPreview();
        });
      }

      if (copyVNumCheck) {
        copyVNumCheck.checked = S.copyIncludeVerseNumbers === true;
        copyVNumCheck.addEventListener("change", async () => {
          S.copyIncludeVerseNumbers = copyVNumCheck.checked;
          await bbeSave({ copyIncludeVerseNumbers: copyVNumCheck.checked });
          updateCopyPreview();
        });
      }

      if (copyHeadingCheck) {
        copyHeadingCheck.checked = S.copyIncludeHeadings === true;
        copyHeadingCheck.addEventListener("change", async () => {
          S.copyIncludeHeadings = copyHeadingCheck.checked;
          await bbeSave({ copyIncludeHeadings: copyHeadingCheck.checked });
          updateCopyPreview();
        });
      }

      updateCopyPreview();

      studyTabSelect.value = S.defaultStudyTab || "commentary";
      studyTabSelect.addEventListener("change", async () => {
        S.defaultStudyTab = studyTabSelect.value;
        await bbeSave({ defaultStudyTab: studyTabSelect.value });
      });

      dockSelect.value = S.commentaryDock || "right";
      dockSelect.addEventListener("change", async () => {
        S.commentaryDock = dockSelect.value;
        await bbeSave({ commentaryDock: dockSelect.value });
        const drawer = document.getElementById("bbe-drawer");
        if (drawer) applyDrawerDockClasses(drawer);
      });

      badgesCheck.checked = S.showCommentaryBadges !== false;
      badgesCheck.addEventListener("change", async () => {
        S.showCommentaryBadges = badgesCheck.checked;
        await bbeSave({ showCommentaryBadges: badgesCheck.checked });
        const p = bbeParsePath(location.pathname, getAllVersions());
        if (p) renderVerseBadges(p, true);
      });

      const commTgcCheck = bodyEl.querySelector("#bbe-modal-comm-tgc-check");
      const commGuzikCheck = bodyEl.querySelector("#bbe-modal-comm-guzik-check");
      const commConstableCheck = bodyEl.querySelector("#bbe-modal-comm-constable-check");
      const commUtleyCheck = bodyEl.querySelector("#bbe-modal-comm-utley-check");

      if (commTgcCheck) {
        commTgcCheck.checked = S.commEnableTgc !== false;
        commTgcCheck.addEventListener("change", async () => {
          S.commEnableTgc = commTgcCheck.checked;
          await bbeSave({ commEnableTgc: commTgcCheck.checked });
        });
      }
      if (commGuzikCheck) {
        commGuzikCheck.checked = S.commEnableGuzik !== false;
        commGuzikCheck.addEventListener("change", async () => {
          S.commEnableGuzik = commGuzikCheck.checked;
          await bbeSave({ commEnableGuzik: commGuzikCheck.checked });
        });
      }
      if (commConstableCheck) {
        commConstableCheck.checked = S.commEnableConstable !== false;
        commConstableCheck.addEventListener("change", async () => {
          S.commEnableConstable = commConstableCheck.checked;
          await bbeSave({ commEnableConstable: commConstableCheck.checked });
        });
      }
      if (commUtleyCheck) {
        commUtleyCheck.checked = S.commEnableUtley !== false;
        commUtleyCheck.addEventListener("change", async () => {
          S.commEnableUtley = commUtleyCheck.checked;
          await bbeSave({ commEnableUtley: commUtleyCheck.checked });
        });
      }

      wordStudyCheck.checked = !!S.wordStudyMode;
      wordStudyCheck.addEventListener("change", async () => {
        S.wordStudyMode = wordStudyCheck.checked;
        await bbeSave({ wordStudyMode: wordStudyCheck.checked });
        syncDomClasses();
        const p = bbeParsePath(location.pathname, getAllVersions());
        if (p) {
          if (S.wordStudyMode) enhanceVersesForWordStudy(p);
          renderToolbar(p);
        }
      });

      wordStudyTrigger.value = S.wordStudyTrigger || "hover";
      wordStudyTrigger.addEventListener("change", async () => {
        S.wordStudyTrigger = wordStudyTrigger.value;
        await bbeSave({ wordStudyTrigger: wordStudyTrigger.value });
      });



      const hlCheck = bodyEl.querySelector("#bbe-modal-highlighting-check");
      const hlBadgesCheck = bodyEl.querySelector("#bbe-modal-highlight-badges-check");
      const defaultHlColor = bodyEl.querySelector("#bbe-modal-default-hl-color");

      if (hlCheck) {
        hlCheck.checked = S.youversionHighlighting !== false;
        hlCheck.addEventListener("change", async () => {
          S.youversionHighlighting = hlCheck.checked;
          await bbeSave({ youversionHighlighting: hlCheck.checked });
          const p = bbeParsePath(location.pathname, getAllVersions());
          if (p) renderVerseBadges(p, true);
        });
      }

      if (hlBadgesCheck) {
        hlBadgesCheck.checked = S.showVerseHighlightBadges !== false;
        hlBadgesCheck.addEventListener("change", async () => {
          S.showVerseHighlightBadges = hlBadgesCheck.checked;
          await bbeSave({ showVerseHighlightBadges: hlBadgesCheck.checked });
          const p = bbeParsePath(location.pathname, getAllVersions());
          if (p) renderVerseBadges(p, true);
        });
      }

      if (defaultHlColor) {
        defaultHlColor.value = S.defaultHighlightColor || "fffe00";
        defaultHlColor.addEventListener("change", async () => {
          S.defaultHighlightColor = defaultHlColor.value;
          await bbeSave({ defaultHighlightColor: defaultHlColor.value });
        });
      }
    }

    /* ---------------- TAB 5: Floating Toolbar ---------------- */
    else if (activeSettingsTab === "toolbar") {
      bodyEl.innerHTML = `
        <div class="bbe-modal-card" style="border: 1.5px solid #3b82f6; background: rgba(59, 130, 246, 0.04);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div>
              <div class="bbe-modal-card-title" style="margin:0;color:#2563eb;">🎯 Floating Toolbar Quick Pills</div>
              <div class="bbe-modal-hint" style="margin:2px 0 0 0;">Restore or toggle quick buttons directly on your floating study pill.</div>
            </div>
            <button type="button" class="bbe-preview-btn bbe-preview-btn-primary" id="bbe-restore-all-toolbar-pills-btn" title="Restore all quick pills to the floating toolbar">
              ↺ Restore All Pills
            </button>
          </div>

          <label class="bbe-modal-row" style="margin-top:10px;">
            <div>
              <div class="bbe-modal-row-label">Show Unified Aa Reader Menu on Floating Pill (Aa ▾)</div>
              <div class="bbe-modal-row-hint">Display the unified Aa reader menu (Column Width, Text Size, Font Family, Theme Swatches). Uncheck to retire to Settings.</div>
            </div>
            <input type="checkbox" id="bbe-modal-aa-menu-check" ${S.showAaMenu !== false ? 'checked' : ''}>
          </label>

          <label class="bbe-modal-row" style="margin-top:8px;">
            <div>
              <div class="bbe-modal-row-label">Show Standalone Width Resizer on Floating Pill (↔ 950 ▾)</div>
              <div class="bbe-modal-row-hint">Display the dedicated expandable width button (750 / 950 / 1200 / Max). Uncheck to retire to Settings.</div>
            </div>
            <input type="checkbox" id="bbe-modal-width-controls-check" ${S.showWidthControls !== false ? 'checked' : ''}>
          </label>
        </div>

        <div class="bbe-modal-card">
          <div class="bbe-modal-card-title">Floating Top Bar Behavior</div>
          <div class="bbe-modal-hint">Control how the top pill floats, dims, and auto-hides while reading scripture.</div>

          <div class="bbe-input-group" style="margin-bottom:10px;">
            <label class="bbe-input-label">Toolbar Floating &amp; Reading Behavior</label>
            <select id="bbe-modal-toolbar-behavior" class="bbe-modal-input">
              <option value="smart">Smart Auto-Hide (Glides away on scroll down, reveals on scroll-up or top hover)</option>
              <option value="static">Static (Sits above chapter, scrolls naturally with text)</option>
              <option value="floating">Always Floating (Stays sticky)</option>
            </select>
          </div>

          <label class="bbe-modal-row">
            <div>
              <div class="bbe-modal-row-label">Auto-Dim Floating Bar</div>
              <div class="bbe-modal-row-hint">Dimmable quiet reading mode: bar fades to 15% opacity while reading and blooms to 100% on mouse hover</div>
            </div>
            <input type="checkbox" id="bbe-modal-autodim-check">
          </label>
        </div>

        <div class="bbe-modal-card">
          <div class="bbe-modal-card-title">Top Pill Translation Buttons</div>
          <div class="bbe-modal-hint">Click translations to toggle whether they appear on the floating top pill:</div>
          <div class="bbe-modal-pills" id="bbe-modal-toolbar-pills"></div>
        </div>

        <div class="bbe-modal-card">
          <div class="bbe-modal-card-title">Parallel Translation Comparison</div>
          <div class="bbe-modal-hint">Configure layout and default translations for side-by-side or verse-by-verse comparison:</div>
          <div class="bbe-input-group" style="margin-top:8px;margin-bottom:10px;">
            <label class="bbe-input-label">Comparison View Layout</label>
            <select id="bbe-modal-compare-layout" class="bbe-modal-input">
              <option value="columns">🏛 Side-by-Side Columns (Whole Chapters)</option>
              <option value="interleaved">📑 Interleaved Parallel View (Verse-by-Verse)</option>
            </select>
          </div>
          <div class="bbe-modal-hint" style="margin-bottom:6px;">Default translations to compare:</div>
          <div class="bbe-modal-pills" id="bbe-modal-compare-pills"></div>
        </div>

        <div class="bbe-modal-card">
          <div class="bbe-modal-card-title">📜 Chapter Scroll Progress</div>
          <div class="bbe-modal-hint">Subtle reading progress indicator along the floating toolbar.</div>

          <label class="bbe-modal-row">
            <div>
              <div class="bbe-modal-row-label">Chapter Scroll Progress Bar</div>
              <div class="bbe-modal-row-hint">Subtle progress line along the bottom of the floating pill as you scroll down the chapter</div>
            </div>
            <input type="checkbox" id="bbe-modal-scrollprog-check">
          </label>
        </div>

        <div class="bbe-modal-card">
          <div class="bbe-modal-card-title">🔍 Quick Study Passage Suggestions</div>
          <div class="bbe-modal-hint">Passage suggestion chips shown under the scripture search pill. Automatically retires after the first 3 times it is shown to keep reading distraction-free.</div>

          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;padding:8px 12px;background:rgba(0,0,0,0.03);border-radius:8px;">
            <div>
              <div style="font-weight:600;font-size:13px;">Status</div>
              <div style="font-size:12px;color:${(S.quickStudyShowCount || 0) >= 3 ? '#16a34a' : '#64748b'};margin-top:2px;">
                ${(S.quickStudyShowCount || 0) >= 3 ? '✓ Automatically retired (shown 3 of 3 times)' : `Active: Shown ${(S.quickStudyShowCount || 0)} of 3 times`}
              </div>
            </div>
            <button type="button" class="bbe-btn" id="bbe-modal-reset-quickstudy-btn" style="padding:6px 14px;font-size:12px;">
              ${(S.quickStudyShowCount || 0) >= 3 ? 'Show Again (Reset 3-Time Counter)' : 'Reset Counter to 0'}
            </button>
          </div>
        </div>
      `;

      const behaviorSelect = bodyEl.querySelector("#bbe-modal-toolbar-behavior");
      const autodimCheck = bodyEl.querySelector("#bbe-modal-autodim-check");
      const pillsContainer = bodyEl.querySelector("#bbe-modal-toolbar-pills");
      const compareLayoutSelect = bodyEl.querySelector("#bbe-modal-compare-layout");
      const comparePillsContainer = bodyEl.querySelector("#bbe-modal-compare-pills");
      const scrollProgCheck = bodyEl.querySelector("#bbe-modal-scrollprog-check");
      const widthControlsCheck = bodyEl.querySelector("#bbe-modal-width-controls-check");
      const aaMenuCheck = bodyEl.querySelector("#bbe-modal-aa-menu-check");

      const restoreToolbarPillsBtn = bodyEl.querySelector("#bbe-restore-all-toolbar-pills-btn");
      if (restoreToolbarPillsBtn) {
        restoreToolbarPillsBtn.addEventListener("click", async () => {
          S.showAaMenu = true;
          S.showWidthControls = true;
          await bbeSave({ showAaMenu: true, showWidthControls: true });
          showToast("✓ All toolbar quick pills restored to default!");
          lastRenderKey = "";
          const p = bbeParsePath(location.pathname, getAllVersions());
          if (p) renderToolbar(p);
          renderSettingsModalContent();
        });
      }

      if (widthControlsCheck) {
        widthControlsCheck.addEventListener("change", async () => {
          S.showWidthControls = widthControlsCheck.checked;
          await bbeSave({ showWidthControls: widthControlsCheck.checked });
          showToast(widthControlsCheck.checked ? "✓ Width resizer restored to floating pill" : "Width resizer retired to Settings");
          lastRenderKey = "";
          const p = bbeParsePath(location.pathname, getAllVersions());
          if (p) renderToolbar(p);
        });
      }

      if (aaMenuCheck) {
        aaMenuCheck.addEventListener("change", async () => {
          S.showAaMenu = aaMenuCheck.checked;
          await bbeSave({ showAaMenu: aaMenuCheck.checked });
          showToast(aaMenuCheck.checked ? "✓ Aa menu restored to floating pill" : "Aa menu retired to Settings");
          lastRenderKey = "";
          const p = bbeParsePath(location.pathname, getAllVersions());
          if (p) renderToolbar(p);
        });
      }

      scrollProgCheck.checked = S.showScrollProgress !== false;
      scrollProgCheck.addEventListener("change", async () => {
        S.showScrollProgress = scrollProgCheck.checked;
        await bbeSave({ showScrollProgress: scrollProgCheck.checked });
        lastRenderKey = "";
        const p = bbeParsePath(location.pathname, getAllVersions());
        if (p) renderToolbar(p);
      });

      const resetQuickStudyBtn = bodyEl.querySelector("#bbe-modal-reset-quickstudy-btn");
      if (resetQuickStudyBtn) {
        resetQuickStudyBtn.addEventListener("click", async () => {
          S.quickStudyShowCount = 0;
          await bbeSave({ quickStudyShowCount: 0 });
          showToast("✓ Quick study suggestions reset (will show 3 times)");
          renderSettingsModalContent();
          lastRenderKey = "";
          const p = bbeParsePath(location.pathname, getAllVersions());
          if (p) renderToolbar(p);
        });
      }

      compareLayoutSelect.value = S.compareLayout || "columns";
      compareLayoutSelect.addEventListener("change", async () => {
        S.compareLayout = compareLayoutSelect.value;
        await bbeSave({ compareLayout: compareLayoutSelect.value });
      });

      behaviorSelect.value = S.toolbarBehavior || "smart";
      behaviorSelect.addEventListener("change", async () => {
        S.toolbarBehavior = behaviorSelect.value;
        await bbeSave({ toolbarBehavior: behaviorSelect.value });
        syncDomClasses();
        if (S.toolbarBehavior === "static" || S.toolbarBehavior === "floating") {
          showBar();
        }
      });

      autodimCheck.checked = S.autoDimBar !== false;
      autodimCheck.addEventListener("change", async () => {
        S.autoDimBar = autodimCheck.checked;
        await bbeSave({ autoDimBar: autodimCheck.checked });
        syncDomClasses();
      });

      const selectedToolbar = new Set(S.toolbarVersions || ["ESV", "NIV", "NASB", "NLT", "BSB", "NKJV", "KJV"]);
      for (const key of Object.keys(allVers)) {
        const pill = document.createElement("button");
        pill.type = "button";
        pill.className = "bbe-modal-pill" + (selectedToolbar.has(key) ? " active" : "");
        pill.textContent = key;
        pill.title = allVers[key].name;

        pill.addEventListener("click", async () => {
          if (selectedToolbar.has(key)) {
            if (selectedToolbar.size > 1) {
              selectedToolbar.delete(key);
              pill.classList.remove("active");
            }
          } else {
            selectedToolbar.add(key);
            pill.classList.add("active");
          }
          const ordered = Object.keys(allVers).filter(k => selectedToolbar.has(k));
          S.toolbarVersions = ordered;
          await bbeSave({ toolbarVersions: ordered });
          lastRenderKey = "";
          const p = bbeParsePath(location.pathname, getAllVersions());
          if (p) renderToolbar(p);
        });

        pillsContainer.appendChild(pill);
      }

      const selectedCompare = new Set(S.compareVersions || ["NIV", "ESV"]);
      for (const key of Object.keys(allVers)) {
        const pill = document.createElement("button");
        pill.type = "button";
        pill.className = "bbe-modal-pill" + (selectedCompare.has(key) ? " active" : "");
        pill.textContent = key;
        pill.title = allVers[key].name;

        pill.addEventListener("click", async () => {
          if (selectedCompare.has(key)) {
            if (selectedCompare.size > 1) {
              selectedCompare.delete(key);
              pill.classList.remove("active");
            }
          } else {
            selectedCompare.add(key);
            pill.classList.add("active");
          }
          const ordered = Object.keys(allVers).filter(k => selectedCompare.has(k));
          S.compareVersions = ordered;
          await bbeSave({ compareVersions: ordered });
        });

        comparePillsContainer.appendChild(pill);
      }
    }

    /* ---------------- TAB 6: Distraction-Free Controls ---------------- */
    else if (activeSettingsTab === "distractions") {
      bodyEl.innerHTML = `
        <div class="bbe-modal-card">
          <div class="bbe-modal-card-title">Distraction-Free Controls</div>
          <div class="bbe-modal-hint">Toggle individual website elements to create your ideal peaceful scripture sanctuary.</div>

          <div style="display:flex;gap:6px;margin-bottom:10px;">
            <button type="button" class="bbe-preview-btn" id="bbe-modal-hide-all">👁 Hide All Distractions</button>
            <button type="button" class="bbe-preview-btn" id="bbe-modal-show-all">Show All Website Elements</button>
          </div>

          <label class="bbe-modal-row">
            <span>Top Site Header</span>
            <input type="checkbox" id="m-hideHeader">
          </label>
          <label class="bbe-modal-row">
            <span>Left Navigation Rail / Sidebar</span>
            <input type="checkbox" id="m-hideSidebar">
          </label>
          <label class="bbe-modal-row">
            <span>Promotional Distraction Cards (Videos &amp; Verses)</span>
            <input type="checkbox" id="m-hideDistractionCards">
          </label>
          <label class="bbe-modal-row">
            <span>Site Footer</span>
            <input type="checkbox" id="m-hideFooter">
          </label>
          <label class="bbe-modal-row">
            <span>Bottom Floating Selection Drawer</span>
            <input type="checkbox" id="m-hideBottomBar">
          </label>
          <label class="bbe-modal-row">
            <span>Version Copyright Notice</span>
            <input type="checkbox" id="m-hideCopyright">
          </label>
          <label class="bbe-modal-row">
            <span>Footnote Letters &amp; Markers</span>
            <input type="checkbox" id="m-hideFootnotes">
          </label>
          <label class="bbe-modal-row">
            <span>Section Headings</span>
            <input type="checkbox" id="m-hideHeadings">
          </label>
          <label class="bbe-modal-row">
            <span>Verse Numbers</span>
            <input type="checkbox" id="m-hideVerseNumbers">
          </label>
          <label class="bbe-modal-row">
            <span>Completely Hide Floating Toolbar</span>
            <input type="checkbox" id="m-hideSwitcher">
          </label>
        </div>
      `;

      const distFields = [
        "hideHeader", "hideSidebar", "hideDistractionCards", "hideFooter",
        "hideBottomBar", "hideCopyright", "hideFootnotes", "hideHeadings",
        "hideVerseNumbers", "hideSwitcher"
      ];

      distFields.forEach(f => {
        const chk = bodyEl.querySelector("#m-" + f);
        if (chk) {
          chk.checked = !!S[f];
          chk.addEventListener("change", async () => {
            S[f] = chk.checked;
            await bbeSave({ [f]: chk.checked });
            syncDomClasses();
          });
        }
      });

      bodyEl.querySelector("#bbe-modal-hide-all")?.addEventListener("click", async () => {
        const patch = {
          hideHeader: true, hideSidebar: true, hideDistractionCards: true,
          hideFooter: true, hideBottomBar: true, hideCopyright: true
        };
        Object.assign(S, patch);
        await bbeSave(patch);
        syncDomClasses();
        renderSettingsModalContent();
      });

      bodyEl.querySelector("#bbe-modal-show-all")?.addEventListener("click", async () => {
        const patch = {
          hideHeader: false, hideSidebar: false, hideDistractionCards: false,
          hideFooter: false, hideBottomBar: false, hideCopyright: false,
          hideFootnotes: false, hideHeadings: false, hideVerseNumbers: false, hideSwitcher: false
        };
        Object.assign(S, patch);
        await bbeSave(patch);
        syncDomClasses();
        renderSettingsModalContent();
      });
    }

    /* ---------------- TAB 7: Custom CSS Overrides ---------------- */
    else if (activeSettingsTab === "css") {
      bodyEl.innerHTML = `
        <div class="bbe-modal-card">
          <div class="bbe-modal-card-title">Custom CSS Overrides</div>
          <div class="bbe-modal-hint">Write custom CSS rules that inject directly into Bible.com pages.</div>

          <textarea id="bbe-modal-custom-css" style="width:100%;height:140px;box-sizing:border-box;font-family:monospace;font-size:12px;padding:8px;border:1px solid #cbd5e1;border-radius:6px;resize:vertical;" placeholder="/* Extra CSS overrides here */">${S.customCss || ""}</textarea>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
            <span id="bbe-modal-css-saved" style="font-size:11px;color:#16a34a;font-weight:600;"></span>
            <button type="button" class="bbe-add-submit-btn" id="bbe-modal-css-save-btn">Save CSS</button>
          </div>
        </div>
      `;

      const cssArea = bodyEl.querySelector("#bbe-modal-custom-css");
      const saveBtn = bodyEl.querySelector("#bbe-modal-css-save-btn");
      const savedMsg = bodyEl.querySelector("#bbe-modal-css-saved");

      saveBtn.addEventListener("click", async () => {
        const css = cssArea.value;
        S.customCss = css;
        if (customStyle) customStyle.textContent = css;
        await bbeSave({ customCss: css });
        savedMsg.textContent = "✓ Custom CSS applied & saved!";
        setTimeout(() => { savedMsg.textContent = ""; }, 2000);
      });
    }
  }

  function renderShortcutsModalContent() {
    renderSettingsModalContent();
  }

  function openSettingsModal(tab = "shortcuts") {
    activeSettingsTab = tab || "shortcuts";
    ensureSettingsModal();
    renderSettingsModalContent();
    isSettingsModalOpen = true;
    isShortcutsModalOpen = true;
    const backdrop = document.getElementById("bbe-modal-backdrop");
    const modal = document.getElementById("bbe-shortcuts-modal");
    if (backdrop) backdrop.classList.add("open");
    if (modal) modal.classList.add("open");
  }

  function openShortcutsModal() {
    openSettingsModal("shortcuts");
  }

  /* ---------------- Main Lifecycle Loop ---------------- */
  function tick() {
    if (!document.body) return;
    syncDomClasses();

    const allVers = getAllVersions();
    const p = bbeParsePath(location.pathname, allVers);
    if (!S.enabled || !p) {
      document.getElementById("bbe-bar")?.remove();
      removeCompare();
      lastRenderKey = "";
      return;
    }

    // Trigger background preloading for instant swapping
    preloadOtherVersions(p);
    preloadAdjacentChapters(p);

    // Render unobtrusive commentary badges next to verse numbers
    renderVerseBadges(p);

    // Enhance verses for Strong's Word Study if active
    if (S.wordStudyMode) {
      enhanceVersesForWordStudy(p);
    }

    const stateKey = [
      location.pathname,
      S.enabled,
      S.hideSwitcher,
      S.columnWidth,
      S.fontSize,
      S.lineHeight,
      S.enableKeyShortcuts,
      S.showCommentaryBadges,
      S.commentaryDock,
      S.toolbarBehavior,
      S.autoDimBar,
      isBarHidden,
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
      S.showWidthControls,
      S.showAaMenu,
      (S.toolbarVersions || []).join(),
      JSON.stringify(S.customShortcuts || {}),
      JSON.stringify(S.userTranslations || {}),
      isDrawerOpen,
      isDrawerFullscreen,
      isShortcutsModalOpen,
      S.compareOn,
      S.compareLayout,
      (S.compareVersions || []).join(),
      S.showScrollProgress,
      S.youversionHighlighting,
      S.showVerseHighlightBadges,
      S.defaultHighlightColor
    ].join("|");

    const barExists = !!document.getElementById("bbe-bar");
    const compareExists = !S.compareOn || !!document.getElementById("bbe-compare-grid");

    if (stateKey === lastRenderKey && barExists && compareExists) {
      return;
    }

    lastRenderKey = stateKey;
    renderToolbar(p);

    if (S.compareOn) {
      renderCompare(p);
    } else {
      removeCompare();
    }
  }

  /* ---------------- Immediate SPA Navigation Hooks ---------------- */
  let lastObservedUrl = location.href;
  function handleUrlChange() {
    if (location.href !== lastObservedUrl) {
      lastObservedUrl = location.href;
      lastRenderKey = "";
      cancelPreloading();
      tick();
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

  syncDomClasses();
  const initP = bbeParsePath(location.pathname, getAllVersions());
  if (initP) {
    renderVerseBadges(initP);
  }
  tick();

  // Relaxed idle safety net: event-driven via history hooks + 1500ms fallback (paused when tab hidden)
  setInterval(() => {
    if (document.hidden) return;
    handleUrlChange();
    tick();
  }, 1500);
})();
