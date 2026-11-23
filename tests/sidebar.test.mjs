// The chat-style sidebar: pages sorted by last use with dates, one-click delete
// with undo, pins, search, quick switching, the inline Library, phones, and
// library pages saved before copies were tagged.

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
const names = (page) => page.locator('#page-list .page-row .page-name').allInnerTexts();
// textContent, because CSS shows headings in capitals.
const headings = (page) => page.locator('#page-list .list-heading:not(.library-heading):not(.library-group)').evaluateAll((ns) => ns.map((n) => n.textContent));
const waitNames = (page, list) => page.waitForFunction((want) => [...document.querySelectorAll('#page-list .page-row .page-name')].map((n) => n.textContent).join('|') === want, list.join('|'));

const H = 3600e3;
const DAY = 24 * H;

// Writes pages straight into the database, as if they were saved on earlier days.
async function seed(context, pages, { lastPage } = {}) {
  const setup = await context.newPage();
  await setup.goto(`${base}no-such-page`);
  await setup.evaluate(({ pages, lastPage }) => new Promise((resolve, reject) => {
    const req = indexedDB.open('sketchbook', 2);
    req.onupgradeneeded = () => {
      for (const s of ['pages', 'blobs', 'folders']) req.result.createObjectStore(s, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const tx = req.result.transaction('pages', 'readwrite');
      const now = Date.now();
      for (const p of pages) {
        const t = now - p.ago;
        tx.objectStore('pages').put({ createdAt: t - 1000, updatedAt: t, view: { x: 0, y: 0, zoom: 1 }, items: [], ...p, ago: undefined });
      }
      tx.oncomplete = () => { req.result.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
    if (lastPage) localStorage.setItem('sketchbook:last-page', lastPage);
  }), { pages, lastPage });
  await setup.close();
}

test('sidebar: pages sorted by last use under date headings, with dates, reordered on switch', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await seed(context, [
    { id: 'a', title: 'Lane notes', ago: 2 * H },
    { id: 'b', title: 'VOD review', ago: DAY + H },
    { id: 'c', title: 'Old idea', ago: 60 * DAY },
    { id: 'd', title: 'Item spikes', ago: 3 * DAY },
  ], { lastPage: 'a' });
  const { page, errors } = await openApp(context);

  assert.deepEqual(await names(page), ['Lane notes', 'VOD review', 'Item spikes', 'Old idea']);
  assert.deepEqual(await headings(page), ['Today', 'Yesterday', 'Previous 7 days', 'Older']);
  // Opening a page counts as using it.
  assert.equal(await page.locator('.page-row.active .page-date').innerText(), 'Just now');
  assert.equal(await page.locator('.page-row', { hasText: 'VOD review' }).locator('.page-date').innerText(), 'Yesterday');
  assert.match(await page.locator('.page-row', { hasText: 'Old idea' }).locator('.page-open').getAttribute('title'), /Last used/);

  // Switching moves the page to the top, and the order survives a reload.
  await page.click('.page-row >> text=Old idea');
  assert.equal(await page.locator('#page-title').inputValue(), 'Old idea');
  assert.deepEqual(await names(page), ['Old idea', 'Lane notes', 'VOD review', 'Item spikes']);
  // ` flips back to the page used before, and again.
  await page.keyboard.press('`');
  assert.equal(await page.locator('#page-title').inputValue(), 'Lane notes');
  await page.keyboard.press('`');
  assert.equal(await page.locator('#page-title').inputValue(), 'Old idea');

  await saved(page);
  await page.reload();
  await page.waitForSelector('#page-list .page-row');
  assert.deepEqual(await names(page), ['Old idea', 'Lane notes', 'VOD review', 'Item spikes']);
  assert.equal(await page.locator('#page-title').inputValue(), 'Old idea');

  assert.deepEqual(errors, []);
  await context.close();
});

test('sidebar: one-click delete with undo, and a delete without undo sticks', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await seed(context, [
    { id: 'a', title: 'Keep me', ago: H },
    { id: 'b', title: 'Delete me', ago: 2 * H, items: [{ id: 'n1', type: 'note', x: 0, y: 0, text: 'hello', color: '#ddd3c1', size: 20 }] },
  ], { lastPage: 'a' });
  const { page, errors } = await openApp(context);

  const row = page.locator('.page-row', { hasText: 'Delete me' });
  await row.hover();
  await row.locator('.row-delete').click();
  assert.deepEqual(await names(page), ['Keep me']);
  assert.match(await page.locator('#toast').innerText(), /Deleted "Delete me"/);
  await page.click('#toast .toast-action');
  await waitNames(page, ['Delete me', 'Keep me']);
  assert.equal(await page.locator('.item.note').innerText(), 'hello');

  // Deleting the open page opens the next most recent one.
  const active = page.locator('.page-row.active');
  await active.hover();
  await active.locator('.row-delete').click();
  assert.equal(await page.locator('#page-title').inputValue(), 'Keep me');
  await saved(page);
  await page.reload();
  await page.waitForSelector('#page-list .page-row');
  assert.deepEqual(await names(page), ['Keep me']);

  // Deleting the last page leaves a fresh blank one; undo brings it back and drops the blank.
  const last = page.locator('.page-row', { hasText: 'Keep me' });
  await last.hover();
  await last.locator('.row-delete').click();
  assert.deepEqual(await names(page), ['Untitled']);
  await page.click('#toast .toast-action');
  await waitNames(page, ['Keep me']);

  assert.deepEqual(errors, []);
  await context.close();
});

test('sidebar: pin keeps a page on top; search filters pages and the Library', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  await seed(context, [
    { id: 'a', title: 'Climb plan notes', ago: 5 * DAY },
    { id: 'b', title: 'Draven lane', ago: H },
  ], { lastPage: 'b' });
  const { page, errors } = await openApp(context);

  const row = page.locator('.page-row', { hasText: 'Climb plan notes' });
  await row.hover();
  await row.locator('.row-more').click();
  await page.click('#row-menu >> text=Pin to top');
  assert.deepEqual(await names(page), ['Climb plan notes', 'Draven lane']);
  assert.deepEqual(await headings(page), ['Pinned', 'Today']);
  assert.equal(await count(page, '.page-row.pinned .pin-mark'), 1);

  await page.keyboard.press('/');
  await page.keyboard.type('draven');
  assert.deepEqual(await names(page), ['Draven lane']);
  assert.match(await page.locator('#page-list').innerText(), /No library pages match/);
  await page.locator('#page-search').fill('summoner');
  assert.deepEqual(await names(page), []);
  assert.equal(await count(page, '.library-row'), 1);
  await page.locator('#page-search').press('Escape');
  assert.deepEqual(await names(page), ['Climb plan notes', 'Draven lane']);

  // Pins and last-used times survive a backup round trip.
  await saved(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
  const other = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const { page: page2, errors: errors2 } = await openApp(other);
  await page2.setInputFiles('#import-input', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page2.locator('.page-row.pinned', { hasText: 'Climb plan notes' }).waitFor();
  assert.equal((await names(page2))[0], 'Climb plan notes');

  assert.deepEqual(errors, []);
  assert.deepEqual(errors2, []);
  await context.close();
  await other.close();
});

test('sidebar: library pages are listed in the sidebar and move up into your pages when added', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.route('https://ddragon.leagueoflegends.com/**', (route) => route.abort());
  const { page, errors } = await openApp(context);
  const index = JSON.parse(await readFile(join(ROOT, 'library/index.json'), 'utf8')).pages;
  await page.waitForSelector('.library-row');
  assert.equal(await count(page, '.library-row'), index.length);

  await page.click('.library-row >> text=Kog\'Maw ADC: summoner spells');
  await page.waitForFunction(() => document.querySelector('#page-title').value === "Kog'Maw ADC: summoner spells");
  // It is now one of your pages (the blank start page is gone), and no longer offered below.
  assert.deepEqual(await names(page), ["Kog'Maw ADC: summoner spells"]);
  assert.equal(await count(page, '.library-row'), index.length - 1);
  assert.equal(await count(page, '.library-row[data-file="kogmaw-adc-summoner-spells.json"]'), 0);

  // "Add a fresh copy" makes a second, clean one.
  const row = page.locator('.page-row').first();
  await row.hover();
  await row.locator('.row-more').click();
  await page.click('#row-menu >> text=Add a fresh copy');
  await page.waitForFunction(() => document.querySelectorAll('#page-list .page-row').length === 2);

  // Deleting every copy puts it back in the Library.
  for (let i = 0; i < 2; i++) {
    const r = page.locator('.page-row').first();
    await r.hover();
    await r.locator('.row-delete').click();
  }
  await page.locator('.library-row[data-file="kogmaw-adc-summoner-spells.json"]').waitFor();

  assert.deepEqual(errors, []);
  await context.close();
});

test('sidebar on a phone: it overlays the page and closes when you pick one', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await seed(context, [
    { id: 'a', title: 'First', ago: H },
    { id: 'b', title: 'Second', ago: 2 * H },
  ], { lastPage: 'a' });
  const { page, errors } = await openApp(context);
  assert.ok(await page.evaluate(() => document.body.classList.contains('sidebar-hidden')));
  await page.click('#toggle-sidebar');
  assert.ok(await page.locator('#scrim').isVisible());
  // Delete and more are always shown on touch screens, next to the date.
  const row = page.locator('.page-row', { hasText: 'Second' });
  assert.ok(await row.locator('.row-delete').isVisible());
  assert.ok(await row.locator('.page-date').isVisible());
  await row.locator('.page-open').tap();
  assert.equal(await page.locator('#page-title').inputValue(), 'Second');
  assert.ok(await page.evaluate(() => document.body.classList.contains('sidebar-hidden')));
  // Tapping outside closes it too.
  await page.click('#toggle-sidebar');
  await page.locator('#scrim').click({ position: { x: 370, y: 400 } });
  assert.ok(await page.evaluate(() => document.body.classList.contains('sidebar-hidden')));

  assert.deepEqual(errors, []);
  await context.close();
});

test('upgrade: untagged library copies saved earlier are recognised, so the Library does not offer them again', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await seed(context, [
    { id: 'a', title: "Kog'Maw ADC: summoner spells", ago: 3 * DAY, source: { stats: 'x' } },
    { id: 'c', title: "Kog'Maw ADC: summoner spells", ago: 4 * DAY }, // hand-made, no source
    { id: 'd', title: 'My notes', ago: DAY },
  ]);
  const { page, errors } = await openApp(context);
  await page.waitForSelector('.library-row');
  assert.equal(await count(page, '.library-row[data-file="kogmaw-adc-summoner-spells.json"]'), 0);
  assert.equal((await page.evaluate(() => window.sketchbook.pages())).length, 3, 'no page is lost');
  // Only the copy with a source is tagged, so only it offers a fresh copy.
  const tagged = page.locator('.page-row[data-page-id="a"]');
  await tagged.hover();
  await tagged.locator('.row-more').click();
  assert.equal(await count(page, '#row-menu >> text=Add a fresh copy'), 1);
  await page.keyboard.press('Escape');
  const plain = page.locator('.page-row[data-page-id="c"]');
  await plain.hover();
  await plain.locator('.row-more').click();
  assert.equal(await count(page, '#row-menu >> text=Add a fresh copy'), 0);

  assert.deepEqual(errors, []);
  await context.close();
});
