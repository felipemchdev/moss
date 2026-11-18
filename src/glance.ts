import { el, hostnameOf } from "./dom";
import "./i18n-chrome";
import { subscribeLocale, t } from "./i18n";
import { icon } from "./icons";
import { webview, type Viewport } from "./webview";

export const GLANCE_TAB_ID = "__glance__";

export interface GlanceOptions {
  onPromote: (url: string) => void;
  onClose: () => void;
}

export interface GlanceController {
  overlay: HTMLElement;
  element: HTMLElement;
  isOpen: () => boolean;
  open: (url: string, title?: string) => void;
  close: () => void;
  syncViewport: () => void;
  destroy: () => void;
}

export function createGlance(options: GlanceOptions): GlanceController {
  let open = false;
  let currentUrl = "";
  let currentTitle = "";

  const titleEl = el("span", { class: "glance-title" }, [t("glance.loading")]);
  const urlEl = el("span", { class: "glance-url" }, [""]);

  const promoteText = el("span", { class: "glance-action-text" }, [t("glance.promoteText")]);
  const promoteBtn = el(
    "button",
    {
      class: "glance-action-btn",
      type: "button",
      title: t("glance.promoteTitle"),
      "aria-label": t("glance.promoteAria"),
    },
    [icon("externalLink"), promoteText],
  );

  const copyBtn = el(
    "button",
    {
      class: "glance-action-btn",
      type: "button",
      title: t("glance.copyLink"),
      "aria-label": t("glance.copyLink"),
    },
    [icon("copy")],
  );

  const closeBtn = el(
    "button",
    {
      class: "glance-close-btn",
      type: "button",
      title: t("glance.closeTitle"),
      "aria-label": t("glance.closeAria"),
    },
    [icon("close")],
  );

  const header = el("div", { class: "glance-header" }, [
    el("div", { class: "glance-info" }, [
      el("span", { class: "glance-badge" }, [icon("eye"), "Glance"]),
      el("div", { class: "glance-meta" }, [titleEl, urlEl]),
    ]),
    el("div", { class: "glance-actions" }, [promoteBtn, copyBtn, closeBtn]),
  ]);

  const webviewContainer = el("div", {
    class: "glance-webview-container",
    role: "region",
    "aria-label": t("glance.previewAria"),
  });

  const card = el("div", { class: "glance-card", role: "dialog", "aria-modal": "true" }, [
    header,
    webviewContainer,
  ]);

  const overlay = el("div", { class: "glance-overlay", style: "display: none;" }, [card]);

  function applyLocale() {
    if (!open || !currentTitle) {
      titleEl.textContent = t("glance.loading");
    }
    promoteBtn.title = t("glance.promoteTitle");
    promoteBtn.setAttribute("aria-label", t("glance.promoteAria"));
    promoteText.textContent = t("glance.promoteText");
    copyBtn.title = t("glance.copyLink");
    copyBtn.setAttribute("aria-label", t("glance.copyLink"));
    closeBtn.title = t("glance.closeTitle");
    closeBtn.setAttribute("aria-label", t("glance.closeAria"));
    webviewContainer.setAttribute("aria-label", t("glance.previewAria"));
  }

  function syncViewport() {
    if (!open) return;
    const rect = webviewContainer.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const viewport: Viewport = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };

    webview.setTabViewports([{ tabId: GLANCE_TAB_ID, viewport }]);
  }

  const resizeObserver = new ResizeObserver(() => {
    syncViewport();
  });

  promoteBtn.addEventListener("click", () => {
    if (!currentUrl) return;
    const urlToOpen = currentUrl;
    controller.close();
    options.onPromote(urlToOpen);
  });

  copyBtn.addEventListener("click", async () => {
    if (!currentUrl) return;
    try {
      await navigator.clipboard.writeText(currentUrl);
      copyBtn.title = t("glance.copied");
      copyBtn.classList.add("glance-action-btn--success");
      setTimeout(() => {
        copyBtn.title = t("glance.copyLink");
        copyBtn.classList.remove("glance-action-btn--success");
      }, 1500);
    } catch (err) {
      console.error("Failed to copy glance URL:", err);
    }
  });

  closeBtn.addEventListener("click", () => controller.close());

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      controller.close();
    }
  });

  function handleKeyDown(event: KeyboardEvent) {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      controller.close();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") {
      event.preventDefault();
      event.stopPropagation();
      if (currentUrl) {
        const urlToOpen = currentUrl;
        controller.close();
        options.onPromote(urlToOpen);
      }
    }
  }

  const unsubscribeLocale = subscribeLocale(() => applyLocale());

  const controller: GlanceController = {
    overlay,
    element: card,
    isOpen: () => open,
    open(url: string, title?: string) {
      currentUrl = url;
      currentTitle = title || hostnameOf(url);

      titleEl.textContent = currentTitle;
      urlEl.textContent = url;
      urlEl.title = url;

      open = true;
      overlay.style.display = "flex";
      resizeObserver.observe(webviewContainer);

      window.addEventListener("keydown", handleKeyDown, true);

      // Navigate to the target url in the isolated __glance__ webview
      webview.navigate(GLANCE_TAB_ID, url).then(() => {
        syncViewport();
        webview.showTabs([GLANCE_TAB_ID]);
      }).catch(console.error);

      // Force initial sync after next render tick
      requestAnimationFrame(() => {
        syncViewport();
        webview.showTabs([GLANCE_TAB_ID]);
      });
    },
    close() {
      if (!open) return;
      open = false;
      resizeObserver.unobserve(webviewContainer);
      window.removeEventListener("keydown", handleKeyDown, true);
      overlay.style.display = "none";

      webview.close(GLANCE_TAB_ID).catch(() => {});
      options.onClose();
    },
    syncViewport,
    destroy() {
      unsubscribeLocale();
      if (open) controller.close();
      resizeObserver.disconnect();
      overlay.remove();
    },
  };

  return controller;
}
