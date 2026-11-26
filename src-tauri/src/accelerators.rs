use serde::Serialize;
use tauri::{AppHandle, Runtime, Webview};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN, COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN,
    COREWEBVIEW2_PHYSICAL_KEY_STATUS,
};
use webview2_com::{AcceleratorKeyPressedEventHandler, ZoomFactorChangedEventHandler};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetKeyState, VK_CONTROL, VK_MENU, VK_SHIFT,
};

use super::emit_to_chrome;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TabZoomPayload {
    tab_id: String,
    factor: f64,
}

pub(super) fn attach<R: Runtime>(app: &AppHandle<R>, tab_id: &str, webview: &Webview<R>) {
    let key_app = app.clone();
    let zoom_app = app.clone();
    let zoom_tab = tab_id.to_string();

    let result = webview.with_webview(move |platform| {
        let controller = platform.controller();
        // SAFETY: WebView2 COM objects must be touched on the UI thread, which with_webview guarantees.
        unsafe {
            let mut key_token = 0i64;
            let key_handler = AcceleratorKeyPressedEventHandler::create(Box::new(move |_sender, args| {
                let Some(args) = args else {
                    return Ok(());
                };
                let mut kind = COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN;
                if args.KeyEventKind(&mut kind).is_err() {
                    return Ok(());
                }
                if kind != COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN
                    && kind != COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN
                {
                    return Ok(());
                }
                let mut status = COREWEBVIEW2_PHYSICAL_KEY_STATUS::default();
                if args.PhysicalKeyStatus(&mut status).is_ok() && status.WasKeyDown.0 != 0 {
                    return Ok(());
                }
                let mut vk = 0u32;
                if args.VirtualKey(&mut vk).is_err() {
                    return Ok(());
                }

                let ctrl = GetKeyState(VK_CONTROL.0 as i32) < 0;
                let alt = GetKeyState(VK_MENU.0 as i32) < 0;
                let shift = GetKeyState(VK_SHIFT.0 as i32) < 0;
                if alt {
                    return Ok(());
                }

                if vk == 0x7A {
                    if !shift {
                        let _ = args.SetHandled(true);
                        emit_to_chrome(&key_app, "toggle-fullscreen", ());
                    }
                    return Ok(());
                }
                if !ctrl {
                    return Ok(());
                }

                let letter = matches!(
                    vk,
                    0x54 | 0x57 | 0x4C | 0x52 | 0x46 | 0x42 | 0x4B | 0x50 | 0x48 | 0x4A
                );
                if shift && (letter || vk == 0xBC || vk == 0xBD || vk == 0x30 || vk == 0x60) {
                    return Ok(());
                }

                let event = match vk {
                    0xBB | 0x6B => "zoom-in",
                    0xBD | 0x6D => "zoom-out",
                    0x30 | 0x60 => "zoom-reset",
                    0x54 => "tab-new",
                    0x57 => "tab-close",
                    0x4C => "focus-omnibar",
                    0x52 => "tab-reload",
                    0x46 => "find-in-page",
                    0x42 => "toggle-sidebar",
                    0x4B | 0x50 => "command-palette",
                    0x48 => "toggle-history",
                    0x4A => "toggle-downloads",
                    0xBC => "toggle-settings",
                    _ => return Ok(()),
                };

                let _ = args.SetHandled(true);
                emit_to_chrome(&key_app, event, ());
                Ok(())
            }));
            let _ = controller.add_AcceleratorKeyPressed(&key_handler, &mut key_token);

            let mut zoom_token = 0i64;
            let zoom_handler = ZoomFactorChangedEventHandler::create(Box::new(move |sender, _args| {
                let Some(sender) = sender else {
                    return Ok(());
                };
                let mut factor = 1.0f64;
                if sender.ZoomFactor(&mut factor).is_ok() {
                    emit_to_chrome(
                        &zoom_app,
                        "tab-zoom-changed",
                        TabZoomPayload { tab_id: zoom_tab.clone(), factor },
                    );
                }
                Ok(())
            }));
            let _ = controller.add_ZoomFactorChanged(&zoom_handler, &mut zoom_token);
        }
    });

    if let Err(err) = result {
        eprintln!("[moss] accelerators: with_webview dispatch failed for tab {tab_id}: {err}");
    }
}
