import fs from "node:fs";
import { CAR_SPRITE } from "./car-sprite.mjs";

const file = "dist/index.html";
if (!fs.existsSync(file)) throw new Error("dist/index.html missing; run homepage build first");

const positions = [0, 14.2857, 28.5714, 42.8571, 57.1429, 71.4286, 85.7143, 100];
const lower = value => String(value || "").toLowerCase();

function tileFor(label) {
  const value = lower(label);
  if (value.includes("honda") && value.includes("civic")) return 1;
  if (value.includes("toyota") && value.includes("camry")) return 2;
  if (value.includes("tesla") && value.includes("model 3")) return 3;
  if (value.includes("bmw") && value.includes("330i")) return 4;
  if (value.includes("toyota") && value.includes("rav4")) return 5;
  if (value.includes("ford") && (value.includes("f-150") || value.includes("f150"))) return 6;
  if (value.includes("hyundai") && value.includes("tucson")) return 7;
  return 0;
}

function escapeAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

let html = fs.readFileSync(file, "utf8");
let replaced = 0;
html = html.replace(/<svg class="kt-car-svg"[\s\S]*?aria-label="([^"]+) illustration"[\s\S]*?<\/svg>/g, (_match, label) => {
  const tile = tileFor(label);
  replaced++;
  return `<span class="kt-car-photo" role="img" aria-label="${escapeAttr(label)}" style="background-image:url('${CAR_SPRITE}');background-position:center ${positions[tile]}%"></span>`;
});

const photoCss = `
.kt-car-photo{display:block;width:100%;aspect-ratio:240/109;background-repeat:no-repeat;background-size:100% 800%;background-color:#f4f7fb;border-radius:12px;overflow:hidden}
.kt-hero-car .kt-car-photo{border-radius:22px;box-shadow:0 24px 34px rgba(20,45,72,.18)}
.kt-car-frame .kt-car-photo{width:100%;height:auto;min-height:88px}
.kt-car-frame-small .kt-car-photo{min-height:80px}
.kt-mini-car .kt-car-photo{min-height:54px;border-radius:8px}
@media(max-width:760px){.kt-hero-car .kt-car-photo{border-radius:16px}.kt-car-frame .kt-car-photo{min-height:76px}}
`;

html = html.replace("</style>", `${photoCss}</style>`);
fs.writeFileSync(file, html);
console.log(`[photos] replaced ${replaced} SVG car illustrations with embedded photorealistic vehicle images`);
