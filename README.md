# KickTires

KickTires is a buyer-side used-car analyzer for the US market. A visitor pastes a
listing URL or its text. The server identifies the exact vehicle, loads reviewed
KickTires data when available, otherwise retrieves current NHTSA complaint and
recall records plus EPA fuel-economy data, checks comparable active listings when
MarketCheck is configured, and produces a buyer-side transaction verdict.

The language model does not retrieve or invent federal counts. The function
retrieves the evidence first and supplies it as fixed input.

## Architecture

- `build.mjs` generates the static site in `dist/` from editorial and federal snapshot data.
- `data.json` preserves the original editorially reviewed profiles.
- `models.json` defines the 41-page publication cohort.
- `generated.json` contains committed NHTSA/EPA snapshots produced by the sync script.
- `scripts/sync-model-pages.mjs` retrieves federal records and refuses incomplete pages.
- `netlify/functions/analyze.mjs` handles listing extraction and live analysis.
- Netlify Blobs stores derived analyses for 30 days and vehicle evidence for 7 days.
- Pasted listing text is not stored in the cache.

The live request flow is:

1. Fetch a public listing URL safely, or use pasted listing text.
2. Extract year, make, model, price, mileage and seller disclosures.
3. Match a precomputed model-year evidence profile when one exists.
4. Retrieve mileage-matched active dealer or private-party comparison statistics.
5. If the vehicle is not reviewed, retrieve NHTSA and EPA records.
6. Generate an ownership-risk analysis, then apply the market verdict in server code.
7. Calculate a five-year estimate from the actual asking price when enough data exists.

The model never invents a market value. Market medians, percentiles and sample counts
come from the configured listing-data API. Without that API—or without asking price
and mileage—the UI explicitly returns an ownership-risk screen instead of a deal grade.

## Local checks

```sh
npm install
npm test
npm run build
npx netlify-cli build --offline
```

To refresh all 41 federal snapshots:

```sh
npm run sync:models
```

The sync command first resolves the model through NHTSA's year/make/model catalog. It
queries every approved body-style label, deduplicates complaints by ODI number, and records
the resolved labels in the snapshot. Distinct derivatives such as F-150 Lightning are not
rolled into the base model. Complaint lookup is tri-state (`resolved`, `none`, or
`unresolved`); an unresolved target is rejected instead of being rendered as zero. The
publication gate also rejects missing EPA/TCO evidence, mismatched totals, missing
provenance, and unverified owner-forum evidence. The build repeats the structural checks
and rejects duplicate titles, slugs, and search queries.

## Netlify deployment

The repository is connected to Netlify. `netlify.toml` runs `node build.mjs`,
publishes `dist/`, bundles the analysis function, and applies a per-IP rate limit.

Set these environment variables in Netlify:

| Key | Required | Purpose |
|---|---:|---|
| `PROVIDER` | yes | `deepseek` or `claude`; production normally uses `deepseek` |
| `DEEPSEEK_API_KEY` | for DeepSeek | Server-side API key |
| `DEEPSEEK_MODEL` | recommended | The production DeepSeek V4 model alias |
| `ANTHROPIC_API_KEY` | for Claude | Optional alternate provider key |
| `ANTHROPIC_MODEL` | optional | Alternate Claude model |
| `MARKETCHECK_API_KEY` | for deal grading | Server-side key for live dealer and private-party comparable listings |
| `GA_MEASUREMENT_ID` | optional | Overrides the production GA4 ID (`G-5NSV1Y7TSJ`) |
| `ADSENSE_CLIENT` | optional | Overrides the production AdSense client (`ca-pub-3682195653529318`) |

Never place keys in `build.mjs`, `style.css`, `data.json`, or `dist/`.

The build emits the AdSense Auto Ads loader and a root `ads.txt` entry. Auto Ads must
also be enabled for the site in AdSense; no manual ad-slot IDs are emitted.

## Adding a model-year page

Add a model and its selected years to `models.json`, run `npm run sync:models`, inspect
the resulting evidence, then run the checks above. NHTSA vehicle names must match the
federal API. A precomputed page is a trusted cache, not a gate: unlisted models still use
the live NHTSA path.

Before changing domains, update `SITE` in `build.mjs`; it controls canonical URLs,
Open Graph URLs, `robots.txt`, and `sitemap.xml`.
