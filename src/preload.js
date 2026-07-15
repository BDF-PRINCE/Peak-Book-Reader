const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // ===== Import =====
  importBooks: () => ipcRenderer.invoke('import-books'),
  importFolder: () => ipcRenderer.invoke('import-folder'),

  // ===== Metadata Extraction =====
  extractMetadata: (filePath) => ipcRenderer.invoke('extract-metadata', filePath),
  extractMetadataBatch: (filePaths) => ipcRenderer.invoke('extract-metadata-batch', filePaths),

  // ===== Covers =====
  saveCover: (data) => ipcRenderer.invoke('save-cover', data),
  getCoverPath: (id) => ipcRenderer.invoke('get-cover-path', id),
  deleteCover: (id) => ipcRenderer.invoke('delete-cover', id),

  // ===== File Reading =====
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  readFileBuffer: (filePath) => ipcRenderer.invoke('read-file-buffer', filePath),
  readFileBase64: (filePath) => ipcRenderer.invoke('read-file-base64', filePath),
  readTextFile: (filePath) => ipcRenderer.invoke('read-text-file', filePath),

  // ===== DB: Books =====
  dbAddBook: (book) => ipcRenderer.invoke('db-add-book', book),
  dbGetBooks: () => ipcRenderer.invoke('db-get-books'),
  dbGetBooksQuery: (query) => ipcRenderer.invoke('db-get-books-query', query),
  dbGetBooksByStatus: (status) => ipcRenderer.invoke('db-get-books-by-status', status),
  dbGetFavourites: () => ipcRenderer.invoke('db-get-favourites'),
  dbGetTopBooks: (limit) => ipcRenderer.invoke('db-get-top-books', limit),
  dbGetBookById: (id) => ipcRenderer.invoke('db-get-book-by-id', id),
  dbUpdateBook: (id, updates) => ipcRenderer.invoke('db-update-book', { id, updates }),
  dbDeleteBook: (id) => ipcRenderer.invoke('db-delete-book', id),
  dbGetBooksCount: () => ipcRenderer.invoke('db-get-books-count'),

  // ===== DB: Shelfs =====
  dbAddShelf: (name) => ipcRenderer.invoke('db-add-shelf', name),
  dbGetShelfs: () => ipcRenderer.invoke('db-get-shelfs'),
  dbGetShelfBooks: (shelfId) => ipcRenderer.invoke('db-get-shelf-books', shelfId),
  dbAddBookToShelf: (bookId, shelfId) => ipcRenderer.invoke('db-add-book-to-shelf', { bookId, shelfId }),
  dbRemoveBookFromShelf: (bookId, shelfId) => ipcRenderer.invoke('db-remove-book-from-shelf', { bookId, shelfId }),
  dbDeleteShelf: (id) => ipcRenderer.invoke('db-delete-shelf', id),

  // ===== DB: Quotes =====
  dbAddQuote: (bookId, text, location) => ipcRenderer.invoke('db-add-quote', { bookId, text, location }),
  dbGetQuotes: (bookId) => ipcRenderer.invoke('db-get-quotes', bookId),
  dbGetAllQuotes: () => ipcRenderer.invoke('db-get-all-quotes'),
  dbDeleteQuote: (id) => ipcRenderer.invoke('db-delete-quote', id),

  // ===== DB: Annotations =====
  dbAddAnnotation: (bookId, text, type, location, note) => ipcRenderer.invoke('db-add-annotation', { bookId, text, type, location, note }),
  dbGetAnnotations: (bookId) => ipcRenderer.invoke('db-get-annotations', bookId),
  dbDeleteAnnotation: (id) => ipcRenderer.invoke('db-delete-annotation', id),

  // ===== DB: Stats =====
  dbGetStats: () => ipcRenderer.invoke('db-get-stats'),

  // ===== Settings (SQLite-backed) =====
  settingSet: (key, value) => ipcRenderer.invoke('setting-set', { key, value }),
  settingGet: (key) => ipcRenderer.invoke('setting-get', key),
  settingGetAll: () => ipcRenderer.invoke('setting-get-all'),

  // ===== Shell / External =====
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),

  // ===== App Meta =====
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  exportData: () => ipcRenderer.invoke('export-data'),
  importData: () => ipcRenderer.invoke('import-data'),

  // ===== Comic =====
  comicGetPages: (filePath) => ipcRenderer.invoke('comic-get-pages', filePath),
  comicGetPageBase64: (filePath, index) => ipcRenderer.invoke('comic-get-page-base64', { filePath, index }),
  comicGetPageCount: (filePath) => ipcRenderer.invoke('comic-get-page-count', filePath),

  // ===== EPUB =====
  epubGetContent: (filePath) => ipcRenderer.invoke('epub-get-content', filePath),

  // ===== MOBI/AZW3 =====
  mobiGetText: (filePath) => ipcRenderer.invoke('mobi-get-text', filePath),

  // ===== PDF =====
  pdfGetText: (filePath) => ipcRenderer.invoke('pdf-get-text', filePath),
  pdfGetBase64: (filePath) => ipcRenderer.invoke('pdf-get-base64', filePath),
});
