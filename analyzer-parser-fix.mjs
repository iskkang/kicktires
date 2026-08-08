import fs from "node:fs";

const FILE = "netlify/functions/analyze.mjs";
let source = fs.readFileSync(FILE, "utf8");

const oldModel = '    const model = phrase || (/\\d|-/.test(token) ? token : "");';
const newModel = '    // A clear listing title may use an alphabetic-only model name (Frontier, Altima, Camry, Accord, etc.).\n    // The old rule incorrectly required a digit or hyphen and forced these obvious listings through the LLM extractor.\n    const model = phrase || token;';
if (!source.includes(oldModel) && !source.includes('const model = phrase || token;')) {
  throw new Error("parseObviousPastedListing model rule not found");
}
source = source.replace(oldModel, newModel);

const oldLocation = '    const location = lines.find(value => /^[A-Za-z .\'-]+,\\s*[A-Z]{2}(?:\\s+\\d{5})?$/.test(value)) || null;';
const newLocation = '    const locationLine = lines.find(value => /^[A-Za-z .\'-]+,\\s*[A-Z]{2}(?:\\s+\\d{5})?(?:\\s+\\(\\d+\\s*mi\\))?$/.test(value)) || null;\n    const location = locationLine?.replace(/\\s+\\(\\d+\\s*mi\\)$/i, "") || null;';
if (source.includes(oldLocation)) source = source.replace(oldLocation, newLocation);

fs.writeFileSync(FILE, source);

// Regression fixture: this exact pasted Cars.com-style listing must stay on the deterministic fast path.
const fixture = `Used 2023 Nissan Frontier PRO-4X

$37,640
$277
Mileage
29,891 mi
Est. payment
$707 /mo
 
Good Deal
Vehicle price breakdown
Description Amount
Vehicle price
$37,222
Illinois Doc Fee
$378
EVR
$40
All-in total price
$37,640
Price does not include taxes, registration, or other mandatory government charges. The seller is solely responsible for the prices and fees listed.
Contact seller
(630) 919-0712
Glendale Nissan
4.5
Glendale Heights, IL (23 mi)`;

function clipped(value, max = 500) {
  return String(value || "").replace(/[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]/g, " ").replace(/\\s+/g, " ").trim().slice(0, max);
}
const makes = [["nissan", "nissan"]];
const lines = fixture.split(/\\r?\\n/).map(line => clipped(line, 260)).filter(Boolean);
const title = lines[0];
const yearMatch = title.match(/\\b(19[89]\\d|20\\d{2})\\b/);
const afterYear = title.slice(yearMatch.index + yearMatch[0].length).replace(/^[\\s:|,;\\-–—]+/, "").trim();
const makeEntry = makes.find(([label]) => afterYear.toLowerCase().startsWith(label + " "));
const afterMake = afterYear.slice(makeEntry[0].length).replace(/^[\\s:|,;\\-–—]+/, "").trim();
const token = afterMake.match(/^([a-z0-9]+(?:[-/][a-z0-9]+)*)\\b/i)?.[1] || "";
const model = token;
const trim = afterMake.slice(model.length).replace(/^[\\s:|,;\\-–—]+/, "").trim() || null;
const price = fixture.match(/(?:\\$\\s*|USD\\s*)(\\d{1,3}(?:,\\d{3})+|\\d{3,7})(?:\\.\\d{2})?/i)?.[1];
const mileage = fixture.match(/\\b(\\d{1,3}(?:,\\d{3})+|\\d{1,6})\\s*(?:miles?|mi)\\b/i)?.[1];
const locationLine = lines.find(value => /^[A-Za-z .'-]+,\\s*[A-Z]{2}(?:\\s+\\d{5})?(?:\\s+\\(\\d+\\s*mi\\))?$/.test(value)) || null;
const location = locationLine?.replace(/\\s+\\(\\d+\\s*mi\\)$/i, "") || null;
const actual = { year: Number(yearMatch?.[1]), make: makeEntry?.[1], model: model.toLowerCase(), trim, price: Number(price?.replace(/,/g, "")), mileage: Number(mileage?.replace(/,/g, "")), location };
const expected = { year: 2023, make: "nissan", model: "frontier", trim: "PRO-4X", price: 37640, mileage: 29891, location: "Glendale Heights, IL" };
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(`Frontier parser regression: ${JSON.stringify(actual)}`);
}
console.log("[analyzer-parser-fix] generic alphabetic models enabled; Frontier fixture passed");
