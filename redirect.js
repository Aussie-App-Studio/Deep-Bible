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

    if (!targetId && typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(["toolbarVersions", "activeTranslation"], (data) => {
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
