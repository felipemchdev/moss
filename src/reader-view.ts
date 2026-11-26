import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { el } from "./dom";
import { subscribeLocale, t } from "./i18n";
import "./i18n-panels";
import { icon } from "./icons";
import { isWebUrl } from "./storage";
import { webview } from "./webview";

export type ReaderTheme = "dark" | "light" | "sepia";
export type ReaderFont = "sans" | "serif" | "mono";
export type ReaderWidth = "compact" | "normal" | "wide";

export interface ReaderSettings {
  theme: ReaderTheme;
  font: ReaderFont;
  fontSize: number; // 14-24, default 17
  width: ReaderWidth;
}

export interface ReaderContentPayload {
  tabId: string;
  success: boolean;
  title: string;
  byline: string;
  siteName: string;
  contentHtml: string;
  wordCount: number;
  readingTimeMinutes: number;
}

export interface ReaderViewOptions {
  onOpen?: () => void;
  onClose?: () => void;
  onNavigate?: (url: string) => void;
}

export interface ReaderView {
  element: HTMLElement;
  open: (tabId: string) => void;
  close: () => void;
  isOpen: () => boolean;
  getActiveTabId: () => string | null;
  cycleTheme: () => void;
  cycleFont: () => void;
  adjustFontSize: (delta: number) => void;
  destroy: () => void;
}

const SETTINGS_STORAGE_KEY = "moss:reader_settings";

const DEFAULT_SETTINGS: ReaderSettings = {
  theme: "dark",
  font: "serif",
  fontSize: 17,
  width: "normal",
};

function loadSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      theme: ["dark", "light", "sepia"].includes(parsed.theme) ? parsed.theme : "dark",
      font: ["sans", "serif", "mono"].includes(parsed.font) ? parsed.font : "serif",
      fontSize: typeof parsed.fontSize === "number" ? Math.min(24, Math.max(14, parsed.fontSize)) : 17,
      width: ["compact", "normal", "wide"].includes(parsed.width) ? parsed.width : "normal",
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function persistSettings(settings: ReaderSettings) {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

function sanitizeReaderHtml(rawHtml: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, "text/html");
    const dangerousTags = doc.querySelectorAll("base, meta, link, script, style, iframe, object, embed, form, input, button, textarea, select");
    for (const tag of dangerousTags) tag.remove();

    const dropAttrs = /^(style|srcdoc|srcset|formaction)$/i;
    for (const elem of doc.querySelectorAll("*")) {
      for (const attr of [...elem.attributes]) {
        const name = attr.name.toLowerCase();
        const val = attr.value.toLowerCase().replace(/[\x00-\x20\s]/g, "");
        if (name.startsWith("on") || dropAttrs.test(name) || val.startsWith("javascript:")) {
          elem.removeAttribute(attr.name);
        }
      }
    }
    return doc.body.innerHTML;
  } catch {
    return `<p>${t("reader.unsafeBody")}</p>`;
  }
}

export function createReaderView(options: ReaderViewOptions): ReaderView {
  let settings = loadSettings();
  let activeTabId: string | null = null;
  let destroyed = false;
  let unlisten: UnlistenFn | null = null;
  let extractionTimeout: number | null = null;
  let lastPayload: ReaderContentPayload | null = null;
  let isPending = false;

  function clearExtractionTimeout() {
    if (extractionTimeout !== null) {
      window.clearTimeout(extractionTimeout);
      extractionTimeout = null;
    }
  }

  const fontSansBtn = el("button", { type: "button", class: "reader-font-btn", "data-font": "sans", role: "radio" }, ["Sans"]);
  const fontSerifBtn = el("button", { type: "button", class: "reader-font-btn", "data-font": "serif", role: "radio" }, ["Serif"]);
  const fontMonoBtn = el("button", { type: "button", class: "reader-font-btn", "data-font": "mono", role: "radio" }, ["Mono"]);
  const fontGroup = el("div", { class: "reader-group reader-group--font", role: "radiogroup", "aria-label": t("reader.fontFamily") }, [
    fontSansBtn,
    fontSerifBtn,
    fontMonoBtn,
  ]);

  const sizeDecBtn = el("button", {
    type: "button",
    class: "reader-btn reader-size-btn",
    "aria-label": t("reader.decrease"),
    title: t("reader.decrease"),
  }, ["A−"]);

  const sizeLabel = el("span", { class: "reader-size-label" }, [`${settings.fontSize}px`]);

  const sizeIncBtn = el("button", {
    type: "button",
    class: "reader-btn reader-size-btn",
    "aria-label": t("reader.increase"),
    title: t("reader.increase"),
  }, ["A+"]);

  const sizeGroup = el("div", { class: "reader-group reader-group--size" }, [
    sizeDecBtn,
    sizeLabel,
    sizeIncBtn,
  ]);

  const widthBtn = el("button", {
    type: "button",
    class: "reader-btn reader-width-btn",
    "aria-label": t("reader.width"),
    title: t("reader.widthTitle"),
  }, ["↔"]);

  const themeDarkSwatch = el("button", {
    type: "button",
    class: "reader-swatch reader-swatch--dark",
    "data-theme": "dark",
    role: "radio",
    "aria-label": t("reader.themeDark"),
    title: t("reader.themeDarkTitle"),
  });
  const themeLightSwatch = el("button", {
    type: "button",
    class: "reader-swatch reader-swatch--light",
    "data-theme": "light",
    role: "radio",
    "aria-label": t("reader.themeLight"),
    title: t("reader.themeLightTitle"),
  });
  const themeSepiaSwatch = el("button", {
    type: "button",
    class: "reader-swatch reader-swatch--sepia",
    "data-theme": "sepia",
    role: "radio",
    "aria-label": t("reader.themeSepia"),
    title: t("reader.themeSepiaTitle"),
  });

  const themeGroup = el("div", { class: "reader-group reader-group--theme", role: "radiogroup", "aria-label": t("reader.themeGroup") }, [
    themeDarkSwatch,
    themeLightSwatch,
    themeSepiaSwatch,
  ]);

  const closeBtn = el("button", {
    type: "button",
    class: "reader-btn reader-close-btn",
    "aria-label": t("reader.close"),
    title: t("reader.closeTitle"),
  }, [icon("close")]);

  const toolbarPill = el("div", { class: "reader-toolbar-pill" }, [
    fontGroup,
    el("span", { class: "reader-toolbar-divider" }),
    sizeGroup,
    el("span", { class: "reader-toolbar-divider" }),
    widthBtn,
    el("span", { class: "reader-toolbar-divider" }),
    themeGroup,
    el("span", { class: "reader-toolbar-divider" }),
    closeBtn,
  ]);

  const toolbar = el("header", { class: "reader-toolbar" }, [toolbarPill]);

  const siteNameEl = el("span", { class: "reader-site-name" });
  const metaDotEl = el("span", { class: "reader-meta-dot" }, ["•"]);
  const readingTimeEl = el("span", { class: "reader-reading-time" });
  const metaPill = el("div", { class: "reader-meta-pill" }, [siteNameEl, metaDotEl, readingTimeEl]);

  const titleEl = el("h1", { class: "reader-article-title" });
  const bylineEl = el("div", { class: "reader-article-byline" });
  const articleHeader = el("header", { class: "reader-article-header" }, [
    metaPill,
    titleEl,
    bylineEl,
  ]);

  const articleBody = el("div", { class: "reader-article-body" });
  const article = el("article", { class: "reader-article" }, [articleHeader, articleBody]);
  const scrollContainer = el("main", { class: "reader-scroll-container" }, [article]);

  const container = el("div", {
    class: "reader-view",
    role: "region",
    "aria-label": t("reader.region"),
    style: "display: none;",
  }, [toolbar, scrollContainer]);

  function applySettings() {
    container.setAttribute("data-reader-theme", settings.theme);
    container.setAttribute("data-reader-font", settings.font);
    container.setAttribute("data-reader-width", settings.width);
    container.style.setProperty("--reader-font-size", `${settings.fontSize}px`);
    sizeLabel.textContent = `${settings.fontSize}px`;

    // Update active states
    for (const btn of [fontSansBtn, fontSerifBtn, fontMonoBtn]) {
      const active = btn.getAttribute("data-font") === settings.font;
      btn.classList.toggle("reader-font-btn--active", active);
      btn.setAttribute("aria-checked", String(active));
    }

    for (const swatch of [themeDarkSwatch, themeLightSwatch, themeSepiaSwatch]) {
      const active = swatch.getAttribute("data-theme") === settings.theme;
      swatch.classList.toggle("reader-swatch--active", active);
      swatch.setAttribute("aria-checked", String(active));
    }

    persistSettings(settings);
  }

  function applyLocale() {
    container.setAttribute("aria-label", t("reader.region"));
    fontGroup.setAttribute("aria-label", t("reader.fontFamily"));
    fontSansBtn.setAttribute("aria-label", t("reader.fontSans"));
    fontSerifBtn.setAttribute("aria-label", t("reader.fontSerif"));
    fontMonoBtn.setAttribute("aria-label", t("reader.fontMono"));
    sizeDecBtn.setAttribute("aria-label", t("reader.decrease"));
    sizeDecBtn.setAttribute("title", t("reader.decrease"));
    sizeIncBtn.setAttribute("aria-label", t("reader.increase"));
    sizeIncBtn.setAttribute("title", t("reader.increase"));
    widthBtn.setAttribute("aria-label", t("reader.width"));
    widthBtn.setAttribute("title", t("reader.widthTitle"));
    themeGroup.setAttribute("aria-label", t("reader.themeGroup"));
    themeDarkSwatch.setAttribute("aria-label", t("reader.themeDark"));
    themeDarkSwatch.setAttribute("title", t("reader.themeDarkTitle"));
    themeLightSwatch.setAttribute("aria-label", t("reader.themeLight"));
    themeLightSwatch.setAttribute("title", t("reader.themeLightTitle"));
    themeSepiaSwatch.setAttribute("aria-label", t("reader.themeSepia"));
    themeSepiaSwatch.setAttribute("title", t("reader.themeSepiaTitle"));
    closeBtn.setAttribute("aria-label", t("reader.close"));
    closeBtn.setAttribute("title", t("reader.closeTitle"));
    if (activeTabId) {
      if (isPending) renderPending();
      else renderPayload(lastPayload);
    }
  }

  function renderPending() {
    titleEl.textContent = t("reader.loadingTitle");
    siteNameEl.textContent = "moss";
    metaDotEl.style.display = "";
    readingTimeEl.textContent = t("reader.loadingTime");
    bylineEl.style.display = "none";
    articleBody.replaceChildren(
      el("div", { class: "reader-loading-skeleton" }, [
        el("p", {}, [t("reader.loadingSkeleton")]),
      ]),
    );
  }

  function renderTimeout() {
    titleEl.textContent = t("reader.timeoutTitle");
    metaDotEl.style.display = "none";
    readingTimeEl.textContent = "";
    articleBody.replaceChildren(el("p", { class: "reader-empty" }, [t("reader.timeoutBody")]));
  }

  function renderPayload(data: ReaderContentPayload | null) {
    if (!data) return;
    if (!data.success) {
      titleEl.textContent = data.title || t("reader.failedTitle");
      siteNameEl.textContent = data.siteName || "moss";
      metaDotEl.style.display = "none";
      readingTimeEl.textContent = "";
      bylineEl.style.display = "none";
      const parser = new DOMParser();
      const text = data.contentHtml
        ? (parser.parseFromString(data.contentHtml, "text/html").body.textContent || "") ||
          t("reader.failedBody")
        : t("reader.failedBody");
      const emptyMsg = el("p", { class: "reader-empty" }, [text]);
      articleBody.replaceChildren(emptyMsg);
      return;
    }

    titleEl.textContent = data.title;
    siteNameEl.textContent = data.siteName || "moss";
    metaDotEl.style.display = "";
    readingTimeEl.textContent = t("reader.readingTime", {
      minutes: data.readingTimeMinutes,
      words: data.wordCount,
    });

    if (data.byline) {
      bylineEl.textContent = t("reader.byline", { byline: data.byline });
      bylineEl.style.display = "";
    } else {
      bylineEl.textContent = "";
      bylineEl.style.display = "none";
    }

    articleBody.innerHTML = sanitizeReaderHtml(data.contentHtml);
    scrollContainer.scrollTop = 0;
  }

  // Event handlers
  fontSansBtn.addEventListener("click", () => {
    settings.font = "sans";
    applySettings();
  });
  fontSerifBtn.addEventListener("click", () => {
    settings.font = "serif";
    applySettings();
  });
  fontMonoBtn.addEventListener("click", () => {
    settings.font = "mono";
    applySettings();
  });

  sizeDecBtn.addEventListener("click", () => {
    settings.fontSize = Math.max(14, settings.fontSize - 1);
    applySettings();
  });
  sizeIncBtn.addEventListener("click", () => {
    settings.fontSize = Math.min(24, settings.fontSize + 1);
    applySettings();
  });

  widthBtn.addEventListener("click", () => {
    const nextWidth: Record<ReaderWidth, ReaderWidth> = {
      compact: "normal",
      normal: "wide",
      wide: "compact",
    };
    settings.width = nextWidth[settings.width];
    applySettings();
  });

  themeDarkSwatch.addEventListener("click", () => {
    settings.theme = "dark";
    applySettings();
  });
  themeLightSwatch.addEventListener("click", () => {
    settings.theme = "light";
    applySettings();
  });
  themeSepiaSwatch.addEventListener("click", () => {
    settings.theme = "sepia";
    applySettings();
  });

  closeBtn.addEventListener("click", () => {
    readerView.close();
  });

  articleBody.addEventListener("click", (e) => {
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;
    const rawHref = anchor.getAttribute("href") || "";
    if (rawHref.startsWith("#")) {
      e.preventDefault();
      let id = "";
      try {
        id = decodeURIComponent(rawHref.slice(1));
      } catch {
        id = rawHref.slice(1);
      }
      if (!id) return;
      const target =
        articleBody.querySelector(`[id="${CSS.escape(id)}"]`) ??
        articleBody.querySelector(`[name="${CSS.escape(id)}"]`);
      target?.scrollIntoView({ behavior: "smooth" });
      return; // always exit - never treat a fragment as a web URL
    }
    e.preventDefault();
    if (isWebUrl(anchor.href)) {
      readerView.close();
      options.onNavigate?.(anchor.href);
    }
  });

  listen<ReaderContentPayload>("reader-content-result", (event) => {
    if (destroyed || !activeTabId) return;
    if (event.payload.tabId !== activeTabId) return;

    clearExtractionTimeout();
    isPending = false;
    lastPayload = event.payload;
    renderPayload(lastPayload);
  }).then((fn) => {
    if (destroyed) fn();
    else unlisten = fn;
  });

  applySettings();
  applyLocale();

  subscribeLocale(applyLocale);

  const readerView: ReaderView = {
    element: container,
    open(tabId: string) {
      if (activeTabId === tabId) return;
      activeTabId = tabId;
      container.style.display = "flex";

      clearExtractionTimeout();
      isPending = true;
      lastPayload = null;

      renderPending();

      options.onOpen?.();

      extractionTimeout = window.setTimeout(() => {
        if (activeTabId === tabId && articleBody.querySelector(".reader-loading-skeleton")) {
          isPending = false;
          renderTimeout();
        }
      }, 4000);

      webview.extractReaderContent(tabId);
    },
    close() {
      if (!activeTabId) return;
      clearExtractionTimeout();
      activeTabId = null;
      isPending = false;
      lastPayload = null;
      container.style.display = "none";
      options.onClose?.();
    },
    isOpen: () => activeTabId !== null,
    getActiveTabId: () => activeTabId,
    cycleTheme() {
      const themes: ReaderTheme[] = ["dark", "light", "sepia"];
      const nextIdx = (themes.indexOf(settings.theme) + 1) % themes.length;
      settings.theme = themes[nextIdx];
      applySettings();
    },
    cycleFont() {
      const fonts: ReaderFont[] = ["sans", "serif", "mono"];
      const nextIdx = (fonts.indexOf(settings.font) + 1) % fonts.length;
      settings.font = fonts[nextIdx];
      applySettings();
    },
    adjustFontSize(delta: number) {
      settings.fontSize = Math.min(24, Math.max(14, settings.fontSize + delta));
      applySettings();
    },
    destroy() {
      destroyed = true;
      clearExtractionTimeout();
      readerView.close();
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
      container.remove();
    },
  };

  return readerView;
}
