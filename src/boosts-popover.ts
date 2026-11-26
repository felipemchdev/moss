import {
  extractDomain,
  getDomainBoost,
  setDomainBoost,
  resetDomainBoost,
  getDomainZapRules,
  clearDomainZapRules,
  applyBoostToTab,
} from "./boosts";
import { el } from "./dom";
import "./i18n-chrome";
import { subscribeLocale, t } from "./i18n";
import { icon } from "./icons";
import { webview } from "./webview";

export interface BoostsPopoverController {
  element: HTMLElement;
  open: (tabId: string, url: string) => void;
  close: () => void;
  isOpen: () => boolean;
  destroy: () => void;
}

export function createBoostsPopover(onVisibilityChange?: () => void): BoostsPopoverController {
  let open = false;
  let currentTabId = "";
  let currentDomain = "";
  let currentUrl = "";

  const element = el("div", {
    class: "boosts-popover",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": t("boosts.title"),
    style: "display: none;",
  });

  const headerTitle = el("span", { class: "boosts-header-title" }, [t("boosts.title")]);
  const headerDomain = el("span", { class: "boosts-header-domain" }, [""]);
  const closeBtn = el(
    "button",
    { class: "boosts-close-btn", type: "button", "aria-label": t("boosts.close") },
    [icon("close")],
  );

  const header = el("div", { class: "boosts-header" }, [
    el("div", { class: "boosts-header-left" }, [
      el("span", { class: "boosts-header-icon" }, [icon("sparkles")]),
      el("div", { class: "boosts-header-meta" }, [headerTitle, headerDomain]),
    ]),
    closeBtn,
  ]);

  const zapperTitle = el("strong", {}, [t("boosts.zapperTitle")]);
  const zapperDesc = el("span", {}, [t("boosts.zapperDesc")]);
  const zapperBtn = el(
    "button",
    { class: "boosts-zapper-hero-btn", type: "button" },
    [
      icon("zap"),
      el("div", { class: "boosts-zapper-hero-text" }, [zapperTitle, zapperDesc]),
    ],
  );

  const darkToggle = el("input", {
    type: "checkbox",
    class: "boosts-switch",
    id: "boost-dark-toggle",
  }) as HTMLInputElement;
  const darkLabelText = el("span", {}, [t("boosts.darkMode")]);

  const darkRow = el("div", { class: "boosts-row" }, [
    el("label", { for: "boost-dark-toggle", class: "boosts-label" }, [
      icon("moon"),
      darkLabelText,
    ]),
    darkToggle,
  ]);

  const sepiaToggle = el("input", {
    type: "checkbox",
    class: "boosts-switch",
    id: "boost-sepia-toggle",
  }) as HTMLInputElement;
  const sepiaLabelText = el("span", {}, [t("boosts.sepia")]);

  const sepiaRow = el("div", { class: "boosts-row" }, [
    el("label", { for: "boost-sepia-toggle", class: "boosts-label" }, [
      icon("book"),
      sepiaLabelText,
    ]),
    sepiaToggle,
  ]);

  const brightnessSlider = el("input", {
    type: "range",
    min: "-50",
    max: "50",
    step: "5",
    value: "0",
    class: "boosts-slider",
  }) as HTMLInputElement;
  const brightnessLabel = el("span", { class: "boosts-label" }, [t("boosts.brightness")]);
  const brightnessVal = el("span", { class: "boosts-slider-val" }, ["100%"]);

  const brightnessRow = el("div", { class: "boosts-slider-group" }, [
    el("div", { class: "boosts-slider-header" }, [brightnessLabel, brightnessVal]),
    brightnessSlider,
  ]);

  const contrastSlider = el("input", {
    type: "range",
    min: "-50",
    max: "50",
    step: "5",
    value: "0",
    class: "boosts-slider",
  }) as HTMLInputElement;
  const contrastLabel = el("span", { class: "boosts-label" }, [t("boosts.contrast")]);
  const contrastVal = el("span", { class: "boosts-slider-val" }, ["100%"]);

  const contrastRow = el("div", { class: "boosts-slider-group" }, [
    el("div", { class: "boosts-slider-header" }, [contrastLabel, contrastVal]),
    contrastSlider,
  ]);

  const cssLabel = el("span", { class: "boosts-label" }, [t("boosts.customCss")]);
  const cssInput = el("textarea", {
    class: "boosts-css-textarea",
    placeholder: t("boosts.cssPlaceholder"),
    rows: "3",
  }) as HTMLTextAreaElement;

  const cssGroup = el("div", { class: "boosts-css-group" }, [cssLabel, cssInput]);

  const zappedStatus = el("span", { class: "boosts-zapped-status" }, [""]);
  const restoreZapsBtn = el(
    "button",
    { class: "boosts-link-btn", type: "button" },
    [t("boosts.restoreZaps")],
  );

  const zapsRow = el("div", { class: "boosts-zaps-row" }, [zappedStatus, restoreZapsBtn]);

  const resetBtn = el(
    "button",
    { class: "boosts-reset-btn", type: "button" },
    [t("boosts.reset")],
  );

  element.append(
    header,
    zapperBtn,
    darkRow,
    sepiaRow,
    brightnessRow,
    contrastRow,
    cssGroup,
    zapsRow,
    resetBtn,
  );

  function applyLocale() {
    element.setAttribute("aria-label", t("boosts.title"));
    headerTitle.textContent = t("boosts.title");
    closeBtn.setAttribute("aria-label", t("boosts.close"));
    zapperTitle.textContent = t("boosts.zapperTitle");
    zapperDesc.textContent = t("boosts.zapperDesc");
    darkLabelText.textContent = t("boosts.darkMode");
    sepiaLabelText.textContent = t("boosts.sepia");
    brightnessLabel.textContent = t("boosts.brightness");
    contrastLabel.textContent = t("boosts.contrast");
    cssLabel.textContent = t("boosts.customCss");
    cssInput.placeholder = t("boosts.cssPlaceholder");
    restoreZapsBtn.textContent = t("boosts.restoreZaps");
    resetBtn.textContent = t("boosts.reset");
    if (currentDomain) {
      const zaps = getDomainZapRules(currentDomain);
      zappedStatus.textContent = t("boosts.zappedCount", { count: zaps.length });
    }
  }

  function syncValues() {
    if (!currentDomain) return;
    const boost = getDomainBoost(currentDomain);
    const zaps = getDomainZapRules(currentDomain);

    headerDomain.textContent = currentDomain;
    darkToggle.checked = boost.smartDarkMode;
    sepiaToggle.checked = boost.sepia;
    brightnessSlider.value = String(boost.brightness);
    brightnessVal.textContent = `${100 + boost.brightness}%`;
    contrastSlider.value = String(boost.contrast);
    contrastVal.textContent = `${100 + boost.contrast}%`;
    cssInput.value = boost.customCss;

    zappedStatus.textContent = t("boosts.zappedCount", { count: zaps.length });
    restoreZapsBtn.style.display = zaps.length > 0 ? "inline-block" : "none";
  }

  function commitAndApply() {
    if (!currentDomain || !currentTabId) return;
    setDomainBoost(currentDomain, {
      smartDarkMode: darkToggle.checked,
      sepia: sepiaToggle.checked,
      brightness: Number(brightnessSlider.value),
      contrast: Number(contrastSlider.value),
      customCss: cssInput.value,
    });
    applyBoostToTab(currentTabId, currentUrl);
  }

  darkToggle.addEventListener("change", () => commitAndApply());
  sepiaToggle.addEventListener("change", () => commitAndApply());

  brightnessSlider.addEventListener("input", () => {
    brightnessVal.textContent = `${100 + Number(brightnessSlider.value)}%`;
    commitAndApply();
  });

  contrastSlider.addEventListener("input", () => {
    contrastVal.textContent = `${100 + Number(contrastSlider.value)}%`;
    commitAndApply();
  });

  cssInput.addEventListener("input", () => commitAndApply());

  restoreZapsBtn.addEventListener("click", () => {
    if (!currentDomain) return;
    clearDomainZapRules(currentDomain);
    syncValues();
    applyBoostToTab(currentTabId, currentUrl);
  });

  resetBtn.addEventListener("click", () => {
    if (!currentDomain) return;
    resetDomainBoost(currentDomain);
    clearDomainZapRules(currentDomain);
    syncValues();
    applyBoostToTab(currentTabId, currentUrl);
  });

  zapperBtn.addEventListener("click", () => {
    if (!currentTabId) return;
    controller.close();
    webview.startElementZapper(currentTabId).catch(console.error);
  });

  closeBtn.addEventListener("click", () => controller.close());

  function onPointerDown(e: PointerEvent) {
    if (!element.contains(e.target as Node)) {
      controller.close();
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      controller.close();
    }
  }

  const unsubscribeLocale = subscribeLocale(() => applyLocale());

  const controller: BoostsPopoverController = {
    element,
    isOpen: () => open,
    open(tabId: string, url: string) {
      currentTabId = tabId;
      currentUrl = url;
      currentDomain = extractDomain(url);
      if (!currentDomain) return;

      open = true;
      syncValues();
      element.style.display = "flex";
      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("keydown", onKeyDown);
      onVisibilityChange?.();
    },
    close() {
      if (!open) return;
      open = false;
      element.style.display = "none";
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      onVisibilityChange?.();
    },
    destroy() {
      unsubscribeLocale();
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      element.remove();
    },
  };

  return controller;
}
