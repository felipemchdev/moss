import { el } from "./dom";
import { icon } from "./icons";
import { createPanel, type Panel } from "./panel";

interface ShortcutItem {
  keys: string[];
  description: string;
}

interface ShortcutCategory {
  title: string;
  items: ShortcutItem[];
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    title: "Navegação e Abas",
    items: [
      { keys: ["Ctrl", "T"], description: "Nova aba" },
      { keys: ["Ctrl", "W"], description: "Fechar aba atual" },
      { keys: ["Ctrl", "\\"], description: "Alternar tela dividida (Split View)" },
      { keys: ["Ctrl", "Shift", "S"], description: "Alternar tela dividida" },
      { keys: ["Ctrl", "Tab"], description: "Próxima aba" },
      { keys: ["Ctrl", "Shift", "Tab"], description: "Aba anterior" },
      { keys: ["Ctrl", "Alt", "1-9"], description: "Alternar espaço de trabalho" },
      { keys: ["Ctrl", "Alt", "←/→"], description: "Espaço anterior / próximo" },
      { keys: ["Ctrl", "Shift", "M"], description: "Mover aba para próximo espaço" },
      { keys: ["Alt", "←"], description: "Voltar página" },
      { keys: ["Alt", "→"], description: "Avançar página" },
      { keys: ["F5"], description: "Recarregar página" },
    ],
  },
  {
    title: "Recursos e Atalhos",
    items: [
      { keys: ["Ctrl", "L"], description: "Focar na omnibar" },
      { keys: ["Ctrl", "F"], description: "Localizar na página" },
      { keys: ["F3"], description: "Próxima ocorrência" },
      { keys: ["Shift", "F3"], description: "Ocorrência anterior" },
      { keys: ["Ctrl", "H"], description: "Abrir histórico" },
      { keys: ["Ctrl", ","], description: "Abrir configurações" },
      { keys: ["Ctrl", "/"], description: "Atalhos de teclado" },
      { keys: ["?"], description: "Atalhos (fora da omnibar)" },
      { keys: ["Esc"], description: "Fechar painéis / Cancelar" },
      { keys: ["Enter"], description: "Pesquisar ou carregar URL" },
    ],
  },
];

export function createShortcutsModal(onChange: () => void): { panel: Panel; overlay: HTMLElement } {
  const closeButton = el(
    "button",
    { class: "settings-close", type: "button", "aria-label": "Fechar" },
    [icon("close")],
  );
  const overlay = el("div", { class: "settings-overlay", "aria-hidden": "true" });

  const columns = SHORTCUT_CATEGORIES.map((category) => {
    const table = el("table", { class: "shortcuts-table" }, [
      el("thead", {}, [
        el("tr", {}, [
          el("th", { scope: "col" }, ["Atalho"]),
          el("th", { scope: "col" }, ["Ação"]),
        ]),
      ]),
      el(
        "tbody",
        {},
        category.items.map(({ keys, description }) =>
          el("tr", { class: "shortcuts-row" }, [
            el("td", { class: "shortcuts-td-keys" }, [
              el(
                "div",
                { class: "shortcuts-keys" },
                keys.map((k) => el("kbd", { class: "shortcuts-kbd" }, [k])),
              ),
            ]),
            el("td", { class: "shortcuts-td-desc" }, [description]),
          ]),
        ),
      ),
    ]);

    return el("div", { class: "shortcuts-column" }, [
      el("h3", { class: "shortcuts-column-title" }, [category.title]),
      table,
    ]);
  });

  const element = el(
    "div",
    {
      class: "settings-modal shortcuts-modal",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "shortcuts-title",
    },
    [
      el("header", { class: "settings-header" }, [
        el("h2", { class: "settings-title", id: "shortcuts-title" }, ["Atalhos de teclado"]),
        closeButton,
      ]),
      el("div", { class: "shortcuts-modal-body" }, [
        el("div", { class: "shortcuts-grid" }, columns),
      ]),
    ],
  );

  const panel = createPanel({
    element,
    openClass: "settings-modal--open",
    initialFocus: () => closeButton,
    onChange() {
      overlay.classList.toggle("settings-overlay--visible", panel.isOpen());
      onChange();
    },
  });

  closeButton.addEventListener("click", () => panel.close());
  overlay.addEventListener("click", () => panel.close());

  return { panel, overlay };
}
