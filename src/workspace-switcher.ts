import { el } from "./dom";
import { icon, type IconName } from "./icons";
import { getTabs } from "./tabs";
import {
  createWorkspace,
  cycleWorkspace,
  getActiveWorkspace,
  getWorkspaces,
  subscribeWorkspaces,
} from "./workspaces";

export interface WorkspaceSwitcherOptions {
  onSwitch: (workspaceId: string) => void;
  onDeleteWorkspace?: (workspaceId: string) => void;
  onVisibilityChange?: () => void;
}

export interface WorkspaceSwitcher {
  element: HTMLElement;
  popover: HTMLElement;
  isOpen: () => boolean;
  open: () => void;
  close: () => void;
  destroy: () => void;
}

const AVAILABLE_ICONS: readonly { name: IconName; label: string }[] = [
  { name: "leaf", label: "Folha / Pessoal" },
  { name: "briefcase", label: "Maleta / Trabalho" },
  { name: "code", label: "Código / Dev" },
  { name: "book", label: "Livro / Estudos" },
  { name: "globe", label: "Globo / Geral" },
  { name: "star", label: "Estrela / Favoritos" },
];

export function createWorkspaceSwitcher(options: WorkspaceSwitcherOptions): WorkspaceSwitcher {
  let open = false;

  // 1. Sidebar Header pill
  const activeIconEl = el("span", { class: "workspace-pill-icon" }, [icon("leaf")]);
  const activeLabelEl = el("span", { class: "workspace-pill-name" }, ["Pessoal"]);
  const chevronEl = el("span", { class: "workspace-pill-chevron" }, [icon("chevronDown")]);

  const pillBtn = el(
    "button",
    {
      class: "workspace-pill-btn",
      type: "button",
      "aria-haspopup": "dialog",
      "aria-expanded": "false",
      "aria-label": "Alternar espaço de trabalho",
      title: "Espaços de trabalho (Ctrl+Alt+1..9)",
    },
    [activeIconEl, activeLabelEl, chevronEl],
  );

  const prevBtn = el(
    "button",
    {
      class: "workspace-nav-btn workspace-nav-btn--prev",
      type: "button",
      "aria-label": "Espaço anterior (Ctrl+Alt+←)",
      title: "Espaço anterior (Ctrl+Alt+←)",
    },
    [icon("chevronLeft")],
  );

  const nextBtn = el(
    "button",
    {
      class: "workspace-nav-btn workspace-nav-btn--next",
      type: "button",
      "aria-label": "Próximo espaço (Ctrl+Alt+→)",
      title: "Próximo espaço (Ctrl+Alt+→)",
    },
    [icon("chevronRight")],
  );

  const container = el("div", { class: "workspace-header-bar" }, [
    prevBtn,
    pillBtn,
    nextBtn,
  ]);

  // 2. Popover Dialog
  const popover = el("div", {
    class: "workspace-popover",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": "Gerenciar Espaços de Trabalho",
    style: "display: none;",
  });

  const listEl = el("ul", { class: "workspace-list", role: "listbox" });
  const formEl = el("form", { class: "workspace-create-form", style: "display: none;" });
  const toggleFormBtn = el(
    "button",
    { class: "workspace-add-btn", type: "button" },
    [icon("plus"), el("span", {}, ["Novo Espaço"])],
  );

  popover.append(
    el("div", { class: "workspace-popover-header" }, [
      el("span", { class: "workspace-popover-title" }, ["Espaços de Trabalho"]),
    ]),
    listEl,
    formEl,
    toggleFormBtn,
  );

  // Setup create form
  let selectedIcon: IconName = "folder";
  const nameInput = el("input", {
    class: "workspace-name-input",
    type: "text",
    placeholder: "Nome do espaço...",
    maxlength: "30",
  }) as HTMLInputElement;

  const iconOptionsRow = el(
    "div",
    { class: "workspace-icon-picker" },
    AVAILABLE_ICONS.map(({ name, label }) => {
      const btn = el(
        "button",
        {
          class: `workspace-icon-opt ${name === "folder" ? "workspace-icon-opt--selected" : ""}`,
          type: "button",
          "aria-label": label,
          title: label,
        },
        [icon(name)],
      );
      btn.addEventListener("click", () => {
        selectedIcon = name;
        for (const b of iconOptionsRow.querySelectorAll(".workspace-icon-opt")) {
          b.classList.remove("workspace-icon-opt--selected");
        }
        btn.classList.add("workspace-icon-opt--selected");
      });
      return btn;
    }),
  );

  const submitCreateBtn = el(
    "button",
    { class: "workspace-submit-btn", type: "submit" },
    ["Criar Espaço"],
  );

  const cancelCreateBtn = el(
    "button",
    { class: "workspace-cancel-btn", type: "button" },
    ["Cancelar"],
  );

  formEl.append(
    nameInput,
    iconOptionsRow,
    el("div", { class: "workspace-form-actions" }, [cancelCreateBtn, submitCreateBtn]),
  );

  toggleFormBtn.addEventListener("click", () => {
    formEl.style.display = formEl.style.display === "none" ? "flex" : "none";
    if (formEl.style.display !== "none") {
      nameInput.value = "";
      nameInput.focus();
    }
  });

  cancelCreateBtn.addEventListener("click", () => {
    formEl.style.display = "none";
    toggleFormBtn.focus();
  });

  formEl.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    const ws = createWorkspace(name, selectedIcon);
    formEl.style.display = "none";
    switcher.close();
    options.onSwitch(ws.id);
  });

  function renderList() {
    const workspaces = getWorkspaces();
    const active = getActiveWorkspace();
    const allTabs = getTabs();

    listEl.replaceChildren(
      ...workspaces.map((ws) => {
        const isActive = ws.id === active.id;
        const tabCount = allTabs.filter(
          (t) => !t.isPinned && (t.workspaceId ?? "default") === ws.id,
        ).length;

        const iconEl = el("span", { class: "workspace-item-icon" }, [
          icon((ws.icon as IconName) || "folder"),
        ]);
        const nameEl = el("span", { class: "workspace-item-name" }, [ws.name]);
        const countEl = el("span", { class: "workspace-item-badge" }, [
          `${tabCount} ${tabCount === 1 ? "aba" : "abas"}`,
        ]);

        const actionsEl = el("div", { class: "workspace-item-actions" });

        if (workspaces.length > 1) {
          let confirming = false;
          let confirmTimeout: ReturnType<typeof setTimeout> | null = null;

          const deleteBtn = el(
            "button",
            {
              class: "workspace-action-btn workspace-action-btn--delete",
              type: "button",
              "aria-label": `Excluir espaço ${ws.name}`,
              title: "Excluir espaço",
            },
            [icon("trash")],
          ) as HTMLButtonElement;

          deleteBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (!confirming) {
              confirming = true;
              deleteBtn.classList.add("workspace-action-btn--confirming");
              deleteBtn.title = "Clique novamente para confirmar exclusão";
              deleteBtn.replaceChildren(el("span", { class: "workspace-confirm-text" }, ["Excluir?"]));
              confirmTimeout = setTimeout(() => {
                confirming = false;
                deleteBtn.classList.remove("workspace-action-btn--confirming");
                deleteBtn.title = "Excluir espaço";
                deleteBtn.replaceChildren(icon("trash"));
              }, 3000);
            } else {
              if (confirmTimeout) clearTimeout(confirmTimeout);
              options.onDeleteWorkspace?.(ws.id);
            }
          });
          actionsEl.append(deleteBtn);
        }

        const item = el(
          "li",
          {
            class: `workspace-item ${isActive ? "workspace-item--active" : ""}`,
            role: "option",
            "aria-selected": String(isActive),
            tabindex: "0",
          },
          [
            el("div", { class: "workspace-item-main" }, [iconEl, nameEl, countEl]),
            actionsEl,
          ],
        );

        item.addEventListener("click", () => {
          switcher.close();
          if (ws.id !== active.id) {
            options.onSwitch(ws.id);
          }
        });

        item.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            switcher.close();
            if (ws.id !== active.id) {
              options.onSwitch(ws.id);
            }
          }
        });

        return item;
      }),
    );
  }

  function updatePill() {
    const active = getActiveWorkspace();
    activeIconEl.replaceChildren(icon((active.icon as IconName) || "folder"));
    activeLabelEl.textContent = active.name;
    container.style.setProperty("--active-workspace-color", active.color || "#b8eb9a");
  }

  pillBtn.addEventListener("click", () => {
    if (open) switcher.close();
    else switcher.open();
  });

  prevBtn.addEventListener("click", () => {
    const ws = cycleWorkspace(-1);
    options.onSwitch(ws.id);
  });

  nextBtn.addEventListener("click", () => {
    const ws = cycleWorkspace(1);
    options.onSwitch(ws.id);
  });

  function onPointerDown(e: PointerEvent) {
    const target = e.target;
    if (
      target instanceof Node &&
      (popover.contains(target) || pillBtn.contains(target))
    ) {
      return;
    }
    switcher.close();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      switcher.close();
      return;
    }

    if (e.key === "Tab") {
      const focusable = [
        ...popover.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((elem) => elem.offsetParent !== null);

      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  const unsubscribe = subscribeWorkspaces(() => {
    updatePill();
    if (open) renderList();
  });

  const switcher: WorkspaceSwitcher = {
    element: container,
    popover,
    isOpen: () => open,
    open() {
      if (open) return;
      open = true;
      pillBtn.setAttribute("aria-expanded", "true");
      renderList();
      popover.style.display = "flex";

      const rect = pillBtn.getBoundingClientRect();
      const popoverWidth = 280;
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - popoverWidth - 12));
      const top = rect.bottom + 8;

      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;

      document.addEventListener("pointerdown", onPointerDown, true);
      popover.addEventListener("keydown", onKeyDown);

      // Focus active item or first item
      requestAnimationFrame(() => {
        const activeItem = listEl.querySelector<HTMLElement>(".workspace-item--active") ??
          listEl.querySelector<HTMLElement>(".workspace-item");
        activeItem?.focus();
      });

      options.onVisibilityChange?.();
    },
    close() {
      if (!open) return;
      open = false;
      pillBtn.setAttribute("aria-expanded", "false");
      popover.style.display = "none";
      formEl.style.display = "none";
      document.removeEventListener("pointerdown", onPointerDown, true);
      popover.removeEventListener("keydown", onKeyDown);
      pillBtn.focus();
      options.onVisibilityChange?.();
    },
    destroy() {
      switcher.close();
      unsubscribe();
      container.remove();
      popover.remove();
    },
  };

  updatePill();
  return switcher;
}
