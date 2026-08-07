import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("build emits GA4 and AdSense with privacy-safe analysis events", () => {
  execFileSync(process.execPath, ["build.mjs"], {
    cwd: ROOT,
    env: {
      ...process.env,
      GA_MEASUREMENT_ID: "G-TEST123",
      ADSENSE_CLIENT: "ca-pub-1234567890123456"
    },
    stdio: "pipe"
  });

  const pages = [
    "index.html", "cars/index.html", "about/index.html", "privacy/index.html",
    "cars/2019-nissan-altima-problems/index.html",
    "cars/2018-toyota-camry-problems/index.html",
    "cars/2019-honda-civic-problems/index.html",
    "cars/2019-honda-cr-v-problems/index.html",
    "cars/2017-jeep-grand-cherokee-problems/index.html"
  ];
  for (const page of pages) {
    const html = fs.readFileSync(path.join(ROOT, "dist", page), "utf8");
    assert.match(html, /googletagmanager\.com\/gtag\/js\?id=G-TEST123/);
    assert.match(html, /gtag\("config","G-TEST123"\)/);
    assert.match(html, /google-adsense-account" content="ca-pub-1234567890123456/);
    assert.match(html, /adsbygoogle\.js\?client=ca-pub-1234567890123456/);
  }

  const home = fs.readFileSync(path.join(ROOT, "dist/index.html"), "utf8");
  assert.match(home, /listing_check_started/);
  assert.match(home, /listing_analysis_completed/);
  assert.match(home, /listing_analysis_failed/);
  assert.match(home, /Live deal check/);
  assert.match(home, /Most checks finish in 20–40 seconds/);
  assert.match(home, /Still working\. Nothing is stuck\./);
  assert.match(home, /Checking comparable listings/);
  assert.match(home, /Live market comparison/);
  assert.match(home, /Market verdict unavailable/);
  assert.match(home, /Incomplete listing/);
  assert.match(home, /Paste the listing/);
  assert.match(home, /class="deal-metrics"/);
  assert.match(home, /class="loading-steps"/);
  assert.match(home, /const defaultState = stateMatch/);
  assert.ok(home.includes('match(/,\\s*([A-Z]{2})(?:\\s+\\d{5})?\\b/)'));
  assert.doesNotMatch(home, /listing_text|seller_notes/);
  assert.doesNotMatch(home, /data-ad-slot|0000000000|1111111111/);

  const privacy = fs.readFileSync(path.join(ROOT, "dist/privacy/index.html"), "utf8");
  assert.match(privacy, /We do not send the listing text/);
  assert.match(privacy, /configured to show ads served by Google AdSense/);

  const ads = fs.readFileSync(path.join(ROOT, "dist/ads.txt"), "utf8");
  assert.equal(ads, "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n");

  const generated = JSON.parse(fs.readFileSync(path.join(ROOT, "generated.json"), "utf8"));
  assert.equal(Object.keys(generated).length, 40);
  const modelDirectories = fs.readdirSync(path.join(ROOT, "dist/cars"), { withFileTypes: true })
    .filter(entry => entry.isDirectory());
  assert.equal(modelDirectories.length, 41);

  const evidencePage = fs.readFileSync(path.join(ROOT,
    "dist/cars/2020-toyota-camry-problems/index.html"), "utf8");
  assert.match(evidencePage, /The federal record, without the folklore/);
  assert.match(evidencePage, /20V682000/);
  assert.match(evidencePage, /model_analyzer_clicked/);
  assert.match(evidencePage, /Compare nearby model years/);

  const directory = fs.readFileSync(path.join(ROOT, "dist/cars/index.html"), "utf8");
  assert.match(directory, /41 model-year pages/);
  assert.match(directory, /class="model-group"/);

  const sitemap = fs.readFileSync(path.join(ROOT, "dist/sitemap.xml"), "utf8");
  assert.equal((sitemap.match(/<url>/g) || []).length, 45);
  assert.match(sitemap, /2018-ford-f150-problems/);
  assert.doesNotMatch(sitemap, /2018-ford-f-150-problems/);
});
