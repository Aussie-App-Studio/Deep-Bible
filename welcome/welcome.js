/**
 * Deep Bible — Welcome & Quick Setup Controller
 * Real-time preference synchronization, live reader preview morphing, and interactive translation switcher.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM element references
  const readerThemeSelect = document.getElementById('readerThemeSelect');
  const fontFamilySelect = document.getElementById('fontFamilySelect');
  const fontSizeRange = document.getElementById('fontSizeRange');
  const fontSizeVal = document.getElementById('fontSizeVal');
  const columnWidthRange = document.getElementById('columnWidthRange');
  const columnWidthVal = document.getElementById('columnWidthVal');
  const enableKeyShortcuts = document.getElementById('enableKeyShortcuts');
  const distractionFreeToggle = document.getElementById('distractionFreeToggle');
  const showCommentaryBadges = document.getElementById('showCommentaryBadges');
  const defaultStudyTabSelect = document.getElementById('defaultStudyTabSelect');

  // Preview elements
  const previewFrame = document.getElementById('welcomePreviewFrame');
  const mockPassageWrap = document.getElementById('mockPassageWrap');
  const mockPassageBody = document.getElementById('mockPassageBody');
  const mockActiveTag = document.getElementById('mockActiveTag');
  const mockVerse1 = document.getElementById('mockVerse1');
  const mockVerse2 = document.getElementById('mockVerse2');
  const mockVersionPills = document.querySelectorAll('.db-vbtn');
  const mockBadgeGroups = document.querySelectorAll('.db-hover-badge-group');

  // Action buttons
  const openDashboardBtn = document.getElementById('openDashboardBtn');
  const bottomDashboardBtn = document.getElementById('bottomDashboardBtn');
  const welcomeRateBtn = document.getElementById('welcomeRateBtn');

  // Romans 8:1-2 translations text map for the interactive live preview
  const SCRIPTURE_TRANSLATIONS = {
    ESV: {
      tag: "ESV",
      v1: "There is therefore now no condemnation for those who are in Christ Jesus.",
      v2: "For the law of the Spirit of life has set you free in Christ Jesus from the law of sin and death."
    },
    NIV: {
      tag: "NIV",
      v1: "Therefore, there is now no condemnation for those who are in Christ Jesus,",
      v2: "because through Christ Jesus the law of the Spirit who gives life has set you free from the law of sin and death."
    },
    NASB: {
      tag: "NASB",
      v1: "Therefore there is now no condemnation at all for those who are in Christ Jesus.",
      v2: "For the law of the Spirit of life in Christ Jesus has set you free from the law of sin and of death."
    },
    BSB: {
      tag: "BSB",
      v1: "Therefore, there is now no condemnation for those who are in Christ Jesus.",
      v2: "For in Christ Jesus the law of the Spirit of life set you free from the law of sin and death."
    },
    NKJV: {
      tag: "NKJV",
      v1: "There is therefore now no condemnation to those who are in Christ Jesus, who do not walk according to the flesh, but according to the Spirit.",
      v2: "For the law of the Spirit of life in Christ Jesus has made me free from the law of sin and death."
    },
    KJV: {
      tag: "KJV",
      v1: "There is therefore now no condemnation to them which are in Christ Jesus, who walk not after the flesh, but after the Spirit.",
      v2: "For the law of the Spirit of life in Christ Jesus hath made me free from the law of sin and death."
    },
    NLT: {
      tag: "NLT",
      v1: "So now there is no condemnation for those who belong to Christ Jesus.",
      v2: "And because you belong to him, the power of the life-giving Spirit has freed you from the power of sin that leads to death."
    }
  };

  let activeTranslation = 'ESV';

  // Load active configuration from chrome.storage.sync
  let config = {};
  try {
    if (typeof bbeLoad === 'function') {
      config = await bbeLoad();
    } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      config = await new Promise((res) => chrome.storage.sync.get(null, res));
    }
  } catch (err) {
    console.warn('[Deep Bible] Could not load stored settings, using defaults:', err);
  }

  // Fallback defaults if not set
  const defaults = (typeof BBE_DEFAULTS !== 'undefined') ? BBE_DEFAULTS : {};
  config = { ...defaults, ...config };

  // Fallback to localStorage if loaded outside extension context (e.g. file:// preview)
  try {
    const local = localStorage.getItem('bbe_preview_settings');
    if (local) {
      config = { ...config, ...JSON.parse(local) };
    }
  } catch (e) {}

  // Helper to persist changes instantly
  function saveSetting(patch) {
    Object.assign(config, patch);
    updatePreview();

    try {
      localStorage.setItem('bbe_preview_settings', JSON.stringify(config));
    } catch (e) {}

    if (typeof bbeSave === 'function') {
      bbeSave(patch);
    } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set(patch);
    }
  }

  // Populate inputs with stored config
  if (readerThemeSelect && config.readerTheme) {
    readerThemeSelect.value = config.readerTheme;
  }
  if (fontFamilySelect && config.fontFamily) {
    fontFamilySelect.value = config.fontFamily;
  }
  if (fontSizeRange && config.fontSize) {
    fontSizeRange.value = config.fontSize;
    if (fontSizeVal) fontSizeVal.textContent = `${config.fontSize}%`;
  }
  if (columnWidthRange && config.columnWidth) {
    columnWidthRange.value = config.columnWidth;
    if (columnWidthVal) columnWidthVal.textContent = `${config.columnWidth}px`;
  }
  if (enableKeyShortcuts) {
    enableKeyShortcuts.checked = config.enableKeyShortcuts !== false;
  }
  if (distractionFreeToggle) {
    distractionFreeToggle.checked = config.hideHeader !== false;
  }
  if (showCommentaryBadges) {
    showCommentaryBadges.checked = config.showCommentaryBadges !== false;
  }
  if (defaultStudyTabSelect && config.defaultStudyTab) {
    defaultStudyTabSelect.value = config.defaultStudyTab;
  }

  // Update Live Reader Preview
  function updatePreview() {
    if (!previewFrame) return;

    // 1. Reading theme class
    const theme = config.readerTheme || 'system';
    previewFrame.className = `db-preview-frame bbe-theme-${theme} font-${config.fontFamily || 'serif'}`.trim();

    // 2. Font size scaling
    const fontSizePct = config.fontSize || 100;
    if (mockPassageBody) {
      mockPassageBody.style.fontSize = `${(fontSizePct / 100) * 15}px`;
    }

    // 3. Column Width (scale proportionally within preview container)
    if (mockPassageWrap) {
      const colWidth = config.columnWidth || 950;
      // Map 650px-1300px to comfortable preview range 380px-540px
      const scaledWidth = Math.min(540, Math.max(380, Math.round((colWidth / 950) * 440)));
      mockPassageWrap.style.maxWidth = `${scaledWidth}px`;
      mockPassageWrap.style.margin = '0 auto';
    }

    // 4. Study badges visibility
    const showBadges = config.showCommentaryBadges !== false;
    mockBadgeGroups.forEach((group) => {
      group.style.display = showBadges ? 'inline-flex' : 'none';
    });

    // 5. Active translation verses
    const currentPassage = SCRIPTURE_TRANSLATIONS[activeTranslation] || SCRIPTURE_TRANSLATIONS.ESV;
    if (mockActiveTag) mockActiveTag.textContent = currentPassage.tag;
    if (mockVerse1) mockVerse1.textContent = currentPassage.v1;
    if (mockVerse2) mockVerse2.textContent = currentPassage.v2;

    mockVersionPills.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.ver === activeTranslation);
    });
  }

  // Initial paint
  updatePreview();

  // Listeners for setting adjustments
  readerThemeSelect?.addEventListener('change', () => {
    saveSetting({ readerTheme: readerThemeSelect.value });
  });

  fontFamilySelect?.addEventListener('change', () => {
    saveSetting({ fontFamily: fontFamilySelect.value });
  });

  fontSizeRange?.addEventListener('input', () => {
    const val = parseInt(fontSizeRange.value, 10);
    if (fontSizeVal) fontSizeVal.textContent = `${val}%`;
    saveSetting({ fontSize: val });
  });

  columnWidthRange?.addEventListener('input', () => {
    const val = parseInt(columnWidthRange.value, 10);
    if (columnWidthVal) columnWidthVal.textContent = `${val}px`;
    saveSetting({ columnWidth: val });
  });

  enableKeyShortcuts?.addEventListener('change', () => {
    saveSetting({ enableKeyShortcuts: enableKeyShortcuts.checked });
  });

  distractionFreeToggle?.addEventListener('change', () => {
    const isChecked = distractionFreeToggle.checked;
    saveSetting({
      hideHeader: isChecked,
      hideSidebar: isChecked,
      hideDistractionCards: isChecked,
      hideFooter: isChecked,
      hideBottomBar: isChecked,
      hideCopyright: isChecked
    });
  });

  showCommentaryBadges?.addEventListener('change', () => {
    saveSetting({ showCommentaryBadges: showCommentaryBadges.checked });
  });

  defaultStudyTabSelect?.addEventListener('change', () => {
    saveSetting({ defaultStudyTab: defaultStudyTabSelect.value });
  });

  // Translation switcher pills in live preview
  mockVersionPills.forEach((btn) => {
    btn.addEventListener('click', () => {
      const ver = btn.dataset.ver;
      if (ver && SCRIPTURE_TRANSLATIONS[ver]) {
        activeTranslation = ver;
        updatePreview();
      }
    });
  });

  // Navigation handlers
  function openDashboard() {
    const popupUrl = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
      ? chrome.runtime.getURL('popup.html')
      : '../popup.html';
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      chrome.tabs.create({ url: popupUrl });
    } else {
      window.open(popupUrl, '_blank');
    }
  }

  openDashboardBtn?.addEventListener('click', openDashboard);
  bottomDashboardBtn?.addEventListener('click', openDashboard);

  // Feedback Form Links
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

  // Review tracking
  welcomeRateBtn?.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set({ hasRatedOrShared: true, lastReviewPrompt: Date.now() });
    }
  });

  // Watch for system color scheme changes if readerTheme is 'system'
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (config.readerTheme === 'system') {
      updatePreview();
    }
  });
});
