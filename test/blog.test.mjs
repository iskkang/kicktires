import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

import { validatePost, slugify, normalizeKeyword, wordCount } from "../scripts/blog/schema.mjs";
import { codeReview, unsupportedNumbers, similarity } from "../scripts/blog/review.mjs";
import { resolveCatalogModels, collectEvidence, statedFigures } from "../scripts/blog/evidence.mjs";
import { dataGraphicSvg, ALLOWED_LICENSES, licenseLabel } from "../scripts/blog/images.mjs";
import { draftShapeProblems, REQUIRED_HEADINGS, writerEvidence } from "../scripts/blog/write.mjs";
import { rankKeywords, pickKeyword } from "../scripts/blog/keywords.mjs";

const EVIDENCE = {
  vehicle: { year: 2021, make: "Honda", model: "Civic", resolvedModels: ["CIVIC"] },
  retrievedAt: "2026-08-09T00:00:00.000Z",
  sources: [
    { id: "nhtsa-catalog", url: "https://api.nhtsa.gov/products/vehicle/models?x", retrievedAt: "2026-08-09T00:00:00.000Z", note: "catalog" },
    { id: "nhtsa-complaints-civic", url: "https://api.nhtsa.gov/complaints/complaintsByVehicle?x", retrievedAt: "2026-08-09T00:00:00.000Z", note: "complaints" }
  ],
  complaints: { kind: "consumer_submitted", total: 6, crashes: 1, fires: 0, injuries: 0,
    topComponents: [{ component: "ELECTRICAL SYSTEM", count: 3, examples: ["screen blank"] }] },
  recalls: { kind: "official_campaign", total: 2, campaigns: [
    { campaign: "21V123000", component: "STRUCTURE", summary: "s", consequence: "c", remedy: "r", reportReceivedDate: "2021-03-04" }] },
  snapshotHash: "abc123def456"
};

const basePost = () => ({
  title: "2021 Honda Civic Problems: What the Federal Record Shows",
  slug: "2021-honda-civic-problems",
  description: "The 2021 Honda Civic NHTSA record read for used buyers: which recalls were filed and what owners reported before you buy.",
  datePublished: "2026-08-09T00:00:00.000Z",
  dateModified: "2026-08-09T00:00:00.000Z",
  author: "KickTires Editorial",
  make: "Honda", model: "Civic", year: 2021,
  primaryKeyword: "2021 honda civic problems",
  secondaryKeywords: ["honda civic common issues"],
  heroImage: { src: "/blog-images/x/y.svg", alt: "Chart of NHTSA totals for the Civic", kind: "data_graphic" },
  imageCredit: "KickTires", imageLicense: "KickTires original graphic",
  sourceIds: ["nhtsa-catalog", "nhtsa-complaints-civic"],
  sources: EVIDENCE.sources,
  sourceSnapshotHash: "abc123def456",
  evidenceFigures: statedFigures(EVIDENCE),
  qualityReport: { status: "pending" },
  body: [
    { heading: "What the federal record shows", paragraphs: ["NHTSA holds 6 consumer complaints and 2 recall campaigns for this model year."], sourceIds: ["nhtsa-catalog"] },
    { heading: "What owners reported", paragraphs: ["Owners reported issues with the electrical system in 3 of those filings."], sourceIds: ["nhtsa-complaints-civic"] },
    { heading: "What to check before you buy", paragraphs: ["Run the VIN before you agree a price, and test the screen from cold."], sourceIds: [] }
  ],
  relatedArticles: [{ href: "/cars/", title: "All research" }],
  status: "published"
});

test("a post schema rejects the fields a published article cannot go without", () => {
  assert.deepEqual(validatePost(basePost()), []);
  const noSources = { ...basePost(), sourceIds: [] };
  assert.match(validatePost(noSources).join(" "), /sourceIds/);
  const badSlug = { ...basePost(), slug: "Not A Slug" };
  assert.match(validatePost(badSlug).join(" "), /slug/);
  assert.equal(slugify("2021 Honda Civic — Problems!"), "2021-honda-civic-problems");
});

// Every number in the prose has to be recomputable from the stored snapshot. This is the
// check that stops a confident-sounding invented statistic reaching a buyer.
test("numbers not in the federal record are rejected", () => {
  const post = basePost();
  assert.deepEqual(unsupportedNumbers(post, EVIDENCE), []);

  post.body[1].paragraphs = ["NHTSA logged 4218 complaints about this system."];
  assert.deepEqual(unsupportedNumbers(post, EVIDENCE), [4218]);
  assert.equal(codeReview(post, EVIDENCE, { existingPosts: [] })
    .failures.some(item => item.check === "unsourced_numbers"), true);
});

test("a figure that drifts from the snapshot fails even if the prose looks fine", () => {
  const post = basePost();
  post.evidenceFigures = { ...post.evidenceFigures, complaintTotal: 99 };
  const failures = codeReview(post, EVIDENCE, { existingPosts: [] }).failures;
  assert.equal(failures.some(item => item.check === "figures_drifted"), true);

  const stale = basePost();
  stale.sourceSnapshotHash = "written-against-something-else";
  assert.equal(codeReview(stale, EVIDENCE, { existingPosts: [] })
    .failures.some(item => item.check === "snapshot_mismatch"), true);
});

// A consumer complaint is an allegation. Publishing one as a confirmed defect is the most
// damaging thing this pipeline could do, so it is a hard check rather than a model opinion.
test("presenting a complaint as a confirmed defect is refused", () => {
  for (const sentence of [
    "This is a known defect in the electrical system.",
    "Complaints prove the car is unsafe.",
    "Roughly 40% of owners reported the same fault."
  ]) {
    const post = basePost();
    post.body[1].paragraphs = [sentence];
    const failures = codeReview(post, EVIDENCE, { existingPosts: [] }).failures.map(item => item.check);
    assert.equal(failures.includes("complaint_as_defect") || failures.includes("unsourced_numbers"), true,
      `not caught: ${sentence}`);
  }
});

// The writer prompt tells the model to say complaints are "allegations, not confirmed
// defects". Matching the bare phrase failed that disclaimer as though it were the claim, so
// the first live run rejected its own correctly-written draft three times and published
// nothing. Negated mentions have to survive; a real claim after one still must not.
test("the disclaimer the writer is asked for is not read as the claim", () => {
  for (const sentence of [
    "Consumer complaints are allegations, not confirmed defects, and are not failure rates.",
    "These reports are never a known defect until NHTSA adjudicates them.",
    "Treat them as screening signals rather than documented defects."
  ]) {
    const post = basePost();
    post.body[1].paragraphs = [sentence];
    const failures = codeReview(post, EVIDENCE, { existingPosts: [] }).failures.map(item => item.check);
    assert.equal(failures.includes("complaint_as_defect"), false, `false positive: ${sentence}`);
  }

  const post = basePost();
  post.body[1].paragraphs = ["They are not confirmed defects. But the brake fault is a documented defect."];
  const failures = codeReview(post, EVIDENCE, { existingPosts: [] }).failures.map(item => item.check);
  assert.equal(failures.includes("complaint_as_defect"), true, "a real claim after a negated one must still fail");
});

test("claimed first-hand experience is refused", () => {
  const post = basePost();
  post.body[1].paragraphs = ["I drove this car for a week and the screen failed twice."];
  assert.equal(codeReview(post, EVIDENCE, { existingPosts: [] })
    .failures.some(item => item.check === "false_experience"), true);
});

test("an unknown sourceId and a missing hero image both stop publication", () => {
  const unknownSource = basePost();
  unknownSource.body[0].sourceIds = ["nhtsa-invented"];
  assert.equal(codeReview(unknownSource, EVIDENCE, { existingPosts: [] })
    .failures.some(item => item.check === "unknown_source_id"), true);

  const noImage = basePost();
  noImage.heroImage = { ...noImage.heroImage, src: "/blog-images/missing/none.svg" };
  assert.equal(codeReview(noImage, EVIDENCE, { existingPosts: [] })
    .failures.some(item => item.check === "hero_missing"), true);

  const noLicense = basePost();
  noLicense.imageLicense = "";
  assert.equal(codeReview(noLicense, EVIDENCE, { existingPosts: [] })
    .failures.some(item => item.check === "image_license_missing"), true);
});

// A photo we cannot date must not be captioned as if we could.
test("alt text cannot claim a model year the image source does not confirm", () => {
  const post = basePost();
  post.heroImage = { src: "/blog-images/x/y.svg", alt: "2021 Honda Civic parked",
    kind: "licensed_photo", yearConfirmed: false };
  post.imageSourceUrl = "https://example.org/photo";
  assert.equal(codeReview(post, EVIDENCE, { existingPosts: [] })
    .failures.some(item => item.check === "image_year_claimed"), true);
});

test("the same subject cannot be published twice under a different filename", () => {
  const published = basePost();
  const second = { ...basePost(), slug: "another-slug" };
  const checks = codeReview(second, EVIDENCE, { existingPosts: [published] })
    .failures.map(item => item.check);
  assert.equal(checks.includes("duplicate_keyword"), true);
  assert.equal(checks.includes("duplicate_title"), true);
  assert.equal(checks.includes("near_duplicate_body"), true);
});

test("keyword stuffing is refused", () => {
  const post = basePost();
  post.body[1].paragraphs = [Array(9).fill("2021 honda civic problems").join(". ") + "."];
  assert.equal(codeReview(post, EVIDENCE, { existingPosts: [] })
    .failures.some(item => item.check === "keyword_stuffing"), true);
});

test("similarity separates a rewrite from an unrelated article", () => {
  const text = "recall campaign complaint electrical system windshield camera inspection";
  assert.equal(similarity(text, text) > 0.99, true);
  assert.equal(similarity(text, "transmission slipping torque converter shudder fluid") < 0.2, true);
});

/* ── evidence ─────────────────────────────────────────────────── */
test("collects the federal record and separates official recalls from consumer reports", async () => {
  const calls = [];
  const fetchImpl = async url => {
    const target = String(url);
    calls.push(target);
    if (target.includes("/products/vehicle/models")) {
      return Response.json({ count: 2, results: [{ model: "CIVIC" }, { model: "CIVIC TYPE R" }] });
    }
    if (target.includes("complaintsByVehicle")) {
      return Response.json({ count: 2, results: [
        { odiNumber: "1", components: "ELECTRICAL SYSTEM", summary: "a", crash: true },
        { odiNumber: "1", components: "ELECTRICAL SYSTEM", summary: "a", crash: true },
        { odiNumber: "2", components: "SERVICE BRAKES", summary: "b", fire: true }] });
    }
    return Response.json({ count: 1, results: [
      { NHTSACampaignNumber: "21V123000", Component: "STRUCTURE", Summary: "s" }] });
  };

  const evidence = await collectEvidence({ year: 2021, make: "Honda", model: "Civic" }, { fetchImpl });
  // TYPE R is a separately sold vehicle; folding it in would report another car's record.
  assert.deepEqual(evidence.vehicle.resolvedModels, ["CIVIC"]);
  assert.equal(evidence.complaints.kind, "consumer_submitted");
  assert.equal(evidence.recalls.kind, "official_campaign");
  assert.equal(evidence.complaints.total, 2, "duplicate ODI numbers must collapse");
  assert.equal(evidence.complaints.crashes, 1);
  assert.equal(evidence.recalls.total, 1);
  assert.equal(evidence.sources.length >= 3, true);
  assert.equal(typeof evidence.snapshotHash, "string");
  assert.equal(calls.some(url => url.includes("api.nhtsa.gov")), true);
});

test("a vehicle with no catalog match fails rather than guessing", async () => {
  const fetchImpl = async url => String(url).includes("/products/vehicle/models")
    ? Response.json({ count: 1, results: [{ model: "SOMETHING ELSE" }] })
    : Response.json({ count: 0, results: [] });
  await assert.rejects(
    () => collectEvidence({ year: 2021, make: "Honda", model: "Civic" }, { fetchImpl }),
    /nhtsa_model_unmatched/);
});

test("catalog resolution keeps a separately sold model out", () => {
  const rows = names => names.map(model => ({ model }));
  assert.deepEqual(resolveCatalogModels("civic", rows(["CIVIC", "CIVIC TYPE R"])), ["CIVIC"]);
  assert.deepEqual(resolveCatalogModels("f150", rows(["F-150", "F-150 LIGHTNING"])), ["F-150"]);
  assert.deepEqual(resolveCatalogModels("rx", rows(["RX 350", "RX 450H"])), ["RX 350", "RX 450H"]);
  assert.deepEqual(resolveCatalogModels("320i", rows(["3 SERIES", "M4"])), ["3 SERIES"]);
  assert.deepEqual(resolveCatalogModels("c300", rows(["C-CLASS", "GLC-CLASS"])), ["C-CLASS"]);
  assert.deepEqual(resolveCatalogModels("740i", rows(["3 SERIES"])), []);
});

/* ── writer contract ──────────────────────────────────────────── */
test("a draft missing a required section is rejected before it can become a post", () => {
  const draft = {
    title: "2021 Honda Civic Problems: What The Record Shows",
    description: "A description that is comfortably long enough to satisfy the meta description length rule for this test.",
    keyTakeaway: "Check the VIN against both recall campaigns before agreeing a price.",
    buyerVerdict: "The record is small and concentrated in the electrical system, which you can test before you buy anything.",
    body: REQUIRED_HEADINGS.slice(0, 3).map(heading => ({ heading, paragraphs: ["x".repeat(40)] })),
    inspectionChecklist: [{ lead: "a", detail: "b" }, { lead: "c", detail: "d" }, { lead: "e", detail: "f" }]
  };
  const problems = draftShapeProblems(draft);
  assert.equal(problems.some(problem => /What to check before you buy/.test(problem)), true);

  draft.body = REQUIRED_HEADINGS.map(heading => ({ heading, paragraphs: ["x".repeat(40)] }));
  assert.deepEqual(draftShapeProblems(draft), []);
});

// The writer sees the record and nothing else, so anything it writes stays checkable.
test("the writer is handed the evidence and no free-text web content", () => {
  const payload = writerEvidence(EVIDENCE);
  assert.equal(payload.complaints.kind, "consumer_submitted");
  assert.equal(payload.recalls.kind, "official_campaign");
  assert.equal(payload.allowedFigures.complaintTotal, 6);
  assert.equal(JSON.stringify(payload).includes("http"), false,
    "source URLs must not be in the writer prompt; ids are enough to cite");
});

/* ── images ───────────────────────────────────────────────────── */
test("only commercially usable licences are accepted", () => {
  for (const allowed of ["cc0", "pdm", "by", "by-sa"]) assert.equal(ALLOWED_LICENSES.has(allowed), true);
  for (const refused of ["by-nc", "by-nd", "by-nc-sa", "by-nc-nd"]) {
    assert.equal(ALLOWED_LICENSES.has(refused), false, refused);
  }
  assert.match(licenseLabel("by-sa", "4.0"), /CC BY-SA 4\.0/);
  assert.equal(licenseLabel("by-nc"), "");
});

test("the fallback graphic is built from the record and states its source", () => {
  const svg = dataGraphicSvg(EVIDENCE);
  assert.match(svg, /^<svg /);
  assert.match(svg, /2021 Honda Civic/);
  assert.match(svg, />6</, "complaint total must appear");
  assert.match(svg, />2</, "recall total must appear");
  assert.match(svg, /ELECTRICAL SYSTEM/);
  assert.match(svg, /Source: NHTSA/);
  assert.match(svg, /screening signals, not failure rates/);
});

/* ── keywords ─────────────────────────────────────────────────── */
test("keyword ranking skips what is published and never invents search volume", () => {
  const vehicles = [{ year: 2021, make: "Honda", model: "Civic", complaints: 200, recalls: 3 }];
  const ledger = { posts: [{ slug: "2021-honda-civic-problems", primaryKeyword: "2021 honda civic problems" }] };
  const ranked = rankKeywords({ vehicles, ledger, posts: [] });

  assert.equal(ranked.some(item => normalizeKeyword(item.primaryKeyword)
    === normalizeKeyword("2021 honda civic problems")), false, "a published keyword came back");
  assert.equal(ranked.length > 0, true);
  for (const item of ranked) {
    assert.equal(item.searchVolume, null, "search volume must not be fabricated");
    assert.equal(item.opportunity, "estimated_only_no_keyword_api");
    assert.equal(item.reasons.length >= 2, true);
  }
});

// Ranking is deterministic, so a subject that fails review comes back top of the list on the
// next run and the schedule spends itself re-attempting one vehicle. Rejections are recorded
// and penalised — heavily enough to sit behind anything untried, temporarily enough that the
// subject is not lost, since a rejection is usually about one draft.
test("a subject rejected at review waits behind untried ones, then comes back", () => {
  const vehicles = [
    { year: 2018, make: "Toyota", model: "Camry", complaints: 731, recalls: 8 },
    { year: 2020, make: "Honda", model: "Accord", complaints: 90, recalls: 2 }
  ];
  const camry = "2018-toyota-camry-problems";
  const day = 86_400_000;
  const now = Date.parse("2026-08-09T00:00:00.000Z");
  const rank = failedAt => rankKeywords({
    vehicles, posts: [], now,
    ledger: { posts: [], failures: failedAt ? [{ slug: camry, failedAt }] : [] }
  });

  // Camry outranks the Accord on evidence depth alone.
  assert.equal(rank(null)[0].slug, camry, "the richer federal record should lead");

  const afterFailure = rank(new Date(now - 2 * day).toISOString());
  assert.notEqual(afterFailure[0].slug, camry, "a just-rejected subject must not lead again");
  const demoted = afterFailure.find(item => item.slug === camry);
  assert.ok(demoted, "it must stay on the list, not be banned");
  assert.ok(demoted.reasons.some(reason => /rejected at review/.test(reason)),
    "the run log has to be able to explain the demotion");

  // Once the window passes it is a normal candidate again.
  assert.equal(rank(new Date(now - 45 * day).toISOString())[0].slug, camry,
    "the penalty has to expire");
});

test("a subject already tried this run is not offered again", () => {
  const vehicles = [
    { year: 2018, make: "Toyota", model: "Camry", complaints: 731, recalls: 8 },
    { year: 2020, make: "Honda", model: "Accord", complaints: 90, recalls: 2 }
  ];
  const first = pickKeyword({ vehicles, posts: [], ledger: { posts: [], failures: [] } });
  const second = pickKeyword({
    vehicles, posts: [], ledger: { posts: [], failures: [] },
    excludeSlugs: new Set([first.slug])
  });
  assert.notEqual(second.slug, first.slug, "the run would retry the subject it just failed");
});

/* ── rendered output ──────────────────────────────────────────── */
// Builds its own fixture into its own directory. Test files run as parallel processes, so
// sharing dist/ with build.test.mjs meant reading a directory the other process was midway
// through rewriting — the test either exploded on a missing file or skipped itself into being
// worthless. KICKTIRES_OUT keeps the two apart.
test("a published post is served as static HTML with its metadata", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "kicktires-blog-"));
  const run = script => execFileSync(process.execPath, [script], {
    cwd: ROOT, stdio: "pipe",
    env: {
      ...process.env, KICKTIRES_OUT: out,
      GA_MEASUREMENT_ID: "G-TEST123", ADSENSE_CLIENT: "ca-pub-1234567890123456"
    }
  });
  try {
    run("build.mjs");
    run("blog-build.mjs");
    assertBlogOutput(out);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

function assertBlogOutput(dir) {
  const list = fs.readFileSync(path.join(dir, "blog", "index.html"), "utf8");
  assert.match(list, /Used car research/);

  // blog-build.mjs writes its own <head> rather than reusing build.mjs's, so a tag added to
  // the rest of the site does not reach these pages. It shipped with the AdSense ownership
  // meta but no loader, which left the pages the blog exists to attract traffic to serving
  // no ads. Checked on the list page and on every post.
  for (const file of [["blog", "index.html"], ["methodology", "index.html"],
    ["author", "kicktires-editorial", "index.html"]]) {
    const html = fs.readFileSync(path.join(dir, ...file), "utf8");
    assert.match(html, /googletagmanager\.com\/gtag\/js\?id=G-TEST123/, `${file.join("/")}: no GA4`);
    assert.match(html, /adsbygoogle\.js\?client=ca-pub-1234567890123456/, `${file.join("/")}: no AdSense loader`);
  }

  const slugs = fs.readdirSync(path.join(dir, "blog"), { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => entry.name);
  for (const slug of slugs) {
    const html = fs.readFileSync(path.join(dir, "blog", slug, "index.html"), "utf8");
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    const types = blocks.map(block => JSON.parse(block[1])["@type"]);
    assert.equal(types.includes("BlogPosting"), true, `${slug} has no BlogPosting`);
    assert.equal(types.includes("BreadcrumbList"), true, `${slug} has no BreadcrumbList`);
    assert.match(html, new RegExp(`rel="canonical" href="[^"]*/blog/${slug}/"`));
    assert.match(html, /Analyze a listing/, `${slug} has no analyzer CTA`);
    assert.match(html, /<time datetime="/, `${slug} has no published date`);
    // The body has to be in the HTML, not fetched later.
    assert.equal(html.includes('<div class="bl-body">'), true);
    assert.equal(html.length > 4000, true, `${slug} looks empty`);
    assert.match(html, /googletagmanager\.com\/gtag\/js\?id=G-TEST123/, `${slug}: no GA4`);
    assert.match(html, /adsbygoogle\.js\?client=ca-pub-1234567890123456/, `${slug}: no AdSense loader`);
  }
  const read = (...parts) => fs.readFileSync(path.join(dir, ...parts), "utf8");
  assert.match(read("methodology", "index.html"), /How we research a used car/);
  assert.match(read("author", "kicktires-editorial", "index.html"), /KickTires Editorial/);
  assert.match(read("blog", "rss.xml"), /<rss version="2.0"/);
}

test("word counting reads the body a reader actually sees", () => {
  assert.equal(wordCount({ body: [{ paragraphs: ["one two three"], bullets: ["four five"] }] }), 5);
});
