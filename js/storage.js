// The storage ring in the top-right corner: how much room your pages take in
// this browser, whether the browser has promised to keep them, and when you
// last exported a backup.
//
// The ring fills against a 50 MB budget rather than the browser's own limit,
// which is often many gigabytes and would leave the ring empty forever. The
// budget is a soft line: nothing stops saving past it, the ring just turns red.
//
// Pages and images live in IndexedDB (see db.js). localStorage would be simpler,
// but it holds about 5 MB of text per site, so a few pasted images would fill it.

import { db } from './db.js';

const RADIUS = 6;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const MIN_ARC = 0.04; // always show a sliver, so the ring reads as a meter
const BUDGET = 50 * 1024 * 1024;
const WARN_AT = 0.8;
const BACKUP_KEY = 'sketchbook:last-backup';
const DAY = 24 * 60 * 60 * 1000;
const REMIND_AFTER_DAYS = 7;

const $ = (sel) => document.querySelector(sel);

export function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '?';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = -1;
  do { v /= 1024; i++; } while (v >= 1024 && i < units.length - 1);
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

// What the sketchbook itself stores: page records plus image files.
async function measureSketchbook() {
  const [pages, blobs] = await Promise.all([db.getAll('pages'), db.getAll('blobs')]);
  const pageBytes = pages.reduce((sum, p) => sum + new Blob([JSON.stringify(p)]).size, 0);
  const imageBytes = blobs.reduce((sum, b) => sum + (b.blob?.size ?? 0), 0);
  // When you started having something worth backing up: the oldest page with content.
  const firstContentAt = pages
    .filter((p) => p.title || p.items?.length)
    .reduce((min, p) => Math.min(min, p.createdAt ?? Infinity), Infinity);
  return {
    pageCount: pages.length, imageCount: blobs.length, pageBytes, imageBytes,
    firstContentAt: Number.isFinite(firstContentAt) ? firstContentAt : null,
  };
}

function lastBackupAt() {
  try {
    const v = Number(localStorage.getItem(BACKUP_KEY));
    return v > 0 ? v : null;
  } catch { return null; }
}

// Called after a backup file is downloaded.
export function noteBackup(at = Date.now()) {
  try { localStorage.setItem(BACKUP_KEY, String(at)); } catch { /* private mode */ }
  if (last) {
    last = { ...last, ...backupState(last) };
    render();
  }
}

function backupState(info) {
  const lastBackup = lastBackupAt();
  const since = lastBackup ?? info.firstContentAt;
  const backupDue = since != null && Date.now() - since >= REMIND_AFTER_DAYS * DAY;
  return { lastBackup, backupDue };
}

function daysAgo(t) {
  const d = Math.floor((Date.now() - t) / DAY);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

// Everything the browser counts for this site, and how much it allows.
async function browserEstimate() {
  const storage = navigator.storage;
  const [estimate, persisted] = await Promise.all([
    storage?.estimate?.().catch(() => null) ?? null,
    storage?.persisted?.().catch(() => false) ?? false,
  ]);
  return { usage: estimate?.usage ?? null, quota: estimate?.quota ?? null, persisted: !!persisted };
}

let last = null;
let pending = null;
let timer = null;

export async function refreshStorage() {
  if (pending) return pending;
  pending = (async () => {
    try {
      const [mine, browser] = await Promise.all([measureSketchbook(), browserEstimate()]);
      last = { ...mine, ...browser, total: mine.pageBytes + mine.imageBytes, budget: BUDGET };
      Object.assign(last, backupState(last));
      render();
    } catch (err) {
      console.error(err);
    } finally {
      pending = null;
    }
    return last;
  })();
  return pending;
}

// Re-measure a little after things settle, not on every keystroke.
export function scheduleStorageRefresh(delay = 1200) {
  clearTimeout(timer);
  timer = setTimeout(refreshStorage, delay);
}

export function storageInfo() {
  return last && { ...last };
}

// Ask the browser to keep the pages, once per visit, after the first save.
// Chrome answers silently; it says yes for sites you use a lot or bookmark.
let askedToKeep = false;
export function afterSave() {
  scheduleStorageRefresh();
  if (askedToKeep || !navigator.storage?.persist) return;
  askedToKeep = true;
  navigator.storage.persisted()
    .then((kept) => kept || navigator.storage.persist())
    .then(() => scheduleStorageRefresh())
    .catch(() => {});
}

// How full the budget is. A browser with a smaller limit than the budget wins.
function fraction() {
  if (!last) return 0;
  const room = last.quota ? Math.min(BUDGET, last.quota) : BUDGET;
  return last.total / room;
}

function quotaFraction() {
  return last?.quota ? Math.min(1, Math.max(last.usage ?? 0, last.total) / last.quota) : 0;
}

function percent(f) {
  if (f > 0 && f < 0.0001) return 'under 0.01%';
  return `${(f * 100).toFixed(f < 0.01 ? 2 : 1)}%`;
}

function render() {
  if (!last) return;
  const f = fraction();
  const arc = $('#storage-ring .ring-fill');
  const shown = Math.min(1, Math.max(MIN_ARC, f));
  arc.style.strokeDasharray = `${(shown * CIRCUMFERENCE).toFixed(2)} ${CIRCUMFERENCE.toFixed(2)}`;
  const btn = $('#storage-ring');
  btn.classList.toggle('warn', f >= WARN_AT);
  btn.classList.toggle('remind', last.backupDue);
  const summary = `${formatBytes(last.total)} of ${formatBytes(BUDGET)}${last.backupDue ? ', backup due' : ''}`;
  btn.title = `Storage: ${summary}`;
  btn.setAttribute('aria-label', `Storage, ${summary}`);

  $('#storage-used').textContent = `${formatBytes(last.total)} / ${formatBytes(BUDGET)}`;
  $('#storage-bar span').style.width = `${(Math.min(1, Math.max(f, 0.005)) * 100).toFixed(2)}%`;
  $('#storage-breakdown').textContent =
    `${last.pageCount} page${last.pageCount === 1 ? '' : 's'} ${formatBytes(last.pageBytes)}` +
    ` · ${last.imageCount} image${last.imageCount === 1 ? '' : 's'} ${formatBytes(last.imageBytes)}`;
  const over = $('#storage-over');
  over.hidden = f < 1;
  over.textContent = 'Over the 50 MB budget. Nothing is lost and saving still works; export a backup and clear out big images to stay light.';
  $('#storage-quota').textContent = last.quota
    ? `The browser allows up to ${formatBytes(last.quota)} for this site (${percent(quotaFraction())} used).`
    : 'This browser does not say how much room it allows.';

  const backup = $('#storage-backup');
  backup.textContent = last.lastBackup
    ? `Last backup ${daysAgo(last.lastBackup)}.`
    : 'No backup exported yet.';
  if (last.backupDue) backup.textContent += ' Export one to keep a copy outside this browser.';
  backup.classList.toggle('due', last.backupDue);

  const safe = $('#storage-safe');
  safe.textContent = last.persisted
    ? 'Kept: the browser will not clear these pages on its own.'
    : 'Not kept yet: the browser may clear these pages if the disk runs low.';
  safe.classList.toggle('ok', last.persisted);
  $('#storage-persist').hidden = last.persisted || !navigator.storage?.persist;
}

function toggle(open) {
  const pop = $('#storage-pop');
  const show = open ?? pop.hidden;
  pop.hidden = !show;
  $('#storage-ring').setAttribute('aria-expanded', String(show));
  if (show) refreshStorage();
}

export function initStorageMeter({ onExport, toast }) {
  $('#storage-ring').addEventListener('click', (e) => {
    e.stopPropagation();
    toggle();
  });
  $('#storage-pop').addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => toggle(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggle(false); });

  $('#storage-export').addEventListener('click', () => onExport());
  $('#storage-persist').addEventListener('click', async () => {
    const granted = await navigator.storage.persist().catch(() => false);
    await refreshStorage();
    toast(granted
      ? 'Done: the browser will keep your pages.'
      : 'The browser said no for now. Bookmarking the site or installing it usually helps. Export keeps a copy either way.');
  });

  refreshStorage();
}
