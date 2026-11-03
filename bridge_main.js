// Bible.com Enhancer — Main World Bridge for YouVersion Native React Context
(function() {
  if (window.__BBE_BRIDGE_INITIALIZED) return;
  window.__BBE_BRIDGE_INITIALIZED = true;
  document.body && document.body.classList.add('bbe-hide-bottombar');

  let cachedContext = null;
  let cachedContextRoot = null;

  function findChapterContext() {
    const rootEl = document.querySelector('.cat7xG_yv-bible-text') || document.querySelector('main') || document.body;
    if (!rootEl) return null;

    if (cachedContext && cachedContextRoot && cachedContextRoot.isConnected && rootEl === cachedContextRoot) {
      return cachedContext;
    }

    function walk(node, depth = 35) {
      if (!node || depth <= 0) return null;
      const k = Object.keys(node).find(key => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance$'));
      if (k) {
        let curr = node[k];
        while (curr) {
          const fc = curr.dependencies?.firstContext;
          if (fc?.context?._currentValue?.setChapterHighlights) return fc.context._currentValue;
          if (curr.memoizedProps?.value?.setChapterHighlights) return curr.memoizedProps.value;
          curr = curr.return;
        }
      }
      for (const ch of (node.children || [])) {
        const found = walk(ch, depth - 1);
        if (found) return found;
      }
      return null;
    }

    const ctx = walk(rootEl);
    if (ctx) {
      cachedContext = ctx;
      cachedContextRoot = rootEl;
    }
    return ctx;
  }

  function isUserSignedIn() {
    // 1. If blank avatar is present in DOM, user is definitely logged out
    if (document.querySelector('[data-testid="blankAvatar"]')) return false;

    // 2. Real user avatar present in DOM
    if (document.querySelector('img[src*="user-avatars"]') || document.querySelector('img[src*="youversion-user-avatars"]')) return true;

    // 3. Auth token present in query cache
    if (getAuthToken()) return true;

    // 4. User profile link present
    const userLink = document.querySelector('a[href*="/users/"]');
    if (userLink && !userLink.href.includes('/users/sign-in')) return true;

    // 5. Explicit user prop in Next data
    if (window.__NEXT_DATA__?.props?.pageProps?.user) return true;

    // 6. Explicit auth token cookie (do NOT match generic '__yvii' or 'yv_' as they exist for anonymous visitors)
    if (document.cookie.includes('token=')) return true;

    return false;
  }

  function getAuthToken() {
    const rootEl = document.querySelector('main') || document.body;
    function walk(node, depth = 40) {
      if (!node || depth <= 0) return null;
      const k = Object.keys(node).find(key => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance$'));
      if (k) {
        let curr = node[k];
        while (curr) {
          if (curr.memoizedProps?.client) {
            const client = curr.memoizedProps.client;
            const q = client.getQueryCache().getAll().find(item => item.queryKey?.[0] === 'auth-token');
            if (q?.state?.data) return q.state.data;
          }
          curr = curr.return;
        }
      }
      for (const ch of (node.children || [])) {
        const found = walk(ch, depth - 1);
        if (found) return found;
      }
      return null;
    }
    return walk(rootEl);
  }

  function getUserInfo() {
    const userLink = document.querySelector('a[href*="/users/"]');
    const match = userLink ? userLink.getAttribute('href').match(/\/users\/([^/?#]+)/) : null;
    const username = match ? match[1] : (window.__NEXT_DATA__?.props?.pageProps?.user?.username || null);
    const token = getAuthToken();
    const signedIn = !!(username || token || isUserSignedIn());
    return { signedIn, username, hasToken: !!token };
  }

  const COLOR_RGB_TO_HEX = {
    'rgb(255, 254, 0)': 'fffe00',
    'rgb(93, 255, 121)': '5dff79',
    'rgb(0, 214, 255)': '00d6ff',
    'rgb(255, 198, 111)': 'ffc66f',
    'rgb(255, 149, 239)': 'ff95ef'
  };

  function getAllHighlights() {
    const ctx = findChapterContext();
    const hlMap = new Map();

    // 1. From YouVersion native React context
    if (ctx && Array.isArray(ctx.chapterHighlights)) {
      ctx.chapterHighlights.forEach(h => {
        if (h && h.usfm && h.color) {
          hlMap.set(h.usfm, h.color.replace('#', '').toLowerCase());
        }
      });
    }

    // 2. From page DOM elements styled with YouVersion background colors
    document.querySelectorAll('[data-usfm]').forEach(el => {
      const usfm = el.getAttribute('data-usfm');
      if (!usfm || usfm.split('.').length < 3) return;
      const style = el.getAttribute('style') || '';
      for (const [rgb, hex] of Object.entries(COLOR_RGB_TO_HEX)) {
        if (style.includes(rgb)) {
          hlMap.set(usfm, hex);
          break;
        }
      }
    });

    const list = [];
    hlMap.forEach((color, usfm) => {
      list.push({ usfm, color });
    });
    return list;
  }

  function waitForElement(selector, maxMs = 1200) {
    return new Promise(resolve => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      const start = Date.now();
      const interval = setInterval(() => {
        const found = document.querySelector(selector);
        if (found) {
          clearInterval(interval);
          resolve(found);
        } else if (Date.now() - start >= maxMs) {
          clearInterval(interval);
          resolve(null);
        }
      }, 25);
    });
  }

  // Handle incoming commands from content script
  window.addEventListener('BBE_CMD_HIGHLIGHT', async (e) => {
    const { usfms, color } = e.detail || {};
    if (!usfms || !Array.isArray(usfms) || !usfms.length) return;
    const ctx = findChapterContext();

    const clean = color ? color.replace('#', '').toLowerCase() : null;
    const signedIn = isUserSignedIn();

    if (!signedIn || !ctx) {
      // User is logged out or on a verse-only view without native ChapterReader context:
      // Optimistically update React chapterHighlights state if available
      if (ctx) {
        const existing = ctx.chapterHighlights || [];
        const updated = existing.filter(h => !usfms.includes(h.usfm));
        if (clean) {
          usfms.forEach(u => updated.push({ color: clean, usfm: u }));
        }
        if (typeof ctx.setChapterHighlights === 'function') {
          ctx.setChapterHighlights(updated);
        }
      }

      // Also apply direct styling to matching verse DOM nodes for instant visual feedback
      const hexMap = {
        'fffe00': 'rgba(255, 254, 0, 0.45)',
        '5dff79': 'rgba(93, 255, 121, 0.45)',
        '00d6ff': 'rgba(0, 214, 255, 0.45)',
        'ffc66f': 'rgba(255, 198, 111, 0.45)',
        'ff95ef': 'rgba(255, 149, 239, 0.45)'
      };
      usfms.forEach(u => {
        const vEl = document.querySelector(`[data-usfm="${u}"]`);
        if (vEl) {
          const contentEls = vEl.querySelectorAll('.content, [class*="_content"]');
          const targets = contentEls.length > 0 ? contentEls : [vEl];
          targets.forEach(t => {
            if (clean) {
              t.style.backgroundColor = hexMap[clean] || '#' + clean;
              t.setAttribute('data-bbe-temp-hl', clean);
            } else {
              t.style.backgroundColor = '';
              t.removeAttribute('data-bbe-temp-hl');
            }
          });
        }
      });

      // Clear selection drawer so no native drawer or toast appears
      if (ctx && typeof ctx.clearSelectedVerses === 'function') {
        ctx.clearSelectedVerses();
      }

      syncHighlightsNow();

      window.dispatchEvent(new CustomEvent('BBE_CMD_HIGHLIGHT_DONE', {
        detail: { usfms, color: clean, isTemporary: !signedIn }
      }));

      if (!signedIn) {
        // Fire prominent warning event for content script
        window.dispatchEvent(new CustomEvent('BBE_AUTH_WARNING', {
          detail: {
            action: 'highlight',
            isTemporary: true,
            usfms,
            color: clean,
            message: 'You are not signed in to Bible.com. This highlight is temporary and will disappear when you reload or navigate away.'
          }
        }));
      }
      return;
    }

    if (clean) {
      // 1. Select the verses
      if (typeof ctx.setSelectedVerses === 'function') {
        ctx.setSelectedVerses(new Set(usfms));
      }

      // 2. Wait for swatch to mount in drawer
      const swatch = await waitForElement('[data-testid="' + clean + '"]', 1200);
      if (swatch) {
        const parent = swatch.parentElement;
        const pk = Object.keys(parent).find(key => key.startsWith('__reactProps'));
        if (pk && parent[pk]?.onClick) {
          parent[pk].onClick({ preventDefault: () => {}, stopPropagation: () => {} });
        } else {
          parent.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }
        await new Promise(r => setTimeout(r, 150));
      }

      // Optimistically update React context
      const existing = ctx.chapterHighlights || [];
      const updated = existing.filter(h => !usfms.includes(h.usfm));
      usfms.forEach(u => updated.push({ color: clean, usfm: u }));
      if (typeof ctx.setChapterHighlights === 'function') {
        ctx.setChapterHighlights(updated);
      }

      // Clear selection drawer
      if (typeof ctx.clearSelectedVerses === 'function') {
        ctx.clearSelectedVerses();
      }

      syncHighlightsNow();
      window.dispatchEvent(new CustomEvent('BBE_CMD_HIGHLIGHT_DONE', { detail: { usfms, color: clean, isTemporary: false } }));
    } else {
      // Clear highlight
      if (typeof ctx.setSelectedVerses === 'function') {
        ctx.setSelectedVerses(new Set(usfms));
      }

      const removeBtn = await waitForElement('[data-testid="remove-highlight"]', 1200);
      if (removeBtn) {
        const pk = Object.keys(removeBtn).find(key => key.startsWith('__reactProps'));
        if (pk && removeBtn[pk]?.onClick) {
          removeBtn[pk].onClick({ preventDefault: () => {}, stopPropagation: () => {} });
        } else {
          removeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }
        await new Promise(r => setTimeout(r, 150));
      }

      // Optimistically update context
      const existing = ctx.chapterHighlights || [];
      const updated = existing.filter(h => !usfms.includes(h.usfm));
      if (typeof ctx.setChapterHighlights === 'function') {
        ctx.setChapterHighlights(updated);
      }

      // Clear selection drawer
      if (typeof ctx.clearSelectedVerses === 'function') {
        ctx.clearSelectedVerses();
      }

      syncHighlightsNow();
      window.dispatchEvent(new CustomEvent('BBE_CMD_HIGHLIGHT_DONE', { detail: { usfms, color: null, isTemporary: false } }));
    }
  });

  // Check user auth and details
  window.addEventListener('BBE_CMD_GET_AUTH', () => {
    window.dispatchEvent(new CustomEvent('BBE_AUTH_INFO', { detail: getUserInfo() }));
  });

  // Select verses in YouVersion React state and reveal native bottom bar
  window.addEventListener('BBE_CMD_SELECT_VERSES', (e) => {
    const { usfms } = e.detail || {};
    if (!usfms || !Array.isArray(usfms) || !usfms.length) return;
    const ctx = findChapterContext();
    if (ctx && typeof ctx.setSelectedVerses === 'function') {
      ctx.setSelectedVerses(new Set(usfms));
    }
    document.body.classList.add('bbe-hide-bottombar');
  });

  // Save note 100% directly to YouVersion / Bible.com cloud backend
  window.addEventListener('BBE_CMD_SAVE_NOTE', async (e) => {
    const { usfms, content, versionId } = e.detail || {};
    if (!usfms || !Array.isArray(usfms) || !usfms.length || !content) {
      window.dispatchEvent(new CustomEvent('BBE_CMD_NOTE_DONE', {
        detail: { success: false, error: 'Missing verse or note content' }
      }));
      return;
    }

    const token = getAuthToken();
    if (!token) {
      window.dispatchEvent(new CustomEvent('BBE_CMD_NOTE_DONE', {
        detail: { success: false, error: 'You are not signed in to YouVersion. Please sign in to Bible.com to save notes.' }
      }));
      return;
    }

    try {
      const now = new Date().toISOString().slice(0, -5) + '+00:00';
      const vid = typeof versionId === 'number' ? versionId : (parseInt(versionId, 10) || 59);
      const body = {
        kind: 'note',
        content: content.trim(),
        created_dt: now,
        references: [{
          usfm: usfms,
          version_id: vid
        }]
      };

      const resp = await fetch('https://moments.youversionapi.com/3.1/create.json', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'x-youversion-app-version': '3',
          'x-youversion-client': 'youversion',
          'x-youversion-app-platform': 'web',
          'content-type': 'application/json',
          'accept': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (resp.ok) {
        const data = await resp.json().catch(() => ({}));
        const noteId = data.response?.data?.id;
        window.dispatchEvent(new CustomEvent('BBE_CMD_NOTE_DONE', {
          detail: { success: true, usfms, noteId: noteId ? noteId.toString() : null }
        }));
      } else {
        const errText = await resp.text().catch(() => resp.statusText);
        window.dispatchEvent(new CustomEvent('BBE_CMD_NOTE_DONE', {
          detail: { success: false, error: 'Server returned ' + resp.status }
        }));
      }
    } catch (err) {
      window.dispatchEvent(new CustomEvent('BBE_CMD_NOTE_DONE', {
        detail: { success: false, error: err.message || 'Network request failed' }
      }));
    }
  });

  function syncHighlightsNow() {
    const list = getAllHighlights();
    window.dispatchEvent(new CustomEvent('BBE_HIGHLIGHTS_SYNC', { detail: { highlights: list } }));
  }

  let lastJson = "";
  function pollHighlights() {
    const list = getAllHighlights();
    const json = JSON.stringify(list);
    if (json !== lastJson) {
      lastJson = json;
      syncHighlightsNow();
    }
  }

  // --- Smart Event-Driven Highlight Synchronization ---
  let highlightObserver = null;
  let observedTarget = null;
  let syncDebounceTimer = null;

  function debouncedSyncHighlights() {
    if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
      pollHighlights();
    }, 120);
  }

  function setupHighlightObserver() {
    const target = document.querySelector('.cat7xG_yv-bible-text') || document.querySelector('main') || document.body;
    if (!target) return;
    if (highlightObserver && observedTarget === target && target.isConnected) return;

    if (highlightObserver) {
      try { highlightObserver.disconnect(); } catch (e) {}
    }

    observedTarget = target;
    highlightObserver = new MutationObserver((mutations) => {
      let shouldCheck = false;
      for (const m of mutations) {
        if (m.type === 'attributes') {
          const t = m.target;
          if (t && (t.hasAttribute?.('data-usfm') || t.closest?.('[data-usfm]'))) {
            shouldCheck = true;
            break;
          }
        } else if (m.type === 'childList') {
          shouldCheck = true;
          break;
        }
      }
      if (shouldCheck) {
        debouncedSyncHighlights();
      }
    });

    try {
      highlightObserver.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });
    } catch (e) {}
  }

  // React to page navigation and history transitions
  window.addEventListener('popstate', () => {
    cachedContext = null;
    cachedContextRoot = null;
    setupHighlightObserver();
    setTimeout(syncHighlightsNow, 300);
    setTimeout(syncHighlightsNow, 1200);
  });

  // Initial setup on chapter load
  setupHighlightObserver();
  setTimeout(syncHighlightsNow, 300);
  setTimeout(syncHighlightsNow, 1200);

  // Relaxed idle safety check (every 3s instead of 300ms, paused when tab is inactive)
  setInterval(() => {
    if (document.hidden) return;
    if (!observedTarget || !observedTarget.isConnected) {
      cachedContext = null;
      cachedContextRoot = null;
      setupHighlightObserver();
      syncHighlightsNow();
      return;
    }
    pollHighlights();
  }, 3000);
})();
