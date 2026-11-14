import { invoke } from "@tauri-apps/api/core";

export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TabViewport {
  tabId: string;
  viewport: Viewport;
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
  showTabs: (tabIds: string[]) => call("show_tabs", { tabIds }),
  setTabViewports: (viewports: TabViewport[]) => call("set_tab_viewports", { viewports }),
  close: (tabId: string) => call("close_tab", { tabId }),
  setPrivacyShield: (enabled: boolean) => call("set_privacy_shield", { enabled }),
  syncTrackersBlocked: (tabId: string) => call("sync_tab_trackers_blocked", { tabId }),
  resetTrackersCount: () => call("reset_trackers_count"),
  exportDataFile: (filename: string, content: string) =>
    call("export_data_file", { filename, content }),
  findInPage: (
    tabId: string,
    query: string,
    forward = true,
    caseSensitive = false,
    findNext = false,
  ) =>
    call("find_in_page", { tabId, query, forward, caseSensitive, findNext }),
  clearFindInPage: (tabId: string) => call("clear_find_in_page", { tabId }),
  extractReaderContent: (tabId: string) => call("extract_reader_content", { tabId }),
  setTabZoom: (tabId: string, scaleFactor: number) =>
    call("set_tab_zoom", { tabId, scaleFactor }),
  clearTabData: (tabId: string) => call("clear_tab_data", { tabId }),
  setSitePermission: (domain: string, key: string, status: string) =>
    call("set_site_permission", { domain, key, status }),
  syncSitePermissions: (permissions: Record<string, unknown>) =>
    call("sync_site_permissions", { permissions }),
  resetSitePermissions: (domain: string) =>
    call("reset_site_permissions", { domain }),
  applyTabBoost: (tabId: string, css: string) =>
    call("apply_tab_boost", { tabId, css }),
  startElementZapper: (tabId: string) =>
    call("start_element_zapper", { tabId }),
};

export const windowControls = {
  minimize: () => call("minimize_window"),
  toggleMaximize: () => call("toggle_maximize_window"),
  close: () => call("close_window"),
};
