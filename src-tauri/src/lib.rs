use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::webview::{DownloadEvent, NewWindowResponse, PageLoadEvent, WebviewBuilder};
use tauri::{
    AppHandle, Emitter, EventTarget, LogicalPosition, LogicalSize, Manager, Runtime, State, Url,
    Webview, WebviewUrl,
};

const CHROME_LABEL: &str = "main";
const TAB_LABEL_PREFIX: &str = "tab-";

#[derive(Clone, Copy, Default, Deserialize, Serialize)]
struct Viewport {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct TabViewport {
    tab_id: String,
    viewport: Viewport,
}

impl Viewport {
    fn position(&self) -> LogicalPosition<f64> {
        LogicalPosition::new(self.x, self.y)
    }

    // A zero-sized webview fails to build on some platforms.
    fn size(&self) -> LogicalSize<f64> {
        LogicalSize::new(self.width.max(1.0), self.height.max(1.0))
    }
}

struct BrowserState {
    viewport: Mutex<Viewport>,
    shown_tabs: Mutex<Vec<String>>,
    tab_viewports: Mutex<HashMap<String, Viewport>>,
    shield_enabled: Mutex<bool>,
}

impl Default for BrowserState {
    fn default() -> Self {
        Self {
            viewport: Mutex::new(Viewport::default()),
            shown_tabs: Mutex::new(Vec::new()),
            tab_viewports: Mutex::new(HashMap::new()),
            shield_enabled: Mutex::new(true),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TabLoadPayload {
    tab_id: String,
    url: String,
    state: &'static str,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TabTitlePayload {
    tab_id: String,
    title: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TabOpenPayload {
    url: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadPayload {
    url: String,
    filename: String,
    progress: Option<f64>,
    state: &'static str,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrackerCountPayload {
    tab_id: String,
    count: u32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FindResultPayload {
    tab_id: String,
    active_match: u32,
    total_matches: u32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReaderContentPayload {
    tab_id: String,
    success: bool,
    title: String,
    byline: String,
    site_name: String,
    content_html: String,
    word_count: u32,
    reading_time_minutes: u32,
}

const TRACKER_BLOCKER_SCRIPT: &str = r#"
(function() {
  if (window.__moss_shield_injected) return;
  window.__moss_shield_injected = true;

  const BLOCKED_DOMAINS = [
    'google-analytics.com',
    'googletagmanager.com',
    'doubleclick.net',
    'googlesyndication.com',
    'googleadservices.com',
    'connect.facebook.net',
    'facebook.com/tr',
    'hotjar.com',
    'criteo.net',
    'criteo.com',
    'adservice.google.com',
    'outbrain.com',
    'taboola.com',
    'adnxs.com',
    'amazon-adsystem.com',
    'ads.pubmatic.com',
    'rubiconproject.com',
    'scorecardresearch.com'
  ];

  function isTracker(url) {
    if (!url || typeof url !== 'string') return false;
    if (window.__moss_shield_enabled === false) return false;
    try {
      var parsed = new URL(url, window.location.href);
      var host = parsed.hostname.toLowerCase();
      for (var i = 0; i < BLOCKED_DOMAINS.length; i++) {
        var d = BLOCKED_DOMAINS[i];
        if (host === d || host.endsWith('.' + d)) return true;
      }
    } catch (_) {}
    return false;
  }

  function countBlocked() {
    if (window.__moss_shield_enabled === false) return;
    window.__moss_trackers_blocked = (window.__moss_trackers_blocked || 0) + 1;
    try {
      window.dispatchEvent(new CustomEvent('moss-tracker-blocked', { detail: { count: window.__moss_trackers_blocked } }));
    } catch (_) {}
  }

  // Stubs for analytics and tracking
  if (window.__moss_shield_enabled !== false) {
    window.ga = window.ga || function() { (window.ga.q = window.ga.q || []).push(arguments); };
    window.ga.l = +new Date();
    window.gtag = window.gtag || function() { (window.dataLayer = window.dataLayer || []).push(arguments); };
    window.fbq = window.fbq || function() { (window.fbq.q = window.fbq.q || []).push(arguments); };
    window.fbq.push = window.fbq;
    window.fbq.loaded = true;
    window.fbq.version = '2.0';
  }

  // Intercept document.createElement for <script>
  const origCreateElement = Document.prototype.createElement;
  Document.prototype.createElement = function(tagName, options) {
    const el = origCreateElement.call(this, tagName, options);
    if (typeof tagName === 'string' && tagName.toLowerCase() === 'script') {
      const origSetAttribute = el.setAttribute;
      el.setAttribute = function(name, val) {
        if (name && name.toLowerCase() === 'src' && isTracker(val)) {
          countBlocked();
          return;
        }
        return origSetAttribute.call(this, name, val);
      };
      let actualSrc = '';
      Object.defineProperty(el, 'src', {
        get: function() { return actualSrc; },
        set: function(val) {
          if (isTracker(val)) {
            countBlocked();
            return;
          }
          actualSrc = val;
          el.setAttribute('src', val);
        },
        configurable: true
      });
    }
    return el;
  };

  // Intercept Node.prototype.appendChild & insertBefore
  const origAppendChild = Node.prototype.appendChild;
  Node.prototype.appendChild = function(child) {
    if (child && child.nodeName === 'SCRIPT') {
      const src = child.src || child.getAttribute('src');
      if (isTracker(src)) {
        countBlocked();
        return child;
      }
    }
    return origAppendChild.call(this, child);
  };

  const origInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function(newNode, refNode) {
    if (newNode && newNode.nodeName === 'SCRIPT') {
      const src = newNode.src || newNode.getAttribute('src');
      if (isTracker(src)) {
        countBlocked();
        return newNode;
      }
    }
    return origInsertBefore.call(this, newNode, refNode);
  };
})();
"#;

fn tab_label(tab_id: &str) -> String {
    format!("{TAB_LABEL_PREFIX}{tab_id}")
}

fn tab_id_of<R: Runtime>(webview: &Webview<R>) -> Option<String> {
    webview
        .label()
        .strip_prefix(TAB_LABEL_PREFIX)
        .map(str::to_owned)
}

fn tab_webviews<R: Runtime>(app: &AppHandle<R>) -> impl Iterator<Item = Webview<R>> {
    app.webviews()
        .into_values()
        .filter(|webview| webview.label().starts_with(TAB_LABEL_PREFIX))
}

fn get_tab<R: Runtime>(app: &AppHandle<R>, tab_id: &str) -> Result<Webview<R>, String> {
    app.get_webview(&tab_label(tab_id))
        .ok_or_else(|| format!("tab {tab_id} has no webview"))
}

fn parse_web_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|err| format!("invalid url: {err}"))?;
    match url.scheme() {
        "http" | "https" => Ok(url),
        "about" if url.path() == "blank" => Ok(url),
        scheme => Err(format!("scheme not allowed: {scheme}")),
    }
}

// Events go only to the chrome webview; tab webviews share the "main" window label.
fn emit_to_chrome<R: Runtime, S: Serialize + Clone>(app: &AppHandle<R>, event: &str, payload: S) {
    let _ = app.emit_to(EventTarget::webview(CHROME_LABEL), event, payload);
}

fn create_tab_webview<R: Runtime>(
    app: &AppHandle<R>,
    tab_id: &str,
    url: Url,
    viewport: Viewport,
) -> Result<Webview<R>, String> {
    let window = app
        .get_window(CHROME_LABEL)
        .ok_or("main window not found")?;

    let load_app = app.clone();
    let title_app = app.clone();
    let open_app = app.clone();
    let download_app = app.clone();

    let state = app.state::<BrowserState>();
    let shield_on = state.shield_enabled.lock().map(|g| *g).unwrap_or(true);
    let init_script = format!(
        "window.__moss_shield_enabled = {};\n{}",
        shield_on, TRACKER_BLOCKER_SCRIPT
    );

    let builder = WebviewBuilder::new(tab_label(tab_id), WebviewUrl::External(url))
        .initialization_script(&init_script)
        .on_download(move |_webview, event| {
            match event {
                DownloadEvent::Requested { url, destination } => {
                    let filename = destination
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| "arquivo.ext".to_string());
                    emit_to_chrome(
                        &download_app,
                        "download-started",
                        DownloadPayload {
                            url: url.to_string(),
                            filename,
                            progress: Some(0.0),
                            state: "started",
                        },
                    );
                    true
                }
                DownloadEvent::Finished { url, path, success } => {
                    let filename = path
                        .and_then(|p| p.file_name().map(|n| n.to_string_lossy().to_string()))
                        .unwrap_or_else(|| "arquivo.ext".to_string());
                    let state = if success { "completed" } else { "failed" };
                    emit_to_chrome(
                        &download_app,
                        "download-finished",
                        DownloadPayload {
                            url: url.to_string(),
                            filename,
                            progress: Some(100.0),
                            state,
                        },
                    );
                    true
                }
                _ => true,
            }
        })
        .on_page_load(move |webview, payload| {
            let Some(tab_id) = tab_id_of(&webview) else { return };
            let state = match payload.event() {
                PageLoadEvent::Started => "started",
                PageLoadEvent::Finished => "finished",
            };
            emit_to_chrome(
                &load_app,
                "tab://load",
                TabLoadPayload { tab_id: tab_id.clone(), url: payload.url().to_string(), state },
            );
            if payload.event() == PageLoadEvent::Finished {
                let count_app = load_app.clone();
                let count_tab_id = tab_id;
                let _ = webview.eval_with_callback(
                    "(window.__moss_trackers_blocked || 0).toString()",
                    move |res| {
                        let count = res.trim_matches('"').parse::<u32>().unwrap_or(0);
                        emit_to_chrome(
                            &count_app,
                            "tracker-blocked-count",
                            TrackerCountPayload {
                                tab_id: count_tab_id.clone(),
                                count,
                            },
                        );
                    },
                );
            }
        })
        .on_document_title_changed(move |webview, title| {
            let Some(tab_id) = tab_id_of(&webview) else { return };
            emit_to_chrome(&title_app, "tab://title", TabTitlePayload { tab_id, title });
        })
        .on_new_window(move |url, _features| {
            if parse_web_url(url.as_str()).is_ok() {
                emit_to_chrome(&open_app, "tab://open", TabOpenPayload { url: url.to_string() });
            }
            NewWindowResponse::Deny
        });

    window
        .add_child(builder, viewport.position(), viewport.size())
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn set_viewport(
    app: AppHandle,
    state: State<'_, BrowserState>,
    viewport: Viewport,
) -> Result<(), String> {
    *state.viewport.lock().map_err(|err| err.to_string())? = viewport;
    state.tab_viewports.lock().map_err(|err| err.to_string())?.clear();
    for webview in tab_webviews(&app) {
        webview
            .set_position(viewport.position())
            .and_then(|_| webview.set_size(viewport.size()))
            .map_err(|err| err.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn set_tab_viewports(
    app: AppHandle,
    state: State<'_, BrowserState>,
    viewports: Vec<TabViewport>,
) -> Result<(), String> {
    let mut stored = state.tab_viewports.lock().map_err(|err| err.to_string())?;
    for item in viewports {
        stored.insert(item.tab_id.clone(), item.viewport);
        if let Some(webview) = app.get_webview(&tab_label(&item.tab_id)) {
            webview
                .set_position(item.viewport.position())
                .and_then(|_| webview.set_size(item.viewport.size()))
                .map_err(|err| err.to_string())?;
        }
    }
    Ok(())
}

// Async: building a webview from a sync (main-thread) command deadlocks on Windows.
#[tauri::command]
async fn navigate_to(
    app: AppHandle,
    state: State<'_, BrowserState>,
    tab_id: String,
    url: String,
) -> Result<(), String> {
    let url = parse_web_url(&url)?;
    if let Some(webview) = app.get_webview(&tab_label(&tab_id)) {
        return webview.navigate(url).map_err(|err| err.to_string());
    }

    let viewport = {
        let viewports = state.tab_viewports.lock().map_err(|err| err.to_string())?;
        viewports.get(&tab_id).copied().unwrap_or_else(|| {
            state.viewport.lock().map(|v| *v).unwrap_or_default()
        })
    };
    let webview = create_tab_webview(&app, &tab_id, url, viewport)?;

    // The user may have switched tabs while the webview was being built.
    let shown = state.shown_tabs.lock().map_err(|err| err.to_string())?;
    if !shown.contains(&tab_id) {
        webview.hide().map_err(|err| err.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn reload_page(app: AppHandle, tab_id: String) -> Result<(), String> {
    get_tab(&app, &tab_id)?.reload().map_err(|err| err.to_string())
}

#[tauri::command]
fn go_back(app: AppHandle, tab_id: String) -> Result<(), String> {
    get_tab(&app, &tab_id)?
        .eval("history.back()")
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn go_forward(app: AppHandle, tab_id: String) -> Result<(), String> {
    get_tab(&app, &tab_id)?
        .eval("history.forward()")
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn show_tab(
    app: AppHandle,
    state: State<'_, BrowserState>,
    tab_id: Option<String>,
) -> Result<(), String> {
    let tab_ids = tab_id.into_iter().collect::<Vec<_>>();
    show_tabs(app, state, tab_ids)
}

#[tauri::command]
fn show_tabs(
    app: AppHandle,
    state: State<'_, BrowserState>,
    tab_ids: Vec<String>,
) -> Result<(), String> {
    *state.shown_tabs.lock().map_err(|err| err.to_string())? = tab_ids.clone();
    for webview in tab_webviews(&app) {
        let label = webview.label();
        let is_visible = tab_ids.iter().any(|id| label == tab_label(id));
        let result = if is_visible {
            webview.show()
        } else {
            webview.hide()
        };
        result.map_err(|err| err.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn close_tab(app: AppHandle, state: State<'_, BrowserState>, tab_id: String) -> Result<(), String> {
    if let Ok(mut shown) = state.shown_tabs.lock() {
        shown.retain(|id| id != &tab_id);
    }
    if let Ok(mut viewports) = state.tab_viewports.lock() {
        viewports.remove(&tab_id);
    }
    match app.get_webview(&tab_label(&tab_id)) {
        Some(webview) => webview.close().map_err(|err| err.to_string()),
        None => Ok(()),
    }
}

#[tauri::command]
fn minimize_window(app: AppHandle) -> Result<(), String> {
    app.get_window(CHROME_LABEL)
        .ok_or("main window not found")?
        .minimize()
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn toggle_maximize_window(app: AppHandle) -> Result<(), String> {
    let window = app.get_window(CHROME_LABEL).ok_or("main window not found")?;
    if window.is_maximized().map_err(|err| err.to_string())? {
        window.unmaximize().map_err(|err| err.to_string())
    } else {
        window.maximize().map_err(|err| err.to_string())
    }
}

#[tauri::command]
fn close_window(app: AppHandle) -> Result<(), String> {
    app.get_window(CHROME_LABEL)
        .ok_or("main window not found")?
        .close()
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn set_privacy_shield(
    app: AppHandle,
    state: State<'_, BrowserState>,
    enabled: bool,
) -> Result<(), String> {
    *state.shield_enabled.lock().map_err(|err| err.to_string())? = enabled;
    let script = format!("window.__moss_shield_enabled = {};", enabled);
    for webview in tab_webviews(&app) {
        let _ = webview.eval(&script);
    }
    Ok(())
}

#[tauri::command]
fn sync_tab_trackers_blocked(app: AppHandle, tab_id: String) -> Result<(), String> {
    let tab = get_tab(&app, &tab_id)?;
    let app_clone = app.clone();
    let tab_id_clone = tab_id;
    let _ = tab.eval_with_callback(
        "(window.__moss_trackers_blocked || 0).toString()",
        move |res| {
            let count = res.trim_matches('"').parse::<u32>().unwrap_or(0);
            emit_to_chrome(
                &app_clone,
                "tracker-blocked-count",
                TrackerCountPayload {
                    tab_id: tab_id_clone.clone(),
                    count,
                },
            );
        },
    );
    Ok(())
}

#[tauri::command]
fn reset_trackers_count(app: AppHandle) -> Result<(), String> {
    for webview in tab_webviews(&app) {
        let _ = webview.eval("window.__moss_trackers_blocked = 0;");
    }
    Ok(())
}

#[tauri::command]
fn export_data_file(app: AppHandle, filename: String, content: String) -> Result<String, String> {
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err("Invalid filename: directory separators and traversal are forbidden".to_string());
    }
    let path = std::path::Path::new(&filename);
    if path.is_absolute() {
        return Err("Invalid filename: absolute paths are forbidden".to_string());
    }
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    if !ext.eq_ignore_ascii_case("html") && !ext.eq_ignore_ascii_case("json") {
        return Err("Invalid filename: only .html and .json extensions are allowed".to_string());
    }
    let file_name = path.file_name().ok_or("Invalid filename")?;
    let download_dir = app.path().download_dir().map_err(|e| e.to_string())?;
    let target_path = download_dir.join(file_name);
    std::fs::write(&target_path, content.as_bytes())
        .map_err(|e| format!("Failed to write file {}: {}", target_path.display(), e))?;
    Ok(target_path.to_string_lossy().to_string())
}

#[tauri::command]
fn find_in_page(
    app: AppHandle,
    tab_id: String,
    query: String,
    forward: bool,
    case_sensitive: bool,
    find_next: bool,
) -> Result<(), String> {
    let tab = match app.get_webview(&tab_label(&tab_id)) {
        Some(w) => w,
        None => return Ok(()),
    };
    let app_clone = app.clone();
    let tab_id_clone = tab_id;

    let query_escaped = serde_json::to_string(&query).unwrap_or_else(|_| "\"\"".to_string());
    let script = format!(
        r#"(() => {{
  if (!document.getElementById('__moss_find_style')) {{
    const style = document.createElement('style');
    style.id = '__moss_find_style';
    style.textContent = `
      ::highlight(__moss-find-match) {{
        background-color: #ffd43b !important;
        color: #000000 !important;
      }}
      ::highlight(__moss-find-active) {{
        background-color: #ff922b !important;
        color: #ffffff !important;
      }}
    `;
    (document.head || document.documentElement).appendChild(style);
  }}

  const query = {query_escaped};
  if (!query) {{
    if (typeof CSS !== 'undefined' && CSS.highlights) {{
      CSS.highlights.delete('__moss-find-match');
      CSS.highlights.delete('__moss-find-active');
    }}
    window.__moss_find_state = null;
    return JSON.stringify({{ activeIndex: 0, totalMatches: 0 }});
  }}

  const caseSensitive = {case_sensitive};
  const forward = {forward};
  const findNext = {find_next};

  let state = window.__moss_find_state;
  const isSameQuery = state && state.query === query && state.caseSensitive === caseSensitive;

  if (!isSameQuery || !findNext) {{
    const ranges = [];
    const treeWalker = document.createTreeWalker(
      document.body || document.documentElement,
      NodeFilter.SHOW_TEXT,
      {{
        acceptNode(node) {{
          if (!node.textContent || !node.textContent.trim()) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEXTAREA' || tag === 'INPUT') {{
            return NodeFilter.FILTER_REJECT;
          }}
          const style = window.getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {{
            return NodeFilter.FILTER_REJECT;
          }}
          return NodeFilter.FILTER_ACCEPT;
        }}
      }}
    );

    const needle = caseSensitive ? query : query.toLowerCase();
    let node;
    while ((node = treeWalker.nextNode())) {{
      const text = caseSensitive ? node.textContent : node.textContent.toLowerCase();
      let pos = 0;
      while ((pos = text.indexOf(needle, pos)) !== -1) {{
        try {{
          const range = document.createRange();
          range.setStart(node, pos);
          range.setEnd(node, pos + needle.length);
          ranges.push(range);
        }} catch (_) {{}}
        pos += needle.length;
      }}
    }}

    state = {{
      query,
      caseSensitive,
      ranges,
      currentIndex: ranges.length > 0 ? 0 : -1,
    }};
    window.__moss_find_state = state;
  }} else {{
    if (state.ranges.length > 0) {{
      if (forward) {{
        state.currentIndex = (state.currentIndex + 1) % state.ranges.length;
      }} else {{
        state.currentIndex = (state.currentIndex - 1 + state.ranges.length) % state.ranges.length;
      }}
    }}
  }}

  const totalMatches = state.ranges.length;
  const activeIndex = totalMatches > 0 ? state.currentIndex + 1 : 0;

  if (totalMatches > 0 && typeof CSS !== 'undefined' && CSS.highlights) {{
    try {{
      const matchHighlight = new Highlight(...state.ranges);
      CSS.highlights.set('__moss-find-match', matchHighlight);

      const activeRange = state.ranges[state.currentIndex];
      if (activeRange) {{
        const activeHighlight = new Highlight(activeRange);
        CSS.highlights.set('__moss-find-active', activeHighlight);
        const el = activeRange.startContainer.parentElement;
        if (el) {{
          el.scrollIntoView({{ behavior: 'smooth', block: 'center', inline: 'nearest' }});
        }}
      }}
    }} catch (_) {{}}
  }} else if (totalMatches > 0) {{
    const activeRange = state.ranges[state.currentIndex];
    if (activeRange) {{
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(activeRange);
      const el = activeRange.startContainer.parentElement;
      if (el) el.scrollIntoView({{ behavior: 'smooth', block: 'center' }});
    }}
  }} else {{
    if (typeof CSS !== 'undefined' && CSS.highlights) {{
      CSS.highlights.delete('__moss-find-match');
      CSS.highlights.delete('__moss-find-active');
    }}
  }}

  return JSON.stringify({{ activeIndex, totalMatches }});
}})()"#
    );

    let _ = tab.eval_with_callback(&script, move |res| {
        let unquoted = if res.starts_with('"') && res.ends_with('"') && res.len() >= 2 {
            serde_json::from_str::<String>(&res).unwrap_or_else(|_| res.to_string())
        } else {
            res.to_string()
        };
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&unquoted) {
            let active = val.get("activeIndex").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            let total = val.get("totalMatches").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            emit_to_chrome(
                &app_clone,
                "find-in-page-result",
                FindResultPayload {
                    tab_id: tab_id_clone.clone(),
                    active_match: active,
                    total_matches: total,
                },
            );
        }
    });

    Ok(())
}

#[tauri::command]
fn clear_find_in_page(app: AppHandle, tab_id: String) -> Result<(), String> {
    let tab = match app.get_webview(&tab_label(&tab_id)) {
        Some(w) => w,
        None => return Ok(()),
    };
    let script = r#"(() => {
  if (typeof CSS !== 'undefined' && CSS.highlights) {
    CSS.highlights.delete('__moss-find-match');
    CSS.highlights.delete('__moss-find-active');
  }
  window.__moss_find_state = null;
})()"#;
    let _ = tab.eval(script);
    Ok(())
}

#[tauri::command]
fn extract_reader_content(app: AppHandle, tab_id: String) -> Result<(), String> {
    let tab = match app.get_webview(&tab_label(&tab_id)) {
        Some(w) => w,
        None => return Ok(()),
    };
    let app_clone = app.clone();
    let tab_id_clone = tab_id;

    let script = r#"(() => {
  try {
    const title =
      document.querySelector('meta[property="og:title"]')?.content ||
      document.querySelector('meta[name="twitter:title"]')?.content ||
      document.querySelector('h1')?.textContent?.trim() ||
      document.title ||
      'Artigo sem título';

    const byline =
      document.querySelector('meta[name="author"]')?.content ||
      document.querySelector('meta[property="article:author"]')?.content ||
      document.querySelector('[rel="author"], .byline, .author, .author-name')?.textContent?.trim() ||
      '';

    const siteName =
      document.querySelector('meta[property="og:site_name"]')?.content ||
      location.hostname ||
      '';

    let root =
      document.querySelector('article') ||
      document.querySelector('[role="article"]') ||
      document.querySelector('main') ||
      document.querySelector('.article-body, .post-content, .entry-content, .content, #content');

    if (!root) {
      let maxScore = 0;
      let bestElem = document.body;
      const candidates = document.querySelectorAll('div, section, article');
      for (const cand of candidates) {
        const pCount = cand.querySelectorAll('p').length;
        const textLen = (cand.textContent || '').trim().length;
        const score = pCount * 50 + Math.min(textLen, 1000);
        if (score > maxScore) {
          maxScore = score;
          bestElem = cand;
        }
      }
      root = bestElem || document.body;
    }

    const clone = root.cloneNode(true);

    const selectorsToRemove = [
      'script', 'style', 'noscript', 'iframe', 'canvas', 'svg',
      'nav', 'footer', 'header', 'aside', 'form', 'button',
      '.ad', '.ads', '.advertisement', '.popup', '.banner',
      '.share', '.social', '.comments', '.sidebar', '.menu',
      '[aria-hidden="true"]', '[role="navigation"]', '[role="banner"]'
    ];
    for (const sel of selectorsToRemove) {
      for (const el of clone.querySelectorAll(sel)) {
        el.remove();
      }
    }

    for (const img of clone.querySelectorAll('img')) {
      if (img.dataset && img.dataset.src) img.src = img.dataset.src;
      if (img.src) {
        try {
          img.src = new URL(img.src, location.href).href;
        } catch (_) {}
      }
    }

    for (const a of clone.querySelectorAll('a')) {
      const rawHref = a.getAttribute('href');
      if (rawHref && rawHref.startsWith('#')) continue;
      if (a.href) {
        try {
          a.href = new URL(a.href, location.href).href;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
        } catch (_) {}
      }
    }

    const contentHtml = clone.innerHTML;
    const textContent = clone.textContent?.trim() || '';
    const words = textContent.split(/\s+/).filter(Boolean).length;
    const readingTimeMinutes = Math.max(1, Math.ceil(words / 200));

    return JSON.stringify({
      success: true,
      title,
      byline,
      siteName,
      contentHtml,
      wordCount: words,
      readingTimeMinutes,
    });
  } catch (err) {
    return JSON.stringify({
      success: false,
      title: document.title || '',
      byline: '',
      siteName: location.hostname || '',
      contentHtml: '<p>Não foi possível extrair o conteúdo legível desta página.</p>',
      wordCount: 0,
      readingTimeMinutes: 1,
    });
  }
})()"#;

    let _ = tab.eval_with_callback(script, move |res| {
        let unquoted = if res.starts_with('"') && res.ends_with('"') && res.len() >= 2 {
            serde_json::from_str::<String>(&res).unwrap_or_else(|_| res.to_string())
        } else {
            res.to_string()
        };
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&unquoted) {
            let success = val.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
            let title = val.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let byline = val.get("byline").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let site_name = val.get("siteName").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let content_html = val.get("contentHtml").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let word_count = val.get("wordCount").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            let reading_time_minutes = val.get("readingTimeMinutes").and_then(|v| v.as_u64()).unwrap_or(1) as u32;

            emit_to_chrome(
                &app_clone,
                "reader-content-result",
                ReaderContentPayload {
                    tab_id: tab_id_clone.clone(),
                    success,
                    title,
                    byline,
                    site_name,
                    content_html,
                    word_count,
                    reading_time_minutes,
                },
            );
        }
    });

    Ok(())
}

#[tauri::command]
fn set_tab_zoom(app: AppHandle, tab_id: String, scale_factor: f64) -> Result<(), String> {
    let tab = match app.get_webview(&tab_label(&tab_id)) {
        Some(w) => w,
        None => return Ok(()),
    };

    let clamped = if scale_factor.is_nan() || scale_factor <= 0.0 {
        1.0
    } else {
        scale_factor.clamp(0.25, 5.0)
    };

    tab.set_zoom(clamped).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(BrowserState::default())
        .invoke_handler(tauri::generate_handler![
            set_viewport,
            set_tab_viewports,
            navigate_to,
            reload_page,
            go_back,
            go_forward,
            show_tab,
            show_tabs,
            close_tab,
            minimize_window,
            toggle_maximize_window,
            close_window,
            set_privacy_shield,
            sync_tab_trackers_blocked,
            reset_trackers_count,
            export_data_file,
            find_in_page,
            clear_find_in_page,
            extract_reader_content,
            set_tab_zoom,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
