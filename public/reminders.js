/* Task reminders (web). Phase 1: on-device local notifications via the Web
 * Notifications API + a thin service worker. Fires while the browser is running
 * (even backgrounded); not when fully quit — that needs web-push (Phase 2).
 *
 * Pure fire-time logic (computeFireAt/reminderKey/shouldFire) is shared with iOS
 * (ios-app/src/notifications/reminders.ts). Loaded as a classic <script> before
 * app.js, and importable in Node for tests (UMD guard; no browser APIs touched
 * at load time — globalThis.Reminders is set either way). */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // tests
  root.Reminders = api;                                                       // browser + tests
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // (due_date − lead_days) at reminder_time, in local time. Returns a Date.
  function computeFireAt(due_date, reminder_time, lead_days) {
    const [y, m, d] = String(due_date).split('-').map(Number);
    const [hh, mm] = String(reminder_time).split(':').map(Number);
    return new Date(y, m - 1, d - (lead_days || 0), hh, mm, 0, 0);
  }

  // Stable identity for a single reminder occurrence (task + due date + moment).
  function reminderKey(task, fireAt) {
    return task.id + ':' + task.due_date + ':' + fireAt.getTime();
  }

  // Due now (fireAt has passed) and not already handled this device.
  function shouldFire(fireAt, now, firedSet, key) {
    return fireAt.getTime() <= now && !firedSet.has(key);
  }

  // ── browser runtime (everything below only touches browser APIs when called) ──
  const FIRED_KEY = 'taskly.reminders.fired';
  const TICK_MS = 30000;
  let deps = {};        // { getPrefs(), fetchAgenda() }
  let fired = new Set();
  let seeded = false;   // first real pass seeds already-past reminders silently
  let started = false;
  let swReg = null;

  function loadFired() {
    try { fired = new Set(JSON.parse(localStorage.getItem(FIRED_KEY) || '[]')); }
    catch { fired = new Set(); }
  }
  function saveFired() {
    try { localStorage.setItem(FIRED_KEY, JSON.stringify([...fired].slice(-200))); } catch {}
  }

  // Ask for OS permission + register the service worker. Returns granted boolean.
  async function enable() {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    let perm = Notification.permission;
    if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch { return false; } }
    if (perm !== 'granted') return false;
    if ('serviceWorker' in navigator) {
      try { swReg = await navigator.serviceWorker.register('/sw.js'); } catch { swReg = null; }
    }
    return true;
  }

  function notify(t) {
    const title = 'Task due';
    const body = t.board_name ? (t.text + ' · ' + t.board_name) : t.text;
    const opts = { body, tag: 'task-' + t.id, data: { taskId: t.id } };
    try {
      if (swReg && swReg.showNotification) swReg.showNotification(title, opts);
      else if ('Notification' in window) new Notification(title, opts);
    } catch {}
  }

  async function check() {
    const prefs = deps.getPrefs && deps.getPrefs();
    if (!prefs || !prefs.reminders_enabled) return;
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;
    let agenda;
    try { agenda = await deps.fetchAgenda(); } catch { return; }
    if (!Array.isArray(agenda)) return;
    const now = Date.now();
    for (const t of agenda) {
      const fireAt = computeFireAt(t.due_date, prefs.reminder_time, prefs.reminder_lead_days);
      const key = reminderKey(t, fireAt);
      if (shouldFire(fireAt, now, fired, key)) {
        fired.add(key); saveFired();
        if (seeded) notify(t); // first pass: silently seed past reminders (no late spam)
      }
    }
    seeded = true;
  }

  // Wire dependencies + start the polling loop (idempotent).
  function start(opts) {
    deps = opts || {};
    if (started) { check(); return; }
    started = true;
    loadFired();
    if ('serviceWorker' in navigator && Notification && Notification.permission === 'granted') {
      navigator.serviceWorker.register('/sw.js').then(r => { swReg = r; }).catch(() => {});
    }
    check();
    setInterval(check, TICK_MS);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  }

  // Re-check now (after a settings save or task mutation).
  function refresh() { check(); }

  return { computeFireAt, reminderKey, shouldFire, enable, start, refresh };
});
