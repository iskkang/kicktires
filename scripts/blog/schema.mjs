// The shape every published post must have, and the ledger that stops one being written
// twice. Validation is hand-rolled rather than pulled from a schema library: the generator
// runs unattended in CI, and a dependency that fails to install there would take the whole
// pipeline down for no gain over sixty lines of checks.

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export const BLOG_DIR = "blog";
export const POSTS_DIR = path.join(BLOG_DIR, "posts");
export const EVIDENCE_DIR = path.join(BLOG_DIR, "evidence");
export const IMAGES_DIR = path.join(BLOG_DIR, "images");
export const RUNS_DIR = path.join(BLOG_DIR, "runs");
export const LEDGER_FILE = path.join(BLOG_DIR, "ledger.json");

export const STATUSES = ["draft", "review_failed", "published"];

export const hash = value => createHash("sha256").update(String(value)).digest("hex").slice(0, 32);

export const slugify = value => String(value || "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);

const isText = (value, min, max) =>
  typeof value === "string" && value.trim().length >= min && value.trim().length <= max;
const isArrayOf = (value, check, min = 0) =>
  Array.isArray(value) && value.length >= min && value.every(check);
const isIsoDate = value => typeof value === "string"
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) && !Number.isNaN(Date.parse(value));

// A body section. Sections are structured rather than one blob of prose so the reviewer can
// check the parts that carry numbers separately from the parts that carry judgement.
function sectionProblems(section, index) {
  const where = `body[${index}]`;
  const problems = [];
  if (!section || typeof section !== "object") return [`${where} is not an object`];
  if (!isText(section.heading, 3, 120)) problems.push(`${where}.heading missing or too long`);
  if (!isArrayOf(section.paragraphs, p => isText(p, 20, 1200), 1)) {
    problems.push(`${where}.paragraphs must be 1+ strings of 20-1200 chars`);
  }
  if (section.bullets !== undefined && !isArrayOf(section.bullets, b => isText(b, 5, 400))) {
    problems.push(`${where}.bullets must be strings of 5-400 chars`);
  }
  if (section.sourceIds !== undefined && !isArrayOf(section.sourceIds, s => isText(s, 1, 80))) {
    problems.push(`${where}.sourceIds must be strings`);
  }
  return problems;
}

export function validatePost(post) {
  const problems = [];
  const need = (ok, message) => { if (!ok) problems.push(message); };

  need(post && typeof post === "object", "post is not an object");
  if (!post || typeof post !== "object") return problems;

  need(isText(post.title, 15, 110), "title must be 15-110 chars");
  need(isText(post.slug, 5, 90) && post.slug === slugify(post.slug), "slug must be a lowercase kebab slug");
  need(isText(post.description, 70, 175), "description must be 70-175 chars");
  need(isIsoDate(post.datePublished), "datePublished must be an ISO-8601 UTC timestamp");
  need(isIsoDate(post.dateModified), "dateModified must be an ISO-8601 UTC timestamp");
  need(isText(post.author, 3, 80), "author missing");
  need(isText(post.make, 1, 40), "make missing");
  need(isText(post.model, 1, 40), "model missing");
  need(Number.isInteger(post.year) && post.year >= 1990 && post.year <= new Date().getUTCFullYear() + 2,
    "year must be a plausible model year");
  need(isText(post.primaryKeyword, 5, 120), "primaryKeyword missing");
  need(isArrayOf(post.secondaryKeywords, k => isText(k, 3, 120)), "secondaryKeywords must be strings");
  need(post.heroImage && isText(post.heroImage.src, 5, 240), "heroImage.src missing");
  need(post.heroImage && isText(post.heroImage.alt, 10, 240), "heroImage.alt missing");
  need(isText(post.imageCredit, 2, 240), "imageCredit missing");
  need(isText(post.imageLicense, 2, 120), "imageLicense missing");
  need(isArrayOf(post.sourceIds, s => isText(s, 1, 80), 1), "sourceIds must list at least one source");
  need(isText(post.sourceSnapshotHash, 8, 80), "sourceSnapshotHash missing");
  need(post.qualityReport && typeof post.qualityReport === "object", "qualityReport missing");
  need(isArrayOf(post.body, () => true, 3), "body must have at least 3 sections");
  need(isArrayOf(post.relatedArticles, r => r && isText(r.href, 1, 240) && isText(r.title, 3, 160)),
    "relatedArticles must be {href,title} objects");
  need(STATUSES.includes(post.status), `status must be one of ${STATUSES.join(", ")}`);

  if (Array.isArray(post.body)) {
    post.body.forEach((section, index) => problems.push(...sectionProblems(section, index)));
  }
  return problems;
}

export const wordCount = post => (post?.body || [])
  .flatMap(section => [...(section.paragraphs || []), ...(section.bullets || [])])
  .join(" ").trim().split(/\s+/).filter(Boolean).length;

/* ── ledger ───────────────────────────────────────────────────── */
// Published slugs and primary keywords, so a scheduled run cannot quietly republish a
// subject under a new filename. Read before keyword selection, written only on publish.
export function readLedger() {
  if (!fs.existsSync(LEDGER_FILE)) return { posts: [] };
  try { return JSON.parse(fs.readFileSync(LEDGER_FILE, "utf8")); }
  catch { return { posts: [] }; }
}

export function ledgerHas(ledger, { slug, primaryKeyword }) {
  return (ledger.posts || []).some(entry =>
    (slug && entry.slug === slug)
    || (primaryKeyword && normalizeKeyword(entry.primaryKeyword) === normalizeKeyword(primaryKeyword)));
}

export function appendLedger(post) {
  const ledger = readLedger();
  ledger.posts = (ledger.posts || []).filter(entry => entry.slug !== post.slug);
  ledger.posts.push({
    slug: post.slug,
    primaryKeyword: post.primaryKeyword,
    title: post.title,
    year: post.year, make: post.make, model: post.model,
    datePublished: post.datePublished
  });
  fs.mkdirSync(BLOG_DIR, { recursive: true });
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2) + "\n");
  return ledger;
}

export const normalizeKeyword = value => String(value || "").toLowerCase()
  .replace(/[^a-z0-9]+/g, " ").trim();

export function readPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  return fs.readdirSync(POSTS_DIR).filter(name => name.endsWith(".json"))
    .map(name => {
      try { return JSON.parse(fs.readFileSync(path.join(POSTS_DIR, name), "utf8")); }
      catch { return null; }
    }).filter(Boolean);
}

export function writePost(post) {
  fs.mkdirSync(POSTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(POSTS_DIR, `${post.slug}.json`), JSON.stringify(post, null, 2) + "\n");
}

export function writeRunLog(name, report) {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  const file = path.join(RUNS_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
  return file;
}
