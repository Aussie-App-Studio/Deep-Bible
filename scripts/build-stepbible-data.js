#!/usr/bin/env node
/**
 * Builds compact, static JSON files from official STEPBible-Data (CC BY 4.0)
 * for hosting on GitHub Pages (e.g. https://aussie-app-studio.github.io/deep-bible-data/v1/).
 *
 * Output directory: dist/deep-bible-data/
 *   README.md
 *   LICENSE
 *   .nojekyll
 *   v1/meta.json
 *   v1/interlinear/{USFM}.json   (66 per-book files)
 *   v1/lexicon/G0.json .. G5.json
 *   v1/lexicon/H0.json .. H9.json
 *
 * Usage:
 *   node scripts/build-stepbible-data.js            # uses cached raw files in dist/stepbible-raw/
 *   node scripts/build-stepbible-data.js --refresh  # re-downloads raw files from STEPBible GitHub
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "..");
const RAW_DIR = path.join(ROOT, "dist", "stepbible-raw");
const OUT_DIR = path.join(ROOT, "dist", "deep-bible-data");
const V1_DIR = path.join(OUT_DIR, "v1");
const INT_DIR = path.join(V1_DIR, "interlinear");
const LEX_DIR = path.join(V1_DIR, "lexicon");

const REFRESH = process.argv.includes("--refresh");

const STEP_BASE = "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/";

const SOURCES = {
  tagnt1: {
    file: "TAGNT_Mat-Jhn.txt",
    url: STEP_BASE + "Translators%20Amalgamated%20OT%2BNT/TAGNT%20Mat-Jhn%20-%20Translators%20Amalgamated%20Greek%20NT%20-%20STEPBible.org%20CC-BY.txt"
  },
  tagnt2: {
    file: "TAGNT_Act-Rev.txt",
    url: STEP_BASE + "Translators%20Amalgamated%20OT%2BNT/TAGNT%20Act-Rev%20-%20Translators%20Amalgamated%20Greek%20NT%20-%20STEPBible.org%20CC-BY.txt"
  },
  tahot1: {
    file: "TAHOT_Gen-Deu.txt",
    url: STEP_BASE + "Translators%20Amalgamated%20OT%2BNT/TAHOT%20Gen-Deu%20-%20Translators%20Amalgamated%20Hebrew%20OT%20-%20STEPBible.org%20CC%20BY.txt"
  },
  tahot2: {
    file: "TAHOT_Jos-Est.txt",
    url: STEP_BASE + "Translators%20Amalgamated%20OT%2BNT/TAHOT%20Jos-Est%20-%20Translators%20Amalgamated%20Hebrew%20OT%20-%20STEPBible.org%20CC%20BY.txt"
  },
  tahot3: {
    file: "TAHOT_Job-Sng.txt",
    url: STEP_BASE + "Translators%20Amalgamated%20OT%2BNT/TAHOT%20Job-Sng%20-%20Translators%20Amalgamated%20Hebrew%20OT%20-%20STEPBible.org%20CC%20BY.txt"
  },
  tahot4: {
    file: "TAHOT_Isa-Mal.txt",
    url: STEP_BASE + "Translators%20Amalgamated%20OT%2BNT/TAHOT%20Isa-Mal%20-%20Translators%20Amalgamated%20Hebrew%20OT%20-%20STEPBible.org%20CC%20BY.txt"
  },
  tbesg: {
    file: "TBESG.txt",
    url: STEP_BASE + "Lexicons/TBESG%20-%20Translators%20Brief%20lexicon%20of%20Extended%20Strongs%20for%20Greek%20-%20STEPBible.org%20CC%20BY.txt"
  },
  tbesh: {
    file: "TBESH.txt",
    url: STEP_BASE + "Lexicons/TBESH%20-%20Translators%20Brief%20lexicon%20of%20Extended%20Strongs%20for%20Hebrew%20-%20STEPBible.org%20CC%20BY.txt"
  }
};

// Map STEPBible book abbreviations -> standard 3-char USFM codes (matching Bible.com)
const BOOK_TO_USFM = {
  Gen: "GEN", Exo: "EXO", Lev: "LEV", Num: "NUM", Deu: "DEU",
  Jos: "JOS", Jdg: "JDG", Rut: "RUT", "1Sa": "1SA", "2Sa": "2SA",
  "1Ki": "1KI", "2Ki": "2KI", "1Ch": "1CH", "2Ch": "2CH",
  Ezr: "EZR", Neh: "NEH", Est: "EST", Job: "JOB", Psa: "PSA", Pro: "PRO",
  Ecc: "ECC", Sng: "SNG", Sol: "SNG", Isa: "ISA", Jer: "JER",
  Lam: "LAM", Ezk: "EZK", Eze: "EZK", Dan: "DAN", Hos: "HOS",
  Jol: "JOL", Joe: "JOL", Amo: "AMO", Oba: "OBA", Jon: "JON",
  Mic: "MIC", Nam: "NAM", Nah: "NAM", Hab: "HAB", Zep: "ZEP",
  Hag: "HAG", Zec: "ZEC", Mal: "MAL",
  Mat: "MAT", Mrk: "MRK", Luk: "LUK", Jhn: "JHN", Act: "ACT",
  Rom: "ROM", "1Co": "1CO", "2Co": "2CO", Gal: "GAL", Eph: "EPH",
  Php: "PHP", Phi: "PHP", Col: "COL", "1Th": "1TH", "2Th": "2TH",
  "1Ti": "1TI", "2Ti": "2TI", Tit: "TIT", Phm: "PHM", Heb: "HEB",
  Jas: "JAS", "1Pe": "1PE", "2Pe": "2PE", "1Jn": "1JN", "2Jn": "2JN",
  "3Jn": "3JN", Jud: "JUD", Rev: "REV"
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function fetchRawFile(entry) {
  ensureDir(RAW_DIR);
  const dest = path.join(RAW_DIR, entry.file);
  if (!REFRESH && fs.existsSync(dest) && fs.statSync(dest).size > 10000) {
    console.log(`  [cache] ${entry.file}`);
    return fs.readFileSync(dest, "utf8");
  }
  console.log(`  [fetch] ${entry.file} ...`);
  const res = await fetch(entry.url, { headers: { "User-Agent": "deep-bible-builder/1.0" } });
  if (!res.ok) throw new Error(`Failed to fetch ${entry.file}: HTTP ${res.status}`);
  const text = await res.text();
  fs.writeFileSync(dest, text, "utf8");
  return text;
}

function stripLeadingZeros(code) {
  // "G0025" -> "25", "H0430G" -> "430G", "G0976_A" -> "976"
  const m = String(code || "").trim().match(/^[GH]?0*(\d+)([A-Z]?)/i);
  if (!m) return { base: "", ext: "" };
  const base = m[1];
  const suffix = (m[2] || "").toUpperCase();
  return { base, ext: base + suffix };
}

function cleanDefinitionHtml(raw) {
  if (!raw) return "";
  let s = String(raw)
    .replace(/<br\s*\/?>/gi, " • ")
    .replace(/<[^>]+>/g, "")
    .replace(/__/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, " ")
    .replace(/(?:\s*•\s*){2,}/g, " • ")
    .replace(/^\s*•\s*|\s*•\s*$/g, "")
    .trim();
  if (s.length > 680) {
    s = s.slice(0, 677).replace(/\s+\S*$/, "") + "…";
  }
  return s;
}

function parseTagnt(text, booksMap, occCounts) {
  const lines = text.split(/\r?\n/);
  let wordCount = 0;

  for (const line of lines) {
    if (!line || line[0] === "#" || line[0] === "=" || line[0] === "\t") continue;
    const cols = line.split("\t");
    if (cols.length < 5) continue;

    // Col 0: e.g. "Mat.1.1#01=NKO" or "Mat.6.13#13=K"
    const refMatch = cols[0].match(/^([1-3]?[A-Za-z]{2,3})\.(\d+)\.(\d+)#\d+=(.+)$/);
    if (!refMatch) continue;

    const [, rawBook, ch, v, edTag] = refMatch;
    // Include words in NA28/SBL (N) or KJV/TR (K); skip purely apparatus-only notes without N or K
    if (!/[NK]/i.test(edTag)) continue;

    const usfm = BOOK_TO_USFM[rawBook];
    if (!usfm) continue;

    // Col 1: "Βίβλος (Biblos)"
    const col1 = (cols[1] || "").trim();
    const parenMatch = col1.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    const original = parenMatch ? parenMatch[1].trim() : col1;
    const translit = parenMatch ? parenMatch[2].trim() : "";

    // Col 2: English gloss e.g. "[The] book" or "<the>"
    const gloss = (cols[2] || "")
      .replace(/<([^>]+)>/g, "[$1]")
      .replace(/[,;:.!?]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();

    // Col 3: "G0976=N-NSF" or "G2424G=N-GSM-P"
    const col3 = (cols[3] || "").trim();
    const [rawStrongs, rawPos] = col3.split("=");
    const { base, ext } = stripLeadingZeros(rawStrongs || "");
    const posCode = (rawPos || "").trim();

    // Col 4: "βίβλος=book" -> shortDef
    const col4 = (cols[4] || "").trim();
    const eqIdx = col4.indexOf("=");
    const shortDef = eqIdx > -1 ? col4.slice(eqIdx + 1).trim() : "";

    if (!original && !base) continue;

    if (!booksMap.has(usfm)) {
      booksMap.set(usfm, { b: usfm, l: "g", v: {} });
    }
    const bookObj = booksMap.get(usfm);
    const vk = `${ch}:${v}`;
    if (!bookObj.v[vk]) bookObj.v[vk] = [];

    // Compact tuple: [extNum, original, translit, gloss, posCode, shortDef]
    bookObj.v[vk].push([ext || base, original, translit, gloss, posCode, shortDef]);
    wordCount++;

    if (base) {
      const kBase = "G" + base;
      occCounts.set(kBase, (occCounts.get(kBase) || 0) + 1);
      if (ext && ext !== base) {
        const kExt = "G" + ext;
        occCounts.set(kExt, (occCounts.get(kExt) || 0) + 1);
      }
    }
  }
  return wordCount;
}

function parseTahot(text, booksMap, occCounts) {
  const lines = text.split(/\r?\n/);
  let wordCount = 0;

  for (const line of lines) {
    if (!line || line[0] === "#" || line[0] === "=" || line[0] === "\t") continue;
    const cols = line.split("\t");
    if (cols.length < 6) continue;

    // Col 0: e.g. "Gen.1.1#01=L" (L=main Leningrad text; Q=Qere variant; K=Ketiv)
    // Keep L and Q (skip pure K if Q exists, or keep L and K? Standard Bibles translate Qere; keep L and Q!)
    const refMatch = cols[0].match(/^([1-3]?[A-Za-z]{2,3})\.(\d+)\.(\d+)#\d+=(.+)$/);
    if (!refMatch) continue;

    const [, rawBook, ch, v, edTag] = refMatch;
    // Keep Leningrad main text (L) and Qere (Q); skip Ketiv-only duplicates (K) so verses aren't doubled
    if (!/^[LQ]/i.test(edTag)) continue;

    const usfm = BOOK_TO_USFM[rawBook];
    if (!usfm) continue;

    // Col 1: "בְּ/רֵאשִׁ֖ית" -> remove morpheme slashes & sof-pasuq backslash escapes
    const original = (cols[1] || "").replace(/[\/\\]/g, "").trim();
    // Col 2: "be./re.Shit" -> readable transliteration
    const translit = (cols[2] || "").replace(/[\/\\.]/g, "").trim();

    // Col 3: "in/ beginning" -> clean gloss
    let gloss = (cols[3] || "")
      .replace(/\//g, " ")
      .replace(/<obj\.>/gi, "")
      .replace(/\[Obj\.\]/gi, "")
      .replace(/[,;:.!?]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!gloss) gloss = "—";

    // Col 4: "H9003/{H7225G}" -> prefer root inside {H...}
    const col4 = (cols[4] || "").trim();
    let chosenStrongs = "";
    const braceMatch = col4.match(/\{(H\d+[A-Z]?)\}/i);
    if (braceMatch) {
      chosenStrongs = braceMatch[1];
    } else {
      const allH = col4.match(/H\d+[A-Z]?/gi) || [];
      // Pick first non-prefix (<9000) Strong's number if available
      chosenStrongs = allH.find(h => {
        const n = parseInt(h.slice(1), 10);
        return !isNaN(n) && n < 9000;
      }) || allH[0] || "";
    }
    const { base, ext } = stripLeadingZeros(chosenStrongs);

    // Col 5: Morphology e.g. "HR/Ncfsa" -> use main stem morphology (last slash part)
    const rawPos = (cols[5] || "").trim();
    const posCode = rawPos;

    // Col 11: Expanded root gloss e.g. "H9003=ב=in/{H7225G=רֵאשִׁית=: beginning»first:1_beginning}"
    let shortDef = "";
    const col11 = (cols[11] || "").trim();
    const rootBlock = col11.match(/\{[^}]*=([^=}]+)\}/);
    if (rootBlock) {
      shortDef = rootBlock[1]
        .replace(/^[:\s]+/, "")
        .replace(/».*$/, "")
        .replace(/@.*$/, "")
        .replace(/\[Obj\.\]/gi, "")
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    if (!original && !base) continue;

    if (!booksMap.has(usfm)) {
      booksMap.set(usfm, { b: usfm, l: "h", v: {} });
    }
    const bookObj = booksMap.get(usfm);
    const vk = `${ch}:${v}`;
    if (!bookObj.v[vk]) bookObj.v[vk] = [];

    bookObj.v[vk].push([ext || base, original, translit, gloss, posCode, shortDef]);
    wordCount++;

    if (base) {
      const kBase = "H" + base;
      occCounts.set(kBase, (occCounts.get(kBase) || 0) + 1);
      if (ext && ext !== base) {
        const kExt = "H" + ext;
        occCounts.set(kExt, (occCounts.get(kExt) || 0) + 1);
      }
    }
  }
  return wordCount;
}

function parseLexicon(text, prefix, occCounts) {
  const chunks = new Map(); // e.g. "G0" -> { "25": {...}, "25A": {...} }
  const lines = text.split(/\r?\n/);
  let entryCount = 0;

  for (const line of lines) {
    if (!line || !line.startsWith(prefix)) continue;
    const cols = line.split("\t");
    if (cols.length < 7) continue;

    const rawCol0 = (cols[0] || "").trim();
    if (!/^[GH]\d+[A-Z]?$/i.test(rawCol0)) continue;

    // Extended code is often in col 0 or col 1 ("G0001G =")
    const col1CodeMatch = (cols[1] || "").trim().match(/^([GH]\d+[A-Z]?)/i);
    const extRaw = col1CodeMatch ? col1CodeMatch[1] : rawCol0;
    const { base: baseNum, ext: extNum } = stripLeadingZeros(extRaw);
    if (!baseNum) continue;

    const numInt = parseInt(baseNum, 10);
    if (isNaN(numInt)) continue;
    const chunkId = `${prefix}${Math.floor(numInt / 1000)}`;

    const original = (cols[3] || "").trim();
    const translit = (cols[4] || "").replace(/\./g, "").trim();
    const pos = (cols[5] || "").trim();
    const gloss = (cols[6] || "").trim();
    const def = cleanDefinitionHtml(cols[7] || "");

    const occ = occCounts.get(prefix + extNum) || occCounts.get(prefix + baseNum) || 0;
    const entry = {
      o: original,
      t: translit,
      p: pos,
      g: gloss,
      d: def || gloss
    };
    if (occ > 0) entry.c = occ;

    if (!chunks.has(chunkId)) chunks.set(chunkId, {});
    const map = chunks.get(chunkId);

    // Store under exact extended key (e.g. "1254A")
    if (extNum && extNum !== baseNum) {
      map[extNum] = entry;
      // Also set base key if not yet set (so plain H1254 always resolves!)
      if (!map[baseNum]) {
        map[baseNum] = entry;
      }
    } else {
      map[baseNum] = entry;
    }
    entryCount++;
  }

  return { chunks, entryCount };
}

function writeJsonWithStats(filePath, obj) {
  const raw = JSON.stringify(obj);
  fs.writeFileSync(filePath, raw, "utf8");
  const rawBytes = Buffer.byteLength(raw, "utf8");
  const gzBytes = zlib.gzipSync(raw, { level: 9 }).length;
  return { rawBytes, gzBytes };
}

async function main() {
  console.log("=== Building Deep Bible STEPBible Data (CC BY 4.0) ===\n");
  console.log("1. Fetching/loading official STEPBible-Data files...");
  const [tagnt1, tagnt2, tahot1, tahot2, tahot3, tahot4, tbesg, tbesh] = await Promise.all([
    fetchRawFile(SOURCES.tagnt1),
    fetchRawFile(SOURCES.tagnt2),
    fetchRawFile(SOURCES.tahot1),
    fetchRawFile(SOURCES.tahot2),
    fetchRawFile(SOURCES.tahot3),
    fetchRawFile(SOURCES.tahot4),
    fetchRawFile(SOURCES.tbesg),
    fetchRawFile(SOURCES.tbesh)
  ]);

  console.log("\n2. Parsing interlinear words...");
  const booksMap = new Map();
  const occCounts = new Map();

  const ntWords = parseTagnt(tagnt1, booksMap, occCounts) + parseTagnt(tagnt2, booksMap, occCounts);
  const otWords =
    parseTahot(tahot1, booksMap, occCounts) +
    parseTahot(tahot2, booksMap, occCounts) +
    parseTahot(tahot3, booksMap, occCounts) +
    parseTahot(tahot4, booksMap, occCounts);

  console.log(`  Parsed ${booksMap.size} books (${otWords.toLocaleString()} Hebrew OT words, ${ntWords.toLocaleString()} Greek NT words).`);

  console.log("\n3. Parsing lexicons (TBESG + TBESH)...");
  const greekLex = parseLexicon(tbesg, "G", occCounts);
  const hebrewLex = parseLexicon(tbesh, "H", occCounts);
  console.log(`  Parsed ${greekLex.entryCount.toLocaleString()} Greek entries (${greekLex.chunks.size} chunks) and ${hebrewLex.entryCount.toLocaleString()} Hebrew entries (${hebrewLex.chunks.size} chunks).`);

  // Clean & create output dirs
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  ensureDir(INT_DIR);
  ensureDir(LEX_DIR);

  console.log("\n4. Writing compact JSON files...");
  let totalIntRaw = 0;
  let totalIntGz = 0;
  let maxBook = { code: "", gz: 0, raw: 0 };
  let minBook = { code: "", gz: Infinity, raw: 0 };
  const sampleSizes = {};

  const sortedBooks = Array.from(booksMap.keys()).sort();
  for (const code of sortedBooks) {
    const stats = writeJsonWithStats(path.join(INT_DIR, `${code}.json`), booksMap.get(code));
    totalIntRaw += stats.rawBytes;
    totalIntGz += stats.gzBytes;
    if (stats.gzBytes > maxBook.gz) maxBook = { code, gz: stats.gzBytes, raw: stats.rawBytes };
    if (stats.gzBytes < minBook.gz) minBook = { code, gz: stats.gzBytes, raw: stats.rawBytes };
    if (["GEN", "PSA", "JHN", "ROM", "EPH", "MAT"].includes(code)) {
      sampleSizes[code] = stats;
    }
  }

  let totalLexRaw = 0;
  let totalLexGz = 0;
  const lexChunkNames = [];
  for (const map of [greekLex.chunks, hebrewLex.chunks]) {
    for (const [chunkId, data] of Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      const stats = writeJsonWithStats(path.join(LEX_DIR, `${chunkId}.json`), data);
      totalLexRaw += stats.rawBytes;
      totalLexGz += stats.gzBytes;
      lexChunkNames.push(chunkId);
    }
  }

  // Write meta.json
  const meta = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: "STEPBible.org (Tyndale House, Cambridge)",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    books: sortedBooks,
    lexiconChunks: lexChunkNames
  };
  writeJsonWithStats(path.join(V1_DIR, "meta.json"), meta);

  // GitHub Pages static files
  fs.writeFileSync(path.join(OUT_DIR, ".nojekyll"), "", "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "README.md"), `# Deep Bible Data (v1)

Static JSON interlinear and Strong's lexicon files powering **Deep Bible** Word Study mode.

## Attribution & License
Data compiled from **STEPBible-Data** (TAGNT, TAHOT, TBESG, TBESH), created by [STEPBible.org](https://www.STEPBible.org) based on work at **Tyndale House, Cambridge**.

Licensed under **Creative Commons Attribution 4.0 International (CC BY 4.0)**:
https://creativecommons.org/licenses/by/4.0/
`, "utf8");

  fs.writeFileSync(path.join(OUT_DIR, "LICENSE"), `Creative Commons Attribution 4.0 International (CC BY 4.0)

This dataset is derived from STEPBible-Data (https://github.com/STEPBible/STEPBible-Data)
created by STEPBible.org and Tyndale House, Cambridge.

Full license text: https://creativecommons.org/licenses/by/4.0/legalcode
`, "utf8");

  const kb = (b) => `${(b / 1024).toFixed(1)} KB`;
  const mb = (b) => `${(b / (1024 * 1024)).toFixed(2)} MB`;

  console.log("\n=== Build Complete ===");
  console.log(`Output folder: ${OUT_DIR}`);
  console.log(`Books:         ${sortedBooks.length} / 66`);
  console.log(`Interlinear:   ${mb(totalIntRaw)} raw | ${mb(totalIntGz)} gzipped`);
  console.log(`Lexicons:      ${mb(totalLexRaw)} raw | ${mb(totalLexGz)} gzipped (${lexChunkNames.length} chunks)`);
  console.log(`Total repo:    ${mb(totalIntRaw + totalLexRaw)} raw | ${mb(totalIntGz + totalLexGz)} gzipped`);
  console.log(`Smallest book: ${minBook.code} (${kb(minBook.gz)} gz)`);
  console.log(`Largest book:  ${maxBook.code} (${kb(maxBook.gz)} gz)`);
  console.log("Sample books (gzipped download size):");
  for (const [c, st] of Object.entries(sampleSizes)) {
    console.log(`  ${c}.json: ${kb(st.gzBytes)} gz (${kb(st.rawBytes)} raw)`);
  }

  // Sanity-check key verses
  const jhn1 = booksMap.get("JHN")?.v["1:1"] || [];
  const mat613 = booksMap.get("MAT")?.v["6:13"] || [];
  const gen11 = booksMap.get("GEN")?.v["1:1"] || [];
  console.log("\nSanity checks:");
  console.log(`  Gen 1:1 words: ${gen11.length} -> ${gen11.slice(0, 3).map(w => `${w[0]}:${w[3]}`).join(", ")}`);
  console.log(`  Jhn 1:1 words: ${jhn1.length} -> ${jhn1.slice(0, 5).map(w => `${w[0]}:${w[3]}`).join(", ")}`);
  console.log(`  Mat 6:13 words: ${mat613.length} (includes KJV doxology: ${mat613.some(w => /kingdom/i.test(w[3]))})`);
  if (sortedBooks.length !== 66) {
    throw new Error(`Expected 66 books, got ${sortedBooks.length}`);
  }
}

main().catch(err => {
  console.error("Build failed:", err);
  process.exit(1);
});
