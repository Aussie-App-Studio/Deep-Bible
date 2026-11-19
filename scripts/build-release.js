const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const RELEASE_DIR = path.join(ROOT, 'dist', 'release');

const JS_FILES = [
  'background.js',
  'bridge_main.js',
  'content.js',
  'historical.js',
  'popup.js',
  'redirect.js',
  'sermon_mode.js',
  'settings.js',
  'versions.js',
  'welcome/welcome.js',
];

const CSS_FILES = [
  'content.css',
  'welcome/welcome.css',
];

const STATIC_FILES = [
  'manifest.json',
  'popup.html',
  'privacy.html',
  'LICENSE',
  'icon16.png',
  'icon32.png',
  'icon48.png',
  'icon128.png',
  'welcome/welcome.html',
];

function collectStaticFiles() {
  const fontsDir = path.join(ROOT, 'fonts');
  const fontFiles = fs.readdirSync(fontsDir)
    .filter(f => f.toLowerCase().endsWith('.woff'))
    .sort()
    .map(f => `fonts/${f}`);
  return [...STATIC_FILES, ...fontFiles];
}

function ensureDirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function fmtKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function build() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const version = manifest.version || '1.0.0';
  const zipPath = path.join(ROOT, 'dist', `deep-bible-v${version}.zip`);

  // Clean dist/release
  fs.rmSync(RELEASE_DIR, { recursive: true, force: true });
  fs.mkdirSync(RELEASE_DIR, { recursive: true });

  const report = [];
  let totalSrc = 0;
  let totalOut = 0;

  // 1. Minify JS files
  for (const rel of JS_FILES) {
    const srcPath = path.join(ROOT, rel);
    const outPath = path.join(RELEASE_DIR, rel);
    const srcCode = fs.readFileSync(srcPath, 'utf8');
    const result = await esbuild.transform(srcCode, {
      loader: 'js',
      minify: true,
      charset: 'utf8',
      target: 'chrome110',
    });
    ensureDirFor(outPath);
    fs.writeFileSync(outPath, result.code, 'utf8');

    const srcBytes = Buffer.byteLength(srcCode, 'utf8');
    const outBytes = Buffer.byteLength(result.code, 'utf8');
    totalSrc += srcBytes;
    totalOut += outBytes;
    report.push({ file: rel, srcBytes, outBytes, type: 'JS' });
  }

  // 2. Minify CSS files
  for (const rel of CSS_FILES) {
    const srcPath = path.join(ROOT, rel);
    const outPath = path.join(RELEASE_DIR, rel);
    const srcCode = fs.readFileSync(srcPath, 'utf8');
    const result = await esbuild.transform(srcCode, {
      loader: 'css',
      minify: true,
      charset: 'utf8',
      target: 'chrome110',
    });
    ensureDirFor(outPath);
    fs.writeFileSync(outPath, result.code, 'utf8');

    const srcBytes = Buffer.byteLength(srcCode, 'utf8');
    const outBytes = Buffer.byteLength(result.code, 'utf8');
    totalSrc += srcBytes;
    totalOut += outBytes;
    report.push({ file: rel, srcBytes, outBytes, type: 'CSS' });
  }

  // 3. Copy static release assets verbatim
  const staticList = collectStaticFiles();
  for (const rel of staticList) {
    const srcPath = path.join(ROOT, rel);
    const outPath = path.join(RELEASE_DIR, rel);
    ensureDirFor(outPath);
    fs.copyFileSync(srcPath, outPath);
    const bytes = fs.statSync(outPath).size;
    totalSrc += bytes;
    totalOut += bytes;
    report.push({ file: rel, srcBytes: bytes, outBytes: bytes, type: 'ASSET' });
  }

  // 4. Syntax check every minified JS file
  for (const rel of JS_FILES) {
    execFileSync(process.execPath, ['--check', path.join(RELEASE_DIR, rel)], { stdio: 'inherit' });
  }

  // 5. Package dist/deep-bible-v<version>.zip using PowerShell System.IO.Compression.ZipFile (forward-slash entries)
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath, { force: true });
  const psScript = `
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $relDir = [System.IO.Path]::GetFullPath(${JSON.stringify(RELEASE_DIR)})
    $zipFile = [System.IO.Path]::GetFullPath(${JSON.stringify(zipPath)})
    $zip = [System.IO.Compression.ZipFile]::Open($zipFile, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
      Get-ChildItem -Path $relDir -Recurse -File | Sort-Object FullName | ForEach-Object {
        $entryName = $_.FullName.Substring($relDir.Length).TrimStart('\\', '/').Replace('\\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
      }
    } finally {
      $zip.Dispose()
    }
  `;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], { stdio: 'inherit' });

  const zipBytes = fs.statSync(zipPath).size;

  // 6. Print report
  console.log('\n=== Deep Bible Release Build Report ===');
  console.log(`${'File'.padEnd(34)} ${'Source'.padStart(10)} ${'Release'.padStart(10)} ${'Saved'.padStart(8)}`);
  console.log('-'.repeat(66));
  for (const row of report) {
    const pct = row.srcBytes > 0 ? (((row.srcBytes - row.outBytes) / row.srcBytes) * 100).toFixed(1) : '0.0';
    console.log(
      `${row.file.padEnd(34)} ${fmtKb(row.srcBytes).padStart(10)} ${fmtKb(row.outBytes).padStart(10)} ${(pct + '%').padStart(8)}`
    );
  }
  console.log('-'.repeat(66));
  const totalPct = (((totalSrc - totalOut) / totalSrc) * 100).toFixed(1);
  console.log(
    `${'TOTAL (' + report.length + ' files)'.padEnd(34)} ${fmtKb(totalSrc).padStart(10)} ${fmtKb(totalOut).padStart(10)} ${(totalPct + '%').padStart(8)}`
  );
  console.log(`Release folder: ${RELEASE_DIR}`);
  console.log(`Zip archive:    ${zipPath} (${fmtKb(zipBytes)})`);
}

build().catch((err) => {
  console.error('Release build failed:', err);
  process.exit(1);
});
