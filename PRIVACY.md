# Privacy Policy for Deep Bible: Study Tools for YouVersion (Bible.com)

**Last Updated:** November 3, 2026  
**Developer:** Aussie App Studio  
**Feedback & Inquiries:** [Feedback & Bug Report Form](https://forms.gle/FN8w2g7MakzTS9GZ9)  
**Open Source Repository:** [https://github.com/Aussie-App-Studio/Deep-Bible](https://github.com/Aussie-App-Studio/Deep-Bible)

---

## 🔒 Summary: 100% Private, Local-First & Ad-Free

**Deep Bible: Study Tools for YouVersion (Bible.com)** ("Deep Bible", "we", "our", or "the extension") is designed with a strict **privacy-first, local-first** architecture:

- **Zero Data Collection:** We do not collect, store, transmit, track, or sell any personally identifiable information (such as your name, email address, IP address, browsing history, or physical location).
- **No Third-Party Analytics or Trackers:** There are no analytics libraries (e.g. Google Analytics), advertising networks, telemetry beacons, or tracking pixels bundled into Deep Bible.
- **No Monetization of User Data:** We do not sell, rent, monetize, or trade any user information under any circumstances.
- **100% Free & Open Source:** Deep Bible is free software created for the global Christian study community.

---

## 1. What Data Deep Bible Interacts With

All extension settings and reading configurations reside **exclusively in your browser**:

| Data Type | How It Is Used | Storage Location |
| :--- | :--- | :--- |
| **Reader Preferences** | Stores your chosen reading theme (Sepia, Dark, OLED, Historical, etc.), font family, font size, column width, and layout options. | Local Browser Storage (`chrome.storage.sync` / `chrome.storage.local`) |
| **Translation Shortcuts** | Stores your custom single-key hotkey mappings (e.g. `E` for ESV, `N` for NIV) and added translations. | Local Browser Storage (`chrome.storage.sync`) |
| **Distraction-Free Toggles** | Stores whether specific site elements (headers, banners, sidebars) are hidden. | Local Browser Storage (`chrome.storage.sync`) |
| **Custom CSS Rules** | Stores optional user-written CSS style overrides. | Local Browser Storage (`chrome.storage.sync`) |
| **Parallel Comparison** | Stores your preferred translations to view in side-by-side or interleaved mode. | Local Browser Storage (`chrome.storage.sync`) |

This data remains strictly on your device (or in your private Google Chrome Sync profile if you are signed into Chrome sync). It is never sent to any developer-controlled server.

---

## 2. Chrome Extension Permissions & Host Justifications

Deep Bible complies strictly with the Google Chrome Web Store **Minimum Permissions Policy**. We only request permissions essential for core study features:

### Declared Permissions:
* **`storage`**: Used solely to persist your local reading settings, shortcuts, themes, and preferences across browser sessions using Chrome's built-in storage API.

### Host Permissions:
* **`https://www.bible.com/*`**: Required to inject the study toolbar, enable 1-key translation switching, distraction-free reading, and verse study actions directly into the Bible.com reader.
* **`https://moments.youversionapi.com/*`**: Used solely to query official translation codes when you add custom translations from Bible.com, and to synchronize your highlights directly with your own YouVersion account when you highlight verses. No authentication credentials or personal tokens are captured or stored by Deep Bible.
* **`https://biblehub.com/*`**: Used on-demand to fetch Strong's Greek & Hebrew lexicon definitions and Treasury of Scripture Knowledge (TSK) cross-references when you open the study drawer.
* **`https://*.enduringword.com/*`**: Used on-demand to fetch David Guzik's verse-by-verse expository commentary when you open the study drawer.
* **`https://*.soniclight.com/*`**: Used on-demand to fetch Dr. Thomas Constable's Expository Bible Study Notes when you open the study drawer.
* **`https://*.freebiblecommentary.org/*`**: Used on-demand to fetch Dr. Bob Utley's verse-by-verse commentary when you open the study drawer.
* **`https://*.thegospelcoalition.org/*`**: Used on-demand to fetch The Gospel Coalition (TGC) Bible commentaries when you open the study drawer.

*Note on external content fetching:* Network requests to commentary and lexicon providers query only the biblical chapter/verse reference (e.g. `Romans 8:1`) to fetch the requested study text. They transmit zero user identifiers, tracking tokens, or personal data.

---

## 3. Data Retention and Deletion

Because all configuration data is stored locally in your browser:
* **Clearing Data:** You can wipe all Deep Bible settings at any time by clicking **"↺ Reset All Defaults"** in the extension settings popup or on-page modal.
* **Uninstalling:** Removing the extension via `chrome://extensions/` immediately removes all locally cached extension data.

---

## 4. Single-Purpose Policy

The single, focused purpose of Deep Bible is to enhance the Scripture study experience on Bible.com by providing academic study tools (verse commentaries, Strong's lexicon, cross-references, translation switching, and distraction-free formatting). It performs no background activity outside of this scope.

---

## 5. Changes to This Privacy Policy

If this Privacy Policy is updated, changes will be posted to this document with an updated "Last Updated" date.

---

## 6. Contact & Support

If you have questions, feedback, or concerns regarding your privacy:
* **Feedback & Bug Report Form:** [https://forms.gle/FN8w2g7MakzTS9GZ9](https://forms.gle/FN8w2g7MakzTS9GZ9)
* **GitHub Repository:** [https://github.com/Aussie-App-Studio/Deep-Bible](https://github.com/Aussie-App-Studio/Deep-Bible)
