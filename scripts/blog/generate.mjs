// The pipeline. keyword -> evidence -> image -> draft -> review -> publish, with every stage
// able to stop the run. Nothing reaches blog/posts/ that has not passed both review gates.
//
// Rewrites are capped at two. A draft that fails twice is logged with the keyword that
// produced it and abandoned; it is never published in part.

import fs from "node:fs";
import { collectEvidence, saveEvidence } from "./evidence.mjs";
import { acquireHeroImage } from "./images.mjs";
import { writeDraft, draftToPost } from "./write.mjs";
import { codeReview, modelReview } from "./review.mjs";
import { pickKeyword } from "./keywords.mjs";
import { providerStatus } from "./model-client.mjs";
import {
  appendLedger, readPosts, writePost, writeRunLog, readLedger, POSTS_DIR
} from "./schema.mjs";

const MAX_ATTEMPTS = 3;   // one draft plus two rewrites

const arg = name => {
  const hit = process.argv.find(value => value === `--${name}` || value.startsWith(`--${name}=`));
  if (!hit) return null;
  return hit.includes("=") ? hit.split("=").slice(1).join("=") : "true";
};

function relatedFor(post, posts) {
  const scored = posts
    .filter(other => other.slug !== post.slug && other.status === "published")
    .map(other => ({
      other,
      score: (other.make.toLowerCase() === post.make.toLowerCase() ? 2 : 0)
        + (other.model.toLowerCase() === post.model.toLowerCase() ? 2 : 0)
        + (Math.abs(other.year - post.year) <= 3 ? 1 : 0)
    }))
    .sort((a, b) => b.score - a.score).slice(0, 3);
  const related = scored.map(entry => ({ href: `/blog/${entry.other.slug}/`, title: entry.other.title }));
  // Always send the reader somewhere that uses the site, even on the first post.
  related.push({ href: "/cars/", title: "All model-year research on KickTires" });
  return related.slice(0, 4);
}

export async function generateOnce(options = {}) {
  const startedAt = new Date().toISOString();
  const report = {
    startedAt, stages: [], status: "failed", keyword: null, slug: null, failures: [],
    provider: providerStatus()
  };
  const stage = (name, detail) => { report.stages.push({ name, at: new Date().toISOString(), detail }); };

  try {
    const keyword = options.keyword || pickKeyword();
    if (!keyword) throw permanent("no_keyword_available", "every candidate is already published");
    report.keyword = {
      primaryKeyword: keyword.primaryKeyword, intent: keyword.intent,
      score: keyword.score, reasons: keyword.reasons, vehicle: keyword.vehicle
    };
    stage("keyword", keyword.primaryKeyword);

    const evidence = await collectEvidence(keyword.vehicle, options.fetchOptions || {});
    if (!options.dryRun) saveEvidence(evidence);
    stage("evidence", `${evidence.complaints.total} complaints, ${evidence.recalls.total} recalls, `
      + `resolved as ${evidence.vehicle.resolvedModels.join(", ")}`);

    const slug = keyword.slug;
    const hero = await acquireHeroImage(evidence, slug, options.imageOptions || {});
    stage("image", `${hero.kind}: ${hero.src}`);

    const posts = readPosts();
    let post = null;
    let lastFailures = [];

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const draft = await writeDraft(evidence, keyword, options.modelOptions || {});
      const candidate = draftToPost(draft, {
        evidence, keyword, hero, related: relatedFor({ ...keyword.vehicle, slug }, posts)
      });

      const code = codeReview(candidate, evidence, { existingPosts: posts });
      if (code.failures.length) {
        lastFailures = code.failures.map(item => `${item.check}: ${item.detail}`);
        stage("review", `attempt ${attempt} failed code review (${code.failures.length})`);
        continue;
      }

      let ai = { verdict: "pass", failures: [], warnings: [], notes: "skipped" };
      if (options.skipModelReview !== true) {
        ai = await modelReview(candidate, evidence, options.modelOptions || {});
      }
      if (ai.verdict !== "pass" || ai.failures.length) {
        lastFailures = ai.failures.map(item => `editorial: ${item.why} — "${item.quote}"`);
        stage("review", `attempt ${attempt} failed editorial review (${ai.failures.length})`);
        continue;
      }

      candidate.qualityReport = {
        status: "passed", reviewedAt: new Date().toISOString(), attempt,
        words: code.words, warnings: [...code.warnings, ...ai.warnings], editorialNotes: ai.notes,
        checks: { code: "passed", editorial: options.skipModelReview ? "skipped" : "passed" }
      };
      candidate.status = "published";
      post = candidate;
      stage("review", `passed on attempt ${attempt} (${code.words} words)`);
      break;
    }

    if (!post) {
      report.failures = lastFailures;
      report.status = "review_failed";
      stage("publish", "not published: review failed after all attempts");
      return finish(report, options);
    }

    report.slug = post.slug;
    if (options.dryRun) {
      report.status = "dry_run";
      report.preview = { title: post.title, description: post.description,
        words: post.qualityReport.words, hero: post.heroImage.src };
      stage("publish", "dry run: nothing written");
      return finish(report, options);
    }

    writePost(post);
    appendLedger(post);
    report.status = "published";
    report.post = { title: post.title, slug: post.slug, words: post.qualityReport.words };
    stage("publish", `wrote ${POSTS_DIR}/${post.slug}.json`);
    return finish(report, options);
  } catch (error) {
    report.status = error.permanent ? "permanent_failure" : "failed";
    report.failures = [String(error.message || error)];
    stage("error", String(error.message || error));
    return finish(report, options);
  }
}

function permanent(code, detail) {
  const error = new Error(`${code}: ${detail}`);
  error.permanent = true;
  return error;
}

function finish(report, options) {
  report.finishedAt = new Date().toISOString();
  if (options.dryRun !== true) {
    report.logFile = writeRunLog(report.startedAt.replace(/[:.]/g, "-"), report);
  }
  return report;
}

/* ── CLI ──────────────────────────────────────────────────────── */
const invoked = process.argv[1] && process.argv[1].endsWith("generate.mjs");
if (invoked) {
  const count = Math.max(1, Math.min(5, Number(process.env.BLOG_POSTS_PER_RUN || arg("count") || 1)));
  const autoPublish = String(process.env.BLOG_AUTO_PUBLISH || "").toLowerCase() === "true";
  // Writing to the repo takes an explicit opt-in. Until BLOG_AUTO_PUBLISH is set the
  // pipeline runs end to end and reports, which is what the first runs are for.
  const dryRun = arg("dry-run") === "true" || !autoPublish;
  if (dryRun) console.log("[blog:generate] dry run (set BLOG_AUTO_PUBLISH=true to write posts)");

  const results = [];
  for (let index = 0; index < count; index++) {
    // eslint-disable-next-line no-await-in-loop
    const report = await generateOnce({ dryRun });
    results.push(report);
    console.log(`[blog:generate] ${report.status}`
      + (report.keyword ? ` · ${report.keyword.primaryKeyword}` : "")
      + (report.slug ? ` · ${report.slug}` : ""));
    for (const failure of report.failures) console.error(`  ! ${failure}`);
    if (report.status !== "published" && report.status !== "dry_run") break;
  }

  const published = results.filter(report => report.status === "published").length;
  console.log(`[blog:generate] ${published}/${results.length} published`);
  if (fs.existsSync("blog/runs")) console.log("[blog:generate] run logs in blog/runs/");
  const blocked = results.some(report =>
    report.status === "failed" || report.status === "permanent_failure");
  process.exit(blocked ? 1 : 0);
}
