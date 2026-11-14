import { el, hostnameOf } from "./dom";
import {
  clearHistory,
  removeHistoryEntry,
  searchHistory,
  subscribeHistory,
  type HistoryEntry,
} from "./history";
import { icon } from "./icons";
import { createPanel, type Panel } from "./panel";

const CONFIRM_TIMEOUT_MS = 3000;
const timeFormat = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });

function dayLabel(timestamp: number): string {
  const day = new Date(timestamp).setHours(0, 0, 0, 0);
  const now = new Date();
  if (day === new Date(now).setHours(0, 0, 0, 0)) return "Hoje";
  now.setDate(now.getDate() - 1);
  if (day === now.setHours(0, 0, 0, 0)) return "Ontem";
  return dayFormat.format(timestamp);
}

function renderItem(entry: HistoryEntry): HTMLElement {
  return el("li", { class: "history-item", "data-id": entry.id, "data-url": entry.url }, [
    el("span", { class: "history-item-favicon" }, [icon("globe")]),
    el("button", { class: "history-item-content", type: "button", title: entry.url }, [
      el("span", { class: "history-item-title" }, [entry.title]),
      el("span", { class: "history-item-url" }, [hostnameOf(entry.url)]),
    ]),
    el("time", { class: "history-item-time", datetime: new Date(entry.visitedAt).toISOString() }, [
      timeFormat.format(entry.visitedAt),
    ]),
    el(
      "button",
      { class: "history-item-delete", type: "button", "aria-label": "Remover do histórico", title: "Remover" },
      [icon("close")],
    ),
  ]);
}

export function createHistoryPanel(
  onSelect: (url: string, inNewTab: boolean) => void,
  onChange: () => void,
): Panel {
  const search = el("input", {
    class: "history-search-input",
    type: "search",
    placeholder: "Pesquisar no histórico",
    autocomplete: "off",
    spellcheck: "false",
    "aria-label": "Pesquisar no histórico",
  });
  const closeButton = el("button", { class: "settings-close", type: "button", "aria-label": "Fechar" }, [
    icon("close"),
  ]);
  const clearLabel = el("span", {}, ["Limpar histórico"]);
  const clearButton = el("button", { class: "history-clear-btn", type: "button" }, [icon("trash"), clearLabel]);
  const content = el("div", { class: "history-content" });
  const emptyTitle = el("p", { class: "history-empty-title" });
  const emptySubtitle = el("p", { class: "history-empty-subtitle" });
  const empty = el("div", { class: "history-empty" }, [
    el("span", { class: "history-empty-icon" }, [icon("history")]),
    emptyTitle,
    emptySubtitle,
  ]);
  const footer = el("footer", { class: "history-footer" }, [clearButton]);

  const element = el(
    "aside",
    { class: "history-panel", role: "dialog", "aria-modal": "true", "aria-labelledby": "history-title" },
    [
      el("header", { class: "history-header" }, [
        el("h2", { class: "history-title", id: "history-title" }, ["Histórico"]),
        closeButton,
      ]),
      el("div", { class: "history-search" }, [
        el("span", { class: "history-search-icon" }, [icon("search")]),
        search,
      ]),
      content,
      footer,
    ],
  );

  const panel = createPanel({
    element,
    openClass: "history-panel--open",
    initialFocus: () => search,
    onOpen() {
      search.value = "";
      resetClear();
      render();
    },
    onChange,
  });

  function render() {
    const query = search.value.trim();
    const entries = searchHistory(query);
    if (entries.length === 0) {
      emptyTitle.textContent = query ? "Nenhum resultado" : "Nenhuma página visitada";
      emptySubtitle.textContent = query
        ? "Tente outros termos de pesquisa."
        : "As páginas que você visitar aparecerão aqui.";
      content.replaceChildren(empty);
    } else {
      const groups: HTMLElement[] = [];
      let currentLabel = "";
      let currentList: HTMLElement | null = null;
      for (const entry of entries) {
        const label = dayLabel(entry.visitedAt);
        if (label !== currentLabel || !currentList) {
          currentLabel = label;
          currentList = el("ul", { class: "history-list" });
          groups.push(
            el("section", { class: "history-group" }, [
              el("h3", { class: "history-group-label" }, [label]),
              currentList,
            ]),
          );
        }
        currentList.append(renderItem(entry));
      }
      content.replaceChildren(...groups);
    }
    footer.hidden = entries.length === 0 && !query;
  }

  let confirmTimer: number | undefined;
  let confirming = false;
  function resetClear() {
    clearTimeout(confirmTimer);
    confirming = false;
    clearLabel.textContent = "Limpar histórico";
  }

  clearButton.addEventListener("click", () => {
    if (!confirming) {
      confirming = true;
      clearLabel.textContent = "Clique novamente para confirmar";
      confirmTimer = window.setTimeout(resetClear, CONFIRM_TIMEOUT_MS);
      return;
    }
    resetClear();
    clearHistory();
    search.focus();
  });

  closeButton.addEventListener("click", () => panel.close());
  search.addEventListener("input", render);

  function handleItem(event: MouseEvent, inNewTab: boolean) {
    const target = event.target as Element;
    const item = target.closest<HTMLElement>(".history-item");
    if (!item) return;
    if (target.closest(".history-item-delete")) {
      if (event.button !== 0) return;
      const neighbor = (item.nextElementSibling ?? item.previousElementSibling) as HTMLElement | null;
      removeHistoryEntry(item.dataset.id!);
      const neighborId = neighbor?.dataset.id;
      const nextFocus = neighborId
        ? content.querySelector<HTMLElement>(`[data-id="${CSS.escape(neighborId)}"] .history-item-delete`)
        : null;
      (nextFocus ?? search).focus();
      return;
    }
    panel.close();
    onSelect(item.dataset.url!, inNewTab);
  }
  content.addEventListener("click", (event) => handleItem(event, event.ctrlKey || event.metaKey));
  content.addEventListener("auxclick", (event) => {
    if (event.button === 1) handleItem(event, true);
  });

  subscribeHistory(() => {
    if (panel.isOpen()) render();
  });

  return panel;
}
