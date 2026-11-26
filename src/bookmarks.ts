import { createEmitter, isRecord, isWebUrl, loadJson, saveJson } from "./storage";

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  createdAt: number;
  favicon?: string;
}

const STORAGE_KEY = "moss.bookmarks";

function parseBookmark(value: unknown): Bookmark | null {
  if (!isRecord(value)) return null;
  const { id, title, url, createdAt, favicon } = value;
  if (typeof id !== "string" || typeof title !== "string" || typeof url !== "string") return null;
  if (typeof createdAt !== "number" || !isWebUrl(url)) return null;
  const bookmark: Bookmark = { id, title, url, createdAt };
  if (typeof favicon === "string" && isWebUrl(favicon)) bookmark.favicon = favicon;
  return bookmark;
}

function load(): Bookmark[] {
  const stored = loadJson(STORAGE_KEY);
  if (!Array.isArray(stored)) return [];
  return stored.map(parseBookmark).filter((bookmark) => bookmark !== null);
}

let bookmarks: readonly Bookmark[] = load();
const emitter = createEmitter(() => bookmarks);

function commit(next: readonly Bookmark[]) {
  bookmarks = next;
  saveJson(STORAGE_KEY, bookmarks);
  emitter.emit();
}

export const subscribeBookmarks = emitter.subscribe;

export function getBookmarks(): readonly Bookmark[] {
  return bookmarks;
}

export function isBookmarked(url: string): boolean {
  return bookmarks.some((bookmark) => bookmark.url === url);
}

export function addBookmark(url: string, title: string): Bookmark | null {
  if (!isWebUrl(url)) return null;
  const existing = bookmarks.find((bookmark) => bookmark.url === url);
  if (existing) return existing;
  const bookmark: Bookmark = {
    id: crypto.randomUUID(),
    title: title.trim() || url,
    url,
    createdAt: Date.now(),
  };
  commit([...bookmarks, bookmark]);
  return bookmark;
}

export function removeBookmark(idOrUrl: string) {
  const next = bookmarks.filter((bookmark) => bookmark.id !== idOrUrl && bookmark.url !== idOrUrl);
  if (next.length !== bookmarks.length) commit(next);
}

export function importBookmarks(
  items: Array<{ title: string; url: string; createdAt?: number }>,
): number {
  let count = 0;
  const existingUrls = new Set(bookmarks.map((b) => b.url));
  const additions: Bookmark[] = [];

  for (const item of items) {
    if (!isWebUrl(item.url)) continue;
    if (existingUrls.has(item.url)) continue;
    existingUrls.add(item.url);
    additions.push({
      id: crypto.randomUUID(),
      title: item.title.trim() || item.url,
      url: item.url,
      createdAt:
        typeof item.createdAt === "number" && !isNaN(item.createdAt) ? item.createdAt : Date.now(),
    });
    count++;
  }

  if (additions.length > 0) {
    commit([...bookmarks, ...additions]);
  }
  return count;
}
