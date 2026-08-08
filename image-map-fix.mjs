import fs from "node:fs";

const file = "dist/cars/index.html";
if (!fs.existsSync(file)) throw new Error("dist/cars/index.html missing; run UI build first");

// These positions correspond to the verified model tiles in car-sprite.mjs.
// IMPORTANT: never fall back to a different vehicle for an unknown model.
const exact = new Map([
  ["honda civic", 14.2857],
  ["toyota camry", 28.5714],
  ["bmw 330i", 57.1429],
  ["bmw 3 series", 57.1429],
  ["toyota rav4", 71.4286],
  ["ford f-150", 85.7143],
  ["ford f150", 85.7143]
]);

const esc = value => String(value || "")
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
  .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const norm = value => String(value || "").trim().toLowerCase().replace(/\s+/g," ");

let html = fs.readFileSync(file, "utf8");
let exactCount = 0;
let placeholderCount = 0;

html = html.replace(/<a class="hub-model-card"[\s\S]*?<\/a>/g, block => {
  const makeMatch = block.match(/<span class="hub-make">([^<]+)<\/span>/i);
  const titleMatch = block.match(/<h3>([^<]+)<\/h3>/i);
  if (!makeMatch || !titleMatch) return block;

  const make = makeMatch[1].trim();
  const title = titleMatch[1].trim();
  let model = title.toLowerCase().startsWith(make.toLowerCase())
    ? title.slice(make.length).trim()
    : title;
  const key = norm(`${make} ${model}`);
  const pos = exact.get(key);

  if (typeof pos === "number") {
    exactCount++;
    return block.replace(
      /<span class="hub-car-photo"([^>]*)style="[^"]*"([^>]*)><\/span>/i,
      `<span class="hub-car-photo"$1style="background-position:center ${pos}%"$2></span>`
    );
  }

  // No verified image: show a truthful neutral treatment rather than the wrong car.
  placeholderCount++;
  return block.replace(
    /<span class="hub-car-photo"[\s\S]*?<\/span>/i,
    `<span class="hub-photo-missing" role="img" aria-label="${esc(title)} photo not yet verified"><b>${esc(make)}</b><strong>${esc(model)}</strong><small>Model-specific photo coming soon</small></span>`
  );
});

const css = `
/* exact model image guard */
.hub-photo-missing{display:flex;width:100%;aspect-ratio:240/130;flex-direction:column;align-items:center;justify-content:center;gap:4px;background:linear-gradient(145deg,#eef4fa,#f8fbfe);border:1px solid #dbe5ef;border-radius:12px;color:#18344f;text-align:center}
.hub-photo-missing b{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#6b8198}
.hub-photo-missing strong{font-size:18px;letter-spacing:-.025em}
.hub-photo-missing small{font-size:10.5px;color:#7b8fa3}
`;
if (!html.includes("exact model image guard")) html = html.replace("</style>", `${css}</style>`);

fs.writeFileSync(file, html);
console.log(`[image-map] ${exactCount} verified model photos; ${placeholderCount} mismatched fallbacks removed`);
