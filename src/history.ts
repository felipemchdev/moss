export type NavIntent = "back" | "forward" | "reload";

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
