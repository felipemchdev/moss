use tauri::webview::PlatformWebview;
use tauri::{AppHandle, Manager, Runtime, Url, Webview};
use webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL;
use webview2_com::WebResourceRequestedEventHandler;
use windows::core::{HSTRING, PWSTR};
use windows::Win32::System::Com::IStream;

use super::{emit_to_chrome, BlockerHandle, BrowserState, TrackerCountPayload};

const BLOCKED_HOSTS: &[&str] = &[
    "google-analytics.com",
    "googletagmanager.com",
    "doubleclick.net",
    "googlesyndication.com",
    "googleadservices.com",
    "connect.facebook.net",
    "hotjar.com",
    "criteo.net",
    "criteo.com",
    "adservice.google.com",
    "outbrain.com",
    "taboola.com",
    "adnxs.com",
    "amazon-adsystem.com",
    "ads.pubmatic.com",
    "rubiconproject.com",
    "scorecardresearch.com",
    "googleads.g.doubleclick.net",
    "pagead2.googlesyndication.com",
    "static.doubleclick.net",
    "ad.youtube.com",
];

pub(super) fn attach<R: Runtime>(app: &AppHandle<R>, tab_id: &str, webview: &Webview<R>) {
    let filters = build_filters();
    let app_handle = app.clone();
    let tab = tab_id.to_string();

    let result = webview.with_webview(move |platform| {
        let controller = platform.controller();
        let environment = platform.environment();
        // SAFETY: WebView2 COM objects must be touched on the UI thread, which with_webview guarantees.
        unsafe {
            let Ok(core) = controller.CoreWebView2() else {
                eprintln!("[moss] webview2 blocker: CoreWebView2 unavailable for tab {tab}");
                return;
            };
            for filter in &filters {
                let filter = HSTRING::from(filter.as_str());
                if let Err(err) =
                    core.AddWebResourceRequestedFilter(&filter, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL)
                {
                    eprintln!("[moss] webview2 blocker: filter registration failed for tab {tab}: {err}");
                }
            }

            let event_app = app_handle.clone();
            let event_tab = tab.clone();
            let mut token = 0i64;
            let handler = WebResourceRequestedEventHandler::create(Box::new(move |_sender, args| {
                let Some(args) = args else {
                    return Ok(());
                };
                let Ok(request) = args.Request() else {
                    return Ok(());
                };
                let mut raw = PWSTR::null();
                if request.Uri(&mut raw).is_err() {
                    return Ok(());
                }
                let uri = webview2_com::take_pwstr(raw);
                if !is_blocked_url(&uri) {
                    return Ok(());
                }

                let enabled = event_app
                    .state::<BrowserState>()
                    .shield_enabled
                    .lock()
                    .map(|guard| *guard)
                    .unwrap_or(true);
                if !enabled {
                    return Ok(());
                }

                let status = HSTRING::from("Forbidden");
                let headers = HSTRING::from("Content-Type: text/plain\r\nContent-Length: 0");
                if let Ok(response) =
                    environment.CreateWebResourceResponse(None::<&IStream>, 403, &status, &headers)
                {
                    let _ = args.SetResponse(&response);
                }

                let count = {
                    let state = event_app.state::<BrowserState>();
                    match state.tracker_counts.lock() {
                        Ok(mut counts) => {
                            let entry = counts.entry(event_tab.clone()).or_insert(0);
                            *entry = entry.saturating_add(1);
                            *entry
                        }
                        Err(_) => 0,
                    }
                };
                emit_to_chrome(
                    &event_app,
                    "tracker-blocked-count",
                    TrackerCountPayload { tab_id: event_tab.clone(), count },
                );
                Ok(())
            }));

            match core.add_WebResourceRequested(&handler, &mut token) {
                Ok(()) => {
                    if let Ok(mut blockers) = app_handle.state::<BrowserState>().blockers.lock() {
                        blockers.insert(tab.clone(), BlockerHandle { token, filters });
                    }
                }
                Err(err) => {
                    eprintln!("[moss] webview2 blocker: handler registration failed for tab {tab}: {err}")
                }
            }
        }
    });

    if let Err(err) = result {
        eprintln!("[moss] webview2 blocker: with_webview dispatch failed for tab {tab_id}: {err}");
    }
}

pub(super) fn detach(platform: PlatformWebview, handle: BlockerHandle) {
    let controller = platform.controller();
    // SAFETY: same UI-thread guarantee as attach.
    unsafe {
        let Ok(core) = controller.CoreWebView2() else {
            return;
        };
        let _ = core.remove_WebResourceRequested(handle.token);
        for filter in handle.filters {
            let filter = HSTRING::from(filter.as_str());
            let _ =
                core.RemoveWebResourceRequestedFilter(&filter, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL);
        }
    }
}

fn build_filters() -> Vec<String> {
    let mut filters = Vec::with_capacity(BLOCKED_HOSTS.len() * 4);
    for host in BLOCKED_HOSTS {
        for scheme in ["https", "http"] {
            filters.push(format!("{scheme}://{host}/*"));
            filters.push(format!("{scheme}://*.{host}/*"));
        }
    }
    filters
}

fn is_blocked_url(raw: &str) -> bool {
    let Ok(url) = Url::parse(raw) else {
        return false;
    };
    let Some(host) = url.host_str() else {
        return false;
    };
    is_blocked_host(host)
}

fn is_blocked_host(host: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    BLOCKED_HOSTS
        .iter()
        .any(|domain| host == *domain || host.ends_with(&format!(".{domain}")))
}
