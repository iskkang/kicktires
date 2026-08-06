import assert from "node:assert/strict";
import test from "node:test";

import handler, { __test } from "../netlify/functions/analyze.mjs";

test("matches reviewed profiles and rejects incomplete vehicle identities", () => {
  const car = __test.normalizeCar({
    year: 2019, make: "NISSAN", model: "Altima", mileage: "88000", price: "8999"
  });
  assert.equal(car.model, "altima");
  assert.equal(car.mileage, 88000);
  assert.equal(__test.findProfile(car)?.meta.slug, "2019-nissan-altima-problems");
  assert.equal(__test.normalizeCar({ year: 1700, make: "Honda" }).year, null);
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

test("uses the reviewed database before NHTSA and assesses the actual listing", async () => {
  const originalFetch = globalThis.fetch;
  const old = {
    provider: process.env.PROVIDER,
    key: process.env.DEEPSEEK_API_KEY,
    model: process.env.DEEPSEEK_MODEL
  };
  process.env.PROVIDER = "deepseek";
  process.env.DEEPSEEK_API_KEY = "test-key";
  process.env.DEEPSEEK_MODEL = "test-model";
  let modelCalls = 0;
  let nhtsaCalls = 0;

  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes("api.nhtsa.gov")) {
      nhtsaCalls++;
      throw new Error("reviewed profiles must not call NHTSA");
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
    assert.equal(output.facts.source, "reviewed_db");
    assert.equal(output.profile, "/cars/2019-nissan-altima-problems/");
    assert.equal(output.car.price, 7900);
    assert.equal(output.analysis.deal.grade, "caution");
    assert.equal(output.tco.mpg, 30);
    assert.equal(modelCalls, 2);
    assert.equal(nhtsaCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (old.provider == null) delete process.env.PROVIDER; else process.env.PROVIDER = old.provider;
    if (old.key == null) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = old.key;
    if (old.model == null) delete process.env.DEEPSEEK_MODEL; else process.env.DEEPSEEK_MODEL = old.model;
  }
});

test("retrieves NHTSA and EPA evidence for an unreviewed model", async () => {
  const originalFetch = globalThis.fetch;
  const old = { provider: process.env.PROVIDER, key: process.env.DEEPSEEK_API_KEY };
  process.env.PROVIDER = "deepseek";
  process.env.DEEPSEEK_API_KEY = "test-key";
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
    assert.equal(modelCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (old.provider == null) delete process.env.PROVIDER; else process.env.PROVIDER = old.provider;
    if (old.key == null) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = old.key;
  }
});
