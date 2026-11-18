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
  const numFields = ["columnWidth", "fontSize", "lineHeight", "historicalSceneDim"];

  // Toast Notification helper
  let toastTimer = null;
  function showToast(msg = "✓ Setting saved") {
    const toast = document.getElementById("bbe-toast");
    if (!toast) return;
    toast.textContent = msg;
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

  function setCategory(cat) {
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
  function resetSearchFilter() {
    sections.forEach(sec => {
      sec.style.display = sec.dataset.section === activeCategory ? "block" : "none";
      sec.querySelectorAll(".card, .setting-row, .slider-card-row").forEach(el => {
        el.style.display = "";
      });
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) {
        resetSearchFilter();
        return;
      }

      // Show all sections during search and filter cards/rows
      sections.forEach(sec => {
        let secHasMatch = false;
        sec.querySelectorAll(".card").forEach(card => {
          let cardHasMatch = false;
          const cardTitle = card.querySelector(".card-title")?.textContent.toLowerCase() || "";
          if (cardTitle.includes(q)) {
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

    if (/^[a-zA-Z0-9]$/.test(e.key)) {
      const assignedKey = e.key.toLowerCase();
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

        S.userTranslations = userTrans;
        S.customShortcuts = updatedShortcuts;
        S.toolbarVersions = updatedToolbar;
        S.compareVersions = updatedCompare;

        await bbeSave({
          userTranslations: userTrans,
          customShortcuts: updatedShortcuts,
          toolbarVersions: updatedToolbar,
          compareVersions: updatedCompare
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
  const abbrInput = document.getElementById("popupAddAbbr");
  const idInput = document.getElementById("popupAddId");
  const nameInput = document.getElementById("popupAddName");
  const keyInput = document.getElementById("popupAddKey");
  const feedback = document.getElementById("popupAddFeedback");

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
          if (feedback) {
            feedback.style.color = "var(--primary)";
            feedback.textContent = `✨ Detected: ${resolved.name} (${resolved.short}, ID: ${resolved.id})`;
          }
        }
      } catch (e) {
        // Passive detect
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

  [smartInput, abbrInput, idInput, nameInput, keyInput].forEach(inp => {
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
      const smartVal = smartInput ? smartInput.value.trim() : "";
      const rawAbbr = abbrInput.value.trim().toUpperCase();
      const rawId = parseInt(idInput.value.trim(), 10);
      const rawName = nameInput.value.trim();
      const rawKey = keyInput.value.trim().toLowerCase();

      if (feedback) {
        feedback.style.color = "var(--text-muted)";
        feedback.textContent = "⏳ Looking up translation details...";
      }

      try {
        let resolved = null;
        if (smartVal) {
          resolved = await bbeResolveTranslation(smartVal);
        } else if (rawId || rawAbbr) {
          resolved = await bbeResolveTranslation({ id: rawId, abbr: rawAbbr, name: rawName, shortcut: rawKey });
        } else {
          throw new Error("Enter a Bible.com URL, numeric ID (e.g. 149), or code (e.g. RVR1960).");
        }

        const finalAbbr = (rawAbbr || resolved.short).toUpperCase();
        const finalId = rawId || resolved.id;
        const finalName = rawName || resolved.name || finalAbbr;
        const finalKey = rawKey || resolved.shortcut || "";

        if (finalKey && typeof BBE_RESERVED_STUDY_KEYS !== "undefined" && BBE_RESERVED_STUDY_KEYS[finalKey]) {
          throw new Error(`Key [${finalKey.toUpperCase()}] is reserved for ${BBE_RESERVED_STUDY_KEYS[finalKey]}. Please choose another shortcut key.`);
        }

        const updatedUserTrans = { ...(S.userTranslations || {}) };
        updatedUserTrans[finalAbbr] = {
          id: finalId,
          name: finalName,
          short: finalAbbr
        };

        const updatedShortcuts = { ...(S.customShortcuts || BBE_KEY_MAP) };
        if (finalKey && /^[a-z0-9]$/.test(finalKey)) {
          for (const [k, mapped] of Object.entries(updatedShortcuts)) {
            if (mapped === finalAbbr) delete updatedShortcuts[k];
          }
          updatedShortcuts[finalKey] = finalAbbr;
        }

        const updatedToolbar = Array.from(new Set([...(S.toolbarVersions || []), finalAbbr]));

        S.userTranslations = updatedUserTrans;
        S.customShortcuts = updatedShortcuts;
        S.toolbarVersions = updatedToolbar;

        await bbeSave({
          userTranslations: updatedUserTrans,
          customShortcuts: updatedShortcuts,
          toolbarVersions: updatedToolbar
        });

        if (feedback) {
          feedback.style.color = "#16a34a";
          feedback.textContent = `✓ Added ${finalAbbr} (${finalName})!`;
        }
        showToast(`✓ Added ${finalAbbr}!`);

        if (smartInput) smartInput.value = "";
        abbrInput.value = "";
        idInput.value = "";
        nameInput.value = "";
        keyInput.value = "";

        renderAll();
      } catch (err) {
        if (feedback) {
          feedback.style.color = "#dc2626";
          feedback.textContent = err.message || "Failed to resolve translation.";
        }
      }
    });
  }

  /* ---------------- Top Pill Toolbar Buttons Selector ---------------- */
  function renderToolbarPills() {
    const toolbarPillsContainer = document.getElementById("toolbarVersionPills");
    if (!toolbarPillsContainer) return;
    toolbarPillsContainer.innerHTML = "";

    const allVers = bbeGetAllVersions(S.userTranslations);
    const selectedToolbar = new Set(S.toolbarVersions || ["ESV", "NIV", "NASB", "NLT", "BSB", "NKJV", "KJV"]);

    for (const key of Object.keys(allVers)) {
      const pill = document.createElement("div");
      pill.className = "v-pill" + (selectedToolbar.has(key) ? " active" : "");
      pill.textContent = (selectedToolbar.has(key) ? "✓ " : "") + key;
      pill.title = allVers[key].name;

      pill.addEventListener("click", async () => {
        if (selectedToolbar.has(key)) {
          if (selectedToolbar.size > 1) {
            selectedToolbar.delete(key);
            pill.classList.remove("active");
            pill.textContent = key;
          }
        } else {
          selectedToolbar.add(key);
          pill.classList.add("active");
          pill.textContent = "✓ " + key;
        }
        const ordered = Object.keys(allVers).filter(k => selectedToolbar.has(k));
        S.toolbarVersions = ordered;
        await bbeSave({ toolbarVersions: ordered });
        showToast("Top pill versions updated");
      });

      toolbarPillsContainer.appendChild(pill);
    }
  }

  /* ---------------- Compare Mode Pills Selector ---------------- */
  function renderComparePills() {
    const pillsContainer = document.getElementById("comparePills");
    if (!pillsContainer) return;
    pillsContainer.innerHTML = "";

    const allVers = bbeGetAllVersions(S.userTranslations);
    const selected = new Set(S.compareVersions || ["NIV", "ESV"]);

    for (const key of Object.keys(allVers)) {
      const pill = document.createElement("div");
      pill.className = "v-pill" + (selected.has(key) ? " active" : "");
      pill.textContent = (selected.has(key) ? "✓ " : "") + key;
      pill.title = allVers[key].name;

      pill.addEventListener("click", async () => {
        if (selected.has(key)) {
          if (selected.size > 1) {
            selected.delete(key);
            pill.classList.remove("active");
            pill.textContent = key;
          }
        } else {
          selected.add(key);
          pill.classList.add("active");
          pill.textContent = "✓ " + key;
        }
        const ordered = Object.keys(allVers).filter(k => selected.has(k));
        S.compareVersions = ordered;
        await bbeSave({ compareVersions: ordered });
        showToast("Comparison translations updated");
      });

      pillsContainer.appendChild(pill);
    }
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

  function renderAll() {
    renderShortcutsList();
    renderCustomTransList();
    renderToolbarPills();
    renderComparePills();
    renderCommentarySourcesList();
  }

  renderAll();
})();
