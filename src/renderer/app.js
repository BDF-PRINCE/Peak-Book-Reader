/* ===== Peak Reader - Renderer Process ===== */
/* ALL Node operations go through window.electron (IPC bridge) */

// ===== State =====
let previousPage = 'home';
let currentPage = 'home';
let currentBook = null;
let currentTheme = 'light';
let sidebarOpen = true;
let allBooks = [];
let shelfs = [];
let typingInterval = null;
let searchTimeout = null;
let bookStartTime = null;
let epubRendition = null;
let pdfDoc = null;
let comicImages = [];
let comicIndex = 0;
let comicTotal = 0;
let textContent = '';

// ===== Init =====
document.addEventListener('DOMContentLoaded', async () => {
  // Load preferences from SQLite Settings table via IPC
  const prefs = await window.electron.settingGetAll();
  currentTheme = prefs.theme || 'light';
  document.documentElement.setAttribute('data-theme', currentTheme);

  // Refresh book list
  await refreshBookList();
  setupNavigation();
  setupSidebar();
  setupImport();
  setupSelectionMenu();
  setupModal();
  navigateTo('home');
});

// ===== Preferences (SQLite-backed via IPC) =====
async function savePreferences() {
  await window.electron.settingSet('theme', currentTheme);
}

async function loadSidebarState() {
  const state = await window.electron.settingGet('sidebarOpen');
  if (state !== null) {
    sidebarOpen = state;
    const sidebar = document.getElementById('sidebar');
    if (!sidebarOpen) sidebar.classList.add('collapsed');
  }
}

// ===== Navigation =====
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      navigateTo(item.getAttribute('data-page'));
    });
  });
}

async function navigateTo(page) {
  previousPage = currentPage;
  currentPage = page;

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-page') === page);
  });

  // Close reader state
  currentBook = null;
  epubRendition = null;
  pdfDoc = null;
  document.getElementById('selectionMenu').classList.remove('show');

  const content = document.getElementById('contentArea');

  switch (page) {
    case 'home': await renderHome(content); break;
    case 'continue': await renderContinue(content); break;
    case 'favourites': await renderFavourites(content); break;
    case 'quotes': await renderQuotes(content); break;
    case 'all-books': await renderAllBooks(content); break;
    case 'shelfs': await renderShelfs(content); break;
    case 'stats': await renderStats(content); break;
    default: await renderHome(content);
  }
}

// ===== Sidebar =====
function setupSidebar() {
  document.getElementById('hamburgerBtn').addEventListener('click', async () => {
    const sidebar = document.getElementById('sidebar');
    sidebarOpen = !sidebarOpen;
    sidebar.classList.toggle('collapsed', !sidebarOpen);
    await window.electron.settingSet('sidebarOpen', sidebarOpen);
  });
  // Load persisted state
  loadSidebarState();
}

// ===== Import =====
function setupImport() {
  document.getElementById('importBtn').addEventListener('click', async () => {
    const files = await window.electron.importBooks();
    if (!files.length) return;
    await importBooks(files);
  });
}

async function importBooks(filePaths) {
  const overlay = document.getElementById('importOverlay');
  const progressText = document.getElementById('importProgress');
  const barFill = document.getElementById('importBarFill');

  overlay.classList.add('show');

  // Batch extract metadata via IPC (main process)
  const bookDatas = await window.electron.extractMetadataBatch(filePaths);

  for (let i = 0; i < bookDatas.length; i++) {
    const bookData = bookDatas[i];
    try {
      progressText.textContent = `Importing ${i + 1}/${bookDatas.length}...`;
      barFill.style.width = `${((i + 1) / bookDatas.length) * 100}%`;

      const existing = await window.electron.dbGetBookById(bookData.id);
      if (!existing) {
        await window.electron.dbAddBook(bookData);

        // Save cover
        if (bookData.coverBuffer) {
          try {
            await window.electron.saveCover({ id: bookData.id, buffer: bookData.coverBuffer });
          } catch (e) { /* ignore */ }
        }
      }
    } catch (e) {
      console.error('Import failed for:', bookData.path, e.message);
    }
  }

  overlay.classList.remove('show');
  showToast(`${bookDatas.length} book(s) imported successfully!`);
  await refreshBookList();
  await navigateTo(currentPage);
}

// ===== Book List Refresh =====
async function refreshBookList() {
  allBooks = await window.electron.dbGetBooks();
  shelfs = await window.electron.dbGetShelfs();
  document.getElementById('bookCount').textContent = allBooks.length;
}

// ===== Toast =====
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ===== Modal =====
function setupModal() {
  document.getElementById('modalCancel').addEventListener('click', () => {
    document.getElementById('modalOverlay').classList.remove('show');
  });
}

function showModal(title, bodyHTML, onConfirm) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHTML;
  document.getElementById('modalOverlay').classList.add('show');

  const confirmBtn = document.getElementById('modalConfirm');
  confirmBtn.onclick = () => {
    document.getElementById('modalOverlay').classList.remove('show');
    if (onConfirm) onConfirm();
  };
}

// ===== Selection Menu (FIXED: openExternal for dictionary/translate) =====
function setupSelectionMenu() {
  const menu = document.getElementById('selectionMenu');

  document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    if (selection.toString().trim().length > 0 && currentBook) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      menu.style.left = rect.left + 'px';
      menu.style.top = (rect.bottom + 8) + 'px';
      menu.classList.add('show');
      menu.dataset.selectedText = selection.toString().trim();
    } else {
      menu.classList.remove('show');
    }
  });

  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && !e.target.classList.contains('selection-menu-btn')) {
      menu.classList.remove('show');
    }
  });

  menu.querySelectorAll('.selection-menu-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.getAttribute('data-action');
      const text = menu.dataset.selectedText;
      await handleSelectionAction(action, text);
      menu.classList.remove('show');
      window.getSelection().removeAllRanges();
    });
  });
}

async function handleSelectionAction(action, text) {
  if (!currentBook) return;

  switch (action) {
    case 'copy':
      await navigator.clipboard.writeText(text);
      showToast('Copied to clipboard');
      break;
    case 'highlight':
      await window.electron.dbAddAnnotation(currentBook.id, text, 'highlight');
      showToast('Text highlighted');
      break;
    case 'quote':
      await window.electron.dbAddQuote(currentBook.id, text);
      showToast('Quote saved');
      break;
    case 'note':
      showModal('Add Note', `
        <textarea class="modal-input" id="noteText" rows="4" placeholder="Write your note..." style="width:100%;resize:vertical;"></textarea>
      `, async () => {
        const note = document.getElementById('noteText').value;
        if (note.trim()) {
          await window.electron.dbAddAnnotation(currentBook.id, text, 'note', '', note);
          showToast('Note saved');
        }
      });
      break;
    case 'define':
      // FIXED: use shell.openExternal instead of window.open
      const word = text.split(' ')[0];
      await window.electron.openExternal(`https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(word)}`);
      break;
    case 'translate':
      // FIXED: use shell.openExternal instead of window.open
      await window.electron.openExternal(`https://translate.google.com/?sl=auto&tl=en&text=${encodeURIComponent(text)}`);
      break;
    case 'search':
      showToast('Search in book: "' + text.substring(0, 30) + '..."');
      break;
    case 'share':
      await navigator.clipboard.writeText(text);
      showToast('Text copied for sharing');
      break;
  }
}

// ===== Book Card Renderer =====
function createBookCard(book, size = 'normal') {
  const card = document.createElement('div');
  card.className = 'book-card';
  card.setAttribute('data-id', book.id);

  const coverDiv = document.createElement('div');
  coverDiv.className = 'book-cover';

  const favIndicator = document.createElement('div');
  favIndicator.className = 'fav-indicator';
  if (book.favourite) favIndicator.innerHTML = '&#9829;';
  coverDiv.appendChild(favIndicator);

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.alt = book.title;

  // Load cover via IPC
  (async () => {
    try {
      const coverPath = await window.electron.getCoverPath(book.id);
      if (coverPath) {
        img.src = 'file://' + coverPath;
      } else {
        showPlaceholder(coverDiv, img);
      }
    } catch (e) {
      showPlaceholder(coverDiv, img);
    }
  })();
  coverDiv.appendChild(img);
  card.appendChild(coverDiv);

  const nameEl = document.createElement('div');
  nameEl.className = 'book-card-name';
  nameEl.textContent = book.title;
  nameEl.title = book.title;
  card.appendChild(nameEl);

  const statusEl = document.createElement('div');
  statusEl.className = 'book-card-status';
  statusEl.textContent = getStatusLabel(book.status);
  card.appendChild(statusEl);

  // Progress bar
  if (book.progress_percent > 0) {
    const progress = document.createElement('div');
    progress.className = 'progress-bar';
    progress.innerHTML = `<div class="progress-bar-fill" style="width:${book.progress_percent}%"></div>`;
    card.appendChild(progress);
  }

  // 3-dot menu
  const menu = document.createElement('div');
  menu.className = 'book-card-menu';
  menu.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
    </svg>
  `;
  const dropdown = document.createElement('div');
  dropdown.className = 'dropdown-menu';
  dropdown.innerHTML = `
    <div class="dropdown-group-label">Mark as</div>
    <div class="dropdown-item" data-status="unread">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>
      Unread
    </div>
    <div class="dropdown-item" data-status="reading">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
      Reading
    </div>
    <div class="dropdown-item" data-status="finished">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
      Finished
    </div>
    <div class="dropdown-divider"></div>
    <div class="dropdown-item" data-action="favourite">
      ${book.favourite ? '&#9829;' : '&#9825;'}
      ${book.favourite ? 'Unfavourite' : 'Favourite'}
    </div>
    <div class="dropdown-item" data-action="shelfs">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
      Add to Shelf
    </div>
    <div class="dropdown-item" data-action="info">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      Book Info
    </div>
    <div class="dropdown-divider"></div>
    <div class="dropdown-item" data-action="delete" style="color:#e74c3c;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
      Remove from Library
    </div>
  `;
  card.appendChild(menu);
  card.appendChild(dropdown);

  // Menu toggle
  menu.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.dropdown-menu.show').forEach(d => {
      if (d !== dropdown) d.classList.remove('show');
    });
    dropdown.classList.toggle('show');
  });

  // Dropdown actions
  dropdown.addEventListener('click', async (e) => {
    e.stopPropagation();
    const item = e.target.closest('.dropdown-item');
    if (!item) return;

    const status = item.getAttribute('data-status');
    const action = item.getAttribute('data-action');

    if (status) {
      await window.electron.dbUpdateBook(book.id, { status });
      book.status = status;
      await refreshBookList();
      showToast(`Marked as ${getStatusLabel(status)}`);
      await navigateTo(currentPage);
    } else if (action === 'favourite') {
      await window.electron.dbUpdateBook(book.id, { favourite: book.favourite ? 0 : 1 });
      book.favourite = !book.favourite;
      await refreshBookList();
      showToast(book.favourite ? 'Added to favourites' : 'Removed from favourites');
      await navigateTo(currentPage);
    } else if (action === 'shelfs') {
      await showShelfPicker(book.id);
    } else if (action === 'info') {
      showModal(book.title, `
        <p><strong>Path:</strong> ${book.path}</p>
        <p><strong>Format:</strong> ${book.format.toUpperCase()}</p>
        <p><strong>Status:</strong> ${getStatusLabel(book.status)}</p>
        <p><strong>Progress:</strong> ${book.progress_percent}%</p>
        <p><strong>Time Spent:</strong> ${formatTime(book.total_time_spent)}</p>
        <p><strong>Added:</strong> ${new Date(book.date_added * 1000).toLocaleDateString()}</p>
      `);
    } else if (action === 'delete') {
      showModal('Remove Book', `<p>Remove "${book.title}" from your library?</p><small>The file on disk will not be deleted.</small>`, async () => {
        await window.electron.deleteCover(book.id).catch(() => {});
        await window.electron.dbDeleteBook(book.id);
        await refreshBookList();
        showToast('Book removed');
        await navigateTo(currentPage);
      });
    }

    dropdown.classList.remove('show');
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target)) dropdown.classList.remove('show');
  });

  // Card click - open book
  card.addEventListener('click', (e) => {
    if (e.target.closest('.book-card-menu') || e.target.closest('.dropdown-menu')) return;
    openBook(book);
  });

  return card;
}

function showPlaceholder(coverDiv, imgElement) {
  const placeholder = document.createElement('div');
  placeholder.className = 'book-cover-placeholder';
  placeholder.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>';
  coverDiv.appendChild(placeholder);
  if (imgElement) imgElement.style.display = 'none';
}

function getStatusLabel(status) {
  switch (status) {
    case 'unread': return 'Unread';
    case 'reading': return 'Reading';
    case 'finished': return 'Finished';
    default: return 'Unread';
  }
}

function formatTime(seconds) {
  if (seconds < 60) return seconds + 's';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm';
  return Math.floor(seconds / 3600) + 'h ' + Math.floor((seconds % 3600) / 60) + 'm';
}

async function showShelfPicker(bookId) {
  const currentShelfs = await window.electron.dbGetShelfs();
  const shelfOptions = currentShelfs.map(s =>
    `<label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;">
      <input type="checkbox" data-shelf="${s.id}" style="accent-color:var(--accent);">
      ${s.name}
    </label>`
  ).join('');

  showModal('Add to Shelf', `
    ${shelfOptions || '<p>No shelfs yet. Create one from the Shelfs page.</p>'}
    <div style="margin-top:12px;">
      <input class="modal-input" id="newShelfName" placeholder="New shelf name..." style="margin-bottom:8px;">
      <button class="modal-btn modal-btn-primary" id="createShelfBtn" style="font-size:12px;padding:5px 12px;">+ Create Shelf</button>
    </div>
  `, async () => {
    const newShelfName = document.getElementById('newShelfName');
    if (newShelfName && newShelfName.value.trim()) {
      const shelfId = await window.electron.dbAddShelf(newShelfName.value.trim());
      await window.electron.dbAddBookToShelf(bookId, shelfId);
    }
    document.querySelectorAll('[data-shelf]').forEach(cb => {
      if (cb.checked) window.electron.dbAddBookToShelf(bookId, cb.getAttribute('data-shelf'));
    });
    await refreshBookList();
    showToast('Added to shelf(s)');
  });
}

// ===== Open Book =====
async function openBook(book) {
  currentBook = book;
  bookStartTime = Date.now();

  await window.electron.dbUpdateBook(book.id, {
    last_opened: Math.floor(Date.now() / 1000),
    status: 'reading'
  });

  const content = document.getElementById('contentArea');
  content.innerHTML = '';
  content.className = 'content-area';
  content.style.overflowY = 'hidden';

  const container = document.createElement('div');
  container.className = 'reader-container';

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'reader-toolbar';

  const backBtn = document.createElement('button');
  backBtn.className = 'import-btn';
  backBtn.style.background = 'transparent';
  backBtn.style.color = 'var(--text-primary)';
  backBtn.style.border = '1px solid var(--border)';
  backBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> Back`;
  backBtn.addEventListener('click', async () => {
    await saveReadingProgress();
    // Save current page as last page before going to reader
    await window.electron.settingSet('lastPage', previousPage);
    await navigateTo(previousPage);
  });
  toolbar.appendChild(backBtn);

  const titleEl = document.createElement('span');
  titleEl.className = 'reader-toolbar-title';
  titleEl.textContent = book.title;
  toolbar.appendChild(titleEl);

  // Theme selector
  const themeSelect = document.createElement('select');
  themeSelect.className = 'reader-theme-select';
  themeSelect.innerHTML = `
    <option value="light" ${currentTheme === 'light' ? 'selected' : ''}>Light</option>
    <option value="dark" ${currentTheme === 'dark' ? 'selected' : ''}>Dark</option>
    <option value="sepia" ${currentTheme === 'sepia' ? 'selected' : ''}>Sepia</option>
    <option value="dracula" ${currentTheme === 'dracula' ? 'selected' : ''}>Dracula</option>
    <option value="catppuccin" ${currentTheme === 'catppuccin' ? 'selected' : ''}>Catppuccin</option>
    <option value="nord" ${currentTheme === 'nord' ? 'selected' : ''}>Nord</option>
    <option value="gruvbox" ${currentTheme === 'gruvbox' ? 'selected' : ''}>Gruvbox</option>
    <option value="everforest" ${currentTheme === 'everforest' ? 'selected' : ''}>Everforest</option>
    <option value="solarized" ${currentTheme === 'solarized' ? 'selected' : ''}>Solarized</option>
    <option value="tokyo-night" ${currentTheme === 'tokyo-night' ? 'selected' : ''}>Tokyo Night</option>
    <option value="rose-pine" ${currentTheme === 'rose-pine' ? 'selected' : ''}>Rose Pine</option>
    <option value="one-dark" ${currentTheme === 'one-dark' ? 'selected' : ''}>One Dark</option>
    <option value="monokai" ${currentTheme === 'monokai' ? 'selected' : ''}>Monokai</option>
  `;
  themeSelect.addEventListener('change', async (e) => {
    currentTheme = e.target.value;
    document.documentElement.setAttribute('data-theme', currentTheme);
    await savePreferences();
  });
  toolbar.appendChild(themeSelect);

  container.appendChild(toolbar);

  // Content area
  const readerContent = document.createElement('div');
  readerContent.className = 'reader-content';
  readerContent.id = 'readerContent';
  container.appendChild(readerContent);

  content.appendChild(container);

  // Render based on format
  switch (book.format) {
    case 'epub': await renderEPUB(book, readerContent); break;
    case 'pdf': await renderPDF(book, readerContent); break;
    case 'comic': await renderComic(book, readerContent); break;
    case 'text': await renderText(book, readerContent); break;
    default: await renderText(book, readerContent);
  }
}

async function saveReadingProgress() {
  if (!currentBook || !bookStartTime) return;
  const elapsed = Math.floor((Date.now() - bookStartTime) / 1000);
  const book = await window.electron.dbGetBookById(currentBook.id);
  if (book) {
    await window.electron.dbUpdateBook(currentBook.id, {
      total_time_spent: (book.total_time_spent || 0) + elapsed,
      progress_percent: book.progress_percent || 0
    });
  }
}

// ============================================================
// EPUB RENDERER (FIXED: uses main-process IPC for content extraction)
// ============================================================
async function renderEPUB(book, container) {
  try {
    // Try epub.js first if CDN loaded
    if (typeof ePub !== 'undefined') {
      epubRendition = ePub(book.path);
      const rendition = epubRendition.renderTo(container, {
        width: '100%',
        height: '100%',
        flow: 'paginated'
      });

      if (book.current_location) {
        rendition.display(book.current_location);
      } else {
        rendition.display();
      }

      rendition.on('relocated', (location) => {
        if (location && location.start && location.start.cfi) {
          window.electron.dbUpdateBook(book.id, { current_location: location.start.cfi });
        }
      });
      return;
    }

    // Fallback: extract content via IPC from main process
    const result = await window.electron.epubGetContent(book.path);
    if (!result.success) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-text">Failed to read EPUB: ${result.error}</div></div>`;
      return;
    }

    container.style.overflowY = 'auto';
    container.style.padding = '40px';

    const chapters = result.chapters;
    for (const ch of chapters) {
      const div = document.createElement('div');
      div.innerHTML = ch.html;
      styleTextContent(div);
      container.appendChild(div);
    }

    await window.electron.dbUpdateBook(book.id, { progress_percent: 100 });
  } catch (e) {
    console.error('EPUB render failed:', e);
    container.innerHTML = `<div class="empty-state"><div class="empty-state-text">Failed to render EPUB</div></div>`;
  }
}

// ============================================================
// PDF RENDERER (FIXED: get base64 via IPC, then render with pdf.js)
// ============================================================
async function renderPDF(book, container) {
  try {
    if (typeof pdfjsLib === 'undefined') {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-text">PDF.js library is loading...</div></div>`;
      return;
    }

    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    // Get PDF base64 from main process
    const base64 = await window.electron.pdfGetBase64(book.path);
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    pdfDoc = pdf;
    container.innerHTML = '';
    container.style.overflowY = 'auto';
    container.style.padding = '20px';

    const maxPages = Math.min(pdf.numPages, 50);

    for (let i = 1; i <= maxPages; i++) {
      const canvas = document.createElement('canvas');
      canvas.style.maxWidth = '100%';
      canvas.style.marginBottom = '16px';
      canvas.style.boxShadow = '0 2px 8px var(--shadow)';
      canvas.style.borderRadius = '4px';
      canvas.dataset.page = i;
      container.appendChild(canvas);
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const canvas = entry.target;
          const pageNum = parseInt(canvas.dataset.page);
          if (!canvas.dataset.rendered) {
            renderPDFPage(pdf, pageNum, canvas);
            canvas.dataset.rendered = 'true';
          }
        }
      });
    }, { rootMargin: '200px' });

    container.querySelectorAll('canvas').forEach(c => observer.observe(c));

    const progress = Math.round((1 / pdf.numPages) * 100);
    await window.electron.dbUpdateBook(book.id, { progress_percent: progress });
  } catch (e) {
    console.error('PDF render failed:', e);
    container.innerHTML = `<div class="empty-state"><div class="empty-state-text">Failed to render PDF: ${e.message}</div></div>`;
  }
}

function renderPDFPage(pdf, pageNum, canvas) {
  pdf.getPage(pageNum).then(page => {
    const viewport = page.getViewport({ scale: 1.5 });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    page.render({ canvasContext: ctx, viewport });
  });
}

// ============================================================
// COMIC RENDERER (FIXED: fully implemented with proper viewer)
// ============================================================
async function renderComic(book, container) {
  try {
    container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';

    // Get total page count via IPC
    comicTotal = await window.electron.comicGetPageCount(book.path);

    if (comicTotal === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-text">No images found in comic archive</div></div>';
      return;
    }

    // Get first page to show immediately
    await showComicPage(book, container, 0);
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-text">Failed to load comic: ${e.message}</div></div>`;
  }
}

async function showComicPage(book, container, index) {
  comicIndex = index;
  container.innerHTML = '';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.alignItems = 'center';
  container.style.justifyContent = 'flex-start';

  // Show loading state
  const loading = document.createElement('div');
  loading.className = 'loading-spinner';
  loading.innerHTML = '<div class="spinner"></div>';
  container.appendChild(loading);

  // Fetch page base64 from main process
  const pageData = await window.electron.comicGetPageBase64(book.path, index);

  if (!pageData) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-text">Page not found</div></div>';
    return;
  }

  loading.remove();

  // Create image element
  const img = document.createElement('img');
  img.src = pageData;
  img.style.maxWidth = '100%';
  img.style.maxHeight = 'calc(100vh - 220px)';
  img.style.objectFit = 'contain';
  img.style.borderRadius = '4px';
  container.appendChild(img);

  // Navigation controls
  const nav = document.createElement('div');
  nav.style.display = 'flex';
  nav.style.gap = '16px';
  nav.style.marginTop = '12px';
  nav.style.alignItems = 'center';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'import-btn';
  prevBtn.textContent = '← Prev';
  prevBtn.disabled = comicIndex === 0;
  prevBtn.addEventListener('click', () => showComicPage(book, container, comicIndex - 1));

  const pageIndicator = document.createElement('span');
  pageIndicator.textContent = `${comicIndex + 1} / ${comicTotal}`;
  pageIndicator.style.color = 'var(--text-secondary)';
  pageIndicator.style.fontSize = '13px';
  pageIndicator.style.fontWeight = '500';

  const nextBtn = document.createElement('button');
  nextBtn.className = 'import-btn';
  nextBtn.textContent = 'Next →';
  nextBtn.disabled = comicIndex === comicTotal - 1;
  nextBtn.addEventListener('click', () => showComicPage(book, container, comicIndex + 1));

  nav.appendChild(prevBtn);
  nav.appendChild(pageIndicator);
  nav.appendChild(nextBtn);
  container.appendChild(nav);

  // Keyboard navigation
  const keyHandler = (e) => {
    if (currentPage !== 'home') { // still in reader
      if (e.key === 'ArrowRight' || e.key === ' ') {
        if (comicIndex < comicTotal - 1) showComicPage(book, container, comicIndex + 1);
      } else if (e.key === 'ArrowLeft') {
        if (comicIndex > 0) showComicPage(book, container, comicIndex - 1);
      } else if (e.key === 'Escape') {
        document.removeEventListener('keydown', keyHandler);
        saveReadingProgress();
        navigateTo(previousPage);
      }
    }
  };
  document.removeEventListener('keydown', comicKeyHandler);
  const comicKeyHandler = keyHandler;
  document.addEventListener('keydown', comicKeyHandler);

  // Update progress
  const progress = Math.round(((comicIndex + 1) / comicTotal) * 100);
  await window.electron.dbUpdateBook(book.id, { progress_percent: progress });
}

// ============================================================
// TEXT RENDERER (FIXED: read file via IPC, handle MOBI/AZW3/FB2)
// ============================================================
async function renderText(book, container) {
  try {
    container.style.overflowY = 'auto';
    container.style.padding = '40px';

    const ext = book.path.split('.').pop().toLowerCase();

    // MOBI / AZW3 / AZW — handled as special text types
    if (['mobi', 'azw3', 'azw'].includes(ext)) {
      const result = await window.electron.mobiGetText(book.path);
      if (result.success) {
        if (result.html) {
          container.innerHTML = result.html;
        } else {
          const escaped = escapeHTML(result.text);
          container.innerHTML = `<pre style="white-space:pre-wrap;font-family:inherit;line-height:1.8;">${escaped}</pre>`;
        }
        styleTextContent(container);
        await window.electron.dbUpdateBook(book.id, { progress_percent: 100 });
      } else {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-text">Failed to read ${ext.toUpperCase()}: ${result.error}</div></div>`;
      }
      return;
    }

    // FB2 — XML-based, parse with DOM
    if (ext === 'fb2') {
      const xmlText = await window.electron.readTextFile(book.path);
      try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        const bodies = xmlDoc.querySelectorAll('body');
        let html = '';
        bodies.forEach(body => {
          const serializer = new XMLSerializer();
          html += serializer.serializeToString(body);
        });
        container.innerHTML = html || `<pre style="white-space:pre-wrap;font-family:inherit;line-height:1.8;">${escapeHTML(xmlText.substring(0, 50000))}</pre>`;
        styleTextContent(container);
      } catch (e) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-text">Failed to parse FB2: ${e.message}</div></div>`;
      }
      await window.electron.dbUpdateBook(book.id, { progress_percent: 100 });
      return;
    }

    // DOCX
    if (ext === 'docx') {
      // mammoth.js is loaded from CDN in index.html
      if (typeof mammoth !== 'undefined') {
        const buffer = await window.electron.readFileBuffer(book.path);
        const result = await mammoth.convertToHtml({ arrayBuffer: buffer.buffer });
        container.innerHTML = result.value;
        styleTextContent(container);
      } else {
        const text = await window.electron.readTextFile(book.path);
        container.innerHTML = `<pre style="white-space:pre-wrap;font-family:inherit;line-height:1.8;">${escapeHTML(text)}</pre>`;
      }
      await window.electron.dbUpdateBook(book.id, { progress_percent: 100 });
      return;
    }

    // TXT
    if (ext === 'txt') {
      const text = await window.electron.readTextFile(book.path);
      const escaped = escapeHTML(text);
      container.innerHTML = `<pre style="white-space:pre-wrap;font-family:inherit;line-height:1.8;">${escaped}</pre>`;
      styleTextContent(container);
      await window.electron.dbUpdateBook(book.id, { progress_percent: 100 });
      return;
    }

    // MD
    if (ext === 'md') {
      const text = await window.electron.readTextFile(book.path);
      const html = simpleMarkdownToHTML(text);
      container.innerHTML = html;
      styleTextContent(container);
      await window.electron.dbUpdateBook(book.id, { progress_percent: 100 });
      return;
    }

    // HTML / XHTML / XML / MHTML
    if (['html', 'htm', 'xhtml', 'xml', 'mhtml'].includes(ext)) {
      const text = await window.electron.readTextFile(book.path);
      // Strip scripts and styles using DOM
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = text;
      tempDiv.querySelectorAll('script, style').forEach(el => el.remove());
      const bodyContent = tempDiv.querySelector('body');
      container.innerHTML = bodyContent ? bodyContent.innerHTML : tempDiv.innerHTML;
      styleTextContent(container);
      await window.electron.dbUpdateBook(book.id, { progress_percent: 100 });
      return;
    }

    // Fallback: raw text
    const text = await window.electron.readTextFile(book.path);
    container.innerHTML = `<pre style="white-space:pre-wrap;font-family:inherit;line-height:1.8;">${escapeHTML(text)}</pre>`;
    styleTextContent(container);
    await window.electron.dbUpdateBook(book.id, { progress_percent: 100 });
  } catch (e) {
    console.error('Text render failed:', e);
    container.innerHTML = `<div class="empty-state"><div class="empty-state-text">Failed to render file: ${e.message}</div></div>`;
  }
}

function styleTextContent(container) {
  container.style.lineHeight = '1.8';
  container.style.fontSize = 'var(--reader-font-size)';
  container.querySelectorAll('img').forEach(img => {
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
  });
}

// Simple markdown to HTML (no Node dependency needed)
function simpleMarkdownToHTML(text) {
  return text
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/\n/gim, '<br>');
}

function escapeHTML(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================
// RENDER PAGES
// ============================================================
async function renderHome(container) {
  container.innerHTML = '';
  container.className = 'content-area home-page';

  const topBooks = await window.electron.dbGetTopBooks(5);

  if (topBooks.length > 0 || allBooks.length > 0) {
    const topSection = document.createElement('div');
    topSection.className = 'home-top-books';

    const title = document.createElement('div');
    title.className = 'home-section-title';
    title.textContent = 'Your Most Read';
    topSection.appendChild(title);

    const row = document.createElement('div');
    row.className = 'top-books-row';
    topBooks.forEach(book => {
      const card = createBookCard(book, 'small');
      card.style.minWidth = '120px';
      card.style.maxWidth = '140px';
      row.appendChild(card);
    });
    topSection.appendChild(row);
    container.appendChild(topSection);
  }

  // Quote section with typewriter
  const quoteSection = document.createElement('div');
  quoteSection.className = 'quote-section';

  const allQuotes = await window.electron.dbGetAllQuotes();
  const quoteContainer = document.createElement('div');
  quoteContainer.className = 'quote-container';

  if (allQuotes.length > 0) {
    const randomQuote = allQuotes[Math.floor(Math.random() * allQuotes.length)];
    const quoteText = document.createElement('div');
    quoteText.className = 'quote-text';
    const source = document.createElement('div');
    source.className = 'quote-source';
    source.textContent = '— ' + (randomQuote.book_title || 'Unknown Book');

    quoteContainer.appendChild(quoteText);
    quoteContainer.appendChild(source);
  } else {
    quoteContainer.innerHTML = `
      <div class="empty-state-icon" style="font-size:40px;">&#128214;</div>
      <div class="empty-state-text">Import some books to get started!</div>
    `;
  }

  quoteSection.appendChild(quoteContainer);
  container.appendChild(quoteSection);

  // Start typewriter animation
  if (allQuotes.length > 0) {
    const randomQuote = allQuotes[Math.floor(Math.random() * allQuotes.length)];
    startTypewriter(container.querySelector('.quote-text'), randomQuote.text);
  }
}

async function renderContinue(container) {
  container.innerHTML = '';
  container.className = 'content-area';

  const reading = await window.electron.dbGetBooksByStatus('reading');

  if (reading.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">&#128214;</div><div class="empty-state-text">No books in progress</div><div class="empty-state-hint">Start reading a book to see it here</div></div>`;
    return;
  }

  const header = document.createElement('div');
  header.className = 'page-header';
  header.innerHTML = `<div class="page-title">Continue Reading</div><div class="page-subtitle">${reading.length} book(s)</div>`;
  container.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'books-grid';
  reading.forEach(book => grid.appendChild(createBookCard(book)));
  container.appendChild(grid);
}

async function renderFavourites(container) {
  container.innerHTML = '';
  container.className = 'content-area';

  const favourites = await window.electron.dbGetFavourites();

  if (favourites.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">&#9825;</div><div class="empty-state-text">No favourites yet</div><div class="empty-state-hint">Mark books as favourite using the 3-dot menu</div></div>`;
    return;
  }

  const header = document.createElement('div');
  header.className = 'page-header';
  header.innerHTML = `<div class="page-title">Favourites</div><div class="page-subtitle">${favourites.length} book(s)</div>`;
  container.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'books-grid';
  favourites.forEach(book => grid.appendChild(createBookCard(book)));
  container.appendChild(grid);
}

async function renderQuotes(container) {
  container.innerHTML = '';
  container.className = 'content-area';

  const quotes = await window.electron.dbGetAllQuotes();

  if (quotes.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">&#10077;</div><div class="empty-state-text">No saved quotes</div><div class="empty-state-hint">Select text while reading to save quotes</div></div>`;
    return;
  }

  const header = document.createElement('div');
  header.className = 'page-header';
  header.innerHTML = `<div class="page-title">Quotes</div><div class="page-subtitle">${quotes.length} quote(s)</div>`;
  container.appendChild(header);

  const list = document.createElement('div');
  list.className = 'quotes-list';

  for (const quote of quotes) {
    const card = document.createElement('div');
    card.className = 'quote-card';
    card.innerHTML = `
      <button class="quote-card-delete" title="Delete">&#10005;</button>
      <div class="quote-card-text">&#10077;${escapeHTML(quote.text)}&#10078;</div>
      <div class="quote-card-source">${escapeHTML(quote.page_or_location || '')}</div>
      <div class="quote-card-book">${escapeHTML(quote.book_title || 'Unknown Book')}</div>
    `;

    card.querySelector('.quote-card-delete').addEventListener('click', async () => {
      await window.electron.dbDeleteQuote(quote.id);
      await renderQuotes(container);
      showToast('Quote deleted');
    });

    list.appendChild(card);
  }

  container.appendChild(list);
}

async function renderAllBooks(container) {
  container.innerHTML = '';
  container.className = 'content-area';

  // Search bar
  const searchBar = document.createElement('div');
  searchBar.className = 'search-bar';
  searchBar.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <input class="search-input" id="searchInput" placeholder="Search your library..." autocomplete="off">
  `;
  container.appendChild(searchBar);

  // Header
  const header = document.createElement('div');
  header.className = 'page-header';
  header.innerHTML = `<div class="page-title">All Books</div><div class="page-subtitle">${allBooks.length} book(s)</div>`;
  container.appendChild(header);

  // Grid
  const grid = document.createElement('div');
  grid.className = 'books-grid';
  grid.id = 'allBooksGrid';
  allBooks.forEach(book => grid.appendChild(createBookCard(book)));
  container.appendChild(grid);

  // Debounced search via IPC
  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      const query = e.target.value.trim();
      const filtered = query ? await window.electron.dbGetBooksQuery(query) : allBooks;

      const newGrid = document.createElement('div');
      newGrid.className = 'books-grid';
      filtered.forEach(book => newGrid.appendChild(createBookCard(book)));

      grid.replaceWith(newGrid);
    }, 200);
  });
}

async function renderShelfs(container) {
  container.innerHTML = '';
  container.className = 'content-area';

  const shelfList = await window.electron.dbGetShelfs();

  if (shelfList.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">&#128230;</div><div class="empty-state-text">No shelfs yet</div><div class="empty-state-hint">Create shelfs from the book card menu</div></div>`;
    return;
  }

  const header = document.createElement('div');
  header.className = 'page-header';
  header.innerHTML = `<div class="page-title">Shelfs</div><div class="page-subtitle">${shelfList.length} shelf(s)</div>`;
  container.appendChild(header);

  const list = document.createElement('div');
  list.className = 'shelf-list';

  for (const shelf of shelfList) {
    const shelfBooks = await window.electron.dbGetShelfBooks(shelf.id);
    const item = document.createElement('div');
    item.className = 'shelf-item';

    const shelfHeader = document.createElement('div');
    shelfHeader.className = 'shelf-header';
    shelfHeader.innerHTML = `
      <span class="shelf-name">${escapeHTML(shelf.name)}</span>
      <div style="display:flex;gap:8px;align-items:center;">
        <span class="shelf-count">${shelfBooks.length} books</span>
        <button style="background:transparent;border:none;color:var(--text-secondary);cursor:pointer;padding:4px;" title="Delete shelf" data-delete-shelf="${escapeHTML(shelf.id)}">&#10005;</button>
      </div>
    `;
    item.appendChild(shelfHeader);

    const booksDiv = document.createElement('div');
    booksDiv.className = 'shelf-books';

    for (const book of shelfBooks.slice(0, 20)) {
      const miniCard = document.createElement('div');
      miniCard.className = 'shelf-mini-card';
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.alt = book.title;
      img.title = book.title;

      (async () => {
        try {
          const coverPath = await window.electron.getCoverPath(book.id);
          if (coverPath) img.src = 'file://' + coverPath;
        } catch (e) {}
      })();

      miniCard.addEventListener('click', () => openBook(book));
      booksDiv.appendChild(miniCard);
    }

    item.appendChild(booksDiv);
    list.appendChild(item);

    item.querySelector('[data-delete-shelf]').addEventListener('click', () => {
      showModal('Delete Shelf', `<p>Delete shelf "${escapeHTML(shelf.name)}"? Books will not be removed from your library.</p>`, async () => {
        await window.electron.dbDeleteShelf(shelf.id);
        await refreshBookList();
        await renderShelfs(container);
        showToast('Shelf deleted');
      });
    });
  }

  container.appendChild(list);
}

async function renderStats(container) {
  container.innerHTML = '';
  container.className = 'content-area';

  const header = document.createElement('div');
  header.className = 'page-header';
  header.innerHTML = `<div class="page-title">Reading Stats</div>`;
  container.appendChild(header);

  const stats = await window.electron.dbGetStats();

  const grid = document.createElement('div');
  grid.className = 'stats-grid';

  const statsData = [
    { value: stats.totalBooks, label: 'Total Books' },
    { value: stats.totalReading, label: 'Currently Reading' },
    { value: stats.totalFinished, label: 'Finished' },
    { value: stats.totalFavourites, label: 'Favourites' },
    { value: formatTime(stats.totalTimeSeconds), label: 'Total Reading Time' },
    { value: stats.totalQuotes, label: 'Saved Quotes' },
    { value: stats.totalAnnotations, label: 'Annotations' },
    { value: stats.totalShelfs, label: 'Shelfs' }
  ];

  statsData.forEach(stat => {
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.innerHTML = `<div class="stat-value">${stat.value}</div><div class="stat-label">${stat.label}</div>`;
    grid.appendChild(card);
  });

  container.appendChild(grid);

  // Data management section
  const mgmtSection = document.createElement('div');
  mgmtSection.style.marginTop = '32px';
  mgmtSection.innerHTML = `<div class="home-section-title">Data Management</div>`;

  const btnGroup = document.createElement('div');
  btnGroup.style.display = 'flex';
  btnGroup.style.gap = '12px';

  const exportBtn = document.createElement('button');
  exportBtn.className = 'import-btn';
  exportBtn.textContent = 'Export Data';
  exportBtn.addEventListener('click', async () => {
    const p = await window.electron.exportData();
    if (p) showToast('Data exported to: ' + p);
  });
  btnGroup.appendChild(exportBtn);

  mgmtSection.appendChild(btnGroup);
  container.appendChild(mgmtSection);
}

// ===== Typewriter Animation =====
function startTypewriter(element, text) {
  if (typingInterval) clearInterval(typingInterval);
  element.innerHTML = '';

  let i = 0;
  typingInterval = setInterval(() => {
    if (i < text.length) {
      element.innerHTML = escapeHTML(text.substring(0, i + 1)) + '<span class="typewriter-cursor"></span>';
      i++;
    } else {
      clearInterval(typingInterval);
      element.innerHTML = escapeHTML(text);
    }
  }, 30);
}

// ===== Keyboard Shortcuts =====
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'i') {
    e.preventDefault();
    document.getElementById('importBtn').click();
  }
  if (e.key === 'Escape') {
    document.getElementById('modalOverlay').classList.remove('show');
    document.getElementById('selectionMenu').classList.remove('show');
    document.querySelectorAll('.dropdown-menu.show').forEach(d => d.classList.remove('show'));
  }
});

// ===== Save progress on close =====
window.addEventListener('beforeunload', () => {
  saveReadingProgress();
});
