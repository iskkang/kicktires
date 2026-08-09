import fs from "node:fs";
import { CAR_SPRITE } from "./car-sprite.mjs";

const editorial = JSON.parse(fs.readFileSync("data.json", "utf8"));
const generated = JSON.parse(fs.readFileSync("generated.json", "utf8"));
const targets = JSON.parse(fs.readFileSync("research-models.json", "utf8")).models;
const profiles = [...new Map([...Object.values(editorial), ...Object.values(generated)]
  .map(profile => [profile.meta.slug, profile])).values()];

const esc = value => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;")
  .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const norm = value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const fmt = value => Number(value || 0).toLocaleString("en-US");
const complaints = p => Number.isInteger(p?.federal?.complaintTotal) ? p.federal.complaintTotal : Number(p?.meta?.nhtsa || 0);
const recalls = p => Number.isInteger(p?.federal?.recallTotal) ? p.federal.recallTotal : Number(p?.meta?.recalls || 0);
const topArea = p => p?.federal?.topComponents?.[0]?.component || "Federal records reviewed";
const positions = [0,14.2857,28.5714,42.8571,57.1429,71.4286,85.7143,100];
function tileFor(make, model){
  const value = `${make} ${model}`.toLowerCase();
  if(value.includes("honda")&&value.includes("civic"))return 1;
  if(value.includes("toyota")&&value.includes("camry"))return 2;
  if(value.includes("tesla")&&value.includes("model 3"))return 3;
  if(value.includes("bmw")&&value.includes("330i"))return 4;
  if(value.includes("toyota")&&value.includes("rav4"))return 5;
  if(value.includes("ford")&&(value.includes("f-150")||value.includes("f150")))return 6;
  if(value.includes("hyundai")&&value.includes("tucson"))return 7;
  return 0;
}
function photo(make, model, label){
  return `<span class="hub-car-photo" role="img" aria-label="${esc(label)}" style="background-position:center ${positions[tileFor(make,model)]}%"></span>`;
}

const homeFile = "dist/index.html";
if(fs.existsSync(homeFile)){
  let html = fs.readFileSync(homeFile,"utf8");
  const css = `
  /* readability pass */
  .kt-home{color:#10253f}.kt-hero{background:#f7faff}.kt-hero-copy{position:relative;z-index:5;background:rgba(255,255,255,.97);box-shadow:18px 0 42px rgba(255,255,255,.96);padding-right:54px}.kt-hero h1{font-size:clamp(46px,4.1vw,66px)!important;line-height:1.01!important;letter-spacing:-.05em!important;color:#09213d!important}.kt-hero-lede{font-size:18px!important;line-height:1.6!important;color:#334b63!important;font-weight:520}.kt-analyzer{border-color:#cbd9e8;box-shadow:0 16px 40px rgba(20,50,80,.14)}.kt-analyzer textarea{font-size:15px!important;color:#172c44;background:#fff}.kt-analyzer textarea::placeholder{color:#6f8298}.kt-tabs,.kt-analyzer label,.kt-analyzer .srcs{color:#40566d!important}.kt-trust-inline{color:#536a81!important;font-size:12px!important}.kt-insight-card{background:#fff!important}.kt-insight-card h3{font-size:15px!important;color:#10253f}.kt-insight-card p{font-size:12px!important;color:#405870!important}.kt-section-head h2{font-size:30px!important;color:#10253f}.kt-section-head p{font-size:13px!important;color:#536a81!important}.kt-pop-card h3,.kt-guide-card h3,.kt-topic-card h3{color:#10253f!important;font-size:16px!important}.kt-pop-card p,.kt-guide-card p,.kt-topic-card p{color:#435970!important;font-size:12.5px!important;line-height:1.5!important}.kt-card-stats span,.kt-signal-grid span{color:#657a90!important}.kt-card-stats b,.kt-signal-grid b{color:#18344f!important}.kt-car-frame{background:#eef4fa!important;border-radius:14px;overflow:hidden}.kt-car-photo{background-color:#eef4fa!important}.kt-data-pill b{font-size:13px!important;color:#18344f}.kt-data-pill span{font-size:11px!important;color:#657a90!important}.kt-compare-table{font-size:12.5px!important}.kt-compare-row strong{color:#17314b}.kt-how-card p,.kt-why-card p{color:#465d73!important;font-size:12.5px!important}.kt-final-cta p{color:#dce9f7!important;font-size:14px!important}.kt-footer{font-size:12px!important}.kt-footer p,.kt-footer a{color:#d1deeb!important}
  @media(max-width:900px){.kt-hero-copy{box-shadow:none;padding-right:34px}.kt-hero h1{font-size:46px!important}}
  `;
  html = html.replace("</style>",`${css}</style>`);
  fs.writeFileSync(homeFile,html);
}

const carsFile = "dist/cars/index.html";
if(fs.existsSync(carsFile)){
  const grouped = new Map();
  for(const profile of profiles){
    const key = `${profile.meta.mk}|${profile.meta.md}`;
    if(!grouped.has(key)) grouped.set(key,[]);
    grouped.get(key).push(profile);
  }
  const groups = [...grouped.values()].map(items=>{
    items.sort((a,b)=>b.meta.y-a.meta.y);
    return items;
  }).sort((a,b)=>(a[0].meta.priority??999)-(b[0].meta.priority??999)||a[0].meta.mk.localeCompare(b[0].meta.mk)||a[0].meta.md.localeCompare(b[0].meta.md));

  const featured = groups.slice(0,8);
  const targetFor = (make,model) => targets.find(t=>norm(t.make)===norm(make)&&norm(t.model)===norm(model));
  const modelCard = (items,index) => {
    const p=items[0], years=items.map(x=>x.meta.y).sort((a,b)=>a-b), t=targetFor(p.meta.mk,p.meta.md);
    const href=t?`/cars/${t.slug}/`:`/cars/${p.meta.slug}/`;
    return `<a class="hub-model-card" data-search="${esc(`${p.meta.mk} ${p.meta.md}`.toLowerCase())}" href="${href}">
      <div class="hub-photo-wrap">${photo(p.meta.mk,p.meta.md,`${p.meta.mk} ${p.meta.md}`)}</div>
      <div class="hub-model-copy"><span class="hub-make">${esc(p.meta.mk)}</span><h3>${esc(p.meta.mk)} ${esc(p.meta.md)}</h3><p>${years.length} model year${years.length===1?"":"s"} · ${years[0]}–${years.at(-1)}</p>
      <div class="hub-facts"><span><b>${fmt(complaints(p))}</b> complaints</span><span><b>${fmt(recalls(p))}</b> recalls</span></div><small>${esc(topArea(p))}</small><em>Research this model →</em></div></a>`;
  };
  const featuredCards = featured.map(modelCard).join("");
  const allCards = groups.map(modelCard).join("");
  const targetCamry=targets.find(t=>norm(t.make)==="toyota"&&norm(t.model)==="camry");
  const targetCivic=targets.find(t=>norm(t.make)==="honda"&&norm(t.model)==="civic");
  const topic = (icon,title,text,href)=>`<a class="hub-topic" href="${href}"><span>${icon}</span><h3>${title}</h3><p>${text}</p><b>Explore →</b></a>`;
  const topicHtml = [
    topic("!","Common Problems","See complaint patterns and the systems owners report most often.",targetCivic?`/cars/${targetCivic.slug}/problems-recalls/`:"/cars/"),
    topic("Y","Years to Avoid","Compare model years that deserve more inspection attention.",targetCamry?`/cars/${targetCamry.slug}/best-years/`:"/cars/"),
    topic("✓","Best Used Years","Find quieter model years before you start shopping.",targetCivic?`/cars/${targetCivic.slug}/best-years/`:"/cars/"),
    topic("R","Recalls","Review federal recall campaigns and then check the VIN.",targetCamry?`/cars/${targetCamry.slug}/problems-recalls/`:"/cars/"),
    topic("?","Reliability","Use complaint patterns without invented reliability scores.",targetCivic?`/cars/${targetCivic.slug}/`:"/cars/"),
    topic("$","Ownership Cost","Plan repairs, insurance and fuel before buying.",targetCamry?`/cars/${targetCamry.slug}/ownership-cost/`:"/cars/")
  ].join("");

  const newMain = `<main class="cars-hub" style="--hub-sprite:url('${CAR_SPRITE}')">
    <section class="hub-hero"><div class="hub-hero-copy"><span class="hub-kicker">Used-car research</span><h1>Research a Used Car Before You Buy</h1><p>Common problems, recalls, reliability signals and ownership costs — organized by make, model and year.</p><div class="hub-search"><span>⌕</span><input id="hubSearch" type="search" autocomplete="off" placeholder="Search make or model — Camry, Civic, F-150..."><button type="button" id="hubSearchButton">Search</button></div><div class="hub-quick"><a href="/#check">Already found a listing? Analyze it →</a><span>${profiles.length} model-year guides</span></div></div><div class="hub-hero-photo">${photo("BMW","330i","used car research")}</div></section>

    <section class="hub-section"><div class="hub-heading"><div><span class="hub-kicker">Start here</span><h2>Research by What Matters</h2><p>Choose the question you have before choosing the car.</p></div></div><div class="hub-topics">${topicHtml}</div></section>

    <section class="hub-section"><div class="hub-heading"><div><span class="hub-kicker">Popular research</span><h2>Models Buyers Commonly Research</h2><p>Quick entry points into federal complaint, recall and ownership-cost evidence.</p></div></div><div class="hub-featured">${featuredCards}</div></section>

    <section class="hub-section hub-all"><div class="hub-heading"><div><span class="hub-kicker">All research</span><h2>Browse Every Make & Model</h2><p>Search or filter the complete KickTires research library.</p></div><span id="hubCount">${groups.length} models</span></div><div class="hub-filter-row"><button class="hub-filter on" data-make="all">All</button>${[...new Set(groups.map(g=>g[0].meta.mk))].slice(0,10).map(make=>`<button class="hub-filter" data-make="${esc(make.toLowerCase())}">${esc(make)}</button>`).join("")}</div><div class="hub-grid" id="hubGrid">${allCards}</div><p class="hub-empty" id="hubEmpty" hidden>No matching model yet. You can still paste the listing on the home page and analyze it live.</p></section>

    <section class="hub-cta"><div><span class="hub-kicker">Found the actual car?</span><h2>Research gets you ready. The listing makes it specific.</h2><p>Paste the car you found and KickTires will combine model-year evidence with price, mileage and location.</p></div><a href="/#check">Analyze a Listing →</a></section>
  </main>`;

  const script = `<script>
  (function(){
    const input=document.getElementById('hubSearch'), cards=[...document.querySelectorAll('.hub-model-card')], count=document.getElementById('hubCount'), empty=document.getElementById('hubEmpty');
    let active='all';
    function apply(){const q=(input.value||'').trim().toLowerCase();let shown=0;cards.forEach(card=>{const make=(card.querySelector('.hub-make')?.textContent||'').toLowerCase();const okMake=active==='all'||make===active;const okQuery=!q||card.dataset.search.includes(q);card.hidden=!(okMake&&okQuery);if(okMake&&okQuery)shown++});count.textContent=shown+' model'+(shown===1?'':'s');empty.hidden=shown!==0}
    input.addEventListener('input',apply);document.getElementById('hubSearchButton').addEventListener('click',apply);
    document.querySelectorAll('.hub-filter').forEach(btn=>btn.addEventListener('click',function(){document.querySelectorAll('.hub-filter').forEach(x=>x.classList.remove('on'));this.classList.add('on');active=this.dataset.make;apply()}));
  })();
  </script>`;

  let html=fs.readFileSync(carsFile,"utf8");
  html=html.replace(/<title>[\s\S]*?<\/title>/i,"<title>Used Car Problems, Reliability & Years to Avoid | KickTires</title>");
  html=html.replace(/<meta name="description" content="[^"]*">/i,'<meta name="description" content="Research used-car common problems, reliability, recalls, years to avoid and ownership costs by make, model and year.">');
  html=html.replace(/<nav>[\s\S]*?<\/nav>/i,`<nav><div class="navin hub-nav"><a class="logo" href="/"><i></i>KickTires</a><div class="navlinks"><a class="navlink" href="/#check">Analyze</a><a class="navlink" href="/cars/">Research</a><a class="navlink" href="/cars/#all-models">All models</a><a class="navlink" href="/blog/">Blog</a><a class="navlink" href="/about/">About</a><a class="navlink navcheck" href="/#check">Analyze a Car</a></div></div></nav>`);
  html=html.replace(/<main class="shell">[\s\S]*?<\/main><script>[\s\S]*?<\/script>/i,`${newMain}${script}`);
  const css=`
  .cars-hub{--hub-sprite:url('${CAR_SPRITE}');width:min(100%,1240px);margin:0 auto;padding:28px 24px 88px;color:#10243d}.hub-nav{width:min(100%,1240px)}.hub-hero{display:grid;grid-template-columns:minmax(0,.9fr) minmax(420px,1.1fr);min-height:380px;border-radius:24px;overflow:hidden;background:linear-gradient(115deg,#0a2440,#123f6b);box-shadow:0 22px 55px rgba(17,45,74,.18)}.hub-hero-copy{padding:48px;color:#fff;position:relative;z-index:2}.hub-kicker{display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;color:#6b8198}.hub-hero .hub-kicker{color:#a9c8e8}.hub-hero h1{font-size:48px;line-height:1.02;letter-spacing:-.045em;margin:10px 0 15px;color:#fff}.hub-hero p{font-size:16px;line-height:1.6;color:#d7e5f3;max-width:650px}.hub-search{margin-top:24px;background:#fff;border-radius:13px;padding:7px;display:grid;grid-template-columns:28px 1fr auto;align-items:center;gap:7px;box-shadow:0 12px 30px rgba(0,0,0,.16)}.hub-search span{color:#61768c;text-align:center}.hub-search input{border:0;outline:0;height:44px;font-size:15px;color:#18314a;background:transparent}.hub-search button{height:44px;border:0;border-radius:9px;padding:0 23px;background:#1769e0;color:#fff;font-weight:760;cursor:pointer}.hub-quick{display:flex;justify-content:space-between;gap:18px;margin-top:15px;font-size:12px;color:#bcd1e5}.hub-quick a{color:#fff;font-weight:760}.hub-hero-photo{min-width:0;background:linear-gradient(140deg,#d9e8f7,#eef5fb);position:relative;display:flex;align-items:center;justify-content:center;padding:24px}.hub-car-photo{display:block;width:100%;aspect-ratio:240/109;background-image:var(--hub-sprite);background-repeat:no-repeat;background-size:100% 800%;background-color:#eef4fa;border-radius:14px}.hub-hero-photo .hub-car-photo{max-width:600px;border-radius:20px;box-shadow:0 20px 38px rgba(13,39,65,.2)}.hub-section{margin-top:58px}.hub-heading{display:flex;justify-content:space-between;gap:22px;align-items:flex-end;margin-bottom:18px}.hub-heading h2{font-size:29px;margin:5px 0 4px;color:#10243d}.hub-heading p{margin:0;color:#607489;font-size:13px}.hub-heading>span{font-size:12px;color:#61778d;font-weight:700}.hub-topics{display:grid;grid-template-columns:repeat(6,1fr);gap:12px}.hub-topic{padding:18px;background:#fff;border:1px solid #dce6f0;border-radius:15px;box-shadow:0 8px 22px rgba(28,54,80,.055)}.hub-topic>span{display:flex;width:34px;height:34px;align-items:center;justify-content:center;border-radius:10px;background:#eaf2ff;color:#1769e0;font-weight:850}.hub-topic h3{font-size:14px;margin:12px 0 6px;color:#152f49}.hub-topic p{font-size:12px;line-height:1.5;color:#5b7085;min-height:54px}.hub-topic b{font-size:11px;color:#1769e0}.hub-featured{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.hub-model-card{display:flex;flex-direction:column;background:#fff;border:1px solid #dce6f0;border-radius:17px;overflow:hidden;box-shadow:0 9px 24px rgba(28,54,80,.06);transition:.16s ease}.hub-model-card:hover{transform:translateY(-2px);border-color:#aac5e7;box-shadow:0 14px 32px rgba(28,54,80,.10)}.hub-photo-wrap{background:#eef4fa;padding:11px}.hub-model-copy{padding:17px}.hub-make{font-size:10px;text-transform:uppercase;letter-spacing:.09em;color:#75889b;font-weight:800}.hub-model-copy h3{font-size:18px;margin:4px 0;color:#112b45}.hub-model-copy p{font-size:12px;color:#63778b;margin:0 0 12px}.hub-facts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}.hub-facts span{padding:9px;background:#f5f8fb;border-radius:9px;font-size:10px;color:#708397}.hub-facts b{display:block;color:#17354f;font-size:13px}.hub-model-copy small{display:block;min-height:31px;color:#51677d;font-size:11px;line-height:1.4}.hub-model-copy em{display:block;margin-top:12px;color:#1769e0;font-style:normal;font-size:11px;font-weight:800}.hub-all{scroll-margin-top:75px}.hub-filter-row{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 18px}.hub-filter{border:1px solid #d6e1ed;border-radius:999px;background:#fff;color:#536b82;padding:8px 12px;font-size:11px;font-weight:720;cursor:pointer}.hub-filter.on{background:#123f6b;color:#fff;border-color:#123f6b}.hub-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.hub-empty{padding:35px;text-align:center;border:1px dashed #c8d7e6;border-radius:16px;color:#667b90}.hub-cta{margin-top:60px;padding:30px 34px;border-radius:20px;background:linear-gradient(120deg,#0c3155,#0c5aa9);color:#fff;display:flex;justify-content:space-between;align-items:center;gap:30px}.hub-cta h2{margin:5px 0 8px;color:#fff;font-size:27px}.hub-cta p{margin:0;color:#d7e7f6;font-size:13px}.hub-cta .hub-kicker{color:#a8caeb}.hub-cta>a{background:#fff;color:#0d4fae;padding:13px 17px;border-radius:10px;font-size:12px;font-weight:800;white-space:nowrap}
  @media(max-width:1000px){.hub-topics{grid-template-columns:repeat(3,1fr)}.hub-featured,.hub-grid{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:760px){.hub-nav .navlinks a:not(.navcheck){display:none}.cars-hub{padding:16px 14px 60px}.hub-hero{grid-template-columns:1fr}.hub-hero-copy{padding:32px 24px}.hub-hero h1{font-size:39px}.hub-hero-photo{padding:18px}.hub-quick{flex-direction:column}.hub-topics{grid-template-columns:repeat(2,1fr)}.hub-featured,.hub-grid{grid-template-columns:1fr}.hub-cta{align-items:flex-start;flex-direction:column}.hub-heading{align-items:flex-start;flex-direction:column}.hub-search{grid-template-columns:24px 1fr}.hub-search button{grid-column:1/-1;width:100%}}
  `;
  html=html.replace("</style>",`${css}</style>`);
  fs.writeFileSync(carsFile,html);
}

console.log("[ui-polish] homepage readability improved and /cars redesigned");
