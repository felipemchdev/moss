import { el } from "./dom";
import { subscribeLocale, t } from "./i18n";
import "./i18n-panels";
import { icon } from "./icons";
import { getSettings, updateSettings, SEARCH_ENGINES, type SearchEngine, type Theme } from "./settings";
import { createTab } from "./tabs";
import { webview } from "./webview";

const ONBOARDING_KEY = "moss:onboarding_completed";

export interface EssentialApp {
  id: string;
  name: string;
  url: string;
  iconName: "code" | "play" | "book" | "volume2" | "search" | "globe";
  category: "dev" | "media" | "work" | "social";
}

export const ESSENTIAL_APPS: EssentialApp[] = [
  { id: "github", name: "GitHub", url: "https://github.com", iconName: "code", category: "dev" },
  { id: "youtube", name: "YouTube", url: "https://youtube.com", iconName: "play", category: "media" },
  { id: "notion", name: "Notion", url: "https://notion.so", iconName: "book", category: "work" },
  { id: "spotify", name: "Spotify", url: "https://open.spotify.com", iconName: "volume2", category: "media" },
  { id: "reddit", name: "Reddit", url: "https://reddit.com", iconName: "globe", category: "social" },
  { id: "wikipedia", name: "Wikipedia", url: "https://wikipedia.org", iconName: "search", category: "work" },
];

export function isOnboardingCompleted(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === "true";
  } catch {
    return true;
  }
}

export function setOnboardingCompleted(completed = true) {
  try {
    localStorage.setItem(ONBOARDING_KEY, String(completed));
  } catch {}
}

export interface WelcomeWizardController {
  element: HTMLElement;
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
}

export function createWelcomeWizard(onComplete?: () => void): WelcomeWizardController {
  let open = false;
  let currentStep = 0;

  let selectedThemeChoice: "dark" | "light" | "auto" =
    getSettings().theme === "system" ? "auto" : (getSettings().theme as "dark" | "light");
  let selectedTheme: Theme = getSettings().theme;
  let selectedEngine: SearchEngine = getSettings().searchEngine;
  let shieldEnabled = true;
  const selectedApps = new Set<string>(["github", "youtube"]);

  function navigate(tabId: string, url: string) {
    webview.navigate(tabId, url).catch(() => {});
  }

  const backdrop = el("div", {
    class: "welcome-wizard-backdrop",
    style: "display: none;",
  });

  const card = el("div", {
    class: "welcome-wizard-card",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": t("welcome.title"),
  });

  backdrop.appendChild(card);

  function renderStep() {
    card.replaceChildren();
    card.setAttribute("aria-label", t("welcome.title"));

    // Step dots indicator
    const dots = el(
      "div",
      { class: "welcome-dots" },
      [0, 1, 2, 3, 4].map((stepIdx) =>
        el("span", {
          class: `welcome-dot ${stepIdx === currentStep ? "welcome-dot--active" : ""} ${
            stepIdx < currentStep ? "welcome-dot--completed" : ""
          }`,
        }),
      ),
    );

    let stepContent: HTMLElement;

    if (currentStep === 0) {
      // Step 0: Welcome & Visual Theme
      const hero = el("div", { class: "welcome-hero" }, [
        el("div", { class: "welcome-leaf-badge" }, [icon("leaf")]),
        el("h1", { class: "welcome-title" }, [t("welcome.title")]),
        el("p", { class: "welcome-subtitle" }, [t("welcome.subtitle")]),
      ]);

      const themeOptions = [
        { id: "dark", label: t("welcome.themeDark"), iconName: "moon" as const },
        { id: "light", label: t("welcome.themeLight"), iconName: "sun" as const },
        { id: "auto", label: t("welcome.themeAuto"), iconName: "settings" as const },
      ];

      const themeGrid = el(
        "div",
        { class: "welcome-theme-grid" },
        themeOptions.map((opt) => {
          const btn = el(
            "button",
            {
              class: `welcome-theme-card ${selectedThemeChoice === opt.id ? "welcome-theme-card--selected" : ""}`,
              type: "button",
            },
            [
              el("span", { class: "welcome-theme-icon" }, [icon(opt.iconName)]),
              el("span", { class: "welcome-theme-label" }, [opt.label]),
            ],
          );
          btn.addEventListener("click", () => {
            selectedThemeChoice = opt.id as "dark" | "light" | "auto";
            selectedTheme = opt.id === "auto" ? "system" : (opt.id as Theme);
            updateSettings({ theme: selectedTheme });
            renderStep();
          });
          return btn;
        }),
      );

      stepContent = el("div", { class: "welcome-step-body" }, [hero, themeGrid]);
    } else if (currentStep === 1) {
      // Step 1: Search Engine
      const header = el("div", { class: "welcome-step-header" }, [
        el("h2", { class: "welcome-step-title" }, [t("welcome.engineTitle")]),
        el("p", { class: "welcome-step-desc" }, [t("welcome.engineDesc")]),
      ]);

      const engineGrid = el(
        "div",
        { class: "welcome-engine-grid" },
        SEARCH_ENGINES.map((eng) => {
          const btn = el(
            "button",
            {
              class: `welcome-engine-card ${selectedEngine === eng.value ? "welcome-engine-card--selected" : ""}`,
              type: "button",
            },
            [
              el("span", { class: "welcome-engine-icon" }, [icon("search")]),
              el("div", { class: "welcome-engine-meta" }, [
                el("strong", {}, [eng.label]),
                el("span", {}, [
                  eng.value === "duckduckgo" ? t("welcome.enginePrivacy") : t("welcome.engineGlobal"),
                ]),
              ]),
            ],
          );
          btn.addEventListener("click", () => {
            selectedEngine = eng.value;
            updateSettings({ searchEngine: selectedEngine });
            renderStep();
          });
          return btn;
        }),
      );

      stepContent = el("div", { class: "welcome-step-body" }, [header, engineGrid]);
    } else if (currentStep === 2) {
      // Step 2: Privacy Shield
      const header = el("div", { class: "welcome-step-header" }, [
        el("div", { class: "welcome-shield-icon" }, [icon("shield")]),
        el("h2", { class: "welcome-step-title" }, [t("welcome.shieldTitle")]),
        el("p", { class: "welcome-step-desc" }, [t("welcome.shieldDesc")]),
      ]);

      const shieldCard = el(
        "div",
        { class: `welcome-shield-card ${shieldEnabled ? "welcome-shield-card--active" : ""}` },
        [
          el("div", { class: "welcome-shield-toggle-row" }, [
            el("div", { class: "welcome-shield-text" }, [
              el("strong", {}, [t("welcome.shieldToggle")]),
              el("span", {}, [t("welcome.shieldToggleDesc")]),
            ]),
            el("input", {
              type: "checkbox",
              class: "boosts-switch",
              checked: String(shieldEnabled),
            }),
          ]),
        ],
      );

      shieldCard.addEventListener("click", () => {
        shieldEnabled = !shieldEnabled;
        renderStep();
      });

      stepContent = el("div", { class: "welcome-step-body" }, [header, shieldCard]);
    } else if (currentStep === 3) {
      // Step 3: Essentials Web Apps Grid
      const header = el("div", { class: "welcome-step-header" }, [
        el("h2", { class: "welcome-step-title" }, [t("welcome.appsTitle")]),
        el("p", { class: "welcome-step-desc" }, [t("welcome.appsDesc")]),
      ]);

      const appsGrid = el(
        "div",
        { class: "welcome-apps-grid" },
        ESSENTIAL_APPS.map((app) => {
          const isSelected = selectedApps.has(app.id);
          const btn = el(
            "button",
            {
              class: `welcome-app-card ${isSelected ? "welcome-app-card--selected" : ""}`,
              type: "button",
            },
            [
              el("span", { class: "welcome-app-icon" }, [icon(app.iconName)]),
              el("span", { class: "welcome-app-title" }, [app.name]),
              el("span", { class: "welcome-app-check" }, [isSelected ? "✓" : "+"]),
            ],
          );
          btn.addEventListener("click", () => {
            if (selectedApps.has(app.id)) selectedApps.delete(app.id);
            else selectedApps.add(app.id);
            renderStep();
          });
          return btn;
        }),
      );

      stepContent = el("div", { class: "welcome-step-body" }, [header, appsGrid]);
    } else {
      // Step 4: Finished!
      const hero = el("div", { class: "welcome-hero" }, [
        el("div", { class: "welcome-leaf-badge welcome-leaf-badge--sparkle" }, [icon("sparkles")]),
        el("h1", { class: "welcome-title" }, [t("welcome.doneTitle")]),
        el("p", { class: "welcome-subtitle" }, [t("welcome.doneSubtitle")]),
      ]);

      stepContent = el("div", { class: "welcome-step-body" }, [hero]);
    }

    // Actions navigation footer
    const prevBtn = el(
      "button",
      {
        class: "welcome-nav-btn welcome-nav-btn--prev",
        type: "button",
        style: currentStep === 0 ? "visibility: hidden;" : "",
      },
      [t("welcome.back")],
    );
    prevBtn.addEventListener("click", () => {
      if (currentStep > 0) {
        currentStep--;
        renderStep();
      }
    });

    const isLastStep = currentStep === 4;
    const nextBtn = el(
      "button",
      {
        class: `welcome-nav-btn welcome-nav-btn--next ${isLastStep ? "welcome-nav-btn--finish" : ""}`,
        type: "button",
      },
      [isLastStep ? t("welcome.finish") : t("welcome.continue")],
    );
    nextBtn.addEventListener("click", () => {
      if (isLastStep) {
        completeOnboarding();
      } else {
        currentStep++;
        renderStep();
      }
    });

    const actionsFooter = el("div", { class: "welcome-footer" }, [prevBtn, dots, nextBtn]);

    card.append(stepContent, actionsFooter);
  }

  function completeOnboarding() {
    setOnboardingCompleted(true);
    updateSettings({
      theme: selectedTheme,
      searchEngine: selectedEngine,
      privacyShield: shieldEnabled,
    });

    try {
      localStorage.setItem("moss:shield_enabled", String(shieldEnabled));
    } catch {}

    // Create tabs for selected essential apps if any
    for (const app of ESSENTIAL_APPS) {
      if (selectedApps.has(app.id)) {
        const newTab = createTab(app.url, false);
        navigate(newTab.id, app.url);
      }
    }

    backdrop.classList.add("welcome-wizard-backdrop--closing");
    setTimeout(() => {
      controller.close();
      onComplete?.();
    }, 300);
  }

  const controller: WelcomeWizardController = {
    element: backdrop,
    isOpen: () => open,
    open() {
      open = true;
      currentStep = 0;
      backdrop.classList.remove("welcome-wizard-backdrop--closing");
      backdrop.style.display = "flex";
      renderStep();
    },
    close() {
      if (!open) return;
      open = false;
      backdrop.style.display = "none";
    },
  };

  subscribeLocale(() => {
    if (open) renderStep();
  });

  return controller;
}
