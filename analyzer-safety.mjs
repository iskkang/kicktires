import fs from "node:fs";

// This script used to rewrite the analyzer's fetch call in the built HTML. That string
// surgery is how the page ended up POSTing to /.netlify/functions/analyze, which Netlify
// does not serve for a function that declares its own `path` — every check 404'd. The
// request code now lives in build.mjs, next to the rest of the analyzer, and this script
// only refuses to publish a homepage whose check cannot run or cannot report failure.

const file = "dist/index.html";
if (!fs.existsSync(file)) throw new Error("dist/index.html missing");

const html = fs.readFileSync(file, "utf8");
const problems = [];

// The homepage is rewritten several times after build.mjs emits it (homepage, home-premium,
// home-reference, home-reference-exact). A rewrite that drops an element the analyzer script
// touches used to strand the button on "Checking…" forever: the null dereference threw before
// the try block, so the request was never sent and the finally never re-enabled the button.
const REQUIRED_ELEMENTS = [
  ["inp", "listing textarea"],
  ["analyzeBtn", "submit button"],
  ["live", "results container"],
  ["hint", "inline hint line"],
  ["check", "analyzer scroll anchor"]
];
for (const [id, role] of REQUIRED_ELEMENTS) {
  if (!new RegExp(`id="${id}"`).test(html)) problems.push(`missing #${id} (${role})`);
}

// Both routes must ship. Trying only one puts the whole analyzer at the mercy of which
// URL Netlify decides to serve the function on.
for (const path of ["/api/analyze", "/.netlify/functions/analyze"]) {
  if (!html.includes(`"${path}"`)) problems.push(`analyzer never tries ${path}`);
}
if (!/const response = await postListing\(text\);/.test(html)) {
  problems.push("analyzer does not go through postListing (no 404 fallback)");
}

// An unbounded request is an unbounded "Checking…" state.
if (!html.includes("AbortSignal.timeout(35_000)")) {
  problems.push("analyzer request has no 35s timeout");
}
if (!html.includes('error.name === "TimeoutError"')) {
  problems.push("analyzer does not report a timeout to the reader");
}

// Nothing between setBusy(true) and the try may throw, or the button never gets re-enabled.
if (!/setBusy\(true\);\s*(?:\/\/[^\n]*\n\s*)*try \{/.test(html)) {
  problems.push("analyzer does not enter its try block immediately after setBusy(true)");
}

if (problems.length) {
  throw new Error(`refusing to publish a broken analyzer:\n  - ${problems.join("\n  - ")}`);
}

console.log(`[analyzer-safety] verified: ${REQUIRED_ELEMENTS.length} elements, `
  + "both analyzer routes, 35s timeout, recoverable Checking state");
