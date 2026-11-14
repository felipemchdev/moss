import { webview } from "./webview";

export const DEFAULT_ZOOM = 1.0;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 5.0;

export const ZOOM_STEPS = [
  0.25, 0.33, 0.50, 0.67, 0.75, 0.80, 0.90,
  1.00,
  1.10, 1.25, 1.50, 1.75, 2.00, 2.50, 3.00, 4.00, 5.00,
] as const;

const STORAGE_KEY = "moss:domain_zoom";
const EPSILON = 0.005;

/** In-memory cache of current zoom factor per tabId */
const tabZooms = new Map<string, number>();

type ZoomListener = (tabId: string, zoomFactor: number) => void;
const listeners = new Set<ZoomListener>();

import { getDomainFromUrl } from "./dom";
export { getDomainFromUrl };

export function isDefaultZoom(factor: number): boolean {
  return Math.abs(factor - DEFAULT_ZOOM) < EPSILON;
}

export function formatZoomPercent(factor: number): string {
  return `${Math.round(factor * 100)}%`;
}

function loadDomainZooms(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, number>;
    }
  } catch (err) {
    console.error("[moss] Failed to load domain zooms from localStorage:", err);
  }
  return {};
}

function saveDomainZoom(domain: string, factor: number): void {
  const store = loadDomainZooms();
  if (isDefaultZoom(factor)) {
    delete store[domain];
  } else {
    store[domain] = factor;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (err) {
    console.error("[moss] Failed to save domain zoom to localStorage:", err);
  }
}

export function getStoredDomainZoom(domain: string): number | null {
  const store = loadDomainZooms();
  const val = store[domain];
  if (typeof val === "number" && !isNaN(val) && val >= MIN_ZOOM && val <= MAX_ZOOM) {
    return val;
  }
  return null;
}

export function getZoomForTab(tabId: string, url?: string | null): number {
  const cached = tabZooms.get(tabId);
  if (cached !== undefined) {
    return cached;
  }
  const domain = getDomainFromUrl(url);
  if (domain) {
    const stored = getStoredDomainZoom(domain);
    if (stored !== null) {
      tabZooms.set(tabId, stored);
      return stored;
    }
  }
  return DEFAULT_ZOOM;
}

export function getNextZoomIn(current: number): number {
  for (const step of ZOOM_STEPS) {
    if (step > current + EPSILON) {
      return step;
    }
  }
  return MAX_ZOOM;
}

export function getNextZoomOut(current: number): number {
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
    const step = ZOOM_STEPS[i];
    if (step < current - EPSILON) {
      return step;
    }
  }
  return MIN_ZOOM;
}

function notify(tabId: string, factor: number): void {
  for (const listener of listeners) {
    try {
      listener(tabId, factor);
    } catch (err) {
      console.error("[moss] Error in zoom listener:", err);
    }
  }
}

export function subscribeZoom(listener: ZoomListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function setTabZoom(tabId: string, factor: number, url?: string | null): Promise<number> {
  const safeFactor =
    typeof factor !== "number" || isNaN(factor) || !isFinite(factor) || factor <= 0
      ? DEFAULT_ZOOM
      : factor;
  const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, safeFactor));
  tabZooms.set(tabId, clamped);

  const domain = getDomainFromUrl(url);
  if (domain) {
    saveDomainZoom(domain, clamped);
  }

  try {
    await webview.setTabZoom(tabId, clamped);
  } catch (err) {
    console.error("[moss] Failed to invoke set_tab_zoom IPC:", err);
  }
  notify(tabId, clamped);
  return clamped;
}

export async function zoomIn(tabId: string, url?: string | null): Promise<number> {
  const current = getZoomForTab(tabId, url);
  const next = getNextZoomIn(current);
  return setTabZoom(tabId, next, url);
}

export async function zoomOut(tabId: string, url?: string | null): Promise<number> {
  const current = getZoomForTab(tabId, url);
  const next = getNextZoomOut(current);
  return setTabZoom(tabId, next, url);
}

export async function resetZoom(tabId: string, url?: string | null): Promise<number> {
  return setTabZoom(tabId, DEFAULT_ZOOM, url);
}

export async function applyZoomForTab(
  tabId: string,
  url?: string | null,
  force = false,
): Promise<number> {
  const domain = getDomainFromUrl(url);
  let factor = DEFAULT_ZOOM;
  if (domain) {
    const stored = getStoredDomainZoom(domain);
    if (stored !== null) {
      factor = stored;
    }
  }
  const previous = tabZooms.get(tabId);
  tabZooms.set(tabId, factor);
  if (previous !== factor || force) {
    try {
      await webview.setTabZoom(tabId, factor);
    } catch (err) {
      console.error("[moss] Failed to invoke set_tab_zoom IPC in applyZoomForTab:", err);
    }
    notify(tabId, factor);
  }
  return factor;
}

export function clearTabZoom(tabId: string): void {
  tabZooms.delete(tabId);
}
