// Bible.com Enhancer — Options & Popup UI Logic
(async function () {
  const rawStorage = await new Promise(r => {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime?.id && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get(null, (res) => {
          if (chrome.runtime?.lastError) r({});
          else r(res || {});
        });
      } else {
        r({});
      }
    } catch (_) {
      r({});
    }
  });

  if (!rawStorage || rawStorage.schemaVersion !== 3) {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime?.id && chrome.storage && chrome.storage.sync) {
        await new Promise(r => chrome.storage.sync.clear(() => { if (chrome.runtime?.lastError){} r(); }));
      }
    } catch (e) {}
    const fresh = JSON.parse(JSON.stringify(BBE_DEFAULTS));
    fresh.schemaVersion = 3;
    await bbeSave(fresh);
  }

  let S = await bbeLoad();
  const numFields = ["columnWidth", "fontSize", "lineHeight", "historicalSceneDim", "sermonMaxSaved"];

  // Toast Notification helper with crisp currentColor vector icons
  const POPUP_TOAST_ICONS = {
    check: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;"><path d="M20 6 9 17l-5-5"/></svg>',
    reset: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
    info: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };

  let toastTimer = null;
  function showToast(msg = "Setting saved", iconKey = null) {
    const toast = document.getElementById("bbe-toast");
    if (!toast) return;
    const cleanMsg = String(msg || "Setting saved").replace(/^\s*(?:✓|↺|👁)\s*/u, "");
    let key = iconKey;
    if (!key) {
      const lower = cleanMsg.toLowerCase();
      if (lower.includes("reset") || lower.includes("restored to first")) key = "reset";
      else if (lower.includes("distractions hidden")) key = "eyeOff";
      else if (lower.includes("reserved")) key = "info";
      else key = "check";
    }
    const svg = POPUP_TOAST_ICONS[key] || POPUP_TOAST_ICONS.check;
    toast.innerHTML = `${svg}<span></span>`;
    toast.querySelector("span").textContent = cleanMsg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 1800);
  }

  // Update Master Enable Status badge
  function updateMasterEnableStatus(isOn) {
    const statusEl = document.getElementById("master-enable-status");
    if (!statusEl) return;
    statusEl.textContent = isOn ? "Enabled" : "Disabled";
    statusEl.style.color = isOn ? "var(--primary)" : "var(--text-subtle)";
  }

  // Populate checkboxes, text areas, and sliders
  const copyPreviewKeys = new Set(["copyIncludeReference", "copyIncludeVersion", "copyIncludeVerseNumbers", "copyIncludeHeadings"]);
  for (const k of Object.keys(BBE_DEFAULTS)) {
    const el = document.getElementById(k);
    if (!el) continue;

    if (el.type === "checkbox") {
      el.checked = !!S[k];
      if (k === "enabled") updateMasterEnableStatus(el.checked);

      el.addEventListener("change", () => {
        S[k] = el.checked;
        if (k === "enabled") updateMasterEnableStatus(el.checked);
        bbeSave({ [k]: el.checked });
        if (copyPreviewKeys.has(k)) updateCopyPreview();
        showToast(el.checked ? `✓ Enabled: ${k}` : `Disabled: ${k}`);
      });
    } else {
      el.value = S[k] !== undefined ? S[k] : BBE_DEFAULTS[k];
      const valDisplay = document.getElementById(k + "V");
      const updateDisplay = () => {
        if (!valDisplay) return;
        if (k === "columnWidth") valDisplay.textContent = el.value + "px";
        else if (k === "fontSize") valDisplay.textContent = el.value + "%";
        else if (k === "historicalSceneDim") valDisplay.textContent = el.value + "%";
        else if (k === "lineHeight") valDisplay.textContent = el.value;
      };
      updateDisplay();

      const onValChange = () => {
        updateDisplay();
        const val = numFields.includes(k) ? Number(el.value) : el.value;
        S[k] = val;
        if (k === "fontSize" || k === "lineHeight") updateTypographyPreview();
        bbeSave({ [k]: val });
        showToast();
      };
      el.addEventListener("input", onValChange);
      el.addEventListener("change", onValChange);
    }
  }

  /* ---------------- Category Tab Navigation ---------------- */
  let activeCategory = "shortcuts";
  const navItems = document.querySelectorAll(".nav-item[data-category]");
  const sections = document.querySelectorAll(".settings-section[data-section]");
  const validCategories = new Set(Array.from(navItems).map(n => n.dataset.category));

  function setCategory(cat) {
    if (!validCategories.has(cat)) return;
    activeCategory = cat;
    navItems.forEach(item => {
      item.classList.toggle("active", item.dataset.category === cat);
    });
    sections.forEach(sec => {
      sec.style.display = sec.dataset.section === cat ? "block" : "none";
    });
    // Scroll content pane to top
    const pane = document.getElementById("bbe-content-pane");
    if (pane) pane.scrollTop = 0;
  }

  const initialHash = (location.hash || "").replace(/^#/, "");
  if (initialHash && validCategories.has(initialHash)) {
    setCategory(initialHash);
  }
  window.addEventListener("hashchange", () => {
    const h = (location.hash || "").replace(/^#/, "");
    if (h && validCategories.has(h)) setCategory(h);
  });

  navItems.forEach(item => {
    item.addEventListener("click", () => {
      const searchBox = document.getElementById("bbe-settings-search");
      if (searchBox && searchBox.value.trim()) {
        searchBox.value = "";
        resetSearchFilter();
      }
      setCategory(item.dataset.category);
    });
  });

  /* ---------------- Live Search Filter ---------------- */
  const searchInput = document.getElementById("bbe-settings-search");
  const reviewBanner = document.getElementById("popupReviewBanner");
  function resetSearchFilter() {
    if (reviewBanner) reviewBanner.style.display = "";
    sections.forEach(sec => {
      sec.style.display = sec.dataset.section === activeCategory ? "block" : "none";
      sec.querySelectorAll(".card, .setting-row, .slider-card-row").forEach(el => {
        el.style.display = "";
      });
    });
    if (typeof syncHistoricalUI === "function") syncHistoricalUI();
  }

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) {
        resetSearchFilter();
        return;
      }

      if (reviewBanner) {
        const reviewText = reviewBanner.textContent.toLowerCase();
        reviewBanner.style.display = reviewText.includes(q) ? "" : "none";
      }

      // Show all sections during search and filter cards/rows
      sections.forEach(sec => {
        let secHasMatch = false;
        sec.querySelectorAll(".card").forEach(card => {
          let cardHasMatch = false;
          const cardTitle = card.querySelector(".card-title")?.textContent.toLowerCase() || "";
          const extraText = Array.from(card.querySelectorAll(".popup-card-title, .popup-card-desc, .popup-hist-label, .popup-hist-chip span"))
            .map(n => n.textContent.toLowerCase()).join(" ");
          if (cardTitle.includes(q) || extraText.includes(q)) {
            cardHasMatch = true;
          }

          card.querySelectorAll(".setting-row, .slider-card-row").forEach(row => {
            const label = row.querySelector(".setting-label, .slider-header")?.textContent.toLowerCase() || "";
            const hint = row.querySelector(".hint-text")?.textContent.toLowerCase() || "";
            if (label.includes(q) || hint.includes(q) || cardTitle.includes(q)) {
              row.style.display = "";
              cardHasMatch = true;
            } else {
              row.style.display = "none";
            }
          });

          if (cardHasMatch) {
            card.style.display = "";
            secHasMatch = true;
          } else {
            card.style.display = "none";
          }
        });

        sec.style.display = secHasMatch ? "block" : "none";
      });
    });
  }

  /* ---------------- Reset All Defaults ---------------- */
  const resetBtn = document.getElementById("bbe-reset-defaults-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to reset all Deep Bible settings to their original first-install defaults?")) {
        return;
      }
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
      showToast("↺ All defaults restored to first install!");
      setTimeout(() => location.reload(), 600);
    });
  }

  /* ---------------- Restore Toolbar Quick Pills ---------------- */
  const restorePillsBtn = document.getElementById("popup-restore-toolbar-pills-btn");
  if (restorePillsBtn) {
    restorePillsBtn.addEventListener("click", async () => {
      S.showAaMenu = true;
      const aaEl = document.getElementById("showAaMenu");
      if (aaEl) aaEl.checked = true;
      await bbeSave({ showAaMenu: true });
      showToast("✓ Restored Aa Reader Menu to toolbar!");
    });
  }

  /* ---------------- Single-Key Shortcuts Editor ---------------- */
  let activeRecordingKey = null;

  function renderShortcutsList() {
    const list = document.getElementById("shortcutsList");
    if (!list) return;
    list.innerHTML = "";

    const allVers = bbeGetAllVersions(S.userTranslations);
    const shortcuts = { ...(S.customShortcuts || BBE_KEY_MAP) };

    for (const key of Object.keys(allVers)) {
      const v = allVers[key];
      const hint = bbeGetKeyHintForVersion(key, shortcuts);

      const row = document.createElement("div");
      row.className = "shortcut-row";

      const left = document.createElement("div");
      left.style.cssText = "display:flex;flex-direction:column;min-width:0;overflow:hidden;";
      left.innerHTML = `
        <span style="font-weight:700;font-size:12px;">${key}</span>
        <span style="font-size:10.5px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${v.name}">${v.name}</span>
      `;

      const right = document.createElement("div");
      right.style.cssText = "display:flex;align-items:center;gap:4px;flex-shrink:0;";

      const keyBox = document.createElement("button");
      keyBox.type = "button";
      keyBox.className = "key-box" + (hint ? "" : " empty");
      keyBox.textContent = hint || "+";
      keyBox.title = hint ? `Shortcut: [${hint.toUpperCase()}]. Click to reassign.` : "Click to assign single-key shortcut";

      keyBox.addEventListener("click", (e) => {
        e.stopPropagation();
        if (activeRecordingKey === key) {
          activeRecordingKey = null;
          keyBox.classList.remove("recording");
          keyBox.textContent = hint || "+";
        } else {
          list.querySelectorAll(".key-box.recording").forEach(b => {
            b.classList.remove("recording");
            b.textContent = b.dataset.key || "+";
          });
          activeRecordingKey = key;
          keyBox.classList.add("recording");
          keyBox.textContent = "...";
          keyBox.dataset.key = hint || "";
        }
      });

      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "clear-btn";
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
        showToast(`Cleared shortcut for ${key}`);
        renderShortcutsList();
      });

      right.appendChild(keyBox);
      if (hint) right.appendChild(clearBtn);

      row.appendChild(left);
      row.appendChild(right);
      list.appendChild(row);
    }
  }

  // Global key listener for recording single key shortcuts in popup
  window.addEventListener("keydown", async (e) => {
    if (!activeRecordingKey) return;
    e.preventDefault();
    e.stopPropagation();

    const versionKey = activeRecordingKey;
    activeRecordingKey = null;

    if (e.key === "Escape") {
      renderShortcutsList();
      return;
    }

    if (e.key === "Backspace" || e.key === "Delete") {
      const updated = { ...(S.customShortcuts || BBE_KEY_MAP) };
      for (const [k, mapped] of Object.entries(updated)) {
        if (mapped === versionKey) delete updated[k];
      }
      S.customShortcuts = updated;
      await bbeSave({ customShortcuts: updated });
      showToast(`Cleared shortcut for ${versionKey}`);
      renderShortcutsList();
      return;
    }

    const rawKey = /^[a-zA-Z0-9]$/.test(e.key)
      ? e.key
      : (/^(?:Key[A-Z]|Digit[0-9])$/.test(e.code || "") ? e.code.slice(-1) : "");
    if (rawKey) {
      const assignedKey = rawKey.toLowerCase();
      if (typeof BBE_RESERVED_STUDY_KEYS !== "undefined" && BBE_RESERVED_STUDY_KEYS[assignedKey]) {
        showToast(`Key [${assignedKey.toUpperCase()}] is reserved for ${BBE_RESERVED_STUDY_KEYS[assignedKey]}`);
        renderShortcutsList();
        return;
      }
      const updated = { ...(S.customShortcuts || BBE_KEY_MAP) };

      // Clear any prior mapping for this version
      for (const [k, mapped] of Object.entries(updated)) {
        if (mapped === versionKey) delete updated[k];
      }

      updated[assignedKey] = versionKey;
      S.customShortcuts = updated;
      await bbeSave({ customShortcuts: updated });
      showToast(`Assigned [${assignedKey.toUpperCase()}] to ${versionKey}`);
      renderShortcutsList();
    }
  });

  /* ---------------- Custom Translations Management ---------------- */
  function renderCustomTransList() {
    const wrap = document.getElementById("popupCustomTransListWrap");
    const container = document.getElementById("popupCustomTransList");
    if (!wrap || !container) return;

    container.innerHTML = "";
    const userTrans = S.userTranslations || {};
    const keys = Object.keys(userTrans);

    if (keys.length === 0) {
      wrap.style.display = "none";
      return;
    }

    wrap.style.display = "block";
    for (const uk of keys) {
      const item = document.createElement("div");
      item.style.cssText = "display:flex;align-items:center;justify-content:space-between;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-size:12px;";
      item.innerHTML = `
        <span><b>${uk}</b>: ${userTrans[uk].name} (ID: ${userTrans[uk].id})</span>
        <button type="button" class="clear-btn" title="Remove custom translation">✕</button>
      `;

      item.querySelector("button").addEventListener("click", async () => {
        delete userTrans[uk];
        const updatedShortcuts = { ...(S.customShortcuts || BBE_KEY_MAP) };
        for (const [k, mapped] of Object.entries(updatedShortcuts)) {
          if (mapped === uk) delete updatedShortcuts[k];
        }
        const updatedToolbar = (S.toolbarVersions || []).filter(v => v !== uk);
        const updatedCompare = (S.compareVersions || []).filter(v => v !== uk);
        const updatedCompareBar = (S.compareBarVersions || BBE_ENGLISH_VERSIONS).filter(v => v !== uk);

        S.userTranslations = userTrans;
        S.customShortcuts = updatedShortcuts;
        S.toolbarVersions = updatedToolbar;
        S.compareVersions = updatedCompare;
        S.compareBarVersions = updatedCompareBar;

        await bbeSave({
          userTranslations: userTrans,
          customShortcuts: updatedShortcuts,
          toolbarVersions: updatedToolbar,
          compareVersions: updatedCompare,
          compareBarVersions: updatedCompareBar
        });

        showToast(`Removed ${uk}`);
        renderAll();
      });

      container.appendChild(item);
    }
  }

  // Add custom translation button & auto-detect
  const addBtn = document.getElementById("popupAddBtn");
  const smartInput = document.getElementById("popupAddSmart");
  const previewBox = document.getElementById("popupAddPreview");
  const previewCode = document.getElementById("popupAddPreviewCode");
  const previewName = document.getElementById("popupAddPreviewName");
  const keyInput = document.getElementById("popupAddKey");
  const feedback = document.getElementById("popupAddFeedback");

  let autoFillTimer = null;
  let detectSeq = 0;
  let detectedTranslation = null;

  const setFeedback = (msg, color = "var(--text-muted)") => {
    if (!feedback) return;
    feedback.style.color = color;
    feedback.textContent = msg || "";
  };

  const setPreview = (resolved) => {
    if (!previewBox) return;
    if (resolved && resolved.short) {
      if (previewCode) previewCode.textContent = resolved.short;
      if (previewName) previewName.textContent = resolved.name || resolved.short;
      previewBox.style.display = "flex";
    } else {
      if (previewCode) previewCode.textContent = "";
      if (previewName) previewName.textContent = "";
      previewBox.style.display = "none";
    }
  };

  const triggerAutoDetect = (sourceVal) => {
    clearTimeout(autoFillTimer);
    detectedTranslation = null;
    setPreview(null);
    const val = (sourceVal || "").trim();
    if (!val) {
      detectSeq += 1;
      setFeedback("");
      return;
    }

    const delayMs = /^\d+$/.test(val) ? 450 : 220;
    autoFillTimer = setTimeout(async () => {
      const seq = ++detectSeq;
      try {
        const resolved = await bbeResolveTranslation(val);
        if (seq !== detectSeq) return;

        if (resolved) {
          detectedTranslation = resolved;
          setPreview(resolved);

          const builtIn = BBE_VERSIONS[resolved.short];
          if (builtIn && builtIn.id === resolved.id) {
            setFeedback(`${resolved.short} (${builtIn.name}) is already built in — clicking Add will enable it on your toolbar.`, "var(--primary)");
          } else {
            setFeedback(`Ready to add: ${resolved.name} (${resolved.short})`, "var(--primary)");
          }
        }
      } catch (err) {
        if (seq !== detectSeq) return;
        setPreview(null);
        setFeedback(err?.message || "Paste a Bible.com URL in that translation.", "#b45309");
      }
    }, delayMs);
  };

  if (smartInput) {
    smartInput.addEventListener("input", () => triggerAutoDetect(smartInput.value));
    smartInput.addEventListener("paste", () => setTimeout(() => triggerAutoDetect(smartInput.value), 30));
  }
  if (keyInput) {
    keyInput.addEventListener("keydown", (e) => {
      if (!/^[a-zA-Z0-9]$/.test(e.key) && /^(?:Key[A-Z]|Digit[0-9])$/.test(e.code || "") && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        keyInput.value = e.code.slice(-1).toUpperCase();
        keyInput.dispatchEvent(new Event("input"));
      }
    });
    keyInput.addEventListener("input", () => {
      const k = keyInput.value.trim().toLowerCase();
      if (!k) return;
      keyInput.value = k.toUpperCase();
      if (typeof BBE_RESERVED_STUDY_KEYS !== "undefined" && BBE_RESERVED_STUDY_KEYS[k]) {
        setFeedback(`Key [${k.toUpperCase()}] is reserved for ${BBE_RESERVED_STUDY_KEYS[k]}. Choose another key.`, "#dc2626");
      } else if (!/^[a-z0-9]$/.test(k)) {
        setFeedback("Hotkey must be a single letter or number (A-Z, 0-9).", "#dc2626");
      } else {
        const existingMap = bbeGetKeyMap(S.customShortcuts);
        if (existingMap[k]) {
          setFeedback(`Key [${k.toUpperCase()}] is currently assigned to ${existingMap[k]} and will be reassigned.`, "#b45309");
        }
      }
    });
  }

  [smartInput, keyInput].forEach(inp => {
    if (!inp) return;
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (addBtn) addBtn.click();
      }
    });
  });

  if (addBtn) {
    addBtn.addEventListener("click", async () => {
      clearTimeout(autoFillTimer);
      detectSeq += 1;

      const smartVal = smartInput ? smartInput.value.trim() : "";
      const rawKey = keyInput ? keyInput.value.trim().toLowerCase() : "";

      setFeedback("Looking up translation details...", "var(--text-muted)");

      try {
        if (!smartVal && !detectedTranslation) {
          throw new Error("Type a translation name/code (e.g. GNV, JUB) or paste a Bible.com URL in that translation.");
        }
        const resolved = smartVal ? await bbeResolveTranslation(smartVal) : detectedTranslation;

        const finalAbbr = resolved.short.toUpperCase();
        const finalId = resolved.id;
        const finalName = resolved.name || finalAbbr;
        const finalKey = rawKey || resolved.shortcut || "";

        if (finalKey) {
          if (typeof BBE_RESERVED_STUDY_KEYS !== "undefined" && BBE_RESERVED_STUDY_KEYS[finalKey]) {
            throw new Error(`Key [${finalKey.toUpperCase()}] is reserved for ${BBE_RESERVED_STUDY_KEYS[finalKey]}. Please choose another shortcut key.`);
          }
          if (!/^[a-z0-9]$/.test(finalKey)) {
            throw new Error("Hotkey must be a single letter or number (A-Z, 0-9).");
          }
        }

        const updatedUserTrans = { ...(S.userTranslations || {}) };
        const builtInMatch = BBE_VERSIONS[finalAbbr];
        const isExistingBuiltIn = !!(builtInMatch && builtInMatch.id === finalId);

        if (!isExistingBuiltIn) {
          updatedUserTrans[finalAbbr] = {
            id: finalId,
            name: finalName,
            short: finalAbbr
          };
        }

        const updatedShortcuts = { ...(S.customShortcuts || BBE_KEY_MAP) };
        if (finalKey && /^[a-z0-9]$/.test(finalKey)) {
          for (const [k, mapped] of Object.entries(updatedShortcuts)) {
            if (mapped === finalAbbr) delete updatedShortcuts[k];
          }
          updatedShortcuts[finalKey] = finalAbbr;
        }

        const updatedToolbar = Array.from(new Set([...(S.toolbarVersions || []), finalAbbr]));
        const updatedCompareBar = Array.from(new Set([...(S.compareBarVersions || BBE_ENGLISH_VERSIONS), finalAbbr]));

        S.userTranslations = updatedUserTrans;
        S.customShortcuts = updatedShortcuts;
        S.toolbarVersions = updatedToolbar;
        S.compareBarVersions = updatedCompareBar;

        await bbeSave({
          userTranslations: updatedUserTrans,
          customShortcuts: updatedShortcuts,
          toolbarVersions: updatedToolbar,
          compareBarVersions: updatedCompareBar
        });

        const msg = isExistingBuiltIn
          ? `✓ ${finalAbbr} (${builtInMatch.name}) is built in — enabled on your toolbar!`
          : `✓ Added ${finalAbbr} (${finalName})!`;
        setFeedback(msg, "#16a34a");
        showToast(isExistingBuiltIn ? `✓ Enabled ${finalAbbr}!` : `✓ Added ${finalAbbr}!`);

        detectedTranslation = null;
        setPreview(null);
        if (smartInput) smartInput.value = "";
        if (keyInput) keyInput.value = "";

        renderAll();
      } catch (err) {
        setFeedback(err.message || "Failed to resolve translation.", "#dc2626");
      }
    });
  }

  /* ---------------- Grouped Version Pill Selector Helper ---------------- */
  function renderGroupedVersionPills(container, selectedKeys, onUpdate) {
    if (!container) return;
    const prevDetails = container.querySelector(".version-lang-details");
    const wasOtherOpen = !!(prevDetails && prevDetails.open);
    container.innerHTML = "";

    const allVers = bbeGetAllVersions(S.userTranslations);
    const selectedSet = new Set(selectedKeys);
    const groups = bbeGroupVersions(allVers, S.userTranslations);

    const buildGrid = (keys) => {
      const wrap = document.createElement("div");
      wrap.className = "version-pills";
      for (const key of keys) {
        const v = allVers[key];
        if (!v) continue;
        const pill = document.createElement("div");
        const isSel = selectedSet.has(key);
        pill.className = "v-pill" + (isSel ? " active" : "");
        pill.textContent = (isSel ? "✓ " : "") + key;
        pill.title = v.name;

        pill.addEventListener("click", async () => {
          if (selectedSet.has(key)) {
            if (selectedSet.size > 1) {
              selectedSet.delete(key);
            }
          } else {
            selectedSet.add(key);
          }
          const ordered = Object.keys(allVers).filter(k => selectedSet.has(k));
          await onUpdate(ordered);
        });

        wrap.appendChild(pill);
      }
      return wrap;
    };

    if (groups.english.length > 0) {
      const lbl = document.createElement("div");
      lbl.className = "version-group-label";
      lbl.textContent = "English";
      container.appendChild(lbl);
      container.appendChild(buildGrid(groups.english));
    }

    if (groups.custom.length > 0) {
      const lbl = document.createElement("div");
      lbl.className = "version-group-label";
      lbl.textContent = "Custom";
      container.appendChild(lbl);
      container.appendChild(buildGrid(groups.custom));
    }

    if (groups.other.length > 0) {
      const otherSelectedCount = groups.other.filter(k => selectedSet.has(k)).length;
      const details = document.createElement("details");
      details.className = "version-lang-details";
      if (wasOtherOpen || otherSelectedCount > 0) {
        details.open = true;
      }
      const summary = document.createElement("summary");
      summary.className = "version-lang-summary";
      summary.textContent = otherSelectedCount > 0
        ? `Other Languages (${otherSelectedCount}/${groups.other.length})`
        : `Other Languages (${groups.other.length})`;
      details.appendChild(summary);
      details.appendChild(buildGrid(groups.other));
      container.appendChild(details);
    }
  }

  /* ---------------- Top Pill Toolbar Buttons Selector ---------------- */
  function renderToolbarPills() {
    const toolbarPillsContainer = document.getElementById("toolbarVersionPills");
    if (!toolbarPillsContainer) return;
    const selected = (Array.isArray(S.toolbarVersions) && S.toolbarVersions.length > 0)
      ? S.toolbarVersions
      : ["ESV", "NIV", "NASB", "NLT", "BSB", "NKJV", "KJV"];

    renderGroupedVersionPills(toolbarPillsContainer, selected, async (ordered) => {
      S.toolbarVersions = ordered;
      await bbeSave({ toolbarVersions: ordered });
      showToast("Top pill versions updated");
      renderToolbarPills();
      renderCompareBarPills();
    });
  }

  /* ---------------- Compare Sub-Bar Buttons Selector ---------------- */
  function renderCompareBarPills() {
    const container = document.getElementById("compareBarVersionPills");
    if (!container) return;

    const allVers = bbeGetAllVersions(S.userTranslations);
    const allKeys = Object.keys(allVers);
    const englishKeys = BBE_ENGLISH_VERSIONS.filter(k => allVers[k]);
    const topKeys = (Array.isArray(S.toolbarVersions) && S.toolbarVersions.length > 0)
      ? S.toolbarVersions.filter(k => allVers[k])
      : ["ESV", "NIV", "NASB", "NLT", "BSB", "NKJV", "KJV"];
    const selected = (Array.isArray(S.compareBarVersions) && S.compareBarVersions.length > 0)
      ? S.compareBarVersions.filter(k => allVers[k])
      : englishKeys;

    const sameKeys = (a, b) => a.length === b.length && a.every((k, i) => k === b[i]);

    const engBtn = document.getElementById("compareBarPresetEnglish");
    const topBtn = document.getElementById("compareBarPresetMatchTop");
    const allBtn = document.getElementById("compareBarPresetAll");

    if (engBtn) {
      engBtn.classList.toggle("active", sameKeys(selected, englishKeys));
      engBtn.onclick = async () => {
        S.compareBarVersions = [...englishKeys];
        await bbeSave({ compareBarVersions: S.compareBarVersions });
        showToast("Compare bar set to English translations");
        renderCompareBarPills();
      };
    }
    if (topBtn) {
      topBtn.classList.toggle("active", sameKeys(selected, topKeys));
      topBtn.onclick = async () => {
        S.compareBarVersions = [...topKeys];
        await bbeSave({ compareBarVersions: S.compareBarVersions });
        showToast("Compare bar matched to top pill");
        renderCompareBarPills();
      };
    }
    if (allBtn) {
      allBtn.classList.toggle("active", sameKeys(selected, allKeys));
      allBtn.onclick = async () => {
        S.compareBarVersions = [...allKeys];
        await bbeSave({ compareBarVersions: S.compareBarVersions });
        showToast("Compare bar set to all translations");
        renderCompareBarPills();
      };
    }

    renderGroupedVersionPills(container, selected, async (ordered) => {
      S.compareBarVersions = ordered;
      await bbeSave({ compareBarVersions: ordered });
      showToast("Compare bar versions updated");
      renderCompareBarPills();
    });
  }

  /* ---------------- Commentary Sources & Display Order ---------------- */
  const popupCommFilter = document.getElementById("popupCommFilter");
  const popupCommResetBtn = document.getElementById("popupCommResetBtn");
  const popupCommList = document.getElementById("popupCommentaryList");

  function renderCommentarySourcesList() {
    if (!popupCommList || typeof bbeGetOrderedCommentarySources !== "function") return;
    const q = (popupCommFilter ? popupCommFilter.value : "").trim().toLowerCase();
    const ordered = bbeGetOrderedCommentarySources(S);
    popupCommList.replaceChildren();

    let visibleRank = 0;
    ordered.forEach((src, idx) => {
      if (src.enabled) visibleRank += 1;
      if (q && !src.label.toLowerCase().includes(q) && !src.desc.toLowerCase().includes(q)) return;

      const row = document.createElement("div");
      row.style.cssText = `display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);opacity:${src.enabled ? "1" : "0.55"};`;

      const rank = document.createElement("span");
      rank.style.cssText = "min-width:30px;text-align:center;font-size:11px;font-weight:700;padding:2px 6px;border-radius:999px;background:var(--card-bg);border:1px solid var(--border);color:var(--text-muted);";
      rank.textContent = src.enabled ? `#${visibleRank}` : "Off";

      const info = document.createElement("div");
      info.style.cssText = "flex:1;min-width:0;";
      const titleLine = document.createElement("div");
      titleLine.style.cssText = "font-size:12.5px;font-weight:700;display:flex;align-items:center;gap:6px;flex-wrap:wrap;";
      titleLine.textContent = src.label;
      const badge = document.createElement("span");
      badge.style.cssText = src.group === "modern"
        ? "font-size:10px;font-weight:700;padding:1px 6px;border-radius:999px;background:rgba(37,99,235,0.12);color:#2563eb;"
        : "font-size:10px;font-weight:700;padding:1px 6px;border-radius:999px;background:rgba(100,116,139,0.14);color:var(--text-muted);";
      badge.textContent = src.group === "modern" ? "Modern" : "BibleHub";
      titleLine.appendChild(badge);

      const desc = document.createElement("div");
      desc.style.cssText = "font-size:11px;color:var(--text-muted);margin-top:2px;";
      desc.textContent = src.desc;
      info.appendChild(titleLine);
      info.appendChild(desc);

      const controls = document.createElement("div");
      controls.style.cssText = "display:flex;align-items:center;gap:4px;flex-shrink:0;";

      const makeBtn = (label, title, action, disabled) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.title = title;
        b.disabled = disabled;
        b.style.cssText = `padding:3px 7px;font-size:11px;font-weight:600;border-radius:5px;border:1px solid var(--border);background:var(--card-bg);color:var(--text);cursor:${disabled ? "default" : "pointer"};opacity:${disabled ? "0.4" : "1"};`;
        b.addEventListener("click", async () => {
          const patch = bbeBuildCommentaryOrderPatch(action, src.key, S);
          Object.assign(S, patch);
          await bbeSave(patch);
          renderCommentarySourcesList();
          showToast(action === "top" ? `Pinned ${src.short} to top` : "Updated commentary order");
        });
        return b;
      };

      controls.appendChild(makeBtn("Top", "Move to #1 (display first)", "top", idx === 0));
      controls.appendChild(makeBtn("↑", "Move up", "up", idx === 0));
      controls.appendChild(makeBtn("↓", "Move down", "down", idx === ordered.length - 1));

      const switchLabel = document.createElement("label");
      switchLabel.className = "switch";
      switchLabel.style.marginLeft = "4px";
      switchLabel.title = src.enabled ? `Hide ${src.label}` : `Show ${src.label}`;
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = src.enabled;
      cb.addEventListener("change", async () => {
        const patch = bbeBuildCommentaryTogglePatch(src.key, cb.checked, S);
        Object.assign(S, patch);
        await bbeSave(patch);
        renderCommentarySourcesList();
        showToast(cb.checked ? `Showing ${src.short}` : `Hidden ${src.short}`);
      });
      const slider = document.createElement("span");
      slider.className = "slider";
      switchLabel.appendChild(cb);
      switchLabel.appendChild(slider);
      controls.appendChild(switchLabel);

      row.appendChild(rank);
      row.appendChild(info);
      row.appendChild(controls);
      popupCommList.appendChild(row);
    });
  }

  if (popupCommFilter) popupCommFilter.addEventListener("input", renderCommentarySourcesList);
  if (popupCommResetBtn) {
    popupCommResetBtn.addEventListener("click", async () => {
      const patch = bbeBuildCommentaryOrderPatch("reset", null, S);
      Object.assign(S, patch);
      await bbeSave(patch);
      if (popupCommFilter) popupCommFilter.value = "";
      renderCommentarySourcesList();
      showToast("↺ Commentary order & visibility reset");
    });
  }
  renderCommentarySourcesList();

  // Handle Welcome Guide links
  document.querySelectorAll('a[href*="welcome.html"]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const welcomeUrl = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
        ? chrome.runtime.getURL('welcome/welcome.html')
        : 'welcome/welcome.html';
      if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
        chrome.tabs.create({ url: welcomeUrl });
      } else {
        window.open(welcomeUrl, '_blank');
      }
    });
  });

  // Handle Feedback Form links
  const FEEDBACK_FORM_URL = 'https://forms.gle/FN8w2g7MakzTS9GZ9';
  document.querySelectorAll('a[href*="forms.gle"]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
        chrome.tabs.create({ url: FEEDBACK_FORM_URL });
      } else {
        window.open(FEEDBACK_FORM_URL, '_blank', 'noopener,noreferrer');
      }
    });
  });

  /* ---------------- Theme, Historical, Typography & Width Pickers ---------------- */
  const typoPreviewEl = document.getElementById("popupTypographyPreview");
  const histCardEl = document.getElementById("popupHistOptionsCard");
  const THEME_PREVIEW_STYLES = {
    sepia: { bg: "#fbf0d9", color: "#2c2825", border: "#dfceab" },
    light: { bg: "#ffffff", color: "#121212", border: "#cbd5e1" },
    dark: { bg: "#181a20", color: "#e2e8f0", border: "#2f3545" },
    oled: { bg: "#000000", color: "#e0e0e0", border: "#282828" },
    blue: { bg: "#0b1329", color: "#d8e2fd", border: "#1e3056" },
    green: { bg: "#f0f5ee", color: "#1f2e23", border: "#bfd5c2" },
    historical: { bg: "#e6cf9f", color: "#2b1d10", border: "#b99a62" }
  };
  const FONT_PREVIEW_STACKS = {
    serif: '"Merriweather", Georgia, Garamond, serif',
    sans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono: 'ui-monospace, "SF Mono", Consolas, monospace',
    dyslexic: '"OpenDyslexic", "Lexend", "Verdana", sans-serif'
  };

  function updateTypographyPreview() {
    if (!typoPreviewEl) return;
    const f = S.fontFamily || "serif";
    const t = S.readerTheme || "system";
    typoPreviewEl.style.fontFamily = FONT_PREVIEW_STACKS[f] || FONT_PREVIEW_STACKS.serif;
    typoPreviewEl.style.fontSize = Math.round(((S.fontSize || 100) / 100) * 14) + "px";
    typoPreviewEl.style.lineHeight = String(S.lineHeight || 1.8);
    typoPreviewEl.style.letterSpacing = f === "dyslexic" ? "0.025em" : "";
    typoPreviewEl.style.wordSpacing = f === "dyslexic" ? "0.06em" : "";
    const th = THEME_PREVIEW_STYLES[t];
    if (th) {
      typoPreviewEl.style.background = th.bg;
      typoPreviewEl.style.color = th.color;
      typoPreviewEl.style.borderColor = th.border;
    } else {
      typoPreviewEl.style.background = "";
      typoPreviewEl.style.color = "";
      typoPreviewEl.style.borderColor = "";
    }
  }

  let histThumbnailsPainted = false;
  function syncHistoricalUI() {
    const isHist = (S.readerTheme || "system") === "historical";
    if (histCardEl) histCardEl.style.display = isHist ? "" : "none";
    if (!isHist || !histCardEl) return;

    const activeValues = {
      historicalScene: S.historicalScene || "olive",
      historicalParchment: S.historicalParchment || "scroll",
      historicalInk: S.historicalInk || "iron"
    };
    histCardEl.querySelectorAll(".popup-hist-picker").forEach(group => {
      const key = group.dataset.hist;
      group.querySelectorAll(".popup-hist-chip").forEach(chip => {
        chip.classList.toggle("active", chip.dataset.value === activeValues[key]);
      });
    });

    if (!histThumbnailsPainted && window.BBE_HIST) {
      histThumbnailsPainted = true;
      const paintChip = (group, kind, value) => {
        window.BBE_HIST.load(kind, value).then(a => {
          const live = histCardEl.querySelector(`.popup-hist-picker[data-hist="${group}"] .popup-hist-chip[data-value="${value}"]`);
          if (!live) return;
          if (kind === "parchment") live.style.backgroundColor = a.base;
          const cv = live.querySelector("canvas.popup-hist-chip-canvas");
          const src = a.thumbCanvas || a.canvas;
          if (cv && src) cv.getContext("2d").drawImage(src, 0, 0, cv.width, cv.height);
        });
      };
      histCardEl.querySelectorAll('.popup-hist-picker[data-hist="historicalScene"] .popup-hist-chip').forEach(c => paintChip("historicalScene", "scene", c.dataset.value));
      histCardEl.querySelectorAll('.popup-hist-picker[data-hist="historicalParchment"] .popup-hist-chip').forEach(c => paintChip("historicalParchment", "parchment", c.dataset.value));
    }
  }

  // Theme cards grid
  const themeCards = document.querySelectorAll("#popupThemeGrid .popup-theme-card");
  themeCards.forEach(card => {
    card.classList.toggle("active", card.dataset.theme === (S.readerTheme || "system"));
    card.addEventListener("click", async () => {
      const theme = card.dataset.theme;
      S.readerTheme = theme;
      themeCards.forEach(c => c.classList.toggle("active", c.dataset.theme === theme));
      syncHistoricalUI();
      updateTypographyPreview();
      await bbeSave({ readerTheme: theme });
      showToast("✓ Reading theme updated");
    });
  });

  // Historical artwork chips
  if (histCardEl) {
    histCardEl.querySelectorAll(".popup-hist-picker").forEach(group => {
      group.querySelectorAll(".popup-hist-chip").forEach(chip => {
        chip.addEventListener("click", async () => {
          const key = group.dataset.hist;
          const val = chip.dataset.value;
          S[key] = val;
          group.querySelectorAll(".popup-hist-chip").forEach(c => c.classList.toggle("active", c === chip));
          await bbeSave({ [key]: val });
          showToast("✓ Historical style updated");
        });
      });
    });
  }
  syncHistoricalUI();

  // Font cards grid
  const fontCards = document.querySelectorAll("#popupFontGrid .popup-font-card");
  fontCards.forEach(card => {
    card.classList.toggle("active", card.dataset.font === (S.fontFamily || "serif"));
    card.addEventListener("click", async () => {
      const font = card.dataset.font;
      S.fontFamily = font;
      fontCards.forEach(c => c.classList.toggle("active", c.dataset.font === font));
      updateTypographyPreview();
      await bbeSave({ fontFamily: font });
      showToast("✓ Typography updated");
    });
  });
  updateTypographyPreview();

  // Column Width preset buttons
  document.querySelectorAll("[data-width-preset]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const val = Number(btn.dataset.widthPreset);
      S.columnWidth = val;
      const slider = document.getElementById("columnWidth");
      const valEl = document.getElementById("columnWidthV");
      if (slider) slider.value = val;
      if (valEl) valEl.textContent = val + "px";
      await bbeSave({ columnWidth: val });
      showToast(`✓ Column width set to ${val}px`);
    });
  });

  /* ---------------- Live Smart Copy Preview ---------------- */
  function updateCopyPreview() {
    const outEl = document.getElementById("popupCopyPreviewText");
    const verRow = document.getElementById("popupCopyVerRow");
    const verEl = document.getElementById("copyIncludeVersion");
    const incRef = S.copyIncludeReference === true;
    if (verEl) verEl.disabled = !incRef;
    if (verRow) verRow.style.opacity = incRef ? "1" : "0.5";
    if (!outEl) return;

    let sample = "";
    if (S.copyIncludeHeadings === true) sample += "[God’s Sovereign Choice]\n";
    if (S.copyIncludeVerseNumbers === true) sample += "1 ";
    sample += "I am speaking the truth in Christ—I am not lying; my conscience bears me witness in the Holy Spirit—";
    if (incRef) {
      sample += (S.copyIncludeVersion === true) ? " — Romans 9:1 (ESV)" : " — Romans 9:1";
    }
    outEl.textContent = sample;
  }
  updateCopyPreview();

  /* ---------------- Distraction-Free Quick Batch Buttons ---------------- */
  const hideAllBtn = document.getElementById("popupHideAllBtn");
  const showAllBtn = document.getElementById("popupShowAllBtn");
  if (hideAllBtn) {
    hideAllBtn.addEventListener("click", async () => {
      const patch = {
        hideHeader: true, hideSidebar: true, hideDistractionCards: true,
        hideFooter: true, hideBottomBar: true, hideCopyright: true
      };
      Object.assign(S, patch);
      Object.keys(patch).forEach(k => {
        const chk = document.getElementById(k);
        if (chk) chk.checked = true;
      });
      await bbeSave(patch);
      showToast("All site distractions hidden", "eyeOff");
    });
  }
  if (showAllBtn) {
    showAllBtn.addEventListener("click", async () => {
      const patch = {
        hideHeader: false, hideSidebar: false, hideDistractionCards: false,
        hideFooter: false, hideBottomBar: false, hideCopyright: false,
        hideFootnotes: false, hideHeadings: false, hideVerseNumbers: false, hideSwitcher: false
      };
      Object.assign(S, patch);
      Object.keys(patch).forEach(k => {
        const chk = document.getElementById(k);
        if (chk) chk.checked = false;
      });
      await bbeSave(patch);
      showToast("✓ All website elements restored");
    });
  }

  /* ---------------- Default Quick Highlight Color Swatches ---------------- */
  const hlSwatches = document.querySelectorAll("#popupHlSwatches .popup-hl-swatch");
  const hlNameEl = document.getElementById("popupHlColorName");
  const HL_COLOR_NAMES = {
    fffe00: "Yellow",
    "5dff79": "Green",
    "00d6ff": "Blue",
    ffc66f: "Orange",
    ff95ef: "Pink"
  };

  function syncHighlightSwatches() {
    const activeColor = S.defaultHighlightColor || "fffe00";
    hlSwatches.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.hlColor === activeColor);
    });
    if (hlNameEl) {
      hlNameEl.textContent = HL_COLOR_NAMES[activeColor] || "Yellow";
    }
  }

  hlSwatches.forEach(btn => {
    btn.addEventListener("click", async () => {
      const color = btn.dataset.hlColor;
      S.defaultHighlightColor = color;
      syncHighlightSwatches();
      await bbeSave({ defaultHighlightColor: color });
      showToast(`Quick Highlight color: ${HL_COLOR_NAMES[color] || color}`);
    });
  });
  syncHighlightSwatches();

  /* ---------------- Saved Sermon Markups (x/5) List in Settings ---------------- */
  function renderSermonSavedList() {
    const listEl = document.getElementById("popupSermonSavedList");
    const headerEl = document.getElementById("popupSermonSavedHeader");
    if (!listEl) return;

    const renderMap = (chaptersObj) => {
      const sorted = Object.values(chaptersObj || {}).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      const maxSlots = Number(S.sermonMaxSaved) || 5;
      if (headerEl) headerEl.textContent = `Saved Sermon Markups (${sorted.length}/${maxSlots})`;

      if (sorted.length === 0) {
        listEl.innerHTML = `<div class="hint-text" style="padding:6px 0;">No saved Sermon Mode markups yet. Click <b>Sermon</b> on Bible.com to mark up a chapter.</div>`;
        return;
      }

      listEl.innerHTML = "";
      for (const ch of sorted) {
        const count = Array.isArray(ch.items) ? ch.items.length : 0;
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-subtle, rgba(148,163,184,0.08));";

        const infoLink = document.createElement("a");
        infoLink.href = `https://www.bible.com/bible/${ch.versionId || 59}/${ch.book}.${ch.chapter}.${ch.version}`;
        infoLink.target = "_blank";
        infoLink.rel = "noopener";
        infoLink.style.cssText = "font-size:12.5px;font-weight:600;color:var(--text);text-decoration:none;flex:1;";
        infoLink.textContent = `${ch.bookTitle} ${ch.chapter} (${ch.version}) — ${count} mark${count === 1 ? "" : "s"}`;
        infoLink.title = "Open chapter on Bible.com";

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "clear-btn";
        delBtn.textContent = "✕";
        delBtn.title = "Delete saved markup";
        delBtn.addEventListener("click", () => {
          delete chaptersObj[ch.key];
          if (typeof chrome !== "undefined" && chrome.runtime?.id && chrome.storage?.local) {
            chrome.storage.local.set({ bbe_sermon_saved_v1: { chapters: chaptersObj } }, () => {
              renderMap(chaptersObj);
              showToast(`Deleted markup for ${ch.bookTitle} ${ch.chapter}`);
            });
          }
        });

        row.appendChild(infoLink);
        row.appendChild(delBtn);
        listEl.appendChild(row);
      }
    };

    try {
      if (typeof chrome !== "undefined" && chrome.runtime?.id && chrome.storage?.local) {
        chrome.storage.local.get({ bbe_sermon_saved_v1: { chapters: {} } }, (res) => {
          renderMap((res && res.bbe_sermon_saved_v1 && res.bbe_sermon_saved_v1.chapters) || {});
        });
      } else {
        renderMap({});
      }
    } catch (_) {
      renderMap({});
    }
    const sermonMaxEl = document.getElementById("sermonMaxSaved");
    if (sermonMaxEl && !sermonMaxEl.dataset.boundHeaderSync) {
      sermonMaxEl.dataset.boundHeaderSync = "1";
      sermonMaxEl.addEventListener("change", () => renderSermonSavedList());
    }
  }

  function renderAll() {
    renderShortcutsList();
    renderCustomTransList();
    renderToolbarPills();
    renderCompareBarPills();
    renderCommentarySourcesList();
    renderSermonSavedList();
  }

  renderAll();
})();
