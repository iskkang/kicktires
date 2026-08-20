// Historical builds cloned each model guide into a second URL for every year. Those pages
// repeated the same template, competed with the fully sourced model-year pages and inflated
// the index with low-value content. Keep the old URLs working, but consolidate them into the
// single model guide. Detailed stored-snapshot pages (for example
// /cars/2020-toyota-camry-problems/) are built elsewhere and are not touched here.

import fs from "node:fs";
import path from "node:path";

const OUT = process.env.KICKTIRES_OUT || "dist";
const targets = JSON.parse(fs.readFileSync("research-models.json", "utf8")).models || [];
const redirectsFile = path.join(OUT, "_redirects");

if (!fs.existsSync(OUT)) throw new Error(`${OUT} missing: run build.mjs first`);

const existing = fs.existsSync(redirectsFile)
  ? fs.readFileSync(redirectsFile, "utf8").split("\n").filter(Boolean) : [];
const redirects = [];

for (const target of targets) {
  for (const year of target.years || []) {
    const legacy = `/cars/${year}-${target.slug}/`;
    const destination = `/cars/${target.slug}/#years`;
    const legacyDir = path.join(OUT, "cars", `${year}-${target.slug}`);

    // Never replace an independently built, stored-snapshot page. The legacy pattern and
    // current snapshot slugs differ today, but this makes the rule safe if naming changes.
    if (fs.existsSync(path.join(legacyDir, "index.html"))) continue;
    redirects.push(`${legacy} ${destination} 301`);
  }
}

fs.writeFileSync(redirectsFile, [...new Set([...existing, ...redirects])].join("\n") + "\n");
console.log(`[year-seo-expand] retired duplicate year pages; preserved ${redirects.length} legacy URLs as 301 redirects`);
