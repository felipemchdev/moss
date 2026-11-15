import { getBookmarks, importBookmarks } from "./bookmarks";
import {
  exportBackupToJson,
  exportBookmarksToHtml,
  parseBackupFromJson,
  parseBookmarksFromHtml,
  readFileAsText,
  saveExportFile,
} from "./data-transfer";
import { el } from "./dom";
import { getHistory, importHistory } from "./history";
import { icon, type IconName } from "./icons";
import { createPanel, type Panel } from "./panel";
import {
  SEARCH_ENGINES,
  THEMES,
  getSettings,
  updateSettings,
  type SearchEngine,
  type Theme,
} from "./settings";
import { isWebUrl } from "./storage";
import {
  getRoutingRules,
  addRoutingRule,
  removeRoutingRule,
  isSpaceRoutingEnabled,
  setSpaceRoutingEnabled,
  getSpaceRoutingMode,
  setSpaceRoutingMode,
  subscribeRoutingRules,
} from "./space-routing";
import { getWorkspaces } from "./workspaces";

const HOMEPAGE_HINT = "Aberta em novas abas. Deixe vazio para uma aba em branco.";
const HOMEPAGE_ERROR = "Endereço inválido. Use um endereço http ou https.";

function normalizeHomepage(raw: string): string | null {
  const input = raw.trim();
  if (!input) return "";
  const hostPort = /^([^\s/:]+):(\d+)(\/.*)?$/.exec(input);
  const looksLikeHostPort =
    hostPort !== null &&
    (/^localhost$/i.test(hostPort[1]) ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(hostPort[1]) ||
      hostPort[1].includes("."));
  if (/^[a-z][a-z0-9+.-]*:/i.test(input) && !looksLikeHostPort && !isWebUrl(input)) return null;
  if (isWebUrl(input)) return new URL(input).href;
  const withScheme = `https://${input}`;
  return !/\s/.test(input) && isWebUrl(withScheme) ? new URL(withScheme).href : null;
}

function field(id: string, label: string, control: HTMLElement, hint?: HTMLElement): HTMLElement {
  control.id = id;
  return el("div", { class: "settings-field" }, [
    el("label", { class: "settings-field-label", for: id }, [label]),
    control,
    ...(hint ? [hint] : []),
  ]);
}

function section(title: string, children: HTMLElement[]): HTMLElement {
  return el("div", { class: "settings-section" }, [
    el("h3", { class: "settings-section-title" }, [title]),
    ...children,
  ]);
}

export function createSettingsPanel(onChange: () => void): { panel: Panel; overlay: HTMLElement } {
  const themeSelect = el(
    "select",
    { class: "settings-select" },
    THEMES.map(({ value, label }) => el("option", { value }, [label])),
  );
  const engineSelect = el(
    "select",
    { class: "settings-select" },
    SEARCH_ENGINES.map(({ value, label }) => el("option", { value }, [label])),
  );
  const homepageInput = el("input", {
    class: "settings-input",
    type: "text",
    placeholder: "https://exemplo.com",
    autocomplete: "off",
    spellcheck: "false",
    "aria-describedby": "settings-homepage-hint",
  });
  const homepageHint = el("p", {
    class: "settings-field-hint",
    id: "settings-homepage-hint",
    "aria-live": "polite",
  });

  // Data transfer elements
  const statusMsg = el("div", {
    class: "settings-status-msg",
    role: "status",
    "aria-live": "polite",
  });

  let statusTimer: number | undefined;
  function showStatus(text: string, type: "success" | "error") {
    if (statusTimer) window.clearTimeout(statusTimer);
    statusMsg.textContent = text;
    statusMsg.classList.remove("settings-status-msg--success", "settings-status-msg--error");
    statusMsg.classList.add(`settings-status-msg--${type}`);
    statusTimer = window.setTimeout(() => {
      statusMsg.textContent = "";
      statusMsg.classList.remove("settings-status-msg--success", "settings-status-msg--error");
    }, 6000);
  }

  const exportBookmarksBtn = el(
    "button",
    { class: "settings-action-btn settings-action-btn--primary", type: "button" },
    [icon("download"), el("span", {}, ["Exportar HTML"])],
  );
  exportBookmarksBtn.addEventListener("click", async () => {
    const list = getBookmarks();
    if (list.length === 0) {
      showStatus("Nenhum favorito para exportar.", "error");
      return;
    }
    const html = exportBookmarksToHtml(list);
    const date = new Date().toISOString().slice(0, 10);
    const filename = `moss-bookmarks-${date}.html`;
    try {
      const savedPath = await saveExportFile(html, filename);
      showStatus(`Exportados ${list.length} favoritos para: ${savedPath}`, "success");
    } catch {
      showStatus("Falha ao salvar arquivo de favoritos.", "error");
    }
  });

  const bookmarksFileInput = el("input", {
    type: "file",
    accept: ".html,.htm,.json",
    style: "display: none;",
  }) as HTMLInputElement;

  const importBookmarksBtn = el("button", { class: "settings-action-btn", type: "button" }, [
    icon("plus"),
    el("span", {}, ["Importar Favoritos"]),
  ]);
  importBookmarksBtn.addEventListener("click", () => {
    bookmarksFileInput.click();
  });

  bookmarksFileInput.addEventListener("change", async () => {
    const file = bookmarksFileInput.files?.[0];
    if (!file) return;
    try {
      const content = await readFileAsText(file);
      const lowerName = file.name.toLowerCase();
      let count = 0;
      if (lowerName.endsWith(".json")) {
        const parsed = parseBackupFromJson(content);
        if (!parsed || parsed.bookmarks.length === 0) {
          showStatus("Nenhum favorito encontrado no arquivo JSON.", "error");
          bookmarksFileInput.value = "";
          return;
        }
        count = importBookmarks(parsed.bookmarks);
      } else if (lowerName.endsWith(".html") || lowerName.endsWith(".htm")) {
        const parsed = parseBookmarksFromHtml(content);
        if (parsed.length === 0) {
          showStatus("Nenhum favorito válido encontrado no arquivo HTML.", "error");
          bookmarksFileInput.value = "";
          return;
        }
        count = importBookmarks(parsed);
      } else {
        showStatus("Formato de arquivo não suportado. Use .html ou .json.", "error");
        bookmarksFileInput.value = "";
        return;
      }
      showStatus(`${count} novos favoritos importados com sucesso!`, "success");
      onChange();
    } catch {
      showStatus("Falha ao ler o arquivo selecionado.", "error");
    }
    bookmarksFileInput.value = "";
  });

  const exportBackupBtn = el(
    "button",
    { class: "settings-action-btn settings-action-btn--primary", type: "button" },
    [icon("download"), el("span", {}, ["Exportar Backup (JSON)"])],
  );
  exportBackupBtn.addEventListener("click", async () => {
    const b = getBookmarks();
    const h = getHistory();
    const json = exportBackupToJson(b, h);
    const date = new Date().toISOString().slice(0, 10);
    const filename = `moss-backup-${date}.json`;
    try {
      const savedPath = await saveExportFile(json, filename);
      showStatus(
        `Backup exportado (${b.length} favoritos, ${h.length} históricos) para: ${savedPath}`,
        "success",
      );
    } catch {
      showStatus("Falha ao salvar arquivo de backup.", "error");
    }
  });

  const backupFileInput = el("input", {
    type: "file",
    accept: ".json",
    style: "display: none;",
  }) as HTMLInputElement;

  const restoreBackupBtn = el("button", { class: "settings-action-btn", type: "button" }, [
    icon("history"),
    el("span", {}, ["Restaurar Backup (JSON)"]),
  ]);
  restoreBackupBtn.addEventListener("click", () => {
    backupFileInput.click();
  });

  backupFileInput.addEventListener("change", async () => {
    const file = backupFileInput.files?.[0];
    if (!file) return;
    try {
      const content = await readFileAsText(file);
      const parsed = parseBackupFromJson(content);
      if (!parsed) {
        showStatus("Arquivo de backup inválido ou com formato incompatível.", "error");
        backupFileInput.value = "";
        return;
      }
      const bCount = importBookmarks(parsed.bookmarks);
      const hCount = importHistory(parsed.history);
      showStatus(
        `Backup restaurado: ${bCount} novos favoritos e ${hCount} novos históricos adicionados.`,
        "success",
      );
      onChange();
    } catch {
      showStatus("Erro ao processar o arquivo de backup.", "error");
    }
    backupFileInput.value = "";
  });

  // Space Routing elements
  const routingEnabledCheckbox = el("input", {
    type: "checkbox",
    id: "settings-routing-enabled",
    class: "settings-checkbox",
  }) as HTMLInputElement;
  routingEnabledCheckbox.checked = isSpaceRoutingEnabled();
  routingEnabledCheckbox.addEventListener("change", () => {
    setSpaceRoutingEnabled(routingEnabledCheckbox.checked);
  });

  const routingModeSelect = el(
    "select",
    { class: "settings-select", id: "settings-routing-mode" },
    [
      el("option", { value: "auto" }, ["Automático (Migra e alterna imediatamente)"]),
      el("option", { value: "prompt" }, ["Perguntar (Exibe toast de confirmação)"]),
    ],
  ) as HTMLSelectElement;
  routingModeSelect.value = getSpaceRoutingMode();
  routingModeSelect.addEventListener("change", () => {
    setSpaceRoutingMode(routingModeSelect.value as "auto" | "prompt");
  });

  const rulesListContainer = el("div", { class: "settings-rules-list" });

  function renderRulesList() {
    rulesListContainer.replaceChildren();
    const rules = getRoutingRules();
    const workspaces = getWorkspaces();

    if (rules.length === 0) {
      rulesListContainer.append(
        el("p", { class: "settings-toggle-desc" }, ["Nenhuma regra de roteamento configurada."]),
      );
      return;
    }

    rules.forEach((rule) => {
      const ws = workspaces.find((w) => w.id === rule.targetWorkspaceId);
      const wsName = ws ? ws.name : rule.targetWorkspaceId;
      const removeBtn = el(
        "button",
        {
          class: "settings-icon-btn",
          type: "button",
          "aria-label": `Remover regra para ${rule.domain}`,
          title: "Remover regra",
        },
        [icon("trash")],
      );
      removeBtn.addEventListener("click", () => {
        removeRoutingRule(rule.id);
      });

      const row = el("div", { class: "settings-rule-row" }, [
        el("span", { class: "settings-rule-domain" }, [rule.domain]),
        el("span", { class: "settings-rule-arrow" }, ["→"]),
        el("span", { class: "settings-rule-workspace" }, [wsName]),
        removeBtn,
      ]);
      rulesListContainer.append(row);
    });
  }

  renderRulesList();
  subscribeRoutingRules(renderRulesList);

  const newDomainInput = el("input", {
    class: "settings-input",
    type: "text",
    placeholder: "ex: figma.com",
  }) as HTMLInputElement;

  const newWorkspaceSelect = el(
    "select",
    { class: "settings-select" },
    getWorkspaces().map((w) => el("option", { value: w.id }, [w.name])),
  ) as HTMLSelectElement;

  const addRuleBtn = el("button", { class: "settings-action-btn", type: "button" }, [
    icon("plus"),
    el("span", {}, ["Adicionar Regra"]),
  ]);

  addRuleBtn.addEventListener("click", () => {
    const domain = newDomainInput.value.trim();
    if (!domain) return;
    const added = addRoutingRule(domain, newWorkspaceSelect.value);
    if (added) {
      newDomainInput.value = "";
      showStatus(
        `Regra adicionada: ${added.domain} → Espaço ${newWorkspaceSelect.selectedOptions[0]?.text ?? ""}`,
        "success",
      );
    }
  });

  const addRuleRow = el("div", { class: "settings-add-rule-row" }, [
    newDomainInput,
    newWorkspaceSelect,
    addRuleBtn,
  ]);

  const sections: { id: string; label: string; icon: IconName; content: HTMLElement[] }[] = [
    {
      id: "general",
      label: "Geral",
      icon: "settings",
      content: [
        section("Navegação", [
          field("settings-search-engine", "Mecanismo de busca", engineSelect),
          field("settings-homepage", "Página inicial", homepageInput, homepageHint),
        ]),
      ],
    },
    {
      id: "appearance",
      label: "Aparência",
      icon: "sun",
      content: [section("Tema", [field("settings-theme", "Tema da interface", themeSelect)])],
    },
    {
      id: "spaces",
      label: "Roteamento de Espaços",
      icon: "briefcase",
      content: [
        section("Comportamento de Roteamento", [
          el("div", { class: "settings-field settings-field--inline" }, [
            el("label", { class: "settings-field-label", for: "settings-routing-enabled" }, [
              "Ativar Roteamento Automático de Espaços",
            ]),
            routingEnabledCheckbox,
          ]),
          field("settings-routing-mode", "Modo de roteamento", routingModeSelect),
        ]),
        section("Regras por Domínio", [
          el("p", { class: "settings-toggle-desc" }, [
            "Ao navegar para domínios configurados, o moss direciona a aba para o Workspace correspondente.",
          ]),
          rulesListContainer,
          addRuleRow,
        ]),
      ],
    },
    {
      id: "data",
      label: "Dados",
      icon: "download",
      content: [
        section("Favoritos", [
          el("p", { class: "settings-toggle-desc" }, [
            "Exporte ou importe seus favoritos no padrão Netscape HTML (compatível com Chrome, Firefox, Safari e Edge) ou JSON.",
          ]),
          el("div", { class: "settings-btn-row" }, [
            exportBookmarksBtn,
            importBookmarksBtn,
            bookmarksFileInput,
          ]),
        ]),
        section("Backup & Restauração", [
          el("p", { class: "settings-toggle-desc" }, [
            "Gere uma cópia completa de segurança contendo todos os seus favoritos e histórico de navegação em formato JSON.",
          ]),
          el("div", { class: "settings-btn-row" }, [
            exportBackupBtn,
            restoreBackupBtn,
            backupFileInput,
          ]),
        ]),
        statusMsg,
      ],
    },
  ];

  const navItems = sections.map(({ id, label, icon: iconName }) =>
    el(
      "button",
      {
        class: "settings-nav-item",
        type: "button",
        "data-section": id,
        "aria-controls": `settings-panel-${id}`,
      },
      [el("span", { class: "settings-nav-item-icon" }, [icon(iconName)]), el("span", {}, [label])],
    ),
  );
  const panels = sections.map(({ id, label, content }) =>
    el(
      "section",
      { class: "settings-panel", id: `settings-panel-${id}`, "aria-label": label },
      content,
    ),
  );

  const closeButton = el(
    "button",
    { class: "settings-close", type: "button", "aria-label": "Fechar" },
    [icon("close")],
  );
  const overlay = el("div", { class: "settings-overlay", "aria-hidden": "true" });
  const element = el(
    "div",
    {
      class: "settings-modal",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "settings-title",
    },
    [
      el("header", { class: "settings-header" }, [
        el("h2", { class: "settings-title", id: "settings-title" }, ["Configurações"]),
        closeButton,
      ]),
      el("div", { class: "settings-body" }, [
        el("nav", { class: "settings-sidebar", "aria-label": "Seções" }, [
          el("div", { class: "settings-nav" }, navItems),
        ]),
        el("div", { class: "settings-content" }, panels),
      ]),
    ],
  );

  function showSection(id: string) {
    navItems.forEach((item, index) => {
      const active = item.dataset.section === id;
      item.classList.toggle("settings-nav-item--active", active);
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
      panels[index].classList.toggle("settings-panel--active", active);
    });
  }

  function setHomepageError(error: boolean) {
    homepageInput.setAttribute("aria-invalid", String(error));
    homepageHint.textContent = error ? HOMEPAGE_ERROR : HOMEPAGE_HINT;
  }

  function sync() {
    const settings = getSettings();
    themeSelect.value = settings.theme;
    engineSelect.value = settings.searchEngine;
    homepageInput.value = settings.homepage;
    setHomepageError(false);
    statusMsg.textContent = "";
    statusMsg.classList.remove("settings-status-msg--success", "settings-status-msg--error");
  }

  function commitHomepage() {
    const homepage = normalizeHomepage(homepageInput.value);
    setHomepageError(homepage === null);
    if (homepage === null) return;
    homepageInput.value = homepage;
    updateSettings({ homepage });
  }

  const panel = createPanel({
    element,
    openClass: "settings-modal--open",
    initialFocus: () =>
      navItems.find((item) => item.classList.contains("settings-nav-item--active"))!,
    onOpen: sync,
    onChange() {
      overlay.classList.toggle("settings-overlay--visible", panel.isOpen());
      onChange();
    },
  });

  showSection(sections[0].id);
  for (const item of navItems)
    item.addEventListener("click", () => showSection(item.dataset.section!));
  closeButton.addEventListener("click", () => panel.close());
  themeSelect.addEventListener("change", () =>
    updateSettings({ theme: themeSelect.value as Theme }),
  );
  engineSelect.addEventListener("change", () =>
    updateSettings({ searchEngine: engineSelect.value as SearchEngine }),
  );
  homepageInput.addEventListener("change", commitHomepage);
  homepageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") commitHomepage();
  });

  return { panel, overlay };
}
