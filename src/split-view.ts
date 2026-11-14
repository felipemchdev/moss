import { el } from "./dom";
import { icon } from "./icons";
import type { TabViewport, Viewport } from "./webview";

export interface SplitState {
  active: boolean;
  primaryTabId: string | null;
  secondaryTabId: string | null;
  focusedPane: "primary" | "secondary";
  ratio: number;
}

type SplitListener = (state: Readonly<SplitState>) => void;

let state: SplitState = {
  active: false,
  primaryTabId: null,
  secondaryTabId: null,
  focusedPane: "primary",
  ratio: 0.5,
};

const listeners = new Set<SplitListener>();

function notify() {
  const current = Object.freeze({ ...state });
  for (const listener of listeners) {
    listener(current);
  }
}

export function subscribeSplit(listener: SplitListener): () => void {
  listeners.add(listener);
  listener(Object.freeze({ ...state }));
  return () => listeners.delete(listener);
}

export function getSplitState(): Readonly<SplitState> {
  return state;
}

export function isSplitActive(): boolean {
  return state.active && Boolean(state.primaryTabId && state.secondaryTabId);
}

export function getSecondaryTabId(): string | null {
  return state.active ? state.secondaryTabId : null;
}

export function getFocusedPane(): "primary" | "secondary" {
  return state.focusedPane;
}

export function getActiveSplitTabId(): string | null {
  if (!state.active) return null;
  return state.focusedPane === "secondary" ? state.secondaryTabId : state.primaryTabId;
}

export function setFocusedPane(pane: "primary" | "secondary") {
  if (state.focusedPane === pane) return;
  state = { ...state, focusedPane: pane };
  notify();
}

export function openSplit(
  primaryTabId: string,
  secondaryTabId: string,
  focusedPane: "primary" | "secondary" = "secondary",
) {
  if (primaryTabId === secondaryTabId) return;
  state = {
    active: true,
    primaryTabId,
    secondaryTabId,
    focusedPane,
    ratio: state.ratio || 0.5,
  };
  notify();
}

export function closeSplit() {
  if (!state.active) return;
  state = {
    ...state,
    active: false,
    secondaryTabId: null,
    focusedPane: "primary",
  };
  notify();
}

export function toggleSplit(primaryTabId: string, fallbackSecondaryTabId?: string) {
  if (state.active) {
    closeSplit();
  } else if (fallbackSecondaryTabId && fallbackSecondaryTabId !== primaryTabId) {
    openSplit(primaryTabId, fallbackSecondaryTabId);
  }
}

export function swapPanes() {
  if (!state.active || !state.primaryTabId || !state.secondaryTabId) return;
  state = {
    ...state,
    primaryTabId: state.secondaryTabId,
    secondaryTabId: state.primaryTabId,
    focusedPane: state.focusedPane === "primary" ? "secondary" : "primary",
  };
  notify();
}

export function setSplitRatio(ratio: number) {
  const clamped = Math.min(0.8, Math.max(0.2, ratio));
  if (Math.abs(clamped - state.ratio) < 0.001) return;
  state = { ...state, ratio: clamped };
  notify();
}

export function handleTabClosedInSplit(closedTabId: string): boolean {
  if (!state.active) return false;
  if (state.secondaryTabId === closedTabId) {
    closeSplit();
    return true;
  }
  if (state.primaryTabId === closedTabId) {
    if (state.secondaryTabId) {
      state = {
        active: false,
        primaryTabId: state.secondaryTabId,
        secondaryTabId: null,
        focusedPane: "primary",
        ratio: 0.5,
      };
      notify();
      return true;
    }
    closeSplit();
    return true;
  }
  return false;
}

export const SPLIT_GAP = 8;

export function computeSplitViewports(
  containerRect: DOMRect,
  primaryTabId: string,
  secondaryTabId: string,
  ratio = 0.5,
  gap = SPLIT_GAP,
): TabViewport[] {
  const clampedRatio = Math.min(0.8, Math.max(0.2, ratio));
  const totalWidth = Math.max(1, containerRect.width);
  const totalHeight = Math.max(1, containerRect.height);

  const availableWidth = Math.max(1, totalWidth - gap);
  const leftWidth = Math.max(1, Math.round(availableWidth * clampedRatio));
  const rightWidth = Math.max(1, totalWidth - leftWidth - gap);
  const rightX = Math.round(containerRect.left + leftWidth + gap);

  const leftViewport: Viewport = {
    x: Math.round(containerRect.left),
    y: Math.round(containerRect.top),
    width: leftWidth,
    height: Math.round(totalHeight),
  };

  const rightViewport: Viewport = {
    x: rightX,
    y: Math.round(containerRect.top),
    width: rightWidth,
    height: Math.round(totalHeight),
  };

  return [
    { tabId: primaryTabId, viewport: leftViewport },
    { tabId: secondaryTabId, viewport: rightViewport },
  ];
}

export interface SplitDividerCallbacks {
  onResize: (ratio: number) => void;
  onSwap: () => void;
  onClose: () => void;
}

export function createSplitDivider(callbacks: SplitDividerCallbacks): HTMLElement {
  const swapBtn = el(
    "button",
    {
      class: "split-handle-btn split-handle-btn--swap",
      type: "button",
      "aria-label": "Trocar painéis de lado",
      title: "Trocar painéis",
    },
    [icon("swap")],
  );

  const closeBtn = el(
    "button",
    {
      class: "split-handle-btn split-handle-btn--close",
      type: "button",
      "aria-label": "Fechar tela dividida",
      title: "Fechar tela dividida",
    },
    [icon("close")],
  );

  swapBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    callbacks.onSwap();
  });

  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    callbacks.onClose();
  });

  const handle = el("div", { class: "split-divider-handle" }, [swapBtn, closeBtn]);

  const divider = el(
    "div",
    {
      class: "split-divider",
      role: "separator",
      "aria-orientation": "vertical",
      "aria-label": "Redimensionar painéis",
      tabindex: "0",
    },
    [handle],
  );

  let isDragging = false;
  let rafId: number | null = null;

  const onPointerMove = (e: PointerEvent) => {
    if (!isDragging) return;
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      if (!isDragging) return;
      const parent = divider.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      if (rect.width <= 0) return;
      const newRatio = (e.clientX - rect.left) / rect.width;
      callbacks.onResize(newRatio);
    });
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!isDragging) return;
    isDragging = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    divider.classList.remove("split-divider--dragging");
    try {
      divider.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  };

  divider.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest(".split-handle-btn")) return;
    isDragging = true;
    divider.classList.add("split-divider--dragging");
    try {
      divider.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    e.preventDefault();
  });

  divider.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      callbacks.onResize(state.ratio - 0.02);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      callbacks.onResize(state.ratio + 0.02);
    } else if (e.key === "Home") {
      e.preventDefault();
      callbacks.onResize(0.5);
    }
  });

  return divider;
}
