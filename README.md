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

Production builds publish research pages from committed snapshots only. A target without
enough stored evidence remains `noindex` and is omitted from the public model directory and
sitemap; the build never turns a transient live lookup into an indexable page. For a local
diagnostic build only, `ALLOW_LIVE_RESEARCH_BUILD=true npm run build` enables the old live
fallback. Commit reviewed snapshots with `npm run sync:models` before publishing them.
Production builds also skip live Wikipedia photo downloads and use repository assets or a
branded fallback. `ALLOW_LIVE_PHOTO_BUILD=true npm run build` is available only for a
curation run; review any downloaded image and its attribution before retaining it.

## Netlify deployment

The repository is connected to Netlify. `netlify.toml` runs `npm run build`,
publishes `dist/`, bundles the analysis function, and applies a per-IP rate limit.

Set these environment variables in Netlify:

| Key | Required | Purpose |
|---|---:|---|
| `PROVIDER` | optional | `openai`, `deepseek` or `claude`. When unset, the provider is inferred from whichever key below is set |
| `OPENAI_API_KEY` | for OpenAI | Server-side API key |
| `OPENAI_MODEL` | optional | Defaults to `gpt-4o-mini`. Reasoning models (`o*`, `gpt-5*`) are sent `max_completion_tokens` and no `temperature` |
| `DEEPSEEK_API_KEY` | for DeepSeek | Server-side API key |
| `DEEPSEEK_MODEL` | recommended | The production DeepSeek V4 model alias |
| `ANTHROPIC_API_KEY` | for Claude | Optional alternate provider key |
| `ANTHROPIC_MODEL` | optional | Alternate Claude model |
| `MARKETCHECK_API_KEY` | for deal grading | Server-side key for live dealer and private-party comparable listings |
| `GA_MEASUREMENT_ID` | optional | Overrides the production GA4 ID (`G-5NSV1Y7TSJ`) |
| `ADSENSE_CLIENT` | optional | Overrides the production AdSense client (`ca-pub-3682195653529318`) |

Never place keys in `build.mjs`, `style.css`, `data.json`, or `dist/`.

The build emits the AdSense ownership meta and a root `ads.txt` entry on the site. The
AdSense loader and one manual display unit are limited to published long-form blog articles;
the analyzer, directories, policy pages, methodology/author pages and drafts carry no ad
inventory. Set `ADSENSE_SLOT` to the approved display-unit slot. Keep site-wide Auto Ads off,
or exclude every non-article URL in AdSense, so an interactive or low-content screen cannot
receive an automatic placement.

## Adding a model-year page

Add a model and its selected years to `models.json`, run `npm run sync:models`, inspect
the resulting evidence, then run the checks above. NHTSA vehicle names must match the
federal API. A precomputed page is a trusted cache, not a gate: unlisted models still use
the live NHTSA path.

Before changing domains, update `SITE` in `build.mjs`; it controls canonical URLs,
Open Graph URLs, `robots.txt`, and `sitemap.xml`.

## Automated blog

`/blog` is generated by a pipeline that runs unattended in GitHub Actions. Each run picks a
subject, pulls that vehicle's federal record, drafts an article from it, checks the result
twice, and publishes only what passes. Nothing reaches `blog/posts/` that failed a check.

### Pipeline

| stage | file | what stops the run |
|---|---|---|
| keyword | `scripts/blog/keywords.mjs` | every candidate already published |
| evidence | `scripts/blog/evidence.mjs` | NHTSA unreachable, or the model has no catalog entry |
| image | `scripts/blog/images.mjs` | never — falls back to a chart built from the record |
| draft | `scripts/blog/write.mjs` | reply fails the output schema twice |
| review | `scripts/blog/review.mjs` | any code check, or the editorial review |
| publish | `scripts/blog/generate.mjs` | — |
| render | `blog-build.mjs` | runs in the normal build chain |

The review stage is two independent gates. Code recomputes every figure in the prose from the
stored snapshot and rejects anything it cannot find there, along with unknown source ids,
complaints described as confirmed defects, claimed first-hand experience, keyword stuffing,
duplicate subjects, near-duplicate bodies, missing images and missing licences. A separate
model pass then reads the draft cold — different prompt, no sight of the writer's
instructions — looking for unsupported claims, alarmist framing, padding and conclusions the
body does not support. A draft is rewritten at most twice; after that the run is logged with
the keyword that produced it and abandoned. Failures are never published in part.

Drafts and failed articles render with `noindex` and stay out of the sitemap and RSS feed, so
a failure can be inspected without being discoverable.

### Commands

```bash
npm run blog:dry-run    # whole pipeline, writes nothing
npm run blog:generate   # generate and publish
npm run blog:validate   # re-check every post on disk against its stored snapshot
npm run blog:build      # render /blog into dist (also part of npm run build)
```

`npm run blog:generate` publishes. Set `BLOG_AUTO_PUBLISH=false` to run the whole pipeline
and report without writing anything — the same thing `npm run blog:dry-run` does for one run.
What keeps a bad post out is the review gates, not that switch: every stated figure is checked
against the stored snapshot, and a draft that fails twice is logged and abandoned.

### Environment

| variable | where | purpose |
|---|---|---|
| `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Actions **secret** | Drafting and review. Same keys the analyzer uses; whichever is set is used. |
| `PROVIDER` | Actions variable | Optional override — `openai`, `deepseek` or `claude`. Inferred from the key when unset. |
| `DEEPSEEK_MODEL` / `OPENAI_MODEL` / `ANTHROPIC_MODEL` | Actions variable | Optional model override. |
| `BLOG_AUTO_PUBLISH` | Actions variable | Kill switch. Unset means publish; `false` runs the pipeline and reports without writing. |
| `BLOG_POSTS_PER_RUN` | Actions variable | Posts per run, default `1`, capped at 5. |
| `GA_MEASUREMENT_ID`, `ADSENSE_CLIENT` | Actions variable | Passed to the build, same as Netlify. |

No keyword or image API is required. Without a keyword API the pipeline reports
`opportunity: "estimated_only_no_keyword_api"` and ranks on what it can measure — depth of
federal record, purchase proximity of the intent, and whether the vehicle is already
covered. It does not invent search volumes. Without an image API it uses Openverse, which
needs no key, and falls back to its own chart.

Secrets are never committed and never reach the client; generation happens in Actions, not
in the browser or a Netlify function.

### Schedule

`.github/workflows/generate-blog.yml` runs Mon/Wed/Fri at 13:10 UTC and can be run by hand
from the Actions tab, with a `dry_run` checkbox. Runs are serialised with a concurrency
group so two cannot race on the ledger.

The workflow runs the full test suite *before* generating, then validates every post and runs
the production build after. It commits only if all of that passes; the commit to `main`
triggers the existing Netlify deploy. Nothing about the Netlify setup changes.

### Where to look when a run fails

1. **Actions run log** — the stage that stopped is printed with its reason.
2. **`blog-run-<id>` artifact** — the full run report, including the keyword tried and every
   review failure.
3. **`blog/runs/*.json`** — the same report, committed on runs that published.

Common outcomes and what they mean:

| status | meaning |
|---|---|
| `published` | committed; Netlify deploys it |
| `review_failed` | drafted three times, never passed; nothing written |
| `permanent_failure` | missing or invalid API key, or no unpublished keyword left |
| `failed` | NHTSA unreachable, or the model could not be matched to a catalog entry |

### Content store

Posts are JSON in `blog/posts/<slug>.json`, one file per article, with the evidence snapshot
they were written from in `blog/evidence/` and their images in `blog/images/`. `blog/ledger.json`
records published slugs and primary keywords, and is what stops the same subject being
published twice under a different filename.
