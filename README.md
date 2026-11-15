# 🌿 moss

[![CI](https://github.com/felipemchdev/moss/actions/workflows/ci.yml/badge.svg)](https://github.com/felipemchdev/moss/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[Português](#pt-br) · [English](#en)

---

## PT-BR

Navegador web moderno, ultrarrápido e minimalista construído com **Tauri 2.x**, **Rust (Backend)**, **TypeScript**, **Vite** e **WebView2**.

Combina ergonomia espacial avançada e elegância glassmorphic inspirada no macOS sobre uma paleta serena em tons de verde sálvia (*Pastel Sage Green* `#7da27e`).

---

### 🏛️ Arquitetura do Sistema

```
                  ┌──────────────────────────────────────────────┐
                  │                 moss Chrome                  │
                  │       (TypeScript + HTML5 + CSS Tokens)      │
                  │  Vertical Sidebar · Workspaces · Omnibar     │
                  │  Tab Folders · Boosts · Zapper · Media Widget│
                  │  Translator · Private Tabs · Window Dragging │
                  └──────────────────────┬───────────────────────┘
                                         │
                                Tauri 2 IPC Bridge
                                         │
                  ┌──────────────────────▼───────────────────────┐
                  │              Tauri Core (Rust)               │
                  │   Child Webviews · Viewports · Media State   │
                  │   Ad-Block Engine · Native Permissions · OS  │
                  │   Window Drag Service · Webview Translation  │
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
| **Shell & UI Chrome** | `main.ts`, `dom.ts`, `icons.ts`, `tokens.css` | TypeScript, CSS3 | Layout glassmorphic, dock vertical de 56px, arraste nativo e ciclo de vida. |
| **Abas & Pastas** | `tabs.ts`, `folders.ts`, `split-view.ts` | TypeScript, DOM API | Gerenciamento de abas, pastas hierárquicas e hibernação de memória. |
| **Navegação Privada** | `tabs.ts`, `main.ts`, `icons.ts` | TypeScript, DOM API | Guia anônima sem persistência de histórico e estilo dark slate. |
| **Tradutor Nativo** | `translate-popover.ts`, `src-tauri/src/lib.rs` | TypeScript, Rust IPC | Popover de tradução e comando `translate_tab` com injeção de script. |
| **Anti-Anúncios YouTube** | `privacy-shield.ts`, `src-tauri/src/lib.rs` | Rust, CSS Injetado | Supressão visual em `#__moss_yt_ad_style__`, aceleração 16x e auto-skip. |
| **Roteamento & Espaços** | `workspaces.ts`, `space-routing.ts`, `toast.ts` | TypeScript | Mapeamento inteligente de domínios e isolamento de contextos. |
| **Inspeção & Estilização** | `boosts.ts`, `boosts-popover.ts`, `glance.ts` | TypeScript, CSS | Element Zapper, Smart Dark Mode, CSS injetado e Glance modal. |
| **Multimídia** | `media.ts`, `media-widget.ts` | TypeScript, MediaSession API | Detecção global de faixas, mini-player e mute direto em abas. |
| **Segurança & Permissões** | `privacy-shield.ts`, `permissions.ts`, `downloads.ts` | TypeScript | Bloqueio de rastreadores, permissões e gerenciamento de downloads. |
| **Onboarding** | `welcome-wizard.ts`, `settings.ts` | TypeScript | Assistente inicial de 5 passos e preferências persistentes. |
| **Instalador Nativo** | `src-tauri/installer/*`, `tauri.conf.json` | NSIS, Python, BMP | Instalador 1-click customizado com tema dark moss e bitmaps 24-bit. |
| **Backend Core** | `src-tauri/src/lib.rs` | Rust, Tauri 2, Tokio | Gerenciamento de child webviews nativas, IPC assíncrono e HWNDs. |

---

### ✨ Funcionalidades Principais

#### 🪟 Arraste Nativo de Janela
- O usuário arrasta a janela através das áreas de cabeçalho da sidebar e da floating top bar com o atributo `data-tauri-drag-region`.
- Sistema com fallback programático direto via `startDragging()` do Tauri com a permissão nativa `core:window:allow-start-dragging`.

#### 🛡️ Anti-Anúncios YouTube Embutido
- O motor de proteção intercepta requisições de publicidade, estatísticas e fluxos mid-roll antes da renderização.
- Injeta folha de estilos dedicada em `#__moss_yt_ad_style__` para supressão visual de anúncios em formato banner, masthead e overlays de vídeo.
- Acelera vídeos de propaganda em 16x com áudio mutado e aciona o clique automático de pulo (*auto-skip*) instantaneamente.

#### 🗄️ Barra Lateral Vertical & Modo Compacto (`Ctrl+B`)
- Barra lateral vertical elegante (260px) com controle de janela nativo e grade de abas fixadas (*Pinned Grid*).
- Alternância instantânea para modo compacto (~56px dock com ícones de 40x40px, badge flutuante de áudio e indicador ativo contido) liberando 100% da viewport para navegação.
- Mini-toolbar superior flutuante (*Floating Top Bar*) exibida automaticamente em modo compacto com navegação e status de segurança.

#### 🕵️ Guia Anônima / Private Tabs (`Ctrl+Shift+N`)
- O atalho `Ctrl+Shift+N` abre uma nova guia com a flag `isPrivate`.
- O navegador não grava histórico nem sessão nesta aba.
- Identificação visual imediata com ícone de escudo na aba e tema diferenciado em tom dark slate.

#### 🌐 Tradutor Nativo de Páginas (`Ctrl+Shift+U`)
- O comando nativo `translate_tab` traduz páginas diretamente na webview ativa.
- Popover intuitivo na Omnibar permite selecionar idiomas de destino (Português, Inglês, Espanhol, Francês, Alemão) ou retornar à versão original.

#### 🎨 Paleta Pastel Sage Green (#7da27e)
- Sistema visual sereno com a cor primária de destaque Pastel Sage Green (`#7da27e`) calibrada para alto contraste e conforto visual no modo escuro.
- Ícone de downloads corrigido na barra de cabeçalho na escala exata de 16x16px.

#### 📦 Instalador Customizado 1-Click NSIS
- Instalador Windows autônomo baseado em template NSIS estilizado no tema dark moss (#0F1411 de fundo e acentos em #7da27e).
- Imagens de cabeçalho e barra lateral em formato BMP 24-bit não compactado para compatibilidade total.
- Preview embutido em `public/installer-preview.html` para inspeção visual rápida.

#### 🧭 Workspaces & Roteamento por Domínio (`Ctrl+Alt+1..9`)
- Espaços de trabalho isolados (*Pessoal*, *Trabalho*, *Desenvolvimento* ou personalizados) com atalhos `Ctrl+Alt+1..9`.
- **Space Routing Automático:** mapeia domínios para espaços de destino com suporte a modo automático ou aviso de confirmação via toasts glassmorphic.

#### 📁 Pastas de Abas & Hibernação de Memória
- Agrupamento hierárquico de abas com cores personalizadas e colapso suave.
- **Hibernação de Memória:** descarrega as webviews nativas em segundo plano destruindo seus HWNDs do SO e preservando metadados, reativando a página instantaneamente ao clicar.

#### ⚡ Boosts de Página & Element Zapper (`Ctrl+Shift+Z`)
- **Element Zapper:** mira interativa com cursor crosshair que destaca elementos web em tempo real e grava regras persistentes por domínio (`display: none !important;`).
- **Boosts de Página:** Smart Dark Mode com inversão inteligente de cores preservando mídia, sliders de brilho e contraste, filtro sépia relaxante e editor de CSS customizado por site.

#### 👁️ Glance / Pré-visualização de Links (`Shift+Click` / `Ctrl+Shift+G`)
- Pré-visualização flutuante não-destrutiva de links em modal squircle centralizado com supressão de oclusão de webview.
- Ações rápidas: abrir em aba (`Ctrl+O`), copiar link e fechar (`Esc`).

#### 🎵 Widget de Mídia & Controles Globais
- Detecção global de reprodução em abas ativas e de segundo plano via `navigator.mediaSession`.
- Mini player elegante no rodapé da sidebar com capa, título da faixa, artista, Play/Pause e Mute.

#### 🪟 Split View Nativo (`Ctrl+\`)
- Navegação lado a lado em duas abas simultâneas com proporção ajustável via divisor interativo.

#### 🎉 Assistente de Boas-Vindas Inicial
- Assistente guiado em 5 passos para novos usuários com escolha de tema, motor de busca e web apps essenciais.

#### 🛡️ Escudo de Privacidade & Central de Permissões
- Bloqueador nativo de anúncios e rastreadores com contador em tempo real na Omnibar.
- Controle granular de permissões por site (Câmera, Microfone, Localização, Notificações).

#### 📖 Modo Leitura (`Ctrl+Alt+R`)
- Extração de conteúdo legível sem distrações com tipografia ajustável e temas dedicados.

#### ⚡ Paleta de Comandos (`Ctrl+K` / `Ctrl+P`)
- Busca unificada multi-fonte (abas abertas de todos os espaços, histórico, favoritos e ações) com navegação fluida por teclado.

#### 📥 Gerenciador Dedicado de Downloads (`Ctrl+J`)
- Painel deslizante com barra de progresso em tempo real, metadados e integração direta com o Windows Explorer.

---

### ⌨️ Tabela de Atalhos de Teclado

| Atalho | Ação |
| --- | --- |
| `Ctrl + T` | Nova aba |
| `Ctrl + Shift + N` | Nova guia anônima (sem histórico) |
| `Ctrl + W` | Fechar aba atual |
| `Ctrl + Shift + T` | Reabrir última aba fechada |
| `Ctrl + B` | Alternar barra lateral (Modo Compacto) |
| `Ctrl + Shift + U` | Abrir tradutor nativo de página |
| `Ctrl + K` / `Ctrl + P` | Paleta de comandos (Quick Launcher) |
| `Ctrl + \` / `Ctrl + Shift + S` | Alternar tela dividida (Split View) |
| `Ctrl + Shift + G` | Espiar URL ativa (Glance) |
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

Combines spatial ergonomics with glassmorphic elegance over a serene palette in Pastel Sage Green tones (`#7da27e`).

---

### 🏛️ System Architecture

```
                  ┌──────────────────────────────────────────────┐
                  │                 moss Chrome                  │
                  │       (TypeScript + HTML5 + CSS Tokens)      │
                  │  Vertical Sidebar · Workspaces · Omnibar     │
                  │  Tab Folders · Boosts · Zapper · Media Widget│
                  │  Translator · Private Tabs · Window Dragging │
                  └──────────────────────┬───────────────────────┘
                                         │
                                Tauri 2 IPC Bridge
                                         │
                  ┌──────────────────────▼───────────────────────┐
                  │              Tauri Core (Rust)               │
                  │   Child Webviews · Viewports · Media State   │
                  │   Ad-Block Engine · Native Permissions · OS  │
                  │   Window Drag Service · Webview Translation  │
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
| **Shell & Chrome UI** | `main.ts`, `dom.ts`, `icons.ts`, `tokens.css` | TypeScript, CSS3 | Glassmorphic layout, 56px compact dock, window dragging, and lifecycle. |
| **Tabs & Folders** | `tabs.ts`, `folders.ts`, `split-view.ts` | TypeScript, DOM API | Tab lifecycle, folder grouping, and memory hibernation. |
| **Private Browsing** | `tabs.ts`, `main.ts`, `icons.ts` | TypeScript, DOM API | Private tabs with zero history recording and slate styling. |
| **Native Translator** | `translate-popover.ts`, `src-tauri/src/lib.rs` | TypeScript, Rust IPC | Translation popover and `translate_tab` command with script injection. |
| **YouTube Ad Shield** | `privacy-shield.ts`, `src-tauri/src/lib.rs` | Rust, Injected CSS | Visual suppression via `#__moss_yt_ad_style__`, 16x speed, and auto-skip. |
| **Spaces & Routing** | `workspaces.ts`, `space-routing.ts`, `toast.ts` | TypeScript | Domain-to-workspace routing and context isolation. |
| **Page Customization** | `boosts.ts`, `boosts-popover.ts`, `glance.ts` | TypeScript, CSS | Element Zapper, Smart Dark Mode, custom CSS, and Glance modal. |
| **Media Controller** | `media.ts`, `media-widget.ts` | TypeScript, MediaSession API | Global audio tracking, sidebar player, and tab mute controls. |
| **Security & System** | `privacy-shield.ts`, `permissions.ts`, `downloads.ts` | TypeScript | Native ad-blocking, permission rules, and file downloads. |
| **Onboarding** | `welcome-wizard.ts`, `settings.ts` | TypeScript | Guided setup wizard and persistent configuration storage. |
| **Native Installer** | `src-tauri/installer/*`, `tauri.conf.json` | NSIS, Python, BMP | 1-click custom installer with moss dark theme and 24-bit bitmaps. |
| **Backend Core** | `src-tauri/src/lib.rs` | Rust, Tauri 2, Tokio | Native child webview control, async runtime, and HWND handling. |

---

### ⚙️ Technical Specifications

#### 1. Native Webview Isolation
- The application separates the browser chrome from web content execution.
- Remote tabs run inside isolated child webviews (`tab-<id>`) with zero IPC capabilities.
- The chrome webview executes with restricted Tauri privileges on an isolated origin.

#### 2. Native Window Dragging
- The main layout defines drag handles using the `data-tauri-drag-region` attribute.
- The runtime provides programmatic drag support via `startDragging()` with `core:window:allow-start-dragging` permission.

#### 3. Integrated YouTube Ad Suppression
- The child webview engine intercepts tracking calls and ad requests before page rendering.
- A dedicated stylesheet in `#__moss_yt_ad_style__` applies `display: none !important` to video ad slots, banners, and overlays.
- A background observer detects video ads, accelerates playback rate to 16x, mutes sound, and invokes skip button triggers.

#### 4. Private Browsing Protection
- Private tabs operate with the `isPrivate: true` flag.
- The browser bypasses visit recording in local storage and memory stacks.
- Visual badge indicators alert the user about active private sessions.

#### 5. Native Web Translation
- The `translate_tab` Tauri command injects translation scripts directly into the active child webview.
- Users choose target languages or restore original text through the Omnibar translate popover (`Ctrl+Shift+U`).

#### 6. Tab Hibernation & Memory Optimization
- When memory optimization activates, the background native webview unloads completely.
- The operating system destroys the native HWND handle.
- Tab metadata, scroll coordinates, and title remain stored in memory.
- When the user selects a sleeping tab, the system recreates the webview and restores page state.

#### 7. Design Token Hierarchy and Pastel Sage Green Theme
- Design tokens consolidate in `tokens.css` as the canonical source of truth.
- The default dark aesthetic features Pastel Sage Green (`#7da27e`) accents.
- Standardized z-index scale:
  - `--z-tooltip`: `600`
  - `--z-toast`: `700`
  - `--z-command-palette`: `800`
  - `--z-wizard`: `900`
  - `--z-glass-overlay`: `1000`

---

### ✨ Features

#### 🪟 Native Window Dragging
- Users drag the application window directly from the top sidebar and floating bar handles.
- Uses `data-tauri-drag-region` with automated fallbacks to `startDragging()`.

#### 🛡️ Integrated YouTube Ad Suppression
- Suppresses YouTube video ads, promo banners, and masthead banners.
- Speeds up ad playback to 16x, mutes the video, and triggers instant auto-skip.

#### 🗄️ Vertical Sidebar & Compact Mode (`Ctrl+B`)
- Vertical sidebar (260px) with native window controls and pinned tabs grid.
- Compact mode collapses the sidebar to a 56px icon dock with 40x40px tab buttons and contained indicators.
- Floating top bar automatically appears during compact navigation.

#### 🕵️ Private Browsing Tabs (`Ctrl+Shift+N`)
- Shortcut `Ctrl+Shift+N` creates history-free private tabs.
- The browser records no history and no session state.
- Styled with dark slate containers and privacy shield badges.

#### 🌐 Native Page Translator (`Ctrl+Shift+U`)
- Built-in `translate_tab` command translates foreign web pages without third-party extensions.
- Includes source/target language options and one-click restoration.

#### 🎨 Refined Pastel Sage Green Theme (#7da27e)
- Balanced green palette delivers high contrast and visual calm in dark environments.
- Corrects header download button icon geometry to 16x16px.

#### 📦 Custom 1-Click NSIS Installer
- Standalone installer featuring moss dark branding (#0F1411 base and #7da27e highlights).
- Includes uncompressed 24-bit bitmaps and an offline preview file (`public/installer-preview.html`).

#### 🧭 Workspaces & Domain Space Routing
- Isolated workspaces accessible via `Ctrl+Alt+1..9`.
- Space Routing intercepts navigation and assigns domains to workspaces automatically.
- Supports automatic migration or user confirmation prompts with toast notifications.

#### 📁 Tab Folders & Hibernation
- Hierarchical tab grouping with custom colors and collapsible folder headers.
- Drag-and-drop tab reordering.
- Background tab hibernation unloads native webviews to save memory.
- Hibernated tabs show a moon icon indicator.

#### ⚡ Page Boosts & Element Zapper (`Ctrl+Shift+Z`)
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

#### 🎉 Welcome Setup Wizard
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
| `Ctrl + Shift + N` | New private tab (no history) |
| `Ctrl + W` | Close active tab |
| `Ctrl + Shift + T` | Reopen closed tab |
| `Ctrl + B` | Toggle sidebar (Compact mode) |
| `Ctrl + Shift + U` | Open native page translator |
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
