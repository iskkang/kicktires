// Re-runs the code gate over everything already in blog/posts/, against the evidence file
// each post was written from. Used by npm run blog:validate and by CI before a commit, so a
// post cannot rot into a broken state through an edit that never went near the generator.

import fs from "node:fs";
import path from "node:path";
import { readPosts, EVIDENCE_DIR } from "./schema.mjs";
import { codeReview } from "./review.mjs";

const norm = value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function evidenceFor(post) {
  const file = path.join(EVIDENCE_DIR, `${post.year}-${norm(post.make)}-${norm(post.model)}.json`);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

export function validateAll(posts = readPosts()) {
  const results = [];
  for (const post of posts) {
    const evidence = evidenceFor(post);
    const review = codeReview(post, evidence, { existingPosts: posts });
    const failures = review.failures.map(item => `${item.check}: ${item.detail}`);
    if (!evidence) failures.push("evidence_missing: no stored snapshot for this post");
    results.push({
      slug: post.slug, status: post.status, words: review.words,
      ok: failures.length === 0, failures,
      warnings: review.warnings.map(item => `${item.check}: ${item.detail}`)
    });
  }
  return results;
}

const invoked = process.argv[1] && process.argv[1].endsWith("validate.mjs");
if (invoked) {
  const posts = readPosts();
  if (!posts.length) {
    console.log("[blog:validate] no posts yet — nothing to check");
    process.exit(0);
  }
  const results = validateAll(posts);
  for (const result of results) {
    console.log(`${result.ok ? "ok  " : "FAIL"} ${result.slug} (${result.status}, ${result.words} words)`);
    for (const failure of result.failures) console.error(`       ! ${failure}`);
    for (const warning of result.warnings) console.log(`       ~ ${warning}`);
  }
  const bad = results.filter(result => !result.ok && result.status === "published");
  console.log(`[blog:validate] ${results.length - bad.length}/${results.length} clean`);
  process.exit(bad.length ? 1 : 0);
}
