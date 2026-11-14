import { el } from "./dom";

export interface TabContextMenuActions {
  onReload: (tabId: string) => void;
  onDuplicate: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onCloseOthers: (tabId: string) => void;
  onTogglePin: (tabId: string) => void;
  isPinned: (tabId: string) => boolean;
  onToggleSplit?: (tabId: string) => void;
  isSplitActive?: () => boolean;
  isSplitTab?: (tabId: string) => boolean;
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
