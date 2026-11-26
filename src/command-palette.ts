import { getBookmarks, isBookmarked } from "./bookmarks";
import { el, hostnameOf } from "./dom";
import { getRecentHistory, searchHistory } from "./history";
import { subscribeLocale, t } from "./i18n";
import "./i18n-panels";
import { icon, type IconName } from "./icons";
import { resolveOmnibarInput } from "./omnibar";
import { getSettings, searchUrl, SEARCH_ENGINES } from "./settings";
import { isWebUrl } from "./storage";
import { getActiveTab, getTabs, type Tab } from "./tabs";
import { getWorkspaces } from "./workspaces";

export type PaletteCategory = "actions" | "tabs" | "bookmarks" | "history" | "web";

export interface PaletteItem {
  id: string;
  category: PaletteCategory;
  categoryLabel: string;
  title: string;
  subtitle?: string;
  iconName: IconName;
  shortcut?: string[];
  badge?: string;
  badgeType?: "active" | "pinned" | "workspace" | "default";
  keywords?: string[];
  score?: number;
  run: () => void;
}

export interface CommandPaletteActions {
  openTab: (url?: string) => void;
  closeCurrentTab: () => void;
  selectTab: (tabId: string, workspaceId?: string) => void;
  toggleSplitView: () => void;
  swapPanes: () => void;
  closeSplit: () => void;
  toggleReaderMode: () => void;
  openFindInPage: () => void;
  openHistory: () => void;
  openDownloads: () => void;
  clearHistory: () => void;
  openSettings: () => void;
  openShortcuts: () => void;
  openSiteInfo: () => void;
  toggleBookmark: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  reload: () => void;
  navBack: () => void;
  navForward: () => void;
  newWorkspace: () => void;
  switchWorkspace: (workspaceId: string) => void;
  cycleWorkspace: (delta: number) => void;
  navigateActiveTab: (url: string) => void;
  getTargetTab: () => Tab | undefined;
  isSplitActive: () => boolean;
  toggleSidebar: () => void;
  isSidebarCollapsed: () => boolean;
  reopenClosedTab: () => void;
  openGlance: (url?: string) => void;
  createTabFolder?: () => void;
  hibernateInactiveTabs?: () => void;
  wakeAllTabs?: () => void;
  routeCurrentDomainToCurrentSpace?: () => void;
  openSpaceRoutingSettings?: () => void;
  openWelcomeWizard?: () => void;
  openPrivateTab?: () => void;
  translatePage?: () => void;
}

export interface CommandPaletteController {
  overlay: HTMLElement;
  element: HTMLElement;
  isOpen: () => boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  destroy: () => void;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function calculateScore(item: PaletteItem, query: string, terms: string[]): number {
  const normTitle = normalize(item.title);
  const normSub = normalize(item.subtitle ?? "");
  const normQuery = normalize(query);
  const normKeywords = (item.keywords ?? []).map(normalize).join(" ");

  let score = 0;

  if (normTitle === normQuery) score += 100;
  else if (normTitle.startsWith(normQuery)) score += 60;
  else if (normTitle.includes(normQuery)) score += 30;

  if (normSub.startsWith(normQuery)) score += 40;
  else if (normSub.includes(normQuery)) score += 20;

  for (const term of terms) {
    if (normTitle.includes(term)) score += 15;
    if (normSub.includes(term)) score += 10;
    if (normKeywords.includes(term)) score += 12;
  }

  // Category & status priorities
  if (item.category === "tabs") {
    score += 8;
    if (item.badgeType === "active") score += 5;
    if (item.badgeType === "pinned") score += 4;
  } else if (item.category === "actions") {
    score += 6;
  } else if (item.category === "bookmarks") {
    score += 4;
  } else if (item.category === "history") {
    score += 2;
  }

  return score;
}

export function createCommandPalette(
  actions: CommandPaletteActions,
  onVisibilityChange: () => void,
): CommandPaletteController {
  let isOpen = false;
  let returnFocus: HTMLElement | null = null;
  let flatItems: PaletteItem[] = [];
  let selectedIndex = 0;

  const overlay = el("div", {
    class: "command-palette-overlay",
    "aria-hidden": "true",
    style: "display: none;",
  });

  const searchIcon = el("span", { class: "command-palette-search-icon" }, [icon("search")]);

  const input = el("input", {
    class: "command-palette-input",
    type: "text",
    placeholder: t("palette.placeholder"),
    role: "combobox",
    "aria-autocomplete": "list",
    "aria-expanded": "true",
    "aria-controls": "command-palette-results",
    spellcheck: "false",
    autocomplete: "off",
  });

  const clearBtn = el(
    "button",
    {
      class: "command-palette-clear-btn",
      type: "button",
      "aria-label": t("palette.clearSearch"),
      title: t("palette.clear"),
      style: "display: none;",
    },
    [icon("close")],
  );

  const escHint = el("span", { class: "command-palette-esc-hint" }, [
    el("kbd", { class: "command-palette-kbd" }, ["Esc"]),
  ]);

  const header = el("div", { class: "command-palette-header" }, [
    searchIcon,
    input,
    clearBtn,
    escHint,
  ]);

  const resultsList = el("div", {
    class: "command-palette-results",
    id: "command-palette-results",
    role: "listbox",
    "aria-label": t("palette.results"),
  });

  const countBadge = el("span", { class: "command-palette-count" }, [t("palette.itemsZero")]);

  const hintNavigateLabel = el("span", { class: "command-palette-footer-hint-label" }, [
    " " + t("palette.hintNavigate"),
  ]);
  const hintExecuteLabel = el("span", { class: "command-palette-footer-hint-label" }, [
    " " + t("palette.hintExecute"),
  ]);
  const hintCloseLabel = el("span", { class: "command-palette-footer-hint-label" }, [
    " " + t("palette.hintClose"),
  ]);

  const footer = el("div", { class: "command-palette-footer" }, [
    el("div", { class: "command-palette-footer-hints" }, [
      el("span", { class: "command-palette-footer-hint" }, [
        el("kbd", { class: "command-palette-kbd" }, ["↑"]),
        el("kbd", { class: "command-palette-kbd" }, ["↓"]),
        hintNavigateLabel,
      ]),
      el("span", { class: "command-palette-footer-hint" }, [
        el("kbd", { class: "command-palette-kbd" }, ["↵"]),
        hintExecuteLabel,
      ]),
      el("span", { class: "command-palette-footer-hint" }, [
        el("kbd", { class: "command-palette-kbd" }, ["Esc"]),
        hintCloseLabel,
      ]),
    ]),
    countBadge,
  ]);

  const element = el(
    "div",
    {
      class: "command-palette",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": t("palette.title"),
      style: "display: none;",
    },
    [header, resultsList, footer],
  );

  function getBuiltinActions(): PaletteItem[] {
    const target = actions.getTargetTab();
    const hasTarget = !!target;
    const splitActive = actions.isSplitActive();
    const isTargetBookmarked = hasTarget && target.url ? isBookmarked(target.url) : false;
    const quickActions = t("palette.category.actions");

    const list: PaletteItem[] = [
      {
        id: "action-new-tab",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.newTab.title"),
        subtitle: t("palette.action.newTab.subtitle"),
        iconName: "plus",
        shortcut: ["Ctrl", "T"],
        keywords: ["nova", "aba", "tab", "criar", "open", "new"],
        run: () => actions.openTab(),
      },
      {
        id: "action-new-private-tab",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.newPrivateTab.title"),
        subtitle: t("palette.action.newPrivateTab.subtitle"),
        iconName: "shield",
        shortcut: ["Ctrl", "Shift", "N"],
        keywords: ["nova", "aba", "tab", "anonima", "anonimo", "privada", "incognito", "private", "janela"],
        run: () => (actions.openPrivateTab ? actions.openPrivateTab() : actions.openTab()),
      },
      {
        id: "action-translate-page",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.translate.title"),
        subtitle: t("palette.action.translate.subtitle"),
        iconName: "translate",
        shortcut: ["Ctrl", "Shift", "U"],
        keywords: ["traduzir", "translate", "idioma", "language", "portugues", "ingles", "traducao"],
        run: () => actions.translatePage?.(),
      },
      {
        id: "action-close-tab",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.closeTab.title"),
        subtitle: hasTarget ? target.title : t("palette.action.closeTab.subtitleFallback"),
        iconName: "close",
        shortcut: ["Ctrl", "W"],
        keywords: ["fechar", "close", "remover", "sair", "tab"],
        run: () => actions.closeCurrentTab(),
      },
      {
        id: "action-reopen-closed-tab",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.reopen.title"),
        subtitle: t("palette.action.reopen.subtitle"),
        iconName: "reload",
        shortcut: ["Ctrl", "Shift", "T"],
        keywords: ["reabrir", "restaurar", "aba", "fechada", "recuperar", "undo", "closed"],
        run: () => actions.reopenClosedTab(),
      },
      {
        id: "action-split-view",
        category: "actions",
        categoryLabel: quickActions,
        title: splitActive ? t("palette.action.splitOff.title") : t("palette.action.splitOn.title"),
        subtitle: splitActive
          ? t("palette.action.splitOff.subtitle")
          : t("palette.action.splitOn.subtitle"),
        iconName: "split",
        shortcut: ["Ctrl", "\\"],
        keywords: ["split", "dividir", "divisao", "lado", "telas", "duas"],
        run: () => actions.toggleSplitView(),
      },
      {
        id: "action-toggle-sidebar",
        category: "actions",
        categoryLabel: quickActions,
        title: actions.isSidebarCollapsed()
          ? t("palette.action.sidebarCollapsed.title")
          : t("palette.action.sidebarExpanded.title"),
        subtitle: actions.isSidebarCollapsed()
          ? t("palette.action.sidebarCollapsed.subtitle")
          : t("palette.action.sidebarExpanded.subtitle"),
        iconName: "sidebar",
        shortcut: ["Ctrl", "B"],
        keywords: ["sidebar", "barra", "lateral", "compacto", "recolher", "expandir", "dock"],
        run: () => actions.toggleSidebar(),
      },
    ];

    if (splitActive) {
      list.push(
        {
          id: "action-swap-panes",
          category: "actions",
          categoryLabel: quickActions,
          title: t("palette.action.swapPanes.title"),
          subtitle: t("palette.action.swapPanes.subtitle"),
          iconName: "swap",
          keywords: ["swap", "inverter", "trocar", "lado", "split"],
          run: () => actions.swapPanes(),
        },
        {
          id: "action-close-split",
          category: "actions",
          categoryLabel: quickActions,
          title: t("palette.action.closeSplit.title"),
          subtitle: t("palette.action.closeSplit.subtitle"),
          iconName: "close",
          keywords: ["fechar", "split", "encerrar"],
          run: () => actions.closeSplit(),
        },
      );
    }

    list.push(
      {
        id: "action-reader-mode",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.reader.title"),
        subtitle: t("palette.action.reader.subtitle"),
        iconName: "book",
        shortcut: ["Ctrl", "Alt", "R"],
        keywords: ["reader", "leitura", "modo", "ler", "artigo", "limpo"],
        run: () => actions.toggleReaderMode(),
      },
      {
        id: "action-glance",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.glance.title"),
        subtitle: t("palette.action.glance.subtitle"),
        iconName: "eye",
        shortcut: ["Ctrl", "Shift", "G"],
        keywords: ["glance", "peek", "espiar", "previa", "preview", "link"],
        run: () => actions.openGlance(),
      },
      {
        id: "action-new-folder",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.folder.title"),
        subtitle: t("palette.action.folder.subtitle"),
        iconName: "folderPlus",
        keywords: ["pasta", "folder", "grupo", "agrupar", "organizar"],
        run: () => actions.createTabFolder?.(),
      },
      {
        id: "action-hibernate-inactive",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.hibernate.title"),
        subtitle: t("palette.action.hibernate.subtitle"),
        iconName: "moon",
        keywords: ["hibernar", "dormir", "sleep", "memoria", "ram", "saver", "economizar"],
        run: () => actions.hibernateInactiveTabs?.(),
      },
      {
        id: "action-wake-all",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.wake.title"),
        subtitle: t("palette.action.wake.subtitle"),
        iconName: "sun",
        keywords: ["acordar", "wake", "reativar", "restaurar", "abas"],
        run: () => actions.wakeAllTabs?.(),
      },
      {
        id: "action-route-current-domain",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.routeCurrent.title"),
        subtitle: t("palette.action.routeCurrent.subtitle"),
        iconName: "briefcase",
        keywords: ["roteamento", "regra", "espaco", "workspace", "vincular", "domain", "route"],
        run: () => actions.routeCurrentDomainToCurrentSpace?.(),
      },
      {
        id: "action-open-space-routing",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.spaceRouting.title"),
        subtitle: t("palette.action.spaceRouting.subtitle"),
        iconName: "settings",
        keywords: ["roteamento", "regras", "espacos", "workspace", "configurar", "gerenciar"],
        run: () => actions.openSpaceRoutingSettings?.(),
      },
      {
        id: "action-open-welcome-wizard",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.welcome.title"),
        subtitle: t("palette.action.welcome.subtitle"),
        iconName: "sparkles",
        keywords: ["welcome", "onboarding", "boas-vindas", "assistente", "setup", "wizard", "inicio"],
        run: () => actions.openWelcomeWizard?.(),
      },
      {
        id: "action-find-in-page",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.find.title"),
        subtitle: t("palette.action.find.subtitle"),
        iconName: "search",
        shortcut: ["Ctrl", "F"],
        keywords: ["find", "buscar", "localizar", "pagina", "pesquisar", "search"],
        run: () => actions.openFindInPage(),
      },
      {
        id: "action-bookmark-toggle",
        category: "actions",
        categoryLabel: quickActions,
        title: isTargetBookmarked
          ? t("palette.action.bookmarkRemove.title")
          : t("palette.action.bookmarkAdd.title"),
        subtitle:
          hasTarget && target.url ? target.url : t("palette.action.bookmark.subtitleFallback"),
        iconName: "star",
        keywords: ["favorito", "bookmark", "estrela", "salvar"],
        run: () => actions.toggleBookmark(),
      },
      {
        id: "action-site-info",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.siteInfo.title"),
        subtitle: t("palette.action.siteInfo.subtitle"),
        iconName: "lock",
        keywords: ["seguranca", "certificado", "permissoes", "camera", "cookies", "site"],
        run: () => actions.openSiteInfo(),
      },
      {
        id: "action-clear-site-data",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.clearSiteData.title"),
        subtitle: t("palette.action.clearSiteData.subtitle"),
        iconName: "trash",
        keywords: ["limpar", "cookies", "cache", "dados", "clear", "armazenamento"],
        run: () => actions.openSiteInfo(),
      },
      {
        id: "action-zoom-in",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.zoomIn.title"),
        subtitle: t("palette.action.zoomIn.subtitle"),
        iconName: "zoomIn",
        shortcut: ["Ctrl", "+"],
        keywords: ["zoom", "aumentar", "ampliar", "maior", "escala"],
        run: () => actions.zoomIn(),
      },
      {
        id: "action-zoom-out",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.zoomOut.title"),
        subtitle: t("palette.action.zoomOut.subtitle"),
        iconName: "zoomOut",
        shortcut: ["Ctrl", "-"],
        keywords: ["zoom", "diminuir", "reduzir", "menor", "escala"],
        run: () => actions.zoomOut(),
      },
      {
        id: "action-zoom-reset",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.zoomReset.title"),
        subtitle: t("palette.action.zoomReset.subtitle"),
        iconName: "search",
        shortcut: ["Ctrl", "0"],
        keywords: ["zoom", "redefinir", "reset", "100%", "padrao"],
        run: () => actions.resetZoom(),
      },
      {
        id: "action-reload",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.reload.title"),
        subtitle: t("palette.action.reload.subtitle"),
        iconName: "reload",
        shortcut: ["F5"],
        keywords: ["reload", "recarregar", "atualizar", "refresh", "f5"],
        run: () => actions.reload(),
      },
      {
        id: "action-nav-back",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.back.title"),
        subtitle: t("palette.action.back.subtitle"),
        iconName: "back",
        shortcut: ["Alt", "←"],
        keywords: ["voltar", "back", "anterior"],
        run: () => actions.navBack(),
      },
      {
        id: "action-nav-forward",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.forward.title"),
        subtitle: t("palette.action.forward.subtitle"),
        iconName: "forward",
        shortcut: ["Alt", "→"],
        keywords: ["avancar", "forward", "proxima"],
        run: () => actions.navForward(),
      },
      {
        id: "action-next-workspace",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.nextWorkspace.title"),
        subtitle: t("palette.action.nextWorkspace.subtitle"),
        iconName: "leaf",
        shortcut: ["Ctrl", "Alt", "→"],
        keywords: ["workspace", "espaco", "trabalho", "proximo"],
        run: () => actions.cycleWorkspace(1),
      },
      {
        id: "action-prev-workspace",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.prevWorkspace.title"),
        subtitle: t("palette.action.prevWorkspace.subtitle"),
        iconName: "leaf",
        shortcut: ["Ctrl", "Alt", "←"],
        keywords: ["workspace", "espaco", "trabalho", "anterior"],
        run: () => actions.cycleWorkspace(-1),
      },
      {
        id: "action-new-workspace",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.newWorkspace.title"),
        subtitle: t("palette.action.newWorkspace.subtitle"),
        iconName: "plus",
        keywords: ["workspace", "novo", "espaco", "criar"],
        run: () => actions.newWorkspace(),
      },
    );

    const workspaces = getWorkspaces();
    for (const ws of workspaces) {
      list.push({
        id: `action-ws-${ws.id}`,
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.switchWorkspace.title", { name: ws.name }),
        subtitle: t("palette.action.switchWorkspace.subtitle", { name: ws.name }),
        iconName: (ws.icon as IconName) || "leaf",
        keywords: ["workspace", "espaco", "trabalho", ws.name.toLowerCase()],
        run: () => actions.switchWorkspace(ws.id),
      });
    }

    list.push(
      {
        id: "action-history",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.history.title"),
        subtitle: t("palette.action.history.subtitle"),
        iconName: "history",
        shortcut: ["Ctrl", "H"],
        keywords: ["historico", "history", "visitas", "paginas"],
        run: () => actions.openHistory(),
      },
      {
        id: "action-downloads",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.downloads.title"),
        subtitle: t("palette.action.downloads.subtitle"),
        iconName: "download",
        shortcut: ["Ctrl", "J"],
        keywords: ["downloads", "baixar", "arquivos", "gestor", "pasta"],
        run: () => actions.openDownloads(),
      },
      {
        id: "action-clear-history",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.clearHistory.title"),
        subtitle: t("palette.action.clearHistory.subtitle"),
        iconName: "trash",
        keywords: ["limpar", "historico", "apagar", "excluir", "clear"],
        run: () => actions.clearHistory(),
      },
      {
        id: "action-settings",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.settings.title"),
        subtitle: t("palette.action.settings.subtitle"),
        iconName: "settings",
        shortcut: ["Ctrl", ","],
        keywords: ["configuracoes", "settings", "tema", "opcoes", "preferencias"],
        run: () => actions.openSettings(),
      },
      {
        id: "action-shortcuts",
        category: "actions",
        categoryLabel: quickActions,
        title: t("palette.action.shortcuts.title"),
        subtitle: t("palette.action.shortcuts.subtitle"),
        iconName: "command",
        shortcut: ["Ctrl", "/"],
        keywords: ["atalhos", "shortcuts", "teclado", "ajuda", "comandos"],
        run: () => actions.openShortcuts(),
      },
    );

    return list;
  }

  function getOpenTabItems(): PaletteItem[] {
    const tabs = getTabs();
    const activeTab = actions.getTargetTab() ?? getActiveTab();
    const workspaces = getWorkspaces();
    const wsMap = new Map(workspaces.map((w) => [w.id, w.name]));

    return tabs.map((tab) => {
      const isActive = tab.id === activeTab?.id;
      const wsName = tab.workspaceId
        ? wsMap.get(tab.workspaceId) ?? t("palette.workspaceFallback")
        : t("palette.personalWorkspace");

      let badge = wsName;
      let badgeType: PaletteItem["badgeType"] = "workspace";
      if (isActive) {
        badge = t("palette.badge.active");
        badgeType = "active";
      } else if (tab.isPinned) {
        badge = t("palette.badge.pinned");
        badgeType = "pinned";
      }

      return {
        id: `tab-${tab.id}`,
        category: "tabs",
        categoryLabel: t("palette.category.tabs"),
        title: tab.title || t("palette.untitledTab"),
        subtitle: tab.url || t("palette.homepage"),
        iconName: tab.isPinned ? "star" : "globe",
        badge,
        badgeType,
        keywords: ["aba", "tab", wsName, hostnameOf(tab.url)],
        run: () => {
          actions.selectTab(tab.id, tab.workspaceId);
        },
      };
    });
  }

  function getBookmarkItems(): PaletteItem[] {
    const bookmarks = getBookmarks();
    return bookmarks.map((b) => ({
      id: `bookmark-${b.id}`,
      category: "bookmarks",
      categoryLabel: t("palette.category.bookmarks"),
      title: b.title || hostnameOf(b.url),
      subtitle: b.url,
      iconName: "star",
      keywords: ["favorito", "bookmark", hostnameOf(b.url)],
      run: () => {
        actions.navigateActiveTab(b.url);
      },
    }));
  }

  function getHistoryItems(query: string): PaletteItem[] {
    const entries = query.trim() ? searchHistory(query, 8) : getRecentHistory(6);
    return entries.map((h) => ({
      id: `history-${h.id}`,
      category: "history",
      categoryLabel: t("palette.category.history"),
      title: h.title || hostnameOf(h.url),
      subtitle: h.url,
      iconName: "history",
      keywords: ["historico", "history", hostnameOf(h.url)],
      run: () => {
        actions.navigateActiveTab(h.url);
      },
    }));
  }

  function getWebItems(query: string): PaletteItem[] {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const resolved = resolveOmnibarInput(trimmed, searchUrl());
    if (!resolved) return [];

    const isDirectUrl = isWebUrl(trimmed) || /^[^\s/@]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(trimmed);
    const settings = getSettings();
    const engineName =
      SEARCH_ENGINES.find((e) => e.value === settings.searchEngine)?.label ?? "Google";

    const items: PaletteItem[] = [];

    const directSearchUrl = searchUrl() + encodeURIComponent(trimmed);

    if (isDirectUrl) {
      items.push({
        id: "web-direct-url",
        category: "web",
        categoryLabel: t("palette.category.web"),
        title: t("palette.openUrl", { query: trimmed }),
        subtitle: resolved,
        iconName: "globe",
        keywords: ["ir", "url", "abrir", "navegar"],
        run: () => {
          actions.navigateActiveTab(resolved);
        },
      });
    }

    items.push({
      id: "web-search-query",
      category: "web",
      categoryLabel: t("palette.category.web"),
      title: t("palette.searchIn", { query: trimmed, engine: engineName }),
      subtitle: t("palette.searchDefaultEngine"),
      iconName: "search",
      keywords: ["pesquisa", "buscar", "search", "web", "google"],
      run: () => {
        actions.navigateActiveTab(directSearchUrl);
      },
    });

    return items;
  }

  function filterItems(query: string): PaletteItem[] {
    const trimmed = query.trim();
    const terms = trimmed ? normalize(trimmed).split(/\s+/).filter(Boolean) : [];

    if (!trimmed) {
      // Default view when input is empty:
      // Show top Actions, all open tabs across workspaces (up to 8), top bookmarks, and recent history
      const tabs = getOpenTabItems().slice(0, 8);
      const actionsList = getBuiltinActions().slice(0, 7);
      const bookmarks = getBookmarkItems().slice(0, 4);
      const history = getHistoryItems("").slice(0, 4);

      return [...actionsList, ...tabs, ...bookmarks, ...history];
    }

    // When query is typed:
    const allActions = getBuiltinActions();
    const allTabs = getOpenTabItems();
    const allBookmarks = getBookmarkItems();
    const history = getHistoryItems(trimmed);
    const webItems = getWebItems(trimmed);

    function matchAndScore(items: PaletteItem[]): PaletteItem[] {
      const matched: PaletteItem[] = [];
      for (const item of items) {
        const normTitle = normalize(item.title);
        const normSub = normalize(item.subtitle ?? "");
        const normKeys = (item.keywords ?? []).map(normalize).join(" ");
        const haystack = `${normTitle} ${normSub} ${normKeys}`;

        const allTermsMatch = terms.every((term) => haystack.includes(term));
        if (allTermsMatch) {
          const score = calculateScore(item, trimmed, terms);
          matched.push({ ...item, score });
        }
      }
      return matched.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    }

    const matchedActions = matchAndScore(allActions).slice(0, 6);
    const matchedTabs = matchAndScore(allTabs).slice(0, 6);
    const matchedBookmarks = matchAndScore(allBookmarks).slice(0, 5);
    const matchedHistory = matchAndScore(history).slice(0, 5);

    return [
      ...matchedActions,
      ...matchedTabs,
      ...matchedBookmarks,
      ...matchedHistory,
      ...webItems,
    ];
  }

  function renderResults() {
    resultsList.replaceChildren();
    const query = input.value;
    flatItems = filterItems(query);
    clearBtn.style.display = query.trim().length > 0 ? "flex" : "none";

    if (flatItems.length === 0) {
      countBadge.textContent = t("palette.itemsZero");
      const emptyNode = el("div", { class: "command-palette-empty" }, [
        el("p", { class: "command-palette-empty-title" }, [
          t("palette.emptyTitle", { query }),
        ]),
        el("p", { class: "command-palette-empty-desc" }, [t("palette.emptyDesc")]),
      ]);
      resultsList.append(emptyNode);
      selectedIndex = -1;
      input.removeAttribute("aria-activedescendant");
      return;
    }

    countBadge.textContent =
      flatItems.length === 1
        ? t("palette.resultOne")
        : t("palette.resultMany", { count: flatItems.length });

    if (selectedIndex < 0 || selectedIndex >= flatItems.length) {
      selectedIndex = 0;
    }

    // Group items by category
    const categoryMap = new Map<PaletteCategory, { label: string; items: PaletteItem[] }>();
    for (const item of flatItems) {
      let group = categoryMap.get(item.category);
      if (!group) {
        group = { label: item.categoryLabel, items: [] };
        categoryMap.set(item.category, group);
      }
      group.items.push(item);
    }

    // Reconstruct flatItems in exact category rendering sequence
    const orderedItems: PaletteItem[] = [];
    for (const [, group] of categoryMap) {
      for (const item of group.items) {
        orderedItems.push(item);
      }
    }
    flatItems = orderedItems;

    let globalIndex = 0;
    for (const [, group] of categoryMap) {
      const categorySection = el("div", { class: "command-palette-category" }, [
        el("div", { class: "command-palette-category-title" }, [group.label]),
      ]);

      const itemsList = el("div", { class: "command-palette-category-list" });

      for (const item of group.items) {
        const itemIndex = globalIndex++;
        const isSelected = itemIndex === selectedIndex;
        const itemId = `command-palette-item-${itemIndex}`;

        const iconNode = el("span", { class: "command-palette-item-icon" }, [icon(item.iconName)]);

        const titleNode = el("span", { class: "command-palette-item-title" }, [item.title]);
        const textNodes: (Node | string)[] = [titleNode];

        if (item.subtitle) {
          textNodes.push(
            el("span", { class: "command-palette-item-subtitle" }, [item.subtitle]),
          );
        }

        const contentNode = el("div", { class: "command-palette-item-content" }, textNodes);

        const metaNodes: HTMLElement[] = [];
        if (item.badge) {
          metaNodes.push(
            el(
              "span",
              {
                class: `command-palette-badge command-palette-badge--${item.badgeType ?? "default"}`,
              },
              [item.badge],
            ),
          );
        }

        if (item.shortcut && item.shortcut.length > 0) {
          const keys = item.shortcut.map((k) =>
            el("kbd", { class: "command-palette-kbd" }, [k]),
          );
          metaNodes.push(el("div", { class: "command-palette-item-shortcut" }, keys));
        }

        const metaContainer = el("div", { class: "command-palette-item-meta" }, metaNodes);

        const itemNode = el(
          "div",
          {
            id: itemId,
            class: `command-palette-item${isSelected ? " command-palette-item--selected" : ""}`,
            role: "option",
            "aria-selected": String(isSelected),
            "data-index": String(itemIndex),
          },
          [iconNode, contentNode, metaContainer],
        );

        if (isSelected) {
          input.setAttribute("aria-activedescendant", itemId);
        }

        itemNode.addEventListener("pointerenter", () => {
          setSelectedIndex(itemIndex, false);
        });

        itemNode.addEventListener("click", () => {
          executeItem(item);
        });

        itemsList.append(itemNode);
      }

      categorySection.append(itemsList);
      resultsList.append(categorySection);
    }
  }

  function setSelectedIndex(index: number, scrollIntoView = true) {
    if (flatItems.length === 0) {
      selectedIndex = -1;
      return;
    }
    const clamped = Math.max(0, Math.min(index, flatItems.length - 1));
    if (clamped === selectedIndex) return;

    const prevNode = resultsList.querySelector<HTMLElement>(
      `#command-palette-item-${selectedIndex}`,
    );
    if (prevNode) {
      prevNode.classList.remove("command-palette-item--selected");
      prevNode.setAttribute("aria-selected", "false");
    }

    selectedIndex = clamped;
    const nextId = `command-palette-item-${selectedIndex}`;
    const nextNode = resultsList.querySelector<HTMLElement>(`#${nextId}`);
    if (nextNode) {
      nextNode.classList.add("command-palette-item--selected");
      nextNode.setAttribute("aria-selected", "true");
      input.setAttribute("aria-activedescendant", nextId);
      if (scrollIntoView) {
        nextNode.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }

  function executeItem(item: PaletteItem) {
    palette.close();
    try {
      item.run();
    } catch (err) {
      console.error("[command-palette] failed to execute item:", err);
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!isOpen) return;

    if (event.key === "Escape") {
      event.preventDefault();
      palette.close();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (flatItems.length > 0) {
        const next = (selectedIndex + 1) % flatItems.length;
        setSelectedIndex(next, true);
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (flatItems.length > 0) {
        const prev = (selectedIndex - 1 + flatItems.length) % flatItems.length;
        setSelectedIndex(prev, true);
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (flatItems.length > 0 && selectedIndex >= 0 && selectedIndex < flatItems.length) {
        executeItem(flatItems[selectedIndex]);
      } else if (input.value.trim().length > 0) {
        const trimmed = input.value.trim();
        const isDirect = isWebUrl(trimmed) || /^[^\s/@]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(trimmed);
        const urlToNav = isDirect
          ? resolveOmnibarInput(trimmed, searchUrl())
          : searchUrl() + encodeURIComponent(trimmed);
        if (urlToNav) {
          palette.close();
          actions.navigateActiveTab(urlToNav);
        }
      }
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      if (event.shiftKey) {
        if (flatItems.length > 0) {
          const prev = (selectedIndex - 1 + flatItems.length) % flatItems.length;
          setSelectedIndex(prev, true);
        }
      } else {
        if (flatItems.length > 0) {
          const next = (selectedIndex + 1) % flatItems.length;
          setSelectedIndex(next, true);
        }
      }
    }
  }

  input.addEventListener("input", () => {
    selectedIndex = 0;
    renderResults();
  });

  clearBtn.addEventListener("click", () => {
    input.value = "";
    input.focus();
    selectedIndex = 0;
    renderResults();
  });

  overlay.addEventListener("pointerdown", () => {
    palette.close();
  });

  subscribeLocale(() => {
    input.placeholder = t("palette.placeholder");
    clearBtn.setAttribute("aria-label", t("palette.clearSearch"));
    clearBtn.setAttribute("title", t("palette.clear"));
    resultsList.setAttribute("aria-label", t("palette.results"));
    element.setAttribute("aria-label", t("palette.title"));
    hintNavigateLabel.textContent = " " + t("palette.hintNavigate");
    hintExecuteLabel.textContent = " " + t("palette.hintExecute");
    hintCloseLabel.textContent = " " + t("palette.hintClose");
    if (isOpen) renderResults();
  });

  const palette: CommandPaletteController = {
    overlay,
    element,
    isOpen: () => isOpen,
    open() {
      if (isOpen) return;
      isOpen = true;
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

      overlay.style.display = "";
      element.style.display = "";

      // Force layout before transition
      void element.offsetHeight;

      overlay.classList.add("command-palette-overlay--visible");
      element.classList.add("command-palette--open");

      input.value = "";
      selectedIndex = 0;
      renderResults();

      window.addEventListener("keydown", onKeyDown, true);
      onVisibilityChange();

      // Ergonomic focus
      requestAnimationFrame(() => {
        input.focus();
        input.select();
      });
    },
    close() {
      if (!isOpen) return;
      isOpen = false;

      element.classList.remove("command-palette--open");
      overlay.classList.remove("command-palette-overlay--visible");

      window.removeEventListener("keydown", onKeyDown, true);

      setTimeout(() => {
        if (!isOpen) {
          element.style.display = "none";
          overlay.style.display = "none";
        }
      }, 180);

      onVisibilityChange();

      if (returnFocus && returnFocus.isConnected) {
        returnFocus.focus();
      }
      returnFocus = null;
    },
    toggle() {
      if (isOpen) palette.close();
      else palette.open();
    },
    destroy() {
      window.removeEventListener("keydown", onKeyDown, true);
      overlay.remove();
      element.remove();
    },
  };

  return palette;
}
