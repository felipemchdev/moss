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

Inspired by **Zen Browser** and **Arc**, featuring vertical tabs, workspaces with automatic domain routing, collapsible tab folders with memory hibernation, non-destructive link glancing, DOM element zapping, and background media controls.

### License
MIT License. Created with passion for a calmer web.
