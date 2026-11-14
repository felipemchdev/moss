import { resolveOmnibarInput } from "./omnibar";

const NAV_BUTTONS = [
  { action: "back", label: "Voltar", icon: "←" },
  { action: "forward", label: "Avançar", icon: "→" },
  { action: "reload", label: "Recarregar", icon: "↻" },
];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

function buildChrome(root: HTMLElement) {
  const navButtons = NAV_BUTTONS.map(({ action, label, icon }) =>
    el("button", {
      class: "nav-btn",
      type: "button",
      "data-action": action,
      "aria-label": label,
      title: label,
      disabled: "",
    }, [icon]),
  );

  const omnibarInput = el("input", {
    id: "omnibar-input",
    class: "omnibar-input",
    type: "text",
    placeholder: "Pesquise ou digite um endereço",
    autocomplete: "off",
    spellcheck: "false",
    "aria-label": "Barra de endereço",
  });

  const omnibar = el("form", { id: "omnibar", class: "omnibar", role: "search" }, [omnibarInput]);

  const toolbar = el("header", { class: "toolbar" }, [
    el("nav", { class: "nav-group" }, navButtons),
    omnibar,
  ]);

  const statusText = el("p", { class: "empty-state-hint" }, [
    "Digite um endereço na omnibar para começar.",
  ]);

  const webviewArea = el("main", { id: "webview-area", class: "webview-area" }, [
    el("div", { class: "empty-state" }, [
      el("h1", { class: "empty-state-title" }, ["moss"]),
      statusText,
    ]),
  ]);

  root.append(toolbar, webviewArea);
  return { omnibar, omnibarInput, statusText };
}

window.addEventListener("DOMContentLoaded", () => {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) return;

  const { omnibar, omnibarInput, statusText } = buildChrome(root);

  omnibar.addEventListener("submit", (event) => {
    event.preventDefault();
    const url = resolveOmnibarInput(omnibarInput.value);
    if (!url) return;
    omnibarInput.value = url;
    omnibarInput.blur();
    statusText.textContent = `Navegação para ${url} será implementada na Fase 1.`;
  });

  window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
      event.preventDefault();
      omnibarInput.focus();
      omnibarInput.select();
    }
  });

  omnibarInput.focus();
});
