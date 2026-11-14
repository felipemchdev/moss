export interface Tab {
  id: string;
  title: string;
  url: string;
  active: boolean;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

export type TabPatch = Partial<Omit<Tab, "id" | "active">>;
type Listener = (tabs: readonly Tab[]) => void;

export const NEW_TAB_TITLE = "Nova aba";

let tabs: Tab[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener(tabs);
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

export function getActiveTab(): Tab | undefined {
  return tabs.find((tab) => tab.active);
}

export function createTab(initialUrl = ""): Tab {
  const tab: Tab = {
    id: String(nextId++),
    title: NEW_TAB_TITLE,
    url: initialUrl,
    active: true,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
  };
  tabs = [...tabs.map((t) => (t.active ? { ...t, active: false } : t)), tab];
  notify();
  return tab;
}

export function closeTab(id: string) {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index === -1) return;

  const wasActive = tabs[index].active;
  const remaining = tabs.filter((tab) => tab.id !== id);
  if (wasActive && remaining.length > 0) {
    const nextActive = remaining[Math.min(index, remaining.length - 1)];
    tabs = remaining.map((tab) => (tab === nextActive ? { ...tab, active: true } : tab));
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
