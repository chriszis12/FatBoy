'use strict';

/* ==========================================================================
   Markup helpers
   `html` escapes every interpolated value unless it is already markup, so user
   text (food names, profile name) can never inject elements.
   ========================================================================== */
class Markup {
  constructor(value) { this.value = value; }
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = text => String(text).replace(/[&<>"']/g, ch => ESCAPES[ch]);

function toMarkup(value) {
  if (value instanceof Markup) return value.value;
  if (Array.isArray(value)) return value.map(toMarkup).join('');
  if (value === false || value == null) return '';
  return escapeHtml(value);
}

function html(strings, ...values) {
  let out = '';
  strings.forEach((part, i) => {
    out += part + (i < values.length ? toMarkup(values[i]) : '');
  });
  return new Markup(out);
}

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/* ==========================================================================
   Icons
   ========================================================================== */
const ICON_PATHS = {
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chef: '<path d="M7 19h10v2H7zM7 19v-3.2A4.2 4.2 0 1 1 8.6 8a4 4 0 0 1 6.8 0A4.2 4.2 0 1 1 17 15.8V19"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  gem: '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M9 3l-2 6 5 12M15 3l2 6-5 12"/>',
  heart: '<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  learn: '<path d="M3 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H3zM21 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>',
  track: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/>',
  quest: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.2-4.2"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/>',
  camera: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  scale: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 10a4 4 0 0 1 8 0M12 10l2-2"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v2a3 3 0 0 0 4 3M16 6h4v2a3 3 0 0 1-4 3M12 13v4M8 21h8M10 17h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  flag: '<path d="M6 21V4M6 5h11l-2 4 2 4H6"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9-4.3-4.1 5.9-.8z"/>',
  bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15zM10 21h4"/>',
  chat: '<path d="M4 5h16v11H10l-5 4v-4H4z"/>',
  send: '<path d="M4 12l16-8-6 16-3-7z"/>',
  more: '<path d="M5 12h.01M12 12h.01M19 12h.01"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  food: '<path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M17 3c-2.5 2-3 6-1 9h1v9"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/>',
  snow: '<path d="M12 2v20M4 7l16 10M20 7L4 17"/>',
  repeat: '<path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17v.5"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
};

const icon = (name, { solid = false } = {}) =>
  html`<svg class="icon${solid ? ' is-solid' : ''}" viewBox="0 0 24 24" aria-hidden="true">${new Markup(ICON_PATHS[name])}</svg>`;

/* ==========================================================================
   Dates, numbers and units
   ========================================================================== */
const pad2 = n => String(n).padStart(2, '0');
const dateKey = (date = new Date()) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const today = () => dateKey();

function parseKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}
const addDays = (key, days) => {
  const date = parseKey(key);
  date.setDate(date.getDate() + days);
  return dateKey(date);
};
const shortDate = key => parseKey(key).toLocaleDateString(locale(), { month: 'short', day: 'numeric' });
const longDate = key => parseKey(key).toLocaleDateString(locale(), { weekday: 'long', month: 'long', day: 'numeric' });
const weekday = key => parseKey(key).toLocaleDateString(locale(), { weekday: 'short' });

const formatInt = n => Math.round(n).toLocaleString(locale());
const formatDecimal = (n, digits = 1) =>
  n.toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
const makeId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function hashText(text) {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const LB_PER_KG = 2.20462;
const mass = {
  unit: () => (state.units === 'metric' ? 'kg' : 'lb'),
  fromKg: kg => (state.units === 'metric' ? kg : kg * LB_PER_KG),
  toKg: value => (state.units === 'metric' ? value : value / LB_PER_KG),
  format: kg => `${formatDecimal(mass.fromKg(kg))} ${mass.unit()}`,
};

/* ==========================================================================
   State and storage
   ========================================================================== */
const STORAGE_KEY = 'fatboy.v1';

const defaultSettings = () => ({
  theme: 'system',      // system | light | dark
  language: detectLanguage(),
  motion: 'auto',       // auto | full | reduced
  accent: 'blue',       // blue | yellow | green | purple | pink
  glass: 'clear',       // clear | solid
  dailyGoal: 30,        // XP
  reminder: '19:00',    // time of the daily calendar reminder
  sound: 'on',          // on | off
  muteWords: '',        // forum words to hide, comma separated
  remind: 'off',        // on-device reminders (app only)
  remindAt: '19:00',
});

const ACCENTS = ['blue', 'yellow', 'green', 'purple', 'pink'];

const createState = settings => ({
  settings: settings || defaultSettings(),
  profile: null,        // { name, sex, age, heightCm, weightKg, goalKg, activity, pace, start }
  units: 'metric',
  xp: 0,
  gems: 50,
  hearts: 5,
  heartsAt: Date.now(),
  freezes: 0,
  best: 0,
  perfects: 0,
  days: {},             // date -> XP earned
  frozen: [],           // dates protected by a streak freeze
  done: {},             // "unit.lesson" -> times completed
  lessonsByDay: {},
  perfectsByDay: {},
  food: {},             // date -> [{ id, name, kcal, meal }]
  water: {},            // date -> glasses
  moves: {},            // date -> [{ id, type, min, kcal }]
  weights: {},          // date -> kg
  measures: {},         // date -> { waist, hips, chest, arm, thigh } in cm
  meals: [],            // saved meals, { id, name, kcal, p, c, f }
  scans: [],            // recently found foods, for quick re-adding
  saved: {},            // recipe id -> 1
  recipes: {},          // saved recipes written by Claude, by id
  cooked: {},           // date -> recipes logged
  fast: null,           // { start, hours } while a fast is running
  fasts: [],            // finished fasts, { start, end, goal }
  claimed: {},          // quest and chest claims
  checks: {},           // self-reported quests, "date:id" -> 1
  revealed: {},         // quest cards turned face up, "date:id" -> 1
  flags: {},
});

function loadState() {
  const fresh = createState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) {
      const settings = { ...fresh.settings, ...saved.settings };
      if (saved.plus && !(saved.settings && saved.settings.accent)) settings.accent = 'yellow'; // old Plus look lives on as a theme
      delete saved.plus;
      return { ...fresh, ...saved, settings };
    }
  } catch (error) { /* storage can be blocked; fall back to a fresh state */ }
  return fresh;
}

function saveState() {
  state.updatedAt = Date.now();
  queueSync();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (error) { /* ignore */ }
}

let state = loadState();

/* ==========================================================================
   Nutrition
   ========================================================================== */
const ACTIVITY_FACTORS = { 1: 1.2, 2: 1.375, 3: 1.55, 4: 1.725 };

const PACES = [
  { id: 'gentle', kgPerWeek: 0.25 },
  { id: 'steady', kgPerWeek: 0.5 },
  { id: 'faster', kgPerWeek: 0.75 },
];

const KCAL_PER_KG_FAT = 7700;

// Mifflin-St Jeor estimate. Targets never go below a safe floor.
function planCalories(profile, weightKg, kgPerWeek) {
  const base = 10 * weightKg + 6.25 * profile.heightCm - 5 * profile.age;
  const bmr = base + (profile.sex === 'm' ? 5 : -161);
  // After a check-in the person's own logs can replace the formula.
  const maintenance = profile.maintenanceOverride || bmr * ACTIVITY_FACTORS[profile.activity];
  const wanted = maintenance - (kgPerWeek * KCAL_PER_KG_FAT) / 7;
  const floor = profile.sex === 'm' ? 1500 : 1200;
  return {
    maintenance: Math.round(maintenance),
    target: Math.max(floor, Math.round(wanted / 10) * 10),
    limited: wanted < floor,
    floor,
  };
}

const lowestHealthyKg = heightCm => 18.5 * Math.pow(heightCm / 100, 2);

/* ==========================================================================
   Selectors
   ========================================================================== */
const currentWeightKg = () => {
  const dates = Object.keys(state.weights).sort();
  if (dates.length) return state.weights[dates[dates.length - 1]];
  return state.profile ? state.profile.weightKg : 70;
};
const calorieTarget = () => planCalories(state.profile, currentWeightKg(), state.profile.pace).target;
const foodToday = () => state.food[today()] || [];
const movesToday = () => state.moves[today()] || [];
const caloriesEaten = () => foodToday().reduce((sum, item) => sum + item.kcal, 0);
const caloriesBurned = () => movesToday().reduce((sum, item) => sum + item.kcal, 0);
const minutesMoved = () => movesToday().reduce((sum, item) => sum + item.min, 0);
const glassesToday = () => state.water[today()] || 0;
const xpToday = () => state.days[today()] || 0;
const kgLost = () => (state.profile ? state.profile.weightKg - currentWeightKg() : 0);
const level = () => Math.floor(state.xp / 150) + 1;
const dailyGoal = () => state.settings.dailyGoal;

// How far along the way to the goal weight (0 to 1). The logo slims with this.
const slimProgress = () => {
  if (!state.profile) return 0;
  const { weightKg, goalKg } = state.profile;
  return clamp((weightKg - currentWeightKg()) / (weightKg - goalKg), 0, 1);
};

// The drawing is at its heaviest at a BMI of 36 and above, and at its leanest at 22 and below, so the
// figure follows the height and weight that were entered, not just how far along the plan is.
const BMI_HEAVY = 36;
const BMI_LEAN = 22;
const bmiOf = (kg, heightCm) => kg / Math.pow(heightCm / 100, 2);
// Someone who starts above a BMI of 36 gets a heaviest point of their own, so the first kilos they lose
// already change the drawing instead of disappearing into the flat top of the scale.
const heaviestBmi = () => (state.profile ? Math.max(BMI_HEAVY, bmiOf(state.profile.weightKg, state.profile.heightCm)) : BMI_HEAVY);
const figureProgress = (kg = currentWeightKg()) =>
  state.profile ? clamp((heaviestBmi() - bmiOf(kg, state.profile.heightCm)) / (heaviestBmi() - BMI_LEAN), 0, 1) : 0;
// The weight (and BMI) the drawing stands for at a given point of the slider.
const bmiAtFigure = progress => heaviestBmi() - progress * (heaviestBmi() - BMI_LEAN);
const weightAtFigure = progress => bmiAtFigure(progress) * Math.pow(state.profile.heightCm / 100, 2);

const lessonId = (unit, lesson) => `${unit}.${lesson}`;
const lessonsDone = () => Object.keys(state.done).length;
const unitLessonsDone = unit =>
  Array.from({ length: LESSONS_PER_UNIT }, (_, lesson) => state.done[lessonId(unit, lesson)]).filter(Boolean).length;
const isUnitDone = unit => unitLessonsDone(unit) === LESSONS_PER_UNIT;
// Index of the first lesson that is not complete (TOTAL_LESSONS when everything is done).
const firstOpenLesson = () => {
  for (let index = 0; index < TOTAL_LESSONS; index++) {
    const unit = Math.floor(index / LESSONS_PER_UNIT);
    if (!state.done[lessonId(unit, index % LESSONS_PER_UNIT)]) return index;
  }
  return TOTAL_LESSONS;
};

/* ==========================================================================
   Hearts, XP and streaks
   ========================================================================== */
const HEART_MAX = 5;
const HEART_REFILL_MS = 30 * 60 * 1000;
const REFILL_COST = 50;
const FREEZE_COST = 100;
const FREEZE_MAX = 2;

function regenerateHearts() {
  if (state.hearts >= HEART_MAX) {
    state.heartsAt = Date.now();
    return;
  }
  const earned = Math.floor((Date.now() - state.heartsAt) / HEART_REFILL_MS);
  if (earned <= 0) return;
  state.hearts = Math.min(HEART_MAX, state.hearts + earned);
  state.heartsAt = state.hearts >= HEART_MAX ? Date.now() : state.heartsAt + earned * HEART_REFILL_MS;
  saveState();
}

function loseHeart() {
  if (state.hearts === HEART_MAX) state.heartsAt = Date.now();
  state.hearts = Math.max(0, state.hearts - 1);
  saveState();
}

const isActiveDay = key => (state.days[key] || 0) > 0 || state.frozen.includes(key);

function currentStreak() {
  let key = today();
  if (!isActiveDay(key)) key = addDays(key, -1);
  let count = 0;
  while (isActiveDay(key) && count < 3650) {
    count++;
    key = addDays(key, -1);
  }
  return count;
}

// Spend freezes to bridge missed days, but only when there are enough to cover the whole gap.
function protectStreak() {
  const current = today();
  if (isActiveDay(current)) return;

  let lastActive = null;
  for (let key = addDays(current, -1), i = 0; i < 400; key = addDays(key, -1), i++) {
    if (isActiveDay(key)) { lastActive = key; break; }
  }
  if (!lastActive) return;

  const missed = [];
  for (let key = addDays(lastActive, 1); key < current; key = addDays(key, 1)) missed.push(key);
  if (missed.length && missed.length <= state.freezes) {
    state.freezes -= missed.length;
    state.frozen.push(...missed);
    saveState();
  }
}

function grantXp(xp, gems = 0) {
  const before = Math.floor(state.xp / 150);
  state.days[today()] = xpToday() + xp;
  state.xp += xp;
  state.gems += gems;
  state.best = Math.max(state.best, currentStreak());
  saveState();
  if (typeof sfx === 'function' && Math.floor(state.xp / 150) > before) sfx('level');
}

// Small first-time-each-day XP so logging alone keeps a streak alive.
function grantDailyBonus(kind, xp) {
  state.flags.bonus = state.flags.bonus || {};
  const key = today() + kind;
  if (state.flags.bonus[key]) return;
  state.flags.bonus[key] = 1;
  grantXp(xp);
}
