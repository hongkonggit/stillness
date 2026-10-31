'use strict';

/* ---------- Storage ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const K = { settings: 'stillness.settings', sessions: 'stillness.sessions', run: 'stillness.run' };

const DEFAULTS = {
  duration: 20, interval: 0, strikes: 3, prep: 10, bell: 'bowl',
  mix: true, wake: true, health: false, shortcut: 'Log Mindful Minutes', playlist: '',
};
let settings = Object.assign({}, DEFAULTS, store.get(K.settings, {}));
let sessions = store.get(K.sessions, []);
const saveSettings = () => store.set(K.settings, settings);
const saveSessions = () => store.set(K.sessions, sessions);

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

/* ---------- Bells (synthesised, so they work offline) ----------
   Each partial: [frequency ratio, amplitude, decay seconds]. A slightly
   detuned twin of each partial gives the natural "beating" shimmer. */
const BELLS = {
  bowl:    { name: 'Singing Bowl', f: 196, gain: .32, beat: .7, gap: 5,
             partials: [[1, 1, 11], [2.76, .42, 7], [5.40, .18, 4.5], [8.93, .07, 2.6]], mallet: .05 },
  temple:  { name: 'Temple Bell',  f: 98,  gain: .30, beat: .35, gap: 7,
             partials: [[.5, .45, 14], [1, 1, 10], [1.19, .55, 6], [1.5, .3, 5], [2, .5, 4], [2.52, .22, 3], [3.01, .12, 2.2]], mallet: .1 },
  rin:     { name: 'Rin Gong',     f: 587, gain: .26, beat: 1.4, gap: 4.5,
             partials: [[1, 1, 8], [2.83, .35, 4.5], [5.42, .14, 2.6], [8.9, .05, 1.4]], mallet: .04 },
  tingsha: { name: 'Tingsha',      f: 2093, gain: .17, beat: 4, gap: 3.5,
             partials: [[1, 1, 4.5], [1.006, .8, 4.2], [2.41, .22, 2], [3.93, .08, 1]], mallet: .02 },
};

let ctx = null, master = null;

function setAudioSession() {
  // Safari 16.4+: 'ambient' mixes with Apple Music instead of pausing it.
  if (navigator.audioSession) {
    try { navigator.audioSession.type = settings.mix ? 'ambient' : 'playback'; } catch {}
  }
}
function ensureAudio() {
  if (!ctx) {
    setAudioSession();
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = .9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  return ctx;
}
// iOS only lets audio start from a touch; resume on any touch just in case.
['touchend', 'click'].forEach(ev => document.addEventListener(ev, () => { if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); }, { passive: true }));

function strike(type, t, soft = false) {
  const b = BELLS[type] || BELLS.bowl;
  const out = ctx.createGain();
  out.gain.value = b.gain * (soft ? .55 : 1);
  out.connect(master);
  for (const [r, a, d] of b.partials) {
    for (let k = 0; k < 2; k++) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = b.f * r + (k ? b.beat * Math.sqrt(r) : 0);
      const g = ctx.createGain();
      const amp = a * (k ? .5 : 1);
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + .006);
      g.gain.exponentialRampToValueAtTime(.0001, t + d);
      o.connect(g); g.connect(out);
      o.start(t); o.stop(t + d + .05);
    }
  }
  // Mallet contact: a tiny filtered noise burst
  const len = Math.floor(ctx.sampleRate * .04);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const n = ctx.createBufferSource(); n.buffer = buf;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = Math.min(b.f * 6, 9000); bp.Q.value = 1.2;
  const ng = ctx.createGain(); ng.gain.value = b.mallet * (soft ? .5 : 1);
  n.connect(bp); bp.connect(ng); ng.connect(out); n.start(t);
}
function ringBells(count, soft = false, type = settings.bell) {
  if (!ensureAudio()) return;
  const gap = (BELLS[type] || BELLS.bowl).gap;
  const t0 = ctx.currentTime + .06;
  for (let i = 0; i < count; i++) strike(type, t0 + i * gap, soft);
}

/* ---------- Options & bindings ---------- */
const OPTIONS = {
  duration: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 75, 90, 120].map(m => [m, `${m} min`]),
  interval: [[0, 'Off'], ...[1, 2, 3, 5, 10, 15, 20, 30].map(m => [m, `Every ${m} min`])],
  strikes: [[1, '1 strike'], [2, '2 strikes'], [3, '3 strikes']],
  prep: [[0, 'None'], [5, '5 sec'], [10, '10 sec'], [15, '15 sec'], [30, '30 sec']],
  bell: Object.entries(BELLS).map(([k, b]) => [k, b.name]),
};
const labelFor = key => (OPTIONS[key].find(([v]) => String(v) === String(settings[key])) || [, ''])[1];

function initControls() {
  for (const sel of $$('select[data-key]')) {
    const key = sel.dataset.key;
    sel.innerHTML = OPTIONS[key].map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    sel.value = settings[key];
    sel.addEventListener('change', () => {
      settings[key] = typeof DEFAULTS[key] === 'number' ? Number(sel.value) : sel.value;
      saveSettings(); refresh();
      if (key === 'bell') ringBells(1);
    });
  }
  for (const sw of $$('input[data-toggle]')) {
    const key = sw.dataset.toggle;
    sw.checked = !!settings[key];
    sw.addEventListener('change', () => {
      settings[key] = sw.checked; saveSettings();
      if (key === 'mix') setAudioSession();
      refresh();
    });
  }
  const pl = $('#playlistInput'), sc = $('#shortcutInput');
  pl.value = settings.playlist; sc.value = settings.shortcut;
  pl.addEventListener('change', () => { settings.playlist = pl.value.trim(); saveSettings(); refresh(); });
  sc.addEventListener('change', () => { settings.shortcut = sc.value.trim() || DEFAULTS.shortcut; sc.value = settings.shortcut; saveSettings(); refresh(); });
  for (const el of [pl, sc]) el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); });
}

function refresh() {
  $('#durNum').textContent = settings.duration;
  for (const el of $$('[data-show]')) el.textContent = labelFor(el.dataset.show);
  for (const sel of $$('select[data-key]')) sel.value = settings[sel.dataset.key];
  $('#musicVal').textContent = settings.playlist ? 'My Playlist' : 'Open';
  $('#helpName').textContent = settings.shortcut;
}

/* ---------- Tabs ---------- */
function showTab(name) {
  for (const t of $$('.tab')) t.classList.toggle('active', t.dataset.tab === name);
  for (const v of $$('.view')) v.classList.toggle('active', v.id === `view-${name}`);
  if (name === 'journal') renderJournal();
  window.scrollTo(0, 0);
}
$$('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));

/* ---------- Apple Music ---------- */
$('#musicBtn').addEventListener('click', () => {
  ensureAudio(); // unlock audio while we have a touch
  const link = settings.playlist;
  // music:// opens the Music app directly instead of a Safari page.
  location.href = /^https?:\/\/(geo\.)?music\.apple\.com\//i.test(link) ? link.replace(/^https?:/i, 'music:') : 'music://';
});

/* ---------- Wake lock ---------- */
let wake = null;
async function requestWake() {
  if (!settings.wake || !('wakeLock' in navigator) || wake) return;
  try { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } catch {}
}
function releaseWake() { try { wake && wake.release(); } catch {} wake = null; }

/* ---------- Timer ---------- */
let run = null, loop = null;
const persistRun = () => store.set(K.run, run);

function elapsed(at = Date.now()) {
  if (!run || at < run.medStart) return 0;
  const ref = run.pausedAt || at;
  return Math.max(0, (ref - run.medStart - run.pausedTotal) / 1000);
}

function begin() {
  ensureAudio();
  const t = Date.now();
  run = {
    id: t.toString(36),
    medStart: t + settings.prep * 1000,
    planned: settings.duration * 60,
    interval: settings.interval * 60,
    strikes: settings.strikes,
    bell: settings.bell,
    pausedAt: null, pausedTotal: 0,
    startRung: false, lastInterval: 0,
  };
  persistRun();
  openSession();
  tick();
}

function openSession() {
  $('#session').hidden = false;
  document.body.style.overflow = 'hidden';
  requestWake();
  clearInterval(loop);
  loop = setInterval(tick, 250);
}
function closeSession() {
  clearInterval(loop); loop = null;
  $('#session').hidden = true;
  document.body.style.overflow = '';
  releaseWake();
}

function tick() {
  if (!run) return;
  const now = Date.now();
  if (!run.startRung) {
    if (now < run.medStart) return renderSession(now);
    run.startRung = true; persistRun();
    if (now - run.medStart < 5000) ringBells(run.strikes, false, run.bell);
  }
  const e = elapsed(now);
  if (e >= run.planned) return finish(true);
  if (run.interval && !run.pausedAt) {
    const idx = Math.floor(e / run.interval);
    if (idx > run.lastInterval) {
      run.lastInterval = idx; persistRun();
      // Skip bells missed while the phone was locked, and any that collide with the closing bells.
      if (e - idx * run.interval < 5 && run.planned - e > 4) ringBells(1, true, run.bell);
    }
  }
  renderSession(now);
}

const fmtClock = s => {
  s = Math.max(0, Math.ceil(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
};
const fmtTime = ts => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const BELL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2z"/></svg>';
const CIRC = 2 * Math.PI * 138;

function renderSession(now = Date.now()) {
  const ring = $('#ringProgress'), time = $('#sessTime'), sub = $('#sessSub'), pause = $('#pauseBtn');
  const sess = $('#session');
  if (!run.startRung) {
    const left = (run.medStart - now) / 1000, total = settings.prep || 1;
    time.textContent = Math.ceil(left);
    sub.textContent = 'Settle in';
    ring.style.strokeDashoffset = CIRC * (1 - Math.min(1, left / total));
    pause.disabled = true;
    sess.classList.remove('paused');
    return;
  }
  pause.disabled = false;
  const e = elapsed(now), remaining = run.planned - e;
  time.textContent = fmtClock(remaining);
  ring.style.strokeDashoffset = CIRC * (e / run.planned);
  if (run.pausedAt) {
    sub.textContent = 'Paused';
    pause.textContent = 'Resume';
    sess.classList.add('paused');
  } else {
    sub.innerHTML = `${BELL_ICON}<span>${fmtTime(now + remaining * 1000)}</span>`;
    pause.textContent = 'Pause';
    sess.classList.remove('paused');
  }
}

$('#beginBtn').addEventListener('click', begin);
$('#pauseBtn').addEventListener('click', () => {
  if (!run || !run.startRung) return;
  if (run.pausedAt) { run.pausedTotal += Date.now() - run.pausedAt; run.pausedAt = null; requestWake(); }
  else { run.pausedAt = Date.now(); }
  persistRun(); renderSession();
});
$('#endBtn').addEventListener('click', () => {
  if (!run) return;
  if (!run.startRung || elapsed() < 60) {
    return sheet('', [{ label: 'End Session', style: 'destructive', fn: () => finish(false, { save: false }) }]);
  }
  sheet('End this session early?', [
    { label: 'End & Save', fn: () => finish(false) },
    { label: 'Discard Session', style: 'destructive', fn: () => finish(false, { save: false }) },
  ]);
});

function finish(completed, { save = true, silent = false } = {}) {
  const e = completed ? run.planned : elapsed();
  const end = completed ? run.medStart + run.pausedTotal + run.planned * 1000 : (run.pausedAt || Date.now());
  if (completed && !silent) ringBells(run.strikes, false, run.bell);
  let entry = null;
  if (save && e >= 60) {
    entry = { id: run.id, start: run.medStart, end, planned: run.planned, actual: Math.round(e), completed, health: false, note: '' };
    sessions.unshift(entry);
    sessions.sort((a, b) => b.start - a.start);
    saveSessions();
  }
  run = null; store.del(K.run);
  closeSession();
  if (entry) showComplete(entry);
  renderJournal();
}

// Restore a session if iOS closed the app while it was running.
function recover() {
  const saved = store.get(K.run, null);
  if (!saved) return;
  run = saved;
  if (elapsed() >= run.planned) return finish(true, { silent: true });
  openSession(); tick();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && run) {
    requestWake();
    if (ctx) ctx.resume().catch(() => {});
    tick();
  }
});

/* ---------- Completion ---------- */
let current = null;
const fmtMins = s => {
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`;
};

function showComplete(entry) {
  current = entry;
  $('#doneTitle').textContent = entry.completed ? 'Session Complete' : 'Session Saved';
  $('#doneSub').textContent = `${fmtMins(entry.actual)} · ${fmtTime(entry.start)} – ${fmtTime(entry.end)}`;
  $('#noteInput').value = '';
  const hb = $('#doneHealthBtn');
  hb.hidden = !settings.health;
  hb.classList.remove('done');
  hb.lastChild.textContent = ' Save to Apple Health';
  $('#complete').hidden = false;
}
$('#doneBtn').addEventListener('click', () => {
  if (current) {
    const s = sessions.find(x => x.id === current.id);
    if (s) { s.note = $('#noteInput').value.trim(); saveSessions(); }
  }
  current = null;
  $('#complete').hidden = true;
  renderJournal();
});
$('#doneHealthBtn').addEventListener('click', () => {
  if (!current) return;
  const s = sessions.find(x => x.id === current.id);
  if (s) { s.note = $('#noteInput').value.trim(); }
  logToHealth(s || current);
  const hb = $('#doneHealthBtn');
  hb.classList.add('done');
  hb.lastChild.textContent = ' Sent to Apple Health';
});

/* ---------- Apple Health via Shortcuts ---------- */
function logToHealth(entry) {
  const mins = Math.max(1, Math.round(entry.actual / 60));
  entry.health = true; saveSessions(); renderJournal();
  location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(settings.shortcut)}&input=text&text=${mins}`;
}

/* ---------- Journal ---------- */
const dayKey = ts => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
function dayLabel(ts) {
  const d = new Date(ts), today = new Date(), y = new Date(); y.setDate(today.getDate() - 1);
  if (dayKey(d) === dayKey(today)) return 'Today';
  if (dayKey(d) === dayKey(y)) return 'Yesterday';
  const opts = { weekday: 'long', month: 'short', day: 'numeric' };
  if (d.getFullYear() !== today.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString([], opts);
}
const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const HEART = '<svg class="badge-health" viewBox="0 0 24 24" aria-label="Saved to Health"><path fill="currentColor" d="M12 21s-7.5-4.6-9.6-9.3C.9 8.2 3 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.1 1.8-1.9 3.3-3.1 5.4-3.1 3.6 0 5.7 3.7 4.2 7.2C19.5 16.4 12 21 12 21z"/></svg>';

function streak() {
  const days = new Set(sessions.map(s => dayKey(s.start)));
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function renderJournal() {
  const weekAgo = new Date(); weekAgo.setHours(0, 0, 0, 0); weekAgo.setDate(weekAgo.getDate() - 6);
  const week = sessions.filter(s => s.start >= weekAgo.getTime()).reduce((a, s) => a + s.actual, 0);
  const total = sessions.reduce((a, s) => a + s.actual, 0) / 60;
  const st = streak();
  $('#stWeek').textContent = Math.round(week / 60);
  $('#stStreak').textContent = st;
  $('#stStreakUnit').textContent = st === 1 ? 'day' : 'days';
  if (total >= 120) { $('#stTotal').textContent = (total / 60).toFixed(total >= 600 ? 0 : 1); $('#stTotalUnit').textContent = 'hours'; }
  else { $('#stTotal').textContent = Math.round(total); $('#stTotalUnit').textContent = 'min'; }

  const list = $('#journalList');
  if (!sessions.length) {
    list.innerHTML = '<div class="empty"><b>No Sessions Yet</b>Your meditations will appear here.</div>';
    return;
  }
  let html = '', last = null;
  for (const s of sessions) {
    const k = dayKey(s.start);
    if (k !== last) {
      if (last) html += '</div>';
      html += `<h2 class="group-header">${esc(dayLabel(s.start))}</h2><div class="group">`;
      last = k;
    }
    html += `<button class="row entry" type="button" data-id="${s.id}">
      <span class="row-label"><span class="entry-time">${fmtTime(s.start)}</span>${s.note ? `<span class="entry-note">${esc(s.note)}</span>` : ''}</span>
      <span class="entry-badges">${s.completed ? '' : '<span class="badge-partial">Ended early</span>'}${s.health ? HEART : ''}</span>
      <span class="entry-dur">${fmtMins(s.actual)}</span>
    </button>`;
  }
  list.innerHTML = html + '</div>';
}
$('#journalList').addEventListener('click', e => {
  const row = e.target.closest('.entry'); if (!row) return;
  const s = sessions.find(x => x.id === row.dataset.id); if (!s) return;
  const actions = [];
  if (settings.health && !s.health) actions.push({ label: 'Save to Apple Health', fn: () => logToHealth(s) });
  actions.push({ label: 'Edit Note', fn: () => {
    const n = prompt('Note', s.note || '');
    if (n !== null) { s.note = n.trim(); saveSessions(); renderJournal(); }
  } });
  actions.push({ label: 'Delete Session', style: 'destructive', fn: () => {
    sessions = sessions.filter(x => x.id !== s.id); saveSessions(); renderJournal();
  } });
  sheet(`${dayLabel(s.start)}, ${fmtTime(s.start)} · ${fmtMins(s.actual)}`, actions);
});

/* ---------- Action sheet ---------- */
function sheet(title, actions) {
  $('#sheetTitle').textContent = title;
  const box = $('#sheetActions');
  box.innerHTML = '';
  for (const a of actions) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = `sheet-action ${a.style || ''}`; b.textContent = a.label;
    b.addEventListener('click', () => { closeSheet(); a.fn(); });
    box.appendChild(b);
  }
  $('#sheet').hidden = false;
}
const closeSheet = () => { $('#sheet').hidden = true; };
$('#sheetCancel').addEventListener('click', closeSheet);
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });

/* ---------- Settings actions ---------- */
$('#previewBtn').addEventListener('click', () => ringBells(1));
$('#healthHelpBtn').addEventListener('click', () => { $('#healthHelp').hidden = false; });
$('#helpDoneBtn').addEventListener('click', () => { $('#healthHelp').hidden = true; });

$('#exportBtn').addEventListener('click', async () => {
  const rows = [['Date', 'Start', 'End', 'Minutes', 'Planned Minutes', 'Completed', 'Saved to Health', 'Note']];
  for (const s of [...sessions].reverse()) {
    const d = new Date(s.start);
    rows.push([d.toLocaleDateString('en-CA'), fmtTime(s.start), fmtTime(s.end), (s.actual / 60).toFixed(1),
      Math.round(s.planned / 60), s.completed ? 'Yes' : 'No', s.health ? 'Yes' : 'No', s.note || '']);
  }
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const file = new File([csv], 'stillness-journal.csv', { type: 'text/csv' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Stillness Journal' }); } catch {}
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
});
$('#clearBtn').addEventListener('click', () => {
  if (!sessions.length) return;
  sheet(`This removes all ${sessions.length} sessions from this iPhone. Apple Health data is not affected.`, [
    { label: 'Delete All Sessions', style: 'destructive', fn: () => { sessions = []; saveSessions(); renderJournal(); } },
  ]);
});

/* ---------- Boot ---------- */
initControls();
refresh();
renderJournal();
recover();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
