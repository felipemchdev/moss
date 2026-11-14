import { el } from "./dom";
import { icon } from "./icons";
import {
  getActivePlayingMedia,
  subscribeMedia,
  togglePlayPause,
  toggleMute,
  type TabMediaState,
} from "./media";

export interface MediaWidgetOptions {
  onSelectTab: (tabId: string) => void;
}

export function createMediaWidget(options: MediaWidgetOptions): HTMLElement {
  const coverIcon = el("span", { class: "media-widget-cover" }, [icon("play")]);
  const titleEl = el("span", { class: "media-widget-title" }, ["Tocando agora"]);
  const artistEl = el("span", { class: "media-widget-artist" }, ["Moss Player"]);

  const infoCol = el("div", { class: "media-widget-info" }, [titleEl, artistEl]);

  const playPauseBtn = el(
    "button",
    {
      class: "media-widget-btn media-widget-btn--play",
      type: "button",
      "aria-label": "Play / Pause",
      title: "Play / Pause",
    },
    [icon("pause")],
  );

  const muteBtn = el(
    "button",
    {
      class: "media-widget-btn media-widget-btn--mute",
      type: "button",
      "aria-label": "Silenciar",
      title: "Silenciar / Ativar som",
    },
    [icon("volume2")],
  );

  const controlsRow = el("div", { class: "media-widget-controls" }, [playPauseBtn, muteBtn]);

  const container = el(
    "div",
    {
      class: "sidebar-media-widget",
      style: "display: none;",
      role: "region",
      "aria-label": "Controles de mídia",
    },
    [coverIcon, infoCol, controlsRow],
  );

  let currentTabId: string | null = null;

  infoCol.addEventListener("click", () => {
    if (currentTabId) {
      options.onSelectTab(currentTabId);
    }
  });

  playPauseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (currentTabId) {
      togglePlayPause(currentTabId);
    }
  });

  muteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (currentTabId) {
      toggleMute(currentTabId);
    }
  });

  function render(media?: TabMediaState) {
    if (!media || (!media.hasMedia && !media.playing)) {
      container.style.display = "none";
      currentTabId = null;
      return;
    }

    currentTabId = media.tabId;
    container.style.display = "flex";

    titleEl.textContent = media.title || "Tocando áudio";
    titleEl.title = media.title || "Tocando áudio";
    artistEl.textContent = media.artist || "Aba com áudio";

    const playIconName = media.playing ? "pause" : "play";
    playPauseBtn.replaceChildren(icon(playIconName));
    playPauseBtn.setAttribute("aria-label", media.playing ? "Pausar" : "Reproduzir");

    const muteIconName = media.muted ? "volumeX" : "volume2";
    muteBtn.replaceChildren(icon(muteIconName));
    muteBtn.setAttribute("aria-label", media.muted ? "Ativar som" : "Silenciar");

    container.classList.toggle("sidebar-media-widget--playing", media.playing);
  }

  subscribeMedia(() => {
    render(getActivePlayingMedia());
  });

  render(getActivePlayingMedia());

  return container;
}
