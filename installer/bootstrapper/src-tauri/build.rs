const COMMANDS: &[&str] = &[
    "check_existing_install",
    "run_install",
    "launch_moss",
    "close_installer",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
