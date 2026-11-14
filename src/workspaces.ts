export interface Workspace {
  id: string;
  name: string;
  icon: string;
  color?: string;
  createdAt: number;
}

export type WorkspaceListener = (workspaces: readonly Workspace[], activeId: string) => void;

const WORKSPACES_STORAGE_KEY = "moss:workspaces";
const ACTIVE_WORKSPACE_STORAGE_KEY = "moss:active_workspace";

const DEFAULT_WORKSPACES: readonly Workspace[] = [
  { id: "default", name: "Pessoal", icon: "leaf", color: "#b8eb9a", createdAt: 1 },
  { id: "work", name: "Trabalho", icon: "briefcase", color: "#6eb54f", createdAt: 2 },
  { id: "dev", name: "Desenvolvimento", icon: "code", color: "#a7e286", createdAt: 3 },
];

let workspaces: Workspace[] = loadWorkspaces();
let activeWorkspaceId: string = loadActiveWorkspaceId();

const listeners = new Set<WorkspaceListener>();

function loadWorkspaces(): Workspace[] {
  try {
    const raw = localStorage.getItem(WORKSPACES_STORAGE_KEY);
    if (!raw) return [...DEFAULT_WORKSPACES];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [...DEFAULT_WORKSPACES];
    return parsed.filter(
      (w): w is Workspace =>
        typeof w === "object" &&
        w !== null &&
        typeof w.id === "string" &&
        typeof w.name === "string" &&
        typeof w.icon === "string",
    );
  } catch {
    return [...DEFAULT_WORKSPACES];
  }
}

function loadActiveWorkspaceId(): string {
  try {
    const raw = localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
    if (raw && workspaces.some((w) => w.id === raw)) return raw;
  } catch {
    /* ignore */
  }
  return workspaces[0]?.id ?? "default";
}

function persist() {
  try {
    localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(workspaces));
    localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, activeWorkspaceId);
  } catch {
    /* storage unavailable */
  }
}

function notify() {
  persist();
  const current = [...workspaces];
  for (const listener of listeners) {
    listener(current, activeWorkspaceId);
  }
}

export function subscribeWorkspaces(listener: WorkspaceListener): () => void {
  listeners.add(listener);
  listener([...workspaces], activeWorkspaceId);
  return () => listeners.delete(listener);
}

export function getWorkspaces(): readonly Workspace[] {
  return workspaces;
}

export function getWorkspace(id: string): Workspace | undefined {
  return workspaces.find((w) => w.id === id);
}

export function getActiveWorkspaceId(): string {
  return activeWorkspaceId;
}

export function getActiveWorkspace(): Workspace {
  return getWorkspace(activeWorkspaceId) ?? workspaces[0] ?? DEFAULT_WORKSPACES[0];
}

export function setActiveWorkspace(id: string): boolean {
  if (activeWorkspaceId === id) return false;
  const target = getWorkspace(id);
  if (!target) return false;
  activeWorkspaceId = id;
  notify();
  return true;
}

export function createWorkspace(
  name: string,
  icon = "folder",
  color = "#b8eb9a",
): Workspace {
  const trimmed = name.trim() || `Espaço ${workspaces.length + 1}`;
  const id = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const workspace: Workspace = {
    id,
    name: trimmed,
    icon,
    color,
    createdAt: Date.now(),
  };
  workspaces = [...workspaces, workspace];
  notify();
  return workspace;
}

export function updateWorkspace(
  id: string,
  patch: Partial<Omit<Workspace, "id" | "createdAt">>,
) {
  const current = getWorkspace(id);
  if (!current) return;
  const updated: Workspace = {
    ...current,
    name: patch.name !== undefined ? patch.name.trim() || current.name : current.name,
    icon: patch.icon ?? current.icon,
    color: patch.color ?? current.color,
  };
  workspaces = workspaces.map((w) => (w.id === id ? updated : w));
  notify();
}

export function deleteWorkspace(id: string): boolean {
  if (workspaces.length <= 1) return false;
  const index = workspaces.findIndex((w) => w.id === id);
  if (index === -1) return false;

  const wasActive = activeWorkspaceId === id;
  workspaces = workspaces.filter((w) => w.id !== id);

  if (wasActive) {
    activeWorkspaceId = workspaces[Math.min(index, workspaces.length - 1)].id;
  }
  notify();
  return true;
}

export function cycleWorkspace(step: number): Workspace {
  if (workspaces.length <= 1) return getActiveWorkspace();
  const currentIndex = workspaces.findIndex((w) => w.id === activeWorkspaceId);
  const targetIndex = (currentIndex + step + workspaces.length) % workspaces.length;
  const target = workspaces[targetIndex];
  setActiveWorkspace(target.id);
  return target;
}
