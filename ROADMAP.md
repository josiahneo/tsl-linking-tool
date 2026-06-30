# TSL Internal Linking Tool — Roadmap & Design Notes

_Last updated: 2026-06-29_

A working document for the team: what this tool is for, what's built and how it
works, what's next, and the decisions we made along the way.

---

## 1. Objectives

The Smart Local Singapore has ~11,000 published articles. Two problems follow
from a catalogue that size:

1. **Writers can't find what to link to.** When editing an article, surfacing the
   most relevant *and* highest-value existing articles to link to is manual and
   inconsistent. Good internal linking improves SEO, time-on-site, and discovery.
2. **Articles get orphaned.** Pages with no inbound internal links are crawled
   less and rank worse. At our size, many high-traffic pages have zero internal
   links pointing to them — invisible opportunity.

**The tool addresses both, from the same dataset:**

- **Find links** — given a topic or article, suggest the most relevant internal
  articles to link to, ranked by relevance **and** weighted by real traffic and
  content freshness.
- **Orphans** — surface articles with few/no inbound internal links, prioritised
  by traffic, and suggest which existing articles should link to them.

Longer term, the aim is to emulate [Link Whisper](https://linkwhisper.com): live
link suggestions inside the WordPress editor as writers type.

---

## 2. What's built

A standalone **Vite + React** single-page app — entirely client-side, no backend.
All app logic lives in `src/App.jsx`; the offline data pipeline is in `scripts/`.

### Headline numbers (current dataset)
- **11,222** articles indexed (from 11,558 export rows, deduped by URL)
- **74.7M** page views factored into ranking
- **37,782** internal links mapped into a site-wide graph
- **4,062 articles (36%) are orphans** (zero inbound internal links); 3,029 more
  are "weak" (1–2 inbound)

### Two views over one dataset
- **Find links** — search box (topic/keywords and/or an article URL) → ranked
  suggestions with relevance score, traffic, freshness, and a copy-URL button.
- **Orphans** — list of low-inbound articles filterable by inbound threshold and
  min views; "Link it" suggests source articles that should link to each orphan.

---

## 3. How it works

### 3.1 Data pipeline (`scripts/build-data.mjs`, `npm run build-data`)

Monthly CSV exports are dropped into `data/index/` (WordPress article export with
content) and `data/ga4/` (GA4 traffic export). The build script:

- **Streams** each CSV row-by-row (`scripts/shared.mjs → streamCSV`) and tokenises
  on the fly, so the ~200 MB content-laden index never loads into memory at once.
- **Merges** index files deduped by normalised URL; on a collision the row with
  the **latest modified date wins** (deterministic regardless of import order).
- **Sums GA4 traffic** per URL across all months (cumulative).
- **Tokenises** title/keyword/category (strong field) and content (body field)
  into Porter-stemmed `[term, count]` pairs for BM25.
- **Extracts the internal link graph** from post content (`<a href>` → other TSL
  articles) and stores per-article outbound targets as compact indices.
- Writes a single pre-built `public/linkdata.json` (~29 MB; gzips to ~5–6 MB on
  the edge) that the app fetches on load. **Writers never upload anything.**

In-browser uploads still exist for ad-hoc monthly top-ups (labelled, session-only);
the permanent path is a rebuild. See `DATA.md` for the monthly refresh process.

### 3.2 Search / ranking engine (`src/App.jsx`)

- **BM25 + IDF** over stemmed terms. Rewards term frequency (a hotel *listicle*
  beats a one-off mention) and down-weights generic words (`singapore`, `best`,
  `guide`) via inverse document frequency.
- **Porter stemming** collapses inflections so `hotel` matches `hotels`, etc.
- **Field boosting** — title/keyword terms weighted `TITLE_BOOST`× over body.
- **Traffic** is a **percentile** (robust to the 6.2M-view homepage outlier),
  applied as a *gentle* re-rank (`TRAFFIC_ALPHA`, ≤30% lift) — it breaks ties among
  relevant results but never lifts a weak match over a strong one.
- **Freshness** — each result shows its last-modified date, colour-coded (green
  <1 yr, muted <2 yr, orange older).
- **Speed** — an inverted index means a query only touches the few hundred articles
  sharing a term, not all 11k. Query input is debounced.

Tunable parameters live at the top of `src/App.jsx` — adjustable without a rebuild:
`BM25_K1`, `BM25_B`, `TITLE_BOOST`, `TRAFFIC_ALPHA`.

### 3.3 Orphan detection (`src/App.jsx → OrphanView`)

The build-time link graph (outbound targets per article) is inverted at load into
**inbound counts**. Orphans = articles with ≤N inbound links. For a selected
orphan, the same BM25 engine runs *in reverse* — the orphan's own title/keyword as
the query — to suggest source articles that should link to it, **excluding any that
already do**.

### 3.4 Access

A client-side password gate (rotate via `npm run set-password`) sits on top of
Vercel's deployment authentication. See §6 on what this does and doesn't protect.

---

## 4. Key decisions & considerations

- **Baked baseline vs. upload-every-time.** We pre-build `linkdata.json` so writers
  open the tool and search instantly — no 200 MB upload per visit.
- **Streaming build.** A naïve read-whole-file approach OOM'd on the 214 MB index;
  streaming + tokenise-and-discard keeps memory flat.
- **Pre-tokenise offline + inverted index.** Does the heavy work once; per-search
  cost stays in milliseconds at 11k articles.
- **BM25 over naïve token overlap.** The first version tied every keyword match at
  the same score and was blind to plurals, so it surfaced random/tangential
  results (e.g. "hotel" → a chalet review). BM25 + stemming + IDF fixed this.
- **Percentile traffic, not raw/normalised.** The homepage (6.2M views) flattened
  every other article to ~0 under max-normalisation; percentile rank fixes it.
- **Last-modified date** drives both the freshness signal and the dedup tiebreak —
  publish dates in the export are often stale (2012 posts updated in 2019).
- **Copy URL, not a full `<a>` tag.** Using the entire headline as anchor text is
  poor SEO; writers paste the link and choose natural, contextual anchor text.
- **Two tabs, one dataset.** Linking and orphans are inverse operations on the same
  link graph — kept together but operationally distinct.
- **Tunables in the frontend.** Ranking knobs live in `App.jsx` so we can calibrate
  without regenerating the 29 MB data file.

---

## 5. What's next

### Phase 2 — Semantic search _(deferred pending stakeholder feedback)_

BM25 is **lexical** — it matches words, not meaning. It can't know `chalet ≈ hotel
≈ staycation`, or that "japan ramen" shouldn't surface a KL ramen shop. Semantic
search (vector embeddings + cosine similarity, **blended with BM25** as hybrid
search) fixes this class of miss. Estimated **1–2 days** to build and tune.

Three approaches — **production architecture is a tech-team decision:**

| Option | Summary | Trade-off |
|---|---|---|
| **A. Client-side embeddings** | Precompute vectors at build (transformers.js + MiniLM); embed queries in-browser; hybrid with BM25 | Self-contained, no backend, no per-query cost. ~30 MB one-time model download + ~4 MB vectors. **Recommended for the standalone tool.** |
| **B. API embeddings + backend** | OpenAI/Voyage/Cohere; query embedding via a serverless proxy | Highest quality; needs a backend + ongoing per-query cost. **Best fit once the WordPress plugin exists.** |
| **C. Synonym + graph (no ML)** | Curated synonym/related-term expansion + link-graph relatedness | ~half a day; domain-tunable; captures ~half the value; brittle on unanticipated terms. |

### WordPress plugin (longer term)

The productionised form: live link suggestions **inside the editor** as writers
type. Reads posts directly from the WP DB (no CSV exports), pulls GA4 via the Data
API, and computes embeddings server-side. Strategy: prove the engine in this
standalone tool first, then port.

### Smaller follow-ons
- Make **recency a ranking signal** (freshness boost / "hide older than X" filter).
- Recompute the link graph for in-browser uploads (currently build-time only).
- Device / monthly (recency-weighted) traffic views.

---

## 6. Known limitations

- **Lexical only** — no semantic understanding yet (Phase 2).
- **Link graph is build-time** — in-browser monthly uploads don't recompute it;
  newly uploaded articles read as 0-inbound until the next `npm run build-data`.
- **Data size** — `linkdata.json` is ~29 MB (gzips to ~5–6 MB; fetched once,
  edge-cached). Will grow with the catalogue.
- **Traffic metric** — current GA4 export is the "Landing page / Views" report, so
  the traffic weight is page views; the parser also accepts a Sessions export.
- **Security** — the client-side password is obfuscation, not real protection (data
  is fetchable and the hash ships in the bundle). Real protection is Vercel
  Authentication. Acceptable here because the tool is internal and will move to a
  company dev site; not suitable for genuinely sensitive public exposure.

---

## 7. Operations

- **Monthly data refresh:** drop new exports into `data/index/` + `data/ga4/`, run
  `npm run build-data`, commit the updated `public/linkdata.json`, push. (Raw CSVs
  are git-ignored; the generated JSON is the committed artifact.) Details in `DATA.md`.
- **Deploy:** push to `main` → Vercel auto-deploys. Build runs `vite build` only
  (not `build-data`) — the pre-built baseline is the deploy artifact.
- **Rotate password:** `npm run set-password "…"`, then commit + push.
