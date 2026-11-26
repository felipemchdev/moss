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
import { getLocale, setLocale, subscribeLocale, t, type Locale } from "./i18n";
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

function field(id: string, labelKey: string, control: HTMLElement, hint?: HTMLElement): HTMLElement {
  control.id = id;
  return el("div", { class: "settings-field" }, [
    el("label", { class: "settings-field-label", for: id, "data-i18n": labelKey }, [t(labelKey)]),
    control,
    ...(hint ? [hint] : []),
  ]);
}

function section(titleKey: string, children: HTMLElement[]): HTMLElement {
  return el("div", { class: "settings-section" }, [
    el("h3", { class: "settings-section-title", "data-i18n": titleKey }, [t(titleKey)]),
    ...children,
  ]);
}

export function createSettingsPanel(onChange: () => void): { panel: Panel; overlay: HTMLElement } {
  const themeSelect = el(
    "select",
    { class: "settings-select" },
    THEMES.map(({ value, label }) => el("option", { value }, [label])),
  );
  const languageSelect = el(
    "select",
    {
      class: "settings-select",
      "aria-label": t("settings.language"),
      "data-i18n-aria": "settings.language",
    },
    [
      el("option", { value: "pt-BR", "data-i18n": "settings.langPt" }, [t("settings.langPt")]),
      el("option", { value: "en-US", "data-i18n": "settings.langEn" }, [t("settings.langEn")]),
    ],
  ) as HTMLSelectElement;
  languageSelect.value = getLocale();
  languageSelect.addEventListener("change", () => {
    setLocale(languageSelect.value as Locale);
    onChange();
  });
  const engineSelect = el(
    "select",
    { class: "settings-select" },
    SEARCH_ENGINES.map(({ value, label }) => el("option", { value }, [label])),
  );
  const homepageInput = el("input", {
    class: "settings-input",
    type: "text",
    placeholder: t("settings.homepagePlaceholder"),
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
    [
      icon("download"),
      el("span", { "data-i18n": "settings.exportHtml" }, [t("settings.exportHtml")]),
    ],
  );
  exportBookmarksBtn.addEventListener("click", async () => {
    const list = getBookmarks();
    if (list.length === 0) {
      showStatus(t("settings.noBookmarksExport"), "error");
      return;
    }
    const html = exportBookmarksToHtml(list);
    const date = new Date().toISOString().slice(0, 10);
    const filename = `moss-bookmarks-${date}.html`;
    try {
      const savedPath = await saveExportFile(html, filename);
      showStatus(
        t("settings.exportedBookmarks", {
          count: list.length,
          path: savedPath,
        }),
        "success",
      );
    } catch {
      showStatus(t("settings.bookmarksSaveFailed"), "error");
    }
  });

  const bookmarksFileInput = el("input", {
    type: "file",
    accept: ".html,.htm,.json",
    style: "display: none;",
  }) as HTMLInputElement;

  const importBookmarksBtn = el("button", { class: "settings-action-btn", type: "button" }, [
    icon("plus"),
    el("span", { "data-i18n": "settings.importBookmarks" }, [t("settings.importBookmarks")]),
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
          showStatus(t("settings.noBookmarksJson"), "error");
          bookmarksFileInput.value = "";
          return;
        }
        count = importBookmarks(parsed.bookmarks);
      } else if (lowerName.endsWith(".html") || lowerName.endsWith(".htm")) {
        const parsed = parseBookmarksFromHtml(content);
        if (parsed.length === 0) {
          showStatus(t("settings.noValidBookmarksHtml"), "error");
          bookmarksFileInput.value = "";
          return;
        }
        count = importBookmarks(parsed);
      } else {
        showStatus(t("settings.unsupportedFile"), "error");
        bookmarksFileInput.value = "";
        return;
      }
      showStatus(t("settings.bookmarksImported", { count }), "success");
      onChange();
    } catch {
      showStatus(t("settings.fileReadFailed"), "error");
    }
    bookmarksFileInput.value = "";
  });

  const exportBackupBtn = el(
    "button",
    { class: "settings-action-btn settings-action-btn--primary", type: "button" },
    [
      icon("download"),
      el("span", { "data-i18n": "settings.exportBackup" }, [t("settings.exportBackup")]),
    ],
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
        t("settings.backupExported", {
          bookmarks: b.length,
          history: h.length,
          path: savedPath,
        }),
        "success",
      );
    } catch {
      showStatus(t("settings.backupSaveFailed"), "error");
    }
  });

  const backupFileInput = el("input", {
    type: "file",
    accept: ".json",
    style: "display: none;",
  }) as HTMLInputElement;

  const restoreBackupBtn = el("button", { class: "settings-action-btn", type: "button" }, [
    icon("history"),
    el("span", { "data-i18n": "settings.restoreBackup" }, [t("settings.restoreBackup")]),
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
        showStatus(t("settings.backupInvalid"), "error");
        backupFileInput.value = "";
        return;
      }
      const bCount = importBookmarks(parsed.bookmarks);
      const hCount = importHistory(parsed.history);
      showStatus(
        t("settings.backupRestored", {
          bookmarks: bCount,
          history: hCount,
        }),
        "success",
      );
      onChange();
    } catch {
      showStatus(t("settings.backupProcessError"), "error");
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
      el("option", { value: "auto", "data-i18n": "settings.routingAuto" }, [
        t("settings.routingAuto"),
      ]),
      el("option", { value: "prompt", "data-i18n": "settings.routingPrompt" }, [
        t("settings.routingPrompt"),
      ]),
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
        el("p", { class: "settings-toggle-desc" }, [t("settings.noRules")]),
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
          "aria-label": t("settings.removeRuleFor", { domain: rule.domain }),
          title: t("settings.removeRule"),
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
    placeholder: t("settings.domainPlaceholder"),
  }) as HTMLInputElement;

  const newWorkspaceSelect = el(
    "select",
    { class: "settings-select" },
    getWorkspaces().map((w) => el("option", { value: w.id }, [w.name])),
  ) as HTMLSelectElement;

  const addRuleBtn = el("button", { class: "settings-action-btn", type: "button" }, [
    icon("plus"),
    el("span", { "data-i18n": "settings.addRule" }, [t("settings.addRule")]),
  ]);

  addRuleBtn.addEventListener("click", () => {
    const domain = newDomainInput.value.trim();
    if (!domain) return;
    const added = addRoutingRule(domain, newWorkspaceSelect.value);
    if (added) {
      newDomainInput.value = "";
      showStatus(
        t("settings.ruleAdded", {
          domain: added.domain,
          workspace: newWorkspaceSelect.selectedOptions[0]?.text ?? "",
        }),
        "success",
      );
    }
  });

  const addRuleRow = el("div", { class: "settings-add-rule-row" }, [
    newDomainInput,
    newWorkspaceSelect,
    addRuleBtn,
  ]);

  const sections: { id: string; labelKey: string; icon: IconName; content: HTMLElement[] }[] = [
    {
      id: "general",
      labelKey: "settings.general",
      icon: "settings",
      content: [
        section("settings.themeSection", [
          field("settings-theme", "settings.theme", themeSelect),
          field("setting-language", "settings.language", languageSelect),
        ]),
        section("settings.navigation", [
          field("settings-search-engine", "settings.searchEngine", engineSelect),
          field("settings-homepage", "settings.homepage", homepageInput, homepageHint),
        ]),
      ],
    },
    {
      id: "spaces",
      labelKey: "settings.spaces",
      icon: "briefcase",
      content: [
        section("settings.routingBehavior", [
          el("div", { class: "settings-field settings-field--inline" }, [
            el(
              "label",
              {
                class: "settings-field-label",
                for: "settings-routing-enabled",
                "data-i18n": "settings.enableRouting",
              },
              [t("settings.enableRouting")],
            ),
            routingEnabledCheckbox,
          ]),
          field("settings-routing-mode", "settings.routingMode", routingModeSelect),
        ]),
        section("settings.domainRules", [
          el(
            "p",
            { class: "settings-toggle-desc", "data-i18n": "settings.routingDescription" },
            [t("settings.routingDescription")],
          ),
          rulesListContainer,
          addRuleRow,
        ]),
      ],
    },
    {
      id: "data",
      labelKey: "settings.data",
      icon: "download",
      content: [
        section("settings.bookmarks", [
          el(
            "p",
            { class: "settings-toggle-desc", "data-i18n": "settings.bookmarksDesc" },
            [t("settings.bookmarksDesc")],
          ),
          el("div", { class: "settings-btn-row" }, [
            exportBookmarksBtn,
            importBookmarksBtn,
            bookmarksFileInput,
          ]),
        ]),
        section("settings.backup", [
          el("p", { class: "settings-toggle-desc", "data-i18n": "settings.backupDesc" }, [
            t("settings.backupDesc"),
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

  const navItems = sections.map(({ id, labelKey, icon: iconName }) =>
    el(
      "button",
      {
        class: "settings-nav-item",
        type: "button",
        "data-section": id,
        "aria-controls": `settings-panel-${id}`,
      },
      [
        el("span", { class: "settings-nav-item-icon" }, [icon(iconName)]),
        el("span", { "data-i18n": labelKey }, [t(labelKey)]),
      ],
    ),
  );
  const panels = sections.map(({ id, labelKey, content }) =>
    el(
      "section",
      { class: "settings-panel", id: `settings-panel-${id}`, "aria-label": t(labelKey) },
      content,
    ),
  );

  const closeButton = el(
    "button",
    {
      class: "settings-close",
      type: "button",
      "aria-label": t("settings.close"),
      "data-i18n-aria": "settings.close",
    },
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
        el("h2", { class: "settings-title", id: "settings-title", "data-i18n": "settings.title" }, [
          t("settings.title"),
        ]),
        closeButton,
      ]),
      el("div", { class: "settings-body" }, [
        el(
          "nav",
          {
            class: "settings-sidebar",
            "aria-label": t("settings.sections"),
            "data-i18n-aria": "settings.sections",
          },
          [el("div", { class: "settings-nav" }, navItems)],
        ),
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

  let homepageError = false;

  function setHomepageError(error: boolean) {
    homepageError = error;
    homepageInput.setAttribute("aria-invalid", String(error));
    homepageHint.textContent = t(error ? "settings.homepageError" : "settings.homepageHint");
  }

  function applyLocale() {
    element.querySelectorAll<HTMLElement>("[data-i18n]").forEach((node) => {
      const key = node.dataset.i18n;
      if (key) node.textContent = t(key);
    });
    element.querySelectorAll<HTMLElement>("[data-i18n-aria]").forEach((node) => {
      const key = node.dataset.i18nAria;
      if (key) node.setAttribute("aria-label", t(key));
    });
    languageSelect.value = getLocale();
    homepageInput.placeholder = t("settings.homepagePlaceholder");
    newDomainInput.placeholder = t("settings.domainPlaceholder");
    panels.forEach((panel, index) => {
      panel.setAttribute("aria-label", t(sections[index].labelKey));
    });
    setHomepageError(homepageError);
    renderRulesList();
    statusMsg.textContent = "";
    statusMsg.classList.remove("settings-status-msg--success", "settings-status-msg--error");
  }

  applyLocale();
  subscribeLocale(applyLocale);

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
