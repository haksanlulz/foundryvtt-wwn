import WwnItemBase from "./base.mjs";

const fields = foundry.data.fields;

/**
 * Background: the WWN Deluxe chargen backgrounds (pp. 11-17).
 *
 * A background is a data carrier, not an ongoing effect — once chargen resolves it, the
 * skills it granted live on the character and the background item is only a record of
 * where they came from. So there are no Active Effects here and nothing derives from it.
 *
 * Growth and Learning are stored as flat ordered arrays, index 0 = roll 1. They are NOT
 * deduplicated: the printed tables repeat entries on purpose (Artisan rolls Craft on both
 * 3 and 4; Priest rolls Pray on 7 and 8), which is how the die is weighted. Storing them
 * as a set would silently flatten that.
 */
export default class WwnBackground extends WwnItemBase {
  static defineSchema() {
    const schema = super.defineSchema();

    /** Single skill granted at level-0 outright. */
    schema.freeSkill = new fields.StringField({ required: true, blank: true, initial: "" });

    /** The two skills granted by the "quick" chargen route. */
    schema.quickSkills = new fields.ArrayField(new fields.StringField(), {
      required: true,
      initial: [],
    });

    /** d6 table, index 0 = roll 1. Entries are skill names or growth tokens. */
    schema.growth = new fields.ArrayField(new fields.StringField(), {
      required: true,
      initial: [],
    });

    /** d8 table, index 0 = roll 1. Skill names only. */
    schema.learning = new fields.ArrayField(new fields.StringField(), {
      required: true,
      initial: [],
    });

    /** d20 position in the book's background table, for roll-a-background. */
    schema.tableRoll = new fields.NumberField({
      required: true,
      nullable: true,
      integer: true,
      initial: null,
      min: 1,
      max: 20,
    });

    return schema;
  }
}
