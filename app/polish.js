'use strict';

/* ==========================================================================
   Polish: sounds, share cards, reminders
   ========================================================================== */

/* --- Sounds: tiny synthesized tones, no audio files ------------------------------------------ */
let audioCtx = null;
const TONES = {
  tap: [[660, 0.04, 0]],
  log: [[587, 0.07, 0], [784, 0.09, 0.06]],
  success: [[523, 0.09, 0], [659, 0.09, 0.08], [784, 0.14, 0.16]],
  level: [[523, 0.1, 0], [659, 0.1, 0.09], [784, 0.1, 0.18], [1047, 0.2, 0.27]],
  oops: [[300, 0.12, 0], [220, 0.18, 0.1]],
};

function sfx(kind) {
  if (state.settings.sound === 'off') return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const start = audioCtx.currentTime;
    for (const [freq, length, delay] of TONES[kind] || TONES.tap) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start + delay);
      gain.gain.exponentialRampToValueAtTime(0.07 * ({ low: 0.5, medium: 1, high: 1.8 }[state.settings.volume] || 1), start + delay + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + delay + length + 0.05);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(start + delay);
      osc.stop(start + delay + length + 0.08);
    }
  } catch (error) { /* audio can be blocked; the app works the same without it */ }
}

/* --- Saved meals and scan history ------------------------------------------------------------- */
const savedMeals = () => (Array.isArray(state.meals) ? state.meals : (state.meals = []));

function savedMealsBlock() {
  const list = savedMeals();
  if (!list.length) return html``;
  return html`
    <div class="stack-tight">
      <p class="field-label">${t('food.saved')}</p>
      <div class="row row-wrap row-tight">${list.map(meal => html`
        <span class="chip-pair">
          <button type="button" class="btn btn-tonal btn-small" data-action="use-meal" data-id="${meal.id}">${meal.name}, ${formatInt(meal.kcal)}</button>
          <button type="button" class="icon-btn icon-btn-small" data-action="forget-meal" data-id="${meal.id}" aria-label="${t('common.remove', { name: meal.name })}">${icon('trash')}</button>
        </span>`)}
      </div>
    </div>`;
}

function rememberScan(food) {
  if (!food) return;
  const list = (Array.isArray(state.scans) ? state.scans : []).filter(item => item.name !== food.name || item.code !== food.code);
  list.unshift(food);
  state.scans = list.slice(0, 12);
}

function scanBlock() {
  const list = Array.isArray(state.scans) ? state.scans : [];
  if (!list.length) return html``;
  return html`
    <div class="stack-tight">
      <p class="field-label">${t('food.scans')}</p>
      <div class="row row-wrap row-tight">${list.map((food, i) => html`
        <button type="button" class="btn btn-tonal btn-small" data-action="use-scan" data-index="${i}">${food.name}</button>`)}
      </div>
    </div>`;
}

/* --- Body measurements ------------------------------------------------------------------------ */
const MEASURES = ['waist', 'hips', 'chest', 'arm', 'thigh'];
const toDisplayLength = cm => (state.units === 'metric' ? cm : cm / 2.54);
const fromDisplayLength = value => (state.units === 'metric' ? value : value * 2.54);
const lengthUnit = () => (state.units === 'metric' ? 'cm' : 'in');
const measureDates = () => Object.keys(state.measures || {}).sort();

function measureLatest(key) {
  const dates = measureDates().filter(date => state.measures[date][key] > 0);
  if (!dates.length) return null;
  const first = state.measures[dates[0]][key];
  const last = state.measures[dates[dates.length - 1]][key];
  return { last, change: last - first, count: dates.length };
}

function measuresCard() {
  const error = ui.errors.measure;
  return html`
    <form class="card" data-form="measure" novalidate>
      <h2>${t('measure.title')}</h2>
      <p class="caption">${t('measure.help')}</p>
      <div class="grid-2">${MEASURES.map(key => {
        const latest = measureLatest(key);
        return html`
          <div class="field">
            <label for="measure-${key}">${t(`measure.${key}`)} (${lengthUnit()})</label>
            <input ${attributes({ class: 'input', id: `measure-${key}`, type: 'number', inputmode: 'decimal', step: '0.1', placeholder: latest ? formatDecimal(toDisplayLength(latest.last)) : '' })}>
            ${latest && latest.count > 1 ? html`<p class="caption num">${t('measure.change', { n: `${latest.change > 0 ? '+' : ''}${formatDecimal(toDisplayLength(latest.change))} ${lengthUnit()}` })}</p>` : html``}
          </div>`;
      })}</div>
      ${errorLine('measure-error', error)}
      <button class="btn btn-large" type="submit">${icon('check')}${t('measure.save')}</button>
    </form>`;
}

function saveMeasures(read) {
  const entry = {};
  for (const key of MEASURES) {
    const raw = String(read(`measure-${key}`) ?? '').trim();
    if (!raw) continue;
    const cm = fromDisplayLength(Number(raw));
    if (!(cm >= 10 && cm <= 250)) return t('measure.invalid');
    entry[key] = Math.round(cm * 10) / 10;
  }
  if (!Object.keys(entry).length) return t('measure.invalid');
  state.measures = state.measures || {};
  state.measures[today()] = { ...(state.measures[today()] || {}), ...entry };
  saveState();
  sfx('success');
  toast(t('measure.saved'));
  return null;
}

/* --- Weekly goal ring ------------------------------------------------------------------------- */
const WEEK_GOAL = 5;
const weekKey = () => { const d = parseKey(today()); const back = state.settings.weekStart === 'sun' ? d.getDay() : (d.getDay() + 6) % 7; return addDays(today(), -back); };
const weekLogged = () => {
  const start = weekKey();
  return Array.from({ length: 7 }, (_, i) => addDays(start, i)).filter(key => key <= today() && foodOn(key).length).length;
};

function weekRing() {
  const n = weekLogged();
  const pct = Math.min(1, n / WEEK_GOAL);
  const r = 28; const c = 2 * Math.PI * r;
  return html`
    <section class="card row week-ring" aria-label="${t('goal.week')}">
      <svg viewBox="0 0 72 72" width="72" height="72" role="img" aria-label="${t('goal.weekOf', { n, goal: WEEK_GOAL })}">
        <circle cx="36" cy="36" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="8"/>
        <circle cx="36" cy="36" r="${r}" fill="none" stroke="var(--accent)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(c * pct).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 36 36)"/>
      </svg>
      <div class="grow"><h2>${t('goal.week')}</h2><p class="caption num">${t('goal.weekOf', { n, goal: WEEK_GOAL })}</p></div>
    </section>`;
}

function checkWeekGoal() {
  if (weekLogged() < WEEK_GOAL || state.flags.weekGoal === weekKey()) return;
  state.flags.weekGoal = weekKey();
  state.gems += 20;
  saveState();
  sfx('level');
  toast(t('goal.done'));
}

/* --- Reminders (on the phone, no server) ------------------------------------------------------ */
const reminderApi = () => window.fatboyNotify;

function buildReminders() {
  const [hour, minute] = String(state.settings.remindAt || '19:00').split(':').map(Number);
  const items = [{ id: 1, daily: true, hour, minute, title: t('notify.daily.title'), body: t('notify.daily.body') }];
  const now = Date.now();
  if (!state.days[today()]) {
    const evening = new Date(); evening.setHours(21, 0, 0, 0);
    if (evening.getTime() > now) items.push({ id: 2, at: evening.getTime(), title: t('notify.streak.title'), body: t('notify.streak.body') });
  }
  if (state.fast) {
    const end = state.fast.start + state.fast.hours * 3600000;
    if (end > now) items.push({ id: 3, at: end, title: t('notify.fast.title'), body: t('notify.fast.body') });
  }
  return items;
}

async function syncReminders() {
  const api = reminderApi();
  if (!api) return;
  try { await api.schedule(state.settings.remind === 'on' ? buildReminders() : []); } catch (error) { /* reminders are a nicety */ }
}

async function setReminders(on) {
  const api = reminderApi();
  if (on) {
    let granted = false;
    try { granted = await api.enable(); } catch (error) { granted = false; }
    if (!granted) { toast(t('settings.remindDenied')); return; }
  }
  state.settings.remind = on ? 'on' : 'off';
  saveState();
  await syncReminders();
  paint();
}

/* --- Share cards ------------------------------------------------------------------------------ */
function drawCard() {
  const canvas = document.createElement('canvas');
  canvas.width = 1080; canvas.height = 1350;
  const g = canvas.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const get = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  const accent = get('--accent', '#0a6cff');
  g.fillStyle = '#0d1117'; g.fillRect(0, 0, 1080, 1350);
  g.fillStyle = accent; g.fillRect(0, 0, 1080, 18);
  g.fillStyle = '#ffffff'; g.textAlign = 'left';
  g.font = '700 56px system-ui, sans-serif'; g.fillText('FatBoy', 80, 150);
  g.fillStyle = '#9aa4b2'; g.font = '500 40px system-ui, sans-serif';
  g.fillText(state.profile?.name || '', 80, 215);
  const stats = weekStats();
  const rows = [
    [String(currentStreak()), t('share.streak')],
    [formatInt(weekXp()), t('share.xp')],
    [`${stats.weekDays}/7`, t('share.logged')],
  ];
  rows.forEach(([big, small], i) => {
    const y = 420 + i * 270;
    g.fillStyle = '#ffffff'; g.font = '800 170px system-ui, sans-serif'; g.fillText(big, 80, y);
    g.fillStyle = accent; g.font = '600 46px system-ui, sans-serif'; g.fillText(small, 84, y + 62);
  });
  g.fillStyle = '#9aa4b2'; g.font = '500 36px system-ui, sans-serif';
  g.fillText(t('share.tag'), 80, 1270);
  return canvas;
}

const cardBlob = () => new Promise(resolve => drawCard().toBlob(resolve, 'image/png'));

async function shareCardNow() {
  const blob = await cardBlob();
  const text = t('share.text', { n: currentStreak() });
  try {
    if (window.fatboyShare) await window.fatboyShare.image(blob, 'fatboy-week.png', text);
    else if (navigator.canShare?.({ files: [new File([blob], 'fatboy-week.png', { type: 'image/png' })] })) await navigator.share({ files: [new File([blob], 'fatboy-week.png', { type: 'image/png' })], text });
    else if (window.fatboyShare?.text) await window.fatboyShare.text(text);
    else toast(t('share.failed'));
  } catch (error) { /* closed share sheet */ }
}

async function postCardNow() {
  const api = communityApi();
  if (!api || !account.user || !forum.profile) { toast(t('share.needSocial')); return; }
  try {
    const image = await api.uploadImage(await cardBlob());
    await api.createPost({ category: 'wins', title: t('share.postTitle', { n: currentStreak() }), body: t('share.text', { n: currentStreak() }), image });
    sfx('success');
    toast(t('share.posted'));
  } catch (error) { toast(t('share.failed')); }
}

/* --- Ask the community ------------------------------------------------------------------------ */
function askCommunity(title = '') {
  if (!communityApi() || !account.user) { toast(t('share.needSocial')); return; }
  closeSheet();
  ui.tab = 'forum';
  forumEnter();
  forumPrefill('questions', title);
  paint({ entering: true });
  openSheet(composeSheet());
}

/* --- Settings pieces -------------------------------------------------------------------------- */
function polishSettings() {
  const { settings } = state;
  return html`
    <section class="card" aria-labelledby="polish-title">
      <h2 id="polish-title">${t('settings.sound')}</h2>
      ${segmented({ id: 'set-sound', label: t('settings.sound'), action: 'set-setting', field: 'sound', value: settings.sound,
        options: [['on', t('settings.soundOn')], ['off', t('settings.soundOff')]] })}
      <div class="field">
        <label for="set-mute">${t('settings.mute')}</label>
        <input class="input" id="set-mute" maxlength="120" autocomplete="off" value="${settings.muteWords || ''}" data-setting-text="muteWords">
        <p class="caption">${t('settings.muteHelp')}</p>
      </div>
      ${reminderApi() ? html`
        ${segmented({ id: 'set-remind', label: t('settings.reminders'), action: 'set-reminders', field: 'remind', value: settings.remind || 'off',
          options: [['on', t('settings.soundOn')], ['off', t('settings.soundOff')]] })}
        <div class="field">
          <label for="set-remind-at">${t('settings.remindAt')}</label>
          <input class="input" id="set-remind-at" type="time" value="${settings.remindAt || '19:00'}" data-setting-text="remindAt">
          <p class="caption">${t('settings.remindHelp')}</p>
        </div>` : html``}
    </section>
    ${comfortSettings()}`;
}

document.addEventListener('input', event => {
  const field = event.target.closest?.('[data-setting-text]');
  if (!field) return;
  state.settings[field.dataset.settingText] = field.value;
  saveState();
  if (field.dataset.settingText === 'remindAt') syncReminders();
});

document.addEventListener('visibilitychange', () => { if (!document.hidden) syncReminders(); });

const polishActions = {
  'save-meal': el => {
    const item = Object.values(state.food).flat().find(entry => entry.id === el.dataset.id);
    if (!item) return;
    const list = savedMeals();
    if (!list.some(meal => meal.name === item.name && meal.kcal === item.kcal)) list.unshift({ id: makeId(), name: item.name, kcal: item.kcal, p: item.p, c: item.c, f: item.f });
    state.meals = list.slice(0, 20);
    saveState(); paint(); toast(t('food.mealSaved', { name: item.name }));
  },
  'use-meal': el => {
    const meal = savedMeals().find(item => item.id === el.dataset.id);
    if (!meal) return;
    logFood(meal.name, meal.kcal, mealForNow(), { p: meal.p, c: meal.c, f: meal.f }, foodDayKey());
    sfx('log'); checkWeekGoal(); paint(); toast(t('toast.added', { name: meal.name, kcal: meal.kcal }));
  },
  'forget-meal': el => { state.meals = savedMeals().filter(item => item.id !== el.dataset.id); saveState(); paint(); },
  'use-scan': el => {
    const food = state.scans?.[Number(el.dataset.index)];
    if (!food) return;
    foodFind.results = [food]; foodFind.message = ''; paintFindResults();
  },
  'save-found': el => {
    const food = foodFind.results[Number(el.dataset.index)];
    if (!food) return;
    const grams = Number($('#find-grams')?.value) || 100;
    const scale = grams / 100;
    const list = savedMeals();
    list.unshift({ id: makeId(), name: cleanText(food.name, 40), kcal: Math.max(1, Math.round(food.kcal100 * scale)), p: Math.round(food.p100 * scale * 10) / 10, c: Math.round(food.c100 * scale * 10) / 10, f: Math.round(food.f100 * scale * 10) / 10 });
    state.meals = list.slice(0, 20);
    saveState(); toast(t('food.mealSaved', { name: food.name }));
  },
  'set-reminders': el => setReminders(el.dataset.value === 'on'),
  'share-card': () => shareCardNow(),
  'post-card': () => postCardNow(),
  'ask-community': el => askCommunity(el.dataset.title || ''),
};

document.addEventListener('input', event => {
  const slider = event.target.closest?.('[data-setting-range]');
  if (!slider) return;
  state.settings[slider.dataset.settingRange] = Number(slider.value);
  slider.setAttribute('aria-valuetext', `${slider.value}%`);
  applyFrost();
  saveState();
});

/* --- Plan reveal after setup ------------------------------------------------------------------ */
function planRevealSheet() {
  const { profile } = state;
  const plan = planCalories(profile, currentWeightKg(), profile.pace);
  const toLose = Math.max(0, profile.weightKg - profile.goalKg);
  const weeks = Math.max(1, Math.ceil(toLose / Math.max(0.1, profile.pace)));
  return {
    label: t('plan.revealTitle'),
    body: html`
      <div class="center stack">
        ${figureMark('figure-sm')}
        <h2>${t('plan.revealTitle')}</h2>
        <div class="grid-2 fill">
          <div class="tile"><p class="caption">${t('plan.daily')}</p><h2 class="num">${formatInt(plan.target)}</h2><p class="caption">kcal</p></div>
          <div class="tile"><p class="caption">${t('plan.timeline')}</p><h2 class="num">${weeks}</h2><p class="caption">${t('plan.weeks')}</p></div>
        </div>
        <p class="caption measure">${t('plan.revealBody', { goal: mass.format(profile.goalKg) })}</p>
        <button class="btn btn-large" data-action="close-sheet">${t('plan.start')}</button>
      </div>`,
  };
}

/* --- Android back button: close things in order, leave the app only from the first tab -------- */
window.addEventListener('fatboy-back', event => {
  if (roots.sheet.childElementCount) { closeSheet(); event.preventDefault(); return; }
  if (typeof session !== 'undefined' && session) {
    session.confirmingQuit = !session.confirmingQuit;
    drawLesson();
    event.preventDefault();
    return;
  }
  if (ui.tab === 'forum' && forum.page) { forumBack(); event.preventDefault(); return; }
  if (ui.tab === 'profile' && ui.profileView !== 'main') { ui.profileView = 'main'; paint({ entering: true }); event.preventDefault(); return; }
  if (state.profile && ui.tab !== 'learn') { goTo('learn'); event.preventDefault(); }
});


/* --- Comfort settings and expressive motion --------------------------------------------------- */
function comfortSettings() {
  const { settings } = state;
  const pick = (id, field, options) => segmented({ id: `set-${id}`, label: t(`settings.${id}`), action: 'set-setting', field, value: settings[field],
    options: options.map(([value, key]) => [value, t(key)]) });
  return html`
    <section class="card" aria-labelledby="comfort-title">
      <h2 id="comfort-title">${t('settings.comfort')}</h2>
      ${pick('textSize', 'textSize', [['small', 'settings.small'], ['normal', 'settings.normal'], ['large', 'settings.large'], ['xl', 'settings.xl']])}
      ${pick('density', 'density', [['cozy', 'settings.cozy'], ['compact', 'settings.compact']])}
      ${pick('tabLabels', 'tabLabels', [['on', 'settings.soundOn'], ['off', 'settings.soundOff']])}
      ${pick('haptics', 'haptics', [['on', 'settings.soundOn'], ['off', 'settings.soundOff']])}
      ${pick('volume', 'volume', [['low', 'settings.low'], ['medium', 'settings.medium'], ['high', 'settings.high']])}
      ${pick('weekStart', 'weekStart', [['mon', 'settings.monday'], ['sun', 'settings.sunday']])}
    </section>`;
}

const expressive = () => document.documentElement.dataset.expressive === 'on';
function celebrate(power = 1) {
  if (!expressive()) return;
  burst(innerWidth / 2, innerHeight * 0.68, { count: Math.round(22 * power), spread: 170 * power });
}
