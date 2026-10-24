'use strict';

/* ==========================================================================
   Appearance and motion settings
   The resolved theme and motion are written to <html> as data attributes; the
   stylesheet only ever looks at those.
   ========================================================================== */
const systemLight = matchMedia('(prefers-color-scheme: light)');
const systemReduced = matchMedia('(prefers-reduced-motion: reduce)');

const resolvedTheme = () => {
  const { theme } = state.settings;
  if (theme !== 'system') return theme;
  return systemLight.matches ? 'light' : 'dark';
};

const motionOn = () => {
  const { motion } = state.settings;
  return motion === 'full' || motion === 'expressive' || (motion === 'auto' && !systemReduced.matches);
};

// Refraction uses an SVG filter inside backdrop-filter, which only Chromium-based engines draw.
// Elsewhere the glass keeps its blur and rim light and skips the bending.
const canRefract = (() => {
  try {
    const ua = navigator.userAgent || '';
    return /Chrome\/\d+/.test(ua) && !/Edg\/|OPR\//.test(ua) && CSS.supports('backdrop-filter', 'url(#fb-lens-bar)');
  } catch (error) { return false; }
})();

// Frost slider: 0 is clear glass with no blur and a faint tint, 50 is the default look, 100 is heavy, tinted frost.
function applyFrost() {
  const raw = Number(state.settings.frost);
  const f = Math.min(100, Math.max(0, Number.isFinite(raw) ? raw : 50));
  const blur = f <= 50 ? (f / 50) * 14 : 14 + ((f - 50) / 50) * 26;
  const tint = f <= 50 ? 4 + (f / 50) * 53 : 57 + ((f - 50) / 50) * 39;
  const style = document.documentElement.style;
  style.setProperty('--frost-blur', `${blur.toFixed(1)}px`);
  style.setProperty('--frost-tint', `${tint.toFixed(1)}%`);
  style.setProperty('--sheet-tint', `${(58 + (f / 100) * 40).toFixed(1)}%`);
  document.documentElement.dataset.frost = f === 0 ? 'none' : 'on';
  const pct = (value, fallback) => Math.min(100, Math.max(0, Number.isFinite(Number(value)) ? Number(value) : fallback)) / 100;
  style.setProperty('--vibe', String(pct(state.settings.vibe, 45)));
  style.setProperty('--art', String(pct(state.settings.art, 45)));
}

function applySettings() {
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme();
  root.dataset.accent = ACCENTS.includes(state.settings.accent) ? state.settings.accent : 'blue';
  if (canRefract) root.dataset.lens = 'on';
  applyFrost();
  root.dataset.motion = motionOn() ? 'full' : 'reduced';
  root.dataset.expressive = motionOn() && state.settings.motion === 'expressive' ? 'on' : 'off';
  root.dataset.density = state.settings.density === 'compact' ? 'compact' : 'cozy';
  root.dataset.tablabels = state.settings.tabLabels === 'off' ? 'off' : 'on';
  root.style.setProperty('--ts', String({ small: 0.92, normal: 1, large: 1.12, xl: 1.25 }[state.settings.textSize] || 1));
  root.lang = state.settings.language;
}

// Fade colours between themes instead of snapping.
function applyThemeChange() {
  const root = document.documentElement;
  if (motionOn()) {
    root.classList.add('is-recolouring');
    setTimeout(() => root.classList.remove('is-recolouring'), 350);
  }
  applySettings();
}

systemLight.addEventListener('change', applySettings);
systemReduced.addEventListener('change', applySettings);

// Run `callback` after the animation has had time to play (straight away when motion is off).
// A short buzz on phones that support it, so taps feel like something happened.
const buzz = pattern => { if (motionOn() && state.settings.haptics !== 'off') navigator.vibrate?.(pattern); };

const afterMotion = (callback, ms) => setTimeout(callback, motionOn() ? ms : 0);

/* ==========================================================================
   Tweens
   Screens are repainted from scratch, so meters and counters remember their
   previous value (by key) and play from it to the new one.
   ========================================================================== */
const fraction = value => clamp(value, 0, 1).toFixed(3);

function snapshotTweens(root) {
  const bars = new Map($$('[data-tween]', root).map(el => [el.dataset.tween, el.style.getPropertyValue('--v')]));
  const counts = new Map($$('[data-key]', root).map(el => [el.dataset.key, Number(el.dataset.count)]));
  return { bars, counts };
}

function playTweens(root, previous, entering) {
  const jobs = [];
  for (const el of $$('[data-tween]', root)) {
    const to = el.style.getPropertyValue('--v');
    const from = previous.bars.has(el.dataset.tween) ? previous.bars.get(el.dataset.tween) : entering ? '0.000' : to;
    if (from !== to) {
      el.style.setProperty('--v', from);
      jobs.push([el, to]);
    }
  }
  if (jobs.length) {
    void root.offsetWidth; // commit the starting values so the change transitions
    for (const [el, to] of jobs) el.style.setProperty('--v', to);
  }

  for (const el of $$('[data-count]', root)) {
    const to = Number(el.dataset.count);
    const known = el.dataset.key && previous.counts.has(el.dataset.key);
    const from = known ? previous.counts.get(el.dataset.key) : entering ? 0 : to;
    if (from === to) continue;
    const stat = el.closest('.stat');
    if (stat && known) {
      stat.classList.remove('bump');
      void stat.offsetWidth;
      stat.classList.add('bump');
    }
    countUp(el, from, to);
  }
}

function countUp(el, from, to, duration = 600) {
  if (!motionOn()) return;
  const start = performance.now();
  const step = now => {
    const progress = clamp((now - start) / duration, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = formatInt(from + (to - from) * eased);
    if (progress < 1 && el.isConnected) requestAnimationFrame(step);
  };
  el.textContent = formatInt(from);
  requestAnimationFrame(step);
}

/* ==========================================================================
   Confetti: a short burst of small pieces from a point on screen
   ========================================================================== */
function burst(x, y, { count = 30, spread = 200 } = {}) {
  if (!motionOn()) return;
  const layer = $('#fx');
  const colours = ['var(--accent)', 'var(--sky)', 'var(--success)', 'var(--on-tonal)', 'var(--primary)'];
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('i');
    piece.className = 'confetti';
    piece.style.background = colours[i % colours.length];
    piece.style.left = `${x}px`;
    piece.style.top = `${y}px`;
    if (i % 3 === 0) piece.style.borderRadius = '50%';
    layer.append(piece);

    const angle = Math.random() * Math.PI * 2;
    const power = spread * (0.4 + Math.random() * 0.6);
    const dx = Math.cos(angle) * power;
    const dy = Math.sin(angle) * power - 80;
    const spin = (Math.random() - 0.5) * 720;
    const flight = piece.animate([
      { transform: 'translate(0, 0) rotate(0deg) scale(1)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${spin / 2}deg) scale(1)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx * 1.15}px, ${dy + 260}px) rotate(${spin}deg) scale(0.6)`, opacity: 0 },
    ], { duration: 900 + Math.random() * 500, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
    flight.onfinish = () => piece.remove();
  }
}

const burstFrom = el => {
  const box = el.getBoundingClientRect();
  burst(box.left + box.width / 2, box.top + box.height / 2);
};

/* ==========================================================================
   The figure
   Two shared paths hold the outline (the strokes that stay, and the soft ones that fade); every <use> redraws when they change.
   `figure.shown` is how slim it looks right now, `figure.target` how slim it should be.
   ========================================================================== */
const figure = { shown: 0, target: 0, frame: 0 };

function drawFigure(progress) {
  figure.shown = progress;
  $('#fb-figure').setAttribute('d', figureShape.main(progress));
  const soft = $('#fb-figure-soft');
  soft.setAttribute('d', figureShape.soft(progress));
  soft.setAttribute('opacity', figureShape.softOpacity(progress).toFixed(2));
}

function tweenFigure(to, duration = 1200) {
  cancelAnimationFrame(figure.frame);
  const from = figure.shown;
  if (!motionOn() || duration === 0 || from === to) {
    drawFigure(to);
    return Promise.resolve();
  }
  const start = performance.now();
  return new Promise(resolve => {
    const step = now => {
      const progress = clamp((now - start) / duration, 0, 1);
      const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      drawFigure(from + (to - from) * eased);
      if (progress < 1) figure.frame = requestAnimationFrame(step);
      else resolve();
    };
    figure.frame = requestAnimationFrame(step);
  });
}

// Called after every repaint: if the weight changed, the figure slims (or fills out) to match its BMI.
function syncFigure() {
  const target = figureProgress();
  if (target === figure.target) return;
  figure.target = target;
  tweenFigure(target).then(() => {
    state.flags.figureShown = target;
    saveState();
  });
}

// The welcome screen shows the idea once: heavy, then lean, then back.
async function playWelcomeFigure() {
  await new Promise(resolve => setTimeout(resolve, 700));
  if (!$('.hero')) return;
  await tweenFigure(1, 1800);
  await new Promise(resolve => setTimeout(resolve, 900));
  if (!$('.hero')) return;
  await tweenFigure(figure.target, 1400);
}

const figureMark = (className = '') =>
  html`<svg class="figure ${className}" viewBox="150 10 840 840" role="img" aria-label="${t('figure.alt')}"><use href="#fb-figure"/><use href="#fb-figure-soft"/></svg>`;

const logo = (size, radius = size / 4) =>
  html`<span class="logo" style="width:${size}px;height:${size}px;border-radius:${radius}px">${figureMark()}</span>`;
