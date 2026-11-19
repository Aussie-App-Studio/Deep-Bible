// Bible.com identifies translations by numeric ID in the URL.
// Trailing abbreviations (e.g. .ESV) are ignored by the site natively,
// but our extension reads them and ensures the correct translation loads.
(function (global) {
  if (global.__BBE_VERSIONS_LOADED__) return;
  global.__BBE_VERSIONS_LOADED__ = true;

var BBE_VERSIONS = {
  ESV:     { id: 59,   name: "English Standard Version", short: "ESV", keyHint: "E", lang: "en" },
  NIV:     { id: 111,  name: "New International Version", short: "NIV", keyHint: "N", lang: "en" },
  NASB:    { id: 2692, name: "New American Standard Bible (2020)", short: "NASB", keyHint: "S", lang: "en" },
  NLT:     { id: 116,  name: "New Living Translation", short: "NLT", keyHint: "L", lang: "en" },
  BSB:     { id: 3034, name: "Berean Standard Bible", short: "BSB", keyHint: "B", lang: "en" },
  NKJV:    { id: 114,  name: "New King James Version", short: "NKJV", keyHint: "K", lang: "en" },
  KJV:     { id: 1,    name: "King James Version", short: "KJV", keyHint: "J", lang: "en" },
  CSB:     { id: 1713, name: "Christian Standard Bible", short: "CSB", keyHint: "", lang: "en" },
  AMP:     { id: 1588, name: "Amplified Bible", short: "AMP", keyHint: "", lang: "en" },
  NET:     { id: 107,  name: "New English Translation", short: "NET", keyHint: "", lang: "en" },
  NRSVUE:  { id: 3523, name: "New Revised Standard Version (Updated)", short: "NRSV", keyHint: "", lang: "en" },
  LSB:     { id: 3345, name: "Legacy Standard Bible", short: "LSB", keyHint: "", lang: "en" },
  LBLA:    { id: 89,   name: "La Biblia de las Américas (Spanish)", short: "LBLA", keyHint: "", lang: "es" },
  RVR1960: { id: 149,  name: "Biblia Reina Valera 1960 (Spanish)", short: "RVR1960", keyHint: "", lang: "es" },
  NAA:     { id: 1840, name: "Nova Almeida Atualizada (Portuguese)", short: "NAA", keyHint: "", lang: "pt" },
  CNVS:    { id: 41,   name: "新译本 — Chinese New Version (Chinese)", short: "CNVS", keyHint: "", lang: "zh" },
  KRV:     { id: 88,   name: "개역한글 — Korean Revised Version (Korean)", short: "KRV", keyHint: "", lang: "ko" },
  NNRV:    { id: 1483, name: "नेपाली नयाँ संशोधित संस्करण — Nepali New Revised (Nepali)", short: "NNRV", keyHint: "", lang: "ne" },
  IRVHIN:  { id: 1980, name: "इंडियन रिवाइज्ड वर्जन — Indian Revised Version (Hindi)", short: "IRVHIN", keyHint: "", lang: "hi" },
  NAV:     { id: 101,  name: "كتاب الحياة — Ketab El Hayat / New Arabic Version (Arabic)", short: "NAV", keyHint: "", lang: "ar" },
  SCH2000: { id: 157,  name: "Schlachter 2000 (German)", short: "SCH2000", keyHint: "", lang: "de" },
  NR06:    { id: 122,  name: "Nuova Riveduta 2006 (Italian)", short: "NR06", keyHint: "", lang: "it" },
  UBG:     { id: 138,  name: "Uwspółcześniona Biblia Gdańska (Polish)", short: "UBG", keyHint: "", lang: "pl" },
  NTR:     { id: 126,  name: "Noua Traducere Românească (Romanian)", short: "NTR", keyHint: "", lang: "ro" },
  NRT:     { id: 143,  name: "Новый русский перевод — New Russian Translation (Russian)", short: "NRT", keyHint: "", lang: "ru" },
  CUV:     { id: 3786, name: "БІБЛІЯ Сучасний переклад (Ukrainian)", short: "CUV", keyHint: "", lang: "uk" }
};

var BBE_ENGLISH_VERSIONS = Object.keys(BBE_VERSIONS).filter(k => BBE_VERSIONS[k].lang === "en");

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

var BBE_RESERVED_STUDY_KEYS = {
  c: "Commentary",
  r: "Cross-References"
};

// Returns merged dictionary of standard versions + user-defined custom translations
function bbeGetAllVersions(userTranslations) {
  if (!userTranslations || typeof userTranslations !== "object") {
    return { ...BBE_VERSIONS };
  }
  return { ...BBE_VERSIONS, ...userTranslations };
}

// Partitions version keys into English, user-added Custom, and Other Languages
function bbeGroupVersions(allVersions, userTranslations) {
  const pool = allVersions || bbeGetAllVersions(userTranslations);
  const userObj = (userTranslations && typeof userTranslations === "object") ? userTranslations : {};
  const english = [];
  const custom = [];
  const other = [];
  for (const key of Object.keys(pool)) {
    const builtIn = BBE_VERSIONS[key];
    if (builtIn) {
      if (builtIn.lang === "en") english.push(key);
      else other.push(key);
    } else if (userObj[key] || !builtIn) {
      custom.push(key);
    }
  }
  return { english, custom, other };
}

// Returns merged key mapping (single character -> uppercase translation code)
function bbeGetKeyMap(customShortcuts) {
  if (!customShortcuts || typeof customShortcuts !== "object") {
    return { ...BBE_KEY_MAP };
  }
  const map = {};
  for (const k of Object.keys(customShortcuts)) {
    const lk = k.toLowerCase();
    if (BBE_RESERVED_STUDY_KEYS[lk]) continue;
    const v = customShortcuts[k];
    if (v && typeof v === "string") {
      map[lk] = v.toUpperCase();
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
  LEGACY: "LSB",
  UCV2023: "CUV",
  UCV: "CUV",
  RVR60: "RVR1960",
  CNV: "CNVS",
  IRV: "IRVHIN",
  KEH: "NAV",
  SCHLACHTER: "SCH2000",
  NR2006: "NR06",
  POLUBG: "UBG",
  "НРП": "NRT"
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
  rev: "REV", revelation: "REV", revs: "REV", apocalypse: "REV",
  // Ukrainian & Russian book names and abbreviations
  "буття": "GEN", "бут": "GEN", "бт": "GEN", "бытие": "GEN", "быт": "GEN",
  "вихід": "EXO", "вих": "EXO", "вх": "EXO", "исход": "EXO", "исх": "EXO",
  "левит": "LEV", "левіт": "LEV", "лев": "LEV", "лв": "LEV",
  "числа": "NUM", "чис": "NUM", "чс": "NUM",
  "повтореннязакону": "DEU", "повторення": "DEU", "повтзакону": "DEU", "повтзак": "DEU", "повт": "DEU", "пвт": "DEU", "второзаконня": "DEU", "второзаконие": "DEU", "втор": "DEU", "вт": "DEU",
  "ісусанавина": "JOS", "ісуснавин": "JOS", "навин": "JOS", "існавина": "JOS", "існав": "JOS", "нав": "JOS", "иисусанавина": "JOS", "иисуснавин": "JOS", "иснав": "JOS",
  "суддів": "JDG", "судді": "JDG", "книгасуддів": "JDG", "суд": "JDG", "сд": "JDG", "судей": "JDG", "судьи": "JDG",
  "рут": "RUT", "руф": "RUT", "руфі": "RUT", "рт": "RUT", "рф": "RUT", "руфь": "RUT",
  "1самуїлова": "1SA", "1самуїла": "1SA", "1сам": "1SA", "1см": "1SA", "першасамуїлова": "1SA", "1самуила": "1SA", "1царств": "1SA",
  "2самуїлова": "2SA", "2самуїла": "2SA", "2сам": "2SA", "2см": "2SA", "другасамуїлова": "2SA", "2самуила": "2SA", "2царств": "2SA",
  "1царів": "1KI", "1цар": "1KI", "1цр": "1KI", "першацарів": "1KI", "1царей": "1KI", "3царств": "1KI", "3цар": "1KI",
  "2царів": "2KI", "2цар": "2KI", "2цр": "2KI", "другацарів": "2KI", "2царей": "2KI", "4царств": "2KI", "4цар": "2KI",
  "1хроніки": "1CH", "1хронік": "1CH", "1хр": "1CH", "першахроніки": "1CH", "1паралипоменон": "1CH", "1пар": "1CH", "1хроник": "1CH",
  "2хроніки": "2CH", "2хронік": "2CH", "2хр": "2CH", "другахроніки": "2CH", "2паралипоменон": "2CH", "2пар": "2CH", "2хроник": "2CH",
  "ездри": "EZR", "ездра": "EZR", "езд": "EZR", "ез": "EZR", "ездры": "EZR",
  "неемії": "NEH", "неемія": "NEH", "неем": "NEH", "неемии": "NEH", "неемия": "NEH",
  "естер": "EST", "естери": "EST", "есфір": "EST", "есф": "EST", "ест": "EST", "есфирь": "EST", "эсфирь": "EST", "эсф": "EST",
  "йова": "JOB", "йов": "JOB", "іова": "JOB", "іов": "JOB", "иова": "JOB", "иов": "JOB",
  "псалми": "PSA", "псалом": "PSA", "псалтир": "PSA", "пс": "PSA", "псалтирь": "PSA", "псалмы": "PSA",
  "приповісті": "PRO", "приповістки": "PRO", "притчі": "PRO", "прип": "PRO", "пр": "PRO", "притчи": "PRO", "притч": "PRO", "прит": "PRO",
  "екклезіястова": "ECC", "екклезіяст": "ECC", "еклезіаст": "ECC", "еклезіяст": "ECC", "еккл": "ECC", "екл": "ECC", "ек": "ECC", "проповідник": "ECC", "екклесиаст": "ECC", "екк": "ECC", "экклезиаст": "ECC",
  "піснянадпіснями": "SNG", "пісняпісень": "SNG", "піснясоломона": "SNG", "пісня": "SNG", "пісн": "SNG", "пнп": "SNG", "песньпесней": "SNG", "песнь": "SNG", "песн": "SNG",
  "ісаї": "ISA", "ісая": "ISA", "іс": "ISA", "исаии": "ISA", "исаия": "ISA", "исайя": "ISA", "ис": "ISA",
  "єремії": "JER", "єремія": "JER", "єр": "JER", "иеремии": "JER", "иеремия": "JER", "иер": "JER",
  "плачєремії": "LAM", "плач": "LAM", "плєр": "LAM", "пл": "LAM", "плачиеремии": "LAM", "плч": "LAM",
  "єзекіїля": "EZK", "єзекіїль": "EZK", "єзек": "EZK", "єз": "EZK", "иезекииля": "EZK", "иезекииль": "EZK", "иез": "EZK",
  "даниїла": "DAN", "даниїл": "DAN", "дан": "DAN", "дн": "DAN", "даниила": "DAN", "даниил": "DAN",
  "осії": "HOS", "осія": "HOS", "ос": "HOS", "осии": "HOS", "осия": "HOS",
  "йоіла": "JOL", "йоіл": "JOL", "йоїла": "JOL", "йоїл": "JOL", "іоїла": "JOL", "іоїл": "JOL", "йл": "JOL", "иоиля": "JOL", "иоиль": "JOL", "иоил": "JOL",
  "амоса": "AMO", "амос": "AMO", "ам": "AMO",
  "авдія": "OBA", "авдій": "OBA", "овадії": "OBA", "овадія": "OBA", "авд": "OBA", "ов": "OBA", "авдия": "OBA", "авдий": "OBA",
  "йони": "JON", "йона": "JON", "іони": "JON", "іона": "JON", "ионы": "JON", "иона": "JON", "ион": "JON",
  "михея": "MIC", "михей": "MIC", "міхея": "MIC", "міхей": "MIC", "мих": "MIC", "міх": "MIC", "мх": "MIC",
  "наума": "NAM", "наум": "NAM", "нм": "NAM",
  "авакума": "HAB", "авакум": "HAB", "авак": "HAB", "ав": "HAB", "аввакума": "HAB", "аввакум": "HAB", "авв": "HAB",
  "софонії": "ZEP", "софонія": "ZEP", "соф": "ZEP", "сф": "ZEP", "софонии": "ZEP", "софония": "ZEP",
  "огія": "HAG", "огій": "HAG", "аггея": "HAG", "аггей": "HAG", "ог": "HAG", "аг": "HAG", "агг": "HAG",
  "захарії": "ZEC", "захарія": "ZEC", "зах": "ZEC", "зх": "ZEC", "захарии": "ZEC", "захария": "ZEC",
  "малахії": "MAL", "малахія": "MAL", "мал": "MAL", "мл": "MAL", "малахии": "MAL", "малахия": "MAL",
  "матвія": "MAT", "матвій": "MAT", "відматвія": "MAT", "матфея": "MAT", "матфей": "MAT", "отматфея": "MAT", "мт": "MAT", "матв": "MAT", "мф": "MAT", "матф": "MAT",
  "марка": "MRK", "марко": "MRK", "марк": "MRK", "відмарка": "MRK", "отмарка": "MRK", "мр": "MRK", "мк": "MRK", "мар": "MRK", "мрк": "MRK",
  "луки": "LUK", "лука": "LUK", "відлуки": "LUK", "отлуки": "LUK", "лк": "LUK", "лук": "LUK",
  "івана": "JHN", "іван": "JHN", "відівана": "JHN", "йоана": "JHN", "йоан": "JHN", "відйоана": "JHN", "іоанна": "JHN", "іоана": "JHN", "иоанна": "JHN", "иоанн": "JHN", "отиоанна": "JHN", "ів": "JHN", "ін": "JHN", "йн": "JHN", "ин": "JHN", "иоан": "JHN",
  "дії": "ACT", "діяння": "ACT", "діїапостолів": "ACT", "діянняапостолів": "ACT", "діян": "ACT", "деяния": "ACT", "деянияапостолов": "ACT", "деян": "ACT",
  "римлян": "ROM", "римлянам": "ROM", "доримлян": "ROM", "кримлянам": "ROM", "рим": "ROM", "рм": "ROM",
  "1коринтян": "1CO", "1коринтянам": "1CO", "1докоринтян": "1CO", "1коринфян": "1CO", "1коринфянам": "1CO", "1кор": "1CO", "1кр": "1CO",
  "2коринтян": "2CO", "2коринтянам": "2CO", "2докоринтян": "2CO", "2коринфян": "2CO", "2коринфянам": "2CO", "2кор": "2CO", "2кр": "2CO",
  "галатів": "GAL", "галатам": "GAL", "догалатів": "GAL", "кгалатам": "GAL", "гал": "GAL", "гл": "GAL",
  "ефесян": "EPH", "ефесянам": "EPH", "доефесян": "EPH", "кефесянам": "EPH", "еф": "EPH",
  "филипян": "PHP", "филипянам": "PHP", "дофилипян": "PHP", "філіппійців": "PHP", "філіппійцям": "PHP", "филиппийцам": "PHP", "кфилиппийцам": "PHP", "фил": "PHP", "флп": "PHP", "філ": "PHP",
  "колосян": "COL", "колосянам": "COL", "доколосян": "COL", "колоссян": "COL", "колоссянам": "COL", "кколоссянам": "COL", "кол": "COL", "кл": "COL",
  "1солунян": "1TH", "1солунянам": "1TH", "1досолунян": "1TH", "1фессалонікійців": "1TH", "1фессалонікійцям": "1TH", "1тесалонікійців": "1TH", "1фессалоникийцам": "1TH", "1сол": "1TH", "1фес": "1TH", "1тес": "1TH", "1сл": "1TH",
  "2солунян": "2TH", "2солунянам": "2TH", "2досолунян": "2TH", "2фессалонікійців": "2TH", "2фессалонікійцям": "2TH", "2тесалонікійців": "2TH", "2фессалоникийцам": "2TH", "2сол": "2TH", "2фес": "2TH", "2тес": "2TH", "2сл": "2TH",
  "1тимофія": "1TI", "1тимофію": "1TI", "1тимофієві": "1TI", "1дотимофія": "1TI", "1тимотея": "1TI", "1тимофею": "1TI", "1тимофея": "1TI", "1тим": "1TI", "1тм": "1TI",
  "2тимофія": "2TI", "2тимофію": "2TI", "2тимофієві": "2TI", "2дотимофія": "2TI", "2тимотея": "2TI", "2тимофею": "2TI", "2тимофея": "2TI", "2тим": "2TI", "2тм": "2TI",
  "тита": "TIT", "титу": "TIT", "титові": "TIT", "дотита": "TIT", "тит": "TIT", "тт": "TIT",
  "филимона": "PHM", "филимону": "PHM", "филимонові": "PHM", "дофилимона": "PHM", "філімона": "PHM", "флм": "PHM", "филм": "PHM",
  "євреїв": "HEB", "євреям": "HEB", "доєвреїв": "HEB", "евреям": "HEB", "кевреям": "HEB", "євр": "HEB", "єв": "HEB", "евр": "HEB",
  "якова": "JAS", "яків": "JAS", "як": "JAS", "иакова": "JAS", "иаков": "JAS", "иак": "JAS",
  "1петра": "1PE", "1петро": "1PE", "1пет": "1PE", "1пт": "1PE",
  "2петра": "2PE", "2петро": "2PE", "2пет": "2PE", "2пт": "2PE",
  "1івана": "1JN", "1іван": "1JN", "1йоана": "1JN", "1іоанна": "1JN", "1иоанна": "1JN", "1ів": "1JN", "1ін": "1JN", "1йн": "1JN", "1ин": "1JN", "1иоан": "1JN",
  "2івана": "2JN", "2іван": "2JN", "2йоана": "2JN", "2іоанна": "2JN", "2иоанна": "2JN", "2ів": "2JN", "2ін": "2JN", "2йн": "2JN", "2ин": "2JN", "2иоан": "2JN",
  "3івана": "3JN", "3іван": "3JN", "3йоана": "3JN", "3іоанна": "3JN", "3иоанна": "3JN", "3ів": "3JN", "3ін": "3JN", "3йн": "3JN", "3ин": "3JN", "3иоан": "3JN",
  "юди": "JUD", "юда": "JUD", "іуди": "JUD", "юд": "JUD", "иуды": "JUD", "иуда": "JUD", "иуд": "JUD",
  "обявлення": "REV", "обявленняівана": "REV", "одкровення": "REV", "одкр": "REV", "обяв": "REV", "об": "REV", "откровение": "REV", "откр": "REV", "апокалипсис": "REV"
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
  const clean = decodeURIComponent(pathname).replace(/^\/[a-z]{2}(?:-[A-Za-z]+)?\//i, '/');
  const m = clean.match(/^\/bible\/(\d+)\/([0-9A-Z]{2,5})\.(\d+)(?:\.([0-9,\-–]+))?(?:\.([^\s/?#.]+))?\/?$/i);
  if (!m) return null;
  let [, id, book, chapter, p3, p4] = m;

  let verses = null;
  let abbr = null;
  const pool = allVersions || BBE_VERSIONS;
  if (p4) {
    verses = p3 ? p3.replace(/–/g, "-") : null;
    abbr = p4;
  } else if (p3) {
    const s = p3.toUpperCase();
    if (/^[0-9,\-–]+$/.test(p3)) {
      verses = p3.replace(/–/g, "-");
    } else if (pool[s] || BBE_EXTRA_IDS[s] || BBE_ALIASES[s] || /[A-Za-z\u0080-\uFFFF]/.test(p3)) {
      abbr = p3;
    } else {
      verses = p3.replace(/–/g, "-");
    }
  }

  const numId = Number(id);
  const rawUpper = abbr ? abbr.toUpperCase() : null;
  const resolvedAbbr = (rawUpper && (BBE_ALIASES[rawUpper] || rawUpper)) || bbeKeyForId(numId, pool);

  return {
    id: numId,
    book: book.toUpperCase(),
    chapter,
    verses: verses || null,
    abbr: resolvedAbbr || null
  };
}

function bbeBuildPath(id, abbr, p) {
  const verSuffix = abbr || p.abbr || bbeKeyForId(id);
  return `/bible/${id}/${p.book}.${p.chapter}${p.verses ? "." + p.verses : ""}${verSuffix ? "." + verSuffix : ""}`;
}

// Parses user search query into either a direct scripture target or keyword search
// Supports references (e.g. "John 3:16", "Romans 8", "1 Cor 13:4-8", "Ps 23", "Jude 24")
// and optional trailing version codes (e.g. "John 3:16 NIV", "Rom 8:28 in ESV")
function bbeParseSearch(input) {
  if (!input) return null;
  const s = input.trim();
  // Match "1 Cor 13:4-8", "John 3:16", "Romans 6:1-7", "Romans 8", "1co 13", "Ps 23", "Івана 3:16", "Пс 23"
  // Optionally allows trailing version suffix: "John 3:16 ESV", "Rom 8 in NIV", "Івана 3:16 CUV"
  const m = s.match(/^([1-3]?(?:-[\p{L}]+)?\s*[\p{L}.'’ʼ]+(?:\s+[\p{L}.'’ʼ]+)*?)\s*(\d+)(?:\s*[:.]\s*([0-9]+(?:\s*[-–,]\s*[0-9]+)*))?(?:\s+(?:in\s+|у\s+|в\s+)?([\p{L}\p{N}]+))?$/iu);
  if (!m) return null;
  const rawBook = m[1]
    .replace(/^([1-3])-(?:е|ше|ге|є|тє|я|й)(?=\s|[\p{L}])/iu, '$1')
    .replace(/[\s.'’ʼ\-]+/g, '')
    .toLowerCase();
  const bookCode = BBE_BOOKS[rawBook];
  if (!bookCode) return null;

  let version = null;
  if (m[4]) {
    const candidate = m[4].toUpperCase();
    if (bbeIdForSuffix(candidate)) {
      version = candidate;
    } else {
      return null;
    }
  }

  let chapter = m[2];
  let cleanVerses = m[3] ? m[3].replace(/\s+/g, '').replace(/–/g, '-') : null;

  // Single-chapter books (e.g. Jude, Philemon, Obadiah, 2 John, 3 John):
  // "Jude 24" -> chapter 1, verse 24
  if (BBE_BOOK_CHAPTER_COUNTS && BBE_BOOK_CHAPTER_COUNTS[bookCode] === 1 && !cleanVerses && chapter !== "1") {
    cleanVerses = chapter;
    chapter = "1";
  }

  return {
    book: bookCode,
    chapter,
    verses: cleanVerses || null,
    version: version || null
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
  TLV:     { id: 314,  name: "Tree of Life Version", short: "TLV" },
  TPT:     { id: 1849, name: "The Passion Translation", short: "TPT" },
  CEV:     { id: 392,  name: "Contemporary English Version", short: "CEV" },
  ERV:     { id: 406,  name: "Easy-to-Read Version", short: "ERV" },
  ICB:     { id: 1359, name: "International Children's Bible", short: "ICB" },
  NCV:     { id: 105,  name: "New Century Version", short: "NCV" },
  NIRV:    { id: 110,  name: "New International Reader's Version", short: "NIRV" },
  MSG:     { id: 97,   name: "The Message", short: "MSG" },
  CJB:     { id: 1275, name: "Complete Jewish Bible", short: "CJB" },
  NRSV:    { id: 2016, name: "New Revised Standard Version", short: "NRSV" },
  GNV:     { id: 2163, name: "Geneva Bible", short: "GNV" },
  DARBY:   { id: 194,  name: "Darby's Translation (1890)", short: "DARBY" },
  TOJB2011:{ id: 1305, name: "The Orthodox Jewish Bible", short: "TOJB2011" },
  JUB:     { id: 1077, name: "Jubilee Bible", short: "JUB" },
  NMB:     { id: 1618, name: "New Matthew Bible", short: "NMB" },
  NASB1995:{ id: 100,  name: "New American Standard Bible 1995", short: "NASB1995" },
  NASB95:  { id: 100,  name: "New American Standard Bible 1995", short: "NASB1995" },
  NIVUK:   { id: 113,  name: "New International Version (Anglicised)", short: "NIVUK" },
  EASY:    { id: 2079, name: "EasyEnglish Bible 2024", short: "EASY" },
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
  BLPH:    { id: 28,   name: "La Palabra (versión hispanoamericana)", short: "BLPH" },
  NAA:     { id: 1840, name: "Nova Almeida Atualizada (Portuguese)", short: "NAA" },
  ARA:     { id: 1608, name: "Almeida Revista e Atualizada (Portuguese)", short: "ARA" },
  NVT:     { id: 1930, name: "Nova Versão Transformadora (Portuguese)", short: "NVT" },
  CNVS:    { id: 41,   name: "新译本 — Chinese New Version (Simplified)", short: "CNVS" },
  RCUVSS:  { id: 140,  name: "和合本修订版 — Revised Chinese Union Version (Simplified)", short: "RCUVSS" },
  CUNPSS:  { id: 48,   name: "新标点和合本 — Chinese Union New Punctuation (Simplified)", short: "CUNPSS" },
  KRV:     { id: 88,   name: "개역한글 — Korean Revised Version", short: "KRV" },
  RNKSV:   { id: 142,  name: "새번역 — Revised New Korean Standard Version", short: "RNKSV" },
  NNRV:    { id: 1483, name: "नेपाली नयाँ संशोधित संस्करण — Nepali New Revised Version", short: "NNRV" },
  IRVHIN:  { id: 1980, name: "इंडियन रिवाइज्ड वर्जन (IRV) हिंदी — Indian Revised Version (Hindi)", short: "IRVHIN" },
  HINOVBSI:{ id: 1683, name: "पवित्र बाइबिल OV (Re-edited) Bible (BSI Hindi)", short: "HINOVBSI" },
  NAV:     { id: 101,  name: "كتاب الحياة — Ketab El Hayat / New Arabic Version", short: "NAV" },
  AVD:     { id: 13,   name: "الكتاب المقدس — Smith & Van Dyck Arabic Bible", short: "AVD" },
  SCH2000: { id: 157,  name: "Die Bibel (Schlachter 2000 — German)", short: "SCH2000" },
  ELB:     { id: 57,   name: "Elberfelder Bibel (German)", short: "ELB" },
  NR06:    { id: 122,  name: "Nuova Riveduta 2006 (Italian)", short: "NR06" },
  UBG:     { id: 138,  name: "Uwspółcześniona Biblia Gdańska (Polish)", short: "UBG" },
  BW1975:  { id: 3490, name: "Biblia Warszawska 1975 (Polish)", short: "BW1975" },
  NTR:     { id: 126,  name: "Noua Traducere Românească (Romanian)", short: "NTR" },
  VDC:     { id: 191,  name: "Biblia Dumitru Cornilescu (Romanian)", short: "VDC" },
  EDC100:  { id: 3914, name: "Biblia Dumitru Cornilescu 2024 (Romanian)", short: "EDC100" },
  NRT:     { id: 143,  name: "Новый русский перевод — New Russian Translation (НРП)", short: "NRT" },
  SYNO:    { id: 400,  name: "Синодальный перевод — Russian Synodal Bible", short: "SYNO" },
  CUV:     { id: 3786, name: "БІБЛІЯ Сучасний переклад (Ukrainian — Suchasniy pereklad)", short: "CUV" },
  UCV2023: { id: 3786, name: "Ukrainian Contemporary Version 2023 (Сучасний переклад)", short: "CUV" }
};

// Intelligently parses user input (Bible.com URL, path, numeric ID, or abbreviation code)
function bbeParseTranslationInput(input) {
  if (!input || typeof input !== "string") return null;
  const str = input.trim();
  if (!str) return null;

  // 1. Pure numeric ID: e.g. "149" or "3345"
  if (/^\d+$/.test(str)) {
    return { id: parseInt(str, 10), abbr: null, slugAbbr: null, name: null };
  }

  // 2. URL format 1: bible.com/versions/149-rvr1960-biblia-reina-valera-1960
  const mVersion = str.match(/\/versions\/(\d+)(?:-([a-zA-Z0-9]+))?/i);
  if (mVersion) {
    const id = parseInt(mVersion[1], 10);
    const raw = mVersion[2] ? mVersion[2].toUpperCase() : null;
    const slugAbbr = (raw && /^[A-Z0-9]{2,12}$/.test(raw) && /[A-Z]/.test(raw)) ? raw : null;
    return { id, abbr: null, slugAbbr, name: null };
  }

  // 3. URL format 2: bible.com/bible/149/ROM.9.RVR1960 or /bible/149/ROM.9
  const mBible = str.match(/\/bible\/(\d+)(?:\/([^/?#]+))?/i);
  if (mBible) {
    const id = parseInt(mBible[1], 10);
    let abbr = null;
    if (mBible[2]) {
      const parts = mBible[2].split('.');
      const last = parts[parts.length - 1];
      if (parts.length > 1 && /[a-zA-Z]/.test(last) && /^[a-zA-Z0-9\-]{2,16}$/.test(last)) {
        abbr = last.toUpperCase();
      }
    }
    return { id, abbr, slugAbbr: null, name: null };
  }

  // 4. Raw abbreviation or code: e.g. "RVR1960", "ASV", "CEB", "LSB", "NRSV-CI"
  if (/^[A-Za-z0-9\-]{2,16}$/.test(str) && /[A-Za-z]/.test(str)) {
    const code = str.toUpperCase();
    return { id: null, abbr: code, slugAbbr: null, name: null, nameQuery: null };
  }

  // 5. Full or partial translation name: e.g. "Jubilee Bible", "Young's Literal"
  if (str.length >= 2 && str.length <= 80 && /[A-Za-z]{2,}/.test(str) && !/https?:\/\//i.test(str) && !str.includes("/")) {
    return { id: null, abbr: null, slugAbbr: null, name: null, nameQuery: str };
  }

  return null;
}

function bbeFindVersionByQuery(query) {
  if (!query || typeof query !== "string") return null;
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const allPool = { ...BBE_VERSIONS, ...(typeof BBE_POPULAR_VERSIONS !== "undefined" ? BBE_POPULAR_VERSIONS : {}) };
  const entries = Object.values(allPool);

  // Priority: exact short -> exact name -> name startsWith -> name includes -> short includes
  return entries.find(v => (v.short || "").toLowerCase() === q)
    || entries.find(v => (v.name || "").toLowerCase() === q)
    || entries.find(v => (v.name || "").toLowerCase().startsWith(q))
    || entries.find(v => (v.name || "").toLowerCase().includes(q))
    || entries.find(v => (v.short || "").toLowerCase().includes(q))
    || null;
}

// Automatically resolves complete translation metadata from partial information
// (e.g. from just a numeric ID, just a URL, just a code, or a translation name)
async function bbeResolveTranslation(inputOrData) {
  let partial = typeof inputOrData === "string"
    ? bbeParseTranslationInput(inputOrData)
    : { ...inputOrData };

  if (!partial) {
    throw new Error("Could not recognize that translation. Type a common name/code (e.g. GNV, JUB) or paste a Bible.com URL in that translation.");
  }

  let { id, abbr, slugAbbr, name, nameQuery, shortcut } = partial;
  if (typeof id === "string" && /^\d+$/.test(id.trim())) {
    id = parseInt(id.trim(), 10);
  }
  if (abbr) abbr = abbr.trim().toUpperCase();
  if (name) name = name.trim();
  if (shortcut) shortcut = shortcut.trim().toLowerCase();

  // Step 0: If user entered a translation name (e.g. "Jubilee Bible"), search known catalog
  if (!id && !abbr && nameQuery) {
    const byName = bbeFindVersionByQuery(nameQuery);
    if (byName) {
      id = byName.id;
      abbr = byName.short;
      name = byName.name;
    }
  }

  // Step 1: Check known dictionaries/aliases if abbr is known and id/name is missing
  if (abbr && (!id || !name)) {
    const canon = BBE_ALIASES[abbr] || abbr;
    const match = BBE_VERSIONS[canon] || (typeof BBE_POPULAR_VERSIONS !== "undefined" && (BBE_POPULAR_VERSIONS[abbr] || BBE_POPULAR_VERSIONS[canon]));
    if (match) {
      if (!id) id = match.id;
      if (!name) name = match.name;
      abbr = match.short || canon;
    } else if (!id && BBE_EXTRA_IDS[abbr]) {
      id = BBE_EXTRA_IDS[abbr];
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

  // Step 3: If still missing abbr or name, fetch live from Bible.com API, then fallback to /versions/{id} HTML
  if (id && (!abbr || !name)) {
    try {
      const res = await fetch("https://www.bible.com/api/bible/version/" + id);
      if (res.ok) {
        const data = await res.json();
        if (data) {
          if (!abbr) {
            abbr = (data.local_abbreviation || data.abbreviation || "").toUpperCase();
          }
          if (!name) {
            name = data.local_title || data.title || data.name || "";
          }
        }
      }
    } catch (e) {
      // Fall through to HTML fallback
    }

    if (!abbr || !name) {
      try {
        const htmlRes = await fetch("https://www.bible.com/versions/" + id);
        if (htmlRes.ok) {
          const htmlText = await htmlRes.text();
          const titleRaw =
            htmlText.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ||
            htmlText.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1] ||
            "";
          const cleanTitle = titleRaw.replace(/:\s*Online Bible.*$/i, "").trim();
          const titleMatch = cleanTitle.match(/^(.+?)\s*\(([A-Za-z0-9\-]{2,16})\)\s*$/);
          if (titleMatch) {
            if (!name) name = titleMatch[1].trim();
            if (!abbr) abbr = titleMatch[2].trim().toUpperCase();
          }
        }
      } catch (e) {
        // Offline or blocked - fall through to graceful fallbacks
      }
    }
  }

  // Step 4: Graceful fallbacks
  if (id && !abbr) {
    abbr = slugAbbr || ("V" + id);
  }
  if (!name && abbr) {
    name = abbr;
  }

  if (!id || isNaN(id) || id <= 0) {
    const qLabel = abbr || nameQuery || inputOrData;
    throw new Error(`"${qLabel}" isn't in the built-in quick list. Open any chapter in that translation on Bible.com and paste its URL here (e.g. bible.com/bible/149/ROM.9.RVR1960).`);
  }
  if (!abbr || !/^[A-Z0-9\-]{2,16}$/.test(abbr)) {
    throw new Error("Missing or invalid abbreviation code (2-16 letters/numbers).");
  }

  return {
    id: Number(id),
    short: abbr,
    name: name || abbr,
    shortcut: (shortcut && /^[a-z0-9]$/.test(shortcut) && !BBE_RESERVED_STUDY_KEYS[shortcut]) ? shortcut : ""
  };
}

  global.BBE_VERSIONS = BBE_VERSIONS;
  global.BBE_ENGLISH_VERSIONS = BBE_ENGLISH_VERSIONS;
  global.BBE_KEY_MAP = BBE_KEY_MAP;
  global.BBE_RESERVED_STUDY_KEYS = BBE_RESERVED_STUDY_KEYS;
  global.BBE_ALIASES = BBE_ALIASES;
  global.BBE_EXTRA_IDS = BBE_EXTRA_IDS;
  global.BBE_BOOKS = BBE_BOOKS;
  global.BBE_BOOK_NAMES = BBE_BOOK_NAMES;
  global.BBE_BOOK_CHAPTER_COUNTS = BBE_BOOK_CHAPTER_COUNTS;
  global.BBE_BH_BOOK_SLUGS = BBE_BH_BOOK_SLUGS;
  global.BBE_SLUG_TO_USFM = BBE_SLUG_TO_USFM;
  global.BBE_POPULAR_VERSIONS = BBE_POPULAR_VERSIONS;

  global.bbeGetAllVersions = bbeGetAllVersions;
  global.bbeGroupVersions = bbeGroupVersions;
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
      BBE_ENGLISH_VERSIONS,
      BBE_KEY_MAP,
      BBE_RESERVED_STUDY_KEYS,
      BBE_ALIASES,
      BBE_EXTRA_IDS,
      BBE_BOOKS,
      BBE_BOOK_NAMES,
      BBE_BOOK_CHAPTER_COUNTS,
      BBE_BH_BOOK_SLUGS,
      BBE_SLUG_TO_USFM,
      BBE_POPULAR_VERSIONS,
      bbeGetAllVersions,
      bbeGroupVersions,
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
