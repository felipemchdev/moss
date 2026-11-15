import { el, getDomainFromUrl } from "./dom";
import { icon, type IconName } from "./icons";
import {
  getPermissionsForDomain,
  hasCustomPermissions,
  PERMISSION_LABELS,
  resetPermissionsForDomain,
  setPermission,
  type PermissionKey,
  type PermissionStatus,
} from "./site-permissions";
import { webview } from "./webview";

export interface SiteInfoOptions {
  tabId: string;
  url: string;
  trackersBlocked?: number;
}

export function createSiteInfoPopover(onVisibilityChange: () => void) {
  let isOpen = false;
  let currentTabId = "";
  let currentUrl = "";
  let currentTrackers = 0;
  let confirmingClear = false;

  const overlay = el("div", {
    class: "site-info-overlay",
    "aria-hidden": "true",
    style: "display: none;",
  });

  const popover = el("div", {
    class: "site-info-popover",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": "Informações e permissões do site",
    style: "display: none;",
  });

  function getSecurityStatus(rawUrl: string): {
    iconName: IconName;
    label: string;
    sublabel: string;
    level: "secure" | "insecure" | "local";
  } {
    if (!rawUrl) {
      return {
        iconName: "globe",
        label: "Página em branco",
        sublabel: "Nenhum site carregado",
        level: "local",
      };
    }
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol === "https:") {
        return {
          iconName: "lock",
          label: "Conexão Segura",
          sublabel: "As informações enviadas a este site são criptografadas e privadas.",
          level: "secure",
        };
      }
      if (parsed.protocol === "http:") {
        return {
          iconName: "unlock",
          label: "Conexão Não Segura",
          sublabel: "Você não deve inserir informações confidenciais neste site (senhas, cartões).",
          level: "insecure",
        };
      }
      return {
        iconName: "globe",
        label: "Arquivo Local",
        sublabel: "Página local ou interna do navegador.",
        level: "local",
      };
    } catch {
      return {
        iconName: "globe",
        label: "Página Interna",
        sublabel: "Origem local do navegador.",
        level: "local",
      };
    }
  }

  function renderContent() {
    popover.replaceChildren();

    const domain = getDomainFromUrl(currentUrl);
    const security = getSecurityStatus(currentUrl);
    const permissions = getPermissionsForDomain(domain);

    const closeBtn = el(
      "button",
      {
        class: "site-info-close-btn",
        type: "button",
        "aria-label": "Fechar",
        title: "Fechar (Esc)",
      },
      [icon("close")],
    );
    closeBtn.addEventListener("click", close);

    const header = el("div", { class: "site-info-header" }, [
      el("div", { class: "site-info-header-titles" }, [
        el("div", { class: "site-info-domain" }, [domain ?? "moss://local"]),
        el("div", { class: `site-info-badge site-info-badge--${security.level}` }, [
          icon(security.iconName),
          el("span", {}, [security.label]),
        ]),
      ]),
      closeBtn,
    ]);

    const securityDesc = el("p", { class: "site-info-desc" }, [security.sublabel]);

    const privacyCard = el("div", { class: "site-info-privacy-card" }, [
      el("div", { class: "site-info-privacy-icon" }, [icon("shield")]),
      el("div", { class: "site-info-privacy-text" }, [
        el("span", { class: "site-info-privacy-count" }, [
          `${currentTrackers} rastreador${currentTrackers === 1 ? "" : "es"} bloqueado${currentTrackers === 1 ? "" : "s"}`,
        ]),
        el("span", { class: "site-info-privacy-sub" }, ["Escudo nativo de proteção ativo"]),
      ]),
    ]);

    const permKeys: PermissionKey[] = ["camera", "microphone", "geolocation", "notifications"];
    const permRows = permKeys.map((key) => {
      const meta = PERMISSION_LABELS[key];
      const iconName: IconName =
        key === "camera"
          ? "camera"
          : key === "microphone"
          ? "mic"
          : key === "geolocation"
          ? "pinLocation"
          : "bell";

      const select = el("select", {
        class: "site-perm-select",
        "aria-label": meta.title,
      }) as HTMLSelectElement;

      const opts: { value: PermissionStatus; label: string }[] = [
        { value: "ask", label: "Perguntar" },
        { value: "allow", label: "Permitir" },
        { value: "block", label: "Bloquear" },
      ];

      for (const opt of opts) {
        const optionEl = el("option", { value: opt.value }, [opt.label]) as HTMLOptionElement;
        if (permissions[key] === opt.value) {
          optionEl.selected = true;
        }
        select.appendChild(optionEl);
      }

      select.addEventListener("change", () => {
        if (!domain) return;
        setPermission(domain, key, select.value as PermissionStatus);
      });

      return el("div", { class: "site-perm-row" }, [
        el("div", { class: "site-perm-info" }, [
          el("span", { class: "site-perm-icon" }, [icon(iconName)]),
          el("div", {}, [
            el("div", { class: "site-perm-title" }, [meta.title]),
            el("div", { class: "site-perm-desc" }, [meta.description]),
          ]),
        ]),
        select,
      ]);
    });

    const permsSection = el("div", { class: "site-info-section" }, [
      el("div", { class: "site-info-section-title" }, ["Permissões"]),
      el("div", { class: "site-perm-list" }, permRows),
    ]);

    const clearDesc = el("p", { class: "site-clear-desc" }, [
      "Limpará cookies, cache e armazenamento local apenas deste site.",
    ]);

    let clearActionRow: HTMLElement;

    if (!confirmingClear) {
      const clearBtn = el(
        "button",
        {
          class: "site-clear-btn",
          type: "button",
        },
        [icon("trash"), el("span", {}, ["Limpar dados deste site"])],
      );
      clearBtn.addEventListener("click", () => {
        confirmingClear = true;
        renderContent();
      });
      clearActionRow = el("div", { class: "site-clear-actions" }, [clearBtn]);
    } else {
      const cancelBtn = el(
        "button",
        {
          class: "site-clear-cancel-btn",
          type: "button",
        },
        ["Cancelar"],
      );
      cancelBtn.addEventListener("click", () => {
        confirmingClear = false;
        renderContent();
      });

      const confirmBtn = el(
        "button",
        {
          class: "site-clear-confirm-btn",
          type: "button",
        },
        [icon("trash"), el("span", {}, ["Confirmar e Recarregar"])],
      );
      confirmBtn.addEventListener("click", async () => {
        confirmingClear = false;
        if (currentTabId) {
          try {
            await webview.clearTabData(currentTabId);
          } catch (err) {
            console.error("[moss] Failed to clear tab data:", err);
          }
        }
        close();
      });

      clearActionRow = el("div", { class: "site-clear-confirm-row" }, [cancelBtn, confirmBtn]);
    }

    const clearSection = el("div", { class: "site-info-section site-info-section--clear" }, [
      el("div", { class: "site-info-section-title" }, ["Cookies e Dados de Navegação"]),
      clearDesc,
      clearActionRow,
    ]);

    const resetBtn = el(
      "button",
      {
        class: "site-reset-btn",
        type: "button",
      },
      ["Redefinir permissões padrão"],
    );
    resetBtn.addEventListener("click", () => {
      if (domain) {
        resetPermissionsForDomain(domain);
        renderContent();
      }
    });

    popover.append(header, securityDesc, privacyCard, permsSection, clearSection);
    if (hasCustomPermissions(domain)) {
      popover.append(resetBtn);
    }
  }

  function open(options: SiteInfoOptions) {
    if (isOpen) return;
    isOpen = true;
    confirmingClear = false;
    currentTabId = options.tabId;
    currentUrl = options.url;
    currentTrackers = options.trackersBlocked ?? 0;

    renderContent();

    overlay.style.display = "";
    popover.style.display = "";
    onVisibilityChange();

    // Focus on close button or first select
    const focusTarget = popover.querySelector<HTMLElement>(".site-info-close-btn");
    focusTarget?.focus();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    confirmingClear = false;
    overlay.style.display = "none";
    popover.style.display = "none";
    onVisibilityChange();
  }

  overlay.addEventListener("click", close);

  function handleKeydown(event: KeyboardEvent) {
    if (!isOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "Tab") {
      const focusable = popover.querySelectorAll<HTMLElement>(
        'button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  window.addEventListener("keydown", handleKeydown);

  function destroy() {
    close();
    window.removeEventListener("keydown", handleKeydown);
    overlay.remove();
    popover.remove();
  }

  return {
    element: popover,
    overlay,
    open,
    close,
    destroy,
    isOpen: () => isOpen,
  };
}
