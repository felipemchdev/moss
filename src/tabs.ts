import { getActiveWorkspaceId } from "./workspaces";

const PINNED_STORAGE_KEY = "moss:pinned_tabs";

export interface Tab {
  id: string;
  title: string;
  url: string;
  active: boolean;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isPinned: boolean;
  workspaceId?: string;
}

export type TabPatch = Partial<Omit<Tab, "id" | "active">>;
type Listener = (tabs: readonly Tab[]) => void;

export const NEW_TAB_TITLE = "Nova aba";

let tabs: Tab[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener(tabs);
  savePinnedUrls();
}

function savePinnedUrls() {
  try {
    const pinned = tabs.filter((t) => t.isPinned && t.url).map((t) => t.url);
    localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(pinned));
  } catch {
    /* storage unavailable */
  }
}

export function loadPinnedUrls(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string" && v.length > 0);
  } catch {
    return [];
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener(tabs);
  return () => listeners.delete(listener);
}

export function getTabs(): readonly Tab[] {
  return tabs;
}

export function getTab(id: string): Tab | undefined {
  return tabs.find((tab) => tab.id === id);
}

export function getActiveTab(workspaceId = getActiveWorkspaceId()): Tab | undefined {
  const isVisibleInWs = (t: Tab) => t.isPinned || (t.workspaceId ?? "default") === workspaceId;
  const active = tabs.find((tab) => tab.active && isVisibleInWs(tab));
  if (active) return active;
  const first = tabs.find(isVisibleInWs);
  return first;
}

export function getTabsForWorkspace(workspaceId: string): readonly Tab[] {
  return tabs.filter((t) => t.isPinned || (t.workspaceId ?? "default") === workspaceId);
}

export function createTab(initialUrl = "", pinned = false, workspaceId?: string): Tab {
  const curWsId = getActiveWorkspaceId();
  const wsId = workspaceId ?? (pinned ? undefined : curWsId);
  const shouldActivate = pinned || wsId === curWsId;

  const tab: Tab = {
    id: String(nextId++),
    title: NEW_TAB_TITLE,
    url: initialUrl,
    active: shouldActivate,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    isPinned: pinned,
    workspaceId: wsId,
  };

  tabs = shouldActivate
    ? [...tabs.map((t) => (t.active ? { ...t, active: false } : t)), tab]
    : [...tabs, tab];

  notify();
  return tab;
}

export function closeTab(id: string) {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index === -1) return;

  const closed = tabs[index];
  const wasActive = closed.active;
  const wsId = closed.workspaceId ?? getActiveWorkspaceId();
  const remaining = tabs.filter((tab) => tab.id !== id);

  if (wasActive && remaining.length > 0) {
    const sameWs = remaining.filter((t) => (t.workspaceId ?? "default") === wsId);
    if (sameWs.length > 0) {
      const wsTabsBefore = tabs.filter((t) => (t.workspaceId ?? "default") === wsId);
      const localIndex = wsTabsBefore.findIndex((t) => t.id === id);
      const nextActive = sameWs[Math.min(Math.max(0, localIndex), sameWs.length - 1)];
      tabs = remaining.map((tab) => (tab === nextActive ? { ...tab, active: true } : tab));
    } else {
      const nextActive = remaining[Math.min(index, remaining.length - 1)];
      tabs = remaining.map((tab) => (tab === nextActive ? { ...tab, active: true } : tab));
    }
  } else {
    tabs = remaining;
  }
  notify();
}

export function selectTab(id: string) {
  if (!getTab(id) || getTab(id)?.active) return;
  tabs = tabs.map((tab) =>
    tab.active !== (tab.id === id) ? { ...tab, active: tab.id === id } : tab,
  );
  notify();
}

export function updateTab(id: string, patch: TabPatch) {
  const current = getTab(id);
  if (!current) return;
  const changed = (Object.keys(patch) as (keyof TabPatch)[]).some(
    (key) => patch[key] !== current[key],
  );
  if (!changed) return;
  tabs = tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab));
  notify();
}

export function togglePinTab(id: string) {
  const tab = getTab(id);
  if (!tab) return;
  const nextPinned = !tab.isPinned;
  const patch: TabPatch = { isPinned: nextPinned };
  if (!nextPinned && !tab.workspaceId) {
    patch.workspaceId = getActiveWorkspaceId();
  }
  updateTab(id, patch);
}

export function moveTabToWorkspace(tabId: string, targetWorkspaceId: string) {
  const tab = getTab(tabId);
  if (!tab || tab.workspaceId === targetWorkspaceId) return;
  tabs = tabs.map((t) => (t.id === tabId ? { ...t, workspaceId: targetWorkspaceId } : t));
  notify();
}
