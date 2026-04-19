# Contribuindo com o PawnPro

Obrigado pelo interesse em contribuir! Leia este guia antes de abrir uma issue ou pull request.

## Antes de começar

- Verifique se já existe uma [issue](https://github.com/NullSablex/PawnPro/issues) aberta para o problema ou feature.
- Para mudanças significativas, abra uma issue primeiro para discutir a abordagem antes de implementar.
- Ao contribuir, você concorda que seu código será licenciado sob os mesmos termos da [licença do projeto](LICENSE.md).

## Configurando o ambiente

**Pré-requisitos:**
- Node.js 18+
- npm
- VS Code (para testar a extensão)

```bash
git clone https://github.com/NullSablex/PawnPro
cd pawnpro
npm install
```

**Compilar:**
```bash
bash scripts/build.sh
```

**Compilar só TypeScript (verificação de tipos):**
```bash
npx tsc --noEmit -p .
```

**Instalar localmente para teste:**

Pressione `F5` no VS Code com o repositório aberto para abrir uma janela de extensão de desenvolvimento.

## Estrutura do projeto

```
src/core/      ← lógica pura (zero imports de vscode)
src/vscode/    ← adaptação para APIs do VS Code
snippets/      ← snippets Pawn
syntaxes/      ← gramática TextMate e temas de sintaxe
templates/     ← templates de scripts (gamemode, filterscript, include)
scripts/       ← build, bundle, repack
docs/          ← documentação detalhada (não incluída no .vsix)
```

## Regras de código

- **Nunca importar `vscode` em `src/core/`** — essa camada deve permanecer pura e testável fora do VS Code.
- **Mensagens ao usuário sempre via `src/vscode/nls.ts`** — sem strings hardcoded em outros arquivos.
- **Sem `any`** — usar tipos precisos ou `unknown` com narrowing.
- **Sem comentários óbvios** — apenas comentários que explicam *por quê*, não *o quê*.
- **Configuração sempre via `PawnProConfigManager`** — nunca ler `vscode.workspace.getConfiguration` fora de `configBridge.ts`.

## Abrindo uma Pull Request

1. Crie um branch a partir de `master`: `git checkout -b feat/minha-feature`
2. Faça as alterações seguindo as regras acima.
3. Certifique-se que `npx tsc --noEmit -p .` passa sem erros.
4. Teste manualmente com `F5` no VS Code.
5. Abra a PR com uma descrição clara do que foi alterado e por quê.

## Reportando bugs

Inclua na issue:
- Versão da extensão (`PawnPro x.x.x` na status bar)
- Sistema operacional e versão do VS Code
- Passos para reproduzir
- Comportamento esperado vs. comportamento observado
- Logs relevantes (Output → PawnPro Engine)

## Sugestões de features

Abra uma issue com o label `enhancement` descrevendo:
- O problema que a feature resolveria
- Como você imagina que funcionaria
- Alternativas que você considerou
