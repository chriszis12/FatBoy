'use strict';

/* ==========================================================================
   Content shared by every language: question builders, lookups and constants
   ========================================================================== */

// Lessons live in content-<language>.js. Every language file has the same shape:
// 5 units x 3 lessons x 5 questions, and the correct option always comes first.
const CONTENT = {};

const choice = (prompt, correct, wrong, explanation) => ({
  kind: 'choice',
  prompt,
  options: [correct, ...wrong],
  explanation,
});

const factOrMyth = (statement, isFact, explanation) => ({
  kind: 'fact',
  prompt: statement,
  isFact,
  explanation,
});

const matching = (prompt, pairs) => ({ kind: 'match', prompt, pairs });

const UNIT_ICONS = ['bolt', 'food', 'pulse', 'repeat', 'moon'];
const LESSONS_PER_UNIT = 3;
const TOTAL_LESSONS = UNIT_ICONS.length * LESSONS_PER_UNIT;

// Units in the language the app is currently showing.
const units = () => CONTENT[state.settings.language].map((unit, i) => ({ ...unit, icon: UNIT_ICONS[i] }));

const QUICK_FOODS = [
  { key: 'apple', kcal: 95, p: 0, c: 25, f: 0 },
  { key: 'banana', kcal: 105, p: 1, c: 27, f: 0 },
  { key: 'egg', kcal: 70, p: 6, c: 0, f: 5 },
  { key: 'yogurt', kcal: 100, p: 10, c: 8, f: 2 },
  { key: 'oatmeal', kcal: 160, p: 6, c: 27, f: 3 },
  { key: 'chicken', kcal: 165, p: 31, c: 0, f: 4 },
  { key: 'rice', kcal: 200, p: 4, c: 44, f: 0 },
  { key: 'pizza', kcal: 285, p: 12, c: 36, f: 10 },
  { key: 'coffee', kcal: 50, p: 3, c: 5, f: 2 },
  { key: 'peanutButter', kcal: 95, p: 4, c: 3, f: 8 },
  { key: 'avocado', kcal: 120, p: 2, c: 6, f: 11 },
  { key: 'salad', kcal: 90, p: 3, c: 8, f: 5 },
];

// Metabolic equivalents, used to estimate calories burned. Keys are stored in the log.
const WORKOUT_MET = { Walk: 3.5, Run: 9, Cycle: 7, Strength: 5, Swim: 7, Other: 4 };
const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
