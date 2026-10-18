'use strict';

/* ==========================================================================
   View state and shared components
   ========================================================================== */
const ui = {
  tab: 'learn',
  trackPanel: 'food',
  profileView: 'main',  // main | settings
  day: null,            // past day shown in the food log, null for today
  fastHours: 16,
  tipShift: 0,          // taps on the mascot to see another tip
  errors: {},           // form name -> message
  draft: null,          // onboarding answers
  goalDraft: null,      // edit-goal sheet
  newId: null,          // food or workout that was just added, so its row can animate in
  newCup: null,         // water glass that was just filled
  recipeFilter: 'all',  // all | a meal | saved
};

const attributes = attrs =>
  new Markup(
    Object.entries(attrs)
      .filter(([, value]) => value !== false && value != null)
      .map(([name, value]) => (value === true ? ` ${name}` : ` ${name}="${escapeHtml(value)}"`))
      .join('')
  );

const errorLine = (id, message) =>
  message ? html`<p class="error" id="${id}">${icon('alert')}<span>${message}</span></p>` : '';

// `key` identifies the meter across repaints so it can grow from its old value.
const progressBar = (label, key, value, max, extraClass = '') =>
  html`<div class="bar ${extraClass}" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${Math.min(value, max)}"><i data-tween="${key}" style="--v:${fraction(value / max)}"></i></div>`;

const statRow = (label, value) =>
  html`<div class="list-row"><span class="grow">${label}</span><span class="num">${value}</span></div>`;

function segmented({ id, label, action, field, options, value, error }) {
  return html`
    <div class="field">
      <span class="field-label" id="${id}-label">${label}</span>
      <div class="segmented" role="radiogroup" aria-labelledby="${id}-label">
        ${options.map(([optionValue, text]) => html`
          <button type="button" role="radio" data-action="${action}" ${attributes({ 'data-field': field })} data-value="${optionValue}" aria-checked="${String(String(value) === String(optionValue))}">${text}</button>`)}
      </div>
      ${errorLine(`${id}-error`, error)}
    </div>`;
}

/* ==========================================================================
   Chrome: toolbar and tab bar
   ========================================================================== */
const countText = (key, value) => html`<span class="num" data-key="${key}" data-count="${value}">${formatInt(value)}</span>`;

function toolbar() {
  const streak = currentStreak();
  return html`
    <header class="toolbar glass">
      <div class="container toolbar-inner">
        <div class="brand">${logo(44, 14)}<span class="brand-name">FatBoy</span>${state.plus ? html`<span class="pill plus-pill">${t('plus.badge')}</span>` : ''}</div>
        <div class="stats">
          <button class="stat stat-streak ${streak > 0 ? 'is-lit' : ''}" data-action="show-streak" aria-label="${t('toolbar.streak', { n: streak })}">${icon('flame', { solid: true })}${countText('streak', streak)}</button>
          <button class="stat stat-gems" data-action="show-shop" aria-label="${t('toolbar.gems', { n: state.gems })}">${icon('gem')}${countText('gems', state.gems)}</button>
          <button class="stat stat-hearts" data-action="show-shop" aria-label="${state.plus ? t('plus.unlimitedHearts') : t('toolbar.hearts', { n: state.hearts, max: HEART_MAX })}">${icon('heart', { solid: true })}${state.plus ? html`<span class="num">∞</span>` : countText('hearts', state.hearts)}</button>
        </div>
      </div>
    </header>`;
}

const TABS = [
  { id: 'learn', icon: 'learn' },
  { id: 'track', icon: 'track' },
  { id: 'quests', icon: 'quest' },
  { id: 'recipes', icon: 'chef' },
  { id: 'profile', icon: 'user' },
];

// Built once per language. Changing tabs only moves the pill and updates aria-current.
const tabBar = () => html`
  <nav class="tabbar glass" aria-label="${t('nav.main')}">
    <ul style="--i:${TABS.findIndex(tab => tab.id === ui.tab)}">
      <li class="tab-pill" aria-hidden="true"></li>
      ${TABS.map(tab => html`
        <li><button class="tab" data-action="go-tab" data-tab="${tab.id}" ${attributes({ 'aria-current': ui.tab === tab.id ? 'page' : null })}>${icon(tab.icon)}<span>${t(`tab.${tab.id}`)}</span></button></li>`)}
    </ul>
  </nav>`;

/* ==========================================================================
   Learn
   ========================================================================== */
function miniRing(value) {
  const radius = 28;
  const length = 2 * Math.PI * radius;
  return html`
    <span class="mini-ring">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle class="ring-track" cx="32" cy="32" r="${radius}"/>
        <circle class="ring-fill" cx="32" cy="32" r="${radius}" stroke="currentColor" data-tween="daily" style="--v:${fraction(value)};--len:${length.toFixed(1)}"/>
      </svg>
      ${icon('bolt', { solid: true })}
    </span>`;
}

function dailyGoalCard() {
  const xp = xpToday();
  const goal = dailyGoal();
  return html`
    <section class="card" aria-labelledby="goal-title">
      <div class="row">
        ${miniRing(xp / goal)}
        <div class="grow">
          <h2 id="goal-title">${t('learn.dailyGoal')}</h2>
          <p class="caption num">${xp >= goal ? t('learn.goalReached') : t('learn.goalProgress', { xp, goal })}</p>
        </div>
      </div>
    </section>`;
}

function lessonStep(lesson, unitIndex, lessonIndex, openIndex) {
  const index = unitIndex * LESSONS_PER_UNIT + lessonIndex;
  const done = Boolean(state.done[lessonId(unitIndex, lessonIndex)]);
  const current = index === openIndex;
  const locked = index > openIndex;

  const status = done ? 'is-done' : current ? 'is-current' : 'is-locked';
  const side = lessonIndex % 2 === 0 ? 'is-right' : 'is-left';
  const nodeIcon = done ? icon('check') : locked ? icon('lock') : icon('play', { solid: true });
  const detail = done ? t('learn.replay') : locked ? t('learn.locked') : t('learn.lessonInfo', { n: lesson.questions.length });

  return html`
    <button class="step ${status} ${side}" data-action="${locked ? 'locked-lesson' : 'open-lesson'}" data-id="${lessonId(unitIndex, lessonIndex)}" ${attributes({ 'aria-disabled': locked ? 'true' : null })}>
      <span class="node" ${attributes({ 'data-tilt': locked ? null : '12' })}>${nodeIcon}</span>
      <span class="step-text">
        <span class="step-title">${lesson.title}</span>
        <span class="caption">${detail}</span>
        ${current ? html`<span class="pill is-tonal">${t('learn.start')}</span>` : ''}
      </span>
    </button>`;
}

function unitCard(unit, unitIndex, openIndex) {
  const finished = unitLessonsDone(unitIndex);
  return html`
    <section class="card" aria-labelledby="unit-${unitIndex}">
      <div class="row">
        <span class="glyph">${icon(unit.icon)}</span>
        <div class="grow">
          <h2 id="unit-${unitIndex}">${unit.title}</h2>
          <p class="caption">${unit.summary}</p>
        </div>
        <span class="pill num ${finished === LESSONS_PER_UNIT ? 'is-tonal' : ''}">${t('common.ofTotal', { n: finished, total: LESSONS_PER_UNIT })}</span>
      </div>
      <div class="path">${unit.lessons.map((lesson, i) => lessonStep(lesson, unitIndex, i, openIndex))}</div>
    </section>`;
}

const TIP_COUNT = 14;

function greeting() {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  return t(`learn.greet.${part}`, { name: state.profile.name });
}

function tipCard() {
  return html`
    <section class="mascot-tip" aria-labelledby="tip-title">
      <button class="mascot" data-action="next-tip" aria-label="${t('learn.nextTip')}">${logo(56, 18)}</button>
      <div class="bubble">
        <h2 id="tip-title" class="bubble-title">${t('learn.tip')}</h2>
        <p class="measure" aria-live="polite">${t(`tip.${(hashText(today()) + ui.tipShift) % TIP_COUNT}`)}</p>
      </div>
    </section>`;
}

function learnScreen() {
  const openIndex = firstOpenLesson();
  return html`
    <div class="page-title">
      <h1>${greeting()}</h1>
      <p class="caption num">${t('learn.complete', { n: lessonsDone(), total: TOTAL_LESSONS })}</p>
    </div>
    ${dailyGoalCard()}
    ${tipCard()}
    ${units().map((unit, i) => unitCard(unit, i, openIndex))}`;
}

/* ==========================================================================
   Track
   ========================================================================== */
const RING_RADII = [88, 66, 44];

function activityRings(rings) {
  const layers = rings.map(({ key, value, color }, i) => {
    const radius = RING_RADII[i];
    const length = 2 * Math.PI * radius;
    return html`
      <circle class="ring-track" cx="100" cy="100" r="${radius}"/>
      <circle class="ring-fill" cx="100" cy="100" r="${radius}" stroke="${color}" data-tween="${key}" style="--v:${fraction(value)};--len:${length.toFixed(1)}"/>`;
  });
  return html`<svg class="rings" viewBox="0 0 200 200" role="img" aria-label="${t('track.ringsLabel')}">${layers}</svg>`;
}

function legendRow(color, name, detail, result, isOver = false) {
  return html`
    <div class="row">
      <span class="legend-dot" style="background:${color}"></span>
      <div class="grow"><p>${name}</p><p class="caption num">${detail}</p></div>
      <span class="num ${isOver ? 'is-over' : ''}">${result}</span>
    </div>`;
}

function todayCard() {
  const eaten = caloriesEaten();
  const target = calorieTarget();
  const remaining = target - eaten;
  const glasses = glassesToday();
  const minutes = minutesMoved();

  return html`
    <section class="card" aria-labelledby="today-title">
      <div class="row"><h2 id="today-title" class="grow">${t('track.today')}</h2><span class="caption">${longDate(today())}</span></div>
      ${activityRings([
        { key: 'ring-cal', value: eaten / target, color: 'var(--accent)' },
        { key: 'ring-water', value: glasses / 8, color: 'var(--sky)' },
        { key: 'ring-move', value: minutes / 30, color: 'var(--on-tonal)' },
      ])}
      <div class="stack">
        ${legendRow('var(--accent)', t('track.calories'), t('track.caloriesOf', { eaten: formatInt(eaten), target: formatInt(target) }),
          remaining >= 0 ? t('track.left', { n: formatInt(remaining) }) : t('track.over', { n: formatInt(-remaining) }), remaining < 0)}
        ${legendRow('var(--sky)', t('track.water'), t('track.glassesOf', { n: glasses }), glasses >= 8 ? t('common.done') : t('track.toGo', { n: 8 - glasses }))}
        ${legendRow('var(--on-tonal)', t('track.movement'), t('track.minutesOf', { n: minutes, burned: formatInt(caloriesBurned()) }), minutes >= 30 ? t('common.done') : t('track.minToGo', { n: 30 - minutes }))}
      </div>
      ${macroBars()}
    </section>`;
}

function foodPanel() {
  const error = ui.errors.food;
  const byMeal = MEALS.map(meal => ({ meal, items: foodOn(foodDayKey()).filter(item => item.meal === meal) })).filter(group => group.items.length);

  return html`
    ${dayNav()}
    <form class="card" data-form="food" novalidate>
      <h2>${t('food.add')}</h2>
      <div class="field">
        <label for="food-name">${t('food.name')}</label>
        <input ${attributes({ class: 'input', id: 'food-name', maxlength: 40, autocomplete: 'off', placeholder: t('food.namePlaceholder'), 'aria-invalid': error ? 'true' : null, 'aria-describedby': error ? 'food-error' : null })}>
      </div>
      <div class="grid-2">
        <div class="field">
          <label for="food-kcal">${t('food.kcal')}</label>
          <input ${attributes({ class: 'input', id: 'food-kcal', type: 'number', inputmode: 'numeric', min: 1, max: 5000, placeholder: '350', 'aria-invalid': error ? 'true' : null })}>
        </div>
        <div class="field">
          <label for="food-meal">${t('food.meal')}</label>
          <select class="input" id="food-meal">${MEALS.map(meal => html`<option value="${meal}">${t(`meal.${meal}`)}</option>`)}</select>
        </div>
      </div>
      ${macroInputs()}
      ${errorLine('food-error', error)}
      <button class="btn btn-large" type="submit">${icon('plus')}${t('food.addButton')}</button>
      <button type="button" class="btn btn-tonal" data-action="open-food-search">${icon('search')}${t('food.search')}</button>
      ${recentFoods().length ? html`<div class="stack-tight">
        <p class="field-label">${t('food.recent')}</p>
        <div class="row row-wrap row-tight">${recentFoods().map((food, i) => html`
          <button type="button" class="btn btn-tonal btn-small" data-action="recent-food" data-index="${i}">${food.name}, ${formatInt(food.kcal)}</button>`)}
        </div>
      </div>` : ''}
      <div class="stack-tight">
        <p class="field-label">${t('food.quick')}</p>
        <div class="row row-wrap row-tight">${QUICK_FOODS.map((food, i) => html`
          <button type="button" class="btn btn-tonal btn-small" data-action="quick-food" data-index="${i}">${t(`food.${food.key}`)}, ${food.kcal}</button>`)}
        </div>
      </div>
    </form>
    ${byMeal.length
      ? byMeal.map(({ meal, items }) => html`
          <section class="stack-tight" aria-label="${t(`meal.${meal}`)}">
            <p class="caption">${t('food.mealTotal', { meal: t(`meal.${meal}`), n: formatInt(items.reduce((sum, item) => sum + item.kcal, 0)) })}</p>
            <div class="list">${items.map(item => html`
              <div class="list-row ${item.id === ui.newId ? 'is-new' : ''}">
                <span class="grow">${item.name}</span>
                <span class="caption num">${formatInt(item.kcal)} kcal</span>
                <button class="icon-btn" data-action="remove-food" data-id="${item.id}" aria-label="${t('common.remove', { name: item.name })}">${icon('trash')}</button>
              </div>`)}
            </div>
          </section>`)
      : html`<div class="card center"><p class="caption">${t('food.empty')}</p></div>`}`;
}

function waterPanel() {
  const glasses = glassesToday();
  const volume = state.units === 'metric'
    ? `${formatDecimal(glasses * 0.25, 2)} L`
    : `${formatInt(glasses * 8.45)} fl oz`;

  return html`
    <section class="card">
      <div class="row"><h2 class="grow">${t('track.water')}</h2><span class="pill is-tonal num">${t('water.summary', { n: glasses, volume })}</span></div>
      <div class="glasses" role="group" aria-label="${t('water.group')}">
        ${Array.from({ length: 8 }, (_, i) => html`
          <button class="cup ${i === ui.newCup ? 'is-new' : ''}" data-action="set-water" data-index="${i}" aria-pressed="${i < glasses}" aria-label="${t(i < glasses ? 'water.glassDrunk' : 'water.glass', { n: i + 1 })}">${icon('drop')}<span>${i < glasses ? t('water.drunk') : i + 1}</span></button>`)}
      </div>
      <p class="caption">${t('water.help')}</p>
    </section>`;
}

function movePanel() {
  const error = ui.errors.move;
  return html`
    <form class="card" data-form="move" novalidate>
      <h2>${t('move.log')}</h2>
      <div class="grid-2">
        <div class="field">
          <label for="move-type">${t('move.activity')}</label>
          <select class="input" id="move-type">${Object.keys(WORKOUT_MET).map(type => html`<option value="${type}">${t(`workout.${type}`)}</option>`)}</select>
        </div>
        <div class="field">
          <label for="move-min">${t('move.minutes')}</label>
          <input ${attributes({ class: 'input', id: 'move-min', type: 'number', inputmode: 'numeric', min: 1, max: 600, placeholder: '30', 'aria-invalid': error ? 'true' : null, 'aria-describedby': error ? 'move-error' : null })}>
        </div>
      </div>
      ${errorLine('move-error', error)}
      <button class="btn btn-large" type="submit">${icon('plus')}${t('move.add')}</button>
      <p class="caption">${t('move.help')}</p>
    </form>
    ${movesToday().length ? html`
      <div class="list">${movesToday().map(item => html`
        <div class="list-row ${item.id === ui.newId ? 'is-new' : ''}">
          <span class="grow">${t(`workout.${item.type}`)}, ${item.min} ${t('unit.min')}</span>
          <span class="caption num">${formatInt(item.kcal)} kcal</span>
          <button class="icon-btn" data-action="remove-move" data-id="${item.id}" aria-label="${t('common.remove', { name: `${t(`workout.${item.type}`)}, ${item.min} ${t('unit.min')}` })}">${icon('trash')}</button>
        </div>`)}
      </div>` : ''}`;
}

function weightChart() {
  const dates = Object.keys(state.weights).sort().slice(-30);
  if (dates.length < 2) return html`<p class="caption">${t('weight.needTwo')}</p>`;

  const values = dates.map(date => mass.fromKg(state.weights[date]));
  const goal = mass.fromKg(state.profile.goalKg);
  const low = Math.floor(Math.min(...values, goal) - 1);
  const high = Math.ceil(Math.max(...values, goal) + 1);

  const width = 320, height = 176;
  const pad = { left: 48, right: 16, top: 16, bottom: 32 };
  const days = dates.map(date => parseKey(date).getTime() / 864e5);
  const spanDays = (days[days.length - 1] - days[0]) || 1;
  const x = day => pad.left + ((day - days[0]) / spanDays) * (width - pad.left - pad.right);
  const y = value => pad.top + ((high - value) / (high - low)) * (height - pad.top - pad.bottom);
  const points = values.map((value, i) => [x(days[i]), y(value)]);
  const ticks = [0, 1, 2, 3].map(i => low + ((high - low) * i) / 3);
  const f = n => n.toFixed(1);

  return html`
    <div class="scroll-x">
      <svg class="chart" viewBox="0 0 ${width} ${height}" role="img"
           aria-label="${t('weight.chartLabel', { from: formatDecimal(values[0]), to: formatDecimal(values[values.length - 1]), unit: mass.unit(), goal: formatDecimal(goal) })}">
        ${ticks.map(tick => html`
          <line class="grid" x1="${pad.left}" x2="${width - pad.right}" y1="${f(y(tick))}" y2="${f(y(tick))}"/>
          <text x="${pad.left - 8}" y="${f(y(tick) + 4)}" text-anchor="end">${formatDecimal(tick)}</text>`)}
        <line class="goal" x1="${pad.left}" x2="${width - pad.right}" y1="${f(y(goal))}" y2="${f(y(goal))}"/>
        <text x="${width - pad.right}" y="${f(y(goal) - 8)}" text-anchor="end" style="fill:var(--sky)">${t('weight.goal')}</text>
        <polyline class="line" pathLength="1" points="${points.map(p => `${f(p[0])},${f(p[1])}`).join(' ')}"/>
        ${points.map(p => html`<circle class="dot" cx="${f(p[0])}" cy="${f(p[1])}" r="4"/>`)}
        <text x="${pad.left}" y="${height - 8}">${shortDate(dates[0])}</text>
        <text x="${width - pad.right}" y="${height - 8}" text-anchor="end">${shortDate(dates[dates.length - 1])}</text>
      </svg>
    </div>`;
}

// Either "you made it" (with a way to set the next goal) or when the goal is likely to be reached at the chosen pace.
function goalNote() {
  const { profile } = state;
  const remaining = currentWeightKg() - profile.goalKg;
  if (remaining <= 0) {
    return html`
      <div class="stack-tight">
        <p><strong>${t('weight.reached', { weight: mass.format(profile.goalKg) })}</strong></p>
        <button class="btn btn-tonal" data-action="edit-goal">${t('weight.newGoal')}</button>
      </div>`;
  }
  const arrival = addDays(today(), Math.ceil((remaining / profile.pace) * 7));
  return html`<p class="caption">${t('weight.eta', { weight: mass.format(profile.goalKg), date: longDate(arrival) })}</p>`;
}

function weightPanel() {
  const { profile } = state;
  const error = ui.errors.weight;
  const recent = Object.keys(state.weights).sort().reverse().slice(0, 7);
  const percent = Math.round(slimProgress() * 100);

  return html`
    <section class="card">
      <h2>${t('weight.progress')}</h2>
      <div class="figure-row">
        ${figureMark('figure-sm')}
        <div class="stack-tight">
          <p class="num"><strong>${t('weight.percentThere', { n: percent })}</strong></p>
          <p class="caption num">${t('weight.bmi', { n: formatDecimal(bmiOf(currentWeightKg(), profile.heightCm)) })}</p>
          <p class="caption">${t('weight.figureHelp')}</p>
        </div>
      </div>
      <div class="grid-3">
        <div><p class="caption">${t('weight.start')}</p><p class="num"><strong>${mass.format(profile.weightKg)}</strong></p></div>
        <div><p class="caption">${t('weight.now')}</p><p class="num"><strong>${mass.format(currentWeightKg())}</strong></p></div>
        <div><p class="caption">${t('weight.goal')}</p><p class="num"><strong>${mass.format(profile.goalKg)}</strong></p></div>
      </div>
      ${weightChart()}
      ${goalNote()}
    </section>
    <form class="card" data-form="weight" novalidate>
      <h2>${t('weight.weighIn')}</h2>
      <div class="field">
        <label for="weight-value">${t('weight.today', { unit: mass.unit() })}</label>
        <input ${attributes({ class: 'input', id: 'weight-value', type: 'number', inputmode: 'decimal', step: '0.1', placeholder: mass.fromKg(currentWeightKg()).toFixed(1), 'aria-invalid': error ? 'true' : null, 'aria-describedby': error ? 'weight-error' : null })}>
      </div>
      ${errorLine('weight-error', error)}
      <button class="btn btn-large" type="submit">${icon('scale')}${t('weight.log')}</button>
      <p class="caption">${t('weight.help')}</p>
    </form>
    <div class="list">${recent.map(date => html`
      <div class="list-row">
        <span class="grow">${shortDate(date)}</span>
        <span class="num"><strong>${mass.format(state.weights[date])}</strong></span>
        ${date === profile.start
          ? html`<span class="pill">${t('weight.startTag')}</span>`
          : html`<button class="icon-btn" data-action="remove-weight" data-id="${date}" aria-label="${t('weight.removeFrom', { date: shortDate(date) })}">${icon('trash')}</button>`}
      </div>`)}
    </div>`;
}

const TRACK_PANELS = [
  { id: 'food', render: foodPanel },
  { id: 'water', render: waterPanel },
  { id: 'move', render: movePanel },
  { id: 'weight', render: weightPanel },
  { id: 'fast', render: fastPanel },
];

function trackScreen() {
  const panel = TRACK_PANELS.find(item => item.id === ui.trackPanel);
  return html`
    <div class="page-title"><h1>${t('track.title')}</h1><p class="caption">${t('track.subtitle')}</p></div>
    ${todayCard()}
    <div class="segmented" role="tablist" aria-label="${t('track.tracker')}">
      ${TRACK_PANELS.map(item => html`<button role="tab" data-action="go-panel" data-panel="${item.id}" aria-selected="${item.id === ui.trackPanel}">${t(`panel.${item.id}`)}</button>`)}
    </div>
    <div role="tabpanel" class="stack">${panel.render()}</div>`;
}

/* ==========================================================================
   Quests
   ========================================================================== */
const tierPips = tier => html`
  <span class="pips" aria-hidden="true">${TIERS.map((_, i) => html`<i class="${i <= TIERS.indexOf(tier) ? 'on' : ''}"></i>`)}</span>`;

function questActions(quest, done, claimed) {
  if (claimed) return html`<span class="stamp">${icon('check')}${t('quests.claimed')}</span>`;
  if (done) {
    return html`
      <div class="row row-wrap">
        <button class="btn btn-tonal" data-action="claim-quest" data-id="${quest.id}">${icon('sparkle')}${t('quests.claim')}</button>
        ${quest.self ? html`<button class="btn btn-plain" data-action="toggle-check" data-id="${quest.id}">${t('quests.undo')}</button>` : ''}
      </div>`;
  }
  if (quest.self) {
    return html`<button class="btn btn-tonal" data-action="toggle-check" data-id="${quest.id}">${icon('check')}${t('quests.markDone')}</button>`;
  }
  // Secret quests do not say where to go until they are done.
  if (quest.tier === 'secret') return '';
  return html`<button class="btn btn-plain" data-action="quest-go" data-id="${quest.id}">${t('quests.go')}${icon('next')}</button>`;
}

// A two-sided card. The back is shown until the quest is turned over (or has started).
function questCard(quest, index) {
  const done = isQuestDone(quest);
  const claimed = isClaimed(quest);
  const flipped = isRevealed(quest);
  const progress = Math.min(questProgress(quest), quest.goal);
  const hidden = quest.tier === 'secret' && !done && !claimed;

  let caption = t('quests.progress', { n: progress, goal: quest.goal });
  if (hidden) caption = t('quests.secretCaption');
  else if (quest.self) caption = done ? t('quests.checked') : t('quests.selfPrompt');

  return html`
    <div class="qcard ${flipped ? 'is-flipped' : ''}" data-quest="${quest.id}" style="--n:${index}">
      <div class="qcard-inner">
        <button class="qface qback" data-tilt="3" data-action="flip-quest" data-id="${quest.id}" ${attributes({ inert: flipped })}>
          <span class="qmark">${icon(quest.tier === 'secret' ? 'sparkle' : 'question')}</span>
          <span class="stack-tight grow">
            <span class="qtier">${t(`tier.${quest.tier}`)}</span>
            <span class="caption">${t('quests.tapReveal')}</span>
            ${tierPips(quest.tier)}
          </span>
          <span class="pill is-tonal">${icon('gem')}${quest.gems}</span>
        </button>
        <div class="qface qfront" ${attributes({ inert: !flipped })}>
          <div class="row">
            <span class="glyph">${icon(quest.icon)}</span>
            <div class="grow">
              <h3>${hidden ? t(`quest.${quest.id}.hint`) : t(`quest.${quest.id}.title`)}</h3>
              <p class="caption num">${hidden ? caption : `${t(`tier.${quest.tier}`)}. ${caption}`}</p>
            </div>
            <span class="pill is-tonal">${icon('gem')}${quest.gems}</span>
          </div>
          ${quest.self || hidden ? '' : progressBar(t(`quest.${quest.id}.title`), `q-${quest.id}`, progress, quest.goal)}
          ${questActions(quest, done, claimed)}
        </div>
      </div>
    </div>`;
}

const chestArt = () => html`
  <svg class="chest-art" viewBox="0 0 120 100" aria-hidden="true" overflow="visible">
    <g class="chest-loot">
      <circle cx="44" cy="44" r="7"/><circle cx="62" cy="38" r="8"/><circle cx="78" cy="45" r="6"/>
    </g>
    <rect class="chest-edge" x="16" y="54" width="88" height="44" rx="8"/>
    <rect class="chest-body" x="16" y="46" width="88" height="44" rx="8"/>
    <path class="chest-lid" d="M16 46a44 36 0 0 1 88 0z"/>
    <rect class="chest-lock" x="54" y="40" width="12" height="18" rx="3"/>
  </svg>`;

function chestCard() {
  const claimed = questsClaimedToday();
  const open = isChestOpen();
  const ready = isChestReady();
  const reward = chestReward();
  const status = open ? 'open' : ready ? 'ready' : 'locked';
  const caption = open
    ? t('chest.opened', { gems: reward.gems, xp: reward.xp })
    : ready ? t('chest.ready') : t('chest.locked', { n: claimed, total: TIERS.length });

  return html`
    <section class="card chest is-${status}" aria-labelledby="chest-title">
      <div class="chest-stage" ${attributes({ 'data-tilt': ready ? '10' : null })}>${chestArt()}</div>
      <div class="stack-tight center">
        <h2 id="chest-title">${t('chest.title')}</h2>
        <p class="caption">${caption}</p>
      </div>
      ${open ? '' : html`<button class="btn btn-large" data-action="open-chest" ${attributes({ disabled: !ready })}>${icon('sparkle')}${t('chest.openButton')}</button>`}
    </section>`;
}

function weeklyCard(quest) {
  const done = isQuestDone(quest);
  const claimed = isClaimed(quest);
  const progress = Math.min(questProgress(quest), quest.goal);
  const days = weekDays();

  return html`
    <div class="card">
      <div class="row">
        <span class="glyph">${icon(quest.icon)}</span>
        <div class="grow"><h3>${t(`quest.${quest.id}.title`)}</h3><p class="caption num">${t('quests.progress', { n: progress, goal: quest.goal })}</p></div>
        <span class="pill is-tonal">${icon('gem')}${quest.gems}</span>
      </div>
      ${quest.id === 'active5'
        ? html`<div class="week" role="img" aria-label="${t('quests.progress', { n: progress, goal: quest.goal })}">${days.map(key => {
            const active = (state.days[key] || 0) > 0;
            return html`
              <div class="stack-tight center">
                <span class="node-day ${active ? 'is-active' : ''} ${key === today() ? 'is-today' : ''}">${active ? icon('check') : ''}</span>
                <span class="caption">${weekday(key).slice(0, 2)}</span>
              </div>`;
          })}</div>`
        : progressBar(t(`quest.${quest.id}.title`), `q-${quest.id}`, progress, quest.goal)}
      ${claimed
        ? html`<span class="stamp">${icon('check')}${t('quests.claimed')}</span>`
        : done ? html`<button class="btn btn-tonal" data-action="claim-quest" data-id="${quest.id}">${icon('sparkle')}${t('quests.claim')}</button>` : ''}
    </div>`;
}

function badgeProgressText(badge) {
  const [value, goal] = badge.progress();
  return badge.measured ? '' : t('common.ofTotal', { n: value, total: goal });
}

function questsScreen() {
  const earned = BADGES.filter(badgeEarned).length;
  return html`
    <div class="page-title"><h1>${t('quests.title')}</h1><p class="caption">${t('quests.subtitle')}</p></div>
    <section class="stack" aria-labelledby="board-title">
      <h2 id="board-title">${t('quests.today')}</h2>
      <div class="board">${dailyQuests().map(questCard)}</div>
    </section>
    ${chestCard()}
    <section class="stack" aria-labelledby="weekly-title">
      <h2 id="weekly-title">${t('quests.week')}</h2>
      ${WEEKLY_QUESTS.map(weeklyCard)}
    </section>
    <section class="stack" aria-labelledby="badges-title">
      <div class="row"><h2 id="badges-title" class="grow">${t('quests.badges')}</h2><span class="pill num">${t('common.ofTotal', { n: earned, total: BADGES.length })}</span></div>
      <div class="grid-2">${BADGES.map(badge => {
        const got = badgeEarned(badge);
        const hidden = badge.secret && !got;
        return html`
          <button class="tile badge-tile ${got ? 'is-earned' : 'is-locked'}" data-action="show-badge" data-id="${badge.id}">
            <span class="glyph ${got ? '' : 'is-off'}">${icon(got ? badge.icon : hidden ? 'question' : 'lock')}</span>
            <h3>${hidden ? t('badge.secret') : t(`badge.${badge.id}.title`)}</h3>
            <p class="caption num"><strong>${got ? t('quests.earned') : hidden ? t('quests.hidden') : badgeProgressText(badge) || t('quests.locked')}</strong></p>
          </button>`;
      })}</div>
    </section>`;
}

/* ==========================================================================
   Profile and settings
   ========================================================================== */
const scrubLabel = progress => t('profile.previewWeight', { weight: mass.format(weightAtFigure(progress)), bmi: formatDecimal(bmiAtFigure(progress)) });

function profileScreen() {
  const { profile } = state;
  const current = currentWeightKg();
  const total = profile.weightKg - profile.goalKg;
  const lost = profile.weightKg - current;
  const percent = clamp(lost / total, 0, 1) * 100;
  const plan = planCalories(profile, current, profile.pace);

  return html`
    <section class="card center">
      ${figureMark('figure-lg')}
      <div><h1>${profile.name}</h1><p class="caption num">${t('profile.level', { n: level(), xp: formatInt(state.xp) })}</p></div>
      <div class="fill">${progressBar(t('profile.nextLevel'), 'level', state.xp % 150, 150)}</div>
      <div class="field fill scrub">
        <label for="scrub">${t('profile.preview')}</label>
        <input class="range" id="scrub" type="range" min="0" max="100" value="${Math.round(figureProgress() * 100)}" data-scrub>
        <p class="caption num" data-scrub-label aria-live="polite">${scrubLabel(figureProgress())}</p>
        <p class="caption">${t('profile.previewHelp')}</p>
      </div>
    </section>
    <div class="grid-2">
      <div class="tile"><p class="caption">${t('profile.streak')}</p><h2 class="num">${currentStreak()}</h2></div>
      <div class="tile"><p class="caption">${t('profile.best')}</p><h2 class="num">${state.best}</h2></div>
      <div class="tile"><p class="caption">${t('profile.lessons')}</p><h2 class="num">${t('common.ofTotal', { n: lessonsDone(), total: TOTAL_LESSONS })}</h2></div>
      <div class="tile"><p class="caption">${t('profile.lost')}</p><h2 class="num">${lost > 0 ? mass.format(lost) : `0 ${mass.unit()}`}</h2></div>
      <div class="tile"><p class="caption">${t('profile.bmi')}</p><h2 class="num">${formatDecimal(bmiOf(current, profile.heightCm))}</h2></div>
      <div class="tile"><p class="caption">${t('profile.cooked')}</p><h2 class="num">${Object.values(state.cooked).reduce((sum, n) => sum + n, 0)}</h2></div>
    </div>
    <section class="card" aria-labelledby="goal-heading">
      <h2 id="goal-heading">${t('profile.goal')}</h2>
      <div class="row">
        <span class="num"><strong>${mass.format(profile.weightKg)}</strong></span>
        <div class="grow">${progressBar(t('profile.goalProgress'), 'goal', percent, 100)}</div>
        <span class="num"><strong>${mass.format(profile.goalKg)}</strong></span>
      </div>
      <p class="caption">${percent >= 100 ? t('profile.goalReached') : t('profile.goalLeft', { n: Math.round(percent), left: mass.format(Math.max(0, current - profile.goalKg)) })}</p>
      <div class="list">
        ${statRow(t('profile.target'), `${formatInt(plan.target)} kcal`)}
        ${statRow(t('profile.maintenance'), `${formatInt(plan.maintenance)} kcal`)}
        ${statRow(t('profile.pace'), t('profile.perWeek', { n: mass.format(profile.pace) }))}
      </div>
      ${plan.limited ? html`<p class="caption">${t('profile.limited', { n: formatInt(plan.floor) })}</p>` : ''}
      <button class="btn btn-tonal" data-action="edit-goal">${t('profile.editGoal')}</button>
    </section>
    ${checkinCard()}
    ${photosCard()}
    ${plusCard()}
    <button class="card nav-card" data-action="open-settings">
      <span class="glyph">${icon('settings')}</span>
      <span class="grow"><h2>${t('settings.title')}</h2><span class="caption">${t('settings.summary')}</span></span>
      ${icon('next')}
    </button>`;
}

function settingsScreen() {
  const { settings } = state;
  return html`
    <div class="row"><button class="btn btn-plain" data-action="close-settings">${icon('back')}${t('nav.back')}</button></div>
    <div class="page-title"><h1>${t('settings.title')}</h1></div>

    <section class="card" aria-labelledby="appearance-title">
      <h2 id="appearance-title">${t('settings.appearance')}</h2>
      ${segmented({ id: 'set-theme', label: t('settings.theme'), action: 'set-setting', field: 'theme', value: settings.theme,
        options: [['system', t('settings.system')], ['light', t('settings.light')], ['dark', t('settings.dark')]] })}
      <div class="field">
        <span class="field-label" id="set-motion-label">${t('settings.animations')}</span>
        <div class="segmented" role="radiogroup" aria-labelledby="set-motion-label">
          ${[['auto', 'settings.automatic'], ['full', 'settings.full'], ['reduced', 'settings.reduced']].map(([value, key]) => html`
            <button type="button" role="radio" data-action="set-setting" data-field="motion" data-value="${value}" aria-checked="${String(settings.motion === value)}">${t(key)}</button>`)}
        </div>
        <p class="caption">${t('settings.motionHelp')}</p>
      </div>
    </section>

    <section class="card" aria-labelledby="language-title">
      <h2 id="language-title">${t('settings.language')}</h2>
      <div class="option-grid" role="radiogroup" aria-labelledby="language-title">
        ${LANGUAGES.map(language => html`
          <button class="choice" role="radio" data-action="set-setting" data-field="language" data-value="${language.code}" aria-checked="${String(settings.language === language.code)}">
            ${icon('globe')}<span class="label">${language.name}</span>
          </button>`)}
      </div>
      <p class="caption">${t('settings.languageHelp')}</p>
    </section>

    <section class="card" aria-labelledby="plan-title">
      <h2 id="plan-title">${t('settings.plan')}</h2>
      ${segmented({ id: 'set-units', label: t('settings.units'), action: 'set-units', field: 'units', value: state.units,
        options: [['metric', t('units.metric')], ['imperial', t('units.imperial')]] })}
      ${segmented({ id: 'set-goal', label: t('settings.dailyGoal'), action: 'set-setting', field: 'dailyGoal', value: settings.dailyGoal,
        options: [[20, '20 XP'], [30, '30 XP'], [50, '50 XP'], [80, '80 XP']] })}
    </section>

    ${accountCard()}

    <section class="card" aria-labelledby="reminder-title">
      <h2 id="reminder-title">${t('settings.reminder')}</h2>
      <p class="caption measure">${t('settings.reminderHelp')}</p>
      <div class="field">
        <label for="reminder-time">${t('settings.reminderTime')}</label>
        <input ${attributes({ class: 'input', id: 'reminder-time', type: 'time', value: settings.reminder, 'data-reminder': '' })}>
      </div>
      <button class="btn btn-tonal" data-action="add-reminder">${icon('next')}${t('settings.reminderAdd')}</button>
    </section>

    <section class="card" aria-labelledby="backup-title">
      <h2 id="backup-title">${t('settings.backup')}</h2>
      <p class="caption measure">${t('settings.backupHelp')}</p>
      <div class="row row-wrap">
        <button class="btn btn-tonal" data-action="export-data">${icon('next')}${t('settings.export')}</button>
        <label class="btn btn-tonal" for="import-file">${t('settings.import')}</label>
        <input class="sr-only" id="import-file" type="file" accept="application/json,.json" data-import>
      </div>
    </section>

    <section class="card" aria-labelledby="about-title">
      <h2 id="about-title">${t('settings.about')}</h2>
      <p class="caption measure">${t('app.disclaimer')}</p>
      <div class="row row-wrap">
        <button class="btn btn-tonal" data-action="show-health">${t('legal.healthTitle')}</button>
        <button class="btn btn-tonal" data-action="show-privacy">${t('legal.privacyTitle')}</button>
      </div>
      <button class="btn btn-plain btn-danger" data-action="reset-data">${t('settings.reset')}</button>
    </section>`;
}

/* ==========================================================================
   Onboarding
   ========================================================================== */
const newDraft = () => ({
  step: 0, name: '', sex: '', age: '', units: state.units,
  height: '', feet: '', inches: '', weight: '', goal: '', activity: 2, pace: 0.5, agree: false,
});

const draftHeightCm = draft =>
  draft.units === 'metric' ? Number(draft.height) : (Number(draft.feet) * 12 + (Number(draft.inches) || 0)) * 2.54;
const draftToKg = (value, units) => (units === 'metric' ? Number(value) : Number(value) / LB_PER_KG);

function draftProfile() {
  const d = ui.draft;
  return {
    name: d.name.trim(), sex: d.sex, age: Number(d.age),
    heightCm: Math.round(draftHeightCm(d) * 10) / 10,
    weightKg: draftToKg(d.weight, d.units), goalKg: draftToKg(d.goal, d.units),
    activity: Number(d.activity), pace: Number(d.pace), start: today(),
  };
}

function validateDraft(step) {
  const d = ui.draft;
  const errors = {};
  if (step === 1) {
    if (!d.name.trim()) errors.name = t('error.name');
    if (!d.sex) errors.sex = t('error.sex');
    const age = Number(d.age);
    if (!(age >= 18 && age <= 99)) errors.age = age && age < 18 ? t('error.adults') : t('error.age');
    if (!(draftHeightCm(d) >= 120 && draftHeightCm(d) <= 230)) errors.height = t('error.height');
    if (!d.agree) errors.agree = t('error.agree');
  }
  if (step === 2) {
    const weight = draftToKg(d.weight, d.units);
    const goal = draftToKg(d.goal, d.units);
    const lowest = lowestHealthyKg(draftHeightCm(d));
    const unit = d.units === 'metric' ? 'kg' : 'lb';
    if (!(weight >= 40 && weight <= 250)) errors.weight = t('error.weight');
    if (!(goal > 0)) errors.goal = t('error.goalMissing');
    else if (weight && goal >= weight) errors.goal = t('error.goalHigher');
    else if (goal < lowest) errors.goal = t('error.goalLow', { n: formatDecimal(d.units === 'metric' ? lowest : lowest * LB_PER_KG), unit });
  }
  return errors;
}

function textField({ id, label, field, type = 'text', value, error, extra = {} }) {
  return html`
    <div class="field">
      <label for="${id}">${label}</label>
      <input ${attributes({ class: 'input', id, type, value, 'data-field': field, 'aria-invalid': error ? 'true' : null, 'aria-describedby': error ? `${id}-error` : null, ...extra })}>
      ${errorLine(`${id}-error`, error)}
    </div>`;
}

const draftChoice = ({ id, label, field, options, value, error }) =>
  segmented({ id, label, action: 'set-draft', field, options, value, error });

function onboardingStep(title, subtitle, body, nextLabel) {
  const { step } = ui.draft;
  return html`
    <div class="container">
      <div class="page is-entering">
        <div class="row">
          <button class="btn btn-plain" data-action="draft-back">${icon('back')}${t('nav.back')}</button>
          <div class="grow">${progressBar(t('setup.progress'), 'setup', step, 3)}</div>
        </div>
        <div class="page-title"><h1>${title}</h1><p class="caption">${subtitle}</p></div>
        <div class="card">${body}</div>
        <button class="btn btn-large" data-action="draft-next">${nextLabel}</button>
      </div>
    </div>`;
}

function onboardingScreen() {
  if (!ui.draft) ui.draft = newDraft();
  const d = ui.draft;
  const e = ui.errors;
  const imperial = d.units === 'imperial';
  const unit = imperial ? 'lb' : 'kg';

  if (d.step === 0) {
    return html`
      <div class="container">
        <div class="hero">
          <div class="hero-language">${segmented({ id: 'welcome-language', label: t('settings.language'), action: 'set-setting', field: 'language', value: state.settings.language,
            options: LANGUAGES.map(language => [language.code, language.name]) })}</div>
          ${figureMark('figure-hero')}
          <div class="stack center">
            <h1 class="display">FatBoy</h1>
            <h2>${t('welcome.tagline')}</h2>
            <p class="caption">${t('welcome.body')}</p>
          </div>
          <button class="btn btn-large" data-action="draft-next">${t('welcome.start')}</button>
          ${cloudApi() && !account.user ? signInButton() : ''}
          <p class="caption">${t('app.disclaimer')}</p>
          <div class="row row-wrap"><button class="btn btn-plain" data-action="show-health">${t('legal.healthTitle')}</button><button class="btn btn-plain" data-action="show-privacy">${t('legal.privacyTitle')}</button></div>
        </div>
      </div>`;
  }

  if (d.step === 1) {
    return onboardingStep(t('setup.aboutTitle'), t('setup.aboutSubtitle'), html`
      <div class="stack">
        ${textField({ id: 'ob-name', label: t('setup.name'), field: 'name', value: d.name, error: e.name, extra: { maxlength: 20, autocomplete: 'given-name' } })}
        ${draftChoice({ id: 'ob-sex', label: t('setup.sex'), field: 'sex', options: [['f', t('setup.female')], ['m', t('setup.male')]], value: d.sex, error: e.sex })}
        ${textField({ id: 'ob-age', label: t('setup.age'), field: 'age', type: 'number', value: d.age, error: e.age, extra: { inputmode: 'numeric', min: 18, max: 99 } })}
        ${draftChoice({ id: 'ob-units', label: t('settings.units'), field: 'units', options: [['metric', t('units.metric')], ['imperial', t('units.imperial')]], value: d.units })}
        ${imperial
          ? html`<div class="grid-2">
              ${textField({ id: 'ob-feet', label: t('setup.heightFt'), field: 'feet', type: 'number', value: d.feet, error: e.height, extra: { inputmode: 'numeric', min: 3, max: 7 } })}
              ${textField({ id: 'ob-inches', label: t('setup.heightIn'), field: 'inches', type: 'number', value: d.inches, extra: { inputmode: 'numeric', min: 0, max: 11 } })}
            </div>`
          : textField({ id: 'ob-height', label: t('setup.heightCm'), field: 'height', type: 'number', value: d.height, error: e.height, extra: { inputmode: 'numeric', min: 120, max: 230 } })}
        <div class="field">
          <button type="button" id="ob-agree" class="choice" role="checkbox" aria-checked="${String(d.agree)}" ${attributes({ 'aria-describedby': e.agree ? 'ob-agree-error' : null })} data-action="toggle-agree">
            <span class="check-box" aria-hidden="true">${d.agree ? icon('check') : ''}</span><span class="label">${t('setup.agree')}</span>
          </button>
          ${errorLine('ob-agree-error', e.agree)}
          <button type="button" class="btn btn-plain" data-action="show-health">${t('legal.healthTitle')}</button>
        </div>
      </div>`, t('common.continue'));
  }

  if (d.step === 2) {
    return onboardingStep(t('setup.goalTitle'), t('setup.goalSubtitle'), html`
      <div class="stack">
        ${textField({ id: 'ob-weight', label: t('setup.currentWeight', { unit }), field: 'weight', type: 'number', value: d.weight, error: e.weight, extra: { inputmode: 'decimal', step: '0.1' } })}
        ${textField({ id: 'ob-goal', label: t('setup.goalWeight', { unit }), field: 'goal', type: 'number', value: d.goal, error: e.goal, extra: { inputmode: 'decimal', step: '0.1' } })}
        <div class="field">
          <label for="ob-activity">${t('setup.activity')}</label>
          <select class="input" id="ob-activity" data-field="activity">
            ${Object.keys(ACTIVITY_FACTORS).map(key => html`<option value="${key}" ${attributes({ selected: Number(key) === Number(d.activity) })}>${t(`activity.${key}`)}</option>`)}
          </select>
        </div>
      </div>`, t('common.continue'));
  }

  const profile = draftProfile();
  const toLose = profile.weightKg - profile.goalKg;
  const plan = planCalories(profile, profile.weightKg, Number(d.pace));
  state.units = d.units; // so the preview below formats weights in the chosen units
  return onboardingStep(t('setup.paceTitle'), t('setup.toLose', { n: mass.format(toLose) }), html`
    <div class="stack">
      <div class="option-grid" role="radiogroup" aria-label="${t('profile.pace')}">
        ${PACES.map(pace => {
          const option = planCalories(profile, profile.weightKg, pace.kgPerWeek);
          return html`
            <button class="choice" role="radio" data-action="set-draft" data-field="pace" data-value="${pace.kgPerWeek}" aria-checked="${Number(d.pace) === pace.kgPerWeek}">
              <span class="stack-tight grow">
                <span>${t('setup.paceOption', { name: t(`pace.${pace.id}.name`), n: mass.format(pace.kgPerWeek) })}</span>
                <span class="caption">${t('setup.paceDetail', { note: t(`pace.${pace.id}.note`), weeks: Math.ceil(toLose / pace.kgPerWeek) })}</span>
              </span>
              <span class="num">${formatInt(option.target)}<br><span class="caption">${t('setup.kcalDay')}</span></span>
            </button>`;
        })}
      </div>
      <p class="caption">${t('setup.target', { n: formatInt(plan.target) })}${plan.limited ? ` ${t('setup.floorNote', { n: formatInt(plan.floor) })}` : ''}</p>
    </div>`, t('setup.finish'));
}

/* ==========================================================================
   Sheets
   ========================================================================== */
const sheetHeader = (title, subtitle) => html`
  <div class="row">
    <div class="grow"><h2>${title}</h2>${subtitle ? html`<p class="caption">${subtitle}</p>` : ''}</div>
    <button class="icon-btn" data-action="close-sheet" aria-label="${t('common.close')}">${icon('close')}</button>
  </div>`;

function streakSheet() {
  const streak = currentStreak();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today(), i - 6));
  return {
    label: t('streak.label'),
    body: html`
      ${sheetHeader(t('streak.title', { n: streak }), streak ? t('streak.keepGoing') : t('streak.start'))}
      <div class="week">${days.map((key, i) => {
        const active = (state.days[key] || 0) > 0;
        const frozen = state.frozen.includes(key);
        return html`
          <div class="stack-tight center">
            <span class="node-day ${active ? 'is-active' : frozen ? 'is-frozen' : ''}" style="--n:${i}">${active ? icon('flame', { solid: true }) : frozen ? icon('snow') : ''}</span>
            <span class="caption">${weekday(key)}</span>
            <span class="sr-only">${active ? t('streak.active') : frozen ? t('streak.frozen') : t('streak.none')}</span>
          </div>`;
      })}</div>
      <div class="list">
        ${statRow(t('streak.xpToday'), t('common.ofTotal', { n: xpToday(), total: dailyGoal() }))}
        ${statRow(t('streak.freezes'), t('common.ofTotal', { n: state.freezes, total: FREEZE_MAX }))}
        ${statRow(t('profile.best'), t('streak.days', { n: state.best }))}
      </div>
      <button class="btn btn-tonal" data-action="show-shop">${icon('snow')}${t('streak.getFreeze')}</button>`,
  };
}

function shopSheet() {
  const minutes = state.hearts < HEART_MAX
    ? Math.ceil(Math.max(0, HEART_REFILL_MS - (Date.now() - state.heartsAt)) / 60000)
    : 0;
  return {
    label: t('shop.title'),
    body: html`
      ${sheetHeader(t('shop.title'), t('shop.subtitle', { n: state.gems }))}
      <div class="list">
        <div class="list-row">
          <span class="stat-hearts">${icon('heart', { solid: true })}</span>
          <div class="grow"><h3>${t('shop.refill')}</h3><p class="caption">${state.plus ? t('plus.unlimitedHearts') : html`${t('shop.heartsOf', { n: state.hearts, max: HEART_MAX })}${state.hearts < HEART_MAX ? ` ${t('shop.nextHeart', { n: minutes })}` : ''}`}</p></div>
          <button class="btn btn-tonal btn-small" data-action="buy-hearts" aria-label="${t('shop.buyHearts', { n: REFILL_COST })}" ${attributes({ disabled: state.plus || state.hearts >= HEART_MAX || state.gems < REFILL_COST })}>${icon('gem')}${REFILL_COST}</button>
        </div>
        <div class="list-row">
          <span class="stat-streak">${icon('snow')}</span>
          <div class="grow"><h3>${t('shop.freeze')}</h3><p class="caption">${t('shop.freezeHelp', { n: state.freezes, max: FREEZE_MAX })}</p></div>
          <button class="btn btn-tonal btn-small" data-action="buy-freeze" aria-label="${t('shop.buyFreeze', { n: FREEZE_COST })}" ${attributes({ disabled: state.freezes >= FREEZE_MAX || state.gems < FREEZE_COST })}>${icon('gem')}${FREEZE_COST}</button>
        </div>
        ${state.plus ? '' : html`<div class="list-row">
          <span class="plus-mark">${icon('sparkle')}</span>
          <div class="grow"><h3>${t('plus.name')}</h3><p class="caption">${t('plus.shopHelp')}</p></div>
          <button class="btn btn-tonal btn-small" data-action="show-plus">${t('plus.see')}</button>
        </div>`}
      </div>`,
  };
}

const legalSheet = kind => ({
  label: t(`legal.${kind}Title`),
  body: html`
    ${sheetHeader(t(`legal.${kind}Title`))}
    <ul class="plus-list">
      ${(kind === 'privacy' ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]).map(n => html`<li>${icon('check')}<span>${t(`legal.${kind}.${n}`)}</span></li>`)}
    </ul>`,
});

function plusSheet() {
  const features = ['recipes', 'hearts', 'theme'];
  return {
    label: t('plus.name'),
    body: html`
      ${sheetHeader(t('plus.name'), t('plus.tagline'))}
      <p class="plus-price"><strong class="num">${t('plus.price')}</strong></p>
      <ul class="plus-list">
        ${features.map(key => html`<li>${icon('check')}<span><strong>${t(`plus.feat.${key}`)}</strong><br><span class="caption">${t(`plus.feat.${key}Help`)}</span></span></li>`)}
      </ul>
      ${state.plus
        ? html`<p class="note" role="status">${t('plus.activeHelp')}</p>
               <button class="btn btn-plain" data-action="cancel-plus">${t('plus.turnOff')}</button>`
        : html`<p class="note">${t('plus.testNote')}</p>
               <button class="btn btn-large" data-action="unlock-plus">${t('plus.unlock')}</button>`}`,
  };
}

function plusCard() {
  return html`
    <section class="card plus-card" aria-labelledby="plus-heading">
      <div class="row">
        <span class="plus-mark">${icon('sparkle')}</span>
        <div class="grow"><h2 id="plus-heading">${state.plus ? t('plus.active') : t('plus.name')}</h2><p class="caption">${state.plus ? t('plus.activeShort') : t('plus.price')}</p></div>
      </div>
      ${state.plus
        ? html`<button class="btn btn-tonal" data-action="show-plus">${t('plus.manage')}</button>`
        : html`<p class="caption">${t('plus.tagline')}</p><button class="btn" data-action="show-plus">${t('plus.see')}</button>`}
    </section>`;
}

function lessonSheet(id) {
  const [unitIndex, lessonIndex] = id.split('.').map(Number);
  const unit = units()[unitIndex];
  const lesson = unit.lessons[lessonIndex];
  const firstTime = !state.done[id];
  const outOfHearts = state.hearts === 0;
  return {
    label: lesson.title,
    body: html`
      ${sheetHeader(lesson.title, unit.title)}
      <div class="row row-wrap row-tight">
        <span class="pill">${t('lesson.questions', { n: lesson.questions.length })}</span>
        <span class="pill is-tonal">${icon('bolt', { solid: true })}${firstTime ? LESSON_XP.first : LESSON_XP.replay} XP</span>
        ${firstTime ? '' : html`<span class="pill">${t('lesson.practice')}</span>`}
      </div>
      ${outOfHearts
        ? html`<p class="error">${icon('alert')}<span>${t('lesson.noHearts')}</span></p>
               <button class="btn btn-tonal" data-action="show-shop">${t('lesson.openShop')}</button>`
        : html`<p class="caption">${t('lesson.heartsInfo', { n: state.hearts, max: HEART_MAX })}</p>`}
      <button class="btn btn-large" data-action="start-lesson" data-id="${id}" ${attributes({ disabled: outOfHearts })}>${t('lesson.start')}</button>`,
  };
}

function weighInSheet(draft = '') {
  const error = ui.errors.weighin;
  return {
    label: t('weighin.title'),
    body: html`
      ${sheetHeader(t('weighin.title'), t('weighin.body', { name: state.profile.name }))}
      <div class="field">
        <label for="weighin-value">${t('weight.today', { unit: mass.unit() })}</label>
        <input ${attributes({ class: 'input', id: 'weighin-value', type: 'number', inputmode: 'decimal', step: '0.1', value: draft, placeholder: mass.fromKg(currentWeightKg()).toFixed(1), 'aria-invalid': error ? 'true' : null, 'aria-describedby': error ? 'weighin-error' : null })}>
        ${errorLine('weighin-error', error)}
      </div>
      <button class="btn btn-large" data-action="save-weighin">${icon('scale')}${t('weight.log')}</button>
      <button class="btn btn-plain" data-action="close-sheet">${t('weighin.skip')}</button>`,
  };
}

function goalSheet() {
  const { profile } = state;
  const draft = ui.goalDraft;
  const error = ui.errors.goal;
  return {
    label: t('profile.editGoal'),
    body: html`
      ${sheetHeader(t('profile.editGoal'))}
      <div class="field">
        <label for="goal-weight">${t('goal.weight', { unit: mass.unit() })}</label>
        <input ${attributes({ class: 'input', id: 'goal-weight', type: 'number', inputmode: 'decimal', step: '0.1', value: draft.goal, 'aria-invalid': error ? 'true' : null, 'aria-describedby': error ? 'goal-error' : null })}>
        ${errorLine('goal-error', error)}
      </div>
      <div class="field">
        <label for="goal-activity">${t('setup.activity')}</label>
        <select class="input" id="goal-activity">${Object.keys(ACTIVITY_FACTORS).map(key => html`<option value="${key}" ${attributes({ selected: Number(key) === profile.activity })}>${t(`activity.${key}`)}</option>`)}</select>
      </div>
      <div class="field">
        <span class="field-label" id="goal-pace-label">${t('profile.pace')}</span>
        <div class="option-grid" role="radiogroup" aria-labelledby="goal-pace-label">
          ${PACES.map(pace => html`<button class="choice" role="radio" data-action="pick-pace" data-value="${pace.kgPerWeek}" aria-checked="${draft.pace === pace.kgPerWeek}">${t('setup.paceOption', { name: t(`pace.${pace.id}.name`), n: mass.format(pace.kgPerWeek) })}</button>`)}
        </div>
      </div>
      <button class="btn btn-large" data-action="save-goal">${t('goal.save')}</button>`,
  };
}

const resetSheet = () => ({
  label: t('settings.reset'),
  body: html`
    ${sheetHeader(t('reset.title'))}
    <p>${t('reset.body')}</p>
    <button class="btn btn-large" data-action="close-sheet">${t('reset.keep')}</button>
    <button class="btn btn-plain btn-danger" data-action="confirm-reset">${t('reset.confirm')}</button>`,
});

function badgeSheet(id) {
  const badge = badgeById(id);
  const earned = badgeEarned(badge);
  const hidden = badge.secret && !earned;
  const [value, goal] = badge.progress();
  return {
    label: hidden ? t('badge.secret') : t(`badge.${id}.title`),
    body: html`
      ${sheetHeader(hidden ? t('badge.secret') : t(`badge.${id}.title`), earned ? t('quests.earned') : hidden ? t('quests.hidden') : t('quests.locked'))}
      <div class="center stack">
        <span class="glyph glyph-lg ${earned ? '' : 'is-off'}">${icon(earned ? badge.icon : hidden ? 'question' : 'lock')}</span>
        <p>${hidden ? t(`badge.${id}.hint`) : t(`badge.${id}.detail`)}</p>
      </div>
      ${hidden ? '' : html`
        <div class="stack-tight">
          ${progressBar(t(`badge.${id}.title`), `badge-${id}`, value, goal)}
          ${badge.measured ? '' : html`<p class="caption num">${t('common.ofTotal', { n: value, total: goal })}</p>`}
        </div>`}`,
  };
}

/* ==========================================================================
   Screen router
   ========================================================================== */
function screenView() {
  if (!state.profile) return onboardingScreen();
  if (ui.tab === 'profile' && ui.profileView === 'settings') return html`<div class="container"><div class="page">${settingsScreen()}</div></div>`;
  const screens = { learn: learnScreen, track: trackScreen, quests: questsScreen, recipes: recipesScreen, profile: profileScreen };
  const raised = ui.tab === 'learn' || ui.tab === 'quests';
  return html`<div class="container"><div class="page ${raised ? 'is-3d' : ''}">${screens[ui.tab]()}</div></div>`;
}
