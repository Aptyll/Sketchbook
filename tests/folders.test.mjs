// Sidebar folders: create, rename, file pages by drag and drop or menu,
// collapse, delete, backups, and filing pages saved before folders existed.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };

let server;
let browser;
let base;

before(async () => {
  server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    try {
      const body = await readFile(join(ROOT, path || 'index.html'));
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'text/html' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/html' }).end('<!doctype html><title>404</title>');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  );
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function openApp(context) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await page.waitForSelector('#page-list li');
  return { page, errors };
}

const count = (page, sel) => page.locator(sel).count();
const saved = (page) => page.waitForFunction(() => document.querySelector('#save-status').textContent === 'Saved');
const names = (page) => page.locator('#page-list .folder-name, #page-list .page-name').allInnerTexts();

async function newFolder(page, name) {
  await page.click('#new-folder');
  const input = page.locator('.folder-rename');
  await input.fill(name);
  await input.press('Enter');
  await page.locator('.folder-name', { hasText: name }).waitFor();
}

async function newPageTitled(page, title) {
  await page.click('#new-page');
  await page.fill('#page-title', title);
  await page.locator('#page-title').press('Enter');
}

test('folders: create, file pages by drag and by menu, collapse, survive a reload', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const { page, errors } = await openApp(context);

  await page.fill('#page-title', 'Loose idea');
  await newPageTitled(page, 'Lane matchups');
  await newPageTitled(page, 'Item spikes');
  await newFolder(page, 'Theorycraft');

  // Drag a page onto the folder.
  await page.locator('.page-row', { hasText: 'Lane matchups' }).dragTo(page.locator('.folder-row', { hasText: 'Theorycraft' }));
  assert.equal(await page.locator('.folder-row', { hasText: 'Theorycraft' }).locator('.folder-count').innerText(), '1');

  // File another one with the "⋯" menu.
  const row = page.locator('.page-row', { hasText: 'Item spikes' });
  await row.hover();
  await row.locator('.row-more').click();
  await page.click('#row-menu .menu-item >> text=Theorycraft');
  assert.equal(await page.locator('.folder-row', { hasText: 'Theorycraft' }).locator('.folder-count').innerText(), '2');

  // Folders come first, their pages indented under them, loose pages after.
  assert.deepEqual(await names(page), ['Theorycraft', 'Item spikes', 'Lane matchups', 'Loose idea']);

  // Collapse hides the folder's pages.
  await page.click('.folder-row >> text=Theorycraft');
  assert.deepEqual(await names(page), ['Theorycraft', 'Loose idea']);

  // A subfolder via the folder menu, renamed in place.
  const folderRow = page.locator('.folder-row', { hasText: 'Theorycraft' });
  await folderRow.hover();
  await folderRow.locator('.row-more').click();
  await page.click('#row-menu >> text=New folder inside');
  await page.locator('.folder-rename').fill('Old patches');
  await page.locator('.folder-rename').press('Enter');
  await page.locator('.folder-name', { hasText: 'Old patches' }).waitFor();

  await saved(page);
  await page.reload();
  await page.waitForSelector('#page-list li');
  assert.deepEqual(await names(page), ['Theorycraft', 'Old patches', 'Item spikes', 'Lane matchups', 'Loose idea']);
  assert.equal(await page.locator('.folder-row', { hasText: 'Old patches' }).evaluate((li) => li.style.getPropertyValue('--depth')), '1');

  // A folder can't be dropped into its own subfolder.
  const moved = await page.evaluate(() => {
    const [outer, inner] = window.sketchbook.folders().sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0));
    return { outer: outer.id, inner: inner.id };
  });
  await page.locator('.folder-row', { hasText: 'Theorycraft' }).dragTo(page.locator('.folder-row', { hasText: 'Old patches' }));
  const after = await page.evaluate(() => window.sketchbook.folders());
  assert.equal(after.find((f) => f.id === moved.outer).parentId, null);

  assert.deepEqual(errors, []);
  await context.close();
});

test('folders: deleting a folder keeps its pages, moving them up a level', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const { page, errors } = await openApp(context);

  const ids = await page.evaluate(() => {
    const sb = window.sketchbook;
    const outer = sb.newFolder('Outer');
    const inner = sb.newFolder('Inner', outer);
    const p = sb.newPage('Deep page');
    sb.move(p, inner);
    return { outer, inner, p };
  });
  const row = page.locator('.folder-row', { hasText: 'Inner' });
  await row.hover();
  await row.locator('.row-more').click();
  await page.click('#row-menu >> text=Delete folder');
  await page.click('#row-menu >> text=Delete? Its pages move up');

  const state = await page.evaluate(() => ({ pages: window.sketchbook.pages(), folders: window.sketchbook.folders() }));
  assert.equal(state.folders.length, 1);
  assert.equal(state.pages.find((p) => p.id === ids.p).folderId, ids.outer);
  assert.deepEqual(await names(page), ['Outer', 'Deep page', 'Untitled']);

  assert.deepEqual(errors, []);
  await context.close();
});

test('folders: export and import keep pages in their folders', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const { page, errors } = await openApp(context);
  await page.evaluate(() => {
    const sb = window.sketchbook;
    const f = sb.newFolder('Builds');
    sb.move(sb.newPage('BotRK first'), f);
  });
  await saved(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(backup.folders.length, 1);
  assert.equal(backup.pages.find((p) => p.title === 'BotRK first').folderId, backup.folders[0].id);

  // Into a fresh browser.
  const other = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const { page: page2, errors: errors2 } = await openApp(other);
  await page2.setInputFiles('#import-input', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page2.locator('.folder-name', { hasText: 'Builds' }).waitFor();
  assert.deepEqual(await names(page2), ['Builds', 'BotRK first', 'Untitled']);

  assert.deepEqual(errors, []);
  assert.deepEqual(errors2, []);
  await context.close();
  await other.close();
});

test('upgrade: library pages saved before folders existed are filed in the Library folder', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const setup = await context.newPage();
  // Build a version 1 database, the way the site saved pages before folders.
  await setup.goto(`${base}no-such-page`);
  await setup.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('sketchbook', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('pages', { keyPath: 'id' });
      req.result.createObjectStore('blobs', { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const tx = req.result.transaction('pages', 'readwrite');
      const view = { x: 0, y: 0, zoom: 1 };
      const pages = [
        { id: 'a', title: "Kog'Maw ADC: summoner spells", createdAt: 1, updatedAt: 1, view, items: [], source: { stats: 'x' } },
        { id: 'b', title: "Kog'Maw ADC: summoner spells", createdAt: 2, updatedAt: 5, view, items: [], source: { stats: 'x' } },
        { id: 'c', title: "Kog'Maw ADC: summoner spells", createdAt: 3, updatedAt: 3, view, items: [] }, // hand-made, no source
        { id: 'd', title: 'My notes', createdAt: 4, updatedAt: 4, view, items: [] },
      ];
      pages.forEach((p) => tx.objectStore('pages').put(p));
      tx.oncomplete = () => { req.result.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  }));
  await setup.close();

  const { page, errors } = await openApp(context);
  await page.locator('.folder-row.library').waitFor();
  const pages = await page.evaluate(() => window.sketchbook.pages());
  const lib = (await page.evaluate(() => window.sketchbook.folders())).find((f) => f.name === 'Library');
  assert.equal(pages.length, 4, 'no page is lost');
  assert.equal(pages.find((p) => p.id === 'a').folderId, lib.id);
  assert.equal(pages.find((p) => p.id === 'b').folderId, lib.id);
  assert.equal(pages.find((p) => p.id === 'c').folderId, null);
  assert.equal(pages.find((p) => p.id === 'd').folderId, null);

  // The Library now opens the copy edited most recently instead of adding one.
  await page.click('#open-library');
  await page.locator('.library-entry', { hasText: 'summoner spells' }).locator('.library-have').waitFor();
  await page.click('.library-entry >> text=summoner spells');
  assert.equal(await page.evaluate(() => window.sketchbook.page().id), 'b');
  assert.equal((await page.evaluate(() => window.sketchbook.pages())).length, 4);

  assert.deepEqual(errors, []);
  await context.close();
});
