/* ==========================================================================
   Macros, past days, recent foods, weekly check-in and fasting
   ========================================================================== */
const foodDayKey = () => ui.day || today();
const foodOn = key => state.food[key] || [];
const MAX_DAYS_BACK = 60;

/* --- Past days ------------------------------------------------------------- */
function dayNav() {
  const key = foodDayKey();
  const isToday = key === today();
  const logged = foodOn(key).reduce((sum, item) => sum + item.kcal, 0);
  return html`
    <div class="row day-nav">
      <button class="icon-btn" data-action="day-prev" aria-label="${t('day.prev')}" ${attributes({ disabled: key <= addDays(today(), -MAX_DAYS_BACK) })}>${icon('back')}</button>
      <div class="grow stack-tight center">
        <strong>${isToday ? t('day.today') : longDate(key)}</strong>
        <span class="caption num">${t('day.total', { n: formatInt(logged) })}</span>
      </div>
      <button class="icon-btn" data-action="day-next" aria-label="${t('day.next')}" ${attributes({ disabled: isToday })}>${icon('next')}</button>
    </div>
    ${isToday ? '' : html`<button class="btn btn-tonal" data-action="day-today">${t('day.backToToday')}</button>`}`;
}

/* --- Macros ---------------------------------------------------------------- */
const sumMacros = items => items.reduce((sum, item) => ({
  p: sum.p + (item.p || 0), c: sum.c + (item.c || 0), f: sum.f + (item.f || 0),
  counted: sum.counted + (item.p || item.c || item.f ? 1 : 0),
}), { p: 0, c: 0, f: 0, counted: 0 });

// Protein follows the goal weight; fat takes 28% of the calories and carbs fill the rest.
function macroTargets() {
  const kcal = calorieTarget();
  const protein = clamp(Math.round(1.6 * Math.min(currentWeightKg(), state.profile.goalKg)), 60, 220);
  const fat = Math.round((kcal * 0.28) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { p: protein, c: carbs, f: fat };
}

function macroBars() {
  const eaten = sumMacros(foodToday());
  if (!eaten.counted) return '';
  const goal = macroTargets();
  return html`
    <div class="stack-tight">
      ${[['protein', 'p'], ['carbs', 'c'], ['fat', 'f']].map(([name, key]) => html`
        <div class="stack-tight">
          <div class="row"><span class="grow">${t(`macro.${name}`)}</span><span class="caption num">${t('macro.of', { n: formatInt(eaten[key]), goal: goal[key] })}</span></div>
          ${progressBar(t(`macro.${name}`), `macro-${key}`, eaten[key], goal[key])}
        </div>`)}
      <p class="caption">${t('macro.note')}</p>
    </div>`;
}

const macroInputs = () => html`
  <details class="more">
    <summary>${t('food.macros')}</summary>
    <div class="grid-3">
      ${[['p', 'food.protein'], ['c', 'food.carbs'], ['f', 'food.fat']].map(([key, label]) => html`
        <div class="field"><label for="food-${key}">${t(label)}</label><input class="input" id="food-${key}" type="number" inputmode="decimal" min="0" max="500"></div>`)}
    </div>
  </details>`;

const readMacros = read => {
  const grams = id => {
    const value = Number(read(id));
    return value > 0 ? Math.round(clamp(value, 0, 500) * 10) / 10 : 0;
  };
  return { p: grams('food-p'), c: grams('food-c'), f: grams('food-f') };
};

/* --- Recent foods ---------------------------------------------------------- */
function recentFoods() {
  const seen = new Set();
  const found = [];
  for (let back = 0; back < 14 && found.length < 8; back++) {
    for (const item of [...foodOn(addDays(today(), -back))].reverse()) {
      const id = item.name.toLowerCase();
      if (seen.has(id)) continue;
      seen.add(id);
      found.push(item);
      if (found.length >= 8) break;
    }
  }
  return found;
}

/* --- Weekly check-in ------------------------------------------------------- */
function weekStats() {
  const days = Array.from({ length: 14 }, (_, i) => addDays(today(), -i));
  const first = days[13];
  const totals = days.map(key => foodOn(key).reduce((sum, item) => sum + item.kcal, 0)).filter(kcal => kcal >= 800);
  const intake = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;

  const spot = key => (parseKey(key) - parseKey(first)) / 86400000;
  const points = Object.keys(state.weights).filter(key => key >= first).sort().map(key => [spot(key), state.weights[key]]);
  const span = points.length > 1 ? points[points.length - 1][0] - points[0][0] : 0;
  let slope = 0;
  if (span > 0) {
    const mx = points.reduce((s, p) => s + p[0], 0) / points.length;
    const my = points.reduce((s, p) => s + p[1], 0) / points.length;
    slope = points.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / points.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  }

  const week = days.slice(0, 7);
  const weekTotals = week.map(key => foodOn(key).reduce((sum, item) => sum + item.kcal, 0)).filter(kcal => kcal > 0);
  const weekWeights = Object.keys(state.weights).filter(key => key >= week[6]).sort();
  const change = weekWeights.length > 1 ? state.weights[weekWeights[weekWeights.length - 1]] - state.weights[weekWeights[0]] : null;

  const ready = totals.length >= 7 && span >= 6;
  const maintenance = ready ? clamp(Math.round(intake - slope * KCAL_PER_KG_FAT), 1200, 5000) : 0;
  const plan = planCalories({ ...state.profile, maintenanceOverride: 0 }, currentWeightKg(), state.profile.pace);
  const wanted = maintenance - (state.profile.pace * KCAL_PER_KG_FAT) / 7;
  return {
    ready, foodDays: totals.length, span: Math.floor(span), weighIns: points.length, intake, slope,
    maintenance, formula: plan.maintenance, suggested: Math.max(plan.floor, Math.round(wanted / 10) * 10),
    weekDays: weekTotals.length, weekAvg: weekTotals.length ? weekTotals.reduce((a, b) => a + b, 0) / weekTotals.length : 0, change,
  };
}

function checkinCard() {
  const stats = weekStats();
  const using = Boolean(state.profile.maintenanceOverride);
  return html`
    <section class="card" aria-labelledby="checkin-title">
      <h2 id="checkin-title">${t('checkin.title')}</h2>
      <div class="list">
        ${statRow(t('checkin.logged'), t('common.ofTotal', { n: stats.weekDays, total: 7 }))}
        ${statRow(t('checkin.avg'), stats.weekAvg ? `${formatInt(stats.weekAvg)} kcal` : '-')}
        ${statRow(t('checkin.change'), stats.change === null ? '-' : `${stats.change > 0 ? '+' : ''}${formatDecimal(mass.fromKg(stats.change))} ${mass.unit()}`)}
      </div>
      <button class="btn btn-tonal" data-action="show-recap">${icon('trophy')}${t('recap.open')}</button>
      ${stats.ready
        ? html`<p class="caption measure">${t('checkin.result', { intake: formatInt(stats.intake), rate: `${stats.slope > 0 ? '+' : ''}${formatDecimal(mass.fromKg(stats.slope * 7), 2)} ${mass.unit()}`, m: formatInt(stats.maintenance), f: formatInt(stats.formula) })}</p>
               ${using
                 ? html`<p class="note" role="status">${t('checkin.using')}</p><button class="btn btn-tonal" data-action="reset-target">${t('checkin.reset')}</button>`
                 : html`<button class="btn" data-action="apply-target">${t('checkin.apply', { n: formatInt(stats.suggested) })}</button>`}`
        : html`<p class="caption measure">${t('checkin.locked', { days: stats.foodDays, weighs: stats.weighIns, span: stats.span })}</p>
               ${using ? html`<button class="btn btn-tonal" data-action="reset-target">${t('checkin.reset')}</button>` : ''}`}
    </section>`;
}

/* --- Fasting --------------------------------------------------------------- */
const FAST_PRESETS = [12, 14, 16, 18, 20];
const HOUR = 3600000;

const fastClock = ms => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = n => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
};
const clockTime = ms => new Date(ms).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });

function fastPanel() {
  const active = state.fast;
  const history = (state.fasts || []).slice(-5).reverse();
  const reached = (state.fasts || []).filter(item => (item.end - item.start) / HOUR >= item.goal);
  const longest = Math.max(0, ...(state.fasts || []).map(item => (item.end - item.start) / HOUR));

  const current = active ? (() => {
    const elapsed = Date.now() - active.start;
    const goal = active.hours * HOUR;
    return html`
      <section class="card" aria-labelledby="fast-title">
        <h2 id="fast-title">${t('fast.title')}</h2>
        <p class="fast-clock num" data-fast-clock role="timer" aria-label="${t('fast.title')}">${fastClock(elapsed)}</p>
        <p class="caption">${t('fast.since', { time: clockTime(active.start) })}. ${elapsed >= goal ? t('fast.done') : t('fast.goalAt', { hours: active.hours, time: clockTime(active.start + goal) })}</p>
        ${progressBar(t('fast.progress'), 'fast', Math.min(elapsed, goal), goal)}
        <button class="btn btn-large" data-action="end-fast">${t('fast.end')}</button>
      </section>`;
  })() : html`
      <section class="card" aria-labelledby="fast-title">
        <h2 id="fast-title">${t('fast.title')}</h2>
        ${segmented({ id: 'fast-hours', label: t('fast.pick'), action: 'set-fast-hours', field: 'hours', value: ui.fastHours,
          options: FAST_PRESETS.map(hours => [hours, t('fast.hours', { n: hours })]) })}
        <button class="btn btn-large" data-action="start-fast">${icon('clock')}${t('fast.start')}</button>
        <p class="caption measure">${t('fast.help')}</p>
      </section>`;

  return html`
    ${current}
    <section class="stack-tight" aria-label="${t('fast.history')}">
      <div class="list">
        ${statRow(t('fast.completed'), reached.length)}
        ${statRow(t('fast.longest'), longest ? t('fast.hours', { n: formatDecimal(longest) }) : '-')}
      </div>
      ${history.length
        ? html`<div class="list">${history.map(item => html`
            <div class="list-row">
              <span class="grow">${shortDate(dateKey(new Date(item.start)))}</span>
              <span class="num">${t('fast.entry', { hours: formatDecimal((item.end - item.start) / HOUR), goal: item.goal })}</span>
              ${(item.end - item.start) / HOUR >= item.goal ? html`<span class="pill is-tonal">${icon('check')}${t('fast.reached')}</span>` : ''}
            </div>`)}</div>`
        : emptyState(t('fast.empty'))}
    </section>`;
}

function startFast() {
  state.fast = { start: Date.now(), hours: ui.fastHours };
  saveState();
  paint();
}

function endFast() {
  const { start, hours } = state.fast;
  const end = Date.now();
  state.fasts = [...(state.fasts || []), { start, end, goal: hours }].slice(-30);
  state.fast = null;
  if ((end - start) / HOUR >= hours) grantDailyBonus('fast', 10);
  saveState();
  paint();
  toast(t('fast.toastEnd', { hours: formatDecimal((end - start) / HOUR) }));
}

// Only the clock text changes each second, so nothing repaints.
setInterval(() => {
  const clock = $('[data-fast-clock]');
  if (clock && state.fast) clock.textContent = fastClock(Date.now() - state.fast.start);
}, 1000);
