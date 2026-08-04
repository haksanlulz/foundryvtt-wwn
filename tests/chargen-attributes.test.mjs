/**
 * Chargen attribute step — scored against sealed probe S3a (rows A1..A11).
 *
 * The probe was sealed at .coord/probes/wwn-deluxe-engine.md before this module existed,
 * so each test names the row it answers. Book: WWN Deluxe p.8.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ABILITY_ORDER,
  STANDARD_ARRAY,
  METHODS,
  buildSets,
  scoreFromDice,
  effectiveMethod,
  createState,
  setMethod,
  recordSets,
  chooseSet,
  assign,
  placeAt,
  applyFourteenSwap,
  clearSwap,
  setManual,
  finalScores,
  validate,
  toActorUpdate,
} from "../module/chargen/attributes.mjs";

/**
 * Deterministic dice, so no test depends on randomness. Takes one dice-array per score
 * and passes them through unchanged -- buildSets does its own per-set slicing.
 */
function rollsFrom(perScoreDice) {
  return perScoreDice;
}

const SET_A = [[6, 5, 4, 1], [6, 5, 3, 2], [5, 4, 4, 3], [4, 4, 4, 2], [4, 3, 3, 3], [3, 3, 2, 1]];
const SET_B = [[6, 6, 6, 6], [1, 1, 1, 1], [5, 5, 5, 5], [2, 2, 2, 2], [4, 4, 4, 4], [3, 3, 3, 3]];
const SET_C = [[6, 6, 5, 1], [5, 5, 4, 1], [4, 4, 3, 1], [3, 3, 2, 1], [6, 2, 2, 1], [5, 3, 2, 1]];

function tableState() {
  const sets = buildSets("table", rollsFrom([...SET_A, ...SET_B, ...SET_C]));
  return recordSets(createState({ method: "table" }), sets);
}

/**
 * Unwrap a {ok, state} result, failing loudly if the step was refused.
 * Reaching for `.state` directly silently returns the UNCHANGED state on refusal, which
 * is how two tests here first passed a step they had never actually completed.
 */
function must(result) {
  assert.ok(result.ok, `step refused: ${result.reason}`);
  return result.state;
}

/** A table-method state with a set chosen and values placed in roll order. */
function assignedTableState() {
  return must(assign(must(chooseSet(tableState(), 0)), ABILITY_ORDER));
}

describe("A1 — TABLE generates three sets of six, each the best 3 of 4d6", () => {
  it("keeps the highest three dice", () => {
    assert.equal(scoreFromDice([6, 5, 4, 1], 3), 15);
    assert.equal(scoreFromDice([1, 1, 1, 1], 3), 3);
    assert.equal(scoreFromDice([6, 6, 6, 6], 3), 18);
  });

  it("produces exactly 3 x 6 scores, all in range", () => {
    const sets = buildSets("table", rollsFrom([...SET_A, ...SET_B, ...SET_C]));
    assert.equal(sets.length, 3);
    for (const s of sets) {
      assert.equal(s.length, 6);
      for (const v of s) assert.ok(v >= 3 && v <= 18, `${v} out of range`);
    }
    assert.deepEqual(sets[1], [18, 3, 15, 6, 12, 9]);
  });

  it("refuses a roll count that does not match the method", () => {
    assert.throws(() => buildSets("table", rollsFrom(SET_A)), /needs 18 rolls, got 6/);
  });
});

describe("A2 — picking a set takes that set whole", () => {
  it("carries exactly the chosen set and discards the others", () => {
    const st = tableState();
    const { ok, state } = chooseSet(st, 1);
    assert.ok(ok);
    const out = assign(state, ABILITY_ORDER);
    assert.deepEqual(Object.values(finalScores(out.state)), [18, 3, 15, 6, 12, 9]);
  });

  it("rejects an out-of-range set index instead of clamping", () => {
    assert.equal(chooseSet(tableState(), 3).ok, false);
    assert.equal(chooseSet(tableState(), -1).ok, false);
  });
});

describe("A3 — free arrangement is applied verbatim", () => {
  it("places values in the requested ability order, never re-sorting", () => {
    let st = recordSets(createState({ method: "table" }), [[15, 14, 13, 12, 10, 8]]);
    const res = assign(st, ["con", "cha", "str", "int", "wis", "dex"]);
    assert.ok(res.ok);
    assert.deepEqual(finalScores(res.state), {
      con: 15, cha: 14, str: 13, int: 12, wis: 10, dex: 8,
    });
  });

  it("rejects a malformed order rather than partially applying it", () => {
    const st = recordSets(createState({ method: "table" }), [[15, 14, 13, 12, 10, 8]]);
    assert.equal(assign(st, ["con", "con", "str", "int", "wis", "dex"]).ok, false);
    assert.equal(assign(st, ["con", "str"]).ok, false);
  });
});

describe("A4 — the 14-swap replaces exactly one score, once", () => {
  it("sets the chosen slot to 14 and leaves the rest alone", () => {
    const base = assign(
      recordSets(createState({ method: "table" }), [[15, 14, 13, 12, 10, 8]]),
      ABILITY_ORDER
    ).state;
    const res = applyFourteenSwap(base, "cha"); // cha held the 8
    assert.ok(res.ok);
    assert.equal(finalScores(res.state).cha, 14);
    assert.deepEqual(
      { ...finalScores(res.state), cha: undefined },
      { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: undefined }
    );
  });

  it("refuses a second swap", () => {
    const base = assign(
      recordSets(createState({ method: "table" }), [[15, 14, 13, 12, 10, 8]]),
      ABILITY_ORDER
    ).state;
    const once = applyFourteenSwap(base, "cha").state;
    const twice = applyFourteenSwap(once, "wis");
    assert.equal(twice.ok, false);
    assert.equal(twice.reason, "WWN.chargen.error.swapOnce");
    assert.equal(finalScores(twice.state).wis, 10, "refused swap must not mutate");
  });
});

describe("A5 — skipping the swap completes the step", () => {
  it("leaves all six values untouched and validates", () => {
    const base = assign(
      recordSets(createState({ method: "table" }), [[15, 14, 13, 12, 10, 8]]),
      ABILITY_ORDER
    ).state;
    const res = clearSwap(base);
    assert.ok(res.ok);
    assert.deepEqual(Object.values(finalScores(res.state)), [15, 14, 13, 12, 10, 8]);
    assert.ok(validate(res.state).ok);
  });
});

describe("A6 — the standard array forbids the 14-swap", () => {
  it("offers exactly 14/12/11/10/9/7", () => {
    assert.deepEqual(buildSets("raw-array"), [STANDARD_ARRAY]);
    assert.deepEqual(STANDARD_ARRAY, [14, 12, 11, 10, 9, 7]);
  });

  it("refuses the swap, naming the array restriction", () => {
    const st = assign(
      recordSets(createState({ method: "raw-array" }), buildSets("raw-array")),
      ["cha", "str", "dex", "con", "int", "wis"]
    ).state;
    const res = applyFourteenSwap(st, "wis");
    assert.equal(res.ok, false);
    assert.equal(res.reason, "WWN.chargen.error.swapArray");
  });

  it("still allows free arrangement", () => {
    const st = recordSets(createState({ method: "raw-array" }), buildSets("raw-array"));
    assert.ok(assign(st, ["cha", "str", "dex", "con", "int", "wis"]).ok);
  });
});

describe("A7 — RAW roll-in-order locks the order unless the GM is Clement", () => {
  it("fills str,dex,con,int,wis,cha in roll order", () => {
    const rolls = [[3, 3, 3], [4, 4, 4], [5, 5, 5], [2, 2, 2], [6, 6, 6], [1, 1, 1]];
    const sets = buildSets("raw-order", rolls);
    assert.deepEqual(sets, [[9, 12, 15, 6, 18, 3]]);
    const res = assign(recordSets(createState({ method: "raw-order" }), sets));
    assert.deepEqual(finalScores(res.state), {
      str: 9, dex: 12, con: 15, int: 6, wis: 18, cha: 3,
    });
  });

  it("refuses re-ordering by default", () => {
    const st = recordSets(createState({ method: "raw-order" }), [[9, 12, 15, 6, 18, 3]]);
    const res = assign(st, ["cha", "wis", "int", "con", "dex", "str"]);
    assert.equal(res.ok, false);
    assert.equal(res.reason, "WWN.chargen.error.orderLocked");
  });

  it("permits re-ordering once the Clement-GM option is on", () => {
    const st = recordSets(
      createState({ method: "raw-order", clementGm: true }), [[9, 12, 15, 6, 18, 3]]
    );
    assert.ok(assign(st, ["cha", "wis", "int", "con", "dex", "str"]).ok);
    assert.equal(effectiveMethod("raw-order", { clementGm: true }).freeArrange, true);
    assert.equal(effectiveMethod("raw-order").freeArrange, false);
  });
});

describe("A8 — RAW roll-in-order keeps the 14-swap", () => {
  it("allows exactly one", () => {
    const st = assign(
      recordSets(createState({ method: "raw-order" }), [[9, 12, 15, 6, 18, 3]])
    ).state;
    const res = applyFourteenSwap(st, "cha");
    assert.ok(res.ok);
    assert.equal(finalScores(res.state).cha, 14);
    assert.equal(applyFourteenSwap(res.state, "int").ok, false);
  });
});

describe("A9 — the GM override valve lifts every restriction", () => {
  it("refuses manual entry while the valve is shut", () => {
    const st = createState({ method: "table" });
    const res = setManual(st, "str", 17);
    assert.equal(res.ok, false);
    assert.equal(res.reason, "WWN.chargen.error.manualLocked");
  });

  it("accepts manual entry under every method once open", () => {
    for (const m of Object.keys(METHODS)) {
      const st = createState({ method: m, override: true });
      const res = setManual(st, "str", 17);
      assert.ok(res.ok, `manual entry refused under ${m}`);
      assert.equal(finalScores(res.state).str, 17);
    }
  });

  it("lifts the array swap-ban and the order lock too", () => {
    const st = assign(
      recordSets(createState({ method: "raw-array", override: true }), buildSets("raw-array")),
      ABILITY_ORDER
    ).state;
    assert.ok(applyFourteenSwap(st, "cha").ok);
    const locked = recordSets(
      createState({ method: "raw-order", override: true }), [[9, 12, 15, 6, 18, 3]]
    );
    assert.ok(assign(locked, ["cha", "wis", "int", "con", "dex", "str"]).ok);
  });

  it("still rejects a score outside 3..18, and never flags an overridden sheet invalid", () => {
    const st = createState({ method: "table", override: true });
    assert.equal(setManual(st, "str", 19).ok, false);
    assert.equal(setManual(st, "str", 2).ok, false);
    assert.ok(validate(st).ok, "an overridden, incomplete sheet must not read invalid");
    assert.equal(validate(st).overridden, true);
  });
});

describe("A10 — changing method resets rather than carries", () => {
  it("drops sets, choice, assignment and swap", () => {
    const st = must(applyFourteenSwap(assignedTableState(), "cha"));
    assert.equal(Object.keys(finalScores(st)).length, 6);
    const switched = setMethod(st, "raw-array");
    assert.deepEqual(switched.sets, []);
    assert.equal(switched.chosenSet, null);
    assert.deepEqual(switched.assignment, {});
    assert.equal(switched.swapKey, null);
  });

  it("keeps the GM options across the switch", () => {
    const st = createState({ method: "table", clementGm: true, override: true });
    const switched = setMethod(st, "raw-order");
    assert.equal(switched.clementGm, true);
    assert.equal(switched.override, true);
  });
});

describe("A11 — downstream reads the post-swap scores", () => {
  // mirrors module/derivations/modifiers.mjs against CONFIG.WWN.modifierTables.wwn
  const TABLE = { 0: -2, 3: -2, 4: -1, 8: 0, 14: 1, 18: 2 };
  const mod = (v) => {
    let out = 0;
    for (let i = 0; i <= v; i++) if (TABLE[i] !== undefined) out = TABLE[i];
    return out;
  };

  it("the actor payload carries the swapped value, not the original", () => {
    const base = assign(
      recordSets(createState({ method: "table" }), [[15, 14, 13, 12, 10, 8]]),
      ABILITY_ORDER
    ).state;
    const swapped = applyFourteenSwap(base, "cha").state;
    assert.equal(mod(finalScores(base).cha), 0, "8 is a +0 score");
    assert.equal(mod(finalScores(swapped).cha), 1, "14 is a +1 score");
    assert.equal(toActorUpdate(swapped)["system.abilities.cha.value"], 14);
  });

  it("emits one update path per ability", () => {
    const st = assign(
      recordSets(createState({ method: "table" }), [[15, 14, 13, 12, 10, 8]]),
      ABILITY_ORDER
    ).state;
    assert.deepEqual(Object.keys(toActorUpdate(st)).sort(), [
      "system.abilities.cha.value",
      "system.abilities.con.value",
      "system.abilities.dex.value",
      "system.abilities.int.value",
      "system.abilities.str.value",
      "system.abilities.wis.value",
    ]);
  });
});

describe("slot tracking — which set position each ability took", () => {
  it("records the position, not just the value", () => {
    const st = must(assign(
      recordSets(createState({ method: "table" }), [[15, 14, 13, 12, 10, 8]]),
      ["con", "cha", "str", "int", "wis", "dex"]
    ));
    assert.deepEqual(st.slots, { con: 0, cha: 1, str: 2, int: 3, wis: 4, dex: 5 });
  });

  it("distinguishes two equal scores, which a value-match cannot", () => {
    const st = must(assign(
      recordSets(createState({ method: "table" }), [[12, 12, 10, 9, 8, 7]]),
      ABILITY_ORDER
    ));
    assert.equal(st.slots.str, 0);
    assert.equal(st.slots.dex, 1);
    assert.equal(finalScores(st).str, finalScores(st).dex, "the two 12s are the ambiguous case");
  });

  it("is cleared when the method changes or new sets arrive", () => {
    const st = must(assign(
      recordSets(createState({ method: "table" }), [[15, 14, 13, 12, 10, 8]]), ABILITY_ORDER
    ));
    assert.deepEqual(setMethod(st, "raw-array").slots, {});
    assert.deepEqual(recordSets(st, [[9, 9, 9, 9, 9, 9]]).slots, {});
  });
});

describe("step validation", () => {
  it("is incomplete until all six are assigned", () => {
    assert.equal(validate(createState()).ok, false);
    assert.ok(validate(assignedTableState()).ok);
  });

  it("refuses to assign before a set is chosen, rather than assigning an empty one", () => {
    const res = assign(tableState(), ABILITY_ORDER);
    assert.equal(res.ok, false);
    assert.equal(res.reason, "WWN.chargen.error.noSet");
    assert.deepEqual(finalScores(res.state), {});
  });
});


describe("placeAt — rearranging by swap, not by rejection", () => {
  const set = [15, 14, 13, 12, 10, 8];
  const fresh = () => must(assign(
    recordSets(createState({ method: "table" }), [set]), ABILITY_ORDER
  ));

  it("swaps the two abilities rather than refusing the collision", () => {
    // str holds slot 0 (15), cha holds slot 5 (8). Put cha on slot 0.
    const st = must(placeAt(fresh(), "cha", 0));
    assert.equal(finalScores(st).cha, 15);
    assert.equal(finalScores(st).str, 8, "displaced ability must take the vacated slot");
    assert.equal(st.slots.cha, 0);
    assert.equal(st.slots.str, 5);
  });

  it("keeps all six values — a swap never loses or duplicates one", () => {
    const st = must(placeAt(must(placeAt(fresh(), "cha", 0)), "wis", 3));
    assert.deepEqual(Object.values(finalScores(st)).sort((a, b) => b - a), [...set]);
    assert.equal(new Set(Object.values(st.slots)).size, 6, "two abilities share a slot");
  });

  it("is a no-op when the ability already holds that slot", () => {
    const before = fresh();
    const after = must(placeAt(before, "str", 0));
    assert.deepEqual(finalScores(after), finalScores(before));
  });

  it("refuses under a fixed-order method, and allows it under override", () => {
    const locked = must(assign(
      recordSets(createState({ method: "raw-order" }), [set]), ABILITY_ORDER
    ));
    const res = placeAt(locked, "cha", 0);
    assert.equal(res.ok, false);
    assert.equal(res.reason, "WWN.chargen.error.orderLocked");
    const open = { ...locked, override: true };
    assert.ok(placeAt(open, "cha", 0).ok);
  });

  it("rejects a slot outside the set", () => {
    assert.equal(placeAt(fresh(), "cha", 6).ok, false);
    assert.equal(placeAt(fresh(), "cha", -1).ok, false);
    assert.equal(placeAt(fresh(), "nope", 0).ok, false);
  });

  it("works before anything has been placed, falling back to roll order", () => {
    const unplaced = recordSets(createState({ method: "table" }), [set]);
    const st = must(placeAt({ ...unplaced, chosenSet: 0 }, "cha", 0));
    assert.equal(finalScores(st).cha, 15);
  });
});

describe("RAW is the default method", () => {
  it("defaults to rolling 3d6 in order, not the house method", () => {
    assert.equal(createState().method, "raw-order");
  });
});

describe("the 14 and rearranging interact", () => {
  it("rearranging after a 14-swap drops the 14 back to the rolled value", () => {
    // Documented rather than accidental: the 14 sits on top of an arrangement, so
    // changing the arrangement rebuilds from the rolled set. The UI shows this by
    // clearing the active marker and the Undo link.
    const base = must(assign(
      recordSets(createState({ method: "table" }), [[15, 14, 13, 12, 10, 8]]), ABILITY_ORDER
    ));
    const swapped = must(applyFourteenSwap(base, "cha"));
    assert.equal(finalScores(swapped).cha, 14);
    assert.equal(swapped.swapKey, "cha");

    const moved = must(placeAt(swapped, "cha", 0));
    assert.equal(moved.swapKey, null, "the swap must not survive silently");
    assert.equal(finalScores(moved).cha, 15, "cha now holds the rolled 15, not the 14");
    assert.deepEqual(Object.values(finalScores(moved)).sort((a, b) => b - a),
                     [15, 14, 13, 12, 10, 8]);
  });

  it("the 14 can simply be re-applied afterwards", () => {
    const base = must(assign(
      recordSets(createState({ method: "table" }), [[15, 14, 13, 12, 10, 8]]), ABILITY_ORDER
    ));
    const moved = must(placeAt(must(applyFourteenSwap(base, "cha")), "cha", 0));
    assert.ok(applyFourteenSwap(moved, "cha").ok, "one swap per arrangement, not per life");
  });
});
