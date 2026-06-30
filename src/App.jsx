import { useState, useCallback, useMemo, useRef, useEffect } from "react";

const C = {
  red: "#E8212B",
  redLight: "#FDEAEA",
  bg: "#F7F7F5",
  surface: "#FFFFFF",
  border: "#E2E2DE",
  borderStrong: "#C8C8C2",
  textPrimary: "#1A1A18",
  textSecondary: "#6B6B65",
  textMuted: "#9B9B95",
  green: "#1A7A4A",
  greenLight: "#EAF5EE",
  orange: "#C96A00",
  orangeLight: "#FFF3E0",
};

// ---------------------------------------------------------------------------
// Tokeniser — MUST stay in sync with scripts/shared.mjs so that baked-in data
// and in-browser uploads are scored identically.
// ---------------------------------------------------------------------------
const STOPWORDS = new Set([
  "the","and","for","are","was","with","this","that","from","has","its","our",
  "but","not","you","all","can","her","his","she","they","them","have","will",
  "been","than","into","out","one","had","your","we","is","it","to","of","in",
  "on","at","as","by","an","or","be","if","so","do","no","up","my","me","us",
  "what","which","who","how","when","where","why","get","got","new","now","also",
  "more","most","some","any","each","other","about","there","their","were","here",
  "nbsp","amp","quot","apos","href","src","https","http","www","com","img","jpg",
  "jpeg","png","gif","div","span","class","style","data","alt","rel","nofollow",
  "target","blank","strong","html","body","head","li","ul","ol","br","px","read",
]);

// Porter stemmer (M.F. Porter, 1980) — collapses inflections so "hotel" matches
// "hotels", "cafe"↔"cafes", etc. MUST stay identical to the copy in
// scripts/shared.mjs so baked data and in-browser uploads/queries align.
function stem(w) {
  const step2 = { ational:"ate",tional:"tion",enci:"ence",anci:"ance",izer:"ize",bli:"ble",alli:"al",entli:"ent",eli:"e",ousli:"ous",ization:"ize",ation:"ate",ator:"ate",alism:"al",iveness:"ive",fulness:"ful",ousness:"ous",aliti:"al",iviti:"ive",biliti:"ble",logi:"log" };
  const step3 = { icate:"ic",ative:"",alize:"al",iciti:"ic",ical:"ic",ful:"",ness:"" };
  const cc = "[^aeiou]", vv = "[aeiouy]", Cc = cc + "[^aeiouy]*", Vv = vv + "[aeiou]*";
  const mgr0 = "^(" + Cc + ")?" + Vv + Cc;
  const meq1 = "^(" + Cc + ")?" + Vv + Cc + "(" + Vv + ")?$";
  const mgr1 = "^(" + Cc + ")?" + Vv + Cc + Vv + Cc;
  const s_v = "^(" + Cc + ")?" + vv;
  if (w.length < 3) return w;
  let re, re2, re3, fp, st;
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

// Decode WordPress HTML entities (&#038; -> &, &nbsp; -> space) so titles render
// as real text. Mirror of the copy in scripts/shared.mjs.
const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘",
  rdquo: "”", ldquo: "“", copy: "©", reg: "®", trade: "™", deg: "°",
  eacute: "é", egrave: "è", agrave: "à", ccedil: "ç",
};
function decodeEntities(str) {
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

function tokenise(str) {
  return (str || "")
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    // keep 2-char tokens — "jb", "sg", "kl", "hk" are core TSL terms; generic
    // 2-letter words are already stopwords.
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
    .map(stem);
}

// Term frequencies as [stem, count] pairs, sorted by count desc, capped.
function termFreq(str, cap) {
  const counts = new Map();
  for (const t of tokenise(str)) counts.set(t, (counts.get(t) || 0) + 1);
  const pairs = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return cap ? pairs.slice(0, cap) : pairs;
}

// BM25 + ranking tunables (tweak freely — no rebuild needed).
const BM25_K1 = 1.5;       // term-frequency saturation
const BM25_B = 0.6;        // length normalisation
const TITLE_BOOST = 3.0;   // weight of title/keyword hits vs body
const TRAFFIC_ALPHA = 0.3; // max relative lift from traffic (gentle re-rank)

function normUrl(raw) {
  if (!raw) return "";
  let u = String(raw).trim().toLowerCase();
  u = u.replace(/^https?:\/\/(www\.)?thesmartlocal\.com/, "");
  u = u.replace(/^https?:\/\/[^/]+/, "");
  u = u.replace(/[?#].*$/, "");
  u = u.replace(/\/+$/, "");
  if (!u) return "/";
  if (!u.startsWith("/")) u = "/" + u;
  return u;
}

// Robust CSV parse (handles quoted fields, embedded commas/newlines).
function parseCSV(text) {
  const out = [];
  const len = text.length;
  let i = 0, field = "", row = [], inQ = false;
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
  // Skip GA4-style preamble: leading "#" comment lines and blank lines.
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

const pick = (row, keys) => {
  for (const k of keys) if (row[k] != null && row[k] !== "") return row[k];
  return "";
};
const getTitle = (r) => pick(r, ["title", "page title", "article title", "post title", "name"]);
const getUrl = (r) => pick(r, ["url", "page url", "link", "permalink", "address"]);
const getKeyword = (r) => pick(r, ["keyword", "focus keyword", "focus keyphrase", "keyphrase"]);
const getCategory = (r) => pick(r, ["category", "categories", "section", "type"]);
const getContent = (r) => {
  for (const k of Object.keys(r)) {
    if (k === "content" || k === "post content" || k === "post_content" ||
        k === "body" || k === "text" || k === "article content" ||
        k === "raw content" || k === "content (raw)" || k.includes("content")) {
      if (r[k]) return r[k];
    }
  }
  return "";
};
const getPath = (r) => {
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
const getSessions = (r) => {
  const v = pick(r, ["sessions", "views", "page views", "pageviews", "screen page views", "active users", "users", "total users"]);
  return parseInt(String(v).replace(/[^\d]/g, ""), 10) || 0;
};
const getModified = (r) =>
  pick(r, ["post modified date", "modified", "post modified", "last modified", "modified date", "date modified", "updated"]);
function toISODate(str) {
  if (!str) return "";
  const s = String(str).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const t = Date.parse(s);
  return Number.isNaN(t) ? "" : new Date(t).toISOString().slice(0, 10);
}

const CONTENT_TOKEN_CAP = 200;
const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
const MONTH_FULL = ["january","february","march","april","may","june","july","august","september","october","november","december"];
function labelFromName(name) {
  const base = (name || "").replace(/\.[^.]+$/, "").toLowerCase();
  const cap = (i, yr) => {
    const m = MONTHS[i][0].toUpperCase() + MONTHS[i].slice(1);
    return yr ? `${m} ${yr}` : m;
  };
  let m = base.match(/(20\d{2})[-_ ]?(0[1-9]|1[0-2])/);
  if (m) return cap(parseInt(m[2], 10) - 1, m[1]);
  m = base.match(/(0[1-9]|1[0-2])[-_ ](20\d{2})/);
  if (m) return cap(parseInt(m[1], 10) - 1, m[2]);
  const yr = base.match(/20\d{2}/);
  for (let j = 0; j < 12; j++) {
    if (base.includes(MONTH_FULL[j]) || new RegExp(`\\b${MONTHS[j]}\\b`).test(base)) return cap(j, yr && yr[0]);
  }
  return null;
}

function readFileInChunks(file, { onProgress, onDone, onError }) {
  const CHUNK = 4 * 1024 * 1024;
  const chunks = [];
  let offset = 0;
  function readNext() {
    const slice = file.slice(offset, offset + CHUNK);
    const reader = new FileReader();
    reader.onload = (e) => {
      chunks.push(e.target.result);
      offset += CHUNK;
      const pct = Math.min(99, Math.round((offset / file.size) * 100));
      onProgress(pct, Math.min(offset, file.size));
      if (offset < file.size) setTimeout(readNext, 0);
      else onDone(chunks.join(""));
    };
    reader.onerror = () => onError(reader.error);
    reader.readAsText(slice);
  }
  readNext();
}

function fmt(n) {
  if (!n && n !== 0) return "—";
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return n.toString();
}
function fmtBytes(b) {
  if (b >= 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + " MB";
  if (b >= 1024) return (b / 1024).toFixed(0) + " KB";
  return b + " B";
}
function shortUrl(url) {
  return url.replace(/^https?:\/\/(www\.)?thesmartlocal\.com/, "").replace(/\/$/, "") || "/";
}
// "Sep 2024" + a freshness colour (green <1y, muted <2y, orange older) so stale
// content stands out as a refresh candidate.
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDate(iso) {
  if (!iso) return null;
  const [y, m] = iso.split("-");
  const label = `${MONTHS_SHORT[(+m || 1) - 1]} ${y}`;
  const ageMs = Date.now() - new Date(iso).getTime();
  const yrs = ageMs / (365.25 * 24 * 3600 * 1000);
  const color = yrs < 1 ? C.green : yrs < 2 ? C.textMuted : C.orange;
  return { label, color };
}
function useDebounce(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// ---------------------------------------------------------------------------
// Lightweight shared-password gate. NOTE: this is obfuscation, not real
// security — the data is fetchable directly and the hash ships in the bundle.
// The real protection is Vercel's deployment authentication. Rotate the
// password with `npm run set-password "…"`.
// ---------------------------------------------------------------------------
const PASSWORD_HASH = import.meta.env.VITE_PASSWORD_HASH || "";
const AUTH_KEY = "tsl_link_auth";

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function PasswordGate({ children }) {
  // Fail open if no password is configured (e.g. local dev without .env).
  const [authed, setAuthed] = useState(() => {
    if (!PASSWORD_HASH) return true;
    try { return localStorage.getItem(AUTH_KEY) === PASSWORD_HASH; } catch { return false; }
  });
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  if (authed) return children;

  const submit = async (e) => {
    e.preventDefault();
    if (!pw || checking) return;
    setChecking(true); setError(false);
    const h = await sha256Hex(pw);
    if (h === PASSWORD_HASH) {
      try { localStorage.setItem(AUTH_KEY, PASSWORD_HASH); } catch { /* ignore */ }
      setAuthed(true);
    } else {
      setError(true); setPw("");
    }
    setChecking(false);
  };

  return (
    <div style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", background: C.bg, minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24, color: C.textPrimary }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 360, background: C.surface,
        border: `1px solid ${C.border}`, borderTop: `3px solid ${C.red}`, borderRadius: 10,
        padding: "28px 28px 24px", boxShadow: "0 2px 16px rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div style={{ background: C.red, color: "#fff", fontWeight: 800, fontSize: 11, letterSpacing: "0.08em", padding: "3px 7px", borderRadius: 3 }}>TSL</div>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Internal Linking Tool</span>
        </div>
        <label style={{ fontSize: 11, fontWeight: 600, color: C.textSecondary, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Password
        </label>
        <input
          type="password" autoFocus value={pw}
          onChange={(e) => { setPw(e.target.value); setError(false); }}
          placeholder="Enter access password"
          style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${error ? C.red : C.border}`,
            borderRadius: 6, padding: "10px 12px", fontSize: 14, outline: "none", fontFamily: "inherit",
            color: C.textPrimary, background: C.bg }}
          onFocus={(e) => (e.target.style.borderColor = C.red)}
          onBlur={(e) => (e.target.style.borderColor = error ? C.red : C.border)}
        />
        {error && <div style={{ color: C.red, fontSize: 12, marginTop: 8 }}>Incorrect password. Try again.</div>}
        <button type="submit" disabled={checking || !pw}
          style={{ width: "100%", marginTop: 16, padding: "10px 12px", border: "none", borderRadius: 6,
            background: checking || !pw ? C.borderStrong : C.red, color: "#fff", fontSize: 13, fontWeight: 700,
            fontFamily: "inherit", cursor: checking || !pw ? "default" : "pointer" }}>
          {checking ? "Checking…" : "Enter"}
        </button>
        <div style={{ marginTop: 14, fontSize: 10, color: C.textMuted, lineHeight: 1.6, textAlign: "center" }}>
          Internal tool — for The Smart Local editorial team only.
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add-a-file zone. Transient: idle -> reading -> parsing -> idle.
// The source of truth for "what's loaded" lives in the parent's source list,
// never in this component (avoids the loaded-flash race condition).
// ---------------------------------------------------------------------------
function AddZone({ icon, label, hint, onText }) {
  const ref = useRef();
  const [drag, setDrag] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | reading | parsing
  const [progress, setProgress] = useState(0);
  const [bytesRead, setBytesRead] = useState(0);
  const [fileSize, setFileSize] = useState(0);

  const handleFile = useCallback((file) => {
    if (!file) return;
    setPhase("reading"); setProgress(0); setBytesRead(0); setFileSize(file.size);
    readFileInChunks(file, {
      onProgress: (pct, bytes) => { setProgress(pct); setBytesRead(bytes); },
      onDone: (text) => {
        setPhase("parsing"); setProgress(100);
        setTimeout(() => {
          onText(text, file.name);
          setTimeout(() => setPhase("idle"), 60);
        }, 50);
      },
      onError: () => setPhase("idle"),
    });
  }, [onText]);

  const busy = phase !== "idle";
  const borderColor = drag ? C.red : busy ? C.orange : C.borderStrong;

  return (
    <div style={{
      border: `2px dashed ${borderColor}`, borderRadius: 10,
      background: busy ? "#FFFDE7" : drag ? C.redLight : C.surface,
      transition: "border-color 0.2s, background 0.2s", overflow: "hidden",
    }}>
      <div
        onClick={() => !busy && ref.current?.click()}
        onDragOver={(e) => { if (!busy) { e.preventDefault(); setDrag(true); } }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (!busy) handleFile(e.dataTransfer.files[0]); }}
        style={{ padding: "13px 16px", cursor: busy ? "default" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
      >
        <input ref={ref} type="file" accept=".csv" style={{ display: "none" }}
          onChange={(e) => handleFile(e.target.files[0])} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 16 }}>{busy ? "⏳" : icon}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: busy ? C.orange : C.textPrimary }}>
              {busy ? (phase === "parsing" ? "Parsing rows…" : "Reading…") : label}
            </div>
            <div style={{ fontSize: 11, color: C.textSecondary, marginTop: 1 }}>
              {busy
                ? (phase === "parsing" ? "Almost done" : `${fmtBytes(bytesRead)} of ${fmtBytes(fileSize)}`)
                : hint}
            </div>
          </div>
        </div>
        {!busy && (
          <div style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 6,
            border: `1px solid ${C.borderStrong}`, background: C.bg,
            fontSize: 12, fontWeight: 600, color: C.textSecondary, whiteSpace: "nowrap" }}>
            + Add CSV
          </div>
        )}
      </div>
      {busy && (
        <div style={{ padding: "0 16px 12px" }}>
          <div style={{ height: 6, background: "#FFE082", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress}%`,
              background: phase === "parsing" ? C.green : C.orange, borderRadius: 3,
              transition: "width 0.15s ease, background 0.3s" }} />
          </div>
          <div style={{ marginTop: 4, fontSize: 10, color: C.textMuted }}>{progress}% · do not close this tab</div>
        </div>
      )}
    </div>
  );
}

function TrafficBar({ weight }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 80 }}>
      <div style={{ height: 6, width: 60, borderRadius: 3, background: C.border, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.round(weight * 100)}%`,
          background: weight > 0.6 ? C.red : weight > 0.3 ? "#F5A623" : C.borderStrong, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 10, color: C.textMuted, fontVariantNumeric: "tabular-nums" }}>
        {Math.round(weight * 100)}%
      </span>
    </div>
  );
}

function ScorePill({ score }) {
  const pct = Math.round(score * 100);
  const bg = pct >= 60 ? C.red : pct >= 35 ? "#F5A623" : "#E2E2DE";
  const fg = pct >= 35 ? "#fff" : C.textSecondary;
  return (
    <span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 4,
      fontSize: 11, fontWeight: 700, background: bg, color: fg, fontVariantNumeric: "tabular-nums" }}>{pct}</span>
  );
}

function TSLInternalLinker() {
  // Baked-in baseline (from public/linkdata.json)
  const [baseline, setBaseline] = useState({ articles: [], meta: null });
  const [baselineState, setBaselineState] = useState("loading"); // loading | ready | empty

  // In-session uploads (each labelled)
  const [indexSources, setIndexSources] = useState([]); // {id,label,articles:[{t,u,k,c,tt,ct}]}
  const [ga4Sources, setGa4Sources] = useState([]);      // {id,label,sessions:{normUrl:n},rows,total}

  const [sourceQuery, setSourceQuery] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [minScore, setMinScore] = useState(20);
  const [sortBy, setSortBy] = useState("score");
  const [topN, setTopN] = useState(10);
  const [copiedKey, setCopiedKey] = useState(null);

  const debouncedQuery = useDebounce(sourceQuery, 200);

  // Load baked baseline once.
  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}linkdata.json`)
      .then((r) => { if (!r.ok) throw new Error("no baseline"); return r.json(); })
      .then((d) => {
        if (cancelled) return;
        if (d?.articles?.length) { setBaseline(d); setBaselineState("ready"); }
        else setBaselineState("empty");
      })
      .catch(() => { if (!cancelled) setBaselineState("empty"); });
    return () => { cancelled = true; };
  }, []);

  const addIndex = useCallback((text, name) => {
    const rows = parseCSV(text);
    const articles = rows.map((r) => {
      const url = getUrl(r);
      const title = decodeEntities(getTitle(r));
      const keyword = decodeEntities(getKeyword(r));
      const category = decodeEntities(getCategory(r));
      if (!title || !url) return null;
      const tt = termFreq(`${title} ${keyword}`);
      const ct = termFreq(`${getContent(r)} ${category}`, CONTENT_TOKEN_CAP);
      return { t: title, u: url, k: keyword, c: category, d: toISODate(getModified(r)), tt, ct };
    }).filter(Boolean);
    if (!articles.length) return;
    setIndexSources((prev) => [...prev, {
      id: `idx-${Date.now()}`, label: labelFromName(name) || name.replace(/\.csv$/i, ""), articles,
    }]);
  }, []);

  const addGa4 = useCallback((text, name) => {
    const rows = parseCSV(text);
    const sessions = {};
    let total = 0, count = 0;
    for (const r of rows) {
      const path = getPath(r), sess = getSessions(r);
      if (!path || sess <= 0) continue;
      const key = normUrl(path);
      sessions[key] = (sessions[key] || 0) + sess;
      total += sess; count++;
    }
    if (!count) return;
    setGa4Sources((prev) => [...prev, {
      id: `ga4-${Date.now()}`, label: labelFromName(name) || name.replace(/\.csv$/i, ""),
      sessions, rows: count, total,
    }]);
  }, []);

  const renameSource = (setter) => (id, label) =>
    setter((prev) => prev.map((s) => (s.id === id ? { ...s, label } : s)));
  const removeSource = (setter) => (id) =>
    setter((prev) => prev.filter((s) => s.id !== id));

  // Merge baseline + uploads, then build the BM25 search structures (cached):
  // per-doc weighted term-frequency bag, an inverted index, avg doc length, and
  // a percentile traffic weight (robust to the 6M-view homepage outlier).
  const dataset = useMemo(() => {
    const map = new Map();
    for (const a of baseline.articles) map.set(normUrl(a.u), { ...a });
    for (const src of indexSources)
      for (const a of src.articles) {
        const key = normUrl(a.u);
        const existing = map.get(key);
        // Latest-modified-date wins: skip an upload that's older than what's
        // already there (same safeguard as the build script).
        if (existing && existing.d && a.d && a.d < existing.d) continue;
        map.set(key, { ...a, s: existing ? existing.s : 0 }); // keep baked sessions on upsert
      }
    const addSess = new Map();
    for (const src of ga4Sources)
      for (const k in src.sessions) addSess.set(k, (addSess.get(k) || 0) + src.sessions[k]);

    const articles = [];
    for (const [key, a] of map) {
      const sessions = (a.s || 0) + (addSess.get(key) || 0);
      // Weighted bag: title/keyword terms count TITLE_BOOST×, body terms 1×.
      const bag = new Map();
      for (const [t, n] of a.tt || []) bag.set(t, (bag.get(t) || 0) + n * TITLE_BOOST);
      for (const [t, n] of a.ct || []) bag.set(t, (bag.get(t) || 0) + n);
      let dl = 0;
      for (const v of bag.values()) dl += v;
      articles.push({ title: a.t, url: a.u, keyword: a.k || "", category: a.c || "", modified: a.d || "", sessions, bag, dl });
    }

    const N = articles.length || 1;
    let totalDl = 0;
    for (const a of articles) totalDl += a.dl;
    const avgdl = totalDl / N || 1;

    // Inverted index: token -> [[docIdx, weightedTf], ...]. df = postings length.
    const inverted = new Map();
    articles.forEach((a, i) => {
      for (const [t, wtf] of a.bag) {
        const p = inverted.get(t);
        if (p) p.push([i, wtf]); else inverted.set(t, [[i, wtf]]);
      }
    });

    // Percentile traffic weight: fraction of articles with fewer sessions.
    const sorted = articles.map((a) => a.sessions).sort((x, y) => x - y);
    const lowerCount = (s) => {
      let lo = 0, hi = sorted.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < s) lo = m + 1; else hi = m; }
      return lo;
    };
    const denom = N - 1 || 1;
    for (const a of articles) a.trafficWeight = a.sessions > 0 ? lowerCount(a.sessions) / denom : 0;

    return { articles, inverted, N, avgdl };
  }, [baseline, indexSources, ga4Sources]);

  const suggestions = useMemo(() => {
    const { articles, inverted, N, avgdl } = dataset;
    if (!articles.length) return [];
    const srcUrlNorm = normUrl(sourceUrl);
    // Query terms from the topic text + the URL slug (last path segment).
    let qText = debouncedQuery;
    if (sourceUrl) {
      const seg = normUrl(sourceUrl).split("/").filter(Boolean).pop() || "";
      qText += " " + seg.replace(/-/g, " ");
    }
    const q = [...new Set(tokenise(qText))];
    if (!q.length) return [];

    // BM25: only docs sharing a query term are scored (via the inverted index).
    const bm = new Map();
    for (const t of q) {
      const postings = inverted.get(t);
      if (!postings) continue;
      const df = postings.length;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      for (const [i, wtf] of postings) {
        const a = articles[i];
        const score = idf * (wtf * (BM25_K1 + 1)) / (wtf + BM25_K1 * (1 - BM25_B + BM25_B * (a.dl / avgdl)));
        bm.set(i, (bm.get(i) || 0) + score);
      }
    }
    if (!bm.size) return [];

    let maxBm = 0;
    for (const v of bm.values()) if (v > maxBm) maxBm = v;

    const out = [];
    for (const [i, score] of bm) {
      const a = articles[i];
      if (srcUrlNorm && normUrl(a.url) === srcUrlNorm) continue;
      const tw = a.trafficWeight || 0;
      // Relevance-first: traffic is a gentle multiplicative re-rank, never able
      // to lift a weak match over a strong one.
      const final = score * (1 + TRAFFIC_ALPHA * tw);
      out.push({ ...a, rel: maxBm > 0 ? score / maxBm : 0, finalRaw: final, tw });
    }
    if (!out.length) return [];

    let maxFinal = 0;
    for (const o of out) if (o.finalRaw > maxFinal) maxFinal = o.finalRaw;
    for (const o of out) o.combined = maxFinal > 0 ? o.finalRaw / maxFinal : 0; // 0–1 vs best match

    return out
      .filter((o) => o.combined * 100 >= minScore)
      .sort((a, b) =>
        sortBy === "traffic"
          ? b.sessions - a.sessions || b.finalRaw - a.finalRaw
          : b.finalRaw - a.finalRaw)
      .slice(0, topN);
  }, [dataset, debouncedQuery, sourceUrl, minScore, sortBy, topN]);

  // Copy the bare URL so writers paste the link and choose their own
  // contextual anchor text (using the full headline as anchor is poor SEO).
  const copyUrl = (a) => {
    navigator.clipboard.writeText(a.url).then(() => {
      setCopiedKey(a.url);
      setTimeout(() => setCopiedKey(null), 1500);
    });
  };

  const articles = dataset.articles;
  const hasData = articles.length > 0;
  const withTraffic = useMemo(() => articles.filter((a) => a.sessions > 0).length, [articles]);
  const totalSessions = useMemo(() => articles.reduce((s, a) => s + a.sessions, 0), [articles]);
  const hasGA4 = totalSessions > 0;
  const hasQuery = sourceQuery.trim().length > 0 || sourceUrl.trim().length > 0;

  const monthsCovered = useMemo(() => {
    const set = new Set();
    (baseline.meta?.ga4Months || []).forEach((m) => set.add(m));
    ga4Sources.forEach((s) => set.add(s.label));
    return [...set];
  }, [baseline, ga4Sources]);

  const uploadedSources = [
    ...indexSources.map((s) => ({ ...s, kind: "index" })),
    ...ga4Sources.map((s) => ({ ...s, kind: "ga4" })),
  ];

  return (
    <div style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", background: C.bg, minHeight: "100vh", color: C.textPrimary }}>
      {/* Header */}
      <div style={{ borderBottom: `3px solid ${C.red}`, background: C.surface, padding: "0 24px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 52 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ background: C.red, color: "#fff", fontWeight: 800, fontSize: 11, letterSpacing: "0.08em", padding: "3px 7px", borderRadius: 3 }}>TSL</div>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Internal Linking Tool</span>
          </div>
          {hasData && (
            <div style={{ display: "flex", gap: 16, fontSize: 11 }}>
              <span style={{ color: C.green, fontWeight: 600 }}>✓ {fmt(articles.length)} articles</span>
              {hasGA4
                ? <span style={{ color: C.green, fontWeight: 600 }}>✓ {fmt(withTraffic)} with traffic · {fmt(totalSessions)} sessions</span>
                : <span style={{ color: C.orange, fontWeight: 600 }}>⚠ No GA4 data</span>}
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "24px 24px 48px" }}>
        {/* Data sources */}
        <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: "16px 18px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>Data sources</div>
            {baseline.meta && (
              <div style={{ fontSize: 10, color: C.textMuted }}>
                baseline built {new Date(baseline.meta.builtAt).toLocaleDateString()}
              </div>
            )}
          </div>

          {/* Baseline row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 7,
            background: baselineState === "ready" ? C.greenLight : C.bg,
            border: `1px solid ${baselineState === "ready" ? "#B2DFDB" : C.border}`, marginBottom: 8 }}>
            <span style={{ fontSize: 14 }}>{baselineState === "ready" ? "✅" : baselineState === "loading" ? "⏳" : "○"}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>
                Baked-in baseline {baselineState === "ready" && <span style={{ color: C.green }}>· {fmt(baseline.meta.articleCount)} articles</span>}
              </div>
              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>
                {baselineState === "loading" && "Loading linkdata.json…"}
                {baselineState === "empty" && "No baseline found — run npm run build-data, or add CSVs below."}
                {baselineState === "ready" && (
                  <>index: {(baseline.meta.indexMonths || []).join(", ") || "—"} · ga4: {(baseline.meta.ga4Months || []).join(", ") || "—"}</>
                )}
              </div>
            </div>
          </div>

          {/* Uploaded sources */}
          {uploadedSources.map((s) => {
            const setter = s.kind === "index" ? setIndexSources : setGa4Sources;
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 7, background: C.bg, border: `1px solid ${C.border}`, marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: s.kind === "index" ? C.textSecondary : C.orange,
                  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, padding: "2px 6px" }}>
                  {s.kind === "index" ? "INDEX" : "GA4"}
                </span>
                <input value={s.label}
                  onChange={(e) => renameSource(setter)(s.id, e.target.value)}
                  placeholder="Label this month (e.g. Mar 2026)"
                  style={{ flex: "0 0 180px", border: `1px solid ${C.border}`, borderRadius: 5, padding: "4px 8px",
                    fontSize: 12, fontFamily: "inherit", background: C.surface, color: C.textPrimary, outline: "none" }} />
                <span style={{ fontSize: 11, color: C.textSecondary, flex: 1 }}>
                  {s.kind === "index" ? `${fmt(s.articles.length)} articles` : `${fmt(s.rows)} paths · ${fmt(s.total)} sessions`}
                </span>
                <button onClick={() => removeSource(setter)(s.id)} title="Remove this source"
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textMuted, borderRadius: 5,
                    width: 24, height: 24, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
              </div>
            );
          })}

          {/* Add zones */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4 }}>
            <AddZone icon="📄" onText={addIndex}
              label="Add article index"
              hint="title, url (+ keyword, category, content)" />
            <AddZone icon="📊" onText={addGa4}
              label="Add GA4 traffic month"
              hint="page path, sessions — adds to totals" />
          </div>
          {uploadedSources.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 10, color: C.textMuted, lineHeight: 1.6 }}>
              Uploaded data applies to this session only. To make it permanent for everyone, drop the CSVs into
              {" "}<code>data/index</code> / <code>data/ga4</code> and run <code>npm run build-data</code>.
            </div>
          )}
        </div>

        {/* Stats strip */}
        {hasData && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 1, marginBottom: 16,
            border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
            {[
              ["Articles indexed", fmt(articles.length), C.green],
              ["With GA4 traffic", hasGA4 ? fmt(withTraffic) : "—", hasGA4 ? C.green : C.textMuted],
              ["Not matched", hasGA4 ? fmt(articles.length - withTraffic) : "—", (articles.length - withTraffic) > articles.length * 0.5 ? C.orange : C.textSecondary],
              ["Total sessions", hasGA4 ? fmt(totalSessions) : "—", C.textPrimary],
            ].map(([lbl, val, color]) => (
              <div key={lbl} style={{ background: C.surface, padding: "12px 16px", textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>{val}</div>
                <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>{lbl}</div>
              </div>
            ))}
          </div>
        )}

        {hasData && hasGA4 && (articles.length - withTraffic) > articles.length * 0.5 && (
          <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 7, background: C.orangeLight, border: `1px solid #F5A623`, fontSize: 12, color: C.orange }}>
            <b>Low GA4 match rate</b> — fewer than half your articles matched a GA4 path. Check that page paths match the URL format in your index.
          </div>
        )}

        {/* Source article inputs */}
        <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: "18px 20px", marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14 }}>Source article</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              ["Topic / Keywords", sourceQuery, setSourceQuery, "e.g. best JB hotels RTS link 2026"],
              ["Article URL (optional)", sourceUrl, setSourceUrl, "https://thesmartlocal.com/read/..."],
            ].map(([lbl, val, setter, ph]) => (
              <div key={lbl}>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.textSecondary, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>{lbl}</label>
                <input value={val} onChange={(e) => setter(e.target.value)} placeholder={ph}
                  style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${C.border}`, borderRadius: 6,
                    padding: "8px 10px", fontSize: 13, outline: "none", fontFamily: "inherit", color: C.textPrimary, background: C.bg }}
                  onFocus={(e) => (e.target.style.borderColor = C.red)}
                  onBlur={(e) => (e.target.style.borderColor = C.border)} />
              </div>
            ))}
          </div>
        </div>

        {/* Filters */}
        {hasData && (
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 16, padding: "12px 16px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textSecondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>Filters</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 11, color: C.textSecondary }}>Min score</label>
              <input type="range" min={0} max={80} step={5} value={minScore} onChange={(e) => setMinScore(+e.target.value)} style={{ width: 90, accentColor: C.red }} />
              <span style={{ fontSize: 11, fontWeight: 600, minWidth: 24, color: C.textPrimary }}>{minScore}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 11, color: C.textSecondary }}>Show top</label>
              <select value={topN} onChange={(e) => setTopN(+e.target.value)}
                style={{ border: `1px solid ${C.border}`, borderRadius: 4, padding: "3px 6px", fontSize: 11, fontFamily: "inherit", background: C.bg, color: C.textPrimary }}>
                {[5, 10, 20, 50].map((n) => <option key={n}>{n}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 11, color: C.textSecondary }}>Sort by</label>
              <div style={{ display: "flex", borderRadius: 5, overflow: "hidden", border: `1px solid ${C.border}` }}>
                {[["score", "Relevance"], ["traffic", "Traffic"]].map(([val, lbl]) => (
                  <button key={val} onClick={() => setSortBy(val)}
                    style={{ padding: "4px 10px", fontSize: 11, border: "none", cursor: "pointer",
                      background: sortBy === val ? C.red : C.bg, color: sortBy === val ? "#fff" : C.textSecondary,
                      fontFamily: "inherit", fontWeight: sortBy === val ? 600 : 400 }}>{lbl}</button>
                ))}
              </div>
            </div>
            {hasQuery && (
              <div style={{ marginLeft: "auto", fontSize: 11, color: C.textSecondary }}>
                {suggestions.length} suggestion{suggestions.length !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {hasData && hasQuery && (
          suggestions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 24px", color: C.textSecondary, fontSize: 13, background: C.surface, borderRadius: 8, border: `1px solid ${C.border}` }}>
              No matches above score {minScore}. Try lowering the threshold or broadening your topic.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 90px 90px 110px 80px", padding: "7px 14px", fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", color: C.textMuted, textTransform: "uppercase", borderRadius: "8px 8px 0 0", background: C.bg, border: `1px solid ${C.border}` }}>
                <span>#</span><span>Article</span>
                <span style={{ textAlign: "right" }}>Sessions</span>
                <span style={{ textAlign: "center" }}>Traffic</span>
                <span style={{ textAlign: "center" }}>Score</span>
                <span style={{ textAlign: "center" }}>Copy</span>
              </div>
              {suggestions.map((a, i) => (
                <div key={a.url + i}
                  style={{ display: "grid", gridTemplateColumns: "36px 1fr 90px 90px 110px 80px", alignItems: "center", padding: "10px 14px", background: C.surface, border: `1px solid ${C.border}`, borderTop: "none", borderRadius: i === suggestions.length - 1 ? "0 0 8px 8px" : 0 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFAF8")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = C.surface)}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: i < 3 ? C.red : C.textMuted, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.title}</div>
                    <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shortUrl(a.url)}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                      {a.keyword && <span style={{ display: "inline-block", fontSize: 9, fontWeight: 600, color: C.textSecondary, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 3, padding: "1px 5px" }}>{a.keyword}</span>}
                      {(() => { const fd = fmtDate(a.modified); return fd && <span style={{ fontSize: 9, fontWeight: 600, color: fd.color }}>↻ {fd.label}</span>; })()}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 12, fontWeight: 500, fontVariantNumeric: "tabular-nums", color: a.sessions > 0 ? C.textPrimary : C.textMuted }}>
                    {a.sessions > 0 ? fmt(a.sessions) : "—"}
                  </div>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    {a.sessions > 0 ? <TrafficBar weight={a.trafficWeight} /> : <span style={{ fontSize: 10, color: C.textMuted }}>no data</span>}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <ScorePill score={a.combined} />
                    <span style={{ fontSize: 9, color: C.textMuted }}>rel {Math.round(a.rel * 100)} · trfc {Math.round(a.trafficWeight * 100)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <button onClick={() => copyUrl(a)}
                      style={{ padding: "5px 10px", borderRadius: 5, border: `1px solid ${C.border}`,
                        background: copiedKey === a.url ? C.greenLight : C.bg,
                        color: copiedKey === a.url ? C.green : C.textSecondary,
                        fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {copiedKey === a.url ? "Copied!" : "Copy URL"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Empty / guidance states */}
        {!hasData && baselineState !== "loading" && (
          <div style={{ textAlign: "center", padding: "48px 24px", color: C.textSecondary, fontSize: 13, lineHeight: 1.7, background: C.surface, borderRadius: 8, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>📎</div>
            <div style={{ fontWeight: 600, color: C.textPrimary, marginBottom: 6 }}>No article data loaded yet</div>
            <div>Run <code>npm run build-data</code> to bake in the article index + GA4 exports, or add a CSV above.</div>
          </div>
        )}
        {hasData && !hasQuery && (
          <div style={{ textAlign: "center", padding: "36px 24px", color: C.textSecondary, fontSize: 13, background: C.surface, borderRadius: 8, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>✏️</div>
            <div style={{ fontWeight: 600, color: C.textPrimary, marginBottom: 4 }}>Enter a topic above to see link suggestions</div>
            <div>Describe the article you're editing — or paste its URL — to find the most relevant TSL articles to link to.</div>
          </div>
        )}
        {hasData && suggestions.length > 0 && (
          <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 6, background: C.bg, border: `1px solid ${C.border}`, fontSize: 10, color: C.textMuted, lineHeight: 1.8 }}>
            <b style={{ color: C.textSecondary }}>Score</b> = BM25 relevance (title/keyword weighted {TITLE_BOOST}× above body; generic words down-weighted by frequency), shown relative to the top match, with a gentle traffic re-rank. · <b style={{ color: C.textSecondary }}>Copy URL</b> copies the article link so you can write your own contextual anchor text.
            {monthsCovered.length > 0 && <> · <b style={{ color: C.textSecondary }}>Traffic</b> = cumulative sessions across {monthsCovered.join(", ")}.</>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <PasswordGate>
      <TSLInternalLinker />
    </PasswordGate>
  );
}
