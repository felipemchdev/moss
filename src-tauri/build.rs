const COMMANDS: &[&str] = &[
    "set_viewport",
    "navigate_to",
    "reload_page",
    "go_back",
    "go_forward",
    "show_tab",
    "close_tab",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
