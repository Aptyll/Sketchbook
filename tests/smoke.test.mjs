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
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

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
