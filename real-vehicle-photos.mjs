import fs from "node:fs";
import path from "node:path";

const OUT = "dist";
const MODELS = JSON.parse(fs.readFileSync("research-models.json", "utf8")).models || [];
const UA = "KickTires/1.0 (used-car research; https://kicktires.netlify.app/)";

const TITLE_OVERRIDES = new Map(Object.entries({
  "bmw|330i":"BMW 3 Series (G20)",
  "tesla|model 3":"Tesla Model 3",
  "tesla|model y":"Tesla Model Y",
  "tesla|model s":"Tesla Model S",
  "tesla|model x":"Tesla Model X",
  "lexus|rx":"Lexus RX",
  "lexus|nx":"Lexus NX",
  "lexus|es":"Lexus ES",
  "lexus|gx":"Lexus GX",
  "lexus|is":"Lexus IS",
  "lexus|rz":"Lexus RZ",
  "mercedes-benz|glc 300":"Mercedes-Benz GLC",
  "mercedes-benz|c 300":"Mercedes-Benz C-Class",
  "mercedes-benz|gle 350":"Mercedes-Benz GLE",
  "acura|mdx":"Acura MDX",
  "acura|rdx":"Acura RDX",
  "infiniti|qx60":"Infiniti QX60",
  "infiniti|q50":"Infiniti Q50",
  "infiniti|qx50":"Infiniti QX50",
  "infiniti|qx80":"Infiniti QX80",
  "hyundai|ioniq 5":"Hyundai Ioniq 5",
  "hyundai|ioniq 6":"Hyundai Ioniq 6",
  "kia|ev6":"Kia EV6",
  "kia|ev9":"Kia EV9",
  "genesis|gv60":"Genesis GV60",
  "bmw|i4":"BMW i4",
  "bmw|ix":"BMW iX",
  "audi|e-tron":"Audi e-tron (2018)",
  "audi|q4 e-tron":"Audi Q4 e-tron",
  "rivian|r1s":"Rivian R1S",
  "rivian|r1t":"Rivian R1T",
  "lucid|air":"Lucid Air",
  "polestar|2":"Polestar 2",
  "polestar|3":"Polestar 3",
  "volvo|ex30":"Volvo EX30",
  "volvo|ex40":"Volvo EX40",
  "volvo|ex90":"Volvo EX90"
}));

const esc = value => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const keyFor = t => `${t.make}|${t.model}`.toLowerCase();

async function getJson(url) {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function searchTitle(target) {
  const key = keyFor(target);
  if (TITLE_OVERRIDES.has(key)) return TITLE_OVERRIDES.get(key);
  const q = encodeURIComponent(`${target.make} ${target.model} car`);
  const data = await getJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q}&srlimit=5&format=json&origin=*`);
  const hit = (data?.query?.search || []).find(x => !/company|brand|disambiguation/i.test(x.title)) || data?.query?.search?.[0];
  return hit?.title || `${target.make} ${target.model}`;
}

const PHOTO_DIR = path.join(OUT, "vehicle-photos");

// The pages used to point straight at upload.wikimedia.org and, on top of that, refetch the
// Wikipedia API from every visitor's browser. Both are someone else's service deciding at
// read time whether our pages have pictures. The bytes are downloaded once here instead and
// served from our own origin, so a page render depends on nothing but this deploy.
async function storeLocally(slug, imageUrl) {
  const response = await fetch(imageUrl, { headers: { "user-agent": UA } });
  if (!response.ok) throw new Error(`image ${response.status} ${imageUrl}`);
  const type = (response.headers.get("content-type") || "").toLowerCase();
  const extension = type.includes("png") ? "png" : type.includes("webp") ? "webp"
    : type.includes("svg") ? "svg" : "jpg";
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1_000) throw new Error(`image too small (${bytes.length}B) ${imageUrl}`);
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
  fs.writeFileSync(path.join(PHOTO_DIR, `${slug}.${extension}`), bytes);
  return { local: `/vehicle-photos/${slug}.${extension}`, bytes: bytes.length };
}

async function resolvePhoto(target) {
  const title = await searchTitle(target);
  const encoded = encodeURIComponent(title.replace(/ /g,"_"));
  const data = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`);
  const source = data?.thumbnail?.source || data?.originalimage?.source;
  if (!source) throw new Error(`no page image for ${target.make} ${target.model} (${title})`);
  // Only widen a thumbnail we know exists. Wikimedia refuses to upscale past the original
  // width, so asking for a size the file does not have returns 404 instead of a picture.
  const widened = source.replace(/\/(\d+)px-/, (match, width) =>
    Number(width) >= 900 ? match : "/900px-");
  const page = data?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encoded}`;
  let stored;
  try { stored = await storeLocally(target.slug, widened); }
  catch { stored = await storeLocally(target.slug, source); }
  return { title, image: stored.local, remote: widened, bytes: stored.bytes, page };
}

// A photo that fails still has to leave a page that looks finished. This is the same card
// the model library already shows for a vehicle with no picture.
function placeholderMarkup(target, cls="rv-photo") {
  return `<figure class="${cls} rv-photo-missing"><div class="rv-photo-fallback"><b>${esc(target.make)}</b><strong>${esc(target.model)}</strong><small>${esc(target.segment || "Used vehicle")}</small></div></figure>`;
}

function photoMarkup(target, photo, cls="rv-photo") {
  if (!photo) return placeholderMarkup(target, cls);
  const name = `${target.make} ${target.model}`;
  // onerror covers the deploy going stale or a file being pruned: the reader gets the card
  // above rather than a broken-image icon.
  return `<figure class="${cls}" data-make="${esc(target.make)}" data-model="${esc(target.model)}"><img src="${esc(photo.image)}" alt="${esc(name)}" loading="lazy" decoding="async" onerror="this.closest('figure').classList.add('rv-photo-missing');this.remove()"><div class="rv-photo-fallback"><b>${esc(target.make)}</b><strong>${esc(target.model)}</strong><small>${esc(target.segment || "Used vehicle")}</small></div><figcaption>${esc(name)} · <a href="${esc(photo.page)}" rel="nofollow noopener" target="_blank">vehicle photo source</a></figcaption></figure>`;
}

const FALLBACK_CSS = `.rv-photo-fallback{display:none;place-items:center;text-align:center;min-height:220px;background:linear-gradient(145deg,#f7f9fc,#edf3f9);padding:22px}`
  + `.rv-photo-missing .rv-photo-fallback{display:grid}`
  + `.rv-photo-missing figcaption{display:none}`
  + `.rv-photo-fallback b{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#6c8197}`
  + `.rv-photo-fallback strong{display:block;font-size:19px;color:#17324f;margin-top:3px}`
  + `.rv-photo-fallback small{display:block;font-size:10px;color:#8497a8;margin-top:5px}`;

function patchCarsIndex(photoBySlug) {
  const file = path.join(OUT,"cars","index.html");
  if (!fs.existsSync(file)) return 0;
  let html = fs.readFileSync(file,"utf8"), changed = 0;
  for (const target of MODELS) {
    const photo = photoBySlug.get(target.slug); if (!photo) continue;
    const search = esc(`${target.make} ${target.model}`.toLowerCase()).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    const re = new RegExp(`(<article class="cp-card"[^>]*data-search="${search}"[\\s\\S]*?<div class="cp-image cp-db-placeholder">)[\\s\\S]*?(<\\/div>\\s*<div class="cp-stats)`,"i");
    if (re.test(html)) {
      const img = `<img class="rv-card-img" src="${esc(photo.image)}" alt="${esc(`${target.make} ${target.model}`)}" loading="lazy" decoding="async">`;
      html = html.replace(re, `$1${img}$2`); changed++;
    }
  }
  const css = `<style id="realVehiclePhotoCss">.cp-image.cp-db-placeholder{display:block!important;background:#eef2f6!important;overflow:hidden}.rv-card-img{width:100%;height:100%;object-fit:cover;object-position:center;display:block}.rv-photo{margin:18px 0 28px;border:1px solid #dce5ef;border-radius:16px;overflow:hidden;background:#f4f7fa}.rv-photo img{display:block;width:100%;max-height:460px;object-fit:cover;object-position:center}.rv-photo figcaption{padding:8px 12px;font-size:9px;color:#718397;background:#fff}.rv-photo figcaption a{color:#1767dd;text-decoration:none}.sf-hero+.rv-photo{margin-top:18px}.research-hero+.rv-photo{margin-top:18px}${FALLBACK_CSS}</style>`;
  if (!html.includes("realVehiclePhotoCss")) html = html.replace("</head>",`${css}</head>`);
  fs.writeFileSync(file,html); return changed;
}

function patchModelPages(photoBySlug) {
  let changed=0;
  for (const target of MODELS) {
    const photo=photoBySlug.get(target.slug) || null;
    const base=path.join(OUT,"cars",target.slug);
    for (const rel of ["index.html",path.join("best-years","index.html"),path.join("problems-recalls","index.html"),path.join("ownership-cost","index.html")]) {
      const file=path.join(base,rel); if(!fs.existsSync(file)) continue;
      let html=fs.readFileSync(file,"utf8"); if(html.includes("class=\"rv-photo\"")) continue;
      const markup=photoMarkup(target,photo);
      if(/<\/section>\s*<div class="research-tabs"/i.test(html)) html=html.replace(/<\/section>\s*(<div class="research-tabs")/i,`</section>${markup}$1`);
      else html=html.replace(/<\/section>/i,`</section>${markup}`);
      if(!html.includes("realVehiclePhotoCss")) html=html.replace("</head>",`<style id="realVehiclePhotoCss">.rv-photo{margin:18px 0 28px;border:1px solid #303945;border-radius:16px;overflow:hidden;background:#111820}.rv-photo img{display:block;width:100%;max-height:460px;object-fit:cover;object-position:center}.rv-photo figcaption{padding:8px 12px;font-size:9px;opacity:.7}.rv-photo figcaption a{color:inherit}${FALLBACK_CSS}</style></head>`);
      fs.writeFileSync(file,html); changed++;
    }
  }
  return changed;
}

function patchYearPages(photoBySlug) {
  let changed=0;
  for(const target of MODELS){
    const photo=photoBySlug.get(target.slug) || null;
    for(const year of target.years||[]){
      const file=path.join(OUT,"cars",`${year}-${target.slug}`,"index.html"); if(!fs.existsSync(file)) continue;
      let html=fs.readFileSync(file,"utf8"); if(html.includes("class=\"rv-photo\"")) continue;
      const markup=photoMarkup(target,photo);
      if(html.includes("</section><div class=\"sf-stats\"")) html=html.replace("</section><div class=\"sf-stats\"",`</section>${markup}<div class=\"sf-stats\"`);
      else html=html.replace(/<\/section>/i,`</section>${markup}`);
      if(!html.includes("realVehiclePhotoCss")) html=html.replace("</head>",`<style id="realVehiclePhotoCss">.rv-photo{margin:18px 0 28px;border:1px solid #dce5ef;border-radius:16px;overflow:hidden;background:#f4f7fa}.rv-photo img{display:block;width:100%;max-height:460px;object-fit:cover;object-position:center}.rv-photo figcaption{padding:8px 12px;font-size:9px;color:#718397;background:#fff}.rv-photo figcaption a{color:#1767dd;text-decoration:none}${FALLBACK_CSS}</style></head>`);
      fs.writeFileSync(file,html); changed++;
    }
  }
  return changed;
}

const photos=new Map(), failures=[];
for(const target of MODELS){
  try { photos.set(target.slug,await resolvePhoto(target)); }
  catch(error){ failures.push({slug:target.slug,error:error.message}); console.error(`[real-vehicle-photos] ${target.slug}: ${error.message}`); }
}
const cards=patchCarsIndex(photos);
const modelPages=patchModelPages(photos);
const yearPages=patchYearPages(photos);
fs.writeFileSync(path.join(OUT,"vehicle-photo-status.json"),JSON.stringify({resolved:[...photos.entries()].map(([slug,p])=>({slug,...p})),failures},null,2));
console.log(`[real-vehicle-photos] resolved ${photos.size}/${MODELS.length} model photos; cards ${cards}; model pages ${modelPages}; year pages ${yearPages}`);
if(failures.length) console.warn(`[real-vehicle-photos] ${failures.length} models still need curated photo mapping`);
