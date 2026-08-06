# WhyThisPrice — static site

Every page is generated from `data.json`. No framework, no runtime, no database.

## Deploy to Netlify

**Fastest (no git):**
1. `node build.mjs`
2. Drag the `dist/` folder onto https://app.netlify.com/drop

**Proper (auto-rebuild on push):**
1. Push this folder to a GitHub repo
2. Netlify → Add new site → Import from Git → pick the repo
3. Netlify reads `netlify.toml`, so build command and publish dir are already set

## Before you deploy

Open `build.mjs` and change `SITE` to your real domain. It feeds canonical
tags, Open Graph URLs and `sitemap.xml`, and Google will treat those as
wrong if the domain doesn't match.

## After you deploy

1. Google Search Console → add property → verify by DNS
2. Submit `https://yourdomain/sitemap.xml`
3. Bing Webmaster Tools → import from Search Console (one click)
4. Expect nothing for 2–6 weeks. New domains sit in a sandbox.

## Adding a model

Append to `data.json` following the existing shape, then rebuild.
Required: `meta.slug`, `meta.title`, `meta.desc`, `meta.nhtsa`.

Pull the complaint and recall counts from:
- `https://api.nhtsa.gov/complaints/complaintsByVehicle?make=X&model=Y&modelYear=Z`
- `https://api.nhtsa.gov/recalls/recallsByVehicle?make=X&model=Y&modelYear=Z`

Model names must match NHTSA's exactly — `f-150` works, `f150` returns a 400.

## API keys — where they actually go

The site itself uses no AI. It is static HTML. Keys are needed in two places,
and **neither of them is the browser**:

### 1. Runtime — parsing a pasted listing
`netlify/functions/analyze.mjs` runs on Netlify's servers, not in the visitor's
browser. Set the key in **Netlify → Site configuration → Environment variables**:

| Key | Value |
|---|---|
| `PROVIDER` | `deepseek` |
| `DEEPSEEK_API_KEY` | your key |
| `DEEPSEEK_MODEL` | the V4 alias you want (Flash for this job) |

Then redeploy. Until you do, the paste box still works — it falls back to
matching against models already on the site.

**Never** put a key in `build.mjs`, in `style.css`, or anywhere under `dist/`.
Anything in `dist/` is public. View-source reveals it and bots scrape leaked
keys within hours.

### 2. Build time — writing new model pages
That script runs on your laptop, not on Netlify. Copy `.env.example` to `.env`,
put the key there, and make sure `.env` is in `.gitignore`.

Use the cheaper model for parsing and the better model for writing pages —
and use a *different provider* to verify what was written. Checking a model's
output with the same model does not catch its own blind spots.
