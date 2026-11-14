import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { el } from "./dom";

export interface DownloadPayload {
  filename?: string;
  name?: string;
  file?: string;
  path?: string;
  url?: string;
  progress?: number;
  total?: number;
  totalBytes?: number;
  current?: number;
  receivedBytes?: number;
  state?: "started" | "progress" | "finished" | "completed" | "failed";
}

export interface DownloadItem {
  id: string;
  filename: string;
  url?: string;
  path?: string;
  progress: number;
  state: "started" | "progress" | "completed" | "failed";
  startedAt: number;
  completedAt?: number;
}

export interface DownloadIndicator {
  element: HTMLElement;
  show: (filename: string, progress: number, isFinished?: boolean, failed?: boolean) => void;
  hide: () => void;
  isOpen: () => boolean;
  destroy: () => void;
}

const DOWNLOADS_STORAGE_KEY = "moss:downloads";
const MAX_SAVED_DOWNLOADS = 50;

function loadSavedDownloads(): DownloadItem[] {
  try {
    const raw = localStorage.getItem(DOWNLOADS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is DownloadItem =>
        typeof item === "object" && item !== null && typeof item.filename === "string",
    );
  } catch {
    return [];
  }
}

let downloads: DownloadItem[] = loadSavedDownloads();
const downloadListeners = new Set<(items: readonly DownloadItem[]) => void>();

function saveDownloads() {
  try {
    localStorage.setItem(DOWNLOADS_STORAGE_KEY, JSON.stringify(downloads.slice(0, MAX_SAVED_DOWNLOADS)));
  } catch {
    /* storage unavailable */
  }
}

function notifyDownloads() {
  saveDownloads();
  for (const listener of downloadListeners) {
    try {
      listener(downloads);
    } catch (e) {
      console.error(e);
    }
  }
}

export function getDownloads(): readonly DownloadItem[] {
  return downloads;
}

export function subscribeDownloads(listener: (items: readonly DownloadItem[]) => void): () => void {
  downloadListeners.add(listener);
  listener(downloads);
  return () => downloadListeners.delete(listener);
}

export function clearDownloads(): void {
  downloads = [];
  notifyDownloads();
}

export function removeDownload(id: string): void {
  downloads = downloads.filter((d) => d.id !== id);
  notifyDownloads();
}

export function recordDownloadEvent(payload: DownloadPayload, forceFinished = false): DownloadItem {
  const filename = extractFilename(payload);
  const failed = payload.state === "failed";
  const progress = failed ? 0 : forceFinished ? 100 : extractProgress(payload);
  const isFinished =
    !failed &&
    (forceFinished ||
      progress >= 100 ||
      payload.state === "finished" ||
      payload.state === "completed");

  const state: DownloadItem["state"] = failed
    ? "failed"
    : isFinished
      ? "completed"
      : "progress";

  const existingIndex = downloads.findIndex(
    (d) =>
      (payload.path && d.path === payload.path) ||
      (d.filename === filename && d.state === "progress"),
  );

  let item: DownloadItem;
  if (existingIndex !== -1) {
    item = {
      ...downloads[existingIndex],
      filename,
      path: payload.path || downloads[existingIndex].path,
      progress,
      state,
      completedAt: isFinished ? Date.now() : downloads[existingIndex].completedAt,
    };
    downloads = [
      item,
      ...downloads.filter((_, i) => i !== existingIndex),
    ];
  } else {
    item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      filename,
      url: payload.url,
      path: payload.path,
      progress,
      state,
      startedAt: Date.now(),
      completedAt: isFinished ? Date.now() : undefined,
    };
    downloads = [item, ...downloads];
  }

  notifyDownloads();
  return item;
}

function extractFilename(payload: DownloadPayload): string {
  const raw = payload.filename || payload.name || payload.file || payload.path || payload.url;
  if (!raw) return "arquivo.ext";
  const clean = raw.split(/[?#]/)[0];
  const parts = clean.split(/[/\\]/);
  const name = parts[parts.length - 1];
  return name || "arquivo.ext";
}

function extractProgress(payload: DownloadPayload): number {
  if (typeof payload.progress === "number") {
    if (payload.progress > 0 && payload.progress <= 1) {
      return Math.round(payload.progress * 100);
    }
    return Math.round(payload.progress);
  }
  const current = payload.current ?? payload.receivedBytes;
  const total = payload.total ?? payload.totalBytes;
  if (typeof current === "number" && typeof total === "number" && total > 0) {
    return Math.min(100, Math.round((current / total) * 100));
  }
  return 0;
}

export function initDownloads(root: HTMLElement = document.body): DownloadIndicator {
  const textNode = el("span", { class: "download-pill__text" });
  const pill = el(
    "div",
    {
      class: "download-pill",
      role: "status",
      "aria-live": "polite",
      style: "display: none;",
    },
    [textNode],
  );

  root.append(pill);

  let dismissTimer: number | null = null;
  let hideAnimationTimer: number | null = null;

  function hide() {
    if (hideAnimationTimer !== null) clearTimeout(hideAnimationTimer);
    pill.classList.add("download-pill--hiding");
    hideAnimationTimer = window.setTimeout(() => {
      pill.style.display = "none";
      pill.classList.remove("download-pill--hiding");
      hideAnimationTimer = null;
    }, 300);
  }

  function scheduleDismiss() {
    if (dismissTimer !== null) {
      window.clearTimeout(dismissTimer);
    }
    dismissTimer = window.setTimeout(() => {
      hide();
      dismissTimer = null;
    }, 4000);
  }

  function show(filename: string, progress: number, isFinished = false, failed = false) {
    if (dismissTimer !== null) {
      window.clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    if (hideAnimationTimer !== null) {
      window.clearTimeout(hideAnimationTimer);
      hideAnimationTimer = null;
      pill.classList.remove("download-pill--hiding");
    }

    if (failed) {
      textNode.textContent = `Falhou: ${filename}`;
    } else if (isFinished || progress >= 100) {
      textNode.textContent = `Concluído: ${filename}`;
    } else if (progress > 0) {
      textNode.textContent = `Baixando: ${filename} (${progress}%)`;
    } else {
      textNode.textContent = `Baixando: ${filename}...`;
    }
    pill.style.display = "flex";

    if (failed || isFinished || progress >= 100) {
      scheduleDismiss();
    }
  }

  let destroyed = false;
  const unlistenFns: UnlistenFn[] = [];

  function handleDownloadEvent(payload: DownloadPayload, forceFinished = false) {
    const item = recordDownloadEvent(payload, forceFinished);
    show(item.filename, item.progress, item.state === "completed", item.state === "failed");
  }

  function registerListener(event: string, forceFinished = false) {
    listen<DownloadPayload>(event, ({ payload }) => {
      handleDownloadEvent(payload ?? {}, forceFinished);
    })
      .then((unlisten) => {
        if (destroyed) {
          unlisten();
        } else {
          unlistenFns.push(unlisten);
        }
      })
      .catch(() => {});
  }

  registerListener("download-started");
  registerListener("download-progress");
  registerListener("download-finished", true);
  registerListener("download-completed", true);
  registerListener("moss://download");

  if (
    (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV &&
    typeof window !== "undefined"
  ) {
    (window as unknown as { mossDownload?: (filename: string, progress: number, finished?: boolean) => void }).mossDownload = (
      name: string,
      prog: number,
      fin?: boolean,
    ) => {
      recordDownloadEvent({ filename: name, progress: prog, state: fin ? "completed" : "progress" }, fin);
      show(name, prog, fin);
    };
  }

  return {
    element: pill,
    show,
    hide,
    isOpen: () => pill.style.display !== "none" && !pill.classList.contains("download-pill--hiding"),
    destroy() {
      destroyed = true;
      if (dismissTimer !== null) window.clearTimeout(dismissTimer);
      if (hideAnimationTimer !== null) window.clearTimeout(hideAnimationTimer);
      for (const unlisten of unlistenFns) unlisten();
      unlistenFns.length = 0;
      pill.remove();
    },
  };
}
