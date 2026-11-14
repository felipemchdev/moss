# Moss

[![CI](https://github.com/felipemchdev/moss/actions/workflows/ci.yml/badge.svg)](https://github.com/felipemchdev/moss/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[Português](#pt-br) · [English](#en)

---

## PT-BR

Navegador minimalista, moderno e ultraleve construído com **Tauri 2.x**, **Rust** e **TypeScript**. Combina a experiência de abas flutuantes e navegação do **Zen Browser** com o glassmorphism e animações suaves do **macOS (Apple Motion)** sobre uma paleta pastel em tons de musgo.

### Arquitetura

```
                  ┌──────────────────────────────────────────┐
                  │          Moss Browser Chrome             │
                  │   (TypeScript + HTML5 + CSS Tokens)      │
                  │  Tabs · Omnibar · Bookmarks · Modals     │
                  └────────────────────┬─────────────────────┘
                                       │
                              Tauri 2 IPC Bridge
                                       │
                  ┌────────────────────▼─────────────────────┐
                  │           Tauri Core (Rust)              │
                  │  Child Webviews · Viewport · Downloads   │
                  └────────────────────┬─────────────────────┘
                                       │
                              Native System Engine
                                       │
                  ┌────────────────────▼─────────────────────┐
                  │        WebView2 / WebKit Child           │
                  │    tab-1       tab-2       tab-N         │
                  └──────────────────────────────────────────┘
```

### Funcionalidades

- **Multi-abas Nativo (Tauri 2 Child Webviews):** Cada aba opera em seu próprio processo nativo isolado, redimensionado via `ResizeObserver` e gerenciado dinamicamente no backend Rust.
- **Estética Zen Browser & Mac Glass:**
  - Superfícies translúcidas em vidro fosco (`backdrop-filter: blur(24px) saturate(190%)`).
  - Paleta pastel verde musgo: *Misty Sage* (`#b8eb9a`), *Soft Matcha* (`#6eb54f`), *Moss Pastel* (`#a7e286`) e fundos serenos.
  - Curvas de aceleração spring inspiradas no motion design da Apple.
- **Barra de Favoritos & Toggle Estrela:** Acesso rápido abaixo da toolbar com persistência no armazenamento local e estrela interativa na omnibar.
- **Histórico Persistente (`Ctrl+H`):** Gaveta deslizante com busca em tempo real, exclusão individual e limpeza em duas etapas.
- **Painel de Configurações (`Ctrl+,`):**
  - Alternador de tema: Escuro, Claro (*Warm Cream*) e Sistema.
  - Motores de busca configuráveis (DuckDuckGo, Google, Bing).
  - Homepage personalizada com validação e blindagem de esquemas de URL.
- **Menu de Contexto de Abas:** Clique com botão direito na aba para recarregar, duplicar, fechar aba ou fechar outras abas.
- **Indicador Nativo de Downloads:** Pílula flutuante integrada ao hook `on_download` do Tauri 2, com animação spring, notificação de status e auto-dispensa em 4 segundos.
- **Modal de Atalhos (`Ctrl+/` ou `?`):** Cheat sheet interativo em duas colunas com focus trap acessível.

### Atalhos de Teclado

| Atalho | Ação |
| --- | --- |
| `Ctrl + T` | Nova aba |
| `Ctrl + W` | Fechar aba ativa |
| `Ctrl + Tab` | Próxima aba |
| `Ctrl + Shift + Tab` | Aba anterior |
| `Ctrl + L` | Focar na omnibar |
| `Ctrl + H` | Abrir / fechar gaveta de histórico |
| `Ctrl + ,` | Abrir / fechar configurações |
| `Ctrl + /` ou `?` | Abrir / fechar atalhos de teclado |
| `F5` | Recarregar aba ativa |
| `Alt + ←` | Voltar página |
| `Alt + →` | Avançar página |
| `Esc` | Fechar modais / cancelar |
| `Enter` | Navegar ou pesquisar na omnibar |

### Componentes do Projeto

| Componente | Camada | Descrição |
| --- | --- | --- |
| `src-tauri/src/lib.rs` | Rust Backend | Gerencia child webviews nativas, eventos de ciclo de vida (`tab://load`, `tab://title`, `tab://open`), downloads e IPC. |
| `src/tabs.ts` | Frontend Store | Gerenciador de estado reativo das abas (criação, seleção, fechamento e histórico de navegação). |
| `src/omnibar.ts` | Frontend Logic | Resolução e sanitização de URLs, detecção de domínios/IPs e consultas de busca. |
| `src/bookmarks.ts` | Frontend Store | Armazenamento persistente de favoritos com eventos pub/sub. |
| `src/history.ts` | Frontend Store | Registro persistente com debounce de 500ms e busca de histórico. |
| `src/settings.ts` | Frontend Store | Gerenciador de preferências (tema, buscador e página inicial). |
| `src/panel.ts` | UI Controller | Controlador universal de modais com focus trap acessível e fechamento global via Escape. |
| `src/context-menu.ts` | UI Component | Menu de contexto flutuante para abas com medição síncrona de posicionamento. |
| `src/downloads.ts` | UI Component | Pílula flutuante de downloads integrada ao backend nativo com estados de progresso, conclusão e falha. |
| `src/shortcuts-modal.ts`| UI Component | Modal de exibição dos atalhos de teclado. |
| `src/styles/tokens.css` | Design Tokens | Variáveis CSS de cor, sombras, glassmorphism e curvas de animação Apple. |
| `src/styles/browser-chrome.css` | Stylesheet | Estilização completa da interface do navegador com compatibilidade WCAG AA/AAA. |

### Quick Start

#### Pré-requisitos

- Node.js 18+ e [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/) (ferramentas de compilação C++ / MSVC no Windows)

```sh
# Instalar dependências
pnpm install

# Executar em modo desenvolvimento
pnpm tauri dev

# Validar tipagem e build do frontend
pnpm build

# Validar backend Rust
cargo check --manifest-path src-tauri/Cargo.toml

# Gerar executável de produção
pnpm tauri build
```

---

## EN

Minimalist, modern, and ultra-lightweight web browser built with **Tauri 2.x**, **Rust**, and **TypeScript**. Combines **Zen Browser** floating navigation and pill omnibar with **macOS (Apple Motion)** glassmorphism and spring curves over a serene pastel moss green palette.

### Architecture

```
                  ┌──────────────────────────────────────────┐
                  │          Moss Browser Chrome             │
                  │   (TypeScript + HTML5 + CSS Tokens)      │
                  │  Tabs · Omnibar · Bookmarks · Modals     │
                  └────────────────────┬─────────────────────┘
                                       │
                              Tauri 2 IPC Bridge
                                       │
                  ┌────────────────────▼─────────────────────┐
                  │           Tauri Core (Rust)              │
                  │  Child Webviews · Viewport · Downloads   │
                  └────────────────────┬─────────────────────┘
                                       │
                              Native System Engine
                                       │
                  ┌────────────────────▼─────────────────────┐
                  │        WebView2 / WebKit Child           │
                  │    tab-1       tab-2       tab-N         │
                  └──────────────────────────────────────────┘
```

### Key Features

- **Native Multi-Tab Architecture (Tauri 2 Child Webviews):** Each tab runs in an isolated native child webview, automatically adjusted via `ResizeObserver` and lifecycle management.
- **Zen Browser & Mac Glass Aesthetics:**
  - Frosted glass surfaces (`backdrop-filter: blur(24px) saturate(190%)`).
  - Pastel green palette: *Misty Sage* (`#b8eb9a`), *Soft Matcha* (`#6eb54f`), *Moss Pastel* (`#a7e286`), and serene dark undertones.
  - Apple spring curves for fluid transitions and micro-interactions.
- **Bookmarks Bar & Star Toggle:** Quick access bar below the main toolbar with instant localStorage persistence and interactive omnibar star toggle.
- **Persistent History Drawer (`Ctrl+H`):** Slide-out drawer with real-time filtering, individual removal, and safe 2-step clear.
- **Settings Modal (`Ctrl+,`):**
  - Theme switcher: Dark, Light (*Warm Cream*), and System.
  - Search engine selector (DuckDuckGo, Google, Bing).
  - Custom homepage configuration with strict URL scheme validation.
- **Tab Context Menu:** Right-click tabs to reload, duplicate, close, or close other tabs.
- **Native Download Indicator:** Floating pastel glass pill powered by Tauri 2 `on_download` events with status updates and auto-dismiss after 4 seconds.
- **Shortcuts Modal (`Ctrl+/` or `?`):** Two-column interactive cheat sheet with accessible focus trapping.

### Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl + T` | New tab |
| `Ctrl + W` | Close active tab |
| `Ctrl + Tab` | Next tab |
| `Ctrl + Shift + Tab` | Previous tab |
| `Ctrl + L` | Focus omnibar |
| `Ctrl + H` | Open / close history drawer |
| `Ctrl + ,` | Open / close settings modal |
| `Ctrl + /` or `?` | Open / close shortcuts cheat sheet |
| `F5` | Reload active page |
| `Alt + ←` | Go back in history |
| `Alt + →` | Go forward in history |
| `Esc` | Close open panels / dismiss |
| `Enter` | Navigate or search from omnibar |

### Project Modules

| Module | Layer | Description |
| --- | --- | --- |
| `src-tauri/src/lib.rs` | Rust Backend | Controls native child webviews, navigation lifecycle events (`tab://load`, `tab://title`, `tab://open`), downloads, and IPC. |
| `src/tabs.ts` | Frontend Store | Reactive state store for tabs (create, select, close, and navigation stack). |
| `src/omnibar.ts` | Frontend Logic | URL sanitization, domain detection, and search query routing. |
| `src/bookmarks.ts` | Frontend Store | Local storage persistence for bookmarks with pub/sub updates. |
| `src/history.ts` | Frontend Store | Persistent navigation history with 500ms debounce. |
| `src/settings.ts` | Frontend Store | User configuration store (theme, search engine, homepage). |
| `src/panel.ts` | UI Controller | Universal panel controller with accessible focus trap and Escape handler. |
| `src/context-menu.ts` | UI Component | Floating tab context menu with synchronous layout clamping. |
| `src/downloads.ts` | UI Component | Download progress pill wired to native backend events. |
| `src/shortcuts-modal.ts`| UI Component | Accessible keyboard shortcuts modal. |
| `src/styles/tokens.css` | Design Tokens | CSS custom properties for colors, glassmorphism, and Apple spring curves. |
| `src/styles/browser-chrome.css` | Stylesheet | Complete browser chrome design adhering to WCAG AA/AAA standards. |

### Getting Started

#### Prerequisites

- Node.js 18+ and [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/) (C++ build tools / MSVC on Windows)

```sh
# Install dependencies
pnpm install

# Run in development mode
pnpm tauri dev

# Type check and build client
pnpm build

# Check Rust backend
cargo check --manifest-path src-tauri/Cargo.toml

# Build production executable
pnpm tauri build
```

### License

This project is licensed under the [MIT License](LICENSE).
