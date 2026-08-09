// Renders the blog into dist/ as static HTML. Runs inside the existing build chain, after
// build.mjs has produced the sitemap this appends to.
//
// Everything a search engine needs — body copy, metadata, JSON-LD — is in the served HTML.
// No client-side fetch is involved, which is the mistake that left the research pages with
// no images at all when a third-party API stopped answering.

import fs from "node:fs";
import path from "node:path";
import { readPosts, IMAGES_DIR } from "./scripts/blog/schema.mjs";

const OUT = process.env.KICKTIRES_OUT || "dist";
const SITE = "https://kicktires.netlify.app";
const NAME = "KickTires";
const AUTHOR = "KickTires Editorial";
const AUTHOR_PATH = "/author/kicktires-editorial/";
const GA = process.env.GA_MEASUREMENT_ID || "G-5NSV1Y7TSJ";
const ADSENSE = process.env.ADSENSE_CLIENT || "ca-pub-3682195653529318";

const esc = value => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const day = value => String(value || "").slice(0, 10);
const readable = value => new Date(value).toLocaleDateString("en-US",
  { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

const CSS = `
.bl-wrap{width:min(100%,860px);margin:0 auto;padding:32px 20px 64px}
.bl-list{width:min(100%,1080px)}
.bl-crumb{font-size:12px;color:#6b7f93;margin-bottom:18px}
.bl-crumb a{color:#1767dd;text-decoration:none}
.bl-h1{font-size:clamp(28px,4vw,42px);line-height:1.12;letter-spacing:-.03em;margin:0 0 14px}
.bl-meta{display:flex;flex-wrap:wrap;gap:10px;align-items:center;font-size:12px;color:#6b7f93;margin-bottom:22px}
.bl-meta a{color:#1767dd;text-decoration:none}
.bl-hero{margin:0 0 8px;border:1px solid #dce5ef;border-radius:14px;overflow:hidden;background:#f4f7fa}
.bl-hero img{display:block;width:100%;height:auto}
.bl-credit{font-size:11px;color:#7a8b9c;margin:0 0 28px}
.bl-credit a{color:#1767dd}
.bl-lede{font-size:18px;line-height:1.55;color:#22364b;margin:0 0 26px}
.bl-body h2{font-size:23px;letter-spacing:-.02em;margin:34px 0 12px}
.bl-body p{font-size:16px;line-height:1.68;color:#28394c;margin:0 0 14px}
.bl-body ul{margin:0 0 16px;padding-left:20px}
.bl-body li{font-size:15px;line-height:1.6;color:#28394c;margin-bottom:7px}
.bl-src{font-size:11px;color:#8497a8;margin:-6px 0 18px}
.bl-cta{margin:36px 0;padding:22px;border:1px solid #cfe0f5;border-radius:14px;background:linear-gradient(140deg,#f4f9ff,#eaf2fd)}
.bl-cta h3{margin:0 0 6px;font-size:19px}
.bl-cta p{margin:0 0 14px;font-size:14px;color:#3b5068}
.bl-cta a{display:inline-block;background:#1767dd;color:#fff;text-decoration:none;font-weight:800;font-size:13px;padding:11px 18px;border-radius:8px}
.bl-sources{margin:34px 0;padding:18px;border:1px solid #e3e9f1;border-radius:12px;background:#fbfcfe}
.bl-sources h2{margin:0 0 10px;font-size:16px}
.bl-sources ol{margin:0;padding-left:18px}
.bl-sources li{font-size:12px;line-height:1.6;color:#5c7085;margin-bottom:6px;word-break:break-word}
.bl-sources a{color:#1767dd}
.bl-related{margin-top:34px}
.bl-related h2{font-size:18px;margin:0 0 12px}
.bl-related a{display:block;padding:12px 14px;border:1px solid #e3e9f1;border-radius:10px;margin-bottom:8px;color:#17324f;text-decoration:none;font-weight:600;font-size:14px}
.bl-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
.bl-card{display:block;border:1px solid #e3e9f1;border-radius:14px;overflow:hidden;text-decoration:none;color:inherit;background:#fff}
.bl-card img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#eef3f8}
.bl-card-in{padding:14px 16px 18px}
.bl-card-in span{font-size:10px;text-transform:uppercase;letter-spacing:.09em;color:#7d90a4;font-weight:800}
.bl-card-in h2{font-size:17px;line-height:1.3;margin:6px 0 7px;letter-spacing:-.01em}
.bl-card-in p{font-size:13px;line-height:1.5;color:#5c7085;margin:0}
.bl-empty{padding:40px;border:1px dashed #cfd9e4;border-radius:14px;text-align:center;color:#6b7f93}
`;

function head({ title, description, url, jsonld = [], image, noindex = false, modified }) {
  const blocks = (Array.isArray(jsonld) ? jsonld : [jsonld]).filter(Boolean)
    .map(node => `<script type="application/ld+json">${JSON.stringify(node).replace(/</g, "\\u003c")}</script>`)
    .join("");
  const absolute = image ? (image.startsWith("http") ? image : SITE + image) : "";
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
${noindex ? '<meta name="robots" content="noindex,nofollow">' : ""}
<meta property="og:type" content="article"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="${NAME}">
${absolute ? `<meta property="og:image" content="${esc(absolute)}">` : ""}
${modified ? `<meta property="article:modified_time" content="${esc(modified)}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}">
${absolute ? `<meta name="twitter:image" content="${esc(absolute)}">` : ""}
<meta name="google-adsense-account" content="${ADSENSE}">
<link rel="alternate" type="application/rss+xml" title="${NAME} blog" href="${SITE}/blog/rss.xml">
<link rel="stylesheet" href="/style.css">
<style>${CSS}</style>
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config","${GA}");</script>
${blocks}
</head><body>
<nav><div class="navin"><a class="logo" href="/"><i></i>${NAME}</a>
<div class="navlinks"><a class="navlink navcheck" href="/#check">Check a listing</a>
<a class="navlink" href="/cars/">Model guides</a><a class="navlink" href="/blog/">Blog</a></div>
</div></nav>`;
}

const foot = `<footer class="site"><div class="shell">
<p>Sources: NHTSA recall and consumer complaint records · EPA fuel economy data.</p>
<p class="fine"><b>Consumer complaints are allegations, not confirmed defects.</b> Raw complaint totals are screening signals, not failure rates, and cannot be compared across models without sales-volume data. Always run the VIN and get an independent pre-purchase inspection.</p>
<p class="fine"><a href="/methodology/">Methodology</a> · <a href="${AUTHOR_PATH}">Editorial team</a> · <a href="/privacy/">Privacy</a> · <a href="/about/">About</a></p>
</div></footer></body></html>`;

const cta = `<div class="bl-cta"><h3>Checking a specific car?</h3>
<p>Paste the listing and KickTires compares the asking price with comparable active listings, then screens the federal record for that model year.</p>
<a href="/#check">Analyze a listing →</a></div>`;

function sectionHtml(section, sourceById) {
  const paragraphs = (section.paragraphs || []).map(text => `<p>${esc(text)}</p>`).join("");
  const bullets = (section.bullets || []).length
    ? `<ul>${section.bullets.map(item => `<li>${esc(item)}</li>`).join("")}</ul>` : "";
  const cited = (section.sourceIds || []).map(id => sourceById.get(id)).filter(Boolean);
  const note = cited.length
    ? `<p class="bl-src">Source: ${cited.map(source => `<a href="${esc(source.url)}" rel="nofollow noopener">${esc(source.note || source.id)}</a>`).join(" · ")}</p>`
    : "";
  return `<h2>${esc(section.heading)}</h2>${paragraphs}${bullets}${note}`;
}

function postPage(post) {
  const url = `${SITE}/blog/${post.slug}/`;
  const sourceById = new Map((post.sources || []).map(source => [source.id, source]));
  const hero = post.heroImage;
  const isDraft = post.status !== "published";

  const jsonld = [
    {
      "@context": "https://schema.org", "@type": "BlogPosting",
      headline: post.title, description: post.description,
      datePublished: post.datePublished, dateModified: post.dateModified,
      author: { "@type": "Organization", name: post.author, url: SITE + AUTHOR_PATH },
      publisher: { "@type": "Organization", name: NAME, url: SITE },
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      image: SITE + (hero.ogSrc || hero.src),
      keywords: [post.primaryKeyword, ...(post.secondaryKeywords || [])].join(", "),
      isAccessibleForFree: true,
      citation: (post.sources || []).map(source => ({
        "@type": "CreativeWork", name: source.note || source.id, url: source.url
      }))
    },
    {
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Research", item: `${SITE}/blog/` },
        { "@type": "ListItem", position: 3, name: post.title, item: url }
      ]
    }
  ];

  const credit = [
    esc(post.imageCredit),
    post.imageLicense ? esc(post.imageLicense) : "",
    post.imageSourceUrl ? `<a href="${esc(post.imageSourceUrl)}" rel="nofollow noopener">source</a>` : ""
  ].filter(Boolean).join(" · ");

  const sources = (post.sources || []).map(source =>
    `<li>${esc(source.note || source.id)} — <a href="${esc(source.url)}" rel="nofollow noopener">${esc(source.url)}</a> (retrieved ${esc(day(source.retrievedAt))})</li>`).join("");

  const related = (post.relatedArticles || []).map(item =>
    `<a href="${esc(item.href)}">${esc(item.title)}</a>`).join("");

  return head({
    title: `${post.title} | ${NAME}`, description: post.description, url,
    jsonld, image: hero.ogSrc || hero.src, noindex: isDraft, modified: post.dateModified
  }) + `
<main class="bl-wrap">
<div class="bl-crumb"><a href="/">Home</a> › <a href="/blog/">Research</a> › ${esc(post.year)} ${esc(post.make)} ${esc(post.model)}</div>
<h1 class="bl-h1">${esc(post.title)}</h1>
<div class="bl-meta">
  <span>By <a href="${AUTHOR_PATH}">${esc(post.author)}</a></span>
  <span>Published <time datetime="${esc(post.datePublished)}">${esc(readable(post.datePublished))}</time></span>
  <span>Updated <time datetime="${esc(post.dateModified)}">${esc(readable(post.dateModified))}</time></span>
  <span><a href="/methodology/">How we built this</a></span>
</div>
<figure class="bl-hero"><img src="${esc(hero.src)}" alt="${esc(hero.alt)}" width="1200" height="675" loading="eager" decoding="async"></figure>
<p class="bl-credit">Image: ${credit}</p>
<p class="bl-lede">${esc(post.description)}</p>
<div class="bl-body">${post.body.map(section => sectionHtml(section, sourceById)).join("")}</div>
${cta}
<section class="bl-sources"><h2>Sources</h2><ol>${sources}</ol>
<p style="font-size:11px;color:#8497a8;margin:10px 0 0">Federal record snapshot <code>${esc(post.sourceSnapshotHash)}</code>. Recall campaigns are official filings; complaints are consumer-submitted allegations.</p></section>
<section class="bl-related"><h2>Related</h2>${related}</section>
</main>` + foot;
}

function listPage(posts) {
  const url = `${SITE}/blog/`;
  const cards = posts.map(post => `<a class="bl-card" href="/blog/${esc(post.slug)}/">
<img src="${esc(post.heroImage.src)}" alt="${esc(post.heroImage.alt)}" loading="lazy" decoding="async">
<div class="bl-card-in"><span>${esc(post.year)} ${esc(post.make)} ${esc(post.model)}</span>
<h2>${esc(post.title)}</h2><p>${esc(post.description)}</p></div></a>`).join("");

  return head({
    title: `Used car research and analysis | ${NAME}`,
    description: "Federal recall and complaint records for specific used cars, read for buyers. Every figure traced to its NHTSA source.",
    url,
    jsonld: [{
      "@context": "https://schema.org", "@type": "Blog", name: `${NAME} Research`, url,
      publisher: { "@type": "Organization", name: NAME, url: SITE },
      blogPost: posts.map(post => ({
        "@type": "BlogPosting", headline: post.title,
        url: `${SITE}/blog/${post.slug}/`, datePublished: post.datePublished
      }))
    }]
  }) + `
<main class="bl-wrap bl-list">
<div class="bl-crumb"><a href="/">Home</a> › Research</div>
<h1 class="bl-h1">Used car research</h1>
<p class="bl-lede">One vehicle at a time, read from the federal record. Recall campaigns are official filings; consumer complaints are allegations. We keep those apart and show the source for every number.</p>
${posts.length ? `<div class="bl-cards">${cards}</div>`
    : `<div class="bl-empty">No posts published yet. The generator publishes on a schedule; each run is logged in <code>blog/runs/</code>.</div>`}
</main>` + foot;
}

function methodologyPage() {
  const url = `${SITE}/methodology/`;
  return head({
    title: `How KickTires researches a used car | ${NAME}`,
    description: "The data sources, the checks every article passes before publication, and the things we refuse to claim.",
    url,
    jsonld: [{
      "@context": "https://schema.org", "@type": "WebPage", name: "Methodology", url,
      publisher: { "@type": "Organization", name: NAME, url: SITE }
    }]
  }) + `
<main class="bl-wrap">
<div class="bl-crumb"><a href="/">Home</a> › Methodology</div>
<h1 class="bl-h1">How we research a used car</h1>
<div class="bl-body">
<p>Every article on this site is written from a snapshot of the federal record for one model year. This page describes where that comes from and what has to be true before anything is published.</p>

<h2>What we use</h2>
<ul>
<li><b>NHTSA recall campaigns.</b> Official filings by the manufacturer. When we say a recall exists, there is a campaign number behind it.</li>
<li><b>NHTSA consumer complaints.</b> Reports members of the public filed. These are allegations. They are not confirmed defects, not manufacturer admissions, and not a failure rate.</li>
<li><b>NHTSA model catalog.</b> Used to resolve the name a vehicle is actually filed under. A 320i's record is filed as 3 Series, so that is what we read, and we say so.</li>
<li><b>EPA fuel economy data</b> and KickTires' own cost model, where a cost estimate is given. Those are estimates and are labelled as such.</li>
</ul>

<h2>What has to pass before publication</h2>
<p>Articles are drafted and then checked twice, by two things that do not share context.</p>
<ul>
<li>Every number in the article is recomputed from the stored snapshot. If a figure in the prose is not in the record, the article does not publish.</li>
<li>Every section cites the source it drew from, and those source ids have to exist.</li>
<li>The article is compared against everything already published. Too much overlap and it does not publish.</li>
<li>Language that presents a complaint as a confirmed defect is rejected outright.</li>
<li>Claims of first-hand experience are rejected. Nobody here drove the car.</li>
<li>A separate editorial review reads the draft cold and looks for unsupported claims, alarmist framing, padding, and conclusions the body does not support.</li>
<li>Images must carry a commercial-use licence, and are stored and served by us rather than hotlinked. Where no correctly licensed photograph exists we publish a chart built from the vehicle's own record instead of a synthetic photo.</li>
</ul>
<p>An article that fails is not published in part. The run is logged with the reason and the subject is left for a later attempt.</p>

<h2>What we will not do</h2>
<ul>
<li>Publish a number without a source.</li>
<li>Compare raw complaint totals between models. Without sales volume that comparison is meaningless.</li>
<li>Describe a complaint pattern as a known defect.</li>
<li>Generate a photorealistic image of a car and present it as a photograph.</li>
<li>Publish the same article with the vehicle name changed.</li>
</ul>

<h2>Corrections</h2>
<p>The federal record changes as filings arrive. Each article records the snapshot it was written from and the date it was retrieved. If something here is wrong, it is worth telling us — the <a href="/about/">about page</a> has the contact route.</p>
</div>
${cta}
</main>` + foot;
}

function authorPage(posts) {
  const url = SITE + AUTHOR_PATH;
  const list = posts.map(post =>
    `<a href="/blog/${esc(post.slug)}/">${esc(post.title)}</a>`).join("");
  return head({
    title: `${AUTHOR} | ${NAME}`,
    description: "Who writes KickTires research, what the editorial process is, and what it refuses to publish.",
    url,
    jsonld: [{
      "@context": "https://schema.org", "@type": "ProfilePage", url,
      mainEntity: {
        "@type": "Organization", name: AUTHOR, url,
        parentOrganization: { "@type": "Organization", name: NAME, url: SITE },
        description: "Editorial team responsible for KickTires used-car research."
      }
    }]
  }) + `
<main class="bl-wrap">
<div class="bl-crumb"><a href="/">Home</a> › ${esc(AUTHOR)}</div>
<h1 class="bl-h1">${esc(AUTHOR)}</h1>
<div class="bl-body">
<p>KickTires research is produced by an automated editorial pipeline and published under the KickTires Editorial byline. We say so plainly rather than inventing a person who did not write it.</p>
<p>Articles are drafted from a stored snapshot of NHTSA recall and consumer complaint records for one model year, then checked twice before publication: once by code that recomputes every figure against that snapshot, and once by a separate editorial review. Nothing publishes that fails either. The <a href="/methodology/">methodology page</a> sets out the full list.</p>
<p>We take no money from dealers, sellers or marketplaces. Cost figures are estimates, not quotes.</p>
</div>
<section class="bl-related"><h2>Articles</h2>${list || "<p>None published yet.</p>"}</section>
</main>` + foot;
}

function rss(posts) {
  const items = posts.slice(0, 30).map(post => `  <item>
    <title>${esc(post.title)}</title>
    <link>${SITE}/blog/${esc(post.slug)}/</link>
    <guid isPermaLink="true">${SITE}/blog/${esc(post.slug)}/</guid>
    <pubDate>${new Date(post.datePublished).toUTCString()}</pubDate>
    <description>${esc(post.description)}</description>
  </item>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${NAME} — used car research</title>
  <link>${SITE}/blog/</link>
  <atom:link href="${SITE}/blog/rss.xml" rel="self" type="application/rss+xml"/>
  <description>Federal recall and complaint records for specific used cars, read for buyers.</description>
  <language>en-us</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
</channel>
</rss>`;
}

/* ── write ────────────────────────────────────────────────────── */
function write(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

if (!fs.existsSync(OUT)) throw new Error("dist missing: run build.mjs before blog-build.mjs");

const all = readPosts();
// A draft or a review failure is rendered noindex and kept out of the sitemap and feed
// rather than deleted, so a failure is inspectable without ever being discoverable.
const published = all.filter(post => post.status === "published")
  .sort((a, b) => String(b.datePublished).localeCompare(String(a.datePublished)));

write(path.join(OUT, "blog", "index.html"), listPage(published));
write(path.join(OUT, "methodology", "index.html"), methodologyPage());
write(path.join(OUT, "author", "kicktires-editorial", "index.html"), authorPage(published));
write(path.join(OUT, "blog", "rss.xml"), rss(published));
for (const post of all) write(path.join(OUT, "blog", post.slug, "index.html"), postPage(post));

// Images are served from our own origin; nothing on a post page is fetched from a third party.
if (fs.existsSync(IMAGES_DIR)) {
  fs.cpSync(IMAGES_DIR, path.join(OUT, "blog-images"), { recursive: true });
}

const sitemapFile = path.join(OUT, "sitemap.xml");
if (fs.existsSync(sitemapFile)) {
  let xml = fs.readFileSync(sitemapFile, "utf8");
  const urls = [
    { loc: `${SITE}/blog/`, priority: "0.80" },
    { loc: `${SITE}/methodology/`, priority: "0.50" },
    { loc: SITE + AUTHOR_PATH, priority: "0.40" },
    ...published.map(post => ({
      loc: `${SITE}/blog/${post.slug}/`, priority: "0.80",
      lastmod: day(post.dateModified), image: SITE + post.heroImage.src, title: post.title
    }))
  ];
  const additions = urls.filter(entry => !xml.includes(`<loc>${entry.loc}</loc>`)).map(entry =>
    `  <url><loc>${entry.loc}</loc>${entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ""}`
    + `<priority>${entry.priority}</priority>`
    + (entry.image ? `<image:image><image:loc>${esc(entry.image)}</image:loc>`
      + `<image:title>${esc(entry.title)}</image:title></image:image>` : "")
    + "</url>").join("\n");
  if (additions) {
    if (!xml.includes("xmlns:image=")) {
      xml = xml.replace("<urlset", '<urlset xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
    }
    xml = xml.replace("</urlset>", `${additions}\n</urlset>`);
    fs.writeFileSync(sitemapFile, xml);
  }
}

const drafts = all.length - published.length;
console.log(`[blog-build] ${published.length} published post${published.length === 1 ? "" : "s"}`
  + `${drafts ? `, ${drafts} noindex draft/failed` : ""}; /blog, /methodology, ${AUTHOR_PATH}, rss.xml`);
