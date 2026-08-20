// Final production guard for the two mistakes that caused the low-value-content review:
// duplicate programmatic URLs and content/data labels that do not agree. This inspects the
// shipped artifact after every generator has had a chance to rewrite it.

import fs from "node:fs";
import path from "node:path";

const OUT = process.env.KICKTIRES_OUT || "dist";
const SITE = "https://kicktires.netlify.app";
const targets = JSON.parse(fs.readFileSync("research-models.json", "utf8")).models || [];
const failures = [];

const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? walk(path.join(dir, entry.name))
    : (entry.name.endsWith(".html") ? [path.join(dir, entry.name)] : []));
const rel = file => path.relative(OUT, file).split(path.sep).join("/");
const text = value => String(value || "").replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const norm = value => text(value).toUpperCase().replace(/[^A-Z0-9]/g, "");

if (!fs.existsSync(OUT)) throw new Error(`${OUT} missing: run the production build first`);
const pages = walk(OUT);
const statusFile = path.join(OUT, "research-status.json");
const carsIndexFile = path.join(OUT, "cars", "index.html");

for (const file of pages) {
  const html = fs.readFileSync(file, "utf8");
  const relative = rel(file);
  const article = /^blog\/[^/]+\/index\.html$/.test(relative)
    && html.includes('class="bl-body"')
    && !html.includes('<meta name="robots" content="noindex');
  const units = (html.match(/class="adsbygoogle"/g) || []).length;
  const loaders = (html.match(/adsbygoogle\.js/g) || []).length;

  if (article) {
    if (units !== 1 || loaders !== 1) failures.push(`${relative}: published article needs one loader and one unit`);
  } else if (units || loaders) {
    failures.push(`${relative}: ad inventory is limited to published editorial articles`);
  }

  for (const card of html.matchAll(/<article class="sf-problem">[\s\S]*?<h3>([\s\S]*?)<\/h3><p>([\s\S]*?)<\/p>/g)) {
    const tagged = text(card[2]).match(/carry the (.+?) tag\b/i);
    if (tagged && norm(card[1]) !== norm(tagged[1])) {
      failures.push(`${relative}: complaint heading "${text(card[1])}" uses copy for "${tagged[1]}"`);
    }
  }
}

for (const target of targets) {
  const guide = path.join(OUT, "cars", target.slug, "index.html");
  if (!fs.existsSync(guide)) {
    failures.push(`cars/${target.slug}/index.html: missing consolidated guide`);
    continue;
  }
  const html = fs.readFileSync(guide, "utf8");
  for (const anchor of ["years", "problems", "costs"]) {
    if (!html.includes(`id="${anchor}"`)) failures.push(`cars/${target.slug}/: missing #${anchor}`);
  }
  for (const section of ["best-years", "problems-recalls", "ownership-cost"]) {
    if (fs.existsSync(path.join(OUT, "cars", target.slug, section, "index.html"))) {
      failures.push(`cars/${target.slug}/${section}/: duplicate section page was rebuilt`);
    }
  }
  for (const year of target.years || []) {
    if (fs.existsSync(path.join(OUT, "cars", `${year}-${target.slug}`, "index.html"))) {
      failures.push(`cars/${year}-${target.slug}/: duplicate year page was rebuilt`);
    }
  }
}

if (!fs.existsSync(statusFile) || !fs.existsSync(carsIndexFile)) {
  failures.push("research status or public model directory is missing");
} else {
  const statuses = JSON.parse(fs.readFileSync(statusFile, "utf8")).models || [];
  const carsIndex = fs.readFileSync(carsIndexFile, "utf8");
  for (const status of statuses) {
    const linked = carsIndex.includes(`href="/cars/${status.slug}/"`);
    if (status.quality === true && !linked) failures.push(`cars/: quality-approved model ${status.slug} is missing`);
    if (status.quality !== true && linked) failures.push(`cars/: noindex model ${status.slug} is publicly listed`);
  }
}

const sitemapFile = path.join(OUT, "sitemap.xml");
if (!fs.existsSync(sitemapFile)) failures.push("sitemap.xml: missing");
else {
  const sitemap = fs.readFileSync(sitemapFile, "utf8");
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  if (new Set(urls).size !== urls.length) failures.push("sitemap.xml: duplicate URLs");
  for (const url of urls) {
    if (!url.startsWith(SITE)) continue;
    if (/\/(?:best-years|problems-recalls|ownership-cost)\/$/.test(url)) {
      failures.push(`sitemap.xml: legacy section URL ${url}`);
    }
    const pathname = new URL(url).pathname;
    const file = path.join(OUT, pathname.replace(/^\//, ""), "index.html");
    if (fs.existsSync(file)) {
      const html = fs.readFileSync(file, "utf8");
      if (html.includes('<meta name="robots" content="noindex')) failures.push(`sitemap.xml: noindex URL ${url}`);
    }
  }
}

if (failures.length) throw new Error(`content quality audit failed:\n  - ${failures.join("\n  - ")}`);
console.log(`[content-quality-audit] ${pages.length} HTML files checked; consolidated model URLs, component labels and article-only ads verified`);
