import { downloadDir } from "@tauri-apps/api/path";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { el } from "./dom";
import {
  clearDownloads,
  removeDownload,
  subscribeDownloads,
  type DownloadItem,
} from "./downloads";
import { icon } from "./icons";
import { createPanel, type Panel } from "./panel";

const timeFormat = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

function formatTimestamp(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return "Agora";
  if (diff < 3600_000) return `${Math.round(diff / 60_000)} min atrás`;
  return timeFormat.format(timestamp);
}

function renderDownloadItem(item: DownloadItem): HTMLElement {
  const title = el("div", { class: "download-item-title", title: item.filename }, [item.filename]);
  const meta = el("div", { class: "download-item-meta" });

  if (item.state === "started" || item.state === "progress") {
    const bar = el("div", { class: "download-progress-bar" }, [
      el("div", {
        class: "download-progress-fill",
        style: `width: ${Math.max(5, item.progress)}%`,
      }),
    ]);
    const label = el("span", { class: "download-item-status" }, [`Baixando: ${item.progress}%`]);
    meta.append(bar, label);
  } else if (item.state === "completed") {
    const timeLabel = item.completedAt ? formatTimestamp(item.completedAt) : "";
    meta.textContent = timeLabel ? `Concluído • ${timeLabel}` : "Concluído";
  } else {
    meta.textContent = "Falhou";
    meta.classList.add("download-item-meta--failed");
  }

  const actions = el("div", { class: "download-item-actions" });

  if (item.path) {
    const openBtn = el(
      "button",
      {
        class: "download-action-btn",
        type: "button",
        title: "Abrir arquivo",
        "aria-label": `Abrir ${item.filename}`,
      },
      [icon("externalLink")],
    );
    openBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (item.path) openPath(item.path).catch(console.error);
    });

    const folderBtn = el(
      "button",
      {
        class: "download-action-btn",
        type: "button",
        title: "Mostrar na pasta",
        "aria-label": `Mostrar ${item.filename} na pasta`,
      },
      [icon("folder")],
    );
    folderBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (item.path) revealItemInDir(item.path).catch(console.error);
    });

    actions.append(openBtn, folderBtn);
  }

  const deleteBtn = el(
    "button",
    {
      class: "download-action-btn download-action-btn--delete",
      type: "button",
      title: "Remover da lista",
      "aria-label": "Remover da lista",
    },
    [icon("close")],
  );
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    removeDownload(item.id);
  });
  actions.append(deleteBtn);

  const card = el("li", { class: `download-item download-item--${item.state}`, "data-id": item.id }, [
    el("div", { class: "download-item-icon" }, [icon(item.state === "completed" ? "file" : "download")]),
    el("div", { class: "download-item-info" }, [title, meta]),
    actions,
  ]);

  if (item.state === "completed" && item.path) {
    card.addEventListener("dblclick", () => {
      if (item.path) openPath(item.path).catch(console.error);
    });
  }

  return card;
}

export function createDownloadsPanel(onChange: () => void): Panel {
  const listEl = el("ul", { class: "downloads-list" });
  const emptyEl = el("div", { class: "downloads-empty" }, [
    el("div", { class: "downloads-empty-icon" }, [icon("download")]),
    el("p", { class: "downloads-empty-title" }, ["Nenhum download recente"]),
    el("span", { class: "downloads-empty-subtitle" }, ["Os arquivos baixados aparecerão aqui"]),
  ]);

  const openFolderBtn = el(
    "button",
    {
      class: "panel-header-btn",
      type: "button",
      title: "Abrir pasta de downloads",
      "aria-label": "Abrir pasta de downloads",
    },
    [icon("folder")],
  );
  openFolderBtn.addEventListener("click", async () => {
    try {
      const dir = await downloadDir();
      await openPath(dir);
    } catch (err) {
      console.error("Failed to open downloads dir:", err);
    }
  });

  const clearBtn = el(
    "button",
    {
      class: "panel-header-btn",
      type: "button",
      title: "Limpar histórico de downloads",
      "aria-label": "Limpar histórico de downloads",
    },
    [icon("trash")],
  );
  clearBtn.addEventListener("click", () => {
    clearDownloads();
  });

  const closeBtn = el(
    "button",
    {
      class: "panel-close",
      type: "button",
      "aria-label": "Fechar painel de downloads",
      title: "Fechar (Esc)",
    },
    [icon("close")],
  );

  const header = el("div", { class: "panel-header" }, [
    el("div", { class: "panel-header-title-group" }, [
      el("span", { class: "panel-header-icon" }, [icon("download")]),
      el("h2", { class: "panel-title" }, ["Downloads"]),
    ]),
    el("div", { class: "panel-header-actions" }, [openFolderBtn, clearBtn, closeBtn]),
  ]);

  const body = el("div", { class: "downloads-panel-body" }, [emptyEl, listEl]);

  const element = el("section", { class: "panel downloads-panel", "aria-label": "Downloads" }, [
    header,
    body,
  ]);

  function renderList(items: readonly DownloadItem[]) {
    listEl.replaceChildren();
    if (items.length === 0) {
      emptyEl.style.display = "flex";
      listEl.style.display = "none";
      clearBtn.style.display = "none";
    } else {
      emptyEl.style.display = "none";
      listEl.style.display = "flex";
      clearBtn.style.display = "inline-flex";
      for (const item of items) {
        listEl.append(renderDownloadItem(item));
      }
    }
  }

  subscribeDownloads((items) => {
    renderList(items);
  });

  const panel = createPanel({
    element,
    openClass: "downloads-panel--open",
    initialFocus: () => closeBtn,
    onChange,
  });

  closeBtn.addEventListener("click", () => panel.close());

  return panel;
}
