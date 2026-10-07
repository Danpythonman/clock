import './style.css';

const $ = (id) => document.getElementById(id);
const root = document.documentElement;

// ---------- Settings ----------

const STORAGE_KEY = 'clock-settings';
const DEFAULTS = {
  mode: 'both', // digital | analog | both
  theme: matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark',
  font: 'sans',
  h24: false,
  seconds: true,
  date: true,
};

function loadSettings() {
  const settings = { ...DEFAULTS };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    for (const key of Object.keys(DEFAULTS)) {
      if (typeof saved[key] === typeof DEFAULTS[key]) settings[key] = saved[key];
    }
  } catch {
    // Storage unavailable (private mode, blocked) – use defaults.
  }
  return settings;
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore – settings just won't persist.
  }
}

const settings = loadSettings();

function applySettings() {
  root.dataset.mode = settings.mode;
  root.dataset.theme = settings.theme;
  root.dataset.font = settings.font;
  root.classList.toggle('no-seconds', !settings.seconds);
  root.classList.toggle('no-date', !settings.date);

  for (const group of document.querySelectorAll('[data-setting]')) {
    for (const btn of group.querySelectorAll('button')) {
      btn.setAttribute('aria-pressed', btn.dataset.value === settings[group.dataset.setting]);
    }
  }
  for (const btn of document.querySelectorAll('[data-toggle]')) {
    btn.setAttribute('aria-pressed', settings[btn.dataset.toggle]);
  }

  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]').content = bg;

  render();
  fit();
}

$('controls').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const group = btn.closest('[data-setting]');
  if (group) settings[group.dataset.setting] = btn.dataset.value;
  else if (btn.dataset.toggle) settings[btn.dataset.toggle] = !settings[btn.dataset.toggle];
  else return;
  saveSettings();
  applySettings();
});

// ---------- Analog face ----------

const SVG_NS = 'http://www.w3.org/2000/svg';
const ticks = $('ticks');
for (let i = 0; i < 60; i++) {
  const major = i % 5 === 0;
  const line = document.createElementNS(SVG_NS, 'line');
  line.setAttribute('class', major ? 'tick major' : 'tick');
  line.setAttribute('x1', 100);
  line.setAttribute('x2', 100);
  line.setAttribute('y1', 4);
  line.setAttribute('y2', major ? 16 : 9);
  line.setAttribute('transform', `rotate(${i * 6} 100 100)`);
  ticks.append(line);
}

const hands = { hour: $('hour'), minute: $('minute'), second: $('second') };
const rotate = (el, deg) => el.setAttribute('transform', `rotate(${deg} 100 100)`);

// ---------- Rendering ----------

const el = { digital: $('digital'), time: $('time'), hm: $('hm'), sec: $('sec'), ampm: $('ampm'), date: $('date') };
const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const pad = (n) => String(n).padStart(2, '0');

let lastTimeLength = 0;

function render(now = new Date()) {
  const h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();

  const hour = settings.h24 ? pad(h) : String(h % 12 || 12);
  el.hm.textContent = `${hour}:${pad(m)}`;
  el.sec.textContent = settings.seconds ? `:${pad(s)}` : '';
  el.ampm.textContent = settings.h24 ? '' : h < 12 ? 'AM' : 'PM';
  el.date.textContent = settings.date ? dateFormat.format(now) : '';

  rotate(hands.hour, (h % 12) * 30 + m * 0.5 + s / 120);
  rotate(hands.minute, m * 6 + s * 0.1);
  rotate(hands.second, s * 6);

  // Width only changes when the character count does (e.g. 9:59 -> 10:00).
  const length = el.time.textContent.length;
  if (length !== lastTimeLength) {
    lastTimeLength = length;
    fit();
  }
}

// Scale the digital readout to fill its box without overflowing.
function fit() {
  if (settings.mode === 'analog') return;
  el.digital.style.fontSize = '100px';
  const width = el.time.getBoundingClientRect().width;
  const height = el.digital.getBoundingClientRect().height;
  const portrait = innerHeight > innerWidth;
  const maxHeight = innerHeight * (settings.mode === 'both' ? (portrait ? 0.3 : 0.5) : 0.6);
  const scale = Math.min(el.digital.clientWidth / width, maxHeight / height);
  el.digital.style.fontSize = `${Math.floor(100 * scale)}px`;
}

addEventListener('resize', fit);

// Tick on each second boundary so the display never lags.
function tick() {
  render();
  setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
}

// ---------- Fullscreen ----------

const fsButton = $('fullscreen');
const canFullscreen = !!(root.requestFullscreen || root.webkitRequestFullscreen);
const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;

function toggleFullscreen() {
  if (!canFullscreen) return;
  const result = fullscreenElement()
    ? (document.exitFullscreen || document.webkitExitFullscreen).call(document)
    : (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
  result?.catch?.(() => {});
}

function updateFullscreenButton() {
  fsButton.textContent = fullscreenElement() ? 'Exit fullscreen' : 'Fullscreen';
}

if (canFullscreen) {
  fsButton.addEventListener('click', toggleFullscreen);
  $('clock').addEventListener('dblclick', toggleFullscreen);
  document.addEventListener('fullscreenchange', updateFullscreenButton);
  document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
} else {
  fsButton.hidden = true; // e.g. iPhone Safari
}

// ---------- Keep the screen awake ----------

const wakeStatus = $('wake');
let wakeLock = null;
let requesting = false;

function updateWakeStatus() {
  const supported = 'wakeLock' in navigator;
  wakeStatus.classList.toggle('on', !!wakeLock);
  wakeStatus.textContent = wakeLock ? 'Screen on' : 'Screen may sleep';
  wakeStatus.title = wakeLock
    ? 'The screen will stay on while this page is visible.'
    : supported
      ? 'Tap anywhere to keep the screen on.'
      : 'Wake Lock is unavailable here (requires HTTPS and a supported browser).';
}

async function keepAwake() {
  if (!('wakeLock' in navigator) || wakeLock || requesting || document.visibilityState !== 'visible') return;
  requesting = true;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
      updateWakeStatus();
    });
  } catch {
    // Denied (no user gesture yet, battery saver, etc.) – retried on next interaction.
  } finally {
    requesting = false;
    updateWakeStatus();
  }
}

// The browser releases the lock whenever the page is hidden, so re-acquire it.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    render();
    keepAwake();
  }
});
addEventListener('pointerdown', keepAwake);
addEventListener('keydown', keepAwake);

// ---------- Auto-hide controls & cursor ----------

const controls = $('controls');
let idleTimer;

function showControls() {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (controls.matches(':hover') || controls.querySelector(':focus-visible')) showControls();
    else document.body.classList.add('idle');
  }, 3000);
}

addEventListener('pointermove', showControls);
addEventListener('pointerdown', showControls);
addEventListener('keydown', showControls);

// ---------- Keyboard shortcuts ----------

const MODES = ['digital', 'analog', 'both'];
addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  else if (e.key === 'm' || e.key === 'M') {
    settings.mode = MODES[(MODES.indexOf(settings.mode) + 1) % MODES.length];
    saveSettings();
    applySettings();
  }
});

// ---------- Start ----------

applySettings();
updateWakeStatus();
tick();
keepAwake();
showControls();
