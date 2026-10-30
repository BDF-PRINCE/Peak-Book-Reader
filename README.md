# Peak Reader

Latest release: [v2.5.0](https://github.com/BDF-PRINCE/Peak-Book-Reader/releases/tag/v2.5.0)
[![Latest release](https://img.shields.io/github/v/release/BDF-PRINCE/Peak-Book-Reader?include_prereleases&label=latest)](https://github.com/BDF-PRINCE/Peak-Book-Reader/releases/latest)

An Electron based Vibecoded book reader by a script kiddie >:)
<img width="1920" height="1030" alt="image" src="https://github.com/user-attachments/assets/f7151e15-1899-4670-ba0d-72716d7031d4" />
<img width="1920" height="1030" alt="image" src="https://github.com/user-attachments/assets/ddd8ea85-b7bc-4621-a813-625028f9f0d7" />
<img width="1920" height="1030" alt="image" src="https://github.com/user-attachments/assets/c02a0e51-b170-4b0a-bfc2-d2b2053b4b8c" />
<img width="1920" height="1030" alt="image" src="https://github.com/user-attachments/assets/9d73ef3d-af7a-441f-a84f-3a0cbc6a82b5" />
<img width="1920" height="1030" alt="image" src="https://github.com/user-attachments/assets/9ee16598-388f-457b-a9c7-214c1eb6a82b5" />
<img width="1920" height="1030" alt="image" src="https://github.com/user-attachments/assets/453f0945-a3ef-4157-a138-9af6500455f2" />
<img width="1920" height="1030" alt="image" src="https://github.com/user-attachments/assets/196164ae-a12b-4bd1-afed-b3f1ca06fddf" />

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

