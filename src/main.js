import './style.css';

const $ = (id) => document.getElementById(id);
const root = document.documentElement;

// ---------- Settings ----------

const STORAGE_KEY = 'clock-settings';
const DEFAULTS = {
  mode: 'both', // digital | analog | both
  theme: matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark',
  font: 'sans',
  show: 'both', // clock | timer | both (only applies while a timer is set)
  heading: '',
  clockTitle: '',
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
  root.dataset.show = timer ? settings.show : 'clock';
  $('heading').textContent = settings.heading;
  root.classList.toggle('has-heading', !!settings.heading);
  $('clock-title').textContent = settings.clockTitle;
  $('timer-title').textContent = timer?.title ?? '';
  $('show-group').hidden = !timer;
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
  fitAll();
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
for (const ticks of [$('ticks'), $('timer-ticks')]) {
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
}

const hands = { hour: $('hour'), minute: $('minute'), second: $('second') };
const rotate = (el, deg) => el.setAttribute('transform', `rotate(${deg} 100 100)`);

// ---------- Timer ----------

// { title, duration, start, paused }: times in ms. `start` is when the timer would have started had it never
// paused; `paused` is the frozen elapsed time while paused, otherwise null.
const TIMER_KEY = 'clock-timer';

function loadTimer() {
  try {
    const t = JSON.parse(localStorage.getItem(TIMER_KEY));
    if (t && t.duration > 0 && Number.isFinite(t.start)) {
      return {
        title: typeof t.title === 'string' ? t.title : '',
        duration: t.duration,
        start: t.start,
        paused: Number.isFinite(t.paused) ? t.paused : null,
      };
    }
  } catch {
    // Storage unavailable or corrupt – no timer.
  }
  return null;
}

function saveTimer() {
  try {
    if (timer) localStorage.setItem(TIMER_KEY, JSON.stringify(timer));
    else localStorage.removeItem(TIMER_KEY);
  } catch {
    // Ignore – the timer just won't survive a reload.
  }
}

let timer = loadTimer();
let timerWasDone = null; // null until the first render, so a reload doesn't re-chime

const timerElapsed = (now) => timer.paused ?? now - timer.start;
// Align the start to a whole second so the countdown ticks in step with the clock.
const wholeSecond = (ms) => Math.round(ms / 1000) * 1000;

function startTimer(title, duration, elapsed) {
  timer = { title, duration, start: wholeSecond(Date.now() - elapsed), paused: null };
  timerWasDone = false;
  if (settings.show === 'clock') settings.show = 'both';
  saveTimer();
  saveSettings();
  unlockAudio();
  applySettings();
}

function clearTimer() {
  timer = null;
  timerWasDone = null;
  root.classList.remove('timer-done', 'timer-paused');
  saveTimer();
  applySettings();
}

function togglePause() {
  if (!timer) return;
  const now = Date.now();
  if (timer.paused !== null) {
    timer.start = wholeSecond(now - timer.paused);
    timer.paused = null;
  } else if (timerElapsed(now) < timer.duration) {
    timer.paused = now - timer.start;
  }
  saveTimer();
  render();
}

// "25" = minutes, "1:30" = m:ss, "1:02:03" = h:mm:ss, "1h30m" / "90s" = units. Returns ms or NaN.
function parseDuration(text) {
  const s = text.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return 0;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s) * 60) * 1000;
  if (/^\d+(:\d{1,2}){1,2}$/.test(s)) {
    return s.split(':').reduce((total, part) => total * 60 + Number(part), 0) * 1000;
  }
  const units = s.match(/^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/);
  if (units && (units[1] || units[2] || units[3])) {
    const [h, m, sec] = units.slice(1).map((n) => parseFloat(n || 0));
    return Math.round(h * 3600 + m * 60 + sec) * 1000;
  }
  return NaN;
}

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// A short three-beep chime. Browsers only allow audio after a user gesture, so the context is
// created on interaction and reused when the timer finishes.
let audio;

function unlockAudio() {
  if (!timer) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch {
    // No Web Audio – the timer finishes silently.
  }
}

function chime() {
  if (!audio) return;
  for (let i = 0; i < 3; i++) {
    const t = audio.currentTime + i * 0.5;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  }
}

addEventListener('pointerdown', unlockAudio);
addEventListener('keydown', unlockAudio);

// ---------- Timer dialog ----------

const dialog = $('timer-dialog');
const form = $('timer-form');
const timerError = $('timer-error');

function openTimerDialog() {
  form.reset();
  if (timer) {
    form.elements.title.value = timer.title;
    form.elements.duration.value = formatDuration(timer.duration / 1000);
  }
  timerError.textContent = '';
  $('timer-clear').hidden = !timer;
  $('timer-pause').hidden = !timer || timerElapsed(Date.now()) >= timer.duration;
  $('timer-pause').textContent = timer?.paused != null ? 'Resume' : 'Pause';
  dialog.showModal();
  form.elements.duration.focus();
}

$('timer-button').addEventListener('click', openTimerDialog);
$('timer-cancel').addEventListener('click', () => dialog.close());
$('timer-clear').addEventListener('click', () => {
  clearTimer();
  dialog.close();
});
$('timer-pause').addEventListener('click', () => {
  togglePause();
  dialog.close();
});
$('timer-presets').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (btn) form.elements.duration.value = formatDuration(btn.dataset.minutes * 60);
});
// ---------- Title dialog ----------

const titleDialog = $('title-dialog');
const titleForm = $('title-form');

function openTitleDialog() {
  titleForm.elements.heading.value = settings.heading;
  titleForm.elements.clock.value = settings.clockTitle;
  titleForm.elements.timer.value = timer?.title ?? '';
  $('timer-title-field').hidden = !timer;
  titleDialog.showModal();
  titleForm.elements.heading.focus();
}

$('title-button').addEventListener('click', openTitleDialog);
$('title-cancel').addEventListener('click', () => titleDialog.close());
titleForm.addEventListener('submit', (e) => {
  e.preventDefault();
  settings.heading = titleForm.elements.heading.value.trim();
  settings.clockTitle = titleForm.elements.clock.value.trim();
  saveSettings();
  if (timer) {
    timer.title = titleForm.elements.timer.value.trim();
    saveTimer();
  }
  titleDialog.close();
  applySettings();
});

const anyDialogOpen = () => !!document.querySelector('dialog[open]');

for (const d of [dialog, titleDialog]) {
  // Closing returns focus to the opening button, where Space would reopen the dialog instead of pausing.
  d.addEventListener('close', () => document.activeElement?.blur());
  // Clicking the backdrop closes the dialog.
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  });
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const duration = parseDuration(form.elements.duration.value);
  const elapsed = parseDuration(form.elements.elapsed.value);
  if (!(duration > 0)) timerError.textContent = 'Enter a duration, e.g. 25 or 1:30:00.';
  else if (Number.isNaN(elapsed)) timerError.textContent = "Couldn't read the time already passed.";
  else if (elapsed >= duration) timerError.textContent = 'Time already passed must be less than the duration.';
  else {
    startTimer(form.elements.title.value.trim(), duration, elapsed);
    dialog.close();
  }
});

// ---------- Rendering ----------

const el = { hm: $('hm'), sec: $('sec'), ampm: $('ampm'), date: $('date') };
const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const endFormats = {
  h12: new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', hour12: true }),
  h24: new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }),
};
const pad = (n) => String(n).padStart(2, '0');

function renderClock(now) {
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
}

const timerEl = { time: $('timer-time'), label: $('timer-label'), fill: $('timer-fill'), full: $('timer-full'), hand: $('timer-hand') };

function renderTimer(now) {
  if (!timer) return;
  const elapsed = timerElapsed(now.getTime());
  const remaining = Math.max(0, timer.duration - elapsed);
  const done = remaining === 0;
  const paused = timer.paused !== null;

  timerEl.time.textContent = formatDuration(Math.ceil(remaining / 1000));
  timerEl.label.textContent = done
    ? 'Done'
    : paused
      ? 'Paused'
      : `Ends ${endFormats[settings.h24 ? 'h24' : 'h12'].format(timer.start + timer.duration)}`;
  root.classList.toggle('timer-done', done);
  root.classList.toggle('timer-paused', paused && !done);

  // Pie slice from 12 o'clock, clockwise, filling as time passes.
  const progress = Math.min(1, Math.max(0, elapsed / timer.duration));
  const angle = progress * 360;
  const rad = (angle * Math.PI) / 180;
  const x = 100 + 80 * Math.sin(rad);
  const y = 100 - 80 * Math.cos(rad);
  timerEl.fill.setAttribute('d', progress > 0 && !done ? `M100 100 L100 20 A80 80 0 ${angle > 180 ? 1 : 0} 1 ${x} ${y} Z` : '');
  timerEl.full.style.display = done ? '' : 'none';
  rotate(timerEl.hand, angle);

  if (done && timerWasDone === false) chime();
  timerWasDone = done;
}

// Each digital readout is scaled to fill its box without overflowing.
const readouts = [
  { digital: $('digital'), time: $('time'), length: 0 },
  { digital: $('timer-digital'), time: $('timer-time'), length: 0 },
];

function render(now = new Date()) {
  renderClock(now);
  renderTimer(now);

  // Width only changes when the character count does (e.g. 9:59 -> 10:00).
  for (const readout of readouts) {
    const length = readout.time.textContent.length;
    if (length !== readout.length) {
      readout.length = length;
      fit(readout);
    }
  }
}

// Share of the screen height a readout may use, depending on what else is showing.
// --room shrinks everything to leave space for the page heading.
function heightFraction() {
  const portrait = innerHeight > innerWidth;
  const room = parseFloat(getComputedStyle(root).getPropertyValue('--room')) || 1;
  if (root.dataset.show === 'both') {
    if (settings.mode === 'both') return 0.2 * room;
    return (portrait ? 0.3 : 0.4) * room;
  }
  if (settings.mode === 'both') return (portrait ? 0.3 : 0.5) * room;
  return 0.6 * room;
}

function fit({ digital, time }) {
  if (!digital.getClientRects().length) return; // hidden
  digital.style.fontSize = '100px';
  const width = time.getBoundingClientRect().width;
  const height = digital.getBoundingClientRect().height;
  const scale = Math.min(digital.clientWidth / width, (innerHeight * heightFraction()) / height);
  digital.style.fontSize = `${Math.floor(100 * scale)}px`;
}

const fitAll = () => readouts.forEach(fit);

addEventListener('resize', fitAll);
// The 7-segment font loads on first use; re-measure once it arrives.
document.fonts?.addEventListener('loadingdone', fitAll);

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
    if (anyDialogOpen() || controls.matches(':hover') || controls.querySelector(':focus-visible')) showControls();
    else document.body.classList.add('idle');
  }, 3000);
}

addEventListener('pointermove', showControls);
addEventListener('pointerdown', showControls);
addEventListener('keydown', showControls);

// ---------- Keyboard shortcuts ----------

const MODES = ['digital', 'analog', 'both'];
addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || anyDialogOpen()) return;
  if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  else if (e.key === 't' || e.key === 'T') {
    e.preventDefault(); // don't type the "t" into the dialog's input
    openTimerDialog();
  } else if (e.key === ' ' && timer && e.target === document.body) {
    e.preventDefault();
    togglePause();
  } else if (e.key === 'm' || e.key === 'M') {
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
