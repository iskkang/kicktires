// Collects the federal record for one model year and normalises it into an evidence object
// with a stable id per source. Every number a post is allowed to state has to come from here,
// which is what lets the reviewer recompute them instead of trusting the writer.
//
// The three kinds are kept apart deliberately. An official recall campaign, a complaint a
// consumer filed, and a figure KickTires calculated are different claims, and a post that
// blurs them is the failure mode this whole pipeline exists to prevent.

import fs from "node:fs";
import path from "node:path";
import { EVIDENCE_DIR, hash } from "./schema.mjs";

const UA = "KickTires/1.0 (used-car research; https://kicktires.netlify.app/about/)";
const NHTSA = "https://api.nhtsa.gov";

// Same grouping the analyzer uses: NHTSA's `components` field puts commas both inside a
// component name and between components, so splitting on every comma invents categories.
const COMPONENT_GROUPS = [
  ["AIR BAGS", /AIR BAGS/], ["BACK OVER PREVENTION", /BACK OVER PREVENTION/],
  ["ELECTRICAL SYSTEM", /ELECTRICAL SYSTEM/], ["ENGINE", /ENGINE/],
  ["ELECTRONIC STABILITY CONTROL", /ELECTRONIC STABILITY CONTROL/],
  ["EQUIPMENT", /EQUIPMENT/], ["EXTERIOR LIGHTING", /EXTERIOR LIGHTING/],
  ["FORWARD COLLISION AVOIDANCE", /FORWARD COLLISION AVOIDANCE/],
  ["FUEL SYSTEM, GASOLINE", /FUEL SYSTEM, GASOLINE/],
  ["FUEL/PROPULSION SYSTEM", /FUEL\/PROPULSION SYSTEM/],
  ["HYBRID PROPULSION SYSTEM", /HYBRID PROPULSION SYSTEM/],
  ["LANE DEPARTURE", /LANE DEPARTURE/], ["LATCHES/LOCKS/LINKAGES", /LATCHES\/LOCKS\/LINKAGES/],
  ["POWER TRAIN", /POWER TRAIN/], ["SEAT BELTS", /SEAT BELTS/], ["SEATS", /(?:^|,)SEATS(?:,|$)/],
  ["SERVICE BRAKES", /SERVICE BRAKES/], ["STEERING", /STEERING/], ["STRUCTURE", /STRUCTURE/],
  ["SUSPENSION", /SUSPENSION/], ["TIRES", /TIRES/],
  ["VEHICLE SPEED CONTROL", /VEHICLE SPEED CONTROL/],
  ["VISIBILITY/WIPER", /VISIBILITY\/WIPER/], ["VISIBILITY", /(?:^|,)VISIBILITY(?:,|$)/],
  ["WHEELS", /WHEELS/], ["UNKNOWN OR OTHER", /UNKNOWN OR OTHER/]
];

const norm = value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const clip = (value, max) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);

// Deliberately narrow, mirroring the analyzer: a worded suffix marks a separately sold
// vehicle ("F-150 LIGHTNING", "ROGUE SPORT"), not a trim of the base model.
const BODY_VARIANTS = new Set(["regularcab", "supercab", "crewcab", "supercrew",
  "regularcabdiesel", "supercabdiesel", "crewcabdiesel", "supercrewdiesel"]);

export function resolveCatalogModels(requested, catalogRows) {
  const base = norm(requested);
  if (!base) return [];
  const names = catalogRows.map(row => clip(row?.model, 120)).filter(Boolean);
  const exact = names.filter(name => {
    const token = norm(name);
    if (!token.startsWith(base)) return false;
    const suffix = token.slice(base.length);
    return !suffix || BODY_VARIANTS.has(suffix);
  });
  if (exact.length) return [...new Set(exact)];
  // NHTSA files some lines only under engine designations: "RX 350" with no bare "RX".
  const line = names.filter(name => {
    const token = norm(name);
    return token !== base && token.startsWith(base) && /^\d{2,4}[a-z]?$/.test(token.slice(base.length));
  });
  if (line.length) return [...new Set(line)];
  // ...and some by series or class: "3 SERIES" for a 320i, "C-CLASS" for a C 300. The derived
  // name has to be in the catalog to be used, so nothing is invented for a make whose naming
  // does not work this way.
  const derived = [];
  const series = base.match(/^(\d)\d{2}[a-z]{0,2}$/);
  if (series) derived.push(`${series[1]}series`);
  const klass = base.match(/^([a-z]{1,3})\d{2,3}[a-z]?$/);
  if (klass) derived.push(`${klass[1]}class`);
  for (const target of derived) {
    const hit = names.filter(name => norm(name) === target);
    if (hit.length) return [...new Set(hit)];
  }
  return [];
}

async function getJson(url, { attempts = 3, timeoutMs = 12_000, fetchImpl = fetch } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetchImpl(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs)
      });
      // 4xx other than 429 will not fix itself; retrying only burns the run's budget.
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`${response.status} ${url}`);
      } else if (!response.ok) {
        throw new Error(`${response.status} ${url}`);
      } else {
        return await response.json();
      }
    } catch (error) {
      lastError = error;
      if (error?.name === "AbortError" || error?.name === "TimeoutError") lastError = new Error(`timeout ${url}`);
    }
    if (attempt < attempts - 1) await new Promise(done => setTimeout(done, 500 * (2 ** attempt)));
  }
  throw lastError || new Error(`failed ${url}`);
}

function groupComponents(rows) {
  const totals = new Map();
  for (const row of rows) {
    const raw = String(row?.components || "UNKNOWN OR OTHER").toUpperCase();
    const matched = COMPONENT_GROUPS.filter(([, pattern]) => pattern.test(raw)).map(([name]) => name);
    for (const name of new Set(matched.length ? matched : [clip(raw, 120)])) {
      const bucket = totals.get(name) || { component: name, count: 0, examples: [] };
      bucket.count += 1;
      if (bucket.examples.length < 2 && row?.summary) bucket.examples.push(clip(row.summary, 320));
      totals.set(name, bucket);
    }
  }
  return [...totals.values()].sort((a, b) => b.count - a.count);
}

/**
 * Builds the evidence object for one vehicle. Throws rather than returning partial data:
 * a post written against half a federal record is worse than no post.
 */
export async function collectEvidence({ year, make, model }, options = {}) {
  const retrievedAt = new Date().toISOString();
  const sources = [];
  const record = (id, url, note) => { sources.push({ id, url, retrievedAt, note }); return id; };

  const catalogUrl = `${NHTSA}/products/vehicle/models?modelYear=${year}`
    + `&make=${encodeURIComponent(make)}&issueType=c`;
  const catalog = await getJson(catalogUrl, options);
  const catalogRows = Array.isArray(catalog?.results) ? catalog.results : [];
  if (!catalogRows.length) throw new Error(`nhtsa_catalog_empty:${make}:${year}`);
  record("nhtsa-catalog", catalogUrl, "NHTSA model catalog for this make and model year");

  const resolvedModels = resolveCatalogModels(model, catalogRows);
  if (!resolvedModels.length) {
    throw new Error(`nhtsa_model_unmatched:${make} ${model}:${catalogRows.map(r => r.model).join("|")}`);
  }

  const complaintRows = [];
  const recallRows = [];
  for (const official of resolvedModels) {
    const query = `make=${encodeURIComponent(make)}&model=${encodeURIComponent(official)}&modelYear=${year}`;
    const complaintsUrl = `${NHTSA}/complaints/complaintsByVehicle?${query}`;
    const recallsUrl = `${NHTSA}/recalls/recallsByVehicle?${query}`;
    const complaints = await getJson(complaintsUrl, options);
    const recalls = await getJson(recallsUrl, options);
    if (!Array.isArray(complaints?.results) || !Array.isArray(recalls?.results)) {
      throw new Error(`nhtsa_shape_unexpected:${official}`);
    }
    complaintRows.push(...complaints.results);
    recallRows.push(...recalls.results);
    record(`nhtsa-complaints-${norm(official)}`, complaintsUrl,
      `Consumer complaints filed with NHTSA for ${year} ${make} ${official}`);
    record(`nhtsa-recalls-${norm(official)}`, recallsUrl,
      `Recall campaigns issued for ${year} ${make} ${official}`);
  }

  const complaintsById = new Map();
  for (const row of complaintRows) {
    const key = clip(row?.odiNumber, 40) || hash(JSON.stringify(row));
    if (!complaintsById.has(key)) complaintsById.set(key, row);
  }
  const uniqueComplaints = [...complaintsById.values()];

  const recallsByCampaign = new Map();
  for (const row of recallRows) {
    const key = clip(row?.NHTSACampaignNumber, 40) || hash(JSON.stringify(row));
    if (!recallsByCampaign.has(key)) recallsByCampaign.set(key, row);
  }
  const uniqueRecalls = [...recallsByCampaign.values()];

  const evidence = {
    vehicle: { year, make, model, resolvedModels },
    retrievedAt,
    sources,
    // Consumer-submitted. Allegations, not confirmed defects — the writer prompt and the
    // reviewer both key off this wording.
    complaints: {
      kind: "consumer_submitted",
      total: uniqueComplaints.length,
      crashes: uniqueComplaints.filter(row => row?.crash === true).length,
      fires: uniqueComplaints.filter(row => row?.fire === true).length,
      injuries: uniqueComplaints.reduce((sum, row) => sum + (Number(row?.numberOfInjuries) || 0), 0),
      topComponents: groupComponents(uniqueComplaints).slice(0, 8)
    },
    // Official. A manufacturer campaign filed with NHTSA.
    recalls: {
      kind: "official_campaign",
      total: uniqueRecalls.length,
      campaigns: uniqueRecalls.slice(0, 20).map(row => ({
        campaign: clip(row?.NHTSACampaignNumber, 30),
        component: clip(row?.Component, 160),
        summary: clip(row?.Summary, 600),
        consequence: clip(row?.Consequence, 600),
        remedy: clip(row?.Remedy, 600),
        reportReceivedDate: clip(row?.ReportReceivedDate, 40)
      }))
    }
  };
  evidence.snapshotHash = hash(JSON.stringify({
    vehicle: evidence.vehicle,
    complaints: evidence.complaints,
    recalls: evidence.recalls
  }));
  return evidence;
}

export function saveEvidence(evidence) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const { year, make, model } = evidence.vehicle;
  const file = path.join(EVIDENCE_DIR, `${year}-${norm(make)}-${norm(model)}.json`);
  fs.writeFileSync(file, JSON.stringify(evidence, null, 2) + "\n");
  return file;
}

// Every number the writer is allowed to state, flattened so the reviewer can recompute the
// same list from the evidence file and diff it against what the post actually says.
export function statedFigures(evidence) {
  return {
    complaintTotal: evidence.complaints.total,
    complaintCrashes: evidence.complaints.crashes,
    complaintFires: evidence.complaints.fires,
    complaintInjuries: evidence.complaints.injuries,
    recallTotal: evidence.recalls.total,
    componentCounts: Object.fromEntries(
      evidence.complaints.topComponents.map(item => [item.component, item.count]))
  };
}
