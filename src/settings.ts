import { isRecord, isWebUrl, loadJson, saveJson } from "./storage";

export type Theme = "dark" | "light" | "system";
export type SearchEngine = "duckduckgo" | "google" | "bing";

export interface Settings {
  theme: Theme;
  searchEngine: SearchEngine;
  homepage: string;
  restoreSession: boolean;
}

export const THEMES: { value: Theme; label: string }[] = [
  { value: "dark", label: "Escuro" },
  { value: "light", label: "Claro" },
  { value: "system", label: "Sistema" },
];

export const SEARCH_ENGINES: { value: SearchEngine; label: string; url: string }[] = [
  { value: "duckduckgo", label: "DuckDuckGo", url: "https://duckduckgo.com/?q=" },
  { value: "google", label: "Google", url: "https://www.google.com/search?q=" },
  { value: "bing", label: "Bing", url: "https://www.bing.com/search?q=" },
];

const STORAGE_KEY = "moss.settings";
const DEFAULTS: Settings = {
  theme: "system",
  searchEngine: "duckduckgo",
  homepage: "",
  restoreSession: true,
};
const systemLight = window.matchMedia("(prefers-color-scheme: light)");

function load(): Settings {
  const stored = loadJson(STORAGE_KEY);
  if (!isRecord(stored)) return { ...DEFAULTS };
  const { theme, searchEngine, homepage, restoreSession } = stored;
  return {
    theme: THEMES.some((t) => t.value === theme) ? (theme as Theme) : DEFAULTS.theme,
    searchEngine: SEARCH_ENGINES.some((e) => e.value === searchEngine)
      ? (searchEngine as SearchEngine)
      : DEFAULTS.searchEngine,
    homepage: typeof homepage === "string" && isWebUrl(homepage) ? homepage : DEFAULTS.homepage,
    restoreSession: typeof restoreSession === "boolean" ? restoreSession : DEFAULTS.restoreSession,
  };
}

let settings: Readonly<Settings> = load();

function applyTheme() {
  const resolved = settings.theme === "system" ? (systemLight.matches ? "light" : "dark") : settings.theme;
  document.documentElement.dataset.theme = resolved;
}

applyTheme();
systemLight.addEventListener("change", applyTheme);

export function getSettings(): Readonly<Settings> {
  return settings;
}

export function updateSettings(patch: Partial<Settings>) {
  if (patch.homepage && !isWebUrl(patch.homepage)) return;
  const next = { ...settings, ...patch };
  if ((Object.keys(next) as (keyof Settings)[]).every((key) => next[key] === settings[key])) return;
  settings = next;
  saveJson(STORAGE_KEY, settings);
  applyTheme();
}

export function searchUrl(): string {
  return SEARCH_ENGINES.find((engine) => engine.value === settings.searchEngine)!.url;
}
