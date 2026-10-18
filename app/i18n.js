'use strict';

/* ==========================================================================
   Translations
   Each language lives in strings-<code>.js and fills STRINGS[code] with the same keys.
   Placeholders look like {name}. A missing key falls back to English, then to the key.
   ========================================================================== */
const LANGUAGES = [
  { code: 'en', name: 'English', locale: 'en-US' },
  { code: 'el', name: 'Ελληνικά', locale: 'el-GR' },
  { code: 'es', name: 'Español', locale: 'es-ES' },
];

const STRINGS = {};

function detectLanguage() {
  const code = String(navigator.language || 'en').slice(0, 2).toLowerCase();
  return LANGUAGES.some(language => language.code === code) ? code : 'en';
}

function t(key, values) {
  const dictionary = STRINGS[state.settings.language] || STRINGS.en;
  const text = dictionary[key] ?? STRINGS.en[key] ?? key;
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in values ? values[name] : match));
}

const locale = () => LANGUAGES.find(language => language.code === state.settings.language).locale;
