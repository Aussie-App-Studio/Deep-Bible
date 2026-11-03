(function (global) {
  if (global.__BBE_SETTINGS_LOADED__) return;
  global.__BBE_SETTINGS_LOADED__ = true;

var BBE_DEFAULTS = {
  schemaVersion: 3,
  enabled: true,
  columnWidth: 950,         // px, max width of scripture column
  showWidthControls: true,  // Show expandable column width button (750, 950, 1200, Max) on main study pill
  showAaMenu: true,         // Show unified Aa reader menu (Text Size, Font, Theme) on main study pill
  fontSize: 100,            // %
  lineHeight: 1.8,
  fontFamily: "serif",      // "serif" (Classic Book Serif) | "sans" (Modern Sans) | "mono" (Warm Monospace) | "dyslexic" (Dyslexia Friendly)
  readerTheme: "system",    // "system" (System Default / Bible.com) | "sepia" (Warm Paper) | "light" (Clean Light) | "dark" (Night Dark) | "oled" (OLED Pitch Black) | "blue" (Midnight Navy) | "green" (Sage Herb) | "historical" (Ancient Scroll)
  historicalScene: "olive",      // Historical theme backdrop: "olive" (Olive Grove) | "library" (Ancient Library) | "ruins" (Classical Ruins) | "night" (Starlit Hills)
  historicalParchment: "scroll", // Historical theme page: "scroll" (Rolled Scroll) | "vellum" (Pale Vellum) | "papyrus" (Golden Papyrus) | "aged" (Weathered Parchment)
  historicalInk: "iron",         // Historical theme ink: "iron" (Iron-Gall Brown) | "sepia" (Soft Sepia) | "black" (Lampblack)
  historicalRubrics: true,       // Historical theme: headings & verse numbers in manuscript red (rubrication)
  historicalOrnate: true,        // Historical theme: double-rule illuminated frame around the page
  historicalSceneDim: 15,        // Historical theme: backdrop darkness 0-100 (%); 100 fully blacks out the scene
  enableKeyShortcuts: true, // E for ESV, N for NIV, S for NASB, K for NKJV
  prefetchTranslations: true,// Preload core versions in background for zero-delay swapping
  preloadAdjacentChapters: true, // Preload next & previous chapters in background for zero-delay instant switching
  chapterArrowKeys: true,        // Left & Right arrow keys navigate to previous & next chapters
  hideHeader: true,         // Top site header
  hideSidebar: true,        // Left navigation rail
  hideDistractionCards: true,// Videos, popular verses, breadcrumb recommendations
  hideFooter: true,         // Site footer
  hideBottomBar: true,      // Floating selection/action drawer
  hideCopyright: true,      // Version copyright notice under scripture
  hideFootnotes: true,      // Footnote markers (#, a, b...)
  hideHeadings: false,      // Section headings
  hideVerseNumbers: false,  // Verse numbers
  hideSwitcher: false,      // Floating study toolbar
  toolbarBehavior: "smart", // "smart" (Auto-hides on scroll down, reveals on scroll up or top hover) | "static" (Top only) | "floating" (Always sticky)
  autoDimBar: true,         // Auto-dim floating study bar when not hovered
  showScrollProgress: true, // Subtle chapter reading progress line along top pill
  quickStudyShowCount: 0,   // Number of times quick study passage suggestions have been shown (auto-retires after 3 times)
  youversionHighlighting: true,// Native YouVersion Color Highlighting (Yellow, Mint, Sky Blue, Amber, Rose)
  showVerseHighlightBadges: true,// Show highlighter badge on verse hover
  defaultHighlightColor: "fffe00",// Default highlight color ("fffe00" Yellow | "5dff79" Mint | "00d6ff" Blue | "ffc66f" Amber | "ff95ef" Rose)
  toolbarVersions: ["ESV", "NIV", "NASB", "NLT", "BSB", "NKJV", "KJV"], // Translations shown in top pill
  compareOn: false,         // Side-by-side translation comparison
  compareVersions: ["NIV", "ESV"],
  compareLayout: "columns", // "columns" (Side-by-side whole chapters) | "interleaved" (Verse-by-verse parallel comparison)
  showCommentaryBadges: true,// Unobtrusive hover badges on verses to open commentary
  defaultStudyTab: "commentary", // "commentary" | "crossref" | "wordstudy"
  commentaryDock: "right",   // "right" (Sidebar) | "bottom" (Logos style)
  commEnableTgc: true,       // The Gospel Coalition (TGC Bible Commentary)
  commEnableGuzik: true,     // David Guzik (Enduring Word)
  commEnableConstable: true, // Dr. Thomas Constable (DTS Expository Notes)
  commEnableUtley: true,     // Dr. Bob Utley (Free Bible Commentary)
  wordStudyMode: false,      // Strong's Greek & Hebrew Lexicon / Word Study mode
  wordStudyTrigger: "hover", // "hover" (Hover or click) | "click" (Click only)
  smartVerseCopy: true,          // Smart Verse Copy on hover, selection, or verse click
  copyCleanSelection: true,      // Automatically clean highlighted text on Ctrl+C (strip verse numbers & headings)
  copyIncludeReference: false,   // Append scripture reference (e.g. Genesis 1:1) at end (Default: false)
  copyIncludeVersion: false,     // Include translation code in citation (e.g. NIV, ESV) (Default: false)
  copyIncludeVerseNumbers: false,// Include verse numbers in copied text (Default: false)
  copyIncludeHeadings: false,    // Include section headings in copied text (Default: false)
  preserveReadingPosition: true, // Anchors the verse in your viewport across translation swaps
  customShortcuts: {
    e: "ESV",
    n: "NIV",
    s: "NASB",
    k: "NKJV",
    l: "NLT",
    t: "NLT",
    b: "BSB",
    j: "KJV"
  },
  userTranslations: {},      // e.g. { "AMP": { id: 1588, name: "Amplified Bible", short: "AMP" } }
  customCss: ""
};

function bbeLoad() {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(BBE_DEFAULTS, resolve);
    } else {
      resolve(BBE_DEFAULTS);
    }
  });
}

function bbeSave(patch) {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set(patch, resolve);
    } else {
      resolve();
    }
  });
}

  global.BBE_DEFAULTS = BBE_DEFAULTS;
  global.bbeLoad = bbeLoad;
  global.bbeSave = bbeSave;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { BBE_DEFAULTS, bbeLoad, bbeSave };
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
