import { createEmitter, isRecord, isWebUrl, loadJson, saveJson } from "./storage";

export type NavIntent = "back" | "forward" | "reload";

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  visitedAt: number;
}

const STORAGE_KEY = "moss.history";
const MAX_ENTRIES = 3000;
const SAVE_DELAY_MS = 500;

function parseEntry(value: unknown): HistoryEntry | null {
  if (!isRecord(value)) return null;
  const { id, url, title, visitedAt } = value;
  if (typeof id !== "string" || typeof url !== "string" || typeof title !== "string") return null;
  if (typeof visitedAt !== "number" || !isWebUrl(url)) return null;
  return { id, url, title, visitedAt };
}

function load(): HistoryEntry[] {
  const stored = loadJson(STORAGE_KEY);
  if (!Array.isArray(stored)) return [];
  return stored
    .map(parseEntry)
    .filter((entry) => entry !== null)
    .sort((a, b) => b.visitedAt - a.visitedAt)
    .slice(0, MAX_ENTRIES);
}

// Newest first.
let entries: readonly HistoryEntry[] = load();
let saveTimer: number | undefined;
const emitter = createEmitter(() => entries);

function flush() {
  if (saveTimer === undefined) return;
  clearTimeout(saveTimer);
  saveTimer = undefined;
  saveJson(STORAGE_KEY, entries);
}

// Titles can change many times per page, so writes are debounced.
function commit(next: readonly HistoryEntry[]) {
  entries = next;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(flush, SAVE_DELAY_MS);
  emitter.emit();
}

window.addEventListener("pagehide", flush);

export const subscribeHistory = emitter.subscribe;

export function recordVisit(url: string, title: string, isPrivate?: boolean) {
  if (isPrivate) return;
  if (!isWebUrl(url)) return;
  const [latest, ...rest] = entries;
  const visitedAt = Date.now();
  if (latest?.url === url) {
    commit([{ ...latest, title: title || latest.title, visitedAt }, ...rest]);
    return;
  }
  const entry = { id: crypto.randomUUID(), url, title: title || url, visitedAt };
  commit([entry, ...entries].slice(0, MAX_ENTRIES));
}

export function addHistoryEntry(
  url: string,
  title: string,
  tab?: { isPrivate?: boolean } | boolean,
) {
  const isPrivate = typeof tab === "boolean" ? tab : tab?.isPrivate;
  if (isPrivate) return;
  recordVisit(url, title);
}

export function updateVisitTitle(url: string, title: string) {
  const index = entries.findIndex((entry) => entry.url === url);
  if (index === -1 || !title || entries[index].title === title) return;
  commit(entries.map((entry, i) => (i === index ? { ...entry, title } : entry)));
}

export function getRecentHistory(limit = 50): readonly HistoryEntry[] {
  return entries.slice(0, limit);
}

function normalizeText(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function searchHistory(query: string, limit = 200): readonly HistoryEntry[] {
  const terms = normalizeText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return getRecentHistory(limit);
  const matches: HistoryEntry[] = [];
  for (const entry of entries) {
    const haystack = normalizeText(`${entry.title}\n${entry.url}`);
    if (terms.every((term) => haystack.includes(term))) matches.push(entry);
    if (matches.length >= limit) break;
  }
  return matches;
}

export function removeHistoryEntry(id: string) {
  const next = entries.filter((entry) => entry.id !== id);
  if (next.length !== entries.length) commit(next);
}

export function clearHistory() {
  if (entries.length > 0) commit([]);
}

export function getHistory(): readonly HistoryEntry[] {
  return entries;
}

export function importHistory(
  items: Array<{ title: string; url: string; visitedAt?: number }>,
): number {
  const existingKeys = new Set(entries.map((e) => `${e.url}|${e.visitedAt}`));
  const additions: HistoryEntry[] = [];

  for (const item of items) {
    if (!isWebUrl(item.url)) continue;
    const visitedAt =
      typeof item.visitedAt === "number" && !isNaN(item.visitedAt) ? item.visitedAt : Date.now();
    const key = `${item.url}|${visitedAt}`;
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    additions.push({
      id: crypto.randomUUID(),
      title: item.title.trim() || item.url,
      url: item.url,
      visitedAt,
    });
  }

  if (additions.length > 0) {
    const merged = [...entries, ...additions]
      .sort((a, b) => b.visitedAt - a.visitedAt)
      .slice(0, MAX_ENTRIES);
    commit(merged);
  }
  return additions.length;
}

// Mirrors the webview's session history from load events, since Tauri exposes no canGoBack/canGoForward.
export class NavHistory {
  private entries: string[] = [];
  private index = -1;
  private intent: NavIntent | null = null;

  expect(intent: NavIntent) {
    this.intent = intent;
  }

  commit(url: string) {
    const intent = this.intent;
    this.intent = null;

    if (intent === "back" && this.entries[this.index - 1] === url) {
      this.index--;
      return;
    }
    if (intent === "forward" && this.entries[this.index + 1] === url) {
      this.index++;
      return;
    }
    if (this.entries[this.index] === url) return;

    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push(url);
    this.index = this.entries.length - 1;
  }

  get canGoBack() {
    return this.index > 0;
  }

  get canGoForward() {
    return this.index < this.entries.length - 1;
  }
}
