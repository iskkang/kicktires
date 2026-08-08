import fs from "node:fs";
import path from "node:path";

const OUT = "dist";
const NAME = "KickTires";
const targets = JSON.parse(fs.readFileSync("research-models.json", "utf8")).models;
const editorial = JSON.parse(fs.readFileSync("data.json", "utf8"));
const generated = JSON.parse(fs.readFileSync("generated.json", "utf8"));
const profiles = [...new Map([...Object.values(editorial), ...Object.values(generated)]
  .map(profile => [profile.meta.slug, profile])).values()];

const esc = value => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const norm = value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const fmt = value => Number(value || 0).toLocaleString("en-US");

function replaceMeta(html, key, value, property = false) {
  const attr = property ? "property" : "name";
  const re = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="[^"]*">`, "i");
  return html.replace(re, `<meta ${attr}="${key}" content="${esc(value)}">`);
}

function updateJsonLd(html, { title, description, collectionName = null, faq = null }) {
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
        if (node["@type"] === "FAQPage" && Array.isArray(faq)) {
          node.mainEntity = faq.map(item => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: item.answer }
          }));
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

function applyHeadCopy(html, copy) {
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(copy.title)}</title>`);
  html = replaceMeta(html, "description", copy.description);
  html = replaceMeta(html, "og:title", copy.title, true);
  html = replaceMeta(html, "og:description", copy.description, true);
  html = replaceMeta(html, "twitter:title", copy.title);
  html = replaceMeta(html, "twitter:description", copy.description);
  return html;
}

function updateResearchPage(file, copy) {
  if (!fs.existsSync(file)) return false;
  let html = fs.readFileSync(file, "utf8");
  html = applyHeadCopy(html, copy);
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
      title: `${vehicle} Reliability: Common Problems & What to Check | ${NAME}`,
      description: `Is the ${vehicle} reliable? Compare ${years} NHTSA complaints and recalls, see common problem areas, and learn what to check before buying used.`,
      h1: `${vehicle} Reliability: Common Problems & What to Check`,
      lede: `If you are considering a used ${vehicle}, start with the model-year complaint and recall record. We use those patterns to show what deserves extra attention before you buy.`,
      replacements: [
        [/<h2>What the federal record says<\/h2>/, `<h2>${esc(vehicle)} reliability by model year</h2>`],
        [/<h2>What to inspect before money changes hands<\/h2>/, `<h2>What to check before buying a used ${esc(vehicle)}</h2>`]
      ]
    },
    best: {
      title: `${vehicle} Years to Avoid & Best Years (${years}) | ${NAME}`,
      description: `Which ${vehicle} years should you avoid? Compare ${years} NHTSA complaint and recall patterns, then see which years deserve more or less inspection attention.`,
      h1: `${vehicle} Years to Avoid & Best Years: ${years} Compared`,
      lede: `Compare ${vehicle} model years using NHTSA complaint and recall patterns. We show quieter and noisier years without pretending raw complaint totals are failure rates.`,
      replacements: [
        [/<h2>How to use this page<\/h2>/, `<h2>Which ${esc(vehicle)} year should you buy?</h2>`]
      ]
    },
    problems: {
      title: `${vehicle} Common Problems by Year & Recalls | ${NAME}`,
      description: `See common ${vehicle} problem areas in NHTSA complaints, compare recall campaigns across ${years}, and use the year-by-year data to focus a used-car inspection.`,
      h1: `${vehicle} Common Problems by Year & Recalls`,
      lede: `See which systems appear most often in NHTSA complaints for the ${vehicle}, compare recall campaigns by year, and turn the federal record into a focused inspection checklist.`,
      replacements: [
        [/<h2>Most frequently tagged complaint areas<\/h2>/, `<h2>Most reported ${esc(vehicle)} problem areas</h2>`],
        [/<h2>What these records can — and cannot — tell you<\/h2>/, `<h2>How to use ${esc(vehicle)} complaint and recall data</h2>`]
      ]
    },
    cost: {
      title: `${vehicle} Maintenance Cost: Repairs, Insurance & Fuel | ${NAME}`,
      description: `Plan used ${vehicle} maintenance and ownership costs: repair reserve, insurance and fuel, then paste a real listing for a price- and location-specific estimate.`,
      h1: `Used ${vehicle} Maintenance Cost & Ownership Budget`,
      lede: `Estimate the recurring cost of a used ${vehicle}, including repair reserve, insurance and fuel. A real five-year total still depends on the car's price, mileage and location.`,
      replacements: [
        [/<h2>Start with recurring costs<\/h2>/, `<h2>${esc(vehicle)} maintenance and ownership costs</h2>`],
        [/<h2>What the listing analyzer adds<\/h2>/, `<h2>Get a five-year estimate for the car you found</h2>`]
      ]
    }
  };
}

function yearFaq(profile) {
  const m = profile.meta;
  const federal = profile.federal || {};
  const complaints = Number.isInteger(federal.complaintTotal) ? federal.complaintTotal : Number(m.nhtsa || 0);
  const recalls = Number.isInteger(federal.recallTotal) ? federal.recallTotal : Number(m.recalls || 0);
  const vehicle = `${m.y} ${m.mk} ${m.md}`;
  const top = (federal.topComponents || []).slice(0, 3);
  const fallback = (profile.risks || []).slice(0, 3).map(item => item.t).filter(Boolean);
  const problemText = top.length
    ? top.map(item => `${item.component} (${fmt(item.count)} complaint tags)`).join(", ")
    : fallback.length ? fallback.join(", ") : "no single dominant complaint category in the available snapshot";
  return [
    {
      question: `What are the most common problems with the ${vehicle}?`,
      answer: `The leading areas in this KickTires snapshot are ${problemText}. NHTSA complaints are owner allegations and screening signals, not confirmed defect or failure-rate data.`
    },
    {
      question: `Is the ${vehicle} reliable?`,
      answer: `NHTSA complaint data alone cannot produce a defensible reliability score. This snapshot contains ${fmt(complaints)} raw complaints and ${fmt(recalls)} recall campaigns; use the component patterns to focus an inspection rather than treating the totals as a failure probability.`
    },
    {
      question: `Does the ${vehicle} have recalls?`,
      answer: `NHTSA returned ${fmt(recalls)} model-year recall campaigns in this snapshot. A campaign count does not mean every vehicle is affected or still unrepaired; check the specific VIN with NHTSA before buying.`
    },
    {
      question: `Should I buy a used ${vehicle}?`,
      answer: `The model year alone is not enough to decide. Check the VIN, service history, title, mileage, asking price, stored fault codes and an independent pre-purchase inspection, then weigh those facts against the problem areas shown on this page.`
    }
  ];
}

function faqHtml(vehicle, faq, modelLink = null) {
  return `<h2>${esc(vehicle)} reliability FAQ</h2><section class="panel"><div class="pbody">${faq.map(item =>
    `<div class="federal-block"><h3>${esc(item.question)}</h3><p>${esc(item.answer)}</p></div>`).join("")}${modelLink || ""}</div></section>`;
}

function researchTargetFor(profile) {
  return targets.find(target => norm(target.make) === norm(profile.meta.mk)
    && norm(target.model) === norm(profile.meta.md)) || null;
}

function updateYearPage(file, profile) {
  if (!fs.existsSync(file)) return false;
  const m = profile.meta;
  const federal = profile.federal || {};
  const complaints = Number.isInteger(federal.complaintTotal) ? federal.complaintTotal : Number(m.nhtsa || 0);
  const recalls = Number.isInteger(federal.recallTotal) ? federal.recallTotal : Number(m.recalls || 0);
  const vehicle = `${m.y} ${m.mk} ${m.md}`;
  const copy = {
    title: `${vehicle} Problems, Reliability & Recalls | ${NAME}`,
    description: `Research the ${vehicle}: ${fmt(complaints)} NHTSA complaints, ${fmt(recalls)} recall campaigns, top reported problem areas and what to inspect before buying used.`,
    faq: yearFaq(profile)
  };
  let html = fs.readFileSync(file, "utf8");
  html = applyHeadCopy(html, copy);
  html = html.replace(/<h1>[\s\S]*?<\/h1>/i, `<h1>${esc(vehicle)} Common Problems &amp; Reliability</h1>`);
  html = html.replace(/<h2>The federal record, without the folklore<\/h2>/,
    `<h2>${esc(vehicle)} complaints &amp; recalls</h2>`);
  html = html.replace(/<h2>(?:What deserves inspection|What actually goes wrong)<\/h2>/,
    `<h2>Most reported ${esc(vehicle)} problem areas</h2>`);
  const target = researchTargetFor(profile);
  const modelLink = target
    ? `<p class="data-note"><a href="/cars/${esc(target.slug)}/">Compare ${esc(target.make)} ${esc(target.model)} reliability and model years →</a></p>`
    : "";
  const block = faqHtml(vehicle, copy.faq, modelLink);
  html = html.replace(/<h2>Take this to the inspection<\/h2>/, `${block}<h2>Used ${esc(vehicle)} inspection checklist</h2>`);
  html = updateJsonLd(html, copy);
  fs.writeFileSync(file, html);
  return true;
}

let changed = 0;
for (const target of targets) {
  const base = path.join(OUT, "cars", target.slug);
  const copy = modelCopy(target);
  changed += updateResearchPage(path.join(base, "index.html"), copy.guide) ? 1 : 0;
  changed += updateResearchPage(path.join(base, "best-years", "index.html"), copy.best) ? 1 : 0;
  changed += updateResearchPage(path.join(base, "problems-recalls", "index.html"), copy.problems) ? 1 : 0;
  changed += updateResearchPage(path.join(base, "ownership-cost", "index.html"), copy.cost) ? 1 : 0;
}

const centerFile = path.join(OUT, "cars", "index.html");
changed += updateResearchPage(centerFile, {
  title: `Used Car Reliability, Common Problems & Years to Avoid | ${NAME}`,
  description: "Research used-car reliability by model and year: common problems, recalls, years to avoid and maintenance costs, backed by NHTSA and EPA data.",
  h1: "Used Car Reliability, Common Problems & Years to Avoid",
  lede: "Start with the questions used-car buyers actually ask: which years have more problems, what tends to go wrong, and what should you inspect before paying for the car?",
  collectionName: "KickTires Used Car Reliability Research",
  replacements: [
    [/>Problems(?: &amp; recalls)?<\/a>/g, ">Common problems</a>"],
    [/<h2>Year-by-year evidence pages<\/h2>|<h2>Used-car problems by model year<\/h2>/, "<h2>Common problems and reliability by model year</h2>"]
  ]
}) ? 1 : 0;

for (const profile of profiles) {
  changed += updateYearPage(path.join(OUT, "cars", profile.meta.slug, "index.html"), profile) ? 1 : 0;
}

console.log(`[seo] search-intent reset applied to ${changed} pages`);
