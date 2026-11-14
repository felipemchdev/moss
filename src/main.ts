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
import { isWebUrl } from "./storage";
import {
  NEW_TAB_TITLE,
  closeTab,
  createTab,
  getActiveTab,
  getTab,
  getTabs,
  selectTab,
  subscribe,
  updateTab,
  type Tab,
} from "./tabs";
import { webview } from "./webview";

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
  const newTabButton = el(
    "button",
    { class: "tab-new-btn", type: "button", "aria-label": "Nova aba", title: "Nova aba (Ctrl+T)" },
    [icon("plus")],
  );
  const tabList = el("div", { class: "tab-list", role: "tablist" }, [newTabButton]);
  const tabBar = el("div", { class: "tab-bar" }, [tabList]);

  const navButtons = {} as Record<NavAction, HTMLButtonElement>;
  for (const { action, label, icon: iconName } of NAV_BUTTONS) {
    navButtons[action] = el(
      "button",
      { class: "nav-btn", type: "button", "aria-label": label, title: label, disabled: "" },
      [icon(iconName)],
    );
  }

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
  const omnibar = el("form", { class: "omnibar", role: "search" }, [
    el("span", { class: "omnibar-icon" }, [icon("search")]),
    el("div", { class: "omnibar-input-wrapper" }, [omnibarInput]),
    el("div", { class: "omnibar-actions" }, [bookmarkToggle]),
  ]);

  const toggleAttrs = { class: "nav-btn", type: "button", [PANEL_TOGGLE_ATTR]: "" };
  const historyButton = el(
    "button",
    { ...toggleAttrs, "aria-label": "Histórico", title: "Histórico (Ctrl+H)" },
    [icon("history")],
  );
  const settingsButton = el(
    "button",
    { ...toggleAttrs, "aria-label": "Configurações", title: "Configurações (Ctrl+,)" },
    [icon("settings")],
  );

  // Native tab webviews render above the HTML, so the loading bar must live in the chrome.
  const loadingBar = el("div", { class: "webview-loading" });
  const toolbar = el("header", { class: "toolbar" }, [
    el("nav", { class: "toolbar-group nav-group" }, Object.values(navButtons)),
    el("div", { class: "toolbar-group omnibar-group" }, [omnibar]),
    el("div", { class: "toolbar-group action-group" }, [historyButton, settingsButton]),
    loadingBar,
  ]);

  const bookmarksList = el("ul", { class: "bookmarks-list" });
  const bookmarksBar = el("nav", { class: "bookmarks-bar", "aria-label": "Favoritos" }, [bookmarksList]);

  const emptyState = el("div", { class: "empty-state" }, [
    el("h1", { class: "empty-state-title" }, ["moss"]),
    el("p", { class: "empty-state-hint" }, ["Digite um endereço na omnibar para começar."]),
    el(
      "div",
      { class: "empty-state-shortcuts" },
      SHORTCUTS.map(([keys, label]) =>
        el("span", { class: "empty-state-shortcut" }, [el("kbd", {}, [keys]), label]),
      ),
    ),
  ]);
  const webviewContainer = el("div", { class: "webview-container" }, [emptyState]);
  const mainView = el("main", { class: "main-view" }, [webviewContainer]);

  root.append(tabBar, toolbar, bookmarksBar, mainView);
  return {
    tabList,
    newTabButton,
    navButtons,
    omnibar,
    omnibarInput,
    bookmarkToggle,
    historyButton,
    settingsButton,
    bookmarksBar,
    bookmarksList,
    emptyState,
    loadingBar,
    webviewContainer,
  };
}

function renderBookmarksBar(bar: HTMLElement, list: HTMLElement, bookmarks: readonly Bookmark[]) {
  // The bar sets display:flex, which would override [hidden].
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
  let shownTabId: string | null = null;
  let shownUrl = "";
  let visibleWebviewId: string | null | undefined;

  const historyPanel = createHistoryPanel((url, inNewTab) => {
    const tab = getActiveTab();
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
        const otherTabs = getTabs().filter((t) => t.id !== tabId);
        for (const t of otherTabs) {
          closeTabAndWebview(t.id);
        }
        selectTab(tabId);
      },
    },
    syncWebviewVisibility,
  );

  root.append(
    historyPanel.element,
    settings.overlay,
    settingsPanel.element,
    shortcuts.overlay,
    shortcutsPanel.element,
    tabContextMenu.element,
  );

  initDownloads(root);

  // Native webviews would cover the panels, so the active one is hidden while a panel is open.
  function syncWebviewVisibility() {
    const target =
      panels.some((panel) => panel.isOpen()) || tabContextMenu.isOpen()
        ? null
        : (getActiveTab()?.id ?? null);
    if (target === visibleWebviewId) return;
    visibleWebviewId = target;
    webview.show(target);
  }

  function closePanels() {
    for (const panel of panels) panel.close();
    tabContextMenu.close();
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
    const tab = createTab(target);
    if (target) navigate(tab.id, target);
    if (!url) focusOmnibar();
  }

  // Reuses the active tab when it is still blank instead of piling up empty tabs.
  function openUrl(url: string) {
    const tab = getActiveTab();
    if (tab && !tab.url) navigate(tab.id, url);
    else openTab(url);
  }

  function closeTabAndWebview(tabId: string) {
    closeTab(tabId);
    histories.delete(tabId);
    pageTitles.delete(tabId);
    webview.close(tabId);
    if (getTabs().length === 0) openTab();
  }

  function cycleTabs(step: number) {
    const tabs = getTabs();
    const index = tabs.findIndex((tab) => tab.active);
    if (index === -1 || tabs.length < 2) return;
    selectTab(tabs[(index + step + tabs.length) % tabs.length].id);
  }

  function runNavAction(action: NavAction) {
    const tab = getActiveTab();
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

  function renderTabBar(tabs: readonly Tab[]) {
    for (const [id, node] of tabElements) {
      if (!tabs.some((tab) => tab.id === id)) {
        node.remove();
        tabElements.delete(id);
      }
    }
    tabs.forEach((tab, index) => {
      const node = tabElements.get(tab.id) ?? createTabElement(tab.id);
      renderTab(node, tab);
      if (ui.tabList.children[index] !== node) {
        ui.tabList.insertBefore(node, ui.tabList.children[index]);
      }
    });
  }

  function renderBookmarkToggle() {
    const url = getActiveTab()?.url ?? "";
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

    const active = tabs.find((tab) => tab.active);
    ui.navButtons.back.disabled = !active?.canGoBack;
    ui.navButtons.forward.disabled = !active?.canGoForward;
    ui.navButtons.reload.disabled = !active?.url;
    ui.emptyState.style.display = active?.url ? "none" : "";
    ui.loadingBar.style.display = active?.isLoading ? "" : "none";
    document.title = active?.url ? `${active.title} — Moss` : "Moss";
    renderBookmarkToggle();
    syncWebviewVisibility();

    const activeId = active?.id ?? null;
    const activeUrl = active?.url ?? "";
    if (activeId !== shownTabId) {
      shownTabId = activeId;
      ui.omnibarInput.value = activeUrl;
      if (!activeUrl) focusOmnibar();
    } else if (activeUrl !== shownUrl && document.activeElement !== ui.omnibarInput) {
      ui.omnibarInput.value = activeUrl;
    }
    shownUrl = activeUrl;
  }

  ui.tabList.addEventListener("click", (event) => {
    const target = event.target as Element;
    if (target.closest(".tab-new-btn")) return openTab();
    const tabId = target.closest<HTMLElement>(".tab")?.dataset.tabId;
    if (!tabId) return;
    if (target.closest(".tab-close")) closeTabAndWebview(tabId);
    else selectTab(tabId);
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
      selectTab(tabId);
    }
  });

  for (const { action } of NAV_BUTTONS) {
    ui.navButtons[action].addEventListener("click", () => runNavAction(action));
  }

  ui.historyButton.addEventListener("click", () => togglePanel(historyPanel));
  ui.settingsButton.addEventListener("click", () => togglePanel(settingsPanel));

  ui.bookmarkToggle.addEventListener("click", () => {
    const tab = getActiveTab();
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
    const tab = getActiveTab();
    if (!tab) return openTab(url);
    navigate(tab.id, url);
  });

  ui.omnibarInput.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    ui.omnibarInput.value = getActiveTab()?.url ?? "";
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

    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "h") togglePanel(historyPanel);
    else if (key === ",") togglePanel(settingsPanel);
    else if (key === "/" || event.code === "Slash") togglePanel(shortcutsPanel);
    else if (key === "t" || key === "w" || key === "tab" || key === "l") {
      closePanels();
      const active = getActiveTab();
      if (key === "t") openTab();
      else if (key === "w" && active) closeTabAndWebview(active.id);
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

  const syncViewport = () => {
    const rect = ui.webviewContainer.getBoundingClientRect();
    webview.setViewport({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
  };
  new ResizeObserver(syncViewport).observe(ui.webviewContainer);
  syncViewport();

  subscribe(render);
  subscribeBookmarks((bookmarks) => {
    renderBookmarksBar(ui.bookmarksBar, ui.bookmarksList, bookmarks);
    renderBookmarkToggle();
  });
  openTab();
});
