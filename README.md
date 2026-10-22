# Sketchbook

A minimalist, dark sketchbook and journal for League of Legends theorycrafting.
Think Leonardo's notebooks: ink sketches, scribbled notes and pasted images on a blank canvas, one page per idea.

## What it does

- **Pages**: a journal of dated pages in the sidebar. Each page is an infinite canvas.
- **Ink**: freehand pen in five muted colors (parchment, sepia, red chalk, slate, moss) and three sizes.
- **Notes**: click with the text tool to write anywhere.
- **Images**: paste (Ctrl+V), drag and drop, or use the image button. Resize from the corner handle.
- **Undo/redo**, autosave, and a backup file you can export and import.

## Shortcuts

| Key | Action |
| --- | --- |
| `V` | Select and move (double-click a note to edit it, double-click empty space to write) |
| `H` or hold `Space` | Pan |
| `P` | Pen |
| `E` | Eraser (removes ink) |
| `T` | Text |
| `I` | Add image |
| `N` | New page |
| `\` | Show or hide the pages sidebar |
| `Delete` | Delete the selected item |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| Scroll / `Ctrl` + scroll | Pan / zoom |
| `0` | Reset zoom to 100% |

## Where your data lives

Everything is saved in your browser (IndexedDB), on the device you use it on. Nothing is uploaded, so the site works offline and the repo never contains your notes.
That also means clearing site data for the page, or switching browser or device, starts you fresh.
Use **Export backup** now and then: it downloads one `.json` file with every page and image, which **Import** brings back on any browser.

## Development

Plain HTML, CSS and JavaScript modules. No build step and no runtime dependencies.

```sh
npm start        # serves the site at http://localhost:3000
npm install      # once, for the tests
npx playwright install chromium
npm test         # end-to-end tests in a real browser
```

Files:

- `index.html`, `css/style.css`: layout and look.
- `js/app.js`: canvas, tools, pages, keyboard and clipboard.
- `js/ink.js`: stroke smoothing and hit testing.
- `js/db.js`: IndexedDB storage.
- `js/backup.js`: export and import.
- `tests/smoke.test.mjs`: end-to-end tests.

## Hosting

`.github/workflows/pages.yml` runs the tests on every push and pull request, and deploys the site to GitHub Pages on pushes to `main`.
One-time setup: in the repo's **Settings > Pages**, set **Source** to **GitHub Actions**.
