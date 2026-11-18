import { el } from "./dom";
import { subscribeLocale, t } from "./i18n";
import "./i18n-panels";
import { icon } from "./icons";
import { createPanel, type Panel } from "./panel";

interface ShortcutItem {
  keys: string[];
  labelKey: string;
}

interface ShortcutCategory {
  titleKey: string;
  items: ShortcutItem[];
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    titleKey: "shortcuts.category.navigation",
    items: [
      { keys: ["Ctrl", "T"], labelKey: "shortcuts.nav.newTab" },
      { keys: ["Ctrl", "W"], labelKey: "shortcuts.nav.closeTab" },
      { keys: ["Ctrl", "Shift", "T"], labelKey: "shortcuts.nav.reopenTab" },
      { keys: ["Ctrl", "B"], labelKey: "shortcuts.nav.toggleSidebar" },
      { keys: ["Ctrl", "\\"], labelKey: "shortcuts.nav.toggleSplit" },
      { keys: ["Ctrl", "Shift", "S"], labelKey: "shortcuts.nav.toggleSplitAlt" },
      { keys: ["Ctrl", "Tab"], labelKey: "shortcuts.nav.nextTab" },
      { keys: ["Ctrl", "Shift", "Tab"], labelKey: "shortcuts.nav.prevTab" },
      { keys: ["Ctrl", "Alt", "1-9"], labelKey: "shortcuts.nav.switchWorkspace" },
      { keys: ["Ctrl", "Alt", "←/→"], labelKey: "shortcuts.nav.cycleWorkspace" },
      { keys: ["Ctrl", "Shift", "M"], labelKey: "shortcuts.nav.moveTabWorkspace" },
      { keys: ["Alt", "←"], labelKey: "shortcuts.nav.back" },
      { keys: ["Alt", "→"], labelKey: "shortcuts.nav.forward" },
      { keys: ["F5"], labelKey: "shortcuts.nav.reload" },
    ],
  },
  {
    titleKey: "shortcuts.category.features",
    items: [
      { keys: ["Ctrl", "K"], labelKey: "shortcuts.features.commandPalette" },
      { keys: ["Ctrl", "P"], labelKey: "shortcuts.features.commandPaletteTabs" },
      { keys: ["Ctrl", "L"], labelKey: "shortcuts.features.focusOmnibar" },
      { keys: ["Ctrl", "Alt", "R"], labelKey: "shortcuts.features.readerMode" },
      { keys: ["Ctrl", "+"], labelKey: "shortcuts.features.zoomIn" },
      { keys: ["Ctrl", "-"], labelKey: "shortcuts.features.zoomOut" },
      { keys: ["Ctrl", "0"], labelKey: "shortcuts.features.zoomReset" },
      { keys: ["Ctrl", "Shift", "T"], labelKey: "shortcuts.features.readerTheme" },
      { keys: ["Ctrl", "Shift", "F"], labelKey: "shortcuts.features.readerFont" },
      { keys: ["Ctrl", "Shift", "./,"], labelKey: "shortcuts.features.readerFontSize" },
      { keys: ["Ctrl", "F"], labelKey: "shortcuts.features.find" },
      { keys: ["F3"], labelKey: "shortcuts.features.findNext" },
      { keys: ["Shift", "F3"], labelKey: "shortcuts.features.findPrev" },
      { keys: ["Ctrl", "Shift", "N"], labelKey: "shortcuts.features.privateTab" },
      { keys: ["Ctrl", "Shift", "U"], labelKey: "shortcuts.features.translate" },
      { keys: ["Ctrl", "Shift", "G"], labelKey: "shortcuts.features.glance" },
      { keys: ["Shift", "Click"], labelKey: "shortcuts.features.glanceClick" },
      { keys: ["Ctrl", "Shift", "Z"], labelKey: "shortcuts.features.zapper" },
      { keys: ["Ctrl", "H"], labelKey: "shortcuts.features.history" },
      { keys: ["Ctrl", "J"], labelKey: "shortcuts.features.downloads" },
      { keys: ["Ctrl", ","], labelKey: "shortcuts.features.settings" },
      { keys: ["Ctrl", "/"], labelKey: "shortcuts.features.shortcuts" },
      { keys: ["?"], labelKey: "shortcuts.features.shortcutsOutside" },
      { keys: ["Esc"], labelKey: "shortcuts.features.escape" },
      { keys: ["Enter"], labelKey: "shortcuts.features.enter" },
    ],
  },
];

function renderColumns(gridEl: HTMLElement) {
  const columns = SHORTCUT_CATEGORIES.map((category) => {
    const table = el("table", { class: "shortcuts-table" }, [
      el("thead", {}, [
        el("tr", {}, [
          el("th", { scope: "col" }, [t("shortcuts.columnKey")]),
          el("th", { scope: "col" }, [t("shortcuts.columnAction")]),
        ]),
      ]),
      el(
        "tbody",
        {},
        category.items.map(({ keys, labelKey }) =>
          el("tr", { class: "shortcuts-row" }, [
            el("td", { class: "shortcuts-td-keys" }, [
              el(
                "div",
                { class: "shortcuts-keys" },
                keys.map((k) => el("kbd", { class: "shortcuts-kbd" }, [k])),
              ),
            ]),
            el("td", { class: "shortcuts-td-desc" }, [t(labelKey)]),
          ]),
        ),
      ),
    ]);

    const titleEl = el("h3", { class: "shortcuts-column-title" }, [t(category.titleKey)]);

    return el("div", { class: "shortcuts-column" }, [titleEl, table]);
  });

  gridEl.replaceChildren(...columns);
}

export function createShortcutsModal(onChange: () => void): { panel: Panel; overlay: HTMLElement } {
  const closeButton = el(
    "button",
    {
      class: "settings-close",
      type: "button",
      "aria-label": t("shortcuts.close"),
      title: t("shortcuts.close"),
    },
    [icon("close")],
  );
  const overlay = el("div", { class: "settings-overlay", "aria-hidden": "true" });
  const gridEl = el("div", { class: "shortcuts-grid" });
  const titleEl = el("h2", { class: "settings-title", id: "shortcuts-title" }, [t("shortcuts.title")]);

  renderColumns(gridEl);

  const element = el(
    "div",
    {
      class: "settings-modal shortcuts-modal",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "shortcuts-title",
    },
    [
      el("header", { class: "settings-header" }, [titleEl, closeButton]),
      el("div", { class: "shortcuts-modal-body" }, [gridEl]),
    ],
  );

  const applyLocale = () => {
    titleEl.textContent = t("shortcuts.title");
    closeButton.setAttribute("aria-label", t("shortcuts.close"));
    closeButton.setAttribute("title", t("shortcuts.close"));
    renderColumns(gridEl);
  };

  subscribeLocale(applyLocale);

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
