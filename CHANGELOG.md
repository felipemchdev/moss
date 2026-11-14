# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-11-14

### Added
- Native page zoom and scaling controls (`Ctrl++`, `Ctrl+-`, `Ctrl+0`) with WebView2 native scale factor (`0.25` to `5.0`) (`src/zoom.ts`, `src-tauri/src/lib.rs`).
- Persistent domain-specific zoom memory in `localStorage` (`moss:domain_zoom`) automatically restored on page navigation and tab activation.
- Omnibar zoom badge pill showing current scale percentage (e.g. `125%`) when not 100%, resetting to 100% on click with accessible tooltip and aria-label.
- Keyboard shortcuts for zoom in (`Ctrl++`, `Ctrl+=`, `NumpadAdd`), zoom out (`Ctrl+-`, `NumpadSubtract`), and zoom reset (`Ctrl+0`, `Numpad0`), along with `Ctrl + Wheel` zooming.
- Integrated zoom controls with Split View focused pane resolution (`getTargetTab()`) and registered shortcuts in keyboard shortcuts modal (`src/shortcuts-modal.ts`).

### Security
- Strict IPC capability isolation: `set_tab_zoom` is scoped exclusively to the `main` chrome webview with zero IPC granted to remote tab webviews.
- Tolerant webview lookup preventing console crashes or errors on blank/uninitialized tabs.

## [0.5.0] - 2026-11-14

### Added
- Modo Leitura / Reader Mode (`Ctrl+Alt+R`): distraction-free article reader powered by non-destructive Rust DOM cloning and candidate scoring, with reading time and word count metadata (`src/reader-view.ts`, `src-tauri/src/lib.rs`).
- Floating reader toolbar pill with real-time typography controls: custom fonts (Sans, Serif, Mono), font size stepper (14–24px), column widths (compact, normal, wide), and custom themes (*Moss Dark*, *Light Cream*, *Parchment Sepia*).
- Reader mode link interception opening remote links in new browser tabs while preserving in-article anchor jumps (`#hash`).
- Localizar na Página / Find in Page (`Ctrl+F`): in-page text search with non-destructive `CSS.highlights` (`::highlight(__moss-find-match)`, `::highlight(__moss-find-active)`), case sensitivity toggle (`Aa`), and match navigation buttons (`src/find-in-page.ts`).
- Zen Workspaces switcher and management (`src/workspaces.ts`, `src/workspace-switcher.ts`): scoped workspace views, tab isolation, and two-step workspace deletion.

### Security
- Fail-closed reader mode HTML sanitizer stripping unsafe tags (`script`, `style`, `base`, `meta`, `link`, `iframe`, `object`, `embed`, `form`, `input`, `button`, `textarea`, `select`) and dangerous attributes (`on*`, `style`, `srcdoc`, `srcset`, `formaction`, and obfuscated `javascript:` URLs).
- Strict IPC capability isolation: `extract_reader_content` is strictly scoped to the `main` chrome webview with zero IPC granted to remote tab webviews.

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
