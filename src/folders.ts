import "./i18n-chrome";
import { t } from "./i18n";

export interface TabFolder {
  id: string;
  name: string;
  color?: string;
  isCollapsed: boolean;
  workspaceId: string;
  createdAt: number;
}

export function getFolderColors() {
  return [
    { name: t("folders.color.moss"), value: "#99bc58" },
    { name: t("folders.color.sky"), value: "#38bdf8" },
    { name: t("folders.color.sunset"), value: "#f97316" },
    { name: t("folders.color.lavender"), value: "#a855f7" },
    { name: t("folders.color.rose"), value: "#f43f5e" },
    { name: t("folders.color.emerald"), value: "#10b981" },
  ];
}

export const FOLDER_COLORS = getFolderColors();

const STORAGE_KEY = "moss:tab_folders";

type FolderListener = (folders: readonly TabFolder[]) => void;
const listeners = new Set<FolderListener>();

let folders: TabFolder[] = loadFolders();

function loadFolders(): TabFolder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (f): f is Record<string, unknown> =>
          typeof f === "object" &&
          f !== null &&
          typeof f.id === "string" &&
          typeof f.name === "string" &&
          typeof f.workspaceId === "string",
      )
      .map((f) => ({
        id: f.id as string,
        name: f.name as string,
        color: typeof f.color === "string" ? f.color : undefined,
        isCollapsed: Boolean(f.isCollapsed),
        workspaceId: f.workspaceId as string,
        createdAt: typeof f.createdAt === "number" ? f.createdAt : Date.now(),
      }));
  } catch {
    return [];
  }
}

function saveFolders() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(folders));
  } catch {
    /* storage unavailable */
  }
}

function notify() {
  saveFolders();
  for (const listener of listeners) {
    listener(folders);
  }
}

export function getFolders(): readonly TabFolder[] {
  return folders;
}

export function getFoldersForWorkspace(workspaceId: string): TabFolder[] {
  return folders.filter((f) => f.workspaceId === workspaceId);
}

export function getFolder(id: string): TabFolder | undefined {
  return folders.find((f) => f.id === id);
}

export function createFolder(name: string, workspaceId: string, color?: string): TabFolder {
  const trimmed = name.trim() || t("folders.defaultName");
  const palette = getFolderColors();
  const assignedColor = color ?? palette[folders.length % palette.length].value;
  const folder: TabFolder = {
    id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: trimmed,
    color: assignedColor,
    isCollapsed: false,
    workspaceId,
    createdAt: Date.now(),
  };
  folders = [...folders, folder];
  notify();
  return folder;
}

export function updateFolder(id: string, patch: Partial<Omit<TabFolder, "id">>) {
  const current = getFolder(id);
  if (!current) return;
  folders = folders.map((f) => (f.id === id ? { ...f, ...patch } : f));
  notify();
}

export function deleteFolder(id: string) {
  folders = folders.filter((f) => f.id !== id);
  notify();
}

export function toggleFolderCollapse(id: string): boolean {
  const folder = getFolder(id);
  if (!folder) return false;
  const next = !folder.isCollapsed;
  updateFolder(id, { isCollapsed: next });
  return next;
}

export function setFolderCollapsed(id: string, collapsed: boolean) {
  const folder = getFolder(id);
  if (!folder || folder.isCollapsed === collapsed) return;
  updateFolder(id, { isCollapsed: collapsed });
}

export function subscribeFolders(listener: FolderListener): () => void {
  listeners.add(listener);
  listener(folders);
  return () => listeners.delete(listener);
}
