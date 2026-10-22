// End-to-end smoke test: drives the real app in Chromium.
// Run with `npm test` from the sketchbook folder.

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
      res.writeHead(404).end();
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

async function drawLine(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 10, from.y + ((to.y - from.y) * i) / 10);
  }
  await page.mouse.up();
}

test('draw, write, undo, and everything survives a reload', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const { page, errors } = await openApp(context);

  // Empty page shows the hint.
  assert.equal(await page.locator('#empty-hint').isVisible(), true);

  // Draw two strokes with the pen (default tool), then undo and redo one.
  await drawLine(page, { x: 400, y: 300 }, { x: 600, y: 360 });
  await drawLine(page, { x: 400, y: 420 }, { x: 600, y: 460 });
  assert.equal(await count(page, '#ink-layer g'), 2);
  assert.equal(await page.locator('#empty-hint').isVisible(), false);
  await page.keyboard.press('Control+z');
  assert.equal(await count(page, '#ink-layer g'), 1);
  await page.keyboard.press('Control+Shift+z');
  assert.equal(await count(page, '#ink-layer g'), 2);

  // Erase the second stroke.
  await page.keyboard.press('e');
  await drawLine(page, { x: 500, y: 400 }, { x: 500, y: 480 });
  assert.equal(await count(page, '#ink-layer g'), 1);

  // Write a note with the text tool.
  await page.keyboard.press('t');
  await page.mouse.click(700, 200);
  await page.keyboard.type('Kog W max first?');
  await page.keyboard.press('Enter');
  await page.keyboard.type('test vs Lethal Tempo');
  await page.keyboard.press('Escape');
  assert.equal(await count(page, '.item.note'), 1);
  assert.equal(await page.locator('.item.note').innerText(), 'Kog W max first?\ntest vs Lethal Tempo');

  // An empty note is discarded.
  await page.mouse.click(300, 600);
  await page.keyboard.press('Escape');
  assert.equal(await count(page, '.item.note'), 1);

  // Title the page.
  await page.fill('#page-title', 'Kog build ideas');
  await page.waitForFunction(() => document.querySelector('#save-status').textContent === 'Saved');

  // Reload: everything is still there.
  await page.reload();
  await page.waitForSelector('.item.note');
  assert.equal(await count(page, '#ink-layer g'), 1);
  assert.equal(await page.locator('#page-title').inputValue(), 'Kog build ideas');
  assert.equal(await page.locator('#page-list .page-name').first().innerText(), 'Kog build ideas');

  assert.deepEqual(errors, []);
  await context.close();
});

test('select, move, recolor and delete items; pan and zoom', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const { page, errors } = await openApp(context);

  await drawLine(page, { x: 500, y: 300 }, { x: 700, y: 300 });
  await page.keyboard.press('v');
  await page.mouse.click(600, 300);
  assert.equal(await page.locator('#selection').isVisible(), true);

  // Recolor the selected stroke to red chalk.
  await page.click('.swatch[title="Red chalk"]');
  assert.equal(await page.locator('#ink-layer path.ink').getAttribute('stroke'), '#c4593f');

  // Drag it down by 100px.
  const before = await page.locator('#ink-layer path.ink').getAttribute('d');
  await drawLine(page, { x: 600, y: 300 }, { x: 600, y: 400 });
  const moved = await page.locator('#ink-layer path.ink').getAttribute('d');
  assert.notEqual(moved, before);
  assert.match(moved, /^M\d+(\.\d)? 4\d\d/);

  // Zoom with ctrl+wheel and pan with the wheel.
  await page.mouse.move(640, 400);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  assert.notEqual(await page.locator('#zoom-label').innerText(), '100%');
  await page.keyboard.press('0');
  assert.equal(await page.locator('#zoom-label').innerText(), '100%');

  // Delete the selection.
  await page.mouse.click(600, 400);
  await page.keyboard.press('Delete');
  assert.equal(await count(page, '#ink-layer g'), 0);

  assert.deepEqual(errors, []);
  await context.close();
});

test('images: paste, resize, and export/import round trip', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const { page, errors } = await openApp(context);

  // Simulate dropping a small PNG (generated in the page) onto the canvas.
  await page.evaluate(async () => {
    const c = Object.assign(document.createElement('canvas'), { width: 200, height: 100 });
    c.getContext('2d').fillRect(0, 0, 200, 100);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'rune-page.png', { type: 'image/png' }));
    document.querySelector('#stage').dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, clientX: 700, clientY: 400, bubbles: true, cancelable: true }),
    );
  });
  await page.waitForSelector('.item.image img[src^="blob:"]');
  const box = await page.locator('.item.image').boundingBox();
  assert.equal(Math.round(box.width), 200);

  // Resize from the corner handle, keeping the aspect ratio.
  const handle = await page.locator('#selection .handle').boundingBox();
  await drawLine(page, { x: handle.x + 6, y: handle.y + 6 }, { x: handle.x + 106, y: handle.y + 6 });
  const resized = await page.locator('.item.image').boundingBox();
  assert.ok(Math.abs(resized.width - 300) < 2, `width ${resized.width}`);
  assert.ok(Math.abs(resized.height - 150) < 2, `height ${resized.height}`);
  await page.waitForFunction(() => document.querySelector('#save-status').textContent === 'Saved');

  // Export a backup.
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  const path = await download.path();

  // Import it into a fresh browser profile.
  const fresh = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const { page: page2, errors: errors2 } = await openApp(fresh);
  await page2.setInputFiles('#import-input', path);
  // The imported page replaces the blank page a fresh browser starts with, and opens.
  await page2.waitForSelector('.item.image img[src^="blob:"]');
  assert.equal(await count(page2, '#page-list li'), 1);
  await page2.waitForSelector('.item.image img[src^="blob:"]');
  const restored = await page2.locator('.item.image').boundingBox();
  assert.ok(Math.abs(restored.width - 300) < 2);

  assert.deepEqual(errors, []);
  assert.deepEqual(errors2, []);
  await fresh.close();
  await context.close();
});

test('pages: create, switch and delete', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const { page, errors } = await openApp(context);

  await drawLine(page, { x: 500, y: 300 }, { x: 600, y: 300 });
  await page.click('#new-page');
  assert.equal(await count(page, '#page-list li'), 2);
  assert.equal(await count(page, '#ink-layer g'), 0);

  // Switching back shows the first page's stroke.
  await page.locator('#page-list .page-open').nth(1).click();
  assert.equal(await count(page, '#ink-layer g'), 1);

  // Two-step delete of the active page.
  const li = page.locator('#page-list li').nth(1);
  await li.hover();
  await li.locator('.page-delete').click();
  assert.equal(await count(page, '#page-list li'), 2);
  await li.locator('.page-delete').click();
  assert.equal(await count(page, '#page-list li'), 1);
  assert.equal(await count(page, '#ink-layer g'), 0);

  assert.deepEqual(errors, []);
  await context.close();
});

// A 1x1 PNG stands in for Riot's icon CDN, so tests never touch the network.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8sPXJfwAH6gNI5pMxEgAAAABJRU5ErkJggg==',
  'base64',
);
async function fakeIcons(context, { fail = false } = {}) {
  await context.route('https://ddragon.leagueoflegends.com/**', (route) =>
    fail ? route.abort() : route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }));
}

test('agent API: add, remove, undo, and it persists', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await fakeIcons(context);
  const { page, errors } = await openApp(context);

  const result = await page.evaluate(async () => {
    const sb = window.sketchbook;
    const pageId = sb.newPage('Agent test');
    const ids = await sb.add([
      { type: 'note', x: 0, y: 0, text: 'Barrier +0.70', color: 'Moss', size: 20 },
      { type: 'stroke', points: [[0, 40], [200, 40]], color: 'red chalk', width: 4 },
      { type: 'image', x: 0, y: 60, w: 48, h: 48, src: 'https://ddragon.leagueoflegends.com/cdn/x/img/spell/SummonerBarrier.png' },
    ]);
    let bad = null;
    try { await sb.add({ type: 'note', x: 'left', y: 0, text: 'x' }); } catch (e) { bad = e.message; }
    return { pageId, ids, bad, pages: sb.pages(), help: sb.help() };
  });
  assert.equal(result.ids.length, 3);
  assert.match(result.bad, /numeric x and y/);
  assert.match(result.help, /add\(item/);
  assert.equal(result.pages.find((p) => p.id === result.pageId).items, 3);
  assert.equal(await page.locator('.item.note').innerText(), 'Barrier +0.70');
  assert.equal(await page.locator('#ink-layer path.ink').getAttribute('stroke'), '#c4593f');
  await page.waitForSelector('.item.image img[src^="blob:"]');

  // One add is one undo step.
  await page.keyboard.press('Control+z');
  assert.equal(await count(page, '.item'), 0);
  await page.keyboard.press('Control+Shift+z');
  assert.equal(await count(page, '.item'), 2);

  assert.equal(await page.evaluate((id) => window.sketchbook.remove(id), result.ids[1]), 1);
  assert.equal(await count(page, '#ink-layer g'), 0);
  await page.waitForFunction(() => document.querySelector('#save-status').textContent === 'Saved');

  // The image was stored locally, so it still loads after a reload.
  await page.reload();
  await page.waitForSelector('.item.image img[src^="blob:"]');
  assert.equal(await page.locator('#page-title').inputValue(), 'Agent test');

  assert.deepEqual(errors, []);
  await context.close();
});

test('library: add the spells page twice, as two separate copies', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await fakeIcons(context);
  const { page, errors } = await openApp(context);

  for (let i = 0; i < 2; i++) {
    await page.click('#open-library');
    await page.click('.library-entry >> text=summoner spells');
    await page.waitForFunction((n) => document.querySelectorAll('#page-list li').length === n, i + 1);
  }
  assert.equal(await page.locator('#page-title').inputValue(), "Kog'Maw ADC: summoner spells");
  await page.waitForSelector('.item.image img[src^="blob:"]');
  assert.ok((await count(page, '.item.note')) > 20);
  assert.ok((await count(page, '#ink-layer g')) > 5);
  assert.ok(await page.locator('.item.note', { hasText: 'Barrier' }).first().isVisible());
  // Opened framed to fit, so it starts zoomed out.
  assert.notEqual(await page.locator('#zoom-label').innerText(), '100%');

  assert.deepEqual(errors, []);
  await context.close();
});

test('library: the u.gg keystones page opens with its icons and notes', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await fakeIcons(context);
  const { page, errors } = await openApp(context);

  await page.click('#open-library');
  await page.click('.library-entry >> text=keystones (u.gg)');
  await page.waitForFunction(() => document.querySelector('#page-title').value === "Kog'Maw ADC: keystones (u.gg)");
  await page.waitForSelector('.item.image img[src^="blob:"]');
  assert.equal(await count(page, '.item.image'), 5);
  for (const name of ['Lethal Tempo', 'Press the Attack', 'First Strike']) {
    assert.ok(await page.locator('.item.note', { hasText: name }).first().isVisible());
  }
  // One tab per patch plus a pooled tab; it opens on the newest patch.
  assert.deepEqual(await page.locator('.page-tab').allInnerTexts(), ['Patch 26.18', 'Patch 26.19', 'Patch 26.20', '3 patches pooled']);
  assert.equal(await page.locator('.page-tab[aria-selected="true"]').innerText(), 'Patch 26.20');
  assert.equal(await count(page, '.item.note >> text=What it says · Patch 26.20'), 1);
  await page.click('.page-tab >> text=3 patches pooled');
  assert.equal(await count(page, '.item.note >> text=What it says · 3 patches pooled'), 1);
  assert.equal(await count(page, '.item.note >> text=What it says · Patch 26.20'), 0);

  assert.deepEqual(errors, []);
  await context.close();
});

test('page tabs: switch, draw on a tab, and it all survives a reload', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const { page, errors } = await openApp(context);

  const { problems } = await page.evaluate(() => window.sketchbook.importPage({
    title: 'Tabs test',
    tabs: [{ id: 'a', label: 'Patch A' }, { id: 'b', label: 'Patch B' }, { label: 'no id' }],
    activeTab: 'b',
    items: [
      { type: 'note', x: 0, y: 0, text: 'shared title' },
      { type: 'note', x: 0, y: 60, text: 'only on A', tab: 'a' },
      { type: 'note', x: 0, y: 120, text: 'only on B', tab: 'b' },
      { type: 'note', x: 0, y: 180, text: 'bad tab', tab: 'zzz' },
    ],
  }));
  assert.equal(problems.length, 2); // the tab without an id, and the item with an unknown tab
  const notes = () => page.locator('.item.note').allInnerTexts();
  assert.deepEqual((await notes()).sort(), ['bad tab', 'only on B', 'shared title']);
  assert.equal(await page.locator('.page-tab[aria-selected="true"]').innerText(), 'Patch B');

  await page.click('.page-tab >> text=Patch A');
  assert.deepEqual((await notes()).sort(), ['bad tab', 'only on A', 'shared title']);

  // Ink drawn while a tab is open belongs to that tab.
  await page.keyboard.press('p');
  await drawLine(page, { x: 600, y: 500 }, { x: 800, y: 520 });
  assert.equal(await count(page, '#ink-layer g'), 1);
  await page.click('.page-tab >> text=Patch B');
  assert.equal(await count(page, '#ink-layer g'), 0);
  await page.click('.page-tab >> text=Patch A');
  assert.equal(await count(page, '#ink-layer g'), 1);
  const added = await page.evaluate(() => window.sketchbook.page().items.at(-1));
  assert.equal(added.tab, 'a');

  // Reload: the open tab and the tagged ink are kept.
  await page.waitForFunction(() => document.querySelector('#save-status').textContent === 'Saved');
  await page.reload();
  await page.waitForSelector('.page-tab');
  assert.equal(await page.locator('.page-tab[aria-selected="true"]').innerText(), 'Patch A');
  assert.equal(await count(page, '#ink-layer g'), 1);

  // A page without tabs shows no tab bar.
  await page.click('#new-page');
  assert.equal(await page.locator('#page-tabs').isVisible(), false);

  assert.deepEqual(errors, []);
  await context.close();
});

test('import a single page file: bad items are skipped, offline images fall back to their URL', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await fakeIcons(context, { fail: true });
  const { page } = await openApp(context);

  const file = {
    format: 'sketchbook-page',
    version: 1,
    page: {
      title: 'From an agent',
      items: [
        { type: 'note', x: 10, y: 10, text: 'ok' },
        { type: 'note', x: 10, y: 50 },
        { type: 'blob', x: 1 },
        { type: 'image', x: 0, y: 80, w: 64, h: 64, src: 'https://ddragon.leagueoflegends.com/cdn/x/img/spell/SummonerFlash.png' },
      ],
    },
  };
  await page.setInputFiles('#import-input', {
    name: 'agent-page.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)),
  });
  await page.waitForSelector('#toast:not([hidden])');
  assert.match(await page.locator('#toast').innerText(), /Imported 1 page, skipped 2 broken items/);
  assert.equal(await page.locator('#page-title').inputValue(), 'From an agent');
  assert.equal(await count(page, '.item.note'), 1);
  assert.match(await page.locator('.item.image img').getAttribute('src'), /^https:\/\/ddragon/);
  await context.close();
});

test('storage ring: shows usage, grows with an image, opens a panel', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const { page, errors } = await openApp(context);

  await page.waitForFunction(() => document.querySelector('#storage-used').textContent !== '');
  const before = await page.evaluate(() => window.sketchbook.storage());
  assert.equal(before.pageCount, 1);
  assert.equal(before.imageCount, 0);
  assert.ok(before.quota > 0, 'browser reports a quota');
  assert.equal(before.budget, 50 * 1024 * 1024);
  assert.equal(before.backupDue, false);

  // Add an image; the ring re-measures after saving.
  await page.evaluate(async () => {
    const c = Object.assign(document.createElement('canvas'), { width: 300, height: 300 });
    const g = c.getContext('2d');
    for (let i = 0; i < 300; i++) { g.fillStyle = `hsl(${i},60%,50%)`; g.fillRect(i, (i * 7) % 300, 40, 40); }
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'chart.png', { type: 'image/png' }));
    document.querySelector('#stage').dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, clientX: 700, clientY: 400, bubbles: true, cancelable: true }),
    );
  });
  await page.waitForSelector('.item.image');
  const after = await page.evaluate(() => window.sketchbook.storage());
  assert.equal(after.imageCount, 1);
  assert.ok(after.imageBytes > 1000, `image bytes ${after.imageBytes}`);
  assert.ok(after.total > before.total);

  // The panel opens on click and closes with Escape.
  assert.equal(await page.locator('#storage-pop').isVisible(), false);
  await page.click('#storage-ring');
  assert.equal(await page.locator('#storage-pop').isVisible(), true);
  assert.match(await page.locator('#storage-breakdown').innerText(), /1 page .* 1 image/);
  assert.match(await page.locator('#storage-used').innerText(), / \/ 50 MB$/);
  assert.match(await page.locator('#storage-quota').innerText(), /browser allows up to .* for this site/);
  assert.equal(await page.locator('#storage-backup').innerText(), 'No backup exported yet.');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#storage-pop').isVisible(), false);

  assert.deepEqual(errors, []);
  await context.close();
});

test('storage ring: backup reminder after 7 days, cleared by an export', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  await context.addInitScript(() => {
    localStorage.setItem('sketchbook:last-backup', String(Date.now() - 9 * 24 * 60 * 60 * 1000));
  });
  const { page, errors } = await openApp(context);
  await page.waitForSelector('#storage-ring.remind');
  await page.click('#storage-ring');
  assert.match(await page.locator('#storage-backup').innerText(), /^Last backup 9 days ago\. Export one/);

  await Promise.all([page.waitForEvent('download'), page.click('#storage-export')]);
  await page.waitForSelector('#storage-ring:not(.remind)');
  assert.equal(await page.locator('#storage-backup').innerText(), 'Last backup today.');

  assert.deepEqual(errors, []);
  await context.close();
});
