import fs from "node:fs";
import path from "node:path";

const OUT="dist";
const SITE="https://kicktires.netlify.app";
const targets=JSON.parse(fs.readFileSync("research-models.json","utf8")).models||[];
const statusFile=path.join(OUT,"research-status.json");
const statuses=fs.existsSync(statusFile)?JSON.parse(fs.readFileSync(statusFile,"utf8")).models||[]:[];
const statusBySlug=new Map(statuses.map(x=>[x.slug,x]));
const esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const strip=v=>String(v||"").replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").trim();
const fmt=v=>Number(v||0).toLocaleString("en-US");

function rowsFrom(html){
  const rows=[];
  const re=/<tr><td><b>(\d{4})<\/b><\/td><td>([\d,]+)<\/td><td>([\d,]+)<\/td><td>([\s\S]*?)<\/td><\/tr>/g;
  for(const m of html.matchAll(re)) rows.push({year:Number(m[1]),complaints:Number(m[2].replace(/,/g,"")),recalls:Number(m[3].replace(/,/g,"")),area:strip(m[4])||"Federal records"});
  return rows;
}
function setMeta(html,{title,desc,url,noindex}){
  html=html.replace(/<title>[\s\S]*?<\/title>/i,`<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/i,`<meta name="description" content="${esc(desc)}">`)
    .replace(/<link rel="canonical" href="[^"]*">/i,`<link rel="canonical" href="${url}">`)
    .replace(/<meta property="og:title" content="[^"]*">/i,`<meta property="og:title" content="${esc(title)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/i,`<meta property="og:description" content="${esc(desc)}">`)
    .replace(/<meta property="og:url" content="[^"]*">/i,`<meta property="og:url" content="${url}">`);
  html=html.replace(/<meta name="robots" content="noindex,follow">/ig,"");
  if(noindex) html=html.replace("</head>",`<meta name="robots" content="noindex,follow"></head>`);
  return html;
}
const css=`<style id="yearSeoBulkCss">
.ys-page{width:min(100%,1120px);margin:0 auto;padding:30px 24px 80px;color:#10253f}.ys-crumb{font-size:11px;color:#72859a;margin-bottom:18px}.ys-crumb a{color:#1767dd;text-decoration:none}.ys-hero{display:grid;grid-template-columns:1.25fr .75fr;gap:22px;padding:34px;border-radius:20px;background:linear-gradient(135deg,#071f3b,#0d5da8);color:#fff}.ys-hero h1{font-size:42px;line-height:1.05;margin:8px 0 12px;color:#fff;letter-spacing:-.04em}.ys-hero p{color:#d8e7f6;line-height:1.6}.ys-kicker{font-size:10px;font-weight:850;letter-spacing:.12em;text-transform:uppercase;color:#a8cff7}.ys-form{background:#fff;color:#17324e;border-radius:13px;padding:15px}.ys-form h2{font-size:16px;margin:0 0 5px}.ys-form p{font-size:11px;color:#667b91}.ys-form textarea{width:100%;height:78px;box-sizing:border-box;border:1px solid #d8e2ed;border-radius:8px;padding:10px;resize:vertical}.ys-form button{width:100%;height:40px;margin-top:8px;border:0;border-radius:8px;background:#1767dd;color:#fff;font-weight:800}.ys-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin-top:18px}.ys-stat,.ys-card{background:#fff;border:1px solid #e0e7ef;border-radius:12px;padding:16px}.ys-stat b{font-size:21px;color:#123c67;display:block}.ys-stat span{font-size:9px;color:#75889b;text-transform:uppercase}.ys-section{margin-top:40px}.ys-section h2{font-size:26px;margin:0 0 12px}.ys-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.ys-card h3{font-size:16px;margin:0 0 7px}.ys-card p{font-size:11px;line-height:1.55;color:#60758a;margin:0}.ys-table{border:1px solid #e0e7ef;border-radius:12px;overflow:hidden;background:#fff}.ys-row{display:grid;grid-template-columns:90px 130px 120px 1fr 100px;border-bottom:1px solid #edf1f5}.ys-row>*{padding:11px 12px;font-size:11px}.ys-row.head{background:#f6f9fc;font-weight:800;color:#6d8194}.ys-row.current{background:#f2f7ff}.ys-row a{color:#1767dd;text-decoration:none;font-weight:800}.ys-checks{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.ys-check{background:#fff;border:1px solid #e0e7ef;border-radius:11px;padding:14px;font-size:11px;line-height:1.55;color:#526a80}.ys-links{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.ys-links a{border:1px solid #cfdbea;border-radius:999px;padding:8px 11px;text-decoration:none;color:#0d5ecf;font-size:10px;font-weight:800}.ys-final{margin-top:42px;padding:24px 26px;border-radius:15px;background:#0b396c;color:#fff;display:flex;justify-content:space-between;gap:20px;align-items:center}.ys-final h2{color:#fff;margin:0 0 5px}.ys-final p{color:#d6e6f5;margin:0;font-size:11px}.ys-final a{background:#fff;color:#0d5ecf;text-decoration:none;border-radius:8px;padding:11px 15px;font-size:11px;font-weight:850}@media(max-width:800px){.ys-hero{grid-template-columns:1fr}.ys-stats{grid-template-columns:repeat(2,1fr)}.ys-grid{grid-template-columns:1fr}.ys-checks{grid-template-columns:1fr}.ys-row{grid-template-columns:70px 100px 90px 180px 80px;min-width:620px}.ys-table{overflow:auto}}@media(max-width:540px){.ys-page{padding:20px 16px 60px}.ys-hero h1{font-size:34px}.ys-stats{grid-template-columns:1fr}.ys-final{align-items:flex-start;flex-direction:column}}
</style>`;

function mainFor(t,row,rows){
  const name=`${row.year} ${t.make} ${t.model}`;
  const base=`/cars/${t.slug}/`;
  const table=rows.map(r=>`<div class="ys-row${r.year===row.year?" current":""}"><b>${r.year}</b><span>${fmt(r.complaints)}</span><span>${fmt(r.recalls)}</span><span>${esc(r.area)}</span><a href="/cars/${r.year}-${t.slug}/">${r.year===row.year?"Current":"Open →"}</a></div>`).join("");
  const checks=[`Inspect the ${row.area.toLowerCase()} system closely; it is the leading NHTSA complaint category in this year snapshot.`,`Run the exact VIN through NHTSA to confirm whether any recall remedy is still open.`,`Scan all control modules for stored and pending diagnostic trouble codes before purchase.`,`Test the vehicle cold and fully warm; intermittent faults can disappear during a short seller-controlled drive.`,`Compare service records with mileage and age, looking for deferred maintenance or unexplained gaps.`,`Get an independent pre-purchase inspection before money changes hands.`];
  const energy=t.fuelPrice===0?"Electric":"Gas / hybrid varies";
  return `<main class="ys-page"><div class="ys-crumb"><a href="/">Home</a> › <a href="/cars/">Used Car Research</a> › <a href="${base}">${esc(t.make)} ${esc(t.model)}</a> › ${row.year}</div><section class="ys-hero"><div><span class="ys-kicker">Used-car reliability &amp; problem guide</span><h1>${esc(name)} Common Problems &amp; Reliability</h1><p>Federal complaint and recall signals for this model year, plus what to inspect before buying a specific used ${esc(t.make)} ${esc(t.model)}.</p></div><form class="ys-form" data-vehicle="${esc(name)}"><h2>Found one for sale?</h2><p>Paste the listing URL or seller text and analyze the actual car.</p><textarea placeholder="Paste a listing URL or seller description"></textarea><button type="submit">Analyze This ${esc(t.model)}</button></form></section><div class="ys-stats"><div class="ys-stat"><b>${fmt(row.complaints)}</b><span>NHTSA complaints</span></div><div class="ys-stat"><b>${fmt(row.recalls)}</b><span>Recall campaigns</span></div><div class="ys-stat"><b>${esc(row.area)}</b><span>Leading complaint area</span></div><div class="ys-stat"><b>${rows.length}</b><span>Model years compared</span></div></div><section class="ys-section"><h2>Common problems to investigate</h2><div class="ys-grid"><article class="ys-card"><h3>${esc(row.area)}</h3><p>This is the leading complaint category in the federal snapshot for ${row.year}. Treat it as an inspection priority, not a failure-rate estimate.</p></article><article class="ys-card"><h3>Recall history</h3><p>NHTSA shows ${fmt(row.recalls)} model-year recall campaigns. Applicability and completion are VIN-specific.</p></article><article class="ys-card"><h3>Reliability context</h3><p>KickTires does not invent a reliability score from raw complaint totals. Use these records to decide where to look more closely.</p></article></div><div class="ys-links"><a href="${base}problems-recalls/">Common Problems</a><a href="${base}best-years/">Best Years</a><a href="${base}ownership-cost/">Ownership Cost</a><a href="${base}">Full Buying Guide</a></div></section><section class="ys-section"><h2>Compare nearby model years</h2><div class="ys-table"><div class="ys-row head"><span>Year</span><span>Complaints</span><span>Recalls</span><span>Leading area</span><span>Guide</span></div>${table}</div></section><section class="ys-section"><h2>What to check before buying</h2><div class="ys-checks">${checks.map(x=>`<div class="ys-check">${esc(x)}</div>`).join("")}</div></section><section class="ys-section"><h2>Ownership-cost context</h2><div class="ys-grid"><article class="ys-card"><h3>$${fmt(t.annualInsurance)}</h3><p>Annual insurance planning baseline before driver, ZIP and coverage factors.</p></article><article class="ys-card"><h3>$${fmt(t.annualRepairs)}</h3><p>Annual repair reserve used as a planning input, not a predicted bill.</p></article><article class="ys-card"><h3>${energy}</h3><p>Energy cost depends on powertrain, efficiency, local fuel/electricity rates and annual mileage.</p></article></div></section><section class="ys-section"><h2>FAQ</h2><div class="ys-grid"><article class="ys-card"><h3>Is the ${esc(name)} reliable?</h3><p>Raw NHTSA complaint totals alone cannot produce a defensible reliability score. Use the patterns here with maintenance history and an inspection.</p></article><article class="ys-card"><h3>How many recalls does it have?</h3><p>This snapshot shows ${fmt(row.recalls)} recall campaigns for the model year. Check the exact VIN for open remedies.</p></article><article class="ys-card"><h3>Should I buy one?</h3><p>Evaluate the actual listing, mileage, service history, price, title and inspection results—not the model year alone.</p></article></div></section><section class="ys-final"><div><h2>Found a ${esc(name)} for sale?</h2><p>Move from model-year research to the actual listing before you decide.</p></div><a href="/#check" onclick="sessionStorage.setItem('kicktires.vehicleContext','${esc(name)}')">Analyze the Actual Car →</a></section></main><script id="yearSeoBulkForm">document.querySelectorAll('.ys-form').forEach(function(f){f.addEventListener('submit',function(e){e.preventDefault();var t=f.querySelector('textarea'),v=(t&&t.value||'').trim();if(v)sessionStorage.setItem('kicktires.prefill',v);sessionStorage.setItem('kicktires.vehicleContext',f.dataset.vehicle||'');if(window.gtag)gtag('event','year_seo_analyzer_started',{vehicle:f.dataset.vehicle||''});location.href='/?from=year-seo#check';});});</script>`;
}

let created=0,indexable=0;const sitemap=[];
for(const t of targets){
  const guide=path.join(OUT,"cars",t.slug,"index.html");
  if(!fs.existsSync(guide)) continue;
  const source=fs.readFileSync(guide,"utf8");
  const rows=rowsFrom(source); if(!rows.length) continue;
  const status=statusBySlug.get(t.slug); const quality=status?.quality===true;
  for(const row of rows){
    const slug=`${row.year}-${t.slug}`; const dir=path.join(OUT,"cars",slug); fs.mkdirSync(dir,{recursive:true});
    const title=`${row.year} ${t.make} ${t.model} Problems & Reliability | KickTires`;
    const desc=`${row.year} ${t.make} ${t.model} common problems, NHTSA complaints, recall campaigns, reliability context and what to check before buying.`;
    const url=`${SITE}/cars/${slug}/`;
    let html=setMeta(source,{title,desc,url,noindex:!quality});
    html=html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/i,"");
    html=html.replace(/<main class="shell">[\s\S]*?<\/main>/i,mainFor(t,row,rows));
    if(!html.includes("yearSeoBulkCss")) html=html.replace("</head>",`${css}</head>`);
    fs.writeFileSync(path.join(dir,"index.html"),html); created++;
    if(quality){sitemap.push(url);indexable++;}
  }
}
const sm=path.join(OUT,"sitemap.xml");
if(fs.existsSync(sm)&&sitemap.length){let xml=fs.readFileSync(sm,"utf8");const add=sitemap.filter(u=>!xml.includes(`<loc>${u}</loc>`)).map(u=>`  <url><loc>${u}</loc><priority>0.80</priority></url>`).join("\n");if(add)xml=xml.replace("</urlset>",`${add}\n</urlset>`);fs.writeFileSync(sm,xml);}
console.log(`[year-seo-expand] generated ${created} model-year pages; ${indexable} indexable by federal-data quality gate`);
