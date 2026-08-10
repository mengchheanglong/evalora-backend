import { test } from "node:test";
import { strict as assert } from "node:assert";
import type { ModuleType } from "../src/domain/evalora.types";
import {
  MIN_MODULE_WEIGHT,
  MIN_REQUIRED_MODULE_WEIGHT,
  TOTAL_WEIGHT,
} from "../src/modules/templates/drafts/draft.constants";
import {
  moduleScore,
  normalizeSignals,
  normalizeWeights,
  type WeightableModule,
} from "../src/modules/templates/drafts/weighting";

function moduleWith(type: ModuleType, signals: Partial<Parameters<typeof normalizeSignals>[0]>): WeightableModule {
  return { type, weightSignals: normalizeSignals(signals) };
}

const MODULE_TYPES: ModuleType[] = [
  "ai_interview",
  "coding",
  "debugging",
  "work_style",
  "behavioral",
  "leadership",
  "communication",
  "problem_solving",
];

test("weights always total exactly 100 across many signal shapes", () => {
  // Deterministic pseudo-random sweep: rounding bugs only show up on specific
  // fractional splits, so a single hand-picked case would not catch them.
  let seed = 7;
  const nextInt = (max: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return (seed >>> 8) % max;
  };

  for (let iteration = 0; iteration < 400; iteration += 1) {
    const count = 2 + nextInt(7);
    const modules = Array.from({ length: count }, (_, index) =>
      moduleWith(MODULE_TYPES[index % MODULE_TYPES.length], {
        roleImportance: 1 + nextInt(5),
        riskIfWeak: 1 + nextInt(5),
        evidenceVolume: 1 + nextInt(5),
        difficulty: 1 + nextInt(5),
        essential: nextInt(2) === 0,
      }),
    );

    const { weights } = normalizeWeights(modules);
    const total = weights.reduce((sum, weight) => sum + weight, 0);

    assert.equal(weights.length, count);
    assert.equal(total, TOTAL_WEIGHT, `iteration ${iteration} totalled ${total}`);
    for (const weight of weights) {
      assert.ok(Number.isInteger(weight), `iteration ${iteration} produced a non-integer weight ${weight}`);
      assert.ok(weight >= MIN_MODULE_WEIGHT, `iteration ${iteration} produced ${weight}, under the floor`);
    }
  }
});

test("a single module takes the whole weight", () => {
  const { weights } = normalizeWeights([moduleWith("coding", { roleImportance: 1 })]);
  assert.deepEqual(weights, [TOTAL_WEIGHT]);
});

test("higher-rated modules receive more weight than lower-rated ones", () => {
  const { weights } = normalizeWeights([
    moduleWith("coding", { roleImportance: 5, riskIfWeak: 5, evidenceVolume: 5, difficulty: 5, essential: true }),
    moduleWith("communication", { roleImportance: 3, riskIfWeak: 3, evidenceVolume: 3, difficulty: 3 }),
    moduleWith("work_style", { roleImportance: 1, riskIfWeak: 1, evidenceVolume: 1, difficulty: 1 }),
  ]);

  assert.ok(weights[0] > weights[1], `expected ${weights[0]} > ${weights[1]}`);
  assert.ok(weights[1] > weights[2], `expected ${weights[1]} > ${weights[2]}`);
  assert.equal(weights.reduce((sum, weight) => sum + weight, 0), TOTAL_WEIGHT);
});

test("an essential module is lifted to the required floor instead of being squeezed out", () => {
  const { weights } = normalizeWeights([
    moduleWith("coding", { roleImportance: 5, riskIfWeak: 5, evidenceVolume: 5, difficulty: 5 }),
    moduleWith("debugging", { roleImportance: 5, riskIfWeak: 5, evidenceVolume: 5, difficulty: 5 }),
    moduleWith("coding", { roleImportance: 5, riskIfWeak: 5, evidenceVolume: 5, difficulty: 5 }),
    // Rated as low as the scale allows, but marked essential.
    moduleWith("work_style", { roleImportance: 1, riskIfWeak: 1, evidenceVolume: 1, difficulty: 1, essential: true }),
  ]);

  assert.ok(
    weights[3] >= MIN_REQUIRED_MODULE_WEIGHT,
    `essential module got ${weights[3]}, under the ${MIN_REQUIRED_MODULE_WEIGHT} floor`,
  );
  assert.equal(weights.reduce((sum, weight) => sum + weight, 0), TOTAL_WEIGHT);
});

test("no module falls below the base floor even when it rates lowest", () => {
  const modules = [
    moduleWith("coding", { roleImportance: 5, riskIfWeak: 5, evidenceVolume: 5, difficulty: 5, essential: true }),
    ...Array.from({ length: 7 }, () => moduleWith("work_style", { roleImportance: 1, riskIfWeak: 1, evidenceVolume: 1, difficulty: 1 })),
  ];

  const { weights } = normalizeWeights(modules);
  assert.equal(weights.reduce((sum, weight) => sum + weight, 0), TOTAL_WEIGHT);
  for (const weight of weights) assert.ok(weight >= MIN_MODULE_WEIGHT, `got ${weight}`);
});

test("manual weights are honoured as relative intent and still total 100", () => {
  const modules = [
    moduleWith("coding", { roleImportance: 3 }),
    moduleWith("communication", { roleImportance: 3 }),
    moduleWith("work_style", { roleImportance: 3 }),
  ];

  // A reviewer typing 90 into one module must not produce a 110% assessment.
  const { weights } = normalizeWeights(modules, [90, 5, 5]);

  assert.equal(weights.reduce((sum, weight) => sum + weight, 0), TOTAL_WEIGHT);
  assert.ok(weights[0] > weights[1] && weights[0] > weights[2], `expected the manual weight to dominate: ${weights.join(",")}`);
  assert.ok(weights[1] >= MIN_MODULE_WEIGHT && weights[2] >= MIN_MODULE_WEIGHT);
});

test("modules with no usable manual weight fall back to their signal score", () => {
  const modules = [
    moduleWith("coding", { roleImportance: 5, riskIfWeak: 5, evidenceVolume: 5, difficulty: 5 }),
    moduleWith("work_style", { roleImportance: 1, riskIfWeak: 1, evidenceVolume: 1, difficulty: 1 }),
  ];

  const { weights } = normalizeWeights(modules, [undefined, 0]);
  assert.equal(weights.reduce((sum, weight) => sum + weight, 0), TOTAL_WEIGHT);
  assert.ok(weights[0] > weights[1]);
});

test("too many modules to satisfy the floor falls back to an even split and warns", () => {
  // 25 modules cannot each hold 5%. The caller (normalizeDraft) caps module count
  // long before this, but the maths still has to degrade visibly rather than lie.
  const modules = Array.from({ length: 25 }, () => moduleWith("behavioral", { roleImportance: 3 }));

  const { weights, warnings } = normalizeWeights(modules);
  assert.equal(weights.reduce((sum, weight) => sum + weight, 0), TOTAL_WEIGHT);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /split evenly/i);
});

test("every module marked essential lowers the floor rather than overflowing the total", () => {
  // 11 essential modules would need 110% at the required floor.
  const modules = Array.from({ length: 11 }, () => moduleWith("leadership", { roleImportance: 4, essential: true }));

  const { weights, warnings } = normalizeWeights(modules);
  assert.equal(weights.reduce((sum, weight) => sum + weight, 0), TOTAL_WEIGHT);
  for (const weight of weights) assert.ok(weight >= MIN_MODULE_WEIGHT, `got ${weight}`);
  assert.match(warnings.join(" "), /essential/i);
});

test("signals are clamped so out-of-range or missing ratings cannot skew the split", () => {
  const wild = normalizeSignals({ roleImportance: 99, riskIfWeak: -4, evidenceVolume: Number.NaN, difficulty: undefined });
  assert.deepEqual(wild, { roleImportance: 5, riskIfWeak: 1, evidenceVolume: 3, difficulty: 3, essential: false });

  const nonNumeric = normalizeSignals({ roleImportance: "5" as unknown as number });
  assert.equal(nonNumeric.roleImportance, 3);
});

test("an essential module scores above an identically rated optional one", () => {
  const optional = moduleScore(moduleWith("coding", { roleImportance: 4, riskIfWeak: 4, evidenceVolume: 4, difficulty: 4 }));
  const essential = moduleScore(
    moduleWith("coding", { roleImportance: 4, riskIfWeak: 4, evidenceVolume: 4, difficulty: 4, essential: true }),
  );
  assert.ok(essential > optional, `${essential} should exceed ${optional}`);
});

test("no modules produces no weights", () => {
  assert.deepEqual(normalizeWeights([]), { weights: [], warnings: [] });
});
