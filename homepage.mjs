import fs from "node:fs";

const OUT = "dist";
const NAME = "KickTires";
const editorial = JSON.parse(fs.readFileSync("data.json", "utf8"));
const generated = JSON.parse(fs.readFileSync("generated.json", "utf8"));
const targets = JSON.parse(fs.readFileSync("research-models.json", "utf8")).models;
const profiles = [...new Map([...Object.values(editorial), ...Object.values(generated)]
  .map(profile => [profile.meta.slug, profile])).values()];

const esc = value => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const norm = value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const fmt = value => Number(value || 0).toLocaleString("en-US");
const complaintCount = profile => Number.isInteger(profile?.federal?.complaintTotal)
  ? profile.federal.complaintTotal : Number(profile?.meta?.nhtsa || 0);
const recallCount = profile => Number.isInteger(profile?.federal?.recallTotal)
  ? profile.federal.recallTotal : Number(profile?.meta?.recalls || 0);
const topArea = profile => profile?.federal?.topComponents?.[0]?.component || "Federal records reviewed";
const vehicleName = profile => `${profile.meta.y} ${profile.meta.mk} ${profile.meta.md}`;

function pick(year, make, model) {
  return profiles.find(profile => profile.meta.y === year && norm(profile.meta.mk) === norm(make)
    && norm(profile.meta.md) === norm(model)) || null;
}

function distinctProfiles(wanted, count) {
  const selected = [], seen = new Set();
  for (const spec of wanted) {
    const profile = pick(...spec);
    if (profile && !seen.has(profile.meta.slug)) { selected.push(profile); seen.add(profile.meta.slug); }
  }
  for (const profile of [...profiles].sort((a,b)=>(a.meta.priority ?? 999)-(b.meta.priority ?? 999))) {
    if (selected.length >= count) break;
    if (!seen.has(profile.meta.slug)) { selected.push(profile); seen.add(profile.meta.slug); }
  }
  return selected.slice(0, count);
}

const popular = distinctProfiles([
  [2020,"Honda","Civic"], [2019,"Toyota","Camry"], [2021,"Tesla","Model 3"], [2020,"Toyota","RAV4"]
], 4);
const guides = distinctProfiles([
  [2018,"Toyota","Camry"], [2020,"Honda","Civic"], [2021,"Tesla","Model 3"],
  [2020,"Toyota","RAV4"], [2021,"Hyundai","Tucson"], [2020,"Ford","F-150"]
], 6);
const compare = distinctProfiles([
  [2020,"Honda","Civic"], [2019,"Toyota","Camry"], [2021,"Tesla","Model 3"], [2020,"Toyota","RAV4"]
], 4);

function carArt(label, index = 0) {
  const fills = ["#173f70","#525d6b","#d8dde5","#111b28","#214c65","#65717e"];
  const body = fills[index % fills.length];
  return `<svg class="kt-car-svg" viewBox="0 0 360 170" role="img" aria-label="${esc(label)} illustration">
    <ellipse cx="181" cy="145" rx="142" ry="13" fill="#0d2136" opacity=".12"/>
    <path d="M58 108c10-21 28-31 62-37l31-31c9-9 18-12 35-12h48c22 0 38 8 53 27l17 22c25 4 42 13 49 31l4 17H47l4-17z" fill="${body}"/>
    <path d="M147 70l24-27c7-7 12-9 25-9h35c16 0 29 6 39 19l14 18z" fill="#b9d3ea" opacity=".9"/>
    <path d="M151 72h130" stroke="#fff" stroke-opacity=".32" stroke-width="3"/><path d="M74 102h240" stroke="#fff" stroke-opacity=".14" stroke-width="4"/>
    <circle cx="108" cy="126" r="27" fill="#15202b"/><circle cx="108" cy="126" r="14" fill="#bfc8d3"/><circle cx="287" cy="126" r="27" fill="#15202b"/><circle cx="287" cy="126" r="14" fill="#bfc8d3"/>
    <rect x="52" y="110" width="36" height="9" rx="4" fill="#eff7ff" opacity=".9"/><rect x="310" y="110" width="25" height="8" rx="4" fill="#e24a42" opacity=".75"/>
  </svg>`;
}

function guideCard(profile, index) {
  return `<a class="kt-guide-card" href="/cars/${esc(profile.meta.slug)}/" onclick="if(window.gtag)gtag('event','year_guide_clicked',{slug:'${esc(profile.meta.slug)}'})">
    <div class="kt-card-kicker">${index % 3 === 1 ? "Reliability" : index % 3 === 2 ? "Recalls" : "Common problems"}</div>
    <h3>${esc(vehicleName(profile))}</h3><p>${esc(topArea(profile))} leads the federal complaint tags in this snapshot.</p>
    <div class="kt-car-frame">${carArt(vehicleName(profile), index)}</div>
    <div class="kt-card-stats"><span><b>${fmt(complaintCount(profile))}</b> complaints</span><span><b>${fmt(recallCount(profile))}</b> recall campaigns</span></div>
    <span class="kt-text-link">Open guide →</span></a>`;
}

function popularCard(profile, index) {
  return `<a class="kt-pop-card" href="/cars/${esc(profile.meta.slug)}/" onclick="if(window.gtag)gtag('event','research_card_clicked',{slug:'${esc(profile.meta.slug)}'})">
    <div class="kt-pop-top"><div><span class="kt-eyebrow">Model-year research</span><h3>${esc(vehicleName(profile))}</h3></div><span class="kt-arrow">↗</span></div>
    <div class="kt-car-frame kt-car-frame-small">${carArt(vehicleName(profile), index + 2)}</div>
    <div class="kt-signal-grid"><div><span>Top area</span><b>${esc(topArea(profile))}</b></div><div><span>NHTSA complaints</span><b>${fmt(complaintCount(profile))}</b></div><div><span>Recalls</span><b>${fmt(recallCount(profile))}</b></div></div></a>`;
}

function topicCard(icon, title, text, href) {
  return `<a class="kt-topic-card" href="${href}" onclick="if(window.gtag)gtag('event','research_topic_clicked',{topic:'${esc(title.toLowerCase().replace(/\s+/g,"_"))}'})">
    <span class="kt-topic-icon">${icon}</span><h3>${title}</h3><p>${text}</p><span class="kt-text-link">Explore →</span></a>`;
}

function compareTable(items) {
  const cols = items.map((profile, index) => `<div class="kt-compare-car"><div class="kt-mini-car">${carArt(vehicleName(profile), index + 3)}</div><b>${esc(vehicleName(profile))}</b><small>${esc(topArea(profile))}</small></div>`).join("");
  const row = (label, getter) => `<div class="kt-compare-row"><strong>${label}</strong>${items.map(profile => `<span>${getter(profile)}</span>`).join("")}</div>`;
  return `<div class="kt-compare-table"><div class="kt-compare-head"><span></span>${cols}</div>
    ${row("Raw NHTSA complaints", p => fmt(complaintCount(p)))}${row("Recall campaigns", p => fmt(recallCount(p)))}
    ${row("Leading complaint area", p => esc(topArea(p)))}${row("Annual repair reserve", p => p.tco?.repair ? `$${fmt(p.tco.repair)}` : "Listing needed")}
    ${row("EPA snapshot", p => p.epa?.mpg ? `${Math.round(p.epa.mpg)} mpg` : p.epa?.kind === "electric" ? "EV" : "Varies")}</div>`;
}

const heroStats = [[`${profiles.length}`, "model-year guides"], ["Live", "NHTSA signals"], ["5-year", "cost framework"], ["$0", "seller payments"]];
const targetCamry = targets.find(t => norm(t.make)==="toyota" && norm(t.model)==="camry");
const targetCivic = targets.find(t => norm(t.make)==="honda" && norm(t.model)==="civic");
const bestHref = targetCamry ? `/cars/${targetCamry.slug}/#years` : "/cars/";
const problemsHref = targetCivic ? `/cars/${targetCivic.slug}/#problems` : "/cars/";
const costHref = targetCamry ? `/cars/${targetCamry.slug}/#costs` : "/cars/";
const reliabilityHref = targetCivic ? `/cars/${targetCivic.slug}/` : "/cars/";

const homepageCss = `
.kt-home{width:min(100%,1240px);margin:0 auto;padding:0 24px 92px}.kt-nav{width:min(100%,1240px)}.kt-nav .navlinks{gap:20px}.kt-nav .navlink{font-size:12px}.kt-nav .navcheck{border:0;background:transparent;padding:0;color:var(--ink-2)}.kt-nav-cta{display:inline-flex;align-items:center;min-height:36px;padding:0 14px;border-radius:10px;background:#0c438b;color:#fff!important;font-weight:760}
.kt-hero{margin-top:28px;display:grid;grid-template-columns:minmax(0,.92fr) minmax(420px,1.08fr);border:1px solid #dce6f2;border-radius:28px;overflow:hidden;background:linear-gradient(120deg,#fff 0%,#f4f8fd 52%,#e4effb 100%);box-shadow:0 28px 70px rgba(21,48,79,.12)}.kt-hero-copy{padding:52px 48px 48px}.kt-eyebrow{font-size:11px;line-height:1.2;font-weight:800;letter-spacing:.11em;text-transform:uppercase;color:#55708d}.kt-hero h1{font-size:57px;max-width:640px;margin:12px 0 17px;color:#0c2340}.kt-hero-lede{max-width:630px;margin:0 0 26px;color:#4c6076;font-size:17px;line-height:1.62}
.kt-analyzer{background:#fff;border:1px solid #d6e1ed;border-radius:18px;padding:10px;box-shadow:0 16px 38px rgba(20,55,91,.12)}.kt-tabs{display:flex;gap:6px;padding:4px}.kt-tab{padding:8px 12px;border-radius:9px;font-size:12px;font-weight:760;color:#61758c}.kt-tab-active{background:#eaf2ff;color:#0d4fae}.kt-analyzer textarea{height:82px;border:1px solid #dce5ef;border-radius:12px;padding:13px 14px;margin:5px 0 9px;background:#f9fbfd}.kt-analyzer textarea:focus{border-color:#9ebce2;box-shadow:0 0 0 3px rgba(23,105,224,.08)}.kt-analyzer .pfoot{border:0;padding:0}.kt-analyzer .btn{min-width:170px}.kt-hero-actions{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:14px}.kt-hero-actions a,.kt-hero-actions button{font-size:12px}.kt-hero-actions a{font-weight:760;color:#135fc6}.kt-trust-inline{display:flex;gap:16px;flex-wrap:wrap;margin-top:18px;color:#6d8094;font-size:11px}.kt-trust-inline span:before{content:"✓";margin-right:6px;color:#1b8d55;font-weight:900}
.kt-hero-visual{position:relative;min-height:560px;overflow:hidden;background:radial-gradient(circle at 58% 33%,rgba(255,255,255,.95),rgba(255,255,255,.2) 32%,transparent 55%),linear-gradient(180deg,#dceafb,#f6f9fd 72%)}.kt-city{position:absolute;inset:auto 0 135px;height:160px;opacity:.26;background:linear-gradient(90deg,transparent 2%,#6f8fab 2% 5%,transparent 5% 9%,#5f819e 9% 14%,transparent 14% 18%,#7794ad 18% 22%,transparent 22% 29%,#486b8b 29% 36%,transparent 36% 42%,#6f8fac 42% 48%,transparent 48% 53%,#4c708f 53% 59%,transparent 59% 66%,#6c8da8 66% 72%,transparent 72% 78%,#527795 78% 84%,transparent 84%)}.kt-hero-car{position:absolute;left:5%;right:2%;bottom:90px}.kt-hero-car .kt-car-svg{width:100%;height:auto;filter:drop-shadow(0 24px 18px rgba(23,46,69,.22))}.kt-insight-card{position:absolute;right:28px;top:28px;width:240px;padding:18px;border-radius:16px;background:rgba(255,255,255,.94);border:1px solid rgba(210,224,238,.9);box-shadow:0 14px 34px rgba(31,59,91,.13)}.kt-insight-card h3{margin:0 0 9px;font-size:14px}.kt-insight-card p{margin:5px 0;color:#60748a;font-size:11px}.kt-insight-card p:before{content:"✓";color:#1769e0;font-weight:900;margin-right:6px}.kt-statbar{position:absolute;left:28px;right:28px;bottom:26px;display:grid;grid-template-columns:repeat(4,1fr);background:#fff;border:1px solid #d9e4ef;border-radius:16px;box-shadow:0 13px 30px rgba(23,52,82,.12)}.kt-statbar div{padding:15px 12px;text-align:center;border-right:1px solid #e1e9f1}.kt-statbar div:last-child{border:0}.kt-statbar b{display:block;font-size:20px;color:#0c438b}.kt-statbar span{display:block;margin-top:2px;font-size:10px;color:#708297;text-transform:uppercase;letter-spacing:.06em}
.kt-live-wrap{margin-top:18px}.kt-data-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0 0}.kt-data-pill{padding:15px 16px;border:1px solid #dce6f0;background:#fff;border-radius:14px;display:flex;align-items:center;gap:11px;box-shadow:0 8px 20px rgba(30,55,83,.05)}.kt-data-pill i{width:9px;height:9px;border-radius:50%;background:#2a73d4;box-shadow:0 0 0 5px #eaf2ff}.kt-data-pill b{font-size:12px}.kt-data-pill span{display:block;font-size:10px;color:#7c8da0}
.kt-section{margin-top:68px}.kt-section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:19px}.kt-section-head h2{margin:5px 0 0;font-size:28px}.kt-section-head p{margin:0;color:#76889a;font-size:12px}.kt-section-head>a{font-size:12px;color:#1769e0;font-weight:760;white-space:nowrap}.kt-pop-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.kt-pop-card,.kt-guide-card,.kt-topic-card{border:1px solid #dce5ef;background:#fff;border-radius:18px;box-shadow:0 10px 26px rgba(20,45,73,.07);transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}.kt-pop-card:hover,.kt-guide-card:hover,.kt-topic-card:hover{transform:translateY(-3px);border-color:#afc9e8;box-shadow:0 18px 38px rgba(20,45,73,.11)}.kt-pop-card{padding:18px}.kt-pop-top{display:flex;justify-content:space-between;gap:10px}.kt-pop-card h3{font-size:17px;margin:5px 0}.kt-arrow{font-size:17px;color:#95a6b8}.kt-car-frame{height:160px;margin:10px -4px 6px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#f6f9fd,#eef4fa);overflow:hidden}.kt-car-frame-small{height:135px}.kt-car-svg{width:100%;height:100%;display:block}.kt-signal-grid{display:grid;grid-template-columns:1.3fr .8fr .55fr;gap:7px;padding-top:13px;border-top:1px solid #e4ebf2}.kt-signal-grid span{display:block;font-size:9px;color:#7b8da0}.kt-signal-grid b{display:block;margin-top:4px;font-size:11px;color:#253a50;overflow:hidden;text-overflow:ellipsis}
.kt-topic-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:12px}.kt-topic-card{padding:20px 17px;min-height:190px}.kt-topic-icon{display:grid;place-items:center;width:43px;height:43px;border-radius:13px;background:#eaf2ff;color:#135ebf;font-size:22px;font-weight:800}.kt-topic-card h3{font-size:15px;margin:14px 0 6px}.kt-topic-card p{margin:0 0 14px;color:#718397;font-size:11px;line-height:1.5}.kt-text-link{font-size:11px;color:#1769e0;font-weight:780}.kt-guide-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.kt-guide-card{padding:19px}.kt-card-kicker{display:inline-flex;padding:5px 8px;border-radius:999px;background:#eef4fb;color:#42647e;font-size:9px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}.kt-guide-card h3{font-size:19px;margin:11px 0 4px}.kt-guide-card>p{min-height:36px;margin:0;color:#718297;font-size:11px;line-height:1.5}.kt-card-stats{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:8px 0 13px}.kt-card-stats span{padding:9px;background:#f7f9fc;border-radius:10px;font-size:9px;color:#718297}.kt-card-stats b{display:block;color:#243a50;font-size:14px}
.kt-compare-wrap{border:1px solid #dce5ef;background:#fff;border-radius:20px;padding:18px;box-shadow:0 12px 32px rgba(22,47,75,.07);overflow:auto}.kt-compare-table{min-width:820px}.kt-compare-head,.kt-compare-row{display:grid;grid-template-columns:170px repeat(4,1fr)}.kt-compare-head>span,.kt-compare-head>.kt-compare-car,.kt-compare-row>*{padding:13px;border-right:1px solid #e5ebf1;border-bottom:1px solid #e5ebf1}.kt-compare-head>.kt-compare-car:last-child,.kt-compare-row>*:last-child{border-right:0}.kt-compare-car b{display:block;font-size:11px}.kt-compare-car small{display:block;margin-top:3px;color:#78899b;font-size:9px}.kt-mini-car{height:72px}.kt-mini-car svg{width:100%;height:100%}.kt-compare-row strong{font-size:11px;color:#566b80}.kt-compare-row span{font-size:11px;color:#22384e}.kt-compare-actions{text-align:center;margin-top:17px}
.kt-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.kt-step{position:relative;padding:26px;border-radius:19px;border:1px solid #dce5ef;background:linear-gradient(145deg,#fff,#f5f9fd);box-shadow:0 8px 24px rgba(22,48,76,.05)}.kt-step-num{font-size:32px;line-height:1;color:#c8d9eb;font-weight:850}.kt-step h3{font-size:17px;margin:18px 0 7px}.kt-step p{margin:0;color:#6f8296;font-size:12px;line-height:1.55}.kt-step:not(:last-child):after{content:"→";position:absolute;right:-13px;top:50%;z-index:3;width:26px;height:26px;display:grid;place-items:center;border-radius:50%;background:#1769e0;color:#fff;font-size:12px}.kt-benefits{display:grid;grid-template-columns:repeat(4,1fr);gap:13px}.kt-benefit{padding:22px;border-radius:17px;border:1px solid #dce5ef;background:#fff}.kt-benefit-icon{width:42px;height:42px;border-radius:13px;background:#eef5ff;color:#1769e0;display:grid;place-items:center;font-size:20px;font-weight:850}.kt-benefit h3{font-size:14px;margin:14px 0 6px}.kt-benefit p{margin:0;color:#74869a;font-size:11px;line-height:1.5}
.kt-final-cta{position:relative;overflow:hidden;margin-top:72px;padding:46px 48px;border-radius:24px;color:#fff;background:linear-gradient(120deg,#082b55,#0b4a8d 60%,#0a3768);box-shadow:0 24px 56px rgba(9,47,84,.22)}.kt-final-cta:after{content:"";position:absolute;right:-40px;top:-90px;width:420px;height:280px;border-radius:50%;border:1px solid rgba(255,255,255,.16);box-shadow:0 0 0 52px rgba(255,255,255,.035),0 0 0 105px rgba(255,255,255,.025)}.kt-final-cta>div{position:relative;z-index:2;max-width:570px}.kt-final-cta h2{font-size:36px;margin:8px 0 10px}.kt-final-cta p{color:#d1e2f4;margin:0 0 22px}.kt-final-cta .btn{background:#fff;color:#0b4380;box-shadow:none}.kt-footer{background:#071d34;color:#d4deea}.kt-footer-in{width:min(100%,1240px);margin:0 auto;padding:48px 24px 30px;display:grid;grid-template-columns:1.5fr repeat(3,1fr);gap:36px}.kt-footer .logo{color:#fff}.kt-footer p{color:#91a6ba;font-size:11px;max-width:280px}.kt-footer h3{font-size:12px;color:#fff;margin:0 0 11px}.kt-footer a{display:block;margin:7px 0;color:#9fb0c2;font-size:11px}.kt-footer-bottom{grid-column:1/-1;display:flex;justify-content:space-between;gap:20px;padding-top:24px;border-top:1px solid rgba(255,255,255,.1);font-size:10px;color:#7890a8}
@media(max-width:980px){.kt-hero{grid-template-columns:1fr}.kt-hero-visual{min-height:430px}.kt-topic-grid{grid-template-columns:repeat(3,1fr)}.kt-pop-grid{grid-template-columns:repeat(2,1fr)}.kt-benefits{grid-template-columns:repeat(2,1fr)}.kt-footer-in{grid-template-columns:1.5fr 1fr 1fr}.kt-footer-in>div:nth-child(4){display:none}}
@media(max-width:700px){.kt-home{padding:0 16px 70px}.kt-hero{margin-top:16px;border-radius:20px}.kt-hero-copy{padding:32px 22px}.kt-hero h1{font-size:42px}.kt-hero-visual{min-height:360px}.kt-insight-card{display:none}.kt-statbar{left:14px;right:14px;grid-template-columns:repeat(2,1fr)}.kt-data-strip{grid-template-columns:1fr 1fr}.kt-pop-grid,.kt-guide-grid,.kt-steps,.kt-benefits{grid-template-columns:1fr}.kt-topic-grid{grid-template-columns:1fr 1fr}.kt-step:not(:last-child):after{display:none}.kt-footer-in{grid-template-columns:1fr 1fr}.kt-footer-in>div:first-child{grid-column:1/-1}.kt-footer-bottom{flex-direction:column}.kt-nav .navlinks a:not(.kt-nav-cta):not(:first-child){display:none}}
`;

function replaceMeta(html, key, value, property = false) {
  const attr = property ? "property" : "name";
  return html.replace(new RegExp(`<meta\\s+${attr}="${key}"\\s+content="[^"]*">`, "i"), `<meta ${attr}="${key}" content="${esc(value)}">`);
}

const file = `${OUT}/index.html`;
if (!fs.existsSync(file)) throw new Error("dist/index.html missing: run build.mjs first");
let html = fs.readFileSync(file, "utf8");
const title = "Used Car Problems, Recalls & Buying Analysis | KickTires";
const description = "Research used-car problems, recalls, reliability and ownership costs, or paste a listing to analyze the car before you buy.";
html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
html = replaceMeta(html, "description", description); html = replaceMeta(html, "og:title", title, true); html = replaceMeta(html, "og:description", description, true); html = replaceMeta(html, "twitter:title", title); html = replaceMeta(html, "twitter:description", description);
html = html.replace("</head>", `<style>${homepageCss}</style></head>`);

const nav = `<nav><div class="navin kt-nav"><a class="logo" href="/"><i></i>${NAME}</a><div class="navlinks"><a class="navlink navcheck" href="/#check">Analyze</a><a class="navlink" href="/cars/">Research</a><a class="navlink" href="/#compare">Compare</a><a class="navlink" href="${bestHref}">Best Years</a><a class="navlink" href="${problemsHref}">Common Problems</a><a class="navlink" href="/blog/">Blog</a><a class="navlink" href="/about/">About</a><a class="kt-nav-cta" href="/#check">Analyze a Car</a></div></div></nav>`;
html = html.replace(/<nav>[\s\S]*?<\/nav>/i, nav);

const topics = [
  topicCard("!", "Common Problems", "See the issues reported most often by model and year.", problemsHref),
  topicCard("↓", "Years to Avoid", "Compare noisier model years before you start shopping.", bestHref),
  topicCard("✓", "Best Used Years", "Find quieter model years worth a closer look.", bestHref),
  topicCard("R", "Recalls", "Review federal recall campaigns and VIN applicability.", problemsHref),
  topicCard("?", "Reliability", "Understand complaint patterns without fake reliability scores.", reliabilityHref),
  topicCard("$", "Ownership Cost", "Plan fuel, insurance, repairs and five-year cost.", costHref)
].join("");

const newMain = `<main class="kt-home">
<section class="kt-hero" id="check"><div class="kt-hero-copy"><span class="kt-eyebrow">Buyer-first used-car intelligence</span><h1>Analyze Any Used Car Before You Buy</h1><p class="kt-hero-lede">Paste a listing and check common problems, recalls, price context, and estimated five-year ownership cost before you spend your money.</p>
<form class="paste kt-analyzer" onsubmit="route(event);return false"><div class="kt-tabs"><span class="kt-tab kt-tab-active">Paste a Listing</span><a class="kt-tab" href="/cars/" onclick="if(window.gtag)gtag('event','hero_research_clicked')">Search by Car</a></div><label class="paste-label" for="inp">Listing URL or listing text</label><textarea id="inp" autocomplete="off" spellcheck="false" placeholder="Paste a Cars.com, AutoTrader, CarGurus, Facebook Marketplace, or dealer listing"></textarea><div class="pfoot"><span class="srcs">No account needed · listing text is not sent to Analytics</span><button class="btn" id="analyzeBtn" type="submit">Analyze This Car</button></div></form>
<div class="kt-hero-actions"><button class="example-link" type="button" onclick="useExample()">Try a real example</button><a href="/cars/" onclick="if(window.gtag)gtag('event','hero_research_clicked')">No listing yet? Research a make &amp; model →</a></div><p id="hint" class="hint" aria-live="polite"></p><div class="kt-trust-inline"><span>Federal records</span><span>Buyer-first analysis</span><span>No dealer payments</span></div></div>
<div class="kt-hero-visual"><div class="kt-city"></div><div class="kt-insight-card"><h3>Why buyers use KickTires</h3><p>Spot expensive inspection targets</p><p>Check recalls and safety signals</p><p>Understand real ownership cost</p><p>Compare the asking price in context</p></div><div class="kt-hero-car">${carArt("Used car analysis", 0)}</div><div class="kt-statbar">${heroStats.map(([value,label])=>`<div><b>${value}</b><span>${label}</span></div>`).join("")}</div></div></section>
<div id="live" class="kt-live-wrap" aria-live="polite"></div>
<div class="kt-data-strip"><div class="kt-data-pill"><i></i><div><b>NHTSA-backed</b><span>complaints and recall records</span></div></div><div class="kt-data-pill"><i></i><div><b>Buyer-first</b><span>we do not sell cars</span></div></div><div class="kt-data-pill"><i></i><div><b>Cost context</b><span>five-year ownership framework</span></div></div><div class="kt-data-pill"><i></i><div><b>Specific-car analysis</b><span>price, mileage and location</span></div></div></div>
<section class="kt-section"><div class="kt-section-head"><div><span class="kt-eyebrow">Popular used-car research</span><h2>Start with a model year buyers often check</h2><p>Real federal snapshots from pages already published on KickTires.</p></div><a href="/cars/">Browse all research →</a></div><div class="kt-pop-grid">${popular.map(popularCard).join("")}</div></section>
<section class="kt-section"><div class="kt-section-head"><div><span class="kt-eyebrow">Research by what matters</span><h2>Answer the question you actually have</h2><p>Problems, model years, recalls, reliability and cost — not another spec sheet.</p></div><a href="/cars/">All research →</a></div><div class="kt-topic-grid">${topics}</div></section>
<section class="kt-section"><div class="kt-section-head"><div><span class="kt-eyebrow">Long-tail buyer guides</span><h2>Popular model-year problem &amp; reliability guides</h2><p>Each page is designed to answer a specific used-car buying question.</p></div><a href="/cars/">View all guides →</a></div><div class="kt-guide-grid">${guides.map(guideCard).join("")}</div></section>
<section class="kt-section" id="compare"><div class="kt-section-head"><div><span class="kt-eyebrow">Compare beyond specs</span><h2>What MPG and horsepower leave out</h2><p>Compare federal complaint patterns, recalls and cost inputs before you compare trim packages.</p></div><a href="/cars/" onclick="if(window.gtag)gtag('event','compare_started')">Choose different cars →</a></div><div class="kt-compare-wrap">${compareTable(compare)}<div class="kt-compare-actions"><a class="btn" href="/cars/" onclick="if(window.gtag)gtag('event','compare_started')">Start with a model →</a></div></div></section>
<section class="kt-section"><div class="kt-section-head"><div><span class="kt-eyebrow">How KickTires works</span><h2>From listing to decision in three steps</h2></div></div><div class="kt-steps"><article class="kt-step"><span class="kt-step-num">01</span><h3>Paste the listing</h3><p>Give us the listing URL or paste the seller's text, including year, mileage and asking price.</p></article><article class="kt-step"><span class="kt-step-num">02</span><h3>We check the car</h3><p>KickTires combines market context, NHTSA records, ownership costs and model-year inspection targets.</p></article><article class="kt-step"><span class="kt-step-num">03</span><h3>Know what to do next</h3><p>See what looks good, what deserves inspection, and what could become expensive before you pay.</p></article></div></section>
<section class="kt-section"><div class="kt-section-head"><div><span class="kt-eyebrow">Why KickTires</span><h2>A used-car site with no reason to sell you a car</h2></div></div><div class="kt-benefits"><article class="kt-benefit"><span class="kt-benefit-icon">!</span><h3>Know common problems before you pay</h3><p>Use complaint categories and inspection targets to know where to look.</p></article><article class="kt-benefit"><span class="kt-benefit-icon">R</span><h3>Check recall history in seconds</h3><p>Review federal campaigns, then verify the actual VIN before buying.</p></article><article class="kt-benefit"><span class="kt-benefit-icon">$</span><h3>Estimate the real cost of ownership</h3><p>Look past the sticker price to fuel, insurance, taxes and likely repairs.</p></article><article class="kt-benefit"><span class="kt-benefit-icon">≠</span><h3>Compare used cars beyond MPG</h3><p>Side-by-side buyer signals help you compare risk, not just specifications.</p></article></div></section>
<section class="kt-final-cta"><div><span class="kt-eyebrow" style="color:#9ec8f6">Before the keys are yours</span><h2>Buy Your Next Used Car With Eyes Open</h2><p>Don't find out about an expensive problem after the deal is done. Analyze the listing before you make the trip, negotiate, or pay.</p><a class="btn" href="#check" onclick="if(window.gtag)gtag('event','final_analysis_cta_clicked')">Analyze a Car for Free →</a></div></section></main>`;

const mainPattern = /<main class="shell home-shell">[\s\S]*?<\/main>\s*<script>\s*const STATES/;
if (!mainPattern.test(html)) throw new Error("home main block not found");
html = html.replace(mainPattern, `${newMain}\n<script>\nconst STATES`);
const footer = `<footer class="kt-footer"><div class="kt-footer-in"><div><a class="logo" href="/"><i></i>${NAME}</a><p>Buyer-side used-car analysis grounded in federal records, ownership-cost inputs and the listing you are actually considering.</p></div><div><h3>Product</h3><a href="/#check">Analyze a Car</a><a href="/cars/">Research Cars</a><a href="#compare">Compare</a><a href="${bestHref}">Best Years</a></div><div><h3>Resources</h3><a href="${problemsHref}">Common Problems</a><a href="${reliabilityHref}">Reliability</a><a href="${costHref}">Ownership Cost</a><a href="/blog/">Blog</a><a href="/about/">How We Research</a></div><div><h3>Support</h3><a href="/about/">About</a><a href="/privacy/">Privacy &amp; Cookies</a><a href="https://www.nhtsa.gov/recalls" rel="noopener">NHTSA VIN Lookup ↗</a></div><div class="kt-footer-bottom"><span>© ${new Date().getFullYear()} KickTires. Buyer-first used-car intelligence.</span><span>We take no money from dealers, sellers or marketplaces.</span></div></div></footer>`;
html = html.replace(/<footer class="site">[\s\S]*?<\/footer>/i, footer);
fs.writeFileSync(file, html);
console.log(`[homepage] redesigned home with ${popular.length} popular research cards, ${guides.length} guide cards and ${compare.length} compare columns`);
