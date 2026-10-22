// Export everything to a single JSON file, and import it back.
// Images are embedded as data URLs so the file is fully self-contained.

import { db } from './db.js';
import { normalizePage, normalizeFolders, uid } from './format.js';

const FORMAT = 'sketchbook-backup';
const FORMAT_VERSION = 1;

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function referencedBlobIds(pages) {
  const ids = new Set();
  for (const page of pages) {
    for (const item of page.items) if (item.type === 'image') ids.add(item.blobId);
  }
  return ids;
}

export async function buildBackup() {
  const pages = await db.getAll('pages');
  const used = referencedBlobIds(pages);
  const blobs = [];
  for (const rec of await db.getAll('blobs')) {
    if (used.has(rec.id)) blobs.push({ id: rec.id, dataUrl: await blobToDataUrl(rec.blob) });
  }
  const folders = await db.getAll('folders');
  return JSON.stringify({ format: FORMAT, version: FORMAT_VERSION, exportedAt: new Date().toISOString(), pages, folders, blobs });
}

export function downloadText(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Downloads every image item that has a `src` but no stored copy yet, and
// stores it as a blob so the page works offline and exports with its images.
// Images that can't be fetched keep their `src` and are shown from the web.
export async function storeImageSources(page) {
  await Promise.all(
    page.items.map(async (item) => {
      if (item.type !== 'image' || item.blobId || !item.src) return;
      try {
        const res = await fetch(item.src);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (!blob.type.startsWith('image/')) throw new Error('not an image');
        const blobId = uid();
        await db.put('blobs', { id: blobId, blob });
        item.blobId = blobId;
      } catch (err) {
        console.warn(`Could not store image ${item.src}: ${err.message}`);
      }
    }),
  );
}

// Parses a backup file. Also accepts a single page object (the format agents
// and the library use), which is treated as a backup with one page.
export function parseBackup(text) {
  let data;
  try {
    data = typeof text === 'string' ? JSON.parse(text) : text;
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (data?.format === 'sketchbook-page' || (data && !data.format && Array.isArray(data.items))) {
    return { pages: [data.page ?? data], folders: [], blobs: [] };
  }
  if (data?.format !== FORMAT || !Array.isArray(data.pages)) {
    throw new Error('That file is not a sketchbook backup.');
  }
  if (data.version > FORMAT_VERSION) {
    throw new Error('That backup was made by a newer version of the sketchbook.');
  }
  // `folders` was added later without a version bump: older copies of the
  // site ignore it, and backups made before it simply have no folders.
  return { pages: data.pages, folders: Array.isArray(data.folders) ? data.folders : [], blobs: data.blobs ?? [] };
}

// Merges a backup into the local database. Pages with the same id are replaced,
// unless freshIds is set, in which case every page is added as a new copy.
// Returns { ids, problems }: the ids of the pages imported, and anything skipped.
export async function restoreBackup(text, { freshIds = false } = {}) {
  const data = parseBackup(text);
  for (const b of data.blobs) {
    if (typeof b?.id !== 'string' || typeof b.dataUrl !== 'string' || !b.dataUrl.startsWith('data:')) continue;
    const blob = await (await fetch(b.dataUrl)).blob();
    await db.put('blobs', { id: b.id, blob });
  }
  const ids = [];
  const problems = [];
  // Folders keep their ids, so pages that point at them land in the same place.
  // Copies (freshIds) are loose pages; the caller decides where they go.
  const folders = normalizeFolders(data.folders);
  problems.push(...folders.problems);
  for (const folder of folders.folders) await db.put('folders', folder);
  for (const [i, raw] of data.pages.entries()) {
    let result;
    try {
      result = normalizePage(raw, { freshId: freshIds });
    } catch (err) {
      problems.push(`page ${i}: ${err.message}`);
      continue;
    }
    const { page } = result;
    if (freshIds) delete page.folderId;
    problems.push(...result.problems.map((p) => `${page.title || `page ${i}`}: ${p}`));
    await storeImageSources(page);
    await db.put('pages', page);
    ids.push(page.id);
  }
  return { ids, problems };
}
