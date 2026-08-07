import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { __test } from "../netlify/functions/analyze.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET_FILE = path.join(ROOT, "models.json");
const OUTPUT_FILE = path.join(ROOT, "generated.json");
const targets = JSON.parse(fs.readFileSync(TARGET_FILE, "utf8"));
const editorial = JSON.parse(fs.readFileSync(path.join(ROOT, "data.json"), "utf8"));
const previous = fs.existsSync(OUTPUT_FILE)
  ? JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8")) : {};
const TODAY = new Date().toISOString().slice(0, 10);
const DRY_RUN = process.argv.includes("--dry-run");

const MODEL_COSTS = {
  "toyota-camry": { ins: 1650, repair: 650 },
  "toyota-corolla": { ins: 1600, repair: 550 },
  "toyota-rav4": { ins: 1600, repair: 650 },
  "honda-civic": { ins: 1700, repair: 600 },
  "honda-accord": { ins: 1700, repair: 650 },
  "honda-cr-v": { ins: 1650, repair: 700 },
  "nissan-altima": { ins: 1800, repair: 900 },
  "nissan-rogue": { ins: 1750, repair: 1000 },
  "ford-f-150": { ins: 1800, repair: 1100 },
  "jeep-grand-cherokee": { ins: 1950, repair: 1400 }
};

const GUIDANCE = [
  [/ENGINE|HYBRID PROPULSION/, "Engine and cooling", "crit", "MAJOR", "$900–8,000",
    "diagnosis decides the bill", "Cold-start it and scan every module.",
    "Misfires, cooling faults and stored powertrain codes can turn a short test drive into an engine-size bill."],
  [/POWER TRAIN/, "Powertrain", "crit", "MAJOR", "$1,200–6,500",
    "shop estimate", "Drive every gear while cold and warm.",
    "Shift flare, delayed engagement and driveline vibration often disappear on a seller's short test loop."],
  [/SERVICE BRAKES/, "Brakes", "crit", "MAJOR", "$250–2,800",
    "fault and parts vary", "Test the brakes at low and highway speed.",
    "Pedal feel, warning lights and straight-line stopping matter more than a clean-looking rotor."],
  [/STEERING/, "Steering", "crit", "MAJOR", "$350–3,200",
    "fault and parts vary", "Test steering on a real highway.",
    "Binding, wandering and poor self-centering can stay hidden in a parking-lot drive."],
  [/FUEL SYSTEM|FUEL\/PROPULSION/, "Fuel system", "crit", "MAJOR", "$300–2,500",
    "recall may cover it", "Check cold starts, fuel pressure and recall status.",
    "Stalling, hard starts and fuel odor need diagnosis before money changes hands."],
  [/AIR BAGS|SEAT BELTS/, "Occupant protection", "crit", "MAJOR", "$0–2,500",
    "recall may cover it", "Run the VIN and inspect every restraint warning.",
    "A campaign can be free to remedy, but only a VIN check shows whether this vehicle is still open."],
  [/SUSPENSION|WHEELS|TIRES/, "Chassis and tires", "ser", "COMMON", "$400–3,000",
    "condition decides cost", "Put it on a lift and inspect tire wear.",
    "Uneven wear, looseness and impact damage are easier to see underneath than from the driver's seat."],
  [/ELECTRICAL SYSTEM/, "Electrical system", "ser", "COMMON", "$150–2,500",
    "diagnosis first", "Scan every module and operate every switch.",
    "Intermittent electrical faults can clear their warning lights while leaving stored codes behind."],
  [/FORWARD COLLISION|LANE DEPARTURE|VEHICLE SPEED CONTROL|STABILITY/, "Driver-assistance systems", "ser", "COMMON", "$200–2,800",
    "calibration may be needed", "Test every driver-assistance feature.",
    "Camera, radar and calibration faults are easy to miss if the test drive never activates the system."],
  [/STRUCTURE|LATCHES/, "Body and closures", "ser", "COMMON", "$150–3,500",
    "damage changes the bill", "Inspect every latch, hinge and body seam.",
    "Water entry, alignment and prior repair work can turn a body complaint into a recurring problem."],
  [/VISIBILITY|BACK OVER PREVENTION|EXTERIOR LIGHTING/, "Visibility systems", "warn", "WATCH", "$100–1,800",
    "parts and calibration vary", "Test cameras, lights, glass and wipers.",
    "A feature that works once in the driveway still needs to work after startup and while moving."],
  [/EQUIPMENT|SEATS/, "Cabin equipment", "warn", "WATCH", "$100–1,800",
    "fault and trim vary", "Operate every powered cabin feature.",
    "Small failures are still bills, and the seller already knows which buttons do nothing."],
  [/.*/, "Other reported systems", "warn", "WATCH", "Get a shop quote",
    "fault must be identified", "Ask a shop to reproduce the reported symptom.",
    "A broad federal category is a reason to inspect, not enough information to price a repair." ]
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const slugPart = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");
const keyFor = ({ year, make, model }) => `${year}-${slugPart(make)}-${slugPart(model)}`;
const slugFor = target => `${keyFor(target)}-problems`;
const clip = (value, max) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
const friendly = value => String(value || "").toLowerCase().replace(/(^|[\s/,-])\w/g,
  letter => letter.toUpperCase());
const cleanExample = value => {
  const source = String(value || "").replace(/\s+/g, " ").trim()
    .replace(/\b[A-HJ-NPR-Z0-9]{17}\b/gi, "[VIN redacted]")
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Z]{2,}\b/gi, "[email redacted]")
    .replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, "[phone redacted]");
  if (source.length <= 260) return source;
  return source.slice(0, 257).replace(/\s+\S*$/, "").replace(/[.,;:!?-]+$/, "") + "…";
};
const vehicleIdentity = value => `${value.year ?? value.meta?.y}|${value.make ?? value.meta?.mk}|${value.model ?? value.meta?.md}`
  .toLowerCase().replace(/[^a-z0-9|]/g, "");
const editorialSlugs = new Map(Object.values(editorial)
  .map(profile => [vehicleIdentity(profile), profile.meta.slug]));

function guidanceFor(component) {
  const match = GUIDANCE.find(([pattern]) => pattern.test(component));
  return { label: match[1], severity: match[2], badge: match[3], cost: match[4],
    qualifier: match[5], lead: match[6], detail: match[7] };
}

function uniqueHighSignalComponents(facts) {
  const rows = facts.topComponents.map(item => ({ ...item, guide: guidanceFor(item.component) }));
  const useful = rows.filter(item => item.component !== "UNKNOWN OR OTHER");
  const pool = useful.length >= 3 ? useful : rows;
  const weight = { crit: 3, ser: 2, warn: 1 };
  return pool.slice(0, 7).sort((a, b) => weight[b.guide.severity] - weight[a.guide.severity]
    || b.count - a.count).slice(0, 3);
}

function buildProfile(target, facts, epa, oldProfile) {
  const federal = {
    source: "NHTSA",
    retrievedAt: facts.retrievedAt,
    complaintTotal: facts.complaintTotal,
    recallTotal: facts.recallTotal,
    crashes: facts.crashes,
    fires: facts.fires,
    topComponents: facts.topComponents.map(item => ({
      component: item.component,
      count: item.count,
      examples: item.examples.map(cleanExample).filter(Boolean)
    })),
    recalls: facts.recalls
  };
  const signal = uniqueHighSignalComponents(federal);
  const top = federal.topComponents.slice(0, 3);
  const topText = top.length
    ? top.map(item => `${friendly(item.component)} (${item.count.toLocaleString("en-US")})`).join(", ")
    : "no complaint component pattern";
  const risks = signal.map(item => ({
    s: item.guide.severity,
    lbl: item.guide.badge,
    t: `${item.guide.label} complaint pattern`,
    c: item.guide.cost,
    cl: item.guide.qualifier,
    b: `${item.count.toLocaleString("en-US")} NHTSA complaint records for this model year carry the ${item.component} tag. `
      + "That is a screening signal, not proof that every vehicle has the same fault.",
    e: [
      ["v", "NHTSA", `${item.count.toLocaleString("en-US")} supplied complaint records are tagged ${item.component}.`],
      ["o", "OUR TAKE", item.guide.detail]
    ]
  }));
  if (!risks.length && federal.recallTotal) {
    risks.push({
      s: "warn", lbl: "WATCH", t: "Recall campaign status", c: "$0 if covered",
      cl: "VIN decides coverage",
      b: `NHTSA returned ${federal.recallTotal.toLocaleString("en-US")} recall campaigns for this model year. `
        + "The VIN decides which campaigns apply and whether the remedy is complete.",
      e: [["v", "NHTSA", `${federal.recallTotal.toLocaleString("en-US")} supplied recall campaigns cover this model year.`],
        ["o", "OUR TAKE", "Do not accept a seller's word for recall status. Run the VIN yourself."]]
    });
  }
  const checklist = signal.map(item => `<b>${item.guide.lead}</b> ${item.guide.detail}`);
  checklist.push("<b>Run the VIN through NHTSA.</b> Model-year campaigns do not prove this exact vehicle still has an open recall.");

  const modelKey = `${slugPart(target.make)}-${slugPart(target.model)}`;
  const costs = MODEL_COSTS[modelKey];
  const tco = epa?.kind === "liquid" && costs ? {
    ins: costs.ins,
    repair: costs.repair,
    mpg: epa.mpg,
    fuel: epa.fuel,
    source: "EPA efficiency + KickTires cost estimates"
  } : null;
  const factsFingerprint = createHash("sha256").update(JSON.stringify({
    complaintTotal: federal.complaintTotal, recallTotal: federal.recallTotal,
    crashes: federal.crashes, fires: federal.fires,
    topComponents: federal.topComponents, recalls: federal.recalls, epa
  })).digest("hex");
  const oldFingerprint = oldProfile?.quality?.factsFingerprint;
  const published = oldProfile?.meta?.published || TODAY;
  const updated = oldFingerprint === factsFingerprint ? oldProfile.meta.updated : TODAY;
  const title = `${target.year} ${target.make} ${target.model} Problems: NHTSA Complaints and Recalls`;
  const desc = clip(`NHTSA lists ${federal.complaintTotal.toLocaleString("en-US")} consumer complaints and ${federal.recallTotal.toLocaleString("en-US")} recall campaigns for the ${target.year} ${target.make} ${target.model}. See the leading problem categories and what to inspect.`, 158);

  return {
    real: true,
    generated: true,
    name: `${target.year} ${target.make} ${target.model} federal record`,
    specs: [
      `${federal.complaintTotal.toLocaleString("en-US")} NHTSA complaints`,
      `${federal.recallTotal.toLocaleString("en-US")} recall campaigns`,
      top[0] ? `${friendly(top[0].component)} leads at ${top[0].count.toLocaleString("en-US")}` : "Recall records only"
    ],
    vline: top[0]
      ? `${friendly(top[0].component)} leads this model year's federal record.`
      : `${federal.recallTotal.toLocaleString("en-US")} campaigns. The VIN decides what still applies.`,
    vsub: `NHTSA returned ${federal.complaintTotal.toLocaleString("en-US")} consumer complaints for the ${target.year} ${target.make} ${target.model}. `
      + `The leading component tags are ${topText}. It also returned ${federal.recallTotal.toLocaleString("en-US")} recall campaigns. `
      + "Complaints are owner allegations, not confirmed defects or failure rates.",
    ...(tco ? { tco } : {}),
    risks,
    chk: checklist.slice(0, 4),
    federal,
    epa,
    quality: {
      method: "deterministic-federal-snapshot-v1",
      factsFingerprint,
      componentCount: federal.topComponents.length,
      recallRows: federal.recalls.length
    },
    meta: {
      slug: editorialSlugs.get(vehicleIdentity(target)) || slugFor(target),
      y: target.year,
      mk: target.make,
      md: target.model,
      q: `${target.year} ${target.make} ${target.model} problems`,
      title,
      desc,
      nhtsa: federal.complaintTotal,
      recalls: federal.recallTotal,
      crashes: federal.crashes,
      fires: federal.fires,
      retrievedAt: facts.retrievedAt,
      published,
      updated,
      priority: target.priority
    }
  };
}

function validateProfile(profile) {
  const errors = [];
  const { federal, meta } = profile;
  if (!Number.isInteger(meta.nhtsa) || meta.nhtsa < 0) errors.push("invalid complaint total");
  if (!Number.isInteger(meta.recalls) || meta.recalls < 0) errors.push("invalid recall total");
  if (meta.nhtsa === 0 && meta.recalls === 0) errors.push("no federal records");
  if (meta.nhtsa !== federal.complaintTotal) errors.push("complaint total mismatch");
  if (meta.recalls !== federal.recallTotal) errors.push("recall total mismatch");
  if (meta.nhtsa > 0 && federal.topComponents.length < 2) errors.push("fewer than two component groups");
  for (const item of federal.topComponents) {
    if (!Number.isInteger(item.count) || item.count < 0 || item.count > meta.nhtsa) {
      errors.push(`bad component count: ${item.component}`);
    }
  }
  if (profile.risks.some(risk => risk.e.some(row => row[0] === "s"))) {
    errors.push("generated page contains owner-forum evidence");
  }
  if (new Set([meta.slug, meta.title, meta.desc, meta.q]).size !== 4) {
    errors.push("metadata fields collide");
  }
  return errors;
}

const expanded = targets.models.flatMap(model => model.years.map(year => ({ ...model, year })))
  .sort((a, b) => a.priority - b.priority || a.year - b.year);
if (expanded.length !== 40) throw new Error(`phase 1 must contain 40 targets, found ${expanded.length}`);

const output = {};
const rejected = [];
for (let index = 0; index < expanded.length; index++) {
  const target = expanded[index];
  const key = keyFor(target);
  process.stdout.write(`[${index + 1}/${expanded.length}] ${target.year} ${target.make} ${target.model} ... `);
  try {
    const car = __test.normalizeCar({
      year: target.year,
      make: target.make.toLowerCase(),
      model: target.model.toLowerCase().replace(/[^a-z0-9]/g, "")
    });
    const [facts, epa] = await Promise.all([
      __test.getNhtsaFacts(car),
      __test.getEpaFacts(car).catch(() => null)
    ]);
    const profile = buildProfile(target, facts, epa, previous[key]);
    const errors = validateProfile(profile);
    if (errors.length) {
      rejected.push({ target, errors });
      console.log(`REJECTED: ${errors.join("; ")}`);
    } else {
      output[key] = profile;
      console.log(`${profile.meta.nhtsa} complaints, ${profile.meta.recalls} recalls`);
    }
  } catch (error) {
    rejected.push({ target, errors: [error.message] });
    console.log(`REJECTED: ${error.message}`);
  }
  await sleep(250);
}

if (rejected.length) {
  console.error(`\n${rejected.length} target(s) failed the publication gate.`);
  for (const item of rejected) {
    console.error(`- ${item.target.year} ${item.target.make} ${item.target.model}: ${item.errors.join("; ")}`);
  }
  process.exitCode = 1;
} else if (!DRY_RUN) {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2) + "\n");
  console.log(`\nWrote ${Object.keys(output).length} federal evidence pages to ${path.relative(ROOT, OUTPUT_FILE)}.`);
} else {
  console.log(`\nDry run passed for ${Object.keys(output).length} federal evidence pages.`);
}
