import {
  MIN_MODULE_WEIGHT,
  MIN_REQUIRED_MODULE_WEIGHT,
  REQUIRED_MODULE_TYPES,
  TOTAL_WEIGHT,
} from "./draft.constants";
import type { DraftWeightSignals } from "./template-draft.types";
import type { ModuleType } from "../../../domain/evalora.types";

/**
 * Module weights are decided here, not by the model.
 *
 * The generator rates each module on five signals; this file turns those ratings
 * into positive integers that sum to exactly `TOTAL_WEIGHT`. Keeping the arithmetic
 * server-side means a model that hallucinates percentages, returns weights summing
 * to 87, or is steered by text inside an uploaded document still cannot produce a
 * published assessment with broken weighting.
 *
 * Contract: the caller must pass no more than `TOTAL_WEIGHT` modules — beyond that,
 * "every weight is a positive integer" and "the weights sum to 100" cannot both
 * hold. `normalizeDraft` caps module count long before that point.
 */

/** Relative pull of each signal. Role importance dominates; difficulty only breaks ties. */
const SIGNAL_COEFFICIENTS = {
  roleImportance: 3,
  riskIfWeak: 2.5,
  evidenceVolume: 2,
  difficulty: 1,
} as const;

/** Essential modules get a modest boost on top of their floor, not a free ride. */
const ESSENTIAL_MULTIPLIER = 1.25;

const MIN_SIGNAL = 1;
const MAX_SIGNAL = 5;
const NEUTRAL_SIGNAL = 3;

export interface WeightableModule {
  type: ModuleType;
  weightSignals: DraftWeightSignals;
}

export interface WeightNormalizationResult {
  /** One integer per input module, in the same order. */
  weights: number[];
  warnings: string[];
}

export function normalizeSignals(signals: Partial<DraftWeightSignals> | undefined): DraftWeightSignals {
  return {
    roleImportance: clampSignal(signals?.roleImportance),
    riskIfWeak: clampSignal(signals?.riskIfWeak),
    evidenceVolume: clampSignal(signals?.evidenceVolume),
    difficulty: clampSignal(signals?.difficulty),
    essential: signals?.essential === true,
  };
}

/** A module is required when the model called it essential or workspace policy says so. */
export function isRequiredModule(module: WeightableModule): boolean {
  return module.weightSignals.essential || REQUIRED_MODULE_TYPES.includes(module.type);
}

export function moduleFloor(module: WeightableModule): number {
  return isRequiredModule(module) ? MIN_REQUIRED_MODULE_WEIGHT : MIN_MODULE_WEIGHT;
}

export function moduleScore(module: WeightableModule): number {
  const { roleImportance, riskIfWeak, evidenceVolume, difficulty, essential } = module.weightSignals;
  const base =
    roleImportance * SIGNAL_COEFFICIENTS.roleImportance +
    riskIfWeak * SIGNAL_COEFFICIENTS.riskIfWeak +
    evidenceVolume * SIGNAL_COEFFICIENTS.evidenceVolume +
    difficulty * SIGNAL_COEFFICIENTS.difficulty;
  return base * (essential ? ESSENTIAL_MULTIPLIER : 1);
}

/**
 * @param overrides Per-module weights the user typed in the editor. A positive
 *   number replaces that module's signal-derived score, so manual weights are
 *   honoured as *relative intent* and still rebalanced to total 100 — a reviewer
 *   who types 90 into one module gets a coherent draft, not a broken one.
 */
export function normalizeWeights(
  modules: WeightableModule[],
  overrides?: Array<number | undefined>,
): WeightNormalizationResult {
  const warnings: string[] = [];
  if (modules.length === 0) return { weights: [], warnings };
  if (modules.length === 1) return { weights: [TOTAL_WEIGHT], warnings };

  const floors = resolveFloors(modules, warnings);
  if (!floors) {
    return { weights: evenSplit(modules.length), warnings };
  }

  const scores = modules.map((module, index) => resolveScore(module, overrides?.[index]));
  const shares = allocateWithFloors(scores, floors);
  const weights = roundToTotal(shares);

  const invariantWarning = describeInvariantBreach(weights, floors);
  if (invariantWarning) {
    // Arithmetic that cannot be trusted must not reach a reviewer as if it were
    // deliberate. An even split is defensible and visibly flagged.
    warnings.push(invariantWarning);
    return { weights: evenSplit(modules.length), warnings };
  }

  return { weights, warnings };
}

function resolveScore(module: WeightableModule, override: number | undefined): number {
  if (typeof override === "number" && Number.isFinite(override) && override > 0) return override;
  return moduleScore(module);
}

/**
 * Minimum share per module, or `undefined` when no floor set can fit inside the
 * total — at which point the caller has to fall back to an even split.
 */
function resolveFloors(modules: WeightableModule[], warnings: string[]): number[] | undefined {
  const requiredFloors = modules.map(moduleFloor);
  if (sum(requiredFloors) <= TOTAL_WEIGHT) return requiredFloors;

  // Too many modules claimed the higher "required" floor to all fit. Everyone
  // drops to the base floor; relative scores still decide who ends up larger.
  const baseFloors = modules.map(() => MIN_MODULE_WEIGHT);
  if (sum(baseFloors) <= TOTAL_WEIGHT) {
    warnings.push(
      `Too many modules were marked essential to give each one at least ${MIN_REQUIRED_MODULE_WEIGHT}%. Minimum weights were lowered to ${MIN_MODULE_WEIGHT}%.`,
    );
    return baseFloors;
  }

  warnings.push(
    `${modules.length} modules cannot each hold at least ${MIN_MODULE_WEIGHT}%. Weights were split evenly instead — remove a module or adjust the weights before publishing.`,
  );
  return undefined;
}

/**
 * Proportional allocation where no module may land under its floor.
 *
 * Modules that would fall short are pinned at their floor and removed from the
 * pool, then the remaining budget is re-shared among the rest. Each pass pins at
 * least one module, so this settles in at most `scores.length` passes.
 */
function allocateWithFloors(scores: number[], floors: number[]): number[] {
  const shares = new Array<number>(scores.length).fill(0);
  const pinned = new Array<boolean>(scores.length).fill(false);

  for (let pass = 0; pass <= scores.length; pass += 1) {
    const free = shares.map((_, index) => index).filter((index) => !pinned[index]);
    const pinnedTotal = shares.reduce((total, share, index) => (pinned[index] ? total + share : total), 0);
    const budget = TOTAL_WEIGHT - pinnedTotal;

    if (free.length === 0) {
      // Unreachable while sum(floors) <= TOTAL_WEIGHT, since some module must sit
      // at or above its floor. Kept so a future floor change degrades gracefully.
      if (budget > 0) distributeRemainder(shares, budget);
      break;
    }

    const freeScoreTotal = free.reduce((total, index) => total + scores[index], 0);
    for (const index of free) {
      shares[index] = freeScoreTotal > 0 ? (scores[index] / freeScoreTotal) * budget : budget / free.length;
    }

    const violators = free.filter((index) => shares[index] < floors[index]);
    if (violators.length === 0) break;
    for (const index of violators) {
      shares[index] = floors[index];
      pinned[index] = true;
    }
  }

  return shares;
}

function distributeRemainder(shares: number[], remainder: number): void {
  const total = sum(shares);
  for (let index = 0; index < shares.length; index += 1) {
    shares[index] += total > 0 ? (shares[index] / total) * remainder : remainder / shares.length;
  }
}

/**
 * Largest remainder rounding. Rounding each share independently would leave the
 * total at 99 or 101 often enough to matter, and "exactly 100" is the guardrail
 * the whole feature promises.
 *
 * Flooring never breaks a floor: shares are already >= an integer floor.
 */
function roundToTotal(shares: number[]): number[] {
  const floored = shares.map((share) => Math.floor(share));
  let remaining = TOTAL_WEIGHT - sum(floored);

  const byRemainder = shares
    .map((share, index) => ({ index, fraction: share - Math.floor(share) }))
    // Ties go to the earlier module so the same draft always weights the same way.
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);

  for (const entry of byRemainder) {
    if (remaining <= 0) break;
    floored[entry.index] += 1;
    remaining -= 1;
  }

  return floored;
}

function evenSplit(count: number): number[] {
  const base = Math.floor(TOTAL_WEIGHT / count);
  const weights = new Array<number>(count).fill(base);
  for (let index = 0; index < TOTAL_WEIGHT - base * count; index += 1) weights[index] += 1;
  return weights;
}

function describeInvariantBreach(weights: number[], floors: number[]): string | undefined {
  if (sum(weights) !== TOTAL_WEIGHT) {
    return `Module weights added up to ${sum(weights)}% instead of ${TOTAL_WEIGHT}%. They were split evenly — review them before publishing.`;
  }
  for (let index = 0; index < weights.length; index += 1) {
    if (!Number.isInteger(weights[index]) || weights[index] < floors[index]) {
      return `Module weights could not satisfy the minimum of ${floors[index]}%. They were split evenly — review them before publishing.`;
    }
  }
  return undefined;
}

function clampSignal(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return NEUTRAL_SIGNAL;
  return Math.min(MAX_SIGNAL, Math.max(MIN_SIGNAL, value));
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
