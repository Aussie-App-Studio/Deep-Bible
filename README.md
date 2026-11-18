# Deep Bible: Study Tools for YouVersion (Bible.com)

A powerful, distraction-free study Bible workstation for **Bible.com (YouVersion)**. Transforms your browser into a full-featured study suite with verse commentaries, Strong's Greek/Hebrew lexicon, TSK cross-references, 1-key translation switching, parallel comparison, and native cloud-synced highlighting.

## Key Features

### 1. Instant Single-Key Translation Shortcuts (Fully Customizable)
When the search bar or text fields are not focused, you can tap single keys to swap translations in **0 milliseconds with zero delay**:
- **`E`** → **ESV** (English Standard Version)
- **`N`** → **NIV** (New International Version)
- **`S`** → **NASB** (New American Standard Bible)
- **`K`** → **NKJV** (New King James Version)
- **`L`** / **`T`** → **NLT** (New Living Translation)
- **`B`** → **BSB** (Berean Standard Bible)
- **`J`** → **KJV** (King James Version)

Key hints dynamically display on each button on the floating top pill. When you press a shortcut key, a subtle badge appears at the bottom of your screen (e.g. `⚡ Swapped to NASB`) confirming the instant switch.

**User-Configurable Shortcuts**:
- Customize shortcuts for any translation directly on Bible.com (click **`+`** on the top pill → **`⌨ Edit Shortcuts & Versions`**) or in the extension popup dashboard.
- Click any shortcut button and press a single letter or number to assign it immediately.
- Press **Backspace** or click **✕** to clear a shortcut.

*Safety:* Hotkeys are automatically suppressed whenever you are typing in the search bar, filling out notes or forms, or holding modifier keys (`Ctrl`, `Alt`, `Cmd`). Shortcuts can also be toggled on/off in the extension popup.

### 2. Add Any Custom Translation from Bible.com (Smart Quick Fill & Background Preloading)
- **Support for All 2,000+ Bible.com Versions**: Add any translation effortlessly. Enter just **one** piece of information—a Bible.com link (e.g. `bible.com/bible/149/ROM.9.RVR1960`), a numeric ID (e.g. `149`), or an abbreviation code (e.g. `RVR1960`, `ASV`, `CEB`). The extension automatically queries Bible.com to resolve the official title, abbreviation, and numeric ID for you!
- **Zero-Friction Adding**: No need to fill out 4 separate boxes. Full translation name is auto-detected or optional, and shortcut keys are optional.
- **Automatic & Temporary Background Caching**: Whenever you add a translation or shortcut, the extension automatically preloads the chapter content in memory in the background. Swapping to your custom translations happens instantly in 0ms without page reloads.
- **Manage Custom Translations**: Easily view and remove custom added translations anytime from either the on-page modal or the popup dashboard.

### 3. Customizable Translation Buttons on the Top Pill
- **Direct On-Pill Customizer (`+`)**: Click the subtle **`+`** button directly on the top pill to open an instant popover and toggle any translation on or off right on the webpage.
- **Edit Shortcuts Modal Link**: Open the full shortcuts and custom translation manager directly from the popover without leaving Bible.com.
- **Extension Popup Dashboard**: Also configurable from the extension popup with toggle pills.
- **Built-in & Custom Translations**: Choose any combination from built-in versions (**ESV, NIV, NASB, NLT, BSB, NKJV, KJV, CSB, AMP, NET, NRSVUE, LSB**) plus any custom translations you add.
- **Always Shows Active Translation**: If you navigate to a translation not currently in your active list, its button is seamlessly added so you can always see and switch back to it.

### 4. Zero-Delay Background Preloading & Instant Micro-Fade
- **Zero-Delay Background Preloading**: Whenever a chapter is loaded, the extension asynchronously fetches and temporarily caches all toolbar translations, shortcut translations, and comparison versions in the background. Swapping happens **in-place immediately** with zero page reload, zero white screen flash, and zero lag.
- **Ultra-Fast 70ms Micro-Fade**: Streamlined to the fastest and cleanest transition implementation—a hardware-accelerated 70ms opacity cross-dissolve with cubic-bezier easing that eliminates visual flash while feeling instantaneous.
- **Anchor Reading Position**: When enabled, the extension dynamically locks the verse currently in your viewport, automatically adjusting scroll offset across translations so you never lose your reading place or experience disorienting jumps.
- The URL and document title update seamlessly via HTML5 History. Browser back/forward navigation also swaps instantly without reloading.

### 5. Integrated Scripture & Keyword Search Bar
- **Instant Passage Jump**: Type any scripture reference (e.g. `John 3:16`, `Romans 8`, `1co 13:4-8`, `Gen 1`, `Ps 23`, `Matt 5:3`) and hit **Enter** to jump straight to that passage in your active translation.
- **Topic & Keyword Search**: Type any word or phrase (e.g. `faith`, `grace`, `armor of god`, `shepherd`) to run a Bible search directly on Bible.com.
- **Browser Custom Search Engine Support (Optional)**: If you set up a custom site search in Brave/Chrome settings (e.g. shortcut `b` with URL `https://www.bible.com/search/bible?q=%s`), Deep Bible automatically detects passage queries and redirects straight to the reader view in 0ms.
- **Quick Study Suggestions (Auto-Retiring)**: Clicking into the search bar surfaces one-click shortcuts for classic study passages (*Genesis 1, Psalm 23, Matthew 5, John 3:16, Romans 8, 1 Corinthians 13*, etc.). To keep the study experience clean and unobtrusive, the suggestions automatically retire after the first 3 times they are shown.
- **Zero-Delay Preloaded Chapter Navigation**: Both the floating side buttons on the left/right and the top pill's `‹` and `›` arrows pre-fetch adjacent chapters in the background. Clicking them switches chapters **instantly in 0ms** with a directional page-turn animation (sliding in from the right for Next, sliding in from the left for Previous)—zero page reloads, zero network delay, zero screen blink.
- **Left & Right Arrow Key Shortcuts (← / →)**: Press **`ArrowLeft`** or **`ArrowRight`** anywhere on the page to glide smoothly to the previous or next chapter instantly (automatically disabled when typing in search or note fields). Includes subtle visual button depression feedback.
- **Centered Side Navigation Buttons**: The site's "Previous Chapter" and "Next Chapter" arrow buttons on the left and right are now vertically centered at 50% screen height and cleanly flank the scripture column, staying comfortably within reach without cluttering the bottom of the page.

### 6. Adjustable Scripture Column Width & Smart Auto-Hide Toolbar (Zero Text Occlusion)
- **Zero Scripture Occlusion (The Reading Solution)**:
  - **Smart Auto-Hide (Default & Recommended)**: When you scroll down to read scripture, the floating pill smoothly glides up and off-screen (`transform: translateY(-135%)`). The words of Scripture are **100% clean, unobstructed, and readable** from the very top of your viewport—no blurry frosted bars or dim buttons hovering over verses.
  - **Instant Reveal on Scroll Up**: The moment you scroll up (even by 10px), the toolbar glides smoothly back into view.
  - **Top-Edge Hover Zone (No Scroll Needed)**: Moving your cursor to the top edge of the browser window (`<= 36px`) immediately reveals the toolbar so you can switch translations or open commentary without scrolling. If you move your mouse back down into the scripture text, it gracefully tucks away after a 1.2s grace period.
  - **Static at Top Mode (Optional)**: In popup or on-page settings, you can choose "Static (Top Only)" so the toolbar sits naturally above the chapter title like a book header and scrolls away with the page (never sticky, never floats).
- **Unified `Aa` Reader Appearance Menu**: Combines `Column Width`, `Text Size`, `Font`, and `Theme` into a single compact **`Aa ▾`** pill (~38px) on the floating study bar. Hovering or clicking reveals a sleek reader palette containing live column width buttons (`750` | `950` | `1200` | `Max`), text size controls (`A-` / `A+` with progress bar), 4 font family chips (`Serif`, `Sans`, `Mono`, `Dyslexic`), and an 8-color theme swatch palette (`⚪`, `📜`, `☀️`, `🌙`, `🖤`, `🌊`, `🌿`, `🏛`).
- **Retire Controls to Settings & 1-Click Restore**: The `Aa` Reader Menu includes a `⚙ Retire to Settings` button to remove it from the floating pill for a 100% minimal bar. If retired, an alert banner appears across all tabs in Settings with a **`↺ Restore to Toolbar`** button, plus dedicated restore cards in **`🛠 Floating Toolbar`** and **`📖 Reading & Typography`**.

### 7. Settings Icon on Floating Pill & Full On-Page Settings Dialog
The floating top pill is the primary interface for the extension. To provide total control without leaving scripture:
- **`⚙ Settings` Button on the Pill**: Click the `⚙ Settings` button directly on the right side of the floating top pill to open a comprehensive, categorized on-page modal dialog.
- **6 Organized Settings Categories**:
  - **`⚡ Shortcuts & Versions`**: Customize single-key translation shortcuts (click any key box and press a key to rebind; Backspace/✕ to clear), add custom Bible.com versions with automatic background caching, and manage custom translations.
  - **`📖 Reading & Typography`**: Reading theme swatches (⚙ System Default, 📜 Warm Paper Sepia #fbf0d9, ☀️ Clean Light, 🌙 Night Dark, 🖤 OLED Pitch Black, 🌊 Midnight Navy, 🌿 Sage Herb), book typography font family cards (Classic Book Serif, Modern Clean Sans, Warm Monospace, Dyslexia Friendly) with live preview snippet, live sliders for scripture column width (500px - 2200px) with quick presets (750px, 950px, 1200px, Max), toggle to show or retire the Aa reader appearance menu on the floating pill, text size (70% - 180%), and line spacing (1.3 - 2.4).
  - **`⚡ Navigation & Reading`**: Configure zero-delay adjacent chapter preloading, arrow key navigation (← / →), and viewport reading position anchoring.
  - **`💬 Study & Lexicon`**: Select default study tab (Commentary vs. TSK Cross-References vs. Strong's Word Study), choose drawer dock position (Right Sidebar vs. Bottom Logos style), and toggle verse hover badges and Word Study mode.
  - **`🛠 Floating Toolbar`**: Switch toolbar floating behavior (Smart Auto-Hide, Static Top Only, Always Floating), toggle quiet reading auto-dim mode, toggle Aa reader appearance menu on the floating pill, and select which translation pills appear on the bar.
  - **`👁 Distraction-Free`**: Fine-grained switches for header, sidebar, promotional cards, footer, bottom selection drawer, version copyright notices, footnotes, headings, verse numbers, and floating toolbar, plus one-click "Hide All Distractions" and "Show All Elements" presets.
- **Standalone Full Settings Tab**: Click **`⚙ Full Settings ↗`** in the Quick Settings header to open the full settings in a dedicated browser tab whenever you prefer a full-page workspace.

### 8. Scripture Commentary Drawer (Modern Expository & Classic BibleHub Integration)
Access in-depth historical, pastoral, and exegetical commentaries seamlessly while you read:
- **Multiple Easy Access Points (Zero Verse Text Occlusion)**:
  - **Toolbar Button**: Click the **`💬 Commentary`** button in the floating study bar (or tap **`C`** on your keyboard).
  - **Direct Verse Number Click**: Simply click any verse number (e.g. `1`, `2`) to instantly open commentary for that verse without any intrusive icons taking up space.
  - **Passage Selection Floating Bar**: Highlight or drag across any verse or passage to reveal the floating toolbar featuring the **`💬 Commentary`** button.
- **Modern & Expository Commentaries**:
  - **The Gospel Coalition (TGC) Bible Commentary**: Expository theological notes with smart pericope cards, scholar author attribution, and 1-click deep jumps directly to the exact pericope anchor (`#section-XX`) on TGC.
  - **David Guzik (Enduring Word)**: Comprehensive verse-by-verse pastoral exposition, historical background, and practical life application with deep source links.
  - **Dr. Thomas Constable (DTS Expository Notes / Sonic Light)**: 45-year Dallas Theological Seminary professor's 66-book exegetical and historical notes parsed directly into the drawer.
  - **Dr. Bob Utley (Free Bible Commentary)**: Verse-by-verse hermeneutical, contextual, and linguistic commentary notes for pastors and missionaries.
  - *Customizable*: Toggle any modern commentary source on or off in the Settings modal (Study tab) or popup dashboard.
- **Grabable & Slideable Commentator Chips**:
  - The horizontal chips bar is **grabable and slideable** with click-and-drag mouse grabbing (`cursor: grab; cursor: grabbing;`) and mousewheel horizontal scrolling.
  - Smoothly slide across modern commentaries and 20+ classic commentaries without clipping or awkward scrolling.
- **Rich Library of Classic Commentators**:
  - **Matthew Henry** (Concise & Commentary)
  - **John Calvin** (Calvin's Commentaries)
  - **JFB** (Jamieson-Fausset-Brown Commentary)
  - **Pulpit Commentary**
  - **Keil and Delitzsch** (Old Testament Commentary)
  - **Barnes' Notes on the Bible**
  - **Cambridge Bible for Schools and Colleges**
  - **John Gill** (Exposition of the Entire Bible)
  - **Meyer's NT Commentary**
  - **Vincent's Word Studies** / Robertson's Word Pictures
  - **Adam Clarke's Commentary**
  - **Wesley's Explanatory Notes**
  - **Scofield Reference Notes**
  - **Darby's Synopsis**
  - **Spurgeon** (Treasury of David & Expositions)
  - **Lange's Commentary**
  - **MacLaren's Expositions**
  - **Ellicott's Commentary for English Readers**
  - **Benson Commentary**
  - **Matthew Poole's Commentary**
  - **Bengel's Gnomen**
  - **Geneva Study Bible (1599)**
- **Logos Bible Software Style Docking (Right Sidebar vs. Bottom Split Panel)**:
  - Toggle between a **Right Sidebar** (560px reading pane) and a **Logos-Style Bottom Panel** (spanning full viewport width with 44vh height).
  - One-click dock toggle icon button (`⬓ Bottom` / `⬒ Sidebar`) directly in the commentary header and configurable in the extension popup dashboard.
  - In bottom panel mode, commentary text is centered at comfortable, ergonomic reading widths with spacious card layouts.
- **Fullscreen Reading Mode**:
  - Click the expand icon button (**`⤢ Fullscreen`**) to maximize the commentary drawer across the entire viewport for deep research.
  - Pressing **`Escape`** seamlessly exits fullscreen back to your docked view, and pressing **`Escape`** again closes the drawer.
- **Verse Stepper & Scripture Preview**:
  - Scripture verse text in your active translation is previewed side-by-side at the top.
  - Step through verse commentaries one-by-one with the `‹` and `›` stepper buttons.
  - One-click copy note button and direct `BibleHub ↗` deep-link.

### 9. Treasury of Scripture Knowledge (TSK) Cross-References
*Scripture interprets scripture.* The slide-out study drawer now features a dedicated **"Cross-References (TSK)"** tab alongside the Commentary tab:
- **Over 500,000 Cross-References**: Connects parallel verses throughout the Old and New Testaments from the classic Treasury of Scripture Knowledge repository.
- **Grouped by Thematic Phrase**: Verses are organized by specific phrases from the passage (e.g. `💬 “I say the truth in Christ”`, `💬 “my conscience bearing witness”`), revealing theological parallels and linguistic connections.
- **Immediate Scripture Text Previews**: Every cross-referenced verse card displays the scripture text directly inside the drawer so you can study parallel passages side-by-side without leaving your place.
- **One-Click Actions on Every Cross-Reference Card**:
  - **`↗ Jump`**: Instantly navigates to that passage on Bible.com (if the verse is in the active chapter, it smooth-scrolls and highlights it with an animated outline; if in another chapter/book, it navigates directly).
  - **`💬 Study`**: Loads that referenced verse into the study drawer immediately so you can inspect its commentaries and cross-references.
  - **`Copy`**: Copies the verse text to your clipboard with one click.
- **Seamless Verse Stepper**: Stepping with `‹` and `›` automatically updates cross-references verse-by-verse throughout the chapter.
- **Direct BibleHub TSK Deep Link**: Direct deep-link button (`BibleHub ↗`) takes you to the comprehensive TSK concordance on BibleHub.

### 10. Strong's Greek & Hebrew Lexicon / Word Study Mode
Uncover the original Greek (NT) or Hebrew (OT) root words behind the English scripture text:
- **Instant Activation**:
  - Click **`🔬 Word Study`** directly on the floating study bar.
  - Or tap **`W`** on your keyboard anytime while reading scripture to toggle Word Study mode on/off.
  - Also configurable in the extension popup and on-page settings dialog.
- **Unobtrusive Interactive Scripture Words**:
  - When Word Study mode is active, words in scripture feature a subtle, dotted underline (`.bbe-word-clickable`).
  - Hovering (or clicking) over any word pops up an unobtrusive floating lexicon card (`#bbe-word-tooltip`).
  - Zero distraction when inactive: regular reading typography remains 100% clean and undisturbed.
- **Comprehensive Floating Word Tooltip**:
  - **Strong's Number Badge**: Displays Strong's ID with distinct color coding (`.greek` blue, e.g. **G225**; `.hebrew` emerald, e.g. **H7225**).
  - **Original Script**: Shows the authentic Greek (e.g. `ἀλήθεια`) or Hebrew script (e.g. `רֵאשִׁית` with right-to-left layout and vocalization).
  - **Transliteration & Pronunciation**: Displays phonetic spelling and phonetic transliteration (e.g. `Alētheian`, `bə·rê·šîṯ`).
  - **Grammatical Morphology**: Full part of speech classification (e.g. `Noun, Feminine`, `N-AFS`, `Prep-b | N-fs`).
  - **Definition**: Concise Strong's root definition and English translation gloss.
  - **Occurrences in Scripture**: Total occurrence frequency and NASB translation usage breakdown (e.g. *110 occurrences: truth (104), certainly (2)...*).
  - **Verse Words Strip**: Scrollable chips for every word in that verse so you can examine the entire sentence structure word-by-word without closing the tooltip.
  - **Direct Actions**: **`📖 Open in Study Drawer`** button and **`BibleHub ↗`** lexicon deep-link.
- **Dedicated "Word Study / Lexicon" Tab in the Study Drawer**:
  - The slide-out study drawer includes a dedicated **`🔤 Word Study`** tab alongside `📖 Commentary` and `🔗 Cross-References (TSK)`.
  - **Full Interlinear Word Grid**: Displays every word of the verse in an interactive grid of cards showing original script, transliteration, English gloss, Strong's number, and grammatical code.
  - **Detailed Strong's Lexicon Card**: Clicking any word card loads its full Strong's entry with root origins, definition, and concordance breakdown.
  - Stepping verses with `‹` and `›` automatically updates the interlinear breakdown verse-by-verse.

### 11. Classic Book Typography & Warm Paper (Sepia) Theme
Bible reading should feel like a premium printed Bible, not a glaring computer screen:
- **Warm Paper / Sepia Theme**:
  - **Soft Ivory Background (`#fbf0d9`) with Charcoal Text (`#2c2825`)**: Specifically calibrated for hours of immersive reading without eye fatigue or harsh white glare.
  - **Full Harmony Across Elements**: Automatically styles the floating study bar, commentary and study drawer, verse badges, side navigation arrows, popovers, and dialogs in warm parchment tones.
  - **4 Reading Themes**:
    - 📜 **Warm Paper (Sepia)** (`#fbf0d9` soft ivory & warm charcoal text)
    - ☀️ **Clean Light** (Crisp pure white background with clean dark text)
    - 🌙 **Night Dark** (Deep slate dark theme for nighttime reading)
    - ⚙️ **System Default** (Follows Bible.com's native appearance)
- **Classic Book Typography (Font Picker)**:
  - **Unified `Aa` Reader Palette on the Top Pill**: Instant 1-click selection of font families, text size, and color themes directly from the `Aa` pill.
  - **4 Curated Font Families**:
    - 📖 **Classic Book Serif** (`serif`): Georgia, Merriweather, Garamond, Bookerly, Palatino Linotype. *Gives Bible reading the feel of a premium printed Bible.*
    - 🔤 **Modern Clean Sans** (`sans`): Inter, system-ui, -apple-system, Roboto, Helvetica. *Crisp, contemporary digital reading.*
    - ⌨️ **Warm Monospace** (`mono`): SF Mono, Cascadia Mono, Menlo, Consolas. *Structured editorial aesthetic.*
    - 👓 **Dyslexia Friendly** (`dyslexic`): OpenDyslexic, Lexend, Comic Sans MS, Verdana. *Features weighted baselines and distinct letterforms to reduce visual fatigue, prevent letter swapping, and enhance reading ease.*
  - **Live Typography Preview in Settings**: In the on-page settings dialog (`⚙ Settings` → `📖 Reading & Typography`), preview scripture text live with your chosen font family, theme, column width, font size, and line spacing.

### 12. Smart Verse Copy & Clean Text (Highlighted Words Only)
Quickly quote and share scripture without manual cleanup or unwanted artifacts:
- **Clean Highlighted Words by Default (No Numbers, Headings, or Reference)**:
  - By default, copying scripture copies **only the pure highlighted words**, with verse numbers (`1`, `2`), section headings (`God’s Sovereign Choice`), and footnote superscripts automatically stripped out.
  - **No reference at the end by default**: Clean scripture text is copied without trailing citations (e.g. no `— Genesis 1:1`), exactly as you highlighted it.
- **Native Selection Cleaning (Ctrl+C / Cmd+C)**:
  - Highlighting text anywhere in the chapter and pressing `Ctrl+C` / `Cmd+C` or right-clicking "Copy" automatically cleans the text on the fly, eliminating messy verse numbers and section headers from your clipboard.
- **Pure, Unobstructed Scripture Typography**:
  - No intrusive buttons or badges are inserted into the scripture text or before verse numbers, keeping the page 100% clean, elegant, and distraction-free.
  - Simply clicking the verse number opens commentary, while highlighting text summons the full floating action pill.
- **Passage Range Selection Floating Toolbar**:
  - Selecting any text or passage range (e.g. dragging across Romans 9:1-3) displays a floating pill:
    `[ 🟡 🟢 🔵 🟠 🌸 (✕) ]  |  [ 📝 Note ]`
- **Full Include / Exclude Customization in Settings**:
  - Tailor exactly what is copied and what is excluded in `⚙ Settings` (`💬 Study & Lexicon`) or the extension popup:
    - **Include Scripture Reference**: Toggle whether to append the reference (e.g. `— Romans 9:1`) at the end (Default: Off).
    - **Include Translation Code**: Toggle version code like `(ESV)` or `(NIV)` (Default: Off).
    - **Include Verse Numbers**: Keep verse numbers (`1`, `2`, `3`) in multi-verse selections (Default: Off / Stripped).
    - **Include Section Headings**: Keep section titles in copied text (Default: Off / Stripped).
    - **Clean Highlight Copy (Ctrl+C)**: Enable/disable automatic cleaning on browser copy shortcuts.
  - Live interactive copy preview card in `⚙ Settings` shows real-time output as you change preferences.

### 13. YouVersion Native Cloud Notes (100% Cloud-Delegated)
All note creation, editing, and persistence is **100% delegated to Bible.com / YouVersion's cloud servers**:
- **Zero Local Browser Storage**: No notes are ever stored in the browser (`chrome.storage.local`, `chrome.storage.sync`, or `localStorage`). All study reflections are saved directly to your authentic YouVersion account via Bible.com's cloud backend.
- **BibleGateway-Style Highlighting & Notes Pill**: Highlighting scripture reveals a sleek floating pill right above the selection with 5 YouVersion highlight colors, a dynamic `✕` delete button (when already highlighted), and a `📝 Note` button. Suppresses Bible.com's intrusive slide-in bottom popup.
- **Passage Range Selection Action**: Highlighting or selecting any passage range brings up the floating toolbar featuring the `📝 Note` button.
- **YouVersion Cloud Note Modal**:
  - Clean, distraction-free modal showing the passage reference (e.g. `Romans 9:1–3`) and your signed-in account badge (e.g. `• @JesseGollan`).
  - Automatically selects the verses in Bible.com's native React state.
  - Comfortable study reflection textarea with real-time YouVersion cloud status.
  - 1-Click "Save to YouVersion" button with instant feedback and toast confirmation.
- **Multi-Device Sync**: Any note saved through the extension immediately syncs to your YouVersion account across all your devices, including the YouVersion Bible App on iOS, Android, and web.

### 14. URL Translation Swapper (Like BibleGateway)
- Simply edit the last letters in the Bible.com URL to any core translation:
  `.ESV`, `.NIV`, `.NASB` (or `.NASB2020` / `.NASB1995`), `.NLT`, `.BSB`, `.NKJV`, `.KJV`, `.CSB`.
- The extension catches the change at `document_start` and loads the correct translation.

### 15. Parallel Translations Comparison (Columns & Interleaved Verse-by-Verse)
- Click **"⫴ Compare"** on the floating study bar.
- **Two Flexible Comparison Layouts**:
  - **🏛 Side-by-Side Columns**: Read whole chapters parallel to each other with sticky column headers.
  - **📑 Interleaved Parallel View (Verse-by-Verse)**: View each verse side-by-side (e.g. *Verse 1: ESV | NIV | BSB*), ideal for deep textual comparison of specific verses.
- **Dynamic In-Place Translation Switcher**:
  - Swap any translation slot dynamically on the fly (e.g. change ESV/NIV/NASB to ESV/NIV/BSB) using the clean dropdown switcher in each column or cell header.
  - Add translations with the `+ Add Translation ▾` dropdown or remove columns with `✕`.
- **Verse-Level Comparison Actions (Interleaved Mode)**:
  - **📋 Copy Comparison**: Copies all translations for that specific verse in clean labeled format with one click.
  - **💬 Study**: Jumps directly to that verse in the slide-out study drawer for commentaries and cross-references.
  - **📋 Individual Copy**: Copies the single translation verse text.
- **Full Theme Harmony**: Beautifully styled across Clean Light, Deep Dark, and Warm Paper Sepia modes.
- Clean layout automatically widens across the screen.

### 16. Distraction-Free Controls
- **Permanent Cookie Popup Suppression**: Preemptively confirms cookie consent at `document_start` and blocks all cookie banners, dialogs, and tracking iframes from ever appearing.
- **One-Click Clean Reading View (`👁 Clean View`)**: Toggles all distractions on or off in a single click.
- Configurable in the extension popup:
  - Top site header & search bar
  - Left navigation rail / sidebar
  - Promotional cards under chapters (*Videos, Popular Verses*)
  - Site footer
  - Version copyright information under chapter text
  - Floating bottom drawer (*Highlight / Copy / Compare / Share*)
  - Footnotes & reference markers (`#`, `a`, `b`)
  - Section headings
  - Verse numbers.

### 17. Unified Passage Navigator
- **Combined Scripture Search Pill**: Displays current scripture directly inside the search input pill (matching stock Bible.com and BibleGateway behavior). Clicking into the pill auto-selects the text for instant typing/jump, and redundant navigation arrows are eliminated in favor of Bible.com's native full-page arrows.
- **Auto-Retiring Quick Study Suggestions**: Suggestion chips appear for the first 3 times the scripture search pill is focused, then automatically dismiss permanently to keep your reading distraction-free.

### 18. Extended Reading Themes & Palettes
- **1-Click Floating Bar Cycle**: Easily cycle through all palettes on the fly using the theme button on the study bar:
  `Theme ➔ Sepia ➔ Light ➔ Dark ➔ OLED ➔ Blue ➔ Green ➔ Historical`
- **Default Theme**: **⚙ System Default** (matching Bible.com's native appearance out of the box).
- **Full Theme Roster**:
  - **⚙ System Default**: Bible.com's native appearance with full dynamic light/dark styling.
  - **🏛 Historical (Ancient Scroll)**: The scripture is set on an aged scroll or parchment page while the empty space around it becomes a faded, painterly scene. All artwork is generated in code (`historical.js`) and rendered once to a bitmap, so there are no image downloads and scrolling stays smooth. Configure it under **Settings → Reading & Typography** (or the Options page):
    - **Backdrop**: 🌳 *Olive Grove* (golden hour) · 📚 *Ancient Library* (shelves, lanterns, light shafts) · 🏛 *Classical Ruins* (columns, arch, cypress at dusk) · 🌙 *Starlit Hills* (moonlit walled city for evening reading).
    - **Page Material**: 📜 *Rolled Scroll* (with turned wooden finials) · *Pale Vellum* · *Golden Papyrus* (visible fibres) · *Weathered Parchment*.
    - **Ink**: Iron-Gall Brown · Soft Sepia · Lampblack.
    - **Rubrication**: headings and verse numbers in manuscript red, with small-caps headings.
    - **Illuminated Frame**: double-rule border and inset rule around the page.
    - **Backdrop Darkness**: 0–60% veil so the scene stays subtle behind the text.
  - **📜 Warm Paper (Sepia)**: Soft ivory background (`#fbf0d9`) with charcoal typography (`#2c2825`), specifically calibrated to mimic a luxury printed Bible and eliminate eye fatigue during prolonged study.
  - **☀️ Clean Light**: Crisp white background (`#ffffff`) with high-contrast text (`#121212`).
  - **🌙 Night Dark**: Deep charcoal slate (`#181a20`) with soft silver text (`#e2e8f0`) and royal blue accents, designed for relaxed evening reading without harsh glare.
  - **🖤 OLED Pitch Black**: True 100% pitch black (`#000000`) with high-contrast, anti-blooming silver typography (`#e0e0e0`) and electric sky accents (`#38bdf8`). Guarantees zero pixel illumination on OLED displays for maximum battery life and contrast.
  - **🌊 Midnight Navy**: Serene oceanic midnight navy (`#0b1329`) with frosty ice-blue scripture text (`#d8e2fd`) and cerulean accents.
  - **🌿 Sage Herb**: Eye-comforting botanical matcha/sage paper (`#f0f5ee`) with dark evergreen charcoal text (`#1f2e23`) and botanical emerald accents. Proven to reduce optical fatigue during intensive reading.
  - **⚙ System Default**: Retains Bible.com's native appearance.
- **Deep System-Wide Harmony**: Every theme extends seamlessly across scripture text, section headings, verse numbers, floating toolbar, study drawer, compare mode, and Strong's lexicon highlights.

### 19. YouVersion Native Color Highlighting (Yellow, Mint, Sky Blue, Amber, Rose)
- **100% Native YouVersion Cloud Highlighting**: Unlike ordinary browser extensions that store highlights in an isolated sandbox, all highlights created with Deep Bible directly leverage YouVersion's actual cloud highlight architecture (`chapterContext.setChapterHighlights`, `PendingHighlights` cookie, and `verse_colors.json`).
- **Seamless Bidirectional Sync with YouVersion Mobile App**:
  - Highlights created in the official YouVersion mobile app (iOS or Android) immediately appear on Bible.com when using the extension.
  - Highlights created via Deep Bible are saved to your YouVersion account or session, so they remain permanently visible in your YouVersion mobile app and on Bible.com even if the extension is disabled or removed.
- **5 Authentic YouVersion Palette Swatches**:
  - 💛 **Classic Yellow** (`#fffe00`): Standard scripture study highlighter.
  - 💚 **Mint Green** (`#5dff79`): Fresh botanical accent for promises and growth.
  - 💙 **Sky Blue** (`#00d6ff`): Calm cerulean for divine attributes and wisdom.
  - 🧡 **Warm Amber** (`#ffc66f`): Radiant amber gold for warnings and key commands.
  - 💗 **Gentle Rose** (`#ff95ef`): Soft rose for love, grace, and redemption.
  - 🚫 **Clear / Remove Swatch**: 1-click removal of highlights from any verse or range.
- **Multiple Highlighting Workflows**:
  - **Floating Selection Action Bar**: Selecting any text or dragging across multiple verses presents all 5 color swatches and the Clear button alongside the 📋 Copy, 💬 Commentary, and 📝 Note actions.
  - **Hover Verse Highlighter (`🖍️`) & Color Dot**: Hovering over any verse number displays a compact `🖍️` button. If the verse is highlighted, a vibrant color dot indicator displays the active color.
  - **Instant Click or Mini-Palette**:
    - Left-clicking `🖍️` opens an intuitive 5-color circular swatch popover with active color indicator and Clear option.
    - Pressing **`H`** on selection instantly applies your configured **Default Highlight Color** (or toggles highlight on hovered verse).
- **Single Cloud Source of Truth (No Stale Overrides)**:
  - YouVersion's API and cloud account serve as the authoritative single source of truth. The extension does not write to local sandboxes, guaranteeing that highlights modified or deleted on your mobile phone are never erroneously re-injected by the desktop browser.
  - **Guest Mode Warning**: If you highlight scripture while signed out, an elegant warning toast notifies you that highlights will not persist across reloads without logging in.
- **Comprehensive Theme Support**:
  - Highlighting renders with optimal readability across all 7 reading palettes (Warm Paper Sepia, Night Dark, OLED Pitch Black, Midnight Navy, Sage Herb, Clean Light, and System), featuring subtle borders and high-contrast typography so text remains crisp.


## Feedback & Support

- **Bug Reports & Feature Requests:** [Feedback & Bug Report Form](https://forms.gle/FN8w2g7MakzTS9GZ9)
- **Privacy Policy:** [PRIVACY.md](PRIVACY.md) (100% private, local-first, zero data collection)
- **License:** [PolyForm Noncommercial License 1.0.0](LICENSE)
- **GitHub Repository:** [https://github.com/Aussie-App-Studio/Deep-Bible](https://github.com/Aussie-App-Studio/Deep-Bible)

---

## License

This project is published under the **[PolyForm Noncommercial License 1.0.0](LICENSE)**.

* **Free to use & modify:** You are welcome to view, modify, remix, and adapt the code for personal study, education, church ministries, or hobby projects.
* **Share-alike spirit:** If you share or distribute changes, you must give it away freely under the same non-commercial terms.
* **No commercial sale:** You may **not** sell this code, charge subscriptions, or bundle it into commercial/for-profit products.
* **Branding Reservation:** All visual assets, logos, and Chrome Web Store graphics are Copyright © 2026 Aussie App Studio. All rights reserved.

---

## Installation / Update Instructions

1. Open Google Chrome.
2. Navigate to `chrome://extensions`.
3. Enable **Developer mode** (top-right toggle).
4. If already loaded: click the **Reload icon (🔄)** on the **Deep Bible: Study Tools for YouVersion (Bible.com)** card.
5. If not loaded yet: click **Load unpacked** and select `c:\AndroidProjects\Bible.com Enhancer`.
6. Refresh [Bible.com](https://www.bible.com/bible/111/ROM.9.NIV) to test!
