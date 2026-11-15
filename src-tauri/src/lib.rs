use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::webview::{
    DownloadEvent, NewWindowResponse, PageLoadEvent, PermissionKind, PermissionResponse,
    WebviewBuilder,
};
use tauri::{
    AppHandle, Emitter, EventTarget, LogicalPosition, LogicalSize, Manager, Runtime, State, Url,
    Webview, WebviewUrl,
};

const CHROME_LABEL: &str = "main";
const TAB_LABEL_PREFIX: &str = "tab-";

#[cfg(windows)]
mod accelerators;
#[cfg(windows)]
mod taskbar_tabs;
#[cfg(windows)]
mod webview2_blocker;

#[derive(Default)]
struct BlockerHandle {
    token: i64,
    filters: Vec<String>,
}

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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct DomainPermissions {
    camera: Option<String>,
    microphone: Option<String>,
    geolocation: Option<String>,
    notifications: Option<String>,
}

struct BrowserState {
    viewport: Mutex<Viewport>,
    shown_tabs: Mutex<Vec<String>>,
    tab_viewports: Mutex<HashMap<String, Viewport>>,
    shield_enabled: Mutex<bool>,
    site_permissions: Mutex<HashMap<String, DomainPermissions>>,
    tracker_counts: Mutex<HashMap<String, u32>>,
    blockers: Mutex<HashMap<String, BlockerHandle>>,
    tab_proxies: Mutex<HashMap<String, isize>>,
}

impl Default for BrowserState {
    fn default() -> Self {
        Self {
            viewport: Mutex::new(Viewport::default()),
            shown_tabs: Mutex::new(Vec::new()),
            tab_viewports: Mutex::new(HashMap::new()),
            shield_enabled: Mutex::new(true),
            site_permissions: Mutex::new(HashMap::new()),
            tracker_counts: Mutex::new(HashMap::new()),
            blockers: Mutex::new(HashMap::new()),
            tab_proxies: Mutex::new(HashMap::new()),
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
    path: Option<String>,
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

  function shieldEnabled() {
    return window.__moss_shield_enabled !== false;
  }

  if (shieldEnabled()) {
    window.ga = window.ga || function() { (window.ga.q = window.ga.q || []).push(arguments); };
    window.ga.l = +new Date();
    window.gtag = window.gtag || function() { (window.dataLayer = window.dataLayer || []).push(arguments); };
    window.fbq = window.fbq || function() { (window.fbq.q = window.fbq.q || []).push(arguments); };
    window.fbq.push = window.fbq;
    window.fbq.loaded = true;
    window.fbq.version = '2.0';
  }

  var player = null;
  var adActive = false;
  var seekDone = false;
  var contentDuration = NaN;
  var adVideo = null;
  var adMutation = null;
  var wasMuted = false;
  var wasPlaybackRate = 1;

  function clickSkip() {
    var selectors = ['.ytp-ad-skip-button', '.ytp-ad-skip-button-modern', '.ytp-ad-skip-button-slot', '.ytp-skip-ad-button'];
    for (var i = 0; i < selectors.length; i++) {
      var button = document.querySelector(selectors[i]);
      if (button) {
        try { button.click(); } catch (_) {}
        return;
      }
    }
  }

  function bufferedCovers(video, target) {
    var ranges = video.buffered;
    for (var i = 0; i < ranges.length; i++) {
      if (ranges.start(i) <= target && ranges.end(i) >= target) return true;
    }
    return false;
  }

  function detachAdVideo() {
    if (!adVideo) return;
    adVideo.removeEventListener('timeupdate', adTick);
    adVideo.removeEventListener('progress', adTick);
    adVideo.removeEventListener('durationchange', adTick);
    adVideo = null;
  }

  function restoreVideo() {
    if (adVideo) {
      try { adVideo.playbackRate = wasPlaybackRate; } catch (_) {}
      try { adVideo.muted = wasMuted; } catch (_) {}
    }
    detachAdVideo();
    if (adMutation) {
      adMutation.disconnect();
      adMutation = null;
    }
    wasMuted = false;
    wasPlaybackRate = 1;
    adActive = false;
    seekDone = false;
  }

  function adTick() {
    if (!player) return;
    if (!shieldEnabled()) {
      if (adActive) restoreVideo();
      return;
    }
    var video = player.querySelector('video');
    if (!player.classList.contains('ad-showing')) {
      if (adActive) restoreVideo();
      if (video && video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0) {
        contentDuration = video.duration;
      }
      return;
    }
    if (!video) return;
    if (!adActive) {
      adActive = true;
      seekDone = false;
      adVideo = video;
      wasMuted = !!video.muted;
      wasPlaybackRate = video.playbackRate || 1;
      adVideo.addEventListener('timeupdate', adTick);
      adVideo.addEventListener('progress', adTick);
      adVideo.addEventListener('durationchange', adTick);
      adMutation = new MutationObserver(function() {
        if (player && player.classList.contains('ad-showing')) adTick();
      });
      adMutation.observe(player, { childList: true, subtree: true });
    }
    var isSsai = Number.isFinite(video.duration) && Number.isFinite(contentDuration) && contentDuration > 0 && video.duration >= contentDuration - 1;
    if (isSsai) {
      clickSkip();
      return;
    }
    clickSkip();
    try { video.playbackRate = 16; } catch (_) {}
    try { video.muted = true; } catch (_) {}
    if (seekDone) return;
    if (video.readyState < 2) return;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    if (!Number.isFinite(contentDuration) || contentDuration <= 0) return;
    if (video.duration >= contentDuration - 1) return;
    var target = Math.max(0, video.duration - 0.1);
    if (!bufferedCovers(video, target)) return;
    try {
      video.currentTime = target;
      seekDone = true;
    } catch (_) {}
  }

  function attachPlayer() {
    if (player) return;
    player = document.getElementById('movie_player');
    if (!player) return;
    var video = player.querySelector('video');
    if (video && video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0) {
      contentDuration = video.duration;
    }
    new MutationObserver(adTick).observe(player, { attributes: true, attributeFilter: ['class'] });
    adTick();
  }

  window.__moss_set_shield_state = function(enabled) {
    window.__moss_shield_enabled = enabled;
    if (!enabled) {
      var style = document.getElementById('__moss_yt_ad_style__');
      if (style) style.remove();
      restoreVideo();
      return;
    }
    attachPlayer();
    adTick();
  };

  var host = location.hostname;
  var isYouTubeHost = host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be';
  if (!isYouTubeHost) return;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachPlayer);
  } else {
    attachPlayer();
  }

  if (!player) {
    var bootObserver = new MutationObserver(function() {
      attachPlayer();
      if (player) bootObserver.disconnect();
    });
    bootObserver.observe(document.documentElement || document, { childList: true, subtree: true });
  }
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

    let blank = Url::parse("about:blank").map_err(|err| err.to_string())?;
    let builder = WebviewBuilder::new(tab_label(tab_id), WebviewUrl::External(blank))
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
                            path: Some(destination.to_string_lossy().to_string()),
                            progress: Some(0.0),
                            state: "started",
                        },
                    );
                    true
                }
                DownloadEvent::Finished { url, path, success } => {
                    let filename = path
                        .as_ref()
                        .and_then(|p| p.file_name().map(|n| n.to_string_lossy().to_string()))
                        .unwrap_or_else(|| "arquivo.ext".to_string());
                    let state = if success { "completed" } else { "failed" };
                    let downloaded_path = path.as_ref().map(|p| p.to_string_lossy().to_string());
                    emit_to_chrome(
                        &download_app,
                        "download-finished",
                        DownloadPayload {
                            url: url.to_string(),
                            filename,
                            path: downloaded_path,
                            progress: Some(if success { 100.0 } else { 0.0 }),
                            state,
                        },
                    );
                    true
                }
                _ => true,
            }
        })
        .on_page_load(move |webview, payload| {
            if payload.url().scheme() == "about" {
                return;
            }
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
            match payload.event() {
                PageLoadEvent::Started => {
                    if let Ok(mut counts) = load_app.state::<BrowserState>().tracker_counts.lock() {
                        counts.insert(tab_id.clone(), 0);
                    }
                    emit_to_chrome(
                        &load_app,
                        "tracker-blocked-count",
                        TrackerCountPayload { tab_id, count: 0 },
                    );
                }
                PageLoadEvent::Finished => {
                    let count = load_app
                        .state::<BrowserState>()
                        .tracker_counts
                        .lock()
                        .ok()
                        .and_then(|counts| counts.get(&tab_id).copied())
                        .unwrap_or(0);
                    emit_to_chrome(
                        &load_app,
                        "tracker-blocked-count",
                        TrackerCountPayload { tab_id, count },
                    );
                }
            }
        })
        .on_document_title_changed(move |webview, title| {
            if webview.url().map(|url| url.scheme() == "about").unwrap_or(false) {
                return;
            }
            let Some(tab_id) = tab_id_of(&webview) else { return };
            emit_to_chrome(&title_app, "tab://title", TabTitlePayload { tab_id, title });
        })
        .on_new_window(move |url, _features| {
            if parse_web_url(url.as_str()).is_ok() {
                emit_to_chrome(&open_app, "tab://open", TabOpenPayload { url: url.to_string() });
            }
            NewWindowResponse::Deny
        })
        .on_permission_request(move |webview, kind| {
            let state = webview.state::<BrowserState>();
            let domain = match webview.url() {
                Ok(u) => u.host_str().map(|h| h.to_lowercase()).unwrap_or_default(),
                Err(_) => String::new(),
            };
            if domain.is_empty() {
                return PermissionResponse::Default;
            }
            let perms = state.site_permissions.lock().unwrap();
            if let Some(dp) = perms.get(&domain) {
                let status = match kind {
                    PermissionKind::Camera => dp.camera.as_deref(),
                    PermissionKind::Microphone => dp.microphone.as_deref(),
                    PermissionKind::Geolocation => dp.geolocation.as_deref(),
                    PermissionKind::Notifications => dp.notifications.as_deref(),
                    _ => None,
                };
                match status {
                    Some("allow") => PermissionResponse::Allow,
                    Some("block") => PermissionResponse::Deny,
                    _ => PermissionResponse::Default,
                }
            } else {
                PermissionResponse::Default
            }
        });

    let webview = window
        .add_child(builder, viewport.position(), viewport.size())
        .map_err(|err| err.to_string())?;

    #[cfg(windows)]
    {
        webview2_blocker::attach(app, tab_id, &webview);
        accelerators::attach(app, tab_id, &webview);
        taskbar_tabs::register(app, tab_id);
    }

    if let Err(err) = webview.navigate(url) {
        let _ = webview.close();
        return Err(err.to_string());
    }

    Ok(webview)
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
async fn close_tab(
    app: AppHandle,
    state: State<'_, BrowserState>,
    tab_id: String,
) -> Result<(), String> {
    if let Ok(mut shown) = state.shown_tabs.lock() {
        shown.retain(|id| id != &tab_id);
    }
    if let Ok(mut viewports) = state.tab_viewports.lock() {
        viewports.remove(&tab_id);
    }
    if let Ok(mut counts) = state.tracker_counts.lock() {
        counts.remove(&tab_id);
    }

    #[cfg(windows)]
    taskbar_tabs::unregister(&app, &tab_id);

    #[cfg(windows)]
    let handle = state
        .blockers
        .lock()
        .ok()
        .and_then(|mut blockers| blockers.remove(&tab_id));

    match app.get_webview(&tab_label(&tab_id)) {
        Some(webview) => {
            #[cfg(windows)]
            if let Some(handle) = handle {
                let _ = webview
                    .with_webview(move |platform| webview2_blocker::detach(platform, handle));
            }
            webview.close().map_err(|err| err.to_string())
        }
        None => Ok(()),
    }
}

#[tauri::command]
fn set_taskbar_active_tab(app: AppHandle, tab_id: String) -> Result<(), String> {
    #[cfg(windows)]
    taskbar_tabs::set_active(&app, &tab_id);
    #[cfg(not(windows))]
    let _ = (&app, &tab_id);
    Ok(())
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
    let script = format!(
        "window.__moss_shield_enabled = {enabled}; if (window.__moss_set_shield_state) window.__moss_set_shield_state({enabled});"
    );
    for webview in tab_webviews(&app) {
        let _ = webview.eval(&script);
    }
    Ok(())
}

#[tauri::command]
fn sync_tab_trackers_blocked(
    app: AppHandle,
    state: State<'_, BrowserState>,
    tab_id: String,
) -> Result<(), String> {
    let count = state
        .tracker_counts
        .lock()
        .ok()
        .and_then(|counts| counts.get(&tab_id).copied())
        .unwrap_or(0);
    emit_to_chrome(
        &app,
        "tracker-blocked-count",
        TrackerCountPayload { tab_id, count },
    );
    Ok(())
}

#[tauri::command]
fn reset_trackers_count(state: State<'_, BrowserState>) -> Result<(), String> {
    if let Ok(mut counts) = state.tracker_counts.lock() {
        counts.clear();
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

#[tauri::command]
async fn clear_tab_data(app: AppHandle, tab_id: String) -> Result<(), String> {
    let tab = match app.get_webview(&tab_label(&tab_id)) {
        Some(w) => w,
        None => return Ok(()),
    };

    let tab_url = tab.url().ok();
    let target_domain = tab_url
        .as_ref()
        .and_then(|u| u.host_str())
        .map(|h| h.to_lowercase())
        .unwrap_or_default();

    if !target_domain.is_empty() {
        let tab_clone = tab.clone();
        let domain_clone = target_domain.clone();
        let _ = tauri::async_runtime::spawn_blocking(move || {
            if let Ok(cookies) = tab_clone.cookies() {
                for c in cookies {
                    let mut matches = false;
                    if let Some(cdomain) = c.domain() {
                        let cdomain_clean = cdomain.trim_start_matches('.');
                        if domain_clone == cdomain_clean
                            || domain_clone.ends_with(&format!(".{}", cdomain_clean))
                        {
                            matches = true;
                        }
                    } else {
                        matches = false;
                    }
                    if matches {
                        let _ = tab_clone.delete_cookie(c);
                    }
                }
            }
        })
        .await;
    }

    let script = r#"(async () => {
  try {
    localStorage.clear();
    sessionStorage.clear();
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i];
      const eqPos = cookie.indexOf('=');
      const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();
      if (!name) continue;
      document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
      document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=' + location.hostname;
      const parts = location.hostname.split('.');
      while (parts.length > 1) {
        document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.' + parts.join('.');
        parts.shift();
      }
    }
    if (window.caches && caches.keys) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      } catch (_) {}
    }
    if (window.indexedDB && indexedDB.databases) {
      try {
        const dbs = await indexedDB.databases();
        const deletePromises = dbs.map(db => {
          if (!db.name) return Promise.resolve();
          return new Promise(resolve => {
            try {
              const req = indexedDB.deleteDatabase(db.name);
              req.onsuccess = () => resolve();
              req.onerror = () => resolve();
              req.onblocked = () => resolve();
              setTimeout(resolve, 500);
            } catch (_) {
              resolve();
            }
          });
        });
        await Promise.all(deletePromises);
      } catch (_) {}
    }
  } catch (_) {}
  location.reload();
})()"#;

    let _ = tab.eval(script);
    Ok(())
}

#[tauri::command]
fn set_site_permission(
    state: State<'_, BrowserState>,
    domain: String,
    key: String,
    status: String,
) -> Result<(), String> {
    let mut perms = state.site_permissions.lock().unwrap();
    let entry = perms.entry(domain.to_lowercase()).or_default();
    match key.as_str() {
        "camera" => entry.camera = if status == "ask" { None } else { Some(status) },
        "microphone" => entry.microphone = if status == "ask" { None } else { Some(status) },
        "geolocation" => entry.geolocation = if status == "ask" { None } else { Some(status) },
        "notifications" => entry.notifications = if status == "ask" { None } else { Some(status) },
        _ => return Err(format!("Unknown permission key: {}", key)),
    }
    Ok(())
}

#[tauri::command]
fn sync_site_permissions(
    state: State<'_, BrowserState>,
    permissions: HashMap<String, DomainPermissions>,
) -> Result<(), String> {
    let mut perms = state.site_permissions.lock().unwrap();
    *perms = permissions
        .into_iter()
        .map(|(k, v)| (k.to_lowercase(), v))
        .collect();
    Ok(())
}

#[tauri::command]
fn reset_site_permissions(
    state: State<'_, BrowserState>,
    domain: String,
) -> Result<(), String> {
    let mut perms = state.site_permissions.lock().unwrap();
    perms.remove(&domain.to_lowercase());
    Ok(())
}

#[derive(Clone, serde::Serialize)]
struct ZapPayload {
    tab_id: String,
    selector: String,
    domain: String,
}

#[tauri::command]
fn apply_tab_boost(
    app: AppHandle,
    tab_id: String,
    css: String,
    style_id: Option<String>,
) -> Result<(), String> {
    let tab = match app.get_webview(&tab_label(&tab_id)) {
        Some(w) => w,
        None => return Ok(()),
    };
    let element_id = style_id.unwrap_or_else(|| "__moss_boost_style__".to_string());
    let json_id = serde_json::to_string(&element_id)
        .unwrap_or_else(|_| "\"__moss_boost_style__\"".to_string());
    let json_css = serde_json::to_string(&css).unwrap_or_else(|_| "\"\"".to_string());
    let script = format!(
        r#"(() => {{
  try {{
    let el = document.getElementById({json_id});
    if (!el) {{
      el = document.createElement('style');
      el.id = {json_id};
      (document.head || document.documentElement).appendChild(el);
    }}
    el.textContent = {json_css};
  }} catch (_) {{}}
}})()"#
    );
    let _ = tab.eval(&script);
    Ok(())
}

#[tauri::command]
fn start_element_zapper(app: AppHandle, tab_id: String) -> Result<(), String> {
    let tab = match app.get_webview(&tab_label(&tab_id)) {
        Some(w) => w,
        None => return Ok(()),
    };
    let app_clone = app.clone();
    let tab_id_clone = tab_id;

    let script = r#"(() => {
  window.__moss_zapper_result = null;
  let overlay = document.getElementById('__moss_zapper_overlay__');
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = '__moss_zapper_overlay__';
  overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px dashed #f43f5e;background:rgba(244,63,94,0.15);transition:all 0.05s ease;display:none;';
  
  const badge = document.createElement('div');
  badge.style.cssText = 'position:absolute;top:-24px;left:0;background:#f43f5e;color:#fff;font-family:monospace;font-size:11px;padding:2px 6px;border-radius:4px;white-space:nowrap;font-weight:bold;box-shadow:0 2px 6px rgba(0,0,0,0.3);';
  overlay.appendChild(badge);
  document.documentElement.appendChild(overlay);

  let currentTarget = null;

  function getSelector(el) {
    if (!el || el === document.body || el === document.documentElement) return '';
    if (el.id) return '#' + CSS.escape(el.id);
    let sel = el.tagName.toLowerCase();
    if (el.className && typeof el.className === 'string') {
      const classes = el.className.trim().split(/\s+/).filter(c => c && !c.startsWith('__moss_')).slice(0, 2);
      if (classes.length) sel += '.' + classes.map(c => CSS.escape(c)).join('.');
    }
    return sel;
  }

  function onMouseMove(e) {
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || target === overlay || overlay.contains(target) || target === document.body || target === document.documentElement) {
      overlay.style.display = 'none';
      currentTarget = null;
      return;
    }
    currentTarget = target;
    const rect = target.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    badge.textContent = getSelector(target);
  }

  function cleanup() {
    window.removeEventListener('mousemove', onMouseMove, true);
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('keydown', onKeyDown, true);
    if (overlay) overlay.remove();
  }

  window.__moss_zapper_cleanup = cleanup;

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cleanup();
      window.__moss_zapper_result = JSON.stringify({ cancelled: true });
    }
  }

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!currentTarget) {
      cleanup();
      window.__moss_zapper_result = JSON.stringify({ cancelled: true });
      return;
    }
    const sel = getSelector(currentTarget);
    currentTarget.style.transition = 'all 0.25s ease';
    currentTarget.style.opacity = '0';
    currentTarget.style.transform = 'scale(0.85)';
    setTimeout(() => { if (currentTarget) currentTarget.remove(); }, 250);
    const domain = location.hostname;
    cleanup();
    window.__moss_zapper_result = JSON.stringify({ cancelled: false, selector: sel, domain: domain });
  }

  window.addEventListener('mousemove', onMouseMove, true);
  window.addEventListener('click', onClick, true);
  window.addEventListener('keydown', onKeyDown, true);
})()"#;

    let _ = tab.eval(script);

    tauri::async_runtime::spawn(async move {
        let result_cell = std::sync::Arc::new(std::sync::Mutex::new(None::<String>));
        let start_time = std::time::Instant::now();
        let timeout = std::time::Duration::from_secs(60);
        let poll_interval = std::time::Duration::from_millis(150);

        while start_time.elapsed() < timeout {
            let tab = match app_clone.get_webview(&tab_label(&tab_id_clone)) {
                Some(w) => w,
                None => return,
            };

            let maybe_res = result_cell.lock().map(|mut l| l.take()).unwrap_or(None);
            if let Some(res) = maybe_res {
                let unquoted = if res.starts_with('"') && res.ends_with('"') && res.len() >= 2 {
                    serde_json::from_str::<String>(&res).unwrap_or_else(|_| res.clone())
                } else {
                    res
                };

                let parsed_val = serde_json::from_str::<serde_json::Value>(&unquoted)
                    .ok()
                    .and_then(|v| {
                        if let Some(s) = v.as_str() {
                            serde_json::from_str::<serde_json::Value>(s).ok()
                        } else {
                            Some(v)
                        }
                    });

                if let Some(val) = parsed_val {
                    if let Some(cancelled) = val.get("cancelled").and_then(|v| v.as_bool()) {
                        let _ = tab.eval("window.__moss_zapper_result = null;");
                        if !cancelled {
                            let selector = val.get("selector").and_then(|v| v.as_str()).unwrap_or("").to_string();
                            let domain = val.get("domain").and_then(|v| v.as_str()).unwrap_or("").to_string();
                            if !selector.is_empty() {
                                emit_to_chrome(
                                    &app_clone,
                                    "zapper-element-selected",
                                    ZapPayload {
                                        tab_id: tab_id_clone.clone(),
                                        selector,
                                        domain,
                                    },
                                );
                            }
                        }
                        return;
                    }
                }
            }

            let cell = result_cell.clone();
            let _ = tab.eval_with_callback("(window.__moss_zapper_result || '')", move |res| {
                let trimmed = res.trim();
                if !trimmed.is_empty() && trimmed != "\"\"" && trimmed != "null" && trimmed != "{}" {
                    if let Ok(mut lock) = cell.lock() {
                        *lock = Some(res);
                    }
                }
            });

            tokio::time::sleep(poll_interval).await;
        }

        if let Some(tab) = app_clone.get_webview(&tab_label(&tab_id_clone)) {
            let _ = tab.eval("if (window.__moss_zapper_cleanup) window.__moss_zapper_cleanup(); window.__moss_zapper_result = null;");
        }
    });

    Ok(())
}

#[derive(Clone, serde::Serialize)]
struct MediaStatePayload {
    tab_id: String,
    has_media: bool,
    playing: bool,
    title: String,
    artist: String,
    muted: bool,
}

#[tauri::command]
fn set_tab_muted(app: AppHandle, tab_id: String, muted: bool) -> Result<(), String> {
    let tab = match app.get_webview(&tab_label(&tab_id)) {
        Some(w) => w,
        None => return Ok(()),
    };
    let script = format!("document.querySelectorAll('audio, video').forEach(m => m.muted = {muted});");
    let _ = tab.eval(&script);
    Ok(())
}

#[tauri::command]
fn toggle_tab_media_playback(app: AppHandle, tab_id: String) -> Result<(), String> {
    let tab = match app.get_webview(&tab_label(&tab_id)) {
        Some(w) => w,
        None => return Ok(()),
    };
    let script = r#"(() => {
  const media = Array.from(document.querySelectorAll('video, audio'));
  if (media.length === 0) return;
  const playing = media.find(m => !m.paused && !m.ended);
  if (playing) {
    media.forEach(m => m.pause());
  } else {
    media[0].play().catch(() => {});
  }
})()"#;
    let _ = tab.eval(script);
    Ok(())
}

#[tauri::command]
fn sync_tab_media_state(app: AppHandle, tab_id: String) -> Result<(), String> {
    let tab = match app.get_webview(&tab_label(&tab_id)) {
        Some(w) => w,
        None => return Ok(()),
    };
    let app_clone = app.clone();
    let tab_id_clone = tab_id;
    let script = r#"(() => {
  try {
    const media = Array.from(document.querySelectorAll('video, audio'));
    const playing = media.find(m => !m.paused && !m.ended && m.currentTime > 0);
    let title = '';
    let artist = '';
    if (navigator.mediaSession && navigator.mediaSession.metadata) {
      title = navigator.mediaSession.metadata.title || '';
      artist = navigator.mediaSession.metadata.artist || '';
    }
    if (!title) {
      title = document.title || '';
    }
    return JSON.stringify({
      has_media: media.length > 0,
      playing: Boolean(playing),
      title: title.slice(0, 80),
      artist: artist.slice(0, 50),
      muted: playing ? playing.muted : (media[0] ? media[0].muted : false),
    });
  } catch (_) {
    return JSON.stringify({ has_media: false, playing: false, title: '', artist: '', muted: false });
  }
})()"#;

    let _ = tab.eval_with_callback(script, move |res| {
        let unquoted = if res.starts_with('"') && res.ends_with('"') && res.len() >= 2 {
            serde_json::from_str::<String>(&res).unwrap_or_else(|_| res.to_string())
        } else {
            res.to_string()
        };
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&unquoted) {
            let has_media = val.get("has_media").and_then(|v| v.as_bool()).unwrap_or(false);
            let playing = val.get("playing").and_then(|v| v.as_bool()).unwrap_or(false);
            let title = val.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let artist = val.get("artist").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let muted = val.get("muted").and_then(|v| v.as_bool()).unwrap_or(false);

            emit_to_chrome(
                &app_clone,
                "media-state-updated",
                MediaStatePayload {
                    tab_id: tab_id_clone.clone(),
                    has_media,
                    playing,
                    title,
                    artist,
                    muted,
                },
            );
        }
    });
    Ok(())
}

#[tauri::command]
fn translate_tab(app: AppHandle, tab_id: String, target_lang: String) -> Result<(), String> {
    let tab = match app.get_webview(&tab_label(&tab_id)) {
        Some(w) => w,
        None => return Ok(()),
    };
    let lang_json = serde_json::to_string(&target_lang).unwrap_or_else(|_| "\"pt\"".to_string());
    let script = format!(
        r#"(() => {{
  const targetLang = {lang_json};
  if (targetLang === "original") {{
    location.reload();
    return;
  }}
  const existingCombo = document.querySelector('.goog-te-combo');
  if (existingCombo) {{
    existingCombo.value = targetLang;
    existingCombo.dispatchEvent(new Event('change'));
    return;
  }}
  window.__mossGoogleTranslateInit = function() {{
    try {{
      new google.translate.TranslateElement({{
        pageLanguage: 'auto',
        includedLanguages: 'pt,en,es,fr,de,it,ja',
        autoDisplay: false
      }}, '__moss_translate_container__');
      setTimeout(() => {{
        const select = document.querySelector('.goog-te-combo');
        if (select) {{
          select.value = targetLang;
          select.dispatchEvent(new Event('change'));
        }}
      }}, 400);
    }} catch (_) {{}}
  }};
  let container = document.getElementById('__moss_translate_container__');
  if (!container) {{
    container = document.createElement('div');
    container.id = '__moss_translate_container__';
    container.style.display = 'none';
    document.body.appendChild(container);
  }}
  const s = document.createElement('script');
  s.src = 'https://translate.google.com/translate_a/element.js?cb=__mossGoogleTranslateInit';
  s.onerror = () => {{
    try {{
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      let n;
      const textNodes = [];
      while ((n = walker.nextNode()) && textNodes.length < 100) {{
        if (n.nodeValue && n.nodeValue.trim().length > 3) textNodes.push(n);
      }}
      for (const node of textNodes) {{
        const txt = node.nodeValue.trim();
        fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' + encodeURIComponent(targetLang) + '&dt=t&q=' + encodeURIComponent(txt))
          .then(r => r.json())
          .then(d => {{
            if (d && d[0]) node.nodeValue = d[0].map(x => x[0]).join('');
          }}).catch(() => {{}});
      }}
    }} catch (_) {{}}
  }};
  document.body.appendChild(s);
}})()"#
    );
    let _ = tab.eval(&script);
    Ok(())
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
            set_taskbar_active_tab,
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
            clear_tab_data,
            set_site_permission,
            sync_site_permissions,
            reset_site_permissions,
            apply_tab_boost,
            start_element_zapper,
            set_tab_muted,
            toggle_tab_media_playback,
            sync_tab_media_state,
            translate_tab,
        ])
        .setup(|app| {
            #[cfg(windows)]
            {
                use windows::core::PCWSTR;
                use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;
                use windows::Win32::UI::WindowsAndMessaging::{
                    LoadImageW, SendMessageW, HICON, ICON_BIG, ICON_SMALL,
                    IMAGE_ICON, LR_DEFAULTCOLOR, WM_SETICON,
                };
                use windows::Win32::System::LibraryLoader::GetModuleHandleW;
                use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};

                let _ = unsafe {
                    let app_id: Vec<u16> = "dev.moss.browser\0".encode_utf16().collect();
                    SetCurrentProcessExplicitAppUserModelID(PCWSTR(app_id.as_ptr()))
                };

                if let Some(window) = app.get_window(CHROME_LABEL) {
                    if let Ok(raw_hwnd) = window.hwnd() {
                        let hwnd = HWND(raw_hwnd.0 as _);
                        unsafe {
                            let hinstance = GetModuleHandleW(None).ok().map(|m| windows::Win32::Foundation::HINSTANCE(m.0));
                            let icon_id = 32512 as usize as *const u16;
                            if let Ok(hicon_big) = LoadImageW(
                                hinstance,
                                PCWSTR(icon_id),
                                IMAGE_ICON,
                                256,
                                256,
                                LR_DEFAULTCOLOR,
                            ) {
                                let hicon = HICON(hicon_big.0);
                                SendMessageW(
                                    hwnd,
                                    WM_SETICON,
                                    Some(WPARAM(ICON_BIG as usize)),
                                    Some(LPARAM(hicon.0 as isize)),
                                );
                            }
                            if let Ok(hicon_small) = LoadImageW(
                                hinstance,
                                PCWSTR(icon_id),
                                IMAGE_ICON,
                                32,
                                32,
                                LR_DEFAULTCOLOR,
                            ) {
                                let hicon = HICON(hicon_small.0);
                                SendMessageW(
                                    hwnd,
                                    WM_SETICON,
                                    Some(WPARAM(ICON_SMALL as usize)),
                                    Some(LPARAM(hicon.0 as isize)),
                                );
                            }
                        }
                    }
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
