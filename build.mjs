// build.mjs — generates the whole static site from data.json
// run: node build.mjs   → writes ./dist
import fs from "node:fs";
import path from "node:path";

const SITE = "https://kicktires.netlify.app";   // ← change to your domain
const NAME = "KickTires";
// Google Search Console — file verification. Keep this forever once verified.
const GOOGLE_VERIFY = "googlee9c6c5390d444c3c";
// Public GA4 measurement ID. Netlify may override it for another deployment.
const GA_MEASUREMENT_ID = (process.env.GA_MEASUREMENT_ID || "G-5NSV1Y7TSJ").trim();
if (!/^G-[A-Z0-9]+$/i.test(GA_MEASUREMENT_ID)) throw new Error("invalid GA_MEASUREMENT_ID");
// Leave empty to disable ads entirely. Set to "ca-pub-XXXXXXXXXXXXXXXX" once approved.
const ADSENSE = process.env.ADSENSE_CLIENT || "";
const D = JSON.parse(fs.readFileSync("data.json", "utf8"));
const OUT = "dist";
const TODAY = process.env.BUILD_DATE || new Date().toISOString().slice(0, 10);

const css = fs.readFileSync("style.css", "utf8");
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const safeBold = s => esc(s).replace(/&lt;b&gt;/gi, "<b>").replace(/&lt;\/b&gt;/gi, "</b>");
const money = n => "$" + Math.round(n).toLocaleString("en-US");

const STATES = {
  OH:{n:"Ohio",tax:.0575,ins:.78,reg:85,prop:0}, CA:{n:"California",tax:.0825,ins:1.15,reg:290,prop:0},
  TX:{n:"Texas",tax:.0625,ins:1.20,reg:105,prop:0}, FL:{n:"Florida",tax:.0600,ins:1.55,reg:230,prop:0},
  NY:{n:"New York",tax:.0800,ins:1.25,reg:110,prop:0}, VA:{n:"Virginia",tax:.0415,ins:.85,reg:95,prop:.041},
  OR:{n:"Oregon",tax:0,ins:.95,reg:130,prop:0}
};
const GAS = { regular:3.20, premium:4.05 }, MILES=12000, YRS=5;

function tco(d, s){
  const t=d.tco, salesTax=d.price*s.tax, ins=t.ins*s.ins*YRS, reg=s.reg*YRS;
  let prop=0, v=d.price; for(let y=0;y<YRS;y++){ prop+=v*s.prop; v*=.85; }
  const fuel=(MILES*YRS/t.mpg)*GAS[t.fuel], rep=t.repair*YRS;
  const rows=[["Purchase price",d.price,"one-time","b-1"],["Sales tax",salesTax,(s.tax*100).toFixed(2)+"% in "+s.n,"b-2"],
    ["Insurance",ins,"5 yrs, full coverage","b-3"],["Registration",reg+prop,s.prop?"incl. annual property tax":"5 yrs","b-4"],
    ["Fuel",fuel,MILES.toLocaleString()+" mi/yr @ "+t.mpg+" mpg","b-5"],["Likely repairs",rep,"our estimate, 5 yrs","b-6"]];
  return { rows, total: rows.reduce((a,r)=>a+r[1],0) };
}

/* ── shared chrome ─────────────────────────────────────────────── */
function head({title,desc,url,jsonld}){
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}">
<meta property="og:site_name" content="${NAME}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%233987e5'/><rect x='8' y='11' width='16' height='3' rx='1.5' fill='%230a0b0d'/><rect x='8' y='18' width='16' height='3' rx='1.5' fill='%230a0b0d'/></svg>">
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config","${GA_MEASUREMENT_ID}");</script>
<style>${css}</style>
${ADSENSE ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE}" crossorigin="anonymous"></script>` : ""}
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>` : ""}
</head><body>
<nav><div class="navin">
  <a class="logo" href="/"><i></i>${NAME}</a>
  <a class="navlink" href="/cars/">All models</a>
</div></nav>`;
}
const foot = `<footer class="site"><div class="shell">
<p>Sources: NHTSA recall, complaint and investigation records · EPA fuel economy data · owner forums · our own reading of them.</p>
<p class="fine"><b>Kick the tires.</b> It is what someone older told you to do before you bought a used car, and they were right — you just needed better things to look at. That is all this is.</p>
<p class="fine">We take no money from dealers, sellers or marketplaces. Cost figures are estimates, not quotes. Always get an independent inspection before buying.</p>
<p class="fine"><a href="/privacy/">Privacy &amp; cookies</a> · <a href="/about/">About</a></p>
</div></footer></body></html>`;

const adUnit = slot => ADSENSE ? `
  <aside class="adwrap"><span class="micro">Advertisement</span>
    <ins class="adsbygoogle" style="display:block" data-ad-client="${ADSENSE}" data-ad-slot="${slot}" data-ad-format="auto" data-full-width-responsive="true"></ins>
    <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
  </aside>` : "";

/* ── model page ────────────────────────────────────────────────── */
function modelPage(key, d){
  const m = d.meta, url = `${SITE}/cars/${m.slug}/`;
  const T = d.tco && typeof d.price === "number" ? tco(d, STATES.OH) : null;
  const hasListing = typeof d.price === "number";
  const risks = d.risks.map(r=>`
    <article class="risk s-${["crit","ser","warn"].includes(r.s) ? r.s : "warn"}">
      <div class="sevwrap"><div class="sevbar"></div><div class="sevtxt">${esc(r.lbl)}</div></div>
      <div><h3 class="rtitle">${esc(r.t)}</h3><p class="rbody">${esc(r.b)}</p>
      ${r.e.map(([t,tag,txt])=>`<div class="ev"><div class="evtag e-${["v","s","o"].includes(t) ? t : "o"}">${esc(tag)}</div><p class="evtxt">${esc(txt)}</p></div>`).join("")}</div>
      <div class="cost"><span class="cnum">${esc(r.c)}</span><div class="micro clbl">${esc(r.cl)}</div></div>
    </article>`).join("");

  const jsonld = {
    "@context":"https://schema.org","@type":"Article",
    headline:m.title, description:m.desc, datePublished:TODAY, dateModified:TODAY,
    author:{"@type":"Organization",name:NAME}, publisher:{"@type":"Organization",name:NAME},
    mainEntityOfPage:url,
    about:{"@type":"Car",name:`${m.y} ${m.mk} ${m.md}`,modelDate:String(m.y),
      manufacturer:{"@type":"Organization",name:m.mk}}
  };
  const faq = {
    "@context":"https://schema.org","@type":"FAQPage",
    mainEntity: d.risks.map(r=>({"@type":"Question",name:`${m.y} ${m.mk} ${m.md}: ${r.t}?`,
      acceptedAnswer:{"@type":"Answer",text:r.b + " Typical cost: " + r.c + "."}}))
  };

  return head({title:m.title, desc:m.desc, url, jsonld:[jsonld,faq]}) + `
<main class="shell">
  <div class="crumb"><a href="/">Home</a> › <a href="/cars/">Models</a> › ${m.y} ${m.mk} ${m.md}</div>
  <p class="micro">Verified against ${m.nhtsa} NHTSA complaints${m.recalls?` and ${m.recalls} recall campaigns`:""}</p>
  <h1>${m.y} ${m.mk} ${m.md} problems</h1>
  <p class="verdict-lead">${esc(d.vline)}</p>
  <p class="lede">${esc(d.vsub)}</p>

  <section class="panel">
    <div class="phead"><div><p class="micro">${hasListing ? "Example listing" : "What we checked"}</p>
      <p class="rtitle" style="margin:6px 0 0;font-size:17px">${esc(d.name)}</p></div></div>
    <div class="pbody"><div class="specs">${d.specs.map(s=>`<span class="spec">${esc(s)}</span>`).join("")}</div></div>
  </section>

  <h2>What actually goes wrong</h2>
  <p class="sub">Ranked by what it does to your wallet, not by how often it is mentioned online.</p>
  <section class="panel">${risks}
    <div class="legend">
      <div class="lg"><div class="evtag e-v">NHTSA</div><p>Straight from federal recall and complaint records. Looked up, not interpreted.</p></div>
      <div class="lg"><div class="evtag e-s">OWNERS</div><p>Reported by owners in public forums, with a source we checked ourselves.</p></div>
      <div class="lg"><div class="evtag e-o">OUR TAKE</div><p>Our judgment — the part that could be wrong. We label it rather than blending it in.</p></div>
    </div>
  </section>

  ${!T ? "" : `<h2>What five years of ownership actually costs</h2>
  <p class="sub">${hasListing ? "Based on the example listing above, in Ohio." : "For a typical example of this model, in Ohio."} Insurance and tax vary by state by more than most buyers expect.</p>
  <section class="panel"><div class="pbody">
    <div class="tcohero">
      <div><span class="micro">Sticker price</span><span class="tbig muted">${money(d.price)}</span></div>
      <span class="arrow">→</span>
      <div><span class="micro">Five-year reality</span><span class="tbig">${money(T.total)}</span></div>
    </div>
    <div class="bar">${T.rows.map(r=>`<div class="seg ${r[3]}" style="width:${(r[1]/T.total*100).toFixed(2)}%"></div>`).join("")}</div>
    <div class="tlines">${T.rows.map(r=>`<div class="tline"><span class="tdot ${r[3]}"></span><span class="tname">${r[0]}</span><span class="tnote">${esc(r[2])}</span><span class="tval">${money(r[1])}</span></div>`).join("")}</div>
  </div></section>`}

  <h2>Take this to the inspection</h2>
  <section class="panel"><div class="pbody">
    ${d.chk.map(c=>`<div class="chk"><div class="cbox"></div><p>${safeBold(c)}</p></div>`).join("")}
  </div></section>

  <section class="oath">
    <p class="micro">Why you can trust this</p>
    <p><b>We take no money from dealers, sellers, or marketplaces — ever.</b> Every site that ranks listings for you is paid by someone who wants you to buy one. That is why they will call a car a great deal and never tell you why it is cheap. We have nothing to lose if you walk away.</p>
  </section>

  ${adUnit("0000000000")}

  <h2>Other models</h2>
  <div class="cards">${Object.entries(D).filter(([k])=>k!==key).map(([k,o])=>
    `<a class="card" href="/cars/${o.meta.slug}/"><span class="micro">${o.meta.nhtsa} complaints</span><span class="cardt">${o.meta.y} ${o.meta.mk} ${o.meta.md}</span><span class="cardd">${esc(o.vline)}</span></a>`).join("")}</div>
</main>` + foot;
}

/* ── home ──────────────────────────────────────────────────────── */
function home(){
  const jsonld = {"@context":"https://schema.org","@type":"WebSite",name:NAME,url:SITE+"/"};
  return head({title:`${NAME} — every cheap used car is cheap for a reason`,
    desc:"Paste any used car listing. We tell you what actually goes wrong with that model according to federal complaint records, what it costs when it breaks, and what five years of ownership really adds up to. We take no money from sellers.",
    url:SITE+"/", jsonld}) + `
<main class="shell">
  <section class="hero"><div class="inner">
    <p class="micro">Independent · never paid by sellers</p>
    <h1 class="big">Every cheap car is cheap<br><em>for a reason.</em></h1>
    <p class="lede">Paste any used listing. We'll tell you what's wrong with it, what it costs when it breaks, and whether you're about to make a mistake.</p>
    <form class="paste" onsubmit="route(event);return false">
      <textarea id="inp" placeholder="Paste a listing URL — or if it's Facebook Marketplace, paste the listing text instead."></textarea>
      <div class="pfoot"><span class="srcs">Cars.com · Autotrader · CarGurus · Craigslist · dealer sites · pasted text</span>
      <button class="btn" id="analyzeBtn" type="submit">Check this car</button></div>
    </form>
    <p id="hint" class="hint" aria-live="polite"></p>
  </div></section>

  <div id="live" aria-live="polite"></div>

  ${adUnit("1111111111")}

  <h2>Models we've checked</h2>
  <p class="sub">Every claim cross-checked against federal complaint and recall records.</p>
  <div class="cards">${Object.values(D).map(o=>
    `<a class="card" href="/cars/${o.meta.slug}/"><span class="micro">${o.meta.nhtsa} complaints checked</span><span class="cardt">${o.meta.y} ${o.meta.mk} ${o.meta.md}</span><span class="cardd">${esc(o.vline)}</span></a>`).join("")}</div>
</main>
<script>
const STATES = ${JSON.stringify(STATES)};
const ENERGY = {regular:3.20,premium:4.05,diesel:3.85,electric:0.16};
const MILES = 12000, YEARS = 5;
const $ = id => document.getElementById(id);
const hint = message => { $("hint").textContent = message; };
const html = value => String(value == null ? "" : value).replace(/&/g,"&amp;")
  .replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const dollars = value => "$" + Math.round(Number(value)).toLocaleString("en-US");
const validClass = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
const track = (name, params) => {
  if (typeof window.gtag === "function") window.gtag("event", name, params || {});
};
const fail = (code, message) => {
  track("listing_analysis_failed", {error_code:code});
  hint(message);
  return false;
};

function totalCost(tco, price, stateCode){
  const state = STATES[stateCode] || STATES.OH;
  if (!tco || !Number.isFinite(price) || price <= 0) return null;
  const salesTax = price * state.tax;
  const insurance = Number(tco.ins || 0) * state.ins * YEARS;
  const registration = state.reg * YEARS;
  let propertyTax = 0, value = price;
  for (let year = 0; year < YEARS; year++) { propertyTax += value * state.prop; value *= 0.85; }
  let fuel = 0, efficiencyNote = "";
  if (tco.fuel === "electric" && Number(tco.kwhPer100) > 0) {
    fuel = MILES * YEARS / 100 * Number(tco.kwhPer100) * ENERGY.electric;
    efficiencyNote = Number(tco.kwhPer100).toFixed(1) + " kWh/100 mi";
  } else if (Number(tco.mpg) > 0) {
    fuel = MILES * YEARS / Number(tco.mpg) * (ENERGY[tco.fuel] || ENERGY.regular);
    efficiencyNote = Number(tco.mpg) + " mpg";
  }
  const repairs = Number(tco.repair || 0) * YEARS;
  const rows = [
    ["Purchase price",price,"one-time","b-1"],
    ["Sales tax",salesTax,(state.tax*100).toFixed(2)+"% in "+state.n,"b-2"],
    ["Insurance",insurance,"5-year estimate","b-3"],
    ["Registration",registration+propertyTax,state.prop?"includes estimated property tax":"5 years","b-4"],
    ["Fuel / energy",fuel,MILES.toLocaleString()+" mi/yr · "+efficiencyNote,"b-5"],
    ["Likely repairs",repairs,"5-year estimate","b-6"]
  ];
  return {rows:rows,total:rows.reduce((sum,row)=>sum+row[1],0)};
}

function tcoRows(tco, car, stateCode){
  const result = totalCost(tco, Number(car.price), stateCode);
  if (!result) return '<p class="lede">The listing did not provide enough sourced cost data for a five-year total.</p>';
  return '<div class="tcohero">' +
    '<div><span class="micro">Asking price</span><span class="tbig muted">'+dollars(car.price)+'</span></div>'+
    '<span class="arrow">&rarr;</span>'+
    '<div><span class="micro">Five-year estimate</span><span class="tbig">'+dollars(result.total)+'</span></div></div>'+
    '<div class="bar">'+result.rows.map(function(row){return '<div class="seg '+row[3]+'" style="width:'+
      (row[1]/result.total*100).toFixed(2)+'%"></div>';}).join("")+'</div>'+
    '<div class="tlines">'+result.rows.map(function(row){return '<div class="tline"><span class="tdot '+row[3]+
      '"></span><span class="tname">'+html(row[0])+'</span><span class="tnote">'+html(row[2])+
      '</span><span class="tval">'+dollars(row[1])+'</span></div>';}).join("")+'</div>'+
    '<p class="tfoot">Not a quote. Taxes, insurance and repairs vary by location, driver and vehicle condition. '+
      html(tco.source || "KickTires estimate")+'.</p>';
}

function render(output){
  const analysis = output.analysis || {}, car = output.car || {}, facts = output.facts || {};
  const title = [car.year,car.make,car.model,car.trim].filter(Boolean).join(" ");
  const chips = [
    facts.complaintTotal != null ? Number(facts.complaintTotal).toLocaleString()+" NHTSA complaints" : null,
    facts.recallTotal != null ? Number(facts.recallTotal).toLocaleString()+" recall campaigns" : null,
    facts.crashes ? Number(facts.crashes).toLocaleString()+" crash reports" : null,
    car.mileage != null ? Number(car.mileage).toLocaleString()+" mi" : null,
    car.price != null ? dollars(car.price) : null
  ].filter(Boolean);
  const deal = analysis.deal || {};
  const grade = validClass(deal.grade,["walk","caution","inspect","reasonable"],"inspect");

  const risks = (analysis.risks||[]).map(function(risk){
    const severity = validClass(risk.s,["crit","ser","warn"],"warn");
    const evidence = (risk.e||[]).map(function(row){
      const type = validClass(row[0],["v","s","o"],"o");
      return '<div class="ev"><div class="evtag e-'+type+'">'+html(row[1])+'</div><p class="evtxt">'+
        html(row[2])+'</p></div>';
    }).join("");
    return '<article class="risk s-'+severity+'"><div class="sevwrap"><div class="sevbar"></div>'+
      '<div class="sevtxt">'+html(risk.lbl)+'</div></div><div><h3 class="rtitle">'+html(risk.t)+'</h3>'+
      '<p class="rbody">'+html(risk.b)+'</p>'+evidence+'</div><div class="cost"><span class="cnum">'+
      html(risk.c)+'</span><div class="micro clbl">'+html(risk.cl)+'</div></div></article>';
  }).join("");

  const checklist = (analysis.chk||[]).map(function(item){
    return '<div class="chk"><div class="cbox"></div><p><b>'+html(item.lead)+'</b>'+
      (item.detail ? ' '+html(item.detail) : '')+'</p></div>';
  }).join("");
  const source = facts.source === "reviewed_db" ? "Reviewed KickTires profile" : "NHTSA records pulled live";
  const profileLink = output.profile ? '<p class="profilelink"><a href="'+html(output.profile)+
    '">Open the reviewed model page &rarr;</a></p>' : '';
  const stateOptions = Object.entries(STATES).map(function(entry){
    return '<option value="'+html(entry[0])+'"'+(entry[0]==="OH"?' selected':'')+'>'+html(entry[1].n)+'</option>';
  }).join("");

  $("live").innerHTML =
    '<section class="deal deal-'+grade+'"><p class="micro">Buyer verdict · ownership risk</p>'+
      '<div class="dealrow"><span class="dealbadge">'+html(deal.label || "Inspection first")+'</span>'+
      '<p>'+html(deal.reason || "The evidence is not strong enough to skip an inspection.")+'</p></div></section>'+
    '<section class="panel"><div class="carid"><p class="micro">'+html(source)+'</p><p class="cname">'+html(title)+'</p>'+
      '<div class="specs">'+chips.map(function(chip){return '<span class="spec">'+html(chip)+'</span>';}).join("")+'</div>'+
      '<p class="verdict-lead liveverdict">'+html(analysis.vline)+'</p><p class="lede liveline">'+html(analysis.vsub)+'</p>'+
      profileLink+'</div></section>'+
    '<h2>What actually goes wrong</h2><p class="sub">Ranked by what it can do to your wallet and safety.</p>'+
    '<section class="panel">'+risks+'<div class="legend">'+
      '<div class="lg"><div class="evtag e-v">NHTSA</div><p>Consumer reports and recall records filed in the federal database. Reports are not proof of a defect.</p></div>'+
      '<div class="lg"><div class="evtag e-s">OWNERS</div><p>Used only when a reviewed profile contains a checked owner source.</p></div>'+
      '<div class="lg"><div class="evtag e-o">OUR TAKE</div><p>Our judgment and cost estimates — the part that can be wrong.</p></div></div></section>'+
    (output.tco ? '<h2>What five years of ownership may cost</h2><div class="tcoheading"><p class="sub">Uses the asking price, 12,000 miles a year and the selected state.</p>'+
      '<label class="statepick">State <select id="statePick">'+stateOptions+'</select></label></div>'+
      '<section class="panel"><div class="pbody" id="tcoBody"></div></section>' : '')+
    '<h2>Take this to the inspection</h2><section class="panel"><div class="pbody">'+checklist+'</div></section>';

  if (output.tco) {
    const update = function(){ $("tcoBody").innerHTML = tcoRows(output.tco,car,$("statePick").value); };
    $("statePick").addEventListener("change",update); update();
  }
  $("live").scrollIntoView({behavior:"smooth",block:"start"});
}

function setBusy(busy){
  const button = $("analyzeBtn");
  button.disabled = busy;
  button.textContent = busy ? "Checking…" : "Check this car";
}

async function route(event){
  event.preventDefault();
  const text = $("inp").value.trim();
  if (!text) return false;
  track("listing_check_started");
  $("live").innerHTML = "";
  setBusy(true);
  hint("Reading the listing and pulling its federal records…");
  try {
    const response = await fetch("/api/analyze", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({text:text})
    });
    if (response.status === 429) {
      return fail("rate_limited", "Too many checks from this connection. Try again in a minute.");
    }
    const output = await response.json().catch(function(){return {};});
    if (output.analysis) {
      track("listing_analysis_completed", {
        evidence_source:output.facts && output.facts.source || "unknown",
        deal_grade:output.analysis.deal && output.analysis.deal.grade || "unknown",
        cache_status:output.cached ? "hit" : "miss"
      });
      hint(""); render(output); return false;
    }
    if (output.error === "fetch_failed") {
      return fail("fetch_failed", "That site blocked our reader. Copy the listing text — year, mileage, price and seller description — and paste it instead.");
    }
    if (output.error === "no_records") {
      return fail("no_records", "We identified the vehicle, but found no matching federal complaint or recall records. We will not invent an answer.");
    }
    if (output.error === "records_unavailable") {
      return fail("records_unavailable", "The federal data service did not respond. Try this check again in a moment.");
    }
    if (output.error === "no_vehicle") {
      return fail("no_vehicle", "We could not identify the exact year, make and model. Paste the listing text with all three.");
    }
    if (output.error === "missing_key") {
      return fail("missing_key", "The analysis service is not configured.");
    }
    return fail(output.error || "unknown", "We could not finish that analysis. Try pasting the listing text instead of the link.");
  } catch (error) {
    return fail("network_error", "Could not reach the analysis service. Try again in a moment.");
  } finally {
    setBusy(false);
  }
}
</script>` + foot;
}

function indexPage(){
  return head({title:`All models — ${NAME}`,
    desc:"Every used car model we've analysed against federal NHTSA complaint and recall records, with real ownership costs.",
    url:SITE+"/cars/"}) + `
<main class="shell">
  <div class="crumb"><a href="/">Home</a> › Models</div>
  <h1>Every model we've checked</h1>
  <p class="lede">Each page is cross-checked against federal complaint and recall records before it goes up. We add models in order of how often people search for them.</p>
  <div class="cards">${Object.values(D).map(o=>
    `<a class="card" href="/cars/${o.meta.slug}/"><span class="micro">${o.meta.nhtsa} complaints checked</span><span class="cardt">${o.meta.y} ${o.meta.mk} ${o.meta.md}</span><span class="cardd">${esc(o.vline)}</span></a>`).join("")}</div>
</main>` + foot;
}

function privacyPage(){
  return head({title:`Privacy & cookies — ${NAME}`,
    desc:"How KickTires handles data, analytics and advertising cookies.", url:SITE+"/privacy/"}) + `
<main class="shell">
  <div class="crumb"><a href="/">Home</a> › Privacy</div>
  <h1>Privacy &amp; cookies</h1>
  <p class="lede">Short version: we don't ask who you are, we don't have accounts, and we don't sell anything about you.</p>
  <h2>What we collect</h2>
  <p class="lede">Google Analytics 4 records page views, browser and device signals, approximate region, and three product events: an analysis started, completed, or failed. We do not send the listing text, pasted listing URL, price, mileage, location, or seller notes to Analytics. No names, accounts, or email addresses are collected. Listing text or page content you submit is sent to our configured AI provider to identify the vehicle and produce the analysis. We cache only the derived vehicle analysis and source summaries, not the pasted listing text.</p>
  <h2>Advertising</h2>
  <p class="lede">${ADSENSE ? "This site shows ads served by Google AdSense. Google and its partners may use cookies to serve ads based on your prior visits to this and other websites. You can opt out of personalised advertising at <a href='https://www.google.com/settings/ads'>Google Ads Settings</a>, or opt out of third-party vendor cookies at <a href='https://www.aboutads.info'>aboutads.info</a>." : "This site currently shows no advertising."}</p>
  <h2>What we never do</h2>
  <p class="lede">We take no money from car dealers, private sellers or listing marketplaces, and we accept no payment to change or soften what a page says about a vehicle. If that ever changes, it will be stated on this page before it happens anywhere else.</p>
  <h2>Contact</h2>
  <p class="lede">Corrections and complaints are welcome — especially corrections. If a page here is wrong about a car, we want to know.</p>
</main>` + foot;
}
function aboutPage(){
  return head({title:`About — ${NAME}`,
    desc:"Why KickTires exists, where the data comes from, and how we decide what to trust.", url:SITE+"/about/"}) + `
<main class="shell">
  <div class="crumb"><a href="/">Home</a> › About</div>
  <h1>About</h1>
  <p class="verdict-lead">Every site that ranks used cars for you is paid by someone who wants you to buy one.</p>
  <p class="lede">That is the reason they will happily call a car a great deal and never once explain why it is cheap. We are not paid by anybody who sells cars, so we can say the useful thing instead: this one will cost you money, and here is roughly how much.</p>
  <h2>Where the facts come from</h2>
  <p class="lede">Every claim on this site carries a label. <b>NHTSA</b> means it came straight out of federal recall and complaint records — looked up, not interpreted. <b>OWNERS</b> means owners reported it in public and we went and read the source. <b>OUR TAKE</b> is our judgment, which is the part that could be wrong, so we label it rather than blending it into the facts.</p>
  <h2>What we get wrong</h2>
  <p class="lede">Plenty, probably. Repair costs are estimates and vary by region and shop. Insurance figures are published averages, not quotes. And a car's reputation is not the same thing as a car's record — we have already found several cases where the famous problem with a model belongs to a different model year than everyone assumes.</p>
  <p class="lede">Nothing here replaces a pre-purchase inspection by someone who can put the car on a lift. Use these pages to know what to have them look at.</p>
</main>` + foot;
}

/* ── emit ──────────────────────────────────────────────────────── */
fs.rmSync(OUT, {recursive:true, force:true});
const write = (p, s) => { fs.mkdirSync(path.dirname(p), {recursive:true}); fs.writeFileSync(p, s); };

write(`${OUT}/index.html`, home());
write(`${OUT}/cars/index.html`, indexPage());
write(`${OUT}/privacy/index.html`, privacyPage());
write(`${OUT}/about/index.html`, aboutPage());
for (const [k,d] of Object.entries(D)) write(`${OUT}/cars/${d.meta.slug}/index.html`, modelPage(k,d));

const urls = [ [SITE+"/",1.0], [SITE+"/cars/",0.8], [SITE+"/about/",0.5], [SITE+"/privacy/",0.3],
  ...Object.values(D).map(d=>[`${SITE}/cars/${d.meta.slug}/`,0.9]) ];
write(`${OUT}/sitemap.xml`,
`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
urls.map(([u,p])=>`  <url><loc>${u}</loc><lastmod>${TODAY}</lastmod><priority>${p}</priority></url>`).join("\n") +
`\n</urlset>\n`);
// Search Console ownership file + anything you drop in ./static
if (GOOGLE_VERIFY) write(`${OUT}/${GOOGLE_VERIFY}.html`, `google-site-verification: ${GOOGLE_VERIFY}.html`);
if (fs.existsSync("static")) fs.cpSync("static", OUT, { recursive: true });

write(`${OUT}/robots.txt`, `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
write(`${OUT}/_headers`, `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n`);

console.log(`built ${urls.length} pages → ${OUT}/`);
