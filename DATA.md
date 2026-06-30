# Data workflow

The app loads a pre-built, pre-tokenised baseline from `public/linkdata.json` on
startup — so writers never have to upload anything. You maintain that baseline by
dropping monthly CSV exports into `data/` and running one command.

## Folder layout

```
data/
  index/    article-index CSVs  (title, url [, keyword, category, content])
  ga4/      GA4 "Pages and screens" CSVs — one file per month
```

File names should contain the month, e.g. `index-2026-03.csv`, `ga4-2026-03.csv`,
or `GA4 March 2026.csv`. The month is parsed from the filename for labelling.

## Adding a new month

1. Export the article index from WordPress (new + refreshed articles is fine — a
   full export also works). Save it into `data/index/`.
2. Export that month's GA4 Pages-and-screens report into `data/ga4/`.
3. Run:

   ```
   npm run build-data
   ```

4. Commit the updated `public/linkdata.json` (and the new CSVs) and redeploy.

### Merge rules

- **Article index** — deduped by normalised URL. Later files win, so a refreshed
  article overwrites the older row. Post `content` is tokenised for contextual
  matching but **not** shipped raw in the JSON (keeps it small).
- **GA4** — sessions are **summed per URL across every month**, giving a cumulative
  traffic figure. Don't re-add a month that's already baked in (it would
  double-count).

## Ad-hoc / in-browser uploads

The "Add data" zones in the app let anyone load a month on the fly without a
rebuild. These uploads are **session-only** (lost on refresh) and are labelled
automatically from the filename (editable in the UI). GA4 uploads add to the
running totals; index uploads upsert articles. To make an uploaded month permanent
for everyone, drop the same CSVs into `data/` and re-run `npm run build-data`.

## How matching works

`tokenise()` in `src/App.jsx` and `scripts/shared.mjs` are kept identical so baked
and uploaded data score the same way. Each article carries two token sets:
`tt` (title + keyword + category) and `ct` (body content, capped at 250 unique
tokens). At load the app builds inverted indexes (`token → article`) from both, so
a query only scores the handful of articles that share a term — not all ~11,000.

**Score** = 70% topical relevance + 30% normalised traffic weight, where a query
term hitting the title/keyword counts fully and a body-content hit counts 0.35×.
