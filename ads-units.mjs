// Places the AdSense display unit into the built pages.
//
// This runs at the end of the chain, after every script that rewrites HTML, because earlier
// generators get overwritten by later ones — the same trap that left the blog out of the
// header until the built output was checked rather than the source.
//
// The loader script is NOT emitted here. build.mjs and blog-build.mjs already put it in every
// <head>; a second copy is what AdSense's own snippet would give you if pasted verbatim, and
// duplicating it is a documented way to get requests dropped.

import fs from "node:fs";
import path from "node:path";

const OUT = process.env.KICKTIRES_OUT || "dist";
const CLIENT = (process.env.ADSENSE_CLIENT || "ca-pub-3682195653529318").trim();
const SLOT = (process.env.ADSENSE_SLOT || "5520841408").trim();

if (!/^ca-pub-\d{16}$/.test(CLIENT)) throw new Error("invalid ADSENSE_CLIENT");
if (!/^\d{6,}$/.test(SLOT)) throw new Error("invalid ADSENSE_SLOT");

// Ends the main content, above the footer. Far enough from the analyzer form and the research
// filters that a misclick cannot be blamed on placement, which is the part of the policy that
// actually costs an account.
const UNIT = `<div class="kt-ad" aria-label="Advertisement">`
  + `<ins class="adsbygoogle" style="display:block"`
  + ` data-ad-client="${CLIENT}" data-ad-slot="${SLOT}"`
  + ` data-ad-format="auto" data-full-width-responsive="true"></ins>`
  + `<script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>`;

const STYLE = `<style>.kt-ad{width:min(100%,1080px);margin:34px auto 8px;padding:0 20px;`
  + `box-sizing:border-box;min-height:100px}</style>`;

const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? walk(path.join(dir, entry.name))
    : (entry.name.endsWith(".html") ? [path.join(dir, entry.name)] : []));

if (!fs.existsSync(OUT)) throw new Error(`${OUT} missing: run the build before ads-units.mjs`);

let placed = 0;
let skipped = 0;
for (const file of walk(OUT)) {
  let html = fs.readFileSync(file, "utf8");

  // Already carries a unit, or has no main content to sit under — the Search Console
  // ownership token is a bare string, not a page, and must stay exactly as Google wrote it.
  if (html.includes('class="adsbygoogle"') || !html.includes("</main>")) { skipped++; continue; }
  // A unit without the loader never fills, and a page without the loader is a page this
  // build did not generate. Leave it alone rather than emit a slot that cannot request.
  if (!html.includes("adsbygoogle.js")) { skipped++; continue; }

  html = html.replace("</main>", `${UNIT}</main>`);
  if (!html.includes(".kt-ad{")) html = html.replace("</head>", `${STYLE}</head>`);
  fs.writeFileSync(file, html);
  placed++;
}

console.log(`[ads-units] placed 1 unit on ${placed} pages (slot ${SLOT}); skipped ${skipped}`);
