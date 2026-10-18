'use strict';

/* ==========================================================================
   Shell: painting, sheets and toasts
   ========================================================================== */
const roots = {
  app: $('#app'),
  toolbar: $('#toolbar'),
  screen: $('#screen'),
  tabbar: $('#tabbar'),
  sheet: $('#overlay'),
  lesson: $('#lesson'),
  toast: $('#toast'),
};

// Replace a root's contents while keeping meters and counters animating from their old values.
function render(root, markup, { entering = false } = {}) {
  const previous = snapshotTweens(root);
  root.innerHTML = markup.value;
  playTweens(root, previous, entering);
}

// Repainting replaces the DOM, so remember which control had focus and restore it.
function focusSignature() {
  const control = document.activeElement && document.activeElement.closest('[data-action]');
  return control ? { ...control.dataset } : null;
}

function restoreFocus(signature, container) {
  if (!signature) return;
  const selector = Object.entries(signature)
    .map(([key, value]) => `[data-${key}="${CSS.escape(value)}"]`)
    .join('');
  const target = $(selector, container);
  if (target) target.focus({ preventScroll: true });
}

function paintTabbar() {
  if (!state.profile) {
    roots.tabbar.innerHTML = '';
    roots.tabbar.dataset.built = '';
    return;
  }
  if (roots.tabbar.dataset.built !== state.settings.language) {
    roots.tabbar.innerHTML = tabBar().value;
    roots.tabbar.dataset.built = state.settings.language;
  }
  $('ul', roots.tabbar).style.setProperty('--i', TABS.findIndex(tab => tab.id === ui.tab));
  for (const button of $$('.tab', roots.tabbar)) {
    if (button.dataset.tab === ui.tab) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
}

function paintChrome() {
  if (state.profile) render(roots.toolbar, toolbar());
  else roots.toolbar.innerHTML = '';
  paintTabbar();
}

// Screen content slides up one block at a time when the screen changes.
function playEntrance() {
  const page = $('.page, .hero', roots.screen);
  if (!page) return;
  [...page.children].forEach((child, i) => child.style.setProperty('--n', Math.min(i, 8)));
  page.classList.remove('is-entering');
  void page.offsetWidth;
  page.classList.add('is-entering');
}

function paint({ entering = false } = {}) {
  regenerateHearts();
  const signature = focusSignature();
  paintChrome();
  render(roots.screen, screenView(), { entering });
  if (entering) playEntrance();
  restoreFocus(signature, roots.app);
  ui.newId = null;
  ui.newCup = null;
  syncFigure();
}

function goTo(tab, panel) {
  const changed = tab !== ui.tab;
  ui.tab = tab;
  ui.profileView = 'main';
  if (panel) ui.trackPanel = panel;
  ui.errors = {};
  paint({ entering: true });
  if (changed || panel) scrollTo(0, 0);
}

let sheetOpener = null;

function openSheet({ label, body }) {
  if (!sheetOpener) sheetOpener = document.activeElement;
  render(roots.sheet, html`
    <div class="scrim" data-action="dismiss-sheet">
      <div class="sheet glass" role="dialog" aria-modal="true" aria-label="${label}">
        <div class="grabber"></div>
        ${body}
      </div>
    </div>`, { entering: true });
  roots.app.inert = true;
  const first = $('.sheet .input', roots.sheet) || $('.sheet .btn:not(:disabled)', roots.sheet) || $('.sheet .icon-btn', roots.sheet);
  if (first) first.focus({ preventScroll: true });
}

function closeSheet() {
  const scrim = $('.scrim', roots.sheet);
  if (!scrim) return;
  const finish = () => {
    if ($('.scrim', roots.sheet) !== scrim) return; // another sheet opened in the meantime
    roots.sheet.innerHTML = '';
    if (!roots.lesson.innerHTML) roots.app.inert = false;
    if (sheetOpener && document.contains(sheetOpener)) sheetOpener.focus({ preventScroll: true });
    sheetOpener = null;
  };
  scrim.classList.add('is-closing');
  afterMotion(finish, 170);
}

let toastTimer = 0;
function toast(message) {
  roots.toast.textContent = message;
  roots.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { roots.toast.hidden = true; }, 2600);
}

/* ==========================================================================
   Lesson player
   ========================================================================== */
let session = null;

const LESSON_XP = { first: 15, perfectBonus: 5, replay: 5 };
const LESSON_GEMS = { first: 10, perfectBonus: 5, replay: 2 };

function prepareQuestion(question) {
  if (question.kind === 'choice') {
    const options = question.options.map((text, i) => ({ text, correct: i === 0 }));
    return { ...question, options: shuffle(options), retry: false };
  }
  return { ...question, retry: false };
}

function beginQuestion() {
  const question = session.queue[session.index];
  session.selected = null;
  session.checked = false;
  session.cheer = Math.floor(Math.random() * 12);
  session.correct = null;
  session.match = question.kind === 'match'
    ? {
        left: shuffle(question.pairs.map((_, i) => i)),
        right: shuffle(question.pairs.map((_, i) => i)),
        chosen: null,
        matched: [],
        fresh: null,
        wrong: null,
      }
    : null;
}

function startLesson(id) {
  const [unit, lesson] = id.split('.').map(Number);
  const { title, questions } = units()[unit].lessons[lesson];
  session = {
    id, unit, title,
    firstTime: !state.done[id],
    queue: questions.map(prepareQuestion),
    index: 0,
    total: questions.length,
    solved: 0,
    mistakes: 0,
    phase: 'question',   // question | out | done
    confirmingQuit: false,
  };
  beginQuestion();
  closeSheet();
  drawLesson({ entering: true });
  roots.app.inert = true;
}

const currentQuestion = () => session.queue[session.index];

function lessonBar() {
  return html`
    <div class="lesson-bar">
      <button class="icon-btn" data-action="quit-lesson" aria-label="${t('lesson.quit')}">${icon('close')}</button>
      <div class="grow">${progressBar(t('lesson.progress'), 'lesson', session.solved, session.total)}</div>
      <span class="row row-tight stat-hearts" role="img" aria-label="${state.plus ? t('plus.unlimitedHearts') : t('lesson.heartsLeft', { n: state.hearts })}">${icon('heart', { solid: true })}<strong class="num">${state.plus ? '∞' : state.hearts}</strong></span>
    </div>`;
}

const answerClass = (isRight, isChosen) => {
  if (!session.checked) return '';
  if (isRight) return isChosen ? 'is-right pop' : 'is-right';
  return isChosen ? 'is-wrong shake' : '';
};

const answerIcon = (isRight, isChosen) => {
  if (!session.checked) return '';
  if (isRight) return icon('check');
  return isChosen ? icon('close') : '';
};

function answerButton(index, text, isRight) {
  const chosen = session.selected === index;
  return html`
    <button class="choice ${answerClass(isRight, chosen)}" data-action="pick-answer" data-index="${index}" aria-pressed="${chosen}" ${attributes({ disabled: session.checked })}>
      <span class="label">${text}</span>${answerIcon(isRight, chosen)}
    </button>`;
}

function matchColumn(side, order, labelOf) {
  const { matched, chosen, wrong, fresh } = session.match;
  return html`
    <div class="stack">${order.map(i => {
      const isMatched = matched.includes(i);
      const isWrong = wrong && wrong[side] === i;
      const isChosen = side === 'left' && chosen === i;
      return html`
        <button class="choice ${isMatched ? 'is-right' : ''} ${isMatched && fresh === i ? 'pop' : ''} ${isWrong ? 'is-wrong shake' : ''}" data-action="match-${side}" data-index="${i}"
                ${attributes({ 'aria-pressed': side === 'left' ? String(isChosen) : null, disabled: isMatched || session.checked })}>
          <span class="label">${labelOf(i)}</span>${isMatched ? icon('check') : isWrong ? icon('close') : ''}
        </button>`;
    })}</div>`;
}

function questionBody(question) {
  if (question.kind === 'choice') {
    return html`
      <p class="caption">${t('lesson.chooseAnswer')}</p>
      <h2 class="question">${question.prompt}</h2>
      <div class="stack" role="group" aria-label="${t('lesson.answers')}">${question.options.map((option, i) => answerButton(i, option.text, option.correct))}</div>`;
  }
  if (question.kind === 'fact') {
    return html`
      <p class="caption">${t('lesson.factOrMyth')}</p>
      <h2 class="question">${question.prompt}</h2>
      <div class="stack" role="group" aria-label="${t('lesson.answers')}">
        ${answerButton(1, t('lesson.fact'), question.isFact)}
        ${answerButton(0, t('lesson.myth'), !question.isFact)}
      </div>`;
  }
  const { left, right } = session.match;
  return html`
    <p class="caption">${t('lesson.matchPairs')}</p>
    <h2 class="question">${question.prompt}</h2>
    <div class="match">
      ${matchColumn('left', left, i => question.pairs[i][0])}
      ${matchColumn('right', right, i => question.pairs[i][1])}
    </div>
    <p class="sr-only" role="status">${session.match.wrong ? t('lesson.notMatch') : ''}</p>`;
}

function correctAnswerText(question) {
  if (question.kind === 'choice') return question.options.find(option => option.correct).text;
  return question.isFact ? t('lesson.fact') : t('lesson.myth');
}

function lessonDock(question) {
  if (session.checked) {
    let message = question.explanation;
    if (question.kind === 'match') message = session.correct ? t('lesson.niceMatching') : t('lesson.ranOut');
    else if (!session.correct) message = t('lesson.answer', { answer: correctAnswerText(question), explanation: message });
    return html`
      <div class="dock glass">
        <div class="feedback ${session.correct ? 'is-right' : 'is-wrong'}">
          <span class="badge">${icon(session.correct ? 'check' : 'close')}</span>
          <div class="stack-tight"><h3>${session.correct ? t(`lesson.cheer.${(session.cheer || 0) % 4}`) : t(`lesson.miss.${(session.cheer || 0) % 3}`)}</h3><p>${message}</p></div>
        </div>
        <button class="btn btn-large" id="continue" data-action="continue">${t('common.continue')}</button>
      </div>`;
  }
  if (question.kind === 'match') {
    return html`<div class="dock glass"><p class="caption center">${t('lesson.matchHint')}</p></div>`;
  }
  return html`<div class="dock glass"><button class="btn btn-large" data-action="check-answer" ${attributes({ disabled: session.selected === null })}>${t('lesson.check')}</button></div>`;
}

function quitSheet() {
  return html`
    <div class="scrim" data-action="dismiss-quit">
      <div class="sheet glass" role="dialog" aria-modal="true" aria-label="${t('lesson.quit')}">
        <div class="grabber"></div>
        <h2>${t('quit.title')}</h2>
        <p>${t('quit.body')}</p>
        <button class="btn btn-large" id="keep-learning" data-action="keep-learning">${t('quit.keep')}</button>
        <button class="btn btn-plain btn-danger" data-action="end-lesson">${t('quit.confirm')}</button>
      </div>
    </div>`;
}

function outOfHeartsView() {
  return html`
    <div class="lesson" role="dialog" aria-modal="true" aria-label="${t('hearts.title')}">
      <div class="lesson-body is-centered">
        ${figureMark('figure-md')}
        <div class="stack center"><h1>${t('hearts.title')}</h1><p class="caption measure">${t('hearts.body')}</p></div>
        <button class="btn btn-large" data-action="refill-hearts" ${attributes({ disabled: state.gems < REFILL_COST })}>${icon('gem')}${t('hearts.refill', { n: REFILL_COST })}</button>
        <p class="caption">${t('hearts.gems', { n: state.gems })}</p>
        <button class="btn btn-plain" data-action="end-lesson">${t('hearts.end')}</button>
      </div>
    </div>`;
}

function resultView() {
  const result = session.result;
  return html`
    <div class="lesson" role="dialog" aria-modal="true" aria-label="${t('result.lessonComplete')}">
      <div class="lesson-body is-centered result">
        ${figureMark('figure-md')}
        <div class="stack center">
          <h1>${result.unitFinished ? t('result.unitComplete') : t('result.lessonComplete')}</h1>
          <p class="caption">${result.perfect ? t('result.perfect') : t(`result.nice.${state.xp % 4}`)}</p>
        </div>
        <div class="grid-3 fill">
          <div class="tile center"><p class="caption">XP</p><h2 class="num">+<span data-count="${result.xp}">${result.xp}</span></h2></div>
          <div class="tile center"><p class="caption">${t('result.accuracy')}</p><h2 class="num"><span data-count="${result.accuracy}">${result.accuracy}</span>%</h2></div>
          <div class="tile center"><p class="caption">${t('result.gems')}</p><h2 class="num">+<span data-count="${result.gems}">${result.gems}</span></h2></div>
        </div>
        <p class="row row-tight stat-streak">${icon('flame', { solid: true })}<span>${result.extended ? t('result.streakExtended', { n: result.streak }) : t('result.streak', { n: result.streak })}</span></p>
        <button class="btn btn-large" id="continue" data-action="end-lesson">${t('common.continue')}</button>
      </div>
    </div>`;
}

function drawLesson({ entering = false, slide = false, hit = false } = {}) {
  const focused = focusSignature();
  let view;
  if (session.phase === 'out') view = outOfHeartsView();
  else if (session.phase === 'done') view = resultView();
  else {
    const question = currentQuestion();
    view = html`
      <div class="lesson" role="dialog" aria-modal="true" aria-label="${t('lesson.label', { title: session.title })}">
        ${lessonBar()}
        <div class="lesson-body">${questionBody(question)}</div>
        ${lessonDock(question)}
        ${session.confirmingQuit ? quitSheet() : ''}
      </div>`;
  }
  render(roots.lesson, view, { entering: entering || session.phase === 'done' && session.justFinished });
  if (entering) $('.lesson', roots.lesson).classList.add('is-entering');
  if (slide) $('.lesson-body', roots.lesson).classList.add('is-sliding');
  if (hit) $('.lesson-bar .stat-hearts', roots.lesson).classList.add('is-hit');
  if (session.justFinished) {
    session.justFinished = false;
    afterMotion(() => burst(innerWidth / 2, innerHeight * 0.3, { count: 48, spread: 260 }), 250);
  }

  let autofocus = null;
  if (session.confirmingQuit) autofocus = '#keep-learning';
  else if (session.checked || session.phase === 'done') autofocus = '#continue';
  else if (session.phase === 'out') autofocus = '.btn:not(:disabled)';
  if (autofocus) $(autofocus, roots.lesson).focus({ preventScroll: true });
  else restoreFocus(focused, roots.lesson);
}

function checkAnswer() {
  const question = currentQuestion();
  if (session.checked || session.selected === null) return;

  const correct = question.kind === 'choice'
    ? question.options[session.selected].correct
    : (session.selected === 1) === question.isFact;

  session.checked = true;
  session.correct = correct;
  buzz(correct ? 12 : [30, 40, 30]);
  if (correct || question.retry) session.solved++;
  if (!correct) {
    loseHeart();
    session.mistakes++;
    // Missed questions come back once at the end of the lesson.
    if (!question.retry) {
      const again = { ...question, retry: true };
      if (again.options) again.options = shuffle(again.options);
      session.queue.push(again);
    }
  }
  drawLesson({ hit: !correct });
}

function tapMatch(side, index) {
  const match = session.match;
  if (session.checked) return;

  if (side === 'left') {
    match.chosen = index;
    match.wrong = null;
    match.fresh = null;
    drawLesson();
    return;
  }
  if (match.chosen === null) {
    toast(t('lesson.tapLeftFirst'));
    return;
  }
  if (match.chosen === index) {
    match.matched.push(index);
    match.fresh = index;
    match.chosen = null;
    match.wrong = null;
    if (match.matched.length === currentQuestion().pairs.length) {
      session.checked = true;
      session.correct = true;
      session.solved++;
    }
    drawLesson();
    return;
  }
  loseHeart();
  session.mistakes++;
  match.wrong = { left: match.chosen, right: index };
  match.chosen = null;
  if (state.hearts === 0) {
    session.checked = true;
    session.correct = false;
  }
  drawLesson({ hit: true });
}

function nextQuestion() {
  if (session.index + 1 >= session.queue.length) {
    finishLesson();
    return;
  }
  session.index++;
  session.phase = 'question';
  beginQuestion();
  drawLesson({ slide: true });
}

function finishLesson() {
  const perfect = session.mistakes === 0;
  const xp = session.firstTime ? LESSON_XP.first + (perfect ? LESSON_XP.perfectBonus : 0) : LESSON_XP.replay;
  const gems = session.firstTime ? LESSON_GEMS.first + (perfect ? LESSON_GEMS.perfectBonus : 0) : LESSON_GEMS.replay;
  const unitWasDone = isUnitDone(session.unit);
  const streakBefore = currentStreak();

  state.done[session.id] = (state.done[session.id] || 0) + 1;
  state.lessonsByDay[today()] = (state.lessonsByDay[today()] || 0) + 1;
  if (perfect) {
    state.perfects++;
    state.perfectsByDay[today()] = (state.perfectsByDay[today()] || 0) + 1;
  }
  grantXp(xp, gems);

  session.result = {
    xp, gems, perfect,
    unitFinished: !unitWasDone && isUnitDone(session.unit),
    accuracy: Math.round((100 * session.total) / (session.total + session.mistakes)),
    streak: currentStreak(),
    extended: currentStreak() > streakBefore,
  };
  session.phase = 'done';
  session.justFinished = true;
  drawLesson();
}

function leaveLesson() {
  roots.lesson.innerHTML = '';
  session = null;
  roots.app.inert = false;
  paint();
}

/* ==========================================================================
   Actions (one handler per data-action)
   ========================================================================== */
function logFood(name, kcal, meal, macros = {}, day = today()) {
  const list = state.food[day] || (state.food[day] = []);
  const entry = { id: makeId(), name, kcal, meal };
  for (const key of ['p', 'c', 'f']) if (macros[key] > 0) entry[key] = macros[key];
  list.push(entry);
  ui.newId = entry.id;
  if (day === today()) grantDailyBonus('food', 5);
  saveState();
}

const mealForNow = () => {
  const hour = new Date().getHours();
  if (hour < 11) return 'Breakfast';
  if (hour < 16) return 'Lunch';
  if (hour < 21) return 'Dinner';
  return 'Snack';
};

const rewardText = quest => (quest.xp ? t('toast.reward', { gems: quest.gems, xp: quest.xp }) : t('toast.gems', { gems: quest.gems }));

function buy(item) {
  const shop = {
    hearts: { cost: REFILL_COST, allowed: () => state.hearts < HEART_MAX, apply: () => { state.hearts = HEART_MAX; state.heartsAt = Date.now(); }, message: t('toast.heartsRefilled') },
    freeze: { cost: FREEZE_COST, allowed: () => state.freezes < FREEZE_MAX, apply: () => { state.freezes++; }, message: t('toast.freezeAdded') },
  }[item];
  if (state.gems < shop.cost || !shop.allowed()) return;
  state.gems -= shop.cost;
  shop.apply();
  saveState();
  toast(shop.message);
  paint();
  openSheet(shopSheet());
}

function saveGoal() {
  const { profile } = state;
  const input = $('#goal-weight').value;
  const goalKg = mass.toKg(Number(input));
  const lowest = lowestHealthyKg(profile.heightCm);

  let message = '';
  if (!(goalKg > 0)) message = t('error.goalMissing');
  else if (goalKg >= currentWeightKg()) message = t('error.goalHigher');
  else if (goalKg < lowest) message = t('error.goalLow', { n: formatDecimal(mass.fromKg(lowest)), unit: mass.unit() });

  if (message) {
    ui.errors.goal = message;
    ui.goalDraft.goal = input;
    openSheet(goalSheet());
    return;
  }
  profile.goalKg = goalKg;
  profile.activity = Number($('#goal-activity').value);
  profile.pace = ui.goalDraft.pace;
  saveState();
  ui.errors = {};
  closeSheet();
  paint();
  toast(t('toast.goalUpdated'));
}

function recordWeight(kg) {
  if (!(kg >= 30 && kg <= 300)) return false;
  state.weights[today()] = kg;
  state.flags.weighed = true;
  grantDailyBonus('weigh', 10);
  saveState();
  toast(t('toast.logged', { weight: mass.format(kg) }));
  return true;
}

// Once a day, the first time the app is open with no weight logged yet.
function askForWeighIn() {
  if (!state.profile || session || roots.sheet.innerHTML || roots.lesson.innerHTML) return;
  if (state.weights[today()] || state.flags.weighPrompted === today()) return;
  state.flags.weighPrompted = today();
  saveState();
  ui.errors = {};
  openSheet(weighInSheet());
}

function saveWeighIn() {
  const input = $('#weighin-value').value;
  if (!recordWeight(mass.toKg(Number(input)))) {
    ui.errors.weighin = t('error.weightLog');
    openSheet(weighInSheet(input));
    return;
  }
  ui.errors = {};
  closeSheet();
  paint();
}

function advanceOnboarding() {
  const draft = ui.draft;
  if (draft.step === 0) {
    draft.step = 1;
    tweenFigure(figure.target, 400);
  } else {
    const errors = validateDraft(draft.step);
    ui.errors = errors;
    if (Object.keys(errors).length) {
      paint();
      focusFirstInvalid();
      return;
    }
    if (draft.step < 3) {
      draft.step++;
    } else {
      finishOnboarding();
      return;
    }
  }
  paint({ entering: true });
  scrollTo(0, 0);
}

function resetFigure() {
  figure.target = 0;
  state.flags.figureShown = 0;
  drawFigure(0);
}

function finishOnboarding() {
  const profile = draftProfile();
  const units = ui.draft.units;
  state = createState(state.settings);
  state.units = units;
  state.profile = profile;
  state.weights[profile.start] = profile.weightKg;
  resetFigure();
  saveState();
  ui.draft = null;
  ui.errors = {};
  ui.tab = 'learn';
  paint({ entering: true });
  scrollTo(0, 0);
  toast(t('toast.welcome', { name: profile.name }));
}

function focusFirstInvalid() {
  setTimeout(() => {
    const field = $('[aria-invalid="true"]');
    if (field) field.focus();
  }, 0);
}

const actions = {
  'go-tab': el => { ui.day = null; if (el.dataset.tab !== ui.tab || ui.profileView !== 'main') goTo(el.dataset.tab); },
  'go-panel': el => { ui.trackPanel = el.dataset.panel; ui.errors = {}; paint(); },

  'open-lesson': el => openSheet(lessonSheet(el.dataset.id)),
  'locked-lesson': () => toast(t('toast.locked')),
  'start-lesson': el => startLesson(el.dataset.id),

  'show-streak': () => openSheet(streakSheet()),
  'show-shop': () => openSheet(shopSheet()),
  'show-plus': () => openSheet(plusSheet()),
  'next-tip': () => { ui.tipShift++; paint(); },
  'open-food-search': () => openSheet(foodSearchSheet()),
  'find-foods': () => searchFoods(),
  'lookup-barcode': () => lookupBarcode(),
  'scan-barcode': () => scanBarcode(),
  'add-found': el => addFound(Number(el.dataset.index)),
  'open-photo': el => openSheet(photoSheet(el.dataset.id)),
  'delete-photo': el => deletePhoto(el.dataset.id),
  'sign-in': async () => {
    try { await cloudApi().signIn(); } catch (error) { toast(t('account.signInFailed')); }
  },
  'sign-out': async () => {
    try { await cloudApi().signOut(); toast(t('toast.signedOut')); } catch (error) { toast(t('account.signInFailed')); }
  },
  'show-delete-account': () => openSheet(deleteAccountSheet()),
  'confirm-delete-account': async () => {
    closeSheet();
    try { await cloudApi().deleteAccount(); toast(t('toast.accountDeleted')); } catch (error) { toast(t('account.deleteFailed')); }
  },
  'show-health': () => openSheet(legalSheet('health')),
  'show-privacy': () => openSheet(legalSheet('privacy')),
  'toggle-agree': () => { ui.draft.agree = !ui.draft.agree; delete ui.errors.agree; paint(); $('#ob-agree')?.focus({ preventScroll: true }); },
  'add-reminder': () => addReminder(),
  'unlock-plus': () => setPlus(true),
  'cancel-plus': () => setPlus(false),
  'show-badge': el => openSheet(badgeSheet(el.dataset.id)),
  'close-sheet': () => closeSheet(),
  'dismiss-sheet': (el, event) => { if (event.target === el) closeSheet(); },
  'buy-hearts': () => buy('hearts'),
  'buy-freeze': () => buy('freeze'),

  'pick-answer': el => { if (!session.checked) { session.selected = Number(el.dataset.index); drawLesson(); } },
  'check-answer': () => checkAnswer(),
  'match-left': el => tapMatch('left', Number(el.dataset.index)),
  'match-right': el => tapMatch('right', Number(el.dataset.index)),
  'continue': () => {
    if (state.hearts === 0 && !session.correct) { session.phase = 'out'; drawLesson(); }
    else nextQuestion();
  },
  'refill-hearts': () => {
    if (state.gems < REFILL_COST) return;
    state.gems -= REFILL_COST;
    state.hearts = HEART_MAX;
    state.heartsAt = Date.now();
    saveState();
    nextQuestion();
  },
  'quit-lesson': () => { session.confirmingQuit = true; drawLesson(); },
  'keep-learning': () => { session.confirmingQuit = false; drawLesson(); },
  'dismiss-quit': (el, event) => { if (event.target === el) { session.confirmingQuit = false; drawLesson(); } },
  'end-lesson': () => leaveLesson(),

  'quick-food': el => {
    const food = QUICK_FOODS[Number(el.dataset.index)];
    const name = t(`food.${food.key}`);
    logFood(name, food.kcal, mealForNow(), food, foodDayKey());
    toast(t('toast.added', { name, kcal: food.kcal }));
    paint();
  },
  'remove-food': el => { state.food[foodDayKey()] = foodOn(foodDayKey()).filter(item => item.id !== el.dataset.id); saveState(); paint(); },
  'recent-food': el => {
    const food = recentFoods()[Number(el.dataset.index)];
    if (!food) return;
    logFood(food.name, food.kcal, mealForNow(), food, foodDayKey());
    toast(t('toast.added', { name: food.name, kcal: food.kcal }));
    paint();
  },
  'day-prev': () => { ui.day = addDays(foodDayKey(), -1); paint(); },
  'day-next': () => { const next = addDays(foodDayKey(), 1); ui.day = next >= today() ? null : next; paint(); },
  'day-today': () => { ui.day = null; paint(); },
  'set-fast-hours': el => { ui.fastHours = Number(el.dataset.value); paint(); },
  'start-fast': () => startFast(),
  'end-fast': () => endFast(),
  'apply-target': () => {
    state.profile.maintenanceOverride = weekStats().maintenance;
    saveState();
    paint();
    toast(t('toast.targetUpdated'));
  },
  'reset-target': () => { delete state.profile.maintenanceOverride; saveState(); paint(); toast(t('toast.targetReset')); },
  'remove-move': el => { state.moves[today()] = movesToday().filter(item => item.id !== el.dataset.id); saveState(); paint(); },
  'remove-weight': el => { delete state.weights[el.dataset.id]; saveState(); paint(); },
  'set-water': el => {
    const tapped = Number(el.dataset.index) + 1;
    const glasses = tapped === glassesToday() ? tapped - 1 : tapped;
    state.water[today()] = glasses;
    if (glasses >= 8) state.flags.hydrated = true;
    if (glasses > 0) grantDailyBonus('water', 5);
    ui.newCup = glasses === tapped ? tapped - 1 : null;
    buzz(8);
    saveState();
    paint();
  },

  // Quests
  'flip-quest': el => {
    const quest = questById(el.dataset.id);
    state.revealed[dayKey(quest)] = 1;
    saveState();
    const card = el.closest('.qcard');
    card.classList.add('is-flipped', 'is-turning');
    afterMotion(() => card.classList.remove('is-turning'), 400);
    $('.qback', card).inert = true;
    const front = $('.qfront', card);
    front.inert = false;
    const next = $('button', front);
    if (next) next.focus({ preventScroll: true });
  },
  'toggle-check': el => {
    const quest = questById(el.dataset.id);
    if (isClaimed(quest)) return;
    if (state.checks[dayKey(quest)]) delete state.checks[dayKey(quest)];
    else state.checks[dayKey(quest)] = 1;
    saveState();
    paint();
  },
  'claim-quest': el => {
    const quest = questById(el.dataset.id);
    const card = el.closest('.qcard, .card');
    if (!claimQuest(quest)) return;
    el.disabled = true;
    burstFrom(el);
    buzz(15);
    toast(rewardText(quest));
    if (card) card.classList.add('is-claiming');
    paintChrome();
    afterMotion(() => paint(), 450);
  },
  'open-chest': el => {
    const reward = openChest();
    if (!reward) return;
    const card = el.closest('.chest');
    el.disabled = true;
    card.classList.remove('is-ready');
    card.classList.add('is-opening');
    afterMotion(() => burstFrom($('.chest-art', card)), 250);
    buzz([20, 40, 60]);
    toast(t('toast.reward', reward));
    paintChrome();
    afterMotion(() => paint(), 1100);
  },
  'quest-go': el => {
    const { go } = questById(el.dataset.id);
    goTo(go.tab, go.panel);
  },

  // Goal and settings
  'edit-goal': () => {
    ui.errors = {};
    ui.goalDraft = { goal: mass.fromKg(state.profile.goalKg).toFixed(1), pace: state.profile.pace };
    openSheet(goalSheet());
  },
  'pick-pace': el => {
    ui.goalDraft.pace = Number(el.dataset.value);
    $$('.sheet [data-action="pick-pace"]').forEach(button => button.setAttribute('aria-checked', String(button === el)));
  },
  // Recipes
  'open-recipe': el => openSheet(recipeSheet(el.dataset.id)),
  'log-recipe': el => logRecipe(el.dataset.id),
  'toggle-saved': el => toggleSaved(el.dataset.id),
  'filter-recipes': el => { ui.recipeFilter = el.dataset.value; paint(); },
  'ai-create': () => createRecipe(),
  'ai-stop': () => aiState.controller?.abort(),

  'save-goal': () => saveGoal(),
  'save-weighin': () => saveWeighIn(),
  'open-settings': () => { ui.profileView = 'settings'; paint({ entering: true }); scrollTo(0, 0); },
  'close-settings': () => { ui.profileView = 'main'; paint({ entering: true }); scrollTo(0, 0); },
  'set-setting': el => {
    const { field, value } = el.dataset;
    state.settings[field] = field === 'dailyGoal' ? Number(value) : value;
    saveState();
    if (field === 'theme') applyThemeChange();
    else applySettings();
    paint();
  },
  'set-units': el => { state.units = el.dataset.value; saveState(); paint(); },
  'reset-data': () => openSheet(resetSheet()),
  // The viewer hosts the page, so the file is handed over through the downloads capability, which asks first.
  'export-data': async () => {
    const downloads = await window.claude?.use?.('downloads');
    if (!downloads) { toast(t('toast.exportUnavailable')); return; }
    try {
      await downloads.save({ filename: `fatboy-${today()}.json`, data: JSON.stringify(state, null, 2) });
      toast(t('toast.exported'));
    } catch (error) {
      if (error.code !== 'declined') toast(t('toast.exportUnavailable'));
    }
  },
  'confirm-reset': () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch (error) { /* ignore */ }
    state = createState(state.settings);
    clearPhotos();
    applySettings();
    resetFigure();
    ui.draft = null;
    ui.tab = 'learn';
    ui.profileView = 'main';
    ui.errors = {};
    closeSheet();
    paint({ entering: true });
    playWelcomeFigure();
  },

  'draft-next': () => advanceOnboarding(),
  'draft-back': () => { ui.errors = {}; if (ui.draft.step > 0) ui.draft.step--; paint({ entering: true }); },
  'set-draft': el => { ui.draft[el.dataset.field] = el.dataset.value; paint(); },
};

/* ==========================================================================
   Forms and events
   ========================================================================== */
const forms = {
  food(read) {
    const name = read('food-name').trim();
    const kcal = Math.round(Number(read('food-kcal')));
    if (!name || !(kcal >= 1 && kcal <= 5000)) return t('error.food');
    logFood(name, kcal, read('food-meal'), readMacros(read), foodDayKey());
    toast(t('toast.added', { name, kcal }));
    return null;
  },
  move(read) {
    const type = read('move-type');
    const min = Math.round(Number(read('move-min')));
    if (!(min >= 1 && min <= 600)) return t('error.move');
    const list = state.moves[today()] || (state.moves[today()] = []);
    const entry = { id: makeId(), type, min, kcal: Math.round((WORKOUT_MET[type] * currentWeightKg() * min) / 60) };
    list.push(entry);
    ui.newId = entry.id;
    grantDailyBonus('move', 10);
    saveState();
    toast(t('toast.addedMove', { name: t(`workout.${type}`), min }));
    return null;
  },
  weight: read => recordWeight(mass.toKg(Number(read('weight-value')))) ? null : t('error.weightLog'),
};

document.addEventListener('click', event => {
  const control = event.target.closest('[data-action]');
  if (!control) return;
  const handler = actions[control.dataset.action];
  if (handler) handler(control, event);
});

document.addEventListener('submit', event => {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const name = form.dataset.form;
  const error = forms[name](id => document.getElementById(id).value);
  ui.errors = error ? { [name]: error } : {};
  paint();
  if (error) focusFirstInvalid();
  else {
    const firstField = $('input', roots.screen.querySelector(`[data-form="${name}"]`));
    if (firstField) firstField.focus({ preventScroll: true });
  }
});

document.addEventListener('input', event => {
  const { target } = event;
  // Dragging the slider previews the figure at that point of the journey.
  if (target.matches('[data-scrub]')) {
    cancelAnimationFrame(figure.frame);
    drawFigure(Number(target.value) / 100);
    $('[data-scrub-label]')?.replaceChildren(scrubLabel(Number(target.value) / 100));
    return;
  }
  // Keep the recipe assistant's form in sync, so a repaint does not lose what was typed.
  if (target.dataset && target.dataset.ai) {
    aiDraft[target.dataset.ai] = target.value;
    return;
  }
  // Keep the onboarding draft in sync without repainting while someone types.
  const field = target.dataset && target.dataset.field;
  if (field && ui.draft) ui.draft[field] = target.value;
});

// A backup is a saved copy of the state; anything that is not one is turned away.
// A repeating calendar event is the one reminder a web page can set up reliably, so the file goes to the phone's calendar.
async function addReminder() {
  const [hh, mm] = (state.settings.reminder || '19:00').split(':');
  const stamp = today().replaceAll('-', '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FatBoy//Daily reminder//EN',
    'BEGIN:VEVENT', `UID:fatboy-daily-${stamp}@fatboy.app`, `DTSTAMP:${stamp}T000000Z`,
    `DTSTART:${stamp}T${hh}${mm}00`, 'DURATION:PT15M', 'RRULE:FREQ=DAILY',
    `SUMMARY:${t('reminder.title')}`, `DESCRIPTION:${t('reminder.body')}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${t('reminder.title')}`, 'TRIGGER:PT0M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  const downloads = await window.claude?.use?.('downloads');
  if (!downloads) { toast(t('toast.exportUnavailable')); return; }
  try {
    await downloads.save({ filename: 'fatboy-reminder.ics', data: lines.join('\r\n') });
    toast(t('toast.reminderSaved'));
  } catch (error) {
    if (error.code !== 'declined') toast(t('toast.exportUnavailable'));
  }
}

function setPlus(on) {
  state.plus = on;
  saveState();
  applyThemeChange();
  applySettings();
  closeSheet();
  paint();
  toast(t(on ? 'plus.toastOn' : 'plus.toastOff'));
}

function importBackup(file) {
  file.text().then(text => {
    const saved = JSON.parse(text);
    if (!saved || typeof saved !== 'object' || !saved.profile || !saved.profile.heightCm || typeof saved.weights !== 'object') throw new Error('not a backup');
    state = { ...createState(), ...saved, settings: { ...state.settings } };
    saveState();
    state.flags.figureShown = undefined;
    resetFigure();
    applySettings();
    ui.tab = 'learn';
    ui.profileView = 'main';
    paint({ entering: true });
    toast(t('toast.imported'));
  }).catch(() => toast(t('toast.importFailed')));
}

document.addEventListener('change', event => {
  if (event.target.matches?.('[data-photo]')) {
    const [file] = event.target.files;
    event.target.value = '';
    if (file) addPhoto(file);
    return;
  }
  if (event.target.matches?.('[data-reminder]') && event.target.value) {
    state.settings.reminder = event.target.value;
    saveState();
    return;
  }
  if (event.target.matches('[data-import]')) {
    const [file] = event.target.files;
    event.target.value = '';
    if (file) importBackup(file);
    return;
  }
  if (!event.target.matches('[data-scrub]')) return;
  const slider = event.target;
  setTimeout(() => {
    slider.value = Math.round(figure.target * 100);
    $('[data-scrub-label]')?.replaceChildren(scrubLabel(figure.target));
    tweenFigure(figure.target, 900);
  }, 700);
});

document.addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.target.dataset && event.target.dataset.ai === 'fridge') {
    event.preventDefault();
    createRecipe();
    return;
  }
  if (event.key === 'Enter' && event.target.dataset?.find) {
    event.preventDefault();
    if (event.target.dataset.find === 'query') searchFoods(); else lookupBarcode();
    return;
  }
  if (event.key === 'Enter' && event.target.id === 'weighin-value') {
    event.preventDefault();
    saveWeighIn();
    return;
  }
  if (event.key !== 'Escape') return;
  if (session && session.phase === 'question') {
    session.confirmingQuit = !session.confirmingQuit;
    drawLesson();
  } else if (!session && roots.sheet.innerHTML) {
    closeSheet();
  }
});

// Raised pieces (data-tilt="max degrees") lean toward a mouse pointer. Touch only gets the press.
document.addEventListener('pointermove', event => {
  if (event.pointerType === 'touch' || !motionOn()) return;
  const piece = event.target.closest?.('[data-tilt]');
  if (!piece) return;
  const box = piece.getBoundingClientRect();
  const max = Number(piece.dataset.tilt);
  const across = ((event.clientX - box.left) / box.width) * 2 - 1;
  const down = ((event.clientY - box.top) / box.height) * 2 - 1;
  piece.style.setProperty('--ry', `${(clamp(across, -1, 1) * max).toFixed(1)}deg`);
  piece.style.setProperty('--rx', `${(clamp(down, -1, 1) * -max).toFixed(1)}deg`);
});
document.addEventListener('pointerout', event => {
  const piece = event.target.closest?.('[data-tilt]');
  if (!piece || piece.contains(event.relatedTarget)) return;
  piece.style.removeProperty('--rx');
  piece.style.removeProperty('--ry');
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden || session || !state.profile) return;
  protectStreak();
  paint();
  askForWeighIn();
});

/* ==========================================================================
   Start
   ========================================================================== */
applySettings();
figure.target = state.flags.figureShown ?? figureProgress(); // a slimmer figure plays out on launch
drawFigure(figure.target);
protectStreak();
detectAssistant();
startAccounts();
loadPhotos();
paint({ entering: true });
if (!state.profile) playWelcomeFigure();
else setTimeout(askForWeighIn, 800);
