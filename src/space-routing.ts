import { getWorkspaces } from "./workspaces";

export interface SpaceRoutingRule {
  id: string;
  domain: string;
  targetWorkspaceId: string;
  createdAt: number;
}

export type RoutingMode = "auto" | "prompt";

const RULES_KEY = "moss:space_routing_rules";
const ENABLED_KEY = "moss:space_routing_enabled";
const MODE_KEY = "moss:space_routing_mode";

const DEFAULT_RULES: Omit<SpaceRoutingRule, "id" | "createdAt">[] = [
  { domain: "github.com", targetWorkspaceId: "dev" },
  { domain: "gitlab.com", targetWorkspaceId: "dev" },
  { domain: "stackoverflow.com", targetWorkspaceId: "dev" },
  { domain: "slack.com", targetWorkspaceId: "work" },
  { domain: "linear.app", targetWorkspaceId: "work" },
  { domain: "notion.so", targetWorkspaceId: "work" },
  { domain: "youtube.com", targetWorkspaceId: "default" },
  { domain: "reddit.com", targetWorkspaceId: "default" },
];

type RoutingListener = () => void;
const listeners = new Set<RoutingListener>();

let rules: SpaceRoutingRule[] = loadRules();
let enabled: boolean = loadEnabled();
let mode: RoutingMode = loadMode();

function loadRules(): SpaceRoutingRule[] {
  try {
    const raw = localStorage.getItem(RULES_KEY);
    if (!raw) {
      return DEFAULT_RULES.map((r, i) => ({
        ...r,
        id: `rule-default-${i}`,
        createdAt: Date.now(),
      }));
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SpaceRoutingRule =>
        typeof item === "object" &&
        item !== null &&
        typeof item.id === "string" &&
        typeof item.domain === "string" &&
        typeof item.targetWorkspaceId === "string",
    );
  } catch {
    return [];
  }
}

function loadEnabled(): boolean {
  try {
    const raw = localStorage.getItem(ENABLED_KEY);
    return raw !== "false";
  } catch {
    return true;
  }
}

function loadMode(): RoutingMode {
  try {
    const raw = localStorage.getItem(MODE_KEY);
    return raw === "prompt" ? "prompt" : "auto";
  } catch {
    return "auto";
  }
}

function save() {
  try {
    localStorage.setItem(RULES_KEY, JSON.stringify(rules));
    localStorage.setItem(ENABLED_KEY, String(enabled));
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* storage unavailable */
  }
}

function notify() {
  save();
  for (const listener of listeners) {
    listener();
  }
}

export function getRoutingRules(): readonly SpaceRoutingRule[] {
  return rules;
}

export function isSpaceRoutingEnabled(): boolean {
  return enabled;
}

export function setSpaceRoutingEnabled(value: boolean) {
  if (enabled === value) return;
  enabled = value;
  notify();
}

export function getSpaceRoutingMode(): RoutingMode {
  return mode;
}

export function setSpaceRoutingMode(value: RoutingMode) {
  if (mode === value) return;
  mode = value;
  notify();
}

export function addRoutingRule(domain: string, targetWorkspaceId: string): SpaceRoutingRule | null {
  const trimmed = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!trimmed) return null;

  // Check if workspace exists
  const validWorkspaces = getWorkspaces();
  if (!validWorkspaces.some((w) => w.id === targetWorkspaceId)) {
    return null;
  }

  // Remove existing rule for same domain if any
  rules = rules.filter((r) => r.domain !== trimmed);

  const rule: SpaceRoutingRule = {
    id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    domain: trimmed,
    targetWorkspaceId,
    createdAt: Date.now(),
  };
  rules = [...rules, rule];
  notify();
  return rule;
}

export function removeRoutingRule(id: string) {
  rules = rules.filter((r) => r.id !== id);
  notify();
}

export function findRuleForDomain(domainOrUrl: string): SpaceRoutingRule | undefined {
  if (!enabled || !domainOrUrl) return undefined;
  let hostname = domainOrUrl.trim().toLowerCase();
  try {
    if (hostname.includes("://")) {
      hostname = new URL(hostname).hostname.toLowerCase();
    } else {
      hostname = hostname.replace(/\/.*$/, "");
    }
  } catch {
    return undefined;
  }

  return rules.find((rule) => {
    const target = rule.domain.toLowerCase();
    return hostname === target || hostname.endsWith(`.${target}`);
  });
}

export function subscribeRoutingRules(listener: RoutingListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
