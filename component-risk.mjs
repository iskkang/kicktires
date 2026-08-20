// Keeps a rendered complaint heading tied to the explanation for the same NHTSA
// component. Generated profiles historically omitted an explicit component field on
// risk rows, so the matcher also understands the deterministic sentences those rows
// already contain. It never falls back to array position: the arrays intentionally use
// different filters and positional matching is what produced mislabeled cards.

const norm = value => String(value || "").toUpperCase().replace(/\s+/g, " ").trim();

export function actionableComponents(components, limit = 3) {
  const rows = Array.isArray(components) ? components : [];
  const actionable = rows.filter(item => norm(item?.component) !== "UNKNOWN OR OTHER");
  const fallback = rows.filter(item => norm(item?.component) === "UNKNOWN OR OTHER");
  return [...actionable, ...fallback].slice(0, limit);
}

export function riskForComponent(risks, component) {
  const wanted = norm(component);
  if (!wanted) return null;

  return (Array.isArray(risks) ? risks : []).find(risk => {
    if (norm(risk?.component) === wanted) return true;

    const evidence = Array.isArray(risk?.e)
      ? risk.e.map(row => Array.isArray(row) ? row[2] : "").join(" ") : "";
    const copy = norm(`${risk?.b || ""} ${evidence}`);
    return copy.includes(`CARRY THE ${wanted} TAG`)
      || copy.includes(`TAGGED ${wanted}.`);
  }) || null;
}
