# SPEC - DESIGN: modern 1-click installer UI for moss

Repo: C:\Users\felip\OneDrive\Documentos\CodingThings\moss
Branch: develop

## Objetivo

Desenhar a UI de um instalador moderno, splash, frameless e 1-click para o moss.
Substituir o wizard MUI2 atual, que mostra Welcome, Reinstall, InstFiles e Finish com sidebar e header bitmaps.

## Entrega

- `installer/ui/index.html`: mock estatico com todos os estados.
- `installer/ui/styles.css`: tokens, layout e estados.
- `installer/ui/SPEC.md`: especificacao de layout, estados, copy e medidas.
- Nao alterar a UI do app.

## Formato

- Janela do bootstrapper: 480x300 px.
- Frameless, sem barra de titulo do Windows, sem passos de wizard.
- Fundo #0F1411, cartao com raio de 12 px.
- Borda de 1 px em rgba(125, 162, 126, 0.24).
- Sombra suave apenas se a janela for transparente.
- Barra superior de 40 px com regiao de arraste (data-tauri-drag-region), logo 20 px (moss mark: leaf icon), "moss" em minusculo, versao 1.0.0 a direita, seletor de idioma [PT | EN] e botao de fechar.
- Centro: logo 64 px (moss mark), titulo, subtitulo, botao primario.
- Rodape: area de progresso ou mensagem de status.

## Tokens

- Fundo: #0F1411
- Superficie: #141A16
- Accent: #7DA27E
- Texto: #DCE2DE
- Texto secundario: #8A938C
- Erro: #C97B7B
- Sucesso: #7DA27E
- Raio: 12 px
- Fonte: Inter ou system-ui
- Titulo: 20/28, peso 600
- Corpo: 13/18, peso 400
- Label: 11/14, peso 600, uppercase, tracking 0.08em
- Botao: 13/16, peso 600, altura 36 px, raio 8 px

## Idiomas

- Deteccao automatica via navigator.language: se comeca com "pt" usa PT-BR, caso contrario EN-US.
- Seletor na barra superior: dois botoes "PT" e "EN", 24x28 px, raio 4 px.
- Estado ativo: fundo accent #7DA27E, texto fundo #0F1411.
- Estado inativo: fundo transparente, texto muted #8A938C.
- Troca instantanea de todo copy ao clicar, sem recarregar.

## Estados

1. Ready
   - Logo (moss mark), "Instalar moss" / "Install moss", "Versão 1.0.0" / "Version 1.0.0", botao "Instalar" / "Install".
   - Se ja existir instalacao: "Atualizar moss" / "Update moss" e botao "Atualizar" / "Update".
2. Installing
   - Barra de progresso por etapas.
   - Etapas PT: Preparando, Instalando, Criando atalhos, Concluindo.
   - Etapas EN: Preparing, Installing, Creating shortcuts, Finishing.
   - Texto de status curto.
   - Botao de fechar desabilitado.
3. Success
   - Check em #7DA27E, "moss instalado" / "moss installed", botao primario "Abrir moss" / "Open moss", secundario "Fechar" / "Close".
4. Error
   - Mensagem curta, botao "Tentar novamente" / "Try again", link "Detalhes" / "Details".
   - Detalhes mostram o caminho do log.

## Copy

- PT-BR como padrao para sistemas pt, EN-US como fallback.
- Frases curtas, sem travessao, sem texto generico de IA.
- Exemplos PT: "Instalar moss", "Preparando", "Instalando", "Criando atalhos", "Concluindo", "moss instalado", "Abrir moss", "Tentar novamente", "Versão".
- Exemplos EN: "Install moss", "Preparing", "Installing", "Creating shortcuts", "Finishing", "moss installed", "Open moss", "Try again", "Version".
- Nao usar "Bem-vindo ao assistente" nem "Welcome to the wizard".

## Movimento e acessibilidade

- Transicao de estado de 150 a 200 ms, fade e slide curto.
- Progresso com transicao de 200 ms.
- Respeitar `prefers-reduced-motion`.
- Foco visivel em #7DA27E, navegacao por Tab, Enter e Esc.
- ARIA labels no botao de fechar, progresso, status e seletor de idioma.
- Contraste minimo 4.5:1 para texto.

## Arrastar janela (Tauri)

- Mock usa `data-tauri-drag-region` no elemento `.header-drag`.
- Implementacao: `element.addEventListener('mousedown', () => window.startDragging())` no handler Tauri.
- Nao usar `-webkit-app-region: drag` (Electron legacy).

## Restricoes

- Sem sidebar bitmap, sem header bitmap, sem botoes Next e Back, sem pagina de licenca ou diretorio.
- Sem travessao.
- Sem comentarios decorativos no CSS.
- Sem frameworks JS. Mock estatico, com estados alternados por classe CSS ou data attribute.
- Logo usa moss mark (leaf icon) - paths SVG inline.
- Simulacao de instalacao removida do HTML de producao. Apenas troca de estado via `data-state` ou classe CSS.

## Aceite

- Mock mostra os 4 estados.
- Layout cabe em 480x300 sem scroll.
- Todos os textos em PT-BR e EN.
- Troca de idioma funciona instantaneamente em todos os estados.
- moss mark usado no header e no centro.
- Rodape com ano 2026.
- DESIGN REV aprova ergonomia, contraste e consistencia com o app.