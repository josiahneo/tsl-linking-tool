// Build a compact, pre-tokenised link index from monthly CSV exports.
//
//   data/index/*.csv   article-index exports (title, url, keyword, category, content)
//   data/ga4/*.csv      GA4 "Pages and screens" exports, one per month
//
// Run:  npm run build-data   ->   public/linkdata.json
//
// Merge rules:
//   - index files dedupe by WordPress post ID (falling back to normalised URL
//     when the CSV has no ID column); the row with the newest modified date
//     wins. A slug rename (fireworks-2025 -> fireworks-2026) therefore
//     REPLACES the old row instead of duplicating it — the old URL is kept as
//     an alias so its GA4 history and inbound links still credit the article.
//   - GA4 sessions are SUMMED per URL across every file (cumulative traffic),
//     then attributed to an article across its canonical URL + all aliases.
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
  getId, getStatus, getTitle, getUrl, getKeyword, getCategory, getContent,
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
const articles = new Map(); // stable key (id:<postID> | normUrl) -> row
const keyByUrl = new Map(); // normUrl -> stable key, so ID-less rows still dedupe
const indexMonths = [];
for (const f of csvFiles(INDEX_DIR)) {
  const label = labelFromName(f) || f;
  indexMonths.push(label);
  let added = 0;
  await streamCSV(join(INDEX_DIR, f), (r) => {
    const url = getUrl(r);
    const title = decodeEntities(getTitle(r));
    if (!url || !title) return;
    // Only live articles. Drafts/pending posts export a "?p=<id>" permalink
    // that normalises to "/" — without this filter they'd pile up as bogus
    // homepage articles (and previously one of them absorbed the homepage's
    // GA4 sessions).
    const status = getStatus(r).toLowerCase();
    if (status && status !== "publish") return;
    const nu = normaliseUrl(url);
    if (nu === "/") return;
    const id = getId(r);
    const key = id ? `id:${id}` : keyByUrl.get(nu) || nu;
    const d = toISODate(getModified(r));
    const prev = articles.get(key);
    // Newest-modified-date wins — deterministic across import order. A losing
    // row with a different URL is an outdated slug: keep it as an alias.
    if (prev && prev.d && d && d < prev.d) {
      if (nu !== prev.nu) { prev.al.add(nu); keyByUrl.set(nu, key); }
      return;
    }
    const keyword = decodeEntities(getKeyword(r));
    const category = decodeEntities(getCategory(r));
    const content = getContent(r);
    // tt = strong field (title + focus keyword); ct = body (content + category).
    // Each is [stem, count] pairs for BM25 term-frequency scoring.
    const tt = termFreq(`${title} ${keyword}`);
    const ct = termFreq(`${content} ${category}`, CONTENT_TOKEN_CAP);
    const out = extractInternalLinks(content); // outbound internal links (normalised)
    const al = prev ? prev.al : new Set();
    if (prev && prev.nu !== nu) al.add(prev.nu);
    al.delete(nu);
    articles.set(key, { id, t: title, u: url, nu, k: keyword, c: category, d, tt, ct, out, al });
    keyByUrl.set(nu, key);
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
const entries = [...articles.values()]; // insertion order
// URL -> article index, covering aliases too, so GA4 rows and internal links
// that still use a pre-rename slug resolve to the renamed article.
const idxByUrl = new Map();
entries.forEach((a, i) => {
  idxByUrl.set(a.nu, i);
  for (const al of a.al) if (!idxByUrl.has(al)) idxByUrl.set(al, i);
});

const out = [];
let withTraffic = 0;
let totalLinks = 0;
const inboundCount = new Array(entries.length).fill(0);
for (let i = 0; i < entries.length; i++) {
  const a = entries[i];
  let sessions = sessionsByUrl.get(a.nu) || 0;
  for (const al of a.al) sessions += sessionsByUrl.get(al) || 0;
  if (sessions > 0) withTraffic++;
  const lo = [];
  const seen = new Set();
  for (const t of a.out || []) {
    const j = idxByUrl.get(t);
    if (j === undefined || j === i || seen.has(j)) continue;
    seen.add(j); lo.push(j); inboundCount[j]++; totalLinks++;
  }
  out.push({
    t: a.t, u: a.u, k: a.k, c: a.c, d: a.d, s: sessions, tt: a.tt, ct: a.ct, lo,
    ...(a.id ? { i: a.id } : {}), ...(a.al.size ? { al: [...a.al] } : {}),
  });
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
