import fs from "node:fs";
import { CAR_SPRITE } from "./car-sprite.mjs";

const FILE = "dist/cars/index.html";
if (!fs.existsSync(FILE)) throw new Error("dist/cars/index.html missing");

const editorial = JSON.parse(fs.readFileSync("data.json", "utf8"));
const generated = JSON.parse(fs.readFileSync("generated.json", "utf8"));
const targets = JSON.parse(fs.readFileSync("research-models.json", "utf8")).models;
const profiles = [...new Map([...Object.values(editorial), ...Object.values(generated)]
  .map(p => [p.meta.slug, p])).values()];

const esc = v => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const norm = v => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const fmt = v => Number(v || 0).toLocaleString("en-US");
const complaintCount = p => Number.isInteger(p?.federal?.complaintTotal) ? p.federal.complaintTotal : Number(p?.meta?.nhtsa || 0);
const recallCount = p => Number.isInteger(p?.federal?.recallTotal) ? p.federal.recallTotal : Number(p?.meta?.recalls || 0);

const bodyStyles = {
  "toyota|camry":"Midsize Sedan","toyota|corolla":"Compact Sedan","toyota|rav4":"Compact SUV",
  "honda|civic":"Compact Sedan","honda|accord":"Midsize Sedan","honda|cr-v":"Compact SUV",
  "nissan|altima":"Midsize Sedan","nissan|rogue":"Compact SUV","ford|f-150":"Full-size Truck",
  "jeep|grand cherokee":"Midsize SUV","bmw|x5":"Luxury SUV"
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
const groups = [...grouped.values()].map(items => items.sort((a,b)=>b.meta.y-a.meta.y))
  .sort((a,b)=>(a[0].meta.priority??999)-(b[0].meta.priority??999)||a[0].meta.mk.localeCompare(b[0].meta.mk)||a[0].meta.md.localeCompare(b[0].meta.md));

function targetFor(make,model){ return targets.find(t=>norm(t.make)===norm(make)&&norm(t.model)===norm(model)); }
function hrefFor(p){ const t=targetFor(p.meta.mk,p.meta.md); return t?`/cars/${t.slug}/`:`/cars/${p.meta.slug}/`; }
function imageFor(make,model,label){
  const key=`${make}|${model}`.toLowerCase();
  const pos=exactTiles.get(key);
  if (pos != null) return `<span class="cp-photo" role="img" aria-label="${esc(label)}" style="background-image:url('${CAR_SPRITE}');background-position:center ${pos}%"></span>`;
  return `<span class="cp-photo cp-photo-empty" role="img" aria-label="${esc(label)} image pending"><b>${esc(make)}</b><strong>${esc(model)}</strong><small>Vehicle image coming soon</small></span>`;
}
function aggregate(items){
  const years=[...new Set(items.map(x=>x.meta.y))].sort((a,b)=>a-b);
  return {
    years,
    complaints:items.reduce((s,p)=>s+complaintCount(p),0),
    recalls:items.reduce((s,p)=>s+recallCount(p),0)
  };
}
function card(items){
  const p=items[0], a=aggregate(items), key=`${p.meta.mk}|${p.meta.md}`.toLowerCase();
  return `<a class="cp-card" data-make="${esc(p.meta.mk.toLowerCase())}" data-search="${esc(`${p.meta.mk} ${p.meta.md}`.toLowerCase())}" data-years="${a.years.length}" href="${hrefFor(p)}">
    <div class="cp-card-top"><div><span class="cp-brand">${esc(p.meta.mk)}</span><h3>${esc(p.meta.md)}</h3><p>${a.years[0]}–${a.years.at(-1)}</p></div><span class="cp-type">${esc(bodyStyles[key]||"Used Vehicle")}</span></div>
    <div class="cp-image">${imageFor(p.meta.mk,p.meta.md,`${p.meta.mk} ${p.meta.md}`)}</div>
    <div class="cp-stats"><span><b>${fmt(a.complaints)}</b><small>NHTSA complaints</small></span><span><b>${fmt(a.recalls)}</b><small>Recall campaigns</small></span><span><b>${a.years.length}</b><small>Model years</small></span></div>
    <div class="cp-link">View Research <span>→</span></div>
  </a>`;
}

const makes=[...new Set(groups.map(g=>g[0].meta.mk))];
const makeCounts=new Map(makes.map(m=>[m,groups.filter(g=>g[0].meta.mk===m).length]));
const cards=groups.map(card).join("");
const pills=makes.map(make=>`<button class="cp-make" data-make="${esc(make.toLowerCase())}"><span class="cp-logo-dot">${esc(make.slice(0,1))}</span><b>${esc(make)}</b><small>${makeCounts.get(make)} model${makeCounts.get(make)===1?"":"s"}</small></button>`).join("");

const css=`
/* approved premium /cars redesign */
body{background:#f7f9fc!important;color:#0c1f38!important}.cars-hub,.research-hero,.research-grid,.model-groups,.model-index-tools{display:none!important}
.cp-page{font-family:"Avenir Next","Segoe UI Variable","Segoe UI",Inter,system-ui,-apple-system,sans-serif;color:#0c1f38}.cp-hero{position:relative;overflow:hidden;min-height:340px;background:#0a1f38}.cp-hero-bg{position:absolute;inset:0;background-image:linear-gradient(90deg,rgba(5,20,38,.96) 0%,rgba(5,20,38,.86) 43%,rgba(5,20,38,.16) 72%,rgba(5,20,38,.04) 100%),url('${CAR_SPRITE}');background-size:auto,100% 800%;background-position:center,center 57.1429%;filter:saturate(.9) contrast(1.05)}.cp-shell{width:min(100%,1240px);margin:0 auto;padding:0 24px}.cp-hero-in{position:relative;z-index:2;padding:64px 24px 54px;color:#fff}.cp-kicker{font-size:11px;letter-spacing:.13em;text-transform:uppercase;font-weight:800;color:#9dc1ec}.cp-hero h1{font-size:52px;line-height:1.02;letter-spacing:-.05em;margin:10px 0 12px;color:#fff}.cp-hero p{font-size:17px;line-height:1.55;color:#dce8f5;max-width:620px;margin:0}.cp-search{display:grid;grid-template-columns:36px 1fr auto;align-items:center;width:min(720px,100%);margin-top:25px;background:#fff;border-radius:12px;padding:7px;box-shadow:0 15px 36px rgba(0,0,0,.22)}.cp-search i{font-style:normal;color:#718398;text-align:center;font-size:20px}.cp-search input{height:46px;border:0;outline:0;background:transparent;font-size:15px;color:#18314d}.cp-search button{height:46px;padding:0 26px;border:0;border-radius:9px;background:#1767dd;color:#fff;font-weight:750;font-size:14px;cursor:pointer}.cp-brands{background:#fff;border-bottom:1px solid #e5ebf2}.cp-brand-row{display:flex;gap:10px;align-items:stretch;overflow-x:auto;padding:18px 24px;scrollbar-width:none}.cp-brand-row::-webkit-scrollbar{display:none}.cp-make{min-width:128px;border:1px solid #e2e8f0;background:#fff;border-radius:10px;padding:10px 12px;display:grid;grid-template-columns:28px 1fr;grid-template-rows:auto auto;column-gap:8px;text-align:left;align-items:center;cursor:pointer;color:#203750}.cp-make b{font-size:13px}.cp-make small{font-size:10px;color:#77899d}.cp-logo-dot{grid-row:1/3;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#eff5fd;color:#1767dd;font-size:12px;font-weight:850}.cp-make.on{border-color:#1767dd;background:#f4f8ff;box-shadow:inset 0 0 0 1px #1767dd}.cp-all{min-width:92px;display:flex;align-items:center;justify-content:center;gap:6px}.cp-content{padding:34px 24px 72px}.cp-toolbar{display:flex;align-items:flex-end;justify-content:space-between;gap:22px;margin-bottom:20px}.cp-toolbar h2{font-size:28px;letter-spacing:-.035em;margin:0}.cp-toolbar p{margin:6px 0 0;color:#6b7e92;font-size:13px}.cp-tools{display:flex;gap:10px;align-items:center}.cp-tools select{height:42px;border:1px solid #dce4ed;background:#fff;border-radius:9px;padding:0 34px 0 12px;color:#344c64;font-size:12px}.cp-count{font-size:12px;font-weight:750;color:#6b7e92;background:#eef3f8;padding:8px 10px;border-radius:8px}.cp-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.cp-card{background:#fff;border:1px solid #e2e8ef;border-radius:14px;overflow:hidden;text-decoration:none;color:inherit;box-shadow:0 8px 24px rgba(27,54,82,.055);transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}.cp-card:hover{transform:translateY(-3px);box-shadow:0 16px 34px rgba(27,54,82,.11);border-color:#c6d5e5}.cp-card[hidden]{display:none!important}.cp-card-top{display:flex;justify-content:space-between;gap:12px;padding:18px 18px 10px}.cp-brand{font-size:11px;font-weight:800;color:#1767dd;text-transform:uppercase;letter-spacing:.06em}.cp-card h3{font-size:22px;line-height:1.05;margin:4px 0;color:#10243e;letter-spacing:-.035em}.cp-card-top p{margin:0;color:#62778e;font-size:12px}.cp-type{height:max-content;background:#f1f5f9;border-radius:7px;padding:6px 8px;font-size:10px;color:#60748a;white-space:nowrap}.cp-image{height:205px;background:#f7f9fc;overflow:hidden}.cp-photo{display:block;width:100%;height:100%;background-repeat:no-repeat;background-size:100% 800%;background-color:#f4f7fa}.cp-photo-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(145deg,#f7f9fc,#edf2f7);color:#8798aa}.cp-photo-empty b{font-size:11px;text-transform:uppercase;letter-spacing:.08em}.cp-photo-empty strong{font-size:22px;color:#60768e;margin:3px 0}.cp-photo-empty small{font-size:10px}.cp-stats{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid #edf1f5;border-bottom:1px solid #edf1f5}.cp-stats span{padding:13px 14px;border-right:1px solid #edf1f5}.cp-stats span:last-child{border-right:0}.cp-stats b{display:block;font-size:15px;color:#132b45}.cp-stats small{display:block;font-size:9.5px;color:#72859a;margin-top:3px;line-height:1.2}.cp-link{padding:14px 18px;font-size:12px;color:#0d5bd1;font-weight:800}.cp-link span{float:right}.cp-empty{display:none;padding:45px;text-align:center;background:#fff;border:1px dashed #cbd7e4;border-radius:14px;color:#667b91}.cp-empty.show{display:block}.cp-cta{margin-top:28px;background:#eef5ff;border:1px solid #cfe0f6;border-radius:14px;padding:24px 28px;display:flex;justify-content:space-between;align-items:center;gap:24px}.cp-cta h3{margin:0 0 5px;font-size:18px}.cp-cta p{margin:0;color:#62778e;font-size:12px}.cp-cta a{background:#fff;border:1px solid #b9cee8;border-radius:9px;padding:11px 16px;color:#0c57c5;text-decoration:none;font-size:12px;font-weight:800;white-space:nowrap}
@media(max-width:960px){.cp-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.cp-hero h1{font-size:44px}.cp-toolbar{align-items:flex-start;flex-direction:column}.cp-hero-bg{background-size:auto,auto 800%}}
@media(max-width:640px){.cp-hero{min-height:310px}.cp-hero-in{padding:44px 18px}.cp-hero h1{font-size:36px}.cp-hero p{font-size:14px}.cp-search{grid-template-columns:30px 1fr}.cp-search button{grid-column:1/3;width:100%;margin-top:4px}.cp-grid{grid-template-columns:1fr}.cp-content{padding:28px 18px 58px}.cp-brand-row{padding-left:18px}.cp-tools{width:100%}.cp-tools select{flex:1}.cp-cta{align-items:flex-start;flex-direction:column}}
`;

const main=`<main class="cp-page">
<section class="cp-hero"><div class="cp-hero-bg"></div><div class="cp-shell cp-hero-in"><span class="cp-kicker">Buyer-first used-car research</span><h1>Browse Every Make &amp; Model</h1><p>Research common problems, recalls, reliability signals and ownership costs before you buy.</p><div class="cp-search"><i>⌕</i><input id="cpSearch" type="search" autocomplete="off" placeholder="Search make or model (e.g. Toyota Camry, Ford F-150)"><button type="button" id="cpSearchBtn">Search</button></div></div></section>
<section class="cp-brands"><div class="cp-shell cp-brand-row"><button class="cp-make cp-all on" data-make="all"><b>All</b><small>${groups.length} models</small></button>${pills}</div></section>
<section class="cp-shell cp-content"><div class="cp-toolbar"><div><h2>Used Car Research Library</h2><p>Federal complaint and recall evidence organized by make, model and year.</p></div><div class="cp-tools"><span class="cp-count" id="cpCount">${groups.length} models</span><select id="cpSort" aria-label="Sort models"><option value="priority">Sort: Featured</option><option value="make">Make A–Z</option><option value="years">Most model years</option></select></div></div><div class="cp-grid" id="cpGrid">${cards}</div><div class="cp-empty" id="cpEmpty">No matching model in the research library yet. You can still analyze a live listing from the home page.</div><div class="cp-cta"><div><h3>Can’t find the make or model you’re looking for?</h3><p>Paste the actual listing and KickTires can still analyze the car with live federal data.</p></div><a href="/#check">Analyze a Car →</a></div></section>
</main>`;

const script=`<script>
(function(){
 const search=document.getElementById('cpSearch'), btn=document.getElementById('cpSearchBtn'), grid=document.getElementById('cpGrid'), count=document.getElementById('cpCount'), empty=document.getElementById('cpEmpty'), sort=document.getElementById('cpSort');
 const pills=[...document.querySelectorAll('.cp-make')]; let active='all';
 function cards(){return [...grid.querySelectorAll('.cp-card')]}
 function apply(){const q=(search.value||'').trim().toLowerCase();let shown=0;cards().forEach(c=>{const ok=(active==='all'||c.dataset.make===active)&&(!q||c.dataset.search.includes(q));c.hidden=!ok;if(ok)shown++});count.textContent=shown+' model'+(shown===1?'':'s');empty.classList.toggle('show',shown===0)}
 pills.forEach(p=>p.addEventListener('click',()=>{pills.forEach(x=>x.classList.remove('on'));p.classList.add('on');active=p.dataset.make;apply()}));search.addEventListener('input',apply);btn.addEventListener('click',apply);
 sort.addEventListener('change',()=>{const list=cards();list.sort((a,b)=>sort.value==='make'?a.dataset.search.localeCompare(b.dataset.search):sort.value==='years'?Number(b.dataset.years)-Number(a.dataset.years):0);list.forEach(c=>grid.appendChild(c));apply()});apply();
})();
</script>`;

let html=fs.readFileSync(FILE,"utf8");
html=html.replace(/<title>[\s\S]*?<\/title>/i,"<title>Used Car Research by Make & Model | KickTires</title>");
html=html.replace(/<meta name="description" content="[^"]*">/i,'<meta name="description" content="Research used-car problems, recalls and reliability signals by make, model and year, then analyze the actual listing before you buy.">');
html=html.replace(/<main[\s\S]*?<\/main>(?:<script>[\s\S]*?<\/script>)?/i,`${main}${script}`);
if(!html.includes("approved premium /cars redesign")) html=html.replace("</style>",`${css}</style>`);
fs.writeFileSync(FILE,html);
console.log(`[cars-premium] redesigned /cars with ${groups.length} model cards`);
