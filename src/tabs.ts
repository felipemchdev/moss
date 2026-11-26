import "./i18n-chrome";
import { subscribeLocale, t } from "./i18n";
import { getActiveWorkspaceId } from "./workspaces";

const PINNED_STORAGE_KEY = "moss:pinned_tabs";
const CLOSED_TABS_STORAGE_KEY = "moss:closed_tabs_stack";
const SESSION_STORAGE_KEY = "moss:open_session";
const MAX_CLOSED_TABS = 30;

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
  folderId?: string;
  isSleeping?: boolean;
  lastAccessedAt?: number;
  isPrivate?: boolean;
}

export interface ClosedTab {
  url: string;
  title: string;
  workspaceId?: string;
  isPinned: boolean;
  closedAt: number;
  folderId?: string;
}

export interface SessionTab {
  url: string;
  title: string;
  workspaceId?: string;
  isPinned: boolean;
  active: boolean;
  folderId?: string;
}

export type TabPatch = Partial<Omit<Tab, "id" | "active">>;
type Listener = (tabs: readonly Tab[]) => void;

export function getNewTabTitle(): string {
  return t("tabs.newTab");
}

export function getPrivateTabTitle(): string {
  return t("tabs.privateTab");
}

export function isNewTabTitle(title: string): boolean {
  return title === "Nova aba" || title === "New tab" || title === t("tabs.newTab");
}

function isDefaultBlankTabTitle(title: string): boolean {
  return (
    isNewTabTitle(title) ||
    title === "Guia Anônima" ||
    title === "Private Tab" ||
    title === t("tabs.privateTab")
  );
}

let tabs: Tab[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function isRestorableUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed === "about:blank") return false;
  return !trimmed.startsWith("javascript:") && !trimmed.startsWith("data:");
}

function loadClosedTabs(): ClosedTab[] {
  try {
    const raw = localStorage.getItem(CLOSED_TABS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is ClosedTab =>
        typeof item === "object" &&
        item !== null &&
        typeof item.url === "string" &&
        typeof item.title === "string",
    );
  } catch {
    return [];
  }
}

let closedTabsStack: ClosedTab[] = loadClosedTabs();

function saveClosedTabs() {
  try {
    localStorage.setItem(CLOSED_TABS_STORAGE_KEY, JSON.stringify(closedTabsStack));
  } catch {
    /* storage unavailable */
  }
}

function notify() {
  for (const listener of listeners) listener(tabs);
  savePinnedUrls();
  saveSession();
}

function savePinnedUrls() {
  try {
    const pinned = tabs.filter((t) => !t.isPrivate && t.isPinned && t.url).map((t) => t.url);
    localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(pinned));
  } catch {
    /* storage unavailable */
  }
}

export function saveSession(): void {
  try {
    const sessionTabs: SessionTab[] = tabs
      .filter((t) => !t.isPrivate && t.url && isRestorableUrl(t.url))
      .map((t) => ({
        url: t.url,
        title: t.title,
        workspaceId: t.workspaceId,
        isPinned: t.isPinned,
        active: t.active,
        folderId: t.folderId,
      }));
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionTabs));
  } catch {
    /* storage unavailable */
  }
}

export function loadSession(): SessionTab[] {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SessionTab =>
        typeof item === "object" &&
        item !== null &&
        typeof item.url === "string",
    );
  } catch {
    return [];
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
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

export function createTab(
  initialUrl = "",
  pinned = false,
  workspaceId?: string,
  folderId?: string,
  isPrivate = false,
): Tab {
  const curWsId = getActiveWorkspaceId();
  const wsId = workspaceId ?? (pinned ? undefined : curWsId);
  const shouldActivate = pinned || wsId === curWsId;

  const tab: Tab = {
    id: String(nextId++),
    title: isPrivate && !initialUrl ? getPrivateTabTitle() : getNewTabTitle(),
    url: initialUrl,
    active: shouldActivate,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    isPinned: pinned,
    workspaceId: wsId,
    folderId,
    isSleeping: false,
    lastAccessedAt: Date.now(),
    isPrivate,
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
  if (!closed.isPrivate && closed.url && isRestorableUrl(closed.url)) {
    closedTabsStack.push({
      url: closed.url,
      title: closed.title || getNewTabTitle(),
      workspaceId: closed.workspaceId,
      isPinned: closed.isPinned,
      folderId: closed.folderId,
      closedAt: Date.now(),
    });
    if (closedTabsStack.length > MAX_CLOSED_TABS) {
      closedTabsStack.shift();
    }
    saveClosedTabs();
  }

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

export function reopenLastClosedTab(): Tab | undefined {
  if (closedTabsStack.length === 0) return undefined;
  const closed = closedTabsStack.pop();
  saveClosedTabs();
  if (!closed) return undefined;

  const tab = createTab(closed.url, closed.isPinned, closed.workspaceId, closed.folderId);
  if (closed.title && !isDefaultBlankTabTitle(closed.title)) {
    updateTab(tab.id, { title: closed.title });
  }
  selectTab(tab.id);
  return tab;
}

export function getClosedTabsCount(): number {
  return closedTabsStack.length;
}

export function getClosedTabs(): readonly ClosedTab[] {
  return closedTabsStack;
}

export function clearClosedTabs(): void {
  closedTabsStack = [];
  saveClosedTabs();
}

export function selectTab(id: string) {
  const current = getTab(id);
  if (!current) return;
  tabs = tabs.map((tab) =>
    tab.id === id
      ? { ...tab, active: true, isSleeping: false, lastAccessedAt: Date.now() }
      : tab.active
        ? { ...tab, active: false }
        : tab,
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

export function setTabFolder(tabId: string, folderId?: string) {
  const tab = getTab(tabId);
  if (!tab || tab.folderId === folderId) return;
  updateTab(tabId, { folderId });
}

export function sleepTab(tabId: string): boolean {
  const tab = getTab(tabId);
  if (!tab || tab.active || tab.isSleeping) return false;
  updateTab(tabId, { isSleeping: true });
  return true;
}

export function wakeTab(tabId: string) {
  const tab = getTab(tabId);
  if (!tab || !tab.isSleeping) return;
  updateTab(tabId, { isSleeping: false, lastAccessedAt: Date.now() });
}

export function getTabsInFolder(folderId: string): readonly Tab[] {
  return tabs.filter((t) => t.folderId === folderId);
}

export function sleepTabsInFolder(folderId: string): string[] {
  const folderTabs = tabs.filter((t) => t.folderId === folderId && !t.active && !t.isSleeping);
  const ids: string[] = [];
  for (const t of folderTabs) {
    if (sleepTab(t.id)) ids.push(t.id);
  }
  return ids;
}

export function getSleepingTabsCount(): number {
  return tabs.filter((t) => t.isSleeping).length;
}

export function getInactiveTabs(olderThanMs = 20 * 60 * 1000): readonly Tab[] {
  const now = Date.now();
  return tabs.filter(
    (t) =>
      !t.active &&
      !t.isPinned &&
      !t.isSleeping &&
      now - (t.lastAccessedAt ?? 0) > olderThanMs,
  );
}

subscribeLocale(() => {
  let changed = false;
  tabs = tabs.map((tab) => {
    if (!tab.url && isDefaultBlankTabTitle(tab.title)) {
      const nextTitle = tab.isPrivate ? getPrivateTabTitle() : getNewTabTitle();
      if (tab.title !== nextTitle) {
        changed = true;
        return { ...tab, title: nextTitle };
      }
    }
    return tab;
  });
  if (changed) notify();
});
