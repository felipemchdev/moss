import { invoke } from "@tauri-apps/api/core";
import type { Bookmark } from "./bookmarks";
import type { HistoryEntry } from "./history";
import { isRecord, isWebUrl } from "./storage";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function unescapeHtml(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export interface ParsedBookmarkItem {
  title: string;
  url: string;
  createdAt: number;
}

export interface ParsedHistoryItem {
  title: string;
  url: string;
  visitedAt: number;
}

export interface MossBackupData {
  version: 1;
  app: "moss";
  exportedAt: number;
  bookmarks: ParsedBookmarkItem[];
  history: ParsedHistoryItem[];
}

export function exportBookmarksToHtml(bookmarks: readonly Bookmark[]): string {
  const lines: string[] = [
    "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
    "<!-- This is an automatically generated file.",
    "     It will be read and overwritten.",
    "     DO NOT EDIT! -->",
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    "<TITLE>Bookmarks</TITLE>",
    "<H1>Bookmarks</H1>",
    "<DL><p>",
    '    <DT><H3 ADD_DATE="0" LAST_MODIFIED="0">Moss Bookmarks</H3>',
    "    <DL><p>",
  ];

  for (const b of bookmarks) {
    const addDate = Math.floor(b.createdAt / 1000);
    const title = escapeHtml(b.title || b.url);
    const url = escapeHtml(b.url);
    lines.push(`        <DT><A HREF="${url}" ADD_DATE="${addDate}">${title}</A>`);
  }

  lines.push("    </DL><p>");
  lines.push("</DL><p>");
  return lines.join("\n");
}

export function parseBookmarksFromHtml(html: string): ParsedBookmarkItem[] {
  const results: ParsedBookmarkItem[] = [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const links = doc.querySelectorAll("a");
    for (const a of Array.from(links)) {
      const url = a.getAttribute("href") || "";
      if (!isWebUrl(url)) continue;
      const title = a.textContent?.trim() || url;
      const addDateRaw = a.getAttribute("add_date") || a.getAttribute("ADD_DATE");
      const addDate = addDateRaw ? parseInt(addDateRaw, 10) * 1000 : Date.now();
      results.push({
        title,
        url,
        createdAt: isNaN(addDate) ? Date.now() : addDate,
      });
    }
  } catch {
    const regex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
      const url = unescapeHtml(match[1]);
      if (isWebUrl(url)) {
        results.push({
          title: unescapeHtml(match[2].trim()) || url,
          url,
          createdAt: Date.now(),
        });
      }
    }
  }
  return results;
}

export function exportBackupToJson(
  bookmarks: readonly Bookmark[],
  history: readonly HistoryEntry[],
): string {
  const backup: MossBackupData = {
    version: 1,
    app: "moss",
    exportedAt: Date.now(),
    bookmarks: bookmarks.map((b) => ({
      title: b.title,
      url: b.url,
      createdAt: b.createdAt,
    })),
    history: history.map((h) => ({
      title: h.title,
      url: h.url,
      visitedAt: h.visitedAt,
    })),
  };
  return JSON.stringify(backup, null, 2);
}

export function parseBackupFromJson(jsonStr: string): {
  bookmarks: ParsedBookmarkItem[];
  history: ParsedHistoryItem[];
} | null {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!isRecord(parsed)) return null;

    const bookmarks: ParsedBookmarkItem[] = [];
    const history: ParsedHistoryItem[] = [];

    if (Array.isArray(parsed.bookmarks)) {
      for (const item of parsed.bookmarks) {
        if (isRecord(item) && typeof item.url === "string" && isWebUrl(item.url)) {
          const title = typeof item.title === "string" ? item.title.trim() : item.url;
          const createdAt =
            typeof item.createdAt === "number" && !isNaN(item.createdAt)
              ? item.createdAt
              : Date.now();
          bookmarks.push({ title: title || item.url, url: item.url, createdAt });
        }
      }
    }

    if (Array.isArray(parsed.history)) {
      for (const item of parsed.history) {
        if (isRecord(item) && typeof item.url === "string" && isWebUrl(item.url)) {
          const title = typeof item.title === "string" ? item.title.trim() : item.url;
          const visitedAt =
            typeof item.visitedAt === "number" && !isNaN(item.visitedAt)
              ? item.visitedAt
              : Date.now();
          history.push({ title: title || item.url, url: item.url, visitedAt });
        }
      }
    }

    return { bookmarks, history };
  } catch {
    return null;
  }
}

export async function saveExportFile(
  content: string,
  filename: string,
): Promise<string> {
  return await invoke<string>("export_data_file", { filename, content });
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, "UTF-8");
  });
}
