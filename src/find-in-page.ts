import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { el } from "./dom";
import { subscribeLocale, t } from "./i18n";
import "./i18n-panels";
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
    placeholder: t("find.placeholder"),
    "aria-label": t("find.inputAria"),
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
      "aria-label": t("find.prevAria"),
      title: t("find.prevTitle"),
    },
    [icon("chevronUp")],
  );

  const nextBtn = el(
    "button",
    {
      type: "button",
      class: "find-in-page-btn find-in-page-btn--next",
      "aria-label": t("find.nextAria"),
      title: t("find.nextTitle"),
    },
    [icon("chevronDown")],
  );

  const caseBtn = el(
    "button",
    {
      type: "button",
      class: "find-in-page-btn find-in-page-btn--case",
      "aria-label": t("find.caseAria"),
      title: t("find.caseTitle"),
      "aria-pressed": "false",
    },
    [el("span", { class: "find-in-page-case-label" }, ["Aa"])],
  );

  const closeBtn = el(
    "button",
    {
      type: "button",
      class: "find-in-page-btn find-in-page-btn--close",
      "aria-label": t("find.closeAria"),
      title: t("find.closeTitle"),
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
      "aria-label": t("find.barAria"),
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

  subscribeLocale(() => {
    inputEl.placeholder = t("find.placeholder");
    inputEl.setAttribute("aria-label", t("find.inputAria"));
    prevBtn.setAttribute("aria-label", t("find.prevAria"));
    prevBtn.setAttribute("title", t("find.prevTitle"));
    nextBtn.setAttribute("aria-label", t("find.nextAria"));
    nextBtn.setAttribute("title", t("find.nextTitle"));
    caseBtn.setAttribute("aria-label", t("find.caseAria"));
    caseBtn.setAttribute("title", t("find.caseTitle"));
    closeBtn.setAttribute("aria-label", t("find.closeAria"));
    closeBtn.setAttribute("title", t("find.closeTitle"));
    container.setAttribute("aria-label", t("find.barAria"));
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
