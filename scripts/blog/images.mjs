// Gets a hero image for a post, or builds one from the vehicle's own federal record.
//
// Three rules shape this file. Nothing is hotlinked — bytes are downloaded and served from
// this deploy, because a third party deciding at read time whether our pages have pictures
// is how the research pages lost all of theirs. Nothing without a clear commercial licence
// is used. And when no licensed photo of the right car exists, the fallback is a data
// graphic built from real numbers rather than a synthetic image of a car that never existed.

import fs from "node:fs";
import path from "node:path";
import { IMAGES_DIR } from "./schema.mjs";

const UA = "KickTires/1.0 (used-car research; https://kicktires.netlify.app/about/)";

// Openverse exposes the licence on every result, so the filter is done on their side and
// re-checked here. NonCommercial and NoDerivatives are excluded: this site carries ads.
export const ALLOWED_LICENSES = new Set(["cc0", "pdm", "by", "by-sa"]);

const esc = value => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const licenseLabel = (license, version) => {
  const code = String(license || "").toLowerCase();
  if (code === "cc0") return "CC0 1.0 (public domain dedication)";
  if (code === "pdm") return "Public Domain Mark";
  const suffix = version ? ` ${version}` : "";
  if (code === "by") return `CC BY${suffix}`;
  if (code === "by-sa") return `CC BY-SA${suffix}`;
  return "";
};

async function getJson(url, { timeoutMs = 15_000, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

/**
 * Searches Openverse for a commercially usable photo of this vehicle. Returns null rather
 * than throwing when nothing suitable exists — a missing photo is a fallback, not a failure.
 */
export async function findLicensedPhoto({ year, make, model }, options = {}) {
  const query = encodeURIComponent(`${make} ${model}`);
  const url = "https://api.openverse.org/v1/images/"
    + `?q=${query}&license=cc0,pdm,by,by-sa&category=photograph`
    + "&mature=false&page_size=20&format=json";
  let payload;
  try { payload = await getJson(url, options); }
  catch { return null; }

  const results = Array.isArray(payload?.results) ? payload.results : [];
  for (const item of results) {
    const license = String(item?.license || "").toLowerCase();
    if (!ALLOWED_LICENSES.has(license)) continue;
    if (!item?.url || !item?.foreign_landing_url) continue;
    const label = licenseLabel(license, item?.license_version);
    if (!label) continue;
    const title = String(item?.title || "");
    // Only claim a model year when the source itself names it.
    const yearConfirmed = new RegExp(`\\b${year}\\b`).test(title);
    return {
      downloadUrl: item.url,
      sourceUrl: item.foreign_landing_url,
      creator: String(item?.creator || "Unknown").slice(0, 120),
      license: label,
      licenseUrl: String(item?.license_url || ""),
      title: title.slice(0, 200),
      provider: String(item?.provider || "openverse"),
      yearConfirmed
    };
  }
  return null;
}

export async function downloadImage(candidate, slug, options = {}) {
  const { fetchImpl = fetch, timeoutMs = 20_000 } = options;
  const response = await fetchImpl(candidate.downloadUrl, {
    headers: { "User-Agent": UA }, signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`image ${response.status}`);
  const type = String(response.headers.get("content-type") || "").toLowerCase();
  if (!/^image\/(jpe?g|png|webp)/.test(type)) throw new Error(`image type ${type || "unknown"}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 5_000) throw new Error(`image too small (${bytes.length}B)`);
  const extension = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
  const dir = path.join(IMAGES_DIR, slug);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${slug}-hero.${extension}`;
  fs.writeFileSync(path.join(dir, name), bytes);
  return { file: `/blog-images/${slug}/${name}`, bytes: bytes.length };
}

/* ── KickTires data graphic ───────────────────────────────────── */
// Built from the same evidence object the post is written from, so it carries information
// rather than decoration: complaint total, recall total, and the leading reported areas.
// SVG on purpose — it is exact at any size, needs no image toolchain in CI, and can never
// be mistaken for a photograph of a specific car.
export function dataGraphicSvg(evidence, { width = 1200, height = 675 } = {}) {
  const { year, make, model } = evidence.vehicle;
  const top = evidence.complaints.topComponents.slice(0, 4);
  const max = Math.max(1, ...top.map(item => item.count));
  const bars = top.map((item, index) => {
    const y = 300 + index * 74;
    const barWidth = Math.round((item.count / max) * 560);
    const label = item.component.length > 30 ? item.component.slice(0, 29) + "…" : item.component;
    return `<text x="80" y="${y - 8}" class="lbl">${esc(label)}</text>`
      + `<rect x="80" y="${y}" width="${barWidth}" height="26" rx="6" fill="#3987e5"/>`
      + `<text x="${80 + barWidth + 14}" y="${y + 20}" class="num">${item.count}</text>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(`${year} ${make} ${model} federal record summary`)}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#0b1c34"/><stop offset="1" stop-color="#12294a"/></linearGradient></defs>
<style>
.kicker{fill:#7fb0ee;font:700 22px system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.14em}
.title{fill:#fff;font:800 52px system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:-.02em}
.stat{fill:#fff;font:800 58px system-ui,-apple-system,"Segoe UI",sans-serif}
.statlbl{fill:#9db4cd;font:600 17px system-ui,-apple-system,"Segoe UI",sans-serif}
.lbl{fill:#c7d6e6;font:600 17px system-ui,-apple-system,"Segoe UI",sans-serif}
.num{fill:#fff;font:700 18px system-ui,-apple-system,"Segoe UI",sans-serif}
.foot{fill:#7e93a8;font:500 16px system-ui,-apple-system,"Segoe UI",sans-serif}
</style>
<rect width="${width}" height="${height}" fill="url(#bg)"/>
<rect x="0" y="0" width="${width}" height="7" fill="#3987e5"/>
<text x="80" y="98" class="kicker">KICKTIRES · FEDERAL RECORD</text>
<text x="80" y="168" class="title">${esc(`${year} ${make} ${model}`)}</text>
<text x="80" y="248" class="stat">${evidence.complaints.total}</text>
<text x="80" y="276" class="statlbl">NHTSA complaints filed</text>
<text x="420" y="248" class="stat">${evidence.recalls.total}</text>
<text x="420" y="276" class="statlbl">Recall campaigns</text>
<text x="720" y="248" class="stat">${evidence.complaints.crashes}</text>
<text x="720" y="276" class="statlbl">Complaints citing a crash</text>
${bars}
<text x="80" y="${height - 42}" class="foot">Source: NHTSA · retrieved ${esc(String(evidence.retrievedAt).slice(0, 10))} · complaint totals are screening signals, not failure rates</text>
</svg>`;
}

export function writeDataGraphic(evidence, slug) {
  const dir = path.join(IMAGES_DIR, slug);
  fs.mkdirSync(dir, { recursive: true });
  const { year, make, model } = evidence.vehicle;
  const base = `${slug}-federal-record`;
  const hero = `${base}.svg`;
  fs.writeFileSync(path.join(dir, hero), dataGraphicSvg(evidence));
  // Open Graph wants a fixed 1.91:1; the square is for cards that crop.
  fs.writeFileSync(path.join(dir, `${base}-og.svg`), dataGraphicSvg(evidence, { width: 1200, height: 630 }));
  fs.writeFileSync(path.join(dir, `${base}-square.svg`), dataGraphicSvg(evidence, { width: 1080, height: 1080 }));
  return {
    src: `/blog-images/${slug}/${hero}`,
    ogSrc: `/blog-images/${slug}/${base}-og.svg`,
    squareSrc: `/blog-images/${slug}/${base}-square.svg`,
    alt: `Chart of NHTSA complaint and recall totals for the ${year} ${make} ${model}`,
    credit: "KickTires, built from NHTSA records",
    license: "KickTires original graphic",
    kind: "data_graphic"
  };
}

/**
 * The hero for a post. Tries a licensed photograph, falls back to the data graphic. Never
 * throws: a post without a photo still publishes, a post with an unlicensed one never does.
 */
export async function acquireHeroImage(evidence, slug, options = {}) {
  const { year, make, model } = evidence.vehicle;
  if (options.skipPhotoSearch !== true) {
    try {
      const candidate = await findLicensedPhoto({ year, make, model }, options);
      if (candidate) {
        const stored = await downloadImage(candidate, slug, options);
        return {
          src: stored.file,
          ogSrc: stored.file,
          squareSrc: stored.file,
          // Only name the model year when the source did; otherwise describe the line.
          alt: candidate.yearConfirmed
            ? `${year} ${make} ${model}`
            : `${make} ${model} of the same generation as the ${year} car`,
          credit: `${candidate.creator} via ${candidate.provider}`,
          license: candidate.license,
          licenseUrl: candidate.licenseUrl,
          sourceUrl: candidate.sourceUrl,
          downloadedAt: new Date().toISOString(),
          yearConfirmed: candidate.yearConfirmed,
          kind: "licensed_photo"
        };
      }
    } catch (error) {
      // A photo that cannot be fetched or licensed is not a reason to fail the post.
      console.warn(`[blog:images] licensed photo unavailable (${error.message}); using data graphic`);
    }
  }
  return writeDataGraphic(evidence, slug);
}
