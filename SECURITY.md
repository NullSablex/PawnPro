# Política de Segurança — PawnPro

## Reportar uma vulnerabilidade

Encontrou uma vulnerabilidade de segurança? Não abra uma issue pública.

**Contato:** abra um [Security Advisory](https://github.com/NullSablex/PawnPro/security/advisories/new) privado no GitHub ou envie um e-mail diretamente ao mantenedor.

Resposta esperada em até **7 dias úteis**.

---

## Escopo

Esta política cobre o código-fonte da extensão PawnPro (repositório `NullSablex/PawnPro`) e o motor LSP ([`NullSablex/PawnPro-Engine`](https://github.com/NullSablex/PawnPro-Engine)).

Vulnerabilidades em dependências de terceiros devem ser reportadas aos respectivos mantenedores. Dependências de desenvolvimento (`devDependencies`) **não são empacotadas** no `.vsix` e não afetam os usuários finais.

---

## Dependências empacotadas no `.vsix`

Apenas três pacotes são embutidos no bundle da extensão:

| Pacote | Finalidade |
|--------|-----------|
| `iconv-lite` | Decodificação do log do servidor (windows-1252, latin-1) |
| `safer-buffer` | Dependência de `iconv-lite` |
| `vscode-nls` | Internacionalização das mensagens |

Todas as demais dependências (incluindo `@vscode/vsce`, `typescript`, `esbuild`, etc.) são `devDependencies` e **não estão presentes** no pacote distribuído.

---

## Versões suportadas

Somente a versão mais recente recebe correções de segurança. A extensão é distribuída via [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=NullSablex.pawnpro), [Open VSX](https://open-vsx.org/extension/NullSablex/pawnpro) e como artefato `.vsix` nas [Releases do GitHub](https://github.com/NullSablex/PawnPro/releases).
