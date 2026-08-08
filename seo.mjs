import fs from "node:fs";
import path from "node:path";

const OUT = "dist";
const NAME = "KickTires";
const targets = JSON.parse(fs.readFileSync("research-models.json", "utf8")).models;

const esc = value => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function replaceMeta(html, key, value, property = false) {
  const attr = property ? "property" : "name";
  const re = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="[^"]*">`, "i");
  return html.replace(re, `<meta ${attr}="${key}" content="${esc(value)}">`);
}

function updateJsonLd(html, { title, description, collectionName = null }) {
  return html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (full, source) => {
    try {
      const data = JSON.parse(source);
      const visit = node => {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) return node.forEach(visit);
        if (node["@type"] === "Article") {
          node.headline = title;
          node.description = description;
        }
        if (node["@type"] === "CollectionPage") {
          if (collectionName) node.name = collectionName;
          node.description = description;
        }
        Object.values(node).forEach(visit);
      };
      visit(data);
      return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
    } catch {
      return full;
    }
  });
}

function updatePage(file, copy) {
  if (!fs.existsSync(file)) return false;
  let html = fs.readFileSync(file, "utf8");
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(copy.title)}</title>`);
  html = replaceMeta(html, "description", copy.description);
  html = replaceMeta(html, "og:title", copy.title, true);
  html = replaceMeta(html, "og:description", copy.description, true);
  html = html.replace(
    /(<section class="research-hero">[\s\S]*?<h1>)[\s\S]*?(<\/h1><p class="lede">)[\s\S]*?(<\/p>)/i,
    `$1${esc(copy.h1)}$2${esc(copy.lede)}$3`
  );
  for (const [from, to] of copy.replacements || []) html = html.replace(from, to);
  html = updateJsonLd(html, copy);
  fs.writeFileSync(file, html);
  return true;
}

function yearsLabel(target) {
  const years = target.years || [];
  if (!years.length) return "available model years";
  return years.length > 1 ? `${Math.min(...years)}–${Math.max(...years)}` : String(years[0]);
}

function modelCopy(target) {
  const vehicle = `${target.make} ${target.model}`;
  const years = yearsLabel(target);
  return {
    guide: {
      title: `Used ${vehicle} Buying Guide: What to Check | ${NAME}`,
      description: `Shopping for a used ${vehicle}? Compare NHTSA complaints and recalls by year, see the most reported problem areas, and use a practical pre-purchase checklist.`,
      h1: `Used ${vehicle} Buying Guide: What to Check Before You Buy`,
      lede: `Before buying a used ${vehicle}, compare the federal complaint and recall record by year, then use those patterns to focus your inspection on the systems most worth checking.`,
      replacements: [
        [/<h2>What the federal record says<\/h2>/, `<h2>${esc(vehicle)} problems by model year</h2>`],
        [/<h2>What to inspect before money changes hands<\/h2>/, `<h2>What to check before buying a used ${esc(vehicle)}</h2>`]
      ]
    },
    best: {
      title: `${vehicle} Best Years & Years to Avoid (${years}) | ${NAME}`,
      description: `Compare ${years} ${vehicle} years using NHTSA complaint and recall patterns. See lower-report and higher-report years, plus what to inspect before buying.`,
      h1: `${vehicle} Best Years & Years to Avoid: ${years} Compared`,
      lede: `Compare ${vehicle} model years using NHTSA complaint and recall patterns. We show which years look quieter or noisier in the federal record without treating raw complaint counts as failure rates.`,
      replacements: [
        [/<h2>How to use this page<\/h2>/, `<h2>Which ${esc(vehicle)} year should you buy?</h2>`]
      ]
    },
    problems: {
      title: `Common ${vehicle} Problems & Recalls by Year | ${NAME}`,
      description: `See the most reported NHTSA complaint areas and recall campaigns for the ${vehicle} across ${years}, with year-by-year comparisons and inspection targets.`,
      h1: `Common ${vehicle} Problems & Recalls by Year`,
      lede: `See which systems appear most often in NHTSA complaints for the ${vehicle}, compare recall campaign counts by year, and turn those records into a focused inspection checklist.`,
      replacements: [
        [/<h2>Most frequently tagged complaint areas<\/h2>/, `<h2>Most reported ${esc(vehicle)} problem areas</h2>`],
        [/<h2>What these records can — and cannot — tell you<\/h2>/, `<h2>How to use ${esc(vehicle)} complaint and recall data</h2>`]
      ]
    },
    cost: {
      title: `${vehicle} Ownership Cost: Fuel, Insurance & Repairs | ${NAME}`,
      description: `Plan the cost of owning a used ${vehicle}: fuel, insurance and repair reserve, then paste a real listing for price- and location-specific five-year estimates.`,
      h1: `Used ${vehicle} Ownership Cost: Fuel, Insurance & Repairs`,
      lede: `Estimate the recurring costs of a used ${vehicle}, including fuel, insurance and repair reserve. A real five-year total still depends on the car's price, mileage and location.`,
      replacements: [
        [/<h2>Start with recurring costs<\/h2>/, `<h2>${esc(vehicle)} ownership costs to plan for</h2>`],
        [/<h2>What the listing analyzer adds<\/h2>/, `<h2>Get a five-year estimate for the car you found</h2>`]
      ]
    }
  };
}

let changed = 0;
for (const target of targets) {
  const base = path.join(OUT, "cars", target.slug);
  const copy = modelCopy(target);
  changed += updatePage(path.join(base, "index.html"), copy.guide) ? 1 : 0;
  changed += updatePage(path.join(base, "best-years", "index.html"), copy.best) ? 1 : 0;
  changed += updatePage(path.join(base, "problems-recalls", "index.html"), copy.problems) ? 1 : 0;
  changed += updatePage(path.join(base, "ownership-cost", "index.html"), copy.cost) ? 1 : 0;
}

const centerFile = path.join(OUT, "cars", "index.html");
changed += updatePage(centerFile, {
  title: `Used Car Buying Guides: Problems, Best Years & Costs | ${NAME}`,
  description: "Research used cars by model: common problems, recalls, best years, years to avoid and ownership costs, backed by NHTSA and EPA data.",
  h1: "Used Car Buying Guides Built on Federal Data",
  lede: "Compare common problems, recalls and model-year patterns before you shop. Then paste the actual listing to judge its price, mileage and ownership risk.",
  collectionName: "KickTires Used Car Buying Guides",
  replacements: [
    [/>Problems<\/a>/g, ">Problems &amp; recalls</a>"],
    [/<h2>Year-by-year evidence pages<\/h2>/, "<h2>Used-car problems by model year</h2>"]
  ]
}) ? 1 : 0;

console.log(`[seo] polished ${changed} research pages`);
