// build.mjs — generates the whole static site from data.json
// run: node build.mjs   → writes ./dist
import fs from "node:fs";
import path from "node:path";

const SITE = "https://kicktires.netlify.app";   // ← change to your domain
const NAME = "KickTires";
// Google Search Console — file verification. Keep this forever once verified.
const GOOGLE_VERIFY = "googlee9c6c5390d444c3c";
// Leave empty to disable ads entirely. Set to "ca-pub-XXXXXXXXXXXXXXXX" once approved.
const ADSENSE = process.env.ADSENSE_CLIENT || "";
const D = JSON.parse(fs.readFileSync("data.json", "utf8"));
const OUT = "dist";
const TODAY = process.env.BUILD_DATE || new Date().toISOString().slice(0, 10);

const css = fs.readFileSync("style.css", "utf8");
const esc = s => String(s).replace(/&(?!\w+;)/g, "&amp;").replace(/</g, "&lt;");
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
<style>${css}</style>
${ADSENSE ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE}" crossorigin="anonymous"></script>` : ""}
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ""}
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
  const T = tco(d, STATES.OH);
  const risks = d.risks.map(r=>`
    <article class="risk s-${r.s}">
      <div class="sevwrap"><div class="sevbar"></div><div class="sevtxt">${r.lbl}</div></div>
      <div><h3 class="rtitle">${esc(r.t)}</h3><p class="rbody">${esc(r.b)}</p>
      ${r.e.map(([t,tag,txt])=>`<div class="ev"><div class="evtag e-${t}">${tag}</div><p class="evtxt">${esc(txt)}</p></div>`).join("")}</div>
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
    <div class="phead"><div><p class="micro">Example listing</p>
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

  <h2>What five years of ownership actually costs</h2>
  <p class="sub">Based on the example listing above, in Ohio. Insurance and tax vary by state by more than most buyers expect.</p>
  <section class="panel"><div class="pbody">
    <div class="tcohero">
      <div><span class="micro">Sticker price</span><span class="tbig muted">${money(d.price)}</span></div>
      <span class="arrow">→</span>
      <div><span class="micro">Five-year reality</span><span class="tbig">${money(T.total)}</span></div>
    </div>
    <div class="bar">${T.rows.map(r=>`<div class="seg ${r[3]}" style="width:${(r[1]/T.total*100).toFixed(2)}%"></div>`).join("")}</div>
    <div class="tlines">${T.rows.map(r=>`<div class="tline"><span class="tdot ${r[3]}"></span><span class="tname">${r[0]}</span><span class="tnote">${esc(r[2])}</span><span class="tval">${money(r[1])}</span></div>`).join("")}</div>
  </div></section>

  <h2>Take this to the inspection</h2>
  <section class="panel"><div class="pbody">
    ${d.chk.map(c=>`<div class="chk"><div class="cbox"></div><p>${c}</p></div>`).join("")}
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
  const jsonld = {"@context":"https://schema.org","@type":"WebSite",name:NAME,url:SITE+"/",
    potentialAction:{"@type":"SearchAction",target:SITE+"/cars/?q={search_term_string}","query-input":"required name=search_term_string"}};
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
      <button class="btn" type="submit">Check this car</button></div>
    </form>
    <p id="hint" class="hint"></p>
  </div></section>

  ${adUnit("1111111111")}

  <h2>Models we've checked</h2>
  <p class="sub">Every claim cross-checked against federal complaint and recall records.</p>
  <div class="cards">${Object.values(D).map(o=>
    `<a class="card" href="/cars/${o.meta.slug}/"><span class="micro">${o.meta.nhtsa} complaints checked</span><span class="cardt">${o.meta.y} ${o.meta.mk} ${o.meta.md}</span><span class="cardd">${esc(o.vline)}</span></a>`).join("")}</div>
</main>
<script>
const IDX = ${JSON.stringify(Object.values(D).map(o=>({s:o.meta.slug,y:o.meta.y,mk:o.meta.mk.toLowerCase(),md:o.meta.md.toLowerCase().replace(/[^a-z0-9]/g,"")})))};
const hint = m => document.getElementById("hint").textContent = m;
const match = (y,mk,md) => IDX.find(v => String(v.y)===String(y) && v.mk===String(mk||"").toLowerCase()
  && String(md||"").toLowerCase().replace(/[^a-z0-9]/g,"")===v.md);

function localGuess(t){
  const s = t.toLowerCase().replace(/[^a-z0-9 ]/g," ");
  return IDX.find(v => s.includes(String(v.y)) && s.includes(v.mk) && s.replace(/ /g,"").includes(v.md));
}
async function route(e){
  e.preventDefault();
  const text = document.getElementById("inp").value.trim();
  if (!text) return false;

  const local = localGuess(text);           // instant, works with no backend
  if (local) { location.href = "/cars/" + local.s + "/"; return false; }

  hint("Reading the listing…");
  try {
    const r = await fetch("/api/analyze", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ text })
    });
    if (r.ok) {
      const { car } = await r.json();
      const hit = car && match(car.year, car.make, car.model);
      if (hit) { location.href = "/cars/" + hit.s + "/"; return false; }
      if (car && car.year && car.make) {
        hint("We haven't covered the " + car.year + " " + car.make + " " + (car.model||"") +
             " yet. We add models in order of how often they're searched.");
        return false;
      }
    }
  } catch (err) { /* fall through */ }

  hint("We haven't covered that model yet — browse what we have below.");
  return false;
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
  <p class="lede">Aggregate page analytics only — which pages get visited and roughly where from. No names, no accounts, no email addresses. Anything you paste into the box is used to work out which car you mean and is not stored against you.</p>
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
