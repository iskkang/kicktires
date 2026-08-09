import fs from "node:fs";

const file = "dist/index.html";
if (!fs.existsSync(file)) throw new Error("dist/index.html missing");

let html = fs.readFileSync(file, "utf8");
const before = `const response = await fetch("/api/analyze", {\n      method:"POST", headers:{"Content-Type":"application/json"},\n      body: JSON.stringify({text:text})\n    });`;
const after = `const response = await fetch("/.netlify/functions/analyze", {\n      method:"POST", headers:{"Content-Type":"application/json"},\n      body: JSON.stringify({text:text}),\n      signal: AbortSignal.timeout(35_000)\n    });`;

if (!html.includes(before)) throw new Error("analyzer fetch block not found; refusing to ship an unbounded Checking state");
html = html.replace(before, after);

html = html.replace(
  `} catch (error) {\n    return fail("network_error", "Could not reach the analysis service. Try again in a moment.");`,
  `} catch (error) {\n    if (error && (error.name === "TimeoutError" || error.name === "AbortError")) {\n      return fail("timeout", "This check took too long and was stopped after 35 seconds. Cars.com may be blocking our reader — paste the listing text instead.");\n    }\n    return fail("network_error", "Could not reach the analysis service. Try again in a moment.");`
);

// The homepage is rewritten several times after build.mjs emits it (homepage, home-premium,
// home-reference, home-reference-exact). A rewrite that drops an element the analyzer script
// touches used to strand the button on "Checking…" forever: the null dereference threw before
// the try block, so the request was never sent and the finally never re-enabled the button.
// The shipped page must therefore still carry every element the script reads.
const REQUIRED_ELEMENTS = [
  ["inp", "listing textarea"],
  ["analyzeBtn", "submit button"],
  ["live", "results container"],
  ["hint", "inline hint line"],
  ["check", "analyzer scroll anchor"]
];
const missing = REQUIRED_ELEMENTS
  .filter(([id]) => !new RegExp(`id="${id}"`).test(html))
  .map(([id, role]) => `#${id} (${role})`);
if (missing.length) {
  throw new Error(`analyzer elements missing from dist/index.html: ${missing.join(", ")}; `
    + "refusing to ship a homepage where the check cannot start or report failure");
}

// Nothing between setBusy(true) and the try may throw, or the button never gets re-enabled.
if (!/setBusy\(true\);\s*(?:\/\/[^\n]*\n\s*)*try \{/.test(html)) {
  throw new Error("analyzer does not enter its try block immediately after setBusy(true); "
    + "refusing to ship a Checking state that cannot recover from a DOM error");
}

fs.writeFileSync(file, html);
console.log(`[analyzer-safety] direct Netlify function route + 35s hard timeout installed; `
  + `${REQUIRED_ELEMENTS.length} analyzer elements present`);
