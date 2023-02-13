import { i18n_EN } from "./i18n_EN.js";

interface i18nI {
  //[index: string]: (string | (()=>string) );
  [index: string]: any;
}

let ActiveLanguage = null; // internal variable (singleton, always created);

export let LoadLanguage = function (langSpec) {
  ActiveLanguage = new Proxy(langSpec, {
    // returns the value in indexed position if it exists. Otherwise, returns the key.
    get: function (obj, prop) {
      return prop in obj ? obj[prop] : prop;
    },
  });
};

// Main object used to index translation keys.
// Loads the default language (i18n_EN) if it's not defined yet.
export var i18n: i18nI = new Proxy(
  {},
  {
    // using proxy feature to adjust return values...
    get: function (obj, prop) {
      // if not defined, load English
      if (!ActiveLanguage) LoadLanguage(new i18n_EN());
      return ActiveLanguage[prop];
    },
  }
);
