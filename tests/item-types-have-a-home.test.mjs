/**
 * Every Item type registered in system.json must be reachable on a sheet.
 *
 * Registering a type makes it droppable. Nothing makes it VISIBLE. `background` shipped
 * registered but unbucketed, so dragging one onto a PC created the item on the actor and
 * rendered it nowhere — indistinguishable, from the table, from the drag silently failing.
 *
 * Structural, because the symptom is an absence: no error, no console line, nothing to
 * catch at runtime except a person saying "that did nothing".
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const registered = Object.keys(
  JSON.parse(fs.readFileSync(path.join(ROOT, "system.json"), "utf8"))
    .documentTypes.Item
);

/**
 * ACTOR sheet code only, and only the bucketing idiom.
 *
 * A first version searched all sheet code for `type === "x"` anywhere and passed for
 * `background` with no bucket at all — the ITEM sheet's submit handler contains that exact
 * string. It reported green against the very bug it was written for. Scope is the fix:
 * an actor sheet, assigning a filtered list onto the render context.
 */
const SHEET_SRC = ["module/sheets/actor", "module/helpers"]
  .flatMap(function walk(dir) {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) return [];
    return fs.readdirSync(full, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]
    );
  })
  .filter((f) => /\.(mjs|js)$/.test(f))
  .map((f) => fs.readFileSync(path.join(ROOT, f), "utf8"))
  .join("\n");

/**
 * Types that are deliberately not bucketed on any sheet, with the reason. Each must still
 * be a REAL registered type — an entry that stops matching reality is how an allowlist
 * quietly becomes an excuse.
 */
const NOT_ON_SHEETS = {
  art: "legacy alias migrated to power",
  spell: "legacy alias migrated to power",
  ability: "legacy alias migrated to power",
};

describe("every registered Item type is reachable on a sheet", () => {
  it("reads the type list at all", () => {
    assert.ok(registered.length >= 10, `only found ${registered.length} item types`);
    assert.ok(registered.includes("background"), "background is not registered");
  });

  it("allowlist entries are all still real registered types", () => {
    for (const type of Object.keys(NOT_ON_SHEETS)) {
      assert.ok(registered.includes(type), `${type} is allowlisted but no longer registered`);
    }
  });

  for (const type of registered) {
    it(`${type}`, { skip: NOT_ON_SHEETS[type] }, () => {
      // Two idioms in this codebase put a type on screen, and both count:
      //   items.filter((i) => i.type === "weapon")                  <- most sheets
      //   new Set(["shipFitting", "shipWeapon", "shipDefense"])     <- starship budget
      const byType = new RegExp(`type\\s*===\\s*["'\`]${type}["'\`]`).test(SHEET_SRC);
      const bySet = new RegExp(`new Set\\(\\[[^\\]]*["'\`]${type}["'\`]`).test(SHEET_SRC);
      const bucketed = byType || bySet;
      assert.ok(
        bucketed,
        `no sheet code ever matches i.type === "${type}". A dropped ${type} would be `
        + "created on the actor and rendered nowhere, which reads as the drag failing."
      );
    });
  }
});
