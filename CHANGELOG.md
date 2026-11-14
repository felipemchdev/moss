# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.12.0] - 2026-11-14

### Added
- Zen Glance / Link Peeking (`Shift+Click` or `Ctrl+Shift+G`) inspired by Zen Browser and Arc (`src/glance.ts`, `src/styles/browser-chrome.css`).
- Centered squircle floating modal card overlaying the browser without creating permanent tabs or polluting tab hierarchy.
- Isolated Glance webview (`__glance__`) rendered at 88vw/84vh with synchronized responsive geometry (`ResizeObserver`).
- Glance header controls: eye badge, page title and URL display, "Abrir na aba" action (`Ctrl+O`) to promote preview to active tab, "Copiar link" action, and "Fechar" (`Esc`).
- Tab context menu action: "Espiar no Glance (Zen Glance)".
- Command Palette action: "Espiar URL (Zen Glance)".
- Bookmarks Bar integration: `Shift+Click` or `Alt+Click` on any bookmark directly opens Glance.
- Documentation in keyboard shortcuts modal (`src/shortcuts-modal.ts`).

## [0.11.0] - 2026-11-14

### Added
- Dedicated Downloads Panel (`Ctrl+J`) inspired by Zen Browser and Arc (`src/downloads-panel.ts`, `src/downloads.ts`, `src/styles/browser-chrome.css`).
- Slide-over glassmorphic panel listing downloads with real-time progress bars, timestamps, and status (active, completed, failed).
- Direct file interactions: "Abrir arquivo" (`openPath`), "Mostrar na pasta" (`revealItemInDir`), and "Abrir pasta de downloads" (`downloadDir`).
- Clear downloads history action and item removal.
- Global shortcut `Ctrl+J` and Command Palette action (`Ctrl+K`).
- Seamless sidebar integration: clicking `ui.downloadsButton` toggles the downloads panel.
- Native child webview occlusion prevention via `syncWebviewVisibility()`.
- Documentation in keyboard shortcuts modal (`src/shortcuts-modal.ts`).

## [0.10.0] - 2026-11-14

### Added
- Session Restoration & Closed Tab Recovery (`Ctrl+Shift+T`) with LIFO tab recovery stack (`src/tabs.ts`).
- `moss:closed_tabs_stack`: stores up to 30 closed tabs with original URL, page title, workspace affiliation, and pinned state.
- `Ctrl+Shift+T` global keyboard shortcut restoring the most recently closed tab, recreating its native webview and navigating back to its page.
- "Reabrir aba fechada" quick action in Command Palette (`Ctrl+K`) and Tab Context Menu (`src/context-menu.ts`, `src/command-palette.ts`).
- Full Session Persistence (`moss:open_session`): automatically records active and background tabs across all workspaces, restoring complete browser session upon reopening when enabled (`restoreSession: true` in settings).
- Settings integration with `restoreSession` setting (`src/settings.ts`).
- Documentation in keyboard shortcuts modal (`src/shortcuts-modal.ts`).

## [0.9.0] - 2026-11-14

### Added
- Collapsible Sidebar & Compact Mode (`Ctrl+B`) inspired by Zen Browser Compact Mode (`src/sidebar.ts`, `src/styles/browser-chrome.css`).
- 56px ultra-compact dock layout (`#app.sidebar-collapsed`) preserving tab favicons, active status indicators, compact window controls, workspace icon indicator, and centered quick action buttons.
- Floating Top Bar (`.floating-top-bar`) activated in compact mode offering seamless Back, Forward, Reload navigation buttons, security status lock icon, interactive URL / search chip with `Ctrl+K` hint, reader mode, split view, bookmark star, and expand sidebar action.
- Automatic viewport geometry calculation with zero HWND occlusion: `webviewContainer` dynamically resizes to fill the expanded horizontal space and adjusts vertically below the floating top bar with full `ResizeObserver` and `transitionend` synchronization.
- Quick Search integration: clicking the collapsed omnibar or pressing `Ctrl+L` in compact mode automatically invokes the Command Palette (`Ctrl+K`).
- Full keyboard integration with `Ctrl+B` toggle, command palette action, and shortcuts modal documentation (`src/shortcuts-modal.ts`).
- Persistent sidebar state stored in `localStorage` (`moss:sidebar_collapsed`).

### Security
- Native child webviews remain strictly isolated with zero IPC permissions required for remote tabs. All sidebar and floating top bar controls interact purely within the secure main window shell.

## [0.8.0] - 2026-11-14

### Added
- Unified Command Palette & Quick Launcher (`Ctrl+K` / `Ctrl+P`) inspired by Spotlight, Raycast, and Zen Browser (`src/command-palette.ts`, `src/styles/browser-chrome.css`).
- Real-time multi-source search across:
  - Open tabs across all workspaces with workspace badges, pinned tab indicators, and active tab highlights.
  - Comprehensive browser actions: New Tab (`Ctrl+T`), Close Tab (`Ctrl+W`), Toggle Split View (`Ctrl+\`), Swap Split Panes, Close Split, Reader Mode (`Ctrl+Alt+R`), Find in Page (`Ctrl+F`), Site Security & Permissions, Clear Active Site Data, Toggle Bookmark, Zoom In/Out/Reset (`Ctrl++`/`-`/`0`), Navigation (Back, Forward, Reload `F5`), Workspace switching & creation, History, Settings, and Keyboard Shortcuts.
  - Bookmarks with title and URL search.
  - Browsing history with real-time and debounced persistent store lookup.
  - Web navigation and search fallback using the default configured search engine.
- Keyboard ergonomics with `ArrowDown`/`ArrowUp` navigation, `Enter` execution, `Escape` closing, and focus restoration to the previously active element.
- Accessible ARIA combobox pattern (`role="combobox"`, `role="listbox"`, `role="option"`, `aria-activedescendant`, `aria-selected`).
- Glassmorphic modal UI centered in the upper viewport with backdrop blur overlay, smooth spring transitions, category headers, shortcut key badges, item count indicator, and keyboard navigation hints footer.
- Registered `Ctrl+K` and `Ctrl+P` shortcuts in keyboard shortcuts modal (`src/shortcuts-modal.ts`) and empty state shortcut overview (`src/main.ts`).

### Security
- Complete native webview occlusion protection: `syncWebviewVisibility()` automatically hides native child webviews (`webview.showTabs([])`) while the Command Palette is open, preventing native HWND punch-through or visual overlap.
- Zero IPC permissions required: Command Palette operates within the existing secure frontend state and IPC architecture, maintaining strict isolation with zero IPC permissions for remote tab webviews (`tab-*`).

## [0.7.0] - 2026-11-14

### Added
- Site info & security button in omnibar (`.omnibar-security-btn`) dynamically displaying security status: HTTPS lock (`.omnibar-security-btn--secure`), HTTP unlock (`.omnibar-security-btn--insecure`), or local globe (`src/main.ts`, `src/icons.ts`).
- Central de Informações e Permissões do Site popover (`src/site-info-popover.ts`, `src/site-permissions.ts`) with glassmorphic overlay, connection security details, tab-scoped trackers blocked count, focus trap, and per-domain permission toggles (`camera`, `microphone`, `geolocation`, `notifications` with `ask`, `allow`, `block`).
- Real-time permission enforcement backend via Tauri 2 `WebviewBuilder::on_permission_request` resolving `PermissionResponse::Allow`, `PermissionResponse::Deny`, or `PermissionResponse::Default` directly based on stored domain permissions in `BrowserState`.
- Native commands `set_site_permission`, `sync_site_permissions`, and `reset_site_permissions` syncing frontend permission choices to the Rust state.
- Per-domain browsing data clearance (`clear_tab_data` in `src-tauri/src/lib.rs`, `src/webview.ts`) with 2-step inline confirmation, deleting all origin and wildcard cookies (including HttpOnly cookies via WebView2 `CookieManager`), origin `localStorage`, `sessionStorage`, `caches`, and `indexedDB` databases with open-connection timeout handling before page reload.
- Persistent site permissions store (`moss:site_permissions` in `localStorage`) with automatic cleanup when values revert to defaults.

### Security
- Strict IPC capability isolation: `clear_tab_data`, `set_site_permission`, `sync_site_permissions`, and `reset_site_permissions` are declared exclusively in `capabilities/default.json` for `"webviews": ["main"]`, maintaining 100% isolation and zero IPC permissions for remote tab webviews (`tab-*`).
- Tolerant webview lookup in `clear_tab_data` gracefully handling tabs without native webviews.

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
