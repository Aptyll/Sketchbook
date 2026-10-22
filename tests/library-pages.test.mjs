// Checks every page listed in library/index.json without a browser:
// the file exists, it is in the page format, and no item gets dropped.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { normalizePage } from '../js/format.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const index = JSON.parse(await readFile(`${ROOT}library/index.json`, 'utf8'));

test('library index lists each file once', () => {
  const files = index.pages.map((p) => p.file);
  assert.equal(new Set(files).size, files.length);
});

for (const entry of index.pages) {
  test(`library page is valid: ${entry.file}`, async () => {
    const file = JSON.parse(await readFile(`${ROOT}library/${entry.file}`, 'utf8'));
    assert.equal(file.format, 'sketchbook-page');
    const { page, problems } = normalizePage(file.page);
    assert.deepEqual(problems, []);
    assert.equal(page.title, entry.title);
    assert.ok(page.items.length > 0);
    assert.ok(file.page.source?.pulledAt, 'data pages record when the numbers were pulled');
  });
}
