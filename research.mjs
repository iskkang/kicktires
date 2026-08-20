import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { __test } from "./netlify/functions/analyze.mjs";

const SITE = "https://kicktires.netlify.app";
const NAME = "KickTires";
const OUT = "dist";
const TODAY = process.env.BUILD_DATE || new Date().toISOString().slice(0, 10);
const GA_MEASUREMENT_ID = (process.env.GA_MEASUREMENT_ID || "G-5NSV1Y7TSJ").trim();
const ADSENSE = (process.env.ADSENSE_CLIENT || "ca-pub-3682195653529318").trim();
const ALLOW_LIVE_RESEARCH_BUILD = process.env.ALLOW_LIVE_RESEARCH_BUILD === "true";
const TARGETS = JSON.parse(fs.readFileSync("research-models.json", "utf8")).models;
const EDITORIAL = JSON.parse(fs.readFileSync("data.json", "utf8"));
const GENERATED = JSON.parse(fs.readFileSync("generated.json", "utf8"));
const css = fs.readFileSync("style.css", "utf8");

const profiles = [...new Map([...Object.values(EDITORIAL), ...Object.values(GENERATED)]
  .map(profile => [`${profile.meta.y}|${profile.meta.mk}|${profile.meta.md}`.toLowerCase(), profile])).values()];

const extraCss = `
.research-hero{padding:56px 0 30px;border-bottom:1px solid var(--line,#292d33)}
.research-kicker{font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;opacity:.65}
.research-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:24px 0 44px}
.research-card{display:block;border:1px solid var(--line,#2b3037);border-radius:16px;padding:22px;text-decoration:none;color:inherit;background:rgba(255,255,255,.02)}
.research-card:hover{transform:translateY(-2px);border-color:#55739a}.research-card h2{margin:8px 0 8px;font-size:24px}.research-card p{margin:0;line-height:1.55;opacity:.78}
.research-links{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.research-links span,.research-chip{font-size:12px;border:1px solid var(--line,#30353d);border-radius:999px;padding:7px 10px;opacity:.82}
.research-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:20px 0 30px}.research-tabs a{border:1px solid var(--line,#30353d);border-radius:999px;padding:9px 13px;text-decoration:none;color:inherit}.research-tabs a.on{background:#edf3fa;color:#111;border-color:#edf3fa}
.research-snapshot{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:22px 0}.research-stat{border:1px solid var(--line,#30353d);border-radius:14px;padding:16px}.research-stat b{display:block;font-size:26px;margin-top:7px}.research-stat small{display:block;opacity:.62;margin-top:5px;line-height:1.35}
.research-table{width:100%;border-collapse:collapse;margin:18px 0 30px}.research-table th,.research-table td{padding:13px 12px;border-bottom:1px solid var(--line,#30353d);text-align:left;vertical-align:top}.research-table th{font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.6}.research-table td b{display:block}.research-table td small{opacity:.62}
.signal-low{font-weight:800}.signal-high{font-weight:800}.research-note{border-left:3px solid #7997bc;padding:4px 0 4px 16px;margin:18px 0 28px;line-height:1.55;opacity:.86}
.research-cta{border:1px solid #55739a;border-radius:18px;padding:24px;margin:36px 0;background:linear-gradient(135deg,rgba(80,117,163,.16),rgba(80,117,163,.03));display:flex;align-items:center;justify-content:space-between;gap:20px}.research-cta h2{margin:4px 0 7px}.research-cta p{margin:0;opacity:.75}.research-cta a{white-space:nowrap;text-decoration:none;font-weight:800;background:#edf3fa;color:#111;padding:12px 16px;border-radius:10px}
.problem-bars{display:grid;gap:12px;margin:20px 0 32px}.problem-row{display:grid;grid-template-columns:190px 1fr 54px;align-items:center;gap:12px}.problem-track{height:10px;background:rgba(255,255,255,.08);border-radius:999px;overflow:hidden}.problem-track i{display:block;height:100%;background:currentColor;opacity:.65;border-radius:999px}.problem-row b{text-align:right}
.quality-badge{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:800;border:1px solid var(--line,#30353d);padding:7px 10px;border-radius:999px}.quality-badge i{width:8px;height:8px;border-radius:50%;background:#63b887}.quality-badge.pending i{background:#d6a44c}
@media(max-width:800px){.research-grid{grid-template-columns:1fr}.research-snapshot{grid-template-columns:repeat(2,1fr)}.problem-row{grid-template-columns:120px 1fr 42px}.research-cta{align-items:flex-start;flex-direction:column}}
`;

const esc = value => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;")
  .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const norm = value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const shortDesc = value => {
  const source = String(value || "").replace(/\s+/g," ").trim();
  return source.length <= 160 ? source : source.slice(0,157).replace(/\s+\S*$/,"") + "…";
};
const format = value => Number(value || 0).toLocaleString("en-US");
const median = values => {
  const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length/2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
};

export function pageUrls(target){
  const base = `/cars/${target.slug}/`;
  return { guide:base, best:`${base}best-years/`, problems:`${base}problems-recalls/`, cost:`${base}ownership-cost/` };
}

export function aggregateComponents(years){
  const totals = new Map();
  for (const year of years) for (const item of year?.topComponents || []) {
    totals.set(item.component, (totals.get(item.component) || 0) + Number(item.count || 0));
  }
  return [...totals.entries()].map(([component,count])=>({component,count}))
    .sort((a,b)=>b.count-a.count || a.component.localeCompare(b.component));
}

export function classifyYears(years){
  const valid = years.filter(year => Number.isInteger(year.complaintTotal) && Number.isInteger(year.recallTotal));
  if (!valid.length) return { lower:null, higher:null };
  const lower = [...valid].sort((a,b)=>a.complaintTotal-b.complaintTotal || a.recallTotal-b.recallTotal || b.year-a.year)[0];
  const higher = [...valid].sort((a,b)=>b.complaintTotal-a.complaintTotal || b.recallTotal-a.recallTotal || a.year-b.year)[0];
  return { lower, higher };
}

function existingSnapshot(target, year){
  const profile = profiles.find(item => item.meta.y === year && norm(item.meta.mk) === norm(target.make)
    && norm(item.meta.md) === norm(target.model));
  if (!profile) return null;
  const federal = profile.federal || {};
  const complaintTotal = Number.isInteger(federal.complaintTotal) ? federal.complaintTotal : profile.meta.nhtsa;
  const recallTotal = Number.isInteger(federal.recallTotal) ? federal.recallTotal : profile.meta.recalls;
  if (!Number.isInteger(complaintTotal) || !Number.isInteger(recallTotal)) return null;
  return {
    year,
    complaintTotal,
    recallTotal,
    topComponents: federal.topComponents || [],
    recalls: federal.recalls || [],
    epa: profile.epa || null,
    tco: profile.tco || null,
    retrievedAt: federal.retrievedAt || profile.meta.retrievedAt || null,
    publishedAt: profile.meta.published || profile.meta.retrievedAt || federal.retrievedAt || null,
    updatedAt: profile.meta.updated || profile.meta.retrievedAt || federal.retrievedAt || null,
    source: profile.generated ? "federal snapshot" : "reviewed profile"
  };
}

async function liveSnapshot(target, year){
  const car = { year, make: target.make.toLowerCase(), model: norm(target.model) };
  try {
    const [federal, epa] = await Promise.all([
      __test.getNhtsaFacts(car),
      __test.getEpaFacts(car).catch(()=>null)
    ]);
    return {
      year,
      complaintTotal: federal.complaintTotal,
      recallTotal: federal.recallTotal,
      topComponents: federal.topComponents || [],
      recalls: federal.recalls || [],
      epa,
      tco: null,
      retrievedAt: federal.retrievedAt,
      publishedAt: federal.retrievedAt,
      updatedAt: federal.retrievedAt,
      source: "live NHTSA build lookup"
    };
  } catch (error) {
    console.error(`[research] ${year} ${target.make} ${target.model}: ${error.message}`);
    return null;
  }
}

async function buildModel(target){
  const years = [];
  for (const year of target.years) {
    const stored = existingSnapshot(target,year);
    years.push(stored || (ALLOW_LIVE_RESEARCH_BUILD ? await liveSnapshot(target,year) : null));
  }
  const valid = years.filter(Boolean).sort((a,b)=>a.year-b.year);
  const components = aggregateComponents(valid).slice(0,8);
  const signals = classifyYears(valid);
  const quality = valid.length >= Math.min(3,target.years.length)
    && valid.every(item => Number.isInteger(item.complaintTotal) && Number.isInteger(item.recallTotal))
    && components.length >= 2;
  const retrieved = valid.map(item=>item.retrievedAt).filter(Boolean).sort().at(-1) || TODAY;
  const published = valid.map(item=>item.publishedAt || item.retrievedAt).filter(Boolean).sort().at(0) || retrieved;
  const updated = valid.map(item=>item.updatedAt || item.retrievedAt).filter(Boolean).sort().at(-1) || retrieved;
  return { target, years:valid, components, signals, quality, retrieved, published, updated };
}

function head({title,desc,url,noindex=false,jsonld=null}){
  const description = shortDesc(desc);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${url}">
${noindex?'<meta name="robots" content="noindex,follow">':''}<meta property="og:type" content="article"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${url}"><meta property="og:site_name" content="${NAME}">
<meta name="twitter:card" content="summary_large_image"><meta name="google-adsense-account" content="${ADSENSE}">
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","${GA_MEASUREMENT_ID}");</script>
<style>${css}${extraCss}</style>${jsonld?`<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g,"\\u003c")}</script>`:""}</head><body>
<nav><div class="navin"><a class="logo" href="/"><i></i>${NAME}</a><div class="navlinks"><a class="navlink navcheck" href="/#check">Check a listing</a><a class="navlink" href="/cars/">Research</a><a class="navlink" href="/blog/">Blog</a></div></div></nav>`;
}

const foot = `<footer class="site"><div class="shell"><p>Sources: NHTSA complaint and recall records · EPA fuel economy data where available · KickTires cost estimates.</p><p class="fine"><b>Raw complaint totals are screening signals, not failure rates.</b> Sales volume, vehicle age and reporting behavior differ by model year. Always run the VIN and get an independent pre-purchase inspection.</p><p class="fine"><a href="/methodology/">Methodology</a> · <a href="/author/kicktires-editorial/">Editorial process</a> · <a href="/privacy/">Privacy &amp; cookies</a> · <a href="/about/">About &amp; corrections</a></p></div></footer></body></html>`;

function structured(model,title,desc,url){
  const target = model.target;
  return {"@context":"https://schema.org","@graph":[
    {"@type":"Article",headline:title,description:desc,datePublished:model.published,dateModified:model.updated,
      author:{"@type":"Organization",name:NAME},publisher:{"@type":"Organization",name:NAME},mainEntityOfPage:url,
      about:{"@type":"Car",name:`${target.make} ${target.model}`,manufacturer:{"@type":"Organization",name:target.make}}},
    {"@type":"BreadcrumbList",itemListElement:[
      {"@type":"ListItem",position:1,name:"Home",item:`${SITE}/`},
      {"@type":"ListItem",position:2,name:"Used Car Research",item:`${SITE}/cars/`},
      {"@type":"ListItem",position:3,name:`${target.make} ${target.model}`,item:`${SITE}${pageUrls(target).guide}`}
    ]}
  ]};
}

function tabs(model,active){
  const u = pageUrls(model.target);
  return `<div class="research-tabs"><a class="${active==='guide'?'on':''}" href="${u.guide}">Buying guide</a><a href="${u.guide}#years">Model years</a><a href="${u.guide}#problems">Problems &amp; recalls</a><a href="${u.guide}#costs">Ownership cost</a></div>`;
}

function qualityBadge(model){
  return model.quality ? `<span class="quality-badge"><i></i>Federal-data gate passed</span>`
    : `<span class="quality-badge pending"><i></i>Data refresh pending · noindex</span>`;
}

function stats(model){
  const totalComplaints = model.years.reduce((sum,item)=>sum+item.complaintTotal,0);
  const totalRecalls = model.years.reduce((sum,item)=>sum+item.recallTotal,0);
  const lead = model.components[0];
  return `<div class="research-snapshot"><div class="research-stat"><span class="research-kicker">Years compared</span><b>${model.years.length}</b><small>${model.years.map(y=>y.year).join(" · ")||"Awaiting data"}</small></div><div class="research-stat"><span class="research-kicker">Raw complaints</span><b>${format(totalComplaints)}</b><small>NHTSA reports across compared years</small></div><div class="research-stat"><span class="research-kicker">Recall campaigns</span><b>${format(totalRecalls)}</b><small>Model-year campaign counts, not open VIN recalls</small></div><div class="research-stat"><span class="research-kicker">Leading area</span><b style="font-size:18px">${esc(lead?.component||"Pending")}</b><small>${lead?format(lead.count)+" tags across compared years":"Refresh required"}</small></div></div>`;
}

function yearTable(model){
  return `<table class="research-table"><thead><tr><th>Year</th><th>NHTSA complaints</th><th>Recall campaigns</th><th>Leading reported area</th></tr></thead><tbody>${model.years.map(item=>`<tr><td><b>${item.year}</b></td><td>${format(item.complaintTotal)}</td><td>${format(item.recallTotal)}</td><td>${esc(item.topComponents?.[0]?.component||"No dominant category")}</td></tr>`).join("")}</tbody></table>`;
}

function cta(target){
  return `<section class="research-cta"><div><span class="research-kicker">Already found one?</span><h2>Check the actual listing.</h2><p>A model-year pattern cannot tell you whether the seller's price, mileage and disclosures make this specific car a good buy.</p></div><a href="/#check" onclick="if(window.gtag)gtag('event','research_analyzer_clicked',{model:'${esc(target.slug)}'})">Paste a listing →</a></section>`;
}

function intro(model,active,title,desc){
  const guideUrl = `${SITE}${pageUrls(model.target).guide}`;
  const indexable = model.quality && active === "guide";
  return head({title,desc,url:guideUrl,noindex:!indexable,
    jsonld:indexable?structured(model,title,desc,guideUrl):null}) + `<main class="shell"><div class="crumb"><a href="/">Home</a> › <a href="/cars/">Research</a> › ${esc(model.target.make)} ${esc(model.target.model)}</div><section class="research-hero"><span class="research-kicker">${esc(model.target.segment)} · used-car research</span><h1>${esc(title.replace(` | ${NAME}`,""))}</h1><p class="lede">${esc(desc)}</p>${qualityBadge(model)}</section>${tabs(model,active)}`;
}

function buyingGuide(model){
  const t=model.target;
  const title=`${t.make} ${t.model} Used Buying Guide | ${NAME}`;
  const desc=`A buyer-side guide to the ${t.make} ${t.model}, built from NHTSA complaint and recall records across ${t.years.join(", ")}. See what to inspect before buying.`;
  const checks = model.components.filter(item=>item.component!=="UNKNOWN OR OTHER").slice(0,3)
    .map(item=>`<li><b>${esc(item.component)}:</b> make the inspection reproduce or rule out the symptoms behind this federal report category.</li>`).join("");
  const {lower,higher}=model.signals;
  const yearSignal = lower ? `<div class="research-snapshot"><div class="research-stat"><span class="research-kicker">Lower-report signal</span><b>${lower.year}</b><small>${format(lower.complaintTotal)} complaints · ${format(lower.recallTotal)} recall campaigns among the years compared</small></div><div class="research-stat"><span class="research-kicker">Inspect more carefully</span><b>${higher.year}</b><small>${format(higher.complaintTotal)} complaints · ${format(higher.recallTotal)} recall campaigns among the years compared</small></div></div>` : "";
  return intro(model,"guide",title,desc)+stats(model)
    + `<p class="research-note"><b>Evidence updated ${esc(String(model.updated).slice(0,10))}.</b> This page consolidates the model-year comparison, complaint categories and cost framework so each model has one canonical research page. <a href="/methodology/">See how the data is checked.</a></p>`
    + `<section id="years"><h2>What the federal record says</h2><p class="lede">We compare the same model across multiple years instead of turning one scary complaint into a verdict. Raw complaint totals are not normalized for sales volume, miles driven or vehicle age.</p>${yearSignal}${yearTable(model)}</section>`
    + `<section id="problems"><h2>Most frequently tagged complaint areas</h2><p class="sub">Aggregated across the model years on this page. One complaint can carry multiple component tags, so these bars should not be added together as a vehicle count.</p>${problemBars(model)}<h2>What to inspect before money changes hands</h2><ol class="lede">${checks||"<li>Run the VIN, scan every module and put the car on a lift.</li>"}<li><b>VIN recall check:</b> a model-year recall count does not prove this specific vehicle still has an open remedy.</li><li><b>Cold and warm test drive:</b> intermittent faults often disappear during a short seller-controlled loop.</li></ol></section>`
    + `<section id="costs"><h2>Ownership-cost framework</h2>${ownershipSnapshot(model)}<p class="research-note">We deliberately do not publish a fake five-year total without an asking price and state. Sales tax, registration, insurance and depreciation can move the answer more than a generic model average.</p></section>`
    + `<p class="research-note">KickTires does not label a model reliable or unreliable from raw complaint totals alone. Those counts are useful for deciding where to look, not for estimating a failure probability.</p>${cta(t)}</main>${foot}`;
}

function bestYears(model){
  const t=model.target, {lower,higher}=model.signals;
  const title=`${t.make} ${t.model} Best Years & Years to Avoid | ${NAME}`;
  const desc=`Compare ${t.make} ${t.model} model years using NHTSA complaint and recall records. See which years show lower or higher federal-report burden before you shop.`;
  return intro(model,"best",title,desc)+`<p class="research-note"><b>Important:</b> “best year” is a search phrase, not a statistical conclusion. NHTSA complaint totals are not normalized for sales volume, miles driven or vehicle age, so we use them as a screening signal only.</p>${lower?`<div class="research-snapshot"><div class="research-stat"><span class="research-kicker">Lower-report signal</span><b>${lower.year}</b><small>${format(lower.complaintTotal)} complaints · ${format(lower.recallTotal)} recall campaigns among the years compared</small></div><div class="research-stat"><span class="research-kicker">Inspect more carefully</span><b>${higher.year}</b><small>${format(higher.complaintTotal)} complaints · ${format(higher.recallTotal)} recall campaigns among the years compared</small></div></div>`:""}${yearTable(model)}<h2>How to use this page</h2><p class="lede">Start with the lower-report years, then compare the actual car's maintenance history, mileage, title, inspection results and asking price. A clean example from a noisier year can still be a better buy than a neglected example from a quieter year.</p>${cta(t)}</main>${foot}`;
}

function problemBars(model){
  const max=Math.max(1,...model.components.map(item=>item.count));
  return `<div class="problem-bars">${model.components.slice(0,6).map(item=>`<div class="problem-row"><span>${esc(item.component)}</span><div class="problem-track"><i style="width:${(item.count/max*100).toFixed(1)}%"></i></div><b>${format(item.count)}</b></div>`).join("")}</div>`;
}

function ownershipSnapshot(model){
  const t=model.target;
  const mpgs=model.years.map(item=>Number(item.epa?.mpg)).filter(value=>value>0);
  const mpg=median(mpgs);
  const annualFuel=mpg ? 12000/mpg*(t.fuelPrice||3.20) : null;
  return `<div class="research-snapshot"><div class="research-stat"><span class="research-kicker">Insurance baseline</span><b>$${format(t.annualInsurance)}</b><small>Annual planning estimate before driver, ZIP and coverage factors</small></div><div class="research-stat"><span class="research-kicker">Repair reserve</span><b>$${format(t.annualRepairs)}</b><small>Annual planning reserve, not a quote or predicted bill</small></div><div class="research-stat"><span class="research-kicker">EPA median</span><b>${mpg?Math.round(mpg)+" mpg":"Varies"}</b><small>Median across available compared-year EPA snapshots</small></div><div class="research-stat"><span class="research-kicker">Fuel framework</span><b>${annualFuel?"$"+format(annualFuel)+"/yr":"Listing needed"}</b><small>${annualFuel?"12,000 mi/year at $"+(t.fuelPrice||3.20).toFixed(2)+"/gal":"Powertrain and efficiency determine this"}</small></div></div>`;
}

function problemsPage(model){
  const t=model.target;
  const title=`${t.make} ${t.model} Common Problems & Recalls | ${NAME}`;
  const desc=`See the leading NHTSA complaint categories and recall counts for the ${t.make} ${t.model}, compared across ${t.years.join(", ")}.`;
  return intro(model,"problems",title,desc)+stats(model)+`<h2>Most frequently tagged complaint areas</h2><p class="sub">Aggregated across the model years on this page. One complaint can carry multiple component tags, so these bars should not be added together as a vehicle count.</p>${problemBars(model)}${yearTable(model)}<h2>What these records can — and cannot — tell you</h2><p class="lede">NHTSA uses owner complaints alongside other evidence to identify possible safety-defect trends. A complaint is an allegation, not a confirmed defect. Recall campaign counts are also model-year level; only a VIN lookup can tell you whether the car in front of you still needs a remedy.</p>${cta(t)}</main>${foot}`;
}

function ownershipPage(model){
  const t=model.target;
  const title=`${t.make} ${t.model} Ownership Cost Guide | ${NAME}`;
  const desc=`Estimate the cost framework for owning a used ${t.make} ${t.model}: insurance, repairs, fuel and the listing-specific items KickTires needs before calculating a five-year total.`;
  return intro(model,"cost",title,desc)+`<h2>Start with recurring costs</h2>${ownershipSnapshot(model)}<p class="research-note">We deliberately do not publish a fake five-year total without an asking price and state. Sales tax, registration, insurance and depreciation can move the answer more than a generic model average.</p><h2>What the listing analyzer adds</h2><p class="lede">Paste a real listing and KickTires adds the asking price, mileage, location, federal model-year evidence and available comparable-market data. That is the point where a cost guide becomes a transaction decision.</p>${cta(t)}</main>${foot}`;
}

function center(models){
  const researchCards=models.map(model=>{
    const t=model.target,u=pageUrls(t),lead=model.components[0];
    return `<article class="research-card"><span class="research-kicker">${esc(t.segment)}</span><h2>${esc(t.make)} ${esc(t.model)}</h2><p>${model.quality?`${model.years.length} model years checked · leading reported area: ${esc(lead?.component||"federal records")}.`:"Federal data refresh will complete during a healthy build; pages remain noindex until the quality gate passes."}</p><div class="research-links"><a href="${u.guide}">Buying guide</a><a href="${u.guide}#years">Model years</a><a href="${u.guide}#problems">Problems</a><a href="${u.guide}#costs">Ownership cost</a></div></article>`;
  }).join("");

  const groups=new Map();
  for (const profile of profiles){const key=`${profile.meta.mk}|${profile.meta.md}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(profile)}
  const federalGroups=[...groups.values()].sort((a,b)=>(a[0].meta.priority??999)-(b[0].meta.priority??999)||a[0].meta.mk.localeCompare(b[0].meta.mk)).map(items=>{
    items.sort((a,b)=>b.meta.y-a.meta.y);const first=items[0];
    return `<section class="model-group" data-search="${esc(`${first.meta.mk} ${first.meta.md}`.toLowerCase())}"><div class="model-group-head"><div><p class="micro">${esc(first.meta.mk)}</p><h2>${esc(first.meta.mk)} ${esc(first.meta.md)}</h2></div><span>${items.length} model year${items.length===1?"":"s"}</span></div><div class="model-years">${items.map(item=>`<a href="/cars/${item.meta.slug}/"><span class="year-num">${item.meta.y}</span><b>${esc(item.federal?.topComponents?.[0]?.component||"Federal records reviewed")}</b><small>${format(item.meta.nhtsa)} complaints · ${format(item.meta.recalls)} recall campaigns</small><em>Open year →</em></a>`).join("")}</div></section>`;
  }).join("");

  const title=`Used Car Research — ${NAME}`;
  const desc="Used-car buying guides built from NHTSA complaint and recall records, with best-year screening, common-problem summaries and ownership-cost frameworks.";
  return head({title,desc,url:`${SITE}/cars/`,jsonld:{"@context":"https://schema.org","@type":"CollectionPage",name:"KickTires Used Car Research",url:`${SITE}/cars/`,description:desc}})+`<main class="shell"><section class="research-hero"><span class="research-kicker">Buyer-side research</span><h1>Research the model before you inspect the car.</h1><p class="lede">Start with federal complaint and recall patterns. Then paste the actual listing and make the decision with price, mileage and condition in view.</p></section><div class="research-grid">${researchCards}</div><div class="section-heading model-heading"><div><p class="micro">Federal snapshots</p><h2>Year-by-year evidence pages</h2></div></div><div class="model-index-tools"><label for="modelSearch">Find a make or model</label><input id="modelSearch" type="search" autocomplete="off" placeholder="Try Camry, Civic or F-150"></div><div class="model-groups">${federalGroups}</div></main><script>const q=document.getElementById("modelSearch");q.addEventListener("input",function(){const v=this.value.trim().toLowerCase();document.querySelectorAll(".model-group").forEach(g=>g.hidden=!!v&&!g.dataset.search.includes(v))});</script>${foot}`;
}

function addToSitemap(models){
  const file=path.join(OUT,"sitemap.xml");
  if(!fs.existsSync(file))return;
  let xml=fs.readFileSync(file,"utf8");
  const urls=models.filter(model=>model.quality).map(model=>({
    url:`${SITE}${pageUrls(model.target).guide}`,
    lastmod:String(model.updated).slice(0,10)
  }));
  const entries=urls.filter(item=>!xml.includes(`<loc>${item.url}</loc>`)).map(item=>`  <url><loc>${item.url}</loc><lastmod>${item.lastmod}</lastmod><priority>0.85</priority></url>`).join("\n");
  if(entries)xml=xml.replace("</urlset>",`${entries}\n</urlset>`);
  fs.writeFileSync(file,xml);
}

function appendRedirects(lines){
  const file=path.join(OUT,"_redirects");
  const existing=fs.existsSync(file)?fs.readFileSync(file,"utf8").split("\n").filter(Boolean):[];
  const merged=[...new Set([...existing,...lines])];
  fs.writeFileSync(file,merged.join("\n")+"\n");
}

async function main(){
  if(!/^G-[A-Z0-9]+$/i.test(GA_MEASUREMENT_ID))throw new Error("invalid GA_MEASUREMENT_ID");
  if(!/^ca-pub-\d{16}$/.test(ADSENSE))throw new Error("invalid ADSENSE_CLIENT");
  if(!fs.existsSync(OUT))throw new Error("dist missing: run build.mjs before research.mjs");
  const models=[];
  for(const target of TARGETS)models.push(await buildModel(target));
  fs.writeFileSync(path.join(OUT,"cars","index.html"),center(models));
  for(const model of models){
    const base=path.join(OUT,"cars",model.target.slug);
    fs.mkdirSync(base,{recursive:true});
    fs.writeFileSync(path.join(base,"index.html"),buyingGuide(model));
  }
  appendRedirects(models.flatMap(model=>{
    const u=pageUrls(model.target);
    return [
      `${u.best} ${u.guide}#years 301`,
      `${u.problems} ${u.guide}#problems 301`,
      `${u.cost} ${u.guide}#costs 301`
    ];
  }));
  addToSitemap(models);
  fs.writeFileSync(path.join(OUT,"research-status.json"),JSON.stringify({builtAt:new Date().toISOString(),models:models.map(model=>({slug:model.target.slug,quality:model.quality,years:model.years.map(item=>item.year)}))},null,2));
  console.log(`[research] built ${models.length} consolidated research pages from ${ALLOW_LIVE_RESEARCH_BUILD?"stored + live":"stored"} evidence; redirected ${models.length*3} legacy tab URLs; ${models.filter(model=>model.quality).length}/${models.length} models passed the federal-data gate`);
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if(invoked)main().catch(error=>{console.error(error);process.exitCode=1});
