import { t } from "./i18n";
import "./i18n-panels";
import { webview } from "./webview";

export type PermissionStatus = "ask" | "allow" | "block";
export type PermissionKey = "camera" | "microphone" | "geolocation" | "notifications";

export interface SitePermissions {
  camera: PermissionStatus;
  microphone: PermissionStatus;
  geolocation: PermissionStatus;
  notifications: PermissionStatus;
}

export function getPermissionLabel(key: PermissionKey): { title: string; description: string } {
  return {
    title: t(`perms.${key}.title`),
    description: t(`perms.${key}.description`),
  };
}

export const DEFAULT_PERMISSIONS: SitePermissions = {
  camera: "ask",
  microphone: "ask",
  geolocation: "ask",
  notifications: "ask",
};

const STORAGE_KEY = "moss:site_permissions";

type PermissionsListener = (domain: string, permissions: SitePermissions) => void;
const listeners = new Set<PermissionsListener>();

function loadAllPermissions(): Record<string, SitePermissions> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, SitePermissions>;
    }
  } catch (err) {
    console.error("[moss] Failed to load site permissions from localStorage:", err);
  }
  return {};
}

function saveAllPermissions(data: Record<string, SitePermissions>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error("[moss] Failed to save site permissions to localStorage:", err);
  }
}

function sanitizeStatus(status: unknown): PermissionStatus {
  if (status === "allow" || status === "block" || status === "ask") {
    return status;
  }
  return "ask";
}

export function getPermissionsForDomain(domain: string | null): SitePermissions {
  if (!domain) return { ...DEFAULT_PERMISSIONS };
  const all = loadAllPermissions();
  const raw = all[domain];
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_PERMISSIONS };
  }
  return {
    camera: sanitizeStatus(raw.camera),
    microphone: sanitizeStatus(raw.microphone),
    geolocation: sanitizeStatus(raw.geolocation),
    notifications: sanitizeStatus(raw.notifications),
  };
}

export function setPermission(
  domain: string,
  key: PermissionKey,
  status: PermissionStatus,
): SitePermissions {
  const all = loadAllPermissions();
  const current = getPermissionsForDomain(domain);
  const updated: SitePermissions = {
    ...current,
    [key]: status,
  };

  // If all are default "ask", remove the domain to keep localStorage clean
  const isAllDefault =
    updated.camera === "ask" &&
    updated.microphone === "ask" &&
    updated.geolocation === "ask" &&
    updated.notifications === "ask";

  if (isAllDefault) {
    delete all[domain];
  } else {
    all[domain] = updated;
  }

  saveAllPermissions(all);
  webview.setSitePermission(domain, key, status).catch(console.error);
  notify(domain, updated);
  return updated;
}

export function resetPermissionsForDomain(domain: string): void {
  const all = loadAllPermissions();
  delete all[domain];
  saveAllPermissions(all);
  webview.resetSitePermissions(domain).catch(console.error);
  notify(domain, { ...DEFAULT_PERMISSIONS });
}

export function syncAllPermissionsToBackend(): void {
  const all = loadAllPermissions();
  webview.syncSitePermissions(all).catch(console.error);
}

export function hasCustomPermissions(domain: string | null): boolean {
  if (!domain) return false;
  const p = getPermissionsForDomain(domain);
  return (
    p.camera !== "ask" ||
    p.microphone !== "ask" ||
    p.geolocation !== "ask" ||
    p.notifications !== "ask"
  );
}

function notify(domain: string, permissions: SitePermissions): void {
  for (const listener of listeners) {
    try {
      listener(domain, permissions);
    } catch (err) {
      console.error("[moss] Error in site permissions listener:", err);
    }
  }
}

export function subscribePermissions(listener: PermissionsListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
