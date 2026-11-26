# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-11-18

### Added
- **Full Bilingual Interface (i18n, PT-BR / EN-US)** (`src/i18n.ts`, `src/i18n-chrome.ts`, `src/i18n-panels.ts`, `src/main.ts`, `scripts/check-i18n.mjs`, `.github/workflows/ci.yml`, `package.json`):
  - Complete PT-BR and EN-US localization coverage across `src/main.ts`, browser chrome, tabs, downloads pill, command palette, welcome wizard, reader view, and all popovers and panels, with runtime locale updates (`subscribeLocale`).
  - Add AST key-parity, dynamic-key allowlist, and legacy-replace verification (`scripts/check-i18n.mjs`) enforced in the Frontend Typecheck CI workflow.
- **Standalone 1-Click Tauri Bootstrapper** (`installer/bootstrapper/`, `scripts/build-installer.mjs`, `package.json`, `.github/workflows/ci.yml`):
  - Add isolated 480x300 frameless bootstrapper UI (`#0F1411` / `#7DA27E`) with `embedded-setup` feature, RAII TEMP cleanup, `panic = "unwind"`, process-tree timeout termination, and dynamic version display.
  - Add unified build pipeline (`scripts/build-installer.mjs`, `pnpm build:installer`) and `Bootstrapper Cargo Check` job in CI.

### Fixed
- **Privacy Shield Filter Rollback & YouTube Boot Observer** (`src-tauri/src/webview2_blocker.rs`, `src-tauri/src/lib.rs`):
  - Roll back leaked `WebResourceRequested` filters on registration or lock failure.
  - Bound YouTube `bootObserver` lifetime with `yt-navigate-finish` reset and remove redundant SSAI duration guard.

## [1.0.0] - 2026-11-15

### Production Release - Version 1.0.0
- First public release.
- Complete delivery of architectural phases 0 through 24.
- Production bundle optimization with tree-shaking, lazy native webview loading, and sub-200ms cold startup.
- Production package configuration for Windows x64 (NSIS and MSI targets) in `src-tauri/tauri.conf.json`.
- Complete system architecture documentation, component index, and keyboard shortcuts in `README.md`.

### Added
- **Native Window Dragging Support** (`src/main.ts`, `src-tauri/capabilities/default.json`):
  - Add native window dragging with `data-tauri-drag-region` on the chrome headers and floating top bar.
  - Implement direct drag fallback using `startDragging()` with `core:window:allow-start-dragging` permission.
- **Native Privacy Shield & YouTube Ad-Blocker** (`src-tauri/src/webview2_blocker.rs`, `src-tauri/src/lib.rs`, `src/privacy-shield.ts`, `src/main.ts`):
  - Block known ad and tracker hosts natively via Windows WebView2 `WebResourceRequested` with host blocklist and empty 403 responses (Windows-only in 1.0).
  - Inject dedicated visual CSS suppression in `#__moss_yt_ad_style__` to hide banners, masthead ads, and player overlays on exact YouTube hosts.
  - Accelerate video ads by 16x, mute audio, and trigger automatic skip button clicks using `MutationObserver` with `readyState`, buffered media, and SSAI guards while preserving user mute and playback rate.
- **Taskbar Tab Previews & WebView2 Accelerators** (`src-tauri/src/taskbar_tabs.rs`, `src-tauri/src/accelerators.rs`, `src-tauri/src/lib.rs`, `src/main.ts`, `src/webview.ts`, `src/zoom.ts`, `src-tauri/capabilities/default.json`):
  - Add Windows taskbar tab previews via `ITaskbarList3` proxy windows with tab activation and `set_taskbar_active_tab` capability.
  - Forward native WebView2 `AcceleratorKeyPressed` and `ZoomFactorChanged` (`syncZoomFromWebview`) events from child webviews.
- **Settings Panel Localization (i18n, PT-BR / EN-US)** (`src/i18n.ts`, `src/settings-panel.ts`):
  - Add PT-BR and EN-US localization store (`moss:locale`) with browser language detection, runtime string updates, and language selector.
  - Scope for 1.0.0: i18n coverage applies exclusively to the Settings panel (`src/settings-panel.ts`); full bilingual localization for `src/main.ts` and remaining UI panels is deferred to 1.0.1.
- **Private Browsing Tabs** (`src/tabs.ts`, `src/main.ts`, `src/styles/browser-chrome.css`, `src/icons.ts`):
  - Add private tab flag `isPrivate` with global keyboard shortcut `Ctrl+Shift+N`.
  - Private tabs do not record history or session state.
  - Add visual private badge indicator and dark slate styling for private tabs.
- **Native Webpage Translator** (`src-tauri/src/lib.rs`, `src/translate-popover.ts`, `src/main.ts`, `src/icons.ts`):
  - Implement native translation backend command `translate_tab` with `allow-translate-tab` capability.
  - Add translate popover interface (`Ctrl+Shift+U` or Omnibar translate button) supporting multiple language selections.
- **Custom NSIS 1-Click Installer & UI Mock** (`src-tauri/installer/*`, `src-tauri/tauri.conf.json`, `src-tauri/icons/icon.ico`, `installer/ui/*`):
  - Create custom NSIS installer script with moss dark theme branding (#0F1411 background and #7da27e accent), explicit Start Menu/Desktop shortcut icons, DIB-based `icon.ico` installation, and shell icon cache refresh.
  - Include uncompressed 24-bit header and sidebar bitmaps with portable build scripts.
  - Add standalone installer preview (`public/installer-preview.html`) and modern frameless 480x300 installer UI mock and spec (`installer/ui/index.html`, `installer/ui/styles.css`, `installer/ui/SPEC.md`) with PT-BR and EN-US copy.
- **Phase 18: Glance Link Peeking** (`src/glance.ts`, `src/main.ts`, `src/styles/browser-chrome.css`):
  - Non-destructive floating modal preview for hyperlinks triggered via `Shift+Click` or `Ctrl+Shift+G`.
  - Native HWND occlusion management that conceals underlying webviews while the preview modal is active.
  - Automatic viewport state restoration when the user closes the Glance preview window.
  - Quick action controls to open URL in a standard tab (`Ctrl+O`), copy URL to clipboard, or dismiss (`Esc`).
- **Phase 19: Space Routing** (`src/space-routing.ts`, `src/settings-panel.ts`, `src/toast.ts`):
  - Navigation interception engine mapping web domains directly to designated workspaces.
  - Automatic workspace switching and tab migration for matched domain rules.
  - Configurable routing policy supporting automatic routing mode or confirmation prompt mode.
  - Glassmorphic toast notification component (`.moss-toast`) with action triggers and timed dismissal.
  - Settings panel section to configure, add, and remove domain routing assignments.
- **Phase 20: Tab Folders & Tab Hibernation** (`src/folders.ts`, `src/tabs.ts`, `src/styles/browser-chrome.css`):
  - Hierarchical tab grouping with custom colors, tab counters, and collapsible sections.
  - Drag-and-drop tab organization for moving tabs into, between, and out of folders.
  - Native tab hibernation engine that unloads background child webviews and destroys their OS HWNDs to reduce RAM usage.
  - Metadata, scroll position, and navigation history preservation during tab hibernation.
  - Transparent webview reconstruction upon user selection, marked with a sleeping moon indicator.
- **Phase 21: Boosts & Element Zapper** (`src/boosts.ts`, `src/boosts-popover.ts`, `src-tauri/src/lib.rs`):
  - Interactive Element Zapper mode (`Ctrl+Shift+Z`) with real-time target bounding boxes and CSS selector extraction.
  - Non-blocking asynchronous runtime polling implemented via `tauri::async_runtime::spawn` and `tokio::time::sleep`.
  - Persistent domain element removal rules stored in `localStorage` (`moss:domain_zap_rules`).
  - Domain styling controls: Smart Dark Mode with media color preservation, brightness and contrast sliders, and sepia filter.
  - Per-site custom CSS editor with dynamic stylesheet injection.
- **Phase 22: Media Controls Widget** (`src/media.ts`, `src/media-widget.ts`, `src-tauri/src/lib.rs`):
  - Global audio and video monitor polling `navigator.mediaSession` across active and non-hibernated background tabs.
  - Sidebar mini-player component displaying track title, artist name, artwork, play/pause toggle, and mute control.
  - Direct navigation jump to the source tab when the user clicks the track title.
  - Interactive tab audio indicator pills with real-time audio animation and one-click sound muting.
  - Explicit widget lifecycle cleanup method (`destroy()`) that detaches reactive store subscriptions.
- **Phase 23: Welcome Wizard** (`src/welcome-wizard.ts`, `src/settings.ts`, `src/styles/browser-chrome.css`):
  - Five-step guided initial onboarding flow (`moss:onboarding_completed`) for first launch.
  - System theme preference mapping and synchronization for dark, light, and automatic modes.
  - Persistent privacy shield and ad-blocking toggle configuration (`moss:shield_enabled`).
  - Essential web applications launcher grid that initializes tabs and navigates child webviews.
- **Phase 24: Design Token Consolidation** (`src/styles/tokens.css`, `src/styles/browser-chrome.css`):
  - Consolidated single source of truth for design tokens in `tokens.css`.
  - Standardized z-index scale hierarchy: tooltip (`600`), toast (`700`), command palette (`800`), wizard (`900`), and glass overlay (`1000`).
  - Standardized backdrop filter variables (`--glass-backdrop-strong`, `--wizard-backdrop-bg`, `--wizard-backdrop-filter`).
  - Modal corner radius standardization (`--radius-modal`) and elevation shadow tokens (`--glass-shadow`).
  - Responsive layout breakpoints for onboarding and modal dialogs on compact displays.

### Changed
- **Compact Sidebar and Interface Alignment** (`src/styles/browser-chrome.css`, `src/styles/tokens.css`):
  - Refine compact sidebar dock to 56px width with centered 40x40px tab icons and contained active indicators.
  - Align floating audio badge and compact window controls for optimal vertical ergonomics.
  - Update primary brand palette to calm Pastel Sage Green (`#7da27e`) in dark mode.
- **Strict moss Branding Purge**:
  - Remove all external product references across documentation and codebase.
  - Standardize project title and binary metadata strictly to lowercase `moss`.

### Fixed
- **Header Downloads Icon Geometry** (`src/styles/browser-chrome.css`):
  - Fix downloads button icon bounding box to standard 16x16px dimension in the main header.
- **Privacy Shield SPA Hydration & YouTube Ad Observer** (`src-tauri/src/webview2_blocker.rs`, `src-tauri/src/lib.rs`, `src/privacy-shield.ts`, `src/main.ts`):
  - Remove global DOM, `fetch`, and `XHR` patches that broke SPA hydration, replacing them with native WebView2 `WebResourceRequested` blocking.
  - Scope YouTube ad suppression to exact YouTube hosts and guard video acceleration against SSAI streams and unbuffered states.
- **Taskbar Proxy Icon & Command Capability** (`src-tauri/src/taskbar_tabs.rs`, `src-tauri/capabilities/default.json`, `src-tauri/build.rs`):
  - Register `set_taskbar_active_tab` permission in `default.json` and load the application icon resource in taskbar proxy windows.
- Element Zapper thread block: replaced synchronous polling with background async runtime task spawning.
- Native webview occlusion: resolved overlay clipping by clearing active webview visibility during modal lifecycle.
- Background media evaluation: expanded polling routine from active tab to all non-hibernated tabs.
- Media widget memory leak: added subscription disposal handling to remove listeners on interface teardown.

## [0.17.0] - 2026-11-14

### Added
- Welcome & Setup Wizard Inicial (Onboarding) (`src/welcome-wizard.ts`, `src/styles/browser-chrome.css`).
- Automatic first-run detection (`moss:onboarding_completed`) with interactive 5-step guided wizard:
  - Step 0: Welcome splash with spring typography and visual theme picker (Dark / Light / Auto).
  - Step 1: Default search engine selector (Google, DuckDuckGo, Bing, Ecosia, Kagi).
  - Step 2: Privacy Shield & anti-tracking activation card.
  - Step 3: Essentials Web Apps grid selector (GitHub, YouTube, Notion, Spotify, Reddit, Wikipédia) with instant tab creation.
  - Step 4: Final ready screen with cinematic fade-out transition.
- Command Palette action: "Assistente de Boas-Vindas (Welcome Wizard)" to re-trigger onboarding wizard on demand.

## [0.16.0] - 2026-11-14

### Added
- Media Controls Widget na Sidebar (Mini Player Global de Áudio & Vídeo) (`src/media.ts`, `src/media-widget.ts`, `src-tauri/src/lib.rs`).
- Global media detection tracking playing audio/video across active and background tabs with title and artist extraction (`navigator.mediaSession`).
- Sidebar Mini Player card displaying track cover, title, artist, Play/Pause control, and Mute control.
- Click to jump: clicking track title in the media widget brings user directly to the emitting tab.
- Audio indicator pill on tabs (`volume2` / `volumeX`) with live waveform pulse and one-click mute/unmute without switching tabs.
- Native Tauri backend commands: `set_tab_muted`, `toggle_tab_media_playback`, and `sync_tab_media_state`.

## [0.15.0] - 2026-11-14

### Added
- Boosts & Element Zapper (Estilização & Limpeza por Domínio) (`src/boosts.ts`, `src/boosts-popover.ts`, `src-tauri/src/lib.rs`).
- Interactive Element Zapper (`Ctrl+Shift+Z`): crosshair target mode in active webviews that highlights elements, shows CSS selectors in real time, and dissolves clicked elements with animation.
- Persistence of domain Zap rules in `localStorage` (`moss:domain_zap_rules`) with automatic re-application on page load (`display: none !important;`).
- Boosts popover anchored on Omnibar (`sparkles` icon) with:
  - Smart Dark Mode: intelligent color inversion preserving images, media, and canvas.
  - Real-time brightness & contrast adjustment sliders (-50% to +50%).
  - Relaxing Sepia tone filter.
  - Per-domain Custom CSS injection editor.
  - Zapped element counter with one-click restore and full domain reset.
- Native Tauri backend commands: `apply_tab_boost` and `start_element_zapper`.

## [0.14.0] - 2026-11-14

### Added
- Space Routing (Roteamento Automático de Espaços por domínio) (`src/space-routing.ts`, `src/settings-panel.ts`, `src/toast.ts`).
- Intelligent navigation interception across Omnibar, links, and external URLs mapping domains directly to designated Workspaces.
- Default preset mappings: Dev (`github.com`, `gitlab.com`, `stackoverflow.com`), Work (`slack.com`, `linear.app`, `notion.so`), Personal (`youtube.com`, `reddit.com`).
- Two routing modes: "Automático" (migrates tab and switches workspace seamlessly) and "Perguntar" (presents non-intrusive action toast with confirmation).
- Glassmorphic top pill toast notification (`.moss-toast`) with spring animations, action triggers, and auto-dismissal.
- Dedicated "Espaços & Roteamento" section in Settings Panel with toggle switch, routing mode selector, active rules list with deletion, and custom domain rule creator.
- Command Palette actions: "Roteamento: Vincular este site ao Espaço Atual" and "Roteamento: Gerenciar Regras de Espaços".

## [0.13.0] - 2026-11-14

### Added
- Tab Folders (Pastas de Abas) & Hierarchical Tab Grouping (`src/folders.ts`, `src/tabs.ts`, `src/styles/browser-chrome.css`).
- Collapsible folder sections in vertical sidebar with custom colors, tab counter badge, chevron toggle, and quick add button.
- Drag & Drop support to group tabs into folders or move them back to root list.
- Tab Hibernation / Sleeping Tabs (Memory Saver): unload background webview native HWNDs (`webview.close`) while preserving tab snapshot, URL, and metadata.
- Automatic lazy re-activation and navigation upon selecting sleeping tabs.
- Sleeping tab indicator with moon icon and dim styling.
- Context menu actions on tabs: "Mover para pasta", "Remover da pasta", "Criar pasta com esta aba", "Hibernar aba (Economizar memória)".
- Folder header context actions: rename folder and hibernate all tabs in folder.
- Command Palette actions: "Nova Pasta de Abas", "Hibernar Abas Inativas", "Acordar Todas as Abas".

## [0.12.0] - 2026-11-14

### Added
- Glance / Link Peeking (`Shift+Click` or `Ctrl+Shift+G`) (`src/glance.ts`, `src/styles/browser-chrome.css`).
- Centered squircle floating modal card overlaying the browser without creating permanent tabs or polluting tab hierarchy.
- Isolated Glance webview (`__glance__`) rendered at 88vw/84vh with synchronized responsive geometry (`ResizeObserver`).
- Glance header controls: eye badge, page title and URL display, "Abrir na aba" action (`Ctrl+O`) to promote preview to active tab, "Copiar link" action, and "Fechar" (`Esc`).
- Tab context menu action: "Espiar no Glance".
- Command Palette action: "Espiar URL (Glance)".
- Bookmarks Bar integration: `Shift+Click` or `Alt+Click` on any bookmark directly opens Glance.
- Documentation in keyboard shortcuts modal (`src/shortcuts-modal.ts`).

## [0.11.0] - 2026-11-14

### Added
- Dedicated Downloads Panel (`Ctrl+J`) (`src/downloads-panel.ts`, `src/downloads.ts`, `src/styles/browser-chrome.css`).
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
- Collapsible Sidebar & Compact Mode (`Ctrl+B`) (`src/sidebar.ts`, `src/styles/browser-chrome.css`).
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
- Unified Command Palette & Quick Launcher (`Ctrl+K` / `Ctrl+P`) (`src/command-palette.ts`, `src/styles/browser-chrome.css`).
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
- Floating reader toolbar pill with real-time typography controls: custom fonts (Sans, Serif, Mono), font size stepper (14-24px), column widths (compact, normal, wide), and custom themes (*moss Dark*, *Light Cream*, *Parchment Sepia*).
- Reader mode link interception opening remote links in new browser tabs while preserving in-article anchor jumps (`#hash`).
- Localizar na Página / Find in Page (`Ctrl+F`): in-page text search with non-destructive `CSS.highlights` (`::highlight(__moss-find-match)`, `::highlight(__moss-find-active)`), case sensitivity toggle (`Aa`), and match navigation buttons (`src/find-in-page.ts`).
- Workspaces switcher and management (`src/workspaces.ts`, `src/workspace-switcher.ts`): scoped workspace views, tab isolation, and two-step workspace deletion.

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
- Refined pastel green palette: *Misty Sage* (`#b8eb9a`), *Soft Matcha* (`#6eb54f`), *moss Pastel* (`#a7e286`), and warm cream light mode (`src/styles/tokens.css`).
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
- Bootstrap moss browser project using Tauri 2.x, TypeScript, Vite, and pnpm.
- GitHub Actions continuous integration workflow (`.github/workflows/ci.yml`).
- MIT License and project documentation skeleton.
