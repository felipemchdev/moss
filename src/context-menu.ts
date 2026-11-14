import { el } from "./dom";

export interface TabContextMenuActions {
  onReload: (tabId: string) => void;
  onDuplicate: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onCloseOthers: (tabId: string) => void;
  onTogglePin: (tabId: string) => void;
  isPinned: (tabId: string) => boolean;
  onGlanceTab?: (tabId: string) => void;
  onReopenClosedTab?: () => void;
  canReopenClosedTab?: () => boolean;
  onToggleSplit?: (tabId: string) => void;
  isSplitActive?: () => boolean;
  isSplitTab?: (tabId: string) => boolean;
  onMoveToWorkspace?: (tabId: string, workspaceId: string) => void;
  getWorkspaces?: () => readonly { id: string; name: string }[];
  getCurrentWorkspaceId?: () => string;
  onSleepTab?: (tabId: string) => void;
  onWakeTab?: (tabId: string) => void;
  isSleeping?: (tabId: string) => boolean;
  onMoveToFolder?: (tabId: string, folderId: string | undefined) => void;
  getFolders?: () => readonly { id: string; name: string; color?: string }[];
  getCurrentFolderId?: (tabId: string) => string | undefined;
  onCreateFolderWithTab?: (tabId: string) => void;
}

export interface TabContextMenu {
  element: HTMLElement;
  open: (tabId: string, x: number, y: number) => void;
  close: () => void;
  isOpen: () => boolean;
}

export function createTabContextMenu(
  actions: TabContextMenuActions,
  onChange?: () => void,
): TabContextMenu {
  let activeTabId: string | null = null;
  let open = false;

  const element = el("div", {
    class: "tab-context-menu",
    role: "menu",
    tabindex: "-1",
    style: "display: none;",
  });

  // Pin button is dynamic — rebuilt on each open
  let pinButton: HTMLButtonElement | null = null;
  let splitButton: HTMLButtonElement | null = null;
  let reopenButton: HTMLButtonElement | null = null;
  let glanceButton: HTMLButtonElement | null = null;

  const staticOptions: { label: string; action: (tabId: string) => void }[] = [
    { label: "Recarregar", action: actions.onReload },
    { label: "Duplicar", action: actions.onDuplicate },
    { label: "Fechar aba", action: actions.onClose },
    { label: "Fechar outras abas", action: actions.onCloseOthers },
  ];

  // Build static items
  for (const option of staticOptions) {
    const itemButton = el(
      "button",
      { class: "tab-context-menu__item", type: "button", role: "menuitem" },
      [option.label],
    );
    itemButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const targetTabId = activeTabId;
      menu.close();
      if (targetTabId) option.action(targetTabId);
    });
    element.append(itemButton);
  }

  // Pin button (prepended dynamically before first item)
  function buildPinButton(tabId: string) {
    if (pinButton) pinButton.remove();
    const label = actions.isPinned(tabId) ? "Desafixar aba" : "Fixar aba";
    pinButton = el(
      "button",
      { class: "tab-context-menu__item", type: "button", role: "menuitem" },
      [label],
    ) as HTMLButtonElement;
    pinButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const targetTabId = activeTabId;
      menu.close();
      if (targetTabId) actions.onTogglePin(targetTabId);
    });
    element.prepend(pinButton);
  }

  // Split view toggle button
  function buildSplitButton(tabId: string) {
    if (splitButton) splitButton.remove();
    if (!actions.onToggleSplit) return;
    const isSplit = actions.isSplitActive?.() ?? false;
    const isThisTabSplit = actions.isSplitTab?.(tabId) ?? false;
    const label = isSplit && isThisTabSplit ? "Fechar tela dividida" : "Dividir tela com esta aba";
    splitButton = el(
      "button",
      { class: "tab-context-menu__item", type: "button", role: "menuitem" },
      [label],
    ) as HTMLButtonElement;
    splitButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const targetTabId = activeTabId;
      menu.close();
      if (targetTabId) actions.onToggleSplit?.(targetTabId);
    });
    element.append(splitButton);
  }

  // Reopen closed tab button
  function buildReopenButton() {
    if (reopenButton) reopenButton.remove();
    if (!actions.onReopenClosedTab) return;
    const canReopen = actions.canReopenClosedTab ? actions.canReopenClosedTab() : true;
    if (!canReopen) return;
    reopenButton = el(
      "button",
      { class: "tab-context-menu__item", type: "button", role: "menuitem" },
      ["Reabrir aba fechada (Ctrl+Shift+T)"],
    ) as HTMLButtonElement;
    reopenButton.addEventListener("click", (event) => {
      event.stopPropagation();
      menu.close();
      actions.onReopenClosedTab?.();
    });
    element.append(reopenButton);
  }

  // Glance / Peek button
  function buildGlanceButton(tabId: string) {
    if (glanceButton) glanceButton.remove();
    if (!actions.onGlanceTab) return;
    glanceButton = el(
      "button",
      { class: "tab-context-menu__item", type: "button", role: "menuitem" },
      ["Espiar no Glance (Zen Glance)"],
    ) as HTMLButtonElement;
    glanceButton.addEventListener("click", (event) => {
      event.stopPropagation();
      menu.close();
      actions.onGlanceTab?.(tabId);
    });
    element.append(glanceButton);
  }

  let sleepButton: HTMLButtonElement | null = null;
  function buildSleepButton(tabId: string) {
    if (sleepButton) sleepButton.remove();
    if (!actions.onSleepTab) return;
    const sleeping = actions.isSleeping ? actions.isSleeping(tabId) : false;
    const label = sleeping ? "Acordar aba" : "Hibernar aba (Economizar memória)";
    sleepButton = el(
      "button",
      { class: "tab-context-menu__item", type: "button", role: "menuitem" },
      [label],
    ) as HTMLButtonElement;
    sleepButton.addEventListener("click", (event) => {
      event.stopPropagation();
      menu.close();
      if (sleeping) actions.onWakeTab?.(tabId);
      else actions.onSleepTab?.(tabId);
    });
    element.append(sleepButton);
  }

  let folderButtons: HTMLButtonElement[] = [];
  function buildFolderButtons(tabId: string) {
    for (const b of folderButtons) b.remove();
    folderButtons = [];
    if (!actions.onMoveToFolder) return;

    const currentFolderId = actions.getCurrentFolderId?.(tabId);
    const availableFolders = actions.getFolders?.() ?? [];

    if (currentFolderId) {
      const currentFolder = availableFolders.find((f) => f.id === currentFolderId);
      const removeBtn = el(
        "button",
        { class: "tab-context-menu__item", type: "button", role: "menuitem" },
        [`Remover da pasta (${currentFolder ? currentFolder.name : "Pasta"})`],
      ) as HTMLButtonElement;
      removeBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        menu.close();
        actions.onMoveToFolder!(tabId, undefined);
      });
      element.append(removeBtn);
      folderButtons.push(removeBtn);
    }

    const otherFolders = availableFolders.filter((f) => f.id !== currentFolderId);
    for (const f of otherFolders) {
      const btn = el(
        "button",
        { class: "tab-context-menu__item", type: "button", role: "menuitem" },
        [`Mover para pasta: ${f.name}`],
      ) as HTMLButtonElement;
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        menu.close();
        actions.onMoveToFolder!(tabId, f.id);
      });
      element.append(btn);
      folderButtons.push(btn);
    }

    if (actions.onCreateFolderWithTab) {
      const newFolderBtn = el(
        "button",
        { class: "tab-context-menu__item", type: "button", role: "menuitem" },
        ["+ Criar pasta com esta aba"],
      ) as HTMLButtonElement;
      newFolderBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        menu.close();
        actions.onCreateFolderWithTab!(tabId);
      });
      element.append(newFolderBtn);
      folderButtons.push(newFolderBtn);
    }
  }

  let workspaceButtons: HTMLButtonElement[] = [];

  function buildWorkspaceButtons() {
    for (const b of workspaceButtons) b.remove();
    workspaceButtons = [];
    if (!actions.getWorkspaces || !actions.onMoveToWorkspace) return;
    const currentWsId = actions.getCurrentWorkspaceId?.() ?? "default";
    const others = actions.getWorkspaces().filter((w) => w.id !== currentWsId);
    if (others.length === 0) return;

    for (const ws of others) {
      const btn = el(
        "button",
        { class: "tab-context-menu__item", type: "button", role: "menuitem" },
        [`Mover para ${ws.name}`],
      ) as HTMLButtonElement;
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        const targetTabId = activeTabId;
        menu.close();
        if (targetTabId) actions.onMoveToWorkspace!(targetTabId, ws.id);
      });
      element.append(btn);
      workspaceButtons.push(btn);
    }
  }

  function onPointerDown(event: PointerEvent) {
    const target = event.target;
    if (target instanceof Node && element.contains(target)) return;
    menu.close();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      menu.close();
    }
  }

  element.addEventListener("keydown", (event) => {
    const buttons = [...element.querySelectorAll<HTMLButtonElement>(".tab-context-menu__item")];
    if (buttons.length === 0) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      buttons[(index + 1) % buttons.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
    }
  });

  const menu: TabContextMenu = {
    element,
    isOpen: () => open,
    open(tabId: string, x: number, y: number) {
      activeTabId = tabId;
      open = true;
      buildPinButton(tabId);
      buildSplitButton(tabId);
      buildWorkspaceButtons();
      buildFolderButtons(tabId);
      buildSleepButton(tabId);
      buildReopenButton();
      buildGlanceButton(tabId);

      element.style.visibility = "hidden";
      element.style.display = "flex";

      const rect = element.getBoundingClientRect();
      const width = rect.width || 180;
      const height = rect.height || 160;
      const left = Math.max(8, Math.min(x, window.innerWidth - width - 8));
      const top = Math.max(8, Math.min(y, window.innerHeight - height - 8));

      element.style.left = `${left}px`;
      element.style.top = `${top}px`;
      element.style.visibility = "visible";

      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("keydown", onKeyDown);
      onChange?.();

      element.querySelector<HTMLButtonElement>(".tab-context-menu__item")?.focus();
    },
    close() {
      if (!open) return;
      open = false;
      activeTabId = null;
      element.style.display = "none";
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      onChange?.();
    },
  };

  return menu;
}
