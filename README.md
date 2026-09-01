<div align="center">
  <img src="images/logo.png" alt="PawnPro" />

  [![VS Marketplace](https://vsmarketplacebadges.dev/version-short/NullSablex.pawnpro.png?style=flat-square&logo=visual-studio-code&label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=NullSablex.pawnpro)
  [![Installs](https://vsmarketplacebadges.dev/installs-short/NullSablex.pawnpro.png?style=flat-square&label=Marketplace%20Installs)](https://marketplace.visualstudio.com/items?itemName=NullSablex.pawnpro)
  [![Rating](https://vsmarketplacebadges.dev/rating-short/NullSablex.pawnpro.png?style=flat-square&label=Marketplace%20Rating)](https://marketplace.visualstudio.com/items?itemName=NullSablex.pawnpro)
  [![Open VSX](https://img.shields.io/open-vsx/v/NullSablex/pawnpro?style=flat-square&label=Open%20VSX)](https://open-vsx.org/extension/NullSablex/pawnpro)
  [![Open VSX Rating](https://img.shields.io/open-vsx/rating/NullSablex/pawnpro?style=flat-square&label=Open%20VSX%20Rating)](https://open-vsx.org/extension/NullSablex/pawnpro)
  [![CI](https://img.shields.io/github/actions/workflow/status/NullSablex/PawnPro/publish.yml?style=flat-square&label=CI)](https://github.com/NullSablex/PawnPro/actions)
  [![CodeQL](https://img.shields.io/github/actions/workflow/status/NullSablex/PawnPro/codeql.yml?style=flat-square&logo=github&label=CodeQL)](https://github.com/NullSablex/PawnPro/actions/workflows/codeql.yml)
  [![Security](https://img.shields.io/github/actions/workflow/status/NullSablex/PawnPro/security.yml?style=flat-square&logo=github&label=Security)](https://github.com/NullSablex/PawnPro/actions/workflows/security.yml)
  [![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/NullSablex/PawnPro/badge?style=flat-square)](https://scorecard.dev/viewer/?uri=github.com/NullSablex/PawnPro)
  [![Downloads](https://img.shields.io/github/downloads/NullSablex/PawnPro/total?style=flat-square&logo=github&label=downloads)](https://github.com/NullSablex/PawnPro/releases)
  [![Stars](https://img.shields.io/github/stars/NullSablex/PawnPro?style=flat-square&logo=github&label=stars)](https://github.com/NullSablex/PawnPro/stargazers)
  [![License](https://img.shields.io/badge/licença-Source--Available-blue?style=flat-square)](LICENSE.md)

  ![Windows x64](https://img.shields.io/badge/Windows-x64-0078D4?style=flat-square&logo=windows11&logoColor=white)
  ![Linux x64](https://img.shields.io/badge/Linux-x64%20·%20arm64-FCC624?style=flat-square&logo=linux&logoColor=black)
  ![macOS x64](https://img.shields.io/badge/macOS-x64%20·%20arm64-000000?style=flat-square&logo=apple&logoColor=white)
</div>

**Uma IDE completa para Pawn dentro do seu editor.** O PawnPro é uma extensão para
VS Code e VSCodium que traz para o desenvolvimento SA-MP / open.mp o que outras
linguagens têm há anos: um motor de análise que entende o seu código de verdade,
compilação e depuração com um atalho, e o servidor sob controle sem sair do editor.

> Escrever gamemode não precisa ser editor de texto, terminal e ALT+TAB.

## Por que existe

Quem desenvolve em Pawn conhece o ciclo: salvar, trocar de janela, compilar,
ler um erro sem contexto, voltar, procurar a linha. Erro de digitação num nome de
função? Só se descobre no compilador. Quer saber o que aquele native faz? Abre o
`.inc` e lê o código.

O PawnPro corta esse ciclo. O código é analisado enquanto você escreve — por um
**motor próprio escrito em Rust**, não por expressões regulares — então o erro
aparece na linha onde está, o autocomplete conhece os seus includes, e a
documentação da função aparece ao passar o mouse.

## O que você ganha

### Enquanto escreve

- **Autocomplete que conhece o seu projeto** — funções, natives, constantes e
  macros de todos os `.inc` que você inclui, transitivamente. Ordenado por
  proximidade: o que está perto do cursor vem primeiro.
- **Documentação no hover e no signature help** — o comentário acima da função
  vira texto formatado, nos formatos **Javadoc** (`@param`) e **XMLdoc**
  (`<summary>`, o que o `omp-stdlib` do open.mp usa). Ao digitar a chamada, a
  descrição do parâmetro em que você está aparece sozinha.
- **19 diagnósticos** com código próprio (`PP####`) — include que não existe,
  chave sem fechar, código inalcançável, função depreciada, variável não usada.
  **13 deles têm correção automática** (`Ctrl+.`).
- **Ir para a definição, referências e renomear** em todo o projeto.
- **Prévia de cor** nos literais `0xRRGGBBAA` e `{RRGGBB}`, com seletor de cores.

### Na hora de compilar e testar

- **`Ctrl+Alt+B` compila** — o `pawncc` é encontrado sozinho (via `$PAWNCC`,
  `PATH` ou dentro do projeto). Os erros voltam clicáveis no painel de problemas.
- **`F5` depura de verdade** — breakpoints (simples, condicionais, por contagem e
  logpoints), passo a passo, inspeção de variáveis, watch, call stack e
  data breakpoints. Depuração real de gamemode, não `print()` espalhado.
- **Servidor no painel lateral** — iniciar, parar, reiniciar e enviar comandos
  RCON sem abrir terminal. Histórico e favoritos com busca, e o log acompanhado
  em tempo real.

### Para o projeto não virar bagunça

- **Formatação** com estilos configuráveis (Allman, K&R, compacto ou seu próprio).
- **Assistente de nomenclatura** — convenções de caixa por categoria de
  identificador, e um **padrão próprio por expressão regular** quando os estilos
  prontos não descrevem a convenção da casa (`g_` nas globais, por exemplo).
- **Templates** de gamemode, filterscript e include, já no formato certo da
  plataforma que você usa.

### E porque ninguém programa igual

- **Cinco idiomas** — português, inglês, espanhol, romeno e russo. A interface e
  os diagnósticos são configuráveis **de forma independente**: dá para ter o
  editor em português e os erros em inglês.
- **Painel de configurações visual** — todas as opções sem tocar em JSON.
- **Temas de sintaxe** claro e escuro, que acompanham o tema do editor.
- **Cor de destaque** — seis cores para a interface da extensão, ou o padrão que
  herda do seu tema.

## Instalação

Procure por **PawnPro** no marketplace do seu editor, ou:

```
ext install NullSablex.pawnpro
```

Também disponível no [Open VSX](https://open-vsx.org/extension/NullSablex/pawnpro)
para VSCodium e editores derivados.

**Funciona em Windows, Linux e macOS** (x64 e arm64). O motor de análise é um
binário nativo que acompanha a extensão — não precisa instalar Rust, Node nem
nada além do editor.

## Primeiros passos

1. Abra a **pasta** do seu gamemode (não o arquivo solto — a extensão precisa da
   pasta para achar os includes).
2. Abra um `.pwn`. O motor inicia sozinho e começa a analisar.
3. `Ctrl+Alt+B` para compilar, `F5` para depurar.

Se os includes não forem encontrados, abra **PawnPro: Configurações** pela barra
de status e aponte o caminho do `pawno/include` — ou deixe a detecção automática
procurar nos lugares usuais.

## Configuração

Independente do editor, em JSON simples:

| Arquivo | Escopo |
|---------|--------|
| `~/.pawnpro/config.json` | Global (todos os projetos) |
| `.pawnpro/config.json` | Projeto (sobrescreve o global) |
| `.pawnpro/state.json` | Estado local (favoritos e histórico do servidor) |

Nada disso precisa ser editado à mão: o painel de configurações cobre todas as
chaves. A referência completa está em
[docs/configuration.md](docs/configuration.md), e os comandos em
[docs/commands.md](docs/commands.md).

## Documentação

| | |
|---|---|
| [Recursos](docs/features.md) | O que a extensão faz, em detalhe |
| [Configuração](docs/configuration.md) | Todas as chaves |
| [Comandos](docs/commands.md) | Paleta e atalhos |
| [Servidor](docs/server.md) | Iniciar, RCON, favoritos e log |
| [Depuração](docs/debugging.md) | Como configurar o depurador |
| [Assistente de nomes](docs/naming-assistant.md) | Convenções e padrões próprios |

Site completo: **[pawnpro.nullsablex.com](https://pawnpro.nullsablex.com)**

## Como funciona por dentro

A análise não roda em JavaScript. É um processo separado —
[**pawnpro-engine**](https://github.com/NullSablex/PawnPro-Engine), escrito em
**Rust** — que conversa com o editor pelo protocolo LSP. Isso é o que permite
analisar um gamemode grande com todos os seus includes sem travar a digitação.

A depuração segue o mesmo princípio: um adaptador DAP na extensão e um plugin
dentro do servidor.

## Bom saber

- O acompanhamento de log do servidor funciona em **Linux e macOS**.
- O RCON do SA-MP é um protocolo antigo, que trafega a senha em texto claro. Por
  isso o envio direto vale só para servidor **local**; para um remoto, a extensão
  usa o terminal. Firewalls podem bloquear a porta UDP local.
- Comandos que pareçam carregar senha nunca são guardados no histórico.

## Contribuindo

Contribuições são bem-vindas — veja o [guia de contribuição](CONTRIBUTING.md).

O uso de **IA** é permitido: quem contribui é responsável pelo que envia, sem
co-autoria de IA, e sem preconceito quanto ao seu uso. Detalhes na
[política de IA](AI-POLICY.md).

## Licença

PawnPro License v1.0 — Source-Available (não Open Source).  
Uso pessoal e comercial permitido ✅ · Redistribuição e venda proibidas ❌ · Detalhes: [LICENSE.md](LICENSE.md)

---
