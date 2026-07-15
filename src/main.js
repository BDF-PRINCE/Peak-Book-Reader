const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Init database and metadata in main process (Node context)
const db = require('./db/database');
const metadata = require('./utils/metadata');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    frame: true,
    title: 'Peak Reader',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      webviewTag: false
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(async () => {
  await db.init();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ============================================================
// IMPORT IPC
// ============================================================

ipcMain.handle('import-books', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Ebooks', extensions: ['epub','pdf','txt','mobi','azw3','azw','htm','html','xml','xhtml','mhtml','docx','md','fb2','cbz','cbt','cbr','cb7'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('import-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

// ============================================================
// METADATA + COVER IPC (was wrongly in renderer before)
// ============================================================

ipcMain.handle('extract-metadata', async (event, filePath) => {
  return await metadata.extractMetadata(filePath);
});

ipcMain.handle('extract-metadata-batch', async (event, filePaths) => {
  const results = [];
  for (const fp of filePaths) {
    try {
      results.push(await metadata.extractMetadata(fp));
    } catch (e) {
      results.push({ id: metadata.generateId(fp), path: fp, format: metadata.getFormat(path.extname(fp)), title: path.basename(fp, path.extname(fp)), author: '', coverBuffer: null });
    }
  }
  return results;
});

ipcMain.handle('save-cover', async (event, { id, buffer }) => {
  const coversDir = path.join(app.getPath('userData'), 'covers');
  if (!fs.existsSync(coversDir)) fs.mkdirSync(coversDir, { recursive: true });
  const filePath = path.join(coversDir, `${id}.jpg`);
  fs.writeFileSync(filePath, buffer);
  return filePath;
});

ipcMain.handle('get-cover-path', async (event, id) => {
  const filePath = path.join(app.getPath('userData'), 'covers', `${id}.jpg`);
  return fs.existsSync(filePath) ? filePath : null;
});

ipcMain.handle('delete-cover', async (event, id) => {
  const filePath = path.join(app.getPath('userData'), 'covers', `${id}.jpg`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
});

ipcMain.handle('read-file', async (event, filePath) => {
  return fs.readFileSync(filePath, 'utf8');
});

ipcMain.handle('read-file-buffer', async (event, filePath) => {
  return fs.readFileSync(filePath);
});

ipcMain.handle('read-file-base64', async (event, filePath) => {
  return fs.readFileSync(filePath, 'base64');
});

ipcMain.handle('read-text-file', async (event, filePath) => {
  return fs.readFileSync(filePath, 'utf8');
});

// ============================================================
// DB IPC (was wrongly required in renderer before)
// ============================================================

// Books
ipcMain.handle('db-add-book', async (event, book) => {
  db.addBook(book);
});
ipcMain.handle('db-get-books', async () => db.getBooks());
ipcMain.handle('db-get-books-query', async (event, query) => db.getBooks(query));
ipcMain.handle('db-get-books-by-status', async (event, status) => db.getBooksByStatus(status));
ipcMain.handle('db-get-favourites', async () => db.getFavouriteBooks());
ipcMain.handle('db-get-top-books', async (event, limit) => db.getTopBooks(limit));
ipcMain.handle('db-get-book-by-id', async (event, id) => db.getBookById(id));
ipcMain.handle('db-update-book', async (event, { id, updates }) => db.updateBook(id, updates));
ipcMain.handle('db-delete-book', async (event, id) => db.deleteBook(id));
ipcMain.handle('db-get-books-count', async () => db.getBooks().length);

// Shelfs
ipcMain.handle('db-add-shelf', async (event, name) => db.addShelf(name));
ipcMain.handle('db-get-shelfs', async () => db.getShelfs());
ipcMain.handle('db-get-shelf-books', async (event, shelfId) => db.getShelfBooks(shelfId));
ipcMain.handle('db-add-book-to-shelf', async (event, { bookId, shelfId }) => db.addBookToShelf(bookId, shelfId));
ipcMain.handle('db-remove-book-from-shelf', async (event, { bookId, shelfId }) => db.removeBookFromShelf(bookId, shelfId));
ipcMain.handle('db-delete-shelf', async (event, id) => db.deleteShelf(id));

// Quotes
ipcMain.handle('db-add-quote', async (event, { bookId, text, location }) => db.addQuote(bookId, text, location));
ipcMain.handle('db-get-quotes', async (event, bookId) => db.getQuotes(bookId));
ipcMain.handle('db-get-all-quotes', async () => db.getAllQuotes());
ipcMain.handle('db-delete-quote', async (event, id) => db.deleteQuote(id));

// Annotations
ipcMain.handle('db-add-annotation', async (event, { bookId, text, type, location, note }) => db.addAnnotation(bookId, text, type, location, note));
ipcMain.handle('db-get-annotations', async (event, bookId) => db.getAnnotations(bookId));
ipcMain.handle('db-delete-annotation', async (event, id) => db.deleteAnnotation(id));

// Stats
ipcMain.handle('db-get-stats', async () => db.getStats());

// ============================================================
// PREFERENCES (SQLite Settings table via IPC)
// ============================================================

ipcMain.handle('setting-set', async (event, { key, value }) => {
  db.setSetting(key, value);
});

ipcMain.handle('setting-get', async (event, key) => {
  return db.getSetting(key);
});

ipcMain.handle('setting-get-all', async () => {
  const rows = db.getAllSettings();
  const result = {};
  for (const row of rows) result[row.key] = row.value;
  return result;
});

// ============================================================
// SHELL + EXTERNAL
// ============================================================

ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url);
});

ipcMain.handle('open-path', async (event, filePath) => {
  await shell.openPath(filePath);
});

// ============================================================
// APP META
// ============================================================

ipcMain.handle('get-user-data-path', async () => app.getPath('userData'));
ipcMain.handle('get-app-version', async () => app.getVersion());

ipcMain.handle('export-data', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Peak Reader Data',
    defaultPath: 'peak-reader-backup.zip',
    filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle('import-data', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
  });
  return result.canceled ? null : result.filePaths[0];
});

// ============================================================
// COMIC READER: Extract pages from CBZ/CBT/CBR
// ============================================================

ipcMain.handle('comic-get-pages', async (event, filePath) => {
  const JSZip = require('jszip');
  const data = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(data);
  const files = Object.keys(zip.files).sort().filter(f => {
    const ext = f.split('.').pop().toLowerCase();
    return ['jpg','jpeg','png','gif','webp','bmp'].includes(ext) && !f.startsWith('__MACOSX');
  });

  // Return base64-encoded image data for each page
  const pages = [];
  for (const f of files) {
    try {
      const imgData = await zip.files[f].async('base64');
      const ext = f.split('.').pop().toLowerCase();
      const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
      pages.push(`data:${mime};base64,${imgData}`);
    } catch(e) {}
  }
  return pages;
});

ipcMain.handle('comic-get-page-base64', async (event, { filePath, index }) => {
  const JSZip = require('jszip');
  const data = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(data);
  const files = Object.keys(zip.files).sort().filter(f => {
    const ext = f.split('.').pop().toLowerCase();
    return ['jpg','jpeg','png','gif','webp','bmp'].includes(ext) && !f.startsWith('__MACOSX');
  });
  if (index < 0 || index >= files.length) return null;
  const imgData = await zip.files[files[index]].async('base64');
  const ext = files[index].split('.').pop().toLowerCase();
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${imgData}`;
});

ipcMain.handle('comic-get-page-count', async (event, filePath) => {
  const JSZip = require('jszip');
  const data = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(data);
  const files = Object.keys(zip.files).sort().filter(f => {
    const ext = f.split('.').pop().toLowerCase();
    return ['jpg','jpeg','png','gif','webp','bmp'].includes(ext) && !f.startsWith('__MACOSX');
  });
  return files.length;
});

// ============================================================
// EPUB CONTENT EXTRACTION (for fallback renderer)
// ============================================================

ipcMain.handle('epub-get-content', async (event, filePath) => {
  try {
    const JSZip = require('jszip');
    const cheerio = require('cheerio');
    const data = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(data);

    // Find OPF
    const containerXml = zip.files['META-INF/container.xml'];
    if (!containerXml) return { success: false, error: 'No container.xml found' };

    const containerContent = await containerXml.async('text');
    const $container = cheerio.load(containerContent);
    const rootfilePath = $container('rootfile').attr('full-path');
    if (!rootfilePath) return { success: false, error: 'No rootfile found' };

    const opfFile = zip.files[rootfilePath];
    if (!opfFile) return { success: false, error: 'OPF not found' };

    const opfContent = await opfFile.async('text');
    const $ = cheerio.load(opfContent, { xmlMode: true });
    const spine = $('spine').find('itemref');
    const manifest = {};
    $('manifest').find('item').each((i, el) => {
      const $el = $(el);
      manifest[$el.attr('id')] = { href: $el.attr('href'), type: $el.attr('media-type') };
    });

    const dir = path.posix.dirname(rootfilePath);
    const htmlPages = [];

    spine.each((i, el) => {
      const idref = $(el).attr('idref');
      const item = manifest[idref];
      if (item && (item.type === 'application/xhtml+xml' || item.type === 'text/html')) {
        const fullPath = path.posix.join(dir, item.href);
        htmlPages.push(fullPath);
      }
    });

    // Extract text content from each HTML page
    const chapters = [];
    for (const htmlPath of htmlPages) {
      const htmlFile = zip.files[htmlPath];
      if (!htmlFile) continue;
      const htmlContent = await htmlFile.async('text');
      const $ch = cheerio.load(htmlContent);
      // Remove scripts and styles
      $ch('script').remove();
      $ch('style').remove();
      const bodyHtml = $ch('body').html() || $ch.root().html();
      // Get plain text
      const plainText = $ch.text().trim();
      if (plainText) {
        chapters.push({ html: bodyHtml, text: plainText });
      }
    }

    return { success: true, chapters };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

// ============================================================
// MOBI/AZW3 EXTRACTION
// ============================================================

ipcMain.handle('mobi-get-text', async (event, filePath) => {
  try {
    // MOBI/AZW3 files are PalmDOC-compressed HTML
    // Simple approach: scan for HTML content between magic bytes
    const data = fs.readFileSync(filePath);
    const text = data.toString('utf8');

    // Try to find HTML content embedded in the file
    const htmlMatch = text.match(/<(html|body)[\s>]/i);
    if (htmlMatch) {
      // Extract from first HTML tag onwards
      const htmlStart = htmlMatch.index;
      const htmlContent = text.substring(htmlStart);
      const cheerio = require('cheerio');
      const $ = cheerio.load(htmlContent);
      $('script').remove();
      $('style').remove();
      const bodyHtml = $('body').html() || $.root().html();
      return { success: true, html: bodyHtml, text: $.text().trim().substring(0, 50000) };
    }

    // Fallback: return raw text stripped of binary
    const stripped = text.replace(/[^\x20-\x7E\x0A\x0D]/g, '').replace(/\x00/g, '').trim();
    return { success: true, text: stripped.substring(0, 50000) };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

// ============================================================
// PDF EXTRACTION
// ============================================================

ipcMain.handle('pdf-get-text', async (event, filePath) => {
  try {
    const pdfParse = require('pdf-parse');
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return { success: true, text: data.text, pages: data.numpages };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('pdf-get-base64', async (event, filePath) => {
  return fs.readFileSync(filePath, 'base64');
});
