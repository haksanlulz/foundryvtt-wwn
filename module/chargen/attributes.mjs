/**
 * Chargen attribute step — pure rules core.
 *
 * WWN Deluxe p.8 gives two RAW methods (roll 3d6 in order, or the standard array) plus a
 * GM option to arrange rolled scores freely. This table adds a house method, ruled by the
 * operator: 4d6-drop-lowest six times, three independent sets, pick one whole set, arrange
 * freely, and keep the RAW 14-swap on top.
 *
 * Nothing here touches Foundry. Dice arrive as already-rolled values so the whole step is
 * testable offline; the dialog supplies real Roll results in play.
 *
 * Enforce-with-valve: every restriction below reports a *reason* rather than throwing, and
 * `override` lifts all of them at once. A rule the GM cannot escape in one click is a bug
 * in this file, not a feature.
 */

/** Roll order for RAW method 1 — p.8 assigns 3d6 results in this order. */
export const ABILITY_ORDER = ["str", "dex", "con", "int", "wis", "cha"];

/** The RAW standard array (p.8). Assigned freely; the 14-swap is NOT available with it. */
export const STANDARD_ARRAY = [14, 12, 11, 10, 9, 7];

export const SCORE_MIN = 3;
export const SCORE_MAX = 18;

/**
 * @typedef {object} MethodDef
 * @property {string} label            i18n key
 * @property {number} setCount         how many independent sets are generated
 * @property {?string} formula         dice formula per score, null for the fixed array
 * @property {number} keep             dice kept per score (highest N)
 * @property {number} pool             dice rolled per score
 * @property {boolean} freeArrange     may the player place values where they like
 * @property {boolean} fourteenSwap    may exactly one score be replaced with 14
 */

/** @type {Record<string, MethodDef>} */
export const METHODS = {
  "raw-order": {
    label: "WWN.chargen.method.rawOrder",
    setCount: 1,
    formula: "3d6",
    pool: 3,
    keep: 3,
    freeArrange: false, // unless the Clement-GM option is on, see effectiveMethod()
    fourteenSwap: true,
  },
  "raw-array": {
    label: "WWN.chargen.method.rawArray",
    setCount: 1,
    formula: null,
    pool: 0,
    keep: 0,
    freeArrange: true,
    fourteenSwap: false, // p.8: the array is offered *instead of* the 14-swap
  },
  table: {
    label: "WWN.chargen.method.table",
    setCount: 3,
    formula: "4d6dl1",
    pool: 4,
    keep: 3,
    freeArrange: true,
    fourteenSwap: true,
  },
};

export const DEFAULT_METHOD = "table";

/**
 * Resolve a method's rules against the GM options in play.
 * @param {string} methodId
 * @param {{clementGm?: boolean}} [opts]  p.8 "Clement GMs" may let rolled scores be arranged
 * @returns {MethodDef}
 */
export function effectiveMethod(methodId, { clementGm = false } = {}) {
  const base = METHODS[methodId];
  if (!base) throw new Error(`unknown attribute method: ${methodId}`);
  if (methodId === "raw-order" && clementGm) return { ...base, freeArrange: true };
  return { ...base };
}

/**
 * Sum the highest `keep` of the supplied dice. [6,5,4,1] keep 3 -> 15.
 * @param {number[]} dice
 * @param {number} keep
 */
export function scoreFromDice(dice, keep) {
  return [...dice]
    .sort((a, b) => b - a)
    .slice(0, keep)
    .reduce((a, b) => a + b, 0);
}

/**
 * Build the candidate sets for a method.
 * @param {string} methodId
 * @param {number[][]} rolls  one entry per score: the raw dice for that score
 * @returns {number[][]}      setCount sets of six scores
 */
export function buildSets(methodId, rolls = []) {
  const m = METHODS[methodId];
  if (!m) throw new Error(`unknown attribute method: ${methodId}`);
  if (!m.formula) return [[...STANDARD_ARRAY]];

  const needed = m.setCount * ABILITY_ORDER.length;
  if (rolls.length !== needed) {
    throw new Error(`${methodId} needs ${needed} rolls, got ${rolls.length}`);
  }
  const sets = [];
  for (let s = 0; s < m.setCount; s++) {
    const slice = rolls.slice(s * 6, s * 6 + 6);
    sets.push(slice.map((dice) => scoreFromDice(dice, m.keep)));
  }
  return sets;
}

/** Fresh step state. */
export function createState({ method = DEFAULT_METHOD, clementGm = false, override = false } = {}) {
  return {
    method,
    clementGm,
    override,
    sets: [],
    chosenSet: null,
    /** @type {Record<string, number>} */
    assignment: {},
    /**
     * Which position of the chosen set each ability took. Kept alongside the values
     * because two dice can roll the same score, and a UI that matches on value alone
     * cannot tell those two apart.
     * @type {Record<string, number>}
     */
    slots: {},
    /** @type {?string} */
    swapKey: null,
  };
}

/**
 * Switch method. Everything generated under the old method is dropped — carrying values
 * across is how two methods get silently mixed into one character (probe A10).
 */
export function setMethod(state, methodId) {
  if (!METHODS[methodId]) throw new Error(`unknown attribute method: ${methodId}`);
  return { ...state, method: methodId, sets: [], chosenSet: null, assignment: {}, slots: {}, swapKey: null };
}

/** Record freshly generated sets, clearing any prior choice. */
export function recordSets(state, sets) {
  return {
    ...state,
    sets,
    chosenSet: sets.length === 1 ? 0 : null,
    assignment: {},
    slots: {},
    swapKey: null,
  };
}

/** Pick exactly one whole set. The others are discarded, never merged (probe A2). */
export function chooseSet(state, index) {
  if (!Number.isInteger(index) || index < 0 || index >= state.sets.length) {
    return { ok: false, reason: "WWN.chargen.error.noSuchSet", state };
  }
  return { ok: true, state: { ...state, chosenSet: index, assignment: {}, swapKey: null } };
}

/**
 * Place the chosen set's values onto abilities.
 * @param {object} state
 * @param {string[]} [order]  ability keys in the order the player wants the values placed.
 *                            Omitted (or under a fixed-order method) it falls back to
 *                            ABILITY_ORDER, which is RAW roll order.
 */
export function assign(state, order) {
  if (state.chosenSet === null) return { ok: false, reason: "WWN.chargen.error.noSet", state };
  const values = state.sets[state.chosenSet];
  const m = effectiveMethod(state.method, { clementGm: state.clementGm });
  const wanted = order ?? ABILITY_ORDER;

  const reordered = wanted.join(",") !== ABILITY_ORDER.join(",");
  if (reordered && !m.freeArrange && !state.override) {
    return { ok: false, reason: "WWN.chargen.error.orderLocked", state };
  }
  if (wanted.length !== 6 || new Set(wanted).size !== 6
      || wanted.some((k) => !ABILITY_ORDER.includes(k))) {
    return { ok: false, reason: "WWN.chargen.error.badOrder", state };
  }

  const assignment = {};
  const slots = {};
  wanted.forEach((key, i) => { assignment[key] = values[i]; slots[key] = i; });
  return { ok: true, state: { ...state, assignment, slots, swapKey: null } };
}

/**
 * RAW 14-swap: replace exactly one assigned score with 14, discarding the original.
 * Refused under the standard array (p.8) and refused a second time (probe A4/A6).
 */
export function applyFourteenSwap(state, key) {
  const m = effectiveMethod(state.method, { clementGm: state.clementGm });
  if (!m.fourteenSwap && !state.override) {
    return { ok: false, reason: "WWN.chargen.error.swapArray", state };
  }
  if (state.swapKey !== null && !state.override) {
    return { ok: false, reason: "WWN.chargen.error.swapOnce", state };
  }
  if (!ABILITY_ORDER.includes(key)) {
    return { ok: false, reason: "WWN.chargen.error.badAbility", state };
  }
  if (!(key in state.assignment)) {
    return { ok: false, reason: "WWN.chargen.error.notAssigned", state };
  }
  return {
    ok: true,
    state: { ...state, assignment: { ...state.assignment, [key]: 14 }, swapKey: key },
  };
}

/** Skip or undo the swap. Skipping is a normal completion, not an error (probe A5). */
export function clearSwap(state, originalValue) {
  if (state.swapKey === null) return { ok: true, state };
  const assignment = { ...state.assignment };
  if (Number.isInteger(originalValue)) assignment[state.swapKey] = originalValue;
  return { ok: true, state: { ...state, assignment, swapKey: null } };
}

/**
 * The valve. With override engaged any in-range score may be typed onto any ability under
 * any method; without it, manual entry is refused so the method means something.
 */
export function setManual(state, key, value) {
  if (!state.override) return { ok: false, reason: "WWN.chargen.error.manualLocked", state };
  if (!ABILITY_ORDER.includes(key)) {
    return { ok: false, reason: "WWN.chargen.error.badAbility", state };
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < SCORE_MIN || n > SCORE_MAX) {
    return { ok: false, reason: "WWN.chargen.error.outOfRange", state };
  }
  return { ok: true, state: { ...state, assignment: { ...state.assignment, [key]: n } } };
}

/** Final scores, post-swap — the only values downstream derivation should read (probe A11). */
export function finalScores(state) {
  return { ...state.assignment };
}

/** Is the step complete and internally consistent? */
export function validate(state) {
  const reasons = [];
  const scores = finalScores(state);
  const keys = Object.keys(scores);
  if (keys.length !== 6) reasons.push("WWN.chargen.error.incomplete");
  for (const k of keys) {
    const v = scores[k];
    if (!Number.isInteger(v) || v < SCORE_MIN || v > SCORE_MAX) {
      reasons.push("WWN.chargen.error.outOfRange");
      break;
    }
  }
  // An override'd sheet is deliberately never invalid — that is what the valve means.
  if (state.override) return { ok: true, reasons: [], overridden: true };
  return { ok: reasons.length === 0, reasons, overridden: false };
}

/** Actor update payload for the assigned scores. */
export function toActorUpdate(state) {
  const out = {};
  for (const [k, v] of Object.entries(finalScores(state))) {
    out[`system.abilities.${k}.value`] = v;
  }
  return out;
}
