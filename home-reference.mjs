import fs from "node:fs";
import { CAR_SPRITE } from "./car-sprite.mjs";

const FILE = "dist/index.html";
if (!fs.existsSync(FILE)) throw new Error("dist/index.html missing");

const editorial = JSON.parse(fs.readFileSync("data.json", "utf8"));
const generated = JSON.parse(fs.readFileSync("generated.json", "utf8"));
const targets = JSON.parse(fs.readFileSync("research-models.json", "utf8")).models;
const profiles = [...new Map([...Object.values(editorial), ...Object.values(generated)]
  .map(p => [`${p.meta.y}|${p.meta.mk}|${p.meta.md}`.toLowerCase(), p])).values()];

const esc = v => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const fmt = v => Number(v || 0).toLocaleString("en-US");
const norm = v => String(v || "").toLowerCase().replace(/[^a-z0-9]/g,"");
const complaintCount = p => Number.isInteger(p?.federal?.complaintTotal) ? p.federal.complaintTotal : Number(p?.meta?.nhtsa || 0);
const recallCount = p => Number.isInteger(p?.federal?.recallTotal) ? p.federal.recallTotal : Number(p?.meta?.recalls || 0);
const topArea = p => p?.federal?.topComponents?.[0]?.component || p?.risks?.[0]?.t?.split("—")[0]?.trim() || "Federal records";
const human = v => String(v || "").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());

function profile(year, make, model) {
  return profiles.find(p => Number(p.meta.y)===Number(year) && norm(p.meta.mk)===norm(make) && norm(p.meta.md)===norm(model));
}
function targetFor(make, model) {
  return targets.find(t => norm(t.make)===norm(make) && norm(t.model)===norm(model));
}
function hrefFor(p) {
  if (!p) return "/cars/";
  const t = targetFor(p.meta.mk,p.meta.md);
  return t ? `/cars/${t.slug}/` : `/cars/${p.meta.slug}/`;
}
const tiles = new Map([
  ["honda|civic",14.2857],["toyota|camry",28.5714],["tesla|model 3",42.8571],
  ["bmw|330i",57.1429],["toyota|rav4",71.4286],["ford|f-150",85.7143],["hyundai|tucson",100]
]);
function carImage(make,model,label){
  const pos=tiles.get(`${make}|${model}`.toLowerCase());
  if(pos==null) return `<div class="rf-car-fallback">${esc(make)} ${esc(model)}</div>`;
  return `<span class="rf-car" role="img" aria-label="${esc(label)}" style="background-image:url('${CAR_SPRITE}');background-position:center ${pos}%"></span>`;
}

const popular = [
  profile(2020,"Honda","Civic"),
  profile(2019,"Toyota","Camry"),
  profile(2020,"Toyota","RAV4"),
  profile(2020,"Ford","F-150")
].filter(Boolean);

const guides = [
  ["COMMON PROBLEMS", profile(2018,"Toyota","Camry")],
  ["RELIABILITY", profile(2020,"Honda","Civic")],
  ["RECALLS", profile(2020,"Toyota","RAV4")],
  ["COMMON PROBLEMS", profile(2020,"Ford","F-150")],
  ["RELIABILITY", profile(2019,"Toyota","Camry")],
  ["COST ESTIMATES", profile(2021,"Honda","CR-V") || profile(2021,"Toyota","Corolla")]
].filter(([,p])=>p);

const compare = [
  profile(2020,"Honda","Civic"),
  profile(2019,"Toyota","Camry"),
  profile(2020,"Toyota","RAV4"),
  profile(2020,"Ford","F-150")
].filter(Boolean);

function popularCard(p){
  const problems=(p?.federal?.topComponents||[]).slice(0,2).map(x=>human(x.component)).join(", ") || human(topArea(p));
  return `<a class="rf-pop-card" href="${hrefFor(p)}">
    <div class="rf-pop-copy"><h3>${p.meta.y} ${esc(p.meta.mk)} ${esc(p.meta.md)}</h3><p>${esc(targetFor(p.meta.mk,p.meta.md)?.segment || "Used Car")}</p></div>
    <div class="rf-pop-image">${carImage(p.meta.mk,p.meta.md,`${p.meta.y} ${p.meta.mk} ${p.meta.md}`)}</div>
    <div class="rf-pop-stats"><span><small>Top Problems</small><b>${esc(problems)}</b></span><span><small>Complaints</small><b>${fmt(complaintCount(p))}</b></span><span><small>Recalls</small><b>${fmt(recallCount(p))}</b></span></div>
  </a>`;
}
function guideCard(label,p){
  return `<a class="rf-guide" href="/cars/${esc(p.meta.slug)}/">
    <span class="rf-badge">${label}</span>
    <h3>${p.meta.y} ${esc(p.meta.mk)} ${esc(p.meta.md)}</h3>
    <div class="rf-guide-image">${carImage(p.meta.mk,p.meta.md,`${p.meta.y} ${p.meta.mk} ${p.meta.md}`)}</div>
    <div class="rf-guide-stats"><span><small>Complaints</small><b>${fmt(complaintCount(p))}</b></span><span><small>Recalls</small><b>${fmt(recallCount(p))}</b></span></div>
  </a>`;
}

const brands = [
  ["Toyota","toyota","D71921"],["Honda","honda","111111"],["Ford","ford","003478"],["Chevrolet","chevrolet","C89B3C"],
  ["Nissan","nissan","111111"],["BMW","bmw","0066B1"],["Mercedes-Benz","mercedes","111111"],["Audi","audi","111111"],
  ["Tesla","tesla","E82127"],["Hyundai","hyundai","002C5F"],["Kia","kia","111111"]
];
const brandHtml = brands.map(([name,slug,color])=>`<a class="rf-brand" href="/cars/"><img src="https://cdn.simpleicons.org/${slug}/${color}" alt="" loading="lazy"><span>${name}</span></a>`).join("");

const topics = [
  ["▦","Common Problems","See the issues owners report most often.","/cars/"],
  ["↗","Years to Avoid","Identify model years that deserve extra attention.","/cars/"],
  ["⌁","Best Used Years","Find the model years with fewer problems.","/cars/"],
  ["R","Recalls","Check active and past recall campaigns.","/cars/"],
  ["◉","Reliability","Understand complaint patterns over time.","/cars/"],
  ["$","Ownership Cost","Estimate fuel, insurance, repairs & 5-year cost.","/cars/"]
].map(([i,t,d,h])=>`<a class="rf-topic" href="${h}"><span>${i}</span><h3>${t}</h3><p>${d}</p></a>`).join("");

const trust = [
  ["◫","NHTSA-backed","Complaints & recall data"],
  ["⌁","Buyer-first","We don’t sell cars"],
  ["▣","5-Year Cost Estimates","Ownership cost modeling"],
  ["◇","No Seller Payments","Independent & unbiased"]
].map(([i,t,d])=>`<div class="rf-trust"><span>${i}</span><div><b>${t}</b><small>${d}</small></div></div>`).join("");

const header = `<nav class="rf-nav"><div class="rf-navin">
  <a class="rf-logo" href="/"><span>K</span><b>KickTires</b></a>
  <div class="rf-menu"><a href="/#check">Analyze a Car</a><a href="/cars/">Research⌄</a><a href="/cars/">Compare</a><a href="/cars/">Best Years</a><a href="/cars/">Common Problems</a><a href="/about/">About</a></div>
  <div class="rf-actions"><a class="rf-saved" href="/cars/">♡ Saved</a><a class="rf-primary" href="/#check">Analyze a Car</a></div>
</div></nav>`;

const compareHeads = compare.map(p=>`<div class="rf-compare-head">${carImage(p.meta.mk,p.meta.md,`${p.meta.y} ${p.meta.mk} ${p.meta.md}`)}<b>${p.meta.y} ${esc(p.meta.mk)} ${esc(p.meta.md)}</b><small>${esc(targetFor(p.meta.mk,p.meta.md)?.segment || "Used Car")}</small></div>`).join("");
const row = (label, fn) => `<div class="rf-row-label">${label}</div>${compare.map(fn).join("")}`;
const compareTable = `<div class="rf-compare">
  <div class="rf-row-label rf-key">Key Factors</div>${compareHeads}
  ${row("NHTSA Complaints", p=>`<div>${fmt(complaintCount(p))}</div>`)}
  ${row("Recall Campaigns", p=>`<div>${fmt(recallCount(p))}</div>`)}
  ${row("Top Reported Area", p=>`<div>${esc(human(topArea(p)))}</div>`)}
  ${row("Annual Repair Reserve", p=>`<div>${p?.tco?.repair ? `$${fmt(p.tco.repair)}` : "Analyzer"}</div>`)}
  ${row("EPA Snapshot", p=>`<div>${p?.tco?.mpg || p?.epa?.mpg ? `${Math.round(p?.tco?.mpg || p?.epa?.mpg)} mpg` : "Analyzer"}</div>`)}
</div>`;

const main = `<main class="rf-page">
<section class="rf-hero" id="check">
  <div class="rf-hero-bg"></div>
  <div class="rf-shell rf-hero-in">
    <div class="rf-hero-copy">
      <h1>Research Any Used Car<br>Before You Buy</h1>
      <p>KickTires gives you the data you need to buy with confidence.<br>Problems. Recalls. Costs. Price context.</p>
      <div class="rf-analyzer">
        <div class="rf-tabs"><button class="on" type="button" data-mode="listing">Paste a Listing</button><button type="button" data-mode="car">Search by Car</button></div>
        <form onsubmit="route(event);return false">
          <div class="rf-input-wrap"><span>↗</span><textarea id="inp" autocomplete="off" spellcheck="false" placeholder="Paste a Cars.com, AutoTrader, CarGurus, or dealer listing"></textarea></div>
          <button class="rf-analyze" id="analyzeBtn" type="submit">Analyze This Car</button>
        </form>
        <p id="hint" class="rf-hint" aria-live="polite"></p>
      </div>
    </div>
  </div>
</section>

<section class="rf-shell rf-trust-row">${trust}</section>

<section class="rf-shell rf-section">
  <div class="rf-section-title"><h2>Browse by Brand</h2><a href="/cars/">View all brands →</a></div>
  <div class="rf-brands">${brandHtml}</div>
</section>

<section class="rf-shell rf-section">
  <div class="rf-section-title"><h2>Popular Used-Car Research</h2><a href="/cars/">View all research →</a></div>
  <div class="rf-pop-grid">${popular.map(popularCard).join("")}</div>
</section>

<section class="rf-shell rf-section">
  <div class="rf-section-title"><h2>Research by What Matters</h2><a href="/cars/">All topics →</a></div>
  <div class="rf-topic-grid">${topics}</div>
</section>

<section class="rf-shell rf-section">
  <div class="rf-section-title"><h2>Popular Model-Year Guides</h2><a href="/cars/">View all guides →</a></div>
  <div class="rf-guide-grid">${guides.map(([l,p])=>guideCard(l,p)).join("")}</div>
</section>

<section class="rf-shell rf-section rf-last">
  <div class="rf-section-title"><h2>Compare Used Cars Beyond Specs</h2><a href="/cars/">Compare different cars →</a></div>
  ${compareTable}
  <div class="rf-compare-cta"><a href="/cars/">Start a comparison →</a></div>
</section>
<div id="live" class="rf-live" aria-live="polite"></div>
</main>`;

const css = `
/* screenshot-reference homepage — final build pass */
body{background:#fff!important;color:#0b1c34!important;font-family:"Avenir Next","Segoe UI Variable","Segoe UI",Inter,system-ui,-apple-system,sans-serif!important}
.rf-nav{height:58px;background:#fff;border-bottom:1px solid #e8edf3;position:relative;z-index:50}
.rf-navin{height:100%;width:min(100%,1180px);margin:auto;padding:0 14px;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:28px}
.rf-logo{display:flex;align-items:center;gap:9px;color:#0b1c34;text-decoration:none;font-weight:850;font-size:20px;letter-spacing:-.035em}
.rf-logo span{display:grid;place-items:center;width:28px;height:28px;background:#115ccf;color:#fff;border-radius:7px;font-size:17px;box-shadow:0 3px 8px rgba(17,92,207,.25)}
.rf-menu{display:flex;align-items:center;justify-content:center;gap:30px}.rf-menu a,.rf-actions a{font-size:11px;font-weight:700;color:#182940;text-decoration:none;white-space:nowrap}
.rf-actions{display:flex;align-items:center;gap:18px}.rf-primary{background:#1767dd!important;color:#fff!important;padding:10px 18px;border-radius:6px;box-shadow:0 5px 12px rgba(23,103,221,.18)}
.rf-page{background:#fff}.rf-shell{width:min(100%,1180px);margin:0 auto;padding-left:34px;padding-right:34px;box-sizing:border-box}
.rf-hero{position:relative;height:370px;overflow:hidden;background:#0a2341}.rf-hero-bg{position:absolute;inset:0;background-image:linear-gradient(90deg,rgba(7,25,48,.96) 0%,rgba(7,25,48,.88) 43%,rgba(7,25,48,.30) 70%,rgba(7,25,48,.08) 100%),url("https://images.unsplash.com/photo-1663316265644-d54f76215a09?auto=format&fit=crop&fm=jpg&q=86&w=1800");background-size:cover;background-position:center 48%;filter:saturate(.82) contrast(1.04)}
.rf-hero-in{position:relative;z-index:2;padding-top:48px}.rf-hero-copy{width:460px;color:#fff}.rf-hero h1{margin:0;font-size:37px;line-height:1.08;letter-spacing:-.045em;color:#fff;font-weight:800}.rf-hero-copy>p{margin:16px 0 18px;font-size:14px;line-height:1.45;color:#fff}
.rf-analyzer{width:396px;background:#fff;border-radius:12px;padding:0 15px 14px;box-shadow:0 16px 32px rgba(5,18,35,.22);color:#152a44}.rf-tabs{height:52px;display:flex;gap:20px;border-bottom:1px solid #e8edf4;margin-bottom:12px}
.rf-tabs button{position:relative;border:0;background:transparent;padding:0 14px;font-size:11px;font-weight:800;color:#5f7084;cursor:pointer}.rf-tabs button.on{color:#125fd4}.rf-tabs button.on:after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:#1767dd}
.rf-input-wrap{height:42px;border:1px solid #dce4ed;border-radius:8px;display:grid;grid-template-columns:32px 1fr;align-items:center;padding:0 9px;background:#fff}.rf-input-wrap>span{font-size:15px;color:#73869a}.rf-input-wrap textarea{width:100%;height:38px;border:0;outline:0;resize:none;padding:11px 0 0;box-sizing:border-box;font:inherit;font-size:11px;color:#24384e;background:transparent;white-space:nowrap;overflow:hidden}
.rf-analyze{width:100%;height:38px;margin-top:11px;border:0;border-radius:6px;background:#1767dd;color:#fff;font-size:11px;font-weight:850;cursor:pointer}
.rf-hint{margin:9px 0 0;min-height:14px;font-size:11px;line-height:1.35;color:#a33a2a}.rf-hint:empty{display:none}
.rf-trust-row{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;padding-top:10px;padding-bottom:10px}.rf-trust{height:52px;border:1px solid #e4eaf1;border-radius:9px;display:flex;align-items:center;gap:10px;padding:0 14px;box-shadow:0 4px 12px rgba(23,54,83,.035)}
.rf-trust>span{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#edf4ff;color:#1767dd;font-weight:800}.rf-trust b{display:block;font-size:10px}.rf-trust small{display:block;margin-top:2px;font-size:9px;color:#697b8e}
.rf-section{padding-top:18px}.rf-section-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:13px}.rf-section-title h2{margin:0;font-size:16px;letter-spacing:-.025em}.rf-section-title a{color:#0b5ed3;text-decoration:none;font-size:9px;font-weight:800}
.rf-brands{display:grid;grid-template-columns:repeat(11,1fr);gap:8px;align-items:start}.rf-brand{display:flex;flex-direction:column;align-items:center;gap:7px;text-decoration:none;color:#1a2a3e;font-size:9px}.rf-brand img{width:34px;height:34px;object-fit:contain}
.rf-pop-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.rf-pop-card{border:1px solid #e1e7ef;border-radius:10px;overflow:hidden;text-decoration:none;color:inherit;background:#fff;box-shadow:0 4px 14px rgba(17,44,72,.035)}.rf-pop-copy{padding:12px 12px 4px}.rf-pop-copy h3{margin:0;font-size:14px;letter-spacing:-.02em}.rf-pop-copy p{margin:3px 0 0;color:#718397;font-size:9px}.rf-pop-image{height:124px;overflow:hidden;background:#f7f9fc}.rf-car{display:block;width:100%;height:100%;background-repeat:no-repeat;background-size:100% 800%;background-color:#f7f9fc}.rf-car-fallback{height:100%;display:grid;place-items:center;color:#7a8da1;font-size:12px}.rf-pop-stats{display:grid;grid-template-columns:1.6fr .7fr .6fr;border-top:1px solid #eef2f6;padding:9px 10px}.rf-pop-stats small,.rf-guide-stats small{display:block;color:#7a8999;font-size:7.5px}.rf-pop-stats b,.rf-guide-stats b{display:block;margin-top:2px;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rf-topic-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:12px}.rf-topic{border:1px solid #e2e8ef;border-radius:9px;padding:13px 12px 12px;text-decoration:none;color:inherit;min-height:87px}.rf-topic>span{width:27px;height:27px;border-radius:50%;display:grid;place-items:center;background:#edf4ff;color:#1767dd;font-size:12px;font-weight:850}.rf-topic h3{font-size:10px;margin:9px 0 4px}.rf-topic p{font-size:8px;line-height:1.45;color:#6d7f92;margin:0}
.rf-guide-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}.rf-guide{border:1px solid #e2e8ef;border-radius:9px;padding:10px;text-decoration:none;color:inherit;overflow:hidden}.rf-badge{display:inline-block;background:#f0f5ff;color:#1767dd;border-radius:7px;padding:4px 6px;font-size:6.8px;font-weight:850}.rf-guide h3{font-size:10px;margin:7px 0 7px}.rf-guide-image{height:92px;background:#f7f9fc;margin:0 -2px;overflow:hidden}.rf-guide-stats{display:grid;grid-template-columns:1fr 1fr;margin-top:6px}
.rf-compare{display:grid;grid-template-columns:155px repeat(4,1fr);border:1px solid #e1e7ef;border-radius:9px;overflow:hidden;font-size:8.5px}.rf-compare>*{padding:8px 10px;border-right:1px solid #e8edf3;border-bottom:1px solid #e8edf3;min-height:27px;box-sizing:border-box}.rf-compare>*:nth-child(5n){border-right:0}.rf-compare-head{display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:9px!important}.rf-compare-head .rf-car{height:58px;width:110px;margin-bottom:4px}.rf-compare-head b{font-size:8.5px}.rf-compare-head small{font-size:7px;color:#6e8092;margin-top:2px}.rf-row-label{font-weight:700;color:#31455b;background:#fbfcfd}.rf-key{display:flex;align-items:center}.rf-compare a{color:#1767dd;text-decoration:none;font-weight:800}.rf-compare-cta{text-align:center;margin-top:-1px}.rf-compare-cta a{display:inline-block;border:1px solid #1767dd;border-radius:6px;padding:7px 18px;color:#1767dd;text-decoration:none;font-size:9px;font-weight:800;background:#fff}
.rf-last{padding-bottom:34px}.rf-live{width:min(100%,1180px);margin:0 auto;padding:0 34px 30px;box-sizing:border-box}.rf-live:empty{display:none}
@media(max-width:980px){.rf-menu{gap:14px}.rf-menu a{font-size:10px}.rf-actions .rf-saved{display:none}.rf-brands{grid-template-columns:repeat(6,1fr)}.rf-guide-grid{grid-template-columns:repeat(3,1fr)}.rf-topic-grid{grid-template-columns:repeat(3,1fr)}}
@media(max-width:720px){.rf-navin{grid-template-columns:auto 1fr}.rf-menu{display:none}.rf-actions{justify-self:end}.rf-shell{padding-left:18px;padding-right:18px}.rf-hero{height:auto;min-height:430px}.rf-hero-bg{background-position:64% center}.rf-hero-in{padding:38px 18px 34px}.rf-hero-copy{width:100%}.rf-hero h1{font-size:34px}.rf-analyzer{width:min(100%,400px);box-sizing:border-box}.rf-trust-row{grid-template-columns:repeat(2,1fr)}.rf-pop-grid{grid-template-columns:repeat(2,1fr)}.rf-brands{grid-template-columns:repeat(4,1fr)}.rf-topic-grid{grid-template-columns:repeat(2,1fr)}.rf-guide-grid{grid-template-columns:repeat(2,1fr)}.rf-compare{overflow-x:auto;display:grid;grid-template-columns:130px repeat(4,150px)}}
`;

let html=fs.readFileSync(FILE,"utf8");
html=html.replace(/<nav[\s\S]*?<\/nav>/i,header);
const mainPattern=/<main[^>]*>[\s\S]*?<\/main>/i;
if(!mainPattern.test(html)) throw new Error("homepage main not found");
html=html.replace(mainPattern,main);
if(!html.includes("screenshot-reference homepage")) html=html.replace("</head>",`<style>${css}</style></head>`);
const tabsScript=`<script id="rfHomeTabs">document.querySelectorAll('.rf-tabs button').forEach(function(b){b.addEventListener('click',function(){document.querySelectorAll('.rf-tabs button').forEach(function(x){x.classList.remove('on')});b.classList.add('on');if(b.dataset.mode==='car'){location.href='/cars/';}})});</script>`;
if(!html.includes("rfHomeTabs")) html=html.replace("</body>",`${tabsScript}</body>`);
fs.writeFileSync(FILE,html);
console.log("[home-reference] homepage rebuilt to match approved reference screenshot");
