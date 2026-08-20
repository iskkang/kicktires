import fs from "node:fs";
import { CAR_SPRITE } from "./car-sprite.mjs";

const FILE = "dist/index.html";
if (!fs.existsSync(FILE)) throw new Error("dist/index.html missing");

const editorial = JSON.parse(fs.readFileSync("data.json", "utf8"));
const generated = JSON.parse(fs.readFileSync("generated.json", "utf8"));
const targets = JSON.parse(fs.readFileSync("research-models.json", "utf8")).models;
const profiles = [...new Map([...Object.values(editorial), ...Object.values(generated)].map(p => [p.meta.slug, p])).values()];

const esc = v => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const norm = v => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const fmt = v => Number(v || 0).toLocaleString("en-US");
const complaints = p => Number.isInteger(p?.federal?.complaintTotal) ? p.federal.complaintTotal : Number(p?.meta?.nhtsa || 0);
const recalls = p => Number.isInteger(p?.federal?.recallTotal) ? p.federal.recallTotal : Number(p?.meta?.recalls || 0);

const bodyStyles = {
  "toyota|camry":"Midsize Sedan","toyota|rav4":"Compact SUV","honda|civic":"Compact Sedan","ford|f-150":"Full-size Truck"
};
const exactTiles = new Map([
  ["honda|civic",14.2857],["toyota|camry",28.5714],["toyota|rav4",71.4286],["ford|f-150",85.7143]
]);

const grouped = new Map();
for (const p of profiles) {
  const key = `${p.meta.mk}|${p.meta.md}`;
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(p);
}
const groups = [...grouped.values()].map(items => items.sort((a,b)=>b.meta.y-a.meta.y));
const findGroup = (make,model) => groups.find(g => norm(g[0].meta.mk)===norm(make) && norm(g[0].meta.md)===norm(model));
const featured = [["Toyota","Camry"],["Honda","Civic"],["Toyota","RAV4"],["Ford","F-150"]].map(([m,d])=>findGroup(m,d)).filter(Boolean);
const makes = [...new Set(groups.map(g=>g[0].meta.mk))].sort();

function targetFor(make,model){ return targets.find(t=>norm(t.make)===norm(make)&&norm(t.model)===norm(model)); }
function hrefFor(p){ const t=targetFor(p.meta.mk,p.meta.md); return t?`/cars/${t.slug}/`:`/cars/${p.meta.slug}/`; }
function aggregate(items){
  const years=[...new Set(items.map(x=>x.meta.y))].sort((a,b)=>a-b);
  return {years, complaints:items.reduce((s,p)=>s+complaints(p),0), recalls:items.reduce((s,p)=>s+recalls(p),0)};
}
function imageFor(make,model,label){
  const key=`${make}|${model}`.toLowerCase(), pos=exactTiles.get(key);
  if(pos==null) return `<span class="hp-photo hp-photo-empty"><b>${esc(make)}</b><strong>${esc(model)}</strong></span>`;
  return `<span class="hp-photo" role="img" aria-label="${esc(label)}" style="background-image:url('${CAR_SPRITE}');background-position:center ${pos}%"></span>`;
}
function card(items){
  const p=items[0], a=aggregate(items), key=`${p.meta.mk}|${p.meta.md}`.toLowerCase();
  return `<a class="hp-card" href="${hrefFor(p)}"><div class="hp-card-head"><div><span>${esc(p.meta.mk)}</span><h3>${esc(p.meta.md)}</h3><p>${a.years[0]}–${a.years.at(-1)}</p></div><em>${esc(bodyStyles[key]||"Used Vehicle")}</em></div><div class="hp-card-image">${imageFor(p.meta.mk,p.meta.md,`${p.meta.mk} ${p.meta.md}`)}</div><div class="hp-card-stats"><span><b>${fmt(a.complaints)}</b><small>NHTSA complaints</small></span><span><b>${fmt(a.recalls)}</b><small>Recall campaigns</small></span><span><b>${a.years.length}</b><small>Model years</small></span></div><div class="hp-card-link">View Research <i>→</i></div></a>`;
}

const makeLinks = makes.slice(0,8).map(make=>`<a href="/cars/" class="hp-brand"><span>${esc(make.slice(0,1))}</span><b>${esc(make)}</b></a>`).join("");
const cards = featured.map(card).join("");

const topic = (icon,title,text,href) => `<a class="hp-topic" href="${href}"><span>${icon}</span><h3>${title}</h3><p>${text}</p><b>Explore →</b></a>`;
const camryTarget=targets.find(t=>norm(t.make)==="toyota"&&norm(t.model)==="camry");
const civicTarget=targets.find(t=>norm(t.make)==="honda"&&norm(t.model)==="civic");
const topics=[
  topic("!","Common Problems","See the systems owners report most often.",civicTarget?`/cars/${civicTarget.slug}/#problems`:"/cars/"),
  topic("Y","Model Years","Compare model years before you start shopping.",camryTarget?`/cars/${camryTarget.slug}/#years`:"/cars/"),
  topic("✓","Lower-report Years","Find stronger model-year candidates quickly.",civicTarget?`/cars/${civicTarget.slug}/#years`:"/cars/"),
  topic("R","Recalls","Review federal recall campaigns and VIN applicability.",camryTarget?`/cars/${camryTarget.slug}/#problems`:"/cars/"),
  topic("?","Reliability","Use real complaint patterns instead of invented scores.",civicTarget?`/cars/${civicTarget.slug}/`:"/cars/"),
  topic("$","Ownership Cost","Plan fuel, insurance and repair reserve.",camryTarget?`/cars/${camryTarget.slug}/#costs`:"/cars/")
].join("");

const css=`
/* premium homepage redesign */
body{background:#f7f9fc!important;color:#0d2038!important}.kt-home{display:none!important}.hp-page{font-family:"Avenir Next","Segoe UI Variable","Segoe UI",Inter,system-ui,-apple-system,sans-serif;color:#0d2038}.hp-shell{width:min(100%,1240px);margin:0 auto;padding:0 24px}.hp-hero{position:relative;overflow:hidden;min-height:430px;background:#071d35}.hp-hero-bg{position:absolute;inset:0;background-image:linear-gradient(90deg,rgba(5,19,35,.98) 0%,rgba(5,19,35,.91) 43%,rgba(5,19,35,.42) 67%,rgba(5,19,35,.12) 100%),url('${CAR_SPRITE}');background-repeat:no-repeat;background-size:auto,100% 800%;background-position:center,center 57.1429%;filter:saturate(.92) contrast(1.05)}.hp-hero-in{position:relative;z-index:2;padding:56px 24px 48px;color:#fff}.hp-kicker{display:block;font-size:11px;letter-spacing:.13em;text-transform:uppercase;font-weight:800;color:#9fc4ef}.hp-hero h1{max-width:670px;margin:10px 0 12px;font-size:58px;line-height:1.01;letter-spacing:-.052em;color:#fff}.hp-hero-lede{max-width:660px;margin:0 0 24px;color:#d9e7f4;font-size:17px;line-height:1.55}.hp-analyzer{width:min(760px,100%);background:#fff;border-radius:14px;padding:8px;box-shadow:0 18px 44px rgba(0,0,0,.24)}.hp-analyzer textarea{display:block;width:100%;height:74px;resize:vertical;border:1px solid #dfe6ef;border-radius:10px;padding:12px 13px;font:inherit;font-size:14px;color:#193149;background:#f9fbfd;box-sizing:border-box}.hp-analyzer textarea:focus{outline:0;border-color:#8bb1e4;box-shadow:0 0 0 3px rgba(23,103,221,.1)}.hp-form-foot{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:8px 2px 0}.hp-form-foot span{font-size:10px;color:#718398}.hp-form-foot button{height:44px;border:0;border-radius:9px;padding:0 24px;background:#1767dd;color:#fff;font-weight:780;cursor:pointer}.hp-hero-links{display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin-top:13px}.hp-hero-links button{border:0;background:transparent;padding:0;color:#b9d4f1;font-weight:700;font-size:11px;cursor:pointer}.hp-hero-links a{color:#fff;font-size:11px;font-weight:800;text-decoration:none}.hp-hero-trust{display:flex;gap:16px;flex-wrap:wrap;margin-top:18px;font-size:10px;color:#b4cae0}.hp-hero-trust span:before{content:"✓";color:#55d48d;font-weight:900;margin-right:5px}.hp-brands{background:#fff;border-bottom:1px solid #e4eaf1}.hp-brand-row{display:flex;align-items:center;gap:9px;overflow-x:auto;padding:16px 24px;scrollbar-width:none}.hp-brand-row::-webkit-scrollbar{display:none}.hp-brand{min-width:118px;height:52px;border:1px solid #e1e7ef;border-radius:10px;background:#fff;display:flex;align-items:center;gap:9px;padding:0 12px;text-decoration:none;color:#263c54}.hp-brand span{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#eef4fc;color:#1767dd;font-size:12px;font-weight:850}.hp-brand b{font-size:12px}.hp-content{padding:34px 24px 72px}.hp-heading{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:18px}.hp-heading h2{margin:4px 0 0;font-size:30px;letter-spacing:-.04em}.hp-heading p{margin:4px 0 0;color:#6c7f92;font-size:12px}.hp-heading a{font-size:12px;color:#0d5fd3;font-weight:800;text-decoration:none}.hp-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.hp-card{background:#fff;border:1px solid #e1e8ef;border-radius:14px;overflow:hidden;text-decoration:none;color:inherit;box-shadow:0 8px 22px rgba(27,53,79,.055);transition:.18s}.hp-card:hover{transform:translateY(-3px);box-shadow:0 15px 32px rgba(27,53,79,.11)}.hp-card-head{display:flex;justify-content:space-between;gap:12px;padding:16px 16px 9px}.hp-card-head span{font-size:10px;text-transform:uppercase;letter-spacing:.07em;font-weight:850;color:#1767dd}.hp-card h3{margin:4px 0 2px;font-size:21px;letter-spacing:-.035em;color:#112943}.hp-card-head p{margin:0;color:#687c91;font-size:11px}.hp-card-head em{height:max-content;padding:5px 7px;border-radius:7px;background:#f1f5f9;color:#66798d;font-size:9px;font-style:normal}.hp-card-image{height:155px;background:#f4f7fa;overflow:hidden}.hp-photo{display:block;width:100%;height:100%;background-repeat:no-repeat;background-size:100% 800%;background-color:#f4f7fa}.hp-photo-empty{display:flex;align-items:center;justify-content:center;flex-direction:column;color:#8091a3}.hp-photo-empty strong{font-size:20px}.hp-card-stats{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid #edf1f5;border-bottom:1px solid #edf1f5}.hp-card-stats span{padding:10px;border-right:1px solid #edf1f5}.hp-card-stats span:last-child{border:0}.hp-card-stats b{display:block;font-size:13px}.hp-card-stats small{display:block;margin-top:2px;font-size:8.5px;color:#77899c;line-height:1.15}.hp-card-link{padding:12px 15px;color:#0c5bd1;font-size:11px;font-weight:800}.hp-card-link i{float:right;font-style:normal}.hp-topics{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-top:18px}.hp-topic{background:#fff;border:1px solid #e1e8ef;border-radius:12px;padding:16px;text-decoration:none;color:inherit}.hp-topic>span{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;background:#edf4ff;color:#1767dd;font-weight:850}.hp-topic h3{font-size:13px;margin:12px 0 5px}.hp-topic p{font-size:10px;line-height:1.45;color:#6c7e91;min-height:44px}.hp-topic b{font-size:10px;color:#1767dd}.hp-why{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:18px}.hp-why article{background:#fff;border:1px solid #e1e8ef;border-radius:12px;padding:18px}.hp-why h3{margin:0 0 6px;font-size:14px}.hp-why p{margin:0;color:#6b7e91;font-size:11px;line-height:1.5}.hp-cta{margin-top:34px;border-radius:16px;padding:28px 30px;background:linear-gradient(110deg,#0a2f5a,#0e5ba7);color:#fff;display:flex;align-items:center;justify-content:space-between;gap:26px}.hp-cta h2{margin:0 0 6px;color:#fff;font-size:26px;letter-spacing:-.035em}.hp-cta p{margin:0;color:#d6e6f6;font-size:12px}.hp-cta a{white-space:nowrap;background:#fff;color:#0d5cc9;border-radius:9px;padding:12px 17px;text-decoration:none;font-size:11px;font-weight:850}.hp-live{width:min(100%,1240px);margin:0 auto;padding:0 24px}.hp-live:empty{display:none}
@media(max-width:980px){.hp-grid{grid-template-columns:repeat(2,1fr)}.hp-topics{grid-template-columns:repeat(3,1fr)}.hp-hero h1{font-size:48px}.hp-hero-bg{background-size:auto,auto 800%}}
@media(max-width:640px){.hp-hero{min-height:440px}.hp-hero-in{padding:42px 18px}.hp-hero h1{font-size:38px}.hp-hero-lede{font-size:14px}.hp-form-foot{align-items:flex-start;flex-direction:column}.hp-form-foot button{width:100%}.hp-content{padding:28px 18px 58px}.hp-brand-row{padding-left:18px}.hp-grid{grid-template-columns:1fr}.hp-topics{grid-template-columns:repeat(2,1fr)}.hp-why{grid-template-columns:1fr}.hp-heading{align-items:flex-start;flex-direction:column}.hp-cta{align-items:flex-start;flex-direction:column}}
`;

const main=`<main class="hp-page">
<section class="hp-hero" id="check"><div class="hp-hero-bg"></div><div class="hp-shell hp-hero-in"><span class="hp-kicker">Buyer-first used-car intelligence</span><h1>Analyze Any Used Car Before You Buy</h1><p class="hp-hero-lede">Paste a listing and check common problems, recalls, price context and estimated ownership cost before you spend your money.</p><form class="hp-analyzer" onsubmit="route(event);return false"><textarea id="inp" autocomplete="off" spellcheck="false" placeholder="Paste a Cars.com, AutoTrader, CarGurus, Facebook Marketplace, or dealer listing"></textarea><div class="hp-form-foot"><span>No account needed · listing text is not sent to Analytics</span><button id="analyzeBtn" type="submit">Analyze This Car</button></div></form><div class="hp-hero-links"><button type="button" onclick="useExample()">Try a real example</button><a href="/cars/">No listing yet? Research a make &amp; model →</a></div><p id="hint" class="hint" aria-live="polite"></p><div class="hp-hero-trust"><span>Federal records</span><span>Buyer-first analysis</span><span>No dealer payments</span></div></div></section>
<div id="live" class="hp-live" aria-live="polite"></div>
<section class="hp-brands"><div class="hp-shell hp-brand-row">${makeLinks}<a class="hp-brand" href="/cars/"><span>+</span><b>All Models</b></a></div></section>
<section class="hp-shell hp-content"><div class="hp-heading"><div><span class="hp-kicker" style="color:#6e8297">Popular research</span><h2>Start With Cars Buyers Often Check</h2><p>Real federal complaint and recall evidence, organized before you shop.</p></div><a href="/cars/">Browse all research →</a></div><div class="hp-grid">${cards}</div>
<div class="hp-heading" style="margin-top:44px"><div><span class="hp-kicker" style="color:#6e8297">Research by what matters</span><h2>Answer the Question You Actually Have</h2><p>Start with the buying question, then narrow to the model and year.</p></div><a href="/cars/">All research →</a></div><div class="hp-topics">${topics}</div>
<div class="hp-heading" style="margin-top:44px"><div><span class="hp-kicker" style="color:#6e8297">Why KickTires</span><h2>Buyer-side research, not another car marketplace</h2></div></div><div class="hp-why"><article><h3>Know common problems before you pay</h3><p>Complaint categories show you where an inspection deserves extra attention.</p></article><article><h3>Check recall history in seconds</h3><p>Review federal campaigns, then verify the exact VIN before buying.</p></article><article><h3>Estimate the real cost of ownership</h3><p>Look beyond the sticker price to fuel, insurance, taxes and repair reserve.</p></article></div>
<section class="hp-cta"><div><h2>Buy Your Next Used Car With Eyes Open</h2><p>Analyze the actual listing before you make the trip, negotiate, or pay.</p></div><a href="#check">Analyze a Car for Free →</a></section></section></main>`;

let html=fs.readFileSync(FILE,"utf8");
const pattern=/<main class="kt-home">[\s\S]*?<\/main>/i;
if(!pattern.test(html)) throw new Error("kt-home main not found");
html=html.replace(pattern,main);
if(!html.includes("premium homepage redesign")) html=html.replace("</style>",`${css}</style>`);
fs.writeFileSync(FILE,html);
console.log("[home-premium] homepage rebuilt in approved premium automotive style");
