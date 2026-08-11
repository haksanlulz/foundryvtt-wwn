export const registerHelpers = async function () {
  // Handlebars template helpers
  // `join` is used by the focus, class-edge and background sheets. It appears to be a
  // Foundry built-in, but nothing in this system registers it, and if that ever stops
  // being true the affected inputs render EMPTY and then overwrite the real array with
  // nothing on the next save. Register a fallback only when it is genuinely absent, so
  // core keeps precedence wherever it does provide one.
  if (!Handlebars.helpers.join) {
    Handlebars.registerHelper("join", function (arr, sep) {
      if (!Array.isArray(arr)) return "";
      return arr.join(typeof sep === "string" ? sep : ", ");
    });
  }

  Handlebars.registerHelper("eq", function (a, b) {
    return a == b;
  });

  Handlebars.registerHelper("nt", function (a, b) {
    return a != b;
  });

  Handlebars.registerHelper("gt", function (a, b) {
    return a >= b;
  });

  Handlebars.registerHelper("lt", function (a, b) {
    return a <= b;
  });

  Handlebars.registerHelper("evalOr", function (a, b) {
    return a || b;
  });

  Handlebars.registerHelper("evalAnd", function (a, b) {
    return a && b;
  });

  Handlebars.registerHelper("evalNor", function (a, b) {
    return !a && !b;
  });

  Handlebars.registerHelper("mod", function (val) {
    if (val > 0) {
      return `+${val}`;
    } else if (val < 0) {
      return `${val}`;
    } else {
      return "0";
    }
  });

  Handlebars.registerHelper("add", function (lh, rh) {
    return Number(lh) + Number(rh);
  });

  Handlebars.registerHelper("subtract", function (lh, rh) {
    return parseInt(rh) - parseInt(lh);
  });

  Handlebars.registerHelper("divide", function (lh, rh) {
    return Math.floor(parseFloat(lh) / parseFloat(rh));
  });

  Handlebars.registerHelper("mult", function (lh, rh) {
    return parseFloat(lh) * parseFloat(rh);
  });

  Handlebars.registerHelper("roundWeight", function (weight) {
    return Math.round(parseFloat(weight) / 100) / 10;
  });

  Handlebars.registerHelper("getTagIcon", function (tag) {
    let idx = Object.keys(CONFIG.WWN.tags).find(k => (CONFIG.WWN.tags[k] == tag));
    return CONFIG.WWN.tag_images[idx];
  });

  Handlebars.registerHelper("getTagDesc", function (tag) {
    let idd = Object.keys(CONFIG.WWN.tags).find(k => (CONFIG.WWN.tags[k] == tag));
    return game.i18n.localize(CONFIG.WWN.tag_desc[idd]);
  });

  Handlebars.registerHelper("counter", function (status, value, max) {
    return status
      ? Math.clamp((100.0 * value) / max, 0, 100)
      : Math.clamp(100 - (100.0 * value) / max, 0, 100);
  });

  Handlebars.registerHelper("reverseCounter", function (status, value, max) {
    return status
      ? Math.clamp(100 - (100.0 * value) / max, 0, 100)
      : Math.clamp((100.0 * value) / max, 0, 100);
  });

  Handlebars.registerHelper("firstLetter", function (obj) {
    if (!obj) return "";
    return obj.substring(0, 1).toUpperCase();
  });

  Handlebars.registerHelper("trim", function (obj, n) {
    if (!obj) return "";
    if (obj.length <= n) return obj;
    return obj.substring(0, n) + "...";
  });

  Handlebars.registerHelper(
    'partial',
    (path) => `systems/wwn/templates/${path}`
  );

  Handlebars.registerHelper("log", function (obj) {
    return console.log(obj);
  });

  Handlebars.registerHelper("hasSuccessfulSaves", function (results) {
    return results.some(result => result.isSuccess);
  });

  Handlebars.registerHelper("hasFailedSaves", function (results) {
    return results.some(result => !result.isSuccess);
  });
};