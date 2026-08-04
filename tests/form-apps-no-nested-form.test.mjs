/**
 * An ApplicationV2 declaring `tag: "form"` renders its ROOT as the form and binds the
 * submit handler there. A second <form> inside its template is invalid HTML — the browser
 * reparents it, the submit escapes ApplicationV2, and the click becomes a native page
 * navigation: the window reloads and nothing is saved.
 *
 * character-creation.html shipped that way and nobody found it, because the button that
 * opens the dialog never rendered (see actor-is-new.test.mjs). Two dormant bugs stacked.
 *
 * Structural rather than behavioural on purpose: it catches the whole class at author
 * time, in a repo where the symptom only shows up on a live server.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

/** Every .mjs/.js under module/, recursively. */
function sources(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(full));
    else if (/\.(mjs|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Template paths named by a file that also declares tag: "form". */
function formAppTemplates() {
  const found = [];
  for (const file of sources(path.join(ROOT, "module"))) {
    const src = fs.readFileSync(file, "utf8");
    if (!/tag:\s*["']form["']/.test(src)) continue;
    for (const m of src.matchAll(/template:\s*[`"']([^`"']*?(?:\.hbs|\.html))[`"']/g)) {
      let rel = m[1].replace(/^systems\/wwn\//, "").replace(/^\$\{TPL\}\//, "");
      if (rel.startsWith("templates/generic/")) continue;   // core Foundry, not ours
      found.push({ app: path.relative(ROOT, file), template: rel });
    }
  }
  return found;
}

/**
 * Known-latent, NOT accepted as correct.
 *
 * Both are nested forms under a `tag: "form"` app, the same defect chargen had. They are
 * dormant only because neither template carries a submit button, so nothing triggers the
 * native navigation today. `party-select.html` additionally carries an inline
 * `onsubmit="event.preventDefault();"` — someone met this and suppressed the symptom
 * instead of removing the nesting, which is the tell that it is real.
 *
 * Left alone deliberately: they are working dialogs, outside the slice that found this,
 * and removing a wrapper element can move CSS. Remove the wrapper the next time either is
 * touched and delete its line here. Do not add to this list to make a red suite green.
 */
const KNOWN_LATENT = new Set([
  "templates/apps/party-sheet.html",
  "templates/apps/party-select.html",
]);

describe("apps with tag: \"form\" must not nest a <form> in their template", () => {
  const entries = formAppTemplates();

  it("finds the form-tagged applications at all", () => {
    // A discovery bug here would make every assertion below vacuous.
    assert.ok(entries.length >= 2, `only found ${entries.length} form-app templates`);
  });

  it("every known-latent entry is still a real, still-nested template", () => {
    // An allowlist that stops matching reality is how this rots into an accepted
    // baseline. If one of these was fixed, its line here must go with it.
    for (const rel of KNOWN_LATENT) {
      const full = path.join(ROOT, rel);
      assert.ok(fs.existsSync(full), `${rel} is allowlisted but does not exist`);
      const body = fs.readFileSync(full, "utf8").replace(/\{\{![\s\S]*?\}\}/g, "");
      assert.ok(/<form[\s>]/i.test(body),
        `${rel} no longer nests a <form> — remove it from KNOWN_LATENT`);
      assert.ok(!/type=["']submit["']/i.test(body),
        `${rel} gained a submit button, so this is LIVE now, not latent — fix it`);
    }
  });

  for (const { app, template } of entries) {
    it(`${template} (used by ${app})`, { skip: KNOWN_LATENT.has(template) && "known-latent, see KNOWN_LATENT" }, () => {
      const full = path.join(ROOT, template);
      if (!fs.existsSync(full)) return;   // template resolved dynamically; nothing to read
      const body = fs.readFileSync(full, "utf8").replace(/\{\{![\s\S]*?\}\}/g, "");
      assert.equal(
        /<form[\s>]/i.test(body), false,
        `${template} opens a <form>, but ${app} already renders the root as one. `
        + "Save would reload the page and persist nothing."
      );
    });
  }
});
