# How the TSL Internal Linking Tool Ranks Suggestions

A plain-English explanation of the ranking logic, written so anyone on the team can
understand — and question — why an article appears (or doesn't) in the results.

## The one-paragraph version

You type a topic. The tool finds every article that shares meaningful words with it,
scores each one with **BM25** (the same relevance formula used by Elasticsearch and
most search engines), requires the topic to appear in the article's **title or focus
keyword** (a body-only mention is a passing reference, not a related article), and
then gently favours higher-traffic articles among equally relevant ones. Sorting by
traffic never abandons relevance — articles matching more of your query terms always
rank above articles matching fewer, and traffic orders them within those tiers.

## Step by step

### 1. Words are normalised ("tokenised")

Both your query and every article go through the same pipeline:

- Lowercase, strip HTML and punctuation.
- Drop **stopwords** — words too common to carry meaning ("the", "and", "for", plus
  HTML leftovers like "nbsp", "href").
- **Stem** each word with the Porter stemmer, so inflections match:
  "fireworks" → "firework", "hotels" → "hotel", "dining" → "dine".

So the query **"NDP Fireworks"** becomes two stems: `ndp`, `firework` — and matches
articles that say "firework", "fireworks", or "NDP" in any form.

### 2. Each article is a weighted bag of words

For every article we count how often each stem appears, with one deliberate bias:
**title and focus-keyword words count 3× more than body words** (`TITLE_BOOST`).
An article *titled* "NDP 2025 Fireworks" is about NDP fireworks; an article that
mentions fireworks once in paragraph 12 is not. Body text is capped at its top 200
terms so gigantic listicles don't drown out short articles.

### 3. BM25 scores relevance

For each query stem, every article containing it earns points based on three factors:

| Factor | Intuition |
|---|---|
| **Rarity (IDF)** | Rare words matter more. "ndp" appearing in ~180 of 11,000 articles is highly distinguishing; a word appearing in half the site is nearly worthless. |
| **Frequency (TF, saturating)** | Saying "firework" 8 times beats saying it once — but the 20th mention adds almost nothing (`BM25_K1` controls this). Keyword stuffing can't win. |
| **Length normalisation** | A mention in a short article means more than the same mention buried in a 5,000-word one (`BM25_B`). |

The article's score is the **sum over all query stems it contains** — so matching
both "ndp" *and* "firework" naturally scores far above matching just one.

### 4. Eligibility gate: the topic must be in the title or focus keyword

BM25 alone still gives a small score to any article with a passing mention. So a
suggestion must match **at least one query term in its title or focus keyword**
(`MIN_TITLE_HITS`). This is what removes "Shopping In JB: 10 Things You Cannot Bring
Back To SG" from an "NDP fireworks" search — it mentions NDP/fireworks in the body,
but it isn't *about* them.

If literally no article passes the gate (an unusual query), the tool fails open and
shows ungated results rather than a dead end.

The **match chips** on each result show this transparently: each query word appears
as a chip — green with a ✓ if it matched the title/keyword, grey if body-only,
struck through if unmatched.

### 5. Traffic is a gentle nudge, never a veto override

Each article gets a **traffic weight** = the fraction of articles it out-performs by
sessions (a percentile, so the 6M-view homepage can't distort the scale). The final
score is:

```
final = BM25 × (1 + 0.3 × trafficWeight)
```

At most a **+30% lift** (`TRAFFIC_ALPHA`) — enough to break ties between two equally
relevant articles in favour of the stronger one, never enough to lift a weak topical
match over a strong one.

### 6. The two sort modes

- **Relevance** — ordered by the final score above. Best topical matches first;
  tangentially related ones (NDP-only or fireworks-only) rank below naturally,
  because they only earn one term's worth of BM25 points.
- **Traffic** — tiered by **query coverage**: articles matching more of your query
  terms always rank above articles matching fewer; sessions order them within each
  tier. So "NDP fireworks" sorted by traffic = *the highest-traffic articles matching
  both terms*, followed by the highest-traffic NDP-only / fireworks-only articles.

### 7. The score pill and Min score slider

The displayed score is **relative to the best match in this search** (top result =
100). The *Min score* slider filters on that relative score — it trims the weak tail,
it does not compare across different searches.

## Worked example: "NDP Fireworks" (real data)

| | Before | After |
|---|---|---|
| Traffic sort #1 | Shopping In JB (215k sessions, body mention only) | NDP 2025 Fireworks: 16 Best Free Spots (46k) |
| Traffic sort #2 | Courier & Delivery Services (57k, body mention) | NDP Vouchers 2024 (30k) |
| Traffic sort #3 | Free Ice Cream This National Day (52k, body mention) | Complete Guide To NDP 2024 (29k) |
| Candidate pool | 165 articles (any shared word ≥20% of top score) | 58 articles (title/keyword match required) |

Relevance sort was already good and is unchanged at the top.

## Slug renames, refreshed articles & duplicates

Articles are deduplicated by **WordPress post ID** (the `ID` column in the export),
not by URL. The post ID never changes, even when the slug, headline, and content
are all rewritten for a new year — so `fireworks-2025` renamed to `fireworks-2026`
**replaces** the old entry rather than appearing twice. The row with the newest
*post modified date* always wins, regardless of which export file it came from.

The old URL isn't discarded — it's kept as an **alias**, which matters twice:

- **GA4 traffic**: months of sessions recorded against `/fireworks-2025/` still
  count toward the renamed article's traffic, so it doesn't look like a
  zero-traffic newcomer.
- **Link graph**: articles that still link to the old slug (via the 301 redirect)
  are counted as inbound links, so the renamed article isn't a false orphan.

Only rows with status **publish** are indexed. Drafts, pending, and private posts
are skipped (their export permalinks are `?p=<id>` placeholders), so test posts
and unpublished refreshes can never appear as suggestions.

If two entries for the same article ever do show up, it means the export rows had
different post IDs (e.g. the article was deleted and re-created as a new post).
The fix is data-side: remove the dead row from the export, or re-run
`npm run build-data` with a fresh full export.

## The Orphans tab — deliberately different

The Orphans tab answers the inverse question: *which articles does nobody link to,
and who should link to them?* It uses the same BM25 engine, but **without** the
title gate — because when you're looking for a page to insert a link *from*, an
article that mentions the orphan's topic in its body is exactly the right place to
add that link.

## Tunables (in `src/App.jsx`, no rebuild of data needed)

| Constant | Value | What it controls |
|---|---|---|
| `TITLE_BOOST` | 3.0 | How much more title/keyword words count than body words |
| `BM25_K1` | 1.5 | How quickly repeated mentions stop adding score |
| `BM25_B` | 0.6 | How much long articles are penalised |
| `TRAFFIC_ALPHA` | 0.3 | Max relevance lift from traffic (30%) |
| `MIN_TITLE_HITS` | 1 | Query terms required in title/keyword to be eligible |
| `CONTENT_TOKEN_CAP` | 200 | Top-N body terms kept per article |

## FAQ

**Why does an article I expected not show up?**
Check the match chips on nearby results. Most likely the topic word isn't in its
title or focus keyword, or the article isn't in the current index export.

**Why does a 2024 article outrank a 2025 one?**
Freshness isn't a ranking factor (the ↻ date is shown so writers can judge).
Relevance and traffic are the only signals.

**Can an article rank just because it's popular?**
No. Popularity can add at most 30% on top of relevance, and traffic sort only
re-orders within relevance tiers.

**Does the tool understand synonyms?**
No — it's lexical, not semantic. "NYE fireworks" won't match an article that only
says "New Year's Eve". Add the synonym to your query ("NYE new year fireworks").

**Are uploaded CSVs scored differently from the baked-in data?**
No. The tokeniser/stemmer in the browser is kept identical to the build script
(`scripts/shared.mjs`), so both are scored the same way.
