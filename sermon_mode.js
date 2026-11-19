// Deep Bible: Study Tools for YouVersion (Bible.com) — Sermon Mode ("Look at the Book" Markup Engine)
// Lazy-loaded on demand ONLY when the user toggles Sermon Mode on.
(function (global) {
  "use strict";
  if (global.BBE_SERMON) return;

  const STORAGE_KEY = "bbe_sermon_saved_v1";
  const SESSION_ACTIVE_KEY = "bbe_sermon_active";
  const DOCK_POS_KEY = "bbe_sermon_dock_pos_v1";
  const MAX_SAVED_CHAPTERS = 5;

  const COLORS = {
    cyan: {
      key: "cyan",
      label: "Piper Cyan",
      stroke: "#0ea5e9",
      fill: "rgba(14, 165, 233, 0.26)",
      noteBg: "rgba(14, 165, 233, 0.10)",
      swatch: "#0ea5e9"
    },
    crimson: {
      key: "crimson",
      label: "Crimson Red",
      stroke: "#f43f5e",
      fill: "rgba(244, 63, 94, 0.24)",
      noteBg: "rgba(244, 63, 94, 0.10)",
      swatch: "#f43f5e"
    },
    emerald: {
      key: "emerald",
      label: "Emerald Green",
      stroke: "#10b981",
      fill: "rgba(16, 185, 129, 0.25)",
      noteBg: "rgba(16, 185, 129, 0.10)",
      swatch: "#10b981"
    },
    amber: {
      key: "amber",
      label: "Amber Gold",
      stroke: "#f59e0b",
      fill: "rgba(245, 158, 11, 0.30)",
      noteBg: "rgba(245, 158, 11, 0.12)",
      swatch: "#f59e0b"
    },
    adaptive: {
      key: "adaptive",
      label: "Theme Ink (Auto Dark/Light)",
      stroke: "var(--bbe-sermon-adaptive-ink, #1e293b)",
      fill: "rgba(148, 163, 184, 0.28)",
      noteBg: "rgba(148, 163, 184, 0.12)",
      swatch: "linear-gradient(135deg, #1e293b 50%, #f8fafc 50%)"
    }
  };

  const SAVED_ICON = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>`;
  const SAVE_ICON = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/><polyline points="9 10 11 12 15 8"/></svg>`;
  const PRINT_ICON = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`;
  const CLEAR_ICON = `<svg viewBox="0 0 24 24" width="11.5" height="11.5" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`;
  const UNDO_ICON = `<svg viewBox="0 0 24 24" width="11.5" height="11.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>`;
  const SERMON_ICON = `<svg viewBox="0 0 24 24" width="12.5" height="12.5" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="1.5"/></svg>`;
  const CLOSE_ICON = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  const POINTER_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4l7.07 17 2.51-7.39L21 11.07z"/></svg>`;
  const CIRCLE_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="12" rx="9" ry="7"/></svg>`;
  const BOX_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/></svg>`;
  const UNDERLINE_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" y1="20" x2="20" y2="20"/></svg>`;
  const HL_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l-5 5v4h4l5-5"/><path d="M14 6l4 4"/><path d="M12 8l5-5 4 4-5 5z"/></svg>`;
  const ARROW_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 17c2-7 8-10 15-8"/><polyline points="15 5 19 9 15 13"/></svg>`;
  const PEN_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`;
  const NOTE_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9l-6-6z"/><polyline points="15 3 15 9 21 9"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>`;
  const ERASER_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>`;

  const TOOLS = [
    { id: "pointer", icon: POINTER_ICON, label: "Read", title: "Pointer / Read Mode (Esc) — Select text, copy verses, or use Word Study normally" },
    { id: "circle", icon: CIRCLE_ICON, label: "Circle", title: "Smart Circle — Click a word or drag across a phrase to circle it" },
    { id: "box", icon: BOX_ICON, label: "Box", title: "Smart Box — Click a word or drag across a phrase to box it" },
    { id: "underline", icon: UNDERLINE_ICON, label: "Line", title: "Smart Underline — Click a word or drag across a phrase (click again for double-underline)" },
    { id: "highlight", icon: HL_ICON, label: "Mark", title: "Smart Word Highlight — Highlight individual words or phrases" },
    { id: "arrow", icon: ARROW_ICON, label: "Arrow", title: "Connector Arrow — Drag from Word A to Word B to connect them with a curved arrow (hold Alt to flip arc)" },
    { id: "pen", icon: PEN_ICON, label: "Pen", title: "Freehand Pen — Draw freely over text or in the margins" },
    { id: "note", icon: NOTE_ICON, label: "Note", title: "Handwritten Note — Click anywhere to add a handwritten margin or interlinear note" },
    { id: "eraser", icon: ERASER_ICON, label: "Erase", title: "Eraser — Click or drag across any mark or note to remove it (or right-click any mark)" }
  ];

  let host = null;
  let active = false;
  let activeTool = "circle";
  let activeColor = "cyan";

  // Current chapter state
  let currentChapterKey = ""; // e.g. "ROM.8.ESV"
  let currentPassageMeta = null; // { book, bookTitle, chapter, version, versionId }
  let items = []; // Active annotations on current chapter
  let undoStack = [];
  let redoStack = [];
  let isDirtyManual = false;
  let sessionUnsavedKeys = new Set(); // Chapters declined in 5/5 prompt mode

  // Storage cache: { "ROM.8.ESV": { key, book, bookTitle, chapter, version, versionId, updatedAt, items: [...] } }
  let savedChaptersMap = {};

  // DOM Elements
  let styleEl = null;
  let stageEl = null;
  let svgEl = null;
  let highlightsGroupEl = null;
  let marksGroupEl = null;
  let previewGroupEl = null;
  let notesLayerEl = null;
  let mismatchBannerEl = null;
  let dockEl = null;
  let savedPopoverEl = null;
  let replaceModalEl = null;
  let resizeObserver = null;
  let relayoutRaf = null;

  // Cached word map for current chapter DOM
  let wordMapCache = {
    chapterEl: null,
    passageKey: "",
    tokens: [],
    byUsfm: new Map()
  };

  // Interactive gesture state
  let dragState = null;

  /* ============================================================================
   * 1. Self-Contained Stylesheet (Injected only when Sermon Mode loads)
   * ============================================================================ */
  function ensureStylesInjected() {
    if (styleEl && styleEl.isConnected) return;
    styleEl = document.getElementById("bbe-sermon-mode-styles");
    if (styleEl) return;

    styleEl = document.createElement("style");
    styleEl.id = "bbe-sermon-mode-styles";
    styleEl.textContent = `
      :root,
      html.bbe-on.bbe-theme-light {
        --bbe-sermon-adaptive-ink: #1e293b;
        --bbe-sermon-note-halo: rgba(255, 255, 255, 0.90);
        --bbe-sm-bg: rgba(255, 255, 255, 0.97);
        --bbe-sm-border: #cbd5e1;
        --bbe-sm-shadow: 0 12px 32px -4px rgba(15, 23, 42, 0.16), 0 4px 12px -2px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.05);
        --bbe-sm-text: #1e293b;
        --bbe-sm-muted: #64748b;
        --bbe-sm-accent: #2563eb;
        --bbe-sm-btn-bg: #f1f5f9;
        --bbe-sm-btn-border: #cbd5e1;
        --bbe-sm-btn-text: #334155;
        --bbe-sm-btn-hover-bg: #e2e8f0;
        --bbe-sm-btn-hover-text: #0f172a;
        --bbe-sm-active-bg: #2563eb;
        --bbe-sm-active-border: #1d4ed8;
        --bbe-sm-active-text: #ffffff;
        --bbe-sm-divider: #e2e8f0;
        --bbe-sm-swatch-border: rgba(15, 23, 42, 0.25);
        --bbe-sm-swatch-active-border: #0f172a;
      }

      /* System Dark & Night Dark Theme — Elevated lighter slate so it stands out from #181a20 */
      html.dark,
      html.bbe-on.bbe-theme-dark {
        --bbe-sermon-adaptive-ink: #f8fafc;
        --bbe-sermon-note-halo: rgba(15, 23, 42, 0.88);
        --bbe-sm-bg: rgba(36, 42, 56, 0.97);
        --bbe-sm-border: #4e5b78;
        --bbe-sm-shadow: 0 14px 36px rgba(0, 0, 0, 0.68), 0 0 0 1px rgba(148, 163, 184, 0.22);
        --bbe-sm-text: #f1f5f9;
        --bbe-sm-muted: #94a3b8;
        --bbe-sm-accent: #60a5fa;
        --bbe-sm-btn-bg: #2e3648;
        --bbe-sm-btn-border: #414c63;
        --bbe-sm-btn-text: #cbd5e1;
        --bbe-sm-btn-hover-bg: #3b455c;
        --bbe-sm-btn-hover-text: #ffffff;
        --bbe-sm-active-bg: #3b82f6;
        --bbe-sm-active-border: #60a5fa;
        --bbe-sm-active-text: #ffffff;
        --bbe-sm-divider: rgba(148, 163, 184, 0.22);
        --bbe-sm-swatch-border: rgba(255, 255, 255, 0.30);
        --bbe-sm-swatch-active-border: #ffffff;
      }
      @media (prefers-color-scheme: dark) {
        html.bbe-theme-system:not(.bbe-theme-light):not(.bbe-theme-sepia):not(.bbe-theme-green):not(.bbe-theme-historical) {
          --bbe-sermon-adaptive-ink: #f8fafc;
          --bbe-sermon-note-halo: rgba(15, 23, 42, 0.88);
          --bbe-sm-bg: rgba(36, 42, 56, 0.97);
          --bbe-sm-border: #4e5b78;
          --bbe-sm-shadow: 0 14px 36px rgba(0, 0, 0, 0.68), 0 0 0 1px rgba(148, 163, 184, 0.22);
          --bbe-sm-text: #f1f5f9;
          --bbe-sm-muted: #94a3b8;
          --bbe-sm-accent: #60a5fa;
          --bbe-sm-btn-bg: #2e3648;
          --bbe-sm-btn-border: #414c63;
          --bbe-sm-btn-text: #cbd5e1;
          --bbe-sm-btn-hover-bg: #3b455c;
          --bbe-sm-btn-hover-text: #ffffff;
          --bbe-sm-active-bg: #3b82f6;
          --bbe-sm-active-border: #60a5fa;
          --bbe-sm-active-text: #ffffff;
          --bbe-sm-divider: rgba(148, 163, 184, 0.22);
          --bbe-sm-swatch-border: rgba(255, 255, 255, 0.30);
          --bbe-sm-swatch-active-border: #ffffff;
        }
      }

      /* Warm Paper / Sepia Theme */
      html.bbe-on.bbe-theme-sepia {
        --bbe-sermon-adaptive-ink: #2c2825;
        --bbe-sermon-note-halo: rgba(251, 240, 217, 0.92);
        --bbe-sm-bg: rgba(244, 230, 200, 0.97);
        --bbe-sm-border: #c5ad82;
        --bbe-sm-shadow: 0 12px 32px rgba(85, 60, 25, 0.22), 0 2px 8px rgba(85, 60, 25, 0.12);
        --bbe-sm-text: #2c2825;
        --bbe-sm-muted: #786652;
        --bbe-sm-accent: #8c531b;
        --bbe-sm-btn-bg: #ebe0c3;
        --bbe-sm-btn-border: #d5c19a;
        --bbe-sm-btn-text: #383028;
        --bbe-sm-btn-hover-bg: #dfceab;
        --bbe-sm-btn-hover-text: #1a1614;
        --bbe-sm-active-bg: #8c531b;
        --bbe-sm-active-border: #734213;
        --bbe-sm-active-text: #ffffff;
        --bbe-sm-divider: #d9c7a3;
        --bbe-sm-swatch-border: rgba(44, 40, 37, 0.28);
        --bbe-sm-swatch-active-border: #2c2825;
      }

      /* OLED Pitch Black Theme — Distinct graphite card with metallic rim so it pops off #000000 */
      html.bbe-on.bbe-theme-oled {
        --bbe-sermon-adaptive-ink: #f8fafc;
        --bbe-sermon-note-halo: rgba(10, 10, 12, 0.90);
        --bbe-sm-bg: rgba(24, 24, 28, 0.98);
        --bbe-sm-border: #45454f;
        --bbe-sm-shadow: 0 14px 36px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(255, 255, 255, 0.16);
        --bbe-sm-text: #f4f4f5;
        --bbe-sm-muted: #a1a1aa;
        --bbe-sm-accent: #38bdf8;
        --bbe-sm-btn-bg: #232329;
        --bbe-sm-btn-border: #363640;
        --bbe-sm-btn-text: #d4d4d8;
        --bbe-sm-btn-hover-bg: #303038;
        --bbe-sm-btn-hover-text: #ffffff;
        --bbe-sm-active-bg: #0284c7;
        --bbe-sm-active-border: #38bdf8;
        --bbe-sm-active-text: #ffffff;
        --bbe-sm-divider: #32323a;
        --bbe-sm-swatch-border: rgba(255, 255, 255, 0.32);
        --bbe-sm-swatch-active-border: #ffffff;
      }

      /* Midnight Navy Theme — Elevated royal navy with cyan rim */
      html.bbe-on.bbe-theme-blue {
        --bbe-sermon-adaptive-ink: #f0f9ff;
        --bbe-sermon-note-halo: rgba(11, 19, 41, 0.88);
        --bbe-sm-bg: rgba(21, 37, 77, 0.97);
        --bbe-sm-border: rgba(56, 189, 248, 0.45);
        --bbe-sm-shadow: 0 14px 36px rgba(3, 7, 18, 0.75), 0 0 0 1px rgba(56, 189, 248, 0.18);
        --bbe-sm-text: #f0f9ff;
        --bbe-sm-muted: #93c5fd;
        --bbe-sm-accent: #38bdf8;
        --bbe-sm-btn-bg: #1c3163;
        --bbe-sm-btn-border: #2a4585;
        --bbe-sm-btn-text: #cbd5e1;
        --bbe-sm-btn-hover-bg: #253f7d;
        --bbe-sm-btn-hover-text: #ffffff;
        --bbe-sm-active-bg: #0284c7;
        --bbe-sm-active-border: #38bdf8;
        --bbe-sm-active-text: #ffffff;
        --bbe-sm-divider: rgba(56, 189, 248, 0.24);
        --bbe-sm-swatch-border: rgba(255, 255, 255, 0.30);
        --bbe-sm-swatch-active-border: #ffffff;
      }

      /* Sage Herb Theme */
      html.bbe-on.bbe-theme-green {
        --bbe-sermon-adaptive-ink: #1b2e20;
        --bbe-sermon-note-halo: rgba(237, 244, 236, 0.92);
        --bbe-sm-bg: rgba(226, 239, 225, 0.97);
        --bbe-sm-border: #99be9e;
        --bbe-sm-shadow: 0 12px 32px rgba(20, 50, 28, 0.16), 0 2px 8px rgba(20, 50, 28, 0.08);
        --bbe-sm-text: #1b2e20;
        --bbe-sm-muted: #4b6852;
        --bbe-sm-accent: #15803d;
        --bbe-sm-btn-bg: #d4e6d3;
        --bbe-sm-btn-border: #b2cfb6;
        --bbe-sm-btn-text: #253d2b;
        --bbe-sm-btn-hover-bg: #c3dbc2;
        --bbe-sm-btn-hover-text: #112215;
        --bbe-sm-active-bg: #15803d;
        --bbe-sm-active-border: #166534;
        --bbe-sm-active-text: #ffffff;
        --bbe-sm-divider: #bdd6c0;
        --bbe-sm-swatch-border: rgba(27, 46, 32, 0.26);
        --bbe-sm-swatch-active-border: #1b2e20;
      }

      /* Historical (Ancient Scroll) Theme */
      html.bbe-on.bbe-theme-historical {
        --bbe-sermon-adaptive-ink: #2b1d10;
        --bbe-sermon-note-halo: rgba(238, 223, 188, 0.90);
        --bbe-sm-bg: rgba(233, 216, 176, 0.97);
        --bbe-sm-border: rgba(110, 72, 30, 0.65);
        --bbe-sm-shadow: 0 12px 32px rgba(0, 0, 0, 0.42), inset 0 0 18px rgba(140, 100, 50, 0.24);
        --bbe-sm-text: #2b1d10;
        --bbe-sm-muted: #6b4e31;
        --bbe-sm-accent: #8b2a1a;
        --bbe-sm-btn-bg: rgba(247, 236, 207, 0.88);
        --bbe-sm-btn-border: #c6ab72;
        --bbe-sm-btn-text: #2b1d10;
        --bbe-sm-btn-hover-bg: #fbf2d9;
        --bbe-sm-btn-hover-text: #1a1008;
        --bbe-sm-active-bg: #6b3e1e;
        --bbe-sm-active-border: #3e2711;
        --bbe-sm-active-text: #fbf2d9;
        --bbe-sm-divider: rgba(139, 106, 61, 0.38);
        --bbe-sm-swatch-border: rgba(43, 29, 16, 0.32);
        --bbe-sm-swatch-active-border: #2b1d10;
      }

      /* Prevent any inner container on Bible.com from spawning a nested/broken scrollbar next to Scripture */
      html.bbe-sermon-active [class*="_yv-bible-text"],
      html.bbe-sermon-active [class*="_chapter"]:not(#bbe-compare-grid *),
      html.bbe-sermon-active [class*="_reader"],
      html.bbe-sermon-active [class*="_bible-reader"],
      html.bbe-sermon-active div:has(> [class*="_yv-bible-text"]) {
        overflow: visible !important;
        overflow-x: visible !important;
        overflow-y: visible !important;
      }

      /* Expanded Line Spacing & Side Margin Room ("Sermon Stage") */
      html.bbe-sermon-active.bbe-sermon-expand-spacing [class*="_chapter"]:not(#bbe-compare-grid *) {
        line-height: 2.45 !important;
        word-spacing: 0.08em !important;
        padding-top: 24px !important;
        padding-bottom: 44px !important;
        padding-left: clamp(36px, 8vw, 115px) !important;
        padding-right: clamp(44px, 10vw, 150px) !important;
        box-sizing: border-box !important;
      }
      html.bbe-sermon-active.bbe-sermon-expand-spacing [class*="_chapter"]:not(#bbe-compare-grid *) [class*="_verse"] {
        line-height: 2.45 !important;
      }

      /* Prevent text selection while drawing tools are active */
      html.bbe-sermon-active.bbe-sermon-drawing [class*="_chapter"]:not(#bbe-compare-grid *) {
        user-select: none !important;
        -webkit-user-select: none !important;
      }
      html.bbe-sermon-active[data-bbe-sermon-tool="circle"] [class*="_chapter"]:not(#bbe-compare-grid *),
      html.bbe-sermon-active[data-bbe-sermon-tool="box"] [class*="_chapter"]:not(#bbe-compare-grid *),
      html.bbe-sermon-active[data-bbe-sermon-tool="underline"] [class*="_chapter"]:not(#bbe-compare-grid *),
      html.bbe-sermon-active[data-bbe-sermon-tool="highlight"] [class*="_chapter"]:not(#bbe-compare-grid *),
      html.bbe-sermon-active[data-bbe-sermon-tool="arrow"] [class*="_chapter"]:not(#bbe-compare-grid *),
      html.bbe-sermon-active[data-bbe-sermon-tool="pen"] [class*="_chapter"]:not(#bbe-compare-grid *) {
        cursor: crosshair !important;
      }
      html.bbe-sermon-active[data-bbe-sermon-tool="note"] [class*="_chapter"]:not(#bbe-compare-grid *) {
        cursor: text !important;
      }
      html.bbe-sermon-active[data-bbe-sermon-tool="eraser"] [class*="_chapter"]:not(#bbe-compare-grid *) {
        cursor: pointer !important;
      }

      /* Sermon Stage Overlay (Sibling of chapterEl, never mutates chapterEl.innerHTML) */
      #bbe-sermon-stage {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 25;
        overflow: visible;
      }
      #bbe-sermon-svg {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        overflow: visible;
        pointer-events: none;
      }
      #bbe-sermon-svg .bbe-sermon-mark {
        pointer-events: none;
        transition: filter 0.12s ease, opacity 0.12s ease;
      }
      html.bbe-sermon-active[data-bbe-sermon-tool="eraser"] #bbe-sermon-svg .bbe-sermon-mark {
        pointer-events: stroke;
        cursor: pointer;
      }
      html.bbe-sermon-active[data-bbe-sermon-tool="eraser"] #bbe-sermon-svg .bbe-sermon-mark-fill {
        pointer-events: all;
        cursor: pointer;
      }
      html.bbe-sermon-active[data-bbe-sermon-tool="eraser"] #bbe-sermon-svg .bbe-sermon-mark-group:hover {
        filter: drop-shadow(0 0 6px rgba(244, 63, 94, 0.85));
        opacity: 0.55;
      }

      /* Word Hover Snap Preview Box */
      .bbe-sermon-word-snap {
        fill: rgba(14, 165, 233, 0.10);
        stroke: rgba(14, 165, 233, 0.45);
        stroke-width: 1.2;
        stroke-dasharray: 3 2;
        rx: 4px;
        ry: 4px;
      }

      /* Handwritten Notes Layer */
      #bbe-sermon-notes-layer {
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: visible;
      }
      .bbe-sermon-note {
        position: absolute;
        pointer-events: auto;
        min-width: 68px;
        max-width: 240px;
        padding: 3px 7px;
        border-radius: 6px;
        font-family: "Segoe Print", "Bradley Hand", "Chalkboard SE", "Ink Free", "Caveat", "Comic Sans MS", cursive !important;
        font-size: 14.5px;
        font-weight: 600;
        line-height: 1.28;
        letter-spacing: 0.01em;
        transform: rotate(-1.1deg);
        transform-origin: left top;
        background: transparent;
        text-shadow:
          0 0 6px var(--bbe-sermon-note-halo),
          0 0 10px var(--bbe-sermon-note-halo);
        border: 1px dashed transparent;
        transition: border-color 0.14s ease, background-color 0.14s ease, box-shadow 0.14s ease;
        cursor: grab;
        user-select: none;
        z-index: 26;
      }
      .bbe-sermon-note:hover,
      .bbe-sermon-note.editing {
        border-color: var(--bbe-sm-border);
        background: var(--bbe-sermon-note-halo);
        box-shadow: 0 3px 12px rgba(0, 0, 0, 0.14);
        z-index: 30;
      }
      .bbe-sermon-note.dragging {
        cursor: grabbing;
        opacity: 0.92;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.22);
        z-index: 35;
      }
      html.bbe-sermon-active[data-bbe-sermon-tool="eraser"] .bbe-sermon-note:hover {
        border-color: #f43f5e !important;
        background: rgba(244, 63, 94, 0.16) !important;
        cursor: pointer !important;
      }
      .bbe-sermon-note-text {
        outline: none;
        white-space: pre-wrap;
        word-break: break-word;
        min-height: 18px;
        cursor: inherit;
      }
      .bbe-sermon-note.editing .bbe-sermon-note-text {
        cursor: text;
        user-select: text;
        -webkit-user-select: text;
      }
      .bbe-sermon-note-text:empty::before {
        content: attr(data-placeholder);
        opacity: 0.55;
        font-style: italic;
      }
      .bbe-sermon-note-del {
        position: absolute;
        top: -8px;
        right: -8px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        border: none;
        background: #ef4444;
        color: #fff;
        font-family: system-ui, sans-serif !important;
        font-size: 11px;
        font-weight: 700;
        line-height: 18px;
        text-align: center;
        padding: 0;
        cursor: pointer;
        opacity: 0;
        transform: scale(0.8);
        transition: opacity 0.14s ease, transform 0.14s ease;
        box-shadow: 0 2px 6px rgba(0,0,0,0.25);
      }
      .bbe-sermon-note:hover .bbe-sermon-note-del {
        opacity: 1;
        transform: scale(1);
      }

      /* Translation Mismatch Banner */
      #bbe-sermon-mismatch-banner {
        position: sticky;
        top: 68px;
        z-index: 40;
        margin: 0 auto 12px auto;
        max-width: 640px;
        display: none;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 8px 14px;
        border-radius: 12px;
        background: var(--bbe-sm-bg);
        color: var(--bbe-sm-text);
        border: 1.5px solid var(--bbe-sm-border);
        box-shadow: var(--bbe-sm-shadow);
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 12.5px;
        pointer-events: auto;
        backdrop-filter: blur(12px);
      }
      #bbe-sermon-mismatch-banner.show {
        display: flex;
      }
      .bbe-sermon-mismatch-btn {
        background: var(--bbe-sm-active-bg);
        color: var(--bbe-sm-active-text);
        border: 1px solid var(--bbe-sm-active-border);
        border-radius: 7px;
        padding: 5px 11px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
        transition: filter 0.15s ease;
      }
      .bbe-sermon-mismatch-btn:hover {
        filter: brightness(1.08);
      }

      /* Floating Draggable Sermon Dock (Themed & Elevated) */
      #bbe-sermon-dock {
        position: fixed;
        top: 96px;
        left: 16px;
        z-index: 2147483640;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 8px;
        width: 124px;
        border-radius: 15px;
        background: var(--bbe-sm-bg);
        color: var(--bbe-sm-text);
        border: 1.5px solid var(--bbe-sm-border);
        box-shadow: var(--bbe-sm-shadow);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        user-select: none;
        transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, color 0.18s ease;
      }
      .bbe-sermon-dock-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 2px 4px 5px 4px;
        border-bottom: 1px solid var(--bbe-sm-divider);
        cursor: move;
      }
      .bbe-sermon-dock-title {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--bbe-sm-accent);
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .bbe-sermon-dock-close {
        background: transparent;
        border: none;
        color: var(--bbe-sm-muted);
        font-size: 13px;
        line-height: 1;
        padding: 2px 5px;
        border-radius: 5px;
        cursor: pointer;
        transition: background 0.12s ease, color 0.12s ease;
      }
      .bbe-sermon-dock-close:hover {
        color: var(--bbe-sm-text);
        background: var(--bbe-sm-btn-hover-bg);
      }

      /* Tool Grid (2 columns for compact vertical palette) */
      .bbe-sermon-tools-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4px;
      }
      .bbe-sermon-tool-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        padding: 6px 3px;
        border-radius: 8px;
        border: 1px solid var(--bbe-sm-btn-border);
        background: var(--bbe-sm-btn-bg);
        color: var(--bbe-sm-btn-text);
        font-size: 10.5px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.13s ease;
      }
      .bbe-sermon-tool-btn.full-row {
        grid-column: 1 / -1;
        flex-direction: row;
        gap: 6px;
        padding: 5px 8px;
      }
      .bbe-sermon-tool-btn:hover {
        background: var(--bbe-sm-btn-hover-bg);
        color: var(--bbe-sm-btn-hover-text);
      }
      .bbe-sermon-tool-btn.active {
        background: var(--bbe-sm-active-bg) !important;
        border-color: var(--bbe-sm-active-border) !important;
        color: var(--bbe-sm-active-text) !important;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.16);
      }
      .bbe-sermon-tool-btn[data-tool="eraser"].active {
        background: #e11d48 !important;
        border-color: #be123c !important;
        color: #ffffff !important;
      }
      .bbe-sermon-tool-icon {
        font-size: 14px;
        line-height: 1;
      }

      /* Ink Color Swatches */
      .bbe-sermon-colors-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 5px 3px;
        border-top: 1px solid var(--bbe-sm-divider);
        border-bottom: 1px solid var(--bbe-sm-divider);
      }
      .bbe-sermon-color-btn {
        position: relative;
        width: 20px;
        height: 20px;
        border-radius: 50% !important;
        border: none !important;
        outline: none !important;
        overflow: hidden !important;
        background-origin: border-box !important;
        background-clip: border-box !important;
        background-repeat: no-repeat !important;
        background-size: 100% 100% !important;
        box-shadow: inset 0 0 0 1.5px var(--bbe-sm-swatch-border);
        cursor: pointer;
        padding: 0 !important;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.12s ease, box-shadow 0.12s ease;
      }
      .bbe-sermon-color-btn svg {
        width: 100%;
        height: 100%;
        display: block;
        border-radius: 50%;
        pointer-events: none;
      }
      .bbe-sermon-color-btn:hover {
        transform: scale(1.14);
      }
      .bbe-sermon-color-btn.active {
        transform: scale(1.16);
        box-shadow:
          inset 0 0 0 1.5px var(--bbe-sm-swatch-active-border),
          0 0 0 2px var(--bbe-sm-bg),
          0 0 0 3.5px var(--bbe-sm-accent);
      }

      /* Action Buttons (Undo, Clear, Save, Saved x/5, Print) */
      .bbe-sermon-actions-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4px;
      }
      .bbe-sermon-action-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 5px 6px;
        border-radius: 7px;
        border: 1px solid var(--bbe-sm-btn-border);
        background: var(--bbe-sm-btn-bg);
        color: var(--bbe-sm-btn-text);
        font-size: 10.5px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.13s ease;
        white-space: nowrap;
      }
      .bbe-sermon-action-btn.full-row {
        grid-column: 1 / -1;
      }
      .bbe-sermon-action-btn:hover:not(:disabled) {
        background: var(--bbe-sm-btn-hover-bg);
        color: var(--bbe-sm-btn-hover-text);
      }
      .bbe-sermon-action-btn:disabled {
        opacity: 0.42;
        cursor: default;
      }
      .bbe-sermon-action-btn.dirty-save {
        background: rgba(16, 185, 129, 0.20);
        border-color: #10b981;
        color: var(--bbe-sm-text);
      }
      .bbe-sermon-action-btn.print-btn {
        background: var(--bbe-sm-active-bg);
        border-color: var(--bbe-sm-active-border);
        color: var(--bbe-sm-active-text);
      }
      .bbe-sermon-action-btn.print-btn:hover {
        filter: brightness(1.08);
        color: var(--bbe-sm-active-text);
      }

      /* Saved (x/5) Popover Menu */
      #bbe-sermon-saved-popover {
        position: absolute;
        left: calc(100% + 10px);
        bottom: 0;
        width: 295px;
        padding: 12px;
        border-radius: 13px;
        background: var(--bbe-sm-bg);
        color: var(--bbe-sm-text);
        border: 1.5px solid var(--bbe-sm-border);
        box-shadow: var(--bbe-sm-shadow);
        backdrop-filter: blur(14px);
        display: none;
        flex-direction: column;
        gap: 8px;
        z-index: 2147483645;
      }
      #bbe-sermon-saved-popover.open {
        display: flex;
      }
      #bbe-sermon-saved-popover.flip-left {
        left: auto;
        right: calc(100% + 10px);
      }
      .bbe-sermon-pop-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 12px;
        font-weight: 700;
        color: var(--bbe-sm-accent);
        padding-bottom: 6px;
        border-bottom: 1px solid var(--bbe-sm-divider);
      }
      .bbe-sermon-saved-list {
        display: flex;
        flex-direction: column;
        gap: 5px;
        max-height: 220px;
        overflow-y: auto;
      }
      .bbe-sermon-saved-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 6px 8px;
        border-radius: 8px;
        background: var(--bbe-sm-btn-bg);
        border: 1px solid var(--bbe-sm-btn-border);
        font-size: 11.5px;
      }
      .bbe-sermon-saved-item.current {
        border-color: var(--bbe-sm-accent);
      }
      .bbe-sermon-saved-info {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1;
        cursor: pointer;
      }
      .bbe-sermon-saved-title {
        font-weight: 600;
        color: var(--bbe-sm-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .bbe-sermon-saved-meta {
        font-size: 10px;
        color: var(--bbe-sm-muted);
      }
      .bbe-sermon-saved-del {
        background: transparent;
        border: none;
        color: var(--bbe-sm-muted);
        cursor: pointer;
        padding: 3px 5px;
        border-radius: 5px;
        font-size: 12px;
      }
      .bbe-sermon-saved-del:hover {
        color: #f43f5e;
        background: rgba(244, 63, 94, 0.15);
      }
      .bbe-sermon-mode-row {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding-top: 6px;
        border-top: 1px solid var(--bbe-sm-divider);
        font-size: 10.5px;
        color: var(--bbe-sm-muted);
      }
      .bbe-sermon-mode-select {
        background: var(--bbe-sm-btn-bg);
        color: var(--bbe-sm-text);
        border: 1px solid var(--bbe-sm-btn-border);
        border-radius: 6px;
        padding: 4px 6px;
        font-size: 11px;
        outline: none;
      }

      /* 5/5 Slot Replacement Prompt Modal */
      #bbe-sermon-replace-modal {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        background: rgba(2, 6, 23, 0.55);
        backdrop-filter: blur(4px);
        display: none;
        align-items: center;
        justify-content: center;
        font-family: system-ui, -apple-system, sans-serif;
      }
      #bbe-sermon-replace-modal.open {
        display: flex;
      }
      .bbe-sermon-modal-card {
        width: min(92vw, 420px);
        background: var(--bbe-sm-bg);
        color: var(--bbe-sm-text);
        border: 1.5px solid var(--bbe-sm-border);
        border-radius: 14px;
        padding: 18px;
        box-shadow: var(--bbe-sm-shadow);
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .bbe-sermon-modal-title {
        font-size: 15px;
        font-weight: 700;
        color: var(--bbe-sm-accent);
      }
      .bbe-sermon-modal-desc {
        font-size: 12.5px;
        color: var(--bbe-sm-muted);
        line-height: 1.45;
      }
      .bbe-sermon-replace-btn {
        background: var(--bbe-sm-active-bg);
        color: var(--bbe-sm-active-text);
        border: 1px solid var(--bbe-sm-active-border);
        border-radius: 6px;
        padding: 4px 10px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
      }
      .bbe-sermon-replace-btn:hover {
        filter: brightness(1.08);
      }

      /* Print Header (Only visible when printing) */
      #bbe-sermon-print-header {
        display: none;
      }

      /* Clean Printer-Friendly Sheet (@media print) */
      @media print {
        :root,
        html,
        body {
          --bbe-sermon-adaptive-ink: #111827 !important;
          --bbe-sermon-note-halo: rgba(255, 255, 255, 0.92) !important;
          background: #ffffff !important;
          color: #111827 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        #bbe-bar,
        #bbe-sermon-dock,
        #bbe-sermon-mismatch-banner,
        #bbe-sermon-replace-modal,
        #bbe-drawer,
        #bbe-drawer-backdrop,
        #bbe-hist-backdrop,
        #bbe-toast,
        #bbe-selection-copy-bar,
        #bbe-word-tooltip,
        #bbe-full-chapter-bar,
        .bbe-verse-badge,
        .bbe-verse-highlight-btn,
        header,
        footer,
        nav,
        aside,
        [data-testid*="header"],
        [data-testid*="footer"],
        a[aria-label*="Previous"],
        a[aria-label*="Next"] {
          display: none !important;
        }
        #bbe-sermon-print-header {
          display: flex !important;
          align-items: baseline;
          justify-content: space-between;
          border-bottom: 1.5px solid #cbd5e1;
          padding-bottom: 8px;
          margin-bottom: 16px;
          font-family: Georgia, serif;
          color: #0f172a !important;
        }
        #bbe-sermon-print-header h1 {
          font-size: 20px !important;
          font-weight: 700 !important;
          margin: 0 !important;
          color: #0f172a !important;
        }
        #bbe-sermon-print-header span {
          font-size: 11px !important;
          font-family: system-ui, sans-serif !important;
          color: #64748b !important;
        }
        [class*="_yv-bible-text"],
        [class*="_chapter"]:not(#bbe-compare-grid *),
        [class*="_chapter"]:not(#bbe-compare-grid *) * {
          background: transparent !important;
          color: #111827 !important;
          box-shadow: none !important;
          text-shadow: none !important;
        }
        #bbe-sermon-stage,
        #bbe-sermon-svg,
        #bbe-sermon-notes-layer,
        .bbe-sermon-note {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .bbe-sermon-note-del {
          display: none !important;
        }
      }
    `;
    document.head.appendChild(styleEl);
  }

  /* ============================================================================
   * 2. Storage Management (5-Chapter Limit: FIFO, Prompt, Manual)
   * ============================================================================ */
  function loadSavedChaptersFromStorage() {
    return new Promise((resolve) => {
      try {
        if (typeof chrome !== "undefined" && chrome.runtime?.id && chrome.storage?.local) {
          chrome.storage.local.get({ [STORAGE_KEY]: { chapters: {} } }, (res) => {
            const raw = res && res[STORAGE_KEY] && res[STORAGE_KEY].chapters;
            savedChaptersMap = (raw && typeof raw === "object") ? raw : {};
            resolve(savedChaptersMap);
          });
        } else {
          const raw = localStorage.getItem(STORAGE_KEY);
          savedChaptersMap = raw ? (JSON.parse(raw).chapters || {}) : {};
          resolve(savedChaptersMap);
        }
      } catch (_) {
        savedChaptersMap = {};
        resolve(savedChaptersMap);
      }
    });
  }

  function writeSavedChaptersToStorage() {
    return new Promise((resolve) => {
      const payload = { chapters: savedChaptersMap };
      try {
        if (typeof chrome !== "undefined" && chrome.runtime?.id && chrome.storage?.local) {
          chrome.storage.local.set({ [STORAGE_KEY]: payload }, () => resolve());
        } else {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
          resolve();
        }
      } catch (_) {
        resolve();
      }
    });
  }

  function getSortedSavedChapters() {
    return Object.values(savedChaptersMap).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  function getSaveMode() {
    const s = host && host.getSettings ? host.getSettings() : {};
    return s.sermonSaveMode || "fifo";
  }

  function getMaxSavedChapters() {
    const s = host && host.getSettings ? host.getSettings() : {};
    const n = Number(s.sermonMaxSaved);
    return (n === 10 || n === 20 || n === 40) ? n : MAX_SAVED_CHAPTERS;
  }

  async function commitCurrentChapterToStorage(replaceKey = null) {
    if (!currentChapterKey || !currentPassageMeta) return;
    const maxSlots = getMaxSavedChapters();

    // If chapter has 0 items, remove it from storage if present to free up the slot
    if (items.length === 0) {
      if (savedChaptersMap[currentChapterKey]) {
        delete savedChaptersMap[currentChapterKey];
        await writeSavedChaptersToStorage();
      }
      isDirtyManual = false;
      updateDockState();
      return;
    }

    if (replaceKey && savedChaptersMap[replaceKey] && replaceKey !== currentChapterKey) {
      delete savedChaptersMap[replaceKey];
    }

    const existingKeys = Object.keys(savedChaptersMap);
    const isAlreadySaved = Boolean(savedChaptersMap[currentChapterKey]);

    if (!isAlreadySaved && existingKeys.length >= maxSlots) {
      // Enforce slot cap via FIFO drop of oldest
      const sorted = getSortedSavedChapters();
      while (Object.keys(savedChaptersMap).length >= maxSlots && sorted.length > 0) {
        const oldest = sorted.pop();
        if (oldest && oldest.key && oldest.key !== currentChapterKey) {
          delete savedChaptersMap[oldest.key];
          if (host && host.showToast) {
            host.showToast(`Saved ${currentPassageMeta.bookTitle} ${currentPassageMeta.chapter} (${currentPassageMeta.version}) — replaced oldest slot (${oldest.bookTitle} ${oldest.chapter})`, { icon: "bookmark" });
          }
        }
      }
    }

    savedChaptersMap[currentChapterKey] = {
      key: currentChapterKey,
      book: currentPassageMeta.book,
      bookTitle: currentPassageMeta.bookTitle,
      chapter: String(currentPassageMeta.chapter),
      version: currentPassageMeta.version,
      versionId: currentPassageMeta.versionId,
      updatedAt: Date.now(),
      items: JSON.parse(JSON.stringify(items))
    };

    isDirtyManual = false;
    sessionUnsavedKeys.delete(currentChapterKey);
    await writeSavedChaptersToStorage();
    updateDockState();
  }

  async function handleItemsChanged() {
    const mode = getSaveMode();

    if (mode === "manual") {
      // If all items were cleared on an already-saved chapter, still require Save or allow immediate update?
      isDirtyManual = true;
      updateDockState();
      return;
    }

    const isAlreadySaved = Boolean(savedChaptersMap[currentChapterKey]);
    const savedCount = Object.keys(savedChaptersMap).length;
    const maxSlots = getMaxSavedChapters();

    if (items.length === 0) {
      await commitCurrentChapterToStorage();
      return;
    }

    if (mode === "prompt" && !isAlreadySaved && savedCount >= maxSlots) {
      if (sessionUnsavedKeys.has(currentChapterKey)) {
        isDirtyManual = true;
        updateDockState();
        return;
      }
      openReplaceSlotModal();
      return;
    }

    // Default: "fifo" (or "prompt" when < 5 slots used or updating existing slot)
    await commitCurrentChapterToStorage();
  }

  /* ============================================================================
   * 3. Word Tokenizer & Geometry Mapping (Zero DOM Mutation inside chapterEl)
   * ============================================================================ */
  function isSkippedNode(node, verseEl) {
    let el = node.parentElement;
    while (el && el !== verseEl) {
      const cls = typeof el.className === "string" ? el.className : "";
      const id = el.id || "";
      if (
        id.startsWith("bbe-") ||
        cls.includes("_label") ||
        cls.includes("_note") ||
        cls.includes("footnote") ||
        cls.includes("bbe-verse-")
      ) {
        return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  function getWordMap(chapterEl) {
    if (!chapterEl) return { tokens: [], byUsfm: new Map() };
    const passageKey = (chapterEl.dataset.bbePassageKey || "") + "|" + currentChapterKey + "|" + chapterEl.childNodes.length;
    if (
      wordMapCache.chapterEl === chapterEl &&
      wordMapCache.passageKey === passageKey &&
      wordMapCache.tokens.length > 0 &&
      wordMapCache.tokens[0].node.isConnected &&
      chapterEl.contains(wordMapCache.tokens[0].node)
    ) {
      return wordMapCache;
    }

    const tokens = [];
    const byUsfm = new Map();
    const verseEls = chapterEl.querySelectorAll('[class*="_verse"][data-usfm]');
    const wordRegex = /[\p{L}\p{M}\p{N}'’-]+/gu;

    verseEls.forEach((verseEl) => {
      const usfm = verseEl.getAttribute("data-usfm");
      if (!usfm) return;
      if (!byUsfm.has(usfm)) byUsfm.set(usfm, []);
      const verseList = byUsfm.get(usfm);

      const walker = document.createTreeWalker(verseEl, NodeFilter.SHOW_TEXT, null);
      let textNode;
      while ((textNode = walker.nextNode())) {
        if (isSkippedNode(textNode, verseEl)) continue;
        const val = textNode.nodeValue;
        if (!val || !val.trim()) continue;

        wordRegex.lastIndex = 0;
        let m;
        while ((m = wordRegex.exec(val)) !== null) {
          const tok = {
            globalIndex: tokens.length,
            usfm,
            wordIndex: verseList.length,
            word: m[0],
            node: textNode,
            startOffset: m.index,
            endOffset: m.index + m[0].length
          };
          tokens.push(tok);
          verseList.push(tok);
        }
      }
    });

    wordMapCache = { chapterEl, passageKey, tokens, byUsfm };
    return wordMapCache;
  }

  function getTokenClientRect(tok) {
    if (!tok || !tok.node || !tok.node.isConnected) return null;
    try {
      const range = document.createRange();
      range.setStart(tok.node, tok.startOffset);
      range.setEnd(tok.node, tok.endOffset);
      const rect = range.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) return null;
      return rect;
    } catch (_) {
      return null;
    }
  }

  function findWordTokenAtPoint(clientX, clientY) {
    const chapterEl = host ? host.getChapterEl() : null;
    if (!chapterEl) return null;
    const map = getWordMap(chapterEl);
    if (!map.tokens.length) return null;

    // 1. Direct caret range hit test
    let hitNode = null;
    let hitOffset = 0;
    if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(clientX, clientY);
      if (r) {
        hitNode = r.startContainer;
        hitOffset = r.startOffset;
      }
    } else if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(clientX, clientY);
      if (pos) {
        hitNode = pos.offsetNode;
        hitOffset = pos.offset;
      }
    }

    if (hitNode && hitNode.nodeType === Node.TEXT_NODE && chapterEl.contains(hitNode)) {
      for (let i = 0; i < map.tokens.length; i++) {
        const t = map.tokens[i];
        if (t.node === hitNode && hitOffset >= t.startOffset - 1 && hitOffset <= t.endOffset + 1) {
          const rect = getTokenClientRect(t);
          if (rect && clientY >= rect.top - 12 && clientY <= rect.bottom + 12 && clientX >= rect.left - 14 && clientX <= rect.right + 14) {
            return { token: t, rect };
          }
        }
      }
    }

    // 2. Fallback: scan nearby verse tokens within forgiving mouse tolerance (20px X, 14px Y)
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < map.tokens.length; i++) {
      const t = map.tokens[i];
      const rect = getTokenClientRect(t);
      if (!rect) continue;
      const dx = clientX < rect.left ? rect.left - clientX : (clientX > rect.right ? clientX - rect.right : 0);
      const dy = clientY < rect.top ? rect.top - clientY : (clientY > rect.bottom ? clientY - rect.bottom : 0);
      if (dx <= 20 && dy <= 14) {
        const d = dx + dy * 1.6;
        if (d < bestDist) {
          bestDist = d;
          best = { token: t, rect };
          if (d === 0) break;
        }
      }
    }
    return best;
  }

  function resolveTokenByAnchor(map, usfm, wordIndex) {
    const list = map.byUsfm.get(usfm);
    if (!list || !list.length) return null;
    const clampedIdx = Math.max(0, Math.min(list.length - 1, wordIndex));
    return list[clampedIdx] || null;
  }

  function getPhraseLineBoxes(item, map, stageRect) {
    const startTok = resolveTokenByAnchor(map, item.usfm, item.startWord);
    const endTok = resolveTokenByAnchor(map, item.endUsfm || item.usfm, item.endWord ?? item.startWord);
    if (!startTok || !endTok) return [];

    const i1 = Math.min(startTok.globalIndex, endTok.globalIndex);
    const i2 = Math.max(startTok.globalIndex, endTok.globalIndex);

    const wordBoxes = [];
    for (let i = i1; i <= i2; i++) {
      const r = getTokenClientRect(map.tokens[i]);
      if (!r) continue;
      wordBoxes.push({
        x: r.left - stageRect.left,
        y: r.top - stageRect.top,
        w: r.width,
        h: r.height,
        right: r.right - stageRect.left,
        bottom: r.bottom - stageRect.top
      });
    }
    if (!wordBoxes.length) return [];

    // Group words on the same horizontal visual line
    const lines = [];
    for (const wb of wordBoxes) {
      const last = lines[lines.length - 1];
      if (!last || Math.abs(wb.y - last.y) > last.h * 0.58) {
        lines.push({ ...wb });
      } else {
        last.x = Math.min(last.x, wb.x);
        last.y = Math.min(last.y, wb.y);
        last.right = Math.max(last.right, wb.right);
        last.bottom = Math.max(last.bottom, wb.bottom);
        last.w = last.right - last.x;
        last.h = last.bottom - last.y;
      }
    }
    return lines;
  }

  function findNearestVerseAnchor(clientX, clientY, stageRect) {
    const chapterEl = host ? host.getChapterEl() : null;
    if (!chapterEl) return null;
    const verseEls = chapterEl.querySelectorAll('[class*="_verse"][data-usfm]');
    let bestUsfm = null;
    let bestRect = null;
    let bestDist = Infinity;

    verseEls.forEach((vEl) => {
      const usfm = vEl.getAttribute("data-usfm");
      if (!usfm) return;
      const r = vEl.getBoundingClientRect();
      if (!r || (r.width === 0 && r.height === 0)) return;
      const dy = clientY < r.top ? r.top - clientY : (clientY > r.bottom ? clientY - r.bottom : 0);
      const dx = clientX < r.left ? r.left - clientX : (clientX > r.right ? clientX - r.right : 0);
      const dist = dy * 2 + dx * 0.25;
      if (dist < bestDist) {
        bestDist = dist;
        bestUsfm = usfm;
        bestRect = r;
      }
    });

    if (!bestUsfm || !bestRect) {
      return {
        usfm: "STAGE",
        rx: (clientX - stageRect.left) / Math.max(1, stageRect.width),
        ry: (clientY - stageRect.top) / Math.max(1, stageRect.height)
      };
    }

    const vTop = bestRect.top - stageRect.top;
    return {
      usfm: bestUsfm,
      rx: (clientX - stageRect.left) / Math.max(1, stageRect.width),
      dy: (clientY - stageRect.top) - vTop
    };
  }

  function resolveVerseAnchorToStagePoint(anchor, stageRect) {
    const chapterEl = host ? host.getChapterEl() : null;
    if (!chapterEl || !anchor) return { x: 0, y: 0 };

    if (anchor.usfm && anchor.usfm !== "STAGE") {
      const vEl = chapterEl.querySelector(`[class*="_verse"][data-usfm="${anchor.usfm}"]`);
      if (vEl) {
        const r = vEl.getBoundingClientRect();
        if (r && (r.width > 0 || r.height > 0)) {
          const vTop = r.top - stageRect.top;
          return {
            x: (anchor.rx ?? 0.5) * stageRect.width,
            y: vTop + (anchor.dy ?? 0)
          };
        }
      }
    }
    return {
      x: (anchor.rx ?? 0.5) * stageRect.width,
      y: (anchor.ry ?? 0.5) * stageRect.height
    };
  }

  /* ============================================================================
   * 4. Hand-Drawn SVG Path Builders ("Look at the Book" Visual Style)
   * ============================================================================ */
  function buildHandCirclePath(box) {
    const padX = Math.min(10, Math.max(5, box.w * 0.08));
    const padY = 4.5;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const rx = box.w / 2 + padX;
    const ry = box.h / 2 + padY;

    // Slight organic hand-drawn loop starting and slightly overlapping at top-right
    const startX = cx + rx * 0.55;
    const startY = cy - ry * 0.86;
    const leftX = cx - rx * 1.02;
    const rightX = cx + rx * 1.02;
    const topY = cy - ry * 1.02;
    const botY = cy + ry * 0.98;
    const endX = cx + rx * 0.35;
    const endY = cy - ry * 0.96;

    return [
      `M ${startX.toFixed(1)} ${startY.toFixed(1)}`,
      `C ${(cx - rx * 0.35).toFixed(1)} ${(topY - 1.5).toFixed(1)}, ${leftX.toFixed(1)} ${(cy - ry * 0.55).toFixed(1)}, ${leftX.toFixed(1)} ${cy.toFixed(1)}`,
      `C ${leftX.toFixed(1)} ${(cy + ry * 0.65).toFixed(1)}, ${(cx - rx * 0.45).toFixed(1)} ${(botY + 1).toFixed(1)}, ${cx.toFixed(1)} ${botY.toFixed(1)}`,
      `C ${(cx + rx * 0.52).toFixed(1)} ${(botY - 0.5).toFixed(1)}, ${rightX.toFixed(1)} ${(cy + ry * 0.58).toFixed(1)}, ${rightX.toFixed(1)} ${(cy - 0.5).toFixed(1)}`,
      `C ${rightX.toFixed(1)} ${(cy - ry * 0.68).toFixed(1)}, ${(cx + rx * 0.72).toFixed(1)} ${topY.toFixed(1)}, ${endX.toFixed(1)} ${endY.toFixed(1)}`
    ].join(" ");
  }

  function buildHandBoxPath(box) {
    const x = box.x - 5;
    const y = box.y - 3;
    const w = box.w + 10;
    const h = box.h + 6;
    const r = Math.min(7, h * 0.28);
    return [
      `M ${(x + r).toFixed(1)} ${y.toFixed(1)}`,
      `Q ${(x + w * 0.5).toFixed(1)} ${(y - 0.8).toFixed(1)} ${(x + w - r).toFixed(1)} ${y.toFixed(1)}`,
      `Q ${(x + w).toFixed(1)} ${y.toFixed(1)} ${(x + w).toFixed(1)} ${(y + r).toFixed(1)}`,
      `L ${(x + w).toFixed(1)} ${(y + h - r).toFixed(1)}`,
      `Q ${(x + w).toFixed(1)} ${(y + h).toFixed(1)} ${(x + w - r).toFixed(1)} ${(y + h).toFixed(1)}`,
      `Q ${(x + w * 0.5).toFixed(1)} ${(y + h + 0.8).toFixed(1)} ${(x + r).toFixed(1)} ${(y + h).toFixed(1)}`,
      `Q ${x.toFixed(1)} ${(y + h).toFixed(1)} ${x.toFixed(1)} ${(y + h - r).toFixed(1)}`,
      `L ${x.toFixed(1)} ${(y + r).toFixed(1)}`,
      `Q ${x.toFixed(1)} ${y.toFixed(1)} ${(x + r).toFixed(1)} ${y.toFixed(1)} Z`
    ].join(" ");
  }

  function buildUnderlinePaths(box, isDouble) {
    const x1 = box.x - 2;
    const x2 = box.x + box.w + 2;
    const midX = (x1 + x2) / 2;
    const y1 = box.y + box.h + 2;
    const paths = [
      `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${midX.toFixed(1)} ${(y1 - 0.9).toFixed(1)} ${x2.toFixed(1)} ${(y1 + 0.3).toFixed(1)}`
    ];
    if (isDouble) {
      const y2 = y1 + 4;
      paths.push(
        `M ${(x1 + 1).toFixed(1)} ${y2.toFixed(1)} Q ${midX.toFixed(1)} ${(y2 - 0.7).toFixed(1)} ${(x2 - 1).toFixed(1)} ${(y2 + 0.3).toFixed(1)}`
      );
    }
    return paths;
  }

  function clipPointToWordBoxEdge(box, targetPt, pad = 6) {
    if (!box) return { x: targetPt.x, y: targetPt.y };
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const rx = box.w / 2 + pad;
    const ry = box.h / 2 + pad;
    const dx = targetPt.x - cx;
    const dy = targetPt.y - cy;
    if (dx === 0 && dy === 0) return { x: cx, y: cy };
    const angle = Math.atan2(dy, dx);
    return {
      x: cx + Math.cos(angle) * rx,
      y: cy + Math.sin(angle) * ry
    };
  }

  function buildCurvedArrowPaths(p1, p2, curveDir = 1) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 6) return null;

    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    let cx, cy;

    if (Math.abs(dy) < 26) {
      // Mostly same-line connection: arc smoothly above (or below if flipped)
      const bow = Math.min(54, Math.max(22, dist * 0.24)) * curveDir;
      cx = midX;
      cy = Math.min(p1.y, p2.y) - bow;
    } else {
      // Multi-line connection: curve perpendicular to the chord
      const nx = -dy / dist;
      const ny = dx / dist;
      const bow = Math.min(80, Math.max(26, dist * 0.22)) * curveDir;
      cx = midX + nx * bow;
      cy = midY + ny * bow;
    }

    const shaftPath = `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;

    // Tangent vector at end of quadratic Bezier is (p2 - controlPoint)
    const tx = p2.x - cx;
    const ty = p2.y - cy;
    const angle = Math.atan2(ty, tx);
    const headLen = 10.5;
    const wingAngle = 0.48;

    const wx1 = p2.x - headLen * Math.cos(angle - wingAngle);
    const wy1 = p2.y - headLen * Math.sin(angle - wingAngle);
    const wx2 = p2.x - headLen * Math.cos(angle + wingAngle);
    const wy2 = p2.y - headLen * Math.sin(angle + wingAngle);

    const headPath = `M ${wx1.toFixed(1)} ${wy1.toFixed(1)} L ${p2.x.toFixed(1)} ${p2.y.toFixed(1)} L ${wx2.toFixed(1)} ${wy2.toFixed(1)}`;
    return { shaftPath, headPath };
  }

  function buildSmoothFreehandPath(pts) {
    if (!pts || !pts.length) return "";
    if (pts.length === 1) {
      const p = pts[0];
      return `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} L ${(p.x + 0.5).toFixed(1)} ${(p.y + 0.5).toFixed(1)}`;
    }
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      d += ` Q ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
    }
    const last = pts[pts.length - 1];
    d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
    return d;
  }

  /* ============================================================================
   * 5. Stage Rendering Engine
   * ============================================================================ */
  function createSvgEl(tag, attrs = {}) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, String(v));
    }
    return el;
  }

  function resolveArrowEndpoint(endpoint, map, stageRect) {
    if (!endpoint) return null;
    if (endpoint.kind === "word") {
      const tok = resolveTokenByAnchor(map, endpoint.usfm, endpoint.wordIndex);
      if (tok) {
        const r = getTokenClientRect(tok);
        if (r) {
          const box = {
            x: r.left - stageRect.left,
            y: r.top - stageRect.top,
            w: r.width,
            h: r.height
          };
          return {
            x: box.x + box.w / 2,
            y: box.y + box.h / 2,
            box
          };
        }
      }
    }
    const pt = resolveVerseAnchorToStagePoint(endpoint, stageRect);
    return { x: pt.x, y: pt.y, box: null };
  }

  function syncStageBoundsToChapter() {
    const chapterEl = host ? host.getChapterEl() : null;
    if (!chapterEl || !stageEl) return null;

    const parent = chapterEl.parentElement;
    if (!parent) return null;
    if (getComputedStyle(parent).position === "static") {
      parent.style.position = "relative";
    }
    parent.style.overflow = "visible";
    if (stageEl.parentElement !== parent) {
      parent.appendChild(stageEl);
    }

    stageEl.style.top = `${chapterEl.offsetTop}px`;
    stageEl.style.left = `${chapterEl.offsetLeft}px`;
    stageEl.style.width = `${Math.max(0, chapterEl.offsetWidth - 1)}px`;
    stageEl.style.height = `${Math.max(0, chapterEl.offsetHeight - 1)}px`;

    return stageEl.getBoundingClientRect();
  }

  function renderAllAnnotations() {
    if (!active || !stageEl || !svgEl) return;
    const chapterEl = host ? host.getChapterEl() : null;
    if (!chapterEl) return;

    const stageRect = syncStageBoundsToChapter();
    if (!stageRect || stageRect.width === 0) return;

    const map = getWordMap(chapterEl);
    highlightsGroupEl.innerHTML = "";
    marksGroupEl.innerHTML = "";

    for (const item of items) {
      const col = COLORS[item.color] || COLORS.cyan;

      if (item.type === "highlight") {
        const boxes = getPhraseLineBoxes(item, map, stageRect);
        if (!boxes.length) continue;
        const g = createSvgEl("g", { class: "bbe-sermon-mark-group", "data-id": item.id });
        for (const b of boxes) {
          const rectEl = createSvgEl("rect", {
            class: "bbe-sermon-mark bbe-sermon-mark-fill",
            x: (b.x - 3).toFixed(1),
            y: (b.y - 1).toFixed(1),
            width: (b.w + 6).toFixed(1),
            height: (b.h + 2).toFixed(1),
            rx: 5,
            ry: 5,
            fill: col.fill
          });
          rectEl.dataset.markId = item.id;
          g.appendChild(rectEl);
        }
        highlightsGroupEl.appendChild(g);
      } else if (item.type === "circle" || item.type === "box") {
        const boxes = getPhraseLineBoxes(item, map, stageRect);
        if (!boxes.length) continue;
        const g = createSvgEl("g", { class: "bbe-sermon-mark-group", "data-id": item.id });
        for (const b of boxes) {
          const d = item.type === "circle" ? buildHandCirclePath(b) : buildHandBoxPath(b);
          const pathEl = createSvgEl("path", {
            class: "bbe-sermon-mark bbe-sermon-mark-fill",
            d,
            fill: "rgba(0,0,0,0.001)",
            stroke: col.stroke,
            "stroke-width": 2.35,
            "stroke-linecap": "round",
            "stroke-linejoin": "round"
          });
          pathEl.dataset.markId = item.id;
          g.appendChild(pathEl);
        }
        marksGroupEl.appendChild(g);
      } else if (item.type === "underline") {
        const boxes = getPhraseLineBoxes(item, map, stageRect);
        if (!boxes.length) continue;
        const g = createSvgEl("g", { class: "bbe-sermon-mark-group", "data-id": item.id });
        for (const b of boxes) {
          const dList = buildUnderlinePaths(b, Boolean(item.double));
          for (const d of dList) {
            const pathEl = createSvgEl("path", {
              class: "bbe-sermon-mark",
              d,
              fill: "none",
              stroke: col.stroke,
              "stroke-width": 2.4,
              "stroke-linecap": "round"
            });
            pathEl.dataset.markId = item.id;
            g.appendChild(pathEl);
          }
        }
        marksGroupEl.appendChild(g);
      } else if (item.type === "arrow") {
        const rawFrom = resolveArrowEndpoint(item.from, map, stageRect);
        const rawTo = resolveArrowEndpoint(item.to, map, stageRect);
        if (!rawFrom || !rawTo) continue;

        const p1 = rawFrom.box ? clipPointToWordBoxEdge(rawFrom.box, rawTo, 6) : rawFrom;
        const p2 = rawTo.box ? clipPointToWordBoxEdge(rawTo.box, rawFrom, 7) : rawTo;
        const arrowPaths = buildCurvedArrowPaths(p1, p2, item.curveDir || 1);
        if (!arrowPaths) continue;

        const g = createSvgEl("g", { class: "bbe-sermon-mark-group", "data-id": item.id });
        const shaftEl = createSvgEl("path", {
          class: "bbe-sermon-mark",
          d: arrowPaths.shaftPath,
          fill: "none",
          stroke: col.stroke,
          "stroke-width": 2.3,
          "stroke-linecap": "round"
        });
        const headEl = createSvgEl("path", {
          class: "bbe-sermon-mark",
          d: arrowPaths.headPath,
          fill: "none",
          stroke: col.stroke,
          "stroke-width": 2.3,
          "stroke-linecap": "round",
          "stroke-linejoin": "round"
        });
        shaftEl.dataset.markId = item.id;
        headEl.dataset.markId = item.id;
        g.appendChild(shaftEl);
        g.appendChild(headEl);
        marksGroupEl.appendChild(g);
      } else if (item.type === "freehand") {
        const origin = resolveVerseAnchorToStagePoint(item.anchor, stageRect);
        const absPts = (item.points || []).map((pt) => ({
          x: origin.x + pt.dx * stageRect.width,
          y: origin.y + pt.dy
        }));
        const d = buildSmoothFreehandPath(absPts);
        if (!d) continue;
        const g = createSvgEl("g", { class: "bbe-sermon-mark-group", "data-id": item.id });
        const pathEl = createSvgEl("path", {
          class: "bbe-sermon-mark",
          d,
          fill: "none",
          stroke: col.stroke,
          "stroke-width": 2.45,
          "stroke-linecap": "round",
          "stroke-linejoin": "round"
        });
        pathEl.dataset.markId = item.id;
        g.appendChild(pathEl);
        marksGroupEl.appendChild(g);
      }
    }

    renderNotesLayer(stageRect);
  }

  function scheduleRelayout() {
    if (!active) return;
    if (relayoutRaf) cancelAnimationFrame(relayoutRaf);
    relayoutRaf = requestAnimationFrame(() => {
      relayoutRaf = null;
      renderAllAnnotations();
    });
  }

  /* ============================================================================
   * 6. Tiny Handwritten Notes Layer
   * ============================================================================ */
  function renderNotesLayer(stageRect) {
    if (!notesLayerEl) return;
    const noteItems = items.filter((it) => it.type === "note");
    const existingIds = new Set(noteItems.map((n) => n.id));

    // Remove stale note nodes
    Array.from(notesLayerEl.querySelectorAll(".bbe-sermon-note")).forEach((el) => {
      if (!existingIds.has(el.dataset.noteId)) el.remove();
    });

    for (const note of noteItems) {
      let noteEl = notesLayerEl.querySelector(`.bbe-sermon-note[data-note-id="${note.id}"]`);
      const col = COLORS[note.color] || COLORS.cyan;
      const pos = resolveVerseAnchorToStagePoint(note.anchor, stageRect);

      if (!noteEl) {
        noteEl = document.createElement("div");
        noteEl.className = "bbe-sermon-note";
        noteEl.dataset.noteId = note.id;

        const textEl = document.createElement("div");
        textEl.className = "bbe-sermon-note-text";
        textEl.contentEditable = "true";
        textEl.spellcheck = false;
        textEl.dataset.placeholder = "Type note...";
        textEl.textContent = note.text || "";

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "bbe-sermon-note-del";
        delBtn.title = "Delete note";
        delBtn.textContent = "×";

        delBtn.addEventListener("pointerdown", (e) => {
          e.stopPropagation();
          e.preventDefault();
          removeItemById(note.id);
        });

        textEl.addEventListener("focus", () => {
          noteEl.classList.add("editing");
        });

        textEl.addEventListener("blur", () => {
          noteEl.classList.remove("editing");
          const val = textEl.textContent.trim();
          const target = items.find((it) => it.id === note.id);
          if (!val) {
            removeItemById(note.id);
          } else if (target && target.text !== val) {
            target.text = val;
            handleItemsChanged();
          }
        });

        textEl.addEventListener("input", () => {
          const target = items.find((it) => it.id === note.id);
          if (target) {
            target.text = textEl.textContent;
          }
        });

        textEl.addEventListener("keydown", (e) => {
          e.stopPropagation();
          if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) {
            e.preventDefault();
            textEl.blur();
          }
        });

        // Drag to reposition or click to erase/edit
        noteEl.addEventListener("pointerdown", (e) => {
          if (e.target === delBtn) return;
          if (activeTool === "eraser" || e.button === 2) {
            e.preventDefault();
            e.stopPropagation();
            removeItemById(note.id);
            return;
          }
          if (noteEl.classList.contains("editing")) {
            e.stopPropagation();
            return;
          }

          e.preventDefault();
          e.stopPropagation();
          const startX = e.clientX;
          const startY = e.clientY;
          const origLeft = parseFloat(noteEl.style.left) || 0;
          const origTop = parseFloat(noteEl.style.top) || 0;
          let moved = false;

          const onMove = (me) => {
            const dx = me.clientX - startX;
            const dy = me.clientY - startY;
            if (!moved && Math.hypot(dx, dy) > 4) {
              moved = true;
              noteEl.classList.add("dragging");
            }
            if (moved) {
              noteEl.style.left = `${origLeft + dx}px`;
              noteEl.style.top = `${origTop + dy}px`;
            }
          };

          const onUp = (ue) => {
            window.removeEventListener("pointermove", onMove, true);
            window.removeEventListener("pointerup", onUp, true);
            noteEl.classList.remove("dragging");

            if (moved) {
              const curStageRect = stageEl.getBoundingClientRect();
              const finalClientX = curStageRect.left + (parseFloat(noteEl.style.left) || 0);
              const finalClientY = curStageRect.top + (parseFloat(noteEl.style.top) || 0);
              const target = items.find((it) => it.id === note.id);
              if (target) {
                pushUndoSnapshot();
                target.anchor = findNearestVerseAnchor(finalClientX, finalClientY, curStageRect);
                handleItemsChanged();
              }
            } else {
              // Single click without drag -> focus for editing
              textEl.focus();
            }
          };

          window.addEventListener("pointermove", onMove, true);
          window.addEventListener("pointerup", onUp, true);
        });

        noteEl.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          e.stopPropagation();
          removeItemById(note.id);
        });

        noteEl.appendChild(textEl);
        noteEl.appendChild(delBtn);
        notesLayerEl.appendChild(noteEl);
      }

      noteEl.style.color = col.stroke;
      if (!noteEl.classList.contains("dragging")) {
        noteEl.style.left = `${pos.x.toFixed(1)}px`;
        noteEl.style.top = `${pos.y.toFixed(1)}px`;
      }
      const textNode = noteEl.querySelector(".bbe-sermon-note-text");
      if (textNode && document.activeElement !== textNode && textNode.textContent !== (note.text || "")) {
        textNode.textContent = note.text || "";
      }
    }
  }

  /* ============================================================================
   * 7. Undo / Redo & Item Mutation Helpers
   * ============================================================================ */
  function genId() {
    return "sm_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  }

  function pushUndoSnapshot() {
    undoStack.push(JSON.parse(JSON.stringify(items)));
    if (undoStack.length > 40) undoStack.shift();
    redoStack = [];
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(JSON.parse(JSON.stringify(items)));
    items = undoStack.pop();
    renderAllAnnotations();
    handleItemsChanged();
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(JSON.parse(JSON.stringify(items)));
    items = redoStack.pop();
    renderAllAnnotations();
    handleItemsChanged();
  }

  function removeItemById(id) {
    const idx = items.findIndex((it) => it.id === id);
    if (idx === -1) return;
    pushUndoSnapshot();
    items.splice(idx, 1);
    renderAllAnnotations();
    handleItemsChanged();
  }

  function clearCurrentChapter() {
    if (!items.length) return;
    pushUndoSnapshot();
    items = [];
    renderAllAnnotations();
    handleItemsChanged();
    if (host && host.showToast) {
      host.showToast("Cleared Sermon Mode markups for this chapter", { icon: "sermon" });
    }
  }

  function applyWordPhraseAction(toolType, startTok, endTok) {
    const t1 = startTok.globalIndex <= endTok.globalIndex ? startTok : endTok;
    const t2 = startTok.globalIndex <= endTok.globalIndex ? endTok : startTok;

    // Check if an identical range & type already exists
    const existingIdx = items.findIndex(
      (it) =>
        it.type === toolType &&
        it.usfm === t1.usfm &&
        it.startWord === t1.wordIndex &&
        (it.endUsfm || it.usfm) === t2.usfm &&
        (it.endWord ?? it.startWord) === t2.wordIndex
    );

    pushUndoSnapshot();

    if (existingIdx !== -1) {
      const existing = items[existingIdx];
      if (toolType === "underline" && !existing.double) {
        // Second click on an underline upgrades it to a Double-Underline!
        existing.double = true;
        existing.color = activeColor;
      } else if (existing.color !== activeColor) {
        // Change color if clicked with a different swatch selected
        existing.color = activeColor;
      } else {
        // Toggle off if clicked again with same tool & color
        items.splice(existingIdx, 1);
      }
    } else {
      items.push({
        id: genId(),
        type: toolType,
        color: activeColor,
        usfm: t1.usfm,
        startWord: t1.wordIndex,
        endUsfm: t2.usfm,
        endWord: t2.wordIndex,
        double: false
      });
    }

    renderAllAnnotations();
    handleItemsChanged();
  }

  /* ============================================================================
   * 8. Pointer / Mouse Gesture Handlers on the Chapter Stage
   * ============================================================================ */
  function isEventInsideUiChrome(target) {
    if (!target || !target.closest) return false;
    return Boolean(
      target.closest(
        "#bbe-sermon-dock, #bbe-sermon-mismatch-banner, #bbe-sermon-replace-modal, #bbe-bar, #bbe-drawer, #bbe-selection-copy-bar, #bbe-word-tooltip"
      )
    );
  }

  function isPointInStageBounds(clientX, clientY) {
    if (!stageEl) return false;
    const r = stageEl.getBoundingClientRect();
    return clientX >= r.left - 30 && clientX <= r.right + 30 && clientY >= r.top - 20 && clientY <= r.bottom + 20;
  }

  function findMarkIdAtPoint(clientX, clientY) {
    if (!svgEl) return null;
    const stageRect = stageEl.getBoundingClientRect();
    const lx = clientX - stageRect.left;
    const ly = clientY - stageRect.top;

    // Check SVG marks bounding boxes with 8px padding
    const groups = Array.from(svgEl.querySelectorAll(".bbe-sermon-mark-group")).reverse();
    for (const g of groups) {
      const r = g.getBoundingClientRect();
      if (
        clientX >= r.left - 8 &&
        clientX <= r.right + 8 &&
        clientY >= r.top - 8 &&
        clientY <= r.bottom + 8
      ) {
        return g.getAttribute("data-id");
      }
    }
    return null;
  }

  function onDocumentPointerDown(e) {
    if (!active) return;
    if (isEventInsideUiChrome(e.target)) return;
    if (e.target && e.target.closest && e.target.closest(".bbe-sermon-note")) return;
    if (!isPointInStageBounds(e.clientX, e.clientY)) return;

    // Right-click anywhere on a mark immediately erases it
    if (e.button === 2) {
      const markId = findMarkIdAtPoint(e.clientX, e.clientY);
      if (markId) {
        e.preventDefault();
        e.stopPropagation();
        removeItemById(markId);
      }
      return;
    }

    if (e.button !== 0) return;
    if (activeTool === "pointer") return;

    // Blur any active editing note first
    if (document.activeElement && document.activeElement.classList?.contains("bbe-sermon-note-text")) {
      document.activeElement.blur();
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    const stageRect = syncStageBoundsToChapter();
    if (!stageRect) return;

    // 1. ERASER TOOL
    if (activeTool === "eraser") {
      const hitId = findMarkIdAtPoint(e.clientX, e.clientY);
      if (hitId) removeItemById(hitId);
      dragState = { kind: "eraser" };
      return;
    }

    // 2. TINY HANDWRITTEN NOTE TOOL
    if (activeTool === "note") {
      const anchor = findNearestVerseAnchor(e.clientX, e.clientY, stageRect);
      const newNote = {
        id: genId(),
        type: "note",
        color: activeColor,
        anchor,
        text: ""
      };
      pushUndoSnapshot();
      items.push(newNote);
      renderAllAnnotations();
      const noteNode = notesLayerEl?.querySelector(`.bbe-sermon-note[data-note-id="${newNote.id}"] .bbe-sermon-note-text`);
      if (noteNode) {
        setTimeout(() => noteNode.focus(), 10);
      }
      return;
    }

    // 3. FREEHAND PEN TOOL
    if (activeTool === "pen") {
      const anchor = findNearestVerseAnchor(e.clientX, e.clientY, stageRect);
      const origin = resolveVerseAnchorToStagePoint(anchor, stageRect);
      const pt0 = { x: e.clientX - stageRect.left, y: e.clientY - stageRect.top };
      dragState = {
        kind: "pen",
        anchor,
        origin,
        stageRect,
        absPoints: [pt0]
      };
      return;
    }

    // 4. CONNECTOR ARROW TOOL
    if (activeTool === "arrow") {
      const wordHit = findWordTokenAtPoint(e.clientX, e.clientY);
      const fromEndpoint = wordHit
        ? { kind: "word", usfm: wordHit.token.usfm, wordIndex: wordHit.token.wordIndex }
        : { kind: "verse", ...findNearestVerseAnchor(e.clientX, e.clientY, stageRect) };

      dragState = {
        kind: "arrow",
        fromEndpoint,
        startPt: { x: e.clientX - stageRect.left, y: e.clientY - stageRect.top },
        startBox: wordHit
          ? {
              x: wordHit.rect.left - stageRect.left,
              y: wordHit.rect.top - stageRect.top,
              w: wordHit.rect.width,
              h: wordHit.rect.height
            }
          : null,
        curveDir: e.altKey ? -1 : 1
      };
      return;
    }

    // 5. SMART WORD / PHRASE TOOLS (circle, box, underline, highlight)
    if (
      activeTool === "circle" ||
      activeTool === "box" ||
      activeTool === "underline" ||
      activeTool === "highlight"
    ) {
      const wordHit = findWordTokenAtPoint(e.clientX, e.clientY);
      if (!wordHit) return;
      dragState = {
        kind: "phrase",
        tool: activeTool,
        startToken: wordHit.token,
        endToken: wordHit.token
      };
      renderLivePreview(e);
    }
  }

  function renderLivePreview(e) {
    if (!previewGroupEl || !stageEl) return;
    previewGroupEl.innerHTML = "";
    const stageRect = stageEl.getBoundingClientRect();

    // If not currently dragging, show subtle hover word-snap outline for smart tools
    if (!dragState) {
      if (
        activeTool === "circle" ||
        activeTool === "box" ||
        activeTool === "underline" ||
        activeTool === "highlight" ||
        activeTool === "arrow"
      ) {
        if (!e || isEventInsideUiChrome(e.target) || !isPointInStageBounds(e.clientX, e.clientY)) return;
        const hit = findWordTokenAtPoint(e.clientX, e.clientY);
        if (hit && hit.rect) {
          const snapRect = createSvgEl("rect", {
            class: "bbe-sermon-word-snap",
            x: (hit.rect.left - stageRect.left - 3).toFixed(1),
            y: (hit.rect.top - stageRect.top - 2).toFixed(1),
            width: (hit.rect.width + 6).toFixed(1),
            height: (hit.rect.height + 4).toFixed(1)
          });
          previewGroupEl.appendChild(snapRect);
        }
      }
      return;
    }

    const col = COLORS[activeColor] || COLORS.cyan;

    if (dragState.kind === "pen") {
      const d = buildSmoothFreehandPath(dragState.absPoints);
      if (d) {
        previewGroupEl.appendChild(
          createSvgEl("path", {
            d,
            fill: "none",
            stroke: col.stroke,
            "stroke-width": 2.45,
            "stroke-linecap": "round",
            "stroke-linejoin": "round"
          })
        );
      }
    } else if (dragState.kind === "arrow" && e) {
      const curPt = { x: e.clientX - stageRect.left, y: e.clientY - stageRect.top };
      const targetHit = findWordTokenAtPoint(e.clientX, e.clientY);
      let toBox = null;
      if (targetHit && targetHit.rect) {
        toBox = {
          x: targetHit.rect.left - stageRect.left,
          y: targetHit.rect.top - stageRect.top,
          w: targetHit.rect.width,
          h: targetHit.rect.height
        };
        previewGroupEl.appendChild(
          createSvgEl("rect", {
            class: "bbe-sermon-word-snap",
            x: (toBox.x - 3).toFixed(1),
            y: (toBox.y - 2).toFixed(1),
            width: (toBox.w + 6).toFixed(1),
            height: (toBox.h + 4).toFixed(1)
          })
        );
      }
      const p1 = dragState.startBox ? clipPointToWordBoxEdge(dragState.startBox, curPt, 6) : dragState.startPt;
      const p2 = toBox ? clipPointToWordBoxEdge(toBox, p1, 7) : curPt;
      const curveDir = e.altKey ? -1 : dragState.curveDir;
      const arrowPaths = buildCurvedArrowPaths(p1, p2, curveDir);
      if (arrowPaths) {
        previewGroupEl.appendChild(
          createSvgEl("path", {
            d: arrowPaths.shaftPath,
            fill: "none",
            stroke: col.stroke,
            "stroke-width": 2.3,
            "stroke-dasharray": "4 2",
            "stroke-linecap": "round"
          })
        );
        previewGroupEl.appendChild(
          createSvgEl("path", {
            d: arrowPaths.headPath,
            fill: "none",
            stroke: col.stroke,
            "stroke-width": 2.3,
            "stroke-linecap": "round",
            "stroke-linejoin": "round"
          })
        );
      }
    } else if (dragState.kind === "phrase") {
      const chapterEl = host ? host.getChapterEl() : null;
      if (!chapterEl) return;
      const map = getWordMap(chapterEl);
      const tempItem = {
        usfm: dragState.startToken.usfm,
        startWord: dragState.startToken.wordIndex,
        endUsfm: dragState.endToken.usfm,
        endWord: dragState.endToken.wordIndex
      };
      const boxes = getPhraseLineBoxes(tempItem, map, stageRect);
      for (const b of boxes) {
        if (dragState.tool === "highlight") {
          previewGroupEl.appendChild(
            createSvgEl("rect", {
              x: (b.x - 3).toFixed(1),
              y: (b.y - 1).toFixed(1),
              width: (b.w + 6).toFixed(1),
              height: (b.h + 2).toFixed(1),
              rx: 5,
              ry: 5,
              fill: col.fill
            })
          );
        } else if (dragState.tool === "circle" || dragState.tool === "box") {
          const d = dragState.tool === "circle" ? buildHandCirclePath(b) : buildHandBoxPath(b);
          previewGroupEl.appendChild(
            createSvgEl("path", {
              d,
              fill: "none",
              stroke: col.stroke,
              "stroke-width": 2.35,
              "stroke-linecap": "round"
            })
          );
        } else if (dragState.tool === "underline") {
          const dList = buildUnderlinePaths(b, false);
          for (const d of dList) {
            previewGroupEl.appendChild(
              createSvgEl("path", {
                d,
                fill: "none",
                stroke: col.stroke,
                "stroke-width": 2.4,
                "stroke-linecap": "round"
              })
            );
          }
        }
      }
    }
  }

  function onDocumentPointerMove(e) {
    if (!active) return;
    if (!dragState) {
      renderLivePreview(e);
      return;
    }

    if (dragState.kind === "eraser") {
      const hitId = findMarkIdAtPoint(e.clientX, e.clientY);
      if (hitId) removeItemById(hitId);
      return;
    }

    if (dragState.kind === "pen") {
      const stageRect = stageEl.getBoundingClientRect();
      const pt = { x: e.clientX - stageRect.left, y: e.clientY - stageRect.top };
      const last = dragState.absPoints[dragState.absPoints.length - 1];
      if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) >= 2.5) {
        dragState.absPoints.push(pt);
        renderLivePreview(e);
      }
      return;
    }

    if (dragState.kind === "arrow") {
      renderLivePreview(e);
      return;
    }

    if (dragState.kind === "phrase") {
      const hit = findWordTokenAtPoint(e.clientX, e.clientY);
      if (hit && hit.token && hit.token !== dragState.endToken) {
        dragState.endToken = hit.token;
        renderLivePreview(e);
      }
    }
  }

  function onDocumentPointerUp(e) {
    if (!active || !dragState) return;
    const state = dragState;
    dragState = null;
    if (previewGroupEl) previewGroupEl.innerHTML = "";

    const stageRect = stageEl ? stageEl.getBoundingClientRect() : null;
    if (!stageRect) return;

    if (state.kind === "pen") {
      if (state.absPoints.length >= 2) {
        const origin = resolveVerseAnchorToStagePoint(state.anchor, stageRect);
        const relPoints = state.absPoints.map((p) => ({
          dx: (p.x - origin.x) / Math.max(1, stageRect.width),
          dy: p.y - origin.y
        }));
        pushUndoSnapshot();
        items.push({
          id: genId(),
          type: "freehand",
          color: activeColor,
          anchor: state.anchor,
          points: relPoints
        });
        renderAllAnnotations();
        handleItemsChanged();
      }
      return;
    }

    if (state.kind === "arrow") {
      const endPt = { x: e.clientX - stageRect.left, y: e.clientY - stageRect.top };
      if (Math.hypot(endPt.x - state.startPt.x, endPt.y - state.startPt.y) < 12) return;

      const wordHit = findWordTokenAtPoint(e.clientX, e.clientY);
      const toEndpoint = wordHit
        ? { kind: "word", usfm: wordHit.token.usfm, wordIndex: wordHit.token.wordIndex }
        : { kind: "verse", ...findNearestVerseAnchor(e.clientX, e.clientY, stageRect) };

      if (
        state.fromEndpoint.kind === "word" &&
        toEndpoint.kind === "word" &&
        state.fromEndpoint.usfm === toEndpoint.usfm &&
        state.fromEndpoint.wordIndex === toEndpoint.wordIndex
      ) {
        return;
      }

      pushUndoSnapshot();
      items.push({
        id: genId(),
        type: "arrow",
        color: activeColor,
        from: state.fromEndpoint,
        to: toEndpoint,
        curveDir: e.altKey ? -1 : state.curveDir
      });
      renderAllAnnotations();
      handleItemsChanged();
      return;
    }

    if (state.kind === "phrase") {
      const upHit = findWordTokenAtPoint(e.clientX, e.clientY);
      if (upHit && upHit.token) {
        state.endToken = upHit.token;
      }
      applyWordPhraseAction(state.tool, state.startToken, state.endToken);
    }
  }

  function onDocumentContextMenu(e) {
    if (!active) return;
    if (isEventInsideUiChrome(e.target)) return;
    if (!isPointInStageBounds(e.clientX, e.clientY)) return;
    const hitId = findMarkIdAtPoint(e.clientX, e.clientY);
    if (hitId) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function onDocumentKeyDown(e) {
    if (!active) return;
    const activeEl = document.activeElement;
    if (activeEl) {
      const tag = activeEl.tagName ? activeEl.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select" || activeEl.isContentEditable) {
        return;
      }
    }

    // Escape switches to Pointer / Read mode (or closes popovers)
    if (e.key === "Escape") {
      if (savedPopoverEl && savedPopoverEl.classList.contains("open")) {
        savedPopoverEl.classList.remove("open");
        e.preventDefault();
        return;
      }
      if (replaceModalEl && replaceModalEl.classList.contains("open")) {
        replaceModalEl.classList.remove("open");
        e.preventDefault();
        return;
      }
      if (activeTool !== "pointer") {
        setActiveTool("pointer");
        if (host && host.showToast) {
          host.showToast("Pointer / Read mode — Select text or use Word Study freely", { icon: "book" });
        }
        e.preventDefault();
      }
      return;
    }

    // Ctrl+Z / Cmd+Z for Undo, Ctrl+Y / Ctrl+Shift+Z for Redo
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    }
  }

  /* ============================================================================
   * 9. Floating Draggable Dock & Popovers UI
   * ============================================================================ */
  function setActiveTool(toolId) {
    activeTool = toolId;
    const html = document.documentElement;
    html.setAttribute("data-bbe-sermon-tool", toolId);
    html.classList.toggle("bbe-sermon-drawing", active && toolId !== "pointer");
    if (previewGroupEl) previewGroupEl.innerHTML = "";
    updateDockState();
  }

  function setActiveColor(colorKey) {
    if (!COLORS[colorKey]) return;
    activeColor = colorKey;
    updateDockState();
  }

  function buildStageAndDockDom() {
    // 1. Stage container (attached inside chapterEl.parentElement)
    if (!stageEl) {
      stageEl = document.createElement("div");
      stageEl.id = "bbe-sermon-stage";

      svgEl = createSvgEl("svg", { id: "bbe-sermon-svg" });
      highlightsGroupEl = createSvgEl("g", { class: "bbe-sermon-layer-highlights" });
      marksGroupEl = createSvgEl("g", { class: "bbe-sermon-layer-marks" });
      previewGroupEl = createSvgEl("g", { class: "bbe-sermon-layer-preview" });

      svgEl.appendChild(highlightsGroupEl);
      svgEl.appendChild(marksGroupEl);
      svgEl.appendChild(previewGroupEl);

      notesLayerEl = document.createElement("div");
      notesLayerEl.id = "bbe-sermon-notes-layer";

      stageEl.appendChild(svgEl);
      stageEl.appendChild(notesLayerEl);
    }

    // 2. Translation Mismatch Chip Banner
    if (!mismatchBannerEl) {
      mismatchBannerEl = document.createElement("div");
      mismatchBannerEl.id = "bbe-sermon-mismatch-banner";
    }

    // 3. Floating Draggable Left Dock
    if (!dockEl) {
      dockEl = document.createElement("div");
      dockEl.id = "bbe-sermon-dock";

      // Restore saved dock position if valid
      try {
        const savedPos = JSON.parse(localStorage.getItem(DOCK_POS_KEY) || "null");
        if (savedPos && typeof savedPos.top === "number" && typeof savedPos.left === "number") {
          const clampedLeft = Math.max(8, Math.min(window.innerWidth - 135, savedPos.left));
          const clampedTop = Math.max(54, Math.min(window.innerHeight - 360, savedPos.top));
          dockEl.style.left = `${clampedLeft}px`;
          dockEl.style.top = `${clampedTop}px`;
        }
      } catch (_) {}

      const header = document.createElement("div");
      header.className = "bbe-sermon-dock-header";
      header.title = "Drag to move Sermon palette";
      header.innerHTML = `
        <span class="bbe-sermon-dock-title">${SERMON_ICON}<span>Sermon</span></span>
        <button type="button" class="bbe-sermon-dock-close" title="Exit Sermon Mode">${CLOSE_ICON}</button>
      `;
      header.querySelector(".bbe-sermon-dock-close").addEventListener("click", (e) => {
        e.stopPropagation();
        deactivate();
      });

      // Drag dock handler
      header.addEventListener("pointerdown", (e) => {
        if (e.target.closest("button")) return;
        e.preventDefault();
        const rect = dockEl.getBoundingClientRect();
        const startX = e.clientX;
        const startY = e.clientY;
        const onMove = (me) => {
          const nextLeft = Math.max(6, Math.min(window.innerWidth - rect.width - 6, rect.left + (me.clientX - startX)));
          const nextTop = Math.max(8, Math.min(window.innerHeight - rect.height - 8, rect.top + (me.clientY - startY)));
          dockEl.style.left = `${nextLeft}px`;
          dockEl.style.top = `${nextTop}px`;
        };
        const onUp = () => {
          window.removeEventListener("pointermove", onMove, true);
          window.removeEventListener("pointerup", onUp, true);
          try {
            const finalRect = dockEl.getBoundingClientRect();
            localStorage.setItem(DOCK_POS_KEY, JSON.stringify({ left: finalRect.left, top: finalRect.top }));
          } catch (_) {}
        };
        window.addEventListener("pointermove", onMove, true);
        window.addEventListener("pointerup", onUp, true);
      });
      dockEl.appendChild(header);

      // Tools Grid
      const toolsGrid = document.createElement("div");
      toolsGrid.className = "bbe-sermon-tools-grid";
      for (const t of TOOLS) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "bbe-sermon-tool-btn" + (t.id === "pointer" ? " full-row" : "");
        btn.dataset.tool = t.id;
        btn.title = t.title;
        btn.innerHTML = `<span class="bbe-sermon-tool-icon">${t.icon}</span><span>${t.label}</span>`;
        btn.addEventListener("click", () => setActiveTool(t.id));
        toolsGrid.appendChild(btn);
      }
      dockEl.appendChild(toolsGrid);

      // Colors Row
      const colorsRow = document.createElement("div");
      colorsRow.className = "bbe-sermon-colors-row";
      for (const c of Object.values(COLORS)) {
        const cBtn = document.createElement("button");
        cBtn.type = "button";
        cBtn.className = "bbe-sermon-color-btn";
        cBtn.dataset.color = c.key;
        cBtn.title = `Ink Color: ${c.label}`;
        if (c.key === "adaptive") {
          cBtn.style.background = "transparent";
          cBtn.innerHTML = `
            <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <circle cx="10" cy="10" r="10" fill="#1e293b"/>
              <path d="M 17.071 2.929 A 10 10 0 0 1 2.929 17.071 Z" fill="#f8fafc"/>
            </svg>
          `;
        } else {
          cBtn.style.background = c.swatch;
        }
        cBtn.addEventListener("click", () => setActiveColor(c.key));
        colorsRow.appendChild(cBtn);
      }
      dockEl.appendChild(colorsRow);

      // Actions Grid (Undo, Clear, Manual Save, Saved x/5, Print)
      const actionsGrid = document.createElement("div");
      actionsGrid.className = "bbe-sermon-actions-grid";
      actionsGrid.innerHTML = `
        <button type="button" class="bbe-sermon-action-btn" id="bbe-sermon-undo-btn" title="Undo last mark (Ctrl+Z)">${UNDO_ICON}<span>Undo</span></button>
        <button type="button" class="bbe-sermon-action-btn" id="bbe-sermon-clear-btn" title="Clear all marks on this chapter">${CLEAR_ICON}<span>Clear</span></button>
        <button type="button" class="bbe-sermon-action-btn full-row" id="bbe-sermon-manual-save-btn" style="display:none;" title="Save this chapter markup to your 5 saved slots">${SAVE_ICON}<span>Save Markup</span></button>
        <button type="button" class="bbe-sermon-action-btn full-row" id="bbe-sermon-saved-btn" title="Manage your 5 saved Sermon Mode chapters">${SAVED_ICON}<span>Saved (0/5) ▾</span></button>
        <button type="button" class="bbe-sermon-action-btn full-row print-btn" id="bbe-sermon-print-btn" title="Print clean printer-friendly study sheet (or Save as PDF)">${PRINT_ICON}<span>Print Page</span></button>
      `;

      actionsGrid.querySelector("#bbe-sermon-undo-btn").addEventListener("click", () => undo());
      actionsGrid.querySelector("#bbe-sermon-clear-btn").addEventListener("click", () => clearCurrentChapter());
      actionsGrid.querySelector("#bbe-sermon-manual-save-btn").addEventListener("click", async () => {
        const isAlreadySaved = Boolean(savedChaptersMap[currentChapterKey]);
        const savedCount = Object.keys(savedChaptersMap).length;
        const maxSlots = getMaxSavedChapters();
        if (!isAlreadySaved && savedCount >= maxSlots) {
          openReplaceSlotModal();
        } else {
          await commitCurrentChapterToStorage();
          if (host && host.showToast) {
            host.showToast(`Saved Sermon Markup (${Object.keys(savedChaptersMap).length}/${maxSlots})`, { icon: "bookmark" });
          }
        }
      });
      actionsGrid.querySelector("#bbe-sermon-saved-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        toggleSavedPopover();
      });
      actionsGrid.querySelector("#bbe-sermon-print-btn").addEventListener("click", () => triggerCleanPrint());

      dockEl.appendChild(actionsGrid);

      // Saved (x/5) Popover attached to dockEl
      savedPopoverEl = document.createElement("div");
      savedPopoverEl.id = "bbe-sermon-saved-popover";
      dockEl.appendChild(savedPopoverEl);
    }

    // 4. 5/5 Slot Replacement Modal
    if (!replaceModalEl) {
      replaceModalEl = document.createElement("div");
      replaceModalEl.id = "bbe-sermon-replace-modal";
      document.body.appendChild(replaceModalEl);
    }

    if (!dockEl.isConnected) {
      document.body.appendChild(dockEl);
    }
  }

  function updateDockState() {
    if (!dockEl) return;

    // Active tool highlight
    dockEl.querySelectorAll(".bbe-sermon-tool-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tool === activeTool);
    });

    // Active color highlight
    dockEl.querySelectorAll(".bbe-sermon-color-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.color === activeColor);
    });

    // Undo / Clear button state
    const undoBtn = dockEl.querySelector("#bbe-sermon-undo-btn");
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
    const clearBtn = dockEl.querySelector("#bbe-sermon-clear-btn");
    if (clearBtn) clearBtn.disabled = items.length === 0;

    // Manual Save button state
    const mode = getSaveMode();
    const manualSaveBtn = dockEl.querySelector("#bbe-sermon-manual-save-btn");
    if (manualSaveBtn) {
      const showManualBtn = mode === "manual" || isDirtyManual;
      manualSaveBtn.style.display = showManualBtn ? "flex" : "none";
      manualSaveBtn.disabled = items.length === 0 && !savedChaptersMap[currentChapterKey];
      manualSaveBtn.classList.toggle("dirty-save", isDirtyManual);
      manualSaveBtn.innerHTML = `${SAVE_ICON}<span>${isDirtyManual ? "Save Markup *" : "Saved"}</span>`;
    }

    // Saved (x/max) count label
    const savedCount = Object.keys(savedChaptersMap).length;
    const maxSlots = getMaxSavedChapters();
    const savedBtn = dockEl.querySelector("#bbe-sermon-saved-btn");
    if (savedBtn) {
      savedBtn.innerHTML = `${SAVED_ICON}<span>Saved (${savedCount}/${maxSlots}) ▾</span>`;
    }

    if (savedPopoverEl && savedPopoverEl.classList.contains("open")) {
      renderSavedPopoverContents();
    }
  }

  function toggleSavedPopover() {
    if (!savedPopoverEl || !dockEl) return;
    const isOpening = !savedPopoverEl.classList.contains("open");
    if (isOpening) {
      const dockRect = dockEl.getBoundingClientRect();
      savedPopoverEl.classList.toggle("flip-left", dockRect.right + 315 > window.innerWidth);
      renderSavedPopoverContents();
      savedPopoverEl.classList.add("open");
    } else {
      savedPopoverEl.classList.remove("open");
    }
  }

  function renderSavedPopoverContents() {
    if (!savedPopoverEl) return;
    const sorted = getSortedSavedChapters();
    const curMode = getSaveMode();
    const maxSlots = getMaxSavedChapters();

    const listHtml = sorted.length === 0
      ? `<div style="font-size:11.5px;color:var(--bbe-sm-muted);padding:10px 4px;text-align:center;">No saved chapter markups yet.<br>Circle or underline words to save up to ${maxSlots} chapters.</div>`
      : sorted
          .map((ch) => {
            const isCur = ch.key === currentChapterKey;
            const count = Array.isArray(ch.items) ? ch.items.length : 0;
            return `
              <div class="bbe-sermon-saved-item ${isCur ? "current" : ""}" data-key="${ch.key}">
                <div class="bbe-sermon-saved-info" data-jump-key="${ch.key}" title="Open ${ch.bookTitle} ${ch.chapter} (${ch.version})">
                  <span class="bbe-sermon-saved-title">${ch.bookTitle} ${ch.chapter} • ${ch.version} ${isCur ? " (Active)" : ""}</span>
                  <span class="bbe-sermon-saved-meta">${count} mark${count === 1 ? "" : "s"}</span>
                </div>
                <button type="button" class="bbe-sermon-saved-del" data-del-key="${ch.key}" title="Delete this saved markup">${CLEAR_ICON}</button>
              </div>
            `;
          })
          .join("");

    savedPopoverEl.innerHTML = `
      <div class="bbe-sermon-pop-header">
        <span>Saved Sermon Markups (${sorted.length}/${maxSlots})</span>
      </div>
      <div class="bbe-sermon-saved-list">${listHtml}</div>
      <div class="bbe-sermon-mode-row">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <span>Max Saved Chapters:</span>
          <select class="bbe-sermon-mode-select" id="bbe-sermon-max-saved-select" style="min-width:110px;">
            <option value="5" ${maxSlots === 5 ? "selected" : ""}>5 (Default)</option>
            <option value="10" ${maxSlots === 10 ? "selected" : ""}>10 Chapters</option>
            <option value="20" ${maxSlots === 20 ? "selected" : ""}>20 Chapters</option>
            <option value="40" ${maxSlots === 40 ? "selected" : ""}>40 Chapters</option>
          </select>
        </div>
        <span>When Storage Limit Reached:</span>
        <select class="bbe-sermon-mode-select" id="bbe-sermon-save-mode-select">
          <option value="fifo" ${curMode === "fifo" ? "selected" : ""}>Auto-Keep ${maxSlots} Most Recent (FIFO)</option>
          <option value="prompt" ${curMode === "prompt" ? "selected" : ""}>Ask Which to Replace When Full (${maxSlots}/${maxSlots})</option>
          <option value="manual" ${curMode === "manual" ? "selected" : ""}>Manual Save Button Only</option>
        </select>
      </div>
    `;

    savedPopoverEl.querySelectorAll("[data-jump-key]").forEach((el) => {
      el.addEventListener("click", () => {
        const key = el.getAttribute("data-jump-key");
        const entry = savedChaptersMap[key];
        if (!entry) return;
        savedPopoverEl.classList.remove("open");
        if (key === currentChapterKey) return;
        try {
          sessionStorage.setItem(SESSION_ACTIVE_KEY, "1");
        } catch (_) {}
        location.href = `/bible/${entry.versionId || 59}/${entry.book}.${entry.chapter}.${entry.version}`;
      });
    });

    savedPopoverEl.querySelectorAll("[data-del-key]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const key = btn.getAttribute("data-del-key");
        if (!key || !savedChaptersMap[key]) return;
        delete savedChaptersMap[key];
        if (key === currentChapterKey) {
          items = [];
          renderAllAnnotations();
        }
        await writeSavedChaptersToStorage();
        updateDockState();
      });
    });

    const maxSelect = savedPopoverEl.querySelector("#bbe-sermon-max-saved-select");
    if (maxSelect) {
      maxSelect.addEventListener("change", async () => {
        const nextMax = Number(maxSelect.value) || 5;
        if (host && host.saveSettings) {
          await host.saveSettings({ sermonMaxSaved: nextMax });
        }
        updateDockState();
      });
    }

    const modeSelect = savedPopoverEl.querySelector("#bbe-sermon-save-mode-select");
    if (modeSelect) {
      modeSelect.addEventListener("change", async () => {
        const nextMode = modeSelect.value;
        if (host && host.saveSettings) {
          await host.saveSettings({ sermonSaveMode: nextMode });
        }
        updateDockState();
      });
    }
  }

  function openReplaceSlotModal() {
    if (!replaceModalEl || !currentPassageMeta) return;
    const sorted = getSortedSavedChapters();
    const maxSlots = getMaxSavedChapters();

    replaceModalEl.innerHTML = `
      <div class="bbe-sermon-modal-card">
        <div class="bbe-sermon-modal-title">All ${maxSlots} Sermon Slots Full (${maxSlots}/${maxSlots})</div>
        <div class="bbe-sermon-modal-desc">
          Choose which saved chapter to replace with <b>${currentPassageMeta.bookTitle} ${currentPassageMeta.chapter} (${currentPassageMeta.version})</b>, or keep this chapter unsaved for this session:
        </div>
        <div class="bbe-sermon-saved-list">
          ${sorted
            .map((ch) => {
              const count = Array.isArray(ch.items) ? ch.items.length : 0;
              return `
                <div class="bbe-sermon-saved-item">
                  <div class="bbe-sermon-saved-info">
                    <span class="bbe-sermon-saved-title">${ch.bookTitle} ${ch.chapter} • ${ch.version}</span>
                    <span class="bbe-sermon-saved-meta">${count} mark${count === 1 ? "" : "s"}</span>
                  </div>
                  <button type="button" class="bbe-sermon-replace-btn" data-replace-key="${ch.key}">Replace</button>
                </div>
              `;
            })
            .join("")}
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px;">
          <button type="button" class="bbe-sermon-action-btn" id="bbe-sermon-keep-unsaved-btn" style="padding:6px 12px;">Keep Unsaved for Session</button>
        </div>
      </div>
    `;

    replaceModalEl.classList.add("open");

    replaceModalEl.querySelectorAll("[data-replace-key]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const repKey = btn.getAttribute("data-replace-key");
        replaceModalEl.classList.remove("open");
        await commitCurrentChapterToStorage(repKey);
      });
    });

    replaceModalEl.querySelector("#bbe-sermon-keep-unsaved-btn")?.addEventListener("click", () => {
      replaceModalEl.classList.remove("open");
      sessionUnsavedKeys.add(currentChapterKey);
      isDirtyManual = true;
      updateDockState();
    });
  }

  /* ============================================================================
   * 10. Translation Mismatch Banner & Clean Printer-Friendly Sheet
   * ============================================================================ */
  function updateTranslationMismatchBanner() {
    if (!mismatchBannerEl || !currentPassageMeta) return;
    const chapterEl = host ? host.getChapterEl() : null;
    if (!chapterEl || !chapterEl.parentElement) return;

    if (mismatchBannerEl.parentElement !== chapterEl.parentElement) {
      chapterEl.parentElement.insertBefore(mismatchBannerEl, chapterEl);
    }

    // Check if current chapter+version has no marks, but another version of this same book+chapter is saved
    if (items.length === 0) {
      const otherSaved = Object.values(savedChaptersMap).find(
        (ch) =>
          ch.book === currentPassageMeta.book &&
          String(ch.chapter) === String(currentPassageMeta.chapter) &&
          ch.version !== currentPassageMeta.version &&
          Array.isArray(ch.items) &&
          ch.items.length > 0
      );

      if (otherSaved) {
        mismatchBannerEl.innerHTML = `
          <span style="display:inline-flex;align-items:center;gap:6px;">${SERMON_ICON}<span>You have a saved Sermon Markup for <b>${otherSaved.bookTitle} ${otherSaved.chapter}</b> in <b>${otherSaved.version}</b> (${otherSaved.items.length} marks)</span></span>
          <button type="button" class="bbe-sermon-mismatch-btn" id="bbe-sermon-switch-ver-btn">Switch to ${otherSaved.version}</button>
        `;
        mismatchBannerEl.classList.add("show");
        mismatchBannerEl.querySelector("#bbe-sermon-switch-ver-btn")?.addEventListener("click", () => {
          if (host && host.switchToVersion) {
            host.switchToVersion(otherSaved.version);
          } else {
            location.href = `/bible/${otherSaved.versionId || 59}/${otherSaved.book}.${otherSaved.chapter}.${otherSaved.version}`;
          }
        });
        return;
      }
    }

    mismatchBannerEl.classList.remove("show");
  }

  function triggerCleanPrint() {
    const chapterEl = host ? host.getChapterEl() : null;
    if (!chapterEl) return;

    let printHeader = document.getElementById("bbe-sermon-print-header");
    if (!printHeader) {
      printHeader = document.createElement("div");
      printHeader.id = "bbe-sermon-print-header";
    }
    const titleText = currentPassageMeta
      ? `${currentPassageMeta.bookTitle} ${currentPassageMeta.chapter} (${currentPassageMeta.version})`
      : document.title;
    printHeader.innerHTML = `
      <h1>${titleText}</h1>
      <span>Deep Bible • Sermon Mode Study Sheet</span>
    `;
    if (chapterEl.parentElement) {
      chapterEl.parentElement.insertBefore(printHeader, chapterEl);
    }

    // Re-compute SVG layout right before print dialog opens
    renderAllAnnotations();
    setTimeout(() => {
      window.print();
    }, 60);
  }

  /* ============================================================================
   * 11. Passage Sync & Lifecycle Management
   * ============================================================================ */
  async function syncPassageContext() {
    if (!active || !host) return;
    const p = host.getPassage ? host.getPassage() : null;
    if (!p || !p.book || !p.chapter) return;

    const s = host.getSettings ? host.getSettings() : {};
    document.documentElement.classList.toggle("bbe-sermon-expand-spacing", s.sermonExpandSpacing !== false);

    await loadSavedChaptersFromStorage();

    const versionCode = (p.versionKey || p.abbr || "ESV").toUpperCase();
    const nextKey = `${p.book}.${p.chapter}.${versionCode}`;

    if (nextKey !== currentChapterKey) {
      currentChapterKey = nextKey;
      currentPassageMeta = {
        book: p.book,
        bookTitle: p.bookTitle || p.book,
        chapter: String(p.chapter),
        version: versionCode,
        versionId: p.id
      };

      const saved = savedChaptersMap[currentChapterKey];
      items = saved && Array.isArray(saved.items) ? JSON.parse(JSON.stringify(saved.items)) : [];
      undoStack = [];
      redoStack = [];
      isDirtyManual = false;
    }

    const chapterEl = host.getChapterEl();
    if (chapterEl && resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver.observe(chapterEl);
    }

    updateTranslationMismatchBanner();
    updateDockState();
    renderAllAnnotations();
  }

  async function activate() {
    if (active) return;
    const s = host && host.getSettings ? host.getSettings() : {};
    if (s.compareOn) {
      if (host && host.showToast) {
        host.showToast("Exit Compare Mode first to use Sermon Mode", { icon: "sermon" });
      }
      return;
    }

    ensureStylesInjected();
    buildStageAndDockDom();

    active = true;
    try {
      sessionStorage.setItem(SESSION_ACTIVE_KEY, "1");
    } catch (_) {}

    const html = document.documentElement;
    html.classList.add("bbe-sermon-active");
    html.classList.toggle("bbe-sermon-expand-spacing", s.sermonExpandSpacing !== false);
    setActiveTool(activeTool || "circle");

    if (!resizeObserver && typeof ResizeObserver === "function") {
      resizeObserver = new ResizeObserver(() => {
        scheduleRelayout();
      });
    }

    document.addEventListener("pointerdown", onDocumentPointerDown, true);
    document.addEventListener("pointermove", onDocumentPointerMove, true);
    document.addEventListener("pointerup", onDocumentPointerUp, true);
    document.addEventListener("contextmenu", onDocumentContextMenu, true);
    window.addEventListener("keydown", onDocumentKeyDown, true);
    window.addEventListener("resize", scheduleRelayout, { passive: true });
    window.addEventListener("beforeprint", renderAllAnnotations);

    currentChapterKey = "";
    await syncPassageContext();

    if (host && host.onStateChange) host.onStateChange(true);
    if (host && host.showToast) {
      host.showToast("Sermon Mode activated — Click or drag words to circle, underline, highlight, or draw arrows.", { icon: "sermon" });
    }
  }

  function deactivate(silent = false) {
    if (!active) return;
    active = false;
    dragState = null;

    try {
      sessionStorage.removeItem(SESSION_ACTIVE_KEY);
    } catch (_) {}

    const html = document.documentElement;
    html.classList.remove("bbe-sermon-active", "bbe-sermon-drawing", "bbe-sermon-expand-spacing");
    html.removeAttribute("data-bbe-sermon-tool");

    if (resizeObserver) {
      resizeObserver.disconnect();
    }

    document.removeEventListener("pointerdown", onDocumentPointerDown, true);
    document.removeEventListener("pointermove", onDocumentPointerMove, true);
    document.removeEventListener("pointerup", onDocumentPointerUp, true);
    document.removeEventListener("contextmenu", onDocumentContextMenu, true);
    window.removeEventListener("keydown", onDocumentKeyDown, true);
    window.removeEventListener("resize", scheduleRelayout);
    window.removeEventListener("beforeprint", renderAllAnnotations);

    stageEl?.remove();
    dockEl?.remove();
    mismatchBannerEl?.remove();
    replaceModalEl?.classList.remove("open");

    if (host && host.onStateChange) host.onStateChange(false);
    if (!silent && host && host.showToast) {
      host.showToast("Sermon Mode closed", { icon: "sermon" });
    }
  }

  function toggle() {
    if (active) deactivate();
    else activate();
  }

  global.BBE_SERMON = {
    init(hostApi) {
      host = hostApi;
    },
    activate,
    deactivate,
    toggle,
    isActive() {
      return active;
    },
    onPassageOrLayoutChange() {
      if (!active) return;
      const s = host && host.getSettings ? host.getSettings() : {};
      if (s.compareOn) {
        deactivate(true);
        return;
      }
      syncPassageContext();
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
