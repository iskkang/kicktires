// build.mjs — generates the static site from editorial and federal snapshot data
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
// Public AdSense client ID. Auto Ads placement is controlled in the AdSense account.
const ADSENSE = (process.env.ADSENSE_CLIENT || "ca-pub-3682195653529318").trim();
if (!/^ca-pub-\d{16}$/.test(ADSENSE)) throw new Error("invalid ADSENSE_CLIENT");
const ADSENSE_PUBLISHER = ADSENSE.replace(/^ca-/, "");
const EDITORIAL = JSON.parse(fs.readFileSync("data.json", "utf8"));
const GENERATED = JSON.parse(fs.readFileSync("generated.json", "utf8"));
// A current federal snapshot replaces an older editorial page with the same slug.
// The editorial source stays in the repository; it is never silently rewritten.
const profileIdentity = profile => `${profile.meta.y}|${profile.meta.mk}|${profile.meta.md}`
  .toLowerCase().replace(/[^a-z0-9|]/g, "");
const mergedProfiles = new Map();
for (const profile of [...Object.values(EDITORIAL), ...Object.values(GENERATED)]) {
  mergedProfiles.set(profileIdentity(profile), profile);
}
const D = Object.fromEntries([...mergedProfiles.values()].map(profile=>[profile.meta.slug,profile])
  .sort((a, b) => (a[1].meta.priority ?? 999) - (b[1].meta.priority ?? 999)
    || a[1].meta.mk.localeCompare(b[1].meta.mk)
    || a[1].meta.md.localeCompare(b[1].meta.md)
    || b[1].meta.y - a[1].meta.y));
const OUT = "dist";
const TODAY = process.env.BUILD_DATE || new Date().toISOString().slice(0, 10);

const css = fs.readFileSync("style.css", "utf8");
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const safeBold = s => esc(s).replace(/&lt;b&gt;/gi, "<b>").replace(/&lt;\/b&gt;/gi, "</b>");
const money = n => "$" + Math.round(n).toLocaleString("en-US");
const shortDesc = value => {
  const source = String(value || "").replace(/\s+/g," ").trim();
  if (source.length <= 160) return source;
  return source.slice(0,157).replace(/\s+\S*$/,"").replace(/[.,;:!?-]+$/,"") + "…";
};
const dateLabel = value => new Date(value).toLocaleDateString("en-US", {
  month:"short", day:"numeric", year:"numeric", timeZone:"UTC"
});

function validateProfiles(profiles){
  const slugs = new Set(), titles = new Set(), queries = new Set();
  for (const d of profiles) {
    const m = d.meta || {};
    if (!m.slug || slugs.has(m.slug)) throw new Error(`duplicate or missing slug: ${m.slug}`);
    if (!m.title || titles.has(m.title)) throw new Error(`duplicate or missing title: ${m.title}`);
    if (!m.q || queries.has(m.q)) throw new Error(`duplicate or missing query: ${m.q}`);
    if (!Array.isArray(d.risks) || d.risks.length < 2) throw new Error(`too few risks: ${m.slug}`);
    if (!Array.isArray(d.chk) || d.chk.length < 3) throw new Error(`too few checks: ${m.slug}`);
    if (d.generated) {
      if (!d.federal || d.federal.complaintTotal !== m.nhtsa
        || d.federal.recallTotal !== m.recalls) throw new Error(`federal totals mismatch: ${m.slug}`);
      if (!d.federal.retrievedAt || !d.quality?.factsFingerprint) {
        throw new Error(`missing provenance: ${m.slug}`);
      }
      if (d.risks.some(risk => risk.e?.some(row => row[0] === "s"))) {
        throw new Error(`unverified owner evidence: ${m.slug}`);
      }
    }
    slugs.add(m.slug); titles.add(m.title); queries.add(m.q);
  }
}
validateProfiles(Object.values(D));
const FEATURED = (() => {
  const groups = new Map();
  for (const profile of Object.values(D)) {
    const group = `${profile.meta.mk}|${profile.meta.md}`;
    const current = groups.get(group);
    const distance = Math.abs(profile.meta.y - 2020);
    if (!current || distance < Math.abs(current.meta.y - 2020)) groups.set(group, profile);
  }
  return [...groups.values()].sort((a,b)=>(a.meta.priority??999)-(b.meta.priority??999)).slice(0,10);
})();

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
  const metaDesc = shortDesc(desc);
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(metaDesc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(metaDesc)}"><meta property="og:url" content="${url}">
<meta property="og:site_name" content="${NAME}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(metaDesc)}">
<meta name="google-adsense-account" content="${ADSENSE}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%233987e5'/><rect x='8' y='11' width='16' height='3' rx='1.5' fill='%230a0b0d'/><rect x='8' y='18' width='16' height='3' rx='1.5' fill='%230a0b0d'/></svg>">
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config","${GA_MEASUREMENT_ID}");</script>
<style>${css}</style>
${ADSENSE ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE}" crossorigin="anonymous"></script>` : ""}
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>` : ""}
</head><body>
<nav><div class="navin">
  <a class="logo" href="/"><i></i>${NAME}</a>
  <div class="navlinks">
    <a class="navlink navcheck" href="/#check">Check a listing</a>
    <a class="navlink" href="/cars/">Model guides</a>
  </div>
</div></nav>`;
}
const foot = `<footer class="site"><div class="shell">
<p>Sources: NHTSA recall, complaint and investigation records · EPA fuel economy data · owner forums · our own reading of them.</p>
<p class="fine"><b>Kick the tires.</b> It is what someone older told you to do before you bought a used car, and they were right — you just needed better things to look at. That is all this is.</p>
<p class="fine">We take no money from dealers, sellers or marketplaces. Cost figures are estimates, not quotes. Always get an independent inspection before buying.</p>
<p class="fine"><a href="/privacy/">Privacy &amp; cookies</a> · <a href="/about/">About</a></p>
</div></footer></body></html>`;

/* ── model page ────────────────────────────────────────────────── */
function modelPage(key, d){
  const m = d.meta, url = `${SITE}/cars/${m.slug}/`;
  const T = d.tco && typeof d.price === "number" ? tco(d, STATES.OH) : null;
  const hasListing = typeof d.price === "number";
  const federal = d.federal || null;
  const published = m.published || m.retrievedAt?.slice(0,10) || "2026-08-06";
  const modified = m.updated || m.retrievedAt?.slice(0,10) || published;
  const peers = Object.values(D).filter(o => o.meta.mk === m.mk && o.meta.md === m.md)
    .sort((a,b) => a.meta.y - b.meta.y);
  const seenModels = new Set();
  const others = Object.values(D).filter(o => {
    const group = `${o.meta.mk}|${o.meta.md}`;
    if (o.meta.slug === m.slug || group === `${m.mk}|${m.md}` || seenModels.has(group)) return false;
    seenModels.add(group); return true;
  }).slice(0,6);
  const risks = d.risks.map(r=>`
    <article class="risk s-${["crit","ser","warn"].includes(r.s) ? r.s : "warn"}">
      <div class="sevwrap"><div class="sevbar"></div><div class="sevtxt">${esc(r.lbl)}</div></div>
      <div><h3 class="rtitle">${esc(r.t)}</h3><p class="rbody">${esc(r.b)}</p>
      ${r.e.map(([t,tag,txt])=>`<div class="ev"><div class="evtag e-${["v","s","o"].includes(t) ? t : "o"}">${esc(tag)}</div><p class="evtxt">${esc(txt)}</p></div>`).join("")}</div>
      <div class="cost"><span class="cnum">${esc(r.c)}</span><div class="micro clbl">${esc(r.cl)}</div></div>
    </article>`).join("");

  const jsonld = {
    "@context":"https://schema.org","@type":"Article",
    headline:m.title, description:m.desc, datePublished:published, dateModified:modified,
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

  const federalPanel = !federal ? "" : (() => {
    const top = federal.topComponents.slice(0,6);
    const max = Math.max(1,...top.map(item=>item.count));
    const components = top.map(item=>`<div class="component-row">
      <span>${esc(item.component)}</span><div><i style="width:${(item.count/max*100).toFixed(1)}%"></i></div>
      <b>${item.count.toLocaleString("en-US")}</b></div>`).join("");
    const excerpts = top.slice(0,3).flatMap(item => (item.examples||[]).slice(0,1)
      .filter(example => example.length >= 20).map(example=>`<article class="report-excerpt">
        <p class="micro">Representative ${esc(item.component)} report</p><p>${esc(example)}</p></article>`)).join("");
    const recallRows = federal.recalls.slice(0,6).map(item=>`<article class="recall-row">
      <div><span class="campaign">${esc(item.campaign)}</span><b>${esc(item.component)}</b></div>
      <p>${esc(item.consequence || "See the campaign record for the stated safety consequence.")}</p></article>`).join("");
    const epa = d.epa?.kind === "liquid" ? `<div><span>EPA efficiency</span><b>${d.epa.mpg} mpg</b>
      <small>median across ${d.epa.variants} configurations</small></div>` : "";
    return `<h2>The federal record, without the folklore</h2>
      <p class="sub">Retrieved ${dateLabel(federal.retrievedAt)}. Complaint reports are allegations, not verified defects or failure rates.</p>
      <section class="panel federal-panel">
        <div class="record-stats">
          <div><span>Complaints</span><b>${federal.complaintTotal.toLocaleString("en-US")}</b><small>NHTSA consumer reports</small></div>
          <div><span>Recall campaigns</span><b>${federal.recallTotal.toLocaleString("en-US")}</b><small>VIN applicability varies</small></div>
          <div><span>Crash flags</span><b>${federal.crashes.toLocaleString("en-US")}</b><small>reports marked crash</small></div>
          <div><span>Fire flags</span><b>${federal.fires.toLocaleString("en-US")}</b><small>reports marked fire</small></div>${epa}
        </div>
        ${top.length ? `<div class="federal-block"><div class="block-head"><div><p class="micro">Complaint tags</p><h3>Where owners reported problems</h3></div></div>
          <div class="component-list">${components}</div><p class="data-note">One complaint can carry more than one component tag, so these rows do not add up to the complaint total.</p></div>` : ""}
        ${excerpts ? `<div class="federal-block"><div class="block-head"><div><p class="micro">Raw federal reports</p><h3>What representative filings say</h3></div></div>
          <div class="report-grid">${excerpts}</div><p class="data-note">Excerpts are allegations submitted to NHTSA. They are shown as inspection leads, not proof of a defect.</p></div>` : ""}
        ${recallRows ? `<div class="federal-block"><div class="block-head"><div><p class="micro">Safety campaigns</p><h3>Recall records to check by VIN</h3></div>
          <a href="https://www.nhtsa.gov/recalls" rel="noopener">Check your VIN at NHTSA ↗</a></div><div class="recall-list">${recallRows}</div>
          ${federal.recallTotal > 6 ? `<p class="data-note">Showing 6 of ${federal.recallTotal} campaigns returned for this model year.</p>` : ""}</div>` : ""}
      </section>`;
  })();

  const peerPanel = peers.length < 2 ? "" : `<h2>Compare nearby model years</h2>
    <p class="sub">The badge is the leading NHTSA complaint tag for that year. A high total is not a failure rate.</p>
    <div class="year-compare">${peers.map(peer=>{
      const lead = peer.federal?.topComponents?.[0];
      const inner = `<span class="year-num">${peer.meta.y}</span><b>${peer.meta.nhtsa.toLocaleString("en-US")} complaints</b><small>${esc(lead?.component || peer.vline)}</small>`;
      return peer.meta.slug === m.slug ? `<div class="year-card current">${inner}<em>Current page</em></div>`
        : `<a class="year-card" href="/cars/${peer.meta.slug}/">${inner}<em>Open guide →</em></a>`;
    }).join("")}</div>`;

  return head({title:m.title, desc:m.desc, url, jsonld:[jsonld,faq]}) + `
<main class="shell">
  <div class="crumb"><a href="/">Home</a> › <a href="/cars/">Models</a> › ${m.y} ${m.mk} ${m.md}</div>
  <p class="micro">${d.generated ? `Federal snapshot · retrieved ${dateLabel(federal.retrievedAt)}`
    : `Editorially reviewed against ${m.nhtsa} NHTSA complaints`}</p>
  <h1>${m.y} ${m.mk} ${m.md} problems</h1>
  <p class="verdict-lead">${esc(d.vline)}</p>
  <p class="lede">${esc(d.vsub)}</p>

  <section class="panel">
    <div class="phead"><div><p class="micro">${hasListing ? "Example listing" : "What we checked"}</p>
      <p class="rtitle" style="margin:6px 0 0;font-size:17px">${esc(d.name)}</p></div></div>
    <div class="pbody"><div class="specs">${d.specs.map(s=>`<span class="spec">${esc(s)}</span>`).join("")}</div></div>
  </section>

  <section class="model-cta">
    <div><p class="micro">Check the actual listing</p><h2>Model-year records cannot tell you whether this price is good.</h2>
      <p>Paste the listing with its price and mileage. We will compare active listings, apply these federal records and estimate five-year cost.</p></div>
    <a class="btn" href="/#check" onclick="if(window.gtag)gtag('event','model_analyzer_clicked',{page_slug:'${m.slug}'})">Check a listing</a>
  </section>

  ${federalPanel}

  <h2>${d.generated ? "What deserves inspection" : "What actually goes wrong"}</h2>
  <p class="sub">Ranked by potential cost and safety. Counts show complaint tags, not the probability that your car will fail.</p>
  <section class="panel">${risks}
    <div class="legend">
      <div class="lg"><div class="evtag e-v">NHTSA</div><p>Straight from federal recall and complaint records. Looked up, not interpreted.</p></div>
      ${d.generated ? "" : `<div class="lg"><div class="evtag e-s">OWNERS</div><p>Reported by owners in public forums, with a source we checked ourselves.</p></div>`}
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

  ${T ? "" : `<h2>What five years may cost</h2>
  <section class="estimate-callout"><div><p class="micro">No fake total</p><h3>The listing is missing from this page.</h3>
    <p>A real total needs the asking price, mileage and state. ${d.epa?.mpg ? `EPA data puts this model year's configurations around ${d.epa.mpg} mpg, but fuel is only one part of the bill.` : "Federal records alone are not enough to price ownership."}</p></div>
    <a href="/#check" onclick="if(window.gtag)gtag('event','model_analyzer_clicked',{page_slug:'${m.slug}',placement:'tco'})">Paste a listing →</a></section>`}

  <h2>Take this to the inspection</h2>
  <section class="panel"><div class="pbody">
    ${d.chk.map(c=>`<div class="chk"><div class="cbox"></div><p>${safeBold(c)}</p></div>`).join("")}
  </div></section>

  <section class="oath">
    <p class="micro">Why you can trust this</p>
    <p><b>We take no money from dealers, sellers, or marketplaces — ever.</b> Every site that ranks listings for you is paid by someone who wants you to buy one. That is why they will call a car a great deal and never tell you why it is cheap. We have nothing to lose if you walk away.</p>
  </section>

  ${peerPanel}

  <h2>Other popular models</h2>
  <div class="cards">${others.map(o=>
    `<a class="card" href="/cars/${o.meta.slug}/"><span class="micro">${o.meta.nhtsa} complaints</span><span class="cardt">${o.meta.y} ${o.meta.mk} ${o.meta.md}</span><span class="cardd">${esc(o.vline)}</span></a>`).join("")}</div>
</main>` + foot;
}

/* ── home ──────────────────────────────────────────────────────── */
function home(){
  const jsonld = {"@context":"https://schema.org","@type":"WebSite",name:NAME,url:SITE+"/"};
  return head({title:`${NAME} — paste the listing, know the deal`,
    desc:"Paste any used car listing. We compare the asking price with similar active listings, check federal complaint records, and estimate five-year ownership cost. We take no money from sellers.",
    url:SITE+"/", jsonld}) + `
<main class="shell home-shell">
  <section class="hero" id="check"><div class="hero-grid">
    <div class="hero-primary">
      <div class="hero-copy">
        <p class="micro">Free used-car deal check</p>
        <h1 class="big">Paste the listing.<br><em>Know the deal.</em></h1>
        <p class="lede">We compare the asking price, federal safety records and five-year ownership cost. Then we tell you who wins: you or the seller.</p>
      </div>
      <form class="paste" onsubmit="route(event);return false">
        <label class="paste-label" for="inp">Listing URL or listing text</label>
        <textarea id="inp" autocomplete="off" spellcheck="false" placeholder="Paste a Cars.com, Autotrader or dealer link. For Facebook Marketplace, paste the listing text."></textarea>
        <div class="pfoot"><span class="srcs">URL or pasted text · no account needed</span>
        <button class="btn" id="analyzeBtn" type="submit">Check this deal</button></div>
      </form>
      <div class="hero-actions">
        <button class="example-link" type="button" onclick="useExample()">Try a real example</button>
        <span>Most checks take 20–40 seconds</span>
      </div>
      <p id="hint" class="hint" aria-live="polite"></p>
      <div class="trustrow" aria-label="KickTires data sources">
        <span>Live market listings</span><span>NHTSA federal records</span><span>No dealer commissions</span>
      </div>
    </div>
    <aside class="result-preview" aria-label="Example KickTires result">
      <div class="preview-top"><span class="micro">Example result</span><span class="preview-dot">Live-data format</span></div>
      <p class="preview-car">2023 Tesla Model Y Performance</p>
      <p class="preview-grade">Price needs explaining</p>
      <p class="preview-copy">Far below comparable listings. Verify the title, condition and fees before calling it a bargain.</p>
      <div class="preview-metrics">
        <div><span>Market</span><b>$9,009 below</b></div>
        <div><span>Evidence</span><b>56 matches</b></div>
        <div><span>Federal</span><b>16 recalls</b></div>
      </div>
      <p class="preview-foot">The cheapest answer is not always “buy it.”</p>
    </aside>
  </div></section>

  <div id="live" aria-live="polite"></div>

  <div class="section-heading model-heading"><div><p class="micro">Buyer guides</p><h2>Popular models we've checked</h2></div>
    <a href="/cars/">See all models &rarr;</a></div>
  <p class="sub">${Object.values(D).length} year-specific guides built from federal complaint and recall records.</p>
  <div class="cards">${FEATURED.map(o=>
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
const MODEL_NAMES = {modely:"Model Y",model3:"Model 3",crv:"CR-V",f150:"F-150",f250:"F-250",
  rav4:"RAV4",cx5:"CX-5",grandcherokee:"Grand Cherokee",santafe:"Santa Fe",boltev:"Bolt EV"};
const titleCase = value => String(value || "").replace(/\b\w/g,function(letter){return letter.toUpperCase();});
const prettyVehicle = car => {
  const key = String(car.model || "").toLowerCase().replace(/[^a-z0-9]/g,"");
  const make = /^(bmw|gmc)$/i.test(car.make || "") ? String(car.make).toUpperCase() : titleCase(car.make);
  const model = MODEL_NAMES[key] || titleCase(String(car.model || "").replace(/([a-z])([0-9])/gi,"$1 $2"));
  return [car.year,make,model,car.trim].filter(Boolean).join(" ");
};
const track = (name, params) => {
  if (typeof window.gtag === "function") window.gtag("event", name, params || {});
};
const fail = (code, message) => {
  stopLoading();
  track("listing_analysis_failed", {error_code:code});
  hint("");
  $("live").innerHTML = '<section class="analysis-state analysis-error" role="alert">'+
    '<p class="micro">Analysis stopped</p><h2>We could not finish this check.</h2><p>'+html(message)+'</p>'+
    '<button class="btn state-button" type="button" onclick="editCheck()">Edit the listing and try again</button></section>';
  $("live").scrollIntoView({behavior:"smooth",block:"start"});
  return false;
};

function useExample(){
  $("inp").value = "Used 2023 Tesla Model Y Performance AWD\\n28,000 miles\\nSterling, VA\\n$24,986";
  track("example_listing_loaded");
  $("inp").focus();
  $("inp").scrollIntoView({behavior:"smooth",block:"center"});
}

function resetCheck(){
  stopLoading();
  $("live").innerHTML = "";
  $("inp").value = "";
  document.body.classList.remove("analysis-active");
  track("check_another_listing");
  $("check").scrollIntoView({behavior:"smooth",block:"start"});
  window.setTimeout(function(){$("inp").focus();},350);
}

function editCheck(){
  stopLoading();
  $("live").innerHTML = "";
  document.body.classList.remove("analysis-active");
  track("edit_listing");
  $("check").scrollIntoView({behavior:"smooth",block:"start"});
  window.setTimeout(function(){$("inp").focus();},350);
}

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

function marketCard(market, verdictGrade){
  if (!market || market.status === "missing_input") return "";
  if (market.status !== "ready") {
    const count = Number(market.sampleSize || 0);
    const title = market.status === "not_configured" ? "Ownership risk only."
      : market.status === "insufficient" ? "Not enough close listings."
      : "The live market source did not answer.";
    const detail = market.status === "insufficient"
      ? (count ? "We found "+count+" close active listings, but need at least 8 before grading the price. " : "")+
        "We will not turn a thin sample into a smart-buy verdict."
      : html(market.message || "No live price comparison is available for this check.");
    return '<section class="analysis-state market-limit" role="note"><p class="micro">Market verdict unavailable</p>'+
      '<h2>'+html(title)+'</h2><p>'+detail+'</p></section>';
  }

  const delta = Number(market.deltaPercent || 0);
  const deltaClass = "market-tone-"+validClass(verdictGrade,
    ["walk","caution","inspect","reasonable"],"inspect");
  const deltaText = Math.abs(delta) < 0.05 ? "at the market median"
    : Math.abs(delta).toFixed(1)+"% "+(delta > 0 ? "above" : "below")+" median";
  const range = Number.isFinite(Number(market.percentile25)) && Number.isFinite(Number(market.percentile75))
    ? dollars(market.percentile25)+"–"+dollars(market.percentile75) : "Not available";
  const seller = market.sellerType === "private-party" ? "private-party" : "dealer";
  const retrieved = market.retrievedAt ? new Date(market.retrievedAt).toLocaleDateString("en-US",{
    month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}) : "today";
  const prices = [market.askingPrice,market.percentile25,market.medianPrice,market.percentile75]
    .map(function(value){return value == null ? NaN : Number(value);}).filter(Number.isFinite);
  const floor = Math.min.apply(null,prices)*0.92, ceiling = Math.max.apply(null,prices)*1.08;
  const scale = Math.max(1,ceiling-floor);
  const position = function(value){return Math.max(2,Math.min(98,(Number(value)-floor)/scale*100));};
  const askPos = position(market.askingPrice), medianPos = position(market.medianPrice);
  const bandLeft = position(market.percentile25), bandRight = position(market.percentile75);
  return '<section class="panel live-market"><div class="market-head"><div><p class="micro">Live market comparison</p>'+
    '<h2><strong>'+dollars(market.askingPrice)+'</strong> asking <span>vs '+dollars(market.medianPrice)+' median</span></h2></div>'+
    '<span class="market-delta '+deltaClass+'">'+html(deltaText)+'</span></div>'+
    '<div class="market-meter-wrap"><div class="market-meter" aria-label="Asking price compared with the market median">'+
      '<span class="market-band" style="left:'+bandLeft.toFixed(1)+'%;width:'+Math.max(1,bandRight-bandLeft).toFixed(1)+'%"></span>'+
      '<span class="market-median" style="left:'+medianPos.toFixed(1)+'%"></span>'+
      '<span class="market-you '+deltaClass+'" style="left:'+askPos.toFixed(1)+'%"></span></div>'+
      '<div class="market-key"><span><i class="key-you '+deltaClass+'"></i>You '+dollars(market.askingPrice)+'</span>'+
      '<span><i class="key-median"></i>Median '+dollars(market.medianPrice)+'</span></div></div>'+
    '<div class="market-stats">'+
      '<div><span class="micro">Close matches</span><b>'+Number(market.sampleSize).toLocaleString()+" active "+html(seller)+' listings</b></div>'+
      '<div><span class="micro">Middle 50%</span><b>'+html(range)+'</b></div>'+
      '<div><span class="micro">Mileage band</span><b>'+Number(market.mileageLow).toLocaleString()+"–"+Number(market.mileageHigh).toLocaleString()+' mi</b></div>'+
      '<div><span class="micro">Market</span><b>'+html(market.scope)+'</b></div>'+
    '</div><p class="market-note">'+html(market.match)+'. Asking-price comparison from '+html(market.source)+
      ', retrieved '+html(retrieved)+'. Active asking prices are not completed sale prices.</p></section>';
}

function render(output){
  const analysis = output.analysis || {}, car = output.car || {}, facts = output.facts || {};
  const limitations = output.limitations || {}, market = output.market || {};
  const title = prettyVehicle(car);
  const chips = [
    facts.complaintTotal != null ? Number(facts.complaintTotal).toLocaleString()+" NHTSA complaints" : null,
    facts.recallTotal != null ? Number(facts.recallTotal).toLocaleString()+" recall campaigns" : null,
    facts.crashes ? Number(facts.crashes).toLocaleString()+" crash reports" : null,
    car.mileage != null ? Number(car.mileage).toLocaleString()+" mi" : null,
    car.price != null ? dollars(car.price) : null,
    car.certified ? "Certified pre-owned" : null
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
  const source = facts.source === "reviewed_db" ? "Reviewed KickTires profile"
    : facts.source === "federal_snapshot" ? "Precomputed NHTSA snapshot" : "NHTSA records pulled live";
  const profileLabel = facts.source === "federal_snapshot"
    ? "Open the federal model-year page" : "Open the reviewed model page";
  const profileLink = output.profile ? '<p class="profilelink"><a href="'+html(output.profile)+
    '">'+html(profileLabel)+' &rarr;</a></p>' : '';
  const missing = Array.isArray(limitations.missing) ? limitations.missing : [];
  const missingLabel = missing.join(" and ");
  const stateMatch = String(car.location || "").match(/,\\s*([A-Z]{2})(?:\\s+\\d{5})?\\b/);
  const defaultState = stateMatch && STATES[stateMatch[1]] ? stateMatch[1] : "OH";
  const stateOptions = Object.entries(STATES).map(function(entry){
    return '<option value="'+html(entry[0])+'"'+(entry[0]===defaultState?' selected':'')+'>'+html(entry[1].n)+'</option>';
  }).join("");
  const verdictScope = market.status === "ready" ? "price + ownership risk" : "ownership risk only";
  const displayGrade = missing.length ? "incomplete" : grade;
  const displayLabel = missing.length ? "Incomplete listing" : (deal.label || "Inspection first");
  const displayReason = missing.length
    ? "The listing is missing "+missingLabel+". We can screen this model, but cannot tell whether this specific deal is good."
    : (deal.reason || "The evidence is not strong enough to skip an inspection.");
  const marketMetric = market.status === "ready"
    ? dollars(Math.abs(Number(market.deltaAmount || 0)))+" "+(Number(market.deltaPercent) < 0 ? "below" : "above")
    : missing.includes("mileage") ? "Need mileage" : missing.includes("asking price") ? "Need price" : "Risk only";
  const marketNote = market.status === "ready" ? Math.abs(Number(market.deltaPercent || 0)).toFixed(1)+"% vs median" : "No deal grade";
  const federalMetric = Number(facts.recallTotal) > 0 ? Number(facts.recallTotal).toLocaleString()+" recalls"
    : facts.complaintTotal != null ? Number(facts.complaintTotal).toLocaleString()+" reports" : "Records checked";
  const tcoResult = output.tco ? totalCost(output.tco,Number(car.price),defaultState) : null;
  const tcoMetric = tcoResult ? dollars(tcoResult.total) : (car.price == null ? "Need price" : "Unavailable");
  const missingAction = missing.length ? '<div class="missing-action"><span><b>Needed:</b> '+html(missingLabel)+
    '</span><button type="button" onclick="editCheck()">Add details</button></div>' : '';

  $("live").innerHTML =
    '<section class="deal deal-'+displayGrade+'"><div class="deal-head"><div><p class="micro">KickTires buyer verdict · '+html(verdictScope)+'</p>'+
      '<p class="deal-car">'+html(title)+'</p></div><button class="text-button" type="button" onclick="resetCheck()">Check another</button></div>'+
      '<h2 class="deal-title">'+html(displayLabel)+'</h2><p class="deal-reason">'+html(displayReason)+'</p>'+missingAction+
      '<div class="deal-metrics"><div><span>Market position</span><b>'+html(marketMetric)+'</b><small>'+html(marketNote)+'</small></div>'+
      '<div><span>Federal record</span><b>'+html(federalMetric)+'</b><small>NHTSA model-year data</small></div>'+
      '<div><span>Five-year cost</span><b id="dealTcoMetric">'+html(tcoMetric)+'</b><small id="dealTcoState">'+html(STATES[defaultState].n)+' estimate</small></div></div></section>'+
    marketCard(market,grade)+
    '<section class="panel"><div class="carid"><p class="micro">'+html(source)+'</p><p class="cname">'+html(title)+'</p>'+
      '<div class="specs">'+chips.map(function(chip){return '<span class="spec">'+html(chip)+'</span>';}).join("")+'</div>'+
      '<p class="verdict-lead liveverdict">'+html(analysis.vline)+'</p><p class="lede liveline">'+html(analysis.vsub)+'</p>'+
      profileLink+'</div></section>'+
    '<div class="section-heading result-heading"><div><p class="micro">Vehicle risk</p><h2>What actually goes wrong</h2></div></div><p class="sub">Ranked by what it can do to your wallet and safety.</p>'+
    '<section class="panel">'+risks+'<div class="legend">'+
      '<div class="lg"><div class="evtag e-v">NHTSA</div><p>Consumer reports and recall records filed in the federal database. Reports are not proof of a defect.</p></div>'+
      '<div class="lg"><div class="evtag e-s">OWNERS</div><p>Used only when a reviewed profile contains a checked owner source.</p></div>'+
      '<div class="lg"><div class="evtag e-o">OUR TAKE</div><p>Our judgment and cost estimates — the part that can be wrong.</p></div></div></section>'+
    (output.tco ? '<div class="section-heading result-heading"><div><p class="micro">Ownership cost</p><h2>What five years may cost</h2></div></div><div class="tcoheading"><p class="sub">'+
      (missing.includes("mileage") ? 'Current mileage is missing, so repairs are only a generic model-year estimate. ' : '')+
      'Uses the asking price, 12,000 miles a year and the selected state.</p>'+
      '<label class="statepick">State <select id="statePick">'+stateOptions+'</select></label></div>'+
      '<section class="panel"><div class="pbody" id="tcoBody"></div></section>' : '')+
    '<div class="section-heading result-heading"><div><p class="micro">Before you buy</p><h2>Take this to the inspection</h2></div></div>'+
    '<section class="panel"><div class="pbody">'+checklist+'</div></section>'+
    '<section class="again"><div><p class="micro">One more car?</p><h2>Check the next listing before you text the seller.</h2></div>'+
      '<button class="btn" type="button" onclick="resetCheck()">Check another deal</button></section>';

  if (output.tco) {
    const update = function(){
      const stateCode = $("statePick").value;
      $("tcoBody").innerHTML = tcoRows(output.tco,car,stateCode);
      const summary = totalCost(output.tco,Number(car.price),stateCode);
      if (summary && $("dealTcoMetric")) $("dealTcoMetric").textContent = dollars(summary.total);
      if ($("dealTcoState")) $("dealTcoState").textContent = STATES[stateCode].n+" estimate";
    };
    $("statePick").addEventListener("change",update); update();
  }
  $("live").scrollIntoView({behavior:"smooth",block:"start"});
}

function setBusy(busy){
  const button = $("analyzeBtn");
  button.disabled = busy;
  button.textContent = busy ? "Checking…" : "Check this deal";
}

const LOADING_STAGES = [
  {after:0, step:0, title:"Reading the listing", detail:"Finding the exact year, make, model, price and mileage."},
  {after:6, step:1, title:"Checking comparable listings", detail:"Comparing price and mileage with close active listings."},
  {after:14, step:2, title:"Pulling federal records", detail:"Checking NHTSA complaints and recall campaigns for this model year."},
  {after:23, step:3, title:"Building your buyer verdict", detail:"Combining market price, ownership risk and five-year cost."},
  {after:40, step:3, title:"Still working. Nothing is stuck.", detail:"Live market sources can take close to a minute. Keep this tab open."}
];
let loadingTimer = null;
let loadingStartedAt = 0;

function updateLoading(){
  const elapsed = Math.max(0,Math.floor((Date.now()-loadingStartedAt)/1000));
  const stage = LOADING_STAGES.reduce(function(active,item){
    return elapsed >= item.after ? item : active;
  },LOADING_STAGES[0]);
  const title = $("loadingTitle"), detail = $("loadingDetail"), clock = $("loadingClock");
  if (!title || !detail || !clock) return;
  if (title.textContent !== stage.title) title.textContent = stage.title;
  if (detail.textContent !== stage.detail) detail.textContent = stage.detail;
  clock.textContent = elapsed + "s elapsed";
  const steps = document.querySelectorAll("#loadingSteps li");
  steps.forEach(function(item,index){
    item.classList.toggle("done",index < stage.step);
    item.classList.toggle("on",index === stage.step);
  });
}

function startLoading(){
  stopLoading();
  loadingStartedAt = Date.now();
  document.body.classList.add("analysis-active");
  $("live").setAttribute("aria-busy","true");
  $("live").innerHTML = '<section class="analysis-state analysis-loading" role="status">'+
    '<div class="loading-copy"><div class="loading-top"><p class="micro">Live deal check</p>'+
    '<span id="loadingClock" class="loading-clock" aria-hidden="true">0s elapsed</span></div>'+
    '<div class="loading-title-row"><div class="loading-mark" aria-hidden="true"><span></span></div><div>'+
    '<h2 id="loadingTitle">Reading the listing</h2>'+
    '<p id="loadingDetail">Finding the exact year, make, model, price and mileage.</p></div></div>'+
    '<ol class="loading-steps" id="loadingSteps" aria-label="Analysis progress">'+
      '<li class="on"><i></i><span>Read listing</span></li><li><i></i><span>Compare market</span></li>'+
      '<li><i></i><span>Check NHTSA</span></li><li><i></i><span>Build verdict</span></li></ol>'+
    '<div class="loading-track" aria-hidden="true"><span></span></div>'+
    '<p class="loading-note">Most checks finish in 20–40 seconds. Keep this tab open.</p></div></section>';
  updateLoading();
  loadingTimer = window.setInterval(updateLoading,1000);
  window.requestAnimationFrame(function(){
    $("live").scrollIntoView({behavior:"smooth",block:"start"});
  });
}

function stopLoading(){
  if (loadingTimer != null) window.clearInterval(loadingTimer);
  loadingTimer = null;
  const live = $("live");
  if (live) live.setAttribute("aria-busy","false");
}

async function route(event){
  event.preventDefault();
  const text = $("inp").value.trim();
  if (!text) return false;
  track("listing_check_started");
  setBusy(true);
  hint("");
  startLoading();
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
      stopLoading();
      track("listing_analysis_completed", {
        evidence_source:output.facts && output.facts.source || "unknown",
        deal_grade:output.analysis.deal && output.analysis.deal.grade || "unknown",
        market_status:output.market && output.market.status || "unknown",
        cache_status:output.cached ? "hit" : "miss"
      });
      render(output); return false;
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
    stopLoading();
    setBusy(false);
  }
}
</script>` + foot;
}

function indexPage(){
  const groups = new Map();
  for (const profile of Object.values(D)) {
    const id = `${profile.meta.mk}|${profile.meta.md}`;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(profile);
  }
  const ordered = [...groups.values()].sort((a,b)=>(a[0].meta.priority??999)-(b[0].meta.priority??999)
    || a[0].meta.mk.localeCompare(b[0].meta.mk) || a[0].meta.md.localeCompare(b[0].meta.md));
  const sections = ordered.map(items => {
    items.sort((a,b)=>b.meta.y-a.meta.y);
    const first = items[0];
    const search = `${first.meta.mk} ${first.meta.md}`.toLowerCase();
    return `<section class="model-group" data-search="${esc(search)}">
      <div class="model-group-head"><div><p class="micro">${esc(first.meta.mk)}</p><h2>${esc(first.meta.mk)} ${esc(first.meta.md)}</h2></div>
        <span>${items.length} model year${items.length===1?"":"s"}</span></div>
      <div class="model-years">${items.map(o=>{
        const lead = o.federal?.topComponents?.[0]?.component;
        return `<a href="/cars/${o.meta.slug}/"><span class="year-num">${o.meta.y}</span>
          <b>${o.meta.nhtsa.toLocaleString("en-US")} complaints</b>
          <small>${o.meta.recalls.toLocaleString("en-US")} recalls${lead?` · ${esc(lead)}`:""}</small><em>Open guide →</em></a>`;
      }).join("")}</div></section>`;
  }).join("");
  return head({title:`All models — ${NAME}`,
    desc:"Every used car model we've analysed against federal NHTSA complaint and recall records, with real ownership costs.",
    url:SITE+"/cars/"}) + `
<main class="shell">
  <div class="crumb"><a href="/">Home</a> › Models</div>
  <h1>Every model we've checked</h1>
  <p class="lede">${Object.values(D).length} model-year pages. Each federal snapshot must pass the complaint, recall and provenance checks before it is published.</p>
  <div class="model-index-tools"><label for="modelSearch">Find a make or model</label>
    <input id="modelSearch" type="search" autocomplete="off" placeholder="Try Camry, Civic or F-150"></div>
  <div class="model-groups" id="modelGroups">${sections}</div>
  <p class="no-models" id="noModels" hidden>No matching guide yet. Paste the listing on the home page and we will still analyze it live.</p>
</main>
<script>
const modelSearch=document.getElementById("modelSearch");
modelSearch.addEventListener("input",function(){
  const query=this.value.trim().toLowerCase();let shown=0;
  document.querySelectorAll(".model-group").forEach(function(group){
    const visible=!query||group.dataset.search.includes(query);group.hidden=!visible;if(visible)shown++;
  });
  document.getElementById("noModels").hidden=shown!==0;
});
</script>` + foot;
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
  <p class="lede">This site is configured to show ads served by Google AdSense. Google and its partners may use cookies to serve ads based on your prior visits to this and other websites. You can opt out of personalised advertising at <a href='https://www.google.com/settings/ads'>Google Ads Settings</a>, or opt out of third-party vendor cookies at <a href='https://www.aboutads.info'>aboutads.info</a>.</p>
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

const urls = [ [SITE+"/",1.0,TODAY], [SITE+"/cars/",0.8,TODAY], [SITE+"/about/",0.5,TODAY], [SITE+"/privacy/",0.3,TODAY],
  ...Object.values(D).map(d=>[`${SITE}/cars/${d.meta.slug}/`,0.9,
    d.meta.updated || d.meta.retrievedAt?.slice(0,10) || "2026-08-06"]) ];
write(`${OUT}/sitemap.xml`,
`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
urls.map(([u,p,lastmod])=>`  <url><loc>${u}</loc><lastmod>${lastmod}</lastmod><priority>${p}</priority></url>`).join("\n") +
`\n</urlset>\n`);
// Search Console ownership file + anything you drop in ./static
if (GOOGLE_VERIFY) write(`${OUT}/${GOOGLE_VERIFY}.html`, `google-site-verification: ${GOOGLE_VERIFY}.html`);
if (fs.existsSync("static")) fs.cpSync("static", OUT, { recursive: true });

write(`${OUT}/ads.txt`, `google.com, ${ADSENSE_PUBLISHER}, DIRECT, f08c47fec0942fa0\n`);
write(`${OUT}/robots.txt`, `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
write(`${OUT}/_headers`, `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n`);

console.log(`built ${urls.length} pages → ${OUT}/`);
