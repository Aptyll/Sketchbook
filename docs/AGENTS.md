# Using the sketchbook as an AI agent

This is the guide for an AI agent (or a script) that wants to write and draw in the sketchbook.
There are three ways in, from most to least direct.

| Route | When to use it | Needs |
| --- | --- | --- |
| 1. `window.sketchbook` in the live page | The agent has a browser on the site (for example Claude in Chrome on aptyll.github.io/Sketchbook) | Browser control |
| 2. A library page in this repo | A page worth keeping and sharing, rebuilt from data | Git access |
| 3. A page file to import | A one-off page handed to Noah | Nothing, just a `.json` file |

All three use the same page format, below. Everything an agent adds is checked and cleaned by `js/format.js`; bad items are skipped with a reason instead of breaking the page.

## The page format

```json
{
  "format": "sketchbook-page",
  "version": 1,
  "page": {
    "title": "Kog'Maw: Barrier vs Heal",
    "fit": true,
    "source": { "stats": "https://coachless.gg/...", "pulledAt": "2026-10-22" },
    "items": [
      { "type": "note", "x": 0, "y": 0, "text": "Barrier +0.70 WPA", "color": "Moss", "size": 22 },
      { "type": "stroke", "points": [[0, 40], [220, 40]], "color": "Red chalk", "width": 3 },
      { "type": "image", "x": 0, "y": 60, "w": 56, "h": 56,
        "src": "https://ddragon.leagueoflegends.com/cdn/16.21.1/img/spell/SummonerBarrier.png" }
    ]
  }
}
```

- **Coordinates** are world units. At 100% zoom, 1 unit is 1 screen pixel. `x` grows right, `y` grows down. Pick any origin; `"fit": true` frames the whole page the first time it opens.
- **note**: `x`, `y` is the top-left corner. `text` may contain `\n`. `size` is the font size (default 22; the toolbar sizes are 16, 22 and 34). Notes wrap at 32 times their font size (512 units at size 16), and fonts differ between computers, so put explicit line breaks in long text and leave some room.
- **stroke**: freehand ink through `points` (`[x, y]` pairs), smoothed when drawn. `width` defaults to 3. For a hand-drawn look, add points every ~12 units with a little jitter (see `tools/sketch.mjs`).
- **image**: `w`, `h` set the size on the canvas. `src` is an `https://` or `data:image/...` URL. On import or `add`, the app downloads it and keeps a copy in the browser, so it works offline and goes into backups. If the download fails, the page shows it straight from `src`.
- **color**: a palette name (`Parchment`, `Sepia`, `Red chalk`, `Slate`, `Moss`) or a hex value like `#c4593f`. Stick to the palette so pages look like they belong.
- **source** (optional): where the numbers came from. Always include it for data pages.
- `id`s are optional; they are created when missing.
- **tabs** (optional): `"tabs": [{ "id": "patch-26.20", "label": "Patch 26.20" }, ...]` plus `"activeTab"`. A tab bar shows under the title and Noah clicks between tabs. Give an item `"tab": "<id>"` to show it only on that tab; items without `tab` show on every tab (titles, labels, axes). Up to 12 tabs; an item naming an unknown tab is shown on every tab and reported. Anything Noah adds while a tab is open belongs to that tab. In `tools/sketch.mjs`, call `s.tab(id)` before adding a tab's items and `s.tab(null)` for shared ones, then pass `tabs` to `s.page()`.

A full backup (Export) uses `{ "format": "sketchbook-backup", "version": 1, "pages": [...], "blobs": [...] }`; Import accepts either.

## 1. The in-page API

The site exposes `window.sketchbook`. Run `sketchbook.help()` in the page for a summary.

```js
sketchbook.newPage("Kog'Maw: item spikes");          // creates and opens a page, returns its id
await sketchbook.add([
  { type: 'note', x: 0, y: 0, text: 'Rageblade first', size: 34 },
  { type: 'stroke', points: [[0, 50], [300, 50]], color: 'Red chalk' },
]);                                                     // returns the new ids
sketchbook.page();                                      // read the open page (a copy)
sketchbook.remove(id);                                  // delete items by id
await sketchbook.importPage({ title: '...', fit: true, items: [...] }); // a whole page at once
sketchbook.fit();                                       // zoom to show everything
sketchbook.tab('patch-26.19');                          // switch the open page's tab (page().tabs lists them)
sketchbook.storage();                                   // { total, pageBytes, imageBytes, usage, quota, persisted, ... }
sketchbook.pages(); sketchbook.open(id);                // list and switch pages
```

Every `add` or `remove` is one undo step, so Noah can press Ctrl+Z to take back anything an agent did.
Pages stay in this browser's storage. The only network requests are downloads of image `src` URLs.

## 2. Library pages

`library/index.json` lists ready-made pages; the **Library** button in the sidebar adds a fresh copy of one (so re-adding never overwrites Noah's scribbles).

To add one:

1. Put the raw numbers in `data/<name>.json`, with sources, patch and the date pulled.
2. Write a generator in `tools/` using `tools/sketch.mjs` (notes, images, wobbly lines, loops, arrows), writing `library/<name>.json`.
3. Add an entry to `library/index.json`, run `npm test`, open a PR.

`tools/build-kogmaw-spells.mjs` is the worked example. `tools/build-kogmaw-keystones-ugg.mjs` is a second one, for u.gg's raw win rates (it draws sample-size whiskers). To refresh it after a new patch: update `data/kogmaw-adc-spells.json`, then `node tools/build-kogmaw-spells.mjs`.

## 3. A page file

Write the format above to a `.json` file and hand it over; **Import** in the sidebar adds it.

## Data sources and honesty

- **Stats**: sites like coachless.gg, u.gg and op.gg. Always record the site, patch, rank filter, sample size and date pulled. Coachless reports WPA (win rate minus the average pre-game win probability), which removes much of the "good players pick it" bias that raw win rate has.
- **Numbers**: the LoL wiki (wiki.leagueoflegends.com) for cooldowns, scaling and patch history. Note the level you quote.
- **Icons**: Riot's Data Dragon, `https://ddragon.leagueoflegends.com/cdn/<version>/img/<spell|item|champion>/<file>.png`; the latest version is the first entry of `https://ddragon.leagueoflegends.com/api/versions.json`.
- Say how big the sample is and what it can't tell you. A gap smaller than the noise is a lean, not a result.
