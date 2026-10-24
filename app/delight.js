'use strict';

/* ==========================================================================
   Delight: the mascot's moods, empty states, floating numbers, undo, swipe to
   remove, quick add, the weekly recap, weight milestones and the home card.
   ========================================================================== */

/* --- Mascot moods ------------------------------------------------------------- */
const MOOD_LINES = 3;

function mascotMood() {
  const hour = new Date().getHours();
  if (xpToday() >= dailyGoal()) return 'proud';
  if (hour >= 22 || hour < 5) return 'sleepy';
  if (currentStreak() >= 7) return 'hype';
  const quiet = !isActiveDay(today()) && !isActiveDay(addDays(today(), -1));
  if (quiet && currentStreak() === 0 && Object.keys(state.days).length) return 'back';
  return 'calm';
}

const moodLine = () =>
  t(`mood.${mascotMood()}.${(hashText(today()) + ui.tipShift) % MOOD_LINES}`, { n: currentStreak(), name: state.profile.name });

/* --- Empty states: the mascot says it instead of a grey line ------------------------ */
const emptyState = text => html`
  <div class="mascot-tip empty">
    <span class="mascot-static">${logo(48, 16)}</span>
    <div class="bubble"><p class="measure">${text}</p></div>
  </div>`;

/* --- Loading placeholders ---------------------------------------------------------- */
const skeletonRows = (count = 3) => html`
  <div class="list skeleton-list" aria-hidden="true">${Array.from({ length: count }, () => html`
    <div class="list-row"><span class="skeleton line-long"></span><span class="skeleton line-short"></span></div>`)}
  </div>`;

/* --- Numbers that float up from where you tapped ------------------------------------- */
const lastTap = { x: innerWidth / 2, y: innerHeight * 0.6 };
document.addEventListener('pointerdown', event => { lastTap.x = event.clientX; lastTap.y = event.clientY; }, true);
document.addEventListener('keydown', event => {
  if (event.key !== 'Enter' || !document.activeElement || document.activeElement === document.body) return;
  const box = document.activeElement.getBoundingClientRect();
  lastTap.x = box.left + box.width / 2;
  lastTap.y = box.top;
}, true);

function floaty(text) {
  if (!motionOn()) return;
  const piece = document.createElement('span');
  piece.className = 'floaty';
  piece.textContent = text;
  piece.style.left = `${clamp(lastTap.x, 70, innerWidth - 70)}px`;
  piece.style.top = `${lastTap.y}px`;
  $('#fx').append(piece);
  const flight = piece.animate([
    { transform: 'translate(-50%, 0) scale(0.85)', opacity: 0 },
    { transform: 'translate(-50%, -20px) scale(1)', opacity: 1, offset: 0.25 },
    { transform: 'translate(-50%, -68px) scale(1)', opacity: 0 },
  ], { duration: 950, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
  flight.finished.then(() => piece.remove(), () => piece.remove());
}

/* --- Remove with undo ---------------------------------------------------------------- */
function removeEntry(kind, id) {
  let name = '';
  let restore = null;
  if (kind === 'food') {
    const day = foodDayKey();
    const list = foodOn(day);
    const index = list.findIndex(item => item.id === id);
    if (index < 0) return;
    const item = list[index];
    name = item.name;
    state.food[day] = list.filter(entry => entry.id !== id);
    restore = () => { const now = foodOn(day).slice(); now.splice(index, 0, item); state.food[day] = now; };
  } else if (kind === 'move') {
    const list = movesToday();
    const index = list.findIndex(item => item.id === id);
    if (index < 0) return;
    const item = list[index];
    name = `${t(`workout.${item.type}`)}, ${item.min} ${t('unit.min')}`;
    state.moves[today()] = list.filter(entry => entry.id !== id);
    restore = () => { const now = movesToday().slice(); now.splice(index, 0, item); state.moves[today()] = now; };
  } else {
    const kg = state.weights[id];
    if (kg === undefined) return;
    name = `${shortDate(id)}, ${mass.format(kg)}`;
    delete state.weights[id];
    restore = () => { state.weights[id] = kg; };
  }
  ui.undo = restore;
  saveState();
  paint();
  buzz(10);
  toast(t('toast.removed', { name }), { undo: true });
}

function undoRemove() {
  if (!ui.undo) return;
  ui.undo();
  ui.undo = null;
  roots.toast.hidden = true;
  saveState();
  paint();
  buzz(8);
}

/* --- Swipe a row left to remove it ------------------------------------------------------ */
let swipe = null;
const SWIPE_AT = 96;

document.addEventListener('pointerdown', event => {
  const row = event.target.closest?.('[data-swipe]');
  if (!row || event.target.closest('button, a, input, select, label')) return;
  swipe = { row, x: event.clientX, y: event.clientY, dx: 0, live: false };
});

document.addEventListener('pointermove', event => {
  if (!swipe) return;
  const dx = event.clientX - swipe.x;
  const dy = event.clientY - swipe.y;
  if (!swipe.live) {
    if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { swipe = null; return; }
    if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    swipe.live = true;
    swipe.row.setPointerCapture?.(event.pointerId);
    swipe.row.classList.add('is-swiping');
  }
  swipe.dx = Math.min(0, dx);
  swipe.row.style.transform = `translateX(${swipe.dx}px)`;
  swipe.row.classList.toggle('is-armed', swipe.dx <= -SWIPE_AT);
});

function endSwipe() {
  if (!swipe) return;
  const { row, dx, live } = swipe;
  swipe = null;
  if (!live) return;
  row.classList.remove('is-swiping');
  if (dx <= -SWIPE_AT) {
    row.classList.add('is-leaving');
    row.style.transform = 'translateX(-110%)';
    afterMotion(() => row.querySelector('[data-action^="remove-"]')?.click(), 160);
  } else {
    row.classList.remove('is-armed');
    row.style.transform = '';
  }
}
document.addEventListener('pointerup', endSwipe);
document.addEventListener('pointercancel', endSwipe);

/* --- Quick add ---------------------------------------------------------------------------- */
const QUICK_TILES = [
  ['food', 'food', 'quick.food'],
  ['water', 'drop', 'quick.water'],
  ['move', 'pulse', 'quick.move'],
  ['weight', 'scale', 'quick.weight'],
];
const QUICK_FIELD = { food: '#food-name', move: '#move-min', weight: '#weight-value' };

const fabButton = () => state.profile && ui.tab === 'track'
  ? html`<button class="fab" data-action="quick-add" aria-label="${t('quick.title')}">${icon('plus')}</button>`
  : html``;

const quickAddSheet = () => ({
  label: t('quick.title'),
  body: html`
    ${sheetHeader(t('quick.title'), t('quick.subtitle'))}
    <div class="quick-grid">${QUICK_TILES.map(([id, glyph, key]) => html`
      <button class="quick-tile" data-action="${id === 'water' ? 'quick-water' : 'quick-go'}" data-panel="${id}">
        <span class="quick-icon">${icon(glyph)}</span><span>${t(key)}</span>
      </button>`)}
    </div>`,
});

/* --- Weight milestones ------------------------------------------------------------------------ */
function milestoneList() {
  const { weightKg: start, goalKg: goal } = state.profile;
  const total = start - goal;
  if (!(total > 0)) return [];
  const items = [{ key: 'goal', kg: goal }];
  if (total >= 2) items.push({ key: 'first', kg: start - 1 });
  if (total >= 7) items.push({ key: 'five', kg: start - 5 });
  if (total >= 4) items.push({ key: 'half', kg: start - total / 2 });
  const lowest = Math.min(...Object.values(state.weights), start);
  return items
    .sort((a, b) => b.kg - a.kg)
    .map(item => ({ ...item, done: lowest <= item.kg + 1e-6 }));
}

function milestoneStrip() {
  const items = milestoneList();
  if (!items.length) return '';
  const next = items.find(item => !item.done);
  const left = next ? currentWeightKg() - next.kg : 0;
  return html`
    <div class="stack-tight">
      <p class="field-label">${t('ms.title')}</p>
      <ul class="milestones">${items.map(item => html`
        <li class="milestone ${item.done ? 'is-done' : ''}">
          <span class="milestone-mark">${item.done ? icon('check') : icon('flag')}</span>
          <span class="milestone-text"><strong>${t(`ms.${item.key}`)}</strong><span class="caption num">${mass.format(item.kg)}</span></span>
          <span class="sr-only">${item.done ? t('ms.reached') : t('ms.ahead')}</span>
        </li>`)}
      </ul>
      <p class="caption num">${next ? t('ms.next', { name: t(`ms.${next.key}`), left: mass.format(Math.max(0, left)) }) : t('ms.all')}</p>
    </div>`;
}

// After a weigh-in: celebrate the first time a milestone is reached.
function checkMilestones() {
  if (!state.profile) return;
  const seen = state.flags.milestones || (state.flags.milestones = {});
  const fresh = milestoneList().filter(item => item.done && !seen[item.key + state.profile.goalKg + state.profile.weightKg]);
  for (const item of fresh) seen[item.key + state.profile.goalKg + state.profile.weightKg] = 1;
  if (!fresh.length) return;
  const top = fresh[fresh.length - 1];
  toast(t('ms.toast', { name: t(`ms.${top.key}`) }));
  buzz([20, 40, 30]);
  afterMotion(() => burst(innerWidth / 2, innerHeight * 0.35, { count: top.key === 'goal' ? 70 : 36, spread: 240 }), 200);
}

/* --- Home card: today's goal and the single next thing to do -------------------------------------- */
function nextAction() {
  const open = firstOpenLesson();
  const reached = xpToday() >= dailyGoal();
  if (!reached && open < TOTAL_LESSONS) {
    const unit = Math.floor(open / LESSONS_PER_UNIT);
    const index = open % LESSONS_PER_UNIT;
    return { action: 'open-lesson', id: lessonId(unit, index), icon: 'play', label: t('home.lesson', { title: units()[unit].lessons[index].title }) };
  }
  if (!foodOn(today()).length) return { action: 'quick-go', panel: 'food', icon: 'food', label: t('home.food') };
  if (glassesToday() < 8) return { action: 'quick-water', icon: 'drop', label: t('home.water', { n: 8 - glassesToday() }) };
  const lastWeigh = Object.keys(state.weights).sort().pop();
  if (!lastWeigh || lastWeigh < addDays(today(), -6)) return { action: 'quick-go', panel: 'weight', icon: 'scale', label: t('home.weigh') };
  return null;
}

function homeCard() {
  const xp = xpToday();
  const goal = dailyGoal();
  const next = nextAction();
  return html`
    <section class="card home-card" aria-labelledby="goal-title">
      <div class="row">
        ${miniRing(xp / goal, true)}
        <div class="grow">
          <h2 id="goal-title">${t('learn.dailyGoal')}</h2>
          <p class="caption num">${xp >= goal ? t('learn.goalReached') : t('learn.goalProgress', { xp, goal })}</p>
        </div>
      </div>
      ${next
        ? html`<button class="btn btn-large" data-action="${next.action}" ${attributes({ 'data-id': next.id, 'data-panel': next.panel })}>${icon(next.icon)}${next.label}</button>`
        : html`<p class="note" role="status">${t('home.done')}</p>`}
    </section>`;
}

/* --- Weekly recap --------------------------------------------------------------------------------- */
const weekXp = () => Array.from({ length: 7 }, (_, i) => state.days[addDays(today(), -i)] || 0).reduce((a, b) => a + b, 0);

function recapSheet() {
  const stats = weekStats();
  const tone = stats.weekDays >= 6 ? 'great' : stats.weekDays >= 3 ? 'okay' : 'fresh';
  const change = stats.change === null ? '-' : `${stats.change > 0 ? '+' : ''}${formatDecimal(mass.fromKg(stats.change))} ${mass.unit()}`;
  const tiles = [
    [t('recap.logged'), t('common.ofTotal', { n: stats.weekDays, total: 7 })],
    [t('recap.xp'), formatInt(weekXp())],
    [t('recap.avg'), stats.weekAvg ? `${formatInt(stats.weekAvg)} kcal` : '-'],
    [t('recap.change'), change],
  ];
  return {
    label: t('recap.title'),
    body: html`
      ${sheetHeader(t('recap.title'), t('recap.subtitle'))}
      <div class="mascot-tip">
        <span class="mascot-static">${logo(48, 16)}</span>
        <div class="bubble"><p class="measure">${t(`recap.${tone}`)}</p></div>
      </div>
      <div class="recap-grid">${tiles.map(([label, value]) => html`
        <div class="recap-tile"><p class="caption">${label}</p><p class="recap-value num">${value}</p></div>`)}
      </div>
      <div class="row row-wrap">
        <button class="btn btn-tonal" data-action="share-card">${icon('send')}${t('share.button')}</button>
        <button class="btn btn-plain" data-action="post-card">${icon('chat')}${t('share.post')}</button>
      </div>`,
  };
}
