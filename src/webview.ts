import { invoke } from "@tauri-apps/api/core";

export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

function call(command: string, args: Record<string, unknown> = {}) {
  const pending = invoke(command, args);
  pending.catch((error) => console.error(`[moss] ${command} failed:`, error));
  return pending;
}

export const webview = {
  setViewport: (viewport: Viewport) => call("set_viewport", { viewport }),
  navigate: (tabId: string, url: string) => call("navigate_to", { tabId, url }),
  reload: (tabId: string) => call("reload_page", { tabId }),
  back: (tabId: string) => call("go_back", { tabId }),
  forward: (tabId: string) => call("go_forward", { tabId }),
  show: (tabId: string | null) => call("show_tab", { tabId }),
  close: (tabId: string) => call("close_tab", { tabId }),
  setPrivacyShield: (enabled: boolean) => call("set_privacy_shield", { enabled }),
  syncTrackersBlocked: (tabId: string) => call("sync_tab_trackers_blocked", { tabId }),
  resetTrackersCount: () => call("reset_trackers_count"),
};

export const windowControls = {
  minimize: () => call("minimize_window"),
  toggleMaximize: () => call("toggle_maximize_window"),
  close: () => call("close_window"),
};
