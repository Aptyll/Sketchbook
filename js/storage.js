// The storage ring in the top-right corner: how much room your pages take in
// this browser, and whether the browser has promised to keep them.
//
// Pages and images live in IndexedDB (see db.js). localStorage would be simpler,
// but it holds about 5 MB of text per site, so a few pasted images would fill it.

import { db } from './db.js';

const RADIUS = 6;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const MIN_ARC = 0.04; // always show a sliver, so the ring reads as a meter

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
  return { pageCount: pages.length, imageCount: blobs.length, pageBytes, imageBytes };
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
      last = { ...mine, ...browser, total: mine.pageBytes + mine.imageBytes };
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

function fraction() {
  if (!last?.quota) return 0;
  // Measure against what the browser actually counts, which includes the database's own overhead.
  const used = Math.max(last.usage ?? 0, last.total);
  return Math.min(1, used / last.quota);
}

function percent(f) {
  if (f > 0 && f < 0.0001) return 'Under 0.01%';
  return `${(f * 100).toFixed(f < 0.01 ? 2 : 1)}%`;
}

function render() {
  if (!last) return;
  const f = fraction();
  const arc = $('#storage-ring .ring-fill');
  const shown = Math.max(MIN_ARC, f);
  arc.style.strokeDasharray = `${(shown * CIRCUMFERENCE).toFixed(2)} ${CIRCUMFERENCE.toFixed(2)}`;
  const btn = $('#storage-ring');
  btn.classList.toggle('warn', f >= 0.8);
  btn.classList.toggle('unsafe', !last.persisted);
  btn.title = `Storage: ${formatBytes(last.total)} used`;
  btn.setAttribute('aria-label', `Storage, ${formatBytes(last.total)} used`);

  $('#storage-used').textContent = formatBytes(last.total);
  $('#storage-breakdown').textContent =
    `${last.pageCount} page${last.pageCount === 1 ? '' : 's'} ${formatBytes(last.pageBytes)}` +
    ` · ${last.imageCount} image${last.imageCount === 1 ? '' : 's'} ${formatBytes(last.imageBytes)}`;
  $('#storage-quota').textContent = last.quota
    ? `${percent(f)} of the ${formatBytes(last.quota)} this browser allows`
    : 'This browser does not say how much room it allows.';
  $('#storage-bar span').style.width = `${(Math.max(f, 0.005) * 100).toFixed(2)}%`;

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

  $('#storage-export').addEventListener('click', onExport);
  $('#storage-persist').addEventListener('click', async () => {
    const granted = await navigator.storage.persist().catch(() => false);
    await refreshStorage();
    toast(granted
      ? 'Done: the browser will keep your pages.'
      : 'The browser said no for now. Bookmarking the site or installing it usually helps. Export keeps a copy either way.');
  });

  refreshStorage();
}
