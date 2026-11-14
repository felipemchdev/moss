import { getDomainFromUrl } from "./dom";
import { webview } from "./webview";

export interface DomainBoost {
  smartDarkMode: boolean;
  brightness: number; // -50 to +50
  contrast: number; // -50 to +50
  sepia: boolean;
  customCss: string;
}

export interface DomainZapRule {
  id: string;
  selector: string;
  createdAt: number;
}

const BOOSTS_STORAGE_KEY = "moss:domain_boosts";
const ZAPS_STORAGE_KEY = "moss:domain_zap_rules";
const BOOST_MIN = -50;
const BOOST_MAX = 50;

const DEFAULT_BOOST: DomainBoost = {
  smartDarkMode: false,
  brightness: 0,
  contrast: 0,
  sepia: false,
  customCss: "",
};

type BoostMap = Record<string, DomainBoost>;
type ZapMap = Record<string, DomainZapRule[]>;

let boosts: BoostMap = loadBoosts();
let zaps: ZapMap = loadZaps();

function loadBoosts(): BoostMap {
  try {
    const raw = localStorage.getItem(BOOSTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function loadZaps(): ZapMap {
  try {
    const raw = localStorage.getItem(ZAPS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveBoosts() {
  try {
    localStorage.setItem(BOOSTS_STORAGE_KEY, JSON.stringify(boosts));
  } catch {}
}

function saveZaps() {
  try {
    localStorage.setItem(ZAPS_STORAGE_KEY, JSON.stringify(zaps));
  } catch {}
}

export function extractDomain(url: string): string {
  if (!url) return "";
  const canonical = getDomainFromUrl(url);
  if (canonical) return canonical;
  if (!/^[a-z0-9.-]+(:\d+)?(\/|$)/i.test(url)) return "";
  try {
    return new URL(`https://${url}`).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function clampBoostValue(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(BOOST_MAX, Math.max(BOOST_MIN, value));
}

function sanitizeBoost(stored: unknown): DomainBoost {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return { ...DEFAULT_BOOST };
  }
  const raw = stored as Record<string, unknown>;
  return {
    smartDarkMode:
      typeof raw.smartDarkMode === "boolean" ? raw.smartDarkMode : DEFAULT_BOOST.smartDarkMode,
    brightness: clampBoostValue(raw.brightness, DEFAULT_BOOST.brightness),
    contrast: clampBoostValue(raw.contrast, DEFAULT_BOOST.contrast),
    sepia: typeof raw.sepia === "boolean" ? raw.sepia : DEFAULT_BOOST.sepia,
    customCss: typeof raw.customCss === "string" ? raw.customCss : DEFAULT_BOOST.customCss,
  };
}

export function getDomainBoost(domain: string): DomainBoost {
  const norm = domain.toLowerCase();
  return sanitizeBoost(boosts[norm]);
}

export function setDomainBoost(domain: string, patch: Partial<DomainBoost>) {
  const norm = domain.toLowerCase();
  const current = getDomainBoost(norm);
  boosts[norm] = { ...current, ...patch };
  saveBoosts();
}

export function resetDomainBoost(domain: string) {
  const norm = domain.toLowerCase();
  delete boosts[norm];
  saveBoosts();
}

export function getDomainZapRules(domain: string): DomainZapRule[] {
  const norm = domain.toLowerCase();
  return zaps[norm] || [];
}

export function addDomainZapRule(domain: string, selector: string): DomainZapRule {
  const norm = domain.toLowerCase();
  const current = zaps[norm] || [];
  // Avoid duplicate selectors
  const existing = current.find((r) => r.selector === selector);
  if (existing) return existing;

  const rule: DomainZapRule = {
    id: `zap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    selector,
    createdAt: Date.now(),
  };
  zaps[norm] = [...current, rule];
  saveZaps();
  return rule;
}

export function removeDomainZapRule(domain: string, ruleId: string) {
  const norm = domain.toLowerCase();
  const current = zaps[norm] || [];
  zaps[norm] = current.filter((r) => r.id !== ruleId);
  saveZaps();
}

export function clearDomainZapRules(domain: string) {
  const norm = domain.toLowerCase();
  delete zaps[norm];
  saveZaps();
}

export function buildCombinedCss(domain: string): string {
  const boost = getDomainBoost(domain);
  const rules = getDomainZapRules(domain);

  let css = "";

  if (rules.length > 0) {
    const selectors = rules.map((r) => r.selector).join(",\n");
    css += `\n/* Moss Element Zapper */\n${selectors} {\n  display: none !important;\n}\n`;
  }

  if (boost.smartDarkMode) {
    css += `
/* Moss Smart Dark Mode */
html {
  filter: invert(1) hue-rotate(180deg) !important;
  background-color: #141414 !important;
}
img, video, iframe, canvas, svg, [style*="background-image"] {
  filter: invert(1) hue-rotate(180deg) !important;
}
`;
  }

  const filters: string[] = [];
  if (boost.brightness !== 0) {
    filters.push(`brightness(${100 + boost.brightness}%)`);
  }
  if (boost.contrast !== 0) {
    filters.push(`contrast(${100 + boost.contrast}%)`);
  }
  if (boost.sepia) {
    filters.push("sepia(45%)");
  }
  if (filters.length > 0) {
    css += `\n/* Moss Visual Filters */\nhtml {\n  filter: ${filters.join(" ")} !important;\n}\n`;
  }

  if (boost.customCss.trim()) {
    css += `\n/* Moss Custom CSS */\n${boost.customCss}\n`;
  }

  return css;
}

export function applyBoostToTab(tabId: string, url: string) {
  const domain = extractDomain(url);
  if (!domain) return;
  const css = buildCombinedCss(domain);
  webview.applyTabBoost(tabId, css).catch(console.error);
}
