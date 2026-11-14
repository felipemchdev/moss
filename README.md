# 🌿 Moss Browser

[![CI](https://github.com/felipemchdev/moss/actions/workflows/ci.yml/badge.svg)](https://github.com/felipemchdev/moss/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[Português](#pt-br) · [English](#en)

---

## PT-BR

Navegador web moderno, ultrarrápido e minimalista construído com **Tauri 2.x**, **Rust (Backend)**, **TypeScript**, **Vite** e **WebView2**.

Combina a ergonomia espacial do **Zen Browser** e **Arc** com a elegância glassmorphic do **macOS (Apple Motion)** sobre uma paleta serena em tons de verde musgo (*Sage*, *Matcha*, *Moss Pastel*).

---

### 🏛️ Arquitetura do Sistema

```
                  ┌──────────────────────────────────────────────┐
                  │             Moss Browser Chrome              │
                  │       (TypeScript + HTML5 + CSS Tokens)      │
                  │  Vertical Sidebar · Workspaces · Omnibar     │
                  │  Tab Folders · Boosts · Zapper · Media Widget│
                  └──────────────────────┬───────────────────────┘
                                         │
                                Tauri 2 IPC Bridge
                                         │
                  ┌──────────────────────▼───────────────────────┐
                  │              Tauri Core (Rust)               │
                  │   Child Webviews · Viewports · Media State   │
                  │   Ad-Block Engine · Native Permissions · OS  │
                  └──────────────────────┬───────────────────────┘
                                         │
                               Native System Engine
                                         │
                  ┌──────────────────────▼───────────────────────┐
                  │            WebView2 / WebKit Child           │
                  │      tab-1         tab-2         tab-N       │
                  │         (100% Isolated Remote Context)       │
                  └──────────────────────────────────────────────┘
```

---

### 🧩 Tabela de Componentes

| Subsistema | Módulos Principais | Tecnologia | Responsabilidade |
| --- | --- | --- | --- |
| **Shell & UI Chrome** | `main.ts`, `dom.ts`, `icons.ts`, `tokens.css` | TypeScript, CSS3 | Layout glassmorphic, barra vertical e ciclo de vida da interface. |
| **Abas & Pastas** | `tabs.ts`, `folders.ts`, `split-view.ts` | TypeScript, DOM API | Gerenciamento de abas, pastas hierárquicas e hibernação de memória. |
| **Roteamento & Espaços** | `workspaces.ts`, `space-routing.ts`, `toast.ts` | TypeScript | Mapeamento inteligente de domínios e isolamento de contextos. |
| **Inspeção & Estilização** | `boosts.ts`, `boosts-popover.ts`, `glance.ts` | TypeScript, CSS | Element Zapper, Smart Dark Mode, CSS injetado e Glance modal. |
| **Multimídia** | `media.ts`, `media-widget.ts` | TypeScript, MediaSession API | Detecção global de faixas, mini-player e mute direto em abas. |
| **Segurança & Sistema** | `privacy-shield.ts`, `permissions.ts`, `downloads.ts` | TypeScript | Bloqueio de rastreadores, permissões e gerenciamento de arquivos. |
| **Onboarding** | `welcome-wizard.ts`, `settings.ts` | TypeScript | Assistente inicial de 5 passos e sincronização de preferências. |
| **Backend Core** | `src-tauri/src/lib.rs` | Rust, Tauri 2, Tokio | Gerenciamento de child webviews nativas, IPC assíncrono e HWNDs. |

---

### ✨ Funcionalidades Principais

#### 🗄️ Zen Vertical Sidebar & Modo Compacto (`Ctrl+B`)
- Barra lateral vertical elegante (260px) com controle de janela nativo e grade de abas fixadas (*Pinned Grid*).
- Alternância instantânea para modo compacto (~56px dock com ícones) liberando 100% da viewport para navegação.
- Mini-toolbar superior flutuante (*Floating Top Bar*) exibida automaticamente em modo compacto.

#### 🧭 Workspaces & Zen Space Routing por Domínio
- Espaços de trabalho isolados (*Pessoal*, *Trabalho*, *Desenvolvimento* ou personalizados) com atalhos `Ctrl+Alt+1..9`.
- **Space Routing Automático:** mapeia domínios para espaços de destino (ex: `github.com` → Dev, `slack.com` → Trabalho, `youtube.com` → Pessoal).
- Suporte a modo *Automático* ou *Perguntar*, com toasts glassmorphic superiores de confirmação.

#### 📁 Pastas de Abas (Tab Folders) & Hibernação de Memória
- Agrupamento hierárquico de abas com cores personalizadas, contador e colapso suave.
- Arraste e solte (*Drag & Drop*) para organizar abas dentro e fora de pastas.
- **Tab Hibernation (Memory Saver):** descarrega as webviews nativas em segundo plano destruindo seus HWNDs do SO e preservando metadados, com reativação instantânea e transparente ao clicar.
- Indicador visual de aba suspensa com ícone de lua (`moon`).

#### ⚡ Zen Boosts & Element Zapper (`Ctrl+Shift+Z`)
- **Element Zapper:** mira interativa com cursor crosshair que destaca elementos web em tempo real e os dissolve ao clicar, gravando regras CSS persistentes por domínio (`display: none !important;`).
- **Zen Boosts:** Smart Dark Mode (inversão inteligente de cores preservando mídia), sliders de brilho e contraste, filtro sépia relaxante e editor de CSS customizado por site.

#### 👁️ Zen Glance / Link Peeking (`Shift+Click` / `Ctrl+Shift+G`)
- Pré-visualização flutuante não-destrutiva de links em modal squircle centralizado com backdrop escurecido.
- Ações rápidas: "Abrir em aba" (`Ctrl+O`), "Copiar link" e "Fechar" (`Esc`).

#### 🎵 Media Controls Widget & Audio Indicators
- Detecção global de áudio e vídeo em reprodução em abas ativas e de segundo plano (`navigator.mediaSession`).
- Mini player elegante no rodapé da sidebar com capa, título da faixa, artista, Play/Pause e Mute.
- Clique no título pula diretamente para a aba emissora.
- Pílula de áudio interativa nas abas com live pulse e toggle de som direto.

#### 🪟 Split View Nativo (`Ctrl+\`)
- Navegação lado a lado em duas abas simultâneas com proporção ajustável via divisor interativo, atalho de troca de lados e foco ativo.

#### 🎉 Zen Welcome / Setup Wizard Inicial
- Assistente de boas-vindas guiado em 5 passos para novos usuários:
  1. Identidade visual e escolha de tema (Escuro / Claro / Auto).
  2. Motor de busca padrão (Google, DuckDuckGo, Bing, Ecosia, Kagi).
  3. Escudo de Privacidade e bloqueador nativo.
  4. Grade de Web Apps Essenciais (GitHub, YouTube, Notion, Spotify, Reddit, Wikipédia).
  5. Conclusão e transição cinematográfica.

#### 🛡️ Escudo de Privacidade & Central de Permissões
- Bloqueador nativo de anúncios e anti-tracking integrado.
- Popover de segurança na Omnibar com contagem precisa de rastreadores bloqueados.
- Controle granular de permissões por site (Câmera, Microfone, Geolocalização, Notificações) e limpeza de cookies/cache.

#### 📖 Modo Leitura / Reader Mode (`Ctrl+Alt+R`)
- Extração de conteúdo legível sem distrações com tipografia ajustável e temas.

#### ⚡ Paleta de Comandos / Quick Launcher (`Ctrl+K` / `Ctrl+P`)
- Busca unificada multi-fonte (abas abertas de todos os espaços, histórico, favoritos e ações rápidas) com scoring fuzzy NFD.

#### 📥 Gerenciador Dedicado de Downloads (`Ctrl+J`)
- Painel deslizante com barra de progresso em tempo real, metadados e integração direta com o Windows Explorer ("Abrir arquivo" e "Mostrar na pasta").

---

### ⌨️ Tabela de Atalhos de Teclado

| Atalho | Ação |
| --- | --- |
| `Ctrl + T` | Nova aba |
| `Ctrl + W` | Fechar aba atual |
| `Ctrl + Shift + T` | Reabrir última aba fechada |
| `Ctrl + B` | Alternar barra lateral (Modo Compacto) |
| `Ctrl + K` / `Ctrl + P` | Paleta de comandos (Quick Launcher) |
| `Ctrl + \` / `Ctrl + Shift + S` | Alternar tela dividida (Split View) |
| `Ctrl + Shift + G` | Espiar URL ativa (Zen Glance) |
| `Shift + Click` | Espiar link no Glance |
| `Ctrl + Shift + Z` | Element Zapper (Eliminar elemento) |
| `Ctrl + Alt + R` | Modo leitura (Reader Mode) |
| `Ctrl + F` | Localizar na página |
| `F3` / `Shift + F3` | Próxima / anterior ocorrência da busca |
| `Ctrl + +` / `Ctrl + -` | Aumentar / diminuir zoom |
| `Ctrl + 0` | Redefinir zoom (100%) |
| `Ctrl + Alt + 1-9` | Alternar espaço de trabalho |
| `Ctrl + Tab` / `Ctrl + Shift + Tab` | Próxima / aba anterior |
| `Ctrl + L` | Focar na Omnibar |
| `Ctrl + H` | Abrir histórico de navegação |
| `Ctrl + J` | Abrir painel de downloads |
| `Ctrl + ,` | Abrir configurações |
| `Ctrl + /` ou `?` | Abrir atalhos de teclado |
| `F5` | Recarregar página |
| `Alt + ←` / `Alt + →` | Voltar / avançar na navegação |
| `Esc` | Fechar modais / cancelar ações |

---

### 🚀 Começando

#### Pré-requisitos
- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/) (MSVC build tools no Windows)

```sh
# Instalar dependências
pnpm install

# Iniciar em ambiente de desenvolvimento
pnpm dev

# Compilar release para produção
pnpm tauri build
```

---

## EN

Minimalist, ultra-fast, and tranquil web browser built with **Tauri 2.x**, **Rust**, **TypeScript**, **Vite**, and **WebView2**.

Combines the spatial ergonomics of **Zen Browser** and **Arc** with the glassmorphic elegance of **macOS (Apple Motion)** over a serene moss green palette (*Sage*, *Matcha*, *Moss Pastel*).

---

### 🏛️ System Architecture

```
                  ┌──────────────────────────────────────────────┐
                  │             Moss Browser Chrome              │
                  │       (TypeScript + HTML5 + CSS Tokens)      │
                  │  Vertical Sidebar · Workspaces · Omnibar     │
                  │  Tab Folders · Boosts · Zapper · Media Widget│
                  └──────────────────────┬───────────────────────┘
                                         │
                                Tauri 2 IPC Bridge
                                         │
                  ┌──────────────────────▼───────────────────────┐
                  │              Tauri Core (Rust)               │
                  │   Child Webviews · Viewports · Media State   │
                  │   Ad-Block Engine · Native Permissions · OS  │
                  └──────────────────────┬───────────────────────┘
                                         │
                               Native System Engine
                                         │
                  ┌──────────────────────▼───────────────────────┐
                  │            WebView2 / WebKit Child           │
                  │      tab-1         tab-2         tab-N       │
                  │         (100% Isolated Remote Context)       │
                  └──────────────────────────────────────────────┘
```

---

### 🧩 Component Specifications

| Subsystem | Key Modules | Technology | Responsibility |
| --- | --- | --- | --- |
| **Shell & Chrome UI** | `main.ts`, `dom.ts`, `icons.ts`, `tokens.css` | TypeScript, CSS3 | Glassmorphic layout, vertical sidebar, and UI lifecycle. |
| **Tabs & Folders** | `tabs.ts`, `folders.ts`, `split-view.ts` | TypeScript, DOM API | Tab lifecycle, folder grouping, and memory hibernation. |
| **Spaces & Routing** | `workspaces.ts`, `space-routing.ts`, `toast.ts` | TypeScript | Domain-to-workspace routing and context isolation. |
| **Page Customization** | `boosts.ts`, `boosts-popover.ts`, `glance.ts` | TypeScript, CSS | Element Zapper, Smart Dark Mode, custom CSS, and Glance modal. |
| **Media Controller** | `media.ts`, `media-widget.ts` | TypeScript, MediaSession API | Global audio tracking, sidebar player, and tab mute controls. |
| **Security & System** | `privacy-shield.ts`, `permissions.ts`, `downloads.ts` | TypeScript | Native ad-blocking, permission rules, and file downloads. |
| **Onboarding** | `welcome-wizard.ts`, `settings.ts` | TypeScript | Guided setup wizard and persistent configuration storage. |
| **Backend Core** | `src-tauri/src/lib.rs` | Rust, Tauri 2, Tokio | Native child webview control, async runtime, and HWND handling. |

---

### ⚙️ Technical Specifications

#### 1. Native Webview Isolation
- The application separates the browser chrome from web content execution.
- Remote tabs run inside isolated child webviews (`tab-<id>`) with zero IPC capabilities.
- The chrome webview executes with restricted Tauri privileges on an isolated origin.

#### 2. Tab Hibernation & Memory Optimization
- When memory optimization activates, the background native webview unloads completely.
- The operating system destroys the native HWND handle.
- Tab metadata, scroll coordinates, and title remain stored in memory.
- When the user selects a sleeping tab, the system recreates the webview and restores page state.

#### 3. Asynchronous Element Zapper
- The Element Zapper uses non-blocking runtime tasks via `tauri::async_runtime::spawn`.
- Polling runs at regular 150ms intervals using `tokio::time::sleep` without blocking the main event thread.
- Selected CSS selectors persist in `localStorage` under domain-specific keys (`moss:domain_zap_rules`).

#### 4. Design Token Hierarchy
- The system consolidates design tokens in `tokens.css` as the canonical source of truth.
- Standardized z-index scale:
  - `--z-tooltip`: `600`
  - `--z-toast`: `700`
  - `--z-command-palette`: `800`
  - `--z-wizard`: `900`
  - `--z-glass-overlay`: `1000`

---

### ✨ Features

#### 🗄️ Vertical Sidebar & Compact Mode (`Ctrl+B`)
- Vertical sidebar (260px) with native window controls and pinned tabs grid.
- Compact mode collapses the sidebar to a 56px icon dock.
- Floating top bar automatically appears during compact navigation.

#### 🧭 Workspaces & Domain Space Routing
- Isolated workspaces (Personal, Work, Development, or Custom) accessible via `Ctrl+Alt+1..9`.
- Space Routing intercepts navigation and assigns domains to workspaces automatically.
- Supports automatic migration or user confirmation prompts with glassmorphic toast notifications.

#### 📁 Tab Folders & Hibernation
- Hierarchical tab grouping with custom colors and collapsible folder headers.
- Drag-and-drop tab reordering.
- Background tab hibernation unloads native webviews to save memory.
- Hibernated tabs show a moon icon indicator.

#### ⚡ Zen Boosts & Element Zapper (`Ctrl+Shift+Z`)
- Element Zapper targets and removes page elements with persistent domain rules.
- Smart Dark Mode inverts page colors while preserving media and canvas elements.
- Real-time brightness and contrast sliders, sepia filter, and custom CSS injection.

#### 👁️ Glance Link Peeking (`Shift+Click` / `Ctrl+Shift+G`)
- Non-destructive floating preview modal for hyperlinks.
- Automatically hides underlying webviews to prevent HWND occlusion.
- Quick actions: open in standard tab (`Ctrl+O`), copy URL, or close (`Esc`).

#### 🎵 Media Controls Widget
- Global audio and video detection polling `navigator.mediaSession` across background tabs.
- Sidebar mini-player with track information, playback toggle, and direct tab jump.
- Interactive audio indicators on tabs with one-click mute.

#### 🪟 Native Split View (`Ctrl+\`)
- Side-by-side dual tab browsing with adjustable split ratio and focus management.

#### 🎉 Zen Welcome Setup Wizard
- Guided initial setup for new users:
  1. Theme selection (Dark, Light, System).
  2. Search engine selection (Google, DuckDuckGo, Bing, Ecosia, Kagi).
  3. Privacy Shield configuration.
  4. Essential web applications launcher.
  5. Completion screen.

#### 🛡️ Privacy Shield & Permissions
- Integrated ad-blocker and anti-tracking engine.
- Omnibar shield icon showing blocked tracker statistics.
- Granular permission management per site (Camera, Microphone, Geolocation, Notifications).

#### 📖 Reader Mode (`Ctrl+Alt+R`)
- Distraction-free article reader with customizable typography and color themes.

#### ⚡ Command Palette (`Ctrl+K` / `Ctrl+P`)
- Unified launcher searching open tabs, browsing history, bookmarks, and browser actions.

#### 📥 Download Manager (`Ctrl+J`)
- Dedicated downloads panel with real-time progress bars and system file explorer integration.

---

### ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl + T` | New tab |
| `Ctrl + W` | Close active tab |
| `Ctrl + Shift + T` | Reopen closed tab |
| `Ctrl + B` | Toggle sidebar (Compact mode) |
| `Ctrl + K` / `Ctrl + P` | Command palette (Quick launcher) |
| `Ctrl + \` / `Ctrl + Shift + S` | Toggle split view |
| `Ctrl + Shift + G` | Glance active URL |
| `Shift + Click` | Glance clicked hyperlink |
| `Ctrl + Shift + Z` | Start Element Zapper |
| `Ctrl + Alt + R` | Toggle reader mode |
| `Ctrl + F` | Find in page |
| `F3` / `Shift + F3` | Next / previous search match |
| `Ctrl + +` / `Ctrl + -` | Zoom in / zoom out |
| `Ctrl + 0` | Reset zoom (100%) |
| `Ctrl + Alt + 1-9` | Switch workspace |
| `Ctrl + Tab` / `Ctrl + Shift + Tab` | Next / previous tab |
| `Ctrl + L` | Focus Omnibar |
| `Ctrl + H` | Open browsing history |
| `Ctrl + J` | Open download manager |
| `Ctrl + ,` | Open settings |
| `Ctrl + /` or `?` | Open keyboard shortcuts |
| `F5` | Reload page |
| `Alt + ←` / `Alt + →` | Navigate backward / forward |
| `Esc` | Close modals and cancel modes |

---

### 🚀 Getting Started

#### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/) (MSVC build tools on Windows)

```sh
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build production bundle
pnpm tauri build
```

---

### 📄 License

MIT License. Copyright (c) 2026 felipemchdev.
