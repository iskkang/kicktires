// Picks what to write next. Candidates come from vehicles this project already holds
// reviewed federal data for, crossed with the intents a buyer actually searches near the
// point of purchase.
//
// No search volume is invented. Without a keyword API there are no impressions or
// competition scores to report, and making them up would put a fabricated number at the
// front of every decision the pipeline makes. Ranking is by things that are actually known:
// how much federal record exists, whether the subject is already covered, and how close the
// intent sits to a purchase.

import fs from "node:fs";
import { readLedger, ledgerHas, normalizeKeyword, slugify, readPosts } from "./schema.mjs";
import { similarity } from "./review.mjs";

// Bigger than any score rankKeywords can produce, so a recently rejected subject sorts below
// every untried one without being removed from the list — if nothing else is left it is still
// picked. The window is generous because a rejection is usually about a draft, not a vehicle.
export const FAILURE_PENALTY = 1000;
export const FAILURE_COOLDOWN_DAYS = 30;

// Ordered by how close the searcher is to handing over money.
export const INTENTS = [
  { id: "problems", weight: 10, slugSuffix: "problems",
    phrase: v => `${v.year} ${v.make} ${v.model} problems`,
    secondary: v => [`${v.make} ${v.model} common issues`, `${v.year} ${v.make} ${v.model} complaints`] },
  { id: "worth-buying", weight: 9, slugSuffix: "worth-buying",
    phrase: v => `is a used ${v.year} ${v.make} ${v.model} worth buying`,
    secondary: v => [`should I buy a used ${v.make} ${v.model}`, `${v.year} ${v.make} ${v.model} buyers guide`] },
  { id: "reliability", weight: 8, slugSuffix: "reliability",
    phrase: v => `${v.year} ${v.make} ${v.model} reliability`,
    secondary: v => [`is the ${v.year} ${v.make} ${v.model} reliable`, `${v.make} ${v.model} dependability`] },
  { id: "recalls", weight: 7, slugSuffix: "recalls",
    phrase: v => `${v.year} ${v.make} ${v.model} recalls`,
    secondary: v => [`${v.make} ${v.model} recall list`, `${v.year} ${v.make} ${v.model} safety recalls`] },
  { id: "cost-to-own", weight: 6, slugSuffix: "cost-to-own",
    phrase: v => `${v.year} ${v.make} ${v.model} cost to own`,
    secondary: v => [`${v.make} ${v.model} maintenance cost`, `${v.year} ${v.make} ${v.model} ownership cost`] }
];

/** Vehicles this project already has federal data for — the ones a post can be grounded in. */
export function candidateVehicles() {
  const seen = new Map();
  for (const file of ["generated.json", "data.json"]) {
    if (!fs.existsSync(file)) continue;
    let parsed;
    try { parsed = JSON.parse(fs.readFileSync(file, "utf8")); } catch { continue; }
    for (const profile of Object.values(parsed)) {
      const meta = profile?.meta;
      if (!meta?.y || !meta?.mk || !meta?.md) continue;
      const key = `${meta.y}|${meta.mk}|${meta.md}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.set(key, {
        year: Number(meta.y), make: String(meta.mk), model: String(meta.md),
        slug: String(meta.slug || ""),
        // How much federal record exists. A vehicle with almost none makes a thin article.
        complaints: Number(meta.nhtsa || profile?.federal?.complaintTotal || 0),
        recalls: Number(meta.recalls || profile?.federal?.recallTotal || 0)
      });
    }
  }
  return [...seen.values()];
}

/**
 * Ranked candidates, best first. `reasons` is carried through to the run log so a choice can
 * be explained afterwards without rerunning anything.
 */
export function rankKeywords({ vehicles = candidateVehicles(), ledger = readLedger(),
  posts = readPosts(), limit = 40, now = Date.now(), excludeSlugs = new Set() } = {}) {
  // A subject rejected at review recently goes to the back rather than off the list. The
  // penalty is larger than any score this function produces, so anything untried outranks
  // it, and it expires because a rejection usually says something about one draft rather
  // than about the vehicle.
  const failedAt = new Map();
  for (const entry of ledger.failures || []) {
    const at = Date.parse(entry.failedAt || "");
    if (Number.isFinite(at)) failedAt.set(entry.slug, at);
  }
  const ranked = [];
  for (const vehicle of vehicles) {
    for (const intent of INTENTS) {
      const primaryKeyword = intent.phrase(vehicle);
      const slugSuffix = intent.slugSuffix;
      const slug = slugify(`${vehicle.year}-${vehicle.make}-${vehicle.model}-${slugSuffix}`);
      if (ledgerHas(ledger, { slug, primaryKeyword })) continue;
      // Subjects this run has already tried and had rejected.
      if (excludeSlugs.has(slug)) continue;

      // Cannibalisation: a published post whose subject and intent already cover this.
      const clash = posts.find(post =>
        normalizeKeyword(post.primaryKeyword) === normalizeKeyword(primaryKeyword)
        || (post.year === vehicle.year
          && post.make.toLowerCase() === vehicle.make.toLowerCase()
          && post.model.toLowerCase() === vehicle.model.toLowerCase()
          && similarity(post.primaryKeyword, primaryKeyword) > 0.75));
      if (clash) continue;

      // Everything in this score is measured, not guessed.
      const evidenceDepth = Math.min(1, (vehicle.complaints + vehicle.recalls * 20) / 400);
      const alreadyCoveredVehicle = posts.some(post =>
        post.make.toLowerCase() === vehicle.make.toLowerCase()
        && post.model.toLowerCase() === vehicle.model.toLowerCase());
      const failedDaysAgo = failedAt.has(slug)
        ? (now - failedAt.get(slug)) / 86_400_000
        : null;
      const recentlyRejected = failedDaysAgo !== null && failedDaysAgo < FAILURE_COOLDOWN_DAYS;
      const score = intent.weight * 10
        + evidenceDepth * 45
        - (alreadyCoveredVehicle ? 22 : 0)
        - (recentlyRejected ? FAILURE_PENALTY : 0);

      ranked.push({
        primaryKeyword,
        secondaryKeywords: intent.secondary(vehicle),
        intent: intent.id,
        slugSuffix, slug,
        vehicle,
        score: Number(score.toFixed(2)),
        reasons: [
          `intent "${intent.id}" sits ${intent.weight}/10 on purchase proximity`,
          `federal record: ${vehicle.complaints} complaints, ${vehicle.recalls} recall campaigns`,
          alreadyCoveredVehicle ? "this vehicle already has a post, so it is deprioritised"
            : "no post covers this vehicle yet",
          ...(recentlyRejected
            ? [`a draft for this was rejected at review ${Math.floor(failedDaysAgo)} day(s) ago,`
              + ` so it waits behind anything untried until ${FAILURE_COOLDOWN_DAYS} days pass`]
            : [])
        ],
        // Stated as an estimate, never as a number pulled from nowhere.
        searchVolume: null,
        opportunity: "estimated_only_no_keyword_api"
      });
    }
  }
  return ranked.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function pickKeyword(options = {}) {
  const ranked = rankKeywords(options);
  return ranked[0] || null;
}
