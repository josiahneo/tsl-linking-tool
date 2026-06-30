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
  streamCSV, normaliseUrl, termFreq, decodeEntities, extractInternalLinks,
  getTitle, getUrl, getKeyword, getCategory, getContent,
  getPath, getSessions, getModified, toISODate, labelFromName,
} from "./shared.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INDEX_DIR = join(ROOT, "data", "index");
const GA4_DIR = join(ROOT, "data", "ga4");
const OUT = join(ROOT, "public", "linkdata.json");

const CONTENT_TOKEN_CAP = 200; // top content terms (by frequency) kept per article

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
    const url = getUrl(r);
    const title = decodeEntities(getTitle(r));
    if (!url || !title) return;
    const key = normaliseUrl(url);
    const d = toISODate(getModified(r));
    // Collision safeguard: if this URL already exists with a newer modified
    // date, keep the existing (fresher) row — deterministic across import order.
    const prev = articles.get(key);
    if (prev && prev.d && d && d < prev.d) return;
    const keyword = decodeEntities(getKeyword(r));
    const category = decodeEntities(getCategory(r));
    const content = getContent(r);
    // tt = strong field (title + focus keyword); ct = body (content + category).
    // Each is [stem, count] pairs for BM25 term-frequency scoring.
    const tt = termFreq(`${title} ${keyword}`);
    const ct = termFreq(`${content} ${category}`, CONTENT_TOKEN_CAP);
    const out = extractInternalLinks(content); // outbound internal links (normalised)
    articles.set(key, { t: title, u: url, k: keyword, c: category, d, tt, ct, out });
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

// ---- 3. Resolve link graph + attach sessions + assemble --------------------
// lo = outbound internal-link targets as indices into this article set. Inbound
// counts (for orphan detection) are derived from lo at load time.
const entries = [...articles.entries()]; // [normUrl, a] in insertion order
const idxByKey = new Map();
entries.forEach(([key], i) => idxByKey.set(key, i));

const out = [];
let withTraffic = 0;
let totalLinks = 0;
const inboundCount = new Array(entries.length).fill(0);
for (let i = 0; i < entries.length; i++) {
  const [key, a] = entries[i];
  const sessions = sessionsByUrl.get(key) || 0;
  if (sessions > 0) withTraffic++;
  const lo = [];
  const seen = new Set();
  for (const t of a.out || []) {
    const j = idxByKey.get(t);
    if (j === undefined || j === i || seen.has(j)) continue;
    seen.add(j); lo.push(j); inboundCount[j]++; totalLinks++;
  }
  out.push({ t: a.t, u: a.u, k: a.k, c: a.c, d: a.d, s: sessions, tt: a.tt, ct: a.ct, lo });
}
const orphanCount = inboundCount.filter((c) => c === 0).length;
const weakCount = inboundCount.filter((c) => c > 0 && c <= 2).length;

if (!existsSync(dirname(OUT))) mkdirSync(dirname(OUT), { recursive: true });
const payload = {
  meta: {
    builtAt: new Date().toISOString(),
    articleCount: out.length,
    withTraffic,
    totalSessions,
    totalLinks,
    orphanCount,
    weakCount,
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
console.log(`  link graph: ${totalLinks.toLocaleString()} internal links · ${orphanCount.toLocaleString()} orphans (0 inbound) · ${weakCount.toLocaleString()} weak (1–2 inbound)`);
if (!out.length) console.log("  (no data found — drop CSVs into data/index and data/ga4, then re-run)");
