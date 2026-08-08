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

fs.writeFileSync(file, html);
console.log("[analyzer-safety] direct Netlify function route + 35s hard timeout installed");
