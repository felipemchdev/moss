import { listen } from "@tauri-apps/api/event";
import { addBookmark, isBookmarked, removeBookmark, subscribeBookmarks, type Bookmark } from "./bookmarks";
import { createTabContextMenu } from "./context-menu";
import { el, hostnameOf } from "./dom";
import { initDownloads } from "./downloads";
import { NavHistory, recordVisit, updateVisitTitle, type NavIntent } from "./history";
import { createHistoryPanel } from "./history-panel";
import { icon, type IconName } from "./icons";
import { resolveOmnibarInput } from "./omnibar";
import { PANEL_TOGGLE_ATTR, type Panel } from "./panel";
import { getSettings, searchUrl } from "./settings";
import { createSettingsPanel } from "./settings-panel";
import { createShortcutsModal } from "./shortcuts-modal";
import { createPrivacyShield } from "./privacy-shield";
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
  moveTabToWorkspace,
  selectTab,
  subscribe,
  togglePinTab,
  updateTab,
  type Tab,
} from "./tabs";
import {
  cycleWorkspace,
  deleteWorkspace,
  getActiveWorkspaceId,
  getWorkspaces,
  setActiveWorkspace,
  subscribeWorkspaces,
} from "./workspaces";
import { createWorkspaceSwitcher } from "./workspace-switcher";
import { webview, windowControls } from "./webview";

type NavAction = NavIntent;

interface TabLoadEvent {
  tabId: string;
  url: string;
  state: "started" | "finished";
}

const NAV_BUTTONS: { action: NavAction; label: string; icon: IconName }[] = [
  { action: "back", label: "Voltar", icon: "back" },
  { action: "forward", label: "Avançar", icon: "forward" },
  { action: "reload", label: "Recarregar", icon: "reload" },
];

const SHORTCUTS = [
  ["Ctrl+T", "nova aba"],
  ["Ctrl+W", "fechar aba"],
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
  // 1. Window controls
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

  // 2. Navigation buttons
  const navButtons = {} as Record<NavAction, HTMLButtonElement>;
  for (const { action, label, icon: iconName } of NAV_BUTTONS) {
    navButtons[action] = el(
      "button",
      { class: "nav-btn", type: "button", "aria-label": label, title: label, disabled: "" },
      [icon(iconName)],
    );
  }
  const navRow = el("div", { class: "nav-row" }, Object.values(navButtons));

  // 3. Sidebar header
  const sidebarHeader = el("div", { class: "sidebar-header", "data-tauri-drag-region": "" }, [windowControlsEl, navRow]);

  // 4. Sidebar omnibar
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
  const omnibar = el("form", { class: "sidebar-omnibar omnibar", role: "search" }, [
    el("span", { class: "omnibar-icon" }, [icon("search")]),
    el("div", { class: "omnibar-input-wrapper" }, [omnibarInput]),
    el("div", { class: "omnibar-actions" }, [omnibarSplitBtn, bookmarkToggle]),
  ]);

  // 5. Pinned tabs section
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

  // 6. Tab bar & new tab button
  const newTabButton = el(
    "button",
    { class: "new-tab-btn tab-new-btn", type: "button", "aria-label": "Nova aba", title: "Nova aba (Ctrl+T)" },
    [icon("plus"), el("span", {}, ["Nova Aba"])],
  );
  const newTabSection = el("div", { class: "new-tab-section" }, [newTabButton]);
  const tabList = el("div", { class: "tabs-list tab-list", role: "tablist" });
  const tabBar = el("div", { class: "tabs-section tab-bar" }, [tabList, newTabSection]);

  // 7. Bookmarks bar
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

  // 8. Sidebar footer
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

  // 8.5. Workspace section
  const workspaceSection = el("div", { class: "workspace-section" });

  // 9. Assemble sidebar
  const sidebar = el("aside", { class: "sidebar" }, [
    sidebarHeader,
    omnibar,
    pinnedTabsSection,
    workspaceSection,
    tabBar,
    bookmarksBar,
    sidebarFooter,
  ]);

  // 10. Main view with floating webview container
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
  const viewportCard = el("div", { class: "viewport-card" }, [webviewContainer]);
  const mainView = el("main", { class: "main-view viewport-area" }, [viewportCard]);

  root.append(sidebar, mainView);

  return {
    tabList,
    newTabButton,
    navButtons,
    omnibar,
    omnibarInput,
    bookmarkToggle,
    omnibarSplitBtn,
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
    pinnedTabsSection,
    pinnedTabsGrid,
    workspaceSection,
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
  const panels: Panel[] = [historyPanel, settingsPanel, shortcutsPanel];

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

  const privacyShield = createPrivacyShield(ui.privacyButton, syncWebviewVisibility);

  root.append(
    historyPanel.element,
    settings.overlay,
    settingsPanel.element,
    shortcuts.overlay,
    shortcutsPanel.element,
    tabContextMenu.element,
    privacyShield.popover,
    workspaceSwitcher.popover,
  );

  const downloadController = initDownloads(root);
  window.addEventListener("beforeunload", () => {
    downloadController.destroy();
    privacyShield.destroy();
    workspaceSwitcher.destroy();
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
    downloadController.show("moss-download", 100, true);
  });

  // Native webviews would cover the panels, so the active one is hidden while a panel is open.
  function syncWebviewVisibility() {
    const isBlocked =
      panels.some((panel) => panel.isOpen()) ||
      tabContextMenu.isOpen() ||
      privacyShield.isOpen() ||
      workspaceSwitcher.isOpen();

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
  }

  function togglePanel(panel: Panel) {
    if (panel.isOpen()) return panel.close();
    closePanels();
    panel.open();
  }

  function focusOmnibar() {
    ui.omnibarInput.focus();
    ui.omnibarInput.select();
  }

  function navigate(tabId: string, url: string) {
    if (getActiveTab()?.id === tabId) {
      ui.omnibarInput.value = url;
      ui.omnibarInput.blur();
    }
    updateTab(tabId, { url, isLoading: true });
    webview.navigate(tabId, url).catch(() => updateTab(tabId, { isLoading: false }));
  }

  function openTab(url?: string) {
    const target = url ?? getSettings().homepage;
    const tab = createTab(target, false, getActiveWorkspaceId());
    if (target) navigate(tab.id, target);
    if (!url) focusOmnibar();
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
    const node = el("div", { class: "tab", role: "tab", tabindex: "0", "data-tab-id": tabId }, [
      el("span", { class: "tab-favicon" }),
      el("span", { class: "tab-title" }),
      el(
        "button",
        { class: "tab-close", type: "button", "aria-label": "Fechar aba", title: "Fechar aba (Ctrl+W)" },
        [icon("close")],
      ),
    ]);
    tabElements.set(tabId, node);
    return node;
  }

  function renderTab(node: HTMLElement, tab: Tab) {
    node.classList.toggle("tab--active", tab.active);
    node.classList.toggle("tab--loading", tab.isLoading);
    node.setAttribute("aria-selected", String(tab.active));
    node.title = tab.url ? `${tab.title}\n${tab.url}` : tab.title;
    node.querySelector(".tab-title")!.textContent = tab.title;

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

  function renderTabBar(tabs: readonly Tab[]) {
    const curWsId = getActiveWorkspaceId();
    const pinned = tabs.filter((t) => t.isPinned);
    const unpinned = tabs.filter((t) => !t.isPinned && (t.workspaceId ?? "default") === curWsId);

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

    // Render unpinned tabs in tabList
    unpinned.forEach((tab, index) => {
      const node = tabElements.get(tab.id) ?? createTabElement(tab.id);
      renderTab(node, tab);
      if (ui.tabList.children[index] !== node) {
        ui.tabList.insertBefore(node, ui.tabList.children[index]);
      }
    });
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

  function render(tabs: readonly Tab[]) {
    renderTabBar(tabs);

    const target = getTargetTab();
    ui.navButtons.back.disabled = !target?.canGoBack;
    ui.navButtons.forward.disabled = !target?.canGoForward;
    ui.navButtons.reload.disabled = !target?.url;
    ui.emptyState.style.display = target?.url ? "none" : "";
    ui.loadingBar.style.display = target?.isLoading ? "" : "none";
    document.title = target?.url ? `${target.title} — Moss` : "Moss";
    renderBookmarkToggle();
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
    } else if (targetUrl !== shownUrl && document.activeElement !== ui.omnibarInput) {
      ui.omnibarInput.value = targetUrl;
    }
    shownUrl = targetUrl;
  }

  function handleTabClick(tabId: string) {
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

  ui.newTabButton.addEventListener("click", () => openTab());

  for (const { action } of NAV_BUTTONS) {
    ui.navButtons[action].addEventListener("click", () => runNavAction(action));
  }

  ui.splitButton.addEventListener("click", () => toggleSplitView());
  ui.omnibarSplitBtn.addEventListener("click", () => toggleSplitView());
  ui.historyButton.addEventListener("click", () => togglePanel(historyPanel));
  ui.settingsButton.addEventListener("click", () => togglePanel(settingsPanel));

  ui.bookmarkToggle.addEventListener("click", () => {
    const tab = getTargetTab();
    if (!tab || !isWebUrl(tab.url)) return;
    if (isBookmarked(tab.url)) removeBookmark(tab.url);
    else addBookmark(tab.url, tab.title === NEW_TAB_TITLE ? hostnameOf(tab.url) : tab.title);
  });

  ui.bookmarksBar.addEventListener("click", (event) => {
    const url = (event.target as Element).closest<HTMLElement>(".bookmark-item")?.dataset.url;
    if (url) openUrl(url);
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

    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "h") togglePanel(historyPanel);
    else if (key === ",") togglePanel(settingsPanel);
    else if (key === "/" || event.code === "Slash") togglePanel(shortcutsPanel);
    else if (key === "\\" || (key === "s" && event.shiftKey)) {
      toggleSplitView();
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

  listen<TabLoadEvent>("tab://load", ({ payload }) => {
    const tab = getTab(payload.tabId);
    if (!tab) return;
    const title = tab.title === NEW_TAB_TITLE ? hostnameOf(payload.url) : tab.title;
    if (payload.state === "started") {
      pageTitles.delete(tab.id);
      updateTab(tab.id, { url: payload.url, isLoading: true, title });
      return;
    }
    const history = historyOf(tab.id);
    history.commit(payload.url);
    recordVisit(payload.url, pageTitles.get(tab.id) ?? "");
    updateTab(tab.id, {
      url: payload.url,
      title,
      isLoading: false,
      canGoBack: history.canGoBack,
      canGoForward: history.canGoForward,
    });
  });

  listen<{ tabId: string; title: string }>("tab://title", ({ payload }) => {
    const tab = getTab(payload.tabId);
    if (!tab) return;
    const pageTitle = payload.title.trim();
    pageTitles.set(tab.id, pageTitle);
    updateVisitTitle(tab.url, pageTitle);
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
    }
  });

  subscribe(render);
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
});
