import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import handler, { __test } from "../netlify/functions/analyze.mjs";

test("matches reviewed profiles and rejects incomplete vehicle identities", () => {
  const car = __test.normalizeCar({
    year: 2019, make: "NISSAN", model: "Altima", mileage: "88000", price: "8999"
  });
  assert.equal(car.model, "altima");
  assert.equal(car.mileage, 88000);
  assert.equal(__test.findProfile(car)?.meta.slug, "2019-nissan-altima-problems");
  assert.equal(__test.normalizeCar({ year: 1700, make: "Honda" }).year, null);
  assert.equal(__test.normalizeCar({ year: 2023, make: "Tesla", model: "Model Y", mileage: null }).mileage, null);
});

test("fast-parses clear pasted listing headers without inventing missing mileage", () => {
  const cadillac = __test.parseObviousPastedListing(`Certified 2025 Cadillac XT6 Premium Luxury AWD/4WD
w/ Platinum Package
Bradenton, FL
$52,988`);
  assert.deepEqual(
    { year: cadillac.year, make: cadillac.make, model: cadillac.model, price: cadillac.price,
      mileage: cadillac.mileage, location: cadillac.location, seller: cadillac.seller },
    { year: 2025, make: "cadillac", model: "xt6", price: 52988,
      mileage: null, location: "Bradenton, FL", seller: "dealer" }
  );
  assert.equal(cadillac.certified, true);

  const tesla = __test.parseObviousPastedListing(`Used 2023 Tesla Model Y Performance AWD/4WD
Sterling, VA
$24,986
VIN 7SAYGDEF5PF123456`);
  assert.equal(tesla.model, "modely");
  assert.equal(tesla.mileage, null);
  assert.equal(tesla.location, "Sterling, VA");
  assert.equal(tesla.vin, "7SAYGDEF5PF123456");
});

test("downgrades a listing verdict when price or mileage is missing", () => {
  const analysis = { deal: { grade: "reasonable", label: "Looks reasonable", reason: "Complete." } };
  const limitations = __test.applyListingLimitations(analysis, {
    year: 2023, make: "tesla", model: "modely", price: 24986, mileage: null
  });
  assert.equal(limitations.canJudgeListing, false);
  assert.deepEqual(limitations.missing, ["mileage"]);
  assert.equal(analysis.deal.grade, "inspect");
  assert.equal(analysis.deal.label, "Not enough info");
  assert.match(analysis.deal.reason, /cannot judge this specific deal/);
});

test("combines fixed market statistics with ownership risk deterministically", () => {
  const analysis = {
    deal: { grade: "inspect", label: "Inspection first", reason: "Check it." }
  };
  __test.applyMarketVerdict(analysis, { notes: [] }, {
    status: "ready", sampleSize: 24, sellerType: "dealer",
    deltaAmount: -2500, deltaPercent: -10
  });
  assert.equal(analysis.ownershipDeal.grade, "inspect");
  assert.equal(analysis.deal.grade, "reasonable");
  assert.equal(analysis.deal.label, "Smart buy candidate");
  assert.match(analysis.deal.reason, /24 comparable active dealer listings/);

  __test.applyMarketVerdict(analysis, { notes: [] }, {
    status: "ready", sampleSize: 30, sellerType: "dealer",
    deltaAmount: 5000, deltaPercent: 18
  });
  assert.equal(analysis.deal.grade, "walk");
  assert.equal(analysis.deal.label, "Bad deal");
});

test("summarizes comparable-listing statistics without model-generated numbers", () => {
  const market = __test.summarizeMarketResponse({
    num_found: 17,
    stats: {
      price: { count: 17, median: 25000, percentiles: { "25.0": 23500, "75.0": 26900 } },
      miles: { median: 30000 }
    }
  }, { state: "VA", trim: "Performance" }, { price: 24986, mileage: 28000 }, [18000, 38000]);
  assert.equal(market.status, "ready");
  assert.equal(market.sampleSize, 17);
  assert.equal(market.medianPrice, 25000);
  assert.equal(market.deltaAmount, -14);
  assert.equal(market.scope, "VA statewide");
  assert.equal(market.matchLevel, "trim");
});

test("queries close MarketCheck listings and broadens only when the trim sample is thin", async () => {
  const originalFetch = globalThis.fetch;
  const oldKey = process.env.MARKETCHECK_API_KEY;
  process.env.MARKETCHECK_API_KEY = "market-test-key";
  const urls = [];
  globalThis.fetch = async url => {
    const parsed = new URL(String(url));
    urls.push(parsed);
    const exactTrim = parsed.searchParams.has("trim");
    const count = exactTrim ? 3 : 14;
    return Response.json({ num_found: count, stats: {
      price: { count, median: exactTrim ? 27000 : 25500,
        percentiles: { "25.0": 24000, "75.0": 27000 } },
      miles: { count, median: 30000 }
    } });
  };
  try {
    const market = await __test.getMarketComparison({
      year: 2023, make: "tesla", model: "modely", trim: "Performance AWD/4WD",
      mileage: 28000, price: 24986, location: "Sterling, VA", seller: "dealer"
    });
    assert.equal(market.status, "ready");
    assert.equal(market.sampleSize, 14);
    assert.equal(market.matchLevel, "model");
    assert.equal(urls.length, 2);
    assert.equal(urls[0].searchParams.get("trim"), "Performance");
    assert.equal(urls[0].searchParams.get("state"), "VA");
    assert.equal(urls[0].searchParams.get("model"), "model y");
    assert.equal(urls[0].searchParams.get("api_key"), "market-test-key");
    assert.equal(urls[1].searchParams.has("trim"), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldKey == null) delete process.env.MARKETCHECK_API_KEY;
    else process.env.MARKETCHECK_API_KEY = oldKey;
  }
});

test("blocks private network targets", () => {
  for (const address of ["127.0.0.1", "10.2.3.4", "169.254.169.254", "192.168.1.2", "::1", "fd00::1"]) {
    assert.equal(__test.isPrivateAddress(address), true, address);
  }
  assert.equal(__test.isPrivateAddress("8.8.8.8"), false);
});

test("normalizes model output into text-only checklist fields", () => {
  const analysis = __test.normalizeLiveAnalysis({
    deal: { grade: "walk", label: "Walk away", reason: "Too much risk." },
    vline: "No.",
    vsub: "Federal records are ugly.",
    risks: [
      { s: "crit", lbl: "MAJOR", t: "Engine", c: "$2,000-4,000", cl: "shop estimate",
        b: "It fails.", e: [["s", "OWNERS", "Unverified owner claim."]] },
      { s: "warn", lbl: "WATCH", t: "Brakes", c: "$500-900", cl: "shop estimate",
        b: "Inspect them.", e: [["v", "NHTSA", "A supplied federal fact."]] }
    ],
    chk: [{ lead: "<img src=x onerror=alert(1)> Inspect it.", detail: "<b>Use a lift.</b>" }],
    estimates: { annualInsurance: 1800, annualRepairs: 900 }
  });
  assert.equal(analysis.risks[0].e[0][0], "o");
  assert.equal(analysis.risks[0].e[0][1], "OUR TAKE");
  assert.equal(analysis.chk[0].lead.includes("<"), false);
  assert.equal(analysis.chk[0].detail, "Use a lift.");
});

test("resolves NHTSA pickup variants and deduplicates complaints by ODI number", async () => {
  const originalFetch = globalThis.fetch;
  const requestedModels = [];
  globalThis.fetch = async url => {
    const parsed = new URL(String(url));
    if (parsed.pathname.includes("/products/vehicle/models")) {
      return Response.json({ count: 5, results: [
        { model: "F-150" },
        { model: "F-150 REGULAR CAB" },
        { model: "F150 SUPERCAB" },
        { model: "F-150 LIGHTNING" },
        { model: "F-250 REGULAR CAB" }
      ] });
    }
    if (parsed.pathname.includes("/complaints/complaintsByVehicle")) {
      const model = parsed.searchParams.get("model");
      requestedModels.push(model);
      if (model === "F-150") {
        return Response.json({ count: 1, results: [
          { odiNumber: "1", components: "ENGINE", summary: "Generic record." }
        ] });
      }
      return Response.json({ count: 2, results: [
        { odiNumber: "2", components: "POWER TRAIN", summary: "Shared record." },
        { odiNumber: "3", components: "ELECTRICAL SYSTEM", summary: "Another record." }
      ] });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  try {
    const result = await __test.lookupComplaints({ year: 2020, make: "ford", model: "f150" });
    assert.equal(result.status, "resolved");
    assert.equal(result.count, 3);
    assert.deepEqual(result.resolvedModels, ["F-150", "F-150 REGULAR CAB", "F150 SUPERCAB"]);
    assert.equal(requestedModels.includes("F-150 LIGHTNING"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("returns unresolved instead of a silent zero when the NHTSA model dictionary cannot match", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ count: 1, results: [{ model: "SOMETHING ELSE" }] });
  try {
    const result = await __test.lookupComplaints({ year: 2020, make: "ford", model: "f150" });
    assert.equal(result.status, "unresolved");
    assert.equal(result.count, null);
    assert.deepEqual(result.resolvedModels, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("completes a partial live response from supplied federal facts", () => {
  const analysis = __test.completeLiveAnalysis({
    deal: { grade: "inspect", label: "Inspection first" },
    estimates: { annualInsurance: 1700, annualRepairs: 850 }
  }, {
    nhtsa: {
      complaintTotal: 137,
      recallTotal: 4,
      crashes: 6,
      fires: 1,
      topComponents: [
        { component: "STEERING", count: 31 },
        { component: "ELECTRICAL SYSTEM", count: 22 }
      ],
      recalls: []
    },
    epa: { kind: "liquid", mpg: 33, fuel: "regular" }
  });

  assert.equal(analysis.risks.length, 2);
  assert.equal(analysis.chk.length, 3);
  assert.match(analysis.vsub, /137 complaints/);
  assert.match(analysis.vsub, /4 recall campaigns/);
  assert.equal(analysis.risks[0].e[0][0], "v");
  assert.equal(analysis.estimates.annualRepairs, 850);

  const baseline = __test.completeLiveAnalysis({}, {
    nhtsa: {
      complaintTotal: 137, recallTotal: 4, crashes: 6, fires: 1,
      topComponents: [{ component: "STEERING", count: 31 }], recalls: []
    },
    epa: { kind: "liquid", mpg: 33, fuel: "regular" }
  }, { year: 2021, make: "honda", model: "civic", price: 17500 });
  assert.ok(baseline.estimates.annualInsurance >= 900);
  assert.ok(baseline.estimates.annualRepairs >= 500);
});

test("uses the precomputed evidence page before NHTSA and assesses the actual listing", async () => {
  const originalFetch = globalThis.fetch;
  const old = {
    provider: process.env.PROVIDER,
    key: process.env.DEEPSEEK_API_KEY,
    model: process.env.DEEPSEEK_MODEL,
    marketKey: process.env.MARKETCHECK_API_KEY
  };
  process.env.PROVIDER = "deepseek";
  process.env.DEEPSEEK_API_KEY = "test-key";
  process.env.DEEPSEEK_MODEL = "test-model";
  process.env.MARKETCHECK_API_KEY = "test-market-key";
  let modelCalls = 0;
  let nhtsaCalls = 0;
  let marketCalls = 0;

  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes("api.nhtsa.gov")) {
      nhtsaCalls++;
      throw new Error("precomputed profiles must not call NHTSA");
    }
    if (target.startsWith("https://api.marketcheck.com/")) {
      marketCalls++;
      return Response.json({ num_found: 20, stats: {
        price: { count: 20, median: 9000, percentiles: { "25.0": 8200, "75.0": 9800 } },
        miles: { count: 20, median: 90000 }
      } });
    }
    if (target === "https://api.deepseek.com/chat/completions") {
      modelCalls++;
      const body = JSON.parse(options.body);
      const system = body.messages[0].content;
      const content = system.includes("extract structured data")
        ? JSON.stringify({ year: 2019, make: "nissan", model: "altima", trim: "S",
          mileage: 91000, price: 7900, location: "Ohio", seller: "private", notes: ["as is"] })
        : JSON.stringify({ deal: { grade: "caution", label: "Cheap for a reason",
          reason: "The price does not erase the reviewed repair exposure." },
          vline: "The discount is repair money.",
          vsub: "At 91,000 miles, the reviewed risks matter more than the sticker." });
      return Response.json({ choices: [{ message: { content } }] });
    }
    throw new Error(`unexpected fetch ${target}`);
  };

  try {
    const request = new Request("https://kicktires.test/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "2019 Nissan Altima S, 91,000 miles, $7,900, sold as is" })
    });
    const response = await handler(request);
    const output = await response.json();
    assert.equal(response.status, 200);
    assert.equal(output.facts.source, "federal_snapshot");
    assert.equal(output.profile, "/cars/2019-nissan-altima-problems/");
    assert.equal(output.car.price, 7900);
    assert.equal(output.analysis.deal.grade, "caution");
    assert.equal(output.analysis.ownershipDeal.grade, "caution");
    assert.equal(output.market.status, "ready");
    assert.equal(output.market.medianPrice, 9000);
    assert.equal(output.tco.mpg, 30);
    // One call, not two: the deterministic parser now reads "2019 Nissan Altima" itself,
    // so only the reviewed-profile assessment reaches the model.
    assert.equal(modelCalls, 1);
    assert.equal(marketCalls, 1);
    assert.equal(nhtsaCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (old.provider == null) delete process.env.PROVIDER; else process.env.PROVIDER = old.provider;
    if (old.key == null) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = old.key;
    if (old.model == null) delete process.env.DEEPSEEK_MODEL; else process.env.DEEPSEEK_MODEL = old.model;
    if (old.marketKey == null) delete process.env.MARKETCHECK_API_KEY; else process.env.MARKETCHECK_API_KEY = old.marketKey;
  }
});

test("returns precomputed evidence when the model provider is slow or unavailable", async () => {
  const originalFetch = globalThis.fetch;
  const old = { provider: process.env.PROVIDER, key: process.env.DEEPSEEK_API_KEY,
    marketKey: process.env.MARKETCHECK_API_KEY };
  process.env.PROVIDER = "deepseek";
  process.env.DEEPSEEK_API_KEY = "test-key";
  delete process.env.MARKETCHECK_API_KEY;
  let modelCalls = 0;
  globalThis.fetch = async url => {
    if (String(url) === "https://api.deepseek.com/chat/completions") {
      modelCalls++;
      return new Response("provider unavailable", { status: 503 });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  try {
    const request = new Request("https://kicktires.test/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Used 2019 Honda CR-V EX, 70,000 miles, $15,000" })
    });
    const response = await handler(request);
    const output = await response.json();
    assert.equal(response.status, 200);
    assert.equal(output.facts.source, "federal_snapshot");
    assert.equal(output.profile, "/cars/2019-honda-cr-v-problems/");
    assert.equal(output.analysis.deal.label, "Risk check only");
    assert.ok(output.analysis.risks.length >= 2);
    assert.equal(modelCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (old.provider == null) delete process.env.PROVIDER; else process.env.PROVIDER = old.provider;
    if (old.key == null) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = old.key;
    if (old.marketKey == null) delete process.env.MARKETCHECK_API_KEY; else process.env.MARKETCHECK_API_KEY = old.marketKey;
  }
});

test("retrieves NHTSA and EPA evidence for an unreviewed model", async () => {
  const originalFetch = globalThis.fetch;
  const old = { provider: process.env.PROVIDER, key: process.env.DEEPSEEK_API_KEY,
    marketKey: process.env.MARKETCHECK_API_KEY };
  process.env.PROVIDER = "deepseek";
  process.env.DEEPSEEK_API_KEY = "test-key";
  delete process.env.MARKETCHECK_API_KEY;
  let modelCalls = 0;

  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target === "https://api.deepseek.com/chat/completions") {
      modelCalls++;
      const body = JSON.parse(options.body);
      const system = body.messages[0].content;
      const content = system.includes("extract structured data")
        ? JSON.stringify({ year: 2023, make: "testmake", model: "testmodel", trim: "Base",
          mileage: 25000, price: 18000, seller: "dealer", notes: [] })
        : JSON.stringify({
          deal: { grade: "inspect", label: "Inspection first", reason: "The records justify a closer look." },
          vline: "The price is only the first bill.",
          vsub: "Two complaints mention the engine, and one recall campaign applies.",
          risks: [
            { s: "ser", lbl: "COMMON", t: "Engine", c: "$1,000-2,000", cl: "shop estimate",
              b: "The supplied reports mention engine trouble.", e: [["v", "NHTSA", "Two supplied complaints mention the engine."]] },
            { s: "warn", lbl: "WATCH", t: "Electrical", c: "$300-900", cl: "shop estimate",
              b: "One supplied report mentions the electrical system.", e: [["s", "OWNERS", "Do not trust this tag."]] }
          ],
          chk: [{ lead: "Scan every module.", detail: "Stored codes can reveal intermittent faults." }],
          estimates: { annualInsurance: 1500, annualRepairs: 800 }
        });
      return Response.json({ choices: [{ message: { content } }] });
    }
    if (target.includes("products/vehicle/models")) {
      return Response.json({ count: 1, results: [{ model: "TESTMODEL" }] });
    }
    if (target.includes("complaintsByVehicle")) {
      return Response.json({ count: 2, results: [
        { components: "ENGINE", crash: false, fire: false, summary: "Engine stopped." },
        { components: "ELECTRICAL SYSTEM,ENGINE", crash: true, fire: false, summary: "Electrical fault and stall." }
      ] });
    }
    if (target.includes("recallsByVehicle")) {
      return Response.json({ Count: 1, results: [
        { NHTSACampaignNumber: "23V000001", Component: "ENGINE", Consequence: "The engine may stall." }
      ] });
    }
    if (target.includes("/menu/model")) {
      return Response.json({ menuItem: { text: "Testmodel", value: "Testmodel" } });
    }
    if (target.includes("/menu/options")) {
      return Response.json({ menuItem: { text: "Automatic", value: "123" } });
    }
    if (target.endsWith("/vehicle/123")) {
      return Response.json({ comb08: "31", combE: "0", fuelType1: "Regular Gasoline" });
    }
    throw new Error(`unexpected fetch ${target}`);
  };

  try {
    const request = new Request("https://kicktires.test/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "2023 Testmake Testmodel Base, 25,000 miles, $18,000" })
    });
    const response = await handler(request);
    const output = await response.json();
    assert.equal(response.status, 200);
    assert.equal(output.facts.source, "live_nhtsa");
    assert.equal(output.facts.complaintTotal, 2);
    assert.equal(output.facts.recallTotal, 1);
    assert.equal(output.facts.crashes, 1);
    assert.equal(output.tco.mpg, 31);
    assert.equal(output.analysis.risks[1].e[0][0], "o");
    assert.equal(output.market.status, "not_configured");
    assert.equal(output.analysis.deal.label, "Risk check only");
    assert.equal(modelCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (old.provider == null) delete process.env.PROVIDER; else process.env.PROVIDER = old.provider;
    if (old.key == null) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = old.key;
    if (old.marketKey == null) delete process.env.MARKETCHECK_API_KEY; else process.env.MARKETCHECK_API_KEY = old.marketKey;
  }
});

// The site's concept is "paste a listing, get an OpenAI-backed analysis", but the function
// only ever spoke DeepSeek and Anthropic. PROVIDER=openai fell through the key guard and
// then threw unknown_provider from inside callModel, which the handler reported as
// "extract_failed" — so every check failed and the real cause stayed invisible.
test("analyzes a listing through the OpenAI provider", async () => {
  const originalFetch = globalThis.fetch;
  const old = {
    provider: process.env.PROVIDER, openaiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_MODEL, deepseekKey: process.env.DEEPSEEK_API_KEY,
    anthropicKey: process.env.ANTHROPIC_API_KEY, marketKey: process.env.MARKETCHECK_API_KEY
  };
  // No PROVIDER set: only a key. The provider must be inferred from it.
  delete process.env.PROVIDER;
  delete process.env.OPENAI_MODEL;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.MARKETCHECK_API_KEY;
  process.env.OPENAI_API_KEY = "sk-test-key";

  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target !== "https://api.openai.com/v1/chat/completions") {
      throw new Error(`unexpected fetch ${target}`);
    }
    const body = JSON.parse(options.body);
    requests.push({ authorization: options.headers.Authorization, body });
    const content = body.messages[0].content.includes("extract structured data")
      ? JSON.stringify({ year: 2019, make: "nissan", model: "altima", trim: "S",
        mileage: 91000, price: 7900, location: "Ohio", seller: "private" })
      : JSON.stringify({ deal: { grade: "caution", label: "Cheap for a reason",
        reason: "The price does not erase the reviewed repair exposure." },
        vline: "The discount is repair money.",
        vsub: "At 91,000 miles the reviewed risks outweigh the sticker." });
    return Response.json({ choices: [{ message: { content } }] });
  };

  const check = text => handler(new Request("https://kicktires.test/api/analyze", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  }));

  try {
    const output = await (await check("2019 Nissan Altima S, 91,000 miles, $7,900, sold as is")).json();
    assert.equal(output.error, undefined);
    assert.equal(output.car.make, "nissan");
    assert.equal(output.profile, "/cars/2019-nissan-altima-problems/");
    assert.equal(output.analysis.vline, "The discount is repair money.");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].authorization, "Bearer sk-test-key");
    assert.equal(requests[0].body.model, "gpt-4o-mini");
    assert.equal(requests[0].body.response_format.type, "json_object");

    // The reasoning families reject `temperature` and renamed the token cap; sending the
    // older shape would 400 every request.
    process.env.OPENAI_MODEL = "gpt-5-mini";
    requests.length = 0;
    await (await check("2019 Nissan Altima S, 88,500 miles, $8,250, sold as is")).json();
    assert.equal(requests[0].body.model, "gpt-5-mini");
    assert.equal(requests[0].body.max_completion_tokens > 0, true);
    assert.equal("max_tokens" in requests[0].body, false);
    assert.equal("temperature" in requests[0].body, false);

    // Misconfiguration must fail before any listing work, naming the actual cause.
    process.env.PROVIDER = "gpt";
    const unknown = await check("2019 Nissan Altima S, 91,000 miles, $7,900");
    assert.equal(unknown.status, 500);
    assert.deepEqual(await unknown.json(), { error: "unknown_provider", provider: "gpt" });

    process.env.PROVIDER = "openai";
    delete process.env.OPENAI_API_KEY;
    const keyless = await check("2019 Nissan Altima S, 91,000 miles, $7,900");
    assert.equal(keyless.status, 500);
    assert.deepEqual(await keyless.json(), { error: "missing_key", provider: "openai" });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of [["PROVIDER", old.provider], ["OPENAI_API_KEY", old.openaiKey],
      ["OPENAI_MODEL", old.openaiModel], ["DEEPSEEK_API_KEY", old.deepseekKey],
      ["ANTHROPIC_API_KEY", old.anthropicKey], ["MARKETCHECK_API_KEY", old.marketKey]]) {
      if (value == null) delete process.env[name]; else process.env[name] = value;
    }
  }
});

// Declaring a `path` in the function config stops Netlify serving the default
// /.netlify/functions/analyze endpoint, and netlify.toml force-rewrites /api/analyze to
// exactly that endpoint. With both in place the function bundled cleanly but was
// unreachable at every address, and every check 404'd.
test("the function keeps the default endpoint that netlify.toml rewrites to", async () => {
  const source = await readFile(new URL("../netlify/functions/analyze.mjs", import.meta.url), "utf8");
  const configBlock = source.slice(source.indexOf("export const config"));
  assert.equal(/^\s*path:/m.test(configBlock), false,
    "analyze.mjs declares a custom path; that unregisters /.netlify/functions/analyze, "
    + "which netlify.toml force-rewrites /api/analyze to — both addresses would 404");

  const toml = await readFile(new URL("../netlify.toml", import.meta.url), "utf8");
  assert.match(toml, /from = "\/api\/analyze"\s*\n\s*to = "\/\.netlify\/functions\/analyze"/,
    "netlify.toml no longer maps /api/analyze to the function");
});

// The same listing against the same fixed evidence came back "Walk away" on one call and
// "Price needs explaining" on the next: applyMarketVerdict lets the model's ownership grade
// short-circuit every market branch, so one sampled token flipped the headline verdict.
test("grades a listing deterministically across repeated checks", async () => {
  const originalFetch = globalThis.fetch;
  const old = {
    provider: process.env.PROVIDER, openaiKey: process.env.OPENAI_API_KEY,
    deepseekKey: process.env.DEEPSEEK_API_KEY, marketKey: process.env.MARKETCHECK_API_KEY
  };
  process.env.PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "sk-test-key";
  delete process.env.DEEPSEEK_API_KEY;
  process.env.MARKETCHECK_API_KEY = "market-test-key";

  const grading = [];
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target === "https://api.openai.com/v1/chat/completions") {
      const body = JSON.parse(options.body);
      grading.push({ temperature: body.temperature, seed: body.seed });
      return Response.json({ choices: [{ message: { content: JSON.stringify({
        deal: { grade: "caution", label: "Cheap for a reason", reason: "r" },
        vline: "v", vsub: "s" }) } }] });
    }
    if (target.startsWith("https://api.marketcheck.com/")) {
      return Response.json({ num_found: 133, stats: {
        price: { count: 133, median: 13776, percentiles: { "25.0": 11994, "75.0": 14995 } },
        miles: { count: 133, median: 91000 } } });
    }
    throw new Error(`unexpected fetch ${target}`);
  };

  const check = text => handler(new Request("https://kicktires.test/api/analyze", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }) }));

  try {
    const listing = "2019 Nissan Altima S, 91,000 miles, $7,900, sold as is";
    const verdicts = [];
    for (let run = 0; run < 3; run++) verdicts.push((await (await check(listing)).json()).analysis.deal);

    assert.equal(new Set(verdicts.map(v => `${v.grade}|${v.label}`)).size, 1,
      `verdict drifted across identical checks: ${JSON.stringify(verdicts)}`);
    assert.equal(grading.every(call => call.temperature === 0), true,
      "a grading call still samples at a non-zero temperature");
    assert.equal(new Set(grading.map(call => call.seed)).size, 1,
      "the same listing did not reuse one seed");

    // A shared seed across every car would be a different bug: the seed must follow the listing.
    const before = grading.length;
    await check("2019 Nissan Altima S, 60,000 miles, $11,200");
    assert.notEqual(grading.at(-1).seed, grading[before - 1].seed,
      "a different listing reused the previous listing's seed");
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of [["PROVIDER", old.provider], ["OPENAI_API_KEY", old.openaiKey],
      ["DEEPSEEK_API_KEY", old.deepseekKey], ["MARKETCHECK_API_KEY", old.marketKey]]) {
      if (value == null) delete process.env[name]; else process.env[name] = value;
    }
  }
});
