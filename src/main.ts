import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { addBookmark, isBookmarked, removeBookmark, subscribeBookmarks, type Bookmark } from "./bookmarks";
import { createTabContextMenu } from "./context-menu";
import { el, hostnameOf } from "./dom";
import { initDownloads } from "./downloads";
import { createDownloadsPanel } from "./downloads-panel";
import { createGlance } from "./glance";
import { createBoostsPopover } from "./boosts-popover";
import { createTranslatePopover } from "./translate-popover";
import { applyBoostToTab, addDomainZapRule } from "./boosts";
import { createMediaWidget } from "./media-widget";
import { updateTabMediaState, clearTabMediaState, getMediaStateForTab, toggleMute } from "./media";
import { createWelcomeWizard, isOnboardingCompleted } from "./welcome-wizard";
import { NavHistory, clearHistory, updateVisitTitle, addHistoryEntry, type NavIntent } from "./history";
import { createHistoryPanel } from "./history-panel";
import { icon, type IconName } from "./icons";
import { resolveOmnibarInput } from "./omnibar";
import { PANEL_TOGGLE_ATTR, type Panel } from "./panel";
import { getSettings, searchUrl } from "./settings";
import { createSettingsPanel } from "./settings-panel";
import { createShortcutsModal } from "./shortcuts-modal";
import { createPrivacyShield, isYouTubeUrl, injectYouTubeShield } from "./privacy-shield";
import {
  closeSplit,
  computeSplitViewports,
  createSplitDivider,
  getActiveSplitTabId,
  getSecondaryTabId,
  getSplitState,
  handleTabClosedInSplit,
  isSplitActive,
  openSplit,
  setFocusedPane,
  setSplitRatio,
  subscribeSplit,
  swapPanes,
  SPLIT_GAP,
} from "./split-view";
import { isWebUrl } from "./storage";
import {
  NEW_TAB_TITLE,
  closeTab,
  createTab,
  getActiveTab,
  getTab,
  getTabs,
  loadPinnedUrls,
  loadSession,
  moveTabToWorkspace,
  reopenLastClosedTab,
  getClosedTabsCount,
  selectTab,
  subscribe,
  togglePinTab,
  updateTab,
  setTabFolder,
  sleepTab,
  wakeTab,
  sleepTabsInFolder,
  type Tab,
} from "./tabs";
import {
  createFolder,
  getFoldersForWorkspace,
  updateFolder,
  toggleFolderCollapse,
  subscribeFolders,
  type TabFolder,
} from "./folders";
import {
  createWorkspace,
  cycleWorkspace,
  deleteWorkspace,
  getActiveWorkspaceId,
  getWorkspaces,
  getWorkspace,
  setActiveWorkspace,
  subscribeWorkspaces,
} from "./workspaces";
import { createWorkspaceSwitcher } from "./workspace-switcher";
import { isSidebarCollapsed, toggleSidebar, subscribeSidebar } from "./sidebar";
import { createFindInPage } from "./find-in-page";
import { createReaderView } from "./reader-view";
import { createSiteInfoPopover } from "./site-info-popover";
import { createCommandPalette } from "./command-palette";
import { syncAllPermissionsToBackend } from "./site-permissions";
import { webview, windowControls } from "./webview";
import {
  applyZoomForTab,
  clearTabZoom,
  formatZoomPercent,
  getZoomForTab,
  resetZoom,
  subscribeZoom,
  syncZoomFromWebview,
  zoomIn,
  zoomOut,
} from "./zoom";
import { findRuleForDomain, isSpaceRoutingEnabled, getSpaceRoutingMode, addRoutingRule } from "./space-routing";
import { showToast } from "./toast";

type NavAction = NavIntent;

interface TabLoadEvent {
  tabId: string;
  url: string;
  state: "started" | "finished";
}

interface TabZoomEvent {
  tabId: string;
  factor: number;
}

interface TabSelectedEvent {
  tabId: string;
}

const NAV_BUTTONS: { action: NavAction; label: string; icon: IconName }[] = [
  { action: "back", label: "Voltar", icon: "back" },
  { action: "forward", label: "Avançar", icon: "forward" },
  { action: "reload", label: "Recarregar", icon: "reload" },
];

const SHORTCUTS = [
  ["Ctrl+T", "nova aba"],
  ["Ctrl+W", "fechar aba"],
  ["Ctrl+K", "paleta de comandos"],
  ["Ctrl+\\", "tela dividida"],
  ["Ctrl+Shift+S", "tela dividida"],
  ["Ctrl+Tab", "próxima aba"],
  ["Ctrl+L", "omnibar"],
  ["Ctrl+H", "histórico"],
  ["Ctrl+,", "configurações"],
  ["Ctrl+/", "atalhos"],
];

const histories = new Map<string, NavHistory>();
// Title reported since the tab's last load started, so history never gets the previous page's title.
const pageTitles = new Map<string, string>();

function historyOf(tabId: string): NavHistory {
  let history = histories.get(tabId);
  if (!history) {
    history = new NavHistory();
    histories.set(tabId, history);
  }
  return history;
}

function buildChrome(root: HTMLElement) {
  const closeWindowBtn = el("button", {
    class: "window-btn window-btn--close",
    type: "button",
    "aria-label": "Fechar janela",
    title: "Fechar janela",
  });
  const minimizeWindowBtn = el("button", {
    class: "window-btn window-btn--minimize",
    type: "button",
    "aria-label": "Minimizar janela",
    title: "Minimizar janela",
  });
  const maximizeWindowBtn = el("button", {
    class: "window-btn window-btn--maximize",
    type: "button",
    "aria-label": "Maximizar janela",
    title: "Maximizar janela",
  });

  closeWindowBtn.addEventListener("click", () => windowControls.close());
  minimizeWindowBtn.addEventListener("click", () => windowControls.minimize());
  maximizeWindowBtn.addEventListener("click", () => windowControls.toggleMaximize());

  const windowControlsEl = el("div", { class: "window-controls" }, [
    closeWindowBtn,
    minimizeWindowBtn,
    maximizeWindowBtn,
  ]);

  const sidebarToggleBtn = el(
    "button",
    {
      class: "sidebar-toggle-btn nav-btn",
      type: "button",
      "aria-label": "Recolher barra lateral (Ctrl+B)",
      title: "Recolher barra lateral (Ctrl+B)",
    },
    [icon("sidebar")],
  );

  const sidebarHeaderTop = el(
    "div",
    { class: "sidebar-header-top", "data-tauri-drag-region": "" },
    [windowControlsEl, sidebarToggleBtn],
  );

  const navButtons = {} as Record<NavAction, HTMLButtonElement>;
  for (const { action, label, icon: iconName } of NAV_BUTTONS) {
    navButtons[action] = el(
      "button",
      { class: "nav-btn", type: "button", "aria-label": label, title: label, disabled: "" },
      [icon(iconName)],
    );
  }
  const navRow = el("div", { class: "nav-row" }, Object.values(navButtons));

  const sidebarHeader = el("div", { class: "sidebar-header", "data-tauri-drag-region": "" }, [
    sidebarHeaderTop,
    navRow,
  ]);

  const omnibarInput = el("input", {
    class: "omnibar-input",
    type: "text",
    placeholder: "Pesquise ou digite um endereço",
    autocomplete: "off",
    spellcheck: "false",
    "aria-label": "Barra de endereço",
  });
  const bookmarkToggle = el(
    "button",
    { class: "omnibar-star-btn", type: "button", "aria-pressed": "false" },
    [icon("star")],
  );
  const readerButton = el(
    "button",
    {
      class: "omnibar-reader-btn",
      type: "button",
      "aria-label": "Modo leitura (Ctrl+Alt+R)",
      "aria-pressed": "false",
      title: "Modo leitura (Ctrl+Alt+R)",
    },
    [icon("book")],
  );
  const omnibarSplitBtn = el(
    "button",
    {
      class: "omnibar-split-btn",
      type: "button",
      "aria-label": "Alternar tela dividida (Ctrl+\\)",
      "aria-pressed": "false",
      title: "Alternar tela dividida (Ctrl+\\)",
    },
    [icon("split")],
  );
  const zoomBadge = el(
    "button",
    {
      class: "omnibar-zoom-badge",
      type: "button",
      "aria-label": "Zoom: 100%. Clique para redefinir para 100% (Ctrl+0)",
      title: "Zoom: 100%. Clique para redefinir para 100% (Ctrl+0)",
      style: "display: none;",
    },
    ["100%"],
  );
  const securityButton = el(
    "button",
    {
      class: "omnibar-security-btn",
      type: "button",
      "aria-label": "Informações e permissões do site",
      title: "Ver informações e permissões do site",
    },
    [icon("globe")],
  );
  const boostsButton = el(
    "button",
    {
      class: "omnibar-boosts-btn",
      type: "button",
      "aria-label": "Boosts & Element Zapper (Ctrl+Shift+Z)",
      title: "Boosts & Element Zapper (Ctrl+Shift+Z)",
    },
    [icon("sparkles")],
  );
  const omnibarTranslateBtn = el(
    "button",
    {
      class: "omnibar-translate-btn",
      type: "button",
      "aria-label": "Traduzir página (Ctrl+Shift+U)",
      title: "Traduzir página (Ctrl+Shift+U)",
    },
    [icon("translate")],
  );
  const omnibar = el("form", { class: "sidebar-omnibar omnibar", role: "search", "data-tauri-drag-region": "" }, [
    securityButton,
    el("div", { class: "omnibar-input-wrapper" }, [omnibarInput]),
    el("div", { class: "omnibar-actions" }, [zoomBadge, readerButton, omnibarTranslateBtn, omnibarSplitBtn, bookmarkToggle, boostsButton]),
  ]);

  const pinnedTabsLabel = el("div", { class: "pinned-tabs-label" }, ["Fixadas"]);
  const pinnedTabsGrid = el("div", {
    class: "pinned-tabs-grid",
    role: "tablist",
    "aria-label": "Abas fixadas",
  });
  const pinnedTabsSection = el("div", { class: "pinned-tabs-section", style: "display: none;" }, [
    pinnedTabsLabel,
    pinnedTabsGrid,
  ]);

  const newTabButton = el(
    "button",
    { class: "new-tab-btn tab-new-btn", type: "button", "aria-label": "Nova aba", title: "Nova aba (Ctrl+T)" },
    [icon("plus"), el("span", {}, ["Nova Aba"])],
  );
  const newFolderButton = el(
    "button",
    { class: "new-folder-btn", type: "button", "aria-label": "Nova pasta de abas", title: "Nova pasta de abas" },
    [icon("folderPlus")],
  );
  const newTabSection = el("div", { class: "new-tab-section" }, [newTabButton, newFolderButton]);
  const tabList = el("div", { class: "tabs-list tab-list", role: "tablist" });
  const tabBar = el("div", { class: "tabs-section tab-bar" }, [tabList, newTabSection]);

  const bookmarksList = el("ul", { class: "bookmarks-list" });
  const bookmarksBar = el(
    "nav",
    { class: "bookmarks-bar bookmarks-section", "aria-label": "Favoritos", style: "display: none;" },
    [
      el("div", { class: "bookmarks-header" }, [
        el("span", { class: "bookmarks-title" }, ["Favoritos"]),
      ]),
      bookmarksList,
    ],
  );

  const toggleAttrs = { type: "button", [PANEL_TOGGLE_ATTR]: "" };
  const splitButton = el(
    "button",
    {
      class: "footer-btn footer-btn--split nav-btn",
      type: "button",
      "aria-label": "Alternar tela dividida (Ctrl+\\)",
      "aria-pressed": "false",
      title: "Alternar tela dividida (Ctrl+\\)",
    },
    [icon("split")],
  );
  const privacyButton = el(
    "button",
    {
      class: "footer-btn footer-btn--privacy nav-btn",
      type: "button",
      "aria-label": "Escudo de Privacidade",
      title: "Escudo de Privacidade",
    },
    [icon("shield")],
  );
  const historyButton = el(
    "button",
    {
      ...toggleAttrs,
      class: "footer-btn nav-btn",
      "aria-label": "Histórico",
      title: "Histórico (Ctrl+H)",
    },
    [icon("history")],
  );
  const settingsButton = el(
    "button",
    {
      ...toggleAttrs,
      class: "footer-btn footer-btn--settings nav-btn",
      "aria-label": "Configurações",
      title: "Configurações (Ctrl+,)",
    },
    [icon("settings")],
  );
  const downloadsButton = el(
    "button",
    {
      class: "footer-btn footer-btn--downloads nav-btn",
      type: "button",
      "aria-label": "Downloads",
      title: "Downloads",
    },
    [icon("download")],
  );
  const sidebarFooter = el("footer", { class: "sidebar-footer" }, [
    splitButton,
    privacyButton,
    historyButton,
    settingsButton,
    downloadsButton,
  ]);

  const workspaceSection = el("div", { class: "workspace-section" });

  const mediaWidget = createMediaWidget({
    onSelectTab(tabId) {
      selectTab(tabId);
    },
  });

  const sidebar = el("aside", { class: "sidebar" }, [
    sidebarHeader,
    omnibar,
    pinnedTabsSection,
    workspaceSection,
    tabBar,
    bookmarksBar,
    mediaWidget,
    sidebarFooter,
  ]);

  const floatingBackBtn = el(
    "button",
    { class: "nav-btn floating-nav-btn", type: "button", "aria-label": "Voltar", title: "Voltar (Alt+←)", disabled: "" },
    [icon("back")],
  );
  const floatingForwardBtn = el(
    "button",
    { class: "nav-btn floating-nav-btn", type: "button", "aria-label": "Avançar", title: "Avançar (Alt+→)", disabled: "" },
    [icon("forward")],
  );
  const floatingReloadBtn = el(
    "button",
    { class: "nav-btn floating-nav-btn", type: "button", "aria-label": "Recarregar", title: "Recarregar (F5)", disabled: "" },
    [icon("reload")],
  );

  const floatingSecurityIcon = el("span", { class: "floating-security-icon" }, [icon("globe")]);
  const floatingUrlText = el("span", { class: "floating-url-text" }, ["Pesquise ou digite um endereço"]);
  const floatingShortcut = el("kbd", { class: "floating-shortcut" }, ["Ctrl+K"]);
  const floatingOmnibarPill = el(
    "div",
    {
      class: "floating-omnibar-pill",
      role: "button",
      tabindex: "0",
      "aria-label": "Pesquisar ou digitar endereço",
      title: "Pesquisar ou digitar endereço (Ctrl+K)",
    },
    [floatingSecurityIcon, floatingUrlText, floatingShortcut],
  );

  const floatingReaderBtn = el(
    "button",
    { class: "nav-btn floating-action-btn", type: "button", "aria-label": "Modo leitura (Ctrl+Alt+R)", title: "Modo leitura (Ctrl+Alt+R)" },
    [icon("book")],
  );
  const floatingSplitBtn = el(
    "button",
    { class: "nav-btn floating-action-btn", type: "button", "aria-label": "Alternar tela dividida (Ctrl+\\)", title: "Alternar tela dividida (Ctrl+\\)" },
    [icon("split")],
  );
  const floatingStarBtn = el(
    "button",
    { class: "nav-btn floating-action-btn", type: "button", "aria-label": "Favoritos", title: "Favoritar esta página" },
    [icon("star")],
  );
  const floatingExpandBtn = el(
    "button",
    {
      class: "nav-btn floating-action-btn floating-expand-btn",
      type: "button",
      "aria-label": "Expandir barra lateral (Ctrl+B)",
      title: "Expandir barra lateral (Ctrl+B)",
    },
    [icon("sidebarCollapsed")],
  );

  const floatingTranslateBtn = el(
    "button",
    {
      class: "nav-btn floating-action-btn floating-translate-btn",
      type: "button",
      "aria-label": "Traduzir página (Ctrl+Shift+U)",
      title: "Traduzir página (Ctrl+Shift+U)",
    },
    [icon("translate")],
  );

  const floatingTopBar = el("header", { class: "floating-top-bar", "aria-label": "Navegação rápida compacta", "data-tauri-drag-region": "" }, [
    el("div", { class: "floating-nav-group" }, [floatingBackBtn, floatingForwardBtn, floatingReloadBtn]),
    floatingOmnibarPill,
    el("div", { class: "floating-actions-group" }, [
      floatingReaderBtn,
      floatingTranslateBtn,
      floatingSplitBtn,
      floatingStarBtn,
      floatingExpandBtn,
    ]),
  ]);

  const emptyState = el("div", { class: "viewport-empty empty-state" }, [
    el("h1", { class: "viewport-empty-title empty-state-title" }, ["moss"]),
    el("p", { class: "viewport-empty-hint empty-state-hint" }, ["Digite um endereço na omnibar para começar."]),
    el(
      "div",
      { class: "empty-state-shortcuts" },
      SHORTCUTS.map(([keys, label]) =>
        el("span", { class: "empty-state-shortcut" }, [el("kbd", {}, [keys]), label]),
      ),
    ),
  ]);
  const loadingBar = el("div", { class: "viewport-loading webview-loading" });
  const webviewContainer = el("div", { class: "webview-container" }, [emptyState, loadingBar]);
  const viewportCard = el("div", { class: "viewport-card" }, [floatingTopBar, webviewContainer]);
  const mainView = el("main", { class: "main-view viewport-area" }, [viewportCard]);

  root.append(sidebar, mainView);

  return {
    tabList,
    newTabButton,
    newFolderButton,
    navButtons,
    sidebarToggleBtn,
    floatingTopBar,
    floatingNavButtons: {
      back: floatingBackBtn,
      forward: floatingForwardBtn,
      reload: floatingReloadBtn,
    },
    floatingOmnibarPill,
    floatingSecurityIcon,
    floatingUrlText,
    floatingReaderBtn,
    floatingTranslateBtn,
    floatingSplitBtn,
    floatingStarBtn,
    floatingExpandBtn,
    omnibar,
    omnibarInput,
    securityButton,
    bookmarkToggle,
    readerButton,
    boostsButton,
    omnibarTranslateBtn,
    omnibarSplitBtn,
    zoomBadge,
    splitButton,
    privacyButton,
    historyButton,
    settingsButton,
    downloadsButton,
    bookmarksBar,
    bookmarksList,
    emptyState,
    loadingBar,
    webviewContainer,
    viewportCard,
    pinnedTabsSection,
    pinnedTabsGrid,
    workspaceSection,
    mediaWidget,
  };
}

function renderBookmarksBar(bar: HTMLElement, list: HTMLElement, bookmarks: readonly Bookmark[]) {
  bar.style.display = bookmarks.length === 0 ? "none" : "";
  list.replaceChildren(
    ...bookmarks.map((bookmark) =>
      el("li", {}, [
        el(
          "button",
          {
            class: "bookmark-item",
            type: "button",
            "data-url": bookmark.url,
            title: `${bookmark.title}\n${bookmark.url}`,
          },
          [
            el("span", { class: "bookmark-favicon" }, [icon("globe")]),
            el("span", { class: "bookmark-title" }, [bookmark.title]),
          ],
        ),
      ]),
    ),
  );
}

window.addEventListener("DOMContentLoaded", () => {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) return;

  const ui = buildChrome(root);
  const tabElements = new Map<string, HTMLElement>();
  const pinnedTabElements = new Map<string, HTMLElement>();
  let shownTabId: string | null = null;
  let shownUrl = "";
  let visibleWebviewId: string | null | undefined;
  let lastTaskbarTabId: string | null = null;

  const zoomOutButton = el(
    "button",
    { class: "zoom-popover-btn", type: "button", "aria-label": "Diminuir zoom", title: "Diminuir zoom" },
    ["-"],
  );
  const zoomValueButton = el(
    "button",
    {
      class: "zoom-popover-btn zoom-popover-value",
      type: "button",
      "aria-label": "Redefinir zoom para 100%",
      title: "Redefinir para 100%",
    },
    ["100%"],
  );
  const zoomInButton = el(
    "button",
    { class: "zoom-popover-btn", type: "button", "aria-label": "Aumentar zoom", title: "Aumentar zoom" },
    ["+"],
  );
  const zoomResetButton = el(
    "button",
    {
      class: "zoom-popover-btn zoom-popover-reset",
      type: "button",
      "aria-label": "Redefinir zoom",
      title: "Redefinir zoom",
    },
    ["Reset"],
  );
  const zoomPopover = el(
    "div",
    {
      class: "zoom-popover",
      role: "group",
      "aria-label": "Controle de zoom",
      style: "display: none;",
    },
    [zoomOutButton, zoomValueButton, zoomInButton, zoomResetButton],
  );
  document.body.append(zoomPopover);

  function closeZoomPopover() {
    zoomPopover.style.display = "none";
  }

  function openZoomPopover() {
    const rect = ui.zoomBadge.getBoundingClientRect();
    zoomPopover.style.left = `${Math.round(rect.left)}px`;
    zoomPopover.style.top = `${Math.round(rect.bottom + 6)}px`;
    zoomPopover.style.display = "flex";
  }

  function renderZoomBadge(tabId?: string | null, url?: string | null) {
    if (!tabId) {
      ui.zoomBadge.style.display = "none";
      closeZoomPopover();
      return;
    }
    const pct = formatZoomPercent(getZoomForTab(tabId, url));
    ui.zoomBadge.textContent = pct;
    ui.zoomBadge.title = `Zoom: ${pct}. Clique para abrir o controle de zoom`;
    ui.zoomBadge.setAttribute("aria-label", ui.zoomBadge.title);
    ui.zoomBadge.style.display = "inline-flex";
  }

  ui.zoomBadge.addEventListener("click", (event) => {
    event.stopPropagation();
    if (zoomPopover.style.display === "none") openZoomPopover();
    else closeZoomPopover();
  });

  zoomOutButton.addEventListener("click", () => {
    const target = getTargetTab();
    if (target) zoomOut(target.id, target.url).catch(console.error);
  });
  zoomValueButton.addEventListener("click", () => {
    const target = getTargetTab();
    if (target) resetZoom(target.id, target.url).catch(console.error);
  });
  zoomInButton.addEventListener("click", () => {
    const target = getTargetTab();
    if (target) zoomIn(target.id, target.url).catch(console.error);
  });
  zoomResetButton.addEventListener("click", () => {
    const target = getTargetTab();
    if (target) resetZoom(target.id, target.url).catch(console.error);
  });

  document.addEventListener("pointerdown", (event) => {
    if (zoomPopover.style.display === "none") return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (zoomPopover.contains(target) || ui.zoomBadge.contains(target)) return;
    closeZoomPopover();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeZoomPopover();
  });

  subscribeZoom((tabId) => {
    const target = getTargetTab();
    if (target && target.id === tabId) {
      renderZoomBadge(tabId, target.url);
    }
  });

  function getTargetTab(): Tab | undefined {
    if (isSplitActive()) {
      const splitTabId = getActiveSplitTabId();
      if (splitTabId) {
        const tab = getTab(splitTabId);
        if (tab) return tab;
      }
    }
    return getActiveTab();
  }

  const historyPanel = createHistoryPanel((url, inNewTab) => {
    const tab = getTargetTab();
    if (tab && !inNewTab) navigate(tab.id, url);
    else openUrl(url);
  }, syncWebviewVisibility);
  const settings = createSettingsPanel(syncWebviewVisibility);
  const settingsPanel = settings.panel;
  const shortcuts = createShortcutsModal(syncWebviewVisibility);
  const shortcutsPanel = shortcuts.panel;
  const downloadsPanel = createDownloadsPanel(syncWebviewVisibility);
  const panels: Panel[] = [historyPanel, settingsPanel, shortcutsPanel, downloadsPanel];

  let translatePopover: ReturnType<typeof createTranslatePopover>;

  function openPrivateTab(url?: string) {
    const targetUrl = url ?? getSettings().homepage;
    const tab = createTab(targetUrl, false, getActiveWorkspaceId(), undefined, true);
    selectTab(tab.id);
    if (targetUrl) navigate(tab.id, targetUrl);
    else focusOmnibar();
  }

  function toggleTranslatePopover(tabId?: string) {
    const target = tabId ? getTab(tabId) : getTargetTab();
    if (!target?.url) return;
    const wasOpen = translatePopover ? translatePopover.isOpen() : false;
    closePanels();
    if (!wasOpen && translatePopover) {
      translatePopover.open(target.id, target.url);
    }
  }

  const tabContextMenu = createTabContextMenu(
    {
      onReload(tabId) {
        const tab = getTab(tabId);
        if (!tab?.url) return;
        historyOf(tab.id).expect("reload");
        updateTab(tab.id, { isLoading: true });
        webview.reload(tab.id).catch(() => updateTab(tab.id, { isLoading: false }));
      },
      onDuplicate(tabId) {
        const tab = getTab(tabId);
        if (tab) openTab(tab.url || undefined);
      },
      onClose(tabId) {
        closeTabAndWebview(tabId);
      },
      onCloseOthers(tabId) {
        const otherTabs = getTabs().filter((t) => t.id !== tabId && !t.isPinned);
        for (const t of otherTabs) {
          closeTabAndWebview(t.id);
        }
        selectTab(tabId);
      },
      onTogglePin(tabId) {
        togglePinTab(tabId);
      },
      isPinned(tabId) {
        return getTab(tabId)?.isPinned ?? false;
      },
      onGlanceTab(tabId) {
        const tab = getTab(tabId);
        if (tab?.url) glance.open(tab.url, tab.title);
      },
      onReopenClosedTab() {
        reopenClosedTab();
      },
      canReopenClosedTab() {
        return getClosedTabsCount() > 0;
      },
      onToggleSplit(tabId) {
        handleToggleSplitForTab(tabId);
      },
      isSplitActive() {
        return isSplitActive();
      },
      isSplitTab(tabId) {
        return getSecondaryTabId() === tabId;
      },
      onMoveToWorkspace(tabId, workspaceId) {
        moveTabToWorkspace(tabId, workspaceId);
        const activeWs = getActiveWorkspaceId();
        const curActive = getActiveTab();
        if (curActive?.id === tabId) {
          const remainingWsTabs = getTabs().filter(
            (t) => !t.isPinned && (t.workspaceId ?? "default") === activeWs && t.id !== tabId,
          );
          if (remainingWsTabs.length > 0) {
            selectTab(remainingWsTabs[0].id);
          } else {
            openTab();
          }
        }
        syncViewport();
        syncWebviewVisibility();
      },
      getWorkspaces() {
        return getWorkspaces();
      },
      getCurrentWorkspaceId() {
        return getActiveWorkspaceId();
      },
      onSleepTab(tabId) {
        hibernateTab(tabId);
      },
      onWakeTab(tabId) {
        wakeTabAndRestore(tabId);
      },
      isSleeping(tabId) {
        return getTab(tabId)?.isSleeping ?? false;
      },
      onMoveToFolder(tabId, folderId) {
        setTabFolder(tabId, folderId);
      },
      getFolders() {
        return getFoldersForWorkspace(getActiveWorkspaceId());
      },
      getCurrentFolderId(tabId) {
        return getTab(tabId)?.folderId;
      },
      onCreateFolderWithTab(tabId) {
        handleCreateFolder(tabId);
      },
      onNewPrivateTab() {
        openPrivateTab();
      },
      onTranslateTab(tabId) {
        toggleTranslatePopover(tabId);
      },
    },
    syncWebviewVisibility,
  );

  const workspaceSwitcher = createWorkspaceSwitcher({
    onSwitch(workspaceId) {
      handleSwitchWorkspace(workspaceId);
    },
    onDeleteWorkspace(workspaceId) {
      handleDeleteWorkspace(workspaceId);
    },
    onVisibilityChange: syncWebviewVisibility,
  });
  ui.workspaceSection.append(workspaceSwitcher.element);

  function handlePrivacyShieldChange() {
    syncWebviewVisibility();
    if (!privacyShield.isEnabled()) return;
    for (const tab of getTabs()) {
      if (isYouTubeUrl(tab.url)) injectYouTubeShield(tab.id);
    }
  }

  const privacyShield = createPrivacyShield(ui.privacyButton, handlePrivacyShieldChange);

  const findInPage = createFindInPage({
    getTargetTabId: () => getTargetTab()?.id ?? null,
    onHeightChange(height) {
      ui.viewportCard.classList.toggle("viewport-card--find-active", height > 0);
      syncViewport();
    },
    onClose() {
      ui.viewportCard.classList.remove("viewport-card--find-active");
      syncViewport();
    },
  });
  ui.viewportCard.prepend(findInPage.element);

  const readerView = createReaderView({
    onOpen() {
      ui.readerButton.classList.add("omnibar-reader-btn--active");
      ui.readerButton.setAttribute("aria-pressed", "true");
      syncWebviewVisibility();
    },
    onClose() {
      ui.readerButton.classList.remove("omnibar-reader-btn--active");
      ui.readerButton.setAttribute("aria-pressed", "false");
      syncWebviewVisibility();
    },
    onNavigate(url) {
      openTab(url);
    },
  });
  ui.viewportCard.append(readerView.element);

  const siteInfoPopover = createSiteInfoPopover(syncWebviewVisibility);

  const glance = createGlance({
    onPromote(url) {
      openTab(url);
    },
    onClose() {
      visibleWebviewId = null;
      syncWebviewVisibility();
    },
  });

  const rawGlanceOpen = glance.open.bind(glance);
  glance.open = (url: string, title?: string) => {
    visibleWebviewId = null;
    rawGlanceOpen(url, title);
    syncWebviewVisibility();
  };

  const boostsPopover = createBoostsPopover(syncWebviewVisibility);
  translatePopover = createTranslatePopover(syncWebviewVisibility);

  const welcomeWizard = createWelcomeWizard(() => {
    syncViewport();
    syncWebviewVisibility();
  });

  const commandPalette = createCommandPalette(
    {
      openTab(url) {
        openTab(url);
      },
      closeCurrentTab() {
        const target = getTargetTab();
        if (target) closeTabAndWebview(target.id);
      },
      selectTab(tabId, workspaceId) {
        if (workspaceId && workspaceId !== getActiveWorkspaceId()) {
          handleSwitchWorkspace(workspaceId);
        }
        handleTabClick(tabId);
      },
      toggleSplitView() {
        toggleSplitView();
      },
      swapPanes() {
        swapPanes();
      },
      closeSplit() {
        closeSplit();
      },
      toggleReaderMode() {
        toggleReaderMode();
      },
      openFindInPage() {
        closePanels();
        findInPage.open();
      },
      openHistory() {
        closePanels();
        historyPanel.open();
      },
      openDownloads() {
        closePanels();
        downloadsPanel.open();
      },
      clearHistory() {
        clearHistory();
      },
      openSettings() {
        closePanels();
        settingsPanel.open();
      },
      openShortcuts() {
        closePanels();
        shortcutsPanel.open();
      },
      openSiteInfo() {
        closePanels();
        const target = getTargetTab();
        if (target) {
          const trackers = privacyShield.getTabBlockedCount(target.id);
          siteInfoPopover.open({
            tabId: target.id,
            url: target.url,
            trackersBlocked: trackers,
          });
        }
      },
      toggleBookmark() {
        const tab = getTargetTab();
        if (!tab || !isWebUrl(tab.url)) return;
        if (isBookmarked(tab.url)) removeBookmark(tab.url);
        else addBookmark(tab.url, tab.title === NEW_TAB_TITLE ? hostnameOf(tab.url) : tab.title);
      },
      zoomIn() {
        const target = getTargetTab();
        if (target) zoomIn(target.id, target.url).catch(console.error);
      },
      zoomOut() {
        const target = getTargetTab();
        if (target) zoomOut(target.id, target.url).catch(console.error);
      },
      resetZoom() {
        const target = getTargetTab();
        if (target) resetZoom(target.id, target.url).catch(console.error);
      },
      reload() {
        runNavAction("reload");
      },
      navBack() {
        runNavAction("back");
      },
      navForward() {
        runNavAction("forward");
      },
      newWorkspace() {
        const ws = createWorkspace("Novo Espaço");
        handleSwitchWorkspace(ws.id);
      },
      switchWorkspace(workspaceId) {
        handleSwitchWorkspace(workspaceId);
      },
      cycleWorkspace(delta) {
        const next = cycleWorkspace(delta);
        handleSwitchWorkspace(next.id);
      },
      navigateActiveTab(url) {
        const target = getTargetTab();
        if (target) {
          navigate(target.id, url);
        } else {
          openTab(url);
        }
      },
      getTargetTab() {
        return getTargetTab();
      },
      isSplitActive() {
        return isSplitActive();
      },
      toggleSidebar() {
        toggleSidebar();
      },
      isSidebarCollapsed() {
        return isSidebarCollapsed();
      },
      reopenClosedTab() {
        reopenClosedTab();
      },
      openGlance(url) {
        closePanels();
        const target = getTargetTab();
        const targetUrl = url || target?.url;
        if (targetUrl) {
          glance.open(targetUrl, target?.title);
        }
      },
      createTabFolder() {
        handleCreateFolder();
      },
      hibernateInactiveTabs() {
        hibernateInactiveTabs();
      },
      wakeAllTabs() {
        wakeAllTabs();
      },
      routeCurrentDomainToCurrentSpace() {
        const target = getTargetTab();
        if (!target?.url) return;
        try {
          const host = new URL(target.url).hostname;
          const currentWsId = getActiveWorkspaceId();
          const ws = getWorkspace(currentWsId);
          if (host && ws) {
            addRoutingRule(host, currentWsId);
            showToast(`Regra criada: ${host} sempre abrirá em ${ws.name}`);
          }
        } catch {
          /* invalid url */
        }
      },
      openSpaceRoutingSettings() {
        closePanels();
        togglePanel(settingsPanel);
      },
      openWelcomeWizard() {
        closePanels();
        welcomeWizard.open();
        syncWebviewVisibility();
      },
      openPrivateTab() {
        openPrivateTab();
      },
      translatePage() {
        toggleTranslatePopover();
      },
    },
    syncWebviewVisibility,
  );

  function toggleReaderMode() {
    const target = getTargetTab();
    if (!target) return;
    if (readerView.isOpen() && readerView.getActiveTabId() === target.id) {
      readerView.close();
    } else {
      closePanels();
      readerView.open(target.id);
    }
  }

  ui.readerButton.addEventListener("click", () => toggleReaderMode());

  root.append(
    historyPanel.element,
    downloadsPanel.element,
    settings.overlay,
    settingsPanel.element,
    shortcuts.overlay,
    shortcutsPanel.element,
    tabContextMenu.element,
    privacyShield.popover,
    workspaceSwitcher.popover,
    siteInfoPopover.overlay,
    siteInfoPopover.element,
    commandPalette.overlay,
    commandPalette.element,
    glance.overlay,
    boostsPopover.element,
    translatePopover.element,
    welcomeWizard.element,
  );

  const downloadController = initDownloads(root);
  syncAllPermissionsToBackend();

  window.addEventListener("beforeunload", () => {
    downloadController.destroy();
    privacyShield.destroy();
    workspaceSwitcher.destroy();
    findInPage.destroy();
    readerView.destroy();
    siteInfoPopover.destroy();
    commandPalette.destroy();
    glance.destroy();
    boostsPopover.destroy();
    translatePopover.destroy();
    ui.mediaWidget.destroy();
  });

  ui.omnibarTranslateBtn.addEventListener("click", () => {
    toggleTranslatePopover();
  });

  ui.floatingTranslateBtn.addEventListener("click", () => {
    toggleTranslatePopover();
  });

  const appWindow = getCurrentWindow();
  document.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (
      target.closest(
        "button, input, textarea, select, a, [role='button'], .window-controls, .interactive, .omnibar-input, .omnibar-actions, .omnibar-security-btn, .tab-audio-indicator, .tab-close, .pinned-tab-close"
      )
    ) {
      return;
    }
    if (
      target.closest(
        "[data-tauri-drag-region], .sidebar-header, .sidebar-header-top, .floating-top-bar, .sidebar-omnibar"
      )
    ) {
      appWindow.startDragging().catch(() => {});
    }
  });

  ui.boostsButton.addEventListener("click", () => {
    const target = getTargetTab();
    if (!target?.url) return;
    const wasOpen = boostsPopover.isOpen();
    closePanels();
    if (!wasOpen) {
      boostsPopover.open(target.id, target.url);
    }
  });

  ui.securityButton.addEventListener("click", () => {
    const wasOpen = siteInfoPopover.isOpen();
    closePanels();
    if (!wasOpen) {
      const target = getTargetTab();
      if (target) {
        const trackers = privacyShield.getTabBlockedCount(target.id);
        siteInfoPopover.open({
          tabId: target.id,
          url: target.url,
          trackersBlocked: trackers,
        });
      }
    }
  });

  ui.privacyButton.addEventListener("click", () => {
    const wasOpen = privacyShield.isOpen();
    closePanels();
    if (!wasOpen) {
      const activeTab = getTargetTab();
      if (activeTab) {
        webview.syncTrackersBlocked(activeTab.id);
      }
      privacyShield.open(ui.privacyButton);
    }
  });

  ui.downloadsButton.addEventListener("click", () => {
    togglePanel(downloadsPanel);
  });

  // Native webviews would cover the panels, so the active one is hidden while a panel is open.
  function syncWebviewVisibility() {
    if (glance.isOpen()) {
      visibleWebviewId = null;
      return;
    }

    const isBlocked =
      panels.some((panel) => panel.isOpen()) ||
      tabContextMenu.isOpen() ||
      privacyShield.isOpen() ||
      workspaceSwitcher.isOpen() ||
      readerView.isOpen() ||
      siteInfoPopover.isOpen() ||
      commandPalette.isOpen() ||
      boostsPopover.isOpen() ||
      (translatePopover ? translatePopover.isOpen() : false) ||
      welcomeWizard.isOpen();

    if (isBlocked) {
      if (visibleWebviewId !== null) {
        visibleWebviewId = null;
        webview.showTabs([]);
      }
      return;
    }

    const splitState = getSplitState();
    if (splitState.active && splitState.primaryTabId && splitState.secondaryTabId) {
      const primary = splitState.primaryTabId;
      const secondary = splitState.secondaryTabId;
      const splitKey = `${primary}+${secondary}`;
      if (visibleWebviewId !== splitKey) {
        visibleWebviewId = splitKey;
        webview.showTabs([primary, secondary]);
      }
      return;
    }

    const target = getActiveTab()?.id ?? null;
    if (target === visibleWebviewId) return;
    visibleWebviewId = target;
    webview.show(target);
  }

  function handleSwitchWorkspace(workspaceId: string) {
    setActiveWorkspace(workspaceId);
    const tabs = getTabs();
    const wsTabs = tabs.filter((t) => !t.isPinned && (t.workspaceId ?? "default") === workspaceId);
    if (wsTabs.length > 0) {
      const activeInWs = wsTabs.find((t) => t.active);
      if (activeInWs) {
        selectTab(activeInWs.id);
      } else {
        selectTab(wsTabs[0].id);
      }
    } else {
      const newTab = createTab(getSettings().homepage, false, workspaceId);
      if (newTab.url) navigate(newTab.id, newTab.url);
    }
    syncViewport();
    syncWebviewVisibility();
  }

  function handleDeleteWorkspace(workspaceId: string) {
    const tabsToClose = getTabs().filter(
      (t) => !t.isPinned && (t.workspaceId ?? "default") === workspaceId,
    );
    for (const tab of tabsToClose) {
      closeTabAndWebview(tab.id);
    }
    deleteWorkspace(workspaceId);
    handleSwitchWorkspace(getActiveWorkspaceId());
  }

  function handleToggleSplitForTab(tabId: string) {
    const active = getActiveTab();
    if (!active) return;
    if (isSplitActive()) {
      if (getSecondaryTabId() === tabId || active.id === tabId) {
        closeSplit();
      } else {
        openSplit(active.id, tabId);
      }
    } else {
      if (active.id === tabId) {
        const other = getTabs().find((t) => t.id !== tabId);
        if (other) {
          openSplit(tabId, other.id);
        } else {
          const newTab = createTab(getSettings().homepage, false, getActiveWorkspaceId());
          if (newTab.url) navigate(newTab.id, newTab.url);
          openSplit(tabId, newTab.id);
        }
      } else {
        openSplit(active.id, tabId);
      }
    }
    syncViewport();
    syncWebviewVisibility();
  }

  function toggleSplitView() {
    const active = getActiveTab();
    if (!active) return;
    if (isSplitActive()) {
      closeSplit();
    } else {
      const tabs = getTabs();
      const other = tabs.find((t) => t.id !== active.id);
      if (other) {
        openSplit(active.id, other.id);
      } else {
        const newTab = createTab(getSettings().homepage);
        if (newTab.url) navigate(newTab.id, newTab.url);
        openSplit(active.id, newTab.id);
      }
    }
    syncViewport();
    syncWebviewVisibility();
  }

  function closePanels() {
    for (const panel of panels) panel.close();
    tabContextMenu.close();
    privacyShield.close();
    workspaceSwitcher.close();
    findInPage.close();
    readerView.close();
    siteInfoPopover.close();
    commandPalette.close();
    if (boostsPopover.isOpen()) boostsPopover.close();
    if (translatePopover && translatePopover.isOpen()) translatePopover.close();
    if (welcomeWizard.isOpen()) welcomeWizard.close();
    if (glance.isOpen()) glance.close();
  }

  function togglePanel(panel: Panel) {
    if (panel.isOpen()) return panel.close();
    closePanels();
    panel.open();
  }

  function focusOmnibar() {
    if (isSidebarCollapsed()) {
      commandPalette.open();
      return;
    }
    ui.omnibarInput.focus();
    ui.omnibarInput.select();
  }

  function checkSpaceRouting(tabId: string, url: string): boolean {
    if (!isSpaceRoutingEnabled() || !url) return false;
    const rule = findRuleForDomain(url);
    if (!rule) return false;

    const currentWsId = getTab(tabId)?.workspaceId ?? getActiveWorkspaceId();
    if (rule.targetWorkspaceId === currentWsId) return false;

    const targetWs = getWorkspace(rule.targetWorkspaceId);
    if (!targetWs) return false;

    if (getSpaceRoutingMode() === "auto") {
      moveTabToWorkspace(tabId, rule.targetWorkspaceId);
      handleSwitchWorkspace(rule.targetWorkspaceId);
      showToast(`Roteado para o espaço ${targetWs.name} (${rule.domain})`);
      return true;
    } else {
      showToast(`O site "${rule.domain}" pertence ao espaço ${targetWs.name}.`, {
        duration: 6000,
        action: {
          label: `Mover para ${targetWs.name}`,
          onClick: () => {
            moveTabToWorkspace(tabId, rule.targetWorkspaceId);
            handleSwitchWorkspace(rule.targetWorkspaceId);
          },
        },
      });
      return false;
    }
  }

  function navigate(tabId: string, url: string) {
    checkSpaceRouting(tabId, url);
    if (getActiveTab()?.id === tabId) {
      ui.omnibarInput.value = url;
      ui.omnibarInput.blur();
    }
    updateTab(tabId, { url, isLoading: true });
    webview.navigate(tabId, url).catch(() => updateTab(tabId, { isLoading: false }));
  }

  function openTab(url?: string, folderId?: string) {
    const target = url ?? getSettings().homepage;
    const tab = createTab(target, false, getActiveWorkspaceId(), folderId);
    if (target) navigate(tab.id, target);
    if (!url) focusOmnibar();
  }

  function hibernateTab(tabId: string) {
    const tab = getTab(tabId);
    if (!tab || tab.active || tab.isSleeping) return;
    if (sleepTab(tabId)) {
      webview.close(tabId);
      syncWebviewVisibility();
    }
  }

  function wakeTabAndRestore(tabId: string) {
    const tab = getTab(tabId);
    if (!tab) return;
    wakeTab(tabId);
    if (tab.url) {
      navigate(tabId, tab.url);
    }
  }

  function hibernateInactiveTabs() {
    const inactive = getTabs().filter((t) => !t.active && !t.isPinned && !t.isSleeping);
    for (const t of inactive) {
      hibernateTab(t.id);
    }
  }

  function wakeAllTabs() {
    const sleeping = getTabs().filter((t) => t.isSleeping);
    for (const t of sleeping) {
      wakeTabAndRestore(t.id);
    }
  }

  function handleCreateFolder(withTabId?: string) {
    const name = window.prompt("Nome da pasta:", "Nova pasta");
    if (name === null) return;
    const folder = createFolder(name.trim() || "Nova pasta", getActiveWorkspaceId());
    if (withTabId) {
      setTabFolder(withTabId, folder.id);
    }
  }

  // Reuses the active tab when it is still blank instead of piling up empty tabs.
  function openUrl(url: string) {
    const tab = getActiveTab();
    if (tab && !tab.url && !tab.isPinned) navigate(tab.id, url);
    else openTab(url);
  }

  function closeTabAndWebview(tabId: string) {
    handleTabClosedInSplit(tabId);
    closeTab(tabId);
    clearTabZoom(tabId);
    privacyShield.clearTabCount(tabId);
    clearTabMediaState(tabId);
    histories.delete(tabId);
    pageTitles.delete(tabId);
    webview.close(tabId);
    syncViewport();
    syncWebviewVisibility();
    const curWsId = getActiveWorkspaceId();
    const remainingWsTabs = getTabs().filter(
      (t) => !t.isPinned && (t.workspaceId ?? "default") === curWsId,
    );
    if (remainingWsTabs.length === 0) openTab();
  }

  function reopenClosedTab() {
    const reopened = reopenLastClosedTab();
    if (reopened) {
      if (reopened.url) navigate(reopened.id, reopened.url);
      syncViewport();
      syncWebviewVisibility();
    }
  }

  function cycleTabs(step: number) {
    const curWsId = getActiveWorkspaceId();
    const tabs = getTabs().filter((t) => t.isPinned || (t.workspaceId ?? "default") === curWsId);
    const index = tabs.findIndex((tab) => tab.active);
    if (index === -1 || tabs.length < 2) return;
    selectTab(tabs[(index + step + tabs.length) % tabs.length].id);
  }

  function runNavAction(action: NavAction) {
    const tab = getTargetTab();
    if (!tab?.url) return;
    historyOf(tab.id).expect(action);
    webview[action](tab.id);
  }

  function createTabElement(tabId: string): HTMLElement {
    const node = el(
      "div",
      { class: "tab", role: "tab", tabindex: "0", draggable: "true", "data-tab-id": tabId },
      [
        el("span", { class: "tab-favicon" }),
        el("span", { class: "tab-title" }),
        el(
          "button",
          { class: "tab-close", type: "button", "aria-label": "Fechar aba", title: "Fechar aba (Ctrl+W)" },
          [icon("close")],
        ),
      ],
    );
    node.addEventListener("dragstart", (e) => {
      e.dataTransfer?.setData("text/moss-tab-id", tabId);
      e.dataTransfer?.setData("text/plain", tabId);
    });
    tabElements.set(tabId, node);
    return node;
  }

  function renderTab(node: HTMLElement, tab: Tab) {
    node.classList.toggle("tab--active", tab.active);
    node.classList.toggle("tab--loading", tab.isLoading);
    node.classList.toggle("tab--sleeping", Boolean(tab.isSleeping));
    node.classList.toggle("tab--private", Boolean(tab.isPrivate));
    node.setAttribute("aria-selected", String(tab.active));
    const privateSuffix = tab.isPrivate ? " (Guia Anônima)" : "";
    const statusSuffix = tab.isSleeping ? " (Hibernada - clique para acordar)" : "";
    node.title = tab.url ? `${tab.title}\n${tab.url}${statusSuffix}${privateSuffix}` : `${tab.title}${statusSuffix}${privateSuffix}`;

    const titleEl = node.querySelector(".tab-title")!;
    titleEl.textContent = tab.title;

    let privateBadge = node.querySelector(".tab-private-badge");
    if (tab.isPrivate) {
      if (!privateBadge) {
        privateBadge = el("span", { class: "tab-private-badge", title: "Guia anônima (sem histórico)" }, [icon("shield")]);
        titleEl.before(privateBadge);
      }
    } else if (privateBadge) {
      privateBadge.remove();
    }

    let sleepIndicator = node.querySelector(".tab-sleeping-indicator");
    if (tab.isSleeping) {
      if (!sleepIndicator) {
        sleepIndicator = el("span", { class: "tab-sleeping-indicator", title: "Aba hibernada" }, [icon("moon")]);
        titleEl.before(sleepIndicator);
      }
    } else if (sleepIndicator) {
      sleepIndicator.remove();
    }

    const mediaState = getMediaStateForTab(tab.id);
    let audioIndicator = node.querySelector<HTMLElement>(".tab-audio-indicator");
    if (mediaState && (mediaState.playing || mediaState.hasMedia)) {
      if (!audioIndicator) {
        audioIndicator = el("button", {
          class: "tab-audio-indicator",
          type: "button",
          title: mediaState.muted ? "Ativar som da aba" : "Silenciar aba",
          "aria-label": mediaState.muted ? "Ativar som da aba" : "Silenciar aba",
        });
        audioIndicator.addEventListener("click", (e) => {
          e.stopPropagation();
          toggleMute(tab.id);
        });
        titleEl.after(audioIndicator);
      }
      const audioIconName = mediaState.muted ? "volumeX" : "volume2";
      audioIndicator.replaceChildren(icon(audioIconName));
      audioIndicator.title = mediaState.muted ? "Ativar som da aba" : "Silenciar aba";
    } else if (audioIndicator) {
      audioIndicator.remove();
    }

    const favicon = node.querySelector(".tab-favicon")!;
    const iconName = tab.isLoading ? "spinner" : "globe";
    if (favicon.getAttribute("data-icon") !== iconName) {
      favicon.setAttribute("data-icon", iconName);
      favicon.replaceChildren(icon(iconName));
    }
  }

  function createPinnedTabElement(tabId: string): HTMLElement {
    const node = el(
      "div",
      { class: "pinned-tab", role: "tab", tabindex: "0", "data-tab-id": tabId },
      [
        el("span", { class: "pinned-tab-favicon" }),
        el(
          "button",
          { class: "pinned-tab-close", type: "button", "aria-label": "Fechar aba fixada", title: "Fechar aba" },
          [icon("close")],
        ),
      ],
    );
    pinnedTabElements.set(tabId, node);
    return node;
  }

  function renderPinnedTab(node: HTMLElement, tab: Tab) {
    node.classList.toggle("pinned-tab--active", tab.active);
    node.setAttribute("aria-selected", String(tab.active));
    node.title = tab.url ? `${tab.title}\n${tab.url}` : tab.title;

    const favicon = node.querySelector(".pinned-tab-favicon")!;
    const iconName = tab.isLoading ? "spinner" : "globe";
    if (favicon.getAttribute("data-icon") !== iconName) {
      favicon.setAttribute("data-icon", iconName);
      favicon.replaceChildren(icon(iconName));
    }
  }

  const folderElements = new Map<string, HTMLElement>();

  function createFolderElement(folder: TabFolder): HTMLElement {
    const chevron = el("span", { class: "tab-folder-chevron" }, [icon("chevronDown")]);
    const dot = el("span", {
      class: "tab-folder-dot",
      style: `--folder-color: ${folder.color ?? "#99bc58"}`,
    });
    const title = el("span", { class: "tab-folder-title" }, [folder.name]);
    const badge = el("span", { class: "tab-folder-badge" }, ["0"]);
    const addBtn = el(
      "button",
      {
        class: "tab-folder-add-btn",
        type: "button",
        "aria-label": "Nova aba nesta pasta",
        title: "Nova aba nesta pasta",
      },
      [icon("plus")],
    );

    addBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openTab(undefined, folder.id);
    });

    const header = el(
      "div",
      { class: "tab-folder-header", role: "button", tabindex: "0" },
      [chevron, dot, title, badge, addBtn],
    );

    header.addEventListener("click", () => {
      toggleFolderCollapse(folder.id);
    });

    header.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const action = window.confirm(
        `Pasta: "${folder.name}"\n\nOK = Renomear pasta\nCancelar = Hibernar abas desta pasta`,
      );
      if (action) {
        const nextName = window.prompt("Novo nome da pasta:", folder.name);
        if (nextName !== null && nextName.trim()) {
          updateFolder(folder.id, { name: nextName.trim() });
        }
      } else {
        const sleeping = sleepTabsInFolder(folder.id);
        for (const id of sleeping) webview.close(id);
        syncWebviewVisibility();
      }
    });

    header.addEventListener("dragover", (e) => {
      e.preventDefault();
      container.classList.add("tab-folder--dragover");
    });
    header.addEventListener("dragleave", () => {
      container.classList.remove("tab-folder--dragover");
    });
    header.addEventListener("drop", (e) => {
      e.preventDefault();
      container.classList.remove("tab-folder--dragover");
      const draggedTabId = e.dataTransfer?.getData("text/moss-tab-id");
      if (draggedTabId) {
        setTabFolder(draggedTabId, folder.id);
      }
    });

    const tabsContainer = el("div", { class: "tab-folder-tabs" });
    const container = el("div", { class: "tab-folder", "data-folder-id": folder.id }, [
      header,
      tabsContainer,
    ]);
    folderElements.set(folder.id, container);
    return container;
  }

  function renderTabBar(tabs: readonly Tab[]) {
    const curWsId = getActiveWorkspaceId();
    const pinned = tabs.filter((t) => t.isPinned);
    const unpinned = tabs.filter((t) => !t.isPinned && (t.workspaceId ?? "default") === curWsId);
    const currentFolders = getFoldersForWorkspace(curWsId);

    ui.pinnedTabsSection.style.display = pinned.length > 0 ? "" : "none";

    // Clean up removed or unpinned tabs from pinnedTabElements
    for (const [id, node] of pinnedTabElements) {
      if (!pinned.some((t) => t.id === id)) {
        node.remove();
        pinnedTabElements.delete(id);
      }
    }

    // Render pinned tabs in grid
    pinned.forEach((tab, index) => {
      const node = pinnedTabElements.get(tab.id) ?? createPinnedTabElement(tab.id);
      renderPinnedTab(node, tab);
      if (ui.pinnedTabsGrid.children[index] !== node) {
        ui.pinnedTabsGrid.insertBefore(node, ui.pinnedTabsGrid.children[index]);
      }
    });

    // Clean up removed or pinned tabs from tabElements
    for (const [id, node] of tabElements) {
      if (!unpinned.some((t) => t.id === id)) {
        node.remove();
        tabElements.delete(id);
      }
    }

    // Clean up removed folders
    for (const [fId, node] of folderElements) {
      if (!currentFolders.some((f) => f.id === fId)) {
        node.remove();
        folderElements.delete(fId);
      }
    }

    // Render folder nodes and their tabs
    currentFolders.forEach((folder) => {
      const fNode = folderElements.get(folder.id) ?? createFolderElement(folder);
      fNode.classList.toggle("tab-folder--collapsed", folder.isCollapsed);
      const title = fNode.querySelector(".tab-folder-title");
      if (title) title.textContent = folder.name;
      const folderTabs = unpinned.filter((t) => t.folderId === folder.id);
      const badge = fNode.querySelector(".tab-folder-badge");
      if (badge) badge.textContent = String(folderTabs.length);

      const tabsContainer = fNode.querySelector(".tab-folder-tabs")!;
      folderTabs.forEach((tab, index) => {
        const node = tabElements.get(tab.id) ?? createTabElement(tab.id);
        renderTab(node, tab);
        if (tabsContainer.children[index] !== node) {
          tabsContainer.insertBefore(node, tabsContainer.children[index]);
        }
      });
      while (tabsContainer.children.length > folderTabs.length) {
        tabsContainer.lastElementChild?.remove();
      }
    });

    // Render root tabs (not in any folder)
    const rootTabs = unpinned.filter(
      (t) => !t.folderId || !currentFolders.some((f) => f.id === t.folderId),
    );

    let currentChildIndex = 0;
    currentFolders.forEach((folder) => {
      const fNode = folderElements.get(folder.id)!;
      if (ui.tabList.children[currentChildIndex] !== fNode) {
        ui.tabList.insertBefore(fNode, ui.tabList.children[currentChildIndex]);
      }
      currentChildIndex++;
    });

    rootTabs.forEach((tab) => {
      const node = tabElements.get(tab.id) ?? createTabElement(tab.id);
      renderTab(node, tab);
      if (ui.tabList.children[currentChildIndex] !== node) {
        ui.tabList.insertBefore(node, ui.tabList.children[currentChildIndex]);
      }
      currentChildIndex++;
    });

    while (ui.tabList.children.length > currentChildIndex) {
      ui.tabList.lastElementChild?.remove();
    }
  }

  function renderBookmarkToggle() {
    const url = getTargetTab()?.url ?? "";
    const bookmarkable = isWebUrl(url);
    const active = bookmarkable && isBookmarked(url);
    const label = active ? "Remover dos favoritos" : "Adicionar aos favoritos";
    ui.bookmarkToggle.style.display = bookmarkable ? "" : "none";
    ui.bookmarkToggle.classList.toggle("omnibar-star-btn--active", active);
    ui.bookmarkToggle.setAttribute("aria-pressed", String(active));
    ui.bookmarkToggle.setAttribute("aria-label", label);
    ui.bookmarkToggle.title = label;
  }

  function renderSecurityButton(url: string | undefined) {
    ui.securityButton.classList.remove("omnibar-security-btn--secure", "omnibar-security-btn--insecure");
    ui.floatingSecurityIcon.classList.remove("floating-security-icon--secure", "floating-security-icon--insecure");
    if (!url) {
      ui.securityButton.replaceChildren(icon("globe"));
      ui.securityButton.title = "Informações da página";
      ui.floatingSecurityIcon.replaceChildren(icon("globe"));
      return;
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:") {
        ui.securityButton.classList.add("omnibar-security-btn--secure");
        ui.securityButton.replaceChildren(icon("lock"));
        ui.securityButton.title = `Conexão Segura - ${parsed.hostname}`;
        ui.floatingSecurityIcon.classList.add("floating-security-icon--secure");
        ui.floatingSecurityIcon.replaceChildren(icon("lock"));
      } else if (parsed.protocol === "http:") {
        ui.securityButton.classList.add("omnibar-security-btn--insecure");
        ui.securityButton.replaceChildren(icon("unlock"));
        ui.securityButton.title = `Conexão Não Segura - ${parsed.hostname}`;
        ui.floatingSecurityIcon.classList.add("floating-security-icon--insecure");
        ui.floatingSecurityIcon.replaceChildren(icon("unlock"));
      } else {
        ui.securityButton.replaceChildren(icon("globe"));
        ui.securityButton.title = `Página local - ${url}`;
        ui.floatingSecurityIcon.replaceChildren(icon("globe"));
      }
    } catch {
      ui.securityButton.replaceChildren(icon("globe"));
      ui.securityButton.title = "Informações da página";
      ui.floatingSecurityIcon.replaceChildren(icon("globe"));
    }
  }

  function render(tabs: readonly Tab[]) {
    renderTabBar(tabs);

    const target = getTargetTab();
    ui.navButtons.back.disabled = !target?.canGoBack;
    ui.navButtons.forward.disabled = !target?.canGoForward;
    ui.navButtons.reload.disabled = !target?.url;
    ui.floatingNavButtons.back.disabled = !target?.canGoBack;
    ui.floatingNavButtons.forward.disabled = !target?.canGoForward;
    ui.floatingNavButtons.reload.disabled = !target?.url;
    ui.floatingUrlText.textContent = target?.url || "Pesquise ou digite um endereço";
    ui.floatingReaderBtn.classList.toggle("floating-action-btn--active", readerView.isOpen());
    ui.floatingSplitBtn.classList.toggle("floating-action-btn--active", isSplitActive());
    const isTargetBookmarked = target?.url ? isBookmarked(target.url) : false;
    ui.floatingStarBtn.classList.toggle("floating-action-btn--active", isTargetBookmarked);
    ui.emptyState.style.display = target?.url ? "none" : "";
    ui.loadingBar.style.display = target?.isLoading ? "" : "none";
    document.title = target?.url ? `${target.title} - moss` : "moss";
    renderBookmarkToggle();
    renderZoomBadge(target?.id, target?.url);
    renderSecurityButton(target?.url);
    syncWebviewVisibility();

    const targetId = target?.id ?? null;
    const targetUrl = target?.url ?? "";
    if (targetId !== shownTabId) {
      shownTabId = targetId;
      ui.omnibarInput.value = targetUrl;
      if (!targetUrl) focusOmnibar();
      if (targetId && isWebUrl(targetUrl)) {
        webview.syncTrackersBlocked(targetId);
      }
      if (siteInfoPopover.isOpen()) {
        siteInfoPopover.close();
      }
    } else if (targetUrl !== shownUrl && document.activeElement !== ui.omnibarInput) {
      ui.omnibarInput.value = targetUrl;
    }
    shownUrl = targetUrl;
  }

  function handleTabClick(tabId: string) {
    const target = getTab(tabId);
    if (target?.isSleeping) {
      wakeTabAndRestore(tabId);
    }
    if (isSplitActive()) {
      const splitState = getSplitState();
      if (tabId === splitState.primaryTabId) {
        setFocusedPane("primary");
        selectTab(tabId);
      } else if (tabId === splitState.secondaryTabId) {
        setFocusedPane("secondary");
        selectTab(tabId);
      } else {
        if (splitState.focusedPane === "primary") {
          openSplit(tabId, splitState.secondaryTabId!, "primary");
        } else {
          openSplit(splitState.primaryTabId!, tabId, "secondary");
        }
        selectTab(tabId);
      }
      syncViewport();
      syncWebviewVisibility();
    } else {
      selectTab(tabId);
    }
  }

  // Tab list (unpinned tabs) event handling
  ui.tabList.addEventListener("click", (event) => {
    const target = event.target as Element;
    const tabId = target.closest<HTMLElement>(".tab")?.dataset.tabId;
    if (!tabId) return;
    if (target.closest(".tab-close")) {
      closeTabAndWebview(tabId);
    } else {
      handleTabClick(tabId);
    }
  });

  ui.tabList.addEventListener("auxclick", (event) => {
    if (event.button !== 1) return;
    const tabId = (event.target as Element).closest<HTMLElement>(".tab")?.dataset.tabId;
    if (tabId) closeTabAndWebview(tabId);
  });

  ui.tabList.addEventListener("contextmenu", (event) => {
    const target = event.target as Element;
    const tabNode = target.closest<HTMLElement>(".tab");
    if (!tabNode) return;
    const tabId = tabNode.dataset.tabId;
    if (!tabId) return;
    event.preventDefault();
    closePanels();
    tabContextMenu.open(tabId, event.clientX, event.clientY);
  });

  ui.tabList.addEventListener("keydown", (event) => {
    const tabId = (event.target as Element).closest<HTMLElement>(".tab")?.dataset.tabId;
    if (tabId && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      handleTabClick(tabId);
    }
  });

  // Pinned tabs grid event handling
  ui.pinnedTabsGrid.addEventListener("click", (event) => {
    const target = event.target as Element;
    const tabId = target.closest<HTMLElement>(".pinned-tab")?.dataset.tabId;
    if (!tabId) return;
    if (target.closest(".pinned-tab-close")) {
      closeTabAndWebview(tabId);
    } else {
      handleTabClick(tabId);
    }
  });

  ui.pinnedTabsGrid.addEventListener("auxclick", (event) => {
    if (event.button !== 1) return;
    const tabId = (event.target as Element).closest<HTMLElement>(".pinned-tab")?.dataset.tabId;
    if (tabId) closeTabAndWebview(tabId);
  });

  ui.pinnedTabsGrid.addEventListener("contextmenu", (event) => {
    const target = event.target as Element;
    const tabNode = target.closest<HTMLElement>(".pinned-tab");
    if (!tabNode) return;
    const tabId = tabNode.dataset.tabId;
    if (!tabId) return;
    event.preventDefault();
    closePanels();
    tabContextMenu.open(tabId, event.clientX, event.clientY);
  });

  ui.pinnedTabsGrid.addEventListener("keydown", (event) => {
    const tabId = (event.target as Element).closest<HTMLElement>(".pinned-tab")?.dataset.tabId;
    if (tabId && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      handleTabClick(tabId);
    }
  });

  ui.tabList.addEventListener("dragover", (event) => {
    event.preventDefault();
  });

  ui.tabList.addEventListener("drop", (event) => {
    const target = event.target as HTMLElement;
    if (!target.closest(".tab-folder")) {
      const draggedTabId = event.dataTransfer?.getData("text/moss-tab-id");
      if (draggedTabId) {
        setTabFolder(draggedTabId, undefined);
      }
    }
  });

  ui.newTabButton.addEventListener("click", () => openTab());
  ui.newFolderButton.addEventListener("click", () => handleCreateFolder());

  for (const { action } of NAV_BUTTONS) {
    ui.navButtons[action].addEventListener("click", () => runNavAction(action));
  }

  ui.splitButton.addEventListener("click", () => toggleSplitView());
  ui.omnibarSplitBtn.addEventListener("click", () => toggleSplitView());
  ui.historyButton.addEventListener("click", () => togglePanel(historyPanel));
  ui.settingsButton.addEventListener("click", () => togglePanel(settingsPanel));

  ui.sidebarToggleBtn.addEventListener("click", () => toggleSidebar());
  ui.floatingExpandBtn.addEventListener("click", () => toggleSidebar());

  ui.floatingNavButtons.back.addEventListener("click", () => runNavAction("back"));
  ui.floatingNavButtons.forward.addEventListener("click", () => runNavAction("forward"));
  ui.floatingNavButtons.reload.addEventListener("click", () => runNavAction("reload"));

  ui.floatingOmnibarPill.addEventListener("click", () => commandPalette.open());
  ui.floatingOmnibarPill.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commandPalette.open();
    }
  });

  ui.floatingReaderBtn.addEventListener("click", () => toggleReaderMode());
  ui.floatingSplitBtn.addEventListener("click", () => toggleSplitView());
  ui.floatingStarBtn.addEventListener("click", () => {
    const tab = getTargetTab();
    if (!tab || !isWebUrl(tab.url)) return;
    if (isBookmarked(tab.url)) removeBookmark(tab.url);
    else addBookmark(tab.url, tab.title === NEW_TAB_TITLE ? hostnameOf(tab.url) : tab.title);
  });

  ui.omnibar.addEventListener("click", (e) => {
    if (isSidebarCollapsed()) {
      e.preventDefault();
      commandPalette.open();
    }
  });

  const appRoot = document.getElementById("app");
  subscribeSidebar((collapsed) => {
    appRoot?.classList.toggle("sidebar-collapsed", collapsed);
    ui.sidebarToggleBtn.title = collapsed
      ? "Expandir barra lateral (Ctrl+B)"
      : "Recolher barra lateral (Ctrl+B)";
    ui.sidebarToggleBtn.setAttribute("aria-label", ui.sidebarToggleBtn.title);
    ui.sidebarToggleBtn.replaceChildren(icon(collapsed ? "sidebarCollapsed" : "sidebar"));
    syncViewport();
    syncWebviewVisibility();
  });

  if (isSidebarCollapsed()) {
    appRoot?.classList.add("sidebar-collapsed");
    ui.sidebarToggleBtn.title = "Expandir barra lateral (Ctrl+B)";
    ui.sidebarToggleBtn.setAttribute("aria-label", ui.sidebarToggleBtn.title);
    ui.sidebarToggleBtn.replaceChildren(icon("sidebarCollapsed"));
  }

  appRoot?.addEventListener("transitionend", (e) => {
    if (e.target === appRoot && e.propertyName === "grid-template-columns") {
      syncViewport();
    }
  });

  ui.bookmarkToggle.addEventListener("click", () => {
    const tab = getTargetTab();
    if (!tab || !isWebUrl(tab.url)) return;
    if (isBookmarked(tab.url)) removeBookmark(tab.url);
    else addBookmark(tab.url, tab.title === NEW_TAB_TITLE ? hostnameOf(tab.url) : tab.title);
  });

  ui.bookmarksBar.addEventListener("click", (event) => {
    const url = (event.target as Element).closest<HTMLElement>(".bookmark-item")?.dataset.url;
    if (url) {
      if (event.shiftKey || event.altKey) {
        event.preventDefault();
        glance.open(url);
      } else {
        openUrl(url);
      }
    }
  });
  ui.bookmarksBar.addEventListener("auxclick", (event) => {
    const url = (event.target as Element).closest<HTMLElement>(".bookmark-item")?.dataset.url;
    if (url && event.button === 1) openTab(url);
  });

  ui.omnibar.addEventListener("submit", (event) => {
    event.preventDefault();
    const url = resolveOmnibarInput(ui.omnibarInput.value, searchUrl());
    if (!url) return;
    const tab = getTargetTab();
    if (!tab) return openTab(url);
    navigate(tab.id, url);
  });

  ui.omnibarInput.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    ui.omnibarInput.value = getTargetTab()?.url ?? "";
    ui.omnibarInput.blur();
  });

  window.addEventListener("keydown", (event) => {
    const isTextInputFocused =
      document.activeElement instanceof HTMLInputElement ||
      document.activeElement instanceof HTMLTextAreaElement;

    if (event.key === "Escape") {
      if (commandPalette.isOpen()) {
        event.preventDefault();
        commandPalette.close();
        return;
      }
      if (findInPage.isOpen()) {
        event.preventDefault();
        findInPage.close();
        return;
      }
      if (readerView.isOpen()) {
        event.preventDefault();
        readerView.close();
        return;
      }
    }

    if (event.key === "F3" && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      if (event.shiftKey) {
        findInPage.findPrevious();
      } else {
        findInPage.findNext();
      }
      return;
    }

    if (
      event.key === "?" &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !isTextInputFocused
    ) {
      event.preventDefault();
      togglePanel(shortcutsPanel);
      return;
    }

    if (event.key === "F5") {
      event.preventDefault();
      if (!panels.some((p) => p.isOpen())) {
        runNavAction("reload");
      }
      return;
    }

    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      if (panels.some((p) => p.isOpen())) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        runNavAction("back");
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        runNavAction("forward");
        return;
      }
    }

    if (event.ctrlKey && event.altKey && !event.metaKey && !event.shiftKey) {
      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        toggleReaderMode();
        return;
      }
      const digit = parseInt(event.key, 10);
      if (!isNaN(digit) && digit >= 1 && digit <= 9) {
        event.preventDefault();
        const wsList = getWorkspaces();
        if (wsList[digit - 1]) {
          handleSwitchWorkspace(wsList[digit - 1].id);
        }
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const nextWs = cycleWorkspace(event.key === "ArrowRight" ? 1 : -1);
        handleSwitchWorkspace(nextWs.id);
        return;
      }
    }

    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "m") {
      event.preventDefault();
      const targetTab = getTargetTab();
      if (targetTab && !targetTab.isPinned) {
        const wsList = getWorkspaces();
        if (wsList.length > 1) {
          const curWsId = targetTab.workspaceId ?? getActiveWorkspaceId();
          const curIdx = wsList.findIndex((w) => w.id === curWsId);
          const nextWs = wsList[(curIdx + 1) % wsList.length];
          moveTabToWorkspace(targetTab.id, nextWs.id);
          handleSwitchWorkspace(nextWs.id);
        }
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "t") {
      event.preventDefault();
      if (readerView.isOpen()) {
        readerView.cycleTheme();
      } else {
        reopenClosedTab();
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "n") {
      event.preventDefault();
      openPrivateTab();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "u") {
      event.preventDefault();
      toggleTranslatePopover();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "g") {
      event.preventDefault();
      const target = getTargetTab();
      if (target?.url) glance.open(target.url, target.title);
      return;
    }

    if (readerView.isOpen() && (event.ctrlKey || event.metaKey) && event.shiftKey) {
      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        readerView.cycleFont();
        return;
      }
      if (event.key === "." || event.key === ">") {
        event.preventDefault();
        readerView.adjustFontSize(1);
        return;
      }
      if (event.key === "," || event.key === "<") {
        event.preventDefault();
        readerView.adjustFontSize(-1);
        return;
      }
    }

    if (
      (event.ctrlKey || event.metaKey) &&
      event.shiftKey &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight")
    ) {
      if (isSplitActive()) {
        event.preventDefault();
        const splitState = getSplitState();
        if (event.key === "ArrowLeft") {
          setFocusedPane("primary");
          if (splitState.primaryTabId) selectTab(splitState.primaryTabId);
        } else {
          setFocusedPane("secondary");
          if (splitState.secondaryTabId) selectTab(splitState.secondaryTabId);
        }
        return;
      }
    }

    if ((event.ctrlKey || event.metaKey) && !event.altKey && !isTextInputFocused) {
      const isPlus =
        event.key === "+" ||
        event.key === "=" ||
        event.code === "Equal" ||
        event.code === "NumpadAdd";
      const isMinus =
        (event.key === "-" ||
          event.key === "_" ||
          event.code === "Minus" ||
          event.code === "NumpadSubtract") &&
        !event.shiftKey;
      const isZero =
        (event.key === "0" ||
          event.code === "Digit0" ||
          event.code === "Numpad0") &&
        !event.shiftKey;

      if (isPlus || isMinus || isZero) {
        event.preventDefault();
        const target = getTargetTab();
        if (target) {
          if (isPlus) {
            zoomIn(target.id, target.url).catch(console.error);
          } else if (isMinus) {
            zoomOut(target.id, target.url).catch(console.error);
          } else if (isZero) {
            resetZoom(target.id, target.url).catch(console.error);
          }
        }
        return;
      }
    }

    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "k" || key === "p") {
      event.preventDefault();
      const wasOpen = commandPalette.isOpen();
      closePanels();
      if (!wasOpen) {
        commandPalette.open();
      }
      return;
    }
    if (key === "b" && !event.shiftKey) {
      event.preventDefault();
      toggleSidebar();
      return;
    }
    if (key === "h") togglePanel(historyPanel);
    else if (key === "j") togglePanel(downloadsPanel);
    else if (key === "z" && event.shiftKey) {
      const target = getTargetTab();
      if (target?.url) {
        webview.startElementZapper(target.id);
      }
    }
    else if (key === ",") togglePanel(settingsPanel);
    else if (key === "/" || event.code === "Slash") togglePanel(shortcutsPanel);
    else if (key === "\\" || (key === "s" && event.shiftKey)) {
      toggleSplitView();
    }
    else if (key === "f") {
      if (findInPage.isOpen()) {
        findInPage.input.focus();
        findInPage.input.select();
      } else {
        closePanels();
        findInPage.open();
      }
    }
    else if (key === "t" || key === "w" || key === "tab" || key === "l") {
      closePanels();
      const target = getTargetTab();
      if (key === "t") openTab();
      else if (key === "w" && target) closeTabAndWebview(target.id);
      else if (key === "tab") cycleTabs(event.shiftKey ? -1 : 1);
      else if (key === "l") focusOmnibar();
    } else return;
    event.preventDefault();
  });

  window.addEventListener(
    "wheel",
    (event) => {
      if (panels.some((p) => p.isOpen())) return;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const target = getTargetTab();
        if (!target) return;
        if (event.deltaY < 0) {
          zoomIn(target.id, target.url).catch(console.error);
        } else if (event.deltaY > 0) {
          zoomOut(target.id, target.url).catch(console.error);
        }
      }
    },
    { passive: false },
  );

  listen<TabLoadEvent>("tab://load", ({ payload }) => {
    const tab = getTab(payload.tabId);
    if (!tab) return;
    const title = tab.title === NEW_TAB_TITLE ? hostnameOf(payload.url) : tab.title;
    if (payload.state === "started") {
      checkSpaceRouting(tab.id, payload.url);
      pageTitles.delete(tab.id);
      updateTab(tab.id, { url: payload.url, isLoading: true, title });
      applyZoomForTab(tab.id, payload.url);
      applyBoostToTab(tab.id, payload.url);
      if (isYouTubeUrl(payload.url) && privacyShield.isEnabled()) {
        injectYouTubeShield(tab.id);
      }
      if (tab.id === getTargetTab()?.id) {
        lastTaskbarTabId = tab.id;
        webview.setTaskbarActiveTab(tab.id);
      }
      return;
    }
    const history = historyOf(tab.id);
    history.commit(payload.url);
    if (!tab.isPrivate) {
      addHistoryEntry(payload.url, pageTitles.get(tab.id) ?? "", tab);
    }
    updateTab(tab.id, {
      url: payload.url,
      title,
      isLoading: false,
      canGoBack: history.canGoBack,
      canGoForward: history.canGoForward,
    });
    applyZoomForTab(tab.id, payload.url);
    applyBoostToTab(tab.id, payload.url);
    if (isYouTubeUrl(payload.url) && privacyShield.isEnabled()) {
      injectYouTubeShield(tab.id);
    }
    if (findInPage.isOpen() && payload.tabId === getTargetTab()?.id) {
      findInPage.reapply();
    }
  });

  listen("zoom-in", () => {
    const target = getTargetTab();
    if (target) zoomIn(target.id, target.url).catch(console.error);
  });
  listen("zoom-out", () => {
    const target = getTargetTab();
    if (target) zoomOut(target.id, target.url).catch(console.error);
  });
  listen("zoom-reset", () => {
    const target = getTargetTab();
    if (target) resetZoom(target.id, target.url).catch(console.error);
  });
  listen("tab-new", () => openTab());
  listen("tab-close", () => {
    const target = getTargetTab();
    if (target) closeTabAndWebview(target.id);
  });
  listen("focus-omnibar", () => focusOmnibar());
  listen("tab-reload", () => runNavAction("reload"));
  listen("find-in-page", () => {
    if (findInPage.isOpen()) {
      findInPage.input.focus();
      findInPage.input.select();
    } else {
      closePanels();
      findInPage.open();
    }
  });
  listen("toggle-sidebar", () => toggleSidebar());
  listen("command-palette", () => {
    const wasOpen = commandPalette.isOpen();
    closePanels();
    if (!wasOpen) commandPalette.open();
  });
  listen("toggle-history", () => togglePanel(historyPanel));
  listen("toggle-downloads", () => togglePanel(downloadsPanel));
  listen("toggle-settings", () => togglePanel(settingsPanel));
  listen("toggle-fullscreen", () => {
    appWindow
      .isFullscreen()
      .then((fullscreen) => appWindow.setFullscreen(!fullscreen))
      .catch(console.error);
  });

  listen<TabZoomEvent>("tab-zoom-changed", ({ payload }) => {
    const tab = getTab(payload.tabId);
    syncZoomFromWebview(payload.tabId, payload.factor, tab?.url);
  });

  listen<TabSelectedEvent>("tab-selected", ({ payload }) => {
    const tab = getTab(payload.tabId);
    if (!tab) return;
    if (tab.workspaceId && tab.workspaceId !== getActiveWorkspaceId()) {
      handleSwitchWorkspace(tab.workspaceId);
    }
    selectTab(payload.tabId);
  });

  listen<{ tab_id: string; selector: string; domain: string }>(
    "zapper-element-selected",
    ({ payload }) => {
      addDomainZapRule(payload.domain, payload.selector);
      applyBoostToTab(payload.tab_id, payload.domain);
      showToast(`Elemento eliminado (${payload.selector})! Regra salva para ${payload.domain}.`);
    },
  );

  listen<{
    tab_id: string;
    has_media: boolean;
    playing: boolean;
    title: string;
    artist: string;
    muted: boolean;
  }>("media-state-updated", ({ payload }) => {
    updateTabMediaState({
      tabId: payload.tab_id,
      hasMedia: payload.has_media,
      playing: payload.playing,
      title: payload.title,
      artist: payload.artist,
      muted: payload.muted,
    });
    renderTabBar(getTabs());
  });

  setInterval(() => {
    for (const tab of getTabs()) {
      if (!tab.isSleeping && tab.url && isWebUrl(tab.url)) {
        webview.syncTabMediaState(tab.id).catch(() => {});
      }
    }
  }, 2500);

  listen<{ tabId: string; title: string }>("tab://title", ({ payload }) => {
    const tab = getTab(payload.tabId);
    if (!tab) return;
    const pageTitle = payload.title.trim();
    pageTitles.set(tab.id, pageTitle);
    if (!tab.isPrivate) {
      updateVisitTitle(tab.url, pageTitle);
    }
    updateTab(tab.id, { title: pageTitle || hostnameOf(tab.url) });
  });

  listen<{ url: string }>("tab://open", ({ payload }) => openTab(payload.url));

  const splitDivider = createSplitDivider({
    onResize: (ratio) => {
      setSplitRatio(ratio);
    },
    onSwap: () => {
      swapPanes();
    },
    onClose: () => {
      closeSplit();
    },
  });
  splitDivider.style.display = "none";
  ui.webviewContainer.append(splitDivider);

  const syncViewport = () => {
    if (glance.isOpen()) {
      glance.syncViewport();
      return;
    }
    const rect = ui.webviewContainer.getBoundingClientRect();
    const splitState = getSplitState();
    if (splitState.active && splitState.primaryTabId && splitState.secondaryTabId) {
      const primary = splitState.primaryTabId;
      const secondary = splitState.secondaryTabId;
      const ratio = splitState.ratio;
      const gap = SPLIT_GAP;
      const viewports = computeSplitViewports(rect, primary, secondary, ratio, gap);
      webview.setTabViewports(viewports);

      const availableWidth = Math.max(1, rect.width - gap);
      const leftWidth = Math.max(1, Math.round(availableWidth * Math.min(0.8, Math.max(0.2, ratio))));

      splitDivider.style.display = "";
      splitDivider.style.position = "absolute";
      splitDivider.style.left = `${leftWidth}px`;
      splitDivider.style.width = `${gap}px`;
      splitDivider.style.top = "0";
      splitDivider.style.bottom = "0";
      return;
    }
    splitDivider.style.display = "none";
    webview.setViewport({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
  };
  new ResizeObserver(syncViewport).observe(ui.webviewContainer);
  syncViewport();

  subscribeSplit((splitState) => {
    const active = splitState.active;
    ui.splitButton.classList.toggle("footer-btn--split--active", active);
    ui.splitButton.setAttribute("aria-pressed", String(active));
    ui.omnibarSplitBtn.classList.toggle("omnibar-split-btn--active", active);
    ui.omnibarSplitBtn.setAttribute("aria-pressed", String(active));
    document.getElementById("app")?.classList.toggle("split-view-active", active);
    syncViewport();
    syncWebviewVisibility();
    const target = getTargetTab();
    if (target) {
      ui.omnibarInput.value = target.url;
      renderBookmarkToggle();
      renderZoomBadge(target.id, target.url);
      renderSecurityButton(target.url);
    }
    if (findInPage.isOpen()) {
      findInPage.reapply();
    }
  });

  subscribe((tabs) => {
    render(tabs);
    const active = getTargetTab();
    if (active && active.id !== lastTaskbarTabId) {
      lastTaskbarTabId = active.id;
      webview.setTaskbarActiveTab(active.id);
    }
    if (findInPage.isOpen()) {
      findInPage.reapply();
    }
    if (readerView.isOpen() && readerView.getActiveTabId() !== getTargetTab()?.id) {
      readerView.close();
    }
  });
  subscribeBookmarks((bookmarks) => {
    renderBookmarksBar(ui.bookmarksBar, ui.bookmarksList, bookmarks);
    renderBookmarkToggle();
  });
  subscribeWorkspaces((_workspaces, activeWsId) => {
    const wsTabs = getTabs().filter(
      (t) => !t.isPinned && (t.workspaceId ?? "default") === activeWsId,
    );
    if (wsTabs.length > 0 && !wsTabs.some((t) => t.active)) {
      selectTab(wsTabs[0].id);
    }
    render(getTabs());
    syncViewport();
    syncWebviewVisibility();
  });
  subscribeFolders(() => {
    render(getTabs());
  });

  // Restore persisted session tabs if enabled, otherwise fallback to pinned tabs
  const sessionTabs = loadSession();
  const shouldRestoreSession = getSettings().restoreSession && sessionTabs.length > 0;

  if (shouldRestoreSession) {
    for (const s of sessionTabs) {
      const tab = createTab(s.url, s.isPinned, s.workspaceId, s.folderId);
      if (s.title && s.title !== NEW_TAB_TITLE) {
        updateTab(tab.id, { title: s.title });
      }
      if (s.url) {
        navigate(tab.id, s.url);
      }
    }
    const curWsId = getActiveWorkspaceId();
    const curWsTabs = getTabs().filter(
      (t) => !t.isPinned && (t.workspaceId ?? "default") === curWsId,
    );
    if (curWsTabs.length === 0) {
      openTab();
    } else {
      const activeRestored = sessionTabs.find(
        (s) => s.active && (!s.workspaceId || s.workspaceId === curWsId),
      );
      if (activeRestored) {
        const target = getTabs().find(
          (t) => t.url === activeRestored.url && (t.workspaceId ?? "default") === curWsId,
        );
        if (target) selectTab(target.id);
        else selectTab(curWsTabs[0].id);
      } else if (curWsTabs[0]) {
        selectTab(curWsTabs[0].id);
      }
    }
  } else {
    // Restore persisted pinned tabs, then open initial tab if needed
    const pinnedUrls = loadPinnedUrls();
    for (const url of pinnedUrls) {
      const tab = createTab(url, true);
      if (url) navigate(tab.id, url);
    }

    const curWsId = getActiveWorkspaceId();
    const existingTabs = getTabs();
    const wsTabs = existingTabs.filter(
      (t) => !t.isPinned && (t.workspaceId ?? "default") === curWsId,
    );
    if (wsTabs.length === 0) {
      openTab();
    } else {
      const active = wsTabs.find((t) => t.active);
      if (!active && wsTabs[0]) {
        selectTab(wsTabs[0].id);
      }
    }
  }

  if (!isOnboardingCompleted()) {
    welcomeWizard.open();
    syncWebviewVisibility();
  }
});
