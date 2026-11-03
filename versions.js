// Bible.com identifies translations by numeric ID in the URL.
// Trailing abbreviations (e.g. .ESV) are ignored by the site natively,
// but our extension reads them and ensures the correct translation loads.
(function (global) {
  if (global.__BBE_VERSIONS_LOADED__) return;
  global.__BBE_VERSIONS_LOADED__ = true;

var BBE_VERSIONS = {
  ESV:  { id: 59,   name: "English Standard Version", short: "ESV", keyHint: "E" },
  NIV:  { id: 111,  name: "New International Version", short: "NIV", keyHint: "N" },
  NASB: { id: 2692, name: "New American Standard Bible (2020)", short: "NASB", keyHint: "S" },
  NLT:  { id: 116,  name: "New Living Translation", short: "NLT", keyHint: "L" },
  BSB:  { id: 3034, name: "Berean Standard Bible", short: "BSB", keyHint: "B" },
  NKJV: { id: 114,  name: "New King James Version", short: "NKJV", keyHint: "K" },
  KJV:    { id: 1,    name: "King James Version", short: "KJV", keyHint: "J" },
  CSB:    { id: 1713, name: "Christian Standard Bible", short: "CSB", keyHint: "" },
  AMP:    { id: 1588, name: "Amplified Bible", short: "AMP", keyHint: "" },
  NET:    { id: 107,  name: "New English Translation", short: "NET", keyHint: "" },
  NRSVUE: { id: 3523, name: "New Revised Standard Version (Updated)", short: "NRSV", keyHint: "" },
  LSB:    { id: 3345, name: "Legacy Standard Bible", short: "LSB", keyHint: "" }
};

var BBE_KEY_MAP = {
  e: "ESV",
  n: "NIV",
  s: "NASB",
  k: "NKJV",
  l: "NLT",
  t: "NLT",
  b: "BSB",
  j: "KJV"
};

// Returns merged dictionary of standard versions + user-defined custom translations
function bbeGetAllVersions(userTranslations) {
  if (!userTranslations || typeof userTranslations !== "object") {
    return { ...BBE_VERSIONS };
  }
  return { ...BBE_VERSIONS, ...userTranslations };
}

// Returns merged key mapping (single character -> uppercase translation code)
function bbeGetKeyMap(customShortcuts) {
  if (!customShortcuts || typeof customShortcuts !== "object") {
    return { ...BBE_KEY_MAP };
  }
  const map = {};
  for (const k of Object.keys(customShortcuts)) {
    const v = customShortcuts[k];
    if (v && typeof v === "string") {
      map[k.toLowerCase()] = v.toUpperCase();
    }
  }
  return map;
}

// Returns the single-key hint for a version code (e.g. "ESV" -> "E")
function bbeGetKeyHintForVersion(versionKey, customShortcuts) {
  if (!versionKey) return "";
  const target = versionKey.toUpperCase();
  const map = bbeGetKeyMap(customShortcuts);
  for (const [k, v] of Object.entries(map)) {
    if (v === target) {
      return k.toUpperCase();
    }
  }
  return "";
}

var BBE_ALIASES = {
  NASB2020: "NASB",
  NASB1995: "NASB1995",
  NASB95: "NASB1995",
  NRSV: "NRSVUE",
  LSB: "LSB",
  LEGACY: "LSB"
};

var BBE_EXTRA_IDS = {
  NASB1995: 100,
  NASB95: 100
};

// Full book code dictionary mapping names/abbreviations to YouVersion USFM codes
var BBE_BOOKS = {
  gen: "GEN", genesis: "GEN", ge: "GEN", gn: "GEN",
  exo: "EXO", exodus: "EXO", ex: "EXO", exod: "EXO",
  lev: "LEV", leviticus: "LEV", le: "LEV", lv: "LEV",
  num: "NUM", numbers: "NUM", nu: "NUM", nm: "NUM",
  deu: "DEU", deuteronomy: "DEU", dt: "DEU", deut: "DEU",
  jos: "JOS", joshua: "JOS", josh: "JOS",
  jdg: "JDG", judges: "JDG", judg: "JDG", jdgx: "JDG",
  rut: "RUT", ruth: "RUT", ru: "RUT", rth: "RUT",
  "1sa": "1SA", "1samuel": "1SA", "1sam": "1SA", "1s": "1SA", "firstsamuel": "1SA",
  "2sa": "2SA", "2samuel": "2SA", "2sam": "2SA", "2s": "2SA", "secondsamuel": "2SA",
  "1ki": "1KI", "1kings": "1KI", "1kgs": "1KI", "1k": "1KI", "firstkings": "1KI",
  "2ki": "2KI", "2kings": "2KI", "2kgs": "2KI", "2k": "2KI", "secondkings": "2KI",
  "1ch": "1CH", "1chronicles": "1CH", "1chron": "1CH", "firstchronicles": "1CH",
  "2ch": "2CH", "2chronicles": "2CH", "2chron": "2CH", "secondchronicles": "2CH",
  ezr: "EZR", ezra: "EZR", ez: "EZR",
  neh: "NEH", nehemiah: "NEH", ne: "NEH",
  est: "EST", esther: "EST", es: "EST",
  job: "JOB", jb: "JOB",
  psa: "PSA", psalms: "PSA", psalm: "PSA", ps: "PSA", psm: "PSA",
  pro: "PRO", proverbs: "PRO", prov: "PRO", pr: "PRO", prv: "PRO",
  ecc: "ECC", ecclesiastes: "ECC", eccl: "ECC", ec: "ECC", qoh: "ECC",
  sng: "SNG", songofsolomon: "SNG", songofsongs: "SNG", song: "SNG", sos: "SNG", canticles: "SNG",
  isa: "ISA", isaiah: "ISA", is: "ISA",
  jer: "JER", jeremiah: "JER", je: "JER",
  lam: "LAM", lamentations: "LAM", la: "LAM",
  ezk: "EZK", ezekiel: "EZK", ezek: "EZK", eze: "EZK",
  dan: "DAN", daniel: "DAN", da: "DAN", dn: "DAN",
  hos: "HOS", hosea: "HOS", ho: "HOS",
  jol: "JOL", joel: "JOL", joe: "JOL",
  amo: "AMO", amos: "AMO", am: "AMO",
  oba: "OBA", obadiah: "OBA", ob: "OBA",
  jon: "JON", jonah: "JON", jnh: "JON",
  mic: "MIC", micah: "MIC", mc: "MIC",
  nam: "NAM", nahum: "NAM", na: "NAM",
  hab: "HAB", habakkuk: "HAB", hb: "HAB",
  zep: "ZEP", zephaniah: "ZEP", zep: "ZEP",
  hag: "HAG", haggai: "HAG", hg: "HAG",
  zec: "ZEC", zechariah: "ZEC", zech: "ZEC", zc: "ZEC",
  mal: "MAL", malachi: "MAL", ml: "MAL",
  mat: "MAT", matthew: "MAT", matt: "MAT", mt: "MAT",
  mrk: "MRK", mark: "MRK", mk: "MRK", mr: "MRK",
  luk: "LUK", luke: "LUK", lk: "LUK", lu: "LUK",
  jhn: "JHN", john: "JHN", jn: "JHN", jhn: "JHN",
  act: "ACT", acts: "ACT", ac: "ACT",
  rom: "ROM", romans: "ROM", ro: "ROM", rm: "ROM",
  "1co": "1CO", "1corinthians": "1CO", "1cor": "1CO", "firstcorinthians": "1CO",
  "2co": "2CO", "2corinthians": "2CO", "2cor": "2CO", "secondcorinthians": "2CO",
  gal: "GAL", galatians: "GAL", ga: "GAL",
  eph: "EPH", ephesians: "EPH", ep: "EPH",
  php: "PHP", philippians: "PHP", phil: "PHP", pp: "PHP",
  col: "COL", colossians: "COL", co: "COL",
  "1th": "1TH", "1thessalonians": "1TH", "1thess": "1TH", "firstthessalonians": "1TH",
  "2th": "2TH", "2thessalonians": "2TH", "2thess": "2TH", "secondthessalonians": "2TH",
  "1ti": "1TI", "1timothy": "1TI", "1tim": "1TI", "firsttimothy": "1TI",
  "2ti": "2TI", "2timothy": "2TI", "2tim": "2TI", "secondtimothy": "2TI",
  tit: "TIT", titus: "TIT", ti: "TIT",
  phm: "PHM", philemon: "PHM", pm: "PHM",
  heb: "HEB", hebrews: "HEB", he: "HEB",
  jas: "JAS", james: "JAS", jm: "JAS", js: "JAS",
  "1pe": "1PE", "1peter": "1PE", "1pet": "1PE", "1p": "1PE", "firstpeter": "1PE",
  "2pe": "2PE", "2peter": "2PE", "2pet": "2PE", "2p": "2PE", "secondpeter": "2PE",
  "1jn": "1JN", "1john": "1JN", "1j": "1JN", "firstjohn": "1JN",
  "2jn": "2JN", "2john": "2JN", "2j": "2JN", "secondjohn": "2JN",
  "3jn": "3JN", "3john": "3JN", "3j": "3JN", "thirdjohn": "3JN",
  jud: "JUD", jude: "JUD", jd: "JUD",
  rev: "REV", revelation: "REV", revs: "REV", apocalypse: "REV"
};

// Friendly display names for USFM book codes
var BBE_BOOK_NAMES = {
  GEN: "Genesis", EXO: "Exodus", LEV: "Leviticus", NUM: "Numbers", DEU: "Deuteronomy",
  JOS: "Joshua", JDG: "Judges", RUT: "Ruth", "1SA": "1 Samuel", "2SA": "2 Samuel",
  "1KI": "1 Kings", "2KI": "2 Kings", "1CH": "1 Chronicles", "2CH": "2 Chronicles",
  EZR: "Ezra", NEH: "Nehemiah", EST: "Esther", JOB: "Job", PSA: "Psalms", PRO: "Proverbs",
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

// Total chapters per book across the 66 books of the Bible
var BBE_BOOK_CHAPTER_COUNTS = {
  GEN: 50, EXO: 40, LEV: 27, NUM: 36, DEU: 34,
  JOS: 24, JDG: 21, RUT: 4, "1SA": 31, "2SA": 24,
  "1KI": 22, "2KI": 25, "1CH": 29, "2CH": 36,
  EZR: 10, NEH: 13, EST: 10, JOB: 42, PSA: 150, PRO: 31,
  ECC: 12, SNG: 8, ISA: 66, JER: 52,
  LAM: 5, EZK: 48, DAN: 12, HOS: 14, JOL: 3,
  AMO: 9, OBA: 1, JON: 4, MIC: 7, NAM: 3, HAB: 3,
  ZEP: 3, HAG: 2, ZEC: 14, MAL: 4,
  MAT: 28, MRK: 16, LUK: 24, JHN: 21, ACT: 28, ROM: 16,
  "1CO": 16, "2CO": 13, GAL: 6, EPH: 6,
  PHP: 4, COL: 4, "1TH": 5, "2TH": 3,
  "1TI": 6, "2TI": 4, TIT: 3, PHM: 1, HEB: 13,
  JAS: 5, "1PE": 5, "2PE": 3, "1JN": 5, "2JN": 1,
  "3JN": 1, JUD: 1, REV: 22
};

// USFM to BibleHub URL book slug
var BBE_BH_BOOK_SLUGS = {
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

var BBE_SLUG_TO_USFM = {};
for (const [usfm, slug] of Object.entries(BBE_BH_BOOK_SLUGS)) {
  BBE_SLUG_TO_USFM[slug] = usfm;
}

function bbeIdForSuffix(suffix, allVersions) {
  if (!suffix) return null;
  const s = suffix.toUpperCase();
  if (BBE_EXTRA_IDS[s]) return BBE_EXTRA_IDS[s];
  const key = BBE_ALIASES[s] || s;
  const pool = allVersions || BBE_VERSIONS;
  return pool[key] ? pool[key].id : null;
}

function bbeKeyForId(id, allVersions) {
  const numId = Number(id);
  if (numId === 100) return "NASB1995";
  const pool = allVersions || BBE_VERSIONS;
  for (const k in pool) {
    if (pool[k].id === numId) return k;
  }
  return null;
}

function bbeParsePath(pathname, allVersions) {
  const clean = pathname.replace(/^\/[a-z]{2}(?:-[A-Za-z]+)?\//i, '/');
  const m = clean.match(/^\/bible\/(\d+)\/([0-9A-Z]{2,5})\.(\d+)(?:\.([0-9,\-]+))?(?:\.([A-Za-z0-9]+))?\/?$/i);
  if (!m) return null;
  let [, id, book, chapter, p3, p4] = m;
  
  let verses = null;
  let abbr = null;
  const pool = allVersions || BBE_VERSIONS;
  if (p4) {
    verses = p3;
    abbr = p4;
  } else if (p3) {
    const s = p3.toUpperCase();
    if (pool[s] || BBE_EXTRA_IDS[s] || BBE_ALIASES[s] || /^[A-Za-z0-9]+$/.test(p3)) {
      abbr = p3;
    } else {
      verses = p3;
    }
  }

  return {
    id: Number(id),
    book: book.toUpperCase(),
    chapter,
    verses: verses || null,
    abbr: abbr ? abbr.toUpperCase() : null
  };
}

function bbeBuildPath(id, abbr, p) {
  return `/bible/${id}/${p.book}.${p.chapter}${p.verses ? "." + p.verses : ""}.${abbr}`;
}

// Parses user search query into either a direct scripture target or keyword search
function bbeParseSearch(input) {
  if (!input) return null;
  const s = input.trim();
  // Match "1 Cor 13:4-8", "John 3:16", "Romans 8", "1co 13", "Ps 23", "Gen 1:1"
  const m = s.match(/^([1-3]?\s*[A-Za-z]+)\s*(\d+)(?:[:.](\d+(?:-\d+)?))?$/i);
  if (!m) return null;
  const rawBook = m[1].replace(/\s+/g, '').toLowerCase();
  const bookCode = BBE_BOOKS[rawBook];
  if (!bookCode) return null;
  return {
    book: bookCode,
    chapter: m[2],
    verses: m[3] || null
  };
}

// Popular Bible.com translations catalog for instant, zero-delay metadata resolution
var BBE_POPULAR_VERSIONS = {
  LSB:     { id: 3345, name: "Legacy Standard Bible", short: "LSB" },
  ASV:     { id: 12,   name: "American Standard Version", short: "ASV" },
  CEB:     { id: 37,   name: "Common English Bible", short: "CEB" },
  CSB:     { id: 1713, name: "Christian Standard Bible", short: "CSB" },
  AMP:     { id: 1588, name: "Amplified Bible", short: "AMP" },
  AMPC:    { id: 8,    name: "Amplified Bible, Classic Edition", short: "AMPC" },
  HCSB:    { id: 72,   name: "Holman Christian Standard Bible", short: "HCSB" },
  LEB:     { id: 90,   name: "Lexham English Bible", short: "LEB" },
  WEB:     { id: 206,  name: "World English Bible", short: "WEB" },
  WEBUS:   { id: 206,  name: "World English Bible", short: "WEBUS" },
  YLT:     { id: 821,  name: "Young's Literal Translation", short: "YLT" },
  RSV:     { id: 2017, name: "Revised Standard Version", short: "RSV" },
  RSVCE:   { id: 2018, name: "Revised Standard Version Catholic Edition", short: "RSVCE" },
  NABRE:   { id: 463,  name: "New American Bible, revised edition", short: "NABRE" },
  CPDV:    { id: 42,   name: "Catholic Public Domain Version", short: "CPDV" },
  GNT:     { id: 68,   name: "Good News Translation", short: "GNT" },
  GW:      { id: 70,   name: "GOD'S WORD", short: "GW" },
  MEV:     { id: 1171, name: "Modern English Version", short: "MEV" },
  TLB:     { id: 110,  name: "The Living Bible", short: "TLB" },
  TLV:     { id: 314,  name: "Tree of Life Version", short: "TLV" },
  TPT:     { id: 1849, name: "The Passion Translation", short: "TPT" },
  CEV:     { id: 392,  name: "Contemporary English Version", short: "CEV" },
  ERV:     { id: 406,  name: "Easy-to-Read Version", short: "ERV" },
  ICB:     { id: 1359, name: "International Children's Bible", short: "ICB" },
  NCV:     { id: 105,  name: "New Century Version", short: "NCV" },
  NIRV:    { id: 110,  name: "New International Reader's Version", short: "NIRV" },
  NMB:     { id: 1618, name: "New Matthew Bible", short: "NMB" },
  NASB1995:{ id: 100,  name: "New American Standard Bible 1995", short: "NASB1995" },
  RVR1960: { id: 149,  name: "Biblia Reina Valera 1960", short: "RVR1960" },
  RVR95:   { id: 150,  name: "Biblia Reina Valera 1995", short: "RVR95" },
  RVC:     { id: 146,  name: "Reina Valera Contemporánea", short: "RVC" },
  RVES:    { id: 147,  name: "Reina-Valera Antigua", short: "RVES" },
  NVI:     { id: 128,  name: "Nueva Versión Internacional", short: "NVI" },
  NTV:     { id: 127,  name: "Nueva Traducción Viviente", short: "NTV" },
  LBLA:    { id: 89,   name: "La Biblia de las Américas", short: "LBLA" },
  NBLA:    { id: 103,  name: "Nueva Biblia de las Américas", short: "NBLA" },
  DHH:     { id: 52,   name: "Biblia Dios Habla Hoy", short: "DHH" },
  DHH94I:  { id: 52,   name: "Biblia Dios Habla Hoy", short: "DHH94I" },
  TLA:     { id: 176,  name: "Traducción en Lenguaje Actual", short: "TLA" },
  BLPH:    { id: 28,   name: "La Palabra (versión hispanoamericana)", short: "BLPH" }
};

// Intelligently parses user input (Bible.com URL, path, numeric ID, or abbreviation code)
function bbeParseTranslationInput(input) {
  if (!input || typeof input !== "string") return null;
  const str = input.trim();
  if (!str) return null;

  // 1. Pure numeric ID: e.g. "149" or "3345"
  if (/^\d+$/.test(str)) {
    return { id: parseInt(str, 10), abbr: null, name: null };
  }

  // 2. URL format 1: bible.com/versions/149-rvr1960-biblia-reina-valera-1960
  const mVersion = str.match(/\/versions\/(\d+)(?:-([a-zA-Z0-9]+))?/i);
  if (mVersion) {
    const id = parseInt(mVersion[1], 10);
    const raw = mVersion[2] ? mVersion[2].toUpperCase() : null;
    return { id, abbr: (raw && /[a-zA-Z]/.test(raw)) ? raw : null, name: null };
  }

  // 3. URL format 2: bible.com/bible/149/ROM.9.RVR1960 or /bible/149/ROM.9
  const mBible = str.match(/\/bible\/(\d+)(?:\/([^/?#]+))?/i);
  if (mBible) {
    const id = parseInt(mBible[1], 10);
    let abbr = null;
    if (mBible[2]) {
      const parts = mBible[2].split('.');
      const last = parts[parts.length - 1];
      if (parts.length > 1 && /[a-zA-Z]/.test(last) && /^[a-zA-Z0-9]{2,12}$/.test(last)) {
        abbr = last.toUpperCase();
      }
    }
    return { id, abbr, name: null };
  }

  // 4. Raw abbreviation or code: e.g. "RVR1960", "ASV", "CEB", "LSB"
  if (/^[A-Za-z0-9]{2,12}$/.test(str) && /[A-Za-z]/.test(str)) {
    const code = str.toUpperCase();
    return { id: null, abbr: code, name: null };
  }

  return null;
}

// Automatically resolves complete translation metadata from partial information
// (e.g. from just a numeric ID, just a URL, or just an abbreviation code)
async function bbeResolveTranslation(inputOrData) {
  let partial = typeof inputOrData === "string"
    ? bbeParseTranslationInput(inputOrData)
    : { ...inputOrData };

  if (!partial) {
    throw new Error("Could not parse version information. Enter a Bible.com link, numeric ID (e.g. 149), or code (e.g. RVR1960).");
  }

  let { id, abbr, name, shortcut } = partial;
  if (typeof id === "string" && /^\d+$/.test(id.trim())) {
    id = parseInt(id.trim(), 10);
  }
  if (abbr) abbr = abbr.trim().toUpperCase();
  if (name) name = name.trim();
  if (shortcut) shortcut = shortcut.trim().toLowerCase();

  // Step 1: Check known dictionaries if abbr is known and id/name is missing
  if (abbr && (!id || !name)) {
    const match = BBE_VERSIONS[abbr] || (typeof BBE_POPULAR_VERSIONS !== "undefined" && BBE_POPULAR_VERSIONS[abbr]);
    if (match) {
      if (!id) id = match.id;
      if (!name) name = match.name;
    }
  }

  // Step 2: Check by ID in known dictionaries
  if (id && (!abbr || !name)) {
    const allPool = { ...BBE_VERSIONS, ...(typeof BBE_POPULAR_VERSIONS !== "undefined" ? BBE_POPULAR_VERSIONS : {}) };
    for (const k of Object.keys(allPool)) {
      if (allPool[k].id === id) {
        if (!abbr) abbr = allPool[k].short || k;
        if (!name) name = allPool[k].name;
        break;
      }
    }
  }

  // Step 3: If still missing abbr or name, fetch live from Bible.com official API
  if (id && (!abbr || !name)) {
    try {
      const res = await fetch("https://www.bible.com/api/bible/version/" + id);
      if (res.ok) {
        const data = await res.json();
        if (data) {
          if (!abbr) {
            abbr = (data.local_abbreviation || data.abbreviation || ("V" + id)).toUpperCase();
          }
          if (!name) {
            name = data.local_title || data.title || data.name || abbr;
          }
        }
      }
    } catch (e) {
      // Offline or network error - gracefully fall back
    }
  }

  // Step 4: Graceful fallbacks
  if (id && !abbr) {
    abbr = "V" + id;
  }
  if (!name && abbr) {
    name = abbr;
  }

  if (!id || isNaN(id) || id <= 0) {
    throw new Error("Missing or invalid Bible.com numeric ID. Please enter an ID (e.g. 149) or URL.");
  }
  if (!abbr || !/^[A-Z0-9]{2,12}$/.test(abbr)) {
    throw new Error("Missing or invalid abbreviation code (2-12 letters/numbers).");
  }

  return {
    id: Number(id),
    short: abbr,
    name: name || abbr,
    shortcut: (shortcut && /^[a-z0-9]$/.test(shortcut)) ? shortcut : ""
  };
}

  global.BBE_VERSIONS = BBE_VERSIONS;
  global.BBE_KEY_MAP = BBE_KEY_MAP;
  global.BBE_ALIASES = BBE_ALIASES;
  global.BBE_EXTRA_IDS = BBE_EXTRA_IDS;
  global.BBE_BOOKS = BBE_BOOKS;
  global.BBE_BOOK_NAMES = BBE_BOOK_NAMES;
  global.BBE_BOOK_CHAPTER_COUNTS = BBE_BOOK_CHAPTER_COUNTS;
  global.BBE_BH_BOOK_SLUGS = BBE_BH_BOOK_SLUGS;
  global.BBE_SLUG_TO_USFM = BBE_SLUG_TO_USFM;
  global.BBE_POPULAR_VERSIONS = BBE_POPULAR_VERSIONS;

  global.bbeGetAllVersions = bbeGetAllVersions;
  global.bbeGetKeyMap = bbeGetKeyMap;
  global.bbeGetKeyHintForVersion = bbeGetKeyHintForVersion;
  global.bbeIdForSuffix = bbeIdForSuffix;
  global.bbeKeyForId = bbeKeyForId;
  global.bbeParsePath = bbeParsePath;
  global.bbeBuildPath = bbeBuildPath;
  global.bbeParseSearch = bbeParseSearch;
  global.bbeParseTranslationInput = bbeParseTranslationInput;
  global.bbeResolveTranslation = bbeResolveTranslation;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      BBE_VERSIONS,
      BBE_KEY_MAP,
      BBE_ALIASES,
      BBE_EXTRA_IDS,
      BBE_BOOKS,
      BBE_BOOK_NAMES,
      BBE_BOOK_CHAPTER_COUNTS,
      BBE_BH_BOOK_SLUGS,
      BBE_SLUG_TO_USFM,
      BBE_POPULAR_VERSIONS,
      bbeGetAllVersions,
      bbeGetKeyMap,
      bbeGetKeyHintForVersion,
      bbeIdForSuffix,
      bbeKeyForId,
      bbeParsePath,
      bbeBuildPath,
      bbeParseSearch,
      bbeParseTranslationInput,
      bbeResolveTranslation
    };
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
