# AGENTS.md — Moss Browser

Moss é um browser minimalista e dark-first construído com Tauri 2.x (Rust + TypeScript). A spec técnica de referência é a nota `moss-spec` no canvas do Maestri.

## Time

| Agente | Papel | Responsabilidades |
|---|---|---|
| **Arquiteto** | Arquiteto / coordenação | Define fases e escopo, quebra tarefas, decide arquitetura, aprova merges. |
| **Coder** | Implementador principal | Implementa features completas: backend Rust (`src-tauri/`) e frontend TS/HTML/CSS (`src/`). |
| **CODE REV** | Code reviewer | Revisa qualidade, segurança e regressões antes de qualquer merge. |
| **DESIGN** | UI designer | Define e evolui o design system (paleta, tipografia, componentes). |

## Workflow

1. **Arquiteto** define a tarefa e o escopo (fase, critérios de aceite).
2. **Coder** implementa em uma branch `feat/*` ou `fix/*` a partir de `develop`.
3. Ao terminar, o Coder pede review: `maestri ask "CODE REV" "<o que revisar>"`.
4. **CODE REV** aponta problemas; o Coder corrige até aprovação.
5. O Coder reporta ao Arquiteto: `maestri ask "Arquiteto" "<resumo>"`.
6. Merge em `develop` só depois do review aprovado; `develop` → `main` em releases.

Mudanças de UI devem seguir o design system abaixo; dúvidas visuais vão para o **DESIGN**.

## Convenções

- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`).
- **Branches:** `main`, `develop`, `feat/*`, `fix/*`.
- **Code review obrigatório** antes de qualquer merge.

## Stack e estrutura

- `src/` — frontend (Vite + TypeScript vanilla). `main.ts` monta o chrome do browser (toolbar, omnibar, área do webview); `omnibar.ts` resolve o texto digitado em URL ou busca.
- `src-tauri/` — backend Rust. `src/lib.rs` contém o builder do Tauri; `tauri.conf.json` define janela, identifier (`dev.moss.browser`) e build.
- Gerenciador de pacotes: **pnpm**. Rendering: WebView2 (Windows), WebKit (macOS/Linux).

## Comandos

```sh
pnpm install          # dependências do frontend
pnpm dev              # só o frontend (Vite, porta 1420)
pnpm build            # type-check (tsc) + build do frontend
pnpm tauri dev        # app desktop em modo dev
pnpm tauri build      # build de release
```

Pré-requisitos: Node, pnpm, toolchain Rust (rustup, MSVC no Windows) e WebView2.

## Design system

- Verde musgo escuro `#2d4a3e` (toolbar), secundárias `#4a7c59` (acento) e `#1a2e25` (fundo).
- Neutras `#f0f4f0` (texto) e `#8fa89a` (texto secundário).
- Tipografia: Inter (UI) e JetBrains Mono (código).
- Fonte única dos tokens: `src/styles/tokens.css` (dono: DESIGN). `src/styles/reset.css` é o reset base. `src/styles.css` contém só estilos de componente e usa os tokens semânticos (`--color-bg-*`, `--color-fg-*`, `--space-*`, ...). Não redefina tokens nem use hex soltos.
