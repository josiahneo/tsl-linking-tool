# TSL Internal Linking Tool — Design Brief

_For a layout & visual redesign. Hand to a designer, Figma AI, v0, or similar._

---

## 1. What this is

An internal web tool for **The Smart Local (TSL)** — Singapore's largest
lifestyle media publisher (~11,000 articles on food, travel, things-to-do, with a
famous franchise in Johor Bahru / cross-border travel content). The tool helps
**writers and editors** improve the site's internal linking, using real Google
Analytics traffic data.

It is **not** a consumer product and not a marketing site. It's a daily-use
instrument for a small internal team. Think "newsroom tool," not "SaaS dashboard."

## 2. Who uses it

- **Writers/editors**, often mid-edit on an article, who need to quickly find
  relevant existing articles to link to — and craft the link text.
- Used repeatedly throughout the day, on **desktop/laptop** (design desktop-first;
  it should degrade gracefully to ~1024px and tablet, but mobile is not a priority).
- They are media people, not analysts — the tool should feel sharp and editorial,
  reward fast scanning, and not bury them in jargon.

## 3. The core jobs (two modes, one dataset)

The tool has **two related-but-inverse functions** over the same article dataset.
This duality is the heart of the product and the layout should make it legible:

1. **Find links** — "What should *this* article link *to*?"
   The writer enters a topic/keywords (and optionally the URL of the article
   they're editing); the tool returns the most relevant existing articles,
   ranked by relevance **and weighted by real traffic + freshness**, with tools
   to copy the link and a suggested anchor text.

2. **Orphans** — "What *isn't* being linked to, and who should link to it?"
   A list of articles with few/no inbound internal links (an SEO problem),
   prioritised by traffic. Selecting one suggests which existing articles should
   add a link to it.

> Links *out* vs. links *in* — same graph, opposite direction. ~36% of the
> catalogue (4,000+ articles) are currently orphans, so this mode matters.

## 4. What exists today (and what's wrong)

The current build works but is visually flat: a single vertical column of
white rounded cards on an off-white background — upload panel, a stats strip of
four numbers, a search input, a filter bar, then a dense results table. It reads
as a generic admin panel. **It doesn't feel like a TSL product, and the layout
doesn't help the user think.** We want a deliberate layout + identity, not a
restyle of the same stack.

## 5. Scope of this brief

- **Information architecture & layout** for the two modes (this is the priority).
- A **visual identity**: type system, colour, spacing, components, states.
- A **signature element** that makes it unmistakably this tool (see §9).
- Key screens and empty/loading/error states (see §7).

## 6. The content to lay out

Design with **real, realistic content** — TSL titles are long and listicle-heavy,
numbers are large, and dates matter. Use examples like these:

**Find-links result rows** (a ranked list; could be cards, table, or something
better) each carry:
- Rank (1, 2, 3 … — the top few matter most)
- **Article title** — often long, e.g. _"10 Best JB Hotels Near The RTS Link For 2026"_, _"56 Top-Rated Hotels In SG For Staycations"_
- URL path — e.g. `/read/best-jb-hotels-rts-link`
- A **relevance score** (0–100, relative to the best match)
- **Traffic** — page views, e.g. `100,200` views, shown as a number + a strength bar
- **Freshness** — last-updated date, e.g. _"↻ Sep 2024"_, ideally colour-cued for stale content
- Optional focus-keyword tag
- Actions: **copy URL**, and **suggest/copy anchor text** (a short editable phrase + a "copy link" that produces an `<a>` tag)

**Orphan rows** carry: title, URL, last-updated, **views**, an **inbound-link
count badge** (e.g. "0 inbound"), and a **"Link it"** action that expands to show
suggested source articles (title, URL, views, relevance, copy).

**Inputs & controls:**
- Find: a topic/keywords field + an optional article-URL field; filters for min
  score, result count, and a relevance/traffic sort toggle.
- Orphans: filters for max inbound links and minimum views.

**Shared chrome:**
- A **data-sources** area (a pre-loaded dataset, plus the ability to add monthly
  CSV uploads — each labelled).
- A **stats strip**: articles indexed, with-traffic, not-matched, total views.
- Tab/switch between **Find links** and **Orphans**.

**Scale to respect:** ~11,000 articles; result lists of 5–50 rows; the orphan
list can be hundreds. Long lists must stay fast and scannable — consider density,
sticky controls, and how the eye moves down a ranked list.

## 7. Screens & states to design

1. **Find links — empty** (data loaded, no query yet): an inviting prompt.
2. **Find links — results**: the main event. A query in, a ranked list out.
3. **Find links — anchor-text in progress**: the expanded "write the link" moment.
4. **Orphans — list** with filters.
5. **Orphans — row expanded** showing "link from" suggestions.
6. **Stats / data-sources** chrome.
7. **First-run / no data** and **loading** states.
8. **Password gate** (a single password screen; minor, but should match identity).

## 8. Brand & art direction

- **TSL brand red `#E8212B` is mandatory** and should feel owned, not decorative.
- TSL's editorial DNA: confident typography, Singaporean lifestyle energy, its
  Johor Bahru / cross-border travel moat. Draw distinctiveness from *that world* —
  not from generic dashboard conventions.
- **Avoid the templated defaults**: the cream-background + high-contrast-serif +
  terracotta look; the near-black + acid-accent look; the hairline-rule broadsheet
  look. These show up regardless of subject — we want a choice made for *this* tool.
- Pick a deliberate **type pairing** (a characterful display used with restraint +
  a clean workhorse for data/UI). Typography should carry the personality.
- **Signature element**: propose one memorable device that embodies the product —
  e.g. the link/relationship between articles, the "signal strength" of relevance
  vs. traffic, or the orphan-vs-hub contrast. One strong idea, executed well;
  keep everything around it quiet.

_Three optional starting directions (the designer may use, combine, or ignore):_
- **Newsroom** — editorial CMS feel; serif display; red as the editor's pen.
- **Signal** — analytical instrument; technical grotesk; relevance/traffic as signal.
- **Local** — warm, friendly, rounded; brings TSL's consumer warmth inside.

## 9. Interaction & functional requirements

- **Fast scanning** of ranked lists is the #1 UX goal — the top 3 results deserve
  visual weight; the writer should grasp "relevant + popular + fresh" at a glance.
- **Copy actions** are core (copy URL; copy a ready `<a>` link with chosen anchor
  text) — make them effortless and give clear "copied" feedback.
- **Expandable rows** (anchor-text panel; orphan "link from" suggestions).
- **Tab switching** between the two modes should feel like one coherent tool.
- Keyboard-friendly; visible focus; respects reduced-motion; accessible contrast.

## 10. Technical constraints (so the design is buildable)

- Built as a **single-page React app**, currently styled with inline styles (open
  to a small CSS/token layer). No backend; everything runs client-side.
- Deliverables should be **implementable in HTML/CSS/React** — favour real layout
  techniques (grid/flex, sticky headers, virtualised long lists) over effects that
  won't translate. No heavy imagery dependency (it's a data tool).
- Custom web fonts are fine (Google Fonts acceptable).

## 11. Deliverables requested

- **Hi-fi layouts** for the screens in §7 (desktop-first; note tablet behaviour).
- A lightweight **style spec**: type scale, colour roles, spacing system, and the
  key component states (default/hover/active/selected/empty).
- The **signature element** clearly shown in context.
- A **clickable prototype** of the Find-links → results → copy flow if possible.

## 12. Success criteria

- A writer can go from "I'm editing an article about X" to a copied, well-anchored
  internal link in seconds, with minimal scanning effort.
- The orphan workflow makes high-traffic, under-linked articles obvious and
  actionable.
- It looks and feels like a **TSL** product an editor would be glad to use daily —
  distinctive, not templated.
