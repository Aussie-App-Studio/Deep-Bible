#!/usr/bin/env node
/**
 * Builds compact, static per-book Cross-Reference JSON files from:
 *   1. OpenBible.info Cross-References (CC BY 4.0) — ~344,000 TSK-based, relevance-ranked refs
 *   2. Berean Standard Bible (BSB, CC0 Public Domain) — clean modern verse preview text
 *
 * Output directory: dist/deep-bible-data/v1/crossref/{USFM}.json (66 per-book files)
 * Also updates dist/deep-bible-data/README.md, LICENSE, and v1/meta.json.
 *
 * Usage:
 *   node scripts/build-crossref-data.js
 *   node scripts/build-crossref-data.js --refresh
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "..");
const RAW_DIR = path.join(ROOT, "dist", "stepbible-raw");
const OUT_DIR = path.join(ROOT, "dist", "deep-bible-data");
const V1_DIR = path.join(OUT_DIR, "v1");
const XREF_DIR = path.join(V1_DIR, "crossref");

const REFRESH = process.argv.includes("--refresh");
const MAX_REFS_PER_VERSE = 15;

const OPENBIBLE_URL = "https://a.openbible.info/data/cross-references.zip";
const BSB_URL = "https://bereanbible.com/bsb.txt";

// OSIS / OpenBible book codes -> standard 3-char USFM codes
const OSIS_TO_USFM = {
  Gen: "GEN", Exod: "EXO", Lev: "LEV", Num: "NUM", Deut: "DEU",
  Josh: "JOS", Judg: "JDG", Ruth: "RUT", "1Sam": "1SA", "2Sam": "2SA",
  "1Kgs": "1KI", "2Kgs": "2KI", "1Chr": "1CH", "2Chr": "2CH",
  Ezra: "EZR", Neh: "NEH", Esth: "EST", Job: "JOB", Ps: "PSA", Prov: "PRO",
  Eccl: "ECC", Song: "SNG", Isa: "ISA", Jer: "JER", Lam: "LAM",
  Ezek: "EZK", Dan: "DAN", Hos: "HOS", Joel: "JOL", Amos: "AMO",
  Obad: "OBA", Jonah: "JON", Mic: "MIC", Nah: "NAM", Hab: "HAB",
  Zeph: "ZEP", Hag: "HAG", Zech: "ZEC", Mal: "MAL",
  Matt: "MAT", Mark: "MRK", Luke: "LUK", John: "JHN", Acts: "ACT",
  Rom: "ROM", "1Cor": "1CO", "2Cor": "2CO", Gal: "GAL", Eph: "EPH",
  Phil: "PHP", Col: "COL", "1Thess": "1TH", "2Thess": "2TH",
  "1Tim": "1TI", "2Tim": "2TI", Titus: "TIT", Phlm: "PHM", Heb: "HEB",
  Jas: "JAS", "1Pet": "1PE", "2Pet": "2PE", "1John": "1JN", "2John": "2JN",
  "3John": "3JN", Jude: "JUD", Rev: "REV"
};

// Full book names in bsb.txt -> standard 3-char USFM codes
const BSB_NAME_TO_USFM = {
  "Genesis": "GEN", "Exodus": "EXO", "Leviticus": "LEV", "Numbers": "NUM", "Deuteronomy": "DEU",
  "Joshua": "JOS", "Judges": "JDG", "Ruth": "RUT", "1 Samuel": "1SA", "2 Samuel": "2SA",
  "1 Kings": "1KI", "2 Kings": "2KI", "1 Chronicles": "1CH", "2 Chronicles": "2CH",
  "Ezra": "EZR", "Nehemiah": "NEH", "Esther": "EST", "Job": "JOB", "Psalm": "PSA", "Psalms": "PSA",
  "Proverbs": "PRO", "Ecclesiastes": "ECC", "Song of Solomon": "SNG", "Song of Songs": "SNG",
  "Isaiah": "ISA", "Jeremiah": "JER", "Lamentations": "LAM", "Ezekiel": "EZK", "Daniel": "DAN",
  "Hosea": "HOS", "Joel": "JOL", "Amos": "AMO", "Obadiah": "OBA", "Jonah": "JON",
  "Micah": "MIC", "Nahum": "NAM", "Habakkuk": "HAB", "Zephaniah": "ZEP", "Haggai": "HAG",
  "Zechariah": "ZEC", "Malachi": "MAL",
  "Matthew": "MAT", "Mark": "MRK", "Luke": "LUK", "John": "JHN", "Acts": "ACT",
  "Romans": "ROM", "1 Corinthians": "1CO", "2 Corinthians": "2CO", "Galatians": "GAL",
  "Ephesians": "EPH", "Philippians": "PHP", "Colossians": "COL",
  "1 Thessalonians": "1TH", "2 Thessalonians": "2TH", "1 Timothy": "1TI", "2 Timothy": "2TI",
  "Titus": "TIT", "Philemon": "PHM", "Hebrews": "HEB", "James": "JAS",
  "1 Peter": "1PE", "2 Peter": "2PE", "1 John": "1JN", "2 John": "2JN", "3 John": "3JN",
  "Jude": "JUD", "Revelation": "REV"
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function fetchBuffer(url, filename) {
  ensureDir(RAW_DIR);
  const dest = path.join(RAW_DIR, filename);
  if (!REFRESH && fs.existsSync(dest) && fs.statSync(dest).size > 10000) {
    console.log(`  [cache] ${filename}`);
    return fs.readFileSync(dest);
  }
  console.log(`  [fetch] ${filename} ...`);
  const res = await fetch(url, { headers: { "User-Agent": "deep-bible-builder/1.0" } });
  if (!res.ok) throw new Error(`Failed to fetch ${filename}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf;
}

// Pure-Node ZIP extractor for single-entry archives (uses Central Directory for exact sizes)
function extractFirstTxtFromZip(buf) {
  // Locate End of Central Directory (EOCD) signature 0x06054b50
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error("Invalid ZIP archive (EOCD not found)");

  const cdEntries = buf.readUInt16LE(eocdOffset + 10);
  let cdOffset = buf.readUInt32LE(eocdOffset + 16);

  for (let n = 0; n < cdEntries; n++) {
    if (buf.readUInt32LE(cdOffset) !== 0x02014b50) break;
    const method = buf.readUInt16LE(cdOffset + 10);
    const compSize = buf.readUInt32LE(cdOffset + 20);
    const nameLen = buf.readUInt16LE(cdOffset + 28);
    const extraLen = buf.readUInt16LE(cdOffset + 30);
    const commentLen = buf.readUInt16LE(cdOffset + 32);
    const localHeaderOffset = buf.readUInt32LE(cdOffset + 42);
    const name = buf.toString("utf8", cdOffset + 46, cdOffset + 46 + nameLen);

    cdOffset += 46 + nameLen + extraLen + commentLen;

    if (!name.toLowerCase().endsWith(".txt")) continue;

    const lhNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const lhExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + lhNameLen + lhExtraLen;
    const slice = buf.subarray(dataStart, dataStart + compSize);

    if (method === 0) return slice.toString("utf8");
    if (method === 8) return zlib.inflateRawSync(slice).toString("utf8");
    throw new Error(`Unsupported ZIP compression method ${method}`);
  }
  throw new Error("No .txt file found inside ZIP");
}

function parseBsbText(text) {
  const verses = new Map(); // "GEN.1.1" -> "In the beginning..."
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line || !line.includes("\t")) continue;
    const tabIdx = line.indexOf("\t");
    const refPart = line.slice(0, tabIdx).trim();
    const verseText = line.slice(tabIdx + 1).replace(/\s+/g, " ").trim();
    if (!refPart || !verseText) continue;

    const m = refPart.match(/^(.+?)\s+(\d+):(\d+)$/);
    if (!m) continue;
    const usfm = BSB_NAME_TO_USFM[m[1].trim()];
    if (!usfm) continue;
    verses.set(`${usfm}.${m[2]}.${m[3]}`, verseText);
  }
  return verses;
}

function parseOsisVerse(token) {
  // "Gen.1.1" -> { usfm: "GEN", ch: 1, v: 1 }
  const m = token.trim().match(/^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  const usfm = OSIS_TO_USFM[m[1]];
  if (!usfm) return null;
  return { usfm, ch: parseInt(m[2], 10), v: parseInt(m[3], 10) };
}

function parseOsisTarget(token) {
  // Single "Gen.1.1" or range "Col.1.16-Col.1.17"
  const parts = token.trim().split("-");
  const start = parseOsisVerse(parts[0]);
  if (!start) return null;
  let vEnd = 0;
  if (parts.length === 2) {
    const end = parseOsisVerse(parts[1]);
    if (end && end.usfm === start.usfm && end.ch === start.ch && end.v > start.v) {
      vEnd = end.v;
    }
  }
  return { usfm: start.usfm, ch: start.ch, vStart: start.v, vEnd };
}

function getPreviewText(bsbMap, usfm, ch, vStart, vEnd) {
  if (!vEnd || vEnd <= vStart) {
    return bsbMap.get(`${usfm}.${ch}.${vStart}`) || "";
  }
  // Combine up to 3 verses cleanly for range previews
  const maxV = Math.min(vEnd, vStart + 2);
  const parts = [];
  for (let v = vStart; v <= maxV; v++) {
    const t = bsbMap.get(`${usfm}.${ch}.${v}`);
    if (t) parts.push(t);
  }
  let joined = parts.join(" ");
  if (vEnd > maxV && joined) joined += " …";
  if (joined.length > 340) {
    joined = joined.slice(0, 337).replace(/\s+\S*$/, "") + "…";
  }
  return joined;
}

async function main() {
  console.log("=== Building Deep Bible Cross-References (OpenBible.info CC BY 4.0 + BSB CC0) ===\n");
  console.log("1. Fetching/loading OpenBible.info & BSB source files...");
  const [zipBuf, bsbBuf] = await Promise.all([
    fetchBuffer(OPENBIBLE_URL, "openbible_cross_references.zip"),
    fetchBuffer(BSB_URL, "bsb.txt")
  ]);

  console.log("\n2. Parsing BSB verse text...");
  const bsbMap = parseBsbText(bsbBuf.toString("utf8"));
  console.log(`  Parsed ${bsbMap.size.toLocaleString()} BSB verses.`);
  if (bsbMap.size < 30000) throw new Error(`Expected ~31,100 BSB verses, got ${bsbMap.size}`);

  console.log("\n3. Extracting & parsing OpenBible.info cross-references...");
  const xrefTxt = extractFirstTxtFromZip(zipBuf);
  const rawByBook = new Map(); // usfm -> Map("ch:v" -> Array<{usfm, ch, vStart, vEnd, votes}>)
  let totalLinks = 0;

  for (const line of xrefTxt.split(/\r?\n/)) {
    if (!line || line.startsWith("#") || line.startsWith("From Verse")) continue;
    const cols = line.split("\t");
    if (cols.length < 3) continue;

    const from = parseOsisVerse(cols[0]);
    const to = parseOsisTarget(cols[1]);
    const votes = parseInt(cols[2], 10);
    if (!from || !to || isNaN(votes)) continue;

    if (!rawByBook.has(from.usfm)) rawByBook.set(from.usfm, new Map());
    const bookVerses = rawByBook.get(from.usfm);
    const vk = `${from.ch}:${from.v}`;
    if (!bookVerses.has(vk)) bookVerses.set(vk, []);
    bookVerses.get(vk).push({
      usfm: to.usfm,
      ch: to.ch,
      vStart: to.vStart,
      vEnd: to.vEnd,
      votes
    });
    totalLinks++;
  }
  console.log(`  Parsed ${totalLinks.toLocaleString()} raw cross-reference pairs across ${rawByBook.size} books.`);

  console.log(`\n4. Ranking, trimming (top ${MAX_REFS_PER_VERSE}/verse), deduplicating preview text & writing JSON...`);
  fs.rmSync(XREF_DIR, { recursive: true, force: true });
  ensureDir(XREF_DIR);

  let totalRaw = 0;
  let totalGz = 0;
  let totalKeptLinks = 0;
  const sampleSizes = {};
  let maxBook = { code: "", gz: 0 };
  let minBook = { code: "", gz: Infinity };

  const sortedBooks = Array.from(rawByBook.keys()).sort();
  for (const bookCode of sortedBooks) {
    const verseMap = rawByBook.get(bookCode);
    const vOut = {};
    const tOut = {};

    for (const [vk, list] of verseMap.entries()) {
      // Sort by community relevance votes descending
      list.sort((a, b) => b.votes - a.votes);
      // Prefer positive-vote refs when available; always keep at least top 5 if present
      let filtered = list.filter(item => item.votes >= 1);
      if (filtered.length < 5) filtered = list.slice(0, 5);
      const top = filtered.slice(0, MAX_REFS_PER_VERSE);

      vOut[vk] = top.map(item => {
        const textKey = item.vEnd ? `${item.usfm}.${item.ch}.${item.vStart}-${item.vEnd}` : `${item.usfm}.${item.ch}.${item.vStart}`;
        if (!(textKey in tOut)) {
          tOut[textKey] = getPreviewText(bsbMap, item.usfm, item.ch, item.vStart, item.vEnd);
        }
        return [item.usfm, item.ch, item.vStart, item.vEnd || 0, item.votes];
      });
      totalKeptLinks += top.length;
    }

    const payload = JSON.stringify({ b: bookCode, v: vOut, t: tOut });
    fs.writeFileSync(path.join(XREF_DIR, `${bookCode}.json`), payload, "utf8");
    const rawBytes = Buffer.byteLength(payload, "utf8");
    const gzBytes = zlib.gzipSync(payload, { level: 9 }).length;
    totalRaw += rawBytes;
    totalGz += gzBytes;

    if (gzBytes > maxBook.gz) maxBook = { code: bookCode, gz: gzBytes };
    if (gzBytes < minBook.gz) minBook = { code: bookCode, gz: gzBytes };
    if (["GEN", "PSA", "JHN", "ROM", "EPH", "MAT"].includes(bookCode)) {
      sampleSizes[bookCode] = { rawBytes, gzBytes };
    }
  }

  // Update v1/meta.json if present
  const metaPath = path.join(V1_DIR, "meta.json");
  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    meta.crossrefSource = "OpenBible.info Cross-References (CC BY 4.0) + Berean Standard Bible (CC0 Public Domain)";
    meta.crossrefBooks = sortedBooks;
    meta.generatedAt = new Date().toISOString();
    fs.writeFileSync(metaPath, JSON.stringify(meta), "utf8");
  }

  // Update README.md & LICENSE in dist/deep-bible-data/
  fs.writeFileSync(path.join(OUT_DIR, "README.md"), `# Deep Bible Data (v1)

Static JSON interlinear, Strong's lexicon, and cross-reference files powering **Deep Bible**.

## Attribution & Licenses
* **Greek & Hebrew Interlinear and Lexicons:** Compiled from **STEPBible-Data** (TAGNT, TAHOT, TBESG, TBESH), created by [STEPBible.org](https://www.STEPBible.org) based on work at **Tyndale House, Cambridge** — licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
* **Cross-References:** Compiled from [OpenBible.info Cross-References](https://www.openbible.info/labs/cross-references/) (derived from Treasury of Scripture Knowledge with relevance ranking) — licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
* **Cross-Reference Verse Previews:** **Berean Standard Bible (BSB)** — dedicated to the [Public Domain (CC0)](https://berean.bible/terms.htm).
`, "utf8");

  fs.writeFileSync(path.join(OUT_DIR, "LICENSE"), `Attribution & Licensing Summary

1. Interlinear & Strong's Lexicon Data (v1/interlinear/, v1/lexicon/)
   Derived from STEPBible-Data (https://github.com/STEPBible/STEPBible-Data)
   Created by STEPBible.org and Tyndale House, Cambridge.
   License: Creative Commons Attribution 4.0 International (CC BY 4.0)
   https://creativecommons.org/licenses/by/4.0/legalcode

2. Cross-Reference Data (v1/crossref/)
   Derived from OpenBible.info Cross-References (https://www.openbible.info/labs/cross-references/)
   License: Creative Commons Attribution 4.0 International (CC BY 4.0)
   https://creativecommons.org/licenses/by/4.0/legalcode

3. Verse Preview Text in v1/crossref/
   Berean Standard Bible (BSB) — Public Domain (CC0 / Unlicense)
   https://berean.bible/terms.htm
`, "utf8");

  const kb = (b) => `${(b / 1024).toFixed(1)} KB`;
  const mb = (b) => `${(b / (1024 * 1024)).toFixed(2)} MB`;

  console.log("\n=== Cross-Reference Build Complete ===");
  console.log(`Books:         ${sortedBooks.length} / 66`);
  console.log(`Links kept:    ${totalKeptLinks.toLocaleString()} (max ${MAX_REFS_PER_VERSE}/verse, ranked by relevance)`);
  console.log(`Total size:    ${mb(totalRaw)} raw | ${mb(totalGz)} gzipped`);
  console.log(`Smallest book: ${minBook.code} (${kb(minBook.gz)} gz)`);
  console.log(`Largest book:  ${maxBook.code} (${kb(maxBook.gz)} gz)`);
  console.log("Sample books (gzipped download size):");
  for (const [c, st] of Object.entries(sampleSizes)) {
    console.log(`  ${c}.json: ${kb(st.gzBytes)} gz (${kb(st.rawBytes)} raw)`);
  }

  // Sanity check John 1:1 & Romans 8:28
  const jhn = JSON.parse(fs.readFileSync(path.join(XREF_DIR, "JHN.json"), "utf8"));
  const jhn11 = jhn.v["1:1"] || [];
  console.log("\nSanity check — John 1:1 top 5 cross-references:");
  for (const row of jhn11.slice(0, 5)) {
    const tk = row[3] ? `${row[0]}.${row[1]}.${row[2]}-${row[3]}` : `${row[0]}.${row[1]}.${row[2]}`;
    console.log(`  ${tk} (votes: ${row[4]}): ${(jhn.t[tk] || "").slice(0, 80)}`);
  }
  if (sortedBooks.length !== 66) throw new Error(`Expected 66 books, got ${sortedBooks.length}`);
}

main().catch(err => {
  console.error("Build failed:", err);
  process.exit(1);
});
