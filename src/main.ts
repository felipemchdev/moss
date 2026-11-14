import { listen } from "@tauri-apps/api/event";
import { NavHistory, type NavIntent } from "./history";
import { icon, type IconName } from "./icons";
import { resolveOmnibarInput } from "./omnibar";
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
];

const histories = new Map<string, NavHistory>();

function historyOf(tabId: string): NavHistory {
  let history = histories.get(tabId);
  if (!history) {
    history = new NavHistory();
    histories.set(tabId, history);
  }
  return history;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
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
  const omnibar = el("form", { class: "omnibar", role: "search" }, [
    el("span", { class: "omnibar-icon" }, [icon("search")]),
    el("div", { class: "omnibar-input-wrapper" }, [omnibarInput]),
  ]);

  // Native tab webviews render above the HTML, so the loading bar must live in the chrome.
  const loadingBar = el("div", { class: "webview-loading" });
  const toolbar = el("header", { class: "toolbar" }, [
    el("nav", { class: "toolbar-group nav-group" }, Object.values(navButtons)),
    el("div", { class: "toolbar-group omnibar-group" }, [omnibar]),
    loadingBar,
  ]);

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

  root.append(tabBar, toolbar, mainView);
  return {
    tabList,
    newTabButton,
    navButtons,
    omnibar,
    omnibarInput,
    emptyState,
    loadingBar,
    webviewContainer,
  };
}

window.addEventListener("DOMContentLoaded", () => {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) return;

  const ui = buildChrome(root);
  const tabElements = new Map<string, HTMLElement>();
  let shownTabId: string | null = null;
  let shownUrl = "";

  function focusOmnibar() {
    ui.omnibarInput.focus();
    ui.omnibarInput.select();
  }

  function navigate(tabId: string, url: string) {
    updateTab(tabId, { url, isLoading: true });
    webview.navigate(tabId, url).catch(() => updateTab(tabId, { isLoading: false }));
  }

  function openTab(url?: string) {
    const tab = createTab(url);
    if (url) navigate(tab.id, url);
    else focusOmnibar();
  }

  function closeTabAndWebview(tabId: string) {
    closeTab(tabId);
    histories.delete(tabId);
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

  function render(tabs: readonly Tab[]) {
    renderTabBar(tabs);

    const active = tabs.find((tab) => tab.active);
    ui.navButtons.back.disabled = !active?.canGoBack;
    ui.navButtons.forward.disabled = !active?.canGoForward;
    ui.navButtons.reload.disabled = !active?.url;
    ui.emptyState.style.display = active?.url ? "none" : "";
    ui.loadingBar.style.display = active?.isLoading ? "" : "none";
    document.title = active?.url ? `${active.title} — Moss` : "Moss";

    const activeId = active?.id ?? null;
    const activeUrl = active?.url ?? "";
    if (activeId !== shownTabId) {
      shownTabId = activeId;
      webview.show(activeId);
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

  ui.omnibar.addEventListener("submit", (event) => {
    event.preventDefault();
    const url = resolveOmnibarInput(ui.omnibarInput.value);
    if (!url) return;
    const tab = getActiveTab();
    if (!tab) return openTab(url);
    ui.omnibarInput.value = url;
    ui.omnibarInput.blur();
    navigate(tab.id, url);
  });

  ui.omnibarInput.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    ui.omnibarInput.value = getActiveTab()?.url ?? "";
    ui.omnibarInput.blur();
  });

  window.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    const active = getActiveTab();

    if (key === "t") openTab();
    else if (key === "w" && active) closeTabAndWebview(active.id);
    else if (key === "tab") cycleTabs(event.shiftKey ? -1 : 1);
    else if (key === "l") focusOmnibar();
    else return;
    event.preventDefault();
  });

  listen<TabLoadEvent>("tab://load", ({ payload }) => {
    const tab = getTab(payload.tabId);
    if (!tab) return;
    const title = tab.title === NEW_TAB_TITLE ? hostnameOf(payload.url) : tab.title;
    if (payload.state === "started") {
      updateTab(tab.id, { url: payload.url, isLoading: true, title });
      return;
    }
    const history = historyOf(tab.id);
    history.commit(payload.url);
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
    if (tab) updateTab(tab.id, { title: payload.title.trim() || hostnameOf(tab.url) });
  });

  listen<{ url: string }>("tab://open", ({ payload }) => openTab(payload.url));

  const syncViewport = () => {
    const rect = ui.webviewContainer.getBoundingClientRect();
    webview.setViewport({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
  };
  new ResizeObserver(syncViewport).observe(ui.webviewContainer);
  syncViewport();

  subscribe(render);
  openTab();
});
