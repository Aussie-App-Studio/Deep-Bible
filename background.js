// Bible.com Enhancer — Background Service Worker
// Fetches and parses commentaries from BibleHub with in-memory caching

function estimateValueBytes(val, depth = 0) {
  if (val == null) return 8;
  const t = typeof val;
  if (t === 'string') return val.length * 2 + 24;
  if (t === 'number' || t === 'boolean') return 8;
  if (depth > 8) return 64;
  if (Array.isArray(val)) {
    let total = 32;
    for (let i = 0; i < val.length; i++) total += estimateValueBytes(val[i], depth + 1);
    return total;
  }
  if (t === 'object') {
    let total = 32;
    for (const k of Object.keys(val)) {
      total += k.length * 2 + 16 + estimateValueBytes(val[k], depth + 1);
    }
    return total;
  }
  return 32;
}

class BoundedCache {
  constructor(maxEntries, maxBytes) {
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
    this.map = new Map();
    this.totalBytes = 0;
  }
  get size() {
    return this.map.size;
  }
  has(key) {
    return this.map.has(key);
  }
  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    // Refresh LRU recency
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }
  delete(key) {
    const entry = this.map.get(key);
    if (!entry) return false;
    this.totalBytes -= entry.bytes;
    return this.map.delete(key);
  }
  clear() {
    this.map.clear();
    this.totalBytes = 0;
  }
  set(key, value) {
    const bytes = String(key).length * 2 + estimateValueBytes(value);
    if (this.map.has(key)) {
      this.delete(key);
    }
    // Skip caching a single item that exceeds the entire byte budget
    if (bytes > this.maxBytes || this.maxEntries <= 0) {
      return this;
    }
    while ((this.map.size >= this.maxEntries || this.totalBytes + bytes > this.maxBytes) && this.map.size > 0) {
      const oldestKey = this.map.keys().next().value;
      this.delete(oldestKey);
    }
    this.map.set(key, { value, bytes });
    this.totalBytes += bytes;
    return this;
  }
}

const memoryCommentaryCache = new BoundedCache(50, 4 * 1024 * 1024);   // "bookCode:chapter:verse..." -> Array<CommentaryBlock>
const memoryCrossrefCache = new BoundedCache(50, 1 * 1024 * 1024);     // "crossref:bookCode:chapter:verse" -> Array<Section>
const memoryInterlinearCache = new BoundedCache(80, 1 * 1024 * 1024);  // "interlinear:bookCode:chapter:verse" -> Array<InterlinearWord>
const memoryStrongsCache = new BoundedCache(150, 1 * 1024 * 1024);     // "strongs:lang:number" -> StrongsLexiconEntry

/* ---------------- Static GitHub Pages STEPBible Data (Lazy + IndexedDB Cached) ---------------- */
// Data derived from STEPBible.org (Tyndale House, Cambridge) under CC BY 4.0.
// Zero RAM/CPU/network cost unless the user actively opens Word Study.
const BBE_DATA_BASE_URL = "https://aussie-app-studio.github.io/deep-bible-data/v1";
const BBE_IDB_NAME = "bbe_stepbible_cache_v1";
const BBE_IDB_STORE = "kv";
const BBE_IDB_LRU_KEY = "__lru__";
const BBE_IDB_MAX_BOOKS = 5;
const BBE_IDB_MAX_LEX_CHUNKS = 6;
const BBE_IDB_MAX_XREF_BOOKS = 5;

// Keep only the active 1-3 books & 5 lexicon chunks in hot RAM; up to 5 books / 6 chunks in IndexedDB
const memoryStepBookCache = new BoundedCache(3, 4 * 1024 * 1024);
const memoryStepLexCache = new BoundedCache(5, 3 * 1024 * 1024);
const memoryStepXrefCache = new BoundedCache(3, 4 * 1024 * 1024);
const inflightStepFetches = new Map();
let stepDbPromise = null;
let stepDataUnavailableUntil = 0;

function openStepDb() {
  if (stepDbPromise) return stepDbPromise;
  stepDbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(BBE_IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(BBE_IDB_STORE)) {
          db.createObjectStore(BBE_IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });
  return stepDbPromise;
}

function stepLruBucketForKey(key) {
  if (key.startsWith("book:")) return { bucket: "book", limit: BBE_IDB_MAX_BOOKS };
  if (key.startsWith("lex:")) return { bucket: "lex", limit: BBE_IDB_MAX_LEX_CHUNKS };
  if (key.startsWith("xref:")) return { bucket: "xref", limit: BBE_IDB_MAX_XREF_BOOKS };
  return null;
}

function normalizeLruState(raw) {
  const obj = (raw && typeof raw === "object") ? raw : {};
  return {
    book: Array.isArray(obj.book) ? obj.book : [],
    lex: Array.isArray(obj.lex) ? obj.lex : [],
    xref: Array.isArray(obj.xref) ? obj.xref : []
  };
}

async function stepDbTouchLru(key) {
  const info = stepLruBucketForKey(key);
  if (!info) return;
  const db = await openStepDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(BBE_IDB_STORE, "readwrite");
      const store = tx.objectStore(BBE_IDB_STORE);
      const req = store.get(BBE_IDB_LRU_KEY);
      req.onsuccess = () => {
        const lru = normalizeLruState(req.result);
        const list = lru[info.bucket].filter(k => k !== key);
        list.push(key);
        while (list.length > info.limit) {
          const evicted = list.shift();
          if (evicted) store.delete(evicted);
        }
        lru[info.bucket] = list;
        store.put(lru, BBE_IDB_LRU_KEY);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch (_) {
      resolve();
    }
  });
}

async function stepDbGet(key) {
  const db = await openStepDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(BBE_IDB_STORE, "readonly");
      const req = tx.objectStore(BBE_IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });
}

async function stepDbPut(key, val) {
  const db = await openStepDb();
  if (!db) return;
  const info = stepLruBucketForKey(key);
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(BBE_IDB_STORE, "readwrite");
      const store = tx.objectStore(BBE_IDB_STORE);
      store.put(val, key);
      if (info) {
        const req = store.get(BBE_IDB_LRU_KEY);
        req.onsuccess = () => {
          const lru = normalizeLruState(req.result);
          const list = lru[info.bucket].filter(k => k !== key);
          list.push(key);
          while (list.length > info.limit) {
            const evicted = list.shift();
            if (evicted) store.delete(evicted);
          }
          lru[info.bucket] = list;
          store.put(lru, BBE_IDB_LRU_KEY);
        };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch (_) {
      resolve();
    }
  });
}

async function fetchStepJsonCached(cacheKey, urlPath, memCache) {
  if (memCache.has(cacheKey)) {
    return memCache.get(cacheKey);
  }
  if (inflightStepFetches.has(cacheKey)) {
    return inflightStepFetches.get(cacheKey);
  }

  const task = (async () => {
    // 1. Try persistent IndexedDB cache first (0ms offline/repeat speed)
    const diskVal = await stepDbGet(cacheKey);
    if (diskVal) {
      memCache.set(cacheKey, diskVal);
      stepDbTouchLru(cacheKey).catch(() => {});
      return diskVal;
    }

    // 2. If GitHub Pages recently returned 404/network failure, back off briefly
    if (Date.now() < stepDataUnavailableUntil) {
      return null;
    }

    // 3. Fetch compact static JSON from GitHub Pages
    try {
      const res = await fetch(`${BBE_DATA_BASE_URL}/${urlPath}`, { cache: "force-cache" });
      if (!res.ok) {
        if (res.status === 404) {
          stepDataUnavailableUntil = Date.now() + 60 * 1000;
        }
        return null;
      }
      const data = await res.json();
      if (!data || typeof data !== "object") return null;
      memCache.set(cacheKey, data);
      stepDbPut(cacheKey, data).catch(() => {});
      return data;
    } catch (_) {
      stepDataUnavailableUntil = Date.now() + 30 * 1000;
      return null;
    }
  })().finally(() => {
    inflightStepFetches.delete(cacheKey);
  });

  inflightStepFetches.set(cacheKey, task);
  return task;
}

function decodeStepPos(posCode) {
  if (!posCode) return "";
  const s = String(posCode).trim();
  const simpleMap = {
    "G:V": "Verb", "H:V": "Verb", "A:V": "Verb (Aramaic)",
    "G:N-M": "Noun (Masculine)", "G:N-F": "Noun (Feminine)", "G:N-N": "Noun (Neuter)",
    "H:N-M": "Noun (Masculine)", "H:N-F": "Noun (Feminine)",
    "G:A": "Adjective", "H:A": "Adjective", "G:ADV": "Adverb", "H:Adv": "Adverb",
    "G:PREP": "Preposition", "H:Prep": "Preposition", "G:CONJ": "Conjunction", "H:Conj": "Conjunction",
    "G:P": "Pronoun", "G:T": "Article", "G:PRT": "Particle", "G:INJ": "Interjection",
    "N:N-M-P": "Proper Noun (Person)", "N:N-F-P": "Proper Noun (Person)", "N:N--L": "Proper Noun (Location)"
  };
  if (simpleMap[s]) return simpleMap[s];
  if (s.startsWith("V-")) return "Verb (" + s + ")";
  if (s.startsWith("N-")) return "Noun (" + s + ")";
  if (s.startsWith("A-")) return "Adjective (" + s + ")";
  if (s.startsWith("T-")) return "Article (" + s + ")";
  if (s.startsWith("P-") || s.startsWith("R-") || s.startsWith("D-")) return "Pronoun (" + s + ")";
  if (s === "PREP") return "Preposition";
  if (s === "CONJ") return "Conjunction";
  if (s === "ADV") return "Adverb";
  if (s === "PRT") return "Particle";
  return s;
}

function unpackStepInterlinearVerse(bookData, chapter, vNum) {
  if (!bookData || !bookData.v) return null;
  const rows = bookData.v[`${chapter}:${vNum}`];
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const isHebrew = bookData.l === "h";
  const lang = isHebrew ? "hebrew" : "greek";
  const prefix = isHebrew ? "H" : "G";

  return rows.map((row) => {
    const extNum = String(row[0] || "");
    const baseNum = extNum.replace(/[A-Z]+$/i, "");
    const posCode = row[4] || "";
    return {
      strongs: baseNum ? `${prefix}${baseNum}` : "",
      num: baseNum || null,
      extNum: extNum || baseNum || null,
      lang,
      original: row[1] || "",
      translit: row[2] || "",
      gloss: row[3] || "",
      posCode,
      posFull: decodeStepPos(posCode),
      shortDef: row[5] || ""
    };
  });
}

function unpackStepLexiconEntry(chunkData, cleanLang, baseNum, extNum) {
  if (!chunkData) return null;
  const item = (extNum && chunkData[extNum]) || chunkData[baseNum];
  if (!item) return null;
  const prefix = cleanLang === "hebrew" ? "H" : "G";
  return {
    strongs: `${prefix}${baseNum}`,
    num: baseNum,
    extNum: extNum || baseNum,
    lang: cleanLang,
    original: item.o || "",
    translit: item.t || "",
    pronunciation: "",
    phonetic: "",
    pos: decodeStepPos(item.p || ""),
    gloss: item.g || "",
    definition: item.d || item.g || "",
    occurrences: "",
    totalOccurrences: item.c || null,
    origin: "",
    source: "stepbible",
    url: `https://biblehub.com/${cleanLang}/${baseNum}.htm`
  };
}

const BBE_USFM_BOOK_NAMES = {
  GEN: "Genesis", EXO: "Exodus", LEV: "Leviticus", NUM: "Numbers", DEU: "Deuteronomy",
  JOS: "Joshua", JDG: "Judges", RUT: "Ruth", "1SA": "1 Samuel", "2SA": "2 Samuel",
  "1KI": "1 Kings", "2KI": "2 Kings", "1CH": "1 Chronicles", "2CH": "2 Chronicles",
  EZR: "Ezra", NEH: "Nehemiah", EST: "Esther", JOB: "Job", PSA: "Psalm", PRO: "Proverbs",
  ECC: "Ecclesiastes", SNG: "Song of Solomon", ISA: "Isaiah", JER: "Jeremiah",
  LAM: "Lamentations", EZK: "Ezekiel", DAN: "Daniel", HOS: "Hosea", JOL: "Joel",
  AMO: "Amos", OBA: "Obadiah", JON: "Jonah", MIC: "Micah", NAM: "Nahum", HAB: "Habakkuk",
  ZEP: "Zephaniah", HAG: "Haggai", ZEC: "Zechariah", MAL: "Malachi",
  MAT: "Matthew", MRK: "Mark", LUK: "Luke", JHN: "John", ACT: "Acts", ROM: "Romans",
  "1CO": "1 Corinthians", "2CO": "2 Corinthians", GAL: "Galatians", EPH: "Ephesians",
  PHP: "Philippians", COL: "Colossians", "1TH": "1 Thessalonians", "2TH": "2 Thessalonians",
  "1TI": "1 Timothy", "2TI": "2 Timothy", TIT: "Titus", PHM: "Philemon", HEB: "Hebrews",
  JAS: "James", "1PE": "1 Peter", "2PE": "2 Peter", "1JN": "1 John", "2JN": "2 John",
  "3JN": "3 John", JUD: "Jude", REV: "Revelation"
};

function unpackStaticCrossrefs(bookData, chapter, vNum) {
  if (!bookData || !bookData.v) return null;
  const rows = bookData.v[`${chapter}:${vNum}`];
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const textMap = bookData.t || {};

  const verses = rows.map((row) => {
    const usfm = String(row[0] || "").toUpperCase();
    const ch = String(row[1] || "1");
    const vStart = String(row[2] || "1");
    const vEnd = row[3] ? String(row[3]) : "";
    const bookName = BBE_USFM_BOOK_NAMES[usfm] || usfm;
    const ref = vEnd ? `${bookName} ${ch}:${vStart}-${vEnd}` : `${bookName} ${ch}:${vStart}`;
    const textKey = vEnd ? `${usfm}.${ch}.${vStart}-${vEnd}` : `${usfm}.${ch}.${vStart}`;
    return {
      ref,
      usfm,
      bookSlug: BBE_BH_BOOK_SLUGS[usfm] || usfm.toLowerCase(),
      chapter: ch,
      verseNum: vStart,
      text: textMap[textKey] || ""
    };
  });

  if (verses.length <= 6) {
    return [{ phrase: "Top Cross-References", verses }];
  }
  return [
    { phrase: "Top Cross-References", verses: verses.slice(0, 5) },
    { phrase: "More Related Verses", verses: verses.slice(5) }
  ];
}

// USFM to BibleHub URL book slug
const BBE_BH_BOOK_SLUGS = {
  GEN: "genesis", EXO: "exodus", LEV: "leviticus", NUM: "numbers", DEU: "deuteronomy",
  JOS: "joshua", JDG: "judges", RUT: "ruth", "1SA": "1_samuel", "2SA": "2_samuel",
  "1KI": "1_kings", "2KI": "2_kings", "1CH": "1_chronicles", "2CH": "2_chronicles",
  EZR: "ezra", NEH: "nehemiah", EST: "esther", JOB: "job", PSA: "psalms", PRO: "proverbs",
  ECC: "ecclesiastes", SNG: "song_of_solomon", ISA: "isaiah", JER: "jeremiah",
  LAM: "lamentations", EZK: "ezekiel", DAN: "daniel", HOS: "hosea", JOL: "joel",
  AMO: "amos", OBA: "obadiah", JON: "jonah", MIC: "micah", NAM: "nahum", HAB: "habakkuk",
  ZEP: "zephaniah", HAG: "haggai", ZEC: "zechariah", MAL: "malachi",
  MAT: "matthew", MRK: "mark", LUK: "luke", JHN: "john", ACT: "acts", ROM: "romans",
  "1CO": "1_corinthians", "2CO": "2_corinthians", GAL: "galatians", EPH: "ephesians",
  PHP: "philippians", COL: "colossians", "1TH": "1_thessalonians", "2TH": "2_thessalonians",
  "1TI": "1_timothy", "2TI": "2_timothy", TIT: "titus", PHM: "philemon", HEB: "hebrews",
  JAS: "james", "1PE": "1_peter", "2PE": "2_peter", "1JN": "1_john", "2JN": "2_john",
  "3JN": "3_john", JUD: "jude", REV: "revelation"
};

const BBE_SLUG_TO_USFM = {};
for (const [usfm, slug] of Object.entries(BBE_BH_BOOK_SLUGS)) {
  BBE_SLUG_TO_USFM[slug] = usfm;
}

function parseTsk(html) {
  if (!html) return [];
  const startIdx = html.indexOf('<div class="padleft">');
  if (startIdx === -1) return [];

  const cutIdx = html.search(/<div class="bot2"|<table class="footer"|<div id="footer"/i);
  const content = cutIdx > -1 ? html.substring(startIdx, cutIdx) : html.substring(startIdx);

  const sections = [];
  const parts = content.split(/<p class="hdg">/i);

  if (parts.length === 1) {
    const verses = extractTskVerses(parts[0]);
    if (verses.length > 0) sections.push({ phrase: "Cross References", verses });
    return sections;
  }

  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    const endHdg = chunk.indexOf('</p>');
    if (endHdg === -1) continue;

    const phrase = chunk.substring(0, endHdg).replace(/<[^>]+>/g, '').trim();
    const body = chunk.substring(endHdg + 4);
    const verses = extractTskVerses(body);

    if (verses.length > 0) {
      sections.push({ phrase, verses });
    }
  }

  return sections;
}

function extractTskVerses(chunk) {
  const verses = [];
  const regex = /<p class="tskverse">\s*<a href="\/([^"]+)\/(\d+)-(\d+)\.htm">([^<]+)<\/a>(?:<br\s*\/?>)?([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = regex.exec(chunk)) !== null) {
    const bookSlug = match[1];
    const chapter = match[2];
    const verseNum = match[3];
    const ref = match[4].trim();
    let text = match[5].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
    const usfm = BBE_SLUG_TO_USFM[bookSlug] || bookSlug.toUpperCase();

    verses.push({
      ref,
      usfm,
      bookSlug,
      chapter,
      verseNum,
      text
    });
  }
  return verses;
}

function parseCrossrefFallback(html) {
  if (!html) return [];
  const startIdx = html.indexOf('<div class="padleft">');
  if (startIdx === -1) return [];

  const cutIdx = html.search(/<div class="bot2"|<table class="footer"|<div id="footer"/i);
  const content = cutIdx > -1 ? html.substring(startIdx, cutIdx) : html.substring(startIdx);

  const regex = /<span class="crossverse"><a href="\/([^"]+)\/(\d+)-(\d+)\.htm">([^<]+)<\/a><\/span>(?:<br\s*\/?>)?([\s\S]*?)(?=<span class="crossverse"|<div class="bot2"|$)/gi;
  let match;
  const verses = [];
  while ((match = regex.exec(content)) !== null) {
    const bookSlug = match[1];
    const chapter = match[2];
    const verseNum = match[3];
    const ref = match[4].trim();
    let text = match[5].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
    const usfm = BBE_SLUG_TO_USFM[bookSlug] || bookSlug.toUpperCase();
    verses.push({ ref, usfm, bookSlug, chapter, verseNum, text });
  }

  if (verses.length > 0) {
    return [{ phrase: "Cross References", verses }];
  }
  return [];
}

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–');
}

function parseInterlinear(html, bookCode) {
  if (!html) return [];
  const isHebrew = html.includes('class="tablefloatheb"') || html.includes('class="hebrew"');
  const lang = isHebrew ? 'hebrew' : 'greek';
  const prefix = isHebrew ? 'H' : 'G';

  const tableRegex = /<table class="tablefloat(?:heb)?">[\s\S]*?<\/table>/gi;
  const tables = html.match(tableRegex) || [];
  const words = [];

  for (const table of tables) {
    const numMatch = table.match(/href="\/(?:greek|hebrew)\/(\d+)\.htm"[^>]*title="([^"]*)"/i);
    const num = numMatch ? numMatch[1] : null;
    const titleInfo = numMatch ? decodeHtmlEntities(numMatch[2]) : '';

    const translitMatch = table.match(/<span class="translit"><a[^>]*>([\s\S]*?)<\/a><\/span>/i);
    let translit = translitMatch ? decodeHtmlEntities(translitMatch[1].replace(/<[^>]+>/g, '').trim()) : '';

    const origMatch = table.match(/<span class="(?:greek|hebrew)">([\s\S]*?)<\/span>/i);
    let original = origMatch ? decodeHtmlEntities(origMatch[1].replace(/<[^>]+>/g, '').trim()) : '';

    const engMatch = table.match(/<span class="eng">([\s\S]*?)<\/span>/i);
    let gloss = engMatch ? decodeHtmlEntities(engMatch[1].replace(/<[^>]+>/g, '').trim()) : '';

    // Grammar / Morphology (Greek /grammar/... or Hebrew /hebrewparse.htm)
    const gramMatch = table.match(/<span class="strongsnt"><a href="\/(?:grammar\/[a-z0-9\-]+|hebrewparse)\.htm" title="([^"]*)">([\s\S]*?)<\/a><\/span>/i);
    const posFull = gramMatch ? decodeHtmlEntities(gramMatch[1].trim()) : '';
    const posCode = gramMatch ? decodeHtmlEntities(gramMatch[2].replace(/<[^>]+>/g, '').trim()) : '';

    if (num || original || translit) {
      words.push({
        strongs: num ? `${prefix}${num}` : '',
        num,
        lang,
        original,
        translit,
        gloss,
        posCode,
        posFull,
        shortDef: titleInfo.replace(/Strong's (?:Greek|Hebrew) \d+:\s*/i, '').trim()
      });
    }
  }

  return words;
}

function parseStrongsLexicon(html, lang, number) {
  if (!html) return null;
  const prefix = lang === 'hebrew' ? 'H' : 'G';

  const titleMatch = html.match(/<title>Strong's (?:Greek|Hebrew):\s*(\d+)\.\s*([^(]+)\s*\(([^)]+)\)\s*--\s*([^<]+)<\/title>/i);

  const origMatch = html.match(/Original Word:\s*<\/span>\s*<span class="(?:greek|hebrew)">([^<]+)<\/span>/i);
  const original = origMatch ? decodeHtmlEntities(origMatch[1].trim()) : (titleMatch ? decodeHtmlEntities(titleMatch[2].trim()) : '');

  const posMatch = html.match(/Part of Speech:\s*<\/span>([^<]+)<br>/i);
  const pos = posMatch ? decodeHtmlEntities(posMatch[1].trim()) : '';

  const transMatch = html.match(/Transliteration:\s*<\/span>([^<]+)<br>/i);
  const translit = transMatch ? decodeHtmlEntities(transMatch[1].trim()) : (titleMatch ? decodeHtmlEntities(titleMatch[3].trim()) : '');

  const pronMatch = html.match(/Pronunciation:\s*<\/span>([^<]+)<br>/i);
  const pronunciation = pronMatch ? decodeHtmlEntities(pronMatch[1].trim()) : '';

  const phonMatch = html.match(/Phonetic Spelling:\s*<\/span>([^<]+)<br>/i);
  const phonetic = phonMatch ? decodeHtmlEntities(phonMatch[1].trim()) : '';

  const defMatch = html.match(/Definition<\/span><br>([\s\S]*?)(?:<span class="hdg"|<p|<div)/i);
  const definition = defMatch ? decodeHtmlEntities(defMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) : (titleMatch ? decodeHtmlEntities(titleMatch[4].trim()) : '');

  const occMatch = html.match(/NASB Translation<\/span><br>([\s\S]*?)(?:<p|<\/td|<div)/i);
  let occurrences = occMatch ? decodeHtmlEntities(occMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) : '';

  let totalOccurrences = 0;
  const numMatches = occurrences.match(/\((\d+)\)/g);
  if (numMatches) {
    numMatches.forEach(m => {
      const n = parseInt(m.replace(/[()]/g, ''), 10);
      if (!isNaN(n)) totalOccurrences += n;
    });
  }

  const originMatch = html.match(/Word Origin<\/span><br>([\s\S]*?)(?:<span class="hdg"|<br>|<p)/i);
  const origin = originMatch ? decodeHtmlEntities(originMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) : '';

  return {
    strongs: `${prefix}${number}`,
    num: number,
    lang,
    original,
    translit,
    pronunciation,
    phonetic,
    pos,
    definition,
    occurrences,
    totalOccurrences: totalOccurrences || null,
    origin,
    url: `https://biblehub.com/${lang}/${number}.htm`
  };
}

function parseBibleHubCommentary(html) {
  if (!html) return [];
  const parts = html.split(/<div class="vheading2">/i);
  const commentaries = [];

  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    const endHeader = chunk.indexOf('</div>');
    if (endHeader === -1) continue;

    const rawTitle = chunk.substring(0, endHeader);
    const title = rawTitle.replace(/<[^>]+>/g, '').trim();

    let bodyHtml = chunk.substring(endHeader + 6);
    const cutIdx = bodyHtml.search(/<div class="bot2"|<table|<div class="top_nav"/i);
    if (cutIdx > -1) {
      bodyHtml = bodyHtml.substring(0, cutIdx);
    }

    bodyHtml = bodyHtml
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<div class="adsbygoogle"[\s\S]*?<\/div>/gi, '')
      .replace(/<ins[\s\S]*?<\/ins>/gi, '')
      .trim();

    const cleanText = bodyHtml
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<p\s*\/?>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&quot;/gi, '"')
      .replace(/&ldquo;/gi, '“')
      .replace(/&rdquo;/gi, '”')
      .replace(/&lsquo;/gi, '‘')
      .replace(/&rsquo;/gi, '’')
      .replace(/&amp;/gi, '&')
      .replace(/&#8212;/g, '—')
      .replace(/&#8226;/g, '•')
      .replace(/\s+/g, ' ')
      .trim();

    let key = 'other';
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('henry')) key = 'matthew_henry';
    else if (lowerTitle.includes('calvin')) key = 'john_calvin';
    else if (lowerTitle.includes('jamieson') || lowerTitle.includes('jfb')) key = 'jfb';
    else if (lowerTitle.includes('pulpit')) key = 'pulpit';
    else if (lowerTitle.includes('keil') || lowerTitle.includes('delitzsch')) key = 'keil_delitzsch';
    else if (lowerTitle.includes('barnes')) key = 'barnes';
    else if (lowerTitle.includes('cambridge')) key = 'cambridge';
    else if (lowerTitle.includes('gill')) key = 'john_gill';
    else if (lowerTitle.includes('meyer')) key = 'meyer';
    else if (lowerTitle.includes('vincent') || lowerTitle.includes('word studies') || lowerTitle.includes('robertson')) key = 'vincent';
    else if (lowerTitle.includes('clarke')) key = 'adam_clarke';
    else if (lowerTitle.includes('wesley')) key = 'wesley';
    else if (lowerTitle.includes('scofield')) key = 'scofield';
    else if (lowerTitle.includes('darby')) key = 'darby';
    else if (lowerTitle.includes('spurgeon') || lowerTitle.includes('treasury of david')) key = 'spurgeon';
    else if (lowerTitle.includes('lange')) key = 'lange';
    else if (lowerTitle.includes('maclaren')) key = 'maclaren';
    else if (lowerTitle.includes('ellicott')) key = 'ellicott';
    else if (lowerTitle.includes('benson')) key = 'benson';
    else if (lowerTitle.includes('poole')) key = 'poole';
    else if (lowerTitle.includes('bengel')) key = 'bengel';
    else if (lowerTitle.includes('geneva')) key = 'geneva_1599';

    if (title && cleanText.length > 20) {
      commentaries.push({
        title,
        key,
        text: cleanText
      });
    }
  }

  const priorityOrder = [
    'matthew_henry', 'john_calvin', 'jfb', 'pulpit', 'keil_delitzsch',
    'barnes', 'cambridge', 'john_gill', 'meyer', 'vincent',
    'adam_clarke', 'wesley', 'scofield', 'darby', 'spurgeon',
    'lange', 'maclaren', 'ellicott', 'benson', 'poole', 'bengel', 'geneva_1599'
  ];
  const rank = (k) => {
    const idx = priorityOrder.indexOf(k);
    return idx === -1 ? 999 : idx;
  };

  commentaries.sort((a, b) => rank(a.key) - rank(b.key));

  return commentaries;
}

function parseCalvinCommentary(html, verseNum) {
  if (!html) return null;
  const startIdx = html.indexOf('<div class="padleft">');
  const content = startIdx > -1 ? html.slice(startIdx) : html;

  const sectionRegex = /<b>\s*(?:[1-3]?\s*[A-Za-z]+)\s+\d+:(\d+)(?:-(\d+))?\s*<\/b>/gi;
  let match;
  const sections = [];
  while ((match = sectionRegex.exec(content)) !== null) {
    const vStart = parseInt(match[1], 10);
    const vEnd = match[2] ? parseInt(match[2], 10) : vStart;
    sections.push({
      startIdx: match.index,
      headerEndIdx: match.index + match[0].length,
      vStart,
      vEnd
    });
  }

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (verseNum >= s.vStart && verseNum <= s.vEnd) {
      const nextStart = i + 1 < sections.length ? sections[i + 1].startIdx : content.indexOf('<div class="bot2"');
      const rawBody = nextStart > -1 ? content.slice(s.headerEndIdx, nextStart) : content.slice(s.headerEndIdx);
      const clean = rawBody
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/\s+/g, ' ')
        .trim();

      if (clean.length > 30) {
        return {
          title: "Calvin's Commentary on the Bible",
          key: 'john_calvin',
          text: clean
        };
      }
    }
  }
  return null;
}

/* ---------------- Modern & Expository Commentaries ---------------- */

// 1. The Gospel Coalition (TGCBC)
const TGC_ROMANS_PERICOPES = [
  { startCh: 1, startV: 1, endCh: 1, endV: 7, title: "Salutation: The Gospel Defined", section: "section-9" },
  { startCh: 1, startV: 8, endCh: 1, endV: 15, title: "Thanksgiving and Prayer", section: "section-10" },
  { startCh: 1, startV: 16, endCh: 1, endV: 17, title: "Thesis: The Gospel Displays God’s Power to Save", section: "section-11" },
  { startCh: 1, startV: 18, endCh: 1, endV: 32, title: "Idolatry That Destroys Communion with God and Neighbors", section: "section-13" },
  { startCh: 2, startV: 1, endCh: 2, endV: 11, title: "Hypocritical Judgment Invites God’s Wrath", section: "section-14" },
  { startCh: 2, startV: 12, endCh: 2, endV: 16, title: "Doers of the Law Will Be Justified", section: "section-15" },
  { startCh: 2, startV: 17, endCh: 2, endV: 29, title: "Hypocrisy and Hope", section: "section-16" },
  { startCh: 3, startV: 1, endCh: 3, endV: 8, title: "What’s with All the Questions?", section: "section-17" },
  { startCh: 3, startV: 9, endCh: 3, endV: 20, title: "Just Shut Your Mouth", section: "section-18" },
  { startCh: 3, startV: 21, endCh: 3, endV: 31, title: "The Facts Changed", section: "section-19" },
  { startCh: 4, startV: 1, endCh: 4, endV: 8, title: "Examples of Father Abraham and King David", section: "section-20" },
  { startCh: 4, startV: 9, endCh: 4, endV: 12, title: "Check the Timeline", section: "section-21" },
  { startCh: 4, startV: 13, endCh: 4, endV: 25, title: "The Promise Is from Faith", section: "section-22" },
  { startCh: 5, startV: 1, endCh: 5, endV: 11, title: "Peace, Reconciliation, and Eternal Hope", section: "section-23" },
  { startCh: 5, startV: 12, endCh: 5, endV: 21, title: "The Gift of New Representation", section: "section-24" },
  { startCh: 6, startV: 1, endCh: 7, endV: 6, title: "Under New Management", section: "section-25" },
  { startCh: 7, startV: 7, endCh: 7, endV: 25, title: "I Just Can’t Do It", section: "section-26" },
  { startCh: 8, startV: 1, endCh: 8, endV: 11, title: "No Condemnation!", section: "section-27" },
  { startCh: 8, startV: 12, endCh: 8, endV: 17, title: "Adoption as Sons", section: "section-28" },
  { startCh: 8, startV: 18, endCh: 8, endV: 30, title: "There You Go", section: "section-29" },
  { startCh: 8, startV: 31, endCh: 8, endV: 39, title: "No Separation", section: "section-30" },
  { startCh: 9, startV: 1, endCh: 9, endV: 29, title: "God’s Grace Is Just", section: "section-31" },
  { startCh: 9, startV: 30, endCh: 10, endV: 21, title: "How Do They Find What They Weren’t Looking For?", section: "section-32" },
  { startCh: 11, startV: 1, endCh: 11, endV: 10, title: "Who Has Found What They Are Looking For?", section: "section-33" },
  { startCh: 11, startV: 11, endCh: 11, endV: 32, title: "Arrogance Looks Ugly on Everyone", section: "section-34" },
  { startCh: 11, startV: 33, endCh: 11, endV: 36, title: "A Concluding Doxology", section: "section-35" },
  { startCh: 12, startV: 1, endCh: 12, endV: 21, title: "The Sacrificial Offering of Obedience to God", section: "section-37" },
  { startCh: 13, startV: 1, endCh: 13, endV: 7, title: "The Proper Offering to Caesar", section: "section-38" },
  { startCh: 13, startV: 8, endCh: 13, endV: 10, title: "The Proper Offering to Others", section: "section-39" },
  { startCh: 13, startV: 11, endCh: 13, endV: 14, title: "The Urgency of Obedience", section: "section-40" },
  { startCh: 14, startV: 1, endCh: 15, endV: 13, title: "The Weak and the Strong Must Get Along", section: "section-41" },
  { startCh: 15, startV: 14, endCh: 15, endV: 33, title: "All the Things", section: "section-43" },
  { startCh: 16, startV: 1, endCh: 16, endV: 23, title: "All the People", section: "section-44" },
  { startCh: 16, startV: 25, endCh: 16, endV: 27, title: "A Final Doxology", section: "section-45" }
];

const TGC_BOOK_AUTHORS = {
  GEN: "Dr. T. Desmond Alexander",
  MAT: "Dr. Charles L. Quarles",
  MRK: "Dr. Mark L. Strauss",
  LUK: "Dr. Alan J. Thompson",
  JHN: "Dr. Andreas J. Köstenberger",
  ACT: "Dr. Patrick Schreiner",
  ROM: "Dr. Donny Ray Mathis II",
  "1CO": "Dr. David E. Garland",
  "2CO": "Dr. Dane C. Ortlund",
  GAL: "Dr. Douglas J. Moo",
  EPH: "Dr. Benjamin L. Merkle",
  PHP: "Dr. G. Walter Hansen",
  COL: "Dr. G. K. Beale",
  HEB: "Dr. Barry C. Joslin",
  JAS: "Dr. Craig L. Blomberg",
  "1PE": "Dr. Thomas R. Schreiner",
  REV: "Dr. Thomas R. Schreiner"
};

function getTgcCommentary(bookCode, chapter, verse) {
  const ch = Number(chapter);
  const v = Number(verse);
  const rawSlug = BBE_BH_BOOK_SLUGS[bookCode] || bookCode.toLowerCase();
  const slug = rawSlug.replace(/_/g, '-');

  let sectionTitle = `${bookCode} ${chapter}`;
  let sectionAnchor = "";
  let rangeStr = `${bookCode} ${chapter}:${verse}`;
  let author = TGC_BOOK_AUTHORS[bookCode] || "The Gospel Coalition Bible Commentary";

  if (bookCode === "ROM") {
    const match = TGC_ROMANS_PERICOPES.find(p => {
      if (ch > p.startCh && ch < p.endCh) return true;
      if (ch === p.startCh && ch === p.endCh) return v >= p.startV && v <= p.endV;
      if (ch === p.startCh) return v >= p.startV;
      if (ch === p.endCh) return v <= p.endV;
      return false;
    });
    if (match) {
      sectionTitle = match.title;
      sectionAnchor = `#${match.section}`;
      rangeStr = `Romans ${match.startCh}:${match.startV}–${match.endCh === match.startCh ? match.endV : `${match.endCh}:${match.endV}`}`;
    }
  }

  const url = `https://www.thegospelcoalition.org/commentary/${slug}/${sectionAnchor}`;
  return {
    key: "the_gospel_coalition",
    title: `The Gospel Coalition — ${rangeStr} ("${sectionTitle}")`,
    author,
    badge: "Modern Evangelical (TGCBC)",
    isPericopeCard: true,
    sectionTitle,
    pericopeRange: rangeStr,
    externalUrl: url,
    text: `The Gospel Coalition Bible Commentary explores ${rangeStr} under the expository section "${sectionTitle}". Authored by ${author}, this commentary provides theological, pastoral, and literary exposition of the passage.\n\nClick below to read the complete commentary section directly on The Gospel Coalition.`
  };
}

// 2. David Guzik (Enduring Word)
const memoryGuzikCache = new BoundedCache(25, 2.5 * 1024 * 1024); // "slug-chapter" -> html

function parseGuzikCommentary(html, targetVerse, url) {
  if (!html) return null;
  const bodyMatch = html.match(/<article[\s\S]*?<\/article>/i) || html.match(/<div class="[^"]*entry-content[^"]*"[\s\S]*?<\/div>/i);
  const content = bodyMatch ? bodyMatch[0] : html;

  const sectionRegex = /<(h[2-5])[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  const sections = [];
  while ((match = sectionRegex.exec(content)) !== null) {
    const headingText = match[2].replace(/<[^>]+>/g, '').trim();
    const rangeMatch = headingText.match(/\((\d+)(?:\s*[-–]\s*(\d+))?\)/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : start;
      sections.push({ start, end, heading: headingText, startIndex: match.index + match[0].length });
    }
  }
  if (sections.length === 0) return null;

  let matchedSection = null;
  let nextStartIndex = content.length;
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (targetVerse >= s.start && targetVerse <= s.end) {
      matchedSection = s;
      if (i + 1 < sections.length) {
        const nextHeading = content.indexOf('<h', s.startIndex);
        nextStartIndex = nextHeading !== -1 ? nextHeading : sections[i + 1].startIndex;
      }
      break;
    }
  }
  if (!matchedSection) matchedSection = sections[0];

  const sectionHtml = content.substring(matchedSection.startIndex, nextStartIndex);
  const cleanParagraphs = [];
  const pRegex = /<(p|blockquote|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  let pMatch;
  while ((pMatch = pRegex.exec(sectionHtml)) !== null) {
    let pText = pMatch[2]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#8217;/g, "'")
      .replace(/&#8220;/g, '"')
      .replace(/&#8221;/g, '"')
      .replace(/&#8212;/g, '—')
      .replace(/&#8211;/g, '–')
      .trim();
    if (pText.length > 5 && !pText.startsWith('Audio for') && !pText.startsWith('Watch the video')) {
      cleanParagraphs.push(pText);
    }
  }

  const rangeText = matchedSection.start === matchedSection.end ? `v.${matchedSection.start}` : `vv.${matchedSection.start}–${matchedSection.end}`;
  return {
    key: "david_guzik",
    title: `David Guzik — Enduring Word (${rangeText})`,
    author: "David Guzik",
    badge: "Pastoral Exposition",
    heading: matchedSection.heading,
    externalUrl: url,
    text: cleanParagraphs.join('\n\n')
  };
}

async function fetchGuzikCommentary(bookCode, chapter, vNum) {
  try {
    const rawSlug = BBE_BH_BOOK_SLUGS[bookCode] || bookCode.toLowerCase();
    let guzikSlug = rawSlug.replace(/_/g, '-');
    if (guzikSlug === 'psalms') guzikSlug = 'psalm';
    const cacheKey = `${guzikSlug}-${chapter}`;
    let html = memoryGuzikCache.get(cacheKey);
    const url = `https://enduringword.com/bible-commentary/${guzikSlug}-${chapter}/`;

    if (!html) {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      if (!res.ok) return null;
      html = await res.text();
      memoryGuzikCache.set(cacheKey, html);
    }

    return parseGuzikCommentary(html, vNum, url);
  } catch (e) {
    return null;
  }
}

// 3. Dr. Thomas Constable (DTS Expository Notes / Sonic Light)
const memoryConstableBookCache = new BoundedCache(4, 4.5 * 1024 * 1024); // bookCode -> html

function parseConstableCommentary(html, chapter, vNum, url) {
  if (!html) return null;
  const exactNeedle = `<p class="ref-com"><strong>${chapter}:${vNum}`;
  let start = html.indexOf(exactNeedle);

  if (start === -1) {
    const regex = new RegExp(`<p class="ref-com"><strong>${chapter}:(\\d+)(?:[-–](\\d+))?</strong>`, 'g');
    let m;
    while ((m = regex.exec(html)) !== null) {
      const vStart = parseInt(m[1], 10);
      const vEnd = m[2] ? parseInt(m[2], 10) : vStart;
      if (vNum >= vStart && vNum <= vEnd) {
        start = m.index;
        break;
      }
    }
  }

  if (start === -1) return null;

  const nextP = html.indexOf('<p class="ref-com"><strong>', start + 20);
  const endIdx = nextP !== -1 ? nextP : (start + 2500);
  const snippet = html.substring(start, endIdx);

  const clean = snippet
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8212;/g, '—')
    .replace(/&#8211;/g, '–')
    .replace(/\[\d+\]/g, '')
    .trim();

  return {
    key: "thomas_constable",
    title: `Dr. Thomas Constable — Expository Notes (DTS)`,
    author: "Dr. Thomas L. Constable",
    badge: "Exegetical Notes",
    externalUrl: url,
    text: clean
  };
}

async function fetchConstableCommentary(bookCode, chapter, vNum) {
  try {
    const rawSlug = BBE_BH_BOOK_SLUGS[bookCode] || bookCode.toLowerCase();
    let cSlug = rawSlug.replace(/_/g, '');
    if (cSlug === 'songofsolomon') cSlug = 'song';
    const url = `https://soniclight.com/tcon/notes/html/${cSlug}/${cSlug}.htm`;

    let html = memoryConstableBookCache.get(bookCode);
    if (!html) {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      if (!res.ok) return null;
      html = await res.text();
      memoryConstableBookCache.set(bookCode, html);
    }

    return parseConstableCommentary(html, chapter, vNum, url);
  } catch (e) {
    return null;
  }
}

// 4. Dr. Bob Utley (Free Bible Commentary)
const UTLEY_NT_VOLUMES = {
  MAT: "VOL01", MRK: "VOL02", LUK: "VOL03", JHN: "VOL04", ROM: "VOL05",
  "1CO": "VOL06", "2CO": "VOL06", GAL: "VOL07", EPH: "VOL07", PHP: "VOL08",
  COL: "VOL08", "1TH": "VOL09", "2TH": "VOL09", "1TI": "VOL10", "2TI": "VOL10",
  TIT: "VOL10", PHM: "VOL08", HEB: "VOL11", JAS: "VOL12", "1PE": "VOL12",
  "2PE": "VOL12", "1JN": "VOL13", "2JN": "VOL13", "3JN": "VOL13", JUD: "VOL12",
  REV: "VOL14"
};

const memoryUtleyCache = new BoundedCache(25, 2 * 1024 * 1024); // "vol_ch" -> html

function parseUtleyCommentary(html, chapter, vNum, url) {
  if (!html) return null;
  const needle = `<b>${chapter}:${vNum}`;
  let start = html.indexOf(needle);

  if (start === -1) {
    const reg = new RegExp(`<b>${chapter}:(\\d+)(?:[-–](\\d+))?</b>`, 'g');
    let m;
    while ((m = reg.exec(html)) !== null) {
      const vStart = parseInt(m[1], 10);
      const vEnd = m[2] ? parseInt(m[2], 10) : vStart;
      if (vNum >= vStart && vNum <= vEnd) {
        start = m.index;
        break;
      }
    }
  }

  if (start === -1) return null;

  const nextB = html.indexOf(`<b>${chapter}:`, start + 10);
  const endIdx = nextB !== -1 ? nextB : (start + 2500);
  const snippet = html.substring(start, endIdx);

  const clean = snippet
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8212;/g, '—')
    .replace(/&#8211;/g, '–')
    .trim();

  return {
    key: "bob_utley",
    title: `Dr. Bob Utley — Free Bible Commentary`,
    author: "Dr. Bob Utley",
    badge: "Hermeneutical",
    externalUrl: url,
    text: clean
  };
}

async function fetchUtleyCommentary(bookCode, chapter, vNum) {
  try {
    const vol = UTLEY_NT_VOLUMES[bookCode];
    if (!vol) return null;
    const chPad = String(chapter).padStart(2, '0');
    const url = `https://www.freebiblecommentary.org/new_testament_studies/${vol}/${vol}_${chPad}.html`;
    const cacheKey = `${vol}_${chPad}`;

    let html = memoryUtleyCache.get(cacheKey);
    if (!html) {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      if (!res.ok) return null;
      html = await res.text();
      memoryUtleyCache.set(cacheKey, html);
    }

    return parseUtleyCommentary(html, chapter, vNum, url);
  } catch (e) {
    return null;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'RELOAD_EXTENSION') {
    sendResponse({ ok: true });
    setTimeout(() => chrome.runtime.reload(), 50);
    return true;
  }

  if (msg.type === 'GET_COMMENTARY') {
    const { bookCode, chapter, verse, settings } = msg;
    const S = settings || {};
    const bookSlug = BBE_BH_BOOK_SLUGS[bookCode] || bookCode.toLowerCase();
    const vNum = Number(verse) || 1;
    const enableTgc = S.commEnableTgc !== false;
    const enableGuzik = S.commEnableGuzik !== false;
    const enableConstable = S.commEnableConstable !== false;
    const enableUtley = S.commEnableUtley !== false;

    const cacheKey = `${bookCode}:${chapter}:${vNum}:${enableTgc}:${enableGuzik}:${enableConstable}:${enableUtley}`;

    if (memoryCommentaryCache.has(cacheKey)) {
      sendResponse({
        ok: true,
        reference: `${bookCode} ${chapter}:${vNum}`,
        bibleHubUrl: `https://biblehub.com/commentaries/${bookSlug}/${chapter}-${vNum}.htm`,
        commentaries: memoryCommentaryCache.get(cacheKey)
      });
      return true;
    }

    const mainUrl = `https://biblehub.com/commentaries/${bookSlug}/${chapter}-${vNum}.htm`;
    const calvinUrl = `https://biblehub.com/commentaries/calvin/${bookSlug}/${chapter}.htm`;

    const fetchPromises = [
      fetch(mainUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }).catch(() => null),
      fetch(calvinUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }).catch(() => null)
    ];

    if (enableGuzik) fetchPromises.push(fetchGuzikCommentary(bookCode, chapter, vNum));
    else fetchPromises.push(Promise.resolve(null));

    if (enableConstable) fetchPromises.push(fetchConstableCommentary(bookCode, chapter, vNum));
    else fetchPromises.push(Promise.resolve(null));

    if (enableUtley) fetchPromises.push(fetchUtleyCommentary(bookCode, chapter, vNum));
    else fetchPromises.push(Promise.resolve(null));

    Promise.all(fetchPromises).then(async ([mainRes, calvinRes, guzikBlock, constableBlock, utleyBlock]) => {
      let commentaries = [];

      // 1. Modern & Expository Commentaries
      if (enableTgc) {
        const tgcBlock = getTgcCommentary(bookCode, chapter, vNum);
        if (tgcBlock) commentaries.push(tgcBlock);
      }
      if (guzikBlock) commentaries.push(guzikBlock);
      if (constableBlock) commentaries.push(constableBlock);
      if (utleyBlock) commentaries.push(utleyBlock);

      // 2. BibleHub Commentaries
      if (mainRes && mainRes.ok) {
        const html = await mainRes.text();
        const parsed = parseBibleHubCommentary(html);
        commentaries.push(...parsed);
      }

      // 3. Calvin Commentary
      if (calvinRes && calvinRes.ok) {
        const calvinHtml = await calvinRes.text();
        const calvinBlock = parseCalvinCommentary(calvinHtml, vNum);
        if (calvinBlock && !commentaries.some(c => c.key === 'john_calvin')) {
          commentaries.push(calvinBlock);
        }
      }

      const priorityOrder = [
        'the_gospel_coalition', 'david_guzik', 'thomas_constable', 'bob_utley',
        'matthew_henry', 'john_calvin', 'jfb', 'pulpit', 'keil_delitzsch',
        'barnes', 'cambridge', 'john_gill', 'meyer', 'vincent',
        'adam_clarke', 'wesley', 'scofield', 'darby', 'spurgeon',
        'lange', 'maclaren', 'ellicott', 'benson', 'poole', 'bengel', 'geneva_1599'
      ];
      const rank = (k) => {
        const idx = priorityOrder.indexOf(k);
        return idx === -1 ? 999 : idx;
      };
      commentaries.sort((a, b) => rank(a.key) - rank(b.key));

      memoryCommentaryCache.set(cacheKey, commentaries);

      sendResponse({
        ok: true,
        reference: `${bookCode} ${chapter}:${vNum}`,
        bibleHubUrl: mainUrl,
        commentaries
      });
    }).catch(err => {
      sendResponse({
        ok: false,
        error: err.message,
        bibleHubUrl: mainUrl,
        commentaries: []
      });
    });

    return true; // Keep message channel open for async response
  }

  if (msg.type === 'PRELOAD_STUDY_DATA') {
    const upperBook = (msg.bookCode || '').toUpperCase();
    const kind = msg.kind;
    if (upperBook && BBE_BH_BOOK_SLUGS[upperBook]) {
      if (kind === 'interlinear') {
        fetchStepJsonCached(
          `book:${upperBook}`,
          `interlinear/${upperBook}.json`,
          memoryStepBookCache
        ).catch(() => {});
      } else if (kind === 'crossref') {
        fetchStepJsonCached(
          `xref:${upperBook}`,
          `crossref/${upperBook}.json`,
          memoryStepXrefCache
        ).catch(() => {});
      }
    }
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'GET_CROSSREFS') {
    const { bookCode, chapter, verse } = msg;
    const upperBook = (bookCode || 'ROM').toUpperCase();
    const bookSlug = BBE_BH_BOOK_SLUGS[upperBook] || upperBook.toLowerCase();
    const vNum = parseInt(verse, 10) || 1;
    const tskUrl = `https://biblehub.com/tsk/${bookSlug}/${chapter}-${vNum}.htm`;
    const fallbackUrl = `https://biblehub.com/crossref/${bookSlug}/${chapter}-${vNum}.htm`;
    const cacheKey = `crossref:${upperBook}:${chapter}:${vNum}`;

    if (memoryCrossrefCache.has(cacheKey)) {
      const cached = memoryCrossrefCache.get(cacheKey);
      sendResponse({
        ok: true,
        source: cached.source || 'cache',
        reference: `${upperBook} ${chapter}:${vNum}`,
        bibleHubUrl: tskUrl,
        sections: cached.sections || cached
      });
      return true;
    }

    (async () => {
      // 1. Primary: Static OpenBible.info + BSB JSON on GitHub Pages (5-book LRU IndexedDB cached)
      const bookData = await fetchStepJsonCached(
        `xref:${upperBook}`,
        `crossref/${upperBook}.json`,
        memoryStepXrefCache
      );
      const staticSections = unpackStaticCrossrefs(bookData, String(chapter), vNum);
      if (staticSections && staticSections.length > 0) {
        memoryCrossrefCache.set(cacheKey, { sections: staticSections, source: 'openbible' });
        sendResponse({
          ok: true,
          source: 'openbible',
          reference: `${upperBook} ${chapter}:${vNum}`,
          bibleHubUrl: tskUrl,
          sections: staticSections
        });
        return;
      }

      // 2. Graceful fallback: BibleHub TSK / crossref
      let sections = [];
      const res = await fetch(tskUrl);
      if (res && res.ok) {
        const html = await res.text();
        sections = parseTsk(html);
      }

      if (sections.length === 0) {
        const fallRes = await fetch(fallbackUrl).catch(() => null);
        if (fallRes && fallRes.ok) {
          const fallHtml = await fallRes.text();
          sections = parseCrossrefFallback(fallHtml);
        }
      }

      memoryCrossrefCache.set(cacheKey, { sections, source: 'biblehub' });

      sendResponse({
        ok: true,
        source: 'biblehub',
        reference: `${upperBook} ${chapter}:${vNum}`,
        bibleHubUrl: tskUrl,
        sections
      });
    })().catch(err => {
      sendResponse({
        ok: false,
        error: err.message,
        bibleHubUrl: tskUrl,
        sections: []
      });
    });

    return true; // Keep message channel open for async response
  }

  if (msg.type === 'GET_INTERLINEAR') {
    const { bookCode, chapter, verse } = msg;
    const upperBook = (bookCode || 'ROM').toUpperCase();
    const bookSlug = BBE_BH_BOOK_SLUGS[upperBook] || upperBook.toLowerCase();
    const vNum = parseInt(verse, 10) || 1;
    const intUrl = `https://biblehub.com/interlinear/${bookSlug}/${chapter}-${vNum}.htm`;
    const cacheKey = `interlinear:${upperBook}:${chapter}:${vNum}`;

    if (memoryInterlinearCache.has(cacheKey)) {
      const cached = memoryInterlinearCache.get(cacheKey);
      sendResponse({
        ok: true,
        source: cached.source || 'cache',
        reference: `${upperBook} ${chapter}:${vNum}`,
        bibleHubUrl: intUrl,
        words: cached.words || cached
      });
      return true;
    }

    (async () => {
      // 1. Primary: Static STEPBible JSON hosted on GitHub Pages + IndexedDB cached (0ms repeat)
      const bookData = await fetchStepJsonCached(
        `book:${upperBook}`,
        `interlinear/${upperBook}.json`,
        memoryStepBookCache
      );
      const stepWords = unpackStepInterlinearVerse(bookData, String(chapter), vNum);
      if (stepWords && stepWords.length > 0) {
        memoryInterlinearCache.set(cacheKey, { words: stepWords, source: 'stepbible' });
        sendResponse({
          ok: true,
          source: 'stepbible',
          reference: `${upperBook} ${chapter}:${vNum}`,
          bibleHubUrl: intUrl,
          words: stepWords
        });
        return;
      }

      // 2. Graceful fallback: BibleHub Interlinear (if GitHub Pages not yet published or offline)
      const res = await fetch(intUrl);
      if (!res.ok) throw new Error(`Interlinear HTTP ${res.status}`);
      const html = await res.text();
      const words = parseInterlinear(html, upperBook);

      memoryInterlinearCache.set(cacheKey, { words, source: 'biblehub' });

      sendResponse({
        ok: true,
        source: 'biblehub',
        reference: `${upperBook} ${chapter}:${vNum}`,
        bibleHubUrl: intUrl,
        words
      });
    })().catch(err => {
      sendResponse({
        ok: false,
        error: err.message,
        bibleHubUrl: intUrl,
        words: []
      });
    });

    return true;
  }

  if (msg.type === 'GET_STRONGS_ENTRY') {
    const { lang, number, extNum } = msg;
    const cleanLang = (lang === 'hebrew' || lang === 'H') ? 'hebrew' : 'greek';
    const prefix = cleanLang === 'hebrew' ? 'H' : 'G';
    const cleanExt = String(extNum || number || '').replace(/^[GH]/i, '').replace(/^0+/, '').toUpperCase();
    const cleanNum = cleanExt.replace(/[A-Z]+$/i, '');
    const cacheKey = `strongs:${cleanLang}:${cleanExt || cleanNum}`;

    if (memoryStrongsCache.has(cacheKey)) {
      sendResponse({
        ok: true,
        source: 'cache',
        entry: memoryStrongsCache.get(cacheKey)
      });
      return true;
    }

    (async () => {
      // 1. Primary: Static STEPBible Lexicon chunk on GitHub Pages + IndexedDB cached
      const numInt = parseInt(cleanNum, 10);
      if (!isNaN(numInt)) {
        const chunkId = `${prefix}${Math.floor(numInt / 1000)}`;
        const chunkData = await fetchStepJsonCached(
          `lex:${chunkId}`,
          `lexicon/${chunkId}.json`,
          memoryStepLexCache
        );
        const stepEntry = unpackStepLexiconEntry(chunkData, cleanLang, cleanNum, cleanExt);
        if (stepEntry) {
          memoryStrongsCache.set(cacheKey, stepEntry);
          sendResponse({
            ok: true,
            source: 'stepbible',
            entry: stepEntry
          });
          return;
        }
      }

      // 2. Graceful fallback: BibleHub Lexicon
      const url = `https://biblehub.com/${cleanLang}/${cleanNum}.htm`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Strong's HTTP ${res.status}`);
      const html = await res.text();
      const entry = parseStrongsLexicon(html, cleanLang, cleanNum);

      memoryStrongsCache.set(cacheKey, entry);

      sendResponse({
        ok: true,
        source: 'biblehub',
        entry
      });
    })().catch(err => {
      sendResponse({
        ok: false,
        error: err.message,
        entry: null
      });
    });

    return true;
  }

  if (msg.type === 'OPEN_OPTIONS') {
    const baseUrl = chrome.runtime.getURL('popup.html');
    const targetUrl = msg.section ? `${baseUrl}#${msg.section}` : baseUrl;

    if (!msg.section && chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage(() => {
        if (chrome.runtime.lastError) {
          chrome.tabs.create({ url: targetUrl }, () => sendResponse({ ok: true }));
        } else {
          sendResponse({ ok: true });
        }
      });
      return true;
    }

    chrome.tabs.query({ url: baseUrl + '*' }, (tabs) => {
      if (tabs && tabs.length > 0) {
        const t = tabs[0];
        chrome.tabs.update(t.id, { url: targetUrl, active: true }, () => {
          if (chrome.windows && t.windowId) {
            chrome.windows.update(t.windowId, { focused: true }, () => sendResponse({ ok: true }));
          } else {
            sendResponse({ ok: true });
          }
        });
      } else {
        chrome.tabs.create({ url: targetUrl }, () => sendResponse({ ok: true }));
      }
    });
    return true;
  }

  if (msg.type === 'OPEN_WELCOME') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome/welcome.html') }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }
});

// Launch Welcome Page on first install
chrome.runtime.onInstalled.addListener((details) => {
  if (details?.reason === 'install') {
    try {
      chrome.tabs.create({ url: chrome.runtime.getURL('welcome/welcome.html') });
    } catch (err) {
      console.warn('[Deep Bible] Could not launch welcome tab:', err);
    }
  }
});

