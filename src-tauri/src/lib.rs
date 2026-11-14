use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::webview::{DownloadEvent, NewWindowResponse, PageLoadEvent, WebviewBuilder};
use tauri::{
    AppHandle, Emitter, EventTarget, LogicalPosition, LogicalSize, Manager, Runtime, State, Url,
    Webview, WebviewUrl,
};

const CHROME_LABEL: &str = "main";
const TAB_LABEL_PREFIX: &str = "tab-";

#[derive(Clone, Copy, Default, Deserialize)]
struct Viewport {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
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

#[derive(Default)]
struct BrowserState {
    viewport: Mutex<Viewport>,
    shown_tab: Mutex<Option<String>>,
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

    let builder = WebviewBuilder::new(tab_label(tab_id), WebviewUrl::External(url))
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
                TabLoadPayload { tab_id, url: payload.url().to_string(), state },
            );
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
    for webview in tab_webviews(&app) {
        webview
            .set_position(viewport.position())
            .and_then(|_| webview.set_size(viewport.size()))
            .map_err(|err| err.to_string())?;
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

    let viewport = *state.viewport.lock().map_err(|err| err.to_string())?;
    let webview = create_tab_webview(&app, &tab_id, url, viewport)?;

    // The user may have switched tabs while the webview was being built.
    let shown = state.shown_tab.lock().map_err(|err| err.to_string())?;
    if shown.as_deref() != Some(tab_id.as_str()) {
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
    let target = tab_id.as_deref().map(tab_label);
    *state.shown_tab.lock().map_err(|err| err.to_string())? = tab_id;
    for webview in tab_webviews(&app) {
        let result = if Some(webview.label()) == target.as_deref() {
            webview.show()
        } else {
            webview.hide()
        };
        result.map_err(|err| err.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn close_tab(app: AppHandle, tab_id: String) -> Result<(), String> {
    match app.get_webview(&tab_label(&tab_id)) {
        Some(webview) => webview.close().map_err(|err| err.to_string()),
        None => Ok(()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(BrowserState::default())
        .invoke_handler(tauri::generate_handler![
            set_viewport,
            navigate_to,
            reload_page,
            go_back,
            go_forward,
            show_tab,
            close_tab,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
