export type Locale = "pt-BR" | "en-US";

function detectInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem("moss:locale");
    if (stored === "pt-BR" || stored === "en-US") return stored;
  } catch (_) {}
  if (
    typeof navigator !== "undefined" &&
    navigator.language &&
    navigator.language.toLowerCase().startsWith("pt")
  ) {
    return "pt-BR";
  }
  return "en-US";
}

let currentLocale: Locale = detectInitialLocale();

type LocaleListener = (locale: Locale) => void;

const listeners = new Set<LocaleListener>();

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  if (currentLocale === locale) return;
  currentLocale = locale;
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }
  try {
    localStorage.setItem("moss:locale", locale);
  } catch (_) {}
  for (const fn of listeners) {
    try {
      fn(locale);
    } catch (_) {}
  }
}

export function subscribeLocale(fn: LocaleListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function registerMessages(
  extra: Record<Locale, Record<string, string>>,
): void {
  Object.assign(messages["pt-BR"], extra["pt-BR"]);
  Object.assign(messages["en-US"], extra["en-US"]);
}

const messages: Record<Locale, Record<string, string>> = {
  "pt-BR": {
    "settings.title": "Configurações",
    "settings.sections": "Seções",
    "settings.close": "Fechar",
    "settings.general": "Geral",
    "settings.appearance": "Aparência",
    "settings.spaces": "Roteamento de Espaços",
    "settings.data": "Dados",
    "settings.navigation": "Navegação",
    "settings.searchEngine": "Mecanismo de busca",
    "settings.homepage": "Página inicial",
    "settings.homepageHint": "Aberta em novas abas. Deixe vazio para uma aba em branco.",
    "settings.homepageError": "Endereço inválido. Use um endereço http ou https.",
    "settings.homepagePlaceholder": "https://exemplo.com",
    "settings.themeSection": "Tema",
    "settings.theme": "Tema da interface",
    "settings.language": "Idioma",
    "settings.langPt": "Português (Brasil)",
    "settings.langEn": "English (US)",
    "settings.routingBehavior": "Comportamento de Roteamento",
    "settings.enableRouting": "Ativar Roteamento Automático de Espaços",
    "settings.routingMode": "Modo de roteamento",
    "settings.routingAuto": "Automático (Migra e alterna imediatamente)",
    "settings.routingPrompt": "Perguntar (Exibe toast de confirmação)",
    "settings.domainRules": "Regras por Domínio",
    "settings.routingDescription":
      "Ao navegar para domínios configurados, o moss direciona a aba para o Workspace correspondente.",
    "settings.noRules": "Nenhuma regra de roteamento configurada.",
    "settings.removeRule": "Remover regra",
    "settings.removeRuleFor": "Remover regra para {domain}",
    "settings.addRule": "Adicionar Regra",
    "settings.domainPlaceholder": "ex: figma.com",
    "settings.ruleAdded": "Regra adicionada: {domain} para o Espaço {workspace}",
    "settings.bookmarks": "Favoritos",
    "settings.bookmarksDesc":
      "Exporte ou importe seus favoritos no padrão Netscape HTML (compatível com Chrome, Firefox, Safari e Edge) ou JSON.",
    "settings.exportHtml": "Exportar HTML",
    "settings.importBookmarks": "Importar Favoritos",
    "settings.noBookmarksExport": "Nenhum favorito para exportar.",
    "settings.exportedBookmarks": "Exportados {count} favoritos para: {path}",
    "settings.bookmarksSaveFailed": "Falha ao salvar arquivo de favoritos.",
    "settings.noBookmarksJson": "Nenhum favorito encontrado no arquivo JSON.",
    "settings.noValidBookmarksHtml": "Nenhum favorito válido encontrado no arquivo HTML.",
    "settings.unsupportedFile": "Formato de arquivo não suportado. Use .html ou .json.",
    "settings.bookmarksImported": "{count} novos favoritos importados com sucesso!",
    "settings.fileReadFailed": "Falha ao ler o arquivo selecionado.",
    "settings.backup": "Backup & Restauração",
    "settings.backupDesc":
      "Gere uma cópia completa de segurança contendo todos os seus favoritos e histórico de navegação em formato JSON.",
    "settings.exportBackup": "Exportar Backup (JSON)",
    "settings.restoreBackup": "Restaurar Backup (JSON)",
    "settings.backupExported": "Backup exportado ({bookmarks} favoritos, {history} históricos) para: {path}",
    "settings.backupSaveFailed": "Falha ao salvar arquivo de backup.",
    "settings.backupInvalid": "Arquivo de backup inválido ou com formato incompatível.",
    "settings.backupRestored":
      "Backup restaurado: {bookmarks} novos favoritos e {history} novos históricos adicionados.",
    "settings.backupProcessError": "Erro ao processar o arquivo de backup.",
    "settings.favorites": "Favoritos",
    "settings.history": "Histórico",
    "settings.privacyShield": "Escudo de Privacidade",
    "settings.workspaces": "Espaços",
    "settings.routing": "Roteamento",
    "settings.backupSection": "Backup",
    "settings.clearData": "Limpeza de Dados",
    "settings.cleanup": "Limpeza",
    "settings.dataTransfer": "Importar e Exportar",
    "settings.zoom": "Zoom",
    "settings.readerMode": "Modo leitura",
    "settings.splitView": "Split view",
    "settings.security": "Segurança",
    "omnibar.searchPlaceholder": "Pesquisar ou digitar um endereço",
    "omnibar.reload": "Recarregar",
    "omnibar.readerMode": "Modo leitura",
    "omnibar.splitView": "Split view",
    "omnibar.zoomIn": "Aumentar zoom",
    "omnibar.zoomOut": "Diminuir zoom",
    "omnibar.zoomReset": "Redefinir zoom",
    "omnibar.security": "Segurança e permissões do site",
    "omnibar.back": "Voltar",
    "omnibar.forward": "Avançar",
    "omnibar.bookmark": "Favoritar página",
    "omnibar.translate": "Traduzir página",
    "sidebar.newTab": "Nova aba",
    "sidebar.closeTab": "Fechar aba",
    "sidebar.workspaces": "Espaços",
    "sidebar.downloads": "Downloads",
    "sidebar.history": "Histórico",
    "sidebar.settings": "Configurações",
    "sidebar.shortcuts": "Atalhos",
    "sidebar.tabs": "Abas",
    "sidebar.pinned": "Abas fixadas",
    "sidebar.media": "Reprodutor de mídia",
    "sidebar.collapse": "Recolher barra lateral",
    "sidebar.expand": "Expandir barra lateral",
    "panels.close": "Fechar",
    "panels.search": "Pesquisar",
    "panels.clear": "Limpar",
    "panels.empty": "Nada para mostrar",
    "common.cancel": "Cancelar",
    "common.save": "Salvar",
    "common.add": "Adicionar",
    "common.remove": "Remover",
    "common.export": "Exportar",
    "common.import": "Importar",
  },
  "en-US": {
    "settings.title": "Settings",
    "settings.sections": "Sections",
    "settings.close": "Close",
    "settings.general": "General",
    "settings.appearance": "Appearance",
    "settings.spaces": "Workspace Routing",
    "settings.data": "Data",
    "settings.navigation": "Navigation",
    "settings.searchEngine": "Search engine",
    "settings.homepage": "Homepage",
    "settings.homepageHint": "Opens in new tabs. Leave empty for a blank tab.",
    "settings.homepageError": "Invalid address. Use an http or https address.",
    "settings.homepagePlaceholder": "https://example.com",
    "settings.themeSection": "Theme",
    "settings.theme": "Interface theme",
    "settings.language": "Language",
    "settings.langPt": "Portuguese (Brazil)",
    "settings.langEn": "English (US)",
    "settings.routingBehavior": "Routing Behavior",
    "settings.enableRouting": "Enable automatic workspace routing",
    "settings.routingMode": "Routing mode",
    "settings.routingAuto": "Automatic (migrates and switches immediately)",
    "settings.routingPrompt": "Ask (shows a confirmation toast)",
    "settings.domainRules": "Domain Rules",
    "settings.routingDescription":
      "When you visit a configured domain, moss moves the tab to the matching workspace.",
    "settings.noRules": "No routing rules configured.",
    "settings.removeRule": "Remove rule",
    "settings.removeRuleFor": "Remove rule for {domain}",
    "settings.addRule": "Add Rule",
    "settings.domainPlaceholder": "e.g. figma.com",
    "settings.ruleAdded": "Rule added: {domain} to workspace {workspace}",
    "settings.bookmarks": "Bookmarks",
    "settings.bookmarksDesc":
      "Export or import bookmarks in Netscape HTML (compatible with Chrome, Firefox, Safari, and Edge) or JSON.",
    "settings.exportHtml": "Export HTML",
    "settings.importBookmarks": "Import Bookmarks",
    "settings.noBookmarksExport": "No bookmarks to export.",
    "settings.exportedBookmarks": "Exported {count} bookmarks to: {path}",
    "settings.bookmarksSaveFailed": "Failed to save the bookmarks file.",
    "settings.noBookmarksJson": "No bookmarks found in the JSON file.",
    "settings.noValidBookmarksHtml": "No valid bookmarks found in the HTML file.",
    "settings.unsupportedFile": "Unsupported file format. Use .html or .json.",
    "settings.bookmarksImported": "{count} new bookmarks imported successfully.",
    "settings.fileReadFailed": "Failed to read the selected file.",
    "settings.backup": "Backup and Restore",
    "settings.backupDesc":
      "Create a complete backup of your bookmarks and browsing history in JSON format.",
    "settings.exportBackup": "Export Backup (JSON)",
    "settings.restoreBackup": "Restore Backup (JSON)",
    "settings.backupExported":
      "Backup exported ({bookmarks} bookmarks, {history} history entries) to: {path}",
    "settings.backupSaveFailed": "Failed to save the backup file.",
    "settings.backupInvalid": "Invalid backup file or incompatible format.",
    "settings.backupRestored":
      "Backup restored: {bookmarks} new bookmarks and {history} new history entries added.",
    "settings.backupProcessError": "Failed to process the backup file.",
    "settings.favorites": "Bookmarks",
    "settings.history": "History",
    "settings.privacyShield": "Privacy Shield",
    "settings.workspaces": "Workspaces",
    "settings.routing": "Routing",
    "settings.backupSection": "Backup",
    "settings.clearData": "Clear Data",
    "settings.cleanup": "Cleanup",
    "settings.dataTransfer": "Import and Export",
    "settings.zoom": "Zoom",
    "settings.readerMode": "Reader mode",
    "settings.splitView": "Split view",
    "settings.security": "Security",
    "omnibar.searchPlaceholder": "Search or enter an address",
    "omnibar.reload": "Reload",
    "omnibar.readerMode": "Reader mode",
    "omnibar.splitView": "Split view",
    "omnibar.zoomIn": "Zoom in",
    "omnibar.zoomOut": "Zoom out",
    "omnibar.zoomReset": "Reset zoom",
    "omnibar.security": "Site security and permissions",
    "omnibar.back": "Back",
    "omnibar.forward": "Forward",
    "omnibar.bookmark": "Bookmark this page",
    "omnibar.translate": "Translate page",
    "sidebar.newTab": "New tab",
    "sidebar.closeTab": "Close tab",
    "sidebar.workspaces": "Workspaces",
    "sidebar.downloads": "Downloads",
    "sidebar.history": "History",
    "sidebar.settings": "Settings",
    "sidebar.shortcuts": "Shortcuts",
    "sidebar.tabs": "Tabs",
    "sidebar.pinned": "Pinned tabs",
    "sidebar.media": "Media player",
    "sidebar.collapse": "Collapse sidebar",
    "sidebar.expand": "Expand sidebar",
    "panels.close": "Close",
    "panels.search": "Search",
    "panels.clear": "Clear",
    "panels.empty": "Nothing to show",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "common.add": "Add",
    "common.remove": "Remove",
    "common.export": "Export",
    "common.import": "Import",
  },
};

const isDevEnv = Boolean(
  (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV,
);

export function t(
  key: string,
  vars?: Record<string, string | number>,
): string {
  const localized = messages[currentLocale][key];
  if (localized === undefined && isDevEnv) {
    console.error(
      `[moss:i18n] Missing translation key "${key}" for locale "${currentLocale}"`,
    );
  }
  let text = localized ?? messages["pt-BR"][key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}
