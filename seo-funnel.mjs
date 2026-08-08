import fs from "node:fs";
import path from "node:path";

const OUT = "dist";
const editorial = JSON.parse(fs.readFileSync("data.json", "utf8"));
const generated = JSON.parse(fs.readFileSync("generated.json", "utf8"));
const targets = JSON.parse(fs.readFileSync("research-models.json", "utf8")).models;

const identity = p => `${p?.meta?.y}|${p?.meta?.mk}|${p?.meta?.md}`.toLowerCase().replace(/[^a-z0-9|]/g, "");
const merged = new Map();
for (const p of [...Object.values(editorial), ...Object.values(generated)]) merged.set(identity(p), p);
const profiles = [...merged.values()];

const esc = v => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const fmt = v => Number(v || 0).toLocaleString("en-US");
const norm = v => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const complaints = p => Number.isInteger(p?.federal?.complaintTotal) ? p.federal.complaintTotal : Number(p?.meta?.nhtsa || 0);
const recalls = p => Number.isInteger(p?.federal?.recallTotal) ? p.federal.recallTotal : Number(p?.meta?.recalls || 0);
const topComponents = p => Array.isArray(p?.federal?.topComponents) ? p.federal.topComponents : [];
const human = v => String(v || "").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const vehicle = p => `${p.meta.y} ${p.meta.mk} ${p.meta.md}`;
const sameModel = p => profiles.filter(x => norm(x.meta.mk) === norm(p.meta.mk) && norm(x.meta.md) === norm(p.meta.md)).sort((a,b)=>a.meta.y-b.meta.y);
const targetFor = p => targets.find(t => norm(t.make)===norm(p.meta.mk) && norm(t.model)===norm(p.meta.md));

const css = `
/* unified SEO -> Analyzer funnel */
.sf-page{width:min(100%,1160px);margin:0 auto;padding:28px 24px 82px;color:#10253f}.sf-crumb{font-size:11px;color:#71859a;margin-bottom:18px}.sf-crumb a{color:#1767dd;text-decoration:none}.sf-hero{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(330px,.7fr);gap:22px;padding:34px;border:1px solid #dae4ef;border-radius:22px;background:linear-gradient(135deg,#071f3b 0%,#0b3766 58%,#125da5 100%);box-shadow:0 20px 48px rgba(18,45,77,.14);color:#fff}.sf-kicker{font-size:10px;font-weight:850;letter-spacing:.13em;text-transform:uppercase;color:#a8cdf4}.sf-hero h1{font-size:44px;line-height:1.05;letter-spacing:-.045em;color:#fff;margin:8px 0 12px}.sf-hero-copy>p{margin:0;max-width:690px;color:#d7e7f6;font-size:15px;line-height:1.6}.sf-analyzer{background:#fff;border-radius:14px;padding:14px;color:#10253f;box-shadow:0 14px 30px rgba(0,0,0,.18)}.sf-analyzer h2{font-size:16px;margin:0 0 5px}.sf-analyzer p{font-size:11px;line-height:1.45;color:#667b91;margin:0 0 10px}.sf-analyzer textarea{width:100%;height:80px;box-sizing:border-box;resize:vertical;border:1px solid #d8e2ed;border-radius:9px;padding:11px;font:inherit;font-size:12px;background:#f9fbfd}.sf-analyzer textarea:focus{outline:0;border-color:#79a8e7;box-shadow:0 0 0 3px rgba(23,103,221,.1)}.sf-analyzer button{width:100%;height:42px;margin-top:8px;border:0;border-radius:8px;background:#1767dd;color:#fff;font-weight:800;cursor:pointer}.sf-note{display:block;margin-top:7px;color:#8293a5;font-size:9px}.sf-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0 0}.sf-stat{background:#fff;border:1px solid #e0e7ef;border-radius:12px;padding:15px}.sf-stat b{display:block;font-size:22px;color:#0d3765}.sf-stat span{display:block;margin-top:3px;font-size:9px;line-height:1.25;color:#74869a;text-transform:uppercase;letter-spacing:.05em}.sf-section{margin-top:44px}.sf-section-head{display:flex;justify-content:space-between;align-items:end;gap:18px;margin-bottom:15px}.sf-section h2{font-size:27px;letter-spacing:-.035em;margin:0}.sf-section-head p{margin:4px 0 0;color:#6e8093;font-size:12px}.sf-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.sf-problem{background:#fff;border:1px solid #e0e7ef;border-radius:13px;padding:18px;box-shadow:0 7px 20px rgba(23,50,78,.045)}.sf-problem .tag{font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.07em;color:#1767dd}.sf-problem h3{font-size:17px;margin:7px 0}.sf-problem p{font-size:11px;line-height:1.5;color:#63778c;margin:0}.sf-problem .cost{display:block;margin-top:12px;padding-top:10px;border-top:1px solid #edf1f5;color:#0f355f;font-size:11px;font-weight:800}.sf-recalls{display:grid;gap:9px}.sf-recall{display:grid;grid-template-columns:150px 180px 1fr;gap:16px;background:#fff;border:1px solid #e0e7ef;border-radius:11px;padding:14px 16px}.sf-recall b{font-size:11px}.sf-recall span{font-size:10px;color:#1767dd;font-weight:800}.sf-recall p{font-size:10px;line-height:1.45;color:#667b91;margin:0}.sf-explain{background:#eef5ff;border:1px solid #cfe0f5;border-radius:14px;padding:20px}.sf-explain p{margin:0;color:#4f6780;font-size:12px;line-height:1.6}.sf-year-table{overflow:auto;background:#fff;border:1px solid #e0e7ef;border-radius:13px}.sf-year-row{display:grid;grid-template-columns:90px 140px 130px minmax(180px,1fr) 110px;align-items:center;min-width:700px;border-bottom:1px solid #edf1f5}.sf-year-row:last-child{border-bottom:0}.sf-year-row>*{padding:12px 14px;font-size:11px}.sf-year-row.sf-head{background:#f6f9fc;color:#6e8194;font-weight:800}.sf-year-row.current{background:#f3f7ff}.sf-year-row a{color:#1767dd;text-decoration:none;font-weight:800}.sf-checks{display:grid;grid-template-columns:repeat(2,1fr);gap:11px}.sf-check{background:#fff;border:1px solid #e0e7ef;border-radius:11px;padding:15px;font-size:11px;line-height:1.55;color:#536a80}.sf-check b{color:#18324f}.sf-cost-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:11px}.sf-cost{background:#fff;border:1px solid #e0e7ef;border-radius:11px;padding:15px}.sf-cost b{display:block;font-size:17px;color:#123b67}.sf-cost span{font-size:9px;color:#74879a;text-transform:uppercase;letter-spacing:.05em}.sf-faq{display:grid;gap:9px}.sf-faq details{background:#fff;border:1px solid #e0e7ef;border-radius:11px;padding:14px 16px}.sf-faq summary{font-size:12px;font-weight:800;cursor:pointer}.sf-faq p{font-size:11px;line-height:1.55;color:#61768b;margin:10px 0 0}.sf-final{margin-top:46px;padding:26px 28px;border-radius:16px;background:linear-gradient(110deg,#082d57,#0e5ca9);color:#fff;display:flex;justify-content:space-between;align-items:center;gap:24px}.sf-final h2{color:#fff;font-size:25px;margin:0 0 6px}.sf-final p{margin:0;color:#d7e6f5;font-size:11px;line-height:1.5}.sf-final a{white-space:nowrap;background:#fff;color:#0e5cc8;text-decoration:none;border-radius:9px;padding:12px 16px;font-size:11px;font-weight:850}.sf-model-cta{margin:30px 0;padding:22px 24px;border-radius:14px;background:linear-gradient(110deg,#0a315d,#0e5ea9);color:#fff;display:flex;justify-content:space-between;align-items:center;gap:20px}.sf-model-cta h2{color:#fff!important;margin:0 0 5px!important;font-size:22px!important}.sf-model-cta p{color:#d7e6f5!important;margin:0!important;font-size:11px!important}.sf-model-cta a{white-space:nowrap;background:#fff;color:#0d5cca!important;text-decoration:none;border-radius:8px;padding:11px 15px;font-size:11px;font-weight:850}
@media(max-width:850px){.sf-hero{grid-template-columns:1fr}.sf-stats{grid-template-columns:repeat(2,1fr)}.sf-grid3{grid-template-columns:1fr}.sf-recall{grid-template-columns:1fr}.sf-cost-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:560px){.sf-page{padding:20px 16px 60px}.sf-hero{padding:24px 20px}.sf-hero h1{font-size:34px}.sf-stats,.sf-checks,.sf-cost-grid{grid-template-columns:1fr}.sf-final,.sf-model-cta{align-items:flex-start;flex-direction:column}}
`;

function problemCards(p){
  const top = topComponents(p).slice(0,3);
  return [0,1,2].map((i)=>{
    const risk = p.risks?.[i];
    const comp = top[i];
    const title = comp?.component ? human(comp.component) : (risk?.t || `Inspection area ${i+1}`);
    const count = comp?.count != null ? `${fmt(comp.count)} complaint tags` : (risk?.cl || "Inspection signal");
    const body = risk?.b || (comp ? `${fmt(comp.count)} NHTSA complaint records in this snapshot carry the ${human(comp.component)} tag. Treat this as a screening signal, not a failure rate.` : "Review service history and inspect this system before buying.");
    const cost = risk?.c || "Cost depends on diagnosis";
    return `<article class="sf-problem"><span class="tag">${esc(count)}</span><h3>${esc(title)}</h3><p>${esc(body)}</p><span class="cost">${esc(cost)}</span></article>`;
  }).join("");
}

function recallRows(p){
  const rows = Array.isArray(p?.federal?.recalls) ? p.federal.recalls.slice(0,6) : [];
  if (!rows.length) return `<div class="sf-explain"><p>NHTSA returned ${fmt(recalls(p))} recall campaigns in this model-year snapshot. Campaign applicability is VIN-specific, so verify the actual vehicle before purchase.</p></div>`;
  return `<div class="sf-recalls">${rows.map(r=>`<article class="sf-recall"><span>${esc(r.campaign || "Campaign")}</span><b>${esc(human(r.component || "Recall"))}</b><p>${esc(r.consequence || r.summary || "Check the NHTSA campaign record and verify VIN applicability before buying.")}</p></article>`).join("")}</div>`;
}

function yearTable(p){
  const peers = sameModel(p);
  return `<div class="sf-year-table"><div class="sf-year-row sf-head"><span>Year</span><span>Complaints</span><span>Recalls</span><span>Leading area</span><span>Guide</span></div>${peers.map(x=>{
    const top = topComponents(x)[0]?.component || "Federal records";
    return `<div class="sf-year-row${x.meta.slug===p.meta.slug?" current":""}"><b>${x.meta.y}</b><span>${fmt(complaints(x))}</span><span>${fmt(recalls(x))}</span><span>${esc(human(top))}</span><a href="/cars/${esc(x.meta.slug)}/">${x.meta.slug===p.meta.slug?"Current":"Open →"}</a></div>`;
  }).join("")}</div>`;
}

function checks(p){
  const source = Array.isArray(p.chk) ? p.chk.slice(0,6) : [];
  if (!source.length) return `<div class="sf-check">Get an independent pre-purchase inspection and run the VIN through NHTSA before paying.</div>`;
  return source.map(text=>`<div class="sf-check">${String(text).replace(/<(?!\/?b\b)[^>]*>/gi,"")}</div>`).join("");
}

function costs(p){
  const t = p.tco || {};
  const values = [
    [t.ins ? `$${fmt(t.ins)}` : "Listing needed","Annual insurance input"],
    [t.mpg ? `${Math.round(t.mpg)} mpg` : (p.epa?.mpg ? `${Math.round(p.epa.mpg)} mpg` : "Varies"),"Fuel economy input"],
    [t.repair ? `$${fmt(t.repair)}` : "Listing needed","Annual repair reserve"],
    [t.fuel ? human(t.fuel) : "Location dependent","Fuel / energy type"]
  ];
  return values.map(([v,l])=>`<div class="sf-cost"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("");
}

function faqItems(p){
  const v=vehicle(p), top=topComponents(p).slice(0,3);
  const areas = top.length ? top.map(x=>human(x.component)).join(", ") : "the problem areas shown above";
  return [
    [`What are the most common problems with the ${v}?`,`The leading NHTSA complaint areas in this KickTires snapshot include ${areas}. Complaints are owner allegations and screening signals, not confirmed defect or failure-rate data.`],
    [`Is the ${v} reliable?`,`A defensible reliability score cannot be calculated from complaint totals alone. This page shows ${fmt(complaints(p))} raw NHTSA complaints and ${fmt(recalls(p))} recall campaigns so you can focus an inspection on the systems that appear most often.`],
    [`Does the ${v} have recalls?`,`NHTSA returned ${fmt(recalls(p))} model-year recall campaigns in this snapshot. A campaign count does not mean every vehicle is affected or unrepaired; verify the exact VIN before buying.`],
    [`Should I buy a used ${v}?`,`Model-year data is only the first screen. Check the VIN, title, service history, mileage, asking price, stored fault codes and an independent pre-purchase inspection before deciding.`]
  ];
}

function yearMain(p){
  const v=vehicle(p), peers=sameModel(p), t=targetFor(p), top=topComponents(p)[0]?.component || "Federal records";
  const faqs=faqItems(p);
  const modelLink=t?`/cars/${t.slug}/`:`/cars/`;
  return `<main class="sf-page">
    <div class="sf-crumb"><a href="/">Home</a> › <a href="/cars/">Used Car Research</a> › <a href="${modelLink}">${esc(p.meta.mk)} ${esc(p.meta.md)}</a> › ${p.meta.y}</div>
    <section class="sf-hero"><div class="sf-hero-copy"><span class="sf-kicker">Used-car problem &amp; reliability guide</span><h1>${esc(v)} Common Problems &amp; Reliability</h1><p>We reviewed federal complaint and recall data for the ${esc(v)}. Use the patterns below to decide what deserves inspection before you buy one.</p></div>
      <form class="sf-analyzer" data-vehicle="${esc(v)}"><h2>Found a ${esc(p.meta.y)} ${esc(p.meta.md)} for sale?</h2><p>Paste the listing URL or seller text. We’ll carry it straight into the KickTires Analyzer.</p><textarea placeholder="Paste the listing URL or listing text"></textarea><button type="submit">Analyze This ${esc(p.meta.md)}</button><span class="sf-note">No account required · the model-year guide stays available in this tab history.</span></form>
    </section>
    <section class="sf-stats"><div class="sf-stat"><b>${fmt(complaints(p))}</b><span>Raw NHTSA complaints</span></div><div class="sf-stat"><b>${fmt(recalls(p))}</b><span>Recall campaigns</span></div><div class="sf-stat"><b>${esc(human(top))}</b><span>Leading complaint area</span></div><div class="sf-stat"><b>${peers.length}</b><span>Model years compared</span></div></section>
    <section class="sf-section"><div class="sf-section-head"><div><h2>Common ${esc(p.meta.y)} ${esc(p.meta.md)} Problems</h2><p>Use federal complaint concentration as an inspection map, not a failure-rate score.</p></div></div><div class="sf-grid3">${problemCards(p)}</div></section>
    <section class="sf-section"><div class="sf-section-head"><div><h2>${esc(v)} Recall History</h2><p>Campaign counts are model-year level; VIN applicability must be checked separately.</p></div></div>${recallRows(p)}</section>
    <section class="sf-section"><div class="sf-section-head"><div><h2>What the Reliability Data Actually Says</h2></div></div><div class="sf-explain"><p>This snapshot contains <b>${fmt(complaints(p))}</b> raw NHTSA complaints and <b>${fmt(recalls(p))}</b> recall campaigns. Those totals are useful for finding repeated systems to inspect, but they are not a probability that your car will fail. Vehicle age, fleet size, mileage and reporting behavior differ by year, so compare nearby years and then evaluate the specific listing.</p></div></section>
    <section class="sf-section"><div class="sf-section-head"><div><h2>Compare Nearby ${esc(p.meta.mk)} ${esc(p.meta.md)} Model Years</h2><p>Internal links keep the research path focused on the exact model you are shopping.</p></div></div>${yearTable(p)}</section>
    <section class="sf-section"><div class="sf-section-head"><div><h2>What to Check Before Buying a ${esc(v)}</h2></div></div><div class="sf-checks">${checks(p)}</div></section>
    <section class="sf-section"><div class="sf-section-head"><div><h2>${esc(p.meta.mk)} ${esc(p.meta.md)} Ownership Cost Inputs</h2><p>The actual five-year total depends on the listing price, mileage and location.</p></div></div><div class="sf-cost-grid">${costs(p)}</div></section>
    <section class="sf-section"><div class="sf-section-head"><div><h2>${esc(v)} FAQ</h2></div></div><div class="sf-faq">${faqs.map(([q,a])=>`<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div></section>
    <section class="sf-final"><div><h2>Found one for sale?</h2><p>Don’t stop at the model year. Paste the actual listing to check price context, mileage, known problem areas and ownership-cost inputs for the car you are considering.</p></div><a href="#" class="sf-focus-analyzer">Analyze This Car →</a></section>
  </main>`;
}

function injectCss(html){
  if (html.includes("unified SEO -> Analyzer funnel")) return html;
  return html.replace("</head>",`<style>${css}</style></head>`);
}

function transformYearPage(p){
  const file=path.join(OUT,"cars",p.meta.slug,"index.html");
  if(!fs.existsSync(file)) return false;
  let html=fs.readFileSync(file,"utf8");
  const re=/<main class="shell">[\s\S]*?<\/main>/i;
  if(!re.test(html)) return false;
  html=injectCss(html).replace(re,yearMain(p));
  if(!html.includes("seoFunnelForms")) html=html.replace("</body>",`<script id="seoFunnelForms">document.querySelectorAll('.sf-analyzer').forEach(function(f){f.addEventListener('submit',function(e){e.preventDefault();var t=f.querySelector('textarea'),v=(t&&t.value||'').trim();if(v)sessionStorage.setItem('kicktires.prefill',v);sessionStorage.setItem('kicktires.vehicleContext',f.dataset.vehicle||'');if(window.gtag)gtag('event','seo_analyzer_started',{vehicle:f.dataset.vehicle||''});location.href='/?from=seo#check';});});document.querySelectorAll('.sf-focus-analyzer').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();var t=document.querySelector('.sf-analyzer textarea');if(t){t.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(function(){t.focus()},450);}});});</script></body>`);
  fs.writeFileSync(file,html);
  return true;
}

function modelCta(name){
  return `<section class="sf-model-cta"><div><h2>Found a ${esc(name)} for sale?</h2><p>Research gets you to the right questions. The next step is analyzing the actual listing, mileage and asking price.</p></div><a href="/#check" onclick="sessionStorage.setItem('kicktires.vehicleContext','${esc(name)}');if(window.gtag)gtag('event','seo_model_analyzer_cta',{vehicle:'${esc(name)}'})">Analyze the Actual Car →</a></section>`;
}

function patchResearchPage(file,name){
  if(!fs.existsSync(file)) return false;
  let html=fs.readFileSync(file,"utf8");
  if(html.includes("sf-model-cta")) return false;
  html=injectCss(html);
  html=html.replace(/<\/main>/i,`${modelCta(name)}</main>`);
  fs.writeFileSync(file,html);
  return true;
}

let yearChanged=0, researchChanged=0;
for(const p of profiles) yearChanged += transformYearPage(p)?1:0;
for(const t of targets){
  const name=`${t.make} ${t.model}`, base=path.join(OUT,"cars",t.slug);
  for(const rel of ["index.html",path.join("best-years","index.html"),path.join("problems-recalls","index.html"),path.join("ownership-cost","index.html")]) researchChanged += patchResearchPage(path.join(base,rel),name)?1:0;
}

const home=path.join(OUT,"index.html");
if(fs.existsSync(home)){
  let html=fs.readFileSync(home,"utf8");
  if(!html.includes("seoPrefillBridge")) html=html.replace("</body>",`<script id="seoPrefillBridge">document.addEventListener('DOMContentLoaded',function(){var v=sessionStorage.getItem('kicktires.prefill'),c=sessionStorage.getItem('kicktires.vehicleContext'),i=document.getElementById('inp');if(i&&v){i.value=v;sessionStorage.removeItem('kicktires.prefill');i.focus();if(window.gtag)gtag('event','seo_prefill_received',{vehicle:c||''});}if(i&&c&&!v&&i.placeholder)i.placeholder='Paste a '+c+' listing URL or seller text';});</script></body>`);
  fs.writeFileSync(home,html);
}

console.log(`[seo-funnel] rebuilt ${yearChanged} model-year SEO pages; added Analyzer CTAs to ${researchChanged} research pages`);
