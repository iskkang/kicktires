// ads-units.mjs places the display unit into already-built HTML, so it is tested against a
// real build rather than against its own output string. It runs last in the chain for a
// reason: everything before it rewrites pages, and an earlier insertion point would be
// silently overwritten.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CLIENT = "ca-pub-1234567890123456";
const SLOT = "9988776655";

const build = () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "kicktires-ads-"));
  const run = script => execFileSync(process.execPath, [script], {
    cwd: ROOT, stdio: "pipe",
    env: { ...process.env, KICKTIRES_OUT: out, ADSENSE_CLIENT: CLIENT, ADSENSE_SLOT: SLOT }
  });
  run("build.mjs");
  run("blog-build.mjs");
  run("ads-units.mjs");
  return out;
};

test("only published editorial articles carry an ad unit", () => {
  const out = build();
  try {
    const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
      entry.isDirectory() ? walk(path.join(dir, entry.name))
        : (entry.name.endsWith(".html") ? [path.join(dir, entry.name)] : []));
    const pages = walk(out);
    assert.ok(pages.length > 40, `only ${pages.length} pages built`);

    let placed = 0;
    for (const file of pages) {
      const html = fs.readFileSync(file, "utf8");
      const relative = path.relative(out, file).split(path.sep).join("/");
      const units = (html.match(/class="adsbygoogle"/g) || []).length;
      const eligible = /^blog\/[^/]+\/index\.html$/.test(relative)
        && html.includes('class="bl-body"')
        && !html.includes('<meta name="robots" content="noindex');

      if (!eligible) {
        assert.equal(units, 0, `${relative}: ad unit on a non-article screen`);
        assert.equal((html.match(/adsbygoogle\.js/g) || []).length, 0,
          `${relative}: AdSense loader on a non-article screen`);
        continue;
      }
      assert.equal(units, 1, `${relative}: expected exactly one unit, found ${units}`);
      placed++;

      // One loader, not two. Pasting AdSense's snippet verbatim would add a second copy
      // alongside the one build.mjs already puts in the head.
      assert.equal((html.match(/adsbygoogle\.js/g) || []).length, 1, `${relative}: loader is not unique`);
      assert.equal((html.match(/adsbygoogle=window\.adsbygoogle/g) || []).length, 1,
        `${relative}: expected exactly one push()`);
      assert.match(html, new RegExp(`data-ad-client="${CLIENT}"`), `${relative}: wrong client`);
      assert.match(html, new RegExp(`data-ad-slot="${SLOT}"`), `${relative}: wrong slot`);

      const unit = html.indexOf('<div class="kt-ad"');
      const main = html.indexOf("</main>");
      const footer = html.indexOf("<footer");
      assert.ok(unit > 0 && unit < main && main < footer,
        `${relative}: unit is not between the content and the footer`);
    }
    assert.ok(placed >= 5, `only ${placed} published articles got a unit`);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

// Netlify reruns the whole chain on every deploy, and a partial local run is normal while
// developing. A second pass must not stack a second unit onto the same page.
test("running the placement twice does not stack units", () => {
  const out = build();
  try {
    execFileSync(process.execPath, ["ads-units.mjs"], {
      cwd: ROOT, stdio: "pipe",
      env: { ...process.env, KICKTIRES_OUT: out, ADSENSE_CLIENT: CLIENT, ADSENSE_SLOT: SLOT }
    });
    const slug = fs.readdirSync(path.join(out, "blog"), { withFileTypes: true })
      .find(entry => entry.isDirectory()).name;
    const html = fs.readFileSync(path.join(out, "blog", slug, "index.html"), "utf8");
    assert.equal((html.match(/class="adsbygoogle"/g) || []).length, 1);
    assert.equal((html.match(/\.kt-ad\{/g) || []).length, 1, "the style block was added twice");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("a malformed client or slot fails the build rather than shipping a dead slot", () => {
  for (const bad of [{ ADSENSE_CLIENT: "pub-123" }, { ADSENSE_SLOT: "not-a-slot" }]) {
    assert.throws(() => execFileSync(process.execPath, ["ads-units.mjs"], {
      cwd: ROOT, stdio: "pipe",
      env: { ...process.env, KICKTIRES_OUT: "dist", ADSENSE_CLIENT: CLIENT, ADSENSE_SLOT: SLOT, ...bad }
    }), `${JSON.stringify(bad)} was accepted`);
  }
});
