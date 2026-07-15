# Peak Reader

An Electron based Vibecoded book reader by a script kiddie >:)

## Features

- **Multi-format support**: EPUB, MOBI, AZW3, AZW, FB2, PDF, CBZ, CBT, CBR, CB7, TXT, MD, HTML, XHTML, XML, MHTML, DOCX
- **13 customizable themes**: Light, Dark, Sepia, Dracula, Catppuccin, Nord, Gruvbox, Everforest, Solarized, Tokyo Night, Rose Pine, One Dark, Monokai
- **Library management**: SQLite-backed local database for fast library management
- **Annotations**: Highlight, add notes, save quotes, define words, translate text
- **Shelfs**: Organize books into custom categories/shelfs
- **Reading stats**: Track time spent, reading progress, favourites
- **Performance**: Lazy-loaded thumbnails, debounced search, background metadata indexing
- **Offline-first**: Works entirely offline once installed

## Quick Start

### Prerequisites

- Node.js 18+ and npm

### Install & Run

```bash
cd peak-reader
npm install
npm start
```

### Build for Windows

```bash
npm run build:win
```

Output: `dist/Peak Reader Setup X.X.X.exe` (NSIS installer with Start Menu shortcut)

### Build for Linux

```bash
npm run build:linux
```

Output: `dist/Peak Reader-X.X.X.AppImage` and `dist/Peak Reader-X.X.X_amd64.deb`

## Project Structure

```
peak-reader/
├── src/
│   ├── main.js              # Electron main process
│   ├── preload.js           # Secure IPC bridge
│   ├── renderer/
│   │   ├── index.html       # Main UI HTML
│   │   └── app.js           # Renderer application logic
│   ├── db/
│   │   └── database.js      # SQLite database layer
│   ├── utils/
│   │   ├── metadata.js      # Book metadata extraction
│   │   └── performance.js   # Performance utilities
│   └── renderers/           # Format-specific renderers
├── assets/
│   ├── css/
│   │   └── styles.css       # All themes + UI styles
│   ├── icon.png             # App icon (PNG)
│   └── icon.ico             # App icon (Windows)
└── package.json             # Dependencies + electron-builder config
```

## Supported Formats & Renderers

| Format Group | Extensions | Renderer |
|---|---|---|
| Reflowable ebooks | EPUB, MOBI, AZW3, AZW, FB2 | epub.js |
| Fixed layout | PDF | pdf.js (lazy page rendering) |
| Comics | CBZ, CBT, CBR, CB7 | Image sequence viewer |
| Text documents | TXT, MD, HTML, XHTML, XML, MHTML, DOCX | HTML/text renderer |

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Ctrl+I | Open import dialog |
| Escape | Close modals/dropdowns |
| Sidebar collapse | Click hamburger icon |

## Data Storage

- **Database**: SQLite (`~/.peak-reader/peak-reader.db`)
- **Covers**: `~/.peak-reader/covers/`
- **Preferences**: localStorage (theme, sidebar state)


