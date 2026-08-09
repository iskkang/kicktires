// Turns an evidence object into a draft. The model is given the normalised federal record
// and nothing else to work from — no open web, no recall of what it thinks it knows about
// the car — because everything it writes has to be checkable against that object afterwards.

import { callModel, parseJson } from "./model-client.mjs";
import { statedFigures } from "./evidence.mjs";
import { slugify } from "./schema.mjs";

const SYSTEM = `You write used-car research for KickTires, for American buyers deciding
whether to buy a specific used car. Write in US English.

You are given a federal-record evidence object. It is the only source you may draw facts
from. You may not use anything you remember about this vehicle from anywhere else.

Three kinds of information are in that object and they must never be blurred:
 - recalls.campaigns are OFFICIAL recall campaigns filed with NHTSA by the manufacturer.
 - complaints are CONSUMER-SUBMITTED reports. They are allegations, not confirmed defects,
   and not evidence of a failure rate. Never call a complaint pattern a defect, a fault, a
   known issue, or a problem the manufacturer acknowledged.
 - anything else you say is KickTires' reading of that record, and must be written as such.

Hard rules:
 - Every number you write must appear in the evidence object. Do not compute new totals,
   percentages, rates, averages or rankings. Do not estimate repair costs.
 - Do not claim to have driven, owned, inspected or tested the car. You have not.
 - Do not compare against other vehicles, model years or "the segment" — you have no data
   for that comparison.
 - No hype, no fear-mongering, no filler, no restating the heading in the first sentence.
 - Do not repeat the search keyword unnaturally. Write it once or twice where it belongs.
 - Raw complaint totals cannot be compared across models without sales-volume data. If you
   mention scale, say so.

Return ONLY JSON:
{
 "title": "under 70 chars, plain, no clickbait, names the vehicle",
 "description": "meta description, 120-165 chars, says what the reader gets",
 "keyTakeaway": "one sentence: what a buyer should actually do",
 "body": [
   {"heading": "...", "paragraphs": ["..."], "bullets": ["..."], "sourceIds": ["..."]}
 ],
 "inspectionChecklist": [{"lead": "short imperative", "detail": "why it matters"}],
 "buyerVerdict": "2-4 sentences tying the record to a buying decision"
}

body must contain these headings, in this order, using these exact strings:
 "What the federal record shows"
 "Recall campaigns"
 "What owners reported"
 "What to check before you buy"
 "How we read this"

Each body section lists the sourceIds it used, taken from evidence.sources[].id.
Write 900-1600 words in total. Write what the record supports and stop.`;

export const REQUIRED_HEADINGS = [
  "What the federal record shows",
  "Recall campaigns",
  "What owners reported",
  "What to check before you buy",
  "How we read this"
];

/** The evidence the model is allowed to see, trimmed so the prompt stays affordable. */
export function writerEvidence(evidence) {
  return {
    vehicle: evidence.vehicle,
    retrievedAt: evidence.retrievedAt,
    sources: evidence.sources.map(source => ({ id: source.id, note: source.note })),
    complaints: {
      kind: evidence.complaints.kind,
      total: evidence.complaints.total,
      crashes: evidence.complaints.crashes,
      fires: evidence.complaints.fires,
      injuries: evidence.complaints.injuries,
      topComponents: evidence.complaints.topComponents.slice(0, 6).map(item => ({
        component: item.component, count: item.count, examples: item.examples.slice(0, 1)
      }))
    },
    recalls: {
      kind: evidence.recalls.kind,
      total: evidence.recalls.total,
      campaigns: evidence.recalls.campaigns.slice(0, 10)
    },
    allowedFigures: statedFigures(evidence)
  };
}

export function draftShapeProblems(draft) {
  const problems = [];
  const text = (value, min, max) =>
    typeof value === "string" && value.trim().length >= min && value.trim().length <= max;

  if (!draft || typeof draft !== "object") return ["draft is not an object"];
  if (!text(draft.title, 15, 110)) problems.push("title missing or wrong length");
  if (!text(draft.description, 70, 175)) problems.push("description must be 70-175 chars");
  if (!text(draft.keyTakeaway, 20, 400)) problems.push("keyTakeaway missing");
  if (!text(draft.buyerVerdict, 40, 900)) problems.push("buyerVerdict missing");
  if (!Array.isArray(draft.body) || draft.body.length < 3) problems.push("body needs 3+ sections");
  if (!Array.isArray(draft.inspectionChecklist) || draft.inspectionChecklist.length < 3) {
    problems.push("inspectionChecklist needs 3+ items");
  }

  const headings = (draft.body || []).map(section => String(section?.heading || "").trim());
  for (const required of REQUIRED_HEADINGS) {
    if (!headings.includes(required)) problems.push(`body is missing the "${required}" section`);
  }
  (draft.body || []).forEach((section, index) => {
    if (!Array.isArray(section?.paragraphs) || !section.paragraphs.length) {
      problems.push(`body[${index}] has no paragraphs`);
    }
  });
  return problems;
}

/**
 * Asks for a draft and re-asks once if the shape is wrong, feeding the specific problems
 * back. A malformed reply is usually a formatting slip rather than a refusal, and one
 * corrective turn fixes it far more cheaply than discarding the run.
 */
export async function writeDraft(evidence, keyword, options = {}) {
  const { reviewFailures = [], ...modelOptions } = options;
  const payload = {
    searchIntent: keyword.primaryKeyword,
    secondaryKeywords: keyword.secondaryKeywords,
    evidence: writerEvidence(evidence)
  };
  // Rejections from a previous draft of this same post. They are the caller's, not this
  // loop's, and they seed the first request rather than waiting for a shape error.
  let feedback = reviewFailures.length
    ? reviewFailures.map(item => `- ${item}`).join("\n")
    : "";
  let lastProblems = [];

  for (let attempt = 0; attempt < 2; attempt++) {
    const user = feedback
      ? `${JSON.stringify(payload, null, 1)}\n\nYour previous reply was rejected for:\n`
        + `${feedback}\nReturn corrected JSON only.`
      : JSON.stringify(payload, null, 1);
    const reply = await callModel(SYSTEM, user, {
      maxTokens: 4000, temperature: 0.3, seed: 7, ...modelOptions
    });
    let draft;
    try { draft = parseJson(reply); }
    catch (error) { lastProblems = [error.message]; feedback = error.message; continue; }

    const problems = draftShapeProblems(draft);
    if (!problems.length) return draft;
    lastProblems = problems;
    feedback = problems.map(problem => `- ${problem}`).join("\n");
  }
  const error = new Error(`draft_schema_failed: ${lastProblems.join("; ")}`);
  error.problems = lastProblems;
  throw error;
}

export function draftToPost(draft, { evidence, keyword, hero, related, now }) {
  const { year, make, model } = evidence.vehicle;
  const slug = slugify(`${year}-${make}-${model}-${keyword.slugSuffix}`);
  const timestamp = now || new Date().toISOString();
  const body = [
    { heading: "The short answer", paragraphs: [draft.keyTakeaway], sourceIds: [] },
    ...draft.body.map(section => ({
      heading: String(section.heading).trim(),
      paragraphs: (section.paragraphs || []).map(String),
      bullets: (section.bullets || []).map(String),
      sourceIds: (section.sourceIds || []).map(String)
    })),
    {
      heading: "Before you make an offer",
      paragraphs: [draft.buyerVerdict],
      bullets: draft.inspectionChecklist.map(item => `${item.lead}. ${item.detail}`),
      sourceIds: []
    }
  ];

  return {
    title: draft.title.trim(),
    slug,
    description: draft.description.trim(),
    datePublished: timestamp,
    dateModified: timestamp,
    author: "KickTires Editorial",
    make, model, year,
    primaryKeyword: keyword.primaryKeyword,
    secondaryKeywords: keyword.secondaryKeywords,
    heroImage: {
      src: hero.src, alt: hero.alt,
      ogSrc: hero.ogSrc || hero.src, squareSrc: hero.squareSrc || hero.src,
      kind: hero.kind
    },
    imageCredit: hero.credit,
    imageLicense: hero.license,
    imageSourceUrl: hero.sourceUrl || null,
    imageLicenseUrl: hero.licenseUrl || null,
    sourceIds: evidence.sources.map(source => source.id),
    sources: evidence.sources,
    sourceSnapshotHash: evidence.snapshotHash,
    evidenceFigures: statedFigures(evidence),
    qualityReport: { status: "pending" },
    body,
    relatedArticles: related,
    status: "draft"
  };
}
