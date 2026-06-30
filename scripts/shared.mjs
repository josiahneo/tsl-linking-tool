// Shared parsing/tokenising helpers used by the build script.
// The tokeniser MUST stay in sync with the one in src/App.jsx so that
// baked-in data and in-browser uploads are scored identically.

import { createReadStream } from "node:fs";

export const STOPWORDS = new Set([
  // common english
  "the","and","for","are","was","with","this","that","from","has","its","our",
  "but","not","you","all","can","her","his","she","they","them","have","will",
  "been","than","into","out","one","had","your","we","is","it","to","of","in",
  "on","at","as","by","an","or","be","if","so","do","no","up","my","me","us",
  "what","which","who","how","when","where","why","get","got","new","now","also",
  "more","most","some","any","each","other","about","there","their","were","here",
  // wordpress / html noise that survives tag stripping
  "nbsp","amp","quot","apos","href","src","https","http","www","com","img","jpg",
  "jpeg","png","gif","div","span","class","style","data","alt","rel","nofollow",
  "target","blank","strong","html","body","head","li","ul","ol","br","px",
]);

// Porter stemmer (M.F. Porter, 1980) — collapses inflections so a query for
// "hotel" matches "hotels", "cafe"↔"cafes", "review"↔"reviews", etc. Compact
// public-domain JS port. MUST stay identical to the copy in src/App.jsx.
export function stem(w) {
  const step2 = { ational:"ate",tional:"tion",enci:"ence",anci:"ance",izer:"ize",bli:"ble",alli:"al",entli:"ent",eli:"e",ousli:"ous",ization:"ize",ation:"ate",ator:"ate",alism:"al",iveness:"ive",fulness:"ful",ousness:"ous",aliti:"al",iviti:"ive",biliti:"ble",logi:"log" };
  const step3 = { icate:"ic",ative:"",alize:"al",iciti:"ic",ical:"ic",ful:"",ness:"" };
  const cc = "[^aeiou]", vv = "[aeiouy]", Cc = cc + "[^aeiouy]*", Vv = vv + "[aeiou]*";
  const mgr0 = "^(" + Cc + ")?" + Vv + Cc;
  const meq1 = "^(" + Cc + ")?" + Vv + Cc + "(" + Vv + ")?$";
  const mgr1 = "^(" + Cc + ")?" + Vv + Cc + Vv + Cc;
  const s_v = "^(" + Cc + ")?" + vv;
  if (w.length < 3) return w;
  let re, re2, re3, re4, fp, st, suf;
  const first = w[0];
  if (first === "y") w = "Y" + w.substr(1);
  re = /^(.+?)(ss|i)es$/; re2 = /^(.+?)([^s])s$/;
  if (re.test(w)) w = w.replace(re, "$1$2");
  else if (re2.test(w)) w = w.replace(re2, "$1$2");
  re = /^(.+?)eed$/; re2 = /^(.+?)(ed|ing)$/;
  if (re.test(w)) { fp = re.exec(w); if (new RegExp(mgr0).test(fp[1])) w = w.replace(/.$/, ""); }
  else if (re2.test(w)) {
    fp = re2.exec(w); st = fp[1];
    if (new RegExp(s_v).test(st)) {
      w = st;
      if (/(at|bl|iz)$/.test(w)) w += "e";
      else if (/([^aeiouylsz])\1$/.test(w)) w = w.replace(/.$/, "");
      else if (new RegExp("^" + Cc + vv + "[^aeiouwxy]$").test(w)) w += "e";
    }
  }
  re = /^(.+?)y$/;
  if (re.test(w)) { fp = re.exec(w); if (new RegExp(s_v).test(fp[1])) w = fp[1] + "i"; }
  re = /^(.+?)(ational|tional|enci|anci|izer|bli|alli|entli|eli|ousli|ization|ation|ator|alism|iveness|fulness|ousness|aliti|iviti|biliti|logi)$/;
  if (re.test(w)) { fp = re.exec(w); if (new RegExp(mgr0).test(fp[1])) w = fp[1] + step2[fp[2]]; }
  re = /^(.+?)(icate|ative|alize|iciti|ical|ful|ness)$/;
  if (re.test(w)) { fp = re.exec(w); if (new RegExp(mgr0).test(fp[1])) w = fp[1] + step3[fp[2]]; }
  re = /^(.+?)(al|ance|ence|er|ic|able|ible|ant|ement|ment|ent|ou|ism|ate|iti|ous|ive|ize)$/; re2 = /^(.+?)(s|t)(ion)$/;
  if (re.test(w)) { fp = re.exec(w); if (new RegExp(mgr1).test(fp[1])) w = fp[1]; }
  else if (re2.test(w)) { fp = re2.exec(w); st = fp[1] + fp[2]; if (new RegExp(mgr1).test(st)) w = st; }
  re = /^(.+?)e$/;
  if (re.test(w)) { fp = re.exec(w); st = fp[1]; re2 = new RegExp(meq1); re3 = new RegExp("^" + Cc + vv + "[^aeiouwxy]$"); if (new RegExp(mgr1).test(st) || (re2.test(st) && !re3.test(st))) w = st; }
  if (/ll$/.test(w) && new RegExp(mgr1).test(w)) w = w.replace(/.$/, "");
  if (first === "y") w = "y" + w.substr(1);
  return w;
}

// Decode HTML entities from WordPress exports (&#038; -> &, &nbsp; -> space,
// &#8217; -> ’, etc.) so titles render as real text. Pure-JS (no DOM) so it
// works in both Node (build) and the browser. Mirror of the copy in App.jsx.
const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘",
  rdquo: "”", ldquo: "“", copy: "©", reg: "®", trade: "™", deg: "°",
  eacute: "é", egrave: "è", agrave: "à", ccedil: "ç",
};
export function decodeEntities(str) {
  if (!str) return str;
  return str
    .replace(/&(#x?[0-9a-f]+|[a-z]+[0-9]*);/gi, (m, e) => {
      if (e[0] === "#") {
        const cp = (e[1] === "x" || e[1] === "X")
          ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
      }
      const k = e.toLowerCase();
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, k) ? NAMED_ENTITIES[k] : m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenise(str) {
  return (str || "")
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")      // strip html tags first
    .replace(/&[a-z]+;/g, " ")     // strip html entities (&nbsp; etc.)
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    // keep 2-char tokens — "jb", "sg", "kl", "hk" are core TSL terms; generic
    // 2-letter words are already stopwords.
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
    .map(stem);
}

// Term frequencies as [stem, count] pairs, sorted by count desc, capped.
// BM25 needs counts (a hotel listicle naming "hotel" 8× should outrank a
// review that mentions it once), so we keep frequency rather than a unique set.
export function termFreq(str, cap) {
  const counts = new Map();
  for (const t of tokenise(str)) counts.set(t, (counts.get(t) || 0) + 1);
  const pairs = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return cap ? pairs.slice(0, cap) : pairs;
}

export function normaliseUrl(raw) {
  if (!raw) return "";
  let u = raw.trim().toLowerCase();
  u = u.replace(/^https?:\/\/(www\.)?thesmartlocal\.com/, "");
  u = u.replace(/^https?:\/\/[^/]+/, ""); // any other host prefix
  u = u.replace(/[?#].*$/, "");           // strip query/hash
  u = u.replace(/\/+$/, "");              // strip trailing slashes
  if (!u) return "/";
  if (!u.startsWith("/")) u = "/" + u;
  return u;
}

// Extract distinct internal-link targets (normalised paths) from post HTML.
// Only links to thesmartlocal.com or root-relative paths count — this builds the
// internal link graph used for orphan detection.
export function extractInternalLinks(html) {
  if (!html) return [];
  const out = new Set();
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1].trim();
    if (!href || href[0] === "#" || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    const internal =
      (href[0] === "/" && href[1] !== "/") ||
      /^https?:\/\/(www\.)?thesmartlocal\.com/i.test(href) ||
      /^\/\/(www\.)?thesmartlocal\.com/i.test(href);
    if (!internal) continue;
    const n = normaliseUrl(href.replace(/^\/\//, "https://"));
    if (n) out.add(n);
  }
  return [...out];
}

// Streaming CSV parser — feeds rows to `onRow(obj)` one at a time without ever
// holding the whole file (or all its rows) in memory. Handles quoted fields with
// embedded commas/newlines, and "" escapes that straddle chunk boundaries.
// The caller is expected to extract+discard each row immediately.
export function streamCSV(path, onRow) {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(path, { encoding: "utf8", highWaterMark: 1 << 20 });
    let headers = null;
    let field = "";
    let row = [];
    let inQ = false;
    let pendingQuote = false; // saw a '"' inside a quoted field; awaiting "" vs close

    const pushField = () => { row.push(field); field = ""; };
    const finishRow = () => {
      pushField();
      if (headers === null) {
        // Skip GA4-style preamble: leading "#" comment lines and blank lines.
        const empty = row.every((c) => (c || "").trim() === "");
        if (!empty && !(row[0] || "").trim().startsWith("#")) {
          headers = row.map((h) => h.replace(/^﻿/, "").trim().toLowerCase());
        }
      } else if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
        const obj = {};
        for (let k = 0; k < headers.length; k++) obj[headers[k]] = (row[k] ?? "").trim();
        onRow(obj);
      }
      row = [];
    };
    const handleUnquoted = (ch) => {
      if (ch === '"') inQ = true;
      else if (ch === ",") pushField();
      else if (ch === "\n") finishRow();
      else if (ch === "\r") { /* ignore */ }
      else field += ch;
    };

    stream.on("data", (chunk) => {
      for (let i = 0; i < chunk.length; i++) {
        const ch = chunk[i];
        if (inQ) {
          if (pendingQuote) {
            pendingQuote = false;
            if (ch === '"') field += '"';        // escaped quote
            else { inQ = false; handleUnquoted(ch); } // quote closed the field
          } else if (ch === '"') {
            pendingQuote = true;
          } else {
            field += ch;
          }
        } else {
          handleUnquoted(ch);
        }
      }
    });
    stream.on("end", () => {
      if (pendingQuote) { pendingQuote = false; inQ = false; }
      if (field.length || row.length) finishRow();
      resolve();
    });
    stream.on("error", reject);
  });
}

export function parseCSV(text) {
  const out = [];
  const len = text.length;
  let i = 0;
  let field = "";
  let row = [];
  let inQ = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { pushField(); out.push(row); row = []; };
  while (i < len) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQ = true; i++; continue; }
    if (ch === ",") { pushField(); i++; continue; }
    if (ch === "\r") { i++; continue; }
    if (ch === "\n") { pushRow(); i++; continue; }
    field += ch; i++;
  }
  if (field.length || row.length) pushRow();
  if (!out.length) return [];
  let h = 0;
  while (h < out.length &&
    (out[h].every((c) => (c || "").trim() === "") || (out[h][0] || "").trim().startsWith("#"))) h++;
  if (h >= out.length) return [];
  const headers = out[h].map((c) => c.replace(/^﻿/, "").trim().toLowerCase());
  return out.slice(h + 1)
    .filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""))
    .map((vals) => {
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = (vals[idx] ?? "").trim(); });
      return obj;
    });
}

// Flexible column pickers ----------------------------------------------------
const pick = (row, keys) => {
  for (const k of keys) if (row[k] != null && row[k] !== "") return row[k];
  return "";
};

export const getTitle = (r) => pick(r, ["title", "page title", "article title", "post title", "name"]);
export const getUrl = (r) => pick(r, ["url", "page url", "link", "permalink", "address"]);
export const getKeyword = (r) => pick(r, ["keyword", "focus keyword", "focus keyphrase", "keyphrase"]);
export const getCategory = (r) => pick(r, ["category", "categories", "section", "type"]);
export const getContent = (r) => {
  for (const k of Object.keys(r)) {
    if (k === "content" || k === "post content" || k === "post_content" ||
        k === "body" || k === "text" || k === "article content" ||
        k === "raw content" || k === "content (raw)" || k.includes("content")) {
      if (r[k]) return r[k];
    }
  }
  return "";
};
export const getPath = (r) => {
  const exact = pick(r, [
    "page path", "page path and screen class", "page path and screen",
    "landing page + query string", "landing page", "pagepath", "path", "page", "url", "address",
  ]);
  if (exact) return exact;
  for (const k of Object.keys(r)) {
    if ((k.includes("page path") || k.includes("landing page") || k === "page" || k === "path") && r[k]) return r[k];
  }
  return "";
};
export const getSessions = (r) => {
  const v = pick(r, ["sessions", "views", "page views", "pageviews", "screen page views", "active users", "users", "total users"]);
  return parseInt(String(v).replace(/[^\d]/g, ""), 10) || 0;
};
// Last-modified date drives the freshness signal + URL-collision tiebreak.
export const getModified = (r) =>
  pick(r, ["post modified date", "modified", "post modified", "last modified", "modified date", "date modified", "updated"]);

// Normalise a date string to ISO "YYYY-MM-DD" (lexically sortable) or "".
export function toISODate(str) {
  if (!str) return "";
  const s = String(str).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const t = Date.parse(s);
  return Number.isNaN(t) ? "" : new Date(t).toISOString().slice(0, 10);
}

// Derive a human label like "Mar 2026" / "2026-03" from a filename.
const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
const MONTH_FULL = ["january","february","march","april","may","june","july","august","september","october","november","december"];
export function labelFromName(name) {
  const base = name.replace(/\.[^.]+$/, "").toLowerCase();
  let m = base.match(/(20\d{2})[-_ ]?(0[1-9]|1[0-2])/); // YYYY-MM
  if (m) {
    const idx = parseInt(m[2], 10) - 1;
    return `${MONTHS[idx][0].toUpperCase()}${MONTHS[idx].slice(1)} ${m[1]}`;
  }
  m = base.match(/(0[1-9]|1[0-2])[-_ ](20\d{2})/); // MM-YYYY
  if (m) {
    const idx = parseInt(m[1], 10) - 1;
    return `${MONTHS[idx][0].toUpperCase()}${MONTHS[idx].slice(1)} ${m[2]}`;
  }
  const yr = base.match(/20\d{2}/);
  for (let j = 0; j < 12; j++) {
    if (base.includes(MONTH_FULL[j]) || new RegExp(`\\b${MONTHS[j]}\\b`).test(base)) {
      const cap = MONTHS[j][0].toUpperCase() + MONTHS[j].slice(1);
      return yr ? `${cap} ${yr[0]}` : cap;
    }
  }
  return null;
}
