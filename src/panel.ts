export interface Panel {
  element: HTMLElement;
  isOpen(): boolean;
  open(): void;
  close(): void;
}

interface PanelOptions {
  element: HTMLElement;
  openClass: string;
  initialFocus: () => HTMLElement;
  onOpen?: () => void;
  onChange: () => void;
}

// Buttons that toggle a panel must not count as outside clicks, or they'd close it and reopen it at once.
export const PANEL_TOGGLE_ATTR = "data-panel-toggle";

const FOCUSABLE = "button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function createPanel(options: PanelOptions): Panel {
  const { element, openClass } = options;
  let open = false;
  let returnFocus: HTMLElement | null = null;
  element.inert = true;

  function onOutsidePointer(event: PointerEvent) {
    const target = event.target;
    if (!(target instanceof Element) || element.contains(target)) return;
    if (target.closest(`[${PANEL_TOGGLE_ATTR}]`)) return;
    panel.close();
  }

  function focusables(): HTMLElement[] {
    return [...element.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (node) => !node.closest("[hidden]") && node.getClientRects().length > 0,
    );
  }

  function trapTab(event: KeyboardEvent) {
    const nodes = focusables();
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const inside = element.contains(document.activeElement);
    if (event.shiftKey && (!inside || document.activeElement === first)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (!inside || document.activeElement === last)) {
      event.preventDefault();
      first.focus();
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented) return;
    if (event.key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey) return trapTab(event);
    if (event.key !== "Escape") return;
    event.preventDefault();
    panel.close();
  }

  function setOpen(next: boolean) {
    open = next;
    element.inert = !next;
    element.classList.toggle(openClass, next);
    if (next) {
      document.addEventListener("pointerdown", onOutsidePointer, true);
      document.addEventListener("keydown", onKeydown);
    } else {
      document.removeEventListener("pointerdown", onOutsidePointer, true);
      document.removeEventListener("keydown", onKeydown);
    }
    options.onChange();
  }

  const panel: Panel = {
    element,
    isOpen: () => open,
    open() {
      if (open) return;
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      options.onOpen?.();
      setOpen(true);
      options.initialFocus().focus();
    },
    close() {
      if (!open) return;
      const hadFocus = element.contains(document.activeElement);
      setOpen(false);
      if (hadFocus && returnFocus?.isConnected) returnFocus.focus();
      returnFocus = null;
    },
  };
  return panel;
}
