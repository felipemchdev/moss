import { el } from "./dom";
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
  const homepageHint = el("p", { class: "settings-field-hint", id: "settings-homepage-hint", "aria-live": "polite" });

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
  ];

  const navItems = sections.map(({ id, label, icon: iconName }) =>
    el(
      "button",
      { class: "settings-nav-item", type: "button", "data-section": id, "aria-controls": `settings-panel-${id}` },
      [el("span", { class: "settings-nav-item-icon" }, [icon(iconName)]), el("span", {}, [label])],
    ),
  );
  const panels = sections.map(({ id, label, content }) =>
    el("section", { class: "settings-panel", id: `settings-panel-${id}`, "aria-label": label }, content),
  );

  const closeButton = el("button", { class: "settings-close", type: "button", "aria-label": "Fechar" }, [
    icon("close"),
  ]);
  const overlay = el("div", { class: "settings-overlay", "aria-hidden": "true" });
  const element = el(
    "div",
    { class: "settings-modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "settings-title" },
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
    initialFocus: () => navItems.find((item) => item.classList.contains("settings-nav-item--active"))!,
    onOpen: sync,
    onChange() {
      overlay.classList.toggle("settings-overlay--visible", panel.isOpen());
      onChange();
    },
  });

  showSection(sections[0].id);
  for (const item of navItems) item.addEventListener("click", () => showSection(item.dataset.section!));
  closeButton.addEventListener("click", () => panel.close());
  themeSelect.addEventListener("change", () => updateSettings({ theme: themeSelect.value as Theme }));
  engineSelect.addEventListener("change", () =>
    updateSettings({ searchEngine: engineSelect.value as SearchEngine }),
  );
  homepageInput.addEventListener("change", commitHomepage);
  homepageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") commitHomepage();
  });

  return { panel, overlay };
}
