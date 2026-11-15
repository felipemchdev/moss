use std::ffi::c_void;
use std::sync::OnceLock;

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::Graphics::Gdi::HBRUSH;
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::Shell::{ITaskbarList3, TaskbarList};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, GetWindowLongPtrW, LoadIconW, RegisterClassW,
    SetWindowLongPtrW, CREATESTRUCTW, GWLP_USERDATA, WA_ACTIVE, WINDOW_EX_STYLE, WM_ACTIVATE,
    WM_NCCREATE, WM_NCDESTROY, WNDCLASSW, WS_OVERLAPPED,
};

use super::{emit_to_chrome, BrowserState};

struct ProxyContext {
    on_activate: Box<dyn Fn() + Send + Sync>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TabSelectedPayload {
    tab_id: String,
}

pub(super) fn register<R: Runtime>(app: &AppHandle<R>, tab_id: &str) {
    let app_handle = app.clone();
    let tab = tab_id.to_string();
    let _ = app.run_on_main_thread(move || {
        let Some(main_window) = main_hwnd(&app_handle) else {
            return;
        };
        let event_app = app_handle.clone();
        let event_tab = tab.clone();
        let context = ProxyContext {
            on_activate: Box::new(move || {
                emit_to_chrome(
                    &event_app,
                    "tab-selected",
                    TabSelectedPayload { tab_id: event_tab.clone() },
                );
            }),
        };
        let Some(proxy) = create_proxy(main_window, context) else {
            return;
        };
        if let Some(list) = taskbar() {
            let _ = unsafe { list.RegisterTab(proxy, main_window) };
        }
        if let Ok(mut proxies) = app_handle.state::<BrowserState>().tab_proxies.lock() {
            proxies.insert(tab, proxy.0 as isize);
        }
    });
}

pub(super) fn set_active<R: Runtime>(app: &AppHandle<R>, tab_id: &str) {
    let app_handle = app.clone();
    let tab = tab_id.to_string();
    let _ = app.run_on_main_thread(move || {
        let Some(main_window) = main_hwnd(&app_handle) else {
            return;
        };
        let proxy = app_handle
            .state::<BrowserState>()
            .tab_proxies
            .lock()
            .ok()
            .and_then(|proxies| proxies.get(&tab).copied());
        let Some(proxy) = proxy else {
            return;
        };
        if let Some(list) = taskbar() {
            let _ = unsafe { list.SetTabActive(HWND(proxy as *mut c_void), main_window, 0) };
        }
    });
}

pub(super) fn unregister<R: Runtime>(app: &AppHandle<R>, tab_id: &str) {
    let app_handle = app.clone();
    let tab = tab_id.to_string();
    let _ = app.run_on_main_thread(move || {
        let proxy = app_handle
            .state::<BrowserState>()
            .tab_proxies
            .lock()
            .ok()
            .and_then(|mut proxies| proxies.remove(&tab));
        let Some(proxy) = proxy else {
            return;
        };
        let hwnd = HWND(proxy as *mut c_void);
        if let Some(list) = taskbar() {
            let _ = unsafe { list.UnregisterTab(hwnd) };
        }
        let _ = unsafe { DestroyWindow(hwnd) };
    });
}

fn main_hwnd<R: Runtime>(app: &AppHandle<R>) -> Option<HWND> {
    app.get_window("main").and_then(|window| window.hwnd().ok())
}

fn taskbar() -> Option<ITaskbarList3> {
    unsafe {
        let list: ITaskbarList3 = CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER).ok()?;
        list.HrInit().ok()?;
        Some(list)
    }
}

fn ensure_class() {
    static REGISTERED: OnceLock<()> = OnceLock::new();
    REGISTERED.get_or_init(|| {
        let Ok(module) = (unsafe { GetModuleHandleW(None) }) else {
            return;
        };
        let icon = unsafe {
            LoadIconW(
                Some(HINSTANCE(module.0)),
                PCWSTR(32512 as usize as *const u16),
            )
        }
        .unwrap_or_default();
        let class = WNDCLASSW {
            lpfnWndProc: Some(proxy_wndproc),
            hInstance: HINSTANCE(module.0),
            hIcon: icon,
            hbrBackground: HBRUSH::default(),
            lpszClassName: w!("mossTabProxy"),
            ..Default::default()
        };
        unsafe {
            RegisterClassW(&class);
        }
    });
}

fn create_proxy(main_window: HWND, context: ProxyContext) -> Option<HWND> {
    ensure_class();
    let module = unsafe { GetModuleHandleW(None) }.ok()?;
    let instance = HINSTANCE(module.0);
    let raw = Box::into_raw(Box::new(context));
    let result = unsafe {
        CreateWindowExW(
            WINDOW_EX_STYLE(0),
            w!("mossTabProxy"),
            w!("moss tab"),
            WS_OVERLAPPED,
            0,
            0,
            0,
            0,
            Some(main_window),
            None,
            Some(instance),
            Some(raw as *const c_void),
        )
    };
    match result {
        Ok(hwnd) => Some(hwnd),
        Err(_) => {
            unsafe {
                drop(Box::from_raw(raw));
            }
            None
        }
    }
}

unsafe extern "system" fn proxy_wndproc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    unsafe {
        match msg {
            WM_NCCREATE => {
                let create = lparam.0 as *const CREATESTRUCTW;
                if !create.is_null() {
                    let context = (*create).lpCreateParams as *mut ProxyContext;
                    if !context.is_null() {
                        SetWindowLongPtrW(hwnd, GWLP_USERDATA, context as isize);
                    }
                }
                DefWindowProcW(hwnd, msg, wparam, lparam)
            }
            WM_ACTIVATE => {
                let context = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut ProxyContext;
                if !context.is_null() && (wparam.0 as u32 & 0xFFFF) == WA_ACTIVE {
                    ((*context).on_activate)();
                }
                DefWindowProcW(hwnd, msg, wparam, lparam)
            }
            WM_NCDESTROY => {
                let context = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut ProxyContext;
                if !context.is_null() {
                    SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
                    drop(Box::from_raw(context));
                }
                DefWindowProcW(hwnd, msg, wparam, lparam)
            }
            _ => DefWindowProcW(hwnd, msg, wparam, lparam),
        }
    }
}
