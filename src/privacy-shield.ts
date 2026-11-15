import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { el } from "./dom";
import { icon } from "./icons";
import { webview } from "./webview";

const STORAGE_KEY = "moss:shield_enabled";

export interface PrivacyShieldController {
  popover: HTMLElement;
  badge: HTMLElement;
  isOpen: () => boolean;
  open: (anchor?: HTMLElement) => void;
  close: () => void;
  toggle: (anchor?: HTMLElement) => void;
  isEnabled: () => boolean;
  getBlockedCount: () => number;
  getTabBlockedCount: (tabId: string) => number;
  clearTabCount: (tabId: string) => void;
  resetCount: () => void;
  destroy: () => void;
}

function loadEnabled(): boolean {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    return val !== "false";
  } catch {
    return true;
  }
}

function saveEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    /* storage unavailable */
  }
}

export function createPrivacyShield(
  anchorButton: HTMLElement,
  onChange?: () => void,
): PrivacyShieldController {
  let enabled = loadEnabled();
  let blockedCount = 0;
  let isOpen = false;
  let destroyed = false;

  invoke("set_privacy_shield", { enabled }).catch(() => {});

  const badge = el(
    "span",
    {
      class: "shield-badge",
      style: "display: none;",
      "aria-label": "Rastreadores bloqueados",
    },
    ["0"],
  );
  anchorButton.style.position = "relative";
  anchorButton.append(badge);

  const headerIcon = el(
    "span",
    { class: `shield-popover-icon ${enabled ? "shield-popover-icon--active" : "shield-popover-icon--inactive"}` },
    [icon("shield")],
  );
  const headerTitle = el("h3", { class: "shield-popover-title" }, ["Escudo de Privacidade"]);
  const header = el("header", { class: "shield-popover-header" }, [headerIcon, headerTitle]);

  const toggleLabel = el(
    "span",
    { class: "shield-toggle-label" },
    [enabled ? "Proteção Ativa" : "Proteção Pausada"],
  );
  const switchInput = el("input", {
    type: "checkbox",
    class: "shield-switch-input",
  }) as HTMLInputElement;
  switchInput.checked = enabled;
  const switchSlider = el("span", { class: "shield-switch-slider" });
  const switchContainer = el(
    "label",
    { class: "shield-switch", "aria-label": "Alternar proteção do escudo" },
    [switchInput, switchSlider],
  );
  const toggleRow = el("div", { class: "shield-toggle-row" }, [toggleLabel, switchContainer]);

  const counterNumber = el("span", { class: "shield-counter-number" }, ["0"]);
  const counterLabel = el("span", { class: "shield-counter-label" }, ["rastreadores bloqueados"]);
  const counterCard = el("div", { class: "shield-counter-card" }, [counterNumber, counterLabel]);

  const resetBtn = el(
    "button",
    { class: "shield-reset-btn", type: "button" },
    ["Zerar estatísticas"],
  );

  const popover = el(
    "div",
    {
      class: "shield-popover",
      role: "region",
      "aria-label": "Escudo de Privacidade",
      style: "display: none;",
    },
    [header, toggleRow, counterCard, resetBtn],
  );

  function updateUI() {
    switchInput.checked = enabled;
    toggleLabel.textContent = enabled ? "Proteção Ativa" : "Proteção Pausada";

    headerIcon.classList.toggle("shield-popover-icon--active", enabled);
    headerIcon.classList.toggle("shield-popover-icon--inactive", !enabled);

    counterNumber.textContent = String(blockedCount);

    if (blockedCount > 0) {
      badge.textContent = blockedCount > 99 ? "99+" : String(blockedCount);
      badge.style.display = "flex";
      badge.classList.toggle("shield-badge--disabled", !enabled);
    } else {
      badge.style.display = "none";
    }

    anchorButton.classList.toggle("footer-btn--shield-active", enabled);
    anchorButton.classList.toggle("footer-btn--shield-paused", !enabled);
  }

  function onPointerDown(event: PointerEvent) {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (popover.contains(target) || anchorButton.contains(target)) return;
    controller.close();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      controller.close();
    }
  }

  function positionPopover(anchor?: HTMLElement) {
    const target = anchor ?? anchorButton;
    const rect = target.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      popover.style.left = `${Math.round(rect.right + 12)}px`;
      const bottom = Math.max(12, Math.round(window.innerHeight - rect.bottom));
      popover.style.bottom = `${bottom}px`;
    } else {
      popover.style.left = "calc(var(--sidebar-width) + 12px)";
      popover.style.bottom = "12px";
    }
  }

  switchInput.addEventListener("change", () => {
    enabled = switchInput.checked;
    saveEnabled(enabled);
    invoke("set_privacy_shield", { enabled }).catch(() => {});
    updateUI();
    onChange?.();
  });

  const tabBlockedMap = new Map<string, number>();

  function performReset() {
    blockedCount = 0;
    tabBlockedMap.clear();
    invoke("reset_trackers_count").catch(() => {});
    updateUI();
    onChange?.();
  }

  resetBtn.addEventListener("click", performReset);

  let unlistenCount: UnlistenFn | null = null;

  listen<{ tabId?: string; count?: number }>("tracker-blocked-count", (event) => {
    if (destroyed || !enabled) return;
    const tabId = event.payload?.tabId;
    const count = event.payload?.count ?? 0;
    if (tabId) {
      tabBlockedMap.set(tabId, count);
      let sum = 0;
      for (const val of tabBlockedMap.values()) {
        sum += val;
      }
      blockedCount = sum;
    } else {
      blockedCount = Math.max(blockedCount, count);
    }
    updateUI();
    onChange?.();
  }).then((u) => {
    if (destroyed) u();
    else unlistenCount = u;
  }).catch(() => {});

  const controller: PrivacyShieldController = {
    popover,
    badge,
    isOpen: () => isOpen,
    open(anchor?: HTMLElement) {
      if (isOpen) return;
      isOpen = true;
      positionPopover(anchor);
      popover.style.display = "flex";
      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("keydown", onKeyDown);
      onChange?.();
    },
    close() {
      if (!isOpen) return;
      isOpen = false;
      popover.style.display = "none";
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      onChange?.();
    },
    toggle(anchor?: HTMLElement) {
      if (isOpen) controller.close();
      else controller.open(anchor);
    },
    isEnabled: () => enabled,
    getBlockedCount: () => blockedCount,
    getTabBlockedCount: (tabId: string) => tabBlockedMap.get(tabId) ?? 0,
    clearTabCount(tabId: string) {
      tabBlockedMap.delete(tabId);
      let sum = 0;
      for (const val of tabBlockedMap.values()) sum += val;
      blockedCount = sum;
      updateUI();
      onChange?.();
    },
    resetCount: performReset,
    destroy() {
      destroyed = true;
      controller.close();
      if (unlistenCount) unlistenCount();
      popover.remove();
      badge.remove();
    },
  };

  updateUI();
  return controller;
}

export const YOUTUBE_AD_CSS = `
  .video-ads,
  .ytp-ad-module,
  .ytp-ad-overlay-container,
  .ytp-ad-player-overlay,
  .ytp-ad-player-overlay-layout,
  ytd-ad-slot-renderer,
  ytd-banner-promo-renderer,
  ytd-in-feed-ad-layout-renderer,
  #player-ads,
  ytd-promoted-sparkles-web-renderer,
  ytd-player-legacy-desktop-watch-ads-renderer,
  #masthead-ad {
    display: none !important;
  }
`;

export function isYouTubeUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes("youtube.com") || parsed.hostname.includes("youtu.be");
  } catch {
    return url.includes("youtube.com") || url.includes("youtu.be");
  }
}

export function injectYouTubeShield(tabId: string): void {
  webview.applyTabBoost(tabId, YOUTUBE_AD_CSS, "__moss_yt_ad_style__");
}
