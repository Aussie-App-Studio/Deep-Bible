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

  checkAndRedirect();

  // Watch for history pushState / replaceState and SPA URL transitions via event hooks
  let lastHref = location.href;
  function onUrlChange() {
    if (location.href !== lastHref) {
      lastHref = location.href;
      checkAndRedirect();
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
