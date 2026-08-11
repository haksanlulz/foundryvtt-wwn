/**
 * Background compendium integrity — WWN Deluxe pp. 11-17.
 *
 * The pack-diff checker compares entry NAMES, so it reads a background whose Learning table
 * has been garbled as perfectly clean. These are the checks that can see inside: table
 * lengths, and every referenced skill resolving to a real one.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(
  process.cwd(), "packs", "source", "abilities-wwn", "Backgrounds_wwnBgFolder00001"
);

/** The 21 WWN skills, p.10. */
const SKILLS = new Set([
  "Administer", "Connect", "Convince", "Craft", "Exert", "Heal", "Know", "Lead", "Magic",
  "Notice", "Perform", "Pray", "Punch", "Ride", "Sail", "Shoot", "Sneak", "Stab",
  "Survive", "Trade", "Work",
]);
/** Non-skill tokens the tables may legally carry (p.11). */
const GROWTH_TOKENS = new Set(["+1 Any Stat", "+2 Physical", "+2 Mental", "Any Skill"]);
const LEARNING_TOKENS = new Set(["Any Combat", "Any Skill"]);

let docs = [];

before(() => {
  docs = fs.readdirSync(DIR)
    .filter((f) => f.endsWith(".json") && f !== "_Folder.json")
    .map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")));
});

describe("background pack", () => {
  it("holds all 20 backgrounds, uniquely named and numbered 1-20", () => {
    assert.equal(docs.length, 20);
    assert.equal(new Set(docs.map((d) => d.name)).size, 20);
    assert.deepEqual(
      docs.map((d) => d.system.tableRoll).sort((a, b) => a - b),
      Array.from({ length: 20 }, (_, i) => i + 1)
    );
  });

  it("uses the background type and valid 16-character ids", () => {
    for (const d of docs) {
      assert.equal(d.type, "background", `${d.name} has type ${d.type}`);
      assert.equal(d._id.length, 16, `${d.name} id ${d._id}`);
      assert.equal(d._key, `!items!${d._id}`);
      assert.equal(d.folder, "wwnBgFolder00001");
    }
    assert.equal(new Set(docs.map((d) => d._id)).size, 20, "ids collide");
  });

  it("gives every background one free skill and exactly two quick skills", () => {
    for (const d of docs) {
      assert.ok(d.system.freeSkill, `${d.name} has no free skill`);
      assert.equal(d.system.quickSkills.length, 2, `${d.name} quick skills`);
    }
  });

  it("gives every background a 6-entry Growth and an 8-entry Learning table", () => {
    for (const d of docs) {
      assert.equal(d.system.growth.length, 6, `${d.name} growth`);
      assert.equal(d.system.learning.length, 8, `${d.name} learning`);
    }
  });

  it("references only real skills or the printed tokens", () => {
    const bare = (s) => s.replace(/-0$/, "");
    for (const d of docs) {
      for (const s of [d.system.freeSkill, ...d.system.quickSkills]) {
        const n = bare(s);
        assert.ok(
          SKILLS.has(n) || LEARNING_TOKENS.has(n),
          `${d.name}: granted skill ${s} is not a WWN skill`
        );
      }
      for (const g of d.system.growth) {
        assert.ok(
          SKILLS.has(g) || GROWTH_TOKENS.has(g),
          `${d.name}: growth entry ${g} is neither a skill nor a growth token`
        );
      }
      for (const l of d.system.learning) {
        assert.ok(
          SKILLS.has(l) || LEARNING_TOKENS.has(l),
          `${d.name}: learning entry ${l} is neither a skill nor a token`
        );
      }
    }
  });

  it("preserves the duplicate table entries the book prints on purpose", () => {
    // A dedupe bug would flatten these and silently unweight the die.
    const byName = Object.fromEntries(docs.map((d) => [d.name, d.system]));
    assert.equal(byName.Artisan.learning.filter((x) => x === "Craft").length, 2);
    assert.equal(byName.Priest.learning.filter((x) => x === "Pray").length, 2);
    assert.equal(byName.Performer.learning.filter((x) => x === "Perform").length, 2);
    assert.equal(byName.Soldier.learning.filter((x) => x === "Any Combat").length, 2);
    assert.equal(byName.Thug.learning.filter((x) => x === "Any Combat").length, 2);
    // Laborer is the only background whose Growth is four flat stat bumps (p.14).
    assert.equal(byName.Laborer.growth.filter((x) => x === "+1 Any Stat").length, 4);
  });
});
