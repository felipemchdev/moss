import { el } from "./dom";
import "./i18n-chrome";
import { t } from "./i18n";
import { icon } from "./icons";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  duration?: number;
  action?: ToastAction;
  iconName?: string;
}

let activeToast: HTMLElement | null = null;
let toastTimeout: number | null = null;

export function showToast(message: string, options: ToastOptions = {}) {
  const duration = options.duration ?? 4000;

  if (activeToast) {
    activeToast.remove();
    activeToast = null;
    if (toastTimeout !== null) {
      clearTimeout(toastTimeout);
      toastTimeout = null;
    }
  }

  const iconEl = el("span", { class: "toast-icon" }, [icon("leaf")]);
  const textEl = el("span", { class: "toast-message" }, [message]);
  const children: HTMLElement[] = [iconEl, textEl];

  if (options.action) {
    const actionBtn = el(
      "button",
      { class: "toast-action-btn", type: "button" },
      [options.action.label],
    );
    const cb = options.action.onClick;
    actionBtn.addEventListener("click", () => {
      dismissToast();
      cb();
    });
    children.push(actionBtn);
  }

  const closeBtn = el(
    "button",
    { class: "toast-close-btn", type: "button", "aria-label": t("toast.close") },
    [icon("close")],
  );
  closeBtn.addEventListener("click", () => dismissToast());
  children.push(closeBtn);

  const toast = el(
    "div",
    {
      class: "moss-toast",
      role: "status",
      "aria-live": "polite",
    },
    children,
  );

  document.body.appendChild(toast);
  activeToast = toast;

  requestAnimationFrame(() => {
    toast.classList.add("moss-toast--visible");
  });

  toastTimeout = window.setTimeout(() => {
    dismissToast();
  }, duration);
}

export function dismissToast() {
  if (!activeToast) return;
  const current = activeToast;
  activeToast = null;
  if (toastTimeout !== null) {
    clearTimeout(toastTimeout);
    toastTimeout = null;
  }

  current.classList.remove("moss-toast--visible");
  current.classList.add("moss-toast--hiding");
  setTimeout(() => {
    current.remove();
  }, 250);
}
