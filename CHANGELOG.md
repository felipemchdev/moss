# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-11-14

### Added
- Tab context menu on right-click with options: Reload, Duplicate, Close Tab, Close Other Tabs (`src/context-menu.ts`).
- Keyboard shortcuts cheat sheet modal (`Ctrl+/` or `?`) with accessible two-column table and focus trap (`src/shortcuts-modal.ts`).
- Native download indicator pill in browser chrome wired to Tauri 2 `WebviewBuilder::on_download` events (`src/downloads.ts`, `src-tauri/src/lib.rs`).
- Native navigation keyboard shortcuts: `F5` (reload), `Alt+←` (back), `Alt+→` (forward) with modal-open guards.
- Support for download status states: indeterminate progress on start, success completion, and failure alerts with 4-second auto-dismiss.

### Fixed
- Webview HWND occlusion safeguard: positioned download indicator within top chrome row above child webview boundaries.
- Context menu positioning: synchronous layout measurement with `visibility: hidden` before display to prevent edge clipping.
- Event listener cleanup: added `destroyed` lifecycle flag to prevent unlisten leaks on early unmount.

## [0.3.0] - 2026-11-14

### Added
- Bookmarks bar located below toolbar with localStorage persistence and reactive pub/sub store (`src/bookmarks.ts`).
- Omnibar star button toggle with smooth animations and dynamic tooltip (`src/main.ts`).
- Persistent navigation history drawer (`Ctrl+H`) with real-time fuzzy filtering, single item deletion, and two-step clear (`src/history.ts`, `src/history-panel.ts`).
- Settings modal (`Ctrl+,`) with theme switcher (Dark, Light Warm Cream, System), search engine picker (DuckDuckGo, Google, Bing), and custom homepage configuration (`src/settings.ts`, `src/settings-panel.ts`).
- Refined Zen Browser pastel green palette: *Misty Sage* (`#b8eb9a`), *Soft Matcha* (`#6eb54f`), *Moss Pastel* (`#a7e286`), and warm cream light mode (`src/styles/tokens.css`).
- Universal panel focus controller with Tab circular navigation and global Escape key handler (`src/panel.ts`).

### Changed
- Migrated theme switching from media queries to `:root[data-theme]` attributes managed dynamically in JavaScript.
- Validated WCAG AA/AAA color contrast ratios across all semantic tokens in light and dark modes.

## [0.2.0] - 2026-11-13

### Added
- Multi-tab architecture managing native child webviews (`tab-<id>`) rendered directly via Tauri 2 WebviewBuilder (`src-tauri/src/lib.rs`).
- Tab state store supporting tab creation, selection, closing, and navigation history tracking (`src/tabs.ts`).
- Synchronized omnibar with real-time URL resolution, search fallback, and loading indicator (`src/omnibar.ts`, `src/main.ts`).
- Core navigation controls: Back, Forward, Reload, and New Tab buttons.
- Design tokens establishing macOS glassmorphism (`backdrop-filter: blur(24px) saturate(190%)`) and Apple spring curves (`src/styles/tokens.css`, `src/styles/browser-chrome.css`).

### Security
- Restricted child webview navigation strictly to `http`, `https`, and `about:blank`.
- Isolated IPC privileges to main chrome window only.

## [0.1.0] - 2026-11-13

### Added
- Bootstrap Moss browser project using Tauri 2.x, TypeScript, Vite, and pnpm.
- GitHub Actions continuous integration workflow (`.github/workflows/ci.yml`).
- MIT License and project documentation skeleton.
