import { el } from "./dom";
import { icon } from "./icons";
import { webview } from "./webview";

export interface TranslatePopoverController {
  element: HTMLElement;
  open: (tabId: string, url: string) => void;
  close: () => void;
  isOpen: () => boolean;
  destroy: () => void;
}

export function createTranslatePopover(onVisibilityChange?: () => void): TranslatePopoverController {
  let open = false;
  let currentTabId = "";
  let currentUrl = "";
  let currentTargetLang = "pt";

  const element = el("div", {
    class: "translate-popover",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": "Tradutor de Página",
    style: "display: none;",
  });

  const headerTitle = el("span", { class: "translate-header-title" }, ["Traduzir Página"]);
  const closeBtn = el(
    "button",
    { class: "translate-close-btn", type: "button", "aria-label": "Fechar" },
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
    "Selecione um idioma para traduzir:",
  ]);

  const ptBtn = el(
    "button",
    { class: "translate-lang-btn translate-lang-btn--active", type: "button" },
    ["🇧🇷 Português"],
  );
  const enBtn = el(
    "button",
    { class: "translate-lang-btn", type: "button" },
    ["🇺🇸 Inglês"],
  );
  const esBtn = el(
    "button",
    { class: "translate-lang-btn", type: "button" },
    ["🇪🇸 Espanhol"],
  );

  const langGroup = el("div", { class: "translate-lang-group" }, [ptBtn, enBtn, esBtn]);

  const translateBtn = el(
    "button",
    { class: "translate-action-btn translate-action-btn--primary", type: "button" },
    ["Traduzir página"],
  );

  const restoreBtn = el(
    "button",
    { class: "translate-action-btn", type: "button" },
    ["Restaurar original"],
  );

  const externalBtn = el(
    "button",
    { class: "translate-action-btn translate-action-btn--secondary", type: "button" },
    ["Abrir no Google Tradutor"],
  );

  const actionsGroup = el("div", { class: "translate-actions-group" }, [
    translateBtn,
    restoreBtn,
    externalBtn,
  ]);

  element.append(header, statusLabel, langGroup, actionsGroup);

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
    statusLabel.textContent = "Traduzindo página...";
    try {
      await webview.translateTab(currentTabId, currentTargetLang);
      statusLabel.textContent = `Página traduzida (${currentTargetLang.toUpperCase()})!`;
    } catch {
      statusLabel.textContent = "Erro ao injetar tradutor. Tente abrir no Google Tradutor.";
    }
  });

  restoreBtn.addEventListener("click", async () => {
    if (!currentTabId) return;
    statusLabel.textContent = "Restaurando idioma original...";
    try {
      await webview.translateTab(currentTabId, "original");
      statusLabel.textContent = "Original restaurado!";
    } catch {
      statusLabel.textContent = "Erro ao restaurar página.";
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

  const controller: TranslatePopoverController = {
    element,
    open(tabId: string, url: string) {
      currentTabId = tabId;
      currentUrl = url;
      statusLabel.textContent = "Selecione um idioma para traduzir:";
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
      controller.close();
      element.remove();
    },
  };

  return controller;
}
