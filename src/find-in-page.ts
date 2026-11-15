import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { el } from "./dom";
import { icon } from "./icons";
import { webview } from "./webview";

export interface FindResultPayload {
  tabId: string;
  activeMatch: number;
  totalMatches: number;
}

export interface FindInPageOptions {
  getTargetTabId: () => string | null;
  onHeightChange?: (height: number) => void;
  onClose?: () => void;
}

export interface FindInPage {
  element: HTMLElement;
  input: HTMLInputElement;
  open: (initialQuery?: string) => void;
  close: () => void;
  isOpen: () => boolean;
  findNext: () => void;
  findPrevious: () => void;
  reapply: () => void;
  destroy: () => void;
}

export function createFindInPage(options: FindInPageOptions): FindInPage {
  let open = false;
  let caseSensitive = false;
  let destroyed = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let unlisten: UnlistenFn | null = null;

  const searchIconEl = el("span", { class: "find-in-page-icon" }, [icon("search")]);

  const inputEl = el("input", {
    type: "search",
    class: "find-in-page-input",
    placeholder: "Localizar na página...",
    "aria-label": "Termo de busca na página",
    spellcheck: "false",
    autocomplete: "off",
  }) as HTMLInputElement;

  const counterEl = el("span", {
    class: "find-in-page-counter",
    "aria-live": "polite",
  });

  const separatorEl = el("span", { class: "find-in-page-separator" });

  const prevBtn = el(
    "button",
    {
      type: "button",
      class: "find-in-page-btn find-in-page-btn--prev",
      "aria-label": "Ocorrência anterior (Shift+Enter)",
      title: "Ocorrência anterior (Shift+Enter ou Shift+F3)",
    },
    [icon("chevronUp")],
  );

  const nextBtn = el(
    "button",
    {
      type: "button",
      class: "find-in-page-btn find-in-page-btn--next",
      "aria-label": "Próxima ocorrência (Enter)",
      title: "Próxima ocorrência (Enter ou F3)",
    },
    [icon("chevronDown")],
  );

  const caseBtn = el(
    "button",
    {
      type: "button",
      class: "find-in-page-btn find-in-page-btn--case",
      "aria-label": "Diferenciar maiúsculas/minúsculas",
      title: "Diferenciar maiúsculas e minúsculas",
      "aria-pressed": "false",
    },
    [el("span", { class: "find-in-page-case-label" }, ["Aa"])],
  );

  const closeBtn = el(
    "button",
    {
      type: "button",
      class: "find-in-page-btn find-in-page-btn--close",
      "aria-label": "Fechar localização (Esc)",
      title: "Fechar (Esc)",
    },
    [icon("close")],
  );

  const pill = el("div", { class: "find-in-page-pill" }, [
    searchIconEl,
    inputEl,
    counterEl,
    separatorEl,
    prevBtn,
    nextBtn,
    caseBtn,
    closeBtn,
  ]);

  const container = el(
    "div",
    {
      class: "find-in-page-bar",
      role: "search",
      "aria-label": "Localizar na página",
      style: "display: none;",
    },
    [pill],
  );

  function runSearch(findNext: boolean, forward = true) {
    if (!open) return;
    const tabId = options.getTargetTabId();
    if (!tabId) return;

    const query = inputEl.value;
    if (!query) {
      counterEl.textContent = "";
      counterEl.classList.remove("find-in-page-counter--empty");
      webview.clearFindInPage(tabId);
      return;
    }

    webview.findInPage(tabId, query, forward, caseSensitive, findNext);
  }

  function scheduleSearch() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      runSearch(false);
    }, 120);
  }

  inputEl.addEventListener("input", scheduleSearch);

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        runSearch(true, false);
      } else {
        runSearch(true, true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      controller.close();
      return;
    }
  });

  container.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      controller.close();
    }
  });

  prevBtn.addEventListener("click", () => {
    runSearch(true, false);
  });

  nextBtn.addEventListener("click", () => {
    runSearch(true, true);
  });

  caseBtn.addEventListener("click", () => {
    caseSensitive = !caseSensitive;
    caseBtn.classList.toggle("find-in-page-btn--active", caseSensitive);
    caseBtn.setAttribute("aria-pressed", String(caseSensitive));
    runSearch(false);
  });

  closeBtn.addEventListener("click", () => {
    controller.close();
  });

  listen<FindResultPayload>("find-in-page-result", (event) => {
    if (!open || destroyed) return;
    const currentTabId = options.getTargetTabId();
    if (event.payload.tabId !== currentTabId) return;

    const { activeMatch, totalMatches } = event.payload;
    if (totalMatches === 0) {
      counterEl.textContent = inputEl.value ? "0/0" : "";
      counterEl.classList.add("find-in-page-counter--empty");
    } else {
      counterEl.textContent = `${activeMatch}/${totalMatches}`;
      counterEl.classList.remove("find-in-page-counter--empty");
    }
  }).then((fn) => {
    if (destroyed) {
      fn();
    } else {
      unlisten = fn;
    }
  });

  const controller: FindInPage = {
    element: container,
    input: inputEl,
    open(initialQuery) {
      if (open) {
        inputEl.focus();
        inputEl.select();
        return;
      }
      open = true;
      container.style.display = "flex";
      counterEl.textContent = "";
      counterEl.classList.remove("find-in-page-counter--empty");
      options.onHeightChange?.(42);

      if (initialQuery !== undefined) {
        inputEl.value = initialQuery;
      }

      requestAnimationFrame(() => {
        inputEl.focus();
        inputEl.select();
      });

      if (inputEl.value) {
        runSearch(false);
      }
    },
    close() {
      if (!open) return;
      open = false;
      container.style.display = "none";
      counterEl.textContent = "";
      counterEl.classList.remove("find-in-page-counter--empty");
      options.onHeightChange?.(0);

      const tabId = options.getTargetTabId();
      if (tabId) {
        webview.clearFindInPage(tabId);
      }
      options.onClose?.();
    },
    isOpen: () => open,
    findNext() {
      if (!open) controller.open();
      else runSearch(true, true);
    },
    findPrevious() {
      if (!open) controller.open();
      else runSearch(true, false);
    },
    reapply() {
      if (open && inputEl.value) {
        runSearch(false);
      }
    },
    destroy() {
      destroyed = true;
      controller.close();
      if (debounceTimer) clearTimeout(debounceTimer);
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
      container.remove();
    },
  };

  return controller;
}
