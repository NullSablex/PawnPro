# Contribuindo com o PawnPro

Obrigado pelo interesse em contribuir! Leia este guia antes de abrir uma issue ou pull request.

## Antes de começar

- Verifique se já existe uma [issue](https://github.com/NullSablex/PawnPro/issues) aberta para o problema ou feature.
- Para mudanças significativas, abra uma issue primeiro para discutir a abordagem antes de implementar.
- Ao contribuir, você concorda que seu código será licenciado sob os mesmos termos da [licença do projeto](LICENSE.md).

## Configurando o ambiente

**Pré-requisitos:**
- Node.js 20+
- npm
- VS Code (para testar a extensão)
- Para mexer no núcleo nativo: Rust e o repositório
  [PawnPro-Core](https://github.com/NullSablex/PawnPro-Core)

```bash
git clone https://github.com/NullSablex/PawnPro
cd PawnPro
npm install
```

**Compilar e empacotar** (baixa o binário do núcleo da release indicada em
`coreVersion` no `package.json`):
```bash
bash scripts/build.sh
```

**Compilar só TypeScript (verificação de tipos):**
```bash
npm run compile
```

**Testes:**
```bash
npm test
```

**Instalar localmente para teste:**

Pressione `F5` no VS Code com o repositório aberto para abrir uma janela de extensão de desenvolvimento. O IntelliSense, a compilação e o servidor precisam do binário do núcleo em `bin/` — o `build.sh` o baixa.

## Estrutura do projeto

```
src/core/      ← cliente do núcleo e lógica pura (zero imports de vscode)
src/editor/    ← adaptação para as APIs do editor
snippets/      ← snippets Pawn
syntaxes/      ← gramática TextMate e temas de sintaxe
templates/     ← templates de scripts (gamemode, filterscript, include)
l10n/          ← bundles de tradução (vscode.l10n)
scripts/       ← build, bundle, repack
docs/          ← documentação detalhada (não incluída no .vsix)
```

## Regras de código

- **Identificadores em inglês, comentários em português** — funções, variáveis, constantes e tipos em inglês (`resolveServerConfig`, `pingServer`); comentários e documentação em português. Strings visíveis ao usuário são outra coisa: ficam em português no `nls.ts`, com as traduções em `l10n/`.
- **Nunca importar `vscode` em `src/core/`** — essa camada deve permanecer pura e testável fora do VS Code.
- **Mensagens ao usuário sempre via `src/editor/nls.ts`** — sem strings hardcoded em outros arquivos.
- **Sem `any`** — usar tipos precisos ou `unknown` com narrowing.
- **Sem comentários óbvios** — apenas comentários que explicam *por quê*, não *o quê*.
- **Configuração sempre via `PawnProConfigManager`** — as chaves do PawnPro ficam em `.pawnpro/config.json`, nunca nas configurações do editor. `vscode.workspace.getConfiguration` só para ler ou gravar configurações do próprio editor (como as cores de sintaxe).

## Uso de IA

O uso de ferramentas de IA (assistentes de código, LLMs, tradutores) neste
projeto é **permitido e bem-vindo**. Em resumo:

- **Você é o responsável.** Quem abre o PR assume autoria e responsabilidade
  integral pelo que enviou — revise e entenda o código, tenha usado IA ou não.
- **Sem co-autoria de IA.** A autoria é humana; não atribua co-autoria a um
  assistente em commits ou PRs (`Co-Authored-By:` de IA, "gerado por", etc.).
- **Sem preconceito.** Nenhuma contribuição é rejeitada *só por* ter sido feita
  com auxílio de IA — o que vale é o mérito dela.

Detalhes completos em [AI-POLICY.md](AI-POLICY.md).

## Abrindo uma Pull Request

1. Crie um branch a partir de `master`: `git checkout -b feat/minha-feature`
2. Faça as alterações seguindo as regras acima.
3. Certifique-se de que `npm run compile` e `npm test` passam sem erros.
4. Teste manualmente com `F5` no VS Code.
5. Abra a PR com uma descrição clara do que foi alterado e por quê.

## Reportando bugs

Inclua na issue:
- Versão da extensão (`PawnPro x.x.x` na status bar)
- Sistema operacional e versão do VS Code
- Passos para reproduzir
- Comportamento esperado vs. comportamento observado
- Logs relevantes: o painel de saída do PawnPro e, se possível, o `.pawnpro/logs/pawnpro.log` com o diagnóstico ligado (**PawnPro: Nível do diagnóstico**)

## Sugestões de features

Abra uma issue com o label `enhancement` descrevendo:
- O problema que a feature resolveria
- Como você imagina que funcionaria
- Alternativas que você considerou
