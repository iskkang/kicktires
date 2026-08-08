import fs from "node:fs";

const FILE = "dist/cars/index.html";
const MODELS_FILE = "research-models.json";
const STATUS_FILE = "dist/research-status.json";

if (!fs.existsSync(FILE)) throw new Error("dist/cars/index.html missing");
if (!fs.existsSync(MODELS_FILE)) throw new Error("research-models.json missing");

const targets = JSON.parse(fs.readFileSync(MODELS_FILE, "utf8")).models || [];
const statuses = fs.existsSync(STATUS_FILE)
  ? JSON.parse(fs.readFileSync(STATUS_FILE, "utf8")).models || []
  : [];
const statusBySlug = new Map(statuses.map(item => [item.slug, item]));

const esc = value => String(value ?? "")
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
  .replace(/"/g,"&quot;").replace(/'/g,"&#39;");

function card(target) {
  const status = statusBySlug.get(target.slug);
  const years = status?.years?.length ? status.years : target.years || [];
  const from = years.length ? Math.min(...years) : "—";
  const to = years.length ? Math.max(...years) : "—";
  const quality = status?.quality === true;
  const state = quality ? "Federal data ready" : "Research page available";
  const base = `/cars/${target.slug}/`;
  return `<article class="cp-card" data-make="${esc(target.make.toLowerCase())}" data-search="${esc(`${target.make} ${target.model}`.toLowerCase())}" data-years="${years.length}">
    <a class="cp-card-main" href="${base}">
      <div class="cp-card-top"><div><span class="cp-brand">${esc(target.make)}</span><h3>${esc(target.model)}</h3><p>${from}–${to}</p></div><span class="cp-type">${esc(target.segment || "Used Vehicle")}</span></div>
      <div class="cp-image cp-db-placeholder"><div><b>${esc(target.make)}</b><strong>${esc(target.model)}</strong><small>${esc(state)}</small></div></div>
      <div class="cp-stats cp-db-stats"><span><b>${years.length}</b><small>Model years</small></span><span><b>${quality ? "Ready" : "Live"}</b><small>NHTSA research</small></span><span><b>4</b><small>Research guides</small></span></div>
    </a>
    <div class="cp-research-links"><a href="${base}">Reliability</a><a href="${base}problems-recalls/">Common Problems</a><a href="${base}best-years/">Best Years</a><a href="${base}ownership-cost/">Ownership Cost</a></div>
  </article>`;
}

const cards = targets.map(card).join("");
const makes = [...new Set(targets.map(t => t.make))].sort((a,b)=>a.localeCompare(b));
const pills = makes.map(make => {
  const count = targets.filter(t => t.make === make).length;
  return `<button class="cp-make" data-make="${esc(make.toLowerCase())}"><span class="cp-logo-dot">${esc(make.slice(0,1))}</span><b>${esc(make)}</b><small>${count} model${count===1?"":"s"}</small></button>`;
}).join("");
const brandRow = `<button class="cp-make cp-all on" data-make="all"><b>All</b><small>${targets.length} models</small></button>${pills}`;

let html = fs.readFileSync(FILE, "utf8");
const gridPattern = /<div class="cp-grid" id="cpGrid">[\s\S]*?<\/div><div class="cp-empty"/i;
if (!gridPattern.test(html)) throw new Error("cpGrid not found");
html = html.replace(gridPattern, `<div class="cp-grid" id="cpGrid">${cards}</div><div class="cp-empty"`);

const brandPattern = /<div class="cp-shell cp-brand-row">[\s\S]*?<\/div><\/section>/i;
if (!brandPattern.test(html)) throw new Error("brand row not found");
html = html.replace(brandPattern, `<div class="cp-shell cp-brand-row">${brandRow}</div></section>`);

html = html.replace(/<span class="cp-count" id="cpCount">[^<]*<\/span>/i, `<span class="cp-count" id="cpCount">${targets.length} models</span>`);

const css = `<style id="carsLibrarySyncCss">
.cp-card-main{display:block;text-decoration:none;color:inherit}.cp-db-placeholder{display:grid;place-items:center;background:linear-gradient(145deg,#f7f9fc,#edf3f9);text-align:center}.cp-db-placeholder b{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#6c8197}.cp-db-placeholder strong{display:block;margin:4px 0;font-size:24px;color:#294660}.cp-db-placeholder small{font-size:10px;color:#73889d}.cp-db-stats{grid-template-columns:repeat(3,1fr)}.cp-research-links{display:grid;grid-template-columns:repeat(2,1fr);gap:1px;background:#e7edf4;border-top:1px solid #e7edf4}.cp-research-links a{background:#fff;padding:10px 12px;text-align:center;text-decoration:none;color:#0d5bd1;font-size:10px;font-weight:800}.cp-research-links a:hover{background:#f3f7fd}@media(max-width:640px){.cp-research-links{grid-template-columns:1fr 1fr}}
</style>`;
if (!html.includes("carsLibrarySyncCss")) html = html.replace("</head>", `${css}</head>`);

fs.writeFileSync(FILE, html);
console.log(`[cars-library-sync] ${targets.length} research model families exposed in /cars/`);
