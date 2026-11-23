// The sidebar, laid out like the conversation list of a chat app: every page
// in one flat list, most recently used first, with when it was last used.
// Pinned pages stay on top. Below them, the Library lists the ready-made pages
// you don't have a copy of yet. Nothing is folded away or hidden in a dialog.
//
// This module only draws the list and reports what the user did; app.js owns
// the data and saving.

const DAY = 24 * 60 * 60 * 1000;
const fullDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const monthDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const monthDayYear = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });

const ICON = {
  trash: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V4.5h4V6M6 6l.7 10h6.6L14 6M8.5 9v4.5M11.5 9v4.5"/></svg>',
  dots: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="5" cy="10" r="1.3"/><circle cx="10" cy="10" r="1.3"/><circle cx="15" cy="10" r="1.3"/></svg>',
  pin: '<svg class="pin-mark" viewBox="0 0 20 20" aria-hidden="true"><path d="M8 3h4l-.5 5 2.5 2.5H6L8.5 8zM10 10.5V17"/></svg>',
  plus: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 5v10M5 10h10"/></svg>',
};

function node(tag, props = {}, ...children) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...children);
  return n;
}

// When a page was last used: opened or edited, whichever was later.
export function lastUsed(page) {
  return Math.max(page.usedAt ?? 0, page.updatedAt ?? 0, page.createdAt ?? 0);
}

// Pinned pages first, then the most recently used.
export function sortPages(pages) {
  return [...pages].sort((a, b) => (b.pinned === true) - (a.pinned === true) || lastUsed(b) - lastUsed(a));
}

const startOfDay = (t) => new Date(t).setHours(0, 0, 0, 0);

// "Just now", "5m ago", "3h ago", "Yesterday", "Mon", "Nov 21", "Nov 21, 2025".
export function relativeTime(t, now = Date.now()) {
  const mins = Math.floor((now - t) / 60000);
  if (mins < 1) return 'Just now';
  const today = startOfDay(now);
  if (t >= today) return mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
  if (t >= today - DAY) return 'Yesterday';
  if (t >= today - 6 * DAY) return weekday.format(t);
  if (new Date(t).getFullYear() === new Date(now).getFullYear()) return monthDay.format(t);
  return monthDayYear.format(t);
}

// The heading a page sits under in the list.
function bucket(t, now) {
  const today = startOfDay(now);
  if (t >= today) return 'Today';
  if (t >= today - DAY) return 'Yesterday';
  if (t >= today - 6 * DAY) return 'Previous 7 days';
  if (t >= today - 29 * DAY) return 'Previous 30 days';
  return 'Older';
}

export function createSidebar({ list, search, actions }) {
  let data = { pages: [], activePage: null, library: null, libraryError: null };
  let menuAnchor = null; // the "⋯" button whose menu is open
  const menu = node('div', { id: 'row-menu', role: 'menu', hidden: true });
  document.body.append(menu);

  // ---------- Rows ----------

  const heading = (text, extra = '') => node('li', { className: `list-heading ${extra}`.trim(), textContent: text });

  function pageRow(page, now) {
    const li = node('li', { className: 'page-row' });
    li.dataset.pageId = page.id;
    li.classList.toggle('active', page === data.activePage);
    li.classList.toggle('pinned', page.pinned === true);

    const used = lastUsed(page);
    const name = node('span', { className: 'page-name', textContent: page.title || 'Untitled' });
    name.classList.toggle('untitled', !page.title);
    const date = node('span', { className: 'page-date', textContent: relativeTime(used, now) });
    date.dataset.t = String(used);
    const open = node('button', { className: 'page-open', type: 'button' }, name, date);
    if (page.pinned) open.insertAdjacentHTML('afterbegin', ICON.pin);
    open.title = `${page.title || 'Untitled'}\nLast used ${fullDate.format(used)}`;
    open.addEventListener('click', () => actions.openPage(page));

    const del = iconButton('row-delete', 'Delete page', ICON.trash, () => actions.deletePage(page));
    const more = iconButton('row-more', 'More actions', ICON.dots, () => {
      if (menuAnchor === more) closeMenu();
      else pageMenu(page, more);
    });
    more.setAttribute('aria-haspopup', 'menu');
    li.append(open, del, more);
    return li;
  }

  function libraryRow(entry) {
    const li = node('li', { className: 'library-row' });
    li.dataset.file = entry.file;
    const name = node('span', { className: 'page-name', textContent: entry.title });
    const b = node('button', { className: 'library-add', type: 'button' }, name);
    b.insertAdjacentHTML('beforeend', ICON.plus);
    b.title = `${entry.title}\n\n${entry.description ?? ''}\n\nClick to add your own copy.`.trim();
    b.addEventListener('click', () => actions.addFromLibrary(entry));
    li.append(b);
    return li;
  }

  function iconButton(className, label, svg, onClick) {
    const b = node('button', { className: `row-btn ${className}`, type: 'button', title: label });
    b.setAttribute('aria-label', label);
    b.innerHTML = svg;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  // ---------- Menu ----------

  function openMenu(anchor, entries) {
    menu.replaceChildren(
      ...entries.map((entry) => {
        if (entry === '-') return node('div', { className: 'menu-sep', role: 'separator' });
        const b = node('button', { className: 'menu-item', type: 'button', textContent: entry.label });
        b.setAttribute('role', 'menuitem');
        if (entry.danger) b.classList.add('danger');
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          closeMenu();
          entry.run();
        });
        return b;
      }),
    );
    menu.hidden = false;
    const r = anchor.getBoundingClientRect();
    const h = menu.offsetHeight;
    const w = menu.offsetWidth;
    menu.style.left = `${Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))}px`;
    menu.style.top = `${r.bottom + 4 + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 4) : r.bottom + 4}px`;
    menuAnchor = anchor;
    anchor.closest('li')?.classList.add('menu-open');
    menu.querySelector('.menu-item')?.focus();
  }

  function closeMenu() {
    if (menu.hidden) return;
    menu.hidden = true;
    menuAnchor = null;
    list.querySelectorAll('.menu-open').forEach((n) => n.classList.remove('menu-open'));
  }

  function pageMenu(page, anchor) {
    const entries = [{ label: page.pinned ? 'Unpin' : 'Pin to top', run: () => actions.togglePin(page) }];
    if (page.library) entries.push({ label: 'Add a fresh copy', run: () => actions.freshCopy(page) });
    entries.push('-', { label: 'Delete page', danger: true, run: () => actions.deletePage(page) });
    openMenu(anchor, entries);
  }

  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !e.target.closest?.('.row-more')) closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      e.stopPropagation();
      closeMenu();
    }
  }, true);
  list.addEventListener('scroll', closeMenu);
  window.addEventListener('resize', closeMenu);

  // ---------- Render ----------

  function render(next) {
    if (next) data = { ...data, ...next };
    const now = Date.now();
    const query = search.value.trim().toLowerCase();
    const matches = (title) => !query || title.toLowerCase().includes(query);
    const rows = [];

    let last = null;
    for (const page of sortPages(data.pages)) {
      if (!matches(page.title || 'Untitled')) continue;
      const group = page.pinned ? 'Pinned' : bucket(lastUsed(page), now);
      if (group !== last) rows.push(heading(group));
      last = group;
      rows.push(pageRow(page, now));
    }
    if (query && !rows.length) rows.push(node('li', { className: 'list-msg', textContent: 'No pages match.' }));

    // The Library: ready-made pages you don't have yet. Adding one moves it up
    // into your pages; deleting your copy brings it back down here.
    const have = new Set(data.pages.map((p) => p.library).filter(Boolean));
    rows.push(heading('Library', 'library-heading'));
    if (data.libraryError) {
      rows.push(node('li', { className: 'list-msg', textContent: `Couldn't load the library: ${data.libraryError}` }));
    } else if (!data.library) {
      rows.push(node('li', { className: 'list-msg', textContent: 'Loading…' }));
    } else {
      const left = data.library.filter((e) => !have.has(e.file) && matches(e.title));
      if (!left.length) {
        const all = data.library.every((e) => have.has(e.file));
        rows.push(node('li', { className: 'list-msg', textContent: all ? 'You have every library page.' : 'No library pages match.' }));
      }
      // Entries may carry a "group" (e.g. "Start here", "Archive"); a subheading
      // shows whenever the group changes, so the index keeps each group together.
      let lastGroup;
      for (const entry of left) {
        if (entry.group && entry.group !== lastGroup) rows.push(heading(entry.group, 'library-group'));
        lastGroup = entry.group;
        rows.push(libraryRow(entry));
      }
    }

    closeMenu();
    list.replaceChildren(...rows);
    list.querySelector('.page-row.active')?.scrollIntoView({ block: 'nearest' });
  }

  // Keeps "5m ago" honest without redrawing the list (which would close menus).
  setInterval(() => {
    const now = Date.now();
    list.querySelectorAll('.page-date').forEach((d) => { d.textContent = relativeTime(Number(d.dataset.t), now); });
  }, 60000);

  search.addEventListener('input', () => render());
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      search.value = '';
      render();
      search.blur();
    } else if (e.key === 'Enter') {
      list.querySelector('.page-open, .library-add')?.click();
    }
  });

  return { render, closeMenu };
}
