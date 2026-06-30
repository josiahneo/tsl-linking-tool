// Build a compact, pre-tokenised link index from monthly CSV exports.
//
//   data/index/*.csv   article-index exports (title, url, keyword, category, content)
//   data/ga4/*.csv      GA4 "Pages and screens" exports, one per month
//
// Run:  npm run build-data   ->   public/linkdata.json
//
// Merge rules:
//   - index files dedupe by normalised URL; later files (newer months) win,
//     so refreshed articles overwrite the older row.
//   - GA4 sessions are SUMMED per URL across every file (cumulative traffic).
//
// Files are STREAMED row-by-row and each article is tokenised on the fly, so the
// raw post content is never accumulated — memory stays flat even on a 200 MB CSV.
// Output ships display fields + token lists only (not raw content), so the JSON
// stays lean. The app rebuilds the inverted index at load.

import { readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  streamCSV, normaliseUrl, uniqueTokens,
  getTitle, getUrl, getKeyword, getCategory, getContent,
  getPath, getSessions, labelFromName,
} from "./shared.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INDEX_DIR = join(ROOT, "data", "index");
const GA4_DIR = join(ROOT, "data", "ga4");
const OUT = join(ROOT, "public", "linkdata.json");

const CONTENT_TOKEN_CAP = 250; // unique content tokens kept per article

const csvFiles = (dir) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".csv")).sort() : [];

// ---- 1. Merge article index files (tokenise inline, drop raw content) -------
const articles = new Map(); // normUrl -> { t, u, k, c, tt, ct }
const indexMonths = [];
for (const f of csvFiles(INDEX_DIR)) {
  const label = labelFromName(f) || f;
  indexMonths.push(label);
  let added = 0;
  await streamCSV(join(INDEX_DIR, f), (r) => {
    const url = getUrl(r), title = getTitle(r);
    if (!url || !title) return;
    const tt = uniqueTokens(`${title} ${getKeyword(r)} ${getCategory(r)}`);
    const ttSet = new Set(tt);
    const ct = uniqueTokens(getContent(r), CONTENT_TOKEN_CAP).filter((t) => !ttSet.has(t));
    articles.set(normaliseUrl(url), { t: title, u: url, k: getKeyword(r), c: getCategory(r), tt, ct });
    added++;
  });
  console.log(`  index  ${f.padEnd(34)} ${added.toLocaleString()} rows  (${label})`);
}

// ---- 2. Sum GA4 sessions per URL across months -----------------------------
const sessionsByUrl = new Map();
const ga4Months = [];
let totalSessions = 0;
for (const f of csvFiles(GA4_DIR)) {
  const label = labelFromName(f) || f;
  ga4Months.push(label);
  let monthSessions = 0;
  await streamCSV(join(GA4_DIR, f), (r) => {
    const path = getPath(r), sess = getSessions(r);
    if (!path || sess <= 0) return;
    const key = normaliseUrl(path);
    sessionsByUrl.set(key, (sessionsByUrl.get(key) || 0) + sess);
    monthSessions += sess;
  });
  totalSessions += monthSessions;
  console.log(`  ga4    ${f.padEnd(34)} ${monthSessions.toLocaleString()} sessions  (${label})`);
}

// ---- 3. Attach sessions + assemble -----------------------------------------
const out = [];
let withTraffic = 0;
for (const [key, a] of articles) {
  const sessions = sessionsByUrl.get(key) || 0;
  if (sessions > 0) withTraffic++;
  out.push({ ...a, s: sessions });
}

if (!existsSync(dirname(OUT))) mkdirSync(dirname(OUT), { recursive: true });
const payload = {
  meta: {
    builtAt: new Date().toISOString(),
    articleCount: out.length,
    withTraffic,
    totalSessions,
    indexMonths,
    ga4Months,
  },
  articles: out,
};
const json = JSON.stringify(payload);
writeFileSync(OUT, json);

const sizeMB = (Buffer.byteLength(json) / (1024 * 1024)).toFixed(2);
console.log(`\n✓ Wrote ${OUT}`);
console.log(`  ${out.length.toLocaleString()} articles · ${withTraffic.toLocaleString()} with traffic · ${totalSessions.toLocaleString()} total sessions · ${sizeMB} MB`);
if (!out.length) console.log("  (no data found — drop CSVs into data/index and data/ga4, then re-run)");
