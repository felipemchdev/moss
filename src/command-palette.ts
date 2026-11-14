import { getBookmarks, isBookmarked } from "./bookmarks";
import { el, hostnameOf } from "./dom";
import { getRecentHistory, searchHistory } from "./history";
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

  // Exact match
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
    placeholder: "Digite um comando, aba, favorito ou pesquise na web...",
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
      "aria-label": "Limpar busca",
      title: "Limpar",
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
    "aria-label": "Resultados de comandos",
  });

  const countBadge = el("span", { class: "command-palette-count" }, ["0 itens"]);

  const footer = el("div", { class: "command-palette-footer" }, [
    el("div", { class: "command-palette-footer-hints" }, [
      el("span", { class: "command-palette-footer-hint" }, [
        el("kbd", { class: "command-palette-kbd" }, ["↑"]),
        el("kbd", { class: "command-palette-kbd" }, ["↓"]),
        " Navegar",
      ]),
      el("span", { class: "command-palette-footer-hint" }, [
        el("kbd", { class: "command-palette-kbd" }, ["↵"]),
        " Executar",
      ]),
      el("span", { class: "command-palette-footer-hint" }, [
        el("kbd", { class: "command-palette-kbd" }, ["Esc"]),
        " Fechar",
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
      "aria-label": "Paleta de Comandos",
      style: "display: none;",
    },
    [header, resultsList, footer],
  );

  function getBuiltinActions(): PaletteItem[] {
    const target = actions.getTargetTab();
    const hasTarget = !!target;
    const splitActive = actions.isSplitActive();
    const isTargetBookmarked = hasTarget && target.url ? isBookmarked(target.url) : false;

    const list: PaletteItem[] = [
      {
        id: "action-new-tab",
        category: "actions",
        categoryLabel: "Ações Rápidas",
        title: "Nova Aba",
        subtitle: "Abrir uma nova aba de navegação",
        iconName: "plus",
        shortcut: ["Ctrl", "T"],
        keywords: ["nova", "aba", "tab", "criar", "open", "new"],
        run: () => actions.openTab(),
      },
      {
        id: "action-close-tab",
        category: "actions",
        categoryLabel: "Ações Rápidas",
        title: "Fechar Aba Atual",
        subtitle: hasTarget ? target.title : "Fechar a aba ativa",
        iconName: "close",
        shortcut: ["Ctrl", "W"],
        keywords: ["fechar", "close", "remover", "sair", "tab"],
        run: () => actions.closeCurrentTab(),
      },
      {
        id: "action-reopen-closed-tab",
        category: "actions",
        categoryLabel: "Ações Rápidas",
        title: "Reabrir Aba Fechada",
        subtitle: "Restaurar a última aba encerrada",
        iconName: "reload",
        shortcut: ["Ctrl", "Shift", "T"],
        keywords: ["reabrir", "restaurar", "aba", "fechada", "recuperar", "undo", "closed"],
        run: () => actions.reopenClosedTab(),
      },
      {
        id: "action-split-view",
        category: "actions",
        categoryLabel: "Ações Rápidas",
        title: splitActive ? "Desativar Tela Dividida" : "Dividir Tela (Split View)",
        subtitle: splitActive
          ? "Fechar divisão e retornar à aba primária"
          : "Navegar lado a lado em duas abas simultâneas",
        iconName: "split",
        shortcut: ["Ctrl", "\\"],
        keywords: ["split", "dividir", "divisao", "lado", "telas", "duas"],
        run: () => actions.toggleSplitView(),
      },
      {
        id: "action-toggle-sidebar",
        category: "actions",
        categoryLabel: "Ações Rápidas",
        title: actions.isSidebarCollapsed()
          ? "Expandir Barra Lateral"
          : "Recolher Barra Lateral (Modo Compacto)",
        subtitle: actions.isSidebarCollapsed()
          ? "Exibir barra lateral completa com nomes e abas"
          : "Modo compacto com dock de ícones de 56px",
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
          categoryLabel: "Ações Rápidas",
          title: "Inverter Lados da Tela Dividida",
          subtitle: "Trocar painel esquerdo com direito",
          iconName: "swap",
          keywords: ["swap", "inverter", "trocar", "lado", "split"],
          run: () => actions.swapPanes(),
        },
        {
          id: "action-close-split",
          category: "actions",
          categoryLabel: "Ações Rápidas",
          title: "Fechar Tela Dividida",
          subtitle: "Encerrar painel secundário",
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
        categoryLabel: "Ações Rápidas",
        title: "Alternar Modo Leitura",
        subtitle: "Leitura confortável sem distrações nem anúncios",
        iconName: "book",
        shortcut: ["Ctrl", "Alt", "R"],
        keywords: ["reader", "leitura", "modo", "ler", "artigo", "limpo"],
        run: () => actions.toggleReaderMode(),
      },
      {
        id: "action-glance",
        category: "actions",
        categoryLabel: "Ações Rápidas",
        title: "Espiar URL (Zen Glance)",
        subtitle: "Visualizar link em janela sobreposta sem criar aba permanente",
        iconName: "eye",
        shortcut: ["Ctrl", "Shift", "G"],
        keywords: ["glance", "peek", "espiar", "previa", "preview", "link"],
        run: () => actions.openGlance(),
      },
      {
        id: "action-new-folder",
        category: "actions",
        categoryLabel: "Ações Rápidas",
        title: "Nova Pasta de Abas",
        subtitle: "Agrupar e organizar abas em pastas recolhíveis",
        iconName: "folderPlus",
        keywords: ["pasta", "folder", "grupo", "agrupar", "organizar"],
        run: () => actions.createTabFolder?.(),
      },
      {
        id: "action-hibernate-inactive",
        category: "actions",
        categoryLabel: "Ações Rápidas",
        title: "Hibernar Abas Inativas (Economizar Memória)",
        subtitle: "Descarregar webviews de abas em segundo plano para liberar RAM",
        iconName: "moon",
        keywords: ["hibernar", "dormir", "sleep", "memoria", "ram", "saver", "economizar"],
        run: () => actions.hibernateInactiveTabs?.(),
      },
      {
        id: "action-wake-all",
        category: "actions",
        categoryLabel: "Ações Rápidas",
        title: "Acordar Todas as Abas Hibernadas",
        subtitle: "Reativar webviews de todas as abas suspensas",
        iconName: "sun",
        keywords: ["acordar", "wake", "reativar", "restaurar", "abas"],
        run: () => actions.wakeAllTabs?.(),
      },
      {
        id: "action-route-current-domain",
        category: "actions",
        categoryLabel: "Ações Rápidas",
        title: "Roteamento: Vincular este site ao Espaço Atual",
        subtitle: "Sempre abrir o domínio atual no Workspace ativo",
        iconName: "briefcase",
        keywords: ["roteamento", "regra", "espaco", "workspace", "vincular", "domain", "route"],
        run: () => actions.routeCurrentDomainToCurrentSpace?.(),
      },
      {
        id: "action-open-space-routing",
        category: "actions",
        categoryLabel: "Ações Rápidas",
        title: "Roteamento: Gerenciar Regras de Espaços",
        subtitle: "Configurar mapeamentos de domínios para workspaces",
        iconName: "settings",
        keywords: ["roteamento", "regras", "espacos", "workspace", "configurar", "gerenciar"],
        run: () => actions.openSpaceRoutingSettings?.(),
      },
      {
        id: "action-find-in-page",
        category: "actions",
        categoryLabel: "Ações Rápidas",
        title: "Localizar na Página",
        subtitle: "Buscar palavras ou frases na aba ativa",
        iconName: "search",
        shortcut: ["Ctrl", "F"],
        keywords: ["find", "buscar", "localizar", "pagina", "pesquisar", "search"],
        run: () => actions.openFindInPage(),
      },
      {
        id: "action-bookmark-toggle",
        category: "actions",
        categoryLabel: "Ações Rápidas",
        title: isTargetBookmarked ? "Remover dos Favoritos" : "Adicionar aos Favoritos",
        subtitle: hasTarget && target.url ? target.url : "Favoritar URL da aba ativa",
        iconName: "star",
        keywords: ["favorito", "bookmark", "estrela", "salvar"],
        run: () => actions.toggleBookmark(),
      },
      {
        id: "action-site-info",
        category: "actions",
        categoryLabel: "Ações Rápidas",
        title: "Informações e Permissões do Site",
        subtitle: "Ver certificado HTTPS, rastreadores bloqueados e permissões",
        iconName: "lock",
        keywords: ["seguranca", "certificado", "permissoes", "camera", "cookies", "site"],
        run: () => actions.openSiteInfo(),
      },
      {
        id: "action-clear-site-data",
        category: "actions",
        categoryLabel: "Ações Rápidas",
        title: "Limpar Cookies e Dados do Site Ativo...",
        subtitle: "Abrir painel de segurança para confirmar limpeza de cookies e cache",
        iconName: "trash",
        keywords: ["limpar", "cookies", "cache", "dados", "clear", "armazenamento"],
        run: () => actions.openSiteInfo(),
      },
      {
        id: "action-zoom-in",
        category: "actions",
        categoryLabel: "Ações Rápidas",
        title: "Aumentar Zoom",
        subtitle: "Ampliar escala de visualização da página",
        iconName: "zoomIn",
        shortcut: ["Ctrl", "+"],
        keywords: ["zoom", "aumentar", "ampliar", "maior", "escala"],
        run: () => actions.zoomIn(),
      },
      {
        id: "action-zoom-out",
        category: "actions",
        categoryLabel: "Ações Rápidas",
        title: "Diminuir Zoom",
        subtitle: "Reduzir escala de visualização da página",
        iconName: "zoomOut",
        shortcut: ["Ctrl", "-"],
        keywords: ["zoom", "diminuir", "reduzir", "menor", "escala"],
        run: () => actions.zoomOut(),
      },
      {
        id: "action-zoom-reset",
        category: "actions",
        categoryLabel: "Ações Rápidas",
        title: "Redefinir Zoom (100%)",
        subtitle: "Restaurar escala padrão da página",
        iconName: "search",
        shortcut: ["Ctrl", "0"],
        keywords: ["zoom", "redefinir", "reset", "100%", "padrao"],
        run: () => actions.resetZoom(),
      },
      {
        id: "action-reload",
        category: "actions",
        categoryLabel: "Ações Rápidas",
        title: "Recarregar Página",
        subtitle: "Atualizar conteúdo da aba ativa",
        iconName: "reload",
        shortcut: ["F5"],
        keywords: ["reload", "recarregar", "atualizar", "refresh", "f5"],
        run: () => actions.reload(),
      },
      {
        id: "action-nav-back",
        category: "actions",
        categoryLabel: "Ações Rápidas",
        title: "Voltar Página",
        subtitle: "Ir para a página anterior no histórico da aba",
        iconName: "back",
        shortcut: ["Alt", "←"],
        keywords: ["voltar", "back", "anterior"],
        run: () => actions.navBack(),
      },
      {
        id: "action-nav-forward",
        category: "actions",
        categoryLabel: "Ações Rápidas",
        title: "Avançar Página",
        subtitle: "Ir para a próxima página no histórico da aba",
        iconName: "forward",
        shortcut: ["Alt", "→"],
        keywords: ["avancar", "forward", "proxima"],
        run: () => actions.navForward(),
      },
      {
        id: "action-next-workspace",
        category: "actions",
        categoryLabel: "Ações Rápidas",
        title: "Próximo Espaço de Trabalho",
        subtitle: "Alternar para o próximo workspace",
        iconName: "leaf",
        shortcut: ["Ctrl", "Alt", "→"],
        keywords: ["workspace", "espaco", "trabalho", "proximo"],
        run: () => actions.cycleWorkspace(1),
      },
      {
        id: "action-prev-workspace",
        category: "actions",
        categoryLabel: "Ações Rápidas",
        title: "Espaço de Trabalho Anterior",
        subtitle: "Alternar para o workspace anterior",
        iconName: "leaf",
        shortcut: ["Ctrl", "Alt", "←"],
        keywords: ["workspace", "espaco", "trabalho", "anterior"],
        run: () => actions.cycleWorkspace(-1),
      },
      {
        id: "action-new-workspace",
        category: "actions",
        categoryLabel: "Ações Rápidas",
        title: "Novo Espaço de Trabalho",
        subtitle: "Criar um novo espaço isolado de abas",
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
        categoryLabel: "Ações Rápidas",
        title: `Alternar para Espaço: ${ws.name}`,
        subtitle: `Mudar para o espaço de trabalho ${ws.name}`,
        iconName: (ws.icon as IconName) || "leaf",
        keywords: ["workspace", "espaco", "trabalho", ws.name.toLowerCase()],
        run: () => actions.switchWorkspace(ws.id),
      });
    }

    list.push(
      {
        id: "action-history",
        category: "actions",
        categoryLabel: "Ações Rápidas",
        title: "Abrir Histórico",
        subtitle: "Ver páginas visitadas anteriormente",
        iconName: "history",
        shortcut: ["Ctrl", "H"],
        keywords: ["historico", "history", "visitas", "paginas"],
        run: () => actions.openHistory(),
      },
      {
        id: "action-downloads",
        category: "actions",
        categoryLabel: "Ações Rápidas",
        title: "Abrir Downloads",
        subtitle: "Ver arquivos baixados e em andamento",
        iconName: "download",
        shortcut: ["Ctrl", "J"],
        keywords: ["downloads", "baixar", "arquivos", "gestor", "pasta"],
        run: () => actions.openDownloads(),
      },
      {
        id: "action-clear-history",
        category: "actions",
        categoryLabel: "Ações Rápidas",
        title: "Limpar Histórico de Navegação",
        subtitle: "Remover todos os registros de histórico",
        iconName: "trash",
        keywords: ["limpar", "historico", "apagar", "excluir", "clear"],
        run: () => actions.clearHistory(),
      },
      {
        id: "action-settings",
        category: "actions",
        categoryLabel: "Ações Rápidas",
        title: "Configurações",
        subtitle: "Tema, motor de busca, página inicial e dados",
        iconName: "settings",
        shortcut: ["Ctrl", ","],
        keywords: ["configuracoes", "settings", "tema", "opcoes", "preferencias"],
        run: () => actions.openSettings(),
      },
      {
        id: "action-shortcuts",
        category: "actions",
        categoryLabel: "Ações Rápidas",
        title: "Atalhos de Teclado",
        subtitle: "Ver todos os atalhos disponíveis no Moss",
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
      const wsName = tab.workspaceId ? wsMap.get(tab.workspaceId) ?? "Workspace" : "Pessoal";

      let badge = wsName;
      let badgeType: PaletteItem["badgeType"] = "workspace";
      if (isActive) {
        badge = "Ativa";
        badgeType = "active";
      } else if (tab.isPinned) {
        badge = "Fixada";
        badgeType = "pinned";
      }

      return {
        id: `tab-${tab.id}`,
        category: "tabs",
        categoryLabel: "Abas Abertas",
        title: tab.title || "Nova aba",
        subtitle: tab.url || "Página inicial",
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
      categoryLabel: "Favoritos",
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
      categoryLabel: "Histórico Recente",
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
        categoryLabel: "Pesquisa na Web",
        title: `Abrir "${trimmed}"`,
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
      categoryLabel: "Pesquisa na Web",
      title: `Pesquisar "${trimmed}" no ${engineName}`,
      subtitle: `Buscar no motor padrão`,
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

        const allTermsMatch = terms.every((t) => haystack.includes(t));
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
      countBadge.textContent = "0 resultados";
      const emptyNode = el("div", { class: "command-palette-empty" }, [
        el("p", { class: "command-palette-empty-title" }, [
          `Nenhum comando encontrado para "${query}".`,
        ]),
        el("p", { class: "command-palette-empty-desc" }, [
          "Tente pesquisar por abas, favoritos, ações do sistema ou pressione Enter para pesquisar na web.",
        ]),
      ]);
      resultsList.append(emptyNode);
      selectedIndex = -1;
      input.removeAttribute("aria-activedescendant");
      return;
    }

    countBadge.textContent = `${flatItems.length} ${flatItems.length === 1 ? "resultado" : "resultados"}`;

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
