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

  let cachedAuthToken = null;
  let cachedAuthTokenTs = 0;

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
    const t = walk(rootEl);
    if (t) {
      cachedAuthToken = t;
      cachedAuthTokenTs = Date.now();
    }
    return t || cachedAuthToken;
  }

  async function ensureAuthToken() {
    const syncToken = getAuthToken();
    if (syncToken) return syncToken;
    if (cachedAuthToken && Date.now() - cachedAuthTokenTs < 600000) return cachedAuthToken;
    try {
      const resp = await fetch('https://www.bible.com/api/authenticate?t=' + Date.now(), {
        credentials: 'same-origin',
        headers: { 'accept': 'application/json' }
      });
      if (resp.ok) {
        const data = await resp.json().catch(() => ({}));
        if (data && data.accessToken) {
          cachedAuthToken = data.accessToken;
          cachedAuthTokenTs = Date.now();
          return data.accessToken;
        }
      }
    } catch (e) {}
    return null;
  }

  function getCurrentPageVersionId() {
    const m = location.pathname.match(/\/bible\/(\d+)\//);
    return m ? parseInt(m[1], 10) : 59;
  }

  function applyDomHighlightsToScope(scopeEl, usfms, cleanColor) {
    if (!scopeEl || !Array.isArray(usfms) || !usfms.length) return;
    const hexMap = {
      'fffe00': '#fdefc5',
      'fef100': '#fdefc5',
      '5dff79': '#d9e9ce',
      '00d6ff': '#baddff',
      'ffc66f': '#fcd7b6',
      'ff95ef': '#f5c8d6'
    };
    const normColor = cleanColor === 'fef100' ? 'fffe00' : cleanColor;
    usfms.forEach(u => {
      const num = u.split('.').pop();
      const prefix = u.slice(0, u.length - num.length);
      const numInt = parseInt(num, 10);
      const verseNodes = Array.from(scopeEl.querySelectorAll('[data-usfm]')).filter(el => {
        const val = el.getAttribute('data-usfm') || '';
        if (val.split('.').length < 3) return false;
        return val === u || val.split(/[+\s,]+/).includes(u) ||
          (val.startsWith(prefix) && extractNums(val).includes(numInt));
      });
      const outer = verseNodes.filter(el => !verseNodes.some(o => o !== el && o.contains(el)));
      outer.forEach(vEl => {
        let contentEls = Array.from(vEl.querySelectorAll('.content, [class*="_content"]'));
        contentEls = contentEls.filter(c => !contentEls.some(o => o !== c && o.contains(c)));
        const targets = contentEls.length > 0 ? contentEls : [vEl];
        // When clearing, clear both vEl and inner contentEls
        const clearTargets = [vEl, ...contentEls];
        if (normColor) {
          targets.forEach(t => {
            t.style.backgroundColor = hexMap[normColor] || '#' + normColor;
            t.setAttribute('data-bbe-temp-hl', normColor);
          });
        } else {
          clearTargets.forEach(t => {
            t.style.backgroundColor = '';
            t.removeAttribute('data-bbe-temp-hl');
          });
        }
      });
    });
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
    'rgb(254, 241, 0)': 'fffe00',
    'rgb(253, 239, 197)': 'fffe00',
    'rgb(93, 255, 121)': '5dff79',
    'rgb(217, 233, 206)': '5dff79',
    'rgb(0, 214, 255)': '00d6ff',
    'rgb(186, 221, 255)': '00d6ff',
    'rgb(255, 198, 111)': 'ffc66f',
    'rgb(252, 215, 182)': 'ffc66f',
    'rgb(255, 149, 239)': 'ff95ef',
    'rgb(245, 200, 214)': 'ff95ef'
  };

  function normalizeColorId(c) {
    if (!c) return null;
    const raw = String(c).replace('#', '').toLowerCase();
    return raw === 'fef100' ? 'fffe00' : raw;
  }

  function extractNums(usfm) {
    const out = [];
    String(usfm || '').split(/[+\s,]+/).forEach(tok => {
      const m = tok.match(/\.(\d+)(?:-(\d+))?$/);
      if (m) {
        const a = parseInt(m[1], 10), b = m[2] ? parseInt(m[2], 10) : a;
        for (let v = Math.min(a, b); v <= Math.max(a, b) && v <= Math.min(a, b) + 50; v++) out.push(v);
      }
    });
    return out;
  }

  function getAllHighlights() {
    const ctx = findChapterContext();
    const hlMap = new Map();

    // 1. From YouVersion native React context
    if (ctx && Array.isArray(ctx.chapterHighlights)) {
      ctx.chapterHighlights.forEach(h => {
        if (h && h.usfm && h.color) {
          hlMap.set(h.usfm, normalizeColorId(h.color));
        }
      });
    }

    // 2. From page DOM elements styled with YouVersion background colors or data-bbe-temp-hl
    document.querySelectorAll('[data-usfm]').forEach(el => {
      if (el.closest('#bbe-compare-grid')) return;
      const usfm = el.getAttribute('data-usfm');
      if (!usfm || usfm.split('.').length < 3) return;
      const tagged = el.getAttribute('data-bbe-temp-hl') || el.querySelector('[data-bbe-temp-hl]')?.getAttribute('data-bbe-temp-hl');
      if (tagged) {
        hlMap.set(usfm, normalizeColorId(tagged));
        return;
      }
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

  async function saveCloudHighlightForVersion(token, versionId, usfms, cleanColor) {
    const vid = parseInt(versionId, 10) || getCurrentPageVersionId();
    const headers = {
      'Authorization': 'Bearer ' + token,
      'x-youversion-app-version': '3',
      'x-youversion-client': 'youversion',
      'x-youversion-app-platform': 'web',
      'content-type': 'application/json',
      'accept': 'application/json'
    };
    if (cleanColor) {
      const now = new Date().toISOString().slice(0, -5) + '+00:00';
      const body = {
        color: cleanColor,
        created_dt: now,
        kind: 'highlight',
        references: [{
          usfm: usfms,
          version_id: vid
        }]
      };
      const resp = await fetch('https://moments.youversionapi.com/3.1/create.json', {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return true;
    } else {
      const body = {
        usfm: usfms,
        version_id: vid
      };
      const resp = await fetch('https://moments.youversionapi.com/3.1/hide_verse_colors.json', {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return true;
    }
  }

  async function fetchCloudHighlightsForVersion(token, chapterUsfm, versionId) {
    const vid = parseInt(versionId, 10) || getCurrentPageVersionId();
    const url = `https://moments.youversionapi.com/3.1/verse_colors.json?usfm=${encodeURIComponent(chapterUsfm)}&version_id=${vid}`;
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'x-youversion-app-version': '3',
        'x-youversion-client': 'youversion',
        'x-youversion-app-platform': 'web',
        'accept': 'application/json'
      }
    });
    if (resp.status === 404) return [];
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const json = await resp.json().catch(() => ({}));
    const rows = json?.response?.data;
    if (!Array.isArray(rows)) return [];
    const list = [];
    rows.forEach(item => {
      if (Array.isArray(item) && item[0] && item[1]) {
        list.push({ usfm: item[0], color: normalizeColorId(item[1]) });
      }
    });
    return list;
  }

  const cloudHighlightsCache = new Map(); // "${vid}|${chapterUsfm}" -> Promise<Array<{usfm, color}>>
  const MAX_HIGHLIGHT_CACHE = 100;

  function getCachedCloudHighlights(token, chapterUsfm, versionId) {
    const vid = parseInt(versionId, 10) || getCurrentPageVersionId();
    const cacheKey = `${vid}|${chapterUsfm}`;
    if (!cloudHighlightsCache.has(cacheKey)) {
      const promise = fetchCloudHighlightsForVersion(token, chapterUsfm, vid).catch((err) => {
        if (cloudHighlightsCache.get(cacheKey) === promise) {
          cloudHighlightsCache.delete(cacheKey);
        }
        throw err;
      });
      cloudHighlightsCache.set(cacheKey, promise);
      if (cloudHighlightsCache.size > MAX_HIGHLIGHT_CACHE) {
        const oldestKey = cloudHighlightsCache.keys().next().value;
        cloudHighlightsCache.delete(oldestKey);
      }
    }
    return cloudHighlightsCache.get(cacheKey);
  }

  function groupUsfmsByChapter(usfms) {
    const byChap = new Map();
    (usfms || []).forEach((u) => {
      const parts = String(u || '').split('.');
      if (parts.length < 3) return;
      const chap = `${parts[0]}.${parts[1]}`;
      if (!byChap.has(chap)) byChap.set(chap, []);
      byChap.get(chap).push(u);
    });
    return byChap;
  }

  function updateHighlightCache(versionIds, usfms, cleanColor) {
    const byChap = groupUsfmsByChapter(usfms);
    if (!byChap.size) return;
    const vids = Array.from(new Set((versionIds || []).map(v => parseInt(v, 10)).filter(Boolean)));
    vids.forEach((vid) => {
      byChap.forEach((chapUsfms, chap) => {
        const cacheKey = `${vid}|${chap}`;
        if (!cloudHighlightsCache.has(cacheKey)) return;
        const prev = cloudHighlightsCache.get(cacheKey);
        const next = prev.then((list) => {
          const updated = (Array.isArray(list) ? list : []).filter(h => !chapUsfms.includes(h.usfm));
          if (cleanColor) {
            chapUsfms.forEach(u => updated.push({ usfm: u, color: cleanColor }));
          }
          return updated;
        });
        next.catch(() => {
          if (cloudHighlightsCache.get(cacheKey) === next) {
            cloudHighlightsCache.delete(cacheKey);
          }
        });
        cloudHighlightsCache.set(cacheKey, next);
      });
    });
  }

  function invalidateHighlightCache(versionIds, usfms) {
    const byChap = groupUsfmsByChapter(usfms);
    if (!byChap.size) return;
    const vids = Array.from(new Set((versionIds || []).map(v => parseInt(v, 10)).filter(Boolean)));
    vids.forEach((vid) => {
      byChap.forEach((_, chap) => {
        cloudHighlightsCache.delete(`${vid}|${chap}`);
      });
    });
  }

  // Handle incoming commands from content script
  window.addEventListener('BBE_CMD_HIGHLIGHT', async (e) => {
    const { usfms, color, versionIds, reqId } = e.detail || {};
    if (!usfms || !Array.isArray(usfms) || !usfms.length) return;
    cachedContext = null;
    const ctx = findChapterContext();

    const clean = normalizeColorId(color);
    const token = await ensureAuthToken();
    const signedIn = !!(token || isUserSignedIn());
    const pageVid = getCurrentPageVersionId();
    const targetVids = Array.isArray(versionIds) && versionIds.length
      ? Array.from(new Set(versionIds.map(v => parseInt(v, 10)).filter(Boolean)))
      : [pageVid];

    const updateLocalStateAndDom = () => {
      // Only update main chapter React context / DOM if pageVid is among targetVids
      if (targetVids.includes(pageVid)) {
        cachedContext = null;
        const fresh = findChapterContext() || ctx;
        if (fresh) {
          const existing = Array.isArray(fresh.chapterHighlights) ? fresh.chapterHighlights : [];
          const updated = existing.filter(h => !usfms.includes(h.usfm));
          if (clean) {
            usfms.forEach(u => updated.push({ color: clean, usfm: u }));
          }
          if (typeof fresh.setChapterHighlights === 'function') {
            try { fresh.setChapterHighlights(updated); } catch (err) {}
          }
          if (typeof fresh.clearSelectedVerses === 'function') {
            try { fresh.clearSelectedVerses(); } catch (err) {}
          }
        }
        const mainScope = document.querySelector('[class*="_chapter"]:not(#bbe-compare-grid *)') || document.body;
        applyDomHighlightsToScope(mainScope, usfms, clean);
      }
      syncHighlightsNow();
    };

    if (!token) {
      // User is logged out: temporary highlight in DOM
      updateLocalStateAndDom();

      window.dispatchEvent(new CustomEvent('BBE_CMD_HIGHLIGHT_DONE', {
        detail: { reqId, usfms, color: clean, versionIds: targetVids, isTemporary: true, success: true }
      }));

      window.dispatchEvent(new CustomEvent('BBE_AUTH_WARNING', {
        detail: {
          action: 'highlight',
          isTemporary: true,
          usfms,
          color: clean,
          message: 'You are not signed in to Bible.com. This highlight is temporary and will disappear when you reload or navigate away.'
        }
      }));
      return;
    }

    // Optimistically update local DOM, React state, and highlight cache immediately for zero latency
    updateLocalStateAndDom();
    updateHighlightCache(targetVids, usfms, clean);

    try {
      await Promise.all(targetVids.map(vid => saveCloudHighlightForVersion(token, vid, usfms, clean)));
      window.dispatchEvent(new CustomEvent('BBE_CMD_HIGHLIGHT_DONE', {
        detail: { reqId, usfms, color: clean, versionIds: targetVids, isTemporary: false, success: true }
      }));
    } catch (err) {
      invalidateHighlightCache(targetVids, usfms);
      window.dispatchEvent(new CustomEvent('BBE_CMD_HIGHLIGHT_DONE', {
        detail: { reqId, usfms, color: clean, versionIds: targetVids, isTemporary: false, success: false, error: err.message || 'Cloud sync failed' }
      }));
    }
  });

  // Fetch chapter highlights directly from Bible.com cloud for any version_id (with in-memory cache)
  window.addEventListener('BBE_CMD_FETCH_HIGHLIGHTS', async (e) => {
    const { chapterUsfm, versionId, applyToMainDom, reqId, isPrefetch } = e.detail || {};
    if (!chapterUsfm || !versionId) {
      window.dispatchEvent(new CustomEvent('BBE_CMD_FETCH_HIGHLIGHTS_DONE', {
        detail: { reqId, chapterUsfm, versionId, highlights: [], success: false }
      }));
      return;
    }
    // Avoid triggering /api/authenticate during background prefetch if user is not signed in
    if (isPrefetch && !getAuthToken() && !isUserSignedIn()) {
      window.dispatchEvent(new CustomEvent('BBE_CMD_FETCH_HIGHLIGHTS_DONE', {
        detail: { reqId, chapterUsfm, versionId, highlights: [], signedIn: false, success: true }
      }));
      return;
    }
    const token = await ensureAuthToken();
    if (!token) {
      window.dispatchEvent(new CustomEvent('BBE_CMD_FETCH_HIGHLIGHTS_DONE', {
        detail: { reqId, chapterUsfm, versionId, highlights: [], signedIn: false, success: true }
      }));
      return;
    }
    try {
      const highlights = await getCachedCloudHighlights(token, chapterUsfm, versionId);
      if (applyToMainDom) {
        cachedContext = null;
        const fresh = findChapterContext();
        if (fresh && typeof fresh.setChapterHighlights === 'function') {
          try { fresh.setChapterHighlights(highlights); } catch (err) {}
        }
        const mainScope = document.querySelector('[class*="_chapter"]:not(#bbe-compare-grid *)');
        if (mainScope) {
          // Clear any old temp highlight attributes first
          mainScope.querySelectorAll('[data-bbe-temp-hl]').forEach(el => {
            el.style.backgroundColor = '';
            el.removeAttribute('data-bbe-temp-hl');
          });
          highlights.forEach(h => applyDomHighlightsToScope(mainScope, [h.usfm], h.color));
        }
        syncHighlightsNow();
      }
      window.dispatchEvent(new CustomEvent('BBE_CMD_FETCH_HIGHLIGHTS_DONE', {
        detail: { reqId, chapterUsfm, versionId, highlights, signedIn: true, success: true }
      }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('BBE_CMD_FETCH_HIGHLIGHTS_DONE', {
        detail: { reqId, chapterUsfm, versionId, highlights: [], success: false, error: err.message }
      }));
    }
  });

  // Batch save multiple highlights (e.g. copying a map of verse->color to one or more target versionIds)
  window.addEventListener('BBE_CMD_BATCH_HIGHLIGHT', async (e) => {
    const { items, versionIds, reqId } = e.detail || {};
    // items: Array<{ usfms: string[], color: string }>
    if (!Array.isArray(items) || !items.length || !Array.isArray(versionIds) || !versionIds.length) {
      window.dispatchEvent(new CustomEvent('BBE_CMD_BATCH_HIGHLIGHT_DONE', {
        detail: { reqId, success: false, error: 'Missing items or target versions' }
      }));
      return;
    }
    const token = await ensureAuthToken();
    if (!token) {
      window.dispatchEvent(new CustomEvent('BBE_CMD_BATCH_HIGHLIGHT_DONE', {
        detail: { reqId, success: false, isTemporary: true, error: 'Not signed in to Bible.com' }
      }));
      return;
    }
    try {
      const tasks = [];
      for (const vid of versionIds) {
        for (const item of items) {
          const clean = normalizeColorId(item.color);
          if (clean && Array.isArray(item.usfms) && item.usfms.length) {
            tasks.push(saveCloudHighlightForVersion(token, vid, item.usfms, clean));
          }
        }
      }
      await Promise.all(tasks);
      for (const item of items) {
        const clean = normalizeColorId(item.color);
        if (clean && Array.isArray(item.usfms) && item.usfms.length) {
          updateHighlightCache(versionIds, item.usfms, clean);
        }
      }
      window.dispatchEvent(new CustomEvent('BBE_CMD_BATCH_HIGHLIGHT_DONE', {
        detail: { reqId, success: true, isTemporary: false }
      }));
    } catch (err) {
      for (const item of items) {
        if (Array.isArray(item.usfms) && item.usfms.length) {
          invalidateHighlightCache(versionIds, item.usfms);
        }
      }
      window.dispatchEvent(new CustomEvent('BBE_CMD_BATCH_HIGHLIGHT_DONE', {
        detail: { reqId, success: false, error: err.message || 'Batch cloud sync failed' }
      }));
    }
  });

  // Check user auth and details
  window.addEventListener('BBE_CMD_GET_AUTH', async () => {
    const info = getUserInfo();
    if (!info.hasToken) {
      const t = await ensureAuthToken();
      if (t) {
        info.hasToken = true;
        info.signedIn = true;
      }
    }
    window.dispatchEvent(new CustomEvent('BBE_AUTH_INFO', { detail: info }));
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

    const token = await ensureAuthToken();
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
