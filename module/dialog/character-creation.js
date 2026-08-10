/**
 * Character score generator ApplicationV2.
 *
 * All attribute rules live in ../chargen/attributes.mjs; this file only rolls dice, renders,
 * and reports refusals. Keeping the rules out of here is what lets the step be tested
 * without Foundry (tests/chargen-attributes.test.mjs, sealed probe S3a).
 */
import { createRollMessage, createCardMessage } from "../chat/chat-card.mjs";
import { applyAppThemeClasses } from "../config/themes.mjs";
import { setBaseCurrencyCarried } from "../helpers/currency.mjs";
import {
  ABILITY_ORDER,
  METHODS,
  DEFAULT_METHOD,
  buildSets,
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
} from "../chargen/attributes.mjs";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

export class WwnCharacterCreator extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "character-creator",
    classes: ["wwn", "wwn-app", "wwn-app--creator"],
    tag: "form",
    form: {
      handler: WwnCharacterCreator.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true,
    },
    window: {
      resizable: false,
      contentClasses: [],
    },
    position: { width: 380 },
    actions: {
      rollScores: WwnCharacterCreator.#onRollScores,
      chooseSet: WwnCharacterCreator.#onChooseSet,
      swapFourteen: WwnCharacterCreator.#onSwapFourteen,
      clearSwap: WwnCharacterCreator.#onClearSwap,
      toggleOverride: WwnCharacterCreator.#onToggleOverride,
      rollSilver: WwnCharacterCreator.#onRollSilver,
    },
  };

  static PARTS = {
    main: {
      template: "systems/wwn/templates/actors/dialogs/character-creation.html",
    },
  };

  /** @param {Actor} actor */
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    this.silver = 0;
    this.notice = null;
    /** Value each ability held before the 14-swap, so clearing it can restore. */
    this.preSwap = {};
    this.chargen = createState({
      method: game.settings.get("wwn", "attributeMethod") ?? DEFAULT_METHOD,
      override: false,
    });
    this.#postedSummary = false;
  }

  #postedSummary = false;

  /** @override */
  get title() {
    return `${this.actor.name}: ${game.i18n.localize("WWN.dialog.generator")}`;
  }

  /** @override */
  async _prepareContext(_options) {
    const st = this.chargen;
    const m = effectiveMethod(st.method);
    const scores = finalScores(st);
    const chosen = st.chosenSet === null ? null : st.sets[st.chosenSet];

    // No actor clone here. This template reads none of its fields, and deep-cloning the
    // whole actor on every render made rearranging scores visibly laggy — one clone per
    // dropdown change.
    return {
      config: CONFIG.WWN,
      isGM: game.user.isGM,
      method: st.method,
      methodDef: m,
      methods: Object.entries(METHODS).map(([id, def]) => ({
        id,
        label: game.i18n.localize(def.label),
        selected: id === st.method,
      })),
      override: st.override,
      needsPick: st.sets.length > 1 && st.chosenSet === null,
      sets: st.sets.map((values, i) => ({
        index: i,
        values,
        total: values.reduce((a, b) => a + b, 0),
        chosen: i === st.chosenSet,
      })),
      hasChosen: chosen !== null,
      swapKey: st.swapKey,
      canSwap: m.fourteenSwap || st.override,
      abilities: ABILITY_ORDER.map((id) => ({
        id,
        label: game.i18n.localize(CONFIG.WWN.abilityAbbreviations[id]),
        value: scores[id] ?? 0,
        slot: st.slots[id] ?? 0,
        options: chosen ?? [],
        swapped: st.swapKey === id,
      })),
      complete: validate(st).ok && Object.keys(scores).length === 6,
      notice: this.notice,
      silver: this.silver,
      stats: this.#stats(),
    };
  }

  #stats() {
    const values = Object.values(finalScores(this.chargen));
    const n = values.length;
    if (!n) return { sum: 0, avg: 0, std: 0 };
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    const std = Math.sqrt(values.map((x) => (x - mean) ** 2).reduce((a, b) => a + b, 0) / n);
    return {
      sum,
      avg: Math.round((10 * sum) / n) / 10,
      std: Math.round(100 * std) / 100,
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    applyAppThemeClasses(this.element);
    this.element.querySelectorAll("select.assign-select").forEach((sel) => {
      // Restore from the slot record, not by matching values: a set with two equal scores
      // would otherwise select the wrong one and quietly swap two abilities.
      const slot = this.chargen.slots[sel.dataset.ability];
      if (Number.isInteger(slot)) sel.value = String(slot);
      sel.addEventListener("change", (ev) => this.#onAssignChanged(ev));
    });
    this.element.querySelectorAll("input.manual-score").forEach((input) => {
      input.addEventListener("change", (ev) => this.#onManualChanged(ev));
    });
    const methodSel = this.element.querySelector("select.method-select");
    // Wired directly rather than through the form handler: submitOnChange is false, so a
    // select change never reaches #onSubmit, and a method change is not a submission anyway.
    methodSel?.addEventListener("change", (ev) => {
      this.#apply({ ok: true, state: setMethod(this.chargen, ev.currentTarget.value) });
    });
  }

  /** Report a refusal to the player instead of silently doing nothing. */
  #refuse(reason) {
    this.notice = game.i18n.localize(reason);
    ui.notifications?.warn(this.notice);
    this.render();
  }

  #apply(result) {
    if (!result.ok) return this.#refuse(result.reason);
    this.chargen = result.state;
    this.notice = null;
    this.render();
    return undefined;
  }

  /**
   * A select change moves that ability onto the chosen position, swapping with whoever
   * held it. Reading every select and rejecting duplicates made rearranging impossible:
   * a swap necessarily passes through a duplicate.
   */
  #onAssignChanged(ev) {
    const ability = ev.currentTarget.dataset.ability;
    const slot = Number(ev.currentTarget.value);
    this.#apply(placeAt(this.chargen, ability, slot));
  }

  #onManualChanged(ev) {
    const key = ev.currentTarget.dataset.ability;
    this.#apply(setManual(this.chargen, key, ev.currentTarget.value));
  }

  /** Roll every score this method needs, in one action, and post one chat card. */
  static async #onRollScores() {
    const st = this.chargen;
    const m = effectiveMethod(st.method);
    if (!m.formula) {
      this.#apply({ ok: true, state: recordSets(st, buildSets(st.method)) });
      return;
    }

    const rolls = [];
    const perScore = [];
    for (let i = 0; i < m.setCount * ABILITY_ORDER.length; i++) {
      const roll = await new Roll(`${m.pool}d6`, this.actor.getRollData()).evaluate();
      rolls.push(roll);
      perScore.push(roll.dice[0].results.map((r) => r.result));
    }
    await createRollMessage({
      rolls,
      kind: "formula",
      actor: this.actor,
      title: game.i18n.format("WWN.dialog.generateScoresMethod", {
        method: game.i18n.localize(METHODS[st.method].label),
      }),
      bodyTemplate: "systems/wwn/templates/chat/simple-roll.hbs",
      context: {},
    });
    this.#apply({ ok: true, state: recordSets(st, buildSets(st.method, perScore)) });
  }

  static #onChooseSet(event, target) {
    const index = Number(target.closest("[data-set-index]")?.dataset.setIndex);
    const res = chooseSet(this.chargen, index);
    if (!res.ok) return this.#refuse(res.reason);
    // A freshly chosen set starts in roll order; the player rearranges from there.
    const placed = assign(res.state, ABILITY_ORDER);
    return this.#apply(placed.ok ? placed : res);
  }

  static #onSwapFourteen(event, target) {
    const key = target.closest("[data-ability]")?.dataset.ability;
    if (!key) return undefined;
    this.preSwap[key] = finalScores(this.chargen)[key];
    return this.#apply(applyFourteenSwap(this.chargen, key));
  }

  static #onClearSwap() {
    const key = this.chargen.swapKey;
    return this.#apply(clearSwap(this.chargen, key ? this.preSwap[key] : undefined));
  }

  /** The valve: one click, and every method restriction lifts. */
  static #onToggleOverride() {
    if (!game.user.isGM) return this.#refuse("WWN.chargen.error.gmOnly");
    this.chargen = { ...this.chargen, override: !this.chargen.override };
    this.notice = null;
    this.render();
    return undefined;
  }

  static async #onRollSilver() {
    const roll = await new Roll("3d6", this.actor.getRollData()).evaluate();
    await createRollMessage({
      rolls: [roll],
      kind: "formula",
      actor: this.actor,
      title: game.i18n.localize("WWN.Currency.Silver"),
      bodyTemplate: "systems/wwn/templates/chat/simple-roll.hbs",
      context: {},
    });
    this.silver = roll.total * 10;
    this.render();
  }

  async #postCreationSummary() {
    if (this.#postedSummary || !this.element) return;
    const scores = finalScores(this.chargen);
    if (!Object.values(scores).some((v) => Number(v) > 0)) return;
    this.#postedSummary = true;
    await createCardMessage({
      title: game.i18n.localize("WWN.dialog.generator"),
      img: this.actor.img,
      actor: this.actor,
      bodyTemplate: "systems/wwn/templates/chat/roll-creation-body.hbs",
      context: {
        config: CONFIG.WWN,
        scores,
        stats: this.#stats(),
        silver: this.silver,
        method: game.i18n.localize(METHODS[this.chargen.method].label),
        overridden: this.chargen.override,
      },
      flags: { kind: "character-creation" },
    });
  }

  static async #onSubmit(_event, _form, _formData) {
    const check = validate(this.chargen);
    if (!check.ok) return this.#refuse(check.reasons[0] ?? "WWN.chargen.error.incomplete");
    await this.#postCreationSummary();
    await this.actor.update(toActorUpdate(this.chargen));
    if (this.silver > 0) await setBaseCurrencyCarried(this.actor, this.silver);
    this.actor.sheet?.render(true);
    return undefined;
  }

  /** @override */
  async close(options = {}) {
    await this.#postCreationSummary();
    return super.close(options);
  }
}
