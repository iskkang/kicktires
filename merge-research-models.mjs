import fs from "node:fs";

const BASE = "research-models.json";
const PREFIX = "research-models-phase2-batch";

const base = JSON.parse(fs.readFileSync(BASE, "utf8"));
const batchFiles = fs.readdirSync(".")
  .filter(name => name.startsWith(PREFIX) && name.endsWith(".json"))
  .sort();

const merged = new Map();
for (const model of base.models || []) merged.set(model.slug, model);
for (const file of batchFiles) {
  const batch = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const model of batch.models || []) merged.set(model.slug, model);
}

const out = {
  version: Math.max(Number(base.version || 1), 4),
  description: "Model-level research pages prioritized around US used-car search intent. Phase 2 expands high-intent luxury and EV coverage while preserving federal-data quality gates.",
  models: [...merged.values()]
};

fs.writeFileSync(BASE, JSON.stringify(out, null, 2) + "\n");
console.log(`[merge-research-models] ${out.models.length} model families from ${1 + batchFiles.length} source files`);
