import assert from "node:assert/strict";
import test from "node:test";

import { actionableComponents, riskForComponent } from "../component-risk.mjs";

test("complaint cards never borrow copy from a different component", () => {
  const components = [
    { component: "ENGINE", count: 192 },
    { component: "UNKNOWN OR OTHER", count: 119 },
    { component: "FUEL/PROPULSION SYSTEM", count: 89 },
    { component: "ELECTRICAL SYSTEM", count: 55 }
  ];
  const risks = [
    { b: "192 NHTSA complaint records for this model year carry the ENGINE tag." },
    { b: "89 NHTSA complaint records for this model year carry the FUEL/PROPULSION SYSTEM tag." },
    { b: "55 NHTSA complaint records for this model year carry the AIR BAGS tag." }
  ];

  const shown = actionableComponents(components, 3);
  assert.deepEqual(shown.map(item => item.component), [
    "ENGINE", "FUEL/PROPULSION SYSTEM", "ELECTRICAL SYSTEM"
  ]);
  assert.equal(riskForComponent(risks, "ENGINE"), risks[0]);
  assert.equal(riskForComponent(risks, "FUEL/PROPULSION SYSTEM"), risks[1]);
  assert.equal(riskForComponent(risks, "ELECTRICAL SYSTEM"), null);
  assert.equal(riskForComponent(risks, "UNKNOWN OR OTHER"), null);
});

test("new snapshots use their explicit component identity", () => {
  const risk = { component: "AIR BAGS", b: "Copy can change without breaking identity." };
  assert.equal(riskForComponent([risk], "AIR BAGS"), risk);
  assert.equal(riskForComponent([risk], "ELECTRICAL SYSTEM"), null);
});
