// Sketchbook: an infinite dark canvas per page, with ink, text notes and images.
// Everything is stored locally in IndexedDB (see db.js); backup.js handles export/import.

import { db } from './db.js';
import { strokePath, pointsBounds, hitStroke, round } from './ink.js';
import { buildBackup, downloadText, restoreBackup, referencedBlobIds, storeImageSources } from './backup.js';
import { COLORS, uid, normalizeItem } from './format.js';
import { initStorageMeter, scheduleStorageRefresh, refreshStorage, storageInfo, afterSave, noteBackup } from './storage.js';

// ---------- Constants ----------

// Sizes are in screen pixels at the moment of drawing, so a line looks the same
// thickness whatever the zoom level when you draw it.
const SIZES = [
  { name: 'Fine', pen: 1.5, text: 16, dot: 4 },
  { name: 'Medium', pen: 3, text: 22, dot: 7 },
  { name: 'Bold', pen: 7, text: 34, dot: 11 },
];
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const HISTORY_LIMIT = 100;
const MAX_IMAGE_SIDE = 480; // screen px for newly added images
const SVG_NS = 'http://www.w3.org/2000/svg';
const LAST_PAGE_KEY = 'sketchbook:last-page';
const SIDEBAR_KEY = 'sketchbook:sidebar-hidden';

// ---------- DOM ----------

const $ = (sel) => document.querySelector(sel);
const el = {
  stage: $('#stage'),
  world: $('#world'),
  imageLayer: $('#image-layer'),
  inkLayer: $('#ink-layer'),
  noteLayer: $('#note-layer'),
  selection: $('#selection'),
  handle: $('#selection .handle'),
  hint: $('#empty-hint'),
  title: $('#page-title'),
  tabs: $('#page-tabs'),
  pageList: $('#page-list'),
  saveStatus: $('#save-status'),
  zoomLabel: $('#zoom-label'),
  toast: $('#toast'),
  undo: $('#undo'),
  redo: $('#redo'),
  colors: $('#colors'),
  sizes: $('#sizes'),
  imageInput: $('#image-input'),
  importInput: $('#import-input'),
};

// ---------- State ----------

const state = {
  pages: [], // every page, newest first
  page: null, // the open page
  tool: 'pen',
  colorIndex: 0,
  sizeIndex: 1,
  selectedId: null,
  editing: null, // { item, before, isNew } while a note is being typed in
  undo: [],
  redo: [],
  spaceHeld: false,
};

const nodes = new Map(); // item id -> DOM node on the canvas
const blobUrls = new Map(); // blob id -> Promise<object URL | null>
let drag = null; // the active pointer gesture, if any
let lastPointer = null; // last pointer position over the stage, for pasting

const clone = (v) => structuredClone(v);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const items = () => state.page.items;
const findItem = (id) => items().find((i) => i.id === id);
const zoom = () => state.page.view.zoom;
// Pages with tabs show the active tab's items plus the items that belong to no tab.
const visible = (item) => !state.page.tabs || !item.tab || item.tab === state.page.activeTab;
const visibleItems = () => items().filter(visible);
// New items join the tab that is open, so a scribble stays with the patch it is about.
function tagForTab(item) {
  if (state.page.tabs && state.page.activeTab && !item.tab) item.tab = state.page.activeTab;
  return item;
}
const isTyping = (target) =>
  target instanceof Element && !!target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])');

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode etc. */ }
}

// ---------- Feedback ----------

let toastTimer = null;
function toast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2600);
}

function setStatus(text) {
  el.saveStatus.textContent = text;
}

// ---------- Saving ----------

const dirty = new Set();
let saveTimer = null;

function markDirty(page = state.page, { touch = true } = {}) {
  if (touch) page.updatedAt = Date.now();
  dirty.add(page);
  setStatus('Saving…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 400);
}

async function flush() {
  clearTimeout(saveTimer);
  const pages = [...dirty];
  dirty.clear();
  try {
    for (const page of pages) await db.put('pages', page);
    if (!dirty.size) setStatus('Saved');
    afterSave();
  } catch (err) {
    console.error(err);
    pages.forEach((p) => dirty.add(p));
    setStatus('Not saved');
    toast(`Could not save: ${err?.message ?? err}`);
  }
}

// ---------- History ----------

const snapshot = () => clone(items());

function updateHistoryButtons() {
  el.undo.disabled = !state.undo.length;
  el.redo.disabled = !state.redo.length;
}

// Call after any change to the open page's items, with a snapshot from before it.
function changed(before) {
  state.undo.push(before);
  if (state.undo.length > HISTORY_LIMIT) state.undo.shift();
  state.redo.length = 0;
  updateHistoryButtons();
  markDirty();
  updateHint();
}

function undo() {
  if (!state.undo.length) return;
  state.redo.push(snapshot());
  state.page.items = state.undo.pop();
  afterHistoryJump();
}

function redo() {
  if (!state.redo.length) return;
  state.undo.push(snapshot());
  state.page.items = state.redo.pop();
  afterHistoryJump();
}

function afterHistoryJump() {
  renderAll();
  updateHistoryButtons();
  markDirty();
}

// ---------- Rendering ----------

function layerFor(item) {
  if (item.type === 'stroke') return el.inkLayer;
  if (item.type === 'image') return el.imageLayer;
  return el.noteLayer;
}

function urlForBlob(id) {
  if (!blobUrls.has(id)) {
    blobUrls.set(
      id,
      db.get('blobs', id)
        .then((rec) => (rec ? URL.createObjectURL(rec.blob) : null))
        .catch(() => null),
    );
  }
  return blobUrls.get(id);
}

function createNode(item) {
  if (item.type === 'stroke') {
    const g = document.createElementNS(SVG_NS, 'g');
    g.dataset.id = item.id;
    const hit = document.createElementNS(SVG_NS, 'path');
    hit.setAttribute('class', 'hit');
    const ink = document.createElementNS(SVG_NS, 'path');
    ink.setAttribute('class', 'ink');
    g.append(hit, ink);
    return g;
  }
  const div = document.createElement('div');
  div.dataset.id = item.id;
  div.className = `item ${item.type}`;
  if (item.type === 'image') {
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    div.append(img);
    // Prefer the stored copy; fall back to the web address if there isn't one.
    const fallback = item.src ?? '';
    if (item.blobId) urlForBlob(item.blobId).then((url) => { img.src = url ?? fallback; });
    else img.src = fallback;
  }
  return div;
}

function updateNode(node, item) {
  if (item.type === 'stroke') {
    const d = strokePath(item.points);
    const [hit, ink] = node.children;
    hit.setAttribute('d', d);
    ink.setAttribute('d', d);
    ink.setAttribute('stroke', item.color);
    ink.setAttribute('stroke-width', item.width);
  } else if (item.type === 'image') {
    Object.assign(node.style, { left: `${item.x}px`, top: `${item.y}px`, width: `${item.w}px`, height: `${item.h}px` });
  } else if (item.type === 'note') {
    Object.assign(node.style, { left: `${item.x}px`, top: `${item.y}px`, color: item.color, fontSize: `${item.size}px` });
    if (state.editing?.item.id !== item.id) node.textContent = item.text;
  }
}

function renderItem(item) {
  let node = nodes.get(item.id);
  if (!node) {
    node = createNode(item);
    nodes.set(item.id, node);
    layerFor(item).append(node);
  }
  updateNode(node, item);
  return node;
}

function removeNode(id) {
  nodes.get(id)?.remove();
  nodes.delete(id);
}

function renderAll() {
  nodes.forEach((node) => node.remove());
  nodes.clear();
  for (const item of visibleItems()) renderItem(item);
  updateSelection();
  updateHint();
}

function updateHint() {
  el.hint.hidden = items().length > 0;
}

// ---------- Selection ----------

function itemBounds(item) {
  if (item.type === 'stroke') {
    const b = pointsBounds(item.points);
    const pad = item.width / 2;
    return { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad };
  }
  if (item.type === 'image') return { x: item.x, y: item.y, w: item.w, h: item.h };
  const node = nodes.get(item.id);
  return { x: item.x, y: item.y, w: node?.offsetWidth ?? 0, h: node?.offsetHeight ?? 0 };
}

function updateSelection() {
  const item = state.selectedId && findItem(state.selectedId);
  if (!item || !visible(item)) {
    state.selectedId = null;
    el.selection.hidden = true;
    return;
  }
  const b = itemBounds(item);
  Object.assign(el.selection.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
  el.selection.hidden = false;
  el.handle.hidden = item.type !== 'image';
}

function select(id) {
  state.selectedId = id;
  updateSelection();
}

function deleteSelection() {
  const item = state.selectedId && findItem(state.selectedId);
  if (!item) return;
  const before = snapshot();
  state.page.items = items().filter((i) => i !== item);
  removeNode(item.id);
  select(null);
  changed(before);
}

// ---------- View (pan and zoom) ----------

function applyView() {
  const { x, y, zoom: z } = state.page.view;
  el.world.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
  el.world.style.setProperty('--zoom', z);
  el.zoomLabel.textContent = `${Math.round(z * 100)}%`;
}

function setView(view) {
  state.page.view = view;
  applyView();
  markDirty(state.page, { touch: false });
}

function stagePoint(e) {
  const r = el.stage.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function stageCenter() {
  return { x: el.stage.clientWidth / 2, y: el.stage.clientHeight / 2 };
}

function toWorld(p) {
  const { x, y, zoom: z } = state.page.view;
  return { x: (p.x - x) / z, y: (p.y - y) / z };
}

function zoomAt(p, factor) {
  const v = state.page.view;
  const z = clamp(v.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  const k = z / v.zoom;
  setView({ zoom: z, x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k });
}

function resetZoom() {
  zoomAt(stageCenter(), 1 / zoom());
}

// Zooms and pans so every item on the page is in view (never above 100%).
function fitToContent() {
  if (!visibleItems().length) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const item of visibleItems()) {
    const b = itemBounds(item);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  const pad = 48;
  const top = pad + (state.page.tabs ? 48 : 0); // keep clear of the tab bar
  const sw = el.stage.clientWidth;
  const sh = el.stage.clientHeight;
  const z = clamp(Math.min((sw - 2 * pad) / (maxX - minX || 1), (sh - top - pad) / (maxY - minY || 1), 1), MIN_ZOOM, MAX_ZOOM);
  setView({ zoom: z, x: (sw - (maxX - minX) * z) / 2 - minX * z, y: top + (sh - top - pad - (maxY - minY) * z) / 2 - minY * z });
}

// ---------- Tools, colors, sizes ----------

function setTool(tool) {
  if (tool !== state.tool) finishEditing();
  state.tool = tool;
  for (const cls of [...el.stage.classList]) if (cls.startsWith('tool-')) el.stage.classList.remove(cls);
  el.stage.classList.add(`tool-${tool}`);
  document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
  if (tool !== 'select') select(null);
}

const currentColor = () => COLORS[state.colorIndex].value;

function buildPalette() {
  COLORS.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.title = c.name;
    b.setAttribute('aria-label', c.name);
    b.style.setProperty('--c', c.value);
    b.append(document.createElement('span'));
    b.addEventListener('click', () => setColor(i));
    el.colors.append(b);
  });
  SIZES.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'size-btn';
    b.title = s.name;
    b.setAttribute('aria-label', s.name);
    const dot = document.createElement('span');
    dot.style.width = dot.style.height = `${s.dot}px`;
    b.append(dot);
    b.addEventListener('click', () => setSize(i));
    el.sizes.append(b);
  });
  refreshPalette();
}

function refreshPalette() {
  [...el.colors.children].forEach((b, i) => b.classList.toggle('active', i === state.colorIndex));
  [...el.sizes.children].forEach((b, i) => b.classList.toggle('active', i === state.sizeIndex));
}

// Picking a color or size also applies it to the selected item.
function setColor(i) {
  state.colorIndex = i;
  refreshPalette();
  const item = state.selectedId && findItem(state.selectedId);
  if (item && item.type !== 'image') {
    const before = snapshot();
    item.color = currentColor();
    renderItem(item);
    changed(before);
  }
}

function setSize(i) {
  state.sizeIndex = i;
  refreshPalette();
  const item = state.selectedId && findItem(state.selectedId);
  if (item && item.type !== 'image') {
    const before = snapshot();
    if (item.type === 'stroke') item.width = round(SIZES[i].pen / zoom());
    else item.size = round(SIZES[i].text / zoom());
    renderItem(item);
    updateSelection();
    changed(before);
  }
}

// ---------- Pointer gestures ----------

function onPointerDown(e) {
  if (drag) return;
  const target = e.target instanceof Element ? e.target : null;
  // Clicking inside the note being typed in just moves the caret.
  if (state.editing && target?.closest('.note') === nodes.get(state.editing.item.id)) return;
  finishEditing();
  if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }

  const p = stagePoint(e);
  if (e.button === 1 || (e.button === 0 && (state.spaceHeld || state.tool === 'hand'))) {
    startPan(e, p);
    return;
  }
  if (e.button !== 0) return;

  const hitNode = target?.closest('[data-id]');
  const hitItem = hitNode ? findItem(hitNode.dataset.id) : null;

  switch (state.tool) {
    case 'pen':
      startStroke(e, p);
      break;
    case 'eraser':
      startErase(e, p);
      break;
    case 'text':
      if (hitItem?.type === 'note') startEditing(hitItem);
      else createNote(toWorld(p));
      break;
    case 'select':
      if (target === el.handle) startResize(e, p);
      else if (hitItem) {
        select(hitItem.id);
        startMove(e, p, hitItem);
      } else {
        select(null);
        startPan(e, p);
      }
      break;
  }
}

function begin(e, gesture) {
  el.stage.setPointerCapture(e.pointerId);
  drag = { pointerId: e.pointerId, ...gesture };
}

function startPan(e, p) {
  begin(e, { kind: 'pan', start: p, view: { ...state.page.view } });
  el.stage.classList.add('panning');
}

function startStroke(e, p) {
  const w = toWorld(p);
  const item = tagForTab({
    id: uid(),
    type: 'stroke',
    color: currentColor(),
    width: round(SIZES[state.sizeIndex].pen / zoom()),
    points: [[round(w.x), round(w.y)]],
  });
  renderItem(item);
  begin(e, { kind: 'stroke', item });
}

function startErase(e, p) {
  begin(e, { kind: 'erase', before: snapshot(), removed: false, last: p });
  eraseAlong(p, p);
}

function startMove(e, p, item) {
  begin(e, { kind: 'move', item, start: toWorld(p), orig: clone(item), before: snapshot(), moved: false });
}

function startResize(e, p) {
  const item = findItem(state.selectedId);
  if (!item) return;
  begin(e, { kind: 'resize', item, start: toWorld(p), orig: clone(item), before: snapshot(), moved: false });
}

// Removes every stroke touched along the segment a -> b (screen points).
function eraseAlong(a, b) {
  const radius = 8;
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / radius));
  const samples = [];
  for (let i = 0; i <= steps; i++) {
    samples.push(toWorld({ x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps }));
  }
  const r = radius / zoom();
  const keep = [];
  for (const item of items()) {
    if (item.type === 'stroke' && visible(item) && samples.some((s) => hitStroke(item, s.x, s.y, r))) {
      removeNode(item.id);
      drag.removed = true;
    } else {
      keep.push(item);
    }
  }
  state.page.items = keep;
}

function onPointerMove(e) {
  lastPointer = stagePoint(e);
  if (!drag || e.pointerId !== drag.pointerId) return;
  const p = lastPointer;

  switch (drag.kind) {
    case 'pan':
      setView({ ...drag.view, x: drag.view.x + p.x - drag.start.x, y: drag.view.y + p.y - drag.start.y });
      break;

    case 'stroke': {
      const pts = drag.item.points;
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      for (const ev of events.length ? events : [e]) {
        const w = toWorld(stagePoint(ev));
        const [lx, ly] = pts[pts.length - 1];
        if (Math.hypot(w.x - lx, w.y - ly) * zoom() < 1.5) continue;
        pts.push([round(w.x), round(w.y)]);
      }
      updateNode(nodes.get(drag.item.id), drag.item);
      break;
    }

    case 'erase':
      eraseAlong(drag.last, p);
      drag.last = p;
      break;

    case 'move': {
      const w = toWorld(p);
      const dx = w.x - drag.start.x;
      const dy = w.y - drag.start.y;
      if (!drag.moved && Math.hypot(dx, dy) * zoom() < 3) return;
      drag.moved = true;
      const { item, orig } = drag;
      if (item.type === 'stroke') item.points = orig.points.map(([x, y]) => [round(x + dx), round(y + dy)]);
      else {
        item.x = round(orig.x + dx);
        item.y = round(orig.y + dy);
      }
      renderItem(item);
      updateSelection();
      break;
    }

    case 'resize': {
      const w = toWorld(p);
      const { item, orig } = drag;
      drag.moved = true;
      item.w = round(Math.max(16 / zoom(), orig.w + w.x - drag.start.x));
      item.h = round((item.w * orig.h) / orig.w);
      renderItem(item);
      updateSelection();
      break;
    }
  }
}

function onPointerUp(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const g = drag;
  drag = null;

  switch (g.kind) {
    case 'pan':
      el.stage.classList.remove('panning');
      break;
    case 'stroke': {
      const before = snapshot();
      items().push(g.item);
      changed(before);
      break;
    }
    case 'erase':
    case 'move':
    case 'resize':
      if (g.removed || g.moved) changed(g.before);
      break;
  }
}

function onDoubleClick(e) {
  if (state.tool !== 'select') return;
  const node = e.target instanceof Element ? e.target.closest('[data-id]') : null;
  const item = node && findItem(node.dataset.id);
  if (item?.type === 'note') startEditing(item);
  else if (!item) {
    setTool('text');
    createNote(toWorld(stagePoint(e)));
  }
}

function onWheel(e) {
  e.preventDefault();
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.stage.clientHeight : 1;
  let dx = e.deltaX * unit;
  let dy = e.deltaY * unit;
  if (e.ctrlKey || e.metaKey) {
    // Trackpad pinch arrives as ctrl + wheel with small deltas; a mouse notch is ~100.
    zoomAt(stagePoint(e), Math.exp(-clamp(dy, -30, 30) * 0.01));
    return;
  }
  if (e.shiftKey && !dx) [dx, dy] = [dy, 0];
  const v = state.page.view;
  setView({ ...v, x: v.x - dx, y: v.y - dy });
}

// ---------- Notes ----------

function createNote(at, text = '') {
  const size = round(SIZES[state.sizeIndex].text / zoom());
  const item = tagForTab({
    id: uid(),
    type: 'note',
    x: round(at.x - 4 / zoom()),
    y: round(at.y - size * 0.7),
    text,
    color: currentColor(),
    size,
  });
  const before = snapshot();
  items().push(item);
  renderItem(item);
  updateHint();
  if (text) changed(before);
  else startEditing(item, { isNew: true, before });
  return item;
}

function startEditing(item, { isNew = false, before = snapshot() } = {}) {
  finishEditing();
  select(null);
  const node = nodes.get(item.id);
  state.editing = { item, before, isNew };
  try {
    node.contentEditable = 'plaintext-only';
  } catch {
    node.contentEditable = 'true';
  }
  node.focus();
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  node.addEventListener('blur', finishEditing, { once: true });
}

function finishEditing() {
  const ed = state.editing;
  if (!ed) return;
  state.editing = null;
  const node = nodes.get(ed.item.id);
  if (!node) return;
  node.removeEventListener('blur', finishEditing);
  const text = node.innerText.replace(/\n+$/, '');
  node.contentEditable = 'false';
  window.getSelection()?.removeAllRanges();

  if (!text.trim()) {
    state.page.items = items().filter((i) => i !== ed.item);
    removeNode(ed.item.id);
    if (ed.isNew) updateHint();
    else changed(ed.before);
    return;
  }
  const edited = ed.isNew || text !== ed.item.text;
  ed.item.text = text;
  updateNode(node, ed.item);
  if (edited) changed(ed.before);
}

// ---------- Images ----------

function imageSize(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth || 300, height: img.naturalHeight || 300 });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('not a readable image'));
    };
    img.src = url;
  });
}

async function addImages(files, at) {
  const images = [...files].filter((f) => f.type.startsWith('image/'));
  if (!images.length) return;
  const page = state.page;
  const before = snapshot();
  const z = zoom();
  let offset = 0;
  let last = null;
  for (const file of images) {
    try {
      const { width, height } = await imageSize(file);
      const blobId = uid();
      await db.put('blobs', { id: blobId, blob: file });
      if (state.page !== page) return; // page switched while loading
      blobUrls.set(blobId, Promise.resolve(URL.createObjectURL(file)));
      const k = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height)) / z;
      const w = round(width * k);
      const h = round(height * k);
      last = tagForTab({ id: uid(), type: 'image', x: round(at.x - w / 2 + offset), y: round(at.y - h / 2 + offset), w, h, blobId });
      items().push(last);
      renderItem(last);
      offset += 24 / z;
    } catch (err) {
      toast(`Couldn't add ${file.name || 'that image'}: ${err.message}`);
    }
  }
  if (last) {
    changed(before);
    setTool('select');
    select(last.id);
  }
}

function pastePoint() {
  return toWorld(lastPointer ?? stageCenter());
}

// ---------- Pages ----------

const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function renderPageList() {
  el.pageList.replaceChildren(
    ...state.pages.map((page) => {
      const li = document.createElement('li');
      li.classList.toggle('active', page === state.page);

      const open = document.createElement('button');
      open.className = 'page-open';
      const name = document.createElement('span');
      name.className = 'page-name';
      name.classList.toggle('untitled', !page.title);
      name.textContent = page.title || 'Untitled';
      const date = document.createElement('span');
      date.className = 'page-date';
      date.textContent = dateFormat.format(page.createdAt);
      open.append(name, date);
      open.addEventListener('click', () => openPage(page));

      // Two-step delete: first click arms, second click deletes.
      const del = document.createElement('button');
      del.className = 'page-delete';
      del.textContent = 'Delete';
      del.title = 'Delete page';
      let armTimer = null;
      del.addEventListener('click', () => {
        if (!del.classList.contains('confirm')) {
          del.classList.add('confirm');
          del.textContent = 'Delete?';
          armTimer = setTimeout(() => {
            del.classList.remove('confirm');
            del.textContent = 'Delete';
          }, 3000);
          return;
        }
        clearTimeout(armTimer);
        deletePage(page);
      });

      li.append(open, del);
      return li;
    }),
  );
}

function openPage(page) {
  finishEditing();
  if (dirty.size) flush();
  drag = null;
  state.page = page;
  state.undo = [];
  state.redo = [];
  state.selectedId = null;
  el.title.value = page.title;
  applyView();
  renderTabs();
  renderAll();
  renderPageList();
  updateHistoryButtons();
  storageSet(LAST_PAGE_KEY, page.id);
  // Pages made elsewhere (library, agents) can ask to be framed on first open.
  if (page.fit) {
    delete page.fit;
    fitToContent();
  }
}

// ---------- Page tabs ----------

function renderTabs() {
  const { tabs, activeTab } = state.page;
  el.tabs.hidden = !tabs;
  if (!tabs) {
    el.tabs.replaceChildren();
    return;
  }
  el.tabs.replaceChildren(
    ...tabs.map((t) => {
      const b = document.createElement('button');
      b.className = 'page-tab';
      b.type = 'button';
      b.textContent = t.label;
      b.dataset.tab = t.id;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(t.id === activeTab));
      b.addEventListener('click', () => switchTab(t.id));
      return b;
    }),
  );
}

function switchTab(id) {
  const page = state.page;
  if (!page.tabs?.some((t) => t.id === id) || page.activeTab === id) return;
  finishEditing();
  page.activeTab = id;
  select(null);
  renderTabs();
  renderAll();
  markDirty(page, { touch: false });
}

function newPage() {
  const now = Date.now();
  const page = { id: uid(), title: '', createdAt: now, updatedAt: now, view: { x: 0, y: 0, zoom: 1 }, items: [] };
  state.pages.unshift(page);
  markDirty(page);
  openPage(page);
  return page;
}

async function deletePage(page, { quiet = false } = {}) {
  state.pages = state.pages.filter((p) => p !== page);
  dirty.delete(page);
  if (state.page === page) {
    if (state.pages.length) openPage(state.pages[0]);
    else newPage();
  } else {
    renderPageList();
  }
  try {
    await db.delete('pages', page.id);
    scheduleStorageRefresh();
    if (!quiet) toast('Page deleted');
  } catch (err) {
    toast(`Could not delete: ${err.message}`);
  }
}

const isBlank = (page) => !page.title && !page.items.length;

async function loadPages() {
  const pages = await db.getAll('pages');
  state.pages = pages.sort((a, b) => b.createdAt - a.createdAt);
}

// ---------- Backup ----------

async function exportBackup() {
  finishEditing();
  await flush();
  try {
    const json = await buildBackup();
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`sketchbook-backup-${stamp}.json`, json);
    noteBackup();
    toast('Backup downloaded');
  } catch (err) {
    toast(`Export failed: ${err.message}`);
  }
}

async function importBackup(file) {
  finishEditing();
  await flush();
  try {
    const { ids, problems } = await restoreBackup(await file.text());
    await afterImport(ids, problems, { openImported: false });
  } catch (err) {
    toast(err.message);
  }
}

// Reloads the page list after pages were written to the database, and opens
// either the imported page or the one that was open before.
async function afterImport(ids, problems, { openImported }) {
  // A blank page (like the one a fresh browser starts with) is just clutter
  // next to imported pages, so drop it.
  const current = state.page;
  if (ids.length && isBlank(current) && !ids.includes(current.id)) await db.delete('pages', current.id);
  await loadPages();
  const imported = state.pages.find((p) => ids.includes(p.id));
  const stay = state.pages.find((p) => p.id === current.id);
  openPage((openImported ? imported ?? stay : stay ?? imported) ?? state.pages[0] ?? newPage());
  const skipped = problems.length ? `, skipped ${problems.length} broken item${problems.length === 1 ? '' : 's'}` : '';
  if (problems.length) console.warn('Import problems:', problems);
  toast(`Imported ${ids.length} page${ids.length === 1 ? '' : 's'}${skipped}`);
  scheduleStorageRefresh(0);
}

// ---------- Library ----------
// Ready-made pages that ship with the site (library/index.json lists them).

const libraryDialog = $('#library');

async function openLibrary() {
  const list = $('#library-list');
  list.replaceChildren(Object.assign(document.createElement('li'), { className: 'library-msg', textContent: 'Loading…' }));
  libraryDialog.showModal();
  try {
    const res = await fetch('library/index.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const entries = (await res.json()).pages ?? [];
    list.replaceChildren(
      ...entries.map((entry) => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.className = 'library-entry';
        const name = Object.assign(document.createElement('span'), { className: 'library-title', textContent: entry.title });
        const desc = Object.assign(document.createElement('span'), { className: 'library-desc', textContent: entry.description ?? '' });
        b.append(name, desc);
        b.addEventListener('click', () => addFromLibrary(entry));
        li.append(b);
        return li;
      }),
    );
  } catch (err) {
    list.replaceChildren(Object.assign(document.createElement('li'), { className: 'library-msg', textContent: `Couldn't load the library: ${err.message}` }));
  }
}

async function addFromLibrary(entry) {
  libraryDialog.close();
  finishEditing();
  await flush();
  try {
    const res = await fetch(`library/${entry.file}`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Always a new copy, so re-adding never overwrites your edits.
    const { ids, problems } = await restoreBackup(await res.text(), { freshIds: true });
    await afterImport(ids, problems, { openImported: true });
  } catch (err) {
    toast(`Couldn't add that page: ${err.message}`);
  }
}

// ---------- Agent API ----------
// A small scripting surface on window.sketchbook, so an AI agent (or you, in the
// console) can write and draw on the open page. Every change is one undo step.
// docs/AGENTS.md documents it; sketchbook.help() prints a summary.

const AGENT_HELP = `sketchbook agent API (coordinates are world units; 1 unit = 1px at 100% zoom)
  pages()                         list pages: [{ id, title, items }]
  page()                          copy of the open page
  open(id)                        open a page
  tab(id)                         switch the open page to one of its tabs (page().tabs lists them)
  newPage(title?)                 create and open a blank page, returns its id
  add(item | items)               add notes, strokes, images to the open page, returns ids
      { type:'note', x, y, text, color?, size? }
      { type:'stroke', points:[[x,y],...], color?, width? }
      { type:'image', x, y, w, h, src:'https://...' }
  remove(id | ids)                delete items from the open page
  importPage(page)                add a whole page object as a new page and open it
  fit()                           zoom to show everything
  storage()                       bytes used vs the 50 MB budget, browser quota, persisted, backup due
  colors                          palette names and hex values`;

const asList = (v) => (Array.isArray(v) ? v : [v]);

const agentApi = {
  colors: COLORS.map((c) => ({ ...c })),
  help() { return AGENT_HELP; },
  pages() { return state.pages.map((p) => ({ id: p.id, title: p.title, items: p.items.length })); },
  page() { return clone(state.page); },
  open(id) {
    const page = state.pages.find((p) => p.id === id);
    if (!page) throw new Error(`no page with id ${id}`);
    openPage(page);
    return page.id;
  },
  newPage(title = '') {
    const page = newPage();
    page.title = String(title);
    el.title.value = page.title;
    renderPageList();
    markDirty(page);
    return page.id;
  },
  async add(input) {
    finishEditing();
    const page = state.page;
    const added = asList(input).map((raw) => normalizeItem({ ...raw, id: undefined }));
    const tabIds = new Set((page.tabs ?? []).map((t) => t.id));
    for (const item of added) {
      if (item.tab && !tabIds.has(item.tab)) throw new Error(`the open page has no tab "${item.tab}"`);
      tagForTab(item);
    }
    // Store remote images first, so they work offline and export with the page.
    await storeImageSources({ items: added });
    if (state.page !== page) throw new Error('the open page changed while adding');
    const before = snapshot();
    for (const item of added) {
      items().push(item);
      renderItem(item);
    }
    changed(before);
    return added.map((i) => i.id);
  },
  remove(input) {
    const ids = new Set(asList(input));
    const before = snapshot();
    const keep = items().filter((i) => !ids.has(i.id));
    if (keep.length === items().length) return 0;
    const removed = items().length - keep.length;
    state.page.items = keep;
    ids.forEach(removeNode);
    select(null);
    changed(before);
    return removed;
  },
  async importPage(raw) {
    finishEditing();
    await flush();
    const { ids, problems } = await restoreBackup({ format: 'sketchbook-page', page: raw }, { freshIds: true });
    await afterImport(ids, problems, { openImported: true });
    return { id: ids[0], problems };
  },
  tab(id) {
    if (!state.page.tabs?.some((t) => t.id === id)) throw new Error(`the open page has no tab "${id}"`);
    switchTab(id);
    return id;
  },
  fit() { fitToContent(); },
  async storage() {
    await flush();
    return (await refreshStorage()) ?? storageInfo();
  },
};

// Deletes stored images that no page uses any more. Only looks at blobs that
// existed at startup, so images added during this session are never at risk.
async function collectGarbage(startupBlobIds) {
  const used = referencedBlobIds(state.pages);
  for (const id of startupBlobIds) {
    if (!used.has(id)) await db.delete('blobs', id).catch(() => {});
  }
}

// ---------- Keyboard, clipboard, drag and drop ----------

function onKeyDown(e) {
  if (libraryDialog.open) return;
  if (isTyping(e.target)) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();

  if (mod) {
    if (key === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (key === 'y') {
      e.preventDefault();
      redo();
    } else if (key === '=' || key === '+') {
      e.preventDefault();
      zoomAt(stageCenter(), 1.25);
    } else if (key === '-') {
      e.preventDefault();
      zoomAt(stageCenter(), 0.8);
    } else if (key === '0') {
      e.preventDefault();
      resetZoom();
    }
    return;
  }
  if (e.altKey) return;

  if (e.key === ' ') {
    e.preventDefault();
    if (!state.spaceHeld) {
      state.spaceHeld = true;
      el.stage.classList.add('panning-ready');
    }
    return;
  }

  const tools = { v: 'select', h: 'hand', p: 'pen', e: 'eraser', t: 'text' };
  if (tools[key]) setTool(tools[key]);
  else if (key === 'i') el.imageInput.click();
  else if (key === 'n') newPage();
  else if (key === '\\') toggleSidebar();
  else if (key === 'delete' || key === 'backspace') deleteSelection();
  else if (key === 'escape') select(null);
  else if (key === '0') resetZoom();
  else if (key === '=' || key === '+') zoomAt(stageCenter(), 1.25);
  else if (key === '-') zoomAt(stageCenter(), 0.8);
}

function onKeyUp(e) {
  if (e.key === ' ' && state.spaceHeld) {
    state.spaceHeld = false;
    el.stage.classList.remove('panning-ready');
    if (!isTyping(e.target)) e.preventDefault();
  }
}

function onPaste(e) {
  if (isTyping(e.target)) return;
  const files = [...(e.clipboardData?.files ?? [])];
  if (files.some((f) => f.type.startsWith('image/'))) {
    e.preventDefault();
    addImages(files, pastePoint());
    return;
  }
  const text = e.clipboardData?.getData('text/plain');
  if (text?.trim()) {
    e.preventDefault();
    createNote(pastePoint(), text.trim());
  }
}

function toggleSidebar() {
  const hidden = document.body.classList.toggle('sidebar-hidden');
  storageSet(SIDEBAR_KEY, hidden ? '1' : '0');
}

// ---------- Wiring ----------

function bindEvents() {
  el.stage.addEventListener('pointerdown', onPointerDown);
  el.stage.addEventListener('pointermove', onPointerMove);
  el.stage.addEventListener('pointerup', onPointerUp);
  el.stage.addEventListener('pointercancel', onPointerUp);
  el.stage.addEventListener('pointerleave', () => { if (!drag) lastPointer = null; });
  el.stage.addEventListener('dblclick', onDoubleClick);
  el.stage.addEventListener('wheel', onWheel, { passive: false });
  // Stop the browser from moving focus or starting text selection on canvas
  // clicks; focus is managed explicitly (e.g. for notes being edited).
  el.stage.addEventListener('mousedown', (e) => {
    if (!(state.editing && e.target.closest?.('.note') === nodes.get(state.editing.item.id))) e.preventDefault();
  });

  document.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $('#add-image').addEventListener('click', () => el.imageInput.click());
  el.undo.addEventListener('click', undo);
  el.redo.addEventListener('click', redo);
  el.zoomLabel.addEventListener('click', resetZoom);
  $('#toggle-sidebar').addEventListener('click', toggleSidebar);
  $('#new-page').addEventListener('click', () => {
    newPage();
    el.title.focus();
  });
  $('#export').addEventListener('click', exportBackup);
  $('#import').addEventListener('click', () => el.importInput.click());
  $('#open-library').addEventListener('click', openLibrary);
  $('#library-close').addEventListener('click', () => libraryDialog.close());
  libraryDialog.addEventListener('click', (e) => { if (e.target === libraryDialog) libraryDialog.close(); });

  el.imageInput.addEventListener('change', () => {
    addImages(el.imageInput.files, toWorld(stageCenter()));
    el.imageInput.value = '';
  });
  el.importInput.addEventListener('change', () => {
    const file = el.importInput.files[0];
    el.importInput.value = '';
    if (file) importBackup(file);
  });

  el.title.addEventListener('input', () => {
    state.page.title = el.title.value;
    markDirty();
    renderPageList();
  });
  el.title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el.title.blur();
  });

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('paste', onPaste);
  // Dropping files anywhere should never navigate away from the app.
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files.length) addImages(e.dataTransfer.files, toWorld(stagePoint(e)));
  });

  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  window.addEventListener('pagehide', flush);
}

async function init() {
  buildPalette();
  bindEvents();
  setTool('pen');

  const savedSidebar = storageGet(SIDEBAR_KEY);
  if (savedSidebar === '1' || (savedSidebar === null && window.innerWidth < 720)) {
    document.body.classList.add('sidebar-hidden');
  }

  let startupBlobIds = [];
  try {
    startupBlobIds = await db.keys('blobs');
    await loadPages();
  } catch (err) {
    console.error(err);
    toast('Browser storage is unavailable, so nothing will be saved.');
  }

  const lastId = storageGet(LAST_PAGE_KEY);
  const first = state.pages.find((p) => p.id === lastId) ?? state.pages[0];
  if (first) openPage(first);
  else newPage();

  window.sketchbook = agentApi;
  // Ask once at startup; Chrome decides silently, others may wait for the button in the storage panel.
  await navigator.storage?.persist?.().catch(() => {});
  await collectGarbage(startupBlobIds).catch(() => {});
  initStorageMeter({ onExport: exportBackup, toast });
}

init();
