import { el } from "./dom";
import "./i18n-chrome";
import { subscribeLocale, t } from "./i18n";
import { icon } from "./icons";
import { webview } from "./webview";

export interface TranslatePopoverController {
  element: HTMLElement;
  open: (tabId: string, url: string) => void;
  close: () => void;
  isOpen: () => boolean;
  destroy: () => void;
}

type StatusKey =
  | "translate.selectLang"
  | "translate.translating"
  | "translate.translated"
  | "translate.injectError"
  | "translate.restoring"
  | "translate.restored"
  | "translate.restoreError";

export function createTranslatePopover(onVisibilityChange?: () => void): TranslatePopoverController {
  let open = false;
  let currentTabId = "";
  let currentUrl = "";
  let currentTargetLang = "pt";
  let statusKey: StatusKey = "translate.selectLang";
  let statusVars: Record<string, string | number> | undefined;

  const element = el("div", {
    class: "translate-popover",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": t("translate.ariaLabel"),
    style: "display: none;",
  });

  const headerTitle = el("span", { class: "translate-header-title" }, [t("translate.title")]);
  const closeBtn = el(
    "button",
    { class: "translate-close-btn", type: "button", "aria-label": t("translate.close") },
    [icon("close")],
  );

  const header = el("div", { class: "translate-header" }, [
    el("div", { class: "translate-header-left" }, [
      el("span", { class: "translate-header-icon" }, [icon("translate")]),
      headerTitle,
    ]),
    closeBtn,
  ]);

  const statusLabel = el("div", { class: "translate-status-label" }, [
    t("translate.selectLang"),
  ]);

  const ptBtn = el(
    "button",
    { class: "translate-lang-btn translate-lang-btn--active", type: "button" },
    [t("translate.langPt")],
  );
  const enBtn = el(
    "button",
    { class: "translate-lang-btn", type: "button" },
    [t("translate.langEn")],
  );
  const esBtn = el(
    "button",
    { class: "translate-lang-btn", type: "button" },
    [t("translate.langEs")],
  );

  const langGroup = el("div", { class: "translate-lang-group" }, [ptBtn, enBtn, esBtn]);

  const translateBtn = el(
    "button",
    { class: "translate-action-btn translate-action-btn--primary", type: "button" },
    [t("translate.translateBtn")],
  );

  const restoreBtn = el(
    "button",
    { class: "translate-action-btn", type: "button" },
    [t("translate.restoreBtn")],
  );

  const externalBtn = el(
    "button",
    { class: "translate-action-btn translate-action-btn--secondary", type: "button" },
    [t("translate.openExternal")],
  );

  const actionsGroup = el("div", { class: "translate-actions-group" }, [
    translateBtn,
    restoreBtn,
    externalBtn,
  ]);

  element.append(header, statusLabel, langGroup, actionsGroup);

  function setStatus(key: StatusKey, vars?: Record<string, string | number>) {
    statusKey = key;
    statusVars = vars;
    statusLabel.textContent = t(key, vars);
  }

  function applyLocale() {
    element.setAttribute("aria-label", t("translate.ariaLabel"));
    headerTitle.textContent = t("translate.title");
    closeBtn.setAttribute("aria-label", t("translate.close"));
    ptBtn.textContent = t("translate.langPt");
    enBtn.textContent = t("translate.langEn");
    esBtn.textContent = t("translate.langEs");
    translateBtn.textContent = t("translate.translateBtn");
    restoreBtn.textContent = t("translate.restoreBtn");
    externalBtn.textContent = t("translate.openExternal");
    statusLabel.textContent = t(statusKey, statusVars);
  }

  function selectLang(lang: string, activeBtn: HTMLElement) {
    currentTargetLang = lang;
    ptBtn.classList.toggle("translate-lang-btn--active", activeBtn === ptBtn);
    enBtn.classList.toggle("translate-lang-btn--active", activeBtn === enBtn);
    esBtn.classList.toggle("translate-lang-btn--active", activeBtn === esBtn);
  }

  ptBtn.addEventListener("click", () => selectLang("pt", ptBtn));
  enBtn.addEventListener("click", () => selectLang("en", enBtn));
  esBtn.addEventListener("click", () => selectLang("es", esBtn));

  translateBtn.addEventListener("click", async () => {
    if (!currentTabId) return;
    setStatus("translate.translating");
    try {
      await webview.translateTab(currentTabId, currentTargetLang);
      setStatus("translate.translated", { lang: currentTargetLang.toUpperCase() });
    } catch {
      setStatus("translate.injectError");
    }
  });

  restoreBtn.addEventListener("click", async () => {
    if (!currentTabId) return;
    setStatus("translate.restoring");
    try {
      await webview.translateTab(currentTabId, "original");
      setStatus("translate.restored");
    } catch {
      setStatus("translate.restoreError");
    }
  });

  externalBtn.addEventListener("click", () => {
    if (!currentTabId || !currentUrl) return;
    const targetUrl = `https://translate.google.com/translate?sl=auto&tl=${currentTargetLang}&u=${encodeURIComponent(currentUrl)}`;
    webview.navigate(currentTabId, targetUrl);
    controller.close();
  });

  closeBtn.addEventListener("click", () => controller.close());

  function onPointerDown(e: PointerEvent) {
    if (!open) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (element.contains(target) || target.closest(".omnibar-translate-btn") || target.closest(".floating-translate-btn")) {
      return;
    }
    controller.close();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      controller.close();
    }
  }

  const unsubscribeLocale = subscribeLocale(() => applyLocale());

  const controller: TranslatePopoverController = {
    element,
    open(tabId: string, url: string) {
      currentTabId = tabId;
      currentUrl = url;
      setStatus("translate.selectLang");
      element.style.display = "flex";
      open = true;
      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("keydown", onKeyDown);
      onVisibilityChange?.();
    },
    close() {
      if (!open) return;
      element.style.display = "none";
      open = false;
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      onVisibilityChange?.();
    },
    isOpen: () => open,
    destroy() {
      unsubscribeLocale();
      controller.close();
      element.remove();
    },
  };

  return controller;
}
