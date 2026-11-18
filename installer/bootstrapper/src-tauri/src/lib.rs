use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};

const BOOTSTRAPPER_WINDOW: &str = "bootstrapper";
const PROGRESS_EVENT: &str = "install-progress";
const UNINSTALL_REG_SUBKEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\moss";
const INSTALL_TIMEOUT: Duration = Duration::from_secs(300);

#[cfg(feature = "embedded-setup")]
const EMBEDDED_SETUP_BYTES: &[u8] = include_bytes!("../resources/nsis/moss-setup.exe");

#[derive(Default)]
struct InstallerState {
    installing: AtomicBool,
}

struct InstallingGuard<'a>(&'a AtomicBool);

impl Drop for InstallingGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

#[cfg(feature = "embedded-setup")]
struct ExtractedSetupGuard {
    path: PathBuf,
}

#[cfg(feature = "embedded-setup")]
impl Drop for ExtractedSetupGuard {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallStatus {
    pub installed: bool,
    pub exe_exists: bool,
    pub registry_exists: bool,
    pub exe_path: String,
    pub log_path: String,
    pub installed_version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallProgress {
    pub step: u8,
    pub key: &'static str,
    pub percent: u8,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    pub log_path: String,
    pub exe_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallError {
    pub code: &'static str,
    pub message_pt: String,
    pub message_en: String,
    pub log_path: String,
}

impl InstallError {
    fn new(
        code: &'static str,
        message_pt: impl Into<String>,
        message_en: impl Into<String>,
        log_path: impl Into<String>,
    ) -> Self {
        Self {
            code,
            message_pt: message_pt.into(),
            message_en: message_en.into(),
            log_path: log_path.into(),
        }
    }
}

trait LoggedErrorExt {
    fn with_logged_context(self, log_path: &str, detail: &str) -> Self;
}

impl LoggedErrorExt for InstallError {
    fn with_logged_context(self, log_path: &str, detail: &str) -> Self {
        append_log_line(Path::new(log_path), detail);
        self
    }
}

#[derive(Default)]
struct RegistryInstallInfo {
    exists: bool,
    display_version: Option<String>,
    install_location: Option<String>,
}

fn local_app_data_dir() -> Result<PathBuf, String> {
    if let Some(dir) = std::env::var_os("LOCALAPPDATA") {
        let path = PathBuf::from(dir);
        if !path.as_os_str().is_empty() {
            return Ok(path);
        }
    }
    if let Some(profile) = std::env::var_os("USERPROFILE") {
        let path = PathBuf::from(profile).join("AppData").join("Local");
        return Ok(path);
    }
    Err("LOCALAPPDATA environment variable is unavailable".to_string())
}

fn default_moss_exe_path() -> Result<PathBuf, String> {
    Ok(local_app_data_dir()?
        .join("Programs")
        .join("moss")
        .join("moss.exe"))
}

fn install_log_path() -> Result<PathBuf, String> {
    Ok(local_app_data_dir()?.join("moss").join("install.log"))
}

#[cfg(windows)]
fn read_uninstall_registry() -> RegistryInstallInfo {
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{
        HKEY, HKEY_CURRENT_USER, KEY_READ, REG_SZ, REG_VALUE_TYPE, RegCloseKey, RegOpenKeyExW,
        RegQueryValueExW,
    };
    use windows::core::PCWSTR;

    struct RegKeyGuard(HKEY);
    impl Drop for RegKeyGuard {
        fn drop(&mut self) {
            unsafe {
                let _ = RegCloseKey(self.0);
            }
        }
    }

    fn to_wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn read_reg_sz(hkey: HKEY, name: &str) -> Option<String> {
        let wide_name = to_wide(name);
        let mut reg_type = REG_VALUE_TYPE::default();
        let mut byte_len: u32 = 0;

        let status = unsafe {
            RegQueryValueExW(
                hkey,
                PCWSTR(wide_name.as_ptr()),
                None,
                Some(&mut reg_type),
                None,
                Some(&mut byte_len),
            )
        };
        if status != ERROR_SUCCESS || reg_type != REG_SZ || byte_len < 2 {
            return None;
        }

        let word_len = (byte_len as usize).div_ceil(2);
        let mut buf = vec![0u16; word_len];
        let mut actual_bytes = (buf.len() * 2) as u32;

        let status = unsafe {
            RegQueryValueExW(
                hkey,
                PCWSTR(wide_name.as_ptr()),
                None,
                Some(&mut reg_type),
                Some(buf.as_mut_ptr().cast::<u8>()),
                Some(&mut actual_bytes),
            )
        };
        if status != ERROR_SUCCESS {
            return None;
        }

        let words = (actual_bytes as usize) / 2;
        let text = String::from_utf16_lossy(&buf[..words.min(buf.len())])
            .trim_end_matches('\0')
            .trim()
            .trim_matches('"')
            .to_string();

        if text.is_empty() { None } else { Some(text) }
    }

    let wide_subkey = to_wide(UNINSTALL_REG_SUBKEY);
    let mut hkey = HKEY::default();
    let open_status = unsafe {
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(wide_subkey.as_ptr()),
            Some(0),
            KEY_READ,
            &mut hkey,
        )
    };

    if open_status != ERROR_SUCCESS {
        return RegistryInstallInfo::default();
    }

    let _guard = RegKeyGuard(hkey);
    RegistryInstallInfo {
        exists: true,
        display_version: read_reg_sz(hkey, "DisplayVersion"),
        install_location: read_reg_sz(hkey, "InstallLocation"),
    }
}

#[cfg(not(windows))]
fn read_uninstall_registry() -> RegistryInstallInfo {
    RegistryInstallInfo::default()
}

fn resolve_existing_exe_path(reg: &RegistryInstallInfo) -> Result<(PathBuf, bool), String> {
    let default_exe = default_moss_exe_path()?;
    if default_exe.is_file() {
        return Ok((default_exe, true));
    }

    if let Some(dir) = &reg.install_location {
        let reg_exe = PathBuf::from(dir).join("moss.exe");
        if reg_exe.is_file() {
            return Ok((reg_exe, true));
        }
    }

    Ok((default_exe, false))
}

fn append_log_line(log_path: &Path, line: &str) {
    if let Some(parent) = log_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) {
        let _ = writeln!(file, "[{}] {}", timestamp, line);
    }
}

fn emit_progress(app: &AppHandle, step: u8, key: &'static str, percent: u8) {
    let _ = app.emit_to(
        BOOTSTRAPPER_WINDOW,
        PROGRESS_EVENT,
        InstallProgress { step, key, percent },
    );
}

#[cfg(feature = "embedded-setup")]
fn prepare_embedded_setup(log_path: &Path) -> Result<ExtractedSetupGuard, InstallError> {
    use std::io::ErrorKind;
    use std::sync::atomic::AtomicU64;

    static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

    let log_str = log_path.to_string_lossy().into_owned();
    let temp_dir = std::env::temp_dir();
    let pid = std::process::id();

    let mut created_file = None;
    let mut created_path = None;

    for _ in 0..32 {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let seq = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let candidate = temp_dir.join(format!("moss-setup-{pid}-{nanos:x}-{seq}.exe"));

        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(file) => {
                created_file = Some(file);
                created_path = Some(candidate);
                break;
            }
            Err(err) if err.kind() == ErrorKind::AlreadyExists => continue,
            Err(err) => {
                append_log_line(
                    log_path,
                    &format!("ERROR: Failed creating temporary setup file: {err}"),
                );
                return Err(InstallError::new(
                    "TEMP_CREATE_FAILED",
                    "Falha ao preparar instalador temporario",
                    "Failed to create temporary setup file",
                    log_str,
                ));
            }
        }
    }

    let (mut file, path) = match (created_file, created_path) {
        (Some(f), Some(p)) => (f, p),
        _ => {
            append_log_line(
                log_path,
                "ERROR: Exhausted unique filename attempts for temporary setup",
            );
            return Err(InstallError::new(
                "TEMP_COLLISION",
                "Falha ao preparar instalador temporario",
                "Failed to allocate temporary setup file",
                log_str,
            ));
        }
    };

    let guard = ExtractedSetupGuard { path };

    if let Err(err) = file.write_all(EMBEDDED_SETUP_BYTES) {
        drop(file);
        append_log_line(
            log_path,
            &format!("ERROR: Failed writing embedded setup bytes: {err}"),
        );
        return Err(InstallError::new(
            "TEMP_WRITE_FAILED",
            "Falha ao gravar instalador temporario",
            "Failed to write embedded setup",
            log_str,
        ));
    }

    if let Err(err) = file.sync_all() {
        drop(file);
        append_log_line(
            log_path,
            &format!("ERROR: Failed syncing temporary setup file: {err}"),
        );
        return Err(InstallError::new(
            "TEMP_SYNC_FAILED",
            "Falha ao finalizar instalador temporario",
            "Failed to flush embedded setup",
            log_str,
        ));
    }

    drop(file);

    append_log_line(
        log_path,
        &format!("Extracted embedded NSIS setup to {}", guard.path.display()),
    );

    Ok(guard)
}

#[cfg(not(feature = "embedded-setup"))]
fn is_setup_candidate(path: &Path, self_exe: Option<&Path>) -> bool {
    if !path.is_file() {
        return false;
    }
    if let Some(self_path) = self_exe {
        if path == self_path {
            return false;
        }
        if let (Some(a), Some(b)) = (path.file_name(), self_path.file_name()) {
            if a.eq_ignore_ascii_case(b) {
                return false;
            }
        }
    }

    let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
        return false;
    };
    let lower = name.to_ascii_lowercase();
    if !lower.ends_with(".exe") || lower == "uninstall.exe" {
        return false;
    }
    lower.contains("setup")
}

#[cfg(not(feature = "embedded-setup"))]
fn find_nsis_setup(app: &AppHandle) -> (Option<PathBuf>, Vec<PathBuf>) {
    let self_exe = std::env::current_exe().ok();
    let mut search_dirs: Vec<PathBuf> = Vec::new();

    if let Ok(res_dir) = app.path().resource_dir() {
        let res_nsis = res_dir.join("nsis");
        search_dirs.push(res_nsis);
        search_dirs.push(res_dir);
    }

    if let Some(exe_dir) = self_exe.as_ref().and_then(|p| p.parent()) {
        for candidate_dir in [
            exe_dir.join("resources").join("nsis"),
            exe_dir.join("resources"),
            exe_dir.to_path_buf(),
        ] {
            if !search_dirs.contains(&candidate_dir) {
                search_dirs.push(candidate_dir);
            }
        }
    }

    let preferred_names = ["moss-setup.exe", "moss_setup.exe", "setup.exe"];

    for dir in &search_dirs {
        if !dir.is_dir() {
            continue;
        }
        for name in &preferred_names {
            let candidate = dir.join(name);
            if is_setup_candidate(&candidate, self_exe.as_deref()) {
                return (Some(candidate), search_dirs);
            }
        }

        if let Ok(entries) = fs::read_dir(dir) {
            let mut matches: Vec<PathBuf> = entries
                .filter_map(|entry| entry.ok().map(|e| e.path()))
                .filter(|path| is_setup_candidate(path, self_exe.as_deref()))
                .collect();

            matches.sort_by(|a, b| {
                let a_name = a
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_ascii_lowercase();
                let b_name = b
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_ascii_lowercase();
                let a_moss = a_name.starts_with("moss");
                let b_moss = b_name.starts_with("moss");
                b_moss.cmp(&a_moss).then_with(|| a_name.cmp(&b_name))
            });

            if let Some(found) = matches.into_iter().next() {
                return (Some(found), search_dirs);
            }
        }
    }

    (None, search_dirs)
}

#[cfg(not(feature = "embedded-setup"))]
fn prepare_external_setup(app: &AppHandle, log_path: &Path) -> Result<PathBuf, InstallError> {
    let log_str = log_path.to_string_lossy().into_owned();
    let (maybe_setup, searched_dirs) = find_nsis_setup(app);
    match maybe_setup {
        Some(path) => {
            append_log_line(log_path, &format!("Located NSIS setup: {}", path.display()));
            Ok(path)
        }
        None => {
            let searched = searched_dirs
                .iter()
                .map(|p| p.display().to_string())
                .collect::<Vec<_>>()
                .join("; ");
            append_log_line(
                log_path,
                &format!("ERROR: NSIS setup executable not found. Searched: {searched}"),
            );
            Err(InstallError::new(
                "SETUP_NOT_FOUND",
                "Instalador do moss nao encontrado",
                "moss setup executable not found",
                log_str,
            ))
        }
    }
}

#[tauri::command]
fn check_existing_install(state: State<'_, InstallerState>) -> Result<InstallStatus, InstallError> {
    let log_path = install_log_path()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| r"%LOCALAPPDATA%\moss\install.log".to_string());

    if state.installing.load(Ordering::SeqCst) {
        return Err(InstallError::new(
            "ALREADY_INSTALLING",
            "Instalacao ja esta em andamento",
            "Installation is already in progress",
            log_path,
        ));
    }

    let reg = read_uninstall_registry();
    let (exe_path, exe_exists) = resolve_existing_exe_path(&reg).map_err(|err| {
        InstallError::new(
            "PATH_ERROR",
            "Falha ao resolver pasta de instalacao",
            "Failed to resolve install directory",
            &log_path,
        )
        .with_logged_context(&log_path, &err)
    })?;

    Ok(InstallStatus {
        installed: exe_exists || reg.exists,
        exe_exists,
        registry_exists: reg.exists,
        exe_path: exe_path.to_string_lossy().into_owned(),
        log_path,
        installed_version: reg.display_version,
    })
}

#[tauri::command]
async fn run_install(
    app: AppHandle,
    state: State<'_, InstallerState>,
) -> Result<InstallResult, InstallError> {
    let log_path_buf = install_log_path().map_err(|err| {
        InstallError::new(
            "LOG_PATH_ERROR",
            format!("Falha ao preparar log: {err}"),
            format!("Failed to prepare log: {err}"),
            r"%LOCALAPPDATA%\moss\install.log",
        )
    })?;
    let log_path_str = log_path_buf.to_string_lossy().into_owned();

    if state
        .installing
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err(InstallError::new(
            "ALREADY_INSTALLING",
            "Instalacao ja esta em andamento",
            "Installation is already in progress",
            log_path_str,
        ));
    }

    let _guard = InstallingGuard(&state.installing);
    let app_for_task = app.clone();
    let task_log_path = log_path_buf.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        execute_install_blocking(&app_for_task, &task_log_path)
    })
    .await;

    match result {
        Ok(inner) => inner,
        Err(join_err) => {
            append_log_line(&log_path_buf, &format!("Install task panic: {join_err}"));
            Err(InstallError::new(
                "TASK_PANIC",
                "Erro interno durante a instalacao",
                "Internal error during installation",
                log_path_str,
            ))
        }
    }
}

fn execute_install_blocking(
    app: &AppHandle,
    log_path: &Path,
) -> Result<InstallResult, InstallError> {
    let log_str = log_path.to_string_lossy().into_owned();
    append_log_line(log_path, "=== Starting moss installation ===");

    emit_progress(app, 1, "preparing", 25);
    append_log_line(log_path, "Step 1/4: Preparing installation");

    #[cfg(feature = "embedded-setup")]
    let _extracted_guard = prepare_embedded_setup(log_path)?;
    #[cfg(feature = "embedded-setup")]
    let setup_path = _extracted_guard.path.clone();

    #[cfg(not(feature = "embedded-setup"))]
    let setup_path = prepare_external_setup(app, log_path)?;

    emit_progress(app, 2, "installing", 50);
    append_log_line(
        log_path,
        &format!(
            "Step 2/4: Executing silent setup: {} /S",
            setup_path.display()
        ),
    );

    let mut cmd = Command::new(&setup_path);
    cmd.arg("/S")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(err) => {
            append_log_line(log_path, &format!("ERROR: Failed to spawn setup: {err}"));
            return Err(InstallError::new(
                "SPAWN_FAILED",
                "Falha ao iniciar o instalador",
                "Failed to start installer",
                log_str,
            ));
        }
    };

    let mut emitted_shortcuts = false;
    let started_at = Instant::now();
    let expected_exe = default_moss_exe_path().ok();

    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {
                if started_at.elapsed() >= INSTALL_TIMEOUT {
                    let _ = child.kill();
                    let _ = child.wait();
                    append_log_line(
                        log_path,
                        "ERROR: NSIS setup timed out after 300 seconds and was terminated",
                    );
                    return Err(InstallError::new(
                        "INSTALL_TIMEOUT",
                        "Instalacao excedeu o tempo limite",
                        "Installation timed out",
                        log_str,
                    ));
                }

                if !emitted_shortcuts && started_at.elapsed() >= Duration::from_millis(800) {
                    if let Some(ref exe) = expected_exe {
                        if exe.is_file() {
                            emitted_shortcuts = true;
                            emit_progress(app, 3, "shortcuts", 75);
                            append_log_line(log_path, "Step 3/4: Creating shortcuts");
                        }
                    }
                }
                std::thread::sleep(Duration::from_millis(200));
            }
            Err(err) => {
                append_log_line(log_path, &format!("ERROR: Failed waiting on setup: {err}"));
                return Err(InstallError::new(
                    "WAIT_FAILED",
                    "Erro ao acompanhar a instalacao",
                    "Failed while waiting for installer",
                    log_str,
                ));
            }
        }
    };

    if !status.success() {
        let code_text = status
            .code()
            .map(|c| c.to_string())
            .unwrap_or_else(|| "unknown".to_string());
        append_log_line(
            log_path,
            &format!("ERROR: NSIS setup exited with status code {code_text}"),
        );
        return Err(InstallError::new(
            "INSTALLER_FAILED",
            format!("Instalacao falhou (codigo {code_text})"),
            format!("Installation failed (exit code {code_text})"),
            log_str,
        ));
    }

    if !emitted_shortcuts {
        emit_progress(app, 3, "shortcuts", 75);
        append_log_line(log_path, "Step 3/4: Creating shortcuts");
    }

    let reg = read_uninstall_registry();
    let (exe_path, exe_exists) = resolve_existing_exe_path(&reg).map_err(|err| {
        append_log_line(log_path, &format!("ERROR: {err}"));
        InstallError::new(
            "VERIFY_FAILED",
            "Falha ao verificar instalacao",
            "Failed to verify installation",
            &log_str,
        )
    })?;

    if !exe_exists {
        append_log_line(
            log_path,
            &format!(
                "ERROR: Setup exited 0 but moss.exe was not found at {}",
                exe_path.display()
            ),
        );
        return Err(InstallError::new(
            "BINARY_MISSING",
            "moss.exe nao encontrado apos instalacao",
            "moss.exe not found after installation",
            log_str,
        ));
    }

    emit_progress(app, 4, "finishing", 100);
    append_log_line(
        log_path,
        &format!(
            "Step 4/4: Finishing. Installed successfully at {}",
            exe_path.display()
        ),
    );

    Ok(InstallResult {
        log_path: log_str,
        exe_path: exe_path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
fn launch_moss(state: State<'_, InstallerState>) -> Result<(), InstallError> {
    let log_path = install_log_path()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| r"%LOCALAPPDATA%\moss\install.log".to_string());

    if state.installing.load(Ordering::SeqCst) {
        return Err(InstallError::new(
            "ALREADY_INSTALLING",
            "Aguarde a instalacao concluir",
            "Wait for installation to finish",
            log_path,
        ));
    }

    let reg = read_uninstall_registry();
    let (exe_path, exe_exists) = resolve_existing_exe_path(&reg).map_err(|err| {
        append_log_line(Path::new(&log_path), &format!("ERROR launching moss: {err}"));
        InstallError::new(
            "LAUNCH_PATH_ERROR",
            "Falha ao localizar moss.exe",
            "Failed to locate moss.exe",
            &log_path,
        )
    })?;

    if !exe_exists {
        append_log_line(
            Path::new(&log_path),
            &format!("ERROR launching moss: missing {}", exe_path.display()),
        );
        return Err(InstallError::new(
            "BINARY_MISSING",
            "moss.exe nao encontrado",
            "moss.exe not found",
            log_path,
        ));
    }

    Command::new(&exe_path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|err| {
            append_log_line(
                Path::new(&log_path),
                &format!("ERROR spawning {}: {err}", exe_path.display()),
            );
            InstallError::new(
                "LAUNCH_FAILED",
                "Falha ao abrir o moss",
                "Failed to launch moss",
                &log_path,
            )
        })?;

    append_log_line(
        Path::new(&log_path),
        &format!("Launched moss from {}", exe_path.display()),
    );
    Ok(())
}

#[tauri::command]
fn close_installer(app: AppHandle, state: State<'_, InstallerState>) -> Result<(), String> {
    if state.installing.load(Ordering::SeqCst) {
        return Err("Cannot close while installation is in progress".to_string());
    }
    if let Some(window) = app.get_webview_window(BOOTSTRAPPER_WINDOW) {
        let _ = window.close();
    } else {
        app.exit(0);
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(InstallerState::default())
        .on_window_event(|window, event| {
            if window.label() == BOOTSTRAPPER_WINDOW {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    let state = window.state::<InstallerState>();
                    if state.installing.load(Ordering::SeqCst) {
                        api.prevent_close();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            check_existing_install,
            run_install,
            launch_moss,
            close_installer
        ])
        .run(tauri::generate_context!())
        .expect("error while running moss installer bootstrapper");
}
