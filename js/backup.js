// Export everything to a single JSON file, and import it back.
// Images are embedded as data URLs so the file is fully self-contained.

import { db } from './db.js';

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
  return JSON.stringify({ format: FORMAT, version: FORMAT_VERSION, exportedAt: new Date().toISOString(), pages, blobs });
}

export function downloadText(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Merges a backup into the local database. Pages with the same id are replaced.
// Returns the ids of the pages imported.
export async function restoreBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (data?.format !== FORMAT || !Array.isArray(data.pages)) {
    throw new Error('That file is not a sketchbook backup.');
  }
  if (data.version > FORMAT_VERSION) {
    throw new Error('That backup was made by a newer version of the sketchbook.');
  }
  for (const b of data.blobs ?? []) {
    const blob = await (await fetch(b.dataUrl)).blob();
    await db.put('blobs', { id: b.id, blob });
  }
  const ids = [];
  for (const page of data.pages) {
    if (typeof page?.id !== 'string' || !Array.isArray(page.items)) continue;
    await db.put('pages', page);
    ids.push(page.id);
  }
  return ids;
}
