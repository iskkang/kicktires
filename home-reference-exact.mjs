import fs from "node:fs";
import { CAR_SPRITE } from "./car-sprite.mjs";

const FILE = "dist/index.html";
if (!fs.existsSync(FILE)) throw new Error("dist/index.html missing");

const generated = JSON.parse(fs.readFileSync("generated.json", "utf8"));
const editorial = JSON.parse(fs.readFileSync("data.json", "utf8"));
const profiles = [...Object.values(generated), ...Object.values(editorial)];
const norm = v => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const fmt = v => Number(v || 0).toLocaleString("en-US");
const esc = v => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const profile = (year,make,model) => profiles.find(p => Number(p?.meta?.y)===year && norm(p?.meta?.mk)===norm(make) && norm(p?.meta?.md)===norm(model));
const complaints = p => p ? (Number.isInteger(p?.federal?.complaintTotal) ? p.federal.complaintTotal : Number(p?.meta?.nhtsa || 0)) : null;
const recalls = p => p ? (Number.isInteger(p?.federal?.recallTotal) ? p.federal.recallTotal : Number(p?.meta?.recalls || 0)) : null;
const topArea = p => p?.federal?.topComponents?.[0]?.component ? String(p.federal.topComponents[0].component).toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()) : "Research guide";

const tiles = {
  "honda|civic":14.2857,
  "toyota|camry":28.5714,
  "tesla|model 3":42.8571,
  "bmw|330i":57.1429
};
function car(make,model,label){
  const pos=tiles[`${make}|${model}`.toLowerCase()];
  return `<span class="rf-car" role="img" aria-label="${esc(label)}" style="background-image:url('${CAR_SPRITE}');background-position:center ${pos}%"></span>`;
}

const civic=profile(2020,"Honda","Civic");
const camry=profile(2019,"Toyota","Camry");
const vehicles=[
  {year:2020,make:"Honda",model:"Civic",segment:"Compact Car",href:civic?`/cars/${civic.meta.slug}/`:"/cars/",p:civic},
  {year:2019,make:"Toyota",model:"Camry",segment:"Midsize Sedan",href:camry?`/cars/${camry.meta.slug}/`:"/cars/",p:camry},
  {year:2021,make:"Tesla",model:"Model 3",segment:"Electric Sedan",href:"/cars/",p:null},
  {year:2019,make:"BMW",model:"330i",segment:"Luxury Sedan",href:"/cars/bmw-330i/",p:null}
];

function popCard(v){
  const c=complaints(v.p), r=recalls(v.p), top=topArea(v.p);
  return `<a class="rf-pop-card" href="${v.href}">
    <div class="rf-pop-copy"><h3>${v.year} ${v.make} ${v.model}</h3><p>${v.segment}</p></div>
    <div class="rf-pop-image">${car(v.make,v.model,`${v.year} ${v.make} ${v.model}`)}</div>
    <div class="rf-pop-stats">
      <span><small>Top Problems</small><b>${esc(top)}</b></span>
      <span><small>Complaints</small><b>${c==null?"—":fmt(c)}</b></span>
      <span><small>Recalls</small><b>${r==null?"—":fmt(r)}</b></span>
    </div>
  </a>`;
}

function compareHead(v){
  return `<div class="rf-compare-head">${car(v.make,v.model,`${v.year} ${v.make} ${v.model}`)}<b>${v.year} ${v.make} ${v.model}</b><small>${v.segment}</small></div>`;
}
const compare = `<div class="rf-compare">
  <div class="rf-row-label rf-key">Key Factors</div>${vehicles.map(compareHead).join("")}
  <div class="rf-row-label">NHTSA Complaints</div>${vehicles.map(v=>`<div>${complaints(v.p)==null?"—":fmt(complaints(v.p))}</div>`).join("")}
  <div class="rf-row-label">Recall Campaigns</div>${vehicles.map(v=>`<div>${recalls(v.p)==null?"—":fmt(recalls(v.p))}</div>`).join("")}
  <div class="rf-row-label">Top Reported Area</div>${vehicles.map(v=>`<div>${v.p?esc(topArea(v.p)):"Research guide"}</div>`).join("")}
  <div class="rf-row-label">Annual Repair Reserve</div>${vehicles.map(v=>`<div>${v.p?.tco?.repair?`$${fmt(v.p.tco.repair)}`:"Analyzer"}</div>`).join("")}
  <div class="rf-row-label">EPA Snapshot</div>${vehicles.map(v=>`<div>${v.p?.tco?.mpg||v.p?.epa?.mpg?`${Math.round(v.p?.tco?.mpg||v.p?.epa?.mpg)} mpg`:"Analyzer"}</div>`).join("")}
</div>`;

let html=fs.readFileSync(FILE,"utf8");
const popularSection=`<section class="rf-shell rf-section">
  <div class="rf-section-title"><h2>Popular Used-Car Research</h2><a href="/cars/">View all research →</a></div>
  <div class="rf-pop-grid">${vehicles.map(popCard).join("")}</div>
</section>`;
html=html.replace(/<section class="rf-shell rf-section">\s*<div class="rf-section-title"><h2>Popular Used-Car Research<\/h2>[\s\S]*?<\/section>/,popularSection);

const compareSection=`<section class="rf-shell rf-section rf-last">
  <div class="rf-section-title"><h2>Compare Used Cars Beyond Specs</h2><a href="/cars/">Compare different cars →</a></div>
  ${compare}
  <div class="rf-compare-cta"><a href="/cars/">Start a comparison →</a></div>
</section>`;
html=html.replace(/<section class="rf-shell rf-section rf-last">[\s\S]*?<\/section>/,compareSection);

if(!html.includes("homeReferenceExact")) html=html.replace("</body>",`<script id="homeReferenceExact">window.__kicktiresHomeReference='exact-v1';</script></body>`);
fs.writeFileSync(FILE,html);
console.log("[home-reference-exact] matched approved Civic/Camry/Model 3/330i homepage lineup without invented federal data");
