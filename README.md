# Moss

[![CI](https://github.com/felipemchdev/moss/actions/workflows/ci.yml/badge.svg)](https://github.com/felipemchdev/moss/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[Português](#pt-br) · [English](#en)

---

## PT-BR

Navegador minimalista, moderno e dark-first construído com **Tauri 2.x**, **Rust** e **TypeScript**.

### Arquitetura

```
                  ┌──────────────────────────────────────────┐
                  │          Moss Browser Chrome             │
                  │   (TypeScript + HTML + CSS / SCSS)       │
                  │  Toolbar · Omnibar · Tabs · Settings     │
                  └────────────────────┬─────────────────────┘
                                       │
                              Tauri IPC Bridge
                                       │
                  ┌────────────────────▼─────────────────────┐
                  │           Tauri Core (Rust)              │
                  │   Process Manager · State · Security     │
                  └────────────────────┬─────────────────────┘
                                       │
                             Native System Engine
                                       │
                  ┌────────────────────▼─────────────────────┐
                  │              WebView2                    │
                  │      (Windows Native Web Engine)         │
                  └──────────────────────────────────────────┘
```

### Componentes

| Componente | Camada | Função |
| --- | --- | --- |
| `src-tauri` | Rust Backend | Gerencia ciclo de vida da janela, IPC e segurança da aplicação desktop. |
| `src/omnibar.ts` | Frontend Logic | Normalização e resolução de URLs, validação e fallback de motor de busca. |
| `src/styles/` | Design Tokens | Tokens semânticos, paleta verde musgo, tema dark-first e regras de layout. |
| `src/main.ts` | App Lifecycle | Ponto de entrada do frontend, orquestração de eventos de navegação e UI. |

### Fluxo de Navegação

1. O usuário digita um termo ou endereço na **Omnibar**.
2. A rotina `resolveOmnibarInput` valida e normaliza o texto:
   - URLs completas com protocolo são preservadas.
   - Domínios válidos são direcionados via HTTPS.
   - Endereços locais (`localhost`, IPs privados) utilizam HTTP.
   - Qualquer outro texto é convertido em consulta direta ao motor de busca.
3. O comando de navegação é enviado ao motor de visualização para renderização isolada.

### Quick Start

```sh
# Instalação das dependências do frontend
pnpm install

# Executar em modo desenvolvimento
pnpm tauri dev

# Gerar build de produção
pnpm tauri build
```

### Estrutura do Projeto

```
moss/
├── .github/workflows/ci.yml   # Pipeline de integração contínua
├── src/                       # Frontend (TypeScript, CSS, UI)
│   ├── styles/                # Tokens, reset e estilos do chrome
│   ├── omnibar.ts             # Parser e resolvedor da barra de navegação
│   └── main.ts                # Inicialização da interface
├── src-tauri/                 # Backend nativo (Rust / Tauri 2)
│   ├── src/lib.rs             # Configuração e plugins Tauri
│   └── tauri.conf.json        # Configuração da aplicação desktop
└── package.json
```

---

## EN

Minimalist, dark-first modern web browser built with **Tauri 2.x**, **Rust**, and **TypeScript**.

### Architecture

```
                  ┌──────────────────────────────────────────┐
                  │          Moss Browser Chrome             │
                  │   (TypeScript + HTML + CSS / SCSS)       │
                  │  Toolbar · Omnibar · Tabs · Settings     │
                  └────────────────────┬─────────────────────┘
                                       │
                              Tauri IPC Bridge
                                       │
                  ┌────────────────────▼─────────────────────┐
                  │           Tauri Core (Rust)              │
                  │   Process Manager · State · Security     │
                  └────────────────────┬─────────────────────┘
                                       │
                             Native System Engine
                                       │
                  ┌────────────────────▼─────────────────────┐
                  │              WebView2                    │
                  │      (Windows Native Web Engine)         │
                  └──────────────────────────────────────────┘
```

### Components

| Component | Layer | Purpose |
| --- | --- | --- |
| `src-tauri` | Rust Backend | Manages window lifecycle, IPC bridge, and desktop security. |
| `src/omnibar.ts` | Frontend Logic | URL normalization, validation, and search query resolution. |
| `src/styles/` | Design Tokens | Semantic tokens, moss-green dark-first palette, and chrome layout. |
| `src/main.ts` | App Lifecycle | Frontend entry point, user interaction and navigation event bus. |

### Getting Started

```sh
# Install frontend dependencies
pnpm install

# Run in development mode
pnpm tauri dev

# Build production bundle
pnpm tauri build
```
