# Paperweave

Paperweave is an offline-first desktop app for building a new PDF from selected pages across multiple source documents.

## Features

- Import multiple PDF files through the native file picker
- Render page thumbnails locally with PDF.js
- Select individual pages or all currently filtered pages
- Mix pages from any number of source documents
- Reorder pages by dragging or with precise up/down controls
- Duplicate and remove output pages
- Export through the native save dialog without quality loss
- Preserve original page dimensions and orientation
- Keep files entirely on the device

## Technology

- [Wails v2](https://wails.io/) and Go for the desktop shell and PDF export
- React and TypeScript for the interface
- [pdfcpu](https://pdfcpu.io/) for lossless page extraction and merging
- [PDF.js](https://mozilla.github.io/pdf.js/) for local thumbnail rendering

## Development

Requirements: Go 1.25+, Node.js, npm, and Wails v2.

```bash
wails dev
```

The Vite development server supports normal frontend hot reload while Wails rebuilds Go changes.

## Production build

```bash
wails build
```

The packaged application is written to `build/bin/`. On macOS this creates `Paperweave.app`.

## Project layout

- `app.go` — native dialogs, PDF validation, page extraction, and export
- `main.go` — Wails window and application configuration
- `frontend/src/App.tsx` — workspace UI and selection/order state
- `frontend/src/App.css` — responsive desktop styling

## Notes

Encrypted PDFs that require a password are not currently supported. PDF contents are only read from local disk and are never sent over the network.
