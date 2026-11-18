# moss Bootstrapper Installer (PT-BR / EN)

## PT-BR

### Arquitetura

`installer/bootstrapper/` contem um crate Tauri 2 isolado (`moss-bootstrapper`) e uma interface estatica em HTML/CSS/JS puro (`ui/`), sem frameworks JS e sem alterar `src/` ou `src-tauri/` do aplicativo principal.

- **Janela:** 480x300, frameless (`decorations: false`, `resizable: false`, `center: true`), fundo `#0F1411` e accent `#7DA27E`. Arraste via `startDragging()` em `.header-drag`.
- **Idiomas:** deteccao automatica via `navigator.language` (PT-BR para `pt*`, EN-US nos demais casos) e seletor instantaneo `[PT | EN]`.
- **Capabilities:** restritas exclusivamente a janela `bootstrapper` em `src-tauri/capabilities/bootstrapper.json` (`core:event:default`, `core:window:allow-start-dragging` e os 4 comandos do instalador).
- **Comandos Rust (`src-tauri/src/lib.rs`):**
  - `check_existing_install`: verifica `%LOCALAPPDATA%\Programs\moss\moss.exe` e a chave `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\moss` para alternar entre `Instalar` e `Atualizar` (bloqueado enquanto uma instalacao estiver ativa).
  - `run_install`: extrai o setup embutido (`--features embedded-setup`) ou localiza um setup NSIS externo (`resource_dir` antes de `exe_dir`), executa silenciosamente com `/S`, emite progresso por etapas (`install-progress`) e bloqueia fechamento durante a instalacao.
  - `launch_moss` e `close_installer`: iniciam o `moss.exe` instalado e encerram o bootstrapper (`launch_moss` e `close_installer` tambem recusam execucao enquanto uma instalacao estiver ativa).

### Como compilar (`build:installer`)

Na raiz do repositorio:

```bash
pnpm build:installer
```

O script `scripts/build-installer.mjs` executa na ordem:
1. Valida que a versao e identica em `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `installer/bootstrapper/src-tauri/Cargo.toml` e `installer/bootstrapper/src-tauri/tauri.conf.json`.
2. Compila o instalador NSIS principal (`pnpm tauri build --bundles nsis`).
3. Localiza em `src-tauri/target/release/bundle/nsis/` o setup correspondente a versao (`moss_<versao>_x64-setup.exe` ou `moss_<versao>_*-setup.exe`) e copia para `installer/bootstrapper/src-tauri/resources/nsis/moss-setup.exe`.
4. Compila o bootstrapper em release com `--features embedded-setup` (que ativa `custom-protocol` e embute `ui/` e `moss-setup.exe` em `moss-bootstrapper.exe`).
5. Copia o `moss-bootstrapper.exe` recem-compilado para `installer/bootstrapper/src-tauri/target/release/moss-installer.exe` e `src-tauri/target/release/bundle/nsis/moss-installer.exe`.
6. Remove `installer/bootstrapper/src-tauri/resources/nsis/moss-setup.exe` em bloco `finally` mesmo em caso de falha.

### Log, Timeout e Rollback NSIS

- **Log:** todas as etapas, falhas de extracao/spawn e codigos de saida sao gravados em `%LOCALAPPDATA%\moss\install.log` (exibido pelo botao `Detalhes` na tela de erro).
- **Limpeza RAII:** com `embedded-setup`, o setup extraido em `std::env::temp_dir()` usa nome unico (`PID + timestamp nanos + contador atomico`), `create_new(true)`, `sync_all()` e fechamento explicito do handle antes do spawn e nos caminhos de erro. Com `panic = "unwind"` no `[profile.release]`, o `ExtractedSetupGuard` remove o arquivo temporario no `Drop` em sucesso, erro ou panic unwind.
- **Timeout:** a execucao do setup NSIS `/S` possui timeout de 300 segundos com `child.kill()` e `child.wait()`.
- **Rollback NSIS:** em atualizacoes sobre instalacoes anteriores ou falhas parciais, o NSIS mantem o registro em `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\moss` e gera `uninstall.exe` na pasta de destino (`%LOCALAPPDATA%\Programs\moss`). Caso uma instalacao anterior precise ser revertida manualmente, execute o `uninstall.exe` ou reinstale a versao desejada pelo setup NSIS.

---

## EN

### Architecture

`installer/bootstrapper/` contains an isolated Tauri 2 crate (`moss-bootstrapper`) and a static vanilla HTML/CSS/JS UI (`ui/`), with zero JS frameworks and without modifying the main app `src/` or `src-tauri/`.

- **Window:** 480x300, frameless (`decorations: false`, `resizable: false`, `center: true`), `#0F1411` background and `#7DA27E` accent. Window dragging via `startDragging()` on `.header-drag`.
- **Languages:** automatic detection via `navigator.language` (PT-BR for `pt*`, EN-US otherwise) plus instant `[PT | EN]` switcher.
- **Capabilities:** scoped strictly to the `bootstrapper` window in `src-tauri/capabilities/bootstrapper.json` (`core:event:default`, `core:window:allow-start-dragging`, and the 4 installer commands).
- **Rust commands (`src-tauri/src/lib.rs`):**
  - `check_existing_install`: checks `%LOCALAPPDATA%\Programs\moss\moss.exe` and `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\moss` to switch between `Install` and `Update` (rejected while an installation is active).
  - `run_install`: extracts the embedded setup (`--features embedded-setup`) or locates an external NSIS setup (`resource_dir` before `exe_dir`), executes silently with `/S`, emits step progress (`install-progress`), and prevents window closing while installing.
  - `launch_moss` and `close_installer`: launches installed `moss.exe` and closes the bootstrapper (both reject calls while an installation is active).

### Building (`build:installer`)

From the repository root:

```bash
pnpm build:installer
```

`scripts/build-installer.mjs` runs in order:
1. Validates matching versions across `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `installer/bootstrapper/src-tauri/Cargo.toml`, and `installer/bootstrapper/src-tauri/tauri.conf.json`.
2. Builds the main NSIS installer (`pnpm tauri build --bundles nsis`).
3. Locates the version-matched setup (`moss_<version>_x64-setup.exe` or `moss_<version>_*-setup.exe`) in `src-tauri/target/release/bundle/nsis/` and copies it to `installer/bootstrapper/src-tauri/resources/nsis/moss-setup.exe`.
4. Builds the bootstrapper in release mode with `--features embedded-setup` (enabling `custom-protocol` and embedding `ui/` plus `moss-setup.exe` into `moss-bootstrapper.exe`).
5. Copies the freshly built `moss-bootstrapper.exe` to `installer/bootstrapper/src-tauri/target/release/moss-installer.exe` and `src-tauri/target/release/bundle/nsis/moss-installer.exe`.
6. Deletes `installer/bootstrapper/src-tauri/resources/nsis/moss-setup.exe` in a `finally` block even on failure.

### Logging, Timeout, and NSIS Rollback

- **Log:** all steps, extraction/spawn errors, and exit codes are written to `%LOCALAPPDATA%\moss\install.log` (shown via the `Details` button in the error state).
- **RAII cleanup:** under `embedded-setup`, the temporary file in `std::env::temp_dir()` is created with an unpredictable name (`PID + timestamp nanos + atomic counter`), `create_new(true)`, `sync_all()`, and explicit handle drop before spawn and on error paths. With `panic = "unwind"` in `[profile.release]`, `ExtractedSetupGuard::drop` deletes the temporary file on success, error, or panic unwind.
- **Timeout:** silent NSIS execution enforces a 300-second timeout with `child.kill()` and `child.wait()`.
- **NSIS rollback:** NSIS tracks installation metadata under `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\moss` and writes `uninstall.exe` to `%LOCALAPPDATA%\Programs\moss`. To revert an installation after a failure or unwanted update, run `uninstall.exe` or re-run the target NSIS setup.
