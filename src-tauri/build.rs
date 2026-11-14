const COMMANDS: &[&str] = &[
    "set_viewport",
    "navigate_to",
    "reload_page",
    "go_back",
    "go_forward",
    "show_tab",
    "close_tab",
    "minimize_window",
    "toggle_maximize_window",
    "close_window",
    "set_privacy_shield",
    "sync_tab_trackers_blocked",
    "reset_trackers_count",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
