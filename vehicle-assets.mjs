import fs from "node:fs";
import corolla from "./assets-data/toyota-corolla.mjs";
import accord from "./assets-data/honda-accord.mjs";
import crv from "./assets-data/honda-cr-v.mjs";
import { TINY_CAR_IMAGES } from "./assets-data/remaining.mjs";

const IMAGES = new Map([
  ["toyota|corolla", corolla],
  ["honda|accord", accord],
  ["honda|cr-v", crv],
  ...Object.entries(TINY_CAR_IMAGES)
]);

const DISPLAY = new Map([
  ["toyota|corolla", ["Toyota", "Corolla"]],
  ["honda|accord", ["Honda", "Accord"]],
  ["honda|cr-v", ["Honda", "CR-V"]],
  ["nissan|altima", ["Nissan", "Altima"]],
  ["nissan|rogue", ["Nissan", "Rogue"]],
  ["jeep|grand cherokee", ["Jeep", "Grand Cherokee"]],
  ["bmw|x5", ["BMW", "X5"]]
]);

const escRe = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function patchCardPlaceholders(file) {
  if (!fs.existsSync(file)) return { changed: 0 };
  let html = fs.readFileSync(file, "utf8");
  let changed = 0;
  for (const [key, dataUri] of IMAGES) {
    const [make, model] = DISPLAY.get(key);
    const label = `${make} ${model}`;
    const cp = new RegExp(`<span class="cp-photo cp-photo-empty" role="img" aria-label="${escRe(label)} image pending">[\\s\\S]*?<\\/span>`, "i");
    if (cp.test(html)) {
      html = html.replace(cp, `<span class="cp-photo cp-photo-exact" role="img" aria-label="${label}" style="background-image:url('${dataUri}')"></span>`);
      changed++;
    }
    const hp = new RegExp(`<span class="hp-photo hp-photo-empty">[\\s\\S]*?<b>${escRe(make)}<\\/b>[\\s\\S]*?<strong>${escRe(model)}<\\/strong>[\\s\\S]*?<\\/span>`, "i");
    if (hp.test(html)) {
      html = html.replace(hp, `<span class="hp-photo hp-photo-exact" role="img" aria-label="${label}" style="background-image:url('${dataUri}')"></span>`);
      changed++;
    }
  }
  if (changed) {
    const css = `<style id="vehicleExactAssets">.cp-photo-exact,.hp-photo-exact{display:block;width:100%;height:100%;background-repeat:no-repeat!important;background-position:center!important;background-size:contain!important;background-color:#f7f9fc!important}</style>`;
    if (!html.includes("vehicleExactAssets")) html = html.replace("</head>", `${css}</head>`);
    fs.writeFileSync(file, html);
  }
  return { changed };
}

const cars = patchCardPlaceholders("dist/cars/index.html");
const home = patchCardPlaceholders("dist/index.html");

const missing = [];
if (fs.existsSync("dist/cars/index.html")) {
  const html = fs.readFileSync("dist/cars/index.html", "utf8");
  for (const [key, [make, model]] of DISPLAY) {
    const label = `${make} ${model}`;
    if (html.includes(`aria-label="${label} image pending"`)) missing.push(label);
  }
}
if (missing.length) throw new Error(`[vehicle-assets] unresolved placeholders: ${missing.join(", ")}`);
console.log(`[vehicle-assets] installed ${cars.changed} /cars replacements and ${home.changed} homepage replacements; all target vehicle images resolved`);
