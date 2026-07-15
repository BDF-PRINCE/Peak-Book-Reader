const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

let db;
let dbPath;

function getDbPath() {
  const userData = process.env.PEAK_DATA_PATH || process.env.USERPROFILE || process.env.HOME;
  const dbDir = path.join(userData, '.peak-reader');
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  return path.join(dbDir, 'peak-reader.db');
}

function persistDb() {
  try {
    const data = db.export();
    fs.writeFileSync(dbPath, data);
  } catch (e) {
    console.error('Failed to persist database:', e.message);
  }
}

async function init() {
  const SQL = await initSqlJs();
  dbPath = getDbPath();

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Books table
  db.exec(`
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      format TEXT NOT NULL,
      title TEXT,
      author TEXT,
      cover_path TEXT,
      last_opened INTEGER DEFAULT 0,
      total_time_spent INTEGER DEFAULT 0,
      progress_percent REAL DEFAULT 0,
      current_location TEXT,
      status TEXT DEFAULT 'unread',
      favourite INTEGER DEFAULT 0,
      date_added INTEGER DEFAULT (strftime('%s', 'now')),
      search_index TEXT
    )
  `);

  // Shelfs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS shelfs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    )
  `);

  // Book-Shelf junction
  db.exec(`
    CREATE TABLE IF NOT EXISTS book_shelfs (
      book_id TEXT NOT NULL,
      shelf_id TEXT NOT NULL,
      PRIMARY KEY (book_id, shelf_id),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
      FOREIGN KEY (shelf_id) REFERENCES shelfs(id) ON DELETE CASCADE
    )
  `);

  // Quotes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      text TEXT NOT NULL,
      page_or_location TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    )
  `);

  // Annotations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS annotations (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      text TEXT NOT NULL,
      type TEXT DEFAULT 'highlight',
      page_or_location TEXT,
      note TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    )
  `);

  // Settings / Preferences table (replaces localStorage)
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT ''
    )
  `);

  // Insert defaults if fresh install
  const defaultSettings = [
    ['theme', 'light'],
    ['sidebarOpen', 'true'],
    ['reader_font_size', '16'],
    ['reader_line_height', '1.8'],
    ['last_page', 'home']
  ];
  for (const [k, v] of defaultSettings) {
    db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [k, v]);
  }

  // Create indexes for performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_books_status ON books(status);
    CREATE INDEX IF NOT EXISTS idx_books_favourite ON books(favourite);
    CREATE INDEX IF NOT EXISTS idx_books_last_opened ON books(last_opened);
    CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
    CREATE INDEX IF NOT EXISTS idx_quotes_book_id ON quotes(book_id);
    CREATE INDEX IF NOT EXISTS idx_annotations_book_id ON annotations(book_id);
  `);

  persistDb();
}

// ===== Helpers =====
function prepare(sql) {
  return db.prepare(sql);
}

function getOne(sql, params = []) {
  const stmt = prepare(sql);
  stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

function getAll(sql, params = []) {
  const stmt = prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function run(sql, params = []) {
  db.run(sql, params);
  persistDb();
}

// ===== Book CRUD =====
function addBook(book) {
  run(
    `INSERT OR REPLACE INTO books (id, path, format, title, author, cover_path, last_opened, total_time_spent, progress_percent, current_location, status, favourite, date_added, search_index)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      book.id, book.path, book.format, book.title || 'Unknown', book.author || '',
      book.cover_path || null, book.last_opened || 0, book.total_time_spent || 0,
      book.progress_percent || 0, book.current_location || null, book.status || 'unread',
      book.favourite ? 1 : 0, book.date_added || Math.floor(Date.now() / 1000),
      (book.title || '') + ' ' + (book.author || '')
    ]
  );
}

function getBooks(query = '') {
  if (query) {
    return getAll(
      'SELECT * FROM books WHERE search_index LIKE ? ORDER BY title ASC',
      [`%${query.toLowerCase()}%`]
    );
  }
  return getAll('SELECT * FROM books ORDER BY title ASC');
}

function getBooksByStatus(status) {
  return getAll('SELECT * FROM books WHERE status = ? ORDER BY last_opened DESC', [status]);
}

function getFavouriteBooks() {
  return getAll('SELECT * FROM books WHERE favourite = 1 ORDER BY last_opened DESC');
}

function getTopBooks(limit = 5) {
  return getAll('SELECT * FROM books ORDER BY total_time_spent DESC LIMIT ?', [limit]);
}

function getBookById(id) {
  return getOne('SELECT * FROM books WHERE id = ?', [id]);
}

function updateBook(id, updates) {
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }
  values.push(id);
  run(`UPDATE books SET ${fields.join(', ')} WHERE id = ?`, values);
}

function deleteBook(id) {
  run('DELETE FROM books WHERE id = ?', [id]);
}

// ===== Shelfs =====
function addShelf(name) {
  const id = 'shelf_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  run('INSERT OR IGNORE INTO shelfs (id, name) VALUES (?, ?)', [id, name]);
  return id;
}

function getShelfs() {
  return getAll('SELECT * FROM shelfs ORDER BY name ASC');
}

function getShelfBooks(shelfId) {
  return getAll(`
    SELECT b.* FROM books b
    JOIN book_shelfs bs ON b.id = bs.book_id
    WHERE bs.shelf_id = ?
    ORDER BY b.title ASC
  `, [shelfId]);
}

function addBookToShelf(bookId, shelfId) {
  run('INSERT OR IGNORE INTO book_shelfs (book_id, shelf_id) VALUES (?, ?)', [bookId, shelfId]);
}

function removeBookFromShelf(bookId, shelfId) {
  run('DELETE FROM book_shelfs WHERE book_id = ? AND shelf_id = ?', [bookId, shelfId]);
}

function deleteShelf(id) {
  run('DELETE FROM shelfs WHERE id = ?', [id]);
}

// ===== Quotes =====
function addQuote(bookId, text, location) {
  const id = 'quote_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  run('INSERT INTO quotes (id, book_id, text, page_or_location) VALUES (?, ?, ?, ?)', [id, bookId, text, location || '']);
  return id;
}

function getQuotes(bookId) {
  return getAll('SELECT * FROM quotes WHERE book_id = ? ORDER BY created_at DESC', [bookId]);
}

function getAllQuotes() {
  return getAll('SELECT q.*, b.title as book_title FROM quotes q JOIN books b ON q.book_id = b.id ORDER BY q.created_at DESC');
}

function deleteQuote(id) {
  run('DELETE FROM quotes WHERE id = ?', [id]);
}

// ===== Annotations =====
function addAnnotation(bookId, text, type, location, note) {
  const id = 'annot_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  run('INSERT INTO annotations (id, book_id, text, type, page_or_location, note) VALUES (?, ?, ?, ?, ?, ?)', [id, bookId, text, type, location || '', note || '']);
  return id;
}

function getAnnotations(bookId) {
  return getAll('SELECT * FROM annotations WHERE book_id = ? ORDER BY created_at DESC', [bookId]);
}

function deleteAnnotation(id) {
  run('DELETE FROM annotations WHERE id = ?', [id]);
}

// ===== Stats =====
function getStats() {
  const totalBooks = getOne('SELECT COUNT(*) as count FROM books');
  const totalFavourites = getOne('SELECT COUNT(*) as count FROM books WHERE favourite = 1');
  const totalReading = getOne("SELECT COUNT(*) as count FROM books WHERE status = 'reading'");
  const totalFinished = getOne("SELECT COUNT(*) as count FROM books WHERE status = 'finished'");
  const totalTime = getOne('SELECT SUM(total_time_spent) as total FROM books');
  const totalQuotes = getOne('SELECT COUNT(*) as count FROM quotes');
  const totalAnnotations = getOne('SELECT COUNT(*) as count FROM annotations');
  const totalShelfs = getOne('SELECT COUNT(*) as count FROM shelfs');

  return {
    totalBooks: totalBooks ? totalBooks.count : 0,
    totalFavourites: totalFavourites ? totalFavourites.count : 0,
    totalReading: totalReading ? totalReading.count : 0,
    totalFinished: totalFinished ? totalFinished.count : 0,
    totalTimeSeconds: totalTime ? (totalTime.total || 0) : 0,
    totalQuotes: totalQuotes ? totalQuotes.count : 0,
    totalAnnotations: totalAnnotations ? totalAnnotations.count : 0,
    totalShelfs: totalShelfs ? totalShelfs.count : 0
  };
}

// ===== Settings / Preferences =====
function setSetting(key, value) {
  run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, String(value)]);
}

function getSetting(key, defaultValue) {
  const row = getOne('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : (defaultValue || null);
}

function getAllSettings() {
  return getAll('SELECT * FROM settings');
}

module.exports = {
  init,
  addBook,
  getBooks,
  getBooksByStatus,
  getFavouriteBooks,
  getTopBooks,
  getBookById,
  updateBook,
  deleteBook,
  addShelf,
  getShelfs,
  getShelfBooks,
  addBookToShelf,
  removeBookFromShelf,
  deleteShelf,
  addQuote,
  getQuotes,
  getAllQuotes,
  deleteQuote,
  addAnnotation,
  getAnnotations,
  deleteAnnotation,
  getStats,
  setSetting,
  getSetting,
  getAllSettings
};
