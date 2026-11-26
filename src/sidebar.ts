const STORAGE_KEY = "moss:sidebar_collapsed";
const AUTOHIDE_KEY = "moss:sidebar_autohide";

type SidebarListener = (collapsed: boolean) => void;
const listeners: SidebarListener[] = [];

let collapsed = false;
let autoHide = false;

try {
  collapsed = localStorage.getItem(STORAGE_KEY) === "true";
  autoHide = localStorage.getItem(AUTOHIDE_KEY) === "true";
} catch {
  collapsed = false;
  autoHide = false;
}

function notify(): void {
  for (const listener of listeners) {
    try {
      listener(collapsed);
    } catch (e) {
      console.error("Error in sidebar listener:", e);
    }
  }
}

export function isSidebarCollapsed(): boolean {
  return collapsed;
}

export function setSidebarCollapsed(value: boolean): void {
  if (collapsed === value) return;
  collapsed = value;
  try {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  } catch {}
  notify();
}

export function toggleSidebar(): boolean {
  setSidebarCollapsed(!collapsed);
  return collapsed;
}

export function isSidebarAutoHide(): boolean {
  return autoHide;
}

export function setSidebarAutoHide(value: boolean): void {
  if (autoHide === value) return;
  autoHide = value;
  try {
    localStorage.setItem(AUTOHIDE_KEY, String(autoHide));
  } catch {}
}

export function toggleSidebarAutoHide(): boolean {
  setSidebarAutoHide(!autoHide);
  return autoHide;
}

export function subscribeSidebar(listener: SidebarListener): () => void {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}
