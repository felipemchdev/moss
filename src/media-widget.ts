import { el } from "./dom";
import "./i18n-chrome";
import { subscribeLocale, t } from "./i18n";
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

export interface MediaWidgetController {
  element: HTMLElement;
  destroy: () => void;
}

export type MediaWidget = HTMLElement & MediaWidgetController;

export function createMediaWidget(options: MediaWidgetOptions): MediaWidget {
  const coverIcon = el("span", { class: "media-widget-cover" }, [icon("play")]);
  const titleEl = el("span", { class: "media-widget-title" }, [t("media.nowPlaying")]);
  const artistEl = el("span", { class: "media-widget-artist" }, [t("media.defaultPlayer")]);

  const infoCol = el("div", { class: "media-widget-info" }, [titleEl, artistEl]);

  const playPauseBtn = el(
    "button",
    {
      class: "media-widget-btn media-widget-btn--play",
      type: "button",
      "aria-label": t("media.playPause"),
      title: t("media.playPause"),
    },
    [icon("pause")],
  );

  const muteBtn = el(
    "button",
    {
      class: "media-widget-btn media-widget-btn--mute",
      type: "button",
      "aria-label": t("media.mute"),
      title: t("media.muteToggle"),
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
      "aria-label": t("media.controlsAria"),
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
    container.setAttribute("aria-label", t("media.controlsAria"));
    playPauseBtn.title = t("media.playPause");
    muteBtn.title = t("media.muteToggle");

    if (!media || (!media.hasMedia && !media.playing)) {
      container.style.display = "none";
      currentTabId = null;
      return;
    }

    currentTabId = media.tabId;
    container.style.display = "flex";

    titleEl.textContent = media.title || t("media.playingAudio");
    titleEl.title = media.title || t("media.playingAudio");
    artistEl.textContent = media.artist || t("media.tabWithAudio");

    const playIconName = media.playing ? "pause" : "play";
    playPauseBtn.replaceChildren(icon(playIconName));
    playPauseBtn.setAttribute("aria-label", media.playing ? t("media.pause") : t("media.play"));

    const muteIconName = media.muted ? "volumeX" : "volume2";
    muteBtn.replaceChildren(icon(muteIconName));
    muteBtn.setAttribute("aria-label", media.muted ? t("media.unmute") : t("media.mute"));

    container.classList.toggle("sidebar-media-widget--playing", media.playing);
  }

  const unsubscribe = subscribeMedia(() => {
    render(getActivePlayingMedia());
  });
  const unsubscribeLocale = subscribeLocale(() => {
    render(getActivePlayingMedia());
  });

  render(getActivePlayingMedia());

  function destroy() {
    unsubscribe();
    unsubscribeLocale();
    container.remove();
  }

  const widget = Object.assign(container, {
    element: container,
    destroy,
  });

  return widget;
}
