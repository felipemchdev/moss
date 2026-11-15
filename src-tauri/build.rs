const COMMANDS: &[&str] = &[
    "set_viewport",
    "set_tab_viewports",
    "navigate_to",
    "reload_page",
    "go_back",
    "go_forward",
    "show_tab",
    "show_tabs",
    "set_taskbar_active_tab",
    "close_tab",
    "minimize_window",
    "toggle_maximize_window",
    "close_window",
    "set_privacy_shield",
    "sync_tab_trackers_blocked",
    "reset_trackers_count",
    "export_data_file",
    "find_in_page",
    "clear_find_in_page",
    "extract_reader_content",
    "set_tab_zoom",
    "clear_tab_data",
    "set_site_permission",
    "sync_site_permissions",
    "reset_site_permissions",
    "apply_tab_boost",
    "start_element_zapper",
    "set_tab_muted",
    "toggle_tab_media_playback",
    "sync_tab_media_state",
    "translate_tab",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
