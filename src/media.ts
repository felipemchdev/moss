import { webview } from "./webview";

export interface TabMediaState {
  tabId: string;
  hasMedia: boolean;
  playing: boolean;
  title: string;
  artist: string;
  muted: boolean;
  updatedAt: number;
}

type MediaListener = () => void;
const listeners = new Set<MediaListener>();

const mediaStates = new Map<string, TabMediaState>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

export function getMediaStateForTab(tabId: string): TabMediaState | undefined {
  return mediaStates.get(tabId);
}

export function getAllMediaStates(): readonly TabMediaState[] {
  return Array.from(mediaStates.values());
}

export function getActivePlayingMedia(): TabMediaState | undefined {
  // First prefer any tab actively playing sound
  const playing = Array.from(mediaStates.values()).find((m) => m.playing);
  if (playing) return playing;

  // Otherwise return the most recent tab that has media
  const withMedia = Array.from(mediaStates.values())
    .filter((m) => m.hasMedia)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return withMedia[0];
}

export function updateTabMediaState(payload: Omit<TabMediaState, "updatedAt">) {
  const current = mediaStates.get(payload.tabId);
  const updated: TabMediaState = {
    ...payload,
    updatedAt: Date.now(),
  };

  if (!payload.hasMedia && !payload.playing) {
    if (current) {
      mediaStates.delete(payload.tabId);
      notify();
    }
    return;
  }

  mediaStates.set(payload.tabId, updated);
  notify();
}

export function clearTabMediaState(tabId: string) {
  if (mediaStates.delete(tabId)) {
    notify();
  }
}

export function togglePlayPause(tabId: string) {
  const current = mediaStates.get(tabId);
  if (!current) return;
  webview.toggleTabMediaPlayback(tabId).catch(console.error);
  // Optimistic update
  mediaStates.set(tabId, { ...current, playing: !current.playing, updatedAt: Date.now() });
  notify();
}

export function toggleMute(tabId: string) {
  const current = mediaStates.get(tabId);
  if (!current) return;
  const nextMuted = !current.muted;
  webview.setTabMuted(tabId, nextMuted).catch(console.error);
  // Optimistic update
  mediaStates.set(tabId, { ...current, muted: nextMuted, updatedAt: Date.now() });
  notify();
}

export function subscribeMedia(listener: MediaListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
