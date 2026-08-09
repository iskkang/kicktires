// Two independent gates. The code gate recomputes every number from the evidence file and
// checks the things that have a right answer. The model gate reads the draft cold, with a
// separate prompt and no sight of the writer's instructions, and looks for the failures that
// do not reduce to a number.
//
// Code runs first and its failures are not appealable. A model that says a post is fine does
// not make an unsourced statistic sourced.

import fs from "node:fs";
import path from "node:path";
import { callModel, parseJson } from "./model-client.mjs";
import { readPosts, wordCount, normalizeKeyword, validatePost, IMAGES_DIR } from "./schema.mjs";

export const MIN_WORDS = 700;
export const MAX_WORDS = 2200;
export const MAX_SIMILARITY = 0.62;

const bodyText = post => (post.body || [])
  .flatMap(section => [section.heading, ...(section.paragraphs || []), ...(section.bullets || [])])
  .join("\n");

/* ── numbers ──────────────────────────────────────────────────── */
// Every figure the post is allowed to state, gathered from the evidence rather than from the
// post. Anything numeric in the prose that is not in here is either invented or derived, and
// both are grounds to reject.
export function allowedNumbers(evidence) {
  const allowed = new Set();
  const add = value => {
    const number = Number(value);
    if (Number.isFinite(number)) allowed.add(number);
  };
  add(evidence.complaints.total);
  add(evidence.complaints.crashes);
  add(evidence.complaints.fires);
  add(evidence.complaints.injuries);
  add(evidence.recalls.total);
  for (const item of evidence.complaints.topComponents) add(item.count);
  add(evidence.vehicle.year);
  // Model years either side are legitimate context for a used buyer.
  for (let offset = -6; offset <= 2; offset++) add(evidence.vehicle.year + offset);
  // Numbers inside recall text — campaign ids, dates, quantities the campaign itself states.
  const campaignText = evidence.recalls.campaigns.map(campaign =>
    [campaign.campaign, campaign.component, campaign.summary, campaign.consequence, campaign.remedy]
      .join(" ")).join(" ");
  for (const match of campaignText.matchAll(/\d[\d,]*/g)) add(match[0].replace(/,/g, ""));
  return allowed;
}

export function unsupportedNumbers(post, evidence) {
  const allowed = allowedNumbers(evidence);
  const found = new Map();
  for (const match of bodyText(post).matchAll(/(?<![\w.])(\d[\d,]*)(?:\.\d+)?(?![\w])/g)) {
    const raw = match[1].replace(/,/g, "");
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    // Single digits and small counts are ordinary prose ("three areas", "5 minutes").
    if (value <= 12) continue;
    if (allowed.has(value)) continue;
    found.set(value, (found.get(value) || 0) + 1);
  }
  return [...found.keys()].sort((a, b) => a - b);
}

/* ── similarity ───────────────────────────────────────────────── */
// Bag-of-words Jaccard over the body. Crude, but it is measuring the thing that matters:
// whether this post is the last one with the vehicle name swapped.
export function similarity(a, b) {
  const tokens = text => new Set(String(text).toLowerCase().match(/[a-z]{4,}/g) || []);
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return shared / (left.size + right.size - shared);
}

/* ── the code gate ────────────────────────────────────────────── */
export function codeReview(post, evidence, options = {}) {
  const failures = [];
  const warnings = [];
  const fail = (check, detail) => failures.push({ check, detail });
  const warn = (check, detail) => warnings.push({ check, detail });

  for (const problem of validatePost(post)) fail("schema", problem);

  // Numbers must be recomputable from the evidence, not from the draft.
  const figures = evidence ? {
    complaintTotal: evidence.complaints.total,
    complaintCrashes: evidence.complaints.crashes,
    complaintFires: evidence.complaints.fires,
    complaintInjuries: evidence.complaints.injuries,
    recallTotal: evidence.recalls.total
  } : null;
  if (figures) {
    for (const [key, value] of Object.entries(figures)) {
      if (post.evidenceFigures?.[key] !== value) {
        fail("figures_drifted", `${key}: post says ${post.evidenceFigures?.[key]}, evidence says ${value}`);
      }
    }
    if (post.sourceSnapshotHash !== evidence.snapshotHash) {
      fail("snapshot_mismatch", "post was written against a different evidence snapshot");
    }
    const stray = unsupportedNumbers(post, evidence);
    if (stray.length) fail("unsourced_numbers", `not in the federal record: ${stray.join(", ")}`);
  }

  // Every sourceId a section cites has to exist.
  const known = new Set((post.sources || []).map(source => source.id));
  for (const section of post.body || []) {
    for (const id of section.sourceIds || []) {
      if (!known.has(id)) fail("unknown_source_id", `${section.heading}: ${id}`);
    }
  }
  const cited = (post.body || []).flatMap(section => section.sourceIds || []);
  if (!cited.length) fail("no_citations", "no body section cites a source");

  const words = wordCount(post);
  if (words < MIN_WORDS) fail("too_short", `${words} words`);
  if (words > MAX_WORDS) fail("too_long", `${words} words`);

  const prose = bodyText(post);
  // A consumer complaint is an allegation. Calling it a defect is the single most damaging
  // thing this pipeline could publish, so it is a code check rather than a model opinion.
  const defectClaims = [
    /complaints?\s+(?:prove|confirm|show that the .{0,40}is defective)/gi,
    /known\s+defects?/gi, /confirmed\s+defects?/gi, /documented\s+defects?/gi,
    /widespread\s+failure\s+rate/gi, /\d+\s*%\s*of\s+(?:owners|vehicles|cars)/gi
  ];
  // "allegations, not confirmed defects" is the framing the writer prompt asks for by name.
  // Matching the bare phrase failed the disclaimer as if it were the claim, which rejected
  // every correctly-written post. Only an unnegated occurrence is the thing worth blocking.
  const NEGATED = /\b(?:not|never|nor|rather\s+than|instead\s+of|aren['’]?t|isn['’]?t|wasn['’]?t|weren['’]?t|don['’]?t|doesn['’]?t|cannot|can['’]?t)\b[^.;:]{0,24}$/i;
  for (const pattern of defectClaims) {
    for (const hit of prose.matchAll(pattern)) {
      if (NEGATED.test(prose.slice(Math.max(0, hit.index - 40), hit.index))) continue;
      fail("complaint_as_defect", `"${hit[0]}"`);
      break;
    }
  }
  const falseExperience = /\b(?:I|we)\s+(?:drove|owned|tested|inspected|took delivery)/i;
  const experienceHit = prose.match(falseExperience);
  if (experienceHit) fail("false_experience", `"${experienceHit[0]}"`);

  // Keyword stuffing: the exact phrase appearing far more than a natural reference count.
  const keyword = normalizeKeyword(post.primaryKeyword);
  if (keyword.length > 8) {
    const occurrences = (normalizeKeyword(prose).match(new RegExp(keyword, "g")) || []).length;
    if (occurrences > 6) fail("keyword_stuffing", `primary keyword appears ${occurrences} times`);
  }

  // Duplicate subject, title or description against everything already published.
  const others = (options.existingPosts || readPosts()).filter(other => other.slug !== post.slug);
  for (const other of others) {
    if (normalizeKeyword(other.primaryKeyword) === keyword) {
      fail("duplicate_keyword", `${other.slug} already targets this keyword`);
    }
    if (other.title.trim().toLowerCase() === post.title.trim().toLowerCase()) {
      fail("duplicate_title", other.slug);
    }
    if (other.description.trim().toLowerCase() === post.description.trim().toLowerCase()) {
      fail("duplicate_description", other.slug);
    }
    const overlap = similarity(bodyText(other), prose);
    if (overlap > MAX_SIMILARITY) {
      fail("near_duplicate_body", `${(overlap * 100).toFixed(0)}% token overlap with ${other.slug}`);
    } else if (overlap > MAX_SIMILARITY - 0.12) {
      warn("similar_body", `${(overlap * 100).toFixed(0)}% token overlap with ${other.slug}`);
    }
  }

  // The hero has to be a file that exists, with a licence recorded.
  const heroPath = String(post.heroImage?.src || "");
  if (!heroPath.startsWith("/blog-images/")) fail("hero_path", heroPath || "(none)");
  else {
    const onDisk = path.join(IMAGES_DIR, heroPath.replace("/blog-images/", ""));
    if (!fs.existsSync(onDisk)) fail("hero_missing", onDisk);
  }
  if (!post.imageLicense) fail("image_license_missing", "no licence recorded for the hero image");
  if (post.heroImage?.kind === "licensed_photo" && !post.imageSourceUrl) {
    fail("image_source_missing", "a licensed photo must record where it came from");
  }
  // Only claim a model year in alt text when the source confirmed it.
  if (post.heroImage?.kind === "licensed_photo" && post.heroImage.yearConfirmed === false
    && new RegExp(`\\b${post.year}\\b`).test(post.heroImage.alt || "")) {
    fail("image_year_claimed", "alt text names a model year the source does not confirm");
  }

  // Internal links must point at something this build produces.
  for (const related of post.relatedArticles || []) {
    if (!/^\//.test(related.href)) fail("external_related", related.href);
  }

  return { failures, warnings, words };
}

/* ── the model gate ───────────────────────────────────────────── */
const REVIEW_SYSTEM = `You are reviewing a draft article for a used-car research site before
publication. You did not write it and you have no stake in it being published.

You are given the article and the federal-record evidence it was supposedly written from.

Reject the article if any of these are true:
 - it states something the evidence does not support
 - it presents consumer-submitted complaints as confirmed defects, known faults, or
   manufacturer-acknowledged problems
 - the headline is alarmist, or promises more than the article delivers
 - it repeats itself, or pads with sentences that carry no information
 - it repeats the search keyword unnaturally
 - it claims first-hand experience of the car
 - its conclusion contradicts its own body
 - it gives a buyer nothing they could act on
 - the call to action for the site's listing analyzer is jammed in or irrelevant

Be specific. Quote the sentence you are objecting to. Judge only what is in front of you.

Return ONLY JSON:
{"verdict": "pass" | "fail",
 "problems": [{"severity": "fail"|"warn", "quote": "...", "why": "..."}],
 "notes": "one sentence"}`;

export async function modelReview(post, evidence, options = {}) {
  const payload = {
    article: {
      title: post.title, description: post.description,
      primaryKeyword: post.primaryKeyword,
      body: post.body
    },
    evidence: {
      vehicle: evidence.vehicle,
      complaints: { kind: evidence.complaints.kind, total: evidence.complaints.total,
        crashes: evidence.complaints.crashes, fires: evidence.complaints.fires,
        topComponents: evidence.complaints.topComponents.slice(0, 6) },
      recalls: { kind: evidence.recalls.kind, total: evidence.recalls.total,
        campaigns: evidence.recalls.campaigns.slice(0, 8) }
    }
  };
  const reply = await callModel(REVIEW_SYSTEM, JSON.stringify(payload, null, 1), {
    maxTokens: 1600, temperature: 0, seed: 11, ...options
  });
  const parsed = parseJson(reply);
  const problems = Array.isArray(parsed?.problems) ? parsed.problems : [];
  return {
    verdict: parsed?.verdict === "pass" ? "pass" : "fail",
    failures: problems.filter(problem => problem?.severity !== "warn"),
    warnings: problems.filter(problem => problem?.severity === "warn"),
    notes: String(parsed?.notes || "").slice(0, 400)
  };
}
