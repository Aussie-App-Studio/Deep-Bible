(function (global) {
  if (global.__BBE_SETTINGS_LOADED__) return;
  global.__BBE_SETTINGS_LOADED__ = true;

var BBE_DEFAULTS = {
  schemaVersion: 3,
  enabled: true,
  columnWidth: 950,         // px, max width of scripture column
  showAaMenu: true,         // Show unified Aa reader menu (Column Width, Text Size, Font, Theme) on main study pill
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
  quickStudyShowCount: 0,   // Number of times quick study passage suggestions have been shown (auto-retires after 3 times)
  youversionHighlighting: true,// Native YouVersion Color Highlighting (Yellow, Mint, Sky Blue, Amber, Rose)
  showVerseHighlightBadges: true,// Show highlighter badge on verse hover
  defaultHighlightColor: "fffe00",// Default highlight color ("fffe00" Yellow | "5dff79" Green | "00d6ff" Blue | "ffc66f" Orange | "ff95ef" Pink)
  toolbarVersions: ["ESV", "NIV", "NASB", "NLT", "BSB", "NKJV", "KJV"], // Translations shown in top pill
  compareOn: false,         // Side-by-side translation comparison
  compareVersions: ["NIV", "ESV"],
  compareLayout: "columns", // "columns" (Side-by-side whole chapters) | "interleaved" (Verse-by-verse parallel comparison)
  defaultStudyTab: "commentary", // "commentary" | "crossref" | "wordstudy"
  commentaryDock: "bottom",  // "bottom" (Logos style, default) | "right" (Sidebar)
  commentaryBottomHeight: null, // Custom height (px) for bottom-docked study drawer (null = 44vh default)
  commEnableTgc: true,       // The Gospel Coalition (TGC Bible Commentary)
  commEnableGuzik: true,     // David Guzik (Enduring Word)
  commEnableConstable: true, // Dr. Thomas Constable (DTS Expository Notes)
  commEnableUtley: true,     // Dr. Bob Utley (Free Bible Commentary)
  hiddenCommentaries: [],    // Keys of hidden commentaries (e.g. ["david_guzik", "pulpit"])
  commentaryOrder: [],       // Preferred display order of commentary keys (empty = default order)
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
  userTranslations: {}       // e.g. { "AMP": { id: 1588, name: "Amplified Bible", short: "AMP" } }
};

function bbeLoad() {
  return new Promise((resolve) => {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime?.id && chrome.storage?.sync) {
        chrome.storage.sync.get(BBE_DEFAULTS, (res) => {
          if (chrome.runtime?.lastError) {
            resolve(BBE_DEFAULTS);
          } else {
            resolve(res || BBE_DEFAULTS);
          }
        });
      } else {
        resolve(BBE_DEFAULTS);
      }
    } catch (_) {
      resolve(BBE_DEFAULTS);
    }
  });
}

function bbeSave(patch) {
  return new Promise((resolve) => {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime?.id && chrome.storage?.sync) {
        chrome.storage.sync.set(patch, () => {
          if (chrome.runtime?.lastError) {
            // Context invalidated or quota exceeded
          }
          resolve();
        });
      } else {
        resolve();
      }
    } catch (_) {
      resolve();
    }
  });
}

var BBE_COMMENTARY_SOURCES = [
  { key: "the_gospel_coalition", label: "The Gospel Coalition (TGC)", short: "The Gospel Coalition", group: "modern", enableKey: "commEnableTgc", desc: "Expository pericope overviews & deep section links" },
  { key: "david_guzik", label: "David Guzik (Enduring Word)", short: "David Guzik", group: "modern", enableKey: "commEnableGuzik", desc: "Verse-by-verse pastoral notes & life application" },
  { key: "thomas_constable", label: "Dr. Thomas Constable (DTS)", short: "Thomas Constable", group: "modern", enableKey: "commEnableConstable", desc: "66-book Dallas Theological Seminary expository notes" },
  { key: "bob_utley", label: "Dr. Bob Utley (Free Bible Comm)", short: "Bob Utley", group: "modern", enableKey: "commEnableUtley", desc: "Linguistic, contextual & hermeneutical verse notes" },
  { key: "matthew_henry", label: "Matthew Henry", short: "Matthew Henry", group: "classic", desc: "Classic devotional & practical exposition" },
  { key: "john_calvin", label: "John Calvin", short: "John Calvin", group: "classic", desc: "Reformation exegetical & theological commentary" },
  { key: "jfb", label: "Jamieson-Fausset-Brown (JFB)", short: "JFB", group: "classic", desc: "Critical & explanatory whole-Bible commentary" },
  { key: "pulpit", label: "Pulpit Commentary", short: "Pulpit", group: "classic", desc: "Homiletic exposition & sermon outlines" },
  { key: "keil_delitzsch", label: "Keil & Delitzsch (OT)", short: "Keil & Delitzsch", group: "classic", desc: "Classic Hebrew & Old Testament scholarship" },
  { key: "barnes", label: "Barnes' Notes", short: "Barnes", group: "classic", desc: "Verse-by-verse historical & textual notes" },
  { key: "cambridge", label: "Cambridge Bible", short: "Cambridge", group: "classic", desc: "Cambridge Bible for Schools and Colleges" },
  { key: "john_gill", label: "John Gill", short: "John Gill", group: "classic", desc: "Exposition of the Entire Bible with Jewish/rabbinic context" },
  { key: "meyer", label: "Meyer's NT Commentary", short: "Meyer", group: "classic", desc: "Critical & exegetical New Testament handbook" },
  { key: "vincent", label: "Vincent's / Robertson's Word Studies", short: "Vincent Word Studies", group: "classic", desc: "Greek & NT word studies and grammar" },
  { key: "adam_clarke", label: "Adam Clarke", short: "Adam Clarke", group: "classic", desc: "Methodist textual & historical commentary" },
  { key: "wesley", label: "John Wesley's Notes", short: "Wesley", group: "classic", desc: "Explanatory notes on the Old & New Testaments" },
  { key: "scofield", label: "Scofield Reference Notes", short: "Scofield", group: "classic", desc: "Classic dispensational study notes" },
  { key: "darby", label: "Darby's Synopsis", short: "Darby", group: "classic", desc: "Synopsis of the Books of the Bible" },
  { key: "spurgeon", label: "Charles Spurgeon", short: "Spurgeon", group: "classic", desc: "Treasury of David & sermonic expositions" },
  { key: "lange", label: "Lange's Commentary", short: "Lange", group: "classic", desc: "Critical, doctrinal & homiletical commentary" },
  { key: "maclaren", label: "MacLaren's Expositions", short: "MacLaren", group: "classic", desc: "Expositions of Holy Scripture" },
  { key: "ellicott", label: "Ellicott's Commentary", short: "Ellicott", group: "classic", desc: "Commentary for English Readers" },
  { key: "benson", label: "Benson Commentary", short: "Benson", group: "classic", desc: "Joseph Benson's critical & practical notes" },
  { key: "poole", label: "Matthew Poole", short: "Matthew Poole", group: "classic", desc: "English Annotations on the Holy Bible" },
  { key: "bengel", label: "Bengel's Gnomon", short: "Bengel", group: "classic", desc: "Concise New Testament word-by-word notes" },
  { key: "geneva_1599", label: "Geneva Study Bible (1599)", short: "Geneva", group: "classic", desc: "16th-century Reformation study notes" }
];

const BBE_COMMENTARY_BY_KEY = Object.fromEntries(BBE_COMMENTARY_SOURCES.map(s => [s.key, s]));

/** Return true unless the commentary is hidden or its modern commEnable* toggle is off. */
function bbeIsCommentaryEnabled(key, settings) {
  const s = settings || {};
  const meta = BBE_COMMENTARY_BY_KEY[key];
  if (meta && meta.enableKey && s[meta.enableKey] === false) return false;
  const hidden = Array.isArray(s.hiddenCommentaries) ? s.hiddenCommentaries : [];
  return !hidden.includes(key);
}

/** Return all commentary sources in the user's preferred order with live enabled state. */
function bbeGetOrderedCommentarySources(settings) {
  const s = settings || {};
  const savedOrder = Array.isArray(s.commentaryOrder) ? s.commentaryOrder : [];
  const seen = new Set();
  const ordered = [];

  for (const key of savedOrder) {
    const meta = BBE_COMMENTARY_BY_KEY[key];
    if (meta && !seen.has(key)) {
      seen.add(key);
      ordered.push({ ...meta, enabled: bbeIsCommentaryEnabled(key, s) });
    }
  }
  for (const meta of BBE_COMMENTARY_SOURCES) {
    if (!seen.has(meta.key)) {
      seen.add(meta.key);
      ordered.push({ ...meta, enabled: bbeIsCommentaryEnabled(meta.key, s) });
    }
  }
  return ordered;
}

/** Filter out disabled/hidden commentaries and sort by user's preferred display order. */
function bbeSortAndFilterCommentaries(commentaries, settings) {
  if (!Array.isArray(commentaries)) return [];
  const ordered = bbeGetOrderedCommentarySources(settings);
  const rankMap = new Map(ordered.map((src, idx) => [src.key, idx]));
  return commentaries
    .filter(c => c && bbeIsCommentaryEnabled(c.key, settings))
    .slice()
    .sort((a, b) => {
      const ra = rankMap.has(a.key) ? rankMap.get(a.key) : 999;
      const rb = rankMap.has(b.key) ? rankMap.get(b.key) : 999;
      return ra - rb;
    });
}

/** Return concise display label for a commentary key, falling back to cleaned title. */
function bbeGetCommentaryLabel(key, fallbackTitle) {
  const meta = BBE_COMMENTARY_BY_KEY[key];
  if (meta) return meta.short;
  return String(fallbackTitle || key || "")
    .replace(/['’]s Commentary.*|['’]s Concise.*|['’]s Notes.*|['’]s Exposition.*| Commentary.*| Notes.*/gi, "")
    .trim();
}

/** Build a storage patch that toggles visibility for any modern or classic commentary. */
function bbeBuildCommentaryTogglePatch(key, enabled, settings) {
  const s = settings || {};
  const hiddenSet = new Set(Array.isArray(s.hiddenCommentaries) ? s.hiddenCommentaries : []);
  if (enabled) hiddenSet.delete(key);
  else hiddenSet.add(key);

  const patch = { hiddenCommentaries: Array.from(hiddenSet) };
  const meta = BBE_COMMENTARY_BY_KEY[key];
  if (meta && meta.enableKey) {
    patch[meta.enableKey] = !!enabled;
  }
  return patch;
}

/** Build a storage patch that moves a commentary key ('top' | 'up' | 'down' | 'reset'). */
function bbeBuildCommentaryOrderPatch(action, key, settings) {
  if (action === "reset") {
    return {
      commentaryOrder: [],
      hiddenCommentaries: [],
      commEnableTgc: true,
      commEnableGuzik: true,
      commEnableConstable: true,
      commEnableUtley: true
    };
  }
  const keys = bbeGetOrderedCommentarySources(settings).map(s => s.key);
  const idx = keys.indexOf(key);
  if (idx === -1) return { commentaryOrder: keys };

  if (action === "top" && idx > 0) {
    keys.splice(idx, 1);
    keys.unshift(key);
  } else if (action === "up" && idx > 0) {
    [keys[idx - 1], keys[idx]] = [keys[idx], keys[idx - 1]];
  } else if (action === "down" && idx < keys.length - 1) {
    [keys[idx], keys[idx + 1]] = [keys[idx + 1], keys[idx]];
  }
  return { commentaryOrder: keys };
}

  global.BBE_DEFAULTS = BBE_DEFAULTS;
  global.BBE_COMMENTARY_SOURCES = BBE_COMMENTARY_SOURCES;
  global.bbeIsCommentaryEnabled = bbeIsCommentaryEnabled;
  global.bbeGetOrderedCommentarySources = bbeGetOrderedCommentarySources;
  global.bbeSortAndFilterCommentaries = bbeSortAndFilterCommentaries;
  global.bbeGetCommentaryLabel = bbeGetCommentaryLabel;
  global.bbeBuildCommentaryTogglePatch = bbeBuildCommentaryTogglePatch;
  global.bbeBuildCommentaryOrderPatch = bbeBuildCommentaryOrderPatch;
  global.bbeLoad = bbeLoad;
  global.bbeSave = bbeSave;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      BBE_DEFAULTS,
      BBE_COMMENTARY_SOURCES,
      bbeIsCommentaryEnabled,
      bbeGetOrderedCommentarySources,
      bbeSortAndFilterCommentaries,
      bbeGetCommentaryLabel,
      bbeBuildCommentaryTogglePatch,
      bbeBuildCommentaryOrderPatch,
      bbeLoad,
      bbeSave
    };
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
