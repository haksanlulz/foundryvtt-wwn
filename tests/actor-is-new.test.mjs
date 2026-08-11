/**
 * WwnActor.isNew() — the character-generator gate.
 *
 * Regression test for a bug no suite could have caught, found by driving the sheet:
 * `isNew` was called at pc-sheet.mjs and gated the generator button in main.hbs, and was
 * DEFINED NOWHERE. The optional call returned undefined, `?? false` made it false, and the
 * generator was unreachable from the PC sheet for every character ever created.
 *
 * It is now backed by the "Character Creation" checkbox on the Details tab
 * (`system.details.chargen`) rather than inferred from the scores.
 */
import "../build/foundry-shim.mjs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WwnActor } from "../module/documents/actor.mjs";

/** Minimal stand-in — isNew() reads only `type` and `system.details.chargen`. */
function actorLike({ type = "character", chargen = true, details = undefined } = {}) {
  return {
    type,
    system: { details: details === undefined ? { chargen } : details },
    isNew: WwnActor.prototype.isNew,
  };
}

describe("WwnActor.isNew", () => {
  it("exists — the entire bug was that it did not", () => {
    assert.equal(typeof WwnActor.prototype.isNew, "function");
  });

  it("is true while the Character Creation box is ticked", () => {
    assert.equal(actorLike({ chargen: true }).isNew(), true);
  });

  it("is false once the box is unticked", () => {
    assert.equal(actorLike({ chargen: false }).isNew(), false);
  });

  it("does not treat the scores as evidence — a finished PC can be re-opened", () => {
    // The point of the checkbox: rolling six 10s must not lock the generator away,
    // and a completed character must be able to get it back.
    const finished = actorLike({ chargen: true });
    finished.system.abilities = { str: { value: 16 }, dex: { value: 14 } };
    assert.equal(finished.isNew(), true);
  });

  it("is false for non-PC actors regardless of the flag", () => {
    assert.equal(actorLike({ type: "monster" }).isNew(), false);
    assert.equal(actorLike({ type: "faction" }).isNew(), false);
  });

  it("only accepts a real true — never a truthy string from a form post", () => {
    assert.equal(actorLike({ details: { chargen: "false" } }).isNew(), false);
    assert.equal(actorLike({ details: { chargen: 1 } }).isNew(), false);
  });

  it("does not throw on a malformed actor", () => {
    assert.equal(actorLike({ details: {} }).isNew(), false);
    assert.equal(actorLike({ details: null }).isNew(), false);
    const noSystem = { type: "character", isNew: WwnActor.prototype.isNew };
    assert.equal(noSystem.isNew(), false);
  });
});
