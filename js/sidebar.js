// The sidebar's page list, shown as folders and pages, like a file explorer.
// This module only draws the list and reports what the user did; app.js owns
// the data and saving. Folders come first (the Library folder on top), then
// loose pages. Pages and folders can be dragged onto a folder, or moved with
// the "⋯" menu, which also works on touch screens.

const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const DRAG_TYPE = 'application/x-sketchbook-item';

const ICON = {
  chevron: '<svg class="chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5L8 6l-3.5 3.5"/></svg>',
  folder: '<svg class="folder-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 5.5a1 1 0 011-1h4l1.6 1.8h7.4a1 1 0 011 1v8.2a1 1 0 01-1 1h-13a1 1 0 01-1-1z"/></svg>',
  book: '<svg class="folder-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 3.5h9.5a1 1 0 011 1v12h-9.5a1 1 0 01-1-1zM4 15.5a1 1 0 011-1h9.5M7 7h5"/></svg>',
  dots: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="5" cy="10" r="1.3"/><circle cx="10" cy="10" r="1.3"/><circle cx="15" cy="10" r="1.3"/></svg>',
};

function node(tag, props = {}, ...children) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...children);
  return n;
}

// Sorted folders under a parent: the Library folder first, then by name.
export function childFolders(folders, parentId) {
  return folders
    .filter((f) => (f.parentId ?? null) === parentId)
    .sort((a, b) => (b.library === true) - (a.library === true) || collator.compare(a.name, b.name));
}

// Ids of a folder and every folder inside it.
export function folderAndDescendants(folders, id) {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id);
        grew = true;
      }
    }
  }
  return ids;
}

export function createSidebar({ list, actions }) {
  let data = { pages: [], folders: [], activePage: null };
  let dragging = null; // { kind: 'page' | 'folder', id }
  let renaming = null; // folder id whose name is being edited
  let menuAnchor = null; // the "⋯" button whose menu is open
  const menu = node('div', { id: 'row-menu', role: 'menu', hidden: true });
  document.body.append(menu);

  // A folder id that exists, or null (top level). Pages that point at a
  // deleted folder show at the top level rather than vanishing.
  const folderIds = () => new Set(data.folders.map((f) => f.id));
  const placeOf = (page, ids = folderIds()) => (page.folderId && ids.has(page.folderId) ? page.folderId : null);

  function pagesIn(folderId, ids) {
    return data.pages.filter((p) => placeOf(p, ids) === folderId);
  }

  function countPages(folderId, ids) {
    const inside = folderAndDescendants(data.folders, folderId);
    return data.pages.filter((p) => inside.has(placeOf(p, ids))).length;
  }

  // ---------- Rows ----------

  function pageRow(page, depth) {
    const li = node('li', { className: 'tree-row page-row' });
    li.style.setProperty('--depth', depth);
    li.dataset.pageId = page.id;
    li.classList.toggle('active', page === data.activePage);
    li.draggable = true;

    const name = node('span', { className: 'page-name', textContent: page.title || 'Untitled' });
    name.classList.toggle('untitled', !page.title);
    const open = node('button', { className: 'page-open', type: 'button' }, name);
    // Dates only on loose pages, so folders stay compact. The full date is in the tooltip.
    if (depth === 0) open.append(node('span', { className: 'page-date', textContent: dateFormat.format(page.createdAt) }));
    open.title = `${page.title || 'Untitled'} · ${dateFormat.format(page.createdAt)}`;
    open.addEventListener('click', () => actions.openPage(page));

    const more = menuButton('Page actions', () => pageMenu(page, more));
    li.append(open, more);
    bindDrag(li, { kind: 'page', id: page.id });
    bindDrop(li, () => placeOf(page));
    return li;
  }

  function folderRow(folder, depth, ids) {
    const li = node('li', { className: 'tree-row folder-row' });
    li.style.setProperty('--depth', depth);
    li.dataset.folderId = folder.id;
    li.classList.toggle('library', folder.library === true);
    li.draggable = renaming !== folder.id;

    const toggle = node('button', { className: 'folder-toggle', type: 'button' });
    toggle.setAttribute('aria-expanded', String(!folder.collapsed));
    toggle.innerHTML = ICON.chevron + (folder.library ? ICON.book : ICON.folder);
    const count = node('span', { className: 'folder-count', textContent: String(countPages(folder.id, ids)) });

    if (renaming === folder.id) {
      const input = node('input', { className: 'folder-rename', value: folder.name, spellcheck: false });
      input.setAttribute('aria-label', 'Folder name');
      let done = false;
      const finish = (save) => {
        if (done) return;
        done = true;
        renaming = null;
        if (save && input.value.trim() && input.value.trim() !== folder.name) actions.renameFolder(folder, input.value.trim());
        else render();
      };
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      });
      input.addEventListener('blur', () => finish(true));
      input.addEventListener('click', (e) => e.stopPropagation());
      toggle.append(input);
      queueMicrotask(() => { input.focus(); input.select(); });
    } else {
      toggle.append(node('span', { className: 'folder-name', textContent: folder.name }));
      toggle.addEventListener('click', () => actions.toggleFolder(folder));
    }
    toggle.append(count);

    const more = menuButton('Folder actions', () => folderMenu(folder, more));
    li.append(toggle, more);
    bindDrag(li, { kind: 'folder', id: folder.id });
    bindDrop(li, () => folder.id);
    return li;
  }

  function menuButton(label, onClick) {
    const b = node('button', { className: 'row-more', type: 'button', title: label });
    b.setAttribute('aria-label', label);
    b.setAttribute('aria-haspopup', 'menu');
    b.innerHTML = ICON.dots;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      // A second click on the same button closes its menu.
      if (menuAnchor === b) closeMenu();
      else onClick();
    });
    return b;
  }

  // ---------- Drag and drop ----------

  function bindDrag(li, what) {
    li.addEventListener('dragstart', (e) => {
      if (renaming) return e.preventDefault();
      dragging = what;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(what));
      li.classList.add('dragging');
      closeMenu();
    });
    li.addEventListener('dragend', () => {
      dragging = null;
      li.classList.remove('dragging');
      clearDropMarks();
    });
  }

  function canDrop(targetFolderId) {
    if (!dragging) return false;
    if (dragging.kind === 'folder') {
      return targetFolderId === null || !folderAndDescendants(data.folders, dragging.id).has(targetFolderId);
    }
    return true;
  }

  function clearDropMarks() {
    list.querySelectorAll('.drop-target').forEach((n) => n.classList.remove('drop-target'));
    list.classList.remove('drop-root');
  }

  function markDrop(folderId) {
    clearDropMarks();
    if (folderId === null) list.classList.add('drop-root');
    else list.querySelector(`[data-folder-id="${CSS.escape(folderId)}"]`)?.classList.add('drop-target');
  }

  // Dropping on a folder files it there; dropping on a page files it next to that page.
  function bindDrop(li, targetOf) {
    li.addEventListener('dragover', (e) => {
      const target = targetOf();
      if (!canDrop(target)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      markDrop(target);
    });
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      drop(targetOf());
    });
  }

  function drop(target) {
    const what = dragging;
    dragging = null;
    clearDropMarks();
    if (what) moveTo(what, target);
  }

  function moveTo(what, target) {
    if (what.kind === 'page') {
      const page = data.pages.find((p) => p.id === what.id);
      if (page && placeOf(page) !== target) actions.movePage(page, target);
    } else {
      const folder = data.folders.find((f) => f.id === what.id);
      if (folder && (folder.parentId ?? null) !== target && !folderAndDescendants(data.folders, folder.id).has(target)) {
        actions.moveFolder(folder, target);
      }
    }
  }

  // Empty space in the list means "top level".
  list.addEventListener('dragover', (e) => {
    if (!canDrop(null)) return;
    e.preventDefault();
    markDrop(null);
  });
  list.addEventListener('dragleave', (e) => {
    if (!list.contains(e.relatedTarget)) clearDropMarks();
  });
  list.addEventListener('drop', (e) => {
    e.preventDefault();
    drop(null);
  });

  // ---------- Menus ----------

  function openMenu(anchor, entries) {
    menu.replaceChildren(
      ...entries.map((entry) => {
        if (entry === '-') return node('div', { className: 'menu-sep', role: 'separator' });
        if (entry.heading) return node('div', { className: 'menu-heading', textContent: entry.heading });
        const b = node('button', { className: 'menu-item', type: 'button', textContent: entry.label });
        b.setAttribute('role', 'menuitem');
        if (entry.depth) b.style.setProperty('--depth', entry.depth);
        if (entry.current) {
          b.disabled = true;
          b.classList.add('current');
        }
        if (entry.danger) b.classList.add('danger');
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          // Dangerous entries need a second click, like the old Delete button.
          if (entry.confirm && !b.classList.contains('armed')) {
            b.classList.add('armed');
            b.textContent = entry.confirm;
            return;
          }
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
    menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
    menu.style.top = `${r.bottom + 4 + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 4) : r.bottom + 4}px`;
    menuAnchor = anchor;
    anchor.closest('li')?.classList.add('menu-open');
    menu.querySelector('.menu-item:not(:disabled)')?.focus();
  }

  function closeMenu() {
    if (menu.hidden) return;
    menu.hidden = true;
    menuAnchor = null;
    list.querySelectorAll('.menu-open').forEach((n) => n.classList.remove('menu-open'));
  }

  // "Move to" choices: the top level, then every folder as an indented tree.
  function destinations(current, exclude = new Set()) {
    const out = [{ heading: 'Move to' }, { label: 'Top level', current: current === null, value: null }];
    const walk = (parentId, depth) => {
      for (const f of childFolders(data.folders, parentId)) {
        if (exclude.has(f.id)) continue;
        out.push({ label: f.name, depth, current: current === f.id, value: f.id });
        walk(f.id, depth + 1);
      }
    };
    walk(null, 1);
    return out;
  }

  function pageMenu(page, anchor) {
    const moves = destinations(placeOf(page)).map((d) =>
      d.heading ? d : { ...d, run: () => actions.movePage(page, d.value) },
    );
    openMenu(anchor, [
      ...moves,
      '-',
      { label: 'Delete page', confirm: 'Delete page? Click again', danger: true, run: () => actions.deletePage(page) },
    ]);
  }

  function folderMenu(folder, anchor) {
    const moves = destinations(folder.parentId ?? null, folderAndDescendants(data.folders, folder.id)).map((d) =>
      d.heading ? d : { ...d, run: () => actions.moveFolder(folder, d.value) },
    );
    openMenu(anchor, [
      { label: 'New page here', run: () => actions.newPageIn(folder.id) },
      { label: 'New folder inside', run: () => actions.newFolder(folder.id) },
      { label: 'Rename', run: () => startRename(folder.id) },
      '-',
      ...moves,
      '-',
      {
        label: 'Delete folder',
        confirm: 'Delete? Its pages move up',
        danger: true,
        run: () => actions.deleteFolder(folder),
      },
    ]);
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
    if (next) data = next;
    const ids = folderIds();
    const rows = [];
    const walk = (parentId, depth) => {
      for (const folder of childFolders(data.folders, parentId)) {
        rows.push(folderRow(folder, depth, ids));
        if (!folder.collapsed) walk(folder.id, depth + 1);
      }
      for (const page of pagesIn(parentId, ids)) rows.push(pageRow(page, depth));
    };
    walk(null, 0);
    closeMenu();
    list.replaceChildren(...rows);
  }

  function startRename(folderId) {
    renaming = folderId;
    render();
  }

  return { render, startRename, closeMenu };
}
