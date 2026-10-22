// Thin promise wrapper around IndexedDB.
// Stores: "pages" (page records with their items), "blobs" (image files) and,
// since version 2, "folders" (sidebar folders; pages point at one with folderId).
// Upgrades only ever add stores, so existing pages and images are never touched.

const DB_NAME = 'sketchbook';
const DB_VERSION = 2;

let opening = null;

function open() {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('pages')) db.createObjectStore('pages', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('folders')) db.createObjectStore('folders', { keyPath: 'id' });
      };
      // An older copy of the site open in another tab holds the old version open.
      // The upgrade waits for it; tell the user instead of hanging silently.
      req.onblocked = () => {
        window.dispatchEvent(new CustomEvent('sketchbook:db-blocked'));
      };
      req.onsuccess = () => {
        const conn = req.result;
        // If a newer copy of the site opens in another tab, step aside so it can upgrade.
        conn.onversionchange = () => {
          conn.close();
          opening = null;
          window.dispatchEvent(new CustomEvent('sketchbook:db-outdated'));
        };
        resolve(conn);
      };
      req.onerror = () => reject(req.error);
    });
  }
  return opening;
}

// Runs fn(store) inside a transaction and resolves with the last request's result
// once the transaction has fully committed.
async function run(storeName, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    let result;
    const req = fn(tx.objectStore(storeName));
    if (req) req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const db = {
  getAll: (store) => run(store, 'readonly', (s) => s.getAll()),
  keys: (store) => run(store, 'readonly', (s) => s.getAllKeys()),
  get: (store, id) => run(store, 'readonly', (s) => s.get(id)),
  put: (store, value) => run(store, 'readwrite', (s) => s.put(value)),
  delete: (store, id) => run(store, 'readwrite', (s) => s.delete(id)),
};
