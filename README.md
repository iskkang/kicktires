# KickTires

KickTires is a buyer-side used-car analyzer for the US market. A visitor pastes a
listing URL or its text. The server identifies the exact vehicle, loads reviewed
KickTires data when available, otherwise retrieves current NHTSA complaint and
recall records plus EPA fuel-economy data, checks comparable active listings when
MarketCheck is configured, and produces a buyer-side transaction verdict.

The language model does not retrieve or invent federal counts. The function
retrieves the evidence first and supplies it as fixed input.

## Architecture

- `build.mjs` generates the static site in `dist/` from `data.json`.
- `data.json` contains reviewed model profiles used by SEO pages and live analysis.
- `netlify/functions/analyze.mjs` handles listing extraction and live analysis.
- Netlify Blobs stores derived analyses for 30 days and vehicle evidence for 7 days.
- Pasted listing text is not stored in the cache.

The live request flow is:

1. Fetch a public listing URL safely, or use pasted listing text.
2. Extract year, make, model, price, mileage and seller disclosures.
3. Match the reviewed database.
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

## Adding a reviewed model

Add an entry to `data.json` with `meta`, risks, inspection items and reviewed cost
inputs, then run the checks above. NHTSA vehicle model names must match the federal
API. A reviewed page is a trusted cache, not a gate: unreviewed models still use the
live NHTSA path.

Before changing domains, update `SITE` in `build.mjs`; it controls canonical URLs,
Open Graph URLs, `robots.txt`, and `sitemap.xml`.
